/**
 * 🪵 One piece drawn as it sits on the table: maple or walnut, a cylinder or a block, tall or short, with a hole in
 * the top when hollow. Every real piece is turned with one groove at the same height above the base, so the groove
 * sits just below the midpoint of a tall piece and well above the midpoint of a short one.
 */

import {isDark, isHollow, isSquare, isTall, type Piece} from "../game/pieces.js";

const WIDTH = 30;
const LEFT = 5;
const RIGHT = LEFT + WIDTH;
const CENTER = 20;
const BASE_Y = 52;
const TALL_TOP = 10;
const SHORT_TOP = 26;
/** In the 40x60 viewBox: 18 above the base on all sixteen pieces. */
const GROOVE_Y = BASE_Y - 18;
const ROUND_RX = 15;
const ROUND_RY = 4.5;

interface Wood {
	readonly fill: string;
	readonly edge: string;
}

function woodOf(piece: Piece): Wood {
	return isDark(piece)
		? {fill: "var(--walnut)", edge: "var(--walnut-edge)"}
		: {fill: "var(--maple)", edge: "var(--maple-edge)"};
}

function SquareBody({top, wood}: {top: number; wood: Wood}) {
	return (
		<>
			<rect x={LEFT} y={top} width={WIDTH} height={BASE_Y - top} rx={3} fill={wood.edge} />
			<rect x={LEFT} y={top} width={WIDTH} height={BASE_Y - top - 4} rx={3} fill={wood.fill} />
			<rect
				data-part="top"
				x={LEFT}
				y={top}
				width={WIDTH}
				height={10}
				rx={3}
				fill={wood.fill}
				stroke={wood.edge}
				strokeWidth={1}
			/>
		</>
	);
}

function RoundBody({top, wood}: {top: number; wood: Wood}) {
	const capY = top + ROUND_RY;
	return (
		<>
			<rect x={LEFT} y={capY} width={WIDTH} height={BASE_Y - top - 8} fill={wood.edge} />
			<ellipse cx={CENTER} cy={BASE_Y - 4} rx={ROUND_RX} ry={ROUND_RY} fill={wood.edge} />
			<rect x={LEFT} y={capY} width={WIDTH} height={BASE_Y - top - 10} fill={wood.fill} />
			<ellipse
				data-part="top"
				cx={CENTER}
				cy={capY}
				rx={ROUND_RX}
				ry={ROUND_RY}
				fill={wood.fill}
				stroke={wood.edge}
				strokeWidth={1}
			/>
		</>
	);
}

/** The groove is straight across a block and follows the curve of a cylinder; the pale line under it is the light catching the cut. */
function Groove({square, wood}: {square: boolean; wood: Wood}) {
	if (square) {
		return (
			<>
				<line
					data-part="groove"
					x1={LEFT + 0.5}
					y1={GROOVE_Y}
					x2={RIGHT - 0.5}
					y2={GROOVE_Y}
					stroke={wood.edge}
					strokeWidth={1.8}
				/>
				<line
					x1={LEFT + 0.5}
					y1={GROOVE_Y + 1.6}
					x2={RIGHT - 0.5}
					y2={GROOVE_Y + 1.6}
					stroke="#fff"
					strokeOpacity={0.28}
					strokeWidth={0.8}
				/>
			</>
		);
	}
	const arc = (y: number) => `M ${LEFT} ${y} A ${ROUND_RX} ${ROUND_RY} 0 0 0 ${RIGHT} ${y}`;
	return (
		<>
			<path data-part="groove" d={arc(GROOVE_Y)} fill="none" stroke={wood.edge} strokeWidth={1.8} />
			<path d={arc(GROOVE_Y + 1.6)} fill="none" stroke="#fff" strokeOpacity={0.28} strokeWidth={0.8} />
		</>
	);
}

function Hole({square, top, wood}: {square: boolean; top: number; wood: Wood}) {
	if (square) {
		return <rect data-part="hole" x={13} y={top + 2} width={14} height={5} rx={1.5} fill={wood.edge} />;
	}
	return <ellipse data-part="hole" cx={CENTER} cy={top + ROUND_RY} rx={7} ry={2.2} fill={wood.edge} />;
}

export function PieceGlyph({piece}: {piece: Piece}) {
	const wood = woodOf(piece);
	const square = isSquare(piece);
	const top = isTall(piece) ? TALL_TOP : SHORT_TOP;
	return (
		<svg className="piece" viewBox="0 0 40 60" aria-hidden="true">
			{square ? <SquareBody top={top} wood={wood} /> : <RoundBody top={top} wood={wood} />}
			<Groove square={square} wood={wood} />
			{isHollow(piece) && <Hole square={square} top={top} wood={wood} />}
		</svg>
	);
}
