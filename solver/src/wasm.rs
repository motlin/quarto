//! JavaScript bindings, compiled only for `wasm32` with the `wasm` feature.
//!
//! [`WasmSolver`] wraps [`Solver`] one-to-one with camelCase method names. Rules
//! cross the boundary as a `squares` flag, pieces and cells as their indices,
//! and values as plain integers, so the web app needs no glue types.

use wasm_bindgen::prelude::wasm_bindgen;

use crate::rules::Rules;
use crate::solver::Solver;

/// The crate version, exposed so the web app can display which solver it loaded.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}

const fn rules_for(squares: bool) -> Rules {
	if squares {
		Rules::Squares
	} else {
		Rules::Lines
	}
}

/// A [`Solver`] owned by JavaScript.
#[wasm_bindgen]
#[derive(Debug)]
pub struct WasmSolver(Solver);

#[wasm_bindgen]
impl WasmSolver {
	/// A solver at the empty board, under squares rules when `squares` is true
	/// and lines rules otherwise.
	#[wasm_bindgen(constructor)]
	#[must_use]
	pub fn new(squares: bool) -> Self {
		Self(Solver::new(rules_for(squares)))
	}

	/// Switch win conditions and restart the game.
	#[wasm_bindgen(js_name = setRules)]
	pub fn set_rules(&mut self, squares: bool) {
		self.0.set_rules(rules_for(squares));
	}

	/// True under squares rules, false under lines rules.
	#[wasm_bindgen(js_name = rulesSquares)]
	#[must_use]
	pub fn rules_squares(&self) -> bool {
		self.0.rules() == Rules::Squares
	}

	/// Start a new game, keeping the transposition tables warm.
	pub fn reset(&mut self) {
		self.0.reset();
	}

	/// Hand `piece` to the opponent; false when that is not a legal move now.
	#[wasm_bindgen(js_name = applySelect)]
	pub fn apply_select(&mut self, piece: u8) -> bool {
		self.0.apply_select(piece)
	}

	/// Put the piece in hand on `cell`; false when that is not a legal move now.
	#[wasm_bindgen(js_name = applyPlace)]
	pub fn apply_place(&mut self, cell: u8) -> bool {
		self.0.apply_place(cell)
	}

	/// Take back the most recent selection or placement; false at the start.
	pub fn undo(&mut self) -> bool {
		self.0.undo()
	}

	/// Placements remaining before the board is full.
	#[wasm_bindgen(js_name = movesLeft)]
	#[must_use]
	pub fn moves_left(&self) -> u8 {
		self.0.moves_left()
	}

	/// The piece in hand, or 16 when there is none.
	#[wasm_bindgen(js_name = currentPiece)]
	#[must_use]
	pub fn current_piece(&self) -> u8 {
		self.0.current_piece()
	}

	/// Bitmask of pieces already selected.
	#[wasm_bindgen(js_name = piecesTaken)]
	#[must_use]
	pub fn pieces_taken(&self) -> u16 {
		self.0.pieces_taken()
	}

	/// Bitmask of occupied cells.
	#[wasm_bindgen(js_name = cellsTaken)]
	#[must_use]
	pub fn cells_taken(&self) -> u16 {
		self.0.cells_taken()
	}

	/// The piece on `cell`, or 16 when it is empty.
	#[wasm_bindgen(js_name = pieceAt)]
	#[must_use]
	pub fn piece_at(&self, cell: u8) -> u8 {
		self.0.piece_at(cell)
	}

	/// True when a piece is in hand waiting to be placed.
	#[wasm_bindgen(js_name = isToPlace)]
	#[must_use]
	pub fn is_to_place(&self) -> bool {
		self.0.is_to_place()
	}

	/// True when the last placement completed a win.
	#[wasm_bindgen(js_name = isWon)]
	#[must_use]
	pub fn is_won(&self) -> bool {
		self.0.is_won()
	}

	/// True when the board is full.
	#[wasm_bindgen(js_name = isDone)]
	#[must_use]
	pub fn is_done(&self) -> bool {
		self.0.is_done()
	}

	/// Exact value of the current position for the player to move: `0` is a
	/// draw, the sign says whether the player to move wins, and
	/// `movesLeft + 1 - |value|` placements remain.
	#[must_use]
	pub fn evaluate(&mut self) -> i8 {
		self.0.evaluate()
	}

	/// Value of handing over `piece`, from the selecting player's perspective.
	#[wasm_bindgen(js_name = evaluateSelect)]
	#[must_use]
	pub fn evaluate_select(&mut self, piece: u8) -> i8 {
		self.0.evaluate_select(piece)
	}

	/// Value of placing the piece in hand on `cell`, from the placing player's perspective.
	#[wasm_bindgen(js_name = evaluatePlace)]
	#[must_use]
	pub fn evaluate_place(&mut self, cell: u8) -> i8 {
		self.0.evaluate_place(cell)
	}

	/// A move of maximal exact value, or `-1` once the game is over.
	#[wasm_bindgen(js_name = bestMove)]
	#[must_use]
	pub fn best_move(&mut self) -> i32 {
		self.0.best_move().map_or(-1, i32::from)
	}

	/// Seed the tie-breaking shuffle used by [`bestMove`](Self::best_move).
	#[wasm_bindgen(js_name = setSeed)]
	pub fn set_seed(&mut self, seed: u32) {
		self.0.set_seed(seed);
	}

	/// Search nodes visited since the last [`reset`](Self::reset), as a double
	/// because JavaScript has no 64-bit integer without `BigInt`.
	#[wasm_bindgen(js_name = nodeCount)]
	#[must_use]
	#[allow(clippy::cast_precision_loss)]
	pub fn node_count(&self) -> f64 {
		self.0.node_count() as f64
	}

	/// Positions in the opening book for the current rules.
	#[wasm_bindgen(js_name = bookEntries)]
	#[must_use]
	pub fn book_entries(&self) -> usize {
		self.0.book_entries()
	}

	/// Placements covered by the opening book for the current rules.
	#[wasm_bindgen(js_name = bookDepth)]
	#[must_use]
	pub fn book_depth(&self) -> u8 {
		self.0.book_depth()
	}
}
