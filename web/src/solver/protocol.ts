/**
 * 📨 The messages between the app and the solver worker.
 *
 * Every request carries an id the response echoes, so the client can match replies to promises. `handle` is the
 * whole worker apart from plumbing: a pure function of one request and the solver, so the protocol is tested in
 * node against the real wasm package without a Worker in sight.
 */

import {ALL_CELLS, asCell, type Cell} from "../game/cells.js";
import {ALL_PIECES, asPiece, isPiece, type Piece} from "../game/pieces.js";
import type {Board, Rules} from "../game/rules.js";
import {version, type WasmSolver} from "./pkg/quarto_solver.js";

/** The wasm side's sentinel for an empty hand or cell. */
const NO_PIECE = 16;

export interface Snapshot {
	readonly rules: Rules;
	readonly movesLeft: number;
	readonly currentPiece: Piece | null;
	readonly piecesTaken: number;
	readonly cellsTaken: number;
	readonly board: Board;
	readonly isToPlace: boolean;
	readonly isWon: boolean;
	readonly isDone: boolean;
	readonly bookEntries: number;
	readonly bookDepth: number;
}

/** A search result: the exact value plus how hard the solver worked for it. */
export interface Search {
	readonly value: number;
	readonly nodes: number;
	readonly ms: number;
}

export interface BestMove extends Search {
	/** A cell when a piece is in hand, otherwise a piece. */
	readonly move: Cell | Piece;
}

export interface Payloads {
	readonly init: {readonly rules: Rules};
	readonly setRules: {readonly rules: Rules};
	readonly reset: undefined;
	readonly applySelect: {readonly piece: Piece};
	readonly applyPlace: {readonly cell: Cell};
	readonly undo: undefined;
	readonly snapshot: undefined;
	readonly evaluate: undefined;
	readonly moveValues: undefined;
	readonly bestMove: undefined;
	readonly setSeed: {readonly seed: number};
}

export interface Results {
	readonly init: {readonly version: string; readonly snapshot: Snapshot};
	readonly setRules: Snapshot;
	readonly reset: Snapshot;
	readonly applySelect: Snapshot;
	readonly applyPlace: Snapshot;
	readonly undo: Snapshot;
	readonly snapshot: Snapshot;
	readonly evaluate: Search;
	/** The exact value of every legal move for the player to move; empty once the game is over. */
	readonly moveValues: readonly (readonly [Cell | Piece, number])[];
	readonly bestMove: BestMove;
	readonly setSeed: null;
}

export type Kind = keyof Payloads;

export interface Envelope<K extends Kind> {
	readonly id: number;
	readonly kind: K;
	readonly payload: Payloads[K];
}

/** One request per kind, so a `switch` on `kind` narrows the payload. */
export type Request<K extends Kind = Kind> = {[Each in Kind]: Envelope<Each>}[K];

export type Response<K extends Kind = Kind> =
	| {readonly id: number; readonly ok: true; readonly result: Results[K]}
	| {readonly id: number; readonly ok: false; readonly error: string};

export function isResponse(value: unknown): value is Response {
	return typeof value === "object" && value !== null && "id" in value && "ok" in value;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function failure(id: number, error: unknown): Response {
	return {id, ok: false, error: errorMessage(error)};
}

function pieceOrNull(value: number): Piece | null {
	if (value === NO_PIECE) {
		return null;
	}
	if (!isPiece(value)) {
		throw new Error(`Solver returned an impossible piece: ${value}`);
	}
	return value;
}

function snapshot(solver: WasmSolver): Snapshot {
	return {
		rules: solver.rulesSquares() ? "squares" : "lines",
		movesLeft: solver.movesLeft(),
		currentPiece: pieceOrNull(solver.currentPiece()),
		piecesTaken: solver.piecesTaken(),
		cellsTaken: solver.cellsTaken(),
		board: ALL_CELLS.map((cell) => pieceOrNull(solver.pieceAt(cell))),
		isToPlace: solver.isToPlace(),
		isWon: solver.isWon(),
		isDone: solver.isDone(),
		bookEntries: solver.bookEntries(),
		bookDepth: solver.bookDepth(),
	};
}

function isOver(solver: WasmSolver): boolean {
	return solver.isWon() || solver.isDone();
}

/** Runs `search` and reports the nodes visited and milliseconds spent on it. */
function timed(solver: WasmSolver, search: () => number): Search {
	const nodesBefore = solver.nodeCount();
	const start = performance.now();
	const value = search();
	return {value, nodes: solver.nodeCount() - nodesBefore, ms: performance.now() - start};
}

function evaluateMove(solver: WasmSolver, move: number): number {
	return solver.isToPlace() ? solver.evaluatePlace(move) : solver.evaluateSelect(move);
}

function moveValues(solver: WasmSolver): Results["moveValues"] {
	if (isOver(solver)) {
		return [];
	}
	const placing = solver.isToPlace();
	const taken = placing ? solver.cellsTaken() : solver.piecesTaken();
	const candidates: readonly (Cell | Piece)[] = placing ? ALL_CELLS : ALL_PIECES;
	return candidates
		.filter((move) => ((taken >> move) & 1) === 0)
		.map((move) => [move, evaluateMove(solver, move)] as const);
}

function bestMove(solver: WasmSolver): BestMove {
	if (isOver(solver)) {
		throw new Error("The game is over");
	}
	const placing = solver.isToPlace();
	const chosen = timed(solver, () => solver.bestMove());
	const move = placing ? asCell(chosen.value) : asPiece(chosen.value);
	return {move, value: evaluateMove(solver, move), nodes: chosen.nodes, ms: chosen.ms};
}

function dispatch(request: Request, solver: WasmSolver): Results[Kind] {
	switch (request.kind) {
		case "init":
			solver.setRules(request.payload.rules === "squares");
			return {version: version(), snapshot: snapshot(solver)};
		case "setRules":
			solver.setRules(request.payload.rules === "squares");
			return snapshot(solver);
		case "reset":
			solver.reset();
			return snapshot(solver);
		case "applySelect":
			if (!solver.applySelect(request.payload.piece)) {
				throw new Error(`Cannot select piece ${request.payload.piece} now`);
			}
			return snapshot(solver);
		case "applyPlace":
			if (!solver.applyPlace(request.payload.cell)) {
				throw new Error(`Cannot place on cell ${request.payload.cell} now`);
			}
			return snapshot(solver);
		case "undo":
			if (!solver.undo()) {
				throw new Error("Nothing to undo");
			}
			return snapshot(solver);
		case "snapshot":
			return snapshot(solver);
		case "evaluate":
			return timed(solver, () => solver.evaluate());
		case "moveValues":
			return moveValues(solver);
		case "bestMove":
			return bestMove(solver);
		case "setSeed":
			solver.setSeed(request.payload.seed);
			return null;
		default:
			throw new Error(`Unknown request: ${JSON.stringify(request)}`);
	}
}

/** Answers one request, turning anything the solver refuses or throws into an `ok: false` response. */
export function handle(request: Request, solver: WasmSolver): Response {
	try {
		return {id: request.id, ok: true, result: dispatch(request, solver)};
	} catch (error: unknown) {
		return failure(request.id, error);
	}
}
