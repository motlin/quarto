import {readFileSync} from "node:fs";
import {describe, it, expect, beforeAll} from "vitest";
import {ALL_CELLS, cellFromName, cellName} from "../../src/game/cells.js";
import {describeValue} from "../../src/game/evaluation.js";
import {ALL_PIECES, pieceFromToken, pieceToken} from "../../src/game/pieces.js";
import {initSync, WasmSolver} from "../../src/solver/pkg/quarto_solver.js";
import {handle, type Request, type Results, type Snapshot} from "../../src/solver/protocol.js";

const fixturePath = new URL("../../../solver/tests/fixtures/games_reg/2.txt", import.meta.url);

beforeAll(() => {
	initSync({module: readFileSync(new URL("../../src/solver/pkg/quarto_solver_bg.wasm", import.meta.url))});
});

let nextId = 1;

/** Sends one request and returns its result, failing the test when the worker side says no. */
function ask<K extends Request["kind"]>(
	solver: WasmSolver,
	kind: K,
	payload: Extract<Request, {kind: K}>["payload"],
): Results[K] {
	const id = nextId++;
	const response = handle({id, kind, payload} as Request, solver);
	expect(response.id).toBe(id);
	if (!response.ok) {
		throw new Error(`${kind} failed: ${response.error}`);
	}
	return response.result as Results[K];
}

function refuse(solver: WasmSolver, request: Omit<Request, "id">): string {
	const id = nextId++;
	const response = handle({id, ...request} as Request, solver);
	expect(response.id).toBe(id);
	expect(response.ok).toBe(false);
	return response.ok ? "" : response.error;
}

const EMPTY: Omit<Snapshot, "rules" | "bookEntries" | "bookDepth"> = {
	movesLeft: 16,
	currentPiece: null,
	piecesTaken: 0,
	cellsTaken: 0,
	board: ALL_CELLS.map(() => null),
	isToPlace: false,
	isWon: false,
	isDone: false,
};

describe("handle", () => {
	it("answers init with the crate version and an empty board under the requested rules", () => {
		const solver = new WasmSolver(true);
		const {version, snapshot} = ask(solver, "init", {rules: "lines"});
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(snapshot).toStrictEqual({...EMPTY, rules: "lines", bookEntries: snapshot.bookEntries, bookDepth: 4});
		expect(snapshot.bookEntries).toBeGreaterThan(40_000);
	});

	it("switches rules and restarts", () => {
		const solver = new WasmSolver(true);
		ask(solver, "applySelect", {piece: 0});
		const snapshot = ask(solver, "setRules", {rules: "lines"});
		expect(snapshot).toStrictEqual({...EMPTY, rules: "lines", bookEntries: snapshot.bookEntries, bookDepth: 4});
	});

	it("tracks a selection and a placement, and undoes them", () => {
		const solver = new WasmSolver(true);
		const start = ask(solver, "snapshot", undefined);
		const afterSelect = ask(solver, "applySelect", {piece: pieceFromToken("Bx")});
		expect(afterSelect).toMatchObject({
			movesLeft: 16,
			currentPiece: 7,
			piecesTaken: 1 << 7,
			cellsTaken: 0,
			isToPlace: true,
		});
		const afterPlace = ask(solver, "applyPlace", {cell: cellFromName("b3")});
		expect(afterPlace).toMatchObject({
			movesLeft: 15,
			currentPiece: null,
			piecesTaken: 1 << 7,
			cellsTaken: 1 << 9,
			isToPlace: false,
			board: ALL_CELLS.map((cell) => (cell === 9 ? 7 : null)),
		});
		expect(ask(solver, "undo", undefined)).toStrictEqual(afterSelect);
		expect(ask(solver, "undo", undefined)).toStrictEqual(start);
	});

	it("refuses illegal moves and an undo at the start without changing the position", () => {
		const solver = new WasmSolver(true);
		expect(refuse(solver, {kind: "undo", payload: undefined})).toBe("Nothing to undo");
		expect(refuse(solver, {kind: "applyPlace", payload: {cell: 0}})).toBe("Cannot place on cell 0 now");
		ask(solver, "applySelect", {piece: 3});
		expect(refuse(solver, {kind: "applySelect", payload: {piece: 3}})).toBe("Cannot select piece 3 now");
		ask(solver, "applyPlace", {cell: 5});
		expect(refuse(solver, {kind: "applySelect", payload: {piece: 3}})).toBe("Cannot select piece 3 now");
		ask(solver, "applySelect", {piece: 4});
		expect(refuse(solver, {kind: "applyPlace", payload: {cell: 5}})).toBe("Cannot place on cell 5 now");
		expect(ask(solver, "snapshot", undefined)).toMatchObject({
			currentPiece: 4,
			piecesTaken: (1 << 3) | (1 << 4),
			cellsTaken: 1 << 5,
		});
	});

	it("reports the search effort with an evaluation", () => {
		const solver = new WasmSolver(true);
		ask(solver, "reset", undefined);
		const evaluation = ask(solver, "evaluate", undefined);
		expect(evaluation.value).toBe(0);
		expect(evaluation.nodes).toBeGreaterThanOrEqual(0);
		expect(evaluation.ms).toBeGreaterThanOrEqual(0);
	});

	it("picks a best move whose value matches the position", () => {
		const solver = new WasmSolver(true);
		ask(solver, "setSeed", {seed: 7});
		const selection = ask(solver, "bestMove", undefined);
		expect(ALL_PIECES).toContain(selection.move);
		expect(selection.value).toBe(0);
		ask(solver, "applySelect", {piece: selection.move});
		const placement = ask(solver, "bestMove", undefined);
		expect(ALL_CELLS).toContain(placement.move);
		expect(placement.value).toBe(0);
		expect(placement.nodes).toBeGreaterThanOrEqual(0);
		expect(placement.ms).toBeGreaterThanOrEqual(0);
	});

	it("has no best move or move values once the game is over", () => {
		const solver = new WasmSolver(true);
		ask(solver, "reset", undefined);
		const column = [
			[0, 0],
			[1, 4],
			[2, 8],
			[3, 12],
		] as const;
		for (const [piece, cell] of column) {
			ask(solver, "applySelect", {piece});
			ask(solver, "applyPlace", {cell});
		}
		expect(ask(solver, "snapshot", undefined)).toMatchObject({isWon: true, isDone: false, movesLeft: 12});
		expect(ask(solver, "moveValues", undefined)).toStrictEqual([]);
		expect(refuse(solver, {kind: "bestMove", payload: undefined})).toBe("The game is over");
	});
});

