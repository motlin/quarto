/**
 * 🎭 A solver that follows a script instead of searching, for tests and Storybook.
 *
 * It keeps the position with the same reducer the screen uses, so its snapshots are the real thing; only the
 * verdicts and the bot's moves are made up. Every request is recorded, and `hold` makes the requests wait until
 * `release` so a test can look at the screen while the bot is "thinking".
 */

import {ALL_CELLS, type Cell} from "../game/cells.js";
import {ALL_PIECES, type Piece} from "../game/pieces.js";
import type {Rules} from "../game/rules.js";
import {applyPlace, applySelect, type GameState, isToPlace, movesLeft, newGame, replay} from "../game/state.js";
import type {PayloadArguments, Solver} from "./client.js";
import type {Kind, Payloads, Results, Snapshot} from "./protocol.js";

export interface Script {
	/** The bot's moves in order; once they run out it plays the first legal move. */
	readonly bestMoves: readonly (Cell | Piece)[];
	/** What `evaluate` reports for every position. */
	readonly value: number;
	/** What `moveValues` reports for each legal move. */
	readonly moveValue: (move: Cell | Piece, movesLeft: number) => number;
}

export interface Recorded {
	readonly kind: Kind;
	readonly payload: Payloads[Kind];
}

const NODES = 1234;
const MILLISECONDS = 5;

type Handlers = {readonly [K in Kind]: (...args: PayloadArguments<K>) => Results[K]};

function bits(taken: readonly number[]): number {
	return taken.reduce((mask, index) => mask | (1 << index), 0);
}

export class ScriptedSolver implements Solver {
	readonly requests: Recorded[] = [];
	private state: GameState;
	private readonly script: Script;
	private nextBest = 0;
	private gate: Promise<void> = Promise.resolve();
	private open: (() => void) | null = null;
	private held: ReadonlySet<Kind> = new Set();
	private readonly handlers: Handlers = {
		init: ({rules}) => {
			this.state = newGame({...this.state.setup, rules});
			return {version: "scripted", snapshot: this.snapshot()};
		},
		setRules: ({rules}) => {
			this.state = newGame({...this.state.setup, rules});
			return this.snapshot();
		},
		reset: () => {
			this.state = newGame(this.state.setup);
			return this.snapshot();
		},
		applySelect: ({piece}) => {
			this.state = this.apply(applySelect(this.state, piece), `select piece ${piece}`);
			return this.snapshot();
		},
		applyPlace: ({cell}) => {
			this.state = this.apply(applyPlace(this.state, cell), `place on cell ${cell}`);
			return this.snapshot();
		},
		undo: () => {
			if (this.state.log.length === 0) {
				throw new Error("Nothing to undo");
			}
			this.state = replay(this.state.setup, this.state.log.slice(0, -1));
			return this.snapshot();
		},
		snapshot: () => this.snapshot(),
		evaluate: () => ({value: this.script.value, nodes: NODES, ms: MILLISECONDS}),
		moveValues: () =>
			this.state.status === "playing"
				? this.legalMoves().map((move) => [move, this.script.moveValue(move, movesLeft(this.state))] as const)
				: [],
		bestMove: () => {
			if (this.state.status !== "playing") {
				throw new Error("The game is over");
			}
			const scripted = this.script.bestMoves[this.nextBest];
			this.nextBest += 1;
			const move = scripted ?? this.legalMoves()[0];
			if (move === undefined) {
				throw new Error("No legal move");
			}
			return {move, value: this.script.value, nodes: NODES, ms: MILLISECONDS};
		},
		setSeed: () => null,
	};

	constructor(script: Partial<Script> = {}, rules: Rules = "squares") {
		this.script = {bestMoves: [], value: 0, moveValue: () => 0, ...script};
		this.state = newGame({
			opponent: "human",
			rules,
			first: "you",
			difficulty: "impossible",
			hints: "off",
			undo: "allowed",
			names: ["", ""],
		});
	}

	async request<K extends Kind>(kind: K, ...args: PayloadArguments<K>): Promise<Results[K]> {
		this.requests.push({kind, payload: args[0]});
		if (this.held.has(kind)) {
			await this.gate;
		}
		return this.handlers[kind](...args);
	}

	terminate(): void {
		// Nothing runs in the background, so there is nothing to stop.
	}

	/** Makes requests of these kinds wait until `release`, so a test can look at the screen mid-search. */
	hold(...kinds: Kind[]): void {
		if (this.open !== null) {
			throw new Error("Already holding");
		}
		this.held = new Set(kinds);
		this.gate = new Promise((resolve) => {
			this.open = resolve;
		});
	}

	release(): void {
		if (this.open === null) {
			throw new Error("Nothing is held");
		}
		this.open();
		this.open = null;
		this.held = new Set();
		this.gate = Promise.resolve();
	}

	kinds(): Kind[] {
		return this.requests.map((request) => request.kind);
	}

	get position(): GameState {
		return this.state;
	}

	private apply(next: GameState, what: string): GameState {
		if (next === this.state) {
			throw new Error(`Cannot ${what} now`);
		}
		return next;
	}

	private legalMoves(): readonly (Cell | Piece)[] {
		if (isToPlace(this.state)) {
			return ALL_CELLS.filter((cell) => this.state.board[cell] === null);
		}
		return this.state.remaining;
	}

	private snapshot(): Snapshot {
		const {state} = this;
		const placed = ALL_CELLS.filter((cell) => state.board[cell] !== null);
		const inTray = new Set(state.remaining);
		return {
			rules: state.setup.rules,
			movesLeft: movesLeft(state),
			currentPiece: state.hand,
			piecesTaken: bits(ALL_PIECES.filter((piece) => !inTray.has(piece))),
			cellsTaken: bits(placed),
			board: state.board,
			isToPlace: isToPlace(state),
			isWon: state.status === "won",
			isDone: state.remaining.length === 0 && state.hand === null,
			bookEntries: 0,
			bookDepth: 0,
		};
	}
}
