//! The upstream transcript notation: two-letter piece and cell tokens and the
//! `Draw` / `Win in N` / `Loss in N` evaluation strings.
//!
//! A piece token is a letter `a`/`b` (property bit 0) followed by `o`/`x`
//! (bit 1); bit 2 capitalises the first letter and bit 3 the second, so `Bx`
//! is piece 7 and `aO` is piece 8. A cell token is a column letter `a`-`d`
//! followed by a row digit `1`-`4`; `b3` is cell 9.

use crate::position::NO_PIECE;
use crate::{NUM_CELLS, NUM_COLS, NUM_PIECES};

/// Board and piece counts narrowed to the width of a move index.
const COLS: u8 = 4;
const ROWS: u8 = 4;
const PIECES: u8 = 16;
const _: () = assert!(COLS as usize == NUM_COLS);
const _: () = assert!(ROWS as usize * COLS as usize == NUM_CELLS);
const _: () = assert!(PIECES as usize == NUM_PIECES);

/// The upstream token for `piece`, or two spaces for [`NO_PIECE`].
#[must_use]
pub fn piece_to_string(piece: u8) -> String {
	if piece == NO_PIECE {
		return "  ".to_owned();
	}
	let first = if piece & 1 == 0 { 'a' } else { 'b' };
	let second = if piece & 2 == 0 { 'o' } else { 'x' };
	let first = if piece & 4 == 0 {
		first
	} else {
		first.to_ascii_uppercase()
	};
	let second = if piece & 8 == 0 {
		second
	} else {
		second.to_ascii_uppercase()
	};
	[first, second].iter().collect()
}

/// The piece named by an upstream token, or `None` for anything else.
#[must_use]
pub fn piece_from_string(text: &str) -> Option<u8> {
	let [first, second] = text.as_bytes() else {
		return None;
	};
	let low = match first.to_ascii_lowercase() {
		b'a' => 0,
		b'b' => 1,
		_ => return None,
	};
	let high = match second.to_ascii_lowercase() {
		b'o' => 0,
		b'x' => 2,
		_ => return None,
	};
	let tall = if first.is_ascii_uppercase() { 4 } else { 0 };
	let hollow = if second.is_ascii_uppercase() { 8 } else { 0 };
	Some(low | high | tall | hollow)
}

/// The upstream token for `cell`: column letter then row digit.
#[must_use]
pub fn cell_to_string(cell: u8) -> String {
	[
		char::from(b'a' + cell % COLS),
		char::from(b'1' + cell / COLS),
	]
	.iter()
	.collect()
}

/// The cell named by an upstream token, or `None` for anything else.
#[must_use]
pub fn cell_from_string(text: &str) -> Option<u8> {
	let [first, second] = text.as_bytes() else {
		return None;
	};
	let col = first.checked_sub(b'a').filter(|&col| col < COLS)?;
	let row = second.checked_sub(b'1').filter(|&row| row < ROWS)?;
	Some(row * COLS + col)
}

/// Upstream `evalToString`: `Draw`, or `Win in N` / `Loss in N` where `N`
/// counts placements from the position with `moves_left` placements to go.
#[must_use]
pub fn eval_to_string(moves_left: u8, value: i8) -> String {
	if value == 0 {
		return "Draw".to_owned();
	}
	let distance = i16::from(moves_left) + 1 - i16::from(value.unsigned_abs());
	let outcome = if value > 0 { "Win" } else { "Loss" };
	format!("{outcome} in {distance}")
}

/// Every piece token in piece order.
#[must_use]
pub fn piece_tokens() -> Vec<String> {
	(0..PIECES).map(piece_to_string).collect()
}

#[cfg(test)]
mod tests {
	use super::{
		cell_from_string, cell_to_string, eval_to_string, piece_from_string, piece_to_string,
		piece_tokens,
	};
	use crate::position::NO_PIECE;

	#[test]
	fn piece_tokens_follow_the_upstream_order() {
		assert_eq!(
			piece_tokens(),
			[
				"ao", "bo", "ax", "bx", "Ao", "Bo", "Ax", "Bx", "aO", "bO", "aX", "bX", "AO", "BO",
				"AX", "BX"
			]
		);
	}

	#[test]
	fn the_empty_hand_prints_as_two_spaces() {
		assert_eq!(piece_to_string(NO_PIECE), "  ");
	}

	#[test]
	fn piece_tokens_round_trip() {
		for piece in 0..16 {
			assert_eq!(piece_from_string(&piece_to_string(piece)), Some(piece));
		}
	}

	#[test]
	fn malformed_piece_tokens_are_rejected() {
		for text in ["", "a", "abc", "co", "ay", "  ", "a1"] {
			assert_eq!(piece_from_string(text), None, "{text:?}");
		}
	}

	#[test]
	fn cells_are_column_letter_then_row_digit() {
		assert_eq!(cell_to_string(0), "a1");
		assert_eq!(cell_to_string(3), "d1");
		assert_eq!(cell_to_string(4), "a2");
		assert_eq!(cell_to_string(9), "b3");
		assert_eq!(cell_to_string(15), "d4");
	}

	#[test]
	fn cell_tokens_round_trip() {
		for cell in 0..16 {
			assert_eq!(cell_from_string(&cell_to_string(cell)), Some(cell));
		}
	}

	#[test]
	fn malformed_cell_tokens_are_rejected() {
		for text in ["", "a", "a1x", "e1", "a5", "a0", "A1", "ao"] {
			assert_eq!(cell_from_string(text), None, "{text:?}");
		}
	}

	#[test]
	fn evaluations_count_placements_from_the_parent_position() {
		assert_eq!(eval_to_string(16, 0), "Draw");
		assert_eq!(eval_to_string(13, 13), "Win in 1");
		assert_eq!(eval_to_string(6, -2), "Loss in 5");
		assert_eq!(eval_to_string(6, -6), "Loss in 1");
		assert_eq!(eval_to_string(6, 5), "Win in 2");
	}
}
