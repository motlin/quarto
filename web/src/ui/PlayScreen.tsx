/**
 * 🎲 The game screen: the top bar, the strip with the piece in hand and the verdict, the board, the tray, the
 * controls, the move log and the status line. One column on a phone in that order, board beside the rest on a
 * desktop. The router's links arrive as props so the screen renders in Storybook and in tests without a router.
 */

import {type ReactNode, useMemo} from "react";
import {ALL_CELLS, asCell, type Cell} from "../game/cells.js";
import {shortValue} from "../game/evaluation.js";
import {describeVerdict, gameTitle, outcomeView, playerName, promptFor, statusLine} from "../game/narration.js";
import {asPiece, type Piece} from "../game/pieces.js";
import {winningCells} from "../game/rules.js";
import type {GameSetup} from "../game/setup.js";
import {type GameState, isHumanToMove, isToPlace, movesLeft} from "../game/state.js";
import type {Solver} from "../solver/client.js";
import {Board} from "./Board.js";
import {Hand} from "./Hand.js";
import {MoveLog} from "./MoveLog.js";
import {OracleBar} from "./OracleBar.js";
import {Tray} from "./Tray.js";
import {useDragToPlace} from "./useDragToPlace.js";
import {usePlayGame} from "./usePlayGame.js";

/** Long enough that a bot move read from the opening book still registers as a move. */
const ENGINE_DELAY_MILLISECONDS = 350;

export interface PlayScreenProps {
	/** Fixed for the life of the screen; remount to change it. */
	readonly setup: GameSetup;
	/** Called once on mount; must be a stable function, since a new one would start a new solver. */
	readonly createSolver: () => Solver;
	readonly engineDelayMilliseconds?: number;
	/** The link back to the setup screen. */
	readonly backLink: ReactNode;
	/** The round help button. */
	readonly helpLink: ReactNode;
}

const NO_CELLS: ReadonlySet<Cell> = new Set();
const NO_PIECES: ReadonlySet<Piece> = new Set();

function legalCells(state: GameState): ReadonlySet<Cell> {
	if (state.status !== "playing" || !isHumanToMove(state) || !isToPlace(state)) {
		return NO_CELLS;
	}
	return new Set(ALL_CELLS.filter((cell) => state.board[cell] === null));
}

function legalPieces(state: GameState): ReadonlySet<Piece> {
	if (state.status !== "playing" || !isHumanToMove(state) || isToPlace(state)) {
		return NO_PIECES;
	}
	return new Set(state.remaining);
}

/** The move-value labels for the moves of one kind: cells while placing, pieces while choosing. */
function hintLabels<Move extends number>(
	state: GameState,
	placing: boolean,
	asMove: (move: number) => Move,
): ReadonlyMap<Move, string> {
	if (state.hintValues === null || isToPlace(state) !== placing) {
		return new Map();
	}
	const left = movesLeft(state);
	return new Map([...state.hintValues].map(([move, value]) => [asMove(move), shortValue(value, left)]));
}

export function PlayScreen({
	setup,
	createSolver,
	engineDelayMilliseconds = ENGINE_DELAY_MILLISECONDS,
	backLink,
	helpLink,
}: PlayScreenProps) {
	const {state, thinking, select, place, undo, restart} = usePlayGame(setup, createSolver, engineDelayMilliseconds);
	const cells = useMemo(() => legalCells(state), [state]);
	const drag = useDragToPlace(cells, place);
	const prompt = promptFor(setup, state);
	const verdict =
		outcomeView(setup, state) ?? (state.verdict === null ? null : describeVerdict(setup, state.verdict));
	const cellHints = hintLabels(state, true, asCell);
	const pieceHints = hintLabels(state, false, asPiece);
	return (
		<main className="screen play">
			<nav className="topbar" aria-label="Game">
				{backLink}
				<h1 className="topbar-title">{gameTitle(setup)}</h1>
				{helpLink}
			</nav>
			<div className="table">
				<div className="board-col">
					<div className="strip">
						<Hand piece={state.hand} title={prompt.title} detail={prompt.detail} drag={drag} />
						{setup.hints !== "off" && <OracleBar verdict={verdict} thinking={thinking} />}
					</div>
					<Board
						board={state.board}
						legalCells={cells}
						onPlace={place}
						lastCell={state.lastCell}
						winningCells={state.status === "won" ? winningCells(state.board, setup.rules) : NO_CELLS}
						hints={cellHints}
						dropCell={drag.dropCell}
					/>
				</div>
				<div className="side">
					<Tray
						remaining={state.remaining}
						legalPieces={legalPieces(state)}
						onSelect={select}
						hints={pieceHints}
					/>
					<div className="controls">
						<button type="button" className="btn" onClick={undo} disabled={state.log.length === 0}>
							Undo
						</button>
						<button type="button" className="btn" onClick={restart}>
							New game
						</button>
					</div>
					<MoveLog moves={state.log} playerName={(player) => playerName(setup, player)} />
					<div className="play-status">{statusLine(state)}</div>
				</div>
			</div>
		</main>
	);
}
