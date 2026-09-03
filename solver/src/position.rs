//! The mutable game position and its canonical (symmetry-reduced) key.

use crate::tables::{RotMasks, Tables};
use crate::{NUM_MOVES, NUM_PROPS, NUM_VARIANTS};

/// Sentinel for "no piece": the piece in hand between placement and selection.
pub const NO_PIECE: u8 = 16;

/// [`NUM_MOVES`] narrowed to the width of [`Position::moves_left`].
const MOVES_AT_START: u8 = 16;
const _: () = assert!(MOVES_AT_START as usize == NUM_MOVES);

/// The board plus whose turn it is, stored as bitmasks the way the C prototype does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Position {
	moves_left: u8,
	curr_piece: u8,
	pieces_taken: u16,
	cells_taken: u16,
	cells_props: [[u16; NUM_VARIANTS]; NUM_PROPS],
}

impl Default for Position {
	fn default() -> Self {
		Self::new()
	}
}

impl Position {
	/// The empty board with sixteen placements to go and no piece in hand.
	#[must_use]
	pub const fn new() -> Self {
		Self {
			moves_left: MOVES_AT_START,
			curr_piece: NO_PIECE,
			pieces_taken: 0,
			cells_taken: 0,
			cells_props: [[0; NUM_VARIANTS]; NUM_PROPS],
		}
	}

	/// Placements remaining before the board is full.
	#[must_use]
	pub const fn moves_left(&self) -> u8 {
		self.moves_left
	}

	/// The piece handed to the placer, or [`NO_PIECE`].
	#[must_use]
	pub const fn curr_piece(&self) -> u8 {
		self.curr_piece
	}

	/// Bitmask of pieces already selected (including the one in hand).
	#[must_use]
	pub const fn pieces_taken(&self) -> u16 {
		self.pieces_taken
	}

	/// Bitmask of occupied cells.
	#[must_use]
	pub const fn cells_taken(&self) -> u16 {
		self.cells_taken
	}

	/// For each property and variant, the cells holding a piece with that variant.
	#[must_use]
	pub const fn cells_props(&self) -> &[[u16; NUM_VARIANTS]; NUM_PROPS] {
		&self.cells_props
	}

	/// True between a selection and the placement that answers it.
	#[must_use]
	pub const fn is_to_place(&self) -> bool {
		self.curr_piece != NO_PIECE
	}

	/// True when `piece` has not been selected yet.
	#[must_use]
	pub const fn is_piece_free(&self, piece: u8) -> bool {
		self.pieces_taken & (1 << piece) == 0
	}

	/// True when `cell` is empty.
	#[must_use]
	pub const fn is_cell_free(&self, cell: u8) -> bool {
		self.cells_taken & (1 << cell) == 0
	}

	/// True when every cell is filled.
	#[must_use]
	pub const fn is_done(&self) -> bool {
		self.moves_left == 0
	}

	/// Hand `piece` to the opponent.
	pub fn move_select(&mut self, piece: u8) {
		self.pieces_taken |= 1 << piece;
		self.curr_piece = piece;
	}

	/// Reverse the most recent [`move_select`](Self::move_select).
	pub fn undo_select(&mut self) {
		self.pieces_taken &= !(1 << self.curr_piece);
		self.curr_piece = NO_PIECE;
	}

	/// Put the piece in hand on `cell`.
	pub fn move_place(&mut self, cell: u8) {
		self.cells_taken |= 1 << cell;
		for (prop, variants) in self.cells_props.iter_mut().enumerate() {
			variants[variant_of(self.curr_piece, prop)] |= 1 << cell;
		}
		self.curr_piece = NO_PIECE;
		self.moves_left -= 1;
	}

	/// Reverse a [`move_place`](Self::move_place) of `piece` on `cell`.
	pub fn undo_place(&mut self, piece: u8, cell: u8) {
		self.cells_taken &= !(1 << cell);
		for (prop, variants) in self.cells_props.iter_mut().enumerate() {
			variants[variant_of(piece, prop)] &= !(1 << cell);
		}
		self.curr_piece = piece;
		self.moves_left += 1;
	}

	/// True when some winning set of cells shares a property variant.
	#[must_use]
	pub fn is_won(&self, tables: &Tables) -> bool {
		tables.win_masks.iter().any(|&win_mask| {
			self.cells_props
				.iter()
				.flatten()
				.any(|&cells| cells & win_mask == win_mask)
		})
	}

	/// The piece on `cell`, or [`NO_PIECE`] when it is empty.
	#[must_use]
	pub fn piece_at(&self, cell: u8) -> u8 {
		if self.is_cell_free(cell) {
			return NO_PIECE;
		}
		self.cells_props
			.iter()
			.enumerate()
			.filter(|(_, variants)| variants[1] & (1 << cell) != 0)
			.fold(0, |piece, (prop, _)| piece | (1 << prop))
	}

