import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {ALL_PIECES, type Piece} from "../game/pieces.js";
import {Tray} from "./Tray.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const played = new Set<Piece>([5, 10, 3, 12, 7, 8, 1, 14]);
const midGame = ALL_PIECES.filter((piece) => !played.has(piece));

const meta: Meta<typeof Tray> = {
	title: "Play/Tray",
	component: Tray,
	decorators: [
		(Story) => (
			<div style={{maxWidth: 360}}>
				<Story />
			</div>
		),
	],
	args: {onSelect: fn(), hints: new Map()},
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The full set, all sixteen up for choosing. */
export const Full: Story = {
	args: {remaining: ALL_PIECES, legalPieces: new Set(ALL_PIECES)},
};

/** Eight pieces gone: their slots keep their place so nothing shifts. */
export const MidGame: Story = {
	args: {remaining: midGame, legalPieces: new Set(midGame)},
};

/** Every remaining piece labelled with the value of handing it over. */
export const MidGameWithHints: Story = {
	args: {
		remaining: midGame,
		legalPieces: new Set(midGame),
		hints: new Map<Piece, string>(
			midGame.map((piece, index) => [piece, index % 3 === 0 ? "W3" : index % 3 === 1 ? "=" : "L2"]),
		),
	},
};

/** Between choices: the pieces are there but none is live. */
export const OpponentToMove: Story = {
	args: {remaining: midGame, legalPieces: new Set()},
};

export const MidGameDark: Story = {
	...MidGameWithHints,
	decorators: [withTheme("dark")],
};
