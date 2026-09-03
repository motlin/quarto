//! The compact `.qbk` encoding of an opening book that the web app fetches.
//!
//! A book's canonical keys are 80 bits wide but, sorted, mostly close together,
//! so the file stores the gap from one key to the next as an unsigned LEB128
//! varint followed by the value as one signed byte. That is a third the size of
//! the 11-byte records in `books/<rules>.bin` before any HTTP compression.
//!
//! Layout: the magic `QBK1`, one rules byte (`0` lines, `1` squares), one depth
//! byte, a little-endian `u32` entry count, then the entries.

use crate::book::{Book, BookEntry, BookError};
use crate::rules::Rules;

/// The first four bytes of every `.qbk` file.
pub const MAGIC: [u8; 4] = *b"QBK1";

/// Bytes before the first entry: magic, rules, depth and entry count.
pub const HEADER_SIZE: usize = MAGIC.len() + 1 + 1 + 4;

/// Bits of a canonical key: a `u16` cell mask above a `u64` of property masks.
const KEY_BITS: u32 = 80;

/// Bytes a varint of a [`KEY_BITS`]-bit value can take, at seven bits each.
const MAX_VARINT_BYTES: usize = (KEY_BITS as usize).div_ceil(7);

/// Bytes the smallest entry takes: a one-byte varint and the value.
const MIN_ENTRY_SIZE: usize = 2;

const fn rules_byte(rules: Rules) -> u8 {
	match rules {
		Rules::Lines => 0,
		Rules::Squares => 1,
	}
}

fn rules_from_byte(byte: u8) -> Result<Rules, BookError> {
	match byte {
		0 => Ok(Rules::Lines),
		1 => Ok(Rules::Squares),
		other => Err(BookError::BadRules(other)),
	}
}

fn push_varint(out: &mut Vec<u8>, mut value: u128) {
	while value >= 0x80 {
		#[allow(clippy::cast_possible_truncation)]
		out.push((value as u8) | 0x80);
		value >>= 7;
	}
	#[allow(clippy::cast_possible_truncation)]
	out.push(value as u8);
}

/// Encode `book` as a `.qbk` file.
///
/// # Panics
///
/// Panics when the book holds more than `u32::MAX` entries.
#[must_use]
pub fn encode(book: &Book) -> Vec<u8> {
	let mut out = Vec::with_capacity(HEADER_SIZE + book.len() * 4);
	out.extend_from_slice(&MAGIC);
	out.push(rules_byte(book.rules()));
	out.push(book.depth());
	out.extend_from_slice(
		&u32::try_from(book.len())
			.expect("book entry count fits in u32")
			.to_le_bytes(),
	);
	let mut previous = 0;
	for entry in book.entries() {
		let key = entry.key();
		push_varint(&mut out, key - previous);
		out.push(entry.value.to_le_bytes()[0]);
		previous = key;
	}
	out
}

struct Reader<'a> {
	bytes: &'a [u8],
	at: usize,
}

impl Reader<'_> {
	fn take(&mut self, count: usize) -> Result<&[u8], BookError> {
		let end = self.at.checked_add(count).ok_or(BookError::Truncated)?;
		let slice = self.bytes.get(self.at..end).ok_or(BookError::Truncated)?;
		self.at = end;
		Ok(slice)
	}

	fn byte(&mut self) -> Result<u8, BookError> {
		Ok(self.take(1)?[0])
	}

	/// An unsigned LEB128 varint of at most [`KEY_BITS`] bits.
	fn varint(&mut self, index: usize) -> Result<u128, BookError> {
		let mut value: u128 = 0;
		for shift in (0..MAX_VARINT_BYTES).map(|i| i * 7) {
			let byte = self.byte()?;
			value |= u128::from(byte & 0x7F) << shift;
			if byte & 0x80 == 0 {
				return if value >> KEY_BITS == 0 {
					Ok(value)
				} else {
					Err(BookError::KeyTooLarge(index))
				};
			}
		}
		Err(BookError::KeyTooLarge(index))
	}

	fn remaining(&self) -> usize {
		self.bytes.len() - self.at
	}
}

