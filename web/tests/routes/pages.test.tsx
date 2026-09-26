// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {createMemoryHistory, createRouter, RouterProvider} from "@tanstack/react-router";
import {routeTree} from "../../src/routeTree.gen.js";
import {SETUP_KEY} from "../../src/setup/setup.js";
import {memoryStore, type Store} from "../../src/setup/storage.js";
import {ScriptedSolver} from "../../src/solver/scripted.js";

/** Renders the last of `entries` (default: just `path`), so a page can be opened directly or from another page. */
async function renderRoute(path: string, heading: string, store: Store = memoryStore(), entries = [path]) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({initialEntries: entries, initialIndex: entries.length - 1}),
		context: {store, gameStore: memoryStore(), createSolver: () => new ScriptedSolver(), prefetchBook: () => {}},
	});
	render(<RouterProvider router={router} />);
	await screen.findByRole("heading", {level: 1, name: heading});
	return router;
}

// The router restores scroll on navigation and jsdom has no scrollTo; a no-op keeps the log clean.
window.scrollTo = () => {};

function headings(level: number): string[] {
	return screen.getAllByRole("heading", {level}).map((element) => element.textContent);
}

describe("rules page", () => {
	it("walks through pieces, board, turns, winning, the 2x2 variant and the draw", async () => {
		await renderRoute("/rules", "Rules");
		expect(headings(2)).toEqual([
			"The pieces",
			"The board",
			"Taking turns",
			"Winning",
			"Lines and 2×2 squares",
			"A draw",
		]);
	});

	it("explains a turn as placing the piece you were handed, then picking one for your opponent", async () => {
		await renderRoute("/rules", "Rules");
		expect(screen.getByText(/The first player picks a piece for the second/).tagName).toBe("P");
		const steps = screen.getAllByRole("listitem").map((item) => item.querySelector("b")?.textContent);
		expect(steps).toEqual(["Place", "Pick"]);
		expect(screen.getByText(/piece you were handed/)).toBeDefined();
	});

	it("describes 2×2 squares as a setup option and a draw as the sixteenth piece being placed", async () => {
		await renderRoute("/rules", "Rules");
		expect(screen.getByText(/2×2 square/, {selector: "p"}).textContent).toMatch(/^With 2×2 squares turned on/);
		expect(screen.getByText(/sixteenth piece is placed/)).toBeDefined();
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

	it("says a win is called over a real table", async () => {
		await renderRoute("/rules", "Rules");
		expect(screen.getByText(/Over a real table/)).toBeDefined();
	});

	it("offers only Back, which leads to setup when the page was opened directly", async () => {
		await renderRoute(
			"/rules",
			"Rules",
			memoryStore({[SETUP_KEY]: JSON.stringify({opponent: "bot", rules: "lines", names: ["", ""]})}),
		);
		// Back appears above and below the text, so a reader at the end of the page need not scroll up.
		const backs = screen.getAllByRole("link", {name: /Back/});
		expect(backs).toHaveLength(2);
		expect(backs.map((link) => link.getAttribute("href"))).toEqual(["/", "/"]);
		expect(backs[1]?.compareDocumentPosition(screen.getByRole("article"))).toBe(Node.DOCUMENT_POSITION_PRECEDING);
		expect(screen.queryByRole("link", {name: "Play"})).toBeNull();
		expect(screen.queryByRole("button", {name: "Play"})).toBeNull();
		expect(screen.getByRole("link", {name: "Using the app"}).getAttribute("href")).toBe("/app");
	});

	it("returns to the game you came from, with its rules intact, when opened from a game", async () => {
		const game = "/play?opponent=bot&rules=lines&first=you&difficulty=impossible&annotations=off&undo=allowed";
		const router = await renderRoute("/rules", "Rules", memoryStore(), [game, "/rules"]);
		const backs = screen.getAllByRole("button", {name: /Back/});
		expect(backs).toHaveLength(2);
		fireEvent.click(backs[1]!);
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/play");
		});
		expect(router.state.location.search).toMatchObject({rules: "lines", annotations: "off"});
	});
});

describe("app page", () => {
	it("covers the verdict, move values, annotations, the controls and the solver", async () => {
		await renderRoute("/app", "Using the app");
		expect(headings(2)).toEqual([
			"Reading the verdict",
			"Move values",
			"Annotations",
			"Undo and New game",
			"Under the hood",
		]);
	});

	it("says annotations can be changed during a game", async () => {
		await renderRoute("/app", "Using the app");
		expect(screen.getByText(/changed at any time/).tagName).toBe("P");
		expect(screen.queryByText(/there is no toggle on the play screen/)).toBeNull();
	});

	it("leaves the rules of the game to the Rules page", async () => {
		await renderRoute("/app", "Using the app");
		expect(screen.queryByText(/piece you were handed/)).toBeNull();
		expect(screen.queryByRole("list")).toBeNull();
	});

	it("shows one example of every verdict and every move-value label", async () => {
		await renderRoute("/app", "Using the app");
		for (const verdict of ["Draw with perfect play", "You win in 3", "Bot wins in 2", "Player 1 wins in 4"]) {
			expect(screen.getByText(verdict).closest(".verdict")).not.toBeNull();
		}
		expect(screen.getByText("W3").className).toBe("chip win");
		expect(screen.getByText("L2").className).toBe("chip loss");
		expect(screen.getByText("=").className).toBe("chip draw");
	});

	it("credits the solver it is a port of", async () => {
		await renderRoute("/app", "Using the app");
		expect(screen.getByRole("link", {name: "Quarto-Solver"}).getAttribute("href")).toBe(
			"https://github.com/indjev99/Quarto-Solver",
		);
		expect(screen.getAllByRole("link", {name: /Back/}).map((link) => link.getAttribute("href"))).toEqual([
			"/",
			"/",
		]);
		expect(screen.queryByRole("link", {name: "Play"})).toBeNull();
		expect(screen.getByRole("link", {name: "Rules"}).getAttribute("href")).toBe("/rules");
	});
});
