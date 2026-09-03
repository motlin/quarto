import {describe, expect, it} from "vitest";
import {ALL_CELLS, type Cell, cellFromName} from "../../src/game/cells.js";
import {mediumTurn, type MediumTurn} from "../../src/game/medium.js";
import {isTall, type Piece} from "../../src/game/pieces.js";
import {mulberry32, type Random} from "../../src/game/random.js";
import {type Board, type Rules, winningCells} from "../../src/game/rules.js";
import type {GameSetup} from "../../src/game/setup.js";
import {applyPlace, applySelect, type GameState, newGame} from "../../src/game/state.js";

const botFirst: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "bot",
	difficulty: "medium",
	hints: "off",
	names: ["", ""],
};

function setupWith(rules: Rules): GameSetup {
	return {...botFirst, rules};
}

/** The position with `placed` on the board and `hand` chosen, built through the reducer so it is a legal one. */
function position(rules: Rules, placed: Readonly<Record<string, Piece>>, hand: Piece | null): GameState {
	let state = newGame(setupWith(rules));
	for (const [name, piece] of Object.entries(placed)) {
		state = applyPlace(applySelect(state, piece), cellFromName(name));
	}
	if (hand !== null) {
		state = applySelect(state, hand);
	}
	const expectedPlies = Object.keys(placed).length * 2 + (hand === null ? 0 : 1);
	if (state.log.length !== expectedPlies || state.status !== "playing") {
		throw new Error(`The fixture is not a legal live position: ${state.log.length} plies, ${state.status}`);
	}
	return state;
}

function placing(board: Board, cell: Cell, piece: Piece): Board {
	return board.map((occupant, index) => (index === cell ? piece : occupant));
}

/** Whether the player who receives `piece` on `board` can win by placing it somewhere. */
function winsAtOnce(board: Board, piece: Piece, rules: Rules): boolean {
	return ALL_CELLS.some((cell) => board[cell] === null && winningCells(placing(board, cell, piece), rules).size > 0);
}

function selected(turn: MediumTurn): Piece {
	if (turn.select === null) {
		throw new Error("The turn selected nothing");
	}
	return turn.select;
}

function placed(turn: MediumTurn): Cell {
	if (turn.place === null) {
		throw new Error("The turn placed nothing");
	}
	return turn.place;
}

/** Plays the bot's whole turn through the reducer and returns the position the opponent faces. */
function afterTurn(state: GameState, turn: MediumTurn): GameState {
	let next = state;
	if (turn.place !== null) {
		next = applyPlace(next, turn.place);
	}
	if (turn.select !== null) {
		next = applySelect(next, turn.select);
	}
	return next;
}

const seeds = Array.from({length: 40}, (_, index) => index + 1);

/** Three tall pieces along the top row with nothing else on the board. */
const TALL_TOP_ROW = {a1: 4, b1: 5, c1: 14} as const;

describe("mediumTurn takes a win when one is on the board", () => {
	it("completes a line of tall pieces and stops, under both rule sets", () => {
		for (const rules of ["lines", "squares"] as const) {
			const state = position(rules, TALL_TOP_ROW, 7);
			expect(mediumTurn(state, mulberry32(1))).toStrictEqual({place: cellFromName("d1"), select: null});
			expect(afterTurn(state, mediumTurn(state, mulberry32(1))).status).toBe("won");
		}
	});

	it("completes a 2×2 square of dark pieces only when squares count", () => {
		const darkCorner = {a1: 1, b1: 3, a2: 5} as const;
		expect(mediumTurn(position("squares", darkCorner, 7), mulberry32(1))).toStrictEqual({
			place: cellFromName("b2"),
			select: null,
		});
		const underLines = mediumTurn(position("lines", darkCorner, 7), mulberry32(1));
		expect(underLines.select).not.toBeNull();
	});
});

describe("mediumTurn defends against a win in one", () => {
	it("either blocks the line or hands over a piece that cannot complete it", () => {
		// The short hollow piece 8 in hand cannot finish the tall line; a tall piece given away would.
		const state = position("squares", TALL_TOP_ROW, 8);
		for (const seed of seeds) {
			const turn = mediumTurn(state, mulberry32(seed));
			const blocked = turn.place === cellFromName("d1");
			const handedShort = !isTall(selected(turn));
			expect(blocked || handedShort).toBe(true);
			const opponent = afterTurn(state, turn);
			expect(opponent.status).toBe("playing");
			expect(winsAtOnce(opponent.board, selected(turn), "squares")).toBe(false);
		}
	});

	it("chooses among all the safe pairs, not just one", () => {
		const state = position("squares", TALL_TOP_ROW, 8);
		const choices = new Set(seeds.map((seed) => JSON.stringify(mediumTurn(state, mulberry32(seed)))));
		expect(choices.size).toBeGreaterThan(5);
	});
});

