// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {boardWith, emptyBoard} from "../../src/game/rules.js";
import {WinDiagram} from "../../src/ui/WinDiagram.js";

/** Four dark pieces along the top row, with two bystanders that share nothing with them. */
const darkRow = boardWith({a1: 1, b1: 3, c1: 5, d1: 15, c2: 6, b3: 8});

/** Four tall pieces in the middle 2x2 block. */
const tallSquare = boardWith({b2: 4, c2: 6, b3: 13, c3: 15, a1: 1, d4: 8});

describe("WinDiagram", () => {
	it("is one picture named by its caption", () => {
		render(<WinDiagram board={darkRow} rules="lines" caption="Four dark pieces in a row" />);
		const picture = screen.getByRole("img", {name: "Four dark pieces in a row"});
		expect(picture.tagName).toBe("svg");
		expect(screen.getByText("Four dark pieces in a row").tagName).toBe("FIGCAPTION");
	});

	it("draws every placed piece and rings exactly the winning cells", () => {
		const {container} = render(<WinDiagram board={darkRow} rules="lines" caption="Four dark pieces in a row" />);
		expect(container.querySelectorAll("[data-part='groove']")).toHaveLength(6);
		const ringed = [...container.querySelectorAll("[data-winning]")].map((ring) =>
			ring.getAttribute("data-winning"),
		);
		expect(ringed.sort()).toEqual(["a1", "b1", "c1", "d1"]);
	});

	it("rings a 2x2 block under the squares rules", () => {
		const {container} = render(
			<WinDiagram board={tallSquare} rules="squares" caption="Four tall pieces in a square" />,
		);
		const ringed = [...container.querySelectorAll("[data-winning]")].map((ring) =>
			ring.getAttribute("data-winning"),
		);
		expect(ringed.sort()).toEqual(["b2", "b3", "c2", "c3"]);
	});

	it("refuses a board nobody has won", () => {
		expect(() => render(<WinDiagram board={emptyBoard()} rules="lines" caption="Nothing" />)).toThrow(
			"WinDiagram needs a won board",
		);
	});

	it("refuses a board whose win only counts under the other rules", () => {
		expect(() => render(<WinDiagram board={tallSquare} rules="lines" caption="Nothing" />)).toThrow(
			"WinDiagram needs a won board",
		);
	});
});