	/// A key identifying this position up to board symmetry and piece-property
	/// relabelling, matching the C prototype's `getKey` bit for bit.
	#[must_use]
	pub fn canonical_key(&self, rot: &RotMasks) -> u128 {
		let cells_taken = usize::from(self.cells_taken);
		let min_cells_taken = rot
			.iter()
			.map(|table| table[cells_taken])
			.fold(u16::MAX, u16::min);

		rot.iter()
			.filter(|table| table[cells_taken] == min_cells_taken)
			.map(|table| {
				let mut props: [u16; NUM_PROPS] = std::array::from_fn(|prop| {
					let [zero, one] = self.cells_props[prop];
					table[usize::from(zero)].min(table[usize::from(one)])
				});
				sort_four(&mut props);
				props.iter().fold(u128::from(min_cells_taken), |key, &p| {
					(key << 16) | u128::from(p)
				})
			})
			.fold(u128::MAX, u128::min)
	}
}

/// Which variant (0 or 1) `piece` has for property `prop`.
pub(crate) fn variant_of(piece: u8, prop: usize) -> usize {
	usize::from((piece >> prop) & 1)
}

/// Sorting network for four elements, mirroring the prototype's `sortFour`.
fn sort_four(values: &mut [u16; NUM_PROPS]) {
	for (a, b) in [(0, 1), (2, 3), (0, 2), (1, 3), (1, 2)] {
		if values[a] > values[b] {
			values.swap(a, b);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::{NO_PIECE, Position};
	use crate::rules::Rules;
	use crate::tables::{Tables, rot_masks};
	use crate::{NUM_MOVES, NUM_PROPS, NUM_ROTS};

	fn pieces() -> std::ops::Range<u8> {
		0..16
	}

	fn cells() -> std::ops::Range<u8> {
		0..16
	}

	struct XorShift32(u32);

	impl XorShift32 {
		fn next(&mut self) -> u32 {
			let mut x = self.0;
			x ^= x << 13;
			x ^= x >> 17;
			x ^= x << 5;
			self.0 = x;
			x
		}

		fn below(&mut self, bound: usize) -> usize {
			usize::try_from(self.next()).unwrap() % bound
		}
	}

	/// Play a random legal prefix of a game, returning the position and the
	/// piece/cell pairs placed so the board can be rebuilt under a relabelling.
	fn random_position(rng: &mut XorShift32) -> (Position, Vec<(u8, u8)>) {
		let mut position = Position::new();
		let mut placements = Vec::new();
		let plies = rng.below(NUM_MOVES + 1);
		for _ in 0..plies {
			let free_pieces: Vec<u8> = pieces().filter(|&p| position.is_piece_free(p)).collect();
			let free_cells: Vec<u8> = cells().filter(|&c| position.is_cell_free(c)).collect();
			let piece = free_pieces[rng.below(free_pieces.len())];
			let cell = free_cells[rng.below(free_cells.len())];
			position.move_select(piece);
			position.move_place(cell);
			placements.push((piece, cell));
		}
		(position, placements)
	}

	fn rebuild(
		placements: &[(u8, u8)],
		map_piece: impl Fn(u8) -> u8,
		map_cell: impl Fn(u8) -> u8,
	) -> Position {
		let mut position = Position::new();
		for &(piece, cell) in placements {
			position.move_select(map_piece(piece));
			position.move_place(map_cell(cell));
		}
		position
	}

	fn rotate_cell(rot: usize, cell: u8) -> u8 {
		let image = rot_masks()[rot][1usize << cell];
		u8::try_from(image.trailing_zeros()).unwrap()
	}

	#[test]
	fn new_position_is_empty_and_waiting_for_a_selection() {
		let position = Position::new();
		assert_eq!(position.moves_left(), 16);
		assert_eq!(position.curr_piece(), NO_PIECE);
		assert!(!position.is_to_place());
		assert!(!position.is_done());
		assert!(pieces().all(|p| position.is_piece_free(p)));
		assert!(cells().all(|c| position.is_cell_free(c)));
	}

	#[test]
	fn select_then_place_updates_every_field_and_undo_restores_it() {
		let start = Position::new();
		let mut position = start;
		position.move_select(0b1010);
		assert!(position.is_to_place());
		assert_eq!(position.curr_piece(), 0b1010);
		assert!(!position.is_piece_free(0b1010));
		let selected = position;
		position.move_place(5);
		assert!(!position.is_to_place());
		assert_eq!(position.moves_left(), 15);
		assert!(!position.is_cell_free(5));
		assert_eq!(position.cells_props()[0][0], 1 << 5);
		assert_eq!(position.cells_props()[1][1], 1 << 5);
		assert_eq!(position.cells_props()[2][0], 1 << 5);
		assert_eq!(position.cells_props()[3][1], 1 << 5);
		position.undo_place(0b1010, 5);
		assert_eq!(position, selected);
		position.undo_select();
		assert_eq!(position, start);
	}

	#[test]
	fn piece_at_round_trips_after_move_place() {
		let mut rng = XorShift32(0x1234_5678);
		for _ in 0..200 {
			let (position, placements) = random_position(&mut rng);
			for &(piece, cell) in &placements {
				assert_eq!(position.piece_at(cell), piece);
			}
			for cell in cells() {
				if position.is_cell_free(cell) {
					assert_eq!(position.piece_at(cell), NO_PIECE);
				}
			}
		}
	}

	#[test]
	fn is_won_detects_a_shared_variant_on_a_line_only() {
		let tables = Tables::new(Rules::Lines);
		let mut position = Position::new();
		for (piece, cell) in [(0, 0), (2, 1), (4, 2)] {
			position.move_select(piece);
			position.move_place(cell);
			assert!(!position.is_won(&tables));
		}
		position.move_select(6);
		position.move_place(3);
		assert!(position.is_won(&tables));
	}

	#[test]
	fn a_two_by_two_square_wins_only_under_squares_rules() {
		let mut position = Position::new();
		for (piece, cell) in [(1, 0), (3, 1), (5, 4), (7, 5)] {
			position.move_select(piece);
			position.move_place(cell);
		}
		assert!(!position.is_won(&Tables::new(Rules::Lines)));
		assert!(position.is_won(&Tables::new(Rules::Squares)));
	}

	#[test]
	fn a_line_with_no_shared_variant_is_not_a_win() {
		let tables = Tables::new(Rules::Squares);
		let mut position = Position::new();
		for (piece, cell) in [(0b0000, 0), (0b1111, 1), (0b0101, 2), (0b1010, 3)] {
			position.move_select(piece);
			position.move_place(cell);
		}
		assert!(!position.is_won(&tables));
	}

	#[test]
	fn full_board_is_done() {
		let mut position = Position::new();
		for i in pieces() {
			position.move_select(i);
			position.move_place(i);
		}
		assert!(position.is_done());
		assert_eq!(position.pieces_taken(), 0xFFFF);
		assert_eq!(position.cells_taken(), 0xFFFF);
	}

	#[test]
	fn canonical_key_of_the_empty_board_is_zero() {
		assert_eq!(Position::new().canonical_key(rot_masks()), 0);
	}

	#[test]
	fn canonical_key_packs_cells_taken_above_the_sorted_props() {
		let mut position = Position::new();
		position.move_select(0);
		position.move_place(0);
		let key = position.canonical_key(rot_masks());
		assert_eq!(key >> 64, 1);
		assert_eq!(key & ((1u128 << 64) - 1), 0);
	}

	#[test]
	fn canonical_key_is_invariant_under_board_symmetries() {
		let rot = rot_masks();
		let mut rng = XorShift32(0xDEAD_BEEF);
		for _ in 0..1000 {
			let (position, placements) = random_position(&mut rng);
			let key = position.canonical_key(rot);
			let r = rng.below(NUM_ROTS);
			let rotated = rebuild(&placements, |p| p, |c| rotate_cell(r, c));
			assert_eq!(
				rotated.cells_taken(),
				rot[r][usize::from(position.cells_taken())]
			);
			assert_eq!(rotated.canonical_key(rot), key, "rotation {r}");
		}
	}

	#[test]
	fn canonical_key_is_invariant_when_a_property_is_flipped() {
		let rot = rot_masks();
		let mut rng = XorShift32(0xCAFE_F00D);
		for _ in 0..1000 {
			let (position, placements) = random_position(&mut rng);
			let key = position.canonical_key(rot);
			let flip = 1u8 << rng.below(NUM_PROPS);
			let flipped = rebuild(&placements, |p| p ^ flip, |c| c);
			assert_eq!(flipped.canonical_key(rot), key, "flip {flip:#06b}");
		}
	}

	#[test]
	fn canonical_key_is_invariant_when_properties_are_permuted() {
		let rot = rot_masks();
		let mut rng = XorShift32(0x0BAD_5EED);
		for _ in 0..1000 {
			let (position, placements) = random_position(&mut rng);
			let key = position.canonical_key(rot);
			let mut perm = [0u8, 1, 2, 3];
			for i in (1..perm.len()).rev() {
				let j = rng.below(i + 1);
				perm.swap(i, j);
			}
			let permute =
				|p: u8| (0..NUM_PROPS).fold(0u8, |acc, i| acc | (((p >> i) & 1) << perm[i]));
			let permuted = rebuild(&placements, permute, |c| c);
			assert_eq!(permuted.canonical_key(rot), key, "perm {perm:?}");
		}
	}

	#[test]
	fn canonical_key_distinguishes_different_positions() {
		let rot = rot_masks();
		let mut a = Position::new();
		a.move_select(0);
		a.move_place(0);
		let mut b = Position::new();
		b.move_select(0);
		b.move_place(5);
		assert_ne!(a.canonical_key(rot), b.canonical_key(rot));
	}
}
