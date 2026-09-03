import {describe, it, expect} from "vitest";
import {SolverClient, type WorkerEvents, type WorkerLike} from "../../src/solver/client.js";
import type {Envelope, Kind, Response} from "../../src/solver/protocol.js";

/** Stands in for a Worker: records what was posted and lets the test reply whenever it likes. */
class FakeWorker implements WorkerLike {
	readonly posted: Envelope<Kind>[] = [];
	terminated = false;
	private readonly listeners = new Map<keyof WorkerEvents, ((event: never) => void)[]>();

	postMessage(message: Envelope<Kind>): void {
		this.posted.push(message);
	}

	addEventListener<K extends keyof WorkerEvents>(type: K, listener: (event: WorkerEvents[K]) => void): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	terminate(): void {
		this.terminated = true;
	}

	reply(response: Response): void {
		this.emit("message", new MessageEvent("message", {data: response}));
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

describe("SolverClient", () => {
	it("posts each request with its own id and payload", () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		void client.request("init", {rules: "squares"});
		void client.request("applyPlace", {cell: 3});
		void client.request("evaluate");
		expect(worker.posted).toStrictEqual([
			{id: 1, kind: "init", payload: {rules: "squares"}},
			{id: 2, kind: "applyPlace", payload: {cell: 3}},
			{id: 3, kind: "evaluate", payload: undefined},
		]);
	});

	it("resolves each promise with the result that carries its id, whatever the order", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		const first = client.request("evaluate");
		const second = client.request("setSeed", {seed: 1});
		worker.reply({id: 2, ok: true, result: null});
		worker.reply({id: 1, ok: true, result: {value: 0, nodes: 10, ms: 1}});
		expect(await first).toStrictEqual({value: 0, nodes: 10, ms: 1});
		expect(await second).toBeNull();
	});

	it("rejects with the worker's error text on a failed response", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		const pending = client.request("undo");
		worker.reply({id: 1, ok: false, error: "Nothing to undo"});
		await expect(pending).rejects.toThrow("Nothing to undo");
	});

	it("ignores replies for ids it is not waiting on", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		const pending = client.request("evaluate");
		worker.reply({id: 99, ok: true, result: null});
		worker.reply({id: 1, ok: true, result: {value: 2, nodes: 0, ms: 0}});
		expect(await pending).toStrictEqual({value: 2, nodes: 0, ms: 0});
	});

	it("terminates a failed worker and rejects everything in flight and every request after", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		const pending = client.request("evaluate");
		worker.fail("boom");
		await expect(pending).rejects.toThrow("Solver worker failed: boom");
		await expect(client.request("snapshot")).rejects.toThrow("Solver worker failed: boom");
		expect(worker.posted).toHaveLength(1);
		expect(worker.terminated).toBe(true);
	});

	it("terminates the worker and rejects what was in flight", async () => {
		const worker = new FakeWorker();
		const client = new SolverClient(worker);
		const pending = client.request("evaluate");
		client.terminate();
		expect(worker.terminated).toBe(true);
		await expect(pending).rejects.toThrow("Solver worker terminated");
		await expect(client.request("evaluate")).rejects.toThrow("Solver worker terminated");
	});
});
