import {describe, it, expect} from "vitest";
import {ALL_CELLS, asCell, cellFromName} from "../../src/game/cells.js";
import {ALL_PIECES, asPiece} from "../../src/game/pieces.js";
import type {GameSetup} from "../../src/game/setup.js";
import {
	applyPlace,
	applySelect,
	awaitsPlacement,
	awaitsSelection,
	boardWithPending,
	confirmTurn,
	type GameState,
	handWithPending,
	hasPending,
	isHumanToMove,
	isToPlace,
	isTurnComplete,
	movesDone,
	movesLeft,
	newGame,
	provisionalPlace,
	provisionalSelect,
	takeBack,
	undoToHumanDecision,
	type Verdict,
	withHints,
	withVerdict,
} from "../../src/game/state.js";

const setup: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "you",
	difficulty: "impossible",
	hints: "values",
	undo: "allowed",
	names: ["Player 1", "Player 2"],
};

const verdict: Verdict = {value: 0, movesLeft: 16, mover: 0, nodes: 1234, milliseconds: 5};

/** Plays `piece` to `cell` pairs from the start, selecting then placing each. */
function play(start: GameState, moves: readonly [number, string][]): GameState {
	let state = start;
	for (const [piece, cell] of moves) {
		state = applyPlace(applySelect(state, asPiece(piece)), cellFromName(cell));
	}
	return state;
}

describe("newGame", () => {
	it("starts empty with every piece in the tray", () => {
		expect(newGame(setup)).toStrictEqual({
			setup,
			board: ALL_CELLS.map(() => null),
			hand: null,
			remaining: [...ALL_PIECES],
			log: [],
			lastCell: null,
			status: "playing",
			verdict: null,
			hintValues: null,
			pending: {placedCell: null, selectedPiece: null},
		});
		expect(movesDone(newGame(setup))).toBe(0);
		expect(movesLeft(newGame(setup))).toBe(16);
		expect(isToPlace(newGame(setup))).toBe(false);
		expect(isHumanToMove(newGame(setup))).toBe(true);
	});
});

describe("applySelect", () => {
	it("moves the piece from the tray to the hand and logs it", () => {
		const state = applySelect(newGame(setup), asPiece(5));
		expect(state.hand).toBe(5);
		expect(state.remaining).toStrictEqual(ALL_PIECES.filter((piece) => piece !== 5));
		expect(state.log).toStrictEqual([{kind: "select", player: 0, piece: 5}]);
		expect(isToPlace(state)).toBe(true);
		expect(isHumanToMove(state)).toBe(false);
	});

	it("does not touch the original state", () => {
		const start = newGame(setup);
		applySelect(start, asPiece(5));
		expect(start).toStrictEqual(newGame(setup));
	});

	it("clears a verdict and hints from the previous decision", () => {
		const annotated = withHints(withVerdict(newGame(setup), verdict), new Map([[5, 0]]));
		const state = applySelect(annotated, asPiece(5));
		expect(state.verdict).toBeNull();
		expect(state.hintValues).toBeNull();
	});

	it("refuses while a piece is in hand", () => {
		const state = applySelect(newGame(setup), asPiece(5));
		expect(applySelect(state, asPiece(6))).toBe(state);
	});

	it("refuses a piece already used", () => {
		const state = play(newGame(setup), [[5, "a1"]]);
		expect(applySelect(state, asPiece(5))).toBe(state);
	});

	it("refuses once the game is over", () => {
		const state = play(newGame(setup), [
			[1, "a1"],
			[3, "b1"],
			[5, "c1"],
			[7, "d1"],
		]);
		expect(state.status).toBe("won");
		expect(applySelect(state, asPiece(9))).toBe(state);
	});
});

