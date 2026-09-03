import type {Decorator, Meta, StoryObj} from "@storybook/react-vite";
import {Hand} from "./Hand.js";
import {OracleBar} from "./OracleBar.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const meta: Meta<typeof Hand> = {
	title: "Play/Hand",
	component: Hand,
	decorators: [
		(Story) => (
			<div className="strip" style={{maxWidth: 420}}>
				<Story />
			</div>
		),
	],
};

export default meta;
type Story = StoryObj<typeof meta>;

const toPlace = {piece: 14, title: "Your move", detail: "Place the light square tall hollow piece."} as const;

/** The whole strip as the play screen shows it: hand, prompt and verdict side by side. */
const besideVerdict: Decorator = (Story) => (
	<>
		<Story />
		<OracleBar verdict={{kind: "win", text: "You win in 3"}} thinking={false} nodes={48_211} milliseconds={12} />
	</>
);

export const ToPlace: Story = {args: toPlace};

export const ToChoose: Story = {
	args: {piece: null, title: "Your move", detail: "Choose a piece for the bot."},
};

export const GameOver: Story = {
	args: {piece: null, title: "Quarto! You win.", detail: ""},
};

export const WithVerdict: Story = {args: toPlace, decorators: [besideVerdict]};

export const WithVerdictDark: Story = {args: toPlace, decorators: [besideVerdict, withTheme("dark")]};
