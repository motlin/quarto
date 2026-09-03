import {describe, expect, it} from "vitest";
import {DEFAULT_SETUP, loadSetup, saveSetup, type Setup, SETUP_KEY, toPlaySearch} from "../../src/setup/setup.js";
import {memoryStore} from "../../src/setup/storage.js";

describe("setup persistence", () => {
	it("starts from the defaults when nothing is stored: a bot game with squares and outcome annotations", () => {
		expect(loadSetup(memoryStore())).toStrictEqual({
			opponent: "bot",
			rules: "squares",
			first: "you",
			annotations: "outcome",
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
			annotations: "off",
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

	it("reduces a setup to the four search params the play route reads", () => {
		expect(toPlaySearch({...DEFAULT_SETUP, rules: "lines", names: ["Ada", "Grace"]})).toStrictEqual({
			opponent: "bot",
			rules: "lines",
			first: "you",
			annotations: "outcome",
		});
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
