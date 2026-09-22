import {z} from "zod";

export const opponentSchema = z.enum(["bot", "human"]);
export const rulesSchema = z.enum(["lines", "squares"]);
export const firstSchema = z.enum(["you", "bot"]);
export const difficultySchema = z.enum(["medium", "impossible"]);
export const annotationsSchema = z.enum(["off", "outcome", "values"]);
export const undoSchema = z.enum(["allowed", "off"]);

export const NAME_MAX_LENGTH = 16;

const nameSchema = z.string().max(NAME_MAX_LENGTH).optional();

// The whole game configuration lives in the URL so reload and back keep it.
export const playSearchSchema = z.object({
	opponent: opponentSchema.default("bot"),
	rules: rulesSchema.default("squares"),
	first: firstSchema.default("you"),
	difficulty: difficultySchema.default("impossible"),
	annotations: annotationsSchema.default("off"),
	undo: undoSchema.default("allowed"),
	// The two seats of a two-person game; a missing name falls back to "Player 1" / "Player 2".
	name1: nameSchema,
	name2: nameSchema,
});

export type PlaySearch = z.infer<typeof playSearchSchema>;

/**
 * A field of the setup URL: absent when missing, and `undefined` rather than fatal when it makes no sense. The key
 * has to come out as an explicit `undefined`, not vanish: the router lays the validated search over the raw one, so
 * a key the validator merely omits would keep its raw value.
 */
function lenient<T extends z.ZodType>(schema: T) {
	return schema.optional().catch(undefined);
}

// The setup screen accepts the same params as /play, all optional, so a shared setup URL preselects the form.
// Unlike /play, a bad value is ignored instead of failing the page: a typo in a shared link still lands somewhere.
export const setupSearchSchema = z.object({
	opponent: lenient(opponentSchema),
	rules: lenient(rulesSchema),
	first: lenient(firstSchema),
	difficulty: lenient(difficultySchema),
	annotations: lenient(annotationsSchema),
	undo: lenient(undoSchema),
	name1: lenient(nameSchema),
	name2: lenient(nameSchema),
});

export type SetupSearch = z.infer<typeof setupSearchSchema>;
