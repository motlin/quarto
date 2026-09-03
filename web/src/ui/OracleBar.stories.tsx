import type {Meta, StoryObj} from "@storybook/react-vite";
import {OracleBar} from "./OracleBar.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const meta: Meta<typeof OracleBar> = {
	title: "Play/OracleBar",
	component: OracleBar,
	decorators: [
		(Story) => (
			<div className="strip" style={{maxWidth: 420, justifyContent: "flex-end"}}>
				<Story />
			</div>
		),
	],
	args: {thinking: false},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Draw: Story = {
	args: {verdict: {kind: "draw", text: "Draw with perfect play"}, nodes: 1_204_318, milliseconds: 215},
};

export const YouWin: Story = {
	args: {verdict: {kind: "win", text: "You win in 3"}, nodes: 48_211, milliseconds: 12},
};

export const BotWins: Story = {
	args: {verdict: {kind: "loss", text: "Bot wins in 2"}, nodes: 3_502, milliseconds: 1},
};

/** Between two people neither side is the bot, so a decisive verdict is amber rather than green or red. */
export const TwoPlayerDecisive: Story = {
	args: {verdict: {kind: "decisive", text: "Player 2 wins in 4"}, nodes: 90_014, milliseconds: 30},
};

/** The lamp pulses while the solver runs; under reduced motion it dims instead. */
export const Thinking: Story = {
	args: {verdict: null, thinking: true},
};

export const YouWinDark: Story = {
	...YouWin,
	decorators: [withTheme("dark")],
};
