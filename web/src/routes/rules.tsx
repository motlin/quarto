import {createFileRoute, Link} from "@tanstack/react-router";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
});

function RulesPage() {
	return (
		<main>
			<h1>Rules</h1>
			<nav>
				<Link to="/">Setup</Link>
				<Link to="/how-to-play">How to play</Link>
			</nav>
		</main>
	);
}
