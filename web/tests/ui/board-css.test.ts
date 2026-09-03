import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

function stylesheet(name: string): string {
	return readFileSync(fileURLToPath(new URL(`../../src/styles/${name}`, import.meta.url)), "utf8");
}

const css = stylesheet("board.css");
const pieces = stylesheet("pieces.css");

/** The declarations inside the first rule whose selector list matches, as written. */
function ruleBody(selector: string, source: string = css): string {
	const at = source.indexOf(`${selector} {`);
	expect(at).toBeGreaterThan(-1);
	return source.slice(at + selector.length + 2, source.indexOf("}", at));
}

describe("board grid", () => {
	/**
	 * The prototype let the rows size themselves and a piece SVG at `height: 100%` inside a `1fr` row grew the
	 * row it sat in, so the board came out with unequal rows. Bounding the rows keeps every cell square.
	 */
	it("bounds the rows so a piece cannot stretch its row", () => {
		const body = ruleBody(".board");
		expect(body).toMatch(/grid-template-rows:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
		expect(body).toMatch(/aspect-ratio:\s*1\b/);
	});

	it("takes the piece out of the cell's flow", () => {
		expect(ruleBody(".cell .piece")).toMatch(/position:\s*absolute/);
	});

	it("keeps double-tap zoom off the board", () => {
		expect(ruleBody(".board")).toMatch(/touch-action:\s*manipulation/);
	});
});

/**
 * A hover rule that moves its own cell oscillates: the cell shifts out from under the pointer, loses the hover,
 * shifts back under it and takes the hover again, forever. The hover mark has to leave the cell's box alone.
 */
describe("hover", () => {
	it("marks a legal cell without moving it, and marks a drop target the same way", () => {
		const body = ruleBody(".cell.legal:hover,\n.cell.legal.drop");
		expect(body).not.toMatch(/\btransform\b/);
		expect(body).toMatch(/\bbackground\b/);
	});

	it("leaves no hover on the board changing a cell's geometry", () => {
		const hovers = [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)];
		expect(hovers.length).toBeGreaterThan(0);
		for (const [, , body] of hovers) {
			expect(body).not.toMatch(/\btransform\b/);
		}
	});
});

/** A finger on the hand piece must start a drag, never a scroll, a text selection or an iOS callout menu. */
describe("dragging the hand piece", () => {
	it("claims the touch and turns off selection and callouts", () => {
		const body = ruleBody(".hand-piece.draggable", pieces);
		expect(body).toMatch(/touch-action:\s*none/);
		expect(body).toMatch(/user-select:\s*none/);
		expect(body).toMatch(/-webkit-touch-callout:\s*none/);
	});

	it("keeps the ghost out of hit testing", () => {
		const body = ruleBody(".drag-ghost", pieces);
		expect(body).toMatch(/position:\s*fixed/);
		expect(body).toMatch(/pointer-events:\s*none/);
	});
});
