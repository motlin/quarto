// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {ALL_PIECES, type Piece} from "../../src/game/pieces.js";
import {Tray} from "../../src/ui/Tray.js";

describe("Tray", () => {
	it("calls onSelect with the piece when a legal piece is tapped", () => {
		const onSelect = vi.fn<(piece: Piece) => void>();
		render(
			<Tray
				remaining={ALL_PIECES}
				legalPieces={new Set(ALL_PIECES)}
				onSelect={onSelect}
				pendingPiece={null}
				hints={new Map()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", {name: "dark square tall hollow piece"}));
		expect(onSelect).toHaveBeenCalledWith(15);
	});

	it("keeps a slot for every piece, with taken ones out of reach but still taking up room", () => {
		const onSelect = vi.fn<(piece: Piece) => void>();
		const remaining = ALL_PIECES.filter((piece) => piece !== 3 && piece !== 9);
		const {container} = render(
			<Tray
				remaining={remaining}
				legalPieces={new Set(remaining)}
				onSelect={onSelect}
				pendingPiece={null}
				hints={new Map()}
			/>,
		);
		const slots = container.querySelectorAll<HTMLButtonElement>("button.slot");
		expect(slots).toHaveLength(16);
		const taken = slots[3]!;
		expect(taken.className).toContain("taken");
		expect(taken.disabled).toBe(true);
		expect(taken.getAttribute("aria-hidden")).toBe("true");
		expect(slots[9]!.className).toContain("taken");
		expect(slots[4]!.className).not.toContain("taken");
		fireEvent.click(taken);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("disables remaining pieces while it is not the player's turn to choose", () => {
		const onSelect = vi.fn<(piece: Piece) => void>();
		render(
			<Tray
				remaining={ALL_PIECES}
				legalPieces={new Set()}
				onSelect={onSelect}
				pendingPiece={null}
				hints={new Map()}
			/>,
		);
		const slot = screen.getByRole("button", {name: "light round short solid piece"});
		expect((slot as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(slot);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("labels legal pieces with their move value", () => {
		render(
			<Tray
				remaining={ALL_PIECES}
				legalPieces={new Set(ALL_PIECES)}
				onSelect={vi.fn<(piece: Piece) => void>()}
				pendingPiece={null}
				hints={new Map<Piece, string>([[2, "L1"]])}
			/>,
		);
		const hint = screen.getByRole("button", {name: "light square short solid piece"}).querySelector(".hint");
		expect(hint?.textContent).toBe("L1");
		expect(hint?.className).toContain("loss");
	});
});
