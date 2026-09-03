//! Alpha-beta search over [`Position`], mirroring the C prototype move for move.
//!
//! Values are from the mover's perspective: `0` is a draw, a positive value is a
//! forced win and a negative one a forced loss, with larger magnitudes meaning
//! sooner. `moves_left + 1 - |value|` is the number of placements until the end.

use crate::position::{Position, variant_of};
use crate::table::{Entry, NUM_TTS, TranspositionTable, table_for_moves_done};
use crate::tables::{RotMasks, Tables};
use crate::{NUM_CELLS, NUM_MOVES, NUM_PROPS, NUM_VARIANTS};

/// Sentinel beyond every reachable value.
pub const INF: i16 = i16::MAX;

/// Everything a search needs besides the position: rules tables, symmetry
/// tables, the transposition shards, and the node counter.
#[derive(Debug)]
pub struct Search<'a> {
	tables: &'a Tables,
	rot: &'a RotMasks,
	tts: &'a mut [TranspositionTable; NUM_TTS],
	nodes: &'a mut u64,
}

/// Which (property, variant) pairs must not be handed over because a free cell
/// would complete a win for them.
#[must_use]
pub fn lose_mask(tables: &Tables, s: &Position) -> usize {
	let mut mask = 0;
	for (prop, variants) in s.cells_props().iter().enumerate() {
		for (variant, &cells) in variants.iter().enumerate() {
			if !s.cells_taken() & tables.lose_prop_var_cells[usize::from(cells)] != 0 {
				mask |= 1 << (prop * NUM_VARIANTS + variant);
			}
		}
	}
	mask
}

/// True when the piece in hand can be placed to complete a win right now.
#[must_use]
pub fn check_win_in_one(tables: &Tables, s: &Position) -> bool {
	let piece = s.curr_piece();
	(0..NUM_CELLS).any(|cell| {
		s.is_cell_free(cell_index(cell))
			&& tables.cell_win_masks[cell].iter().any(|&win_mask| {
				let others = win_mask & !(1 << cell);
				(0..NUM_PROPS)
					.any(|prop| s.cells_props()[prop][variant_of(piece, prop)] & others == others)
			})
	})
}

fn cell_index(cell: usize) -> u8 {
	u8::try_from(cell).expect("cell fits in u8")
}

impl<'a> Search<'a> {
	/// Borrow the pieces of a solver for one search.
	pub fn new(
		tables: &'a Tables,
		rot: &'a RotMasks,
		tts: &'a mut [TranspositionTable; NUM_TTS],
		nodes: &'a mut u64,
	) -> Self {
		Self {
			tables,
			rot,
			tts,
			nodes,
		}
	}

