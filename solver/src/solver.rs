//! The public solver: a game position with move history, the search that
//! evaluates it, and the transposition tables that persist between games and
//! are seeded from the opening book.

use crate::book;
use crate::position::Position;
use crate::rules::Rules;
use crate::search::{INF, Search, lose_mask};
use crate::table::{DEFAULT_TABLE_SIZE, Entry, NUM_TTS, TranspositionTable, table_for_moves_done};
use crate::tables::{RotMasks, Tables, rot_masks};
use crate::{NUM_CELLS, NUM_PIECES};

/// Seed used until [`Solver::set_seed`] is called, and whenever it is given zero.
const DEFAULT_SEED: u32 = 0x9E37_79B9;

/// Perfect-play Quarto solver for one rules variant.
///
/// Moves are applied with [`apply_select`](Self::apply_select) and
/// [`apply_place`](Self::apply_place) and reversed with [`undo`](Self::undo).
/// Values follow the search convention: `0` is a draw, the sign says whether
/// the player to move wins, and `moves_left + 1 - |value|` placements remain.
#[derive(Debug)]
pub struct Solver {
	rules: Rules,
	tables: Tables,
	rot: &'static RotMasks,
	tts: [TranspositionTable; NUM_TTS],
	position: Position,
	history: Vec<u8>,
	nodes: u64,
	rng: u32,
	book_entries: usize,
	book_depth: u8,
}

impl Solver {
	/// A solver with the default transposition table size per shard.
	#[must_use]
	pub fn new(rules: Rules) -> Self {
		Self::with_table_size(rules, DEFAULT_TABLE_SIZE)
	}

	/// A solver whose transposition shards each hold `table_size` slots.
	#[must_use]
	pub fn with_table_size(rules: Rules, table_size: usize) -> Self {
		let mut solver = Self {
			rules,
			tables: Tables::new(rules),
			rot: rot_masks(),
			tts: std::array::from_fn(|_| TranspositionTable::new(table_size)),
			position: Position::new(),
			history: Vec::new(),
			nodes: 0,
			rng: DEFAULT_SEED,
			book_entries: 0,
			book_depth: 0,
		};
		solver.reset();
		solver
	}

	/// Switch win conditions. Transposition tables are rules-specific, so they
	/// are cleared, and the game restarts.
	pub fn set_rules(&mut self, rules: Rules) {
		self.rules = rules;
		self.tables = Tables::new(rules);
		for tt in &mut self.tts {
			tt.clear();
		}
		self.reset();
	}

	/// The rules in force.
	#[must_use]
	pub const fn rules(&self) -> Rules {
		self.rules
	}

	/// Start a new game, keeping the transposition tables and reseeding them
	/// from the opening book.
	pub fn reset(&mut self) {
		self.load_book();
		self.position = Position::new();
		self.history.clear();
		self.nodes = 0;
	}

	/// Store every book position of the current rules as an exact value.
	fn load_book(&mut self) {
		self.book_entries = 0;
		self.book_depth = 0;
		for entry in book::entries(self.rules) {
			let moves_done = entry.moves_done();
			self.tts[table_for_moves_done(usize::from(moves_done))].put(
				entry.key(),
				Entry {
					val: entry.value,
					is_alpha: true,
					is_beta: true,
				},
			);
			self.book_entries += 1;
			self.book_depth = self.book_depth.max(moves_done);
		}
	}

	/// Positions in the opening book for the current rules.
	#[must_use]
	pub const fn book_entries(&self) -> usize {
		self.book_entries
	}

	/// Placements covered by the opening book for the current rules.
	#[must_use]
	pub const fn book_depth(&self) -> u8 {
		self.book_depth
	}

	/// Hand `piece` to the opponent; false when that is not a legal move now.
	pub fn apply_select(&mut self, piece: u8) -> bool {
		let s = &self.position;
		if s.is_to_place() || s.is_done() || s.is_won(&self.tables) {
			return false;
		}
		if usize::from(piece) >= NUM_PIECES || !s.is_piece_free(piece) {
			return false;
		}
		self.position.move_select(piece);
		self.history.push(piece);
		true
	}

	/// Put the piece in hand on `cell`; false when that is not a legal move now.
	pub fn apply_place(&mut self, cell: u8) -> bool {
		let s = &self.position;
		if !s.is_to_place() {
			return false;
		}
		if usize::from(cell) >= NUM_CELLS || !s.is_cell_free(cell) {
			return false;
		}
		self.position.move_place(cell);
		self.history.push(cell);
		true
	}

