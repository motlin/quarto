import {useMemo} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import {toGameSetup} from "../setup/setup.js";
import {PlayScreen} from "../ui/PlayScreen.js";
import {playSearchSchema} from "./-play-search.js";

export const Route = createFileRoute("/play")({
	validateSearch: playSearchSchema,
	component: PlayPage,
});

function PlayPage() {
	const search = Route.useSearch();
	const {createSolver} = Route.useRouteContext();
	const setup = useMemo(() => toGameSetup(search), [search]);
	// A different URL is a different game, so the screen and its solver start over.
	const key = JSON.stringify(setup);
	return (
		<PlayScreen
			key={key}
			setup={setup}
			createSolver={createSolver}
			backLink={
				<Link className="btn quiet" to="/">
					<span aria-hidden="true">‹</span> Setup
				</Link>
			}
			helpLink={
				<Link className="btn round" to="/how-to-play" aria-label="How to play">
					?
				</Link>
			}
		/>
	);
}
