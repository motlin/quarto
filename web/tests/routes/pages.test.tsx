// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {createMemoryHistory, createRouter, RouterProvider} from "@tanstack/react-router";
import {routeTree} from "../../src/routeTree.gen.js";
import {SETUP_KEY} from "../../src/setup/setup.js";
import {memoryStore, type Store} from "../../src/setup/storage.js";
import {ScriptedSolver} from "../../src/solver/scripted.js";

async function renderRoute(path: string, heading: string, store: Store = memoryStore()) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({initialEntries: [path]}),
		context: {store, createSolver: () => new ScriptedSolver()},
	});
	const view = render(<RouterProvider router={router} />);
	await screen.findByRole("heading", {level: 1, name: heading});
	return view;
}

// The router restores scroll on navigation and jsdom has no scrollTo; a no-op keeps the log clean.
window.scrollTo = () => {};

function headings(level: number): string[] {
	return screen.getAllByRole("heading", {level}).map((element) => element.textContent);
}

describe("rules page", () => {
	it("walks through pieces, board, winning, the 2x2 variant and the draw", async () => {
		await renderRoute("/rules", "Rules");
		expect(headings(2)).toEqual(["The pieces", "The board", "Winning", "Lines and 2×2 squares", "A draw"]);
	});

	it("shows all sixteen pieces, each named", async () => {
		await renderRoute("/rules", "Rules");
		const pieces = screen.getAllByRole("img", {name: /^(light|dark) (round|square) (tall|short) (solid|hollow)$/});
		expect(pieces).toHaveLength(16);
		expect(new Set(pieces.map((piece) => piece.getAttribute("aria-label"))).size).toBe(16);
	});

	it("explains that the 2x2 variant is chosen at setup and pictures both kinds of win", async () => {
		await renderRoute("/rules", "Rules");
		const variant = screen.getByText(/2×2 square/, {selector: "p"});
		expect(variant.textContent).toContain("setup");
		expect(screen.getByRole("img", {name: "Four different dark pieces in a row"})).toBeDefined();
		expect(screen.getByRole("img", {name: "Four tall pieces in a 2×2 square"})).toBeDefined();
	});

	it("links back to setup and to a game with the remembered setup", async () => {
		await renderRoute(
			"/rules",
			"Rules",
			memoryStore({
				[SETUP_KEY]: JSON.stringify({
					opponent: "bot",
					rules: "lines",
					first: "bot",
					annotations: "off",
					names: ["", ""],
				}),
			}),
		);
		expect(screen.getByRole("link", {name: "Setup"}).getAttribute("href")).toBe("/");
		expect(screen.getByRole("link", {name: "Play"}).getAttribute("href")).toBe(
			"/play?opponent=bot&rules=lines&first=bot&difficulty=impossible&annotations=off",
		);
		expect(screen.getByRole("link", {name: "How to play"}).getAttribute("href")).toBe("/how-to-play");
	});
});

describe("how-to-play page", () => {
	it("covers turns, the verdict, move values, annotations, the controls and the solver", async () => {
		await renderRoute("/how-to-play", "How to play");
		expect(headings(2)).toEqual([
			"Taking turns",
			"Reading the verdict",
			"Move values",
			"Annotations",
			"Undo and New game",
			"Under the hood",
		]);
	});

	it("shows one example of every verdict and every move-value label", async () => {
		await renderRoute("/how-to-play", "How to play");
		for (const verdict of ["Draw with perfect play", "You win in 3", "Bot wins in 2", "Player 1 wins in 4"]) {
			expect(screen.getByText(verdict).closest(".verdict")).not.toBeNull();
		}
		expect(screen.getByText("W3").className).toBe("chip win");
		expect(screen.getByText("L2").className).toBe("chip loss");
		expect(screen.getByText("=").className).toBe("chip draw");
	});

	it("credits the solver it is a port of", async () => {
		await renderRoute("/how-to-play", "How to play");
		expect(screen.getByRole("link", {name: "Quarto-Solver"}).getAttribute("href")).toBe(
			"https://github.com/indjev99/Quarto-Solver",
		);
		expect(screen.getByRole("link", {name: "Setup"}).getAttribute("href")).toBe("/");
		expect(screen.getByRole("link", {name: "Play"}).getAttribute("href")).toBe(
			"/play?opponent=bot&rules=squares&first=you&difficulty=impossible&annotations=outcome",
		);
		expect(screen.getByRole("link", {name: "Rules"}).getAttribute("href")).toBe("/rules");
	});
});