	/// Take back the most recent selection or placement; false at the start.
	pub fn undo(&mut self) -> bool {
		let Some(last) = self.history.pop() else {
			return false;
		};
		if self.position.is_to_place() {
			self.position.undo_select();
		} else if let Some(&piece) = self.history.last() {
			self.position.undo_place(piece, last);
		}
		true
	}

	/// Placements remaining before the board is full.
	#[must_use]
	pub const fn moves_left(&self) -> u8 {
		self.position.moves_left()
	}

	/// The piece in hand, or [`NO_PIECE`].
	#[must_use]
	pub const fn current_piece(&self) -> u8 {
		self.position.curr_piece()
	}

	/// Bitmask of pieces already selected.
	#[must_use]
	pub const fn pieces_taken(&self) -> u16 {
		self.position.pieces_taken()
	}

	/// Bitmask of occupied cells.
	#[must_use]
	pub const fn cells_taken(&self) -> u16 {
		self.position.cells_taken()
	}

	/// The piece on `cell`, or [`NO_PIECE`].
	#[must_use]
	pub fn piece_at(&self, cell: u8) -> u8 {
		self.position.piece_at(cell)
	}

	/// True when a piece is in hand waiting to be placed.
	#[must_use]
	pub const fn is_to_place(&self) -> bool {
		self.position.is_to_place()
	}

	/// True when the last placement completed a win.
	#[must_use]
	pub fn is_won(&self) -> bool {
		self.position.is_won(&self.tables)
	}

	/// True when the board is full.
	#[must_use]
	pub const fn is_done(&self) -> bool {
		self.position.is_done()
	}

	/// Exact value of the current position for the player to move.
	#[must_use]
	pub fn evaluate(&mut self) -> i8 {
		let (mut search, position) = self.parts();
		narrow(search.eval(position))
	}

	/// Value of handing over `piece`, from the selecting player's perspective.
	#[must_use]
	pub fn evaluate_select(&mut self, piece: u8) -> i8 {
		let (mut search, position) = self.parts();
		position.move_select(piece);
		let val = -search.eval(position);
		position.undo_select();
		narrow(val)
	}

	/// Value of placing the piece in hand on `cell`, from the placing player's perspective.
	#[must_use]
	pub fn evaluate_place(&mut self, cell: u8) -> i8 {
		let (mut search, position) = self.parts();
		let piece = position.curr_piece();
		position.move_place(cell);
		let val = search.eval(position);
		position.undo_place(piece, cell);
		narrow(val)
	}

	/// Search nodes visited since the last [`reset`](Self::reset).
	#[must_use]
	pub const fn node_count(&self) -> u64 {
		self.nodes
	}

	/// Seed the tie-breaking shuffle used by [`best_move`](Self::best_move).
	pub fn set_seed(&mut self, seed: u32) {
		self.rng = if seed == 0 { DEFAULT_SEED } else { seed };
	}

	/// Canonical key of the current position (see [`Position::canonical_key`]).
	#[must_use]
	pub fn canonical_key(&self) -> u128 {
		self.position.canonical_key(self.rot)
	}

	/// A move of maximal exact value, or `None` once the game is over. Ties
	/// resolve randomly from the seed.
	#[must_use]
	pub fn best_move(&mut self) -> Option<u8> {
		if self.is_won() || self.is_done() {
			return None;
		}
		if self.is_to_place() {
			self.best_place()
		} else {
			self.best_select()
		}
	}

	fn best_place(&mut self) -> Option<u8> {
		let mut moves: Vec<u8> = (0..NUM_CELLS)
			.map(|cell| u8::try_from(cell).expect("cell fits in u8"))
			.filter(|&cell| self.position.is_cell_free(cell))
			.collect();
		self.shuffle(&mut moves);

		let (mut search, position) = self.parts();
		let piece = position.curr_piece();
		for &cell in &moves {
			position.move_place(cell);
			let won = position.is_won(search.tables());
			position.undo_place(piece, cell);
			if won {
				return Some(cell);
			}
		}

		let moves_left = i16::from(position.moves_left());
		if moves_left == 1 {
			return moves.first().copied();
		}

		let mut alpha = -(moves_left - 1);
		let beta = moves_left - 2;
		let mut best = -INF;
		let mut best_move = moves[0];
		for &cell in &moves {
			position.move_place(cell);
			let val = search.eval_select(position, alpha, beta);
			position.undo_place(piece, cell);
			if val > best {
				best = val;
				best_move = cell;
				alpha = alpha.max(val);
				if alpha >= beta {
					break;
				}
			}
		}
		Some(best_move)
	}

