import type {Decorator, Meta, StoryObj} from "@storybook/react-vite";
import {fn} from "storybook/test";
import {useState} from "react";
import {ALL_CELLS, type Cell, cellFromName} from "../game/cells.js";
import type {Piece} from "../game/pieces.js";
import {type Board as BoardValue, boardWith} from "../game/rules.js";
import {Board} from "./Board.js";
import {Hand, type HandProps} from "./Hand.js";
import {OracleBar} from "./OracleBar.js";
import {useDragToPlace} from "./useDragToPlace.js";
import {withTheme} from "./withTheme.js";
import "../styles/index.css";

type HandArgs = Omit<HandProps, "drag">;

/** The hand on its own: nothing to drop on, so the piece is not draggable. */
function HandAlone(args: HandArgs) {
	const drag = useDragToPlace(new Set(), fn());
	return <Hand {...args} drag={drag} />;
}

const meta: Meta<typeof HandAlone> = {
	title: "Play/Hand",
	component: HandAlone,
};

/** The strip the hand sits in on the play screen. */
const inStrip: Decorator = (Story) => (
	<div className="strip" style={{maxWidth: 420}}>
		<Story />
	</div>
);

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

export const ToPlace: Story = {args: toPlace, decorators: [inStrip]};

export const ToChoose: Story = {
	args: {piece: null, title: "Your move", detail: "Choose a piece for the bot."},
	decorators: [inStrip],
};

export const GameOver: Story = {
	args: {piece: null, title: "Quarto! You win.", detail: ""},
	decorators: [inStrip],
};

export const WithVerdict: Story = {args: toPlace, decorators: [besideVerdict, inStrip]};

export const WithVerdictDark: Story = {args: toPlace, decorators: [besideVerdict, inStrip, withTheme("dark")]};

function emptyCells(board: BoardValue): Set<Cell> {
	return new Set(ALL_CELLS.filter((cell) => board[cell] === null));
}

/** The strip over the board with a piece in hand: drag it onto any empty cell, or tap the cell as before. */
function DragOntoBoardDemo() {
	const [board, setBoard] = useState(() => boardWith({a1: 5, d1: 10, b2: 3, c2: 12, b3: 7, c3: 8, d4: 1}));
	const [hand, setHand] = useState<Piece | null>(14);
	const legal = hand === null ? new Set<Cell>() : emptyCells(board);
	const place = (cell: Cell) => {
		if (hand === null) {
			throw new Error("Nothing in hand");
		}
		setBoard(board.map((piece, index) => (index === cell ? hand : piece)));
		setHand(null);
	};
	const drag = useDragToPlace(legal, place);
	return (
		<div className="board-col" style={{maxWidth: 420, display: "grid", gap: 12}}>
			<div className="strip">
				<Hand
					piece={hand}
					title="Your move"
					detail={
						hand === null
							? "Placed. Reload the story to try again."
							: "Place the light square tall hollow piece."
					}
					drag={drag}
				/>
			</div>
			<Board
				board={board}
				legalCells={legal}
				onPlace={place}
				lastCell={cellFromName("d4")}
				winningCells={new Set()}
				hints={new Map()}
				dropCell={drag.dropCell}
			/>
		</div>
	);
}

export const DragOntoBoard: Story = {
	render: () => <DragOntoBoardDemo />,
	parameters: {docs: {description: {story: "Press the piece in hand and drag it onto an empty cell."}}},
};

export const DragOntoBoardDark: Story = {
	...DragOntoBoard,
	decorators: [withTheme("dark")],
};
