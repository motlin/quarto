// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {createMemoryHistory, createRouter, RouterProvider} from "@tanstack/react-router";
import type {Rules} from "../../src/game/rules.js";
import {routeTree} from "../../src/routeTree.gen.js";
import {BOOK_PREFETCH_DELAY_MILLISECONDS} from "../../src/routes/index.js";
import {DEFAULT_SETUP, SETUP_KEY} from "../../src/setup/setup.js";
import {memoryStore, type Store} from "../../src/setup/storage.js";
import {ScriptedSolver} from "../../src/solver/scripted.js";

async function renderSetupRoute(
	store: Store = memoryStore(),
	prefetchBook: (rules: Rules) => void = () => {},
	initialEntry = "/",
) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({initialEntries: [initialEntry]}),
		context: {store, createSolver: () => new ScriptedSolver(), prefetchBook},
	});
	render(<RouterProvider router={router} />);
	await screen.findByRole("heading", {name: "QuartoBot"});
	return {store, router};
}

// The router restores scroll on navigation and jsdom has no scrollTo; a no-op keeps the log clean.
window.scrollTo = () => {};

function playHref(): string {
	return screen.getByRole("link", {name: "Play"}).getAttribute("href") ?? "";
}

describe("setup route", () => {
	it("links Play to /play with the default setup", async () => {
		await renderSetupRoute();
		expect(playHref()).toBe(
			"/play?opponent=bot&rules=squares&first=you&difficulty=impossible&annotations=outcome&undo=allowed",
		);
	});

	it("updates the Play link and remembers the choice after selecting Lines only", async () => {
		const {store} = await renderSetupRoute();
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		expect(playHref()).toContain("rules=lines");
		expect(JSON.parse(store.get(SETUP_KEY) ?? "{}")).toMatchObject({rules: "lines"});
	});

	it("keeps the address bar in step with the setup so the configuration can be shared", async () => {
		const {router} = await renderSetupRoute();
		expect(router.state.location.href).toBe("/");
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		await waitFor(() => {
			expect(router.state.location.href).toBe(
				"/?opponent=bot&rules=lines&first=you&difficulty=impossible&annotations=outcome&undo=allowed",
			);
		});
		fireEvent.click(screen.getByRole("radio", {name: "Medium"}));
		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({rules: "lines", difficulty: "medium"});
		});
		// Each tweak replaces the entry rather than stacking one, so Back still leaves the setup screen.
		expect(router.history.canGoBack()).toBe(false);
	});

	it("preselects the setup a shared URL carries over the remembered one", async () => {
		const remembered = {...DEFAULT_SETUP, rules: "squares", difficulty: "impossible"};
		const {store} = await renderSetupRoute(
			memoryStore({[SETUP_KEY]: JSON.stringify(remembered)}),
			() => {},
			"/?opponent=human&rules=lines&name1=Ada",
		);
		expect(screen.getByRole("radio", {name: "Lines only"}).getAttribute("aria-checked")).toBe("true");
		expect(screen.getByRole("radio", {name: "Another person"}).getAttribute("aria-checked")).toBe("true");
		expect(screen.getByPlaceholderText<HTMLInputElement>("Player 1").value).toBe("Ada");
		expect(playHref()).toBe(
			"/play?opponent=human&rules=lines&first=you&difficulty=impossible&annotations=outcome&undo=allowed&name1=Ada",
		);
		// Landing on a shared link does not overwrite what this browser remembered until something is changed.
		expect(JSON.parse(store.get(SETUP_KEY) ?? "{}")).toMatchObject({rules: "squares"});
	});

	it("ignores a URL value it does not understand and keeps the remembered choice", async () => {
		await renderSetupRoute(
			memoryStore({[SETUP_KEY]: JSON.stringify({...DEFAULT_SETUP, rules: "lines"})}),
			() => {},
			"/?rules=diagonals",
		);
		expect(screen.getByRole("radio", {name: "Lines only"}).getAttribute("aria-checked")).toBe("true");
	});

	it("preselects the remembered setup", async () => {
		const remembered = {
			opponent: "bot",
			rules: "lines",
			first: "bot",
			difficulty: "medium",
			annotations: "off",
			undo: "off",
			names: ["", ""],
		};
		await renderSetupRoute(memoryStore({[SETUP_KEY]: JSON.stringify(remembered)}));
		expect(screen.getByRole("radio", {name: "Lines only"}).getAttribute("aria-checked")).toBe("true");
		expect(playHref()).toContain("first=bot");
		expect(playHref()).toContain("difficulty=medium");
		expect(playHref()).toContain("annotations=off");
		expect(screen.getByRole("radio", {name: "Medium"}).getAttribute("aria-checked")).toBe("true");
		expect(playHref()).toContain("undo=off");
		const undo = within(screen.getByRole("radiogroup", {name: "Undo"}));
		expect(undo.getByRole("radio", {name: "Off"}).getAttribute("aria-checked")).toBe("true");
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

	it("prefetches the opening book once the rules choice has settled", async () => {
		const prefetched: Rules[] = [];
		await renderSetupRoute(memoryStore(), (rules) => prefetched.push(rules));
		expect(prefetched).toStrictEqual([]);
		await waitFor(() => {
			expect(prefetched).toStrictEqual(["squares"]);
		});
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		fireEvent.click(screen.getByRole("radio", {name: "Lines + 2×2 squares"}));
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		await new Promise((resolve) => {
			setTimeout(resolve, BOOK_PREFETCH_DELAY_MILLISECONDS / 2);
		});
		expect(prefetched).toStrictEqual(["squares"]);
		await waitFor(() => {
			expect(prefetched).toStrictEqual(["squares", "lines"]);
		});
	});

	it("links to the rules and app pages", async () => {
		await renderSetupRoute();
		expect(screen.getByRole("link", {name: "Rules"}).getAttribute("href")).toBe("/rules");
		expect(screen.getByRole("link", {name: "Using the app"}).getAttribute("href")).toBe("/app");
	});
});