const OUTCOMES = {win: "Win", loss: "Loss"} as const;

/** The upstream `evalToString`, from the mover's point of view, which `describeValue` calls the human's. */
function fixtureString(value: number, movesLeft: number): string {
	const evaluation = describeValue(value, movesLeft, true);
	return evaluation.kind === "draw" ? "Draw" : `${OUTCOMES[evaluation.kind]} in ${evaluation.distance}`;
}

interface Ply {
	readonly phase: "select" | "place";
	readonly evaluation: string;
	readonly moves: ReadonlyMap<string, string>;
	readonly chosen: string;
}

interface Fixture {
	readonly plies: readonly Ply[];
	readonly result: "Win" | "Draw";
}

/** Parses a `play()` transcript: blank-line separated blocks headed `Eval:`, `Moves:`, `Piece:` or `Cell:`. */
function parseFixture(text: string): Fixture {
	const plies: Ply[] = [];
	let result: Fixture["result"] | null = null;
	let pending: {evaluation: string; moves: Map<string, string>} | null = null;
	for (const block of text.split(/\n\n+/)) {
		const [header, ...body] = block.trim().split("\n");
		if (header === "Eval:") {
			pending = {evaluation: body[0]!, moves: new Map()};
		} else if (header === "Moves:") {
			for (const line of body) {
				const [tokens, evaluation] = line.split(" : ");
				for (const token of tokens!.split(" ")) {
					pending!.moves.set(token, evaluation!);
				}
			}
		} else if (header === "Piece:" || header === "Cell:") {
			plies.push({...pending!, phase: header === "Piece:" ? "select" : "place", chosen: body[0]!});
			pending = null;
		} else if (header === "Win" || header === "Draw") {
			result = header;
		}
	}
	return {plies, result: result!};
}

describe("replaying games_reg/2.txt through the protocol", () => {
	it("reproduces every evaluation the transcript records", () => {
		const {plies, result} = parseFixture(readFileSync(fixturePath, "utf8"));
		expect(plies.length).toBeGreaterThan(20);
		const solver = new WasmSolver(true);
		let snapshot = ask(solver, "init", {rules: "squares"}).snapshot;
		const replayed: Ply[] = [];
		for (const ply of plies) {
			const {movesLeft} = snapshot;
			const placing = snapshot.isToPlace;
			const moves = ask(solver, "moveValues", undefined).map(
				([move, value]) =>
					[placing ? cellName(move) : pieceToken(move), fixtureString(value, movesLeft)] as const,
			);
			replayed.push({
				phase: placing ? "place" : "select",
				evaluation: fixtureString(ask(solver, "evaluate", undefined).value, movesLeft),
				moves: new Map(moves),
				chosen: ply.chosen,
			});
			snapshot = placing
				? ask(solver, "applyPlace", {cell: cellFromName(ply.chosen)})
				: ask(solver, "applySelect", {piece: pieceFromToken(ply.chosen)});
		}
		expect(replayed).toStrictEqual(plies);
		expect(snapshot.isWon).toBe(result === "Win");
		expect(snapshot.isDone).toBe(result === "Draw");
	});
});
