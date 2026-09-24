import {createFileRoute, Link} from "@tanstack/react-router";
import {ALL_PIECES, type Piece, pieceName} from "../game/pieces.js";
import {boardWith} from "../game/rules.js";
import {PieceGlyph} from "../ui/PieceGlyph.js";
import {WinDiagram} from "../ui/WinDiagram.js";
import {HelpPage} from "./-help-page.js";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
});

/** Each trait shown as the pair of pieces that differ in nothing else. */
const TRAITS: readonly {readonly label: string; readonly pair: readonly [Piece, Piece]}[] = [
	{label: "light or dark", pair: [0, 1]},
	{label: "round or square", pair: [0, 2]},
	{label: "short or tall", pair: [0, 4]},
	{label: "solid or hollow", pair: [0, 8]},
];

const STEPS: readonly {readonly title: string; readonly detail: string}[] = [
	{title: "Place", detail: "Put the piece you were handed on any empty cell."},
	{title: "Pick", detail: "Choose one of the pieces still off the board and hand it to your opponent."},
];

/** Four different dark pieces along the top row; the two bystanders share no trait with the row. */
const DARK_ROW = boardWith({a1: 1, b1: 3, c1: 5, d1: 15, c2: 6, b3: 8});

/** Four tall pieces in the middle block. */
const TALL_SQUARE = boardWith({b2: 4, c2: 6, b3: 13, c3: 15, a1: 1, d4: 8});

function RulesPage() {
	return (
		<HelpPage title="Rules">
			<h2>The pieces</h2>
			<p>
				Quarto is played with sixteen pieces. Each is light or dark, round or square, short or tall, and solid
				or hollow, and no two pieces are alike: every combination of the four traits appears exactly once.
			</p>
			<div className="piece-set" aria-label="The sixteen pieces">
				{ALL_PIECES.map((piece) => (
					<div key={piece} className="slot" role="img" aria-label={pieceName(piece)}>
						<PieceGlyph piece={piece} />
					</div>
				))}
			</div>
			<div className="trait-row">
				{TRAITS.map(({label, pair}) => (
					<div key={label} className="trait">
						<div className="pair">
							<PieceGlyph piece={pair[0]} />
							<PieceGlyph piece={pair[1]} />
						</div>
						<span>{label}</span>
					</div>
				))}
			</div>

			<h2>The board</h2>
			<p>
				The board has sixteen cells in a four-by-four grid, one for each piece. All sixteen pieces start off the
				board, and a piece never moves once it has been placed.
			</p>

			<h2>Taking turns</h2>
			<p>The first player picks a piece for the second, who places it. After that every turn is the same:</p>
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

			<h2>Winning</h2>
			<p>
				Whoever places the fourth piece of a row, column or diagonal in which all four pieces share at least one
				trait wins on the spot. The pieces can differ in everything else: four dark pieces of any shape, height
				and top make a line.
			</p>
			<WinDiagram board={DARK_ROW} rules="lines" caption="Four different dark pieces in a row" />
			<p>
				Over the real table a player claims the win by calling <i>Quarto!</i> before the next piece is chosen,
				and a line nobody calls stays in play. Here the app watches the board and ends the game the moment a
				winning line appears, so there is nothing to call.
			</p>

			<h2>Lines and 2×2 squares</h2>
			<p>
				With 2×2 squares turned on in setup, any 2×2 block of four pieces sharing a trait also wins. Nine such
				blocks fit on the board, which makes the game far sharper: with lines alone, careful players tend to
				draw.
			</p>
			<WinDiagram board={TALL_SQUARE} rules="squares" caption="Four tall pieces in a 2×2 square" />

			<h2>A draw</h2>
			<p>If the sixteenth piece is placed without either player winning, the game is a draw.</p>
			<p>
				<Link to="/app">Using the app</Link> covers the solver's verdict and the controls.
			</p>
		</HelpPage>
	);
}
