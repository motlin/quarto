//! Transposition tables: fixed-size hash tables of packed search results.
//!
//! Each entry packs into one `u64` exactly like the C prototype's bitfield:
//! the low [`KEY_BITS`] bits of the canonical key, a 6-bit signed value, and
//! two flags recording whether the value is a lower (`is_alpha`) or upper
//! (`is_beta`) bound. Positions are sharded by how many moves have been played
//! so that a shard can be dropped once the game has moved past it.

use std::fmt;

use crate::NUM_MOVES;

/// Bits of the canonical key kept in an entry (the rest is the slot index's job).
pub const KEY_BITS: u32 = 56;

/// Bits used for the signed value; the value range is `-17..=17`.
const VAL_BITS: u32 = 6;

const KEY_MASK: u64 = (1 << KEY_BITS) - 1;
const VAL_MASK: u64 = (1 << VAL_BITS) - 1;
const VAL_SHIFT: u32 = KEY_BITS;
const ALPHA_BIT: u64 = 1 << (KEY_BITS + VAL_BITS);
const BETA_BIT: u64 = 1 << (KEY_BITS + VAL_BITS + 1);

/// Moves-played span covered by one table shard.
pub const TT_DIV: usize = 5;

/// Number of table shards needed to cover every searched depth.
pub const NUM_TTS: usize = (NUM_MOVES - 2) / TT_DIV + 1;

/// Slots per shard in the interactive solver (prime, as in the prototype).
pub const DEFAULT_TABLE_SIZE: usize = 4_194_301;

/// Slots per shard used by the opening-book generator.
pub const BOOK_TABLE_SIZE: usize = 16_782_823;

/// Which shard stores positions with `moves_done` placements on the board.
#[must_use]
pub const fn table_for_moves_done(moves_done: usize) -> usize {
	moves_done / TT_DIV
}

/// A stored search result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Entry {
	/// The value found, from the mover's perspective.
	pub val: i8,
	/// True when the value is a lower bound (it beat the alpha it was searched with).
	pub is_alpha: bool,
	/// True when the value is an upper bound (it fell short of the beta it was searched with).
	pub is_beta: bool,
}

fn pack(key: u128, entry: Entry) -> u64 {
	#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
	let val_bits = (entry.val as u64) & VAL_MASK;
	#[allow(clippy::cast_possible_truncation)]
	let key_bits = (key as u64) & KEY_MASK;
	key_bits
		| (val_bits << VAL_SHIFT)
		| if entry.is_alpha { ALPHA_BIT } else { 0 }
		| if entry.is_beta { BETA_BIT } else { 0 }
}

fn unpack_key(word: u64) -> u64 {
	word & KEY_MASK
}

fn unpack_entry(word: u64) -> Entry {
	#[allow(clippy::cast_possible_truncation)]
	let raw = ((word >> VAL_SHIFT) & VAL_MASK) as u8;
	#[allow(clippy::cast_possible_wrap)]
	let val = ((raw << (8 - VAL_BITS)) as i8) >> (8 - VAL_BITS);
	Entry {
		val,
		is_alpha: word & ALPHA_BIT != 0,
		is_beta: word & BETA_BIT != 0,
	}
}

/// One shard: a direct-mapped table indexed by `key % size`.
pub struct TranspositionTable {
	data: Vec<u64>,
}

impl fmt::Debug for TranspositionTable {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		f.debug_struct("TranspositionTable")
			.field("size", &self.data.len())
			.finish_non_exhaustive()
	}
}

impl TranspositionTable {
	/// An empty table with `size` slots.
	///
	/// # Panics
	///
	/// Panics when `size` is zero, since every key must map to a slot.
	#[must_use]
	pub fn new(size: usize) -> Self {
		assert!(size > 0, "a transposition table needs at least one slot");
		Self {
			data: vec![0; size],
		}
	}

	/// Number of slots.
	#[must_use]
	pub fn size(&self) -> usize {
		self.data.len()
	}

	/// Forget every stored entry.
	pub fn clear(&mut self) {
		self.data.fill(0);
	}

	fn index(&self, key: u128) -> usize {
		usize::try_from(key % (self.data.len() as u128)).expect("index is below size")
	}

	/// Store `entry` for `key`, replacing whatever occupied its slot.
	pub fn put(&mut self, key: u128, entry: Entry) {
		let i = self.index(key);
		self.data[i] = pack(key, entry);
	}

