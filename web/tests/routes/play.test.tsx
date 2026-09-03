// @vitest-environment jsdom
import {afterEach, describe, expect, it} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {createMemoryHistory, createRouter, RouterProvider} from "@tanstack/react-router";
import {cellFromName} from "../../src/game/cells.js";
import type {GameSetup} from "../../src/game/setup.js";
import {newGame} from "../../src/game/state.js";
import {routeTree} from "../../src/routeTree.gen.js";
import {playSearchSchema} from "../../src/routes/-play-search.js";
import {toGameSetup} from "../../src/setup/setup.js";
import {memoryStore} from "../../src/setup/storage.js";
import {type Script, ScriptedSolver} from "../../src/solver/scripted.js";
import {PlayScreen} from "../../src/ui/PlayScreen.js";
import {installPointerStubs, pointer} from "../ui/pointer.js";

const youFirst: GameSetup = {
	opponent: "bot",
	rules: "squares",
	first: "you",
	difficulty: "impossible",
	hints: "outcome",
	undo: "allowed",
	names: ["", ""],
};
const botFirst: GameSetup = {...youFirst, first: "bot"};
const twoPeople: GameSetup = {...youFirst, opponent: "human", hints: "off", names: ["Ada", "Grace"]};

/** "=" on every third move, then a win in two and a loss in three, so every label shape shows up. */
const VARIED: Script["moveValue"] = (move, movesLeft) => [0, movesLeft - 1, -(movesLeft - 2)][move % 3] ?? 0;

function renderPlay(setup: GameSetup, script: Partial<Script> = {}): ScriptedSolver {
	const solver = new ScriptedSolver(script, setup.rules);
	render(
		<PlayScreen
			setup={setup}
			createSolver={() => solver}
			engineDelayMilliseconds={0}
			backLink={<a href="/">Setup</a>}
			helpLink={<a href="/how-to-play">How to play</a>}
		/>,
	);
	return solver;
}

// The router restores scroll on navigation and jsdom has no scrollTo; a no-op keeps the log clean.
window.scrollTo = () => {};

afterEach(cleanup);

function tray(name: string): HTMLElement {
	return screen.getByRole("button", {name: `${name} piece`});
}

function cell(name: string): HTMLElement {
	return screen.getByRole("button", {name: new RegExp(`^cell ${name}`)});
}

function enabledSlots(): number {
	return screen.getAllByRole("button", {name: / piece$/}).filter((slot) => !slot.hasAttribute("disabled")).length;
}

function enabledCells(): number {
	return screen.getAllByRole("button", {name: /^cell /}).filter((slot) => !slot.hasAttribute("disabled")).length;
}

function handPiece(): HTMLElement {
	const found = document.querySelector(".hand-piece");
	if (!(found instanceof HTMLElement)) {
		throw new Error("No hand piece");
	}
	return found;
}

/** What one placement leaves behind on both sides, however the piece got to the cell. */
interface Placed {
	readonly kinds: readonly string[];
	readonly log: unknown;
	readonly board: string[];
}

async function afterPlacing(setup: GameSetup, placeOnC3: () => void): Promise<Placed> {
	const solver = renderPlay(setup);
	await screen.findByText("Choose a piece for Grace.");
	expect(handPiece().className).toBe("hand-piece empty");
	fireEvent.click(tray("dark round short hollow"));
	await screen.findByText("Place the dark round short hollow piece.");
	placeOnC3();
	await screen.findByText("Choose a piece for Ada.");
	return {
		kinds: solver.kinds(),
		log: solver.position.log,
		board: screen.getAllByRole("button", {name: /^cell /}).map((button) => button.getAttribute("aria-label") ?? ""),
	};
}

