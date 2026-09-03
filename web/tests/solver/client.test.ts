import {describe, it, expect, vi} from "vitest";
import {BOOK_URLS, OpeningBooks} from "../../src/solver/books.js";
import {SolverClient, type WorkerEvents, type WorkerLike} from "../../src/solver/client.js";
import type {Envelope, Kind, Payloads, Response, Results, Snapshot} from "../../src/solver/protocol.js";

type Fetch = typeof globalThis.fetch;

/** Stands in for a Worker: records what was posted and lets the test reply whenever it likes. */
class FakeWorker implements WorkerLike {
	readonly posted: Envelope<Kind>[] = [];
	readonly transferred: (readonly Transferable[])[] = [];
	terminated = false;
	private readonly listeners = new Map<keyof WorkerEvents, ((event: never) => void)[]>();

	postMessage(message: Envelope<Kind>, transfer: readonly Transferable[] = []): void {
		this.posted.push(message);
		this.transferred.push(transfer);
	}

	addEventListener<K extends keyof WorkerEvents>(type: K, listener: (event: WorkerEvents[K]) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	terminate(): void {
		this.terminated = true;
	}

	kinds(): Kind[] {
		return this.posted.map((message) => message.kind);
	}

	reply(response: Response): void {
		this.emit("message", new MessageEvent("message", {data: response}));
	}

	/** Answers the most recent post of `kind` with `result`. */
	answer<K extends Kind>(kind: K, result: Results[K]): void {
		const message = this.posted.filter((posted) => posted.kind === kind).at(-1);
		if (message === undefined) {
			throw new Error(`Nothing of kind ${kind} was posted`);
		}
		this.reply({id: message.id, ok: true, result});
	}

	fail(message: string): void {
		this.emit("error", {message} as ErrorEvent);
	}

	private emit<K extends keyof WorkerEvents>(type: K, event: WorkerEvents[K]): void {
		for (const listener of this.listeners.get(type) ?? []) {
			(listener as (event: WorkerEvents[K]) => void)(event);
		}
	}
}

const SNAPSHOT: Snapshot = {
	rules: "squares",
	movesLeft: 16,
	currentPiece: null,
	piecesTaken: 0,
	cellsTaken: 0,
	board: Array.from({length: 16}, () => null),
	isToPlace: false,
	isWon: false,
	isDone: false,
	bookEntries: 40_729,
	bookDepth: 4,
};

const BOOK = new Uint8Array([0x51, 0x42, 0x4b, 0x31, 1, 0, 0, 0, 0, 0]).buffer;

/** A fetch that serves `BOOK` for any URL and records what was asked for. */
function fakeFetch(status = 200): {fetch: Fetch; urls: string[]} {
	const urls: string[] = [];
	const impl: Fetch = async (input) => {
		urls.push(String(input));
		return Promise.resolve(new Response(status === 200 ? BOOK.slice(0) : null, {status}));
	};
	return {fetch: impl, urls};
}

/** Lets every settled promise run its continuations. */
async function settle(): Promise<void> {
	for (let round = 0; round < 10; round++) {
		await Promise.resolve();
	}
}

describe("SolverClient", () => {
	it("posts each request with its own id and payload", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		void client.request("applyPlace", {cell: 3});
		void client.request("evaluate");
		await settle();
		expect(worker.posted).toStrictEqual([
			{id: 1, kind: "applyPlace", payload: {cell: 3}},
			{id: 2, kind: "evaluate", payload: undefined},
		]);
	});

	it("resolves each promise with the result that carries its id, whatever the order", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		const first = client.request("evaluate");
		const second = client.request("setSeed", {seed: 1});
		await settle();
		worker.reply({id: 2, ok: true, result: null});
		worker.reply({id: 1, ok: true, result: {value: 0, nodes: 10, ms: 1}});
		expect(await first).toStrictEqual({value: 0, nodes: 10, ms: 1});
		expect(await second).toBeNull();
	});

