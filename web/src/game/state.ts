/**
 * 🎮 The game as a value.
 *
 * Every transition returns a new state, and returns the state it was given, unchanged and by identity, when the
 * move is not allowed. React can then hold one of these in `useState` and the illegal taps cost nothing: setting
 * the same object back is not a render.
 *
 * With undo off, a human turn is provisional until confirmed: the placement and the selection sit in `pending`,
 * outside the board, the tray and the log, until `confirmTurn` commits them as ordinary moves. Everything derived
 * from the committed position (whose turn it is, the verdict) stays put while the turn is unconfirmed.
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

/** The steps of the current turn taken but not yet confirmed; empty whenever undo is allowed. */
export interface Pending {
	readonly placedCell: Cell | null;
	readonly selectedPiece: Piece | null;
}

const NO_PENDING: Pending = {placedCell: null, selectedPiece: null};

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
	readonly pending: Pending;
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
		pending: NO_PENDING,
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
	if (state.status !== "playing" || hasPending(state) || isToPlace(state) || !state.remaining.includes(piece)) {
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

function placed(board: Board, piece: Piece, cell: Cell): Board {
	return board.map((occupant, index) => (index === cell ? piece : occupant));
}

function statusAfterPlacement(board: Board, state: GameState): Status {
	if (winningCells(board, state.setup.rules).size > 0) {
		return "won";
	}
	return state.remaining.length === 0 ? "drawn" : "playing";
}

export function applyPlace(state: GameState, cell: Cell): GameState {
	if (state.status !== "playing" || hasPending(state) || state.hand === null || state.board[cell] !== null) {
		return state;
	}
	const hand = state.hand;
	const board = placed(state.board, hand, cell);
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

export function hasPending(state: GameState): boolean {
	return state.pending.placedCell !== null || state.pending.selectedPiece !== null;
}

/** The board as the player sees it: the committed pieces plus the one placed but not yet confirmed. */
export function boardWithPending(state: GameState): Board {
	const {placedCell} = state.pending;
	if (placedCell === null || state.hand === null) {
		return state.board;
	}
	return placed(state.board, state.hand, placedCell);
}

/** The piece shown in hand: the one still to be placed, or else the one chosen but not yet confirmed. */
export function handWithPending(state: GameState): Piece | null {
	return awaitsPlacement(state) ? state.hand : state.pending.selectedPiece;
}

/** The turn's placement still has to be made. */
export function awaitsPlacement(state: GameState): boolean {
	return state.status === "playing" && state.hand !== null && state.pending.placedCell === null;
}

/** A placement (committed or pending) that wins or fills the board ends the game, so no selection follows it. */
function placementEndsGame(state: GameState): boolean {
	return winningCells(boardWithPending(state), state.setup.rules).size > 0 || state.remaining.length === 0;
}

/** The turn's selection still has to be made: at the start of the game, or once the piece in hand is placed. */
export function awaitsSelection(state: GameState): boolean {
	if (state.status !== "playing" || state.pending.selectedPiece !== null) {
		return false;
	}
	if (state.hand === null) {
		return true;
	}
	return state.pending.placedCell !== null && !placementEndsGame(state);
}

export function isTurnComplete(state: GameState): boolean {
	return hasPending(state) && !awaitsPlacement(state) && !awaitsSelection(state);
}

export function provisionalPlace(state: GameState, cell: Cell): GameState {
	if (!awaitsPlacement(state) || state.board[cell] !== null) {
		return state;
	}
	return {...state, pending: {...state.pending, placedCell: cell}};
}

export function provisionalSelect(state: GameState, piece: Piece): GameState {
	if (!awaitsSelection(state) || !state.remaining.includes(piece)) {
		return state;
	}
	return {...state, pending: {...state.pending, selectedPiece: piece}};
}

/** Retracts the most recent provisional step: the selection first, then the placement. */
export function takeBack(state: GameState): GameState {
	if (state.pending.selectedPiece !== null) {
		return {...state, pending: {...state.pending, selectedPiece: null}};
	}
	if (state.pending.placedCell !== null) {
		return {...state, pending: NO_PENDING};
	}
	return state;
}

/** Commits the pending turn as ordinary moves, the placement first; a no-op until the turn is complete. */
export function confirmTurn(state: GameState): GameState {
	if (!isTurnComplete(state)) {
		return state;
	}
	const {placedCell, selectedPiece} = state.pending;
	let next: GameState = {...state, pending: NO_PENDING};
	if (placedCell !== null) {
		next = applyPlace(next, placedCell);
	}
	if (selectedPiece !== null) {
		next = applySelect(next, selectedPiece);
	}
	return next;
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
