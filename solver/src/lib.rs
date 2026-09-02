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
