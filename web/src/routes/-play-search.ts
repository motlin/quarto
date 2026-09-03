import {z} from "zod";

export const opponentSchema = z.enum(["bot", "human"]);
export const rulesSchema = z.enum(["lines", "squares"]);
export const firstSchema = z.enum(["you", "bot"]);
export const annotationsSchema = z.enum(["off", "outcome", "values"]);

// The whole game configuration lives in the URL so reload and back keep it.
export const playSearchSchema = z.object({
	opponent: opponentSchema.default("bot"),
	rules: rulesSchema.default("squares"),
	first: firstSchema.default("you"),
	annotations: annotationsSchema.default("off"),
});

export type PlaySearch = z.infer<typeof playSearchSchema>;
