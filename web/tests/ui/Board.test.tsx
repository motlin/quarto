// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {type Cell, cellFromName} from "../../src/game/cells.js";
import {type Board as BoardValue, emptyBoard} from "../../src/game/rules.js";
import {Board} from "../../src/ui/Board.js";

function withPieces(placed: Record<string, number>): BoardValue {
	return emptyBoard().map((_, index) => {
		const entry = Object.entries(placed).find(([name]) => cellFromName(name) === index);
		return entry ? (entry[1] as BoardValue[number]) : null;
	});
}

const a1 = cellFromName("a1");
const b2 = cellFromName("b2");
const d4 = cellFromName("d4");

describe("Board", () => {
	it("calls onPlace with the cell when a legal cell is tapped", () => {
		const onPlace = vi.fn<(cell: Cell) => void>();
		render(
			<Board
				board={emptyBoard()}
				legalCells={new Set([a1, b2])}
				onPlace={onPlace}
				lastCell={null}
				winningCells={new Set()}
				hints={new Map()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", {name: "cell b2"}));
		expect(onPlace).toHaveBeenCalledWith(b2);
	});

	it("disables every cell that is not legal, occupied or not", () => {
		const onPlace = vi.fn<(cell: Cell) => void>();
		render(
			<Board
				board={withPieces({a1: 5})}
				legalCells={new Set([b2])}
				onPlace={onPlace}
				lastCell={a1}
				winningCells={new Set()}
				hints={new Map()}
			/>,
		);
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(16);
		expect(buttons.filter((button) => !(button as HTMLButtonElement).disabled)).toHaveLength(1);
		const occupied = screen.getByRole("button", {name: /^cell a1/});
		expect((occupied as HTMLButtonElement).disabled).toBe(true);
		expect(occupied.getAttribute("aria-label")).toBe("cell a1, dark round tall solid");
		fireEvent.click(occupied);
		fireEvent.click(screen.getByRole("button", {name: "cell d4"}));
		expect(onPlace).not.toHaveBeenCalled();
	});

	it("marks the last move and the winning line", () => {
		render(
			<Board
				board={withPieces({a1: 4, b1: 13, c1: 6, d1: 15})}
				legalCells={new Set()}
				onPlace={vi.fn<(cell: Cell) => void>()}
				lastCell={cellFromName("d1")}
				winningCells={new Set(["a1", "b1", "c1", "d1"].map(cellFromName))}
				hints={new Map()}
			/>,
		);
		expect(screen.getByRole("button", {name: /^cell d1/}).className).toContain("winning");
		expect(screen.getByRole("button", {name: /^cell d1/}).className).toContain("last");
		expect(screen.getByRole("button", {name: /^cell a2/}).className).not.toContain("winning");
	});

	it("labels legal cells with their move value", () => {
		render(
			<Board
				board={emptyBoard()}
				legalCells={new Set([a1, b2, d4])}
				onPlace={vi.fn<(cell: Cell) => void>()}
				lastCell={null}
				winningCells={new Set()}
				hints={
					new Map([
						[a1, "W3"],
						[b2, "="],
						[d4, "L2"],
					])
				}
			/>,
		);
		const hint = (name: string) => screen.getByRole("button", {name}).querySelector(".hint");
		expect(hint("cell a1")?.textContent).toBe("W3");
		expect(hint("cell a1")?.className).toContain("win");
		expect(hint("cell b2")?.className).toContain("draw");
		expect(hint("cell d4")?.className).toContain("loss");
		expect(hint("cell c3")).toBeNull();
	});
});
