/**
 * 🤝 The main thread's handle on the solver worker: one promise per request.
 *
 * Requests get increasing ids and wait in a map until the reply with that id arrives, so replies may come back in
 * any order. A worker error or `terminate` rejects everything in flight and everything asked afterwards.
 */

import {type Envelope, isResponse, type Kind, type Payloads, type Results} from "./protocol.js";

export interface WorkerEvents {
	readonly message: MessageEvent<unknown>;
	readonly error: ErrorEvent;
}

/** The slice of `Worker` the client uses, so tests can stand in a fake. */
export interface WorkerLike {
	postMessage(message: Envelope<Kind>): void;
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

function createWorker(): Worker {
	return new Worker(new URL("./solver.worker.ts", import.meta.url), {type: "module"});
}

export class SolverClient implements Solver {
	private readonly worker: WorkerLike;
	private readonly pending = new Map<number, Pending>();
	private nextId = 1;
	/** Set once the worker is gone, so later requests fail fast instead of hanging. */
	private dead: Error | null = null;

	constructor(worker: WorkerLike = createWorker()) {
		this.worker = worker;
		worker.addEventListener("message", (event) => {
			this.receive(event.data);
		});
		worker.addEventListener("error", (event) => {
			this.die(new Error(`Solver worker failed: ${event.message}`));
			worker.terminate();
		});
	}

	async request<K extends Kind>(kind: K, ...args: PayloadArguments<K>): Promise<Results[K]> {
		if (this.dead !== null) {
			throw this.dead;
		}
		const id = this.nextId++;
		const [payload] = args;
		return new Promise<Results[K]>((resolve, reject) => {
			this.pending.set(id, {resolve, reject});
			this.worker.postMessage({id, kind, payload});
		});
	}

	terminate(): void {
		this.die(new Error("Solver worker terminated"));
		this.worker.terminate();
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

	private die(error: Error): void {
		this.dead = error;
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}
}