	it("rejects with the worker's error text on a failed response", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		const pending = client.request("undo");
		await settle();
		worker.reply({id: 1, ok: false, error: "Nothing to undo"});
		await expect(pending).rejects.toThrow("Nothing to undo");
	});

	it("ignores replies for ids it is not waiting on", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		const pending = client.request("evaluate");
		await settle();
		worker.reply({id: 99, ok: true, result: null});
		worker.reply({id: 1, ok: true, result: {value: 2, nodes: 0, ms: 0}});
		expect(await pending).toStrictEqual({value: 2, nodes: 0, ms: 0});
	});

	it("terminates a failed worker and rejects everything in flight and every request after", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		const pending = client.request("evaluate");
		await settle();
		worker.fail("boom");
		await expect(pending).rejects.toThrow("Solver worker failed: boom");
		await expect(client.request("snapshot")).rejects.toThrow("Solver worker failed: boom");
		expect(worker.posted).toHaveLength(1);
		expect(worker.terminated).toBe(true);
	});

	it("terminates the worker and rejects what was in flight", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker, new OpeningBooks(fakeFetch().fetch));
		const pending = client.request("evaluate");
		client.terminate();
		expect(worker.terminated).toBe(true);
		await expect(pending).rejects.toThrow("Solver worker terminated");
		await expect(client.request("evaluate")).rejects.toThrow("Solver worker terminated");
	});

	describe("opening books", () => {
		it("fetches exactly the chosen rules' book on init, loads it, and holds later requests until it is in", async () => {
			const worker = new FakeWorker();
			const {fetch, urls} = fakeFetch();
			const client = new SolverClient(worker, new OpeningBooks(fetch));
			const init = client.request("init", {rules: "lines"});
			const seeded = client.request("setSeed", {seed: 5});
			const evaluated = client.request("evaluate");
			await settle();
			expect(urls).toStrictEqual([BOOK_URLS.lines]);
			expect(worker.kinds()).toStrictEqual(["init", "loadBook"]);
			const loadBook = worker.posted[1]?.payload as Payloads["loadBook"];
			expect(loadBook).toStrictEqual({rules: "lines", bytes: BOOK});
			expect(worker.transferred[1]).toStrictEqual([loadBook.bytes]);

			worker.answer("init", {version: "1.2.3", snapshot: {...SNAPSHOT, rules: "lines", bookEntries: 0}});
			await settle();
			expect(worker.kinds()).toStrictEqual(["init", "loadBook"]);

			worker.answer("loadBook", {...SNAPSHOT, rules: "lines"});
			expect(await init).toStrictEqual({version: "1.2.3", snapshot: {...SNAPSHOT, rules: "lines"}});
			await settle();
			expect(worker.kinds()).toStrictEqual(["init", "loadBook", "setSeed", "evaluate"]);
			worker.answer("setSeed", null);
			worker.answer("evaluate", {value: 0, nodes: 1, ms: 1});
			expect(await seeded).toBeNull();
			expect(await evaluated).toStrictEqual({value: 0, nodes: 1, ms: 1});
		});

		it("fetches the other book when the rules change, after the first is in", async () => {
			const worker = new FakeWorker();
			const {fetch, urls} = fakeFetch();
			const client = new SolverClient(worker, new OpeningBooks(fetch));
			const init = client.request("init", {rules: "squares"});
			const switched = client.request("setRules", {rules: "lines"});
			await settle();
			expect(urls).toStrictEqual([BOOK_URLS.squares, BOOK_URLS.lines]);
			expect(worker.kinds()).toStrictEqual(["init", "loadBook"]);
			worker.answer("init", {version: "1.2.3", snapshot: SNAPSHOT});
			worker.answer("loadBook", SNAPSHOT);
			await init;
			await settle();
			expect(worker.kinds()).toStrictEqual(["init", "loadBook", "setRules", "loadBook"]);
			expect(worker.posted[3]?.payload).toMatchObject({rules: "lines"});
			worker.answer("setRules", {...SNAPSHOT, rules: "lines", bookEntries: 0});
			worker.answer("loadBook", {...SNAPSHOT, rules: "lines"});
			expect(await switched).toStrictEqual({...SNAPSHOT, rules: "lines"});
		});

		it("rejects init naming the book URL when the fetch fails, and gives up on the worker", async () => {
			const worker = new FakeWorker();
			const client = new SolverClient(worker, new OpeningBooks(fakeFetch(404).fetch));
			const init = client.request("init", {rules: "squares"});
			const seeded = client.request("setSeed", {seed: 5});
			await settle();
			worker.answer("init", {version: "1.2.3", snapshot: {...SNAPSHOT, bookEntries: 0}});
			await expect(init).rejects.toThrow(`Could not fetch the opening book at ${BOOK_URLS.squares}: HTTP 404`);
			await expect(seeded).rejects.toThrow(BOOK_URLS.squares);
			expect(worker.kinds()).toStrictEqual(["init"]);
			expect(worker.terminated).toBe(true);
			await expect(client.request("evaluate")).rejects.toThrow(BOOK_URLS.squares);
		});

		it("rejects a book that arrives after the worker has died instead of leaving init hanging", async () => {
			const worker = new FakeWorker();
			const download: {serve: () => void} = {
				serve: () => {
					throw new Error("the book was never asked for");
				},
			};
			const slowFetch: Fetch = async () =>
				new Promise((resolve) => {
					download.serve = () => {
						resolve(new Response(BOOK.slice(0)));
					};
				});
			const client = new SolverClient(worker, new OpeningBooks(slowFetch));
			const init = client.request("init", {rules: "squares"});
			await settle();
			worker.fail("boom");
			await settle();
			download.serve();
			await expect(init).rejects.toThrow("Solver worker failed: boom");
			expect(worker.kinds()).toStrictEqual(["init"]);
		});

		it("shares one download between solvers, each getting its own buffer to transfer", async () => {
			const {fetch, urls} = fakeFetch();
			const books = new OpeningBooks(fetch);
			const first = new FakeWorker();
			const second = new FakeWorker();
			void new SolverClient(first, books).request("init", {rules: "squares"});
			void new SolverClient(second, books).request("init", {rules: "squares"});
			await settle();
			expect(urls).toStrictEqual([BOOK_URLS.squares]);
			const [a, b] = [first.posted[1]?.payload, second.posted[1]?.payload];
			expect(a).toStrictEqual({rules: "squares", bytes: BOOK});
			expect(b).toStrictEqual({rules: "squares", bytes: BOOK});
			expect(a).not.toBe(b);
		});
	});
});

