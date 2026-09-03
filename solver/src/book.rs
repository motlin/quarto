//! Opening books: exact values of every canonical select-phase position up to
//! a few placements deep, one book per rules variant.
//!
//! The canonical files are `books/<rules>.bin`: little-endian 11-byte records
//! `[key_low u64][cells_taken u16][value i8]`, sorted by
//! `(popcount(cells_taken), cells_taken, key_low)`, written by the `book`
//! binary. Nothing is compiled into the crate: native tools read a `.bin` from
//! disk with [`Book::from_records`], and the web app fetches the compact
//! encoding in [`crate::book_codec`] and hands it to [`crate::Solver::load_book`].

use std::error::Error;
use std::fmt;

use crate::rules::Rules;

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

	/// The order records are stored in: by depth, then cell mask, then property masks.
	#[must_use]
	pub fn sort_key(self) -> (u8, u16, u64) {
		(self.moves_done(), self.cells_taken, self.key_low)
	}

	/// The full canonical key as [`crate::position::Position::canonical_key`] computes it.
	#[must_use]
	pub fn key(self) -> u128 {
		(u128::from(self.cells_taken) << 64) | u128::from(self.key_low)
	}

	/// The entry with canonical key `key` and value `value`, or `None` when the
	/// key does not fit the 80 bits a canonical key occupies.
	#[must_use]
	pub fn from_key(key: u128, value: i8) -> Option<Self> {
		#[allow(clippy::cast_possible_truncation)]
		let key_low = key as u64;
		let cells_taken = u16::try_from(key >> 64).ok()?;
		Some(Self {
			key_low,
			cells_taken,
			value,
		})
	}

	/// Placements on the board in this position.
	#[must_use]
	pub fn moves_done(self) -> u8 {
		#[allow(clippy::cast_possible_truncation)]
		let moves_done = self.cells_taken.count_ones() as u8;
		moves_done
	}
}

/// Why a book could not be read or loaded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BookError {
	/// The bytes do not start with the `.qbk` magic.
	BadMagic,
	/// The rules byte names neither variant.
	BadRules(u8),
	/// The stream ended before the promised entries did.
	Truncated,
	/// The entry at this index does not come after the one before it.
	KeyNotIncreasing(usize),
	/// The entry at this index has a key wider than a canonical key.
	KeyTooLarge(usize),
	/// The header's depth disagrees with the deepest entry.
	WrongDepth {
		/// Depth the header claims.
		header: u8,
		/// Depth the entries reach.
		entries: u8,
	},
	/// Bytes follow the last entry.
	TrailingBytes(usize),
	/// A `.bin` file is not a whole number of records.
	PartialRecord,
	/// The book is for a different rules variant than the solver plays.
	WrongRules {
		/// The solver's rules.
		expected: Rules,
		/// The book's rules.
		found: Rules,
	},
}

impl fmt::Display for BookError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::BadMagic => write!(f, "not an opening book: bad magic"),
			Self::BadRules(byte) => write!(f, "opening book names unknown rules {byte}"),
			Self::Truncated => write!(f, "opening book is truncated"),
			Self::KeyNotIncreasing(index) => {
				write!(f, "opening book entry {index} does not increase the key")
			}
			Self::KeyTooLarge(index) => write!(f, "opening book entry {index} has too wide a key"),
			Self::WrongDepth { header, entries } => write!(
				f,
				"opening book header says depth {header} but the entries reach {entries}"
			),
			Self::TrailingBytes(count) => {
				write!(f, "opening book has {count} bytes after the last entry")
			}
			Self::PartialRecord => write!(f, "opening book is not a whole number of records"),
			Self::WrongRules { expected, found } => {
				write!(f, "opening book is for {found:?} rules, not {expected:?}")
			}
		}
	}
}

impl Error for BookError {}

/// A whole opening book: its rules and its entries in increasing key order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Book {
	rules: Rules,
	depth: u8,
	entries: Vec<BookEntry>,
}

impl Book {
	/// A book of `entries`, which may arrive in any order.
	#[must_use]
	pub fn new(rules: Rules, mut entries: Vec<BookEntry>) -> Self {
		entries.sort_by_key(|entry| entry.key());
		let depth = entries
			.iter()
			.map(|entry| entry.moves_done())
			.max()
			.unwrap_or(0);
		Self {
			rules,
			depth,
			entries,
		}
	}

	/// A book with nothing in it.
	#[must_use]
	pub fn empty(rules: Rules) -> Self {
		Self::new(rules, Vec::new())
	}

	/// The book stored in a `.bin` file of [`RECORD_SIZE`]-byte records.
	///
	/// # Errors
	///
	/// Fails when `bytes` is not a whole number of records.
	pub fn from_records(rules: Rules, bytes: &[u8]) -> Result<Self, BookError> {
		if !bytes.len().is_multiple_of(RECORD_SIZE) {
			return Err(BookError::PartialRecord);
		}
		Ok(Self::new(
			rules,
			bytes
				.chunks_exact(RECORD_SIZE)
				.map(BookEntry::from_record)
				.collect(),
		))
	}

