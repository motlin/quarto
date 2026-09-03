import {describe, it, expect} from "vitest";
import type {GameSetup} from "../../src/game/setup.js";
import {isHumanTurn, playerToMove} from "../../src/game/turns.js";

const plies: readonly [number, boolean][] = [
	[0, false],
	[0, true],
	[1, false],
	[1, true],
	[2, false],
	[2, true],
];

const setup: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "you",
	difficulty: "impossible",
	hints: "off",
	names: ["Player 1", "Player 2"],
};

describe("playerToMove", () => {
	it("lets player 0 select first and alternates every ply", () => {
		expect(plies.map(([done, toPlace]) => playerToMove(done, toPlace))).toStrictEqual([0, 1, 1, 0, 0, 1]);
	});

	it("gives the sixteenth placement to player 0", () => {
		expect(playerToMove(15, false)).toBe(1);
		expect(playerToMove(15, true)).toBe(0);
	});
});

describe("isHumanTurn", () => {
	it("starts with the human when the human goes first", () => {
		expect(plies.map(([done, toPlace]) => isHumanTurn(setup, done, toPlace))).toStrictEqual([
			true,
			false,
			false,
			true,
			true,
			false,
		]);
	});

	it("starts with the bot when the bot goes first", () => {
		expect(plies.map(([done, toPlace]) => isHumanTurn({...setup, first: "bot"}, done, toPlace))).toStrictEqual([
			false,
			true,
			true,
			false,
			false,
			true,
		]);
	});

	it("is always a human's turn between two people", () => {
		const twoPeople: GameSetup = {...setup, opponent: "human", first: "bot"};
		expect(plies.map(([done, toPlace]) => isHumanTurn(twoPeople, done, toPlace))).toStrictEqual([
			true,
			true,
			true,
			true,
			true,
			true,
		]);
	});
});