/// Decode a `.qbk` file back into a [`Book`].
///
/// # Errors
///
/// Rejects a bad magic, unknown rules, a stream that ends early or runs on
/// past its last entry, a key that does not increase or does not fit, and a
/// header depth that disagrees with the entries.
pub fn decode(bytes: &[u8]) -> Result<Book, BookError> {
	let mut reader = Reader { bytes, at: 0 };
	if reader.take(MAGIC.len())? != MAGIC {
		return Err(BookError::BadMagic);
	}
	let rules = rules_from_byte(reader.byte()?)?;
	let depth = reader.byte()?;
	let count = reader.take(4)?;
	let count = u32::from_le_bytes([count[0], count[1], count[2], count[3]]);
	let count = usize::try_from(count).map_err(|_| BookError::Truncated)?;
	// Every entry takes at least a one-byte varint and a value byte, so a count the
	// remaining bytes cannot hold is a corrupt header, not a reason to allocate.
	if count > reader.remaining() / MIN_ENTRY_SIZE {
		return Err(BookError::Truncated);
	}

	let mut entries = Vec::with_capacity(count);
	let mut previous: Option<u128> = None;
	for index in 0..count {
		let delta = reader.varint(index)?;
		let key = match previous {
			None => delta,
			Some(_) if delta == 0 => return Err(BookError::KeyNotIncreasing(index)),
			Some(previous) => previous
				.checked_add(delta)
				.ok_or(BookError::KeyTooLarge(index))?,
		};
		let value = i8::from_le_bytes([reader.byte()?]);
		let entry = BookEntry::from_key(key, value).ok_or(BookError::KeyTooLarge(index))?;
		entries.push(entry);
		previous = Some(key);
	}
	if reader.remaining() != 0 {
		return Err(BookError::TrailingBytes(reader.remaining()));
	}

	let book = Book::new(rules, entries);
	if book.depth() != depth {
		return Err(BookError::WrongDepth {
			header: depth,
			entries: book.depth(),
		});
	}
	Ok(book)
}

#[cfg(test)]
mod tests {
	use super::{HEADER_SIZE, MAGIC, decode, encode};
	use crate::book::{Book, BookEntry, BookError, committed};
	use crate::rules::Rules;

	fn entry(cells_taken: u16, key_low: u64, value: i8) -> BookEntry {
		BookEntry {
			key_low,
			cells_taken,
			value,
		}
	}

	fn small_book() -> Book {
		Book::new(
			Rules::Squares,
			vec![
				entry(0, 0, 0),
				entry(1, 0x10, 3),
				entry(1, 0x0200, -2),
				entry(0b11, 0x1_0000, 7),
			],
		)
	}

	#[test]
	fn the_header_names_the_rules_depth_and_count() {
		let bytes = encode(&small_book());
		assert_eq!(&bytes[..4], &MAGIC);
		assert_eq!(bytes[4], 1, "squares");
		assert_eq!(bytes[5], 2, "depth");
		assert_eq!(&bytes[6..10], &4u32.to_le_bytes());
		assert_eq!(HEADER_SIZE, 10);
		let lines = encode(&Book::empty(Rules::Lines));
		assert_eq!(lines, [b'Q', b'B', b'K', b'1', 0, 0, 0, 0, 0, 0]);
	}

	#[test]
	fn entries_are_key_gaps_as_varints_followed_by_the_value() {
		let bytes = encode(&small_book());
		assert_eq!(
			&bytes[HEADER_SIZE..],
			&[
				// empty board: gap 0, value 0
				0x00, 0x00, // gap 2^64 + 0x10, value 3
				0x90, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02, 0x03,
				// gap 0x1F0 = 0b111_0000 | 0b11 << 7, value -2
				0xF0, 0x03, 0xFE, // gap 2^65 + 0xFE00, value 7
				0x80, 0xFC, 0x83, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x04, 0x07,
			]
		);
	}

	#[test]
	fn a_book_round_trips() {
		let book = small_book();
		assert_eq!(decode(&encode(&book)), Ok(book));
		let empty = Book::empty(Rules::Lines);
		assert_eq!(decode(&encode(&empty)), Ok(empty));
	}