describe("applyPlace", () => {
	it("puts the hand on the board and remembers the cell", () => {
		const state = applyPlace(applySelect(newGame(setup), asPiece(5)), cellFromName("b3"));
		expect(state.board[cellFromName("b3")]).toBe(5);
		expect(state.hand).toBeNull();
		expect(state.lastCell).toBe(cellFromName("b3"));
		expect(state.log).toStrictEqual([
			{kind: "select", player: 0, piece: 5},
			{kind: "place", player: 1, piece: 5, cell: cellFromName("b3")},
		]);
		expect(state.status).toBe("playing");
		expect(movesDone(state)).toBe(1);
		expect(movesLeft(state)).toBe(15);
		expect(isToPlace(state)).toBe(false);
		expect(isHumanToMove(state)).toBe(false);
	});

	it("refuses with nothing in hand", () => {
		const state = newGame(setup);
		expect(applyPlace(state, cellFromName("a1"))).toBe(state);
	});

	it("refuses an occupied cell", () => {
		const state = applySelect(play(newGame(setup), [[5, "a1"]]), asPiece(6));
		expect(applyPlace(state, cellFromName("a1"))).toBe(state);
	});

	it("wins when a line shares a trait", () => {
		const state = play(newGame(setup), [
			[1, "a1"],
			[3, "b1"],
			[5, "c1"],
			[7, "d1"],
		]);
		expect(state.status).toBe("won");
		expect(applyPlace(applySelect(state, asPiece(9)), cellFromName("a2"))).toBe(state);
	});

	it("wins on a 2x2 square only under the squares rules", () => {
		const moves: [number, string][] = [
			[8, "b2"],
			[9, "c2"],
			[10, "b3"],
			[11, "c3"],
		];
		expect(play(newGame(setup), moves).status).toBe("won");
		expect(play(newGame({...setup, rules: "lines"}), moves).status).toBe("playing");
	});

	it("draws when the board fills without a line", () => {
		const order = [15, 3, 9, 10, 13, 2, 5, 12, 0, 8, 4, 11, 6, 7, 14, 1];
		let state = newGame(setup);
		for (const [cell, piece] of order.entries()) {
			state = applyPlace(applySelect(state, asPiece(piece)), asCell(cell));
			expect(state.status).toBe(cell === 15 ? "drawn" : "playing");
		}
		expect(state.remaining).toStrictEqual([]);
		expect(movesLeft(state)).toBe(0);
	});
});

describe("undoToHumanDecision", () => {
	it("refuses on an empty log", () => {
		const state = newGame(setup);
		expect(undoToHumanDecision(state)).toBe(state);
	});

	it("rewinds past the bot's reply to the human's last decision", () => {
		// Human selects 5, bot places it and selects 6, human places 6 and is to select again.
		const before = play(newGame(setup), [
			[5, "a1"],
			[6, "b1"],
		]);
		expect(isHumanToMove(before)).toBe(true);
		// Human selects 7, bot places it and selects 9: the human is to place.
		const state = applySelect(applyPlace(applySelect(before, asPiece(7)), cellFromName("c1")), asPiece(9));
		expect(isHumanToMove(state)).toBe(true);
		expect(undoToHumanDecision(state)).toStrictEqual(before);
	});

	it("goes back to the start when the human has only selected", () => {
		// After the human's select it is the bot's turn to place, so the human's last decision point is the start.
		const state = applySelect(applyPlace(applySelect(newGame(setup), asPiece(5)), cellFromName("a1")), asPiece(6));
		expect(undoToHumanDecision(state)).toStrictEqual(newGame(setup));
	});

	it("rewinds one ply between two people", () => {
		const twoPeople = newGame({...setup, opponent: "human"});
		const before = applySelect(twoPeople, asPiece(5));
		const state = applyPlace(before, cellFromName("a1"));
		expect(undoToHumanDecision(state)).toStrictEqual(before);
	});

	it("restores the previous last cell and reopens a won game", () => {
		const won = play(newGame(setup), [
			[1, "a1"],
			[3, "b1"],
			[5, "c1"],
			[7, "d1"],
		]);
		// The human placed the winning piece, so one ply back is the human holding it again.
		const undone = undoToHumanDecision(won);
		expect(undone.status).toBe("playing");
		expect(undone.hand).toBe(7);
		expect(undone.lastCell).toBe(cellFromName("c1"));
		expect(undone.log).toHaveLength(7);
		expect(isHumanToMove(undone)).toBe(true);
	});

	it("goes back to the start when the bot went first", () => {
		const botFirst = newGame({...setup, first: "bot"});
		const state = applySelect(botFirst, asPiece(5));
		expect(isHumanToMove(state)).toBe(true);
		expect(undoToHumanDecision(state)).toStrictEqual(botFirst);
	});

	it("drops the verdict and hints", () => {
		const state = withHints(withVerdict(applySelect(newGame(setup), asPiece(5)), verdict), new Map([[0, 1]]));
		const undone = undoToHumanDecision(state);
		expect(undone.verdict).toBeNull();
		expect(undone.hintValues).toBeNull();
	});
});

