import {createFileRoute, Link} from "@tanstack/react-router";

export const Route = createFileRoute("/how-to-play")({
	component: HowToPlayPage,
});

function HowToPlayPage() {
	return (
		<main>
			<h1>How to play</h1>
			<nav>
				<Link to="/">Setup</Link>
				<Link to="/rules">Rules</Link>
			</nav>
		</main>
	);
}
