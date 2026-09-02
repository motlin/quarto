//! Exact Quarto solver.
//!
//! The engine mirrors the C prototype in `prototype/solver/quarto.c` so that native
//! and wasm builds produce byte-identical transcripts. Game state, search, and the
//! opening book are added module by module; this crate root only declares the
//! board geometry shared by every module.

/// Number of pieces, and equally the number of cells on the 4x4 board.
pub const NUM_PIECES: usize = 16;

/// Number of binary properties each piece has (tall/short, dark/light, ...).
pub const NUM_PROPS: usize = 4;

/// Number of variants of each property.
pub const NUM_VARIANTS: usize = 2;

/// Total number of placements in a complete game.
pub const NUM_MOVES: usize = 16;

/// Rows on the board.
pub const NUM_ROWS: usize = 4;

/// Columns on the board.
pub const NUM_COLS: usize = 4;

/// Cells on the board.
pub const NUM_CELLS: usize = NUM_ROWS * NUM_COLS;

/// Cells in a winning line.
pub const WIN_LEN: usize = 4;

/// Side of a winning square under [`rules::Rules::Squares`].
pub const WIN_SQ_SIDE: usize = 2;

/// Symmetries of the board: four rotations, each with and without a reflection.
pub const NUM_ROTS: usize = 8;

/// Number of distinct 16-bit cell masks.
pub const NUM_CELL_MASKS: usize = 1 << NUM_CELLS;

/// Number of distinct masks over the eight (property, variant) pairs.
pub const NUM_LOSE_MASKS: usize = 1 << (NUM_PROPS * NUM_VARIANTS);

pub mod position;
pub mod rules;
pub mod tables;

/// Cell index of `(row, col)` in row-major order.
#[must_use]
pub const fn cell_at(row: usize, col: usize) -> usize {
	row * NUM_COLS + col
}

/// Row of a cell index.
#[must_use]
pub const fn cell_row(cell: usize) -> usize {
	cell / NUM_COLS
}

/// Column of a cell index.
#[must_use]
pub const fn cell_col(cell: usize) -> usize {
	cell % NUM_COLS
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
pub mod wasm;

#[cfg(test)]
mod tests {
	use super::{NUM_MOVES, NUM_PIECES, NUM_PROPS, NUM_VARIANTS};

	#[test]
	fn every_piece_is_a_distinct_property_combination() {
		assert_eq!(
			NUM_VARIANTS.pow(u32::try_from(NUM_PROPS).unwrap()),
			NUM_PIECES
		);
	}

	#[test]
	fn a_full_game_places_every_piece() {
		assert_eq!(NUM_MOVES, NUM_PIECES);
	}
}