	/// The rules tables this search runs under.
	#[must_use]
	pub fn tables(&self) -> &'a Tables {
		self.tables
	}

	/// Exact value of `s` for the player to move.
	pub fn eval(&mut self, s: &mut Position) -> i16 {
		let moves_left = i16::from(s.moves_left());
		if s.is_won(self.tables) {
			return moves_left + 1;
		}
		if s.is_done() {
			return 0;
		}
		let to_place = s.is_to_place();
		if to_place && check_win_in_one(self.tables, s) {
			return moves_left;
		}
		if to_place && moves_left == 1 {
			return 0;
		}
		let min = -(moves_left - i16::from(to_place));
		let max = moves_left - if to_place { 2 } else { 1 };
		if to_place {
			self.eval_place(s, min, max)
		} else {
			self.eval_select(s, min, max)
		}
	}

	/// Alpha-beta value of a position where the piece in hand must be placed.
	pub fn eval_place(&mut self, s: &mut Position, mut alpha: i16, beta: i16) -> i16 {
		*self.nodes += 1;
		let piece = s.curr_piece();
		let mut cells_priors = [(0i16, 0u8); NUM_CELLS];
		let num_moves = self.cells_by_prior(s, &mut cells_priors);

		let mut val = -INF;
		for &(_, cell) in &cells_priors[..num_moves] {
			s.move_place(cell);
			let next_val = self.eval_select(s, alpha, beta);
			s.undo_place(piece, cell);

			if next_val > val {
				val = next_val;
				alpha = alpha.max(val);
				if alpha >= beta {
					break;
				}
			}
		}
		val
	}

	/// Fill `out` with the free cells ordered by a cheap threat heuristic, ties
	/// broken by cell index, and return how many there are.
	fn cells_by_prior(&self, s: &Position, out: &mut [(i16, u8); NUM_CELLS]) -> usize {
		let piece = s.curr_piece();
		let mut num_moves = 0;
		for cell in 0..NUM_CELLS {
			if !s.is_cell_free(cell_index(cell)) {
				continue;
			}
			let mut prior: i16 = 0;
			for &win_mask in &self.tables.cell_win_masks[cell] {
				let others = win_mask & !(1 << cell);
				if s.cells_taken() & others == others {
					for prop in 0..NUM_PROPS {
						let opposite = 1 - variant_of(piece, prop);
						if s.cells_props()[prop][opposite] & others == others {
							prior += 2;
						}
					}
				} else {
					for prop in 0..NUM_PROPS {
						let same = s.cells_props()[prop][variant_of(piece, prop)];
						let leftover = (same & others) ^ others;
						if leftover.count_ones() <= 1 {
							prior -= 1;
						}
					}
				}
			}
			if s.moves_left() == 2 {
				prior = -prior;
			}
			out[num_moves] = (prior, cell_index(cell));
			num_moves += 1;
		}
		out[..num_moves].sort_unstable();
		num_moves
	}

	/// Alpha-beta value of a position where a piece must be handed over.
	pub fn eval_select(&mut self, s: &mut Position, mut alpha: i16, mut beta: i16) -> i16 {
		*self.nodes += 1;
		let old_alpha = alpha;
		let old_beta = beta;
		let moves_left = i16::from(s.moves_left());

		let tables = self.tables;
		let selects = &tables.not_losing_selects[lose_mask(tables, s)];

		if !selects.iter().any(|&piece| s.is_piece_free(piece)) {
			return -moves_left;
		}
		if moves_left == 1 {
			return 0;
		}

		alpha = alpha.max(-(moves_left - 2));
		if alpha >= beta {
			return alpha;
		}

		let key = s.canonical_key(self.rot);
		let tt = table_for_moves_done(NUM_MOVES - usize::from(s.moves_left()));

		if let Some(entry) = self.tts[tt].get(key) {
			let val = i16::from(entry.val);
			if entry.is_alpha && val > alpha {
				alpha = val;
				if alpha >= beta {
					return alpha;
				}
			}
			if entry.is_beta && val < beta {
				beta = val;
				if alpha >= beta {
					return beta;
				}
			}
		}

		let mut val = -INF;
		for &piece in selects {
			if !s.is_piece_free(piece) {
				continue;
			}
			s.move_select(piece);
			let next_val = -self.eval_place(s, -beta, -alpha);
			s.undo_select();

			if next_val > val {
				val = next_val;
				alpha = alpha.max(val);
				if alpha >= beta {
					break;
				}
			}
		}

		// At least one non-losing piece was free, so `val` is a real value in -17..=17.
		#[allow(clippy::cast_possible_truncation)]
		let entry = Entry {
			val: val as i8,
			is_alpha: val > old_alpha,
			is_beta: val < old_beta,
		};
		self.tts[tt].put(key, entry);
		val
	}
}

#[cfg(test)]
mod tests {
	use super::{Search, check_win_in_one, lose_mask};
	use crate::NUM_MOVES;
	use crate::position::Position;
	use crate::rules::Rules;
	use crate::table::{DEFAULT_TABLE_SIZE, NUM_TTS, TranspositionTable};
	use crate::tables::{Tables, rot_masks};

	/// Upstream fixture `games_reg/1.txt` as (piece, cell) tokens; a drawn game.
	const FIXTURE_1: [u8; 32] = [
		2, 15, 14, 7, 5, 0, 10, 1, 9, 14, 15, 5, 4, 10, 8, 6, 7, 4, 3, 2, 1, 3, 11, 11, 6, 9, 0, 8,
		13, 12, 12, 13,
	];

	struct Fixture {
		tables: Tables,
		tts: [TranspositionTable; NUM_TTS],
		nodes: u64,
	}

	impl Fixture {
		fn new(rules: Rules) -> Self {
			Self {
				tables: Tables::new(rules),
				tts: std::array::from_fn(|_| TranspositionTable::new(DEFAULT_TABLE_SIZE)),
				nodes: 0,
			}
		}

