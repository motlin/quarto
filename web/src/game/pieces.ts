/**
 * 🪵 The sixteen pieces, numbered by their trait bits: bit 0 dark, bit 1 square, bit 2 tall, bit 3 hollow.
 *
 * The number is also the upstream solver's piece index, so it crosses the wasm boundary unchanged.
 */

export type Piece = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const ALL_PIECES: readonly Piece[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export function isPiece(value: number): value is Piece {
	return Number.isInteger(value) && value >= 0 && value < ALL_PIECES.length;
}

export function asPiece(value: number): Piece {
	if (!isPiece(value)) {
		throw new Error(`Not a piece: ${value}`);
	}
	return value;
}

export function isDark(piece: Piece): boolean {
	return (piece & 1) !== 0;
}

export function isSquare(piece: Piece): boolean {
	return (piece & 2) !== 0;
}

export function isTall(piece: Piece): boolean {
	return (piece & 4) !== 0;
}

export function isHollow(piece: Piece): boolean {
	return (piece & 8) !== 0;
}

/** The piece's traits in speaking order, such as "light round tall solid". */
export function pieceName(piece: Piece): string {
	return [
		isDark(piece) ? "dark" : "light",
		isSquare(piece) ? "square" : "round",
		isTall(piece) ? "tall" : "short",
		isHollow(piece) ? "hollow" : "solid",
	].join(" ");
}

/**
 * The upstream transcript token: `a`/`b` for bit 0 then `o`/`x` for bit 1, with bit 2 capitalising the first
 * letter and bit 3 the second, so `Bx` is piece 7 and `aO` is piece 8.
 */
export function pieceToken(piece: Piece): string {
	const first = isDark(piece) ? "b" : "a";
	const second = isSquare(piece) ? "x" : "o";
	return (isTall(piece) ? first.toUpperCase() : first) + (isHollow(piece) ? second.toUpperCase() : second);
}

const PIECE_BY_TOKEN: ReadonlyMap<string, Piece> = new Map(ALL_PIECES.map((piece) => [pieceToken(piece), piece]));

export function pieceFromToken(token: string): Piece {
	const piece = PIECE_BY_TOKEN.get(token);
	if (piece === undefined) {
		throw new Error(`Not a piece token: ${JSON.stringify(token)}`);
	}
	return piece;
}
