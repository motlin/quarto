/**
 * 🤝 The main thread's handle on the solver worker: one promise per request.
 *
 * Requests get increasing ids and wait in a map until the reply with that id arrives, so replies may come back in
 * any order. A worker error or `terminate` rejects everything in flight and everything asked afterwards.
 *
 * The wasm ships without opening books, so `init` and `setRules` also fetch the book for the chosen rules and post
 * it as a `loadBook` before they resolve. Every request made meanwhile waits its turn behind that, so no search ever
 * runs without the book; a book that cannot be fetched is fatal, since a bookless search takes minutes.
 */

import type {Rules} from "../game/rules.js";
import {type OpeningBooks, openingBooks} from "./books.js";
import {type Envelope, isResponse, type Kind, type Payloads, type Results} from "./protocol.js";

export interface WorkerEvents {
	readonly message: MessageEvent<unknown>;
	readonly error: ErrorEvent;
}

/** The slice of `Worker` the client uses, so tests can stand in a fake. */
export interface WorkerLike {
	postMessage(message: Envelope<Kind>, transfer?: readonly Transferable[]): void;
	addEventListener<K extends keyof WorkerEvents>(type: K, listener: (event: WorkerEvents[K]) => void): void;
	terminate(): void;
}

/** Kinds without a payload take no argument; the rest take exactly their payload. */
export type PayloadArguments<K extends Kind> = Payloads[K] extends undefined ? [] : [payload: Payloads[K]];

/** What the play screen needs of a solver, so a scripted one can stand in for the worker in tests and stories. */
export interface Solver {
	request<K extends Kind>(kind: K, ...args: PayloadArguments<K>): Promise<Results[K]>;
	terminate(): void;
}

/** Method syntax on purpose: it lets a `Promise<Results[K]>` resolver sit in a map that forgets `K`. */
interface Pending {
	resolve(result: unknown): void;
	reject(error: Error): void;
}

type Handlers = {readonly [K in Kind]: (...args: PayloadArguments<K>) => Promise<Results[K]>};

function createWorker(): Worker {
	return new Worker(new URL("./solver.worker.ts", import.meta.url), {type: "module"});
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export class SolverClient implements Solver {
	private readonly worker: WorkerLike;
	private readonly books: OpeningBooks;
	private readonly pending = new Map<number, Pending>();
	private nextId = 1;
	/** Set once the worker is gone, so later requests fail fast instead of hanging. */
	private dead: Error | null = null;
	/** Settles once every book asked for so far is in the worker; requests post behind it. */
	private gate: Promise<void> = Promise.resolve();
	/** Changing rules also fetches and loads the matching book; everything else is one round trip to the worker. */
	private readonly handlers: Handlers = {
		init: async ({rules}) => {
			const [{version}, snapshot] = await Promise.all([this.post("init", {rules}), this.loadBook(rules)]);
			return {version, snapshot};
		},
		setRules: async ({rules}) => {
			const [, snapshot] = await Promise.all([this.post("setRules", {rules}), this.loadBook(rules)]);
			return snapshot;
		},
		loadBook: async (payload) => this.post("loadBook", payload),
		reset: async () => this.post("reset", undefined),
		applySelect: async (payload) => this.post("applySelect", payload),
		applyPlace: async (payload) => this.post("applyPlace", payload),
		undo: async () => this.post("undo", undefined),
		snapshot: async () => this.post("snapshot", undefined),
		evaluate: async () => this.post("evaluate", undefined),
		moveValues: async () => this.post("moveValues", undefined),
		bestMove: async () => this.post("bestMove", undefined),
		setSeed: async (payload) => this.post("setSeed", payload),
	};

	constructor(worker: WorkerLike = createWorker(), books: OpeningBooks = openingBooks) {
		this.worker = worker;
		this.books = books;
		worker.addEventListener("message", (event) => {
			this.receive(event.data);
		});
		worker.addEventListener("error", (event) => {
			this.fail(new Error(`Solver worker failed: ${event.message}`));
		});
	}

	async request<K extends Kind>(kind: K, ...args: PayloadArguments<K>): Promise<Results[K]> {
		if (this.dead !== null) {
			throw this.dead;
		}
		return this.handlers[kind](...args);
	}

	terminate(): void {
		this.fail(new Error("Solver worker terminated"));
	}

	/** Posts `kind` once `after` settles (the gate, by default) and resolves with the worker's reply. */
	private async post<K extends Kind>(
		kind: K,
		payload: Payloads[Kind],
		transfer: readonly Transferable[] = [],
		after: Promise<void> = this.gate,
	): Promise<Results[K]> {
		if (this.dead !== null) {
			throw this.dead;
		}
		const id = this.nextId++;
		const reply = new Promise<Results[K]>((resolve, reject) => {
			this.pending.set(id, {resolve, reject});
		});
		void after.then(() => {
			if (this.dead === null) {
				this.worker.postMessage({id, kind, payload}, transfer);
			}
		});
		return reply;
	}

	/** Fetches the book for `rules` and posts it behind the current gate, holding every later request until it is in. */
	private async loadBook(rules: Rules): Promise<Results["loadBook"]> {
		const before = this.gate;
		const loaded = this.books.load(rules).then(async (bytes) => {
			// Each solver gets its own copy to transfer, so the shared download stays usable.
			const copy = bytes.slice(0);
			return this.post("loadBook", {rules, bytes: copy}, [copy], before);
		});
		this.gate = loaded.then(
			() => undefined,
			(error: unknown) => {
				this.fail(toError(error));
			},
		);
		return loaded;
	}

	private receive(data: unknown): void {
		if (!isResponse(data)) {
			return;
		}
		const pending = this.pending.get(data.id);
		if (pending === undefined) {
			return;
		}
		this.pending.delete(data.id);
		if (data.ok) {
			pending.resolve(data.result);
		} else {
			pending.reject(new Error(data.error));
		}
	}

	/** Stops the worker and rejects everything in flight and everything asked afterwards. */
	private fail(error: Error): void {
		if (this.dead === null) {
			this.dead = error;
			this.worker.terminate();
		}
		for (const pending of this.pending.values()) {
			pending.reject(this.dead);
		}
		this.pending.clear();
	}
}
