import {z} from "zod";

// The whole game configuration lives in the URL so reload and back keep it.
export const playSearchSchema = z.object({
	opponent: z.enum(["bot", "human"]).default("bot"),
	rules: z.enum(["lines", "squares"]).default("squares"),
	first: z.enum(["you", "bot"]).default("you"),
	annotations: z.enum(["off", "outcome", "values"]).default("off"),
});
