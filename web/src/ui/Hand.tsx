/** ✋ The piece in hand beside what the player is asked to do with it. */

import type {Piece} from "../game/pieces.js";
import {PieceGlyph} from "./PieceGlyph.js";

export interface HandProps {
	/** The piece chosen for the next placement, or nothing while a piece is being chosen. */
	readonly piece: Piece | null;
	/** The instruction's first line, such as "Your move". */
	readonly title: string;
	/** The instruction's second line, such as "Place the dark round tall solid piece." */
	readonly detail: string;
}

export function Hand({piece, title, detail}: HandProps) {
	return (
		<>
			<div className={`hand-piece${piece === null ? " empty" : ""}`} aria-hidden="true">
				{piece !== null && <PieceGlyph piece={piece} />}
			</div>
			<div className="prompt" aria-live="polite">
				{title}
				{detail !== "" && <small>{detail}</small>}
			</div>
		</>
	);
}
