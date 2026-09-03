import {describe, expect, it} from "vitest";
import {
	DEFAULT_SETUP,
	loadSetup,
	saveSetup,
	type Setup,
	SETUP_KEY,
	toGameSetup,
	toPlaySearch,
} from "../../src/setup/setup.js";
import {memoryStore} from "../../src/setup/storage.js";

describe("setup persistence", () => {
	it("starts from the defaults when nothing is stored: a bot game with squares and outcome annotations", () => {
		expect(loadSetup(memoryStore())).toStrictEqual({
			opponent: "bot",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "outcome",
			undo: "allowed",
			names: ["", ""],
		});
		expect(DEFAULT_SETUP).toStrictEqual(loadSetup(memoryStore()));
	});

	it("round-trips a setup through the store under the quarto.setup key", () => {
		const store = memoryStore();
		const setup: Setup = {
			opponent: "human",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			annotations: "off",
			undo: "off",
			names: ["Ada", "Grace"],
		};
		saveSetup(store, setup);
		expect(store.get(SETUP_KEY)).toBe(JSON.stringify(setup));
		expect(loadSetup(store)).toStrictEqual(setup);
	});

	it("falls back to the defaults when the stored value is not JSON", () => {
		expect(loadSetup(memoryStore({[SETUP_KEY]: "{not json"}))).toStrictEqual(DEFAULT_SETUP);
	});

	it("falls back to the defaults when the stored value has the wrong shape", () => {
		const store = memoryStore({[SETUP_KEY]: JSON.stringify({rules: "diagonals", names: ["only one"]})});
		expect(loadSetup(store)).toStrictEqual(DEFAULT_SETUP);
	});

	it("fills in fields a stored setup from an older version lacks", () => {
		const store = memoryStore({[SETUP_KEY]: JSON.stringify({rules: "lines"})});
		expect(loadSetup(store)).toStrictEqual({...DEFAULT_SETUP, rules: "lines"});
	});

	it("reduces a bot game to the six search params the play route reads", () => {
		expect(toPlaySearch({...DEFAULT_SETUP, rules: "lines", names: ["Ada", "Grace"]})).toStrictEqual({
			opponent: "bot",
			rules: "lines",
			first: "you",
			difficulty: "impossible",
			annotations: "outcome",
			undo: "allowed",
		});
		expect(toPlaySearch({...DEFAULT_SETUP, difficulty: "medium"}).difficulty).toBe("medium");
		expect(toPlaySearch({...DEFAULT_SETUP, undo: "off"}).undo).toBe("off");
	});

	it("adds the trimmed names to a two-person game and leaves a blank name out", () => {
		expect(toPlaySearch({...DEFAULT_SETUP, opponent: "human", names: [" Ada ", "  "]})).toStrictEqual({
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "outcome",
			undo: "allowed",
			name1: "Ada",
		});
	});
});

describe("toGameSetup", () => {
	it("maps the search params onto the game's setup with the default names", () => {
		expect(
			toGameSetup({
				opponent: "bot",
				rules: "lines",
				first: "bot",
				difficulty: "medium",
				annotations: "values",
				undo: "off",
			}),
		).toStrictEqual({
			opponent: "bot",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			hints: "values",
			undo: "off",
			names: ["Player 1", "Player 2"],
		});
	});

	it("keeps the names given for a two-person game", () => {
		const search = {
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
			name2: "Grace",
		} as const;
		expect(toGameSetup(search).names).toStrictEqual(["Player 1", "Grace"]);
	});

	it("falls back to the default name when the URL carries a blank one", () => {
		const search = {
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
			name1: "",
			name2: "  ",
		} as const;
		expect(toGameSetup(search).names).toStrictEqual(["Player 1", "Player 2"]);
	});

	it("trims the names it is given", () => {
		const search = {
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
			name1: " Ada ",
		} as const;
		expect(toGameSetup(search).names).toStrictEqual(["Ada", "Player 2"]);
	});

	it("is a pure function of the search, so the same URL always starts the same game", () => {
		const search = {
			opponent: "human",
			rules: "squares",
			first: "you",
			difficulty: "impossible",
			annotations: "off",
			undo: "allowed",
			name1: "Ada",
		} as const;
		expect(toGameSetup(search)).toStrictEqual(toGameSetup({...search}));
	});
});

describe("memoryStore", () => {
	it("returns null for a missing key and remembers what was set", () => {
		const store = memoryStore();
		expect(store.get("missing")).toBeNull();
		store.set("key", "value");
		expect(store.get("key")).toBe("value");
	});
});
