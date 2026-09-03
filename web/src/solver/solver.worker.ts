/**
 * 🧵 The solver's own thread.
 *
 * Loads the wasm package once, then answers every message through `handle`. Requests that arrive before the
 * module has finished loading wait on the same promise, in order, so the main thread can start asking straight
 * away.
 */

import init, {WasmSolver} from "./pkg/quarto_solver.js";
import {failure, handle, type Request, type Response} from "./protocol.js";

const ready: Promise<WasmSolver> = init({
	module_or_path: new URL("./pkg/quarto_solver_bg.wasm", import.meta.url),
}).then(() => new WasmSolver(true));

async function respond(request: Request): Promise<Response> {
	try {
		return handle(request, await ready);
	} catch (error: unknown) {
		return failure(request.id, error);
	}
}

self.onmessage = (event: MessageEvent<Request>) => {
	void respond(event.data).then((response) => {
		self.postMessage(response);
	});
};
