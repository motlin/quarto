import {createRootRouteWithContext, Outlet} from "@tanstack/react-router";
import type {Store} from "../setup/storage.js";
import "../styles/index.css";

/** What every route can reach through the router: the store the setup screen remembers its choices in. */
interface RouterContext {
	readonly store: Store;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => <Outlet />,
});
