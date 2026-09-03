// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {type Cell, cellFromName} from "../../src/game/cells.js";
import {cellOfElement, DRAG_THRESHOLD_PIXELS, dropCell, isDrag} from "../../src/ui/dragMath.js";

describe("isDrag", () => {
	it("treats a press that moves less than the threshold as a tap", () => {
		expect(isDrag({x: 100, y: 100}, {x: 100, y: 100})).toBe(false);
		expect(isDrag({x: 100, y: 100}, {x: 105, y: 100})).toBe(false);
		expect(isDrag({x: 100, y: 100}, {x: 103, y: 104})).toBe(false);
	});

	it("becomes a drag once the pointer has moved the threshold in any direction", () => {
		expect(DRAG_THRESHOLD_PIXELS).toBe(6);
		expect(isDrag({x: 100, y: 100}, {x: 106, y: 100})).toBe(true);
		expect(isDrag({x: 100, y: 100}, {x: 100, y: 94})).toBe(true);
		expect(isDrag({x: 100, y: 100}, {x: 95, y: 95})).toBe(true);
	});
});

function cellElement(cell: Cell): HTMLElement {
	const button = document.createElement("button");
	button.dataset["cell"] = String(cell);
	const glyph = document.createElement("svg");
	button.append(glyph);
	document.body.append(button);
	return button;
}

describe("cellOfElement", () => {
	it("reads the cell off the element or its nearest ancestor with data-cell", () => {
		const b2 = cellElement(cellFromName("b2"));
		expect(cellOfElement(b2)).toBe(cellFromName("b2"));
		expect(cellOfElement(b2.firstElementChild)).toBe(cellFromName("b2"));
	});

	it("is null off the board", () => {
		expect(cellOfElement(null)).toBeNull();
		expect(cellOfElement(document.body)).toBeNull();
	});

	it("rejects a data-cell that is not a cell", () => {
		const bad = document.createElement("div");
		bad.dataset["cell"] = "16";
		expect(() => cellOfElement(bad)).toThrow("Not a cell: 16");
	});
});

describe("dropCell", () => {
	const legal: ReadonlySet<Cell> = new Set([cellFromName("a1"), cellFromName("c3")]);

	it("is the cell under the pointer when it is legal", () => {
		expect(dropCell(cellElement(cellFromName("c3")), legal)).toBe(cellFromName("c3"));
	});

	it("is null over an occupied cell, and anywhere off the board", () => {
		expect(dropCell(cellElement(cellFromName("b2")), legal)).toBeNull();
		expect(dropCell(document.body, legal)).toBeNull();
		expect(dropCell(null, legal)).toBeNull();
	});
});
