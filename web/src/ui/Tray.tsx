/**
 * 🧺 The pieces not yet played, one slot per piece in piece order. A taken slot stays in the grid, invisible, so
 * the others never move under the player's finger.
 */

import {ALL_PIECES, type Piece, pieceName} from "../game/pieces.js";
import {Hint} from "./Hint.js";
import {PieceGlyph} from "./PieceGlyph.js";

export interface TrayProps {
	readonly remaining: readonly Piece[];
	readonly legalPieces: ReadonlySet<Piece>;
	readonly onSelect: (piece: Piece) => void;
	/** The move-value label of each legal piece, when the player asked to see them. */
	readonly hints: ReadonlyMap<Piece, string>;
}

export function Tray({remaining, legalPieces, onSelect, hints}: TrayProps) {
	const inTray = new Set(remaining);
	return (
		<div className="tray" role="group" aria-label="Pieces remaining">
			{ALL_PIECES.map((piece) => {
				const taken = !inTray.has(piece);
				const legal = !taken && legalPieces.has(piece);
				const hint = legal ? hints.get(piece) : undefined;
				return (
					<button
						key={piece}
						type="button"
						className={`slot${taken ? " taken" : ""}${legal ? " legal" : ""}`}
						aria-label={`${pieceName(piece)} piece`}
						aria-hidden={taken ? "true" : undefined}
						tabIndex={taken ? -1 : undefined}
						disabled={!legal}
						onClick={() => {
							onSelect(piece);
						}}
					>
						<PieceGlyph piece={piece} />
						{hint !== undefined && <Hint label={hint} />}
					</button>
				);
			})}
		</div>
	);
}
