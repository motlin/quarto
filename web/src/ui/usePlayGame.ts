/**
 * 🎛️ The game loop behind the play screen: the reducer's state on this side, the wasm position in the worker, and
 * the promise chain that keeps the two in step.
 *
 * Every committed move goes to the reducer and the worker in the same tick, so the worker's queue always mirrors
 * the log. Search results arrive later and may be stale by then: each committed human action starts a new turn and
 * takes a token, and a result is dropped when its token is no longer the current one. That is what lets the player
 * move, undo or restart while the oracle is still evaluating, without blocking or racing.
 *
 * With undo off, a human's place and select are provisional: they change only the reducer's `pending` and leave
 * the worker alone, so the oracle's answer about the committed position still lands. Confirm commits the turn and
 * mirrors its one or two plies to the worker in one go.
 */

import {useCallback, useEffect, useRef, useState} from "react";
import type {Cell} from "../game/cells.js";
import {mediumTurn} from "../game/medium.js";
import type {Piece} from "../game/pieces.js";
import {mulberry32, type Random} from "../game/random.js";
import type {GameSetup} from "../game/setup.js";
import {
	applyPlace,
	applySelect,
	confirmTurn,
	currentPlayer,
	type GameState,
	isHumanToMove,
	isToPlace,
	movesLeft,
	newGame,
	provisionalPlace,
	provisionalSelect,
	takeBack,
	undoToHumanDecision,
	withHints,
	withVerdict,
} from "../game/state.js";
import type {Solver} from "../solver/client.js";
import type {Snapshot} from "../solver/protocol.js";

export interface PlayGame {
	readonly state: GameState;
	/** A search is running: the bot is choosing, or the oracle is evaluating the human's position. */
	readonly thinking: boolean;
	readonly select: (piece: Piece) => void;
	readonly place: (cell: Cell) => void;
	/** Commits the pending turn; does nothing until it is complete, and nothing at all when undo is allowed. */
	readonly confirm: () => void;
	/** Retracts the most recent provisional step; does nothing when undo is allowed. */
	readonly takeBack: () => void;
	/** Rewinds committed plies; not offered when undo is off. */
	readonly undo: () => void;
	readonly restart: () => void;
}

/** One worker and its lifetime; `live` goes false on unmount so a rejection from termination is not a failure. */
interface Session {
	readonly solver: Solver;
	/** The Medium bot's dice, seeded alongside the solver so a game replays the same way. */
	readonly random: Random;
	live: boolean;
}

/** A bot's move for one ply and what the search for it cost; a Medium choice costs nothing worth showing. */
interface Chosen {
	readonly move: Cell | Piece;
	readonly nodes: number;
	readonly ms: number;
}

const FREE = {nodes: 0, ms: 0};

function randomSeed(): number {
	const [seed] = crypto.getRandomValues(new Uint32Array(1));
	if (seed === undefined) {
		throw new Error("No random seed");
	}
	return seed;
}

/** The worker and the reducer must agree on whether the game is over; anything else is a bug in one of them. */
function assertInSync(snapshot: Snapshot, state: GameState): void {
	const won = state.status === "won";
	const drawn = state.status === "drawn";
	if (snapshot.isWon !== won || (snapshot.isDone && !snapshot.isWon) !== drawn) {
		throw new Error(`Solver says won=${snapshot.isWon} done=${snapshot.isDone} but the game is ${state.status}`);
	}
}

/** Plays the last `plies` moves of `next`'s log in the worker and checks the two sides agree at the end. */
async function mirror(solver: Solver, next: GameState, plies: number): Promise<void> {
	if (plies < 1 || plies > next.log.length) {
		throw new Error(`Cannot mirror ${plies} of ${next.log.length} plies`);
	}
	let snapshot: Snapshot | null = null;
	for (const move of next.log.slice(-plies)) {
		snapshot =
			move.kind === "select"
				? await solver.request("applySelect", {piece: move.piece})
				: await solver.request("applyPlace", {cell: move.cell});
	}
	if (snapshot === null) {
		throw new Error("Nothing was mirrored");
	}
	assertInSync(snapshot, next);
}

