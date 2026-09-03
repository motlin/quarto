/**
 * ⚙️ The choices made on the setup screen: the four the play route reads from the URL, plus the two names a
 * two-person game uses. The last setup is remembered per browser and preselected on the next visit.
 */

import {z} from "zod";
import {annotationsSchema, firstSchema, opponentSchema, type PlaySearch, rulesSchema} from "../routes/-play-search.js";
import type {Store} from "./storage.js";

export const NAME_MAX_LENGTH = 16;

const setupSchema = z.object({
	opponent: opponentSchema.default("bot"),
	rules: rulesSchema.default("squares"),
	first: firstSchema.default("you"),
	// A bot game usually wants to see the outcome; the URL default stays "off" so a bare /play plays blind.
	annotations: annotationsSchema.default("outcome"),
	// Blank falls back to "Player 1" / "Player 2" when the game starts.
	names: z.tuple([z.string().max(NAME_MAX_LENGTH), z.string().max(NAME_MAX_LENGTH)]).default(["", ""]),
});

export type Setup = z.infer<typeof setupSchema>;

export const DEFAULT_SETUP: Setup = setupSchema.parse({});

export const SETUP_KEY = "quarto.setup";

/** The remembered setup, or the defaults when nothing usable is stored. */
export function loadSetup(store: Store): Setup {
	const stored = store.get(SETUP_KEY);
	if (stored === null) {
		return DEFAULT_SETUP;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		return DEFAULT_SETUP;
	}
	const result = setupSchema.safeParse(parsed);
	return result.success ? result.data : DEFAULT_SETUP;
}

export function saveSetup(store: Store, setup: Setup): void {
	store.set(SETUP_KEY, JSON.stringify(setup));
}

/** The part of the setup that travels in the /play URL. */
export function toPlaySearch({opponent, rules, first, annotations}: Setup): PlaySearch {
	return {opponent, rules, first, annotations};
}