describe("mediumTurn when every pair loses", () => {
	// Two empty cells, one piece to give: piece 15 in hand wins nowhere, and piece 9 wins on whichever cell is left.
	const TRAP = {
		a1: 2,
		b1: 7,
		c1: 13,
		b2: 5,
		c2: 8,
		d2: 1,
		a3: 6,
		b3: 11,
		c3: 14,
		d3: 12,
		a4: 0,
		b4: 10,
		c4: 4,
		d4: 3,
	} as const;

	it("still plays a legal pair, spreading its choice over both cells", () => {
		const state = position("squares", TRAP, 15);
		const cells = new Set<Cell>();
		for (const seed of seeds) {
			const turn = mediumTurn(state, mulberry32(seed));
			expect(turn.select).toBe(9);
			expect([cellFromName("a2"), cellFromName("d1")]).toContain(turn.place);
			cells.add(placed(turn));
			const opponent = afterTurn(state, turn);
			expect(opponent.status).toBe("playing");
			expect(winsAtOnce(opponent.board, 9, "squares")).toBe(true);
		}
		expect(cells.size).toBe(2);
	});
});

describe("mediumTurn at the two ends of the game", () => {
	it("only selects on the first turn of the game", () => {
		const state = newGame(botFirst);
		const turn = mediumTurn(state, mulberry32(7));
		expect(turn.place).toBeNull();
		expect(turn.select).not.toBeNull();
		expect(afterTurn(state, turn).log).toHaveLength(1);
	});

	// A full board with no line or square sharing a trait: the game is drawn once the last piece goes down.
	const DRAWN = {
		a1: 15,
		b1: 8,
		c1: 14,
		d1: 3,
		a2: 6,
		b2: 11,
		c2: 0,
		d2: 7,
		a3: 4,
		b3: 13,
		c3: 5,
		d3: 10,
		a4: 1,
		b4: 2,
		c4: 9,
	} as const;

	it("only places on the last turn, even when the game ends drawn", () => {
		const state = position("squares", DRAWN, 12);
		const turn = mediumTurn(state, mulberry32(7));
		expect(turn).toStrictEqual({place: cellFromName("d4"), select: null});
		expect(afterTurn(state, turn).status).toBe("drawn");
	});

	it("refuses a finished game", () => {
		const state = afterTurn(position("squares", TALL_TOP_ROW, 7), {place: cellFromName("d1"), select: null});
		expect(() => mediumTurn(state, mulberry32(1))).toThrow("The game is over");
	});
});

describe("mediumTurn is reproducible", () => {
	it("makes the same choice for the same seed and a different one for another", () => {
		const state = position("squares", {a1: 4, c3: 9}, 2);
		const withSeed = (seed: number) => mediumTurn(state, mulberry32(seed));
		expect(withSeed(99)).toStrictEqual(withSeed(99));
		const distinct = new Set(seeds.map((seed) => JSON.stringify(withSeed(seed))));
		expect(distinct.size).toBeGreaterThan(1);
	});
});

describe("medium against medium", () => {
	function selfPlay(random: Random, rules: Rules): GameState {
		let state = newGame(setupWith(rules));
		while (state.status === "playing") {
			const before = state;
			state = afterTurn(state, mediumTurn(state, random));
			if (state === before) {
				throw new Error("The turn changed nothing");
			}
		}
		return state;
	}

	it("finishes 200 games in a win or a draw without a hitch", () => {
		const outcomes = {won: 0, drawn: 0};
		for (let game = 1; game <= 200; game++) {
			const rules = game % 2 === 0 ? "squares" : "lines";
			const finished = selfPlay(mulberry32(game), rules);
			expect(["won", "drawn"]).toContain(finished.status);
			outcomes[finished.status as "won" | "drawn"] += 1;
			expect(finished.hand).toBeNull();
			expect(finished.log.length % 2).toBe(0);
		}
		expect(outcomes.won + outcomes.drawn).toBe(200);
		expect(outcomes.won).toBeGreaterThan(0);
	});
});
