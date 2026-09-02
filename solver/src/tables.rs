//! Precomputed lookup tables: rotation maps and per-rules win bookkeeping.

use std::sync::LazyLock;

use crate::rules::Rules;
use crate::{
	NUM_CELL_MASKS, NUM_CELLS, NUM_COLS, NUM_LOSE_MASKS, NUM_PIECES, NUM_PROPS, NUM_ROTS,
	NUM_VARIANTS, cell_at, cell_col, cell_row,
};

/// For each of the 8 board symmetries, the image of every 16-bit cell mask.
///
/// Rotations 0..4 are successive quarter turns; rotation 4 is the reflection of
/// rotation 0 and rotations 5..8 are its successive quarter turns.
pub type RotMasks = [[u16; NUM_CELL_MASKS]; NUM_ROTS];

static ROT_MASKS: LazyLock<Box<RotMasks>> = LazyLock::new(compute_rot_masks);

/// The rules-independent symmetry table, built on first use.
#[must_use]
pub fn rot_masks() -> &'static RotMasks {
	&ROT_MASKS
}

fn compute_rot_masks() -> Box<RotMasks> {
	// Built flat on the heap so no 128 KiB row ever lives on the stack.
	let mut flat = vec![0u16; NUM_ROTS * NUM_CELL_MASKS];

	for rot in 0..NUM_ROTS {
		let is_reflection = rot == NUM_ROTS / 2;
		let prev_rot = if is_reflection {
			0
		} else {
			rot.saturating_sub(1)
		};
		let cell_image: [usize; NUM_CELLS] = std::array::from_fn(|cell| {
			let row = cell_row(cell);
			let col = cell_col(cell);
			if is_reflection {
				cell_at(NUM_COLS - row - 1, col)
			} else {
				cell_at(NUM_COLS - col - 1, row)
			}
		});

		for mask in 0..NUM_CELL_MASKS {
			let next = if rot == 0 {
				u16::try_from(mask).expect("mask fits in u16")
			} else {
				let prev = flat[prev_rot * NUM_CELL_MASKS + mask];
				cell_image
					.iter()
					.enumerate()
					.filter(|&(cell, _)| prev & (1 << cell) != 0)
					.fold(0u16, |next, (_, &image)| next | (1 << image))
			};
			flat[rot * NUM_CELL_MASKS + mask] = next;
		}
	}

	let rows: Vec<[u16; NUM_CELL_MASKS]> = flat
		.chunks_exact(NUM_CELL_MASKS)
		.map(|row| row.try_into().expect("chunk has NUM_CELL_MASKS entries"))
		.collect();
	rows.into_boxed_slice()
		.try_into()
		.expect("exactly NUM_ROTS rows")
}

/// Lookup tables derived from one [`Rules`] variant.
#[derive(Debug)]
pub struct Tables {
	/// The winning masks, as returned by [`Rules::win_masks`].
	pub win_masks: Vec<u16>,
	/// For each cell, the winning masks that contain it.
	pub cell_win_masks: [Vec<u16>; NUM_CELLS],
	/// For a mask of cells sharing a property variant, the free cells that would
	/// complete a win for that variant if filled.
	pub lose_prop_var_cells: Box<[u16; NUM_CELL_MASKS]>,
	/// For an 8-bit mask of losing (property, variant) pairs, the pieces that
	/// carry none of them.
	pub not_losing_selects: [Vec<u8>; NUM_LOSE_MASKS],
}

impl Tables {
	/// Build every rules-dependent table.
	#[must_use]
	pub fn new(rules: Rules) -> Self {
		let win_masks = rules.win_masks();
		let cell_win_masks = compute_cell_win_masks(&win_masks);
		let lose_prop_var_cells = compute_lose_prop_var_cells(&cell_win_masks);
		let not_losing_selects = compute_not_losing_selects();
		Self {
			win_masks,
			cell_win_masks,
			lose_prop_var_cells,
			not_losing_selects,
		}
	}
}

fn compute_cell_win_masks(win_masks: &[u16]) -> [Vec<u16>; NUM_CELLS] {
	std::array::from_fn(|cell| {
		win_masks
			.iter()
			.copied()
			.filter(|mask| mask & (1 << cell) != 0)
			.collect()
	})
}

fn compute_lose_prop_var_cells(
	cell_win_masks: &[Vec<u16>; NUM_CELLS],
) -> Box<[u16; NUM_CELL_MASKS]> {
	let mut lose: Box<[u16; NUM_CELL_MASKS]> = vec![0u16; NUM_CELL_MASKS]
		.into_boxed_slice()
		.try_into()
		.expect("exactly NUM_CELL_MASKS entries");

	for (prop_var_mask, entry) in lose.iter_mut().enumerate() {
		for (cell, masks) in cell_win_masks.iter().enumerate() {
			if prop_var_mask & (1 << cell) != 0 {
				continue;
			}
			let completes_a_win = masks.iter().any(|&win_mask| {
				let others = usize::from(win_mask & !(1 << cell));
				prop_var_mask & others == others
			});
			if completes_a_win {
				*entry |= 1 << cell;
			}
		}
	}

	lose
}

