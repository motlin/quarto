/**
 * 🔄 Whose turn it is.
 *
 * Player 0 selects the first piece; the other player places it and selects the next. Counting placements done,
 * the select after `k` placements belongs to player `k % 2` and the place of that piece to player `(k + 1) % 2`.
 */

import type {GameSetup} from "./setup.js";

export type Player = 0 | 1;

export function playerToMove(movesDone: number, isToPlace: boolean): Player {
	const parity = (isToPlace ? movesDone + 1 : movesDone) % 2;
	return parity === 0 ? 0 : 1;
}

function botPlayer(setup: GameSetup): Player {
	return setup.first === "bot" ? 0 : 1;
}

export function isHumanTurn(setup: GameSetup, movesDone: number, isToPlace: boolean): boolean {
	if (setup.opponent === "human") {
		return true;
	}
	return playerToMove(movesDone, isToPlace) !== botPlayer(setup);
}
