/**
 * ⚙️ The choices made on the setup screen: the five the play route reads from the URL, plus the two names a
 * two-person game uses. The last setup is remembered per browser and preselected on the next visit.
 */

import {z} from "zod";
import type {GameSetup} from "../game/setup.js";
import {
	annotationsSchema,
	difficultySchema,
	firstSchema,
	NAME_MAX_LENGTH,
	opponentSchema,
	type PlaySearch,
	rulesSchema,
} from "../routes/-play-search.js";
import type {Store} from "./storage.js";

export {NAME_MAX_LENGTH};

const setupSchema = z.object({
	opponent: opponentSchema.default("bot"),
	rules: rulesSchema.default("squares"),
	first: firstSchema.default("you"),
	difficulty: difficultySchema.default("impossible"),
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

function trimmedName(name: string): string | undefined {
	const trimmed = name.trim();
	return trimmed === "" ? undefined : trimmed;
}

/** The part of the setup that travels in the /play URL: the names only matter when two people play. */
export function toPlaySearch({opponent, rules, first, difficulty, annotations, names}: Setup): PlaySearch {
	const search: PlaySearch = {opponent, rules, first, difficulty, annotations};
	if (opponent !== "human") {
		return search;
	}
	const [name1, name2] = [trimmedName(names[0]), trimmedName(names[1])];
	return {
		...search,
		...(name1 === undefined ? {} : {name1}),
		...(name2 === undefined ? {} : {name2}),
	};
}

const DEFAULT_NAMES: GameSetup["names"] = ["Player 1", "Player 2"];

/** The game a /play URL starts: a pure function of the search, so reloading it starts the same game. */
export function toGameSetup({opponent, rules, first, difficulty, annotations, name1, name2}: PlaySearch): GameSetup {
	return {
		opponent,
		rules,
		first,
		difficulty,
		hints: annotations,
		// A blank name1/name2 (e.g. a hand-edited "?name1=" URL) falls back to the default the same way an
		// absent one does.
		names: [trimmedName(name1 ?? "") ?? DEFAULT_NAMES[0], trimmedName(name2 ?? "") ?? DEFAULT_NAMES[1]],
	};
}