describe("PlayScreen against the bot", () => {
	it("lets the human choose, then the bot places and chooses, then asks the human to place", async () => {
		// The bot places whatever it is given on b2, then hands over the dark square tall solid piece.
		const solver = renderPlay(youFirst, {bestMoves: [cellFromName("b2"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		expect(enabledSlots()).toBe(16);
		expect(enabledCells()).toBe(0);

		fireEvent.click(tray("dark square short solid"));

		await screen.findByText("Place the dark square tall solid piece.");
		expect(screen.getByRole("button", {name: "cell b2, dark square short solid"})).toBeDefined();
		expect(cell("b2").className).toContain("last");
		expect(enabledCells()).toBe(15);
		expect(enabledSlots()).toBe(0);
		expect(solver.kinds()).toStrictEqual([
			"init",
			"setSeed",
			"evaluate",
			"applySelect",
			"evaluate",
			"bestMove",
			"applyPlace",
			"evaluate",
			"bestMove",
			"applySelect",
			"evaluate",
		]);
		expect(solver.requests[3]).toStrictEqual({kind: "applySelect", payload: {piece: 3}});
	});

	it("shows the verdict and the search cost from the oracle", async () => {
		// A value of 14 with 16 placements left is a win on the third placement from now.
		renderPlay(youFirst, {value: 14});
		await screen.findByText("You win in 3");
		expect(screen.getByText("You win in 3").closest(".verdict")?.className).toBe("verdict win");
		expect(screen.getByText("lines + squares · move 1 of 16 · 1,234 nodes · 5 ms")).toBeDefined();
	});

	it("labels every legal move with its value when the setup asks for values", async () => {
		const solver = renderPlay(
			{...youFirst, hints: "values"},
			{bestMoves: [cellFromName("a1"), 1], moveValue: VARIED},
		);
		await screen.findByText("Choose a piece for the bot.");
		await waitFor(() => {
			expect(screen.getAllByText("=")).toHaveLength(6);
		});
		expect(screen.getAllByText("W2")).toHaveLength(5);
		expect(screen.getAllByText("L3")).toHaveLength(5);
		expect(solver.kinds()).toContain("moveValues");

		fireEvent.click(tray("light round short solid"));
		await screen.findByText("Place the dark round short solid piece.");
		// Now the labels sit on the fifteen empty cells instead of the tray.
		await waitFor(() => {
			expect(screen.getAllByText("W2")).toHaveLength(5);
		});
		expect(cell("b1").querySelector(".hint")?.textContent).toBe("W2");
		expect(document.querySelectorAll(".slot .hint")).toHaveLength(0);
	});

	it("undoes the human's choice together with the bot's two plies", async () => {
		const solver = renderPlay(youFirst, {bestMoves: [cellFromName("b2"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		expect(screen.getByRole("button", {name: "Undo"}).hasAttribute("disabled")).toBe(true);
		fireEvent.click(tray("dark square short solid"));
		await screen.findByText("Place the dark square tall solid piece.");
		expect(screen.getByText("Move list · 1 placements")).toBeDefined();

		fireEvent.click(screen.getByRole("button", {name: "Undo"}));

		await screen.findByText("Choose a piece for the bot.");
		expect(enabledSlots()).toBe(16);
		expect(screen.getByRole("button", {name: "cell b2"})).toBeDefined();
		expect(screen.getByText("Move list · 0 placements")).toBeDefined();
		expect(solver.kinds().filter((kind) => kind === "undo")).toHaveLength(3);
		expect(solver.position.log).toStrictEqual([]);
		expect(solver.kinds().at(-1)).toBe("evaluate");
	});

	it("announces a win, colours the verdict and rings the winning cells", async () => {
		// Tall pieces along the top row; the human completes it with the fourth placement.
		renderPlay(youFirst, {bestMoves: [cellFromName("a1"), 5, cellFromName("c1"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		fireEvent.click(tray("light round tall solid"));
		await screen.findByText("Place the dark round tall solid piece.");
		fireEvent.click(cell("b1"));
		await screen.findByText("Choose a piece for the bot.");
		fireEvent.click(tray("light square tall solid"));
		await screen.findByText("Place the dark square tall solid piece.");
		fireEvent.click(cell("d1"));

		await screen.findByText("Quarto! You win.");
		expect(screen.getByText("You win").closest(".verdict")?.className).toBe("verdict win");
		for (const name of ["a1", "b1", "c1", "d1"]) {
			expect(cell(name).className).toContain("winning");
		}
		expect(cell("a2").className).not.toContain("winning");
		expect(enabledCells()).toBe(0);
		expect(enabledSlots()).toBe(0);
		expect(screen.getByText("lines + squares · move 5 of 16")).toBeDefined();
	});

	it("lets the bot open when it moves first, with the lamp on while it thinks", async () => {
		const solver = renderPlay(botFirst, {bestMoves: [9]});
		solver.hold("bestMove");
		await screen.findByText("Bot is thinking…");
		await waitFor(() => {
			expect(document.querySelector(".lamp.thinking")).not.toBeNull();
		});
		expect(screen.getByRole("heading", {level: 1}).textContent).toBe("Bot vs you · impossible");
		expect(enabledSlots()).toBe(0);

		solver.release();

		await screen.findByText("Place the dark round short hollow piece.");
		expect(document.querySelector(".lamp.thinking")).toBeNull();
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "evaluate", "bestMove", "applySelect", "evaluate"]);
	});

	it("asks the solver nothing about the position when annotations are off", async () => {
		const solver = renderPlay({...youFirst, hints: "off"}, {bestMoves: [cellFromName("b2"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		fireEvent.click(tray("dark square short solid"));
		await screen.findByText("Place the dark square tall solid piece.");
		expect(solver.kinds()).toStrictEqual([
			"init",
			"setSeed",
			"applySelect",
			"bestMove",
			"applyPlace",
			"bestMove",
			"applySelect",
		]);
		expect(document.querySelector(".oracle")).toBeNull();
		expect(document.querySelectorAll(".hint")).toHaveLength(0);
		expect(screen.getByText("lines + squares · move 2 of 16")).toBeDefined();
	});

	it("starts over with the same setup on New game", async () => {
		const solver = renderPlay(youFirst, {bestMoves: [cellFromName("b2"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		fireEvent.click(tray("dark square short solid"));
		await screen.findByText("Place the dark square tall solid piece.");

		fireEvent.click(screen.getByRole("button", {name: "New game"}));

		await screen.findByText("Choose a piece for the bot.");
		expect(enabledSlots()).toBe(16);
		expect(solver.kinds()).toContain("reset");
		expect(solver.position.log).toStrictEqual([]);
	});
});

describe("PlayScreen against the Medium bot", () => {
	const medium: GameSetup = {...youFirst, difficulty: "medium"};

	it("never asks the solver for a move, yet still asks it for the verdict", async () => {
		const solver = renderPlay(medium, {value: 14});
		await screen.findByText("Choose a piece for the bot.");
		expect(screen.getByRole("heading", {level: 1}).textContent).toBe("You vs bot · medium");
		await screen.findByText("You win in 3");

		fireEvent.click(tray("dark square short solid"));

		await screen.findByText(/^Place the .* piece\.$/);
		expect(screen.getByText("Move list · 1 placements")).toBeDefined();
		expect(enabledCells()).toBe(15);
		expect(solver.kinds()).not.toContain("bestMove");
		expect(solver.kinds()).toStrictEqual([
			"init",
			"setSeed",
			"evaluate",
			"applySelect",
			"evaluate",
			"applyPlace",
			"evaluate",
			"applySelect",
			"evaluate",
		]);
		expect(solver.position.log).toHaveLength(3);
	});

	it("opens with a choice only when it moves first", async () => {
		const solver = renderPlay({...medium, first: "bot", hints: "off"});
		await screen.findByText(/^Place the .* piece\.$/);
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "applySelect"]);
		expect(enabledCells()).toBe(16);
	});
});

describe("PlayScreen between two people", () => {
	it("alternates the two names, never asks the solver for a move, and undoes one ply", async () => {
		const solver = renderPlay(twoPeople);
		await screen.findByText("Choose a piece for Grace.");
		expect(screen.getByRole("heading", {level: 1}).textContent).toBe("Ada vs Grace");
		expect(screen.getByText("Ada", {selector: ".prompt"})).toBeDefined();

		fireEvent.click(tray("dark round short hollow"));
		await screen.findByText("Place the dark round short hollow piece.");
		expect(screen.getByText("Grace", {selector: ".prompt"})).toBeDefined();

		fireEvent.click(cell("c3"));
		await screen.findByText("Choose a piece for Ada.");
		expect(screen.getByText("Grace", {selector: ".prompt"})).toBeDefined();
		expect(screen.getByText("Move list · 1 placements")).toBeDefined();

		fireEvent.click(screen.getByRole("button", {name: "Undo"}));
		await screen.findByText("Place the dark round short hollow piece.");
		expect(screen.getByRole("button", {name: "cell c3"})).toBeDefined();

		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "applySelect", "applyPlace", "undo"]);
		expect(document.querySelector(".oracle")).toBeNull();
	});

	it("places by dragging the piece in hand onto a cell exactly as a tap on the cell does", async () => {
		const stubs = installPointerStubs();
		const byTap = await afterPlacing(twoPeople, () => {
			fireEvent.click(cell("c3"));
		});
		cleanup();

		const byDrag = await afterPlacing(twoPeople, () => {
			const hand = handPiece();
			expect(hand.className).toBe("hand-piece draggable");
			pointer(hand, "pointerdown", {x: 20, y: 30});
			stubs.hitTest(cell("c3"));
			pointer(hand, "pointermove", {x: 200, y: 300});
			expect(cell("c3").className).toBe("cell legal drop");
			expect(document.querySelector(".drag-ghost .piece")).not.toBeNull();
			pointer(hand, "pointerup", {x: 200, y: 300});
		});

		expect(document.querySelector(".drag-ghost")).toBeNull();
		expect(document.querySelector(".cell.drop")).toBeNull();
		expect(byDrag).toStrictEqual(byTap);
		expect(byDrag.kinds).toStrictEqual(["init", "setSeed", "applySelect", "applyPlace"]);
		expect(byDrag.board[cellFromName("c3")]).toBe("cell c3, dark round short hollow");
		// Nothing to place now, so the hand is no longer a drag surface.
		expect(handPiece().className).toBe("hand-piece empty");
	});

	it("names the winner in the neutral colour", async () => {
		renderPlay({...twoPeople, hints: "outcome"});
		await screen.findByText("Choose a piece for Grace.");
		const moves: readonly [string, string][] = [
			["light round tall solid", "a1"],
			["dark round tall solid", "b1"],
			["light square tall solid", "c1"],
			["dark square tall solid", "d1"],
		];
		for (const [piece, target] of moves) {
			fireEvent.click(tray(piece));
			await screen.findByText(new RegExp(`^Place the ${piece} piece\\.$`));
			fireEvent.click(cell(target));
		}
		await screen.findByText("Quarto! Ada wins.");
		expect(screen.getByText("Ada wins").closest(".verdict")?.className).toBe("verdict decisive");
	});
});

describe("PlayScreen with undo off", () => {
	const noUndo: GameSetup = {...youFirst, hints: "off", undo: "off"};
	const CONFIRM_PROMPT = "Confirm your turn, or take it back.";

	function control(name: string): HTMLElement {
		return screen.getByRole("button", {name});
	}

	it("holds the human's choice back from the solver until Confirm, then lets the bot reply", async () => {
		const solver = renderPlay(noUndo, {bestMoves: [cellFromName("b2"), 7]});
		await screen.findByText("Choose a piece for the bot.");
		expect(screen.queryByRole("button", {name: "Undo"})).toBeNull();
		expect(control("Confirm").hasAttribute("disabled")).toBe(true);
		expect(control("Confirm").className).toBe("btn primary");
		expect(control("Take back").hasAttribute("disabled")).toBe(true);

		fireEvent.click(tray("dark square short solid"));

		await screen.findByText(CONFIRM_PROMPT);
		expect(tray("dark square short solid").className).toContain("pending");
		expect(handPiece().className).toBe("hand-piece");
		expect(enabledSlots()).toBe(0);
		expect(solver.kinds()).toStrictEqual(["init", "setSeed"]);
		expect(control("Take back").hasAttribute("disabled")).toBe(false);

		fireEvent.click(control("Confirm"));

		await screen.findByText("Place the dark square tall solid piece.");
		expect(solver.kinds()).toStrictEqual([
			"init",
			"setSeed",
			"applySelect",
			"bestMove",
			"applyPlace",
			"bestMove",
			"applySelect",
		]);
		expect(solver.requests[2]).toStrictEqual({kind: "applySelect", payload: {piece: 3}});
		expect(screen.getByText("Move list · 1 placements")).toBeDefined();
	});

	it("shows the provisional placement on the board and sends both plies only on Confirm", async () => {
		const solver = renderPlay({...noUndo, first: "bot"}, {bestMoves: [7, cellFromName("b2"), 9]});
		await screen.findByText("Place the dark square tall solid piece.");
		const requestsBefore = solver.requests.length;

		fireEvent.click(cell("c3"));

		await screen.findByText("Choose a piece for the bot.");
		expect(screen.getByRole("button", {name: "cell c3, dark square tall solid, unconfirmed"}).className).toBe(
			"cell pending",
		);
		expect(enabledCells()).toBe(0);
		expect(enabledSlots()).toBe(15);
		expect(handPiece().className).toBe("hand-piece empty");
		expect(control("Confirm").hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("Move list · 0 placements")).toBeDefined();

		fireEvent.click(tray("light round short hollow"));

		await screen.findByText(CONFIRM_PROMPT);
		expect(control("Confirm").hasAttribute("disabled")).toBe(false);
		expect(solver.requests).toHaveLength(requestsBefore);

		fireEvent.click(control("Confirm"));

		await screen.findByText("Place the dark round short hollow piece.");
		expect(solver.requests.slice(requestsBefore)).toStrictEqual([
			{kind: "applyPlace", payload: {cell: cellFromName("c3")}},
			{kind: "applySelect", payload: {piece: 8}},
			{kind: "bestMove", payload: undefined},
			{kind: "applyPlace", payload: {cell: cellFromName("b2")}},
			{kind: "bestMove", payload: undefined},
			{kind: "applySelect", payload: {piece: 9}},
		]);
		expect(cell("c3").className).toBe("cell");
		expect(cell("b2").className).toBe("cell last");
		expect(solver.position.log).toHaveLength(5);
	});

	it("takes back the selection first, then the placement, restoring each earlier provisional state", async () => {
		const solver = renderPlay({...noUndo, first: "bot"}, {bestMoves: [7]});
		await screen.findByText("Place the dark square tall solid piece.");
		fireEvent.click(cell("c3"));
		await screen.findByText("Choose a piece for the bot.");
		fireEvent.click(tray("light round short hollow"));
		await screen.findByText(CONFIRM_PROMPT);

		fireEvent.click(control("Take back"));

		await screen.findByText("Choose a piece for the bot.");
		expect(tray("light round short hollow").className).not.toContain("pending");
		expect(cell("c3").className).toBe("cell pending");
		expect(enabledSlots()).toBe(15);

		fireEvent.click(control("Take back"));

		await screen.findByText("Place the dark square tall solid piece.");
		expect(cell("c3").className).toBe("cell legal");
		expect(enabledCells()).toBe(16);
		expect(handPiece().className).toBe("hand-piece draggable");
		expect(control("Take back").hasAttribute("disabled")).toBe(true);
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "bestMove", "applySelect"]);
	});

	it("keeps the committed position's verdict and asks the oracle nothing about the provisional one", async () => {
		const solver = renderPlay({...noUndo, hints: "outcome"}, {value: 14});
		await screen.findByText("You win in 3");
		fireEvent.click(tray("dark square short solid"));
		await screen.findByText(CONFIRM_PROMPT);
		expect(screen.getByText("You win in 3")).toBeDefined();
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "evaluate"]);
	});

	it("makes each person's turn provisional and never shows Undo between two people", async () => {
		const solver = renderPlay({...twoPeople, undo: "off"});
		await screen.findByText("Choose a piece for Grace.");
		expect(screen.queryByRole("button", {name: "Undo"})).toBeNull();
		fireEvent.click(tray("dark round short hollow"));
		await screen.findByText(CONFIRM_PROMPT);
		expect(screen.getByText("Ada", {selector: ".prompt"})).toBeDefined();
		fireEvent.click(control("Confirm"));

		await screen.findByText("Place the dark round short hollow piece.");
		expect(screen.getByText("Grace", {selector: ".prompt"})).toBeDefined();
		fireEvent.click(cell("c3"));
		await screen.findByText("Choose a piece for Ada.");
		fireEvent.click(tray("light round short hollow"));
		await screen.findByText(CONFIRM_PROMPT);
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "applySelect"]);
		fireEvent.click(control("Confirm"));

		await screen.findByText("Place the light round short hollow piece.");
		expect(screen.getByText("Ada", {selector: ".prompt"})).toBeDefined();
		expect(solver.kinds()).toStrictEqual(["init", "setSeed", "applySelect", "applyPlace", "applySelect"]);
	});

	it("waits for Confirm before declaring a winning placement", async () => {
		renderPlay({...twoPeople, undo: "off"});
		await screen.findByText("Choose a piece for Grace.");
		const handovers: readonly [string, string | null][] = [
			["light round tall solid", null],
			["dark round tall solid", "a1"],
			["light square tall solid", "b1"],
			["dark square tall solid", "c1"],
		];
		for (const [piece, target] of handovers) {
			if (target !== null) {
				fireEvent.click(cell(target));
			}
			fireEvent.click(tray(piece));
			await screen.findByText(CONFIRM_PROMPT);
			fireEvent.click(control("Confirm"));
			await screen.findByText(`Place the ${piece} piece.`);
		}

		fireEvent.click(cell("d1"));

		await screen.findByText(CONFIRM_PROMPT);
		expect(screen.queryByText("Quarto! Ada wins.")).toBeNull();
		expect(cell("d1").className).toBe("cell pending");
		expect(enabledSlots()).toBe(0);
		expect(enabledCells()).toBe(0);
		expect(document.querySelector(".cell.winning")).toBeNull();

		fireEvent.click(control("Confirm"));

		await screen.findByText("Quarto! Ada wins.");
		for (const name of ["a1", "b1", "c1", "d1"]) {
			expect(cell(name).className).toContain("winning");
		}
		expect(control("Confirm").hasAttribute("disabled")).toBe(true);
	});
});

describe("the same setup search starts the same game", () => {
	it("gives the same initial state for the same URL", () => {
		const search = playSearchSchema.parse({opponent: "human", rules: "lines", annotations: "values", name1: "Ada"});
		expect(newGame(toGameSetup(search))).toStrictEqual(newGame(toGameSetup(playSearchSchema.parse({...search}))));
		expect(newGame(toGameSetup(search)).setup).toStrictEqual({
			opponent: "human",
			rules: "lines",
			first: "you",
			difficulty: "impossible",
			hints: "values",
			undo: "allowed",
			names: ["Ada", "Player 2"],
		});
	});
});

describe("/play route", () => {
	it("reads the setup from the search, titles the game and links back to setup and help", async () => {
		const router = createRouter({
			routeTree,
			history: createMemoryHistory({initialEntries: ["/play?opponent=human&rules=lines&name1=Ada&name2=Grace"]}),
			context: {store: memoryStore(), createSolver: () => new ScriptedSolver()},
		});
		render(<RouterProvider router={router} />);
		await screen.findByRole("heading", {level: 1, name: "Ada vs Grace"});
		await screen.findByText("Choose a piece for Grace.");
		expect(screen.getByRole("link", {name: /Setup/}).getAttribute("href")).toBe("/");
		expect(screen.getByRole("link", {name: "How to play"}).getAttribute("href")).toBe("/how-to-play");
		expect(screen.getByText("lines only · move 1 of 16")).toBeDefined();
	});
});