	#[test]
	fn the_committed_books_round_trip_at_a_third_of_the_size() {
		for rules in [Rules::Squares, Rules::Lines] {
			let book = committed(rules);
			let bytes = encode(&book);
			assert!(bytes.len() < 150_000, "{rules:?}: {} bytes", bytes.len());
			assert_eq!(decode(&bytes), Ok(book), "{rules:?}");
		}
	}

	#[test]
	fn a_bad_magic_is_rejected() {
		let mut bytes = encode(&small_book());
		bytes[0] = b'X';
		assert_eq!(decode(&bytes), Err(BookError::BadMagic));
		assert_eq!(decode(b"QB"), Err(BookError::Truncated));
	}

	#[test]
	fn unknown_rules_are_rejected() {
		let mut bytes = encode(&small_book());
		bytes[4] = 9;
		assert_eq!(decode(&bytes), Err(BookError::BadRules(9)));
	}

	#[test]
	fn a_truncated_stream_is_rejected_at_every_length() {
		let bytes = encode(&small_book());
		for end in 0..bytes.len() {
			assert_eq!(decode(&bytes[..end]), Err(BookError::Truncated), "{end}");
		}
	}

	#[test]
	fn trailing_bytes_are_rejected() {
		let mut bytes = encode(&small_book());
		bytes.extend_from_slice(&[0, 0]);
		assert_eq!(decode(&bytes), Err(BookError::TrailingBytes(2)));
	}

	#[test]
	fn a_key_that_does_not_increase_is_rejected() {
		let mut bytes = encode(&small_book());
		bytes[HEADER_SIZE + 2] = 0x00;
		assert_eq!(decode(&bytes), Err(BookError::KeyNotIncreasing(1)));
	}

	#[test]
	fn a_key_wider_than_eighty_bits_is_rejected() {
		let header = &encode(&Book::new(Rules::Lines, vec![entry(0, 0, 0)]))[..HEADER_SIZE];
		// Twelve varint bytes carry 84 bits; the top ones must be clear.
		let mut wide = header.to_vec();
		wide.extend_from_slice(&[0xFF; 11]);
		wide.extend_from_slice(&[0x7F, 0]);
		assert_eq!(decode(&wide), Err(BookError::KeyTooLarge(0)));
		// A thirteenth varint byte can never be needed.
		let mut long = header.to_vec();
		long.extend_from_slice(&[0x80; 12]);
		long.extend_from_slice(&[0x00, 0]);
		assert_eq!(decode(&long), Err(BookError::KeyTooLarge(0)));
		// Gaps that each fit the varint but together carry the key past the cell mask.
		let mut past = header.to_vec();
		past[6..10].copy_from_slice(&2u32.to_le_bytes());
		past.extend_from_slice(&[0xFF; 11]);
		past.extend_from_slice(&[0x07, 0]);
		past.extend_from_slice(&[0x01, 0]);
		assert_eq!(decode(&past), Err(BookError::KeyTooLarge(1)));
	}

	#[test]
	fn a_count_the_bytes_cannot_hold_is_rejected_before_anything_is_allocated() {
		let mut bytes = encode(&small_book());
		bytes[6..10].copy_from_slice(&u32::MAX.to_le_bytes());
		assert_eq!(decode(&bytes), Err(BookError::Truncated));
		// One byte short of fitting the smallest possible entries is truncated too.
		let mut short = encode(&Book::empty(Rules::Lines));
		short[6..10].copy_from_slice(&2u32.to_le_bytes());
		short.extend_from_slice(&[0, 0, 1]);
		assert_eq!(decode(&short), Err(BookError::Truncated));
	}

	#[test]
	fn a_header_depth_that_disagrees_with_the_entries_is_rejected() {
		let mut bytes = encode(&small_book());
		bytes[5] = 3;
		assert_eq!(
			decode(&bytes),
			Err(BookError::WrongDepth {
				header: 3,
				entries: 2,
			})
		);
	}
}