describe("OpeningBooks", () => {
	it("maps each rules variant to its own hashed asset", () => {
		expect(BOOK_URLS.squares).toMatch(/squares.*\.qbk$/);
		expect(BOOK_URLS.lines).toMatch(/lines.*\.qbk$/);
		expect(BOOK_URLS.squares).not.toBe(BOOK_URLS.lines);
	});

	it("asks the browser cache first, since the URL changes whenever the book does", async () => {
		const fetchImpl = vi.fn<Fetch>(async () => Promise.resolve(new Response(BOOK.slice(0))));
		await new OpeningBooks(fetchImpl).load("lines");
		expect(fetchImpl).toHaveBeenCalledWith(BOOK_URLS.lines, {cache: "force-cache"});
	});

	it("retries a download that failed the next time it is asked", async () => {
		let attempts = 0;
		const fetchImpl: Fetch = async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new TypeError("offline");
			}
			return Promise.resolve(new Response(BOOK.slice(0)));
		};
		const books = new OpeningBooks(fetchImpl);
		await expect(books.load("squares")).rejects.toThrow(
			`Could not fetch the opening book at ${BOOK_URLS.squares}: offline`,
		);
		expect(await books.load("squares")).toStrictEqual(BOOK);
		expect(attempts).toBe(2);
	});

	it("prefetches quietly so a solver made later finds the book waiting", async () => {
		const {fetch, urls} = fakeFetch();
		const books = new OpeningBooks(fetch);
		books.prefetch("lines");
		books.prefetch("lines");
		expect(await books.load("lines")).toStrictEqual(BOOK);
		expect(urls).toStrictEqual([BOOK_URLS.lines]);
		new OpeningBooks(fakeFetch(500).fetch).prefetch("squares");
		await settle();
	});
});
