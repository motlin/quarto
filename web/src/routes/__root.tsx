import {createRootRouteWithContext, Outlet} from "@tanstack/react-router";
import type {Store} from "../setup/storage.js";
import type {Solver} from "../solver/client.js";
import "../styles/index.css";

/**
 * What every route can reach through the router: the store the setup screen remembers its choices in, and the way
 * the play screen gets a solver, so tests and stories can hand it a scripted one.
 */
interface RouterContext {
	readonly store: Store;
	readonly createSolver: () => Solver;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
});
