import {describe, expect, it} from "vitest";
import {cellFromName} from "../../src/game/cells.js";
import {asPiece} from "../../src/game/pieces.js";
import {
	describeVerdict,
	gameTitle,
	outcomeView,
	playerName,
	promptFor,
	statusLine,
	winsPhrase,
} from "../../src/game/narration.js";
import type {GameSetup} from "../../src/game/setup.js";
import {applyPlace, applySelect, type GameState, newGame, type Verdict, withVerdict} from "../../src/game/state.js";

const botGame: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "you",
	difficulty: "impossible",
	hints: "outcome",
	names: ["", ""],
};
const botFirst: GameSetup = {...botGame, first: "bot"};
const twoPeople: GameSetup = {...botGame, opponent: "human", rules: "lines", names: ["Ada", "Grace"]};

/** Plays `piece` to `cell` pairs from the start, selecting then placing each. */
function play(start: GameState, moves: readonly [number, string][]): GameState {
	let state = start;
	for (const [piece, cell] of moves) {
		state = applyPlace(applySelect(state, asPiece(piece)), cellFromName(cell));
	}
	return state;
}

/** Four tall pieces along the top row; seat 0 makes the fourth placement and wins. */
const WON_IN_FOUR: readonly [number, string][] = [
	[4, "a1"],
	[5, "b1"],
	[6, "c1"],
	[7, "d1"],
];

describe("playerName", () => {
	it("calls the seats You and Bot in a bot game, whoever moves first", () => {
		expect([playerName(botGame, 0), playerName(botGame, 1)]).toStrictEqual(["You", "Bot"]);
		expect([playerName(botFirst, 0), playerName(botFirst, 1)]).toStrictEqual(["Bot", "You"]);
	});

	it("uses the given names between two people", () => {
		expect([playerName(twoPeople, 0), playerName(twoPeople, 1)]).toStrictEqual(["Ada", "Grace"]);
	});
});

describe("winsPhrase", () => {
	it("conjugates for You and names everybody else", () => {
		expect(winsPhrase(botGame, 0)).toBe("You win");
		expect(winsPhrase(botGame, 1)).toBe("Bot wins");
		expect(winsPhrase(twoPeople, 1)).toBe("Grace wins");
	});
});

describe("gameTitle", () => {
	it("puts the first mover first", () => {
		expect(gameTitle(botGame)).toBe("You vs bot · impossible");
		expect(gameTitle(botFirst)).toBe("Bot vs you · impossible");
		expect(gameTitle({...botGame, difficulty: "medium"})).toBe("You vs bot · medium");
		expect(gameTitle(twoPeople)).toBe("Ada vs Grace");
	});
});

describe("describeVerdict", () => {
	const verdict = (value: number, mover: 0 | 1): Verdict => ({
		value,
		movesLeft: 10,
		mover,
		nodes: 1,
		milliseconds: 1,
	});

	it("colours a bot game by who wins", () => {
		expect(describeVerdict(botGame, verdict(0, 0))).toStrictEqual({kind: "draw", text: "Draw with perfect play"});
		expect(describeVerdict(botGame, verdict(8, 0))).toStrictEqual({kind: "win", text: "You win in 3"});
		expect(describeVerdict(botGame, verdict(-9, 0))).toStrictEqual({kind: "loss", text: "Bot wins in 2"});
		expect(describeVerdict(botFirst, verdict(8, 0))).toStrictEqual({kind: "loss", text: "Bot wins in 3"});
	});

	it("names the winner in a neutral colour between two people", () => {
		expect(describeVerdict(twoPeople, verdict(8, 1))).toStrictEqual({kind: "decisive", text: "Grace wins in 3"});
		expect(describeVerdict(twoPeople, verdict(-9, 1))).toStrictEqual({kind: "decisive", text: "Ada wins in 2"});
		expect(describeVerdict(twoPeople, verdict(0, 1))).toStrictEqual({kind: "draw", text: "Draw with perfect play"});
	});
});

describe("promptFor", () => {
	it("asks the human to choose, naming who receives the piece", () => {
		expect(promptFor(botGame, newGame(botGame))).toStrictEqual({
			title: "Your move",
			detail: "Choose a piece for the bot.",
		});
		expect(promptFor(twoPeople, newGame(twoPeople))).toStrictEqual({
			title: "Ada",
			detail: "Choose a piece for Grace.",
		});
	});

	it("asks the placer to place the piece in hand by name", () => {
		expect(promptFor(twoPeople, applySelect(newGame(twoPeople), asPiece(9)))).toStrictEqual({
			title: "Grace",
			detail: "Place the dark round short hollow piece.",
		});
		expect(promptFor(botFirst, applySelect(newGame(botFirst), asPiece(0)))).toStrictEqual({
			title: "Your move",
			detail: "Place the light round short solid piece.",
		});
	});

	it("says the bot is thinking on its turn", () => {
		expect(promptFor(botFirst, newGame(botFirst))).toStrictEqual({title: "Bot is thinking…", detail: ""});
	});

	it("announces the winner and the draw", () => {
		expect(promptFor(botGame, play(newGame(botGame), WON_IN_FOUR))).toStrictEqual({
			title: "Quarto! You win.",
			detail: "",
		});
		expect(promptFor(botFirst, play(newGame(botFirst), WON_IN_FOUR))).toStrictEqual({
			title: "Quarto. The bot wins.",
			detail: "",
		});
		expect(promptFor(twoPeople, play(newGame(twoPeople), WON_IN_FOUR))).toStrictEqual({
			title: "Quarto! Ada wins.",
			detail: "",
		});
		expect(promptFor(botGame, {...newGame(botGame), status: "drawn"})).toStrictEqual({
			title: "Board full. Drawn game.",
			detail: "",
		});
	});
});

describe("outcomeView", () => {
	it("is nothing while the game is on", () => {
		expect(outcomeView(botGame, newGame(botGame))).toBeNull();
	});

	it("shows who won in that side's colour, or a draw", () => {
		expect(outcomeView(botGame, play(newGame(botGame), WON_IN_FOUR))).toStrictEqual({kind: "win", text: "You win"});
		expect(outcomeView(botFirst, play(newGame(botFirst), WON_IN_FOUR))).toStrictEqual({
			kind: "loss",
			text: "Bot wins",
		});
		expect(outcomeView(twoPeople, play(newGame(twoPeople), WON_IN_FOUR))).toStrictEqual({
			kind: "decisive",
			text: "Ada wins",
		});
		expect(outcomeView(botGame, {...newGame(botGame), status: "drawn"})).toStrictEqual({
			kind: "draw",
			text: "Draw",
		});
	});
});

describe("statusLine", () => {
	it("names the rules and counts the placement under way", () => {
		expect(statusLine(newGame(botGame))).toBe("lines + squares · move 1 of 16");
		expect(statusLine(applySelect(newGame(twoPeople), asPiece(3)))).toBe("lines only · move 1 of 16");
		expect(statusLine(play(newGame(botGame), [[4, "a1"]]))).toBe("lines + squares · move 2 of 16");
	});

	it("appends the last search's cost when there is a verdict", () => {
		const state = withVerdict(newGame(botGame), {
			value: 0,
			movesLeft: 16,
			mover: 0,
			nodes: 1_204_318,
			milliseconds: 215.4,
		});
		expect(statusLine(state)).toBe("lines + squares · move 1 of 16 · 1,204,318 nodes · 215 ms");
	});

	it("stays at move 16 once the board is full", () => {
		expect(statusLine({...newGame(botGame), remaining: [], status: "drawn"})).toBe(
			"lines + squares · move 16 of 16",
		);
	});
});
