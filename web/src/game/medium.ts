/**
 * 🙂 The Medium bot: one ply of lookahead, random otherwise.
 *
 * A bot turn is a placement of the piece in hand followed by the choice of a piece for the opponent; the first turn
 * of the game is a choice only and the last a placement only. The policy, in order:
 *
 * 1. If the piece in hand wins somewhere, place it there. The game is over, so nothing is selected.
 * 2. Otherwise weigh every (cell, piece) pair together: a pair is safe when, once the hand is on that cell, the
 *    opponent cannot win at once with that piece. Pick uniformly among the safe pairs.
 * 3. If nothing is safe, pick uniformly among all pairs. The bot then loses only when every choice was losing.
 *
 * The exact solver never enters into it, so the readout can say "You win in 3" against a bot that will not see the
 * defence coming.
 */

import {ALL_CELLS, type Cell} from "./cells.js";
import type {Piece} from "./pieces.js";
import {pickOne, type Random} from "./random.js";
import {type Board, type Rules, winningCells} from "./rules.js";
import type {GameState} from "./state.js";

export interface MediumTurn {
	/** Where the piece in hand goes; nothing on the first turn, when there is no piece in hand. */
	readonly place: Cell | null;
	/** The piece handed to the opponent; nothing when the placement ends the game or empties the tray. */
	readonly select: Piece | null;
}

interface Pair {
	readonly cell: Cell;
	readonly piece: Piece;
}

function emptyCells(board: Board): readonly Cell[] {
	return ALL_CELLS.filter((cell) => board[cell] === null);
}

function placing(board: Board, cell: Cell, piece: Piece): Board {
	return board.map((occupant, index) => (index === cell ? piece : occupant));
}

function wins(board: Board, cell: Cell, piece: Piece, rules: Rules): boolean {
	return winningCells(placing(board, cell, piece), rules).size > 0;
}

/** Whether whoever receives `piece` can win by placing it on some empty cell. */
function winsAtOnce(board: Board, piece: Piece, rules: Rules): boolean {
	return emptyCells(board).some((cell) => wins(board, cell, piece, rules));
}

/** A piece for the opponent that cannot win at once if there is one; any piece otherwise. */
function chooseSelect(board: Board, remaining: readonly Piece[], rules: Rules, random: Random): Piece {
	const safe = remaining.filter((piece) => !winsAtOnce(board, piece, rules));
	return pickOne(safe.length > 0 ? safe : remaining, random);
}

export function mediumTurn(state: GameState, random: Random): MediumTurn {
	if (state.status !== "playing") {
		throw new Error("The game is over");
	}
	const {board, hand, remaining} = state;
	const {rules} = state.setup;
	if (hand === null) {
		return {place: null, select: chooseSelect(board, remaining, rules, random)};
	}
	const empty = emptyCells(board);
	const winning = empty.find((cell) => wins(board, cell, hand, rules));
	if (winning !== undefined) {
		return {place: winning, select: null};
	}
	if (remaining.length === 0) {
		return {place: pickOne(empty, random), select: null};
	}
	const pairs: Pair[] = [];
	const safePairs: Pair[] = [];
	for (const cell of empty) {
		const after = placing(board, cell, hand);
		for (const piece of remaining) {
			const pair = {cell, piece};
			pairs.push(pair);
			if (!winsAtOnce(after, piece, rules)) {
				safePairs.push(pair);
			}
		}
	}
	const {cell, piece} = pickOne(safePairs.length > 0 ? safePairs : pairs, random);
	return {place: cell, select: piece};
}
