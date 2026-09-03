import {describe, it, expect} from "vitest";
import {
	ALL_PIECES,
	asPiece,
	isDark,
	isHollow,
	isPiece,
	isSquare,
	isTall,
	pieceFromToken,
	pieceName,
	pieceToken,
} from "../../src/game/pieces.js";

describe("pieceName", () => {
	it("names every piece from its trait bits", () => {
		expect(ALL_PIECES.map(pieceName)).toStrictEqual([
			"light round short solid",
			"dark round short solid",
			"light square short solid",
			"dark square short solid",
			"light round tall solid",
			"dark round tall solid",
			"light square tall solid",
			"dark square tall solid",
			"light round short hollow",
			"dark round short hollow",
			"light square short hollow",
			"dark square short hollow",
			"light round tall hollow",
			"dark round tall hollow",
			"light square tall hollow",
			"dark square tall hollow",
		]);
	});
});

describe("traits", () => {
	it("reads each trait from its own bit", () => {
		expect(ALL_PIECES.map(isDark)).toStrictEqual(ALL_PIECES.map((piece) => piece % 2 === 1));
		expect(ALL_PIECES.map(isSquare)).toStrictEqual(ALL_PIECES.map((piece) => Math.floor(piece / 2) % 2 === 1));
		expect(ALL_PIECES.map(isTall)).toStrictEqual(ALL_PIECES.map((piece) => Math.floor(piece / 4) % 2 === 1));
		expect(ALL_PIECES.map(isHollow)).toStrictEqual(ALL_PIECES.map((piece) => piece >= 8));
	});
});

describe("pieceToken", () => {
	it("matches the upstream token order", () => {
		expect(ALL_PIECES.map(pieceToken)).toStrictEqual([
			"ao",
			"bo",
			"ax",
			"bx",
			"Ao",
			"Bo",
			"Ax",
			"Bx",
			"aO",
			"bO",
			"aX",
			"bX",
			"AO",
			"BO",
			"AX",
			"BX",
		]);
	});

	it("round-trips through pieceFromToken", () => {
		expect(ALL_PIECES.map((piece) => pieceFromToken(pieceToken(piece)))).toStrictEqual([...ALL_PIECES]);
	});
});

describe("pieceFromToken", () => {
	it("rejects tokens outside the notation", () => {
		expect(() => pieceFromToken("a1")).toThrow('Not a piece token: "a1"');
		expect(() => pieceFromToken("aox")).toThrow('Not a piece token: "aox"');
		expect(() => pieceFromToken("")).toThrow('Not a piece token: ""');
	});
});

describe("asPiece", () => {
	it("accepts the sixteen piece numbers", () => {
		expect(ALL_PIECES.map(asPiece)).toStrictEqual([...ALL_PIECES]);
		expect(ALL_PIECES.map(isPiece)).toStrictEqual(ALL_PIECES.map(() => true));
	});

	it("rejects anything else", () => {
		expect(() => asPiece(16)).toThrow("Not a piece: 16");
		expect(() => asPiece(-1)).toThrow("Not a piece: -1");
		expect(() => asPiece(2.5)).toThrow("Not a piece: 2.5");
		expect(isPiece(16)).toBe(false);
	});
});
