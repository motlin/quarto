import {createFileRoute, Link} from "@tanstack/react-router";
import {Chip} from "../ui/Hint.js";
import type {VerdictKind} from "../game/narration.js";
import {HelpPage} from "./-help-page.js";

export const Route = createFileRoute("/app")({
	component: AppPage,
});

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

function AppPage() {
	return (
		<HelpPage title="Using the app">
			<h2>The play screen</h2>
			<p>
				The strip above the board always says what to do next: place the piece in your hand, or choose one from
				the tray for your opponent. Only the cells or pieces you can tap are marked, and the piece in your hand
				can be dragged onto a cell instead of tapped.
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
				The <Link to="/rules">Rules</Link> page covers the pieces, the board, how turns work and the two ways to
				win.
			</p>
		</HelpPage>
	);
}