	fn best_select(&mut self) -> Option<u8> {
		let mut moves: Vec<u8> = self.tables.not_losing_selects
			[lose_mask(&self.tables, &self.position)]
		.iter()
		.copied()
		.filter(|&piece| self.position.is_piece_free(piece))
		.collect();

		if moves.is_empty() {
			moves = (0..NUM_PIECES)
				.map(|piece| u8::try_from(piece).expect("piece fits in u8"))
				.filter(|&piece| self.position.is_piece_free(piece))
				.collect();
			self.shuffle(&mut moves);
			return moves.first().copied();
		}

		self.shuffle(&mut moves);

		let moves_left = i16::from(self.position.moves_left());
		if moves_left == 1 {
			return moves.first().copied();
		}

		let (mut search, position) = self.parts();
		let mut alpha = -(moves_left - 2);
		let beta = moves_left - 1;
		let mut best = -INF;
		let mut best_move = moves[0];
		for &piece in &moves {
			position.move_select(piece);
			let val = -search.eval_place(position, -beta, -alpha);
			position.undo_select();
			if val > best {
				best = val;
				best_move = piece;
				alpha = alpha.max(val);
				if alpha >= beta {
					break;
				}
			}
		}
		Some(best_move)
	}

	fn parts(&mut self) -> (Search<'_>, &mut Position) {
		(
			Search::new(&self.tables, self.rot, &mut self.tts, &mut self.nodes),
			&mut self.position,
		)
	}

	fn next_random(&mut self) -> u32 {
		let mut x = self.rng;
		x ^= x << 13;
		x ^= x >> 17;
		x ^= x << 5;
		self.rng = x;
		x
	}

	/// Fisher-Yates from the top, exactly as the prototype draws its indices.
	fn shuffle(&mut self, moves: &mut [u8]) {
		for i in (2..=moves.len()).rev() {
			let j = usize::try_from(self.next_random()).expect("u32 fits in usize") % i;
			moves.swap(i - 1, j);
		}
	}
}

fn narrow(val: i16) -> i8 {
	i8::try_from(val).expect("search values fit in i8")
}

#[cfg(test)]
mod tests {
	use super::Solver;
	use crate::position::NO_PIECE;
	use crate::rules::Rules;

	/// Upstream fixture `games_reg/1.txt` as (piece, cell) tokens; a drawn game.
	const FIXTURE_1: [u8; 32] = [
		2, 15, 14, 7, 5, 0, 10, 1, 9, 14, 15, 5, 4, 10, 8, 6, 7, 4, 3, 2, 1, 3, 11, 11, 6, 9, 0, 8,
		13, 12, 12, 13,
	];

	fn replay(solver: &mut Solver, moves: &[u8]) {
		for (i, &token) in moves.iter().enumerate() {
			let applied = if i % 2 == 0 {
				solver.apply_select(token)
			} else {
				solver.apply_place(token)
			};
			assert!(applied, "token {i} = {token}");
		}
	}

	fn legal_moves(solver: &Solver) -> Vec<u8> {
		let taken = if solver.is_to_place() {
			solver.cells_taken()
		} else {
			solver.pieces_taken()
		};
		(0..16u8).filter(|&m| taken & (1 << m) == 0).collect()
	}

	fn move_value(solver: &mut Solver, m: u8) -> i8 {
		if solver.is_to_place() {
			solver.evaluate_place(m)
		} else {
			solver.evaluate_select(m)
		}
	}

	#[test]
	fn a_new_solver_is_at_the_empty_board() {
		let solver = Solver::new(Rules::Squares);
		assert_eq!(solver.rules(), Rules::Squares);
		assert_eq!(solver.moves_left(), 16);
		assert_eq!(solver.current_piece(), NO_PIECE);
		assert_eq!(solver.pieces_taken(), 0);
		assert_eq!(solver.cells_taken(), 0);
		assert!(!solver.is_to_place());
		assert!(!solver.is_won());
		assert!(!solver.is_done());
		assert_eq!(solver.node_count(), 0);
		assert_eq!(solver.canonical_key(), 0);
	}

	#[test]
	fn apply_rejects_illegal_moves_and_accepts_legal_ones() {
		let mut solver = Solver::new(Rules::Squares);
		assert!(!solver.apply_place(0), "nothing in hand");
		assert!(!solver.apply_select(16), "no such piece");
		assert!(solver.apply_select(3));
		assert!(!solver.apply_select(4), "already holding a piece");
		assert!(!solver.apply_place(16), "no such cell");
		assert!(solver.apply_place(5));
		assert!(!solver.apply_select(3), "piece already used");
		assert!(solver.apply_select(4));
		assert!(!solver.apply_place(5), "cell already used");
		assert_eq!(solver.piece_at(5), 3);
		assert_eq!(solver.piece_at(6), NO_PIECE);
	}

