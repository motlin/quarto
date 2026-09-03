import {describe, it, expect} from "vitest";
import {describeValue, distanceOf, shortValue} from "../../src/game/evaluation.js";

describe("distanceOf", () => {
	it("counts placements from the parent position", () => {
		// A child value of moves_left means the mover wins on the next placement.
		expect(distanceOf(10, 10)).toBe(1);
		expect(distanceOf(-8, 10)).toBe(3);
	});
});

describe("describeValue", () => {
	it("calls a zero a draw", () => {
		expect(describeValue(0, 12, true)).toStrictEqual({kind: "draw", text: "Draw with perfect play"});
		expect(describeValue(0, 12, false)).toStrictEqual({kind: "draw", text: "Draw with perfect play"});
	});

	it("credits a positive value to the human mover", () => {
		expect(describeValue(10, 10, true)).toStrictEqual({kind: "win", text: "You win in 1", distance: 1});
	});

	it("credits a positive value to the bot mover", () => {
		expect(describeValue(8, 10, false)).toStrictEqual({kind: "loss", text: "Bot wins in 3", distance: 3});
	});

	it("gives a negative value to the other side", () => {
		expect(describeValue(-9, 10, true)).toStrictEqual({kind: "loss", text: "Bot wins in 2", distance: 2});
		expect(describeValue(-9, 10, false)).toStrictEqual({kind: "win", text: "You win in 2", distance: 2});
	});
});

describe("shortValue", () => {
	it("abbreviates the mover's outcome", () => {
		expect(shortValue(0, 10)).toBe("=");
		expect(shortValue(8, 10)).toBe("W3");
		expect(shortValue(-9, 10)).toBe("L2");
	});
});
