import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

function read(relative: string): string {
	return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");
}

/**
 * The fonts ship with the build instead of coming from Google: a viewer behind a filter that blocks
 * fonts.googleapis.com otherwise gets the fallback stack, and the display face's fallback used to be Arial Narrow.
 */
describe("self-hosted fonts", () => {
	it("does not load anything from Google Fonts", () => {
		const html = read("index.html");
		expect(html).not.toContain("fonts.googleapis.com");
		expect(html).not.toContain("fonts.gstatic.com");
	});

	it("bundles the three families through the fontsource packages", () => {
		const css = read("src/styles/index.css");
		expect(css).toContain("@fontsource-variable/bricolage-grotesque");
		expect(css).toContain("@fontsource/ibm-plex-sans/400.css");
		expect(css).toContain("@fontsource/ibm-plex-sans/500.css");
		expect(css).toContain("@fontsource/ibm-plex-sans/600.css");
		expect(css).toContain("@fontsource/ibm-plex-mono/400.css");
		expect(css).toContain("@fontsource/ibm-plex-mono/500.css");
	});

	it("names the variable display face and falls back to a normal-width face, not Arial Narrow", () => {
		const tokens = read("src/styles/tokens.css");
		expect(tokens).toMatch(/--display: "Bricolage Grotesque Variable"/);
		expect(tokens).not.toContain("Arial Narrow");
	});
});
