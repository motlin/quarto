/**
 * 🔮 Turning solver values into words.
 *
 * A value is from the mover's point of view: 0 is a draw, positive means the mover wins and negative that they
 * lose. Its magnitude encodes how soon: a child move's value `v` seen from a parent with `movesLeft` placements to
 * go ends the game after `movesLeft + 1 - |v|` more placements, which matches the upstream `evalToString`.
 */

export type Evaluation = {kind: "draw"; text: string} | {kind: "win" | "loss"; text: string; distance: number};

export function distanceOf(value: number, movesLeft: number): number {
	return movesLeft + 1 - Math.abs(value);
}

/** The outcome as the human reads it: "win" when they win, "loss" when the bot does. */
export function describeValue(value: number, movesLeft: number, moverIsHuman: boolean): Evaluation {
	if (value === 0) {
		return {kind: "draw", text: "Draw with perfect play"};
	}
	const distance = distanceOf(value, movesLeft);
	const humanWins = value > 0 === moverIsHuman;
	if (humanWins) {
		return {kind: "win", text: `You win in ${distance}`, distance};
	}
	return {kind: "loss", text: `Bot wins in ${distance}`, distance};
}

/** The mover's outcome in a couple of characters for a move label: "=", "W3" or "L2". */
export function shortValue(value: number, movesLeft: number): string {
	if (value === 0) {
		return "=";
	}
	return `${value > 0 ? "W" : "L"}${distanceOf(value, movesLeft)}`;
}
