import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

function publicPath(name: string): string {
	return fileURLToPath(new URL(`../../public/${name}`, import.meta.url));
}

/** A `/name` URL as the page or the manifest refers to it, resolved into web/public. */
function served(href: string): string {
	expect(href).toMatch(/^\/[^/]/);
	return publicPath(href.slice(1));
}

interface Icon {
	readonly src: string;
	readonly sizes: string;
	readonly type: string;
}

interface Manifest {
	readonly name: string;
	readonly short_name: string;
	readonly start_url: string;
	readonly display: string;
	readonly background_color: string;
	readonly theme_color: string;
	readonly icons: readonly Icon[];
}

const manifest: Manifest = JSON.parse(readFileSync(publicPath("manifest.webmanifest"), "utf8"));
const html = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");
const tokens = readFileSync(fileURLToPath(new URL("../../src/styles/tokens.css", import.meta.url)), "utf8");

/** The value of a token in the first block that sets it: the light palette on :root. */
function lightToken(name: string): string {
	const match = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
	expect(match).not.toBeNull();
	return match![1]!.toLowerCase();
}

/** The dark redefinition of a token, from the prefers-color-scheme block. */
function darkToken(name: string): string {
	const dark = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
	const match = dark.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
	expect(match).not.toBeNull();
	return match![1]!.toLowerCase();
}

/** Width and height from a PNG's IHDR chunk, which always follows the 8-byte signature. */
function pngSize(path: string): {width: number; height: number} {
	const bytes = readFileSync(path);
	expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	expect(bytes.subarray(12, 16).toString("latin1")).toBe("IHDR");
	return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function metaContent(name: string, media?: string): string | undefined {
	const tags = [...html.matchAll(/<meta\s[^>]*>/g)].map(([tag]) => tag);
	const tag = tags.find(
		(candidate) =>
			candidate.includes(`name="${name}"`) && (media === undefined || candidate.includes(`media="${media}"`)),
	);
	return tag?.match(/content="([^"]*)"/)?.[1];
}

function linkHref(rel: string): string | undefined {
	const tags = [...html.matchAll(/<link\s[^>]*>/g)].map(([tag]) => tag);
	return tags.find((candidate) => candidate.includes(`rel="${rel}"`))?.match(/href="([^"]*)"/)?.[1];
}

describe("web manifest", () => {
	it("names the app and opens standalone at the root", () => {
		expect(manifest.name).toBe("QuartoBot");
		expect(manifest.short_name).toBe("Quarto");
		expect(manifest.start_url).toBe("/");
		expect(manifest.display).toBe("standalone");
	});

	it("takes its colours from the light ground token", () => {
		expect(manifest.background_color.toLowerCase()).toBe(lightToken("ground"));
		expect(manifest.theme_color.toLowerCase()).toBe(lightToken("ground"));
	});

	it("carries the 192 and 512 icons installability needs, and each file matches its declared size", () => {
		const sizes = manifest.icons.map((icon) => icon.sizes);
		expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
		for (const icon of manifest.icons) {
			const path = served(icon.src);
			expect(existsSync(path)).toBe(true);
			expect(icon.type).toBe("image/png");
			const [width, height] = icon.sizes.split("x").map(Number);
			expect(pngSize(path)).toEqual({width, height});
		}
	});
});

describe("index.html", () => {
	it("links the manifest", () => {
		expect(linkHref("manifest")).toBe("/manifest.webmanifest");
	});

	it("links a 180px apple-touch-icon that exists", () => {
		const href = linkHref("apple-touch-icon");
		expect(href).toBeDefined();
		expect(pngSize(served(href!))).toEqual({width: 180, height: 180});
	});

	it("links the SVG favicon that exists", () => {
		const href = linkHref("icon");
		expect(href).toBe("/favicon.svg");
		expect(existsSync(served(href!))).toBe(true);
	});

	it("sets a theme colour per scheme from the ground tokens", () => {
		expect(metaContent("theme-color", "(prefers-color-scheme: light)")?.toLowerCase()).toBe(lightToken("ground"));
		expect(metaContent("theme-color", "(prefers-color-scheme: dark)")?.toLowerCase()).toBe(darkToken("ground"));
	});

	it("opts into home-screen installation on iOS and Android", () => {
		expect(metaContent("apple-mobile-web-app-capable")).toBe("yes");
		expect(metaContent("mobile-web-app-capable")).toBe("yes");
		expect(metaContent("apple-mobile-web-app-title")).toBe("Quarto");
	});

	it("lets the page extend under the notch", () => {
		expect(metaContent("viewport")).toContain("viewport-fit=cover");
	});
});

describe("favicon.svg", () => {
	const svg = readFileSync(publicPath("favicon.svg"), "utf8");

	it("is a 32x32 drawing", () => {
		expect(svg).toMatch(/viewBox="0 0 32 32"/);
	});

	it("uses the felt, rail and maple from the palette as literal colours, since an icon has no stylesheet", () => {
		expect(svg).not.toMatch(/var\(--/);
		for (const token of ["felt", "rail", "maple", "maple-edge"]) {
			expect(svg.toLowerCase()).toContain(lightToken(token));
		}
	});
});
