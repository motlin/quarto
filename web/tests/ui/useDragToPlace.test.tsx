// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import {type Cell, cellFromName} from "../../src/game/cells.js";
import {useDragToPlace} from "../../src/ui/useDragToPlace.js";
import {installPointerStubs, pointer, type PointerStubs} from "./pointer.js";

const b2 = cellFromName("b2");
const c3 = cellFromName("c3");
const legal: ReadonlySet<Cell> = new Set([b2, c3]);

/** The hand piece, the ghost and two board cells, wired the way the play screen wires them. */
function Harness({legalCells, onPlace}: {legalCells: ReadonlySet<Cell>; onPlace: (cell: Cell) => void}) {
	const drag = useDragToPlace(legalCells, onPlace);
	return (
		<>
			<div data-testid="hand" className={drag.enabled ? "draggable" : ""} {...drag.handlers} />
			{drag.ghost !== null && (
				<div
					data-testid="ghost"
					data-returning={String(drag.ghost.returning)}
					data-offset={`${drag.ghost.dx},${drag.ghost.dy}`}
				/>
			)}
			<output data-testid="drop">{drag.dropCell === null ? "" : String(drag.dropCell)}</output>
			<button type="button" data-cell={b2} aria-label="b2" />
			<button type="button" data-cell={cellFromName("a1")} aria-label="a1" />
		</>
	);
}

let stubs: PointerStubs;
let onPlace: ReturnType<typeof vi.fn<(cell: Cell) => void>>;

beforeEach(() => {
	stubs = installPointerStubs();
	onPlace = vi.fn<(cell: Cell) => void>();
});
afterEach(cleanup);

function hand(): HTMLElement {
	return screen.getByTestId("hand");
}
function ghost(): HTMLElement | null {
	return screen.queryByTestId("ghost");
}
function drop(): string {
	return screen.getByTestId("drop").textContent;
}

describe("useDragToPlace", () => {
	it("places the piece on the empty cell it is dropped on", () => {
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		expect(hand().className).toBe("draggable");

		pointer(hand(), "pointerdown", {x: 20, y: 20});
		expect(stubs.setPointerCapture).toHaveBeenCalledWith(7);
		expect(ghost()).toBeNull();

		stubs.hitTest(screen.getByRole("button", {name: "b2"}));
		pointer(hand(), "pointermove", {x: 60, y: 90});
		expect(ghost()?.dataset["offset"]).toBe("40,70");
		expect(ghost()?.dataset["returning"]).toBe("false");
		expect(drop()).toBe(String(b2));

		pointer(hand(), "pointerup", {x: 60, y: 90});
		expect(onPlace).toHaveBeenCalledExactlyOnceWith(b2);
		expect(ghost()).toBeNull();
		expect(drop()).toBe("");
	});

	it("cancels over an occupied cell and floats the ghost back", async () => {
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		pointer(hand(), "pointerdown", {x: 20, y: 20});
		stubs.hitTest(screen.getByRole("button", {name: "a1"}));
		pointer(hand(), "pointermove", {x: 60, y: 90});
		expect(drop()).toBe("");
		expect(ghost()).not.toBeNull();

		pointer(hand(), "pointerup", {x: 60, y: 90});
		expect(onPlace).not.toHaveBeenCalled();
		expect(ghost()?.dataset["returning"]).toBe("true");
		expect(ghost()?.dataset["offset"]).toBe("0,0");
		await waitFor(() => {
			expect(ghost()).toBeNull();
		});
	});

	it("drops the ghost at once when the viewer prefers reduced motion", () => {
		stubs.setReducedMotion(true);
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		pointer(hand(), "pointerdown", {x: 20, y: 20});
		stubs.hitTest(document.body);
		pointer(hand(), "pointermove", {x: 60, y: 90});
		pointer(hand(), "pointerup", {x: 60, y: 90});
		expect(ghost()).toBeNull();
		expect(onPlace).not.toHaveBeenCalled();
	});

	it("leaves a press that moves less than the threshold to the tap flow", () => {
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		stubs.hitTest(screen.getByRole("button", {name: "b2"}));
		expect(pointer(hand(), "pointerdown", {x: 20, y: 20})).toBe(true);
		pointer(hand(), "pointermove", {x: 23, y: 24});
		expect(ghost()).toBeNull();
		expect(drop()).toBe("");
		expect(pointer(hand(), "pointerup", {x: 23, y: 24})).toBe(true);
		expect(onPlace).not.toHaveBeenCalled();
		expect(ghost()).toBeNull();
	});

	it("resets on pointercancel", () => {
		stubs.setReducedMotion(true);
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		pointer(hand(), "pointerdown", {x: 20, y: 20});
		stubs.hitTest(screen.getByRole("button", {name: "b2"}));
		pointer(hand(), "pointermove", {x: 60, y: 90});
		expect(drop()).toBe(String(b2));

		pointer(hand(), "pointercancel", {x: 60, y: 90});
		expect(ghost()).toBeNull();
		expect(drop()).toBe("");
		// The pointer is gone, so a stray up afterwards is nothing.
		pointer(hand(), "pointerup", {x: 60, y: 90});
		expect(onPlace).not.toHaveBeenCalled();
	});

	it("does not start when there is nowhere to drop", () => {
		render(<Harness legalCells={new Set()} onPlace={onPlace} />);
		expect(hand().className).toBe("");
		pointer(hand(), "pointerdown", {x: 20, y: 20});
		pointer(hand(), "pointermove", {x: 60, y: 90});
		expect(stubs.setPointerCapture).not.toHaveBeenCalled();
		expect(ghost()).toBeNull();
	});

	it("ignores a secondary button and a second finger", () => {
		render(<Harness legalCells={legal} onPlace={onPlace} />);
		pointer(hand(), "pointerdown", {x: 20, y: 20}, {button: 2, buttons: 2});
		pointer(hand(), "pointerdown", {x: 20, y: 20}, {pointerId: 8, isPrimary: false});
		pointer(hand(), "pointermove", {x: 60, y: 90});
		expect(stubs.setPointerCapture).not.toHaveBeenCalled();
		expect(ghost()).toBeNull();
	});
});
