import type {Meta, StoryObj} from "@storybook/react-vite";
import {useState} from "react";
import {DEFAULT_SETUP, type Setup} from "../setup/setup.js";
import {SetupForm} from "./SetupForm.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

/** Holds the setup in state so the controls respond, and stands in for the route's Play and help links. */
function Interactive({initial}: {initial: Setup}) {
	const [value, setValue] = useState(initial);
	return (
		<SetupForm
			value={value}
			onChange={setValue}
			actions={
				<>
					<a className="btn primary" href="#play">
						Play
					</a>
					<a className="btn quiet" href="#rules">
						Rules
					</a>
					<a className="btn quiet" href="#how-to-play">
						How to play
					</a>
				</>
			}
		/>
	);
}

const meta: Meta<typeof Interactive> = {
	title: "Setup/SetupForm",
	component: Interactive,
	decorators: [
		(Story) => (
			<div className="screen" style={{maxWidth: 520}}>
				<Story />
			</div>
		),
	],
	args: {initial: DEFAULT_SETUP},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BotGame: Story = {};

/** Two people on one device: the first-move choice gives way to the name inputs. */
export const TwoPeople: Story = {
	args: {initial: {...DEFAULT_SETUP, opponent: "human", annotations: "off", names: ["Ada", ""]}},
};

/** The beatable bot: one ply of lookahead, random otherwise. */
export const MediumBot: Story = {
	args: {initial: {...DEFAULT_SETUP, difficulty: "medium"}},
};

export const MoveValues: Story = {
	args: {initial: {...DEFAULT_SETUP, rules: "lines", first: "bot", annotations: "values"}},
};

export const BotGameDark: Story = {
	decorators: [withTheme("dark")],
};
