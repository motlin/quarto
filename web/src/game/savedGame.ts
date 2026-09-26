/**
 * 💾 The game in progress, kept for the life of the browser tab so leaving the play screen (the help page, a reload)
 * does not lose it. Only the committed moves are kept; everything else is rebuilt by replaying them.
 *
 * A save belongs to one game: the setup it was played under, minus annotations, which can change mid-game. A save
 * from any other setup, or one that no longer replays cleanly, is ignored.
 */

import {z} from "zod";
import type {Store} from "../setup/storage.js";
import {asCell, isCell} from "./cells.js";
import {asPiece, isPiece} from "./pieces.js";
import type {GameSetup} from "./setup.js";
import {applyPlace, applySelect, type Move, newGame} from "./state.js";

export const SAVED_GAME_KEY = "quarto.game";

const savedSchema = z.object({
	game: z.string(),
	moves: z.array(
		z.discriminatedUnion("kind", [
			z.object({kind: z.literal("select"), piece: z.number().int()}),
			z.object({kind: z.literal("place"), cell: z.number().int()}),
		]),
	),
});

/** What makes two setups the same game: everything but the annotation level. */
function gameOf({hints: _hints, ...game}: GameSetup): string {
	return JSON.stringify(game);
}

export function saveGame(store: Store, setup: GameSetup, log: readonly Move[]): void {
	const moves = log.map((move) =>
		move.kind === "select" ? {kind: move.kind, piece: move.piece} : {kind: move.kind, cell: move.cell},
	);
	store.set(SAVED_GAME_KEY, JSON.stringify({game: gameOf(setup), moves}));
}

/** The saved moves of this game, replayed so every one is known to be legal; empty when there is nothing usable. */
export function loadGame(store: Store, setup: GameSetup): readonly Move[] {
	const stored = store.get(SAVED_GAME_KEY);
	if (stored === null) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		return [];
	}
	const result = savedSchema.safeParse(parsed);
	if (!result.success || result.data.game !== gameOf(setup)) {
		return [];
	}
	let state = newGame(setup);
	for (const move of result.data.moves) {
		const legal = move.kind === "select" ? isPiece(move.piece) : isCell(move.cell);
		// The transitions hand back the same state for an illegal move, which makes the whole save unusable.
		const next = legal
			? move.kind === "select"
				? applySelect(state, asPiece(move.piece))
				: applyPlace(state, asCell(move.cell))
			: state;
		if (next === state) {
			return [];
		}
		state = next;
	}
	return state.log;
}
