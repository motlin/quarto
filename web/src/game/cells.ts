/**
 * 🧭 The sixteen board cells, numbered row-major from the top-left: cell 9 is column b of row 3, "b3".
 *
 * The number is also the upstream solver's cell index.
 */

export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const ALL_CELLS: readonly Cell[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const BOARD_SIZE = 4;

export function isCell(value: number): value is Cell {
	return Number.isInteger(value) && value >= 0 && value < ALL_CELLS.length;
}

export function asCell(value: number): Cell {
	if (!isCell(value)) {
		throw new Error(`Not a cell: ${value}`);
	}
	return value;
}

export function row(cell: Cell): number {
	return Math.floor(cell / BOARD_SIZE);
}

export function column(cell: Cell): number {
	return cell % BOARD_SIZE;
}

export function cellAt(rowIndex: number, columnIndex: number): Cell {
	if (columnIndex < 0 || columnIndex >= BOARD_SIZE) {
		throw new Error(`Not a cell: ${columnIndex}`);
	}
	return asCell(rowIndex * BOARD_SIZE + columnIndex);
}

/** The upstream notation: column letter `a`-`d` then row digit `1`-`4`. */
export function cellName(cell: Cell): string {
	return String.fromCharCode("a".charCodeAt(0) + column(cell)) + String(row(cell) + 1);
}

const CELL_BY_NAME: ReadonlyMap<string, Cell> = new Map(ALL_CELLS.map((cell) => [cellName(cell), cell]));

export function cellFromName(name: string): Cell {
	const cell = CELL_BY_NAME.get(name);
	if (cell === undefined) {
		throw new Error(`Not a cell name: ${JSON.stringify(name)}`);
	}
	return cell;
}
