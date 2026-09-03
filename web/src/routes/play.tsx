import {createFileRoute, Link} from "@tanstack/react-router";
import {playSearchSchema} from "./-play-search.js";

export const Route = createFileRoute("/play")({
	validateSearch: playSearchSchema,
	component: PlayPage,
});

function PlayPage() {
	const {opponent, rules, first, annotations} = Route.useSearch();
	return (
		<main>
			<h1>Play</h1>
			<p>
				{opponent} · {rules} · {first} first · annotations {annotations}
			</p>
			<nav>
				<Link to="/">Setup</Link>
				<Link to="/rules">Rules</Link>
				<Link to="/how-to-play">How to play</Link>
			</nav>
		</main>
	);
}
