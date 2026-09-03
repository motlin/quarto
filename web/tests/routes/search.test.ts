import {describe, it, expect} from "vitest";
import {playSearchSchema} from "../../src/routes/-play-search.js";

describe("playSearchSchema", () => {
	it("fills in the defaults for an empty search", () => {
		expect(playSearchSchema.parse({})).toStrictEqual({
			opponent: "bot",
			rules: "squares",
			first: "you",
			annotations: "off",
		});
	});

	it("keeps every explicit value", () => {
		expect(
			playSearchSchema.parse({
				opponent: "human",
				rules: "lines",
				first: "bot",
				annotations: "values",
			}),
		).toStrictEqual({
			opponent: "human",
			rules: "lines",
			first: "bot",
			annotations: "values",
		});
	});

	it("rejects an unknown rules variant", () => {
		expect(() => playSearchSchema.parse({rules: "diagonals"})).toThrow("Invalid option");
	});

	it("rejects an unknown opponent", () => {
		expect(() => playSearchSchema.parse({opponent: "engine"})).toThrow("Invalid option");
	});

	it("rejects an unknown first mover", () => {
		expect(() => playSearchSchema.parse({first: "them"})).toThrow("Invalid option");
	});

	it("rejects an unknown annotations level", () => {
		expect(() => playSearchSchema.parse({annotations: "on"})).toThrow("Invalid option");
	});
});
