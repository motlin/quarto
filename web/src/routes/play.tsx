import {useCallback, useMemo} from "react";
import {createFileRoute, Link} from "@tanstack/react-router";
import {loadGame, saveGame} from "../game/savedGame.js";
import type {Hints} from "../game/setup.js";
import type {Move} from "../game/state.js";
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
	const {createSolver, gameStore} = Route.useRouteContext();
	const setup = useMemo(() => toGameSetup(search), [search]);
	// A different URL is a different game, so the screen and its solver start over; annotations are the exception,
	// since they can be changed mid-game and only affect what the screen shows and asks.
	const {hints: _hints, ...game} = setup;
	const key = JSON.stringify(game);
	// The game in progress is kept for the tab, so the help page and a reload come back to it. The screen reads
	// `resumeFrom` only when it mounts; after that it owns the moves and just reports them.
	const resumeFrom = useMemo(() => loadGame(gameStore, setup), [gameStore, setup]);
	const keepMoves = useCallback(
		(moves: readonly Move[]) => {
			saveGame(gameStore, setup, moves);
		},
		[gameStore, setup],
	);
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
			resumeFrom={resumeFrom}
			onMovesChange={keepMoves}
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
