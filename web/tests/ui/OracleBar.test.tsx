// @vitest-environment jsdom
import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {OracleBar} from "../../src/ui/OracleBar.js";

describe("OracleBar", () => {
	it("colours the verdict by its kind and shows the search cost", () => {
		const {container} = render(
			<OracleBar
				verdict={{kind: "win", text: "You win in 3"}}
				nodes={1234567}
				milliseconds={41.6}
				thinking={false}
			/>,
		);
		expect(screen.getByText("You win in 3").closest(".verdict")?.className).toContain("win");
		expect(container.querySelector(".verdict-detail")?.textContent).toBe("1,234,567 nodes · 42 ms");
		expect(container.querySelector(".lamp")?.className).not.toContain("thinking");
	});

	it("lights the lamp while the solver is thinking", () => {
		const {container} = render(<OracleBar verdict={null} thinking={true} />);
		expect(container.querySelector(".lamp")?.className).toContain("thinking");
		expect(container.querySelector(".verdict-detail")).toBeNull();
	});
});
