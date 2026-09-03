//! Opening books: exact values of every canonical select-phase position up to
//! a few placements deep, one book per rules variant.
//!
//! Each book is a binary file of little-endian 11-byte records
//! `[key_low u64][cells_taken u16][value i8]`, sorted by
//! `(popcount(cells_taken), cells_taken, key_low)`. The files are produced by
//! `scripts/convert-book-header.py` from the prototype's generated headers, or
//! by the `book` binary, and embedded into the crate at compile time.

use crate::rules::Rules;

const SQUARES: &[u8] = include_bytes!("../books/squares.bin");
const LINES: &[u8] = include_bytes!("../books/lines.bin");

/// Bytes per record: a `u64` key, a `u16` cell mask and an `i8` value.
pub const RECORD_SIZE: usize = 8 + 2 + 1;

/// One book position and its exact value for the player to select.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BookEntry {
	/// Low 64 bits of the canonical key: the four sorted property masks.
	pub key_low: u64,
	/// High bits of the canonical key: the canonical occupied-cell mask.
	pub cells_taken: u16,
	/// Exact search value of the position.
	pub value: i8,
}

impl BookEntry {
	/// Decode one [`RECORD_SIZE`]-byte record.
	///
	/// # Panics
	///
	/// Panics when `record` is shorter than [`RECORD_SIZE`].
	#[must_use]
	pub fn from_record(record: &[u8]) -> Self {
		let key_low = u64::from_le_bytes(record[0..8].try_into().expect("8 key bytes"));
		let cells_taken = u16::from_le_bytes(record[8..10].try_into().expect("2 cell bytes"));
		let value = i8::from_le_bytes([record[10]]);
		Self {
			key_low,
			cells_taken,
			value,
		}
	}

	/// The record this entry is stored as in a book file.
	#[must_use]
	pub fn to_record(self) -> [u8; RECORD_SIZE] {
		let mut record = [0; RECORD_SIZE];
		record[0..8].copy_from_slice(&self.key_low.to_le_bytes());
		record[8..10].copy_from_slice(&self.cells_taken.to_le_bytes());
		record[10] = self.value.to_le_bytes()[0];
		record
	}

	/// The order entries are stored in: by depth, then cell mask, then property masks.
	#[must_use]
	pub fn sort_key(self) -> (u8, u16, u64) {
		(self.moves_done(), self.cells_taken, self.key_low)
	}

	/// The full canonical key as [`crate::position::Position::canonical_key`] computes it.
	#[must_use]
	pub fn key(self) -> u128 {
		(u128::from(self.cells_taken) << 64) | u128::from(self.key_low)
	}

	/// Placements on the board in this position.
	#[must_use]
	pub fn moves_done(self) -> u8 {
		#[allow(clippy::cast_possible_truncation)]
		let moves_done = self.cells_taken.count_ones() as u8;
		moves_done
	}
}

fn book(rules: Rules) -> &'static [u8] {
	match rules {
		Rules::Squares => SQUARES,
		Rules::Lines => LINES,
	}
}

/// Every entry of the book for `rules`, in file order.
pub fn entries(rules: Rules) -> impl Iterator<Item = BookEntry> {
	book(rules)
		.chunks_exact(RECORD_SIZE)
		.map(BookEntry::from_record)
}

/// Number of positions in the book for `rules`.
#[must_use]
pub fn entry_count(rules: Rules) -> usize {
	book(rules).len() / RECORD_SIZE
}

/// Deepest position in the book for `rules`, as a number of placements.
#[must_use]
pub fn depth(rules: Rules) -> u8 {
	entries(rules).map(BookEntry::moves_done).max().unwrap_or(0)
}

#[cfg(test)]
mod tests {
	use super::{BookEntry, RECORD_SIZE, depth, entries, entry_count};
	use crate::rules::Rules;

	#[test]
	fn a_record_decodes_little_endian_fields() {
		let record = [
			0x10, 0x08, 0x10, 0x08, 0x10, 0x08, 0x10, 0x08, 0x18, 0x18, 0xFE,
		];
		assert_eq!(
			BookEntry::from_record(&record),
			BookEntry {
				key_low: 0x0810_0810_0810_0810,
				cells_taken: 0x1818,
				value: -2,
			}
		);
	}

	#[test]
	fn a_record_round_trips_through_an_entry() {
		let record = [
			0x10, 0x08, 0x10, 0x08, 0x10, 0x08, 0x10, 0x08, 0x18, 0x18, 0xFE,
		];
		assert_eq!(BookEntry::from_record(&record).to_record(), record);
	}

	#[test]
	fn the_key_stacks_cells_taken_above_the_property_masks() {
		let entry = BookEntry {
			key_low: 0x0808_0808_0810_0810,
			cells_taken: 0x1818,
			value: 0,
		};
		assert_eq!(entry.key(), 0x1818_0808_0808_0810_0810);
		assert_eq!(entry.moves_done(), 4);
	}

	#[test]
	fn both_books_hold_every_position_to_depth_four() {
		for (rules, count) in [(Rules::Squares, 40_729), (Rules::Lines, 40_789)] {
			assert_eq!(entry_count(rules), count, "{rules:?}");
			assert_eq!(entries(rules).count(), count, "{rules:?}");
			assert_eq!(depth(rules), 4, "{rules:?}");
		}
	}

	#[test]
	fn the_empty_board_is_the_first_entry_and_a_draw() {
		for rules in [Rules::Squares, Rules::Lines] {
			let first = entries(rules).next().expect("book is not empty");
			assert_eq!(
				first,
				BookEntry {
					key_low: 0,
					cells_taken: 0,
					value: 0
				},
				"{rules:?}"
			);
		}
	}

	#[test]
	fn entries_are_sorted_and_distinct() {
		for rules in [Rules::Squares, Rules::Lines] {
			let keys: Vec<_> = entries(rules).map(BookEntry::sort_key).collect();
			assert!(keys.windows(2).all(|w| w[0] < w[1]), "{rules:?}");
		}
	}

	#[test]
	fn the_books_are_whole_records() {
		for rules in [Rules::Squares, Rules::Lines] {
			assert_eq!(super::book(rules).len() % RECORD_SIZE, 0, "{rules:?}");
		}
	}
}
