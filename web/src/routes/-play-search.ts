import {z} from "zod";

export const opponentSchema = z.enum(["bot", "human"]);
export const rulesSchema = z.enum(["lines", "squares"]);
export const firstSchema = z.enum(["you", "bot"]);
export const difficultySchema = z.enum(["medium", "impossible"]);
export const annotationsSchema = z.enum(["off", "outcome", "values"]);

export const NAME_MAX_LENGTH = 16;

const nameSchema = z.string().max(NAME_MAX_LENGTH).optional();

// The whole game configuration lives in the URL so reload and back keep it.
export const playSearchSchema = z.object({
	opponent: opponentSchema.default("bot"),
	rules: rulesSchema.default("squares"),
	first: firstSchema.default("you"),
	difficulty: difficultySchema.default("impossible"),
	annotations: annotationsSchema.default("off"),
	// The two seats of a two-person game; a missing name falls back to "Player 1" / "Player 2".
	name1: nameSchema,
	name2: nameSchema,
});

export type PlaySearch = z.infer<typeof playSearchSchema>;
