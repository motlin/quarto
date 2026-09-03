/**
 * 🗣️ The words on the play screen: who the seats are, what the player is asked to do, and how a verdict reads.
 *
 * In a bot game the seats are "You" and "Bot", and a verdict is green or red by who wins. Between two people the
 * seats carry the names from the setup, and a decisive verdict is neutral, since nobody at the table is the bot.
 */

import {describeValue, distanceOf} from "./evaluation.js";
import {pieceName} from "./pieces.js";
import type {GameSetup} from "./setup.js";
import {currentPlayer, type GameState, isHumanToMove, movesDone, type Verdict} from "./state.js";
import {isBot, otherPlayer, type Player} from "./turns.js";

/** "decisive" is a win between two people, where neither side is the bot. */
export type VerdictKind = "win" | "loss" | "draw" | "decisive";

export interface VerdictView {
	readonly kind: VerdictKind;
	readonly text: string;
}

export interface Prompt {
	/** The first line, such as "Your move" or the mover's name. */
	readonly title: string;
	/** The second line, such as "Place the dark round tall solid piece."; empty when there is nothing to add. */
	readonly detail: string;
}

const PLACEMENTS = 16;

export function playerName(setup: GameSetup, player: Player): string {
	if (setup.opponent === "human") {
		return setup.names[player];
	}
	return isBot(setup, player) ? "Bot" : "You";
}

export function winsPhrase(setup: GameSetup, winner: Player): string {
	const name = playerName(setup, winner);
	return name === "You" ? "You win" : `${name} wins`;
}

/** Green when the local player wins, red when the bot does, neutral between two people. */
function verdictKind(setup: GameSetup, winner: Player): VerdictKind {
	if (setup.opponent === "human") {
		return "decisive";
	}
	return isBot(setup, winner) ? "loss" : "win";
}

export function gameTitle(setup: GameSetup): string {
	if (setup.opponent === "human") {
		return `${setup.names[0]} vs ${setup.names[1]}`;
	}
	return setup.first === "you" ? "You vs bot" : "Bot vs you";
}

export function describeVerdict(setup: GameSetup, verdict: Verdict): VerdictView {
	if (setup.opponent === "bot") {
		const {kind, text} = describeValue(verdict.value, verdict.movesLeft, !isBot(setup, verdict.mover));
		return {kind, text};
	}
	if (verdict.value === 0) {
		return {kind: "draw", text: "Draw with perfect play"};
	}
	const winner = verdict.value > 0 ? verdict.mover : otherPlayer(verdict.mover);
	return {kind: "decisive", text: `${winsPhrase(setup, winner)} in ${distanceOf(verdict.value, verdict.movesLeft)}`};
}

/** Whoever made the last placement won. */
function winner(state: GameState): Player {
	const last = state.log.at(-1);
	if (last?.kind !== "place") {
		throw new Error("A won game ends with a placement");
	}
	return last.player;
}

/** The verdict strip's text once the game is over, or nothing while it is on. */
export function outcomeView(setup: GameSetup, state: GameState): VerdictView | null {
	if (state.status === "won") {
		const who = winner(state);
		return {kind: verdictKind(setup, who), text: winsPhrase(setup, who)};
	}
	return state.status === "drawn" ? {kind: "draw", text: "Draw"} : null;
}

function receiverName(setup: GameSetup, mover: Player): string {
	const receiver = otherPlayer(mover);
	return isBot(setup, receiver) ? "the bot" : playerName(setup, receiver);
}

/** What the strip asks of the player; on the bot's turn, that it is thinking. */
export function promptFor(setup: GameSetup, state: GameState): Prompt {
	if (state.status === "won") {
		const who = winner(state);
		const phrase = winsPhrase(setup, who);
		return {title: isBot(setup, who) ? "Quarto. The bot wins." : `Quarto! ${phrase}.`, detail: ""};
	}
	if (state.status === "drawn") {
		return {title: "Board full. Drawn game.", detail: ""};
	}
	if (!isHumanToMove(state)) {
		return {title: "Bot is thinking…", detail: ""};
	}
	const mover = currentPlayer(state);
	const title = setup.opponent === "human" ? playerName(setup, mover) : "Your move";
	const detail =
		state.hand === null
			? `Choose a piece for ${receiverName(setup, mover)}.`
			: `Place the ${pieceName(state.hand)} piece.`;
	return {title, detail};
}

/** The one-line mono footer: rules, the placement under way, and what the last search cost. */
export function statusLine(state: GameState): string {
	const rules = state.setup.rules === "squares" ? "lines + squares" : "lines only";
	const move = Math.min(movesDone(state) + 1, PLACEMENTS);
	const parts = [rules, `move ${move} of ${PLACEMENTS}`];
	if (state.verdict !== null) {
		parts.push(
			`${state.verdict.nodes.toLocaleString("en-US")} nodes`,
			`${Math.round(state.verdict.milliseconds)} ms`,
		);
	}
	return parts.join(" · ");
}
