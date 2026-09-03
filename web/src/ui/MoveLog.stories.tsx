import type {Meta, StoryObj} from "@storybook/react-vite";
import {cellFromName} from "../game/cells.js";
import type {Piece} from "../game/pieces.js";
import type {Move} from "../game/state.js";
import {playerToMove} from "../game/turns.js";
import {MoveLog} from "./MoveLog.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

/** The log of a game given as the piece handed over and where it went, alternating players from player 0. */
function game(plies: readonly [Piece, string][]): Move[] {
	return plies.flatMap(([piece, cell], index): Move[] => {
		const giver = playerToMove(index, false);
		const placer = playerToMove(index, true);
		return [
			{kind: "select", player: giver, piece},
			{kind: "place", player: placer, piece, cell: cellFromName(cell)},
		];
	});
}

const sevenMoves = game([
	[5, "a1"],
	[10, "d1"],
	[3, "b2"],
	[12, "c2"],
	[7, "b3"],
	[8, "c3"],
	[1, "d4"],
]);

const meta: Meta<typeof MoveLog> = {
	title: "Play/MoveLog",
	component: MoveLog,
	decorators: [
		(Story) => (
			<div style={{maxWidth: 360}}>
				<Story />
			</div>
		),
	],
	args: {playerName: (player) => (player === 0 ? "you" : "bot")},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {args: {moves: []}};

export const SevenPlacements: Story = {args: {moves: sevenMoves}};

/** Two people on one device, by name. */
export const TwoPlayers: Story = {
	args: {moves: sevenMoves, playerName: (player) => (player === 0 ? "Alice" : "Bob")},
};

export const SevenPlacementsDark: Story = {
	...SevenPlacements,
	decorators: [withTheme("dark")],
};
