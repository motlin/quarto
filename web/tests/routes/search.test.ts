import {describe, it, expect} from "vitest";
import {playSearchSchema, setupSearchSchema} from "../../src/routes/-play-search.js";

describe("setupSearchSchema", () => {
	it("parses an empty search to no overrides at all", () => {
		expect(setupSearchSchema.parse({})).toStrictEqual({});
	});

	it("keeps every explicit value, names included", () => {
		const search = {
			opponent: "human",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			annotations: "values",
			undo: "off",
			name1: "Ada",
			name2: "Grace",
		} as const;
		expect(setupSearchSchema.parse(search)).toStrictEqual(search);
	});

	it("blanks a value it does not understand instead of failing the setup page", () => {
		// An explicit undefined, not a missing key: the router merges this over the raw search, so only an
		// explicit undefined displaces the bad raw value.
		expect(
			setupSearchSchema.parse({rules: "diagonals", difficulty: "medium", name1: "A".repeat(17)}),
		).toStrictEqual({
			rules: undefined,
			difficulty: "medium",
			name1: undefined,
		});
	});
});

describe("playSearchSchema", () => {
	it("fills in the defaults for an empty search", () => {
		expect(playSearchSchema.parse({})).toStrictEqual({
			opponent: "bot",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
		});
	});

	it("keeps every explicit value", () => {
		expect(
			playSearchSchema.parse({
				opponent: "human",
				rules: "lines",
				first: "bot",
				difficulty: "medium",
				annotations: "values",
				undo: "off",
			}),
		).toStrictEqual({
			opponent: "human",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			annotations: "values",
			undo: "off",
		});
	});

	it("carries the two names of a two-person game and drops them when absent", () => {
		expect(playSearchSchema.parse({opponent: "human", name1: "Ada", name2: "Grace"})).toStrictEqual({
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
			name1: "Ada",
			name2: "Grace",
		});
		expect(playSearchSchema.parse({})).not.toHaveProperty("name1");
	});

	it("rejects a name longer than the setup screen allows", () => {
		expect(() => playSearchSchema.parse({name1: "A".repeat(17)})).toThrow("Too big");
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

	it("rejects an unknown difficulty", () => {
		expect(() => playSearchSchema.parse({difficulty: "hard"})).toThrow("Invalid option");
	});

	it("rejects an unknown annotations level", () => {
		expect(() => playSearchSchema.parse({annotations: "on"})).toThrow("Invalid option");
	});

	it("rejects an unknown undo setting", () => {
		expect(() => playSearchSchema.parse({undo: "sometimes"})).toThrow("Invalid option");
	});
});
