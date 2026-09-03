import {createRootRouteWithContext, Outlet} from "@tanstack/react-router";
import type {Rules} from "../game/rules.js";
import type {Store} from "../setup/storage.js";
import type {Solver} from "../solver/client.js";
import "../styles/index.css";

/**
 * What every route can reach through the router: the store the setup screen remembers its choices in, the way the
 * play screen gets a solver, so tests and stories can hand it a scripted one, and a way for the setup screen to
 * start downloading the opening book for the chosen rules before the game begins.
 */
interface RouterContext {
	readonly store: Store;
	readonly createSolver: () => Solver;
	readonly prefetchBook: (rules: Rules) => void;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
});