	#[test]
	fn undo_walks_back_through_the_history() {
		let mut solver = Solver::new(Rules::Squares);
		assert!(!solver.undo());
		replay(&mut solver, &FIXTURE_1[..7]);
		assert!(solver.is_to_place());
		assert!(solver.undo());
		assert!(!solver.is_to_place());
		assert_eq!(solver.pieces_taken() & (1 << FIXTURE_1[6]), 0);
		assert!(solver.undo());
		assert!(solver.is_to_place());
		assert_eq!(solver.current_piece(), FIXTURE_1[4]);
		assert_eq!(solver.cells_taken() & (1 << FIXTURE_1[5]), 0);
		for _ in 0..5 {
			assert!(solver.undo());
		}
		assert!(!solver.undo());
		assert_eq!(solver.moves_left(), 16);
	}

	#[test]
	fn no_more_selections_after_a_win() {
		let mut solver = Solver::new(Rules::Lines);
		replay(&mut solver, &[0, 0, 2, 1, 4, 2, 6, 3]);
		assert!(solver.is_won());
		assert!(!solver.apply_select(1));
		assert_eq!(solver.best_move(), None);
	}

	#[test]
	fn a_known_drawn_endgame_evaluates_to_zero() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..28]);
		assert_eq!(solver.moves_left(), 2);
		assert_eq!(solver.evaluate(), 0);
		assert_eq!(solver.evaluate_select(12), 0);
		assert_eq!(solver.evaluate_select(13), 0);
	}

	#[test]
	fn an_immediate_win_is_worth_moves_left_and_best_move_takes_it() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &[0, 0, 2, 1, 4, 2, 6]);
		assert_eq!(solver.moves_left(), 13);
		assert_eq!(solver.evaluate(), 13);
		assert_eq!(solver.evaluate_place(3), 13);
		assert_eq!(solver.best_move(), Some(3));
		assert_eq!(solver.node_count(), 0);
	}

	#[test]
	fn values_match_the_prototype_after_twenty_plies_under_squares() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..20]);
		assert_eq!(solver.moves_left(), 6);
		assert_eq!(solver.evaluate(), 0);
		assert_eq!(solver.evaluate_select(1), 0);
		assert_eq!(solver.evaluate_select(11), 0);
		assert_eq!(solver.evaluate_select(13), -2);
		assert_eq!(solver.evaluate_select(0), -6);
		assert_eq!(solver.evaluate_select(6), -6);
		assert_eq!(solver.evaluate_select(12), -6);
	}

	#[test]
	fn values_match_the_prototype_after_twenty_one_plies_under_squares() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..21]);
		assert_eq!(solver.moves_left(), 6);
		assert_eq!(solver.evaluate(), 0);
		assert_eq!(solver.evaluate_place(3), 0);
		assert_eq!(solver.evaluate_place(11), -1);
		for cell in [8, 9, 12, 13] {
			assert_eq!(solver.evaluate_place(cell), -5, "cell {cell}");
		}
	}

	#[test]
	fn values_match_the_prototype_after_twenty_plies_under_lines() {
		let mut solver = Solver::new(Rules::Lines);
		replay(&mut solver, &FIXTURE_1[..20]);
		assert_eq!(solver.evaluate(), 0);
		for piece in [0, 6, 13] {
			assert_eq!(solver.evaluate_select(piece), 0, "piece {piece}");
		}
		for piece in [1, 11, 12] {
			assert_eq!(solver.evaluate_select(piece), -2, "piece {piece}");
		}
	}

	#[test]
	fn best_move_attains_the_maximal_value_at_late_positions() {
		for (rules, plies) in [
			(Rules::Squares, 20),
			(Rules::Squares, 21),
			(Rules::Squares, 26),
			(Rules::Lines, 26),
		] {
			let mut solver = Solver::new(rules);
			replay(&mut solver, &FIXTURE_1[..plies]);
			solver.set_seed(u32::try_from(plies).unwrap());
			let best = solver.best_move().expect("game in progress");
			let moves = legal_moves(&solver);
			assert!(moves.contains(&best), "{rules:?} {plies}: {best} is legal");
			let max = moves
				.iter()
				.map(|&m| move_value(&mut solver, m))
				.max()
				.unwrap();
			assert_eq!(
				move_value(&mut solver, best),
				max,
				"{rules:?} after {plies} plies"
			);
		}
	}

	/// Node counts and default-seed choices recorded from the C prototype
	/// (`quarto_native <plies> <rules>` on fixture 1), which pin down move
	/// ordering, table behaviour and the shuffle bit for bit.
	#[test]
	fn node_counts_and_best_moves_match_the_prototype() {
		for (rules, plies, eval_nodes, best_nodes, best) in [
			(Rules::Squares, 14, 17_265, 36, 0),
			(Rules::Squares, 17, 622, 72, 4),
			(Rules::Squares, 20, 422, 122, 11),
			(Rules::Lines, 14, 48_777, 36, 0),
			(Rules::Lines, 17, 94, 1_102, 8),
			(Rules::Lines, 20, 1_314, 27, 0),
		] {
			let mut solver = Solver::new(rules);
			replay(&mut solver, &FIXTURE_1[..plies]);
			let _ = solver.evaluate();
			assert_eq!(
				solver.node_count(),
				eval_nodes,
				"{rules:?} evaluate after {plies}"
			);
			assert_eq!(
				solver.best_move(),
				Some(best),
				"{rules:?} best_move after {plies}"
			);
			assert_eq!(
				solver.node_count() - eval_nodes,
				best_nodes,
				"{rules:?} best_move nodes after {plies}"
			);
		}
	}

	#[test]
	fn best_move_hands_over_some_piece_when_every_piece_loses() {
		let mut solver = Solver::new(Rules::Lines);
		replay(&mut solver, &[0, 0, 2, 1, 4, 2, 1, 4, 3, 5, 5, 6]);
		assert_eq!(solver.evaluate(), -10);
		let best = solver.best_move().expect("game in progress");
		assert!(legal_moves(&solver).contains(&best));
		assert_eq!(solver.evaluate_select(best), -10);
	}

	#[test]
	fn best_move_needs_no_search_for_the_last_placement() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..30]);
		assert_eq!(solver.moves_left(), 1);
		assert_eq!(solver.best_move(), Some(12));
		assert!(solver.apply_select(12));
		assert_eq!(solver.best_move(), Some(13));
		assert_eq!(solver.node_count(), 0);
	}

	#[test]
	fn best_move_tie_break_varies_with_the_seed() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..28]);
		let mut seen = std::collections::BTreeSet::new();
		for seed in 1..=12 {
			solver.set_seed(seed);
			seen.insert(solver.best_move());
		}
		assert_eq!(seen.len(), 2, "both remaining pieces draw");
	}

	#[test]
	fn set_rules_restarts_the_game() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..4]);
		solver.set_rules(Rules::Lines);
		assert_eq!(solver.rules(), Rules::Lines);
		assert_eq!(solver.moves_left(), 16);
		assert!(!solver.undo());
	}

	#[test]
	fn the_opening_book_answers_the_empty_board_without_searching() {
		for rules in [Rules::Squares, Rules::Lines] {
			let mut solver = Solver::new(rules);
			assert!(solver.book_entries() > 40_000, "{rules:?}");
			assert_eq!(solver.book_depth(), 4, "{rules:?}");
			solver.reset();
			assert_eq!(solver.evaluate(), 0, "{rules:?}");
			assert!(
				solver.node_count() < 100,
				"{rules:?}: {}",
				solver.node_count()
			);
		}
	}

	#[test]
	fn set_rules_swaps_in_the_matching_book() {
		let mut solver = Solver::new(Rules::Squares);
		solver.set_rules(Rules::Lines);
		assert_eq!(solver.book_entries(), 40_789);
		replay(&mut solver, &[0, 0, 2, 1, 4, 4, 6, 5]);
		assert!(!solver.is_won(), "a 2x2 square does not win under lines");
		let _ = solver.evaluate();
		assert!(
			solver.node_count() < 100,
			"the lines book covers four placements"
		);
		solver.set_rules(Rules::Squares);
		assert_eq!(solver.book_entries(), 40_729);
		replay(&mut solver, &[0, 0, 2, 1, 4, 4, 6, 5]);
		assert!(solver.is_won());
	}

	#[test]
	fn reset_keeps_the_transposition_tables_warm() {
		let mut solver = Solver::new(Rules::Squares);
		replay(&mut solver, &FIXTURE_1[..20]);
		assert_eq!(solver.evaluate(), 0);
		let cold = solver.node_count();
		solver.reset();
		assert_eq!(solver.node_count(), 0);
		replay(&mut solver, &FIXTURE_1[..20]);
		assert_eq!(solver.evaluate(), 0);
		assert!(solver.node_count() < cold);
	}
}
