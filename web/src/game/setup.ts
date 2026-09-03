/** ⚙️ The choices made on the setup screen, fixed for the whole game. */

import type {Rules} from "./rules.js";

export type Opponent = "bot" | "human";

export type FirstMover = "you" | "bot";

/** How strong the bot plays: the perfect solver, or one ply of lookahead with random play otherwise. */
export type Difficulty = "medium" | "impossible";

/** How much the solver reveals: nothing, the game's outcome, or the outcome plus a value on every legal move. */
export type Hints = "off" | "outcome" | "values";

export interface GameSetup {
	readonly opponent: Opponent;
	readonly rules: Rules;
	readonly first: FirstMover;
	/** Meaningless between two people. */
	readonly difficulty: Difficulty;
	readonly hints: Hints;
	/** Who sits in seat 0 and seat 1 when two people play; a bot game says "You" and "Bot" instead. */
	readonly names: readonly [string, string];
}
