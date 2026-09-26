import {describe, expect, it} from "vitest";
import {cellFromName} from "../../src/game/cells.js";
import {loadGame, SAVED_GAME_KEY, saveGame} from "../../src/game/savedGame.js";
import type {GameSetup} from "../../src/game/setup.js";
import {applyPlace, applySelect, newGame} from "../../src/game/state.js";
import {memoryStore} from "../../src/setup/storage.js";

const setup: GameSetup = {
	opponent: "human",
	rules: "lines",
	first: "you",
	difficulty: "impossible",
	hints: "off",
	undo: "allowed",
	names: ["Ada", "Grace"],
};

/** Ada hands piece 5 over, Grace puts it on b2 and hands back piece 9. */
function threePlies() {
	return applySelect(applyPlace(applySelect(newGame(setup), 5), cellFromName("b2")), 9).log;
}

describe("saved game", () => {
	it("has nothing to load in a fresh store", () => {
		expect(loadGame(memoryStore(), setup)).toStrictEqual([]);
	});

	it("round-trips the move log of the same game", () => {
		const store = memoryStore();
		const log = threePlies();
		saveGame(store, setup, log);
		expect(loadGame(store, setup)).toStrictEqual(log);
	});

	it("still restores the game after annotations change, since that is not a different game", () => {
		const store = memoryStore();
		const log = threePlies();
		saveGame(store, setup, log);
		expect(loadGame(store, {...setup, hints: "values"})).toStrictEqual(log);
	});

	it("ignores a saved game from a different setup", () => {
		const store = memoryStore();
		saveGame(store, setup, threePlies());
		expect(loadGame(store, {...setup, rules: "squares"})).toStrictEqual([]);
		expect(loadGame(store, {...setup, names: ["Ada", "Linus"]})).toStrictEqual([]);
	});

	it("ignores a saved value that is not JSON, has the wrong shape, or holds an illegal move", () => {
		expect(loadGame(memoryStore({[SAVED_GAME_KEY]: "{nope"}), setup)).toStrictEqual([]);
		expect(loadGame(memoryStore({[SAVED_GAME_KEY]: JSON.stringify({moves: 3})}), setup)).toStrictEqual([]);
		const store = memoryStore();
		saveGame(store, setup, threePlies());
		const saved = JSON.parse(store.get(SAVED_GAME_KEY) ?? "{}") as {moves: {kind: string; piece?: number}[]};
		// Selecting the piece already on the board is illegal, so the whole save is discarded.
		saved.moves.push({kind: "select", piece: 5});
		store.set(SAVED_GAME_KEY, JSON.stringify(saved));
		expect(loadGame(store, setup)).toStrictEqual([]);
	});
});
