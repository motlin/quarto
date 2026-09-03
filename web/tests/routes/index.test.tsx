// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {createMemoryHistory, createRouter, RouterProvider} from "@tanstack/react-router";
import {routeTree} from "../../src/routeTree.gen.js";
import {SETUP_KEY} from "../../src/setup/setup.js";
import {memoryStore, type Store} from "../../src/setup/storage.js";
import {ScriptedSolver} from "../../src/solver/scripted.js";

async function renderSetupRoute(store: Store = memoryStore()) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({initialEntries: ["/"]}),
		context: {store, createSolver: () => new ScriptedSolver()},
	});
	render(<RouterProvider router={router} />);
	await screen.findByRole("heading", {name: "QuartoBot"});
	return store;
}

// The router restores scroll on navigation and jsdom has no scrollTo; a no-op keeps the log clean.
window.scrollTo = () => {};

function playHref(): string {
	return screen.getByRole("link", {name: "Play"}).getAttribute("href") ?? "";
}

describe("setup route", () => {
	it("links Play to /play with the default setup", async () => {
		await renderSetupRoute();
		expect(playHref()).toBe("/play?opponent=bot&rules=squares&first=you&difficulty=impossible&annotations=outcome");
	});

	it("updates the Play link and remembers the choice after selecting Lines only", async () => {
		const store = await renderSetupRoute();
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		expect(playHref()).toContain("rules=lines");
		expect(JSON.parse(store.get(SETUP_KEY) ?? "{}")).toMatchObject({rules: "lines"});
	});

	it("preselects the remembered setup", async () => {
		const remembered = {
			opponent: "bot",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			annotations: "off",
			names: ["", ""],
		};
		await renderSetupRoute(memoryStore({[SETUP_KEY]: JSON.stringify(remembered)}));
		expect(screen.getByRole("radio", {name: "Lines only"}).getAttribute("aria-checked")).toBe("true");
		expect(playHref()).toContain("first=bot");
		expect(playHref()).toContain("difficulty=medium");
		expect(playHref()).toContain("annotations=off");
		expect(screen.getByRole("radio", {name: "Medium"}).getAttribute("aria-checked")).toBe("true");
	});

	it("hides the first-move and difficulty controls when the opponent is another person", async () => {
		await renderSetupRoute();
		expect(screen.getByRole("radiogroup", {name: "Who moves first"})).toBeDefined();
		expect(screen.getByRole("radiogroup", {name: "Difficulty"})).toBeDefined();
		fireEvent.click(screen.getByRole("radio", {name: "Another person"}));
		expect(screen.queryByRole("radiogroup", {name: "Who moves first"})).toBeNull();
		expect(screen.queryByRole("radiogroup", {name: "Difficulty"})).toBeNull();
		expect(playHref()).toContain("opponent=human");
		expect(screen.getByPlaceholderText("Player 1")).toBeDefined();
	});

	it("links to the rules and how-to-play pages", async () => {
		await renderSetupRoute();
		expect(screen.getByRole("link", {name: "Rules"}).getAttribute("href")).toBe("/rules");
		expect(screen.getByRole("link", {name: "How to play"}).getAttribute("href")).toBe("/how-to-play");
	});
});
