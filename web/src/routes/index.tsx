import {createFileRoute, Link} from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: SetupPage,
});

function SetupPage() {
	return (
		<main>
			<h1>QuartoBot</h1>
			<h2>Setup</h2>
			<nav>
				<Link to="/play" search={{opponent: "bot", rules: "squares", first: "you", annotations: "off"}}>
					Play
				</Link>
				<Link to="/rules">Rules</Link>
				<Link to="/how-to-play">How to play</Link>
			</nav>
		</main>
	);
}
