/**
 * 🏁 The two rule sets and what wins under each.
 *
 * "lines" is the basic game: four in a row, column or diagonal sharing a trait. "squares" is the advanced
 * variant, which also counts any 2x2 block.
 */

import {ALL_CELLS, BOARD_SIZE, type Cell, cellAt, cellFromName} from "./cells.js";
import type {Piece} from "./pieces.js";

export type Rules = "lines" | "squares";

/** One entry per cell, row-major; `null` while the cell is empty. */
export type Board = readonly (Piece | null)[];

export function emptyBoard(): Board {
	return ALL_CELLS.map(() => null);
}

/** A board described by which piece sits on which named cell, such as `{a1: 5, b2: 10}`. */
export function boardWith(placed: Readonly<Record<string, Piece>>): Board {
	const byCell = new Map<Cell, Piece>();
	for (const [name, piece] of Object.entries(placed)) {
		const cell = cellFromName(name);
		if (byCell.has(cell)) {
			throw new Error(`Cell ${name} is placed twice`);
		}
		byCell.set(cell, piece);
	}
	return ALL_CELLS.map((cell) => byCell.get(cell) ?? null);
}

const INDICES = [0, 1, 2, 3];

function lines(): Cell[][] {
	const rows = INDICES.map((rowIndex) => INDICES.map((columnIndex) => cellAt(rowIndex, columnIndex)));
	const columns = INDICES.map((columnIndex) => INDICES.map((rowIndex) => cellAt(rowIndex, columnIndex)));
	const diagonals = [
		INDICES.map((index) => cellAt(index, index)),
		INDICES.map((index) => cellAt(index, BOARD_SIZE - 1 - index)),
	];
	return [...rows, ...columns, ...diagonals];
}

function squares(): Cell[][] {
	const starts = [0, 1, 2];
	return starts.flatMap((rowIndex) =>
		starts.map((columnIndex) => [
			cellAt(rowIndex, columnIndex),
			cellAt(rowIndex, columnIndex + 1),
			cellAt(rowIndex + 1, columnIndex),
			cellAt(rowIndex + 1, columnIndex + 1),
		]),
	);
}

const LINES_ONLY: readonly (readonly Cell[])[] = lines();

const WIN_LINES: Readonly<Record<Rules, readonly (readonly Cell[])[]>> = {
	lines: LINES_ONLY,
	squares: [...LINES_ONLY, ...squares()],
};

/** Every set of four cells that wins under `rules`: 10 lines, or 19 with the 2x2 squares. */
export function winLines(rules: Rules): readonly (readonly Cell[])[] {
	return WIN_LINES[rules];
}

const ALL_TRAITS = 0b1111;

/** Four pieces share a trait when some bit is set in all of them or clear in all of them. */
function shareTrait(pieces: readonly Piece[]): boolean {
	let allSet = ALL_TRAITS;
	let anySet = 0;
	for (const piece of pieces) {
		allSet &= piece;
		anySet |= piece;
	}
	return allSet !== 0 || anySet !== ALL_TRAITS;
}

/** Every cell on a completed winning line, for highlighting; empty while nobody has won. */
export function winningCells(board: Board, rules: Rules): ReadonlySet<Cell> {
	if (board.length !== ALL_CELLS.length) {
		throw new Error(`Board must have ${ALL_CELLS.length} cells, got ${board.length}`);
	}
	const winning = new Set<Cell>();
	for (const line of winLines(rules)) {
		const pieces: Piece[] = [];
		for (const cell of line) {
			const piece = board[cell];
			if (piece !== null && piece !== undefined) {
				pieces.push(piece);
			}
		}
		if (pieces.length === line.length && shareTrait(pieces)) {
			for (const cell of line) {
				winning.add(cell);
			}
		}
	}
	return winning;
}