	/// The entry stored for `key`, if its slot still holds that key.
	#[must_use]
	pub fn get(&self, key: u128) -> Option<Entry> {
		let word = self.data[self.index(key)];
		#[allow(clippy::cast_possible_truncation)]
		let wanted = (key as u64) & KEY_MASK;
		(unpack_key(word) == wanted).then(|| unpack_entry(word))
	}
}

#[cfg(test)]
mod tests {
	use super::{
		BOOK_TABLE_SIZE, DEFAULT_TABLE_SIZE, Entry, NUM_TTS, TranspositionTable, pack,
		table_for_moves_done, unpack_entry, unpack_key,
	};

	#[test]
	fn three_shards_cover_every_searched_depth() {
		assert_eq!(NUM_TTS, 3);
		assert_eq!(table_for_moves_done(0), 0);
		assert_eq!(table_for_moves_done(4), 0);
		assert_eq!(table_for_moves_done(5), 1);
		assert_eq!(table_for_moves_done(9), 1);
		assert_eq!(table_for_moves_done(10), 2);
		assert_eq!(table_for_moves_done(14), 2);
	}

	#[test]
	fn table_sizes_are_odd_primes_below_thirty_two_bits() {
		for size in [DEFAULT_TABLE_SIZE, BOOK_TABLE_SIZE] {
			assert!(size < 1 << 32);
			assert_eq!(size % 2, 1);
			assert!(
				(3..)
					.step_by(2)
					.take_while(|d| d * d <= size)
					.all(|d| size % d != 0)
			);
		}
	}

	#[test]
	fn pack_round_trips_every_value_and_flag_combination() {
		let key = 0x00AB_CDEF_0123_4567_89AB_CDEF_0123_4567u128;
		for val in -32..=31i8 {
			for is_alpha in [false, true] {
				for is_beta in [false, true] {
					let entry = Entry {
						val,
						is_alpha,
						is_beta,
					};
					let word = pack(key, entry);
					assert_eq!(unpack_entry(word), entry, "val {val}");
					assert_eq!(unpack_key(word), 0x00AB_CDEF_0123_4567);
				}
			}
		}
	}

	#[test]
	fn pack_uses_the_prototype_bit_layout() {
		let entry = Entry {
			val: -1,
			is_alpha: true,
			is_beta: false,
		};
		assert_eq!(pack(0, entry), 0x7F00_0000_0000_0000);
		let entry = Entry {
			val: 1,
			is_alpha: false,
			is_beta: true,
		};
		assert_eq!(pack(0, entry), 0x8100_0000_0000_0000);
		let entry = Entry {
			val: 0,
			is_alpha: false,
			is_beta: false,
		};
		assert_eq!(pack(u128::MAX, entry), 0x00FF_FFFF_FFFF_FFFF);
	}

	#[test]
	fn empty_table_only_answers_for_the_zero_key() {
		let table = TranspositionTable::new(97);
		assert_eq!(table.size(), 97);
		assert_eq!(
			table.get(0),
			Some(Entry {
				val: 0,
				is_alpha: false,
				is_beta: false
			})
		);
		assert_eq!(table.get(1), None);
		assert_eq!(table.get(97), None);
	}

	#[test]
	fn put_then_get_returns_the_entry_and_clear_forgets_it() {
		let mut table = TranspositionTable::new(97);
		let key = (5u128 << 64) | 0x3039;
		let entry = Entry {
			val: -7,
			is_alpha: true,
			is_beta: false,
		};
		table.put(key, entry);
		assert_eq!(table.get(key), Some(entry));
		table.clear();
		assert_eq!(table.get(key), None);
	}

	#[test]
	fn a_colliding_key_evicts_the_previous_entry() {
		let mut table = TranspositionTable::new(97);
		let entry = Entry {
			val: 3,
			is_alpha: true,
			is_beta: true,
		};
		table.put(1, entry);
		table.put(1 + 97, entry);
		assert_eq!(table.get(1), None);
		assert_eq!(table.get(1 + 97), Some(entry));
	}

	#[test]
	fn index_uses_the_full_128_bit_key() {
		let mut table = TranspositionTable::new(97);
		let entry = Entry {
			val: 0,
			is_alpha: true,
			is_beta: true,
		};
		let high = 1u128 << 64;
		table.put(high, entry);
		assert_eq!(table.get(high), Some(entry));
		assert_eq!(table.get(high % 97), None);
	}
}
