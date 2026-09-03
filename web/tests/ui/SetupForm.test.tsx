// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {DEFAULT_SETUP, type Setup} from "../../src/setup/setup.js";
import {SetupForm} from "../../src/ui/SetupForm.js";

function renderForm(value: Setup) {
	const onChange = vi.fn<(setup: Setup) => void>();
	render(<SetupForm value={value} onChange={onChange} actions={<a href="/play">Play</a>} />);
	return onChange;
}

describe("SetupForm", () => {
	it("renders every choice as a radiogroup of real buttons with the current value checked", () => {
		renderForm(DEFAULT_SETUP);
		const groups = screen.getAllByRole("radiogroup");
		expect(groups.map((group) => group.getAttribute("aria-labelledby"))).toHaveLength(5);
		const squares = screen.getByRole("radio", {name: "Lines + 2×2 squares"});
		expect(squares.tagName).toBe("BUTTON");
		expect(squares.getAttribute("aria-checked")).toBe("true");
		expect(screen.getByRole("radio", {name: "Lines only"}).getAttribute("aria-checked")).toBe("false");
		expect(screen.getByRole("radio", {name: "Outcome"}).getAttribute("aria-checked")).toBe("true");
	});

	it("calls onChange with rules lines when Lines only is chosen", () => {
		const onChange = renderForm(DEFAULT_SETUP);
		fireEvent.click(screen.getByRole("radio", {name: "Lines only"}));
		expect(onChange).toHaveBeenCalledExactlyOnceWith({...DEFAULT_SETUP, rules: "lines"});
	});

	it("shows the first-move choice against the bot and hides the name inputs", () => {
		renderForm(DEFAULT_SETUP);
		expect(screen.getByRole("radiogroup", {name: "Who moves first"})).toBeDefined();
		expect(screen.queryByPlaceholderText("Player 1")).toBeNull();
	});

	it("offers the two difficulties against the bot, with the perfect solver preselected", () => {
		const onChange = renderForm(DEFAULT_SETUP);
		expect(screen.getByRole("radio", {name: "Impossible"}).getAttribute("aria-checked")).toBe("true");
		expect(screen.getByText("Perfect play from the solved game tree.")).toBeDefined();
		fireEvent.click(screen.getByRole("radio", {name: "Medium"}));
		expect(onChange).toHaveBeenCalledExactlyOnceWith({...DEFAULT_SETUP, difficulty: "medium"});
	});

	it("describes the Medium bot once it is chosen", () => {
		renderForm({...DEFAULT_SETUP, difficulty: "medium"});
		expect(
			screen.getByText("Blocks your one-move wins and takes its own; otherwise plays at random."),
		).toBeDefined();
	});

	it("swaps the first-move choice for two name inputs when playing another person", () => {
		const onChange = renderForm({...DEFAULT_SETUP, opponent: "human", names: ["Ada", ""]});
		expect(screen.queryByRole("radiogroup", {name: "Who moves first"})).toBeNull();
		expect(screen.queryByRole("radiogroup", {name: "Difficulty"})).toBeNull();
		const first = screen.getByPlaceholderText<HTMLInputElement>("Player 1");
		const second = screen.getByPlaceholderText<HTMLInputElement>("Player 2");
		expect(first.value).toBe("Ada");
		expect(first.maxLength).toBe(16);
		expect(second.maxLength).toBe(16);
		fireEvent.change(second, {target: {value: "Grace"}});
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			...DEFAULT_SETUP,
			opponent: "human",
			names: ["Ada", "Grace"],
		});
	});

	it("describes the selected option under each group", () => {
		renderForm({...DEFAULT_SETUP, annotations: "values"});
		expect(screen.getByText(/Slower early in the game/)).toBeDefined();
	});

	it("always offers the actions, whatever the setup, since every choice has a value", () => {
		renderForm({...DEFAULT_SETUP, opponent: "human", names: ["", ""]});
		const play = screen.getByRole("link", {name: "Play"});
		expect(play.getAttribute("aria-disabled")).toBeNull();
	});
});