		fn search(&mut self) -> Search<'_> {
			Search::new(&self.tables, rot_masks(), &mut self.tts, &mut self.nodes)
		}
	}

	fn play(moves: &[u8]) -> Position {
		let mut position = Position::new();
		for pair in moves.chunks(2) {
			position.move_select(pair[0]);
			if let Some(&cell) = pair.get(1) {
				position.move_place(cell);
			}
		}
		position
	}

	struct XorShift32(u32);

	impl XorShift32 {
		fn below(&mut self, bound: usize) -> usize {
			let mut x = self.0;
			x ^= x << 13;
			x ^= x >> 17;
			x ^= x << 5;
			self.0 = x;
			usize::try_from(x).unwrap() % bound
		}
	}

	fn random_select_position(rng: &mut XorShift32, tables: &Tables) -> Position {
		loop {
			let mut position = Position::new();
			let plies = 1 + rng.below(NUM_MOVES - 2);
			let mut ok = true;
			for _ in 0..plies {
				let pieces: Vec<u8> = (0..16).filter(|&p| position.is_piece_free(p)).collect();
				let cells: Vec<u8> = (0..16).filter(|&c| position.is_cell_free(c)).collect();
				position.move_select(pieces[rng.below(pieces.len())]);
				position.move_place(cells[rng.below(cells.len())]);
				if position.is_won(tables) {
					ok = false;
					break;
				}
			}
			if ok {
				return position;
			}
		}
	}

	#[test]
	fn a_won_position_is_worth_moves_left_plus_one() {
		let mut fixture = Fixture::new(Rules::Lines);
		let mut position = play(&[0, 0, 2, 1, 4, 2, 6, 3]);
		assert!(position.is_won(&fixture.tables));
		assert_eq!(fixture.search().eval(&mut position), 13);
	}

	#[test]
	fn a_win_in_one_is_worth_moves_left() {
		let mut fixture = Fixture::new(Rules::Squares);
		let mut position = play(&[0, 0, 2, 1, 4, 2, 6]);
		assert!(check_win_in_one(&fixture.tables, &position));
		assert_eq!(fixture.search().eval(&mut position), 13);
		assert_eq!(fixture.nodes, 0);
	}

	#[test]
	fn placing_the_last_piece_without_winning_is_a_draw() {
		let mut fixture = Fixture::new(Rules::Squares);
		let mut position = play(&FIXTURE_1[..31]);
		assert_eq!(position.moves_left(), 1);
		assert!(position.is_to_place());
		assert!(!position.is_won(&fixture.tables));
		assert_eq!(fixture.search().eval(&mut position), 0);
		assert_eq!(fixture.nodes, 0);
	}

	#[test]
	fn handing_over_when_every_piece_loses_is_worth_minus_moves_left() {
		let mut fixture = Fixture::new(Rules::Lines);
		let mut position = play(&[0, 0, 2, 1, 4, 2, 1, 4, 3, 5, 5, 6]);
		assert_eq!(position.moves_left(), 10);
		assert!(!position.is_to_place());
		assert_eq!(lose_mask(&fixture.tables, &position), 0b100_0011);
		assert_eq!(fixture.search().eval(&mut position), -10);
	}

	#[test]
	fn not_losing_selects_never_hand_over_an_immediate_win() {
		let tables = Tables::new(Rules::Squares);
		let mut rng = XorShift32(0x5EED_1234);
		for _ in 0..300 {
			let mut position = random_select_position(&mut rng, &tables);
			let mask = lose_mask(&tables, &position);
			for piece in 0..16u8 {
				if !position.is_piece_free(piece) {
					continue;
				}
				position.move_select(piece);
				let wins = check_win_in_one(&tables, &position);
				position.undo_select();
				let safe = tables.not_losing_selects[mask].contains(&piece);
				assert_eq!(safe, !wins, "piece {piece} on {position:?}");
			}
		}
	}

	#[test]
	fn eval_is_stable_across_repeated_searches_with_the_table_warm() {
		let mut fixture = Fixture::new(Rules::Squares);
		let mut position = play(&FIXTURE_1[..20]);
		let cold = fixture.search().eval(&mut position);
		let cold_nodes = fixture.nodes;
		let warm = fixture.search().eval(&mut position);
		assert_eq!(cold, warm);
		assert_eq!(cold, 0);
		assert!(fixture.nodes - cold_nodes < cold_nodes);
	}
}
