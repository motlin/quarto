import {useEffect, useState} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import {fromPlaySearch, loadSetup, saveSetup, type Setup, toPlaySearch} from "../setup/setup.js";
import {SetupForm} from "../ui/SetupForm.js";
import {setupSearchSchema} from "./-play-search.js";

export const Route = createFileRoute("/")({
	validateSearch: setupSearchSchema,
	component: SetupPage,
});

/** How long the rules control must rest before its book is fetched, so flipping back and forth fetches nothing. */
export const BOOK_PREFETCH_DELAY_MILLISECONDS = 300;

function SetupPage() {
	const {store, prefetchBook} = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	// A shared URL beats what this browser remembers; the remembered setup fills in whatever the URL leaves out.
	const [setup, setSetup] = useState(() => fromPlaySearch(search, loadSetup(store)));
	// The book is fetched once the rules choice settles, so it is usually loaded before /play mounts.
	useEffect(() => {
		const timer = setTimeout(() => {
			prefetchBook(setup.rules);
		}, BOOK_PREFETCH_DELAY_MILLISECONDS);
		return () => {
			clearTimeout(timer);
		};
	}, [prefetchBook, setup.rules]);
	const change = (next: Setup) => {
		setSetup(next);
		saveSetup(store, next);
		// The address bar always describes the current setup, so it can be copied and shared mid-configuration.
		// Replacing keeps every tweak from becoming a Back-button stop.
		void navigate({to: "/", search: toPlaySearch(next), replace: true});
	};
	return (
		<main className="screen">
			<header className="masthead">
				<h1>QuartoBot</h1>
				<p>
					Play against a bot you can beat or a perfect solver that never errs, or with a friend on one device,
					and see the exact outcome of every position.
				</p>
			</header>
			<SetupForm
				value={setup}
				onChange={change}
				actions={
					<>
						<Link className="btn primary" to="/play" search={toPlaySearch(setup)}>
							Play
						</Link>
						<Link className="btn quiet" to="/rules">
							Rules
						</Link>
						<Link className="btn quiet" to="/app">
							Using the app
						</Link>
					</>
				}
			/>
		</main>
	);
}
