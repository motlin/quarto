/** 📜 The moves so far behind a disclosure: who gave which piece, and where it went. */

import {cellName} from "../game/cells.js";
import type {Move} from "../game/state.js";
import type {Player} from "../game/turns.js";
import {PieceGlyph} from "./PieceGlyph.js";

export interface MoveLogProps {
	readonly moves: readonly Move[];
	readonly playerName: (player: Player) => string;
}

export function MoveLog({moves, playerName}: MoveLogProps) {
	const placements = moves.filter((move) => move.kind === "place").length;
	return (
		<details className="moves">
			<summary>Move list · {placements} placements</summary>
			<div className="log">
				{moves.map((move, index) => (
					<div key={index} className="log-entry">
						<span>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""}</span>
						<span className="who">{playerName(move.player)}</span>
						<PieceGlyph piece={move.piece} />
						<span>{move.kind === "place" ? `→ ${cellName(move.cell)}` : "gives"}</span>
					</div>
				))}
			</div>
		</details>
	);
}
