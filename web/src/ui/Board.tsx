/**
 * 🟩 The board: sixteen buttons on felt. Only the legal cells are live; the rest are disabled so a tap on an
 * occupied cell, or any cell when it is not the player's turn to place, does nothing. Every cell carries its
 * index in `data-cell` so a drag can tell which cell the pointer is over.
 */

import {ALL_CELLS, type Cell, cellName} from "../game/cells.js";
import {pieceName} from "../game/pieces.js";
import type {Board as BoardValue} from "../game/rules.js";
import {Hint} from "./Hint.js";
import {PieceGlyph} from "./PieceGlyph.js";

export interface BoardProps {
	readonly board: BoardValue;
	readonly legalCells: ReadonlySet<Cell>;
	readonly onPlace: (cell: Cell) => void;
	readonly lastCell: Cell | null;
	readonly winningCells: ReadonlySet<Cell>;
	/** The move-value label of each legal cell, when the player asked to see them. */
	readonly hints: ReadonlyMap<Cell, string>;
	/** The legal cell a dragged piece is hovering over. */
	readonly dropCell: Cell | null;
}

function classes(...names: (string | false)[]): string {
	return names.filter((name) => name !== false).join(" ");
}

export function Board({board, legalCells, onPlace, lastCell, winningCells, hints, dropCell}: BoardProps) {
	return (
		<div className="board" role="grid" aria-label="Quarto board">
			{ALL_CELLS.map((cell) => {
				const piece = board[cell] ?? null;
				const legal = legalCells.has(cell);
				const hint = legal ? hints.get(cell) : undefined;
				const label = piece === null ? `cell ${cellName(cell)}` : `cell ${cellName(cell)}, ${pieceName(piece)}`;
				return (
					<button
						key={cell}
						type="button"
						className={classes(
							"cell",
							legal && "legal",
							cell === dropCell && "drop",
							cell === lastCell && "last",
							winningCells.has(cell) && "winning",
						)}
						aria-label={label}
						data-cell={cell}
						disabled={!legal}
						onClick={() => {
							onPlace(cell);
						}}
					>
						{piece !== null && <PieceGlyph piece={piece} />}
						{hint !== undefined && <Hint label={hint} />}
					</button>
				);
			})}
		</div>
	);
}
