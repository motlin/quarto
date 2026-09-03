import {createFileRoute, Link} from "@tanstack/react-router";
import {Chip} from "../ui/Hint.js";
import type {VerdictKind} from "../ui/OracleBar.js";
import {HelpPage} from "./-help-page.js";

export const Route = createFileRoute("/how-to-play")({
	component: HowToPlayPage,
});

const STEPS: readonly {readonly title: string; readonly detail: string}[] = [
	{title: "Hand over a piece", detail: "Pick any piece from the tray. It goes to your opponent, not to you."},
	{title: "They place it", detail: "On any empty cell. If it completes a winning line, they win."},
	{title: "They hand you one", detail: "Now you place, then you choose again. And so on until the board is full."},
];

const VERDICTS: readonly {readonly kind: VerdictKind; readonly text: string; readonly meaning: string}[] = [
	{
		kind: "draw",
		text: "Draw with perfect play",
		meaning: "Neither side can force a win from here. One slip turns it into a countdown for the other side.",
	},
	{
		kind: "win",
		text: "You win in 3",
		meaning: "You have a forced win that ends within three more placements, whatever the bot does.",
	},
	{
		kind: "loss",
		text: "Bot wins in 2",
		meaning: "The bot has a forced win within two placements and plays perfectly, so it will find it.",
	},
	{
		kind: "decisive",
		text: "Player 1 wins in 4",
		meaning: "In a two-person game the verdict names the player, since nobody at the table is the bot.",
	},
];

function HowToPlayPage() {
	return (
		<HelpPage title="How to play">
			<h2>Taking turns</h2>
			<p>
				You never place your own piece. The player who chooses hands a piece to the opponent, who must place it
				and then chooses the next piece for you. The first player only chooses; the second makes the first
				placement.
			</p>
			<ol className="flow">
				{STEPS.map(({title, detail}, index) => (
					<li key={title}>
						<span className="step" aria-hidden="true">
							{index + 1}
						</span>
						<div>
							<b>{title}</b>
							<p>{detail}</p>
						</div>
					</li>
				))}
			</ol>
			<p>
				The strip above the board always says what to do next: place the piece in your hand, or choose one from
				the tray. Only the cells or pieces you can tap are marked.
			</p>

			<h2>Reading the verdict</h2>
			<p>
				With annotations on, the verdict beside the lamp states the outcome of the position under perfect play.
				It comes from a solver that searches every continuation to the end of the game, so it is exact rather
				than an estimate: a losing readout is a certainty, not a warning.
			</p>
			<dl className="verdicts">
				{VERDICTS.map(({kind, text, meaning}) => (
					<div key={text}>
						<dt>
							<span className={`verdict ${kind}`}>
								<span className="lamp" aria-hidden="true" />
								<span>{text}</span>
							</span>
						</dt>
						<dd>{meaning}</dd>
					</div>
				))}
			</dl>
			<p>
				The number counts placements, not turns: "wins in 3" means the winning piece goes down on the third
				placement from now.
			</p>

			<h2>Move values</h2>
			<p>
				With move values on, every legal choice is labelled from the point of view of the player about to move:{" "}
				<Chip label="W3" /> wins in 3, <Chip label="L2" /> loses in 2 against best play, and <Chip label="=" />{" "}
				holds the draw. When you are placing, the labels sit on the empty cells; when you are choosing, they sit
				on the pieces in the tray.
			</p>

			<h2>Annotations</h2>
			<p>
				Annotations are chosen in setup, before the game starts, and stay fixed for the whole game: there is no
				toggle on the play screen. Against the bot most people leave the outcome on. In a two-person game they
				are usually left off, so that nobody sees the answer unless both players want to.
			</p>

			<h2>Undo and New game</h2>
			<p>
				<b>Undo</b> rewinds to your previous decision. Against the bot it takes back the bot's reply as well, so
				you land where you last had a choice to make. <b>New game</b> clears the board and keeps the same setup.
				Every move so far is listed under the move log.
			</p>

			<h2>Under the hood</h2>
			<p>
				The first few moves are answered from an opening book computed ahead of time. Everything after that is
				searched to the end of the game right here in your browser, in WebAssembly, so nothing about your game
				leaves the device.
			</p>
			<p>
				The solver is a port of Emil Indzhev's{" "}
				<a href="https://github.com/indjev99/Quarto-Solver">Quarto-Solver</a>.
			</p>
			<p>
				The <Link to="/rules">Rules</Link> page covers the pieces, the board and the two ways to win.
			</p>
		</HelpPage>
	);
}
