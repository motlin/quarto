import {describe, it, expect} from "vitest";
import {type Board, emptyBoard, winLines, winningCells} from "../../src/game/rules.js";
import {asCell, cellFromName} from "../../src/game/cells.js";
import {asPiece, type Piece} from "../../src/game/pieces.js";

function boardWith(placements: Record<string, number>): Board {
	const board = [...emptyBoard()];
	for (const [name, piece] of Object.entries(placements)) {
		board[cellFromName(name)] = asPiece(piece);
	}
	return board;
}

function cells(...names: string[]): ReadonlySet<number> {
	return new Set(names.map(cellFromName));
}

describe("winLines", () => {
	it("has ten lines when only lines win", () => {
		expect(winLines("lines")).toHaveLength(10);
	});

	it("adds the nine 2x2 squares under the squares rules", () => {
		expect(winLines("squares")).toHaveLength(19);
		expect(winLines("squares").slice(0, 10)).toStrictEqual(winLines("lines"));
		expect(winLines("squares")[10]).toStrictEqual([0, 1, 4, 5].map(asCell));
		expect(winLines("squares")[18]).toStrictEqual([10, 11, 14, 15].map(asCell));
	});

	it("lists rows, then columns, then the two diagonals", () => {
		expect(winLines("lines")[0]).toStrictEqual([0, 1, 2, 3].map(asCell));
		expect(winLines("lines")[4]).toStrictEqual([0, 4, 8, 12].map(asCell));
		expect(winLines("lines")[8]).toStrictEqual([0, 5, 10, 15].map(asCell));
		expect(winLines("lines")[9]).toStrictEqual([3, 6, 9, 12].map(asCell));
	});
});

describe("winningCells", () => {
	it("finds nothing on an empty board", () => {
		expect(winningCells(emptyBoard(), "squares")).toStrictEqual(new Set());
	});

	it("finds a row sharing one trait", () => {
		// 1, 3, 5, 7 are all dark and share nothing else.
		const board = boardWith({a1: 1, b1: 3, c1: 5, d1: 7});
		expect(winningCells(board, "lines")).toStrictEqual(cells("a1", "b1", "c1", "d1"));
	});

	it("ignores a full row sharing no trait", () => {
		// 0 and 15 differ in every trait; 5 (0101) and 10 (1010) also differ in every trait.
		const board = boardWith({a1: 0, b1: 15, c1: 5, d1: 10});
		expect(winningCells(board, "squares")).toStrictEqual(new Set());
	});

	it("ignores an incomplete line", () => {
		const board = boardWith({a1: 1, b1: 3, c1: 5});
		expect(winningCells(board, "squares")).toStrictEqual(new Set());
	});

	it("finds columns and both diagonals", () => {
		expect(winningCells(boardWith({a1: 0, a2: 2, a3: 4, a4: 6}), "lines")).toStrictEqual(
			cells("a1", "a2", "a3", "a4"),
		);
		expect(winningCells(boardWith({a1: 8, b2: 9, c3: 10, d4: 11}), "lines")).toStrictEqual(
			cells("a1", "b2", "c3", "d4"),
		);
		expect(winningCells(boardWith({d1: 4, c2: 5, b3: 6, a4: 7}), "lines")).toStrictEqual(
			cells("d1", "c2", "b3", "a4"),
		);
	});

	it("counts a 2x2 square only under the squares rules", () => {
		const board = boardWith({b2: 8, c2: 9, b3: 10, c3: 11});
		expect(winningCells(board, "squares")).toStrictEqual(cells("b2", "c2", "b3", "c3"));
		expect(winningCells(board, "lines")).toStrictEqual(new Set());
	});

	it("unions every completed line", () => {
		const board = boardWith({a1: 1, b1: 3, c1: 5, d1: 7, a2: 9, a3: 11, a4: 13});
		expect(winningCells(board, "lines")).toStrictEqual(cells("a1", "b1", "c1", "d1", "a2", "a3", "a4"));
	});

	it("rejects a board of the wrong size", () => {
		const board: (Piece | null)[] = [];
		expect(() => winningCells(board, "lines")).toThrow("Board must have 16 cells, got 0");
	});
});
