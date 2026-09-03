//! Round-trips the committed `.bin` books through the `.qbk` codec, checks the
//! checked-in `.qbk` files the web app fetches are exactly that encoding, and
//! confirms a decoded book drives the solver.

use quarto_solver::Solver;
use quarto_solver::book::{Book, BookError};
use quarto_solver::book_codec::{decode, encode};
use quarto_solver::rules::Rules;

fn rules_name(rules: Rules) -> &'static str {
	match rules {
		Rules::Squares => "squares",
		Rules::Lines => "lines",
	}
}

fn read(relative: &str) -> Vec<u8> {
	let path = format!("{}/{relative}", env!("CARGO_MANIFEST_DIR"));
	std::fs::read(&path).expect(&path)
}

fn committed(rules: Rules) -> Book {
	let records = read(&format!("books/{}.bin", rules_name(rules)));
	Book::from_records(rules, &records).expect("whole records")
}

fn published(rules: Rules) -> Vec<u8> {
	read(&format!(
		"../web/src/solver/books/{}.qbk",
		rules_name(rules)
	))
}

#[test]
fn both_books_round_trip_through_the_codec() {
	for rules in [Rules::Squares, Rules::Lines] {
		let book = committed(rules);
		assert!(book.len() > 40_000, "{rules:?}");
		let bytes = encode(&book);
		assert!(bytes.len() < 150_000, "{rules:?}: {} bytes", bytes.len());
		assert_eq!(decode(&bytes).as_ref(), Ok(&book), "{rules:?}");
	}
}

#[test]
fn the_published_qbk_files_are_the_encoded_committed_books() {
	for rules in [Rules::Squares, Rules::Lines] {
		assert_eq!(
			published(rules),
			encode(&committed(rules)),
			"{rules:?}: run `just solver::books`"
		);
	}
}

#[test]
fn decode_rejects_truncated_input_and_a_bad_magic() {
	let bytes = published(Rules::Squares);
	assert_eq!(decode(&bytes[..bytes.len() - 1]), Err(BookError::Truncated));
	assert_eq!(decode(&bytes[..7]), Err(BookError::Truncated));
	let mut bad = bytes.clone();
	bad[3] = b'0';
	assert_eq!(decode(&bad), Err(BookError::BadMagic));
}

#[test]
fn a_decoded_squares_book_answers_the_empty_board_from_the_book() {
	let book = decode(&published(Rules::Squares)).expect("published squares book");
	let mut solver = Solver::new(Rules::Squares);
	assert_eq!(solver.load_book(book), Ok(40_729));
	assert_eq!(solver.book_depth(), 4);
	assert_eq!(solver.evaluate(), 0);
	assert!(solver.node_count() < 100, "{}", solver.node_count());
}

#[test]
fn a_book_for_the_other_rules_is_refused() {
	let book = decode(&published(Rules::Lines)).expect("published lines book");
	let mut solver = Solver::new(Rules::Squares);
	assert_eq!(
		solver.load_book(book),
		Err(BookError::WrongRules {
			expected: Rules::Squares,
			found: Rules::Lines,
		})
	);
	assert_eq!(solver.book_entries(), 0);
}
