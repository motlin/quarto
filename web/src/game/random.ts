/**
 * 🎲 A small seeded generator, so a game against the Medium bot replays the same way for the same seed.
 *
 * mulberry32: 32 bits of state, one multiply-xorshift round per draw, floats in [0, 1). Plenty for choosing moves.
 */

export type Random = () => number;

const TWO_TO_THE_32 = 4_294_967_296;

export function mulberry32(seed: number): Random {
	if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_TO_THE_32) {
		throw new Error(`Seed must be an unsigned 32-bit integer: ${seed}`);
	}
	let state = seed;
	return () => {
		state = (state + 0x6d2b_79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / TWO_TO_THE_32;
	};
}

/** One of `items`, each equally likely. */
export function pickOne<T>(items: readonly T[], random: Random): T {
	if (items.length === 0) {
		throw new Error("Nothing to pick from");
	}
	const index = Math.floor(random() * items.length);
	const item = items[index];
	if (item === undefined) {
		throw new Error(`Random gave index ${index} for ${items.length} items`);
	}
	return item;
}
