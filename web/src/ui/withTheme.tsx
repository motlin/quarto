/** 🌗 A Storybook decorator that shows the story in one theme regardless of the viewer's preference. */

import type {Decorator} from "@storybook/react-vite";
import {type Theme, Themed} from "./Themed.js";

export function withTheme(theme: Theme): Decorator {
	return (Story) => (
		<Themed theme={theme}>
			<Story />
		</Themed>
	);
}
