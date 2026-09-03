import {describe, expect, it} from "vitest";
import {mulberry32, pickOne} from "../../src/game/random.js";

describe("mulberry32", () => {
	it("gives the same sequence for the same seed and a different one for another", () => {
		const first = mulberry32(42);
		const second = mulberry32(42);
		const sequence = Array.from({length: 5}, () => first());
		expect(Array.from({length: 5}, () => second())).toStrictEqual(sequence);
		expect(Array.from({length: 5}, () => mulberry32(43)())).not.toStrictEqual(sequence);
	});

	it("stays inside [0, 1)", () => {
		const random = mulberry32(0xffff_ffff);
		for (let draw = 0; draw < 1000; draw++) {
			const value = random();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it("rejects a seed that is not an unsigned 32-bit integer", () => {
		expect(() => mulberry32(-1)).toThrow("Seed must be an unsigned 32-bit integer: -1");
		expect(() => mulberry32(1.5)).toThrow("Seed must be an unsigned 32-bit integer: 1.5");
		expect(() => mulberry32(2 ** 32)).toThrow("Seed must be an unsigned 32-bit integer: 4294967296");
	});
});

describe("pickOne", () => {
	it("maps the unit interval onto the items in order", () => {
		const items = ["a", "b", "c"];
		expect(pickOne(items, () => 0)).toBe("a");
		expect(pickOne(items, () => 0.34)).toBe("b");
		expect(pickOne(items, () => 0.999)).toBe("c");
	});

	it("refuses an empty list", () => {
		expect(() => pickOne([], () => 0)).toThrow("Nothing to pick from");
	});
});
