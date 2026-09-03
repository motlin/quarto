/**
 * 🎛️ The game loop behind the play screen: the reducer's state on this side, the wasm position in the worker, and
 * the promise chain that keeps the two in step.
 *
 * Every move goes to the reducer and the worker in the same tick, so the worker's queue always mirrors the log.
 * Search results arrive later and may be stale by then: each human action starts a new turn and takes a token,
 * and a result is dropped when its token is no longer the current one. That is what lets the player move, undo
 * or restart while the oracle is still evaluating, without blocking or racing.
 */

import {useCallback, useEffect, useRef, useState} from "react";
import type {Cell} from "../game/cells.js";
import type {Piece} from "../game/pieces.js";
import type {GameSetup} from "../game/setup.js";
import {
	applyPlace,
	applySelect,
	currentPlayer,
	type GameState,
	isHumanToMove,
	isToPlace,
	movesLeft,
	newGame,
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
	readonly undo: () => void;
	readonly restart: () => void;
}

/** One worker and its lifetime; `live` goes false on unmount so a rejection from termination is not a failure. */
interface Session {
	readonly solver: Solver;
	live: boolean;
}

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

/** Plays the move that ends `next`'s log in the worker and checks the two sides agree. */
async function mirror(solver: Solver, next: GameState): Promise<void> {
	const move = next.log.at(-1);
	if (move === undefined) {
		throw new Error("Nothing to mirror");
	}
	const snapshot =
		move.kind === "select"
			? await solver.request("applySelect", {piece: move.piece})
			: await solver.request("applyPlace", {cell: move.cell});
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
	/** Bumped by every human action; a loop whose token is behind stops at its next check. */
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

			async function botPly(): Promise<void> {
				const before = stateRef.current;
				setThinking(true);
				const deadline = performance.now() + engineDelayMilliseconds;
				const [evaluation, best] = await Promise.all([
					wantVerdict ? solver.request("evaluate") : null,
					solver.request("bestMove"),
				]);
				await sleepUntil(deadline);
				if (turn.current !== token) {
					return;
				}
				let next = isToPlace(before) ? applyPlace(before, best.move) : applySelect(before, best.move);
				if (next === before) {
					throw new Error(`The solver chose an illegal move: ${best.move}`);
				}
				const mirrored = mirror(solver, next);
				if (evaluation !== null) {
					next = withVerdict(next, {
						value: evaluation.value,
						movesLeft: movesLeft(before),
						mover: currentPlayer(before),
						nodes: evaluation.nodes + best.nodes,
						milliseconds: evaluation.ms + best.ms,
					});
				}
				commit(next);
				await mirrored;
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
				let next = withVerdict(before, {
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
				await botPly();
			}
			if (turn.current === token) {
				setThinking(false);
			}
		},
		[setup.hints, engineDelayMilliseconds, commit],
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
		const current: Session = {solver: createSolver(), live: true};
		session.current = current;
		startTurn(async (solver) => {
			await solver.request("init", {rules: setup.rules});
			await solver.request("setSeed", {seed: randomSeed()});
		});
		return () => {
			current.live = false;
			turn.current += 1;
			current.solver.terminate();
		};
	}, [createSolver, setup.rules, startTurn]);

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
			startTurn(async (solver) => mirror(solver, next));
		},
		[commit, startTurn],
	);

	const select = useCallback(
		(piece: Piece) => {
			act((before) => applySelect(before, piece));
		},
		[act],
	);
	const place = useCallback(
		(cell: Cell) => {
			act((before) => applyPlace(before, cell));
		},
		[act],
	);

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

	return {state, thinking, select, place, undo, restart};
}
