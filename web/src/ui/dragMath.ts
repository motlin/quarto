/**
 * 📐 The arithmetic behind dragging the piece in hand: when a press has become a drag, and which cell an element
 * under the pointer belongs to. Pure, so it is tested without pointer events.
 */

import {asCell, type Cell} from "../game/cells.js";

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** A press that moves less than this before release is a tap and leaves the tap flow alone. */
export const DRAG_THRESHOLD_PIXELS = 6;

export function isDrag(start: Point, current: Point): boolean {
	return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_THRESHOLD_PIXELS;
}

/** The cell of the board element at or above `element`, or null when the element is not on the board. */
export function cellOfElement(element: Element | null): Cell | null {
	const marked = element?.closest("[data-cell]") ?? null;
	if (!(marked instanceof HTMLElement)) {
		return null;
	}
	return asCell(Number(marked.dataset["cell"]));
}

/** Where the piece lands if released over `element`: its cell when that cell is legal, else nowhere. */
export function dropCell(element: Element | null, legalCells: ReadonlySet<Cell>): Cell | null {
	const cell = cellOfElement(element);
	return cell !== null && legalCells.has(cell) ? cell : null;
}
