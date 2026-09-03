import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {createRouter, RouterProvider} from "@tanstack/react-router";
import {Agentation} from "agentation";
import {routeTree} from "./routeTree.gen.js";
import {browserStore} from "./setup/storage.js";
import {openingBooks} from "./solver/books.js";
import {SolverClient} from "./solver/client.js";

const router = createRouter({
	routeTree,
	context: {
		store: browserStore,
		createSolver: () => new SolverClient(),
		prefetchBook: (rules) => {
			openingBooks.prefetch(rules);
		},
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const root = document.getElementById("app");

if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
		{import.meta.env.DEV && <Agentation />}
	</StrictMode>,
);
