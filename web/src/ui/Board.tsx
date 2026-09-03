/**
 * 🟩 The board: sixteen buttons on felt. Only the legal cells are live; the rest are disabled so a tap on an
 * occupied cell, or any cell when it is not the player's turn to place, does nothing. Every cell carries its
 * index in `data-cell` so a drag can tell which cell the pointer is over. With undo off, the piece placed but not
 * yet confirmed sits in its cell marked as pending.
 */

import {ALL_CELLS, type Cell, cellName} from "../game/cells.js";
import {type Piece, pieceName} from "../game/pieces.js";
import type {Board as BoardValue} from "../game/rules.js";
import {Hint} from "./Hint.js";
import {PieceGlyph} from "./PieceGlyph.js";

export interface BoardProps {
	readonly board: BoardValue;
	readonly legalCells: ReadonlySet<Cell>;
	readonly onPlace: (cell: Cell) => void;
	readonly lastCell: Cell | null;
	/** The cell of a placement awaiting confirmation. */
	readonly pendingCell: Cell | null;
	readonly winningCells: ReadonlySet<Cell>;
	/** The move-value label of each legal cell, when the player asked to see them. */
	readonly hints: ReadonlyMap<Cell, string>;
	/** The legal cell a dragged piece is hovering over. */
	readonly dropCell: Cell | null;
}

function classes(...names: (string | false)[]): string {
	return names.filter((name) => name !== false).join(" ");
}

function cellLabel(cell: Cell, piece: Piece | null, pending: boolean): string {
	const parts = [`cell ${cellName(cell)}`];
	if (piece !== null) {
		parts.push(pieceName(piece));
	}
	if (pending) {
		parts.push("unconfirmed");
	}
	return parts.join(", ");
}

export function Board({board, legalCells, onPlace, lastCell, pendingCell, winningCells, hints, dropCell}: BoardProps) {
	return (
		<div className="board" role="grid" aria-label="Quarto board">
			{ALL_CELLS.map((cell) => {
				const piece = board[cell] ?? null;
				const legal = legalCells.has(cell);
				const hint = legal ? hints.get(cell) : undefined;
				return (
					<button
						key={cell}
						type="button"
						className={classes(
							"cell",
							legal && "legal",
							cell === dropCell && "drop",
							cell === pendingCell && "pending",
							cell === lastCell && "last",
							winningCells.has(cell) && "winning",
						)}
						aria-label={cellLabel(cell, piece, cell === pendingCell)}
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
