import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../src/styles/board.css", import.meta.url)), "utf8");

/** The declarations inside the first rule whose selector list matches, as written. */
function ruleBody(selector: string): string {
	const at = css.indexOf(`${selector} {`);
	expect(at).toBeGreaterThan(-1);
	return css.slice(at + selector.length + 2, css.indexOf("}", at));
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
	it("marks a legal cell without moving it", () => {
		const body = ruleBody(".cell.legal:hover");
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