async function sleepUntil(deadline: number): Promise<void> {
	const remaining = deadline - performance.now();
	if (remaining <= 0) {
		return;
	}
	await new Promise<void>((resolve) => {
		setTimeout(resolve, remaining);
	});
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function usePlayGame(setup: GameSetup, createSolver: () => Solver, engineDelayMilliseconds: number): PlayGame {
	const [state, setState] = useState(() => newGame(setup));
	const [thinking, setThinking] = useState(false);
	const [failure, setFailure] = useState<Error | null>(null);
	const stateRef = useRef(state);
	const session = useRef<Session | null>(null);
	/** Bumped by every committed human action; a loop whose token is behind stops at its next check. */
	const turn = useRef(0);

	if (failure !== null) {
		throw failure;
	}

	const commit = useCallback((next: GameState) => {
		stateRef.current = next;
		setState(next);
	}, []);

	const drive = useCallback(
		async (current: Session, token: number): Promise<void> => {
			const {solver} = current;
			const wantVerdict = setup.hints !== "off";
			const wantValues = setup.hints === "values";

			async function botPly(choose: () => Promise<Chosen>): Promise<void> {
				const before = stateRef.current;
				setThinking(true);
				const deadline = performance.now() + engineDelayMilliseconds;
				const [evaluation, chosen] = await Promise.all([
					wantVerdict ? solver.request("evaluate") : null,
					choose(),
				]);
				await sleepUntil(deadline);
				if (turn.current !== token) {
					return;
				}
				let next = isToPlace(before) ? applyPlace(before, chosen.move) : applySelect(before, chosen.move);
				if (next === before) {
					throw new Error(`The bot chose an illegal move: ${chosen.move}`);
				}
				const mirrored = mirror(solver, next, 1);
				if (evaluation !== null) {
					next = withVerdict(next, {
						value: evaluation.value,
						movesLeft: movesLeft(before),
						mover: currentPlayer(before),
						nodes: evaluation.nodes + chosen.nodes,
						milliseconds: evaluation.ms + chosen.ms,
					});
				}
				commit(next);
				await mirrored;
			}

			/** The Medium bot settles its whole turn at once, then plays it a ply at a time so each move reads. */
			async function mediumBotTurn(): Promise<void> {
				const {place, select} = mediumTurn(stateRef.current, current.random);
				if (place !== null) {
					await botPly(async () => Promise.resolve({move: place, ...FREE}));
				}
				if (select !== null && turn.current === token) {
					await botPly(async () => Promise.resolve({move: select, ...FREE}));
				}
			}

			async function consultOracle(): Promise<void> {
				const before = stateRef.current;
				setThinking(true);
				const [evaluation, values] = await Promise.all([
					solver.request("evaluate"),
					wantValues ? solver.request("moveValues") : null,
				]);
				if (turn.current !== token) {
					return;
				}
				// The token guarantees the committed position is still `before`'s; only a provisional step, which the
				// verdict must not disturb, can have changed the state meanwhile.
				let next = withVerdict(stateRef.current, {
					value: evaluation.value,
					movesLeft: movesLeft(before),
					mover: currentPlayer(before),
					nodes: evaluation.nodes,
					milliseconds: evaluation.ms,
				});
				if (values !== null) {
					next = withHints(next, new Map(values));
				}
				commit(next);
			}

			while (turn.current === token && stateRef.current.status === "playing") {
				if (isHumanToMove(stateRef.current)) {
					if (wantVerdict) {
						await consultOracle();
					}
					break;
				}
				if (setup.difficulty === "medium") {
					await mediumBotTurn();
				} else {
					await botPly(async () => solver.request("bestMove"));
				}
			}
			if (turn.current === token) {
				setThinking(false);
			}
		},
		[setup.hints, setup.difficulty, engineDelayMilliseconds, commit],
	);

	/** Starts a new turn after `prepare` has put the worker in step with the reducer. */
	const startTurn = useCallback(
		(prepare: (solver: Solver) => Promise<void>) => {
			const current = session.current;
			if (current === null) {
				throw new Error("The solver is not running");
			}
			turn.current += 1;
			const token = turn.current;
			prepare(current.solver)
				.then(async () => drive(current, token))
				.catch((error: unknown) => {
					if (current.live) {
						setFailure(toError(error));
					}
				});
		},
		[drive],
	);

	useEffect(() => {
		const seed = randomSeed();
		const current: Session = {solver: createSolver(), random: mulberry32(seed), live: true};
		session.current = current;
		// Starting the solver fetches and loads the opening book, which can take a moment on a slow connection; the
		// lamp shows it working until the first turn is driven.
		setThinking(true);
		startTurn(async (solver) => {
			await solver.request("init", {rules: setup.rules});
			await solver.request("setSeed", {seed});
		});
		return () => {
			current.live = false;
			turn.current += 1;
			current.solver.terminate();
		};
	}, [createSolver, setup.rules, startTurn]);

	/** Applies a human transition and, when it committed plies, mirrors them to the worker and starts a new turn. */
	const act = useCallback(
		(transition: (state: GameState) => GameState) => {
			const before = stateRef.current;
			if (!isHumanToMove(before)) {
				return;
			}
			const next = transition(before);
			if (next === before) {
				return;
			}
			commit(next);
			const plies = next.log.length - before.log.length;
			if (plies > 0) {
				startTurn(async (solver) => mirror(solver, next, plies));
			}
		},
		[commit, startTurn],
	);

	const confirming = setup.undo === "off";

	const select = useCallback(
		(piece: Piece) => {
			act((before) => (confirming ? provisionalSelect(before, piece) : applySelect(before, piece)));
		},
		[act, confirming],
	);
	const place = useCallback(
		(cell: Cell) => {
			act((before) => (confirming ? provisionalPlace(before, cell) : applyPlace(before, cell)));
		},
		[act, confirming],
	);
	const confirm = useCallback(() => {
		act(confirmTurn);
	}, [act]);
	const retract = useCallback(() => {
		act(takeBack);
	}, [act]);

	const undo = useCallback(() => {
		const before = stateRef.current;
		const next = undoToHumanDecision(before);
		if (next === before) {
			return;
		}
		commit(next);
		const plies = before.log.length - next.log.length;
		startTurn(async (solver) => {
			let snapshot: Snapshot | null = null;
			for (let ply = 0; ply < plies; ply++) {
				snapshot = await solver.request("undo");
			}
			if (snapshot !== null) {
				assertInSync(snapshot, next);
			}
		});
	}, [commit, startTurn]);

	const restart = useCallback(() => {
		const fresh = newGame(setup);
		commit(fresh);
		startTurn(async (solver) => {
			assertInSync(await solver.request("reset"), fresh);
		});
	}, [setup, commit, startTurn]);

	return {state, thinking, select, place, confirm, takeBack: retract, undo, restart};
}
