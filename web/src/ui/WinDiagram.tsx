/**
 * 🖼️ A small picture of a won board for the rules page: the felt board in its rail, drawn at the play board's
 * proportions, with the winning four ringed in amber the way the play screen rings them.
 *
 * The whole figure is one SVG so it scales as a unit; the pieces are the same drawing the tray uses, placed with
 * a transform rather than nested `<svg>` elements.
 */

import {ALL_CELLS, cellName, column, row} from "../game/cells.js";
import {type Board, type Rules, winningCells} from "../game/rules.js";
import {PIECE_VIEW_HEIGHT, PIECE_VIEW_WIDTH, PieceShape} from "./PieceGlyph.js";

export interface WinDiagramProps {
	readonly board: Board;
	readonly rules: Rules;
	/** Names the picture for assistive technology and is printed under it. */
	readonly caption: string;
}

const RAIL = 7;
const PADDING = 10;
const GAP = 5;
const CELL = 40;
const SIZE = 2 * RAIL + 2 * PADDING + 4 * CELL + 3 * GAP;
const RING = 3;
/* The play board insets a piece 8% of its cell on every side. */
const PIECE_INSET = CELL * 0.08;
const PIECE_SCALE = (CELL - 2 * PIECE_INSET) / PIECE_VIEW_HEIGHT;
const PIECE_LEFT = (CELL - PIECE_VIEW_WIDTH * PIECE_SCALE) / 2;

function cellOrigin(index: number): number {
	return RAIL + PADDING + index * (CELL + GAP);
}

export function WinDiagram({board, rules, caption}: WinDiagramProps) {
	const winning = winningCells(board, rules);
	if (winning.size === 0) {
		throw new Error("WinDiagram needs a won board");
	}
	return (
		<figure className="diagram">
			<svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={caption}>
				<rect width={SIZE} height={SIZE} rx={8} fill="var(--rail)" />
				<rect
					x={RAIL}
					y={RAIL}
					width={SIZE - 2 * RAIL}
					height={SIZE - 2 * RAIL}
					rx={2}
					fill="var(--felt)"
					stroke="var(--felt-line)"
					strokeWidth={1}
				/>
				{ALL_CELLS.map((cell) => {
					const x = cellOrigin(column(cell));
					const y = cellOrigin(row(cell));
					const piece = board[cell] ?? null;
					return (
						<g key={cell}>
							<rect x={x} y={y} width={CELL} height={CELL} rx={4} fill="var(--felt-deep)" />
							{piece !== null && (
								<g transform={`translate(${x + PIECE_LEFT} ${y + PIECE_INSET}) scale(${PIECE_SCALE})`}>
									<PieceShape piece={piece} />
								</g>
							)}
							{winning.has(cell) && (
								<rect
									data-winning={cellName(cell)}
									x={x + RING / 2}
									y={y + RING / 2}
									width={CELL - RING}
									height={CELL - RING}
									rx={3}
									fill="none"
									stroke="var(--amber)"
									strokeWidth={RING}
								/>
							)}
						</g>
					);
				})}
			</svg>
			<figcaption>{caption}</figcaption>
		</figure>
	);
}
