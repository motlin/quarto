// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";
import {ALL_PIECES, isSquare, isTall} from "../../src/game/pieces.js";
import {PieceGlyph} from "../../src/ui/PieceGlyph.js";

/** The prototype viewBox is 0 0 40 60 with the base at y = 52 and the groove 18 above it. */
const BASE_Y = 52;
const GROOVE_Y = 34;

/** The turned groove: a `<line>` on a square piece, an arc `<path>` on a round one. */
function groove(container: HTMLElement): SVGElement {
	const element = container.querySelector<SVGElement>("[data-part='groove']");
	expect(element).not.toBeNull();
	return element!;
}

function grooveHeight(element: SVGElement): number {
	if (element.tagName === "line") {
		return Number(element.getAttribute("y1"));
	}
	const start = /^M\s*[\d.]+\s+([\d.]+)/.exec(element.getAttribute("d") ?? "");
	expect(start).not.toBeNull();
	return Number(start![1]);
}

describe("PieceGlyph", () => {
	it("is decoration: the button around it carries the name", () => {
		const {container} = render(<PieceGlyph piece={0} />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 40 60");
		expect(svg?.classList.contains("piece")).toBe(true);
	});

	/**
	 * Every real piece is turned with one groove at the same height above the base, so the groove sits just below
	 * the midpoint of a tall piece and well above the midpoint of a short one.
	 */
	it("cuts the groove at the same height above the base on all sixteen pieces", () => {
		for (const piece of ALL_PIECES) {
			const {container, unmount} = render(<PieceGlyph piece={piece} />);
			const element = groove(container);
			expect(element.tagName).toBe(isSquare(piece) ? "line" : "path");
			expect(grooveHeight(element)).toBe(GROOVE_Y);
			unmount();
		}
	});

	it("sets the groove just below the midpoint of a tall piece and well above it on a short one", () => {
		for (const piece of ALL_PIECES) {
			const {container, unmount} = render(<PieceGlyph piece={piece} />);
			const top = container.querySelector("[data-part='top']");
			const topY = Number(top?.getAttribute(isSquare(piece) ? "y" : "cy"));
			expect(Number.isNaN(topY)).toBe(false);
			const midpoint = (topY + BASE_Y) / 2;
			if (isTall(piece)) {
				expect(GROOVE_Y).toBeGreaterThan(midpoint);
				expect(GROOVE_Y - midpoint).toBeLessThan(5);
			} else {
				expect(GROOVE_Y).toBeLessThan(midpoint);
			}
			unmount();
		}
	});

	it("colours dark pieces walnut and light pieces maple", () => {
		const {container: light} = render(<PieceGlyph piece={0} />);
		const {container: dark} = render(<PieceGlyph piece={1} />);
		expect(light.innerHTML).toContain("var(--maple)");
		expect(light.innerHTML).not.toContain("var(--walnut)");
		expect(dark.innerHTML).toContain("var(--walnut)");
		expect(dark.innerHTML).not.toContain("var(--maple)");
	});

	it("opens a hole in the top of hollow pieces only", () => {
		const {container: solid} = render(<PieceGlyph piece={0} />);
		const {container: hollow} = render(<PieceGlyph piece={8} />);
		expect(solid.querySelector("[data-part='hole']")).toBeNull();
		expect(hollow.querySelector("[data-part='hole']")).not.toBeNull();
	});
});
