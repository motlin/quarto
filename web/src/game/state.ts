/**
 * 🎮 The game as a value.
 *
 * Every transition returns a new state, and returns the state it was given, unchanged and by identity, when the
 * move is not allowed. React can then hold one of these in `useState` and the illegal taps cost nothing: setting
 * the same object back is not a render.
 */

import {ALL_CELLS, type Cell} from "./cells.js";
import {ALL_PIECES, type Piece} from "./pieces.js";
import {type Board, emptyBoard, winningCells} from "./rules.js";
import type {GameSetup} from "./setup.js";
import {isHumanTurn, type Player, playerToMove} from "./turns.js";

export type Move =
	| {readonly kind: "select"; readonly player: Player; readonly piece: Piece}
	| {readonly kind: "place"; readonly player: Player; readonly piece: Piece; readonly cell: Cell};

export type Status = "playing" | "won" | "drawn";

/** What the solver said about the position it was asked about, kept for the verdict strip. */
export interface Verdict {
	readonly value: number;
	/** Placements still to go in the position the value describes. */
	readonly movesLeft: number;
	readonly mover: Player;
	readonly nodes: number;
	readonly milliseconds: number;
}

export interface GameState {
	readonly setup: GameSetup;
	readonly board: Board;
	/** The piece chosen for the next placement, between a select and its place. */
	readonly hand: Piece | null;
	/** Pieces still in the tray, in piece order. */
	readonly remaining: readonly Piece[];
	readonly log: readonly Move[];
	/** The cell of the most recent placement, which the board highlights. */
	readonly lastCell: Cell | null;
	readonly status: Status;
	readonly verdict: Verdict | null;
	/** The exact value of each legal move (cell or piece) for the human to move, when hints are on. */
	readonly hintValues: ReadonlyMap<number, number> | null;
}

export function newGame(setup: GameSetup): GameState {
	return {
		setup,
		board: emptyBoard(),
		hand: null,
		remaining: [...ALL_PIECES],
		log: [],
		lastCell: null,
		status: "playing",
		verdict: null,
		hintValues: null,
	};
}

export function isToPlace(state: GameState): boolean {
	return state.hand !== null;
}

/** Placements made so far. */
export function movesDone(state: GameState): number {
	return ALL_PIECES.length - state.remaining.length - (isToPlace(state) ? 1 : 0);
}

export function movesLeft(state: GameState): number {
	return ALL_CELLS.length - movesDone(state);
}

export function currentPlayer(state: GameState): Player {
	return playerToMove(movesDone(state), isToPlace(state));
}

export function isHumanToMove(state: GameState): boolean {
	return isHumanTurn(state.setup, movesDone(state), isToPlace(state));
}

export function applySelect(state: GameState, piece: Piece): GameState {
	if (state.status !== "playing" || isToPlace(state) || !state.remaining.includes(piece)) {
		return state;
	}
	return {
		...state,
		hand: piece,
		remaining: state.remaining.filter((candidate) => candidate !== piece),
		log: [...state.log, {kind: "select", player: currentPlayer(state), piece}],
		verdict: null,
		hintValues: null,
	};
}

function statusAfterPlacement(board: Board, state: GameState): Status {
	if (winningCells(board, state.setup.rules).size > 0) {
		return "won";
	}
	return state.remaining.length === 0 ? "drawn" : "playing";
}

export function applyPlace(state: GameState, cell: Cell): GameState {
	if (state.status !== "playing" || state.hand === null || state.board[cell] !== null) {
		return state;
	}
	const hand = state.hand;
	const board = state.board.map((occupant, index) => (index === cell ? hand : occupant));
	return {
		...state,
		board,
		hand: null,
		log: [...state.log, {kind: "place", player: currentPlayer(state), piece: hand, cell}],
		lastCell: cell,
		status: statusAfterPlacement(board, state),
		verdict: null,
		hintValues: null,
	};
}

/** The state after playing `log` from the start. */
export function replay(setup: GameSetup, log: readonly Move[]): GameState {
	let state = newGame(setup);
	for (const move of log) {
		state = move.kind === "select" ? applySelect(state, move.piece) : applyPlace(state, move.cell);
	}
	return state;
}

/**
 * Takes back the last ply, then keeps going until a human is to move again, so one tap undoes the human's move
 * together with the bot's reply. Between two people that is a single ply.
 */
export function undoToHumanDecision(state: GameState): GameState {
	if (state.log.length === 0) {
		return state;
	}
	let undone = replay(state.setup, state.log.slice(0, -1));
	while (undone.log.length > 0 && !isHumanToMove(undone)) {
		undone = replay(state.setup, undone.log.slice(0, -1));
	}
	return undone;
}

export function withVerdict(state: GameState, verdict: Verdict): GameState {
	if (state.status !== "playing") {
		return state;
	}
	return {...state, verdict};
}

export function withHints(state: GameState, hintValues: ReadonlyMap<number, number>): GameState {
	if (state.status !== "playing") {
		return state;
	}
	return {...state, hintValues};
}
