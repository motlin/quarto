/**
 * ✋ The piece in hand beside what the player is asked to do with it. When there is somewhere to put it, the piece
 * can be dragged onto the board; a ghost of it follows the pointer, fixed to the viewport and out of the way of
 * hit testing.
 */

import type {Piece} from "../game/pieces.js";
import {PieceGlyph} from "./PieceGlyph.js";
import type {DragToPlace} from "./useDragToPlace.js";

export interface HandProps {
	/** The piece chosen for the next placement, or nothing while a piece is being chosen. */
	readonly piece: Piece | null;
	/** The instruction's first line, such as "Your move". */
	readonly title: string;
	/** The instruction's second line, such as "Place the dark round tall solid piece." */
	readonly detail: string;
	readonly drag: DragToPlace;
}

/** The ghost sits a little larger than the piece in the hand, as if lifted off the table. */
const LIFT_SCALE = 1.12;

function handClasses(piece: Piece | null, drag: DragToPlace): string {
	const names = ["hand-piece"];
	if (piece === null) {
		names.push("empty");
	}
	if (drag.enabled) {
		names.push("draggable");
	}
	if (drag.ghost !== null && !drag.ghost.returning) {
		names.push("lifted");
	}
	return names.join(" ");
}

export function Hand({piece, title, detail, drag}: HandProps) {
	const {ghost} = drag;
	return (
		<>
			<div className={handClasses(piece, drag)} aria-hidden="true" {...drag.handlers}>
				{piece !== null && <PieceGlyph piece={piece} />}
			</div>
			{piece !== null && ghost !== null && (
				<div
					className={`drag-ghost${ghost.returning ? " returning" : ""}`}
					aria-hidden="true"
					style={{
						left: ghost.left,
						top: ghost.top,
						width: ghost.width,
						height: ghost.height,
						transform: `translate(${ghost.dx}px, ${ghost.dy}px) scale(${ghost.returning ? 1 : LIFT_SCALE})`,
					}}
				>
					<PieceGlyph piece={piece} />
				</div>
			)}
			<div className="prompt" aria-live="polite">
				{title}
				{detail !== "" && <small>{detail}</small>}
			</div>
		</>
	);
}