fn compute_not_losing_selects() -> [Vec<u8>; NUM_LOSE_MASKS] {
	std::array::from_fn(|lose_mask| {
		(0..NUM_PIECES)
			.filter(|&piece| {
				!(0..NUM_PROPS).any(|prop| {
					(0..NUM_VARIANTS).any(|variant| {
						lose_mask & (1 << (prop * NUM_VARIANTS + variant)) != 0
							&& (piece >> prop) & 1 == variant
					})
				})
			})
			.map(|piece| u8::try_from(piece).expect("piece fits in u8"))
			.collect()
	})
}

#[cfg(test)]
mod tests {
	use super::{Tables, rot_masks};
	use crate::NUM_CELL_MASKS;
	use crate::rules::Rules;

	#[test]
	fn rotation_zero_is_the_identity() {
		let rot = rot_masks();
		for (mask, &image) in rot[0].iter().enumerate() {
			assert_eq!(usize::from(image), mask);
		}
	}

	#[test]
	fn every_rotation_is_a_bijection() {
		for (r, table) in rot_masks().iter().enumerate() {
			let mut seen = vec![false; NUM_CELL_MASKS];
			for &image in table {
				let image = usize::from(image);
				assert!(!seen[image], "rotation {r} maps two masks to {image:#06x}");
				seen[image] = true;
			}
		}
	}

	#[test]
	fn rotations_preserve_popcount() {
		for table in rot_masks() {
			for (mask, image) in table.iter().enumerate() {
				assert_eq!(image.count_ones(), mask.count_ones());
			}
		}
	}

	#[test]
	fn four_quarter_turns_return_to_the_start() {
		let rot = rot_masks();
		for (mask, &once) in rot[1].iter().enumerate() {
			let twice = rot[1][usize::from(once)];
			let thrice = rot[1][usize::from(twice)];
			let full = rot[1][usize::from(thrice)];
			assert_eq!(usize::from(full), mask);
			assert_eq!(rot[2][mask], twice);
			assert_eq!(rot[3][mask], thrice);
		}
	}

	#[test]
	fn reflection_is_an_involution_and_generates_the_second_half() {
		let rot = rot_masks();
		for (mask, &mirrored) in rot[4].iter().enumerate() {
			assert_eq!(usize::from(rot[4][usize::from(mirrored)]), mask);
			assert_eq!(rot[5][mask], rot[1][usize::from(mirrored)]);
			assert_eq!(rot[6][mask], rot[2][usize::from(mirrored)]);
			assert_eq!(rot[7][mask], rot[3][usize::from(mirrored)]);
		}
	}

	#[test]
	fn cell_win_masks_partition_the_win_masks() {
		for rules in [Rules::Lines, Rules::Squares] {
			let tables = Tables::new(rules);
			for (cell, masks) in tables.cell_win_masks.iter().enumerate() {
				let expected: Vec<u16> = tables
					.win_masks
					.iter()
					.copied()
					.filter(|mask| mask & (1 << cell) != 0)
					.collect();
				assert_eq!(*masks, expected, "{rules:?} cell {cell}");
			}
		}
	}

	#[test]
	fn corner_cell_belongs_to_the_expected_number_of_lines() {
		assert_eq!(Tables::new(Rules::Lines).cell_win_masks[0].len(), 3);
		assert_eq!(Tables::new(Rules::Squares).cell_win_masks[0].len(), 4);
		assert_eq!(Tables::new(Rules::Squares).cell_win_masks[5].len(), 7);
	}

	#[test]
	fn lose_prop_var_cells_marks_the_free_cell_completing_a_line() {
		let tables = Tables::new(Rules::Lines);
		let three_in_top_row = 0b0000_0000_0000_0111;
		assert_eq!(tables.lose_prop_var_cells[three_in_top_row], 0b1000);
		assert_eq!(tables.lose_prop_var_cells[0], 0);
		assert_eq!(tables.lose_prop_var_cells[0b1111], 0);
	}

	#[test]
	fn lose_prop_var_cells_never_marks_an_occupied_cell() {
		let tables = Tables::new(Rules::Squares);
		for (mask, &lose) in tables.lose_prop_var_cells.iter().enumerate() {
			assert_eq!(usize::from(lose) & mask, 0, "mask {mask:#06x}");
		}
	}

	#[test]
	fn not_losing_selects_excludes_pieces_carrying_a_losing_variant() {
		let tables = Tables::new(Rules::Squares);
		assert_eq!(tables.not_losing_selects[0].len(), 16);
		assert_eq!(tables.not_losing_selects[0b1111_1111].len(), 0);
		let lose_prop0_variant1 = 0b0000_0010;
		let pieces = &tables.not_losing_selects[lose_prop0_variant1];
		assert_eq!(pieces.len(), 8);
		assert!(pieces.iter().all(|piece| piece & 1 == 0));
		assert_eq!(pieces[..3], [0, 2, 4]);
	}
}
