import type {Decorator, Meta, StoryObj} from "@storybook/react-vite";
import {ALL_PIECES, pieceName} from "../game/pieces.js";
import {PieceGlyph} from "./PieceGlyph.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

const meta: Meta<typeof PieceGlyph> = {
	title: "Play/PieceGlyph",
	component: PieceGlyph,
	decorators: [
		(Story) => (
			<div style={{width: 80, height: 120}}>
				<Story />
			</div>
		),
	],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LightRoundShortSolid: Story = {args: {piece: 0}};
export const DarkSquareTallHollow: Story = {args: {piece: 15}};

/** All sixteen, in piece order, on the tray's ground so the maple and walnut read against it. */
const allSixteen: Decorator = () => (
	<div className="tray" style={{gridTemplateColumns: "repeat(8, 56px)", width: "fit-content"}}>
		{ALL_PIECES.map((piece) => (
			<div key={piece} className="slot" title={pieceName(piece)}>
				<PieceGlyph piece={piece} />
			</div>
		))}
	</div>
);

export const AllSixteen: Story = {
	args: {piece: 0},
	decorators: [allSixteen],
};

export const AllSixteenDark: Story = {
	args: {piece: 0},
	decorators: [allSixteen, withTheme("dark")],
};
