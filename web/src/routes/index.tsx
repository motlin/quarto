import {useEffect, useState} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import {loadSetup, saveSetup, type Setup, toPlaySearch} from "../setup/setup.js";
import {SetupForm} from "../ui/SetupForm.js";

export const Route = createFileRoute("/")({
	component: SetupPage,
});

/** How long the rules control must rest before its book is fetched, so flipping back and forth fetches nothing. */
export const BOOK_PREFETCH_DELAY_MILLISECONDS = 300;

function SetupPage() {
	const {store, prefetchBook} = Route.useRouteContext();
	const [setup, setSetup] = useState(() => loadSetup(store));
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
						<Link className="btn quiet" to="/how-to-play">
							How to play
						</Link>
					</>
				}
			/>
		</main>
	);
}
