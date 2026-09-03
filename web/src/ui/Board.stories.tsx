import type {Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {ALL_CELLS, asCell, type Cell, cellFromName} from "../game/cells.js";
import type {Piece} from "../game/pieces.js";
import {type Board as BoardValue, emptyBoard, winningCells} from "../game/rules.js";
import {Board} from "./Board.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

/** A board described by which piece sits on which cell, such as `{a1: 5, b2: 10}`. */
function boardWith(placed: Record<string, Piece>): BoardValue {
	const byCell = new Map(Object.entries(placed).map(([name, piece]) => [cellFromName(name), piece]));
	return emptyBoard().map((_, cell) => byCell.get(asCell(cell)) ?? null);
}

function emptyCells(board: BoardValue): Set<Cell> {
	return new Set(ALL_CELLS.filter((cell) => board[cell] === null));
}

const midGame = boardWith({a1: 5, d1: 10, b2: 3, c2: 12, b3: 7, c3: 8, d4: 1});

const wonBoard = boardWith({a1: 4, b1: 13, c1: 6, d1: 15, b2: 2, c3: 9});

const meta: Meta<typeof Board> = {
	title: "Play/Board",
	component: Board,
	decorators: [
		(Story) => (
			<div style={{maxWidth: 420}}>
				<Story />
			</div>
		),
	],
	args: {onPlace: fn(), lastCell: null, winningCells: new Set(), hints: new Map()},
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing placed and the player about to place: every cell is legal and carries the amber dot. */
export const Empty: Story = {
	args: {board: emptyBoard(), legalCells: emptyCells(emptyBoard())},
};

/** Seven pieces down, the last one at d4, and a value on each legal cell. */
export const MidGameWithHints: Story = {
	args: {
		board: midGame,
		legalCells: emptyCells(midGame),
		lastCell: cellFromName("d4"),
		hints: new Map<Cell, string>([
			[cellFromName("b1"), "="],
			[cellFromName("c1"), "L2"],
			[cellFromName("a2"), "W3"],
			[cellFromName("d2"), "="],
			[cellFromName("a3"), "="],
			[cellFromName("d3"), "L4"],
			[cellFromName("a4"), "="],
			[cellFromName("b4"), "W3"],
			[cellFromName("c4"), "="],
		]),
	},
};

/** Waiting on the other side: nothing is legal, so no dots and nothing to tap. */
export const OpponentToMove: Story = {
	args: {board: midGame, legalCells: new Set(), lastCell: cellFromName("d4")},
};

/** Four tall pieces along the top row: the winning line is ringed in amber and the board is done. */
export const Won: Story = {
	args: {
		board: wonBoard,
		legalCells: new Set(),
		lastCell: cellFromName("d1"),
		winningCells: winningCells(wonBoard, "lines"),
	},
};

export const MidGameDark: Story = {
	...MidGameWithHints,
	decorators: [withTheme("dark")],
};
