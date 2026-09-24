/** 🔎 The three annotation levels, shared by the setup screen and the play screen so both controls offer the same. */

import type {Hints} from "../game/setup.js";
import type {SegmentOption} from "./Segment.js";

export const ANNOTATIONS: readonly SegmentOption<Hints>[] = [
	{value: "off", label: "Off", help: "No solver readout. The usual choice for two people."},
	{value: "outcome", label: "Outcome", help: "Shows who wins with perfect play and in how many moves."},
	{
		value: "values",
		label: "Outcome + move values",
		help: "Also labels every legal move with its exact outcome. Slower early in the game.",
	},
];
