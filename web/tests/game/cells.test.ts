import {describe, it, expect} from "vitest";
import {ALL_CELLS, asCell, cellAt, cellFromName, cellName, column, isCell, row} from "../../src/game/cells.js";

describe("cellName", () => {
	it("names cells column letter first, row digit second, row-major", () => {
		expect(ALL_CELLS.map(cellName)).toStrictEqual([
			"a1",
			"b1",
			"c1",
			"d1",
			"a2",
			"b2",
			"c2",
			"d2",
			"a3",
			"b3",
			"c3",
			"d3",
			"a4",
			"b4",
			"c4",
			"d4",
		]);
	});

	it("round-trips through cellFromName", () => {
		expect(ALL_CELLS.map((cell) => cellFromName(cellName(cell)))).toStrictEqual([...ALL_CELLS]);
	});
});

describe("cellFromName", () => {
	it("rejects names off the board", () => {
		expect(() => cellFromName("e1")).toThrow('Not a cell name: "e1"');
		expect(() => cellFromName("a5")).toThrow('Not a cell name: "a5"');
		expect(() => cellFromName("a10")).toThrow('Not a cell name: "a10"');
		expect(() => cellFromName("A1")).toThrow('Not a cell name: "A1"');
	});
});

describe("row and column", () => {
	it("split a cell into its coordinates", () => {
		expect(row(9)).toBe(2);
		expect(column(9)).toBe(1);
		expect(cellAt(2, 1)).toBe(9);
		expect(ALL_CELLS.map((cell) => cellAt(row(cell), column(cell)))).toStrictEqual([...ALL_CELLS]);
	});

	it("rejects coordinates off the board", () => {
		expect(() => cellAt(4, 0)).toThrow("Not a cell: 16");
		expect(() => cellAt(0, 4)).toThrow("Not a cell: 4");
	});
});

describe("asCell", () => {
	it("accepts the sixteen cell numbers and rejects the rest", () => {
		expect(ALL_CELLS.map(asCell)).toStrictEqual([...ALL_CELLS]);
		expect(isCell(15)).toBe(true);
		expect(isCell(16)).toBe(false);
		expect(() => asCell(16)).toThrow("Not a cell: 16");
	});
});
