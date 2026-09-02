//! Rule variants and the winning-line masks each one defines.

use crate::{NUM_COLS, NUM_ROWS, WIN_LEN, WIN_SQ_SIDE, cell_at};

/// Which sets of four cells count as a win.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Rules {
	/// Rows, columns and the two diagonals (the official basic game).
	Lines,
	/// Lines plus every 2x2 square (upstream "regular"; the official advanced variant).
	Squares,
}

impl Rules {
	/// Every winning set of cells as a 16-bit mask, in the order the C prototype
	/// generates them (scanning cells row-major and emitting the row, column,
	/// diagonal, anti-diagonal and square anchored at each cell).
	#[must_use]
	pub fn win_masks(self) -> Vec<u16> {
		let mut masks = Vec::new();
		let mut add = |cells: [usize; WIN_LEN]| {
			let mask = cells.iter().fold(0u16, |mask, &cell| mask | (1 << cell));
			masks.push(mask);
		};

		for row in 0..NUM_ROWS {
			for col in 0..NUM_COLS {
				if col + WIN_LEN <= NUM_COLS {
					add(std::array::from_fn(|j| cell_at(row, col + j)));
				}
				if row + WIN_LEN <= NUM_ROWS {
					add(std::array::from_fn(|j| cell_at(row + j, col)));
				}
				if row + WIN_LEN <= NUM_ROWS && col + WIN_LEN <= NUM_COLS {
					add(std::array::from_fn(|j| cell_at(row + j, col + j)));
				}
				if row + WIN_LEN <= NUM_ROWS && col >= WIN_LEN - 1 {
					add(std::array::from_fn(|j| cell_at(row + j, col - j)));
				}
				if self == Self::Squares
					&& row + WIN_SQ_SIDE <= NUM_ROWS
					&& col + WIN_SQ_SIDE <= NUM_COLS
				{
					add(std::array::from_fn(|j| {
						cell_at(row + j / WIN_SQ_SIDE, col + j % WIN_SQ_SIDE)
					}));
				}
			}
		}

		masks
	}
}

#[cfg(test)]
mod tests {
	use super::Rules;

	#[test]
	fn squares_has_nineteen_win_masks() {
		assert_eq!(Rules::Squares.win_masks().len(), 19);
	}

	#[test]
	fn lines_has_ten_win_masks() {
		assert_eq!(Rules::Lines.win_masks().len(), 10);
	}

	#[test]
	fn every_win_mask_covers_exactly_four_cells() {
		for rules in [Rules::Lines, Rules::Squares] {
			for mask in rules.win_masks() {
				assert_eq!(mask.count_ones(), 4, "{rules:?} mask {mask:#06x}");
			}
		}
	}

	#[test]
	fn lines_masks_are_a_prefix_free_subset_of_squares_masks() {
		let squares = Rules::Squares.win_masks();
		for mask in Rules::Lines.win_masks() {
			assert!(squares.contains(&mask));
		}
	}

	#[test]
	fn first_masks_match_the_prototype_order() {
		let masks = Rules::Squares.win_masks();
		assert_eq!(masks[0], 0b0000_0000_0000_1111);
		assert_eq!(masks[1], 0b0001_0001_0001_0001);
		assert_eq!(masks[2], 0b1000_0100_0010_0001);
		assert_eq!(masks[3], 0b0000_0000_0011_0011);
	}
}
