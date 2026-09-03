import type {Meta, StoryObj} from "@storybook/react-vite";
import {boardWith} from "../game/rules.js";
import {WinDiagram} from "./WinDiagram.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const meta: Meta<typeof WinDiagram> = {
	title: "Help/WinDiagram",
	component: WinDiagram,
	decorators: [
		(Story) => (
			<div className="prose">
				<Story />
			</div>
		),
	],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The rules page's first picture: four dark pieces that agree in nothing else, ringed along the top row. */
export const DarkRow: Story = {
	args: {
		board: boardWith({a1: 1, b1: 3, c1: 5, d1: 15, c2: 6, b3: 8}),
		rules: "lines",
		caption: "Four different dark pieces in a row",
	},
};

/** The advanced variant: four tall pieces in the middle 2x2 block. */
export const TallSquare: Story = {
	args: {
		board: boardWith({b2: 4, c2: 6, b3: 13, c3: 15, a1: 1, d4: 8}),
		rules: "squares",
		caption: "Four tall pieces in a 2×2 square",
	},
};

/** A diagonal, to check the ring reads on cells that are not neighbours. */
export const HollowDiagonal: Story = {
	args: {
		board: boardWith({a1: 8, b2: 11, c3: 13, d4: 14, d1: 0, a4: 3}),
		rules: "lines",
		caption: "Four hollow pieces on a diagonal",
	},
};

export const DarkRowDark: Story = {
	...DarkRow,
	decorators: [withTheme("dark")],
};