	/// Which rules variant the values are for.
	#[must_use]
	pub const fn rules(&self) -> Rules {
		self.rules
	}

	/// Deepest position in the book, as a number of placements; zero when empty.
	#[must_use]
	pub const fn depth(&self) -> u8 {
		self.depth
	}

	/// The entries in increasing key order.
	#[must_use]
	pub fn entries(&self) -> &[BookEntry] {
		&self.entries
	}

	/// Number of positions in the book.
	#[must_use]
	pub const fn len(&self) -> usize {
		self.entries.len()
	}

	/// True when the book holds no positions.
	#[must_use]
	pub const fn is_empty(&self) -> bool {
		self.entries.is_empty()
	}
}

/// The committed `books/<rules>.bin`, read from disk.
#[cfg(test)]
pub(crate) fn committed(rules: Rules) -> Book {
	let name = match rules {
		Rules::Squares => "squares",
		Rules::Lines => "lines",
	};
	let path = format!("{}/books/{name}.bin", env!("CARGO_MANIFEST_DIR"));
	Book::from_records(rules, &std::fs::read(&path).expect(&path)).expect(&path)
}

#[cfg(test)]
mod tests {
	use super::{Book, BookEntry, BookError, RECORD_SIZE, committed};
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
		assert_eq!(BookEntry::from_key(entry.key(), 0), Some(entry));
		assert_eq!(BookEntry::from_key(1 << 80, 0), None);
	}

	#[test]
	fn both_committed_books_hold_every_position_to_depth_four() {
		for (rules, count) in [(Rules::Squares, 40_729), (Rules::Lines, 40_789)] {
			let book = committed(rules);
			assert_eq!(book.rules(), rules);
			assert_eq!(book.len(), count, "{rules:?}");
			assert_eq!(book.depth(), 4, "{rules:?}");
			assert!(!book.is_empty());
		}
	}

	#[test]
	fn the_empty_board_is_the_first_entry_and_a_draw() {
		for rules in [Rules::Squares, Rules::Lines] {
			let book = committed(rules);
			assert_eq!(
				book.entries()[0],
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
	fn a_book_sorts_its_entries_by_key_and_keeps_them_distinct() {
		for rules in [Rules::Squares, Rules::Lines] {
			let keys: Vec<u128> = committed(rules)
				.entries()
				.iter()
				.map(|entry| entry.key())
				.collect();
			assert!(keys.windows(2).all(|w| w[0] < w[1]), "{rules:?}");
		}
		let deep = BookEntry {
			key_low: 1,
			cells_taken: 0b11,
			value: 1,
		};
		let shallow = BookEntry {
			key_low: 7,
			cells_taken: 0b1,
			value: -1,
		};
		let book = Book::new(Rules::Lines, vec![deep, shallow]);
		assert_eq!(book.entries(), &[shallow, deep]);
		assert_eq!(book.depth(), 2);
	}

	#[test]
	fn an_empty_book_has_no_depth() {
		let book = Book::empty(Rules::Squares);
		assert_eq!(book.len(), 0);
		assert!(book.is_empty());
		assert_eq!(book.depth(), 0);
	}

	#[test]
	fn a_partial_record_is_rejected() {
		let bytes = vec![0; RECORD_SIZE + 1];
		assert_eq!(
			Book::from_records(Rules::Squares, &bytes),
			Err(BookError::PartialRecord)
		);
		assert_eq!(
			Book::from_records(Rules::Squares, &bytes[..RECORD_SIZE])
				.unwrap()
				.len(),
			1
		);
	}

	#[test]
	fn errors_explain_themselves() {
		assert_eq!(
			BookError::WrongRules {
				expected: Rules::Squares,
				found: Rules::Lines,
			}
			.to_string(),
			"opening book is for Lines rules, not Squares"
		);
		assert_eq!(
			BookError::WrongDepth {
				header: 4,
				entries: 3,
			}
			.to_string(),
			"opening book header says depth 4 but the entries reach 3"
		);
		for (error, text) in [
			(BookError::BadMagic, "not an opening book: bad magic"),
			(BookError::BadRules(7), "opening book names unknown rules 7"),
			(BookError::Truncated, "opening book is truncated"),
			(
				BookError::KeyNotIncreasing(3),
				"opening book entry 3 does not increase the key",
			),
			(
				BookError::KeyTooLarge(3),
				"opening book entry 3 has too wide a key",
			),
			(
				BookError::TrailingBytes(2),
				"opening book has 2 bytes after the last entry",
			),
			(
				BookError::PartialRecord,
				"opening book is not a whole number of records",
			),
		] {
			assert_eq!(error.to_string(), text);
		}
	}
}
