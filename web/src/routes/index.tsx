import {useState} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import {loadSetup, saveSetup, type Setup, toPlaySearch} from "../setup/setup.js";
import {SetupForm} from "../ui/SetupForm.js";

export const Route = createFileRoute("/")({
	component: SetupPage,
});

function SetupPage() {
	const {store} = Route.useRouteContext();
	const [setup, setSetup] = useState(() => loadSetup(store));
	const change = (next: Setup) => {
		setSetup(next);
		saveSetup(store, next);
	};
	return (
		<main className="screen">
			<header className="masthead">
				<h1>QuartoBot</h1>
				<p>
					Play against a perfect solver that never errs, or with a friend on one device, and see the exact
					outcome of every position.
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