describe("withVerdict and withHints", () => {
	it("attach annotations to a live game", () => {
		const hints = new Map([[3, -5]]);
		const state = withHints(withVerdict(newGame(setup), verdict), hints);
		expect(state.verdict).toStrictEqual(verdict);
		expect(state.hintValues).toBe(hints);
	});

	it("refuse once the game is over", () => {
		const state = play(newGame(setup), [
			[1, "a1"],
			[3, "b1"],
			[5, "c1"],
			[7, "d1"],
		]);
		expect(withVerdict(state, verdict)).toBe(state);
		expect(withHints(state, new Map())).toBe(state);
	});
});

describe("a provisional turn", () => {
	// Two people, undo off: seat 0 hands over piece 5, seat 1 places it and is to hand a piece back.
	const twoPeople = newGame({...setup, opponent: "human", undo: "off"});
	const midTurn = applySelect(twoPeople, asPiece(5));

	it("starts with nothing pending and the piece in hand awaiting placement", () => {
		expect(hasPending(midTurn)).toBe(false);
		expect(awaitsPlacement(midTurn)).toBe(true);
		expect(awaitsSelection(midTurn)).toBe(false);
		expect(isTurnComplete(midTurn)).toBe(false);
		expect(boardWithPending(midTurn)).toStrictEqual(midTurn.board);
		expect(handWithPending(midTurn)).toBe(5);
	});

	it("places provisionally without touching the board, the log or the hand", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		expect(placed.pending).toStrictEqual({placedCell: cellFromName("b2"), selectedPiece: null});
		expect(placed.board).toStrictEqual(midTurn.board);
		expect(placed.log).toStrictEqual(midTurn.log);
		expect(placed.hand).toBe(5);
		expect(hasPending(placed)).toBe(true);
		expect(awaitsPlacement(placed)).toBe(false);
		expect(awaitsSelection(placed)).toBe(true);
		expect(isTurnComplete(placed)).toBe(false);
		expect(boardWithPending(placed)[cellFromName("b2")]).toBe(5);
		expect(handWithPending(placed)).toBeNull();
		expect(movesDone(placed)).toBe(0);
		expect(isHumanToMove(placed)).toBe(true);
	});

	it("refuses a second provisional placement, an occupied cell and a placement with nothing in hand", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		expect(provisionalPlace(placed, cellFromName("c3"))).toBe(placed);
		const occupied = applySelect(play(twoPeople, [[6, "a1"]]), asPiece(7));
		expect(provisionalPlace(occupied, cellFromName("a1"))).toBe(occupied);
		expect(provisionalPlace(twoPeople, cellFromName("a1"))).toBe(twoPeople);
	});

	it("refuses to select before the piece in hand is placed", () => {
		expect(provisionalSelect(midTurn, asPiece(6))).toBe(midTurn);
	});

	it("selects provisionally after the placement, showing the piece in hand and leaving the tray alone", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		const selected = provisionalSelect(placed, asPiece(6));
		expect(selected.pending).toStrictEqual({placedCell: cellFromName("b2"), selectedPiece: 6});
		expect(selected.remaining).toStrictEqual(placed.remaining);
		expect(selected.log).toStrictEqual(placed.log);
		expect(handWithPending(selected)).toBe(6);
		expect(awaitsSelection(selected)).toBe(false);
		expect(isTurnComplete(selected)).toBe(true);
		expect(provisionalSelect(selected, asPiece(7))).toBe(selected);
	});

	it("refuses a piece that is not in the tray", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		expect(provisionalSelect(placed, asPiece(5))).toBe(placed);
	});

	it("takes back the selection first, then the placement, then nothing", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		const selected = provisionalSelect(placed, asPiece(6));
		const backOne = takeBack(selected);
		expect(backOne).toStrictEqual(placed);
		const backTwo = takeBack(backOne);
		expect(backTwo).toStrictEqual(midTurn);
		expect(takeBack(backTwo)).toBe(backTwo);
	});

	it("confirms both plies in order and clears the pending turn", () => {
		const selected = provisionalSelect(provisionalPlace(midTurn, cellFromName("b2")), asPiece(6));
		const committed = confirmTurn(selected);
		expect(committed).toStrictEqual(applySelect(applyPlace(midTurn, cellFromName("b2")), asPiece(6)));
		expect(committed.pending).toStrictEqual({placedCell: null, selectedPiece: null});
		expect(committed.log).toHaveLength(3);
		expect(committed.hand).toBe(6);
	});

	it("does not confirm an incomplete turn", () => {
		expect(confirmTurn(midTurn)).toBe(midTurn);
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		expect(confirmTurn(placed)).toBe(placed);
	});

	it("needs only a selection on the first turn of the game", () => {
		expect(awaitsPlacement(twoPeople)).toBe(false);
		expect(awaitsSelection(twoPeople)).toBe(true);
		const selected = provisionalSelect(twoPeople, asPiece(5));
		expect(handWithPending(selected)).toBe(5);
		expect(isTurnComplete(selected)).toBe(true);
		expect(confirmTurn(selected)).toStrictEqual(midTurn);
	});

	it("needs only a placement on the last turn of the game", () => {
		const order = [15, 3, 9, 10, 13, 2, 5, 12, 0, 8, 4, 11, 6, 7, 14];
		let state = twoPeople;
		for (const [cell, piece] of order.entries()) {
			state = applyPlace(applySelect(state, asPiece(piece)), asCell(cell));
		}
		const lastInHand = applySelect(state, asPiece(1));
		const placed = provisionalPlace(lastInHand, asCell(15));
		expect(awaitsSelection(placed)).toBe(false);
		expect(isTurnComplete(placed)).toBe(true);
		expect(provisionalSelect(placed, asPiece(1))).toBe(placed);
		expect(confirmTurn(placed).status).toBe("drawn");
	});

	it("needs only a placement when the placement wins, and the win waits for the confirmation", () => {
		const threeTall = play(twoPeople, [
			[1, "a1"],
			[3, "b1"],
			[5, "c1"],
		]);
		const placed = provisionalPlace(applySelect(threeTall, asPiece(7)), cellFromName("d1"));
		expect(placed.status).toBe("playing");
		expect(awaitsSelection(placed)).toBe(false);
		expect(isTurnComplete(placed)).toBe(true);
		expect(provisionalSelect(placed, asPiece(9))).toBe(placed);
		const won = confirmTurn(placed);
		expect(won.status).toBe("won");
		expect(won.pending).toStrictEqual({placedCell: null, selectedPiece: null});
	});

	it("keeps the committed position's verdict and hints while the turn is unconfirmed", () => {
		const annotated = withHints(withVerdict(midTurn, verdict), new Map([[5, 0]]));
		const placed = provisionalPlace(annotated, cellFromName("b2"));
		expect(placed.verdict).toStrictEqual(verdict);
		expect(placed.hintValues).toStrictEqual(new Map([[5, 0]]));
		expect(confirmTurn(provisionalSelect(placed, asPiece(6))).verdict).toBeNull();
	});

	it("refuses committed moves while a turn is pending", () => {
		const placed = provisionalPlace(midTurn, cellFromName("b2"));
		expect(applyPlace(placed, cellFromName("c3"))).toBe(placed);
		const selected = provisionalSelect(twoPeople, asPiece(5));
		expect(applySelect(selected, asPiece(6))).toBe(selected);
	});
});
