import type {Meta, StoryObj} from "@storybook/react-vite";
import {useCallback} from "react";
import {cellFromName} from "../game/cells.js";
import type {GameSetup} from "../game/setup.js";
import {type Script, ScriptedSolver} from "../solver/scripted.js";
import {PlayScreen} from "./PlayScreen.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const botGame: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "you",
	difficulty: "impossible",
	hints: "outcome",
	names: ["", ""],
};

/** The bot fills the top row from the left, then works down; every third move value reads "=", then W2 and L3. */
const script: Partial<Script> = {
	bestMoves: [cellFromName("a1"), 5, cellFromName("b1"), 9, cellFromName("c1"), 13, cellFromName("a2"), 1],
	value: 0,
	moveValue: (move, movesLeft) => [0, movesLeft - 1, -(movesLeft - 2)][move % 3] ?? 0,
};

/** Hands the screen a scripted solver so the story plays without the worker, and stands in for the router's links. */
function Scripted({setup}: {setup: GameSetup}) {
	const createSolver = useCallback(() => new ScriptedSolver(script, setup.rules), [setup.rules]);
	return (
		<PlayScreen
			setup={setup}
			createSolver={createSolver}
			backLink={
				<a className="btn quiet" href="#setup">
					<span aria-hidden="true">‹</span> Setup
				</a>
			}
			helpLink={
				<a className="btn round" href="#how-to-play" aria-label="How to play">
					?
				</a>
			}
		/>
	);
}

const meta: Meta<typeof Scripted> = {
	title: "Play/PlayScreen",
	component: Scripted,
	parameters: {layout: "fullscreen"},
	args: {setup: botGame},
};

export default meta;
type Story = StoryObj<typeof meta>;

/** You choose first; the bot answers after a short pause. */
export const YouVsBot: Story = {};

/** The bot opens, so the screen starts on its turn with the lamp pulsing. */
export const BotFirst: Story = {
	args: {setup: {...botGame, first: "bot"}},
};

/** Every legal move carries its exact value. */
export const MoveValues: Story = {
	args: {setup: {...botGame, hints: "values"}},
};

/** Two people on one device, no oracle at all. */
export const TwoPeople: Story = {
	args: {setup: {...botGame, opponent: "human", rules: "lines", hints: "off", names: ["Ada", "Grace"]}},
};

export const YouVsBotDark: Story = {
	decorators: [withTheme("dark")],
};

/** The phone layout the screen is built for: everything in one column, no scrolling at 390×740. */
export const Phone: Story = {
	parameters: {viewport: {defaultViewport: "mobile2"}},
	globals: {viewport: {value: "mobile2", isRotated: false}},
};
