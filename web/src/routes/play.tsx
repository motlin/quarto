import {useCallback, useMemo} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import type {Hints} from "../game/setup.js";
import {toGameSetup} from "../setup/setup.js";
import {PlayScreen} from "../ui/PlayScreen.js";
import {playSearchSchema} from "./-play-search.js";

export const Route = createFileRoute("/play")({
	validateSearch: playSearchSchema,
	component: PlayPage,
});

function PlayPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const {createSolver} = Route.useRouteContext();
	const setup = useMemo(() => toGameSetup(search), [search]);
	// A different URL is a different game, so the screen and its solver start over; annotations are the exception,
	// since they can be changed mid-game and only affect what the screen shows and asks.
	const {hints: _hints, ...game} = setup;
	const key = JSON.stringify(game);
	const changeHints = useCallback(
		(hints: Hints) => {
			// Replaced rather than pushed, so Back still leaves the game instead of stepping through levels.
			void navigate({to: "/play", search: {...search, annotations: hints}, replace: true});
		},
		[navigate, search],
	);
	return (
		<PlayScreen
			key={key}
			setup={setup}
			createSolver={createSolver}
			onHintsChange={changeHints}
			backLink={
				<Link className="btn quiet" to="/">
					<span aria-hidden="true">‹</span> Setup
				</Link>
			}
			helpLink={
				<Link className="btn round" to="/app" aria-label="Using the app">
					?
				</Link>
			}
		/>
	);
}
