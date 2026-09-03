//! Replays the upstream `games_reg/*.txt` transcripts and checks that the
//! solver reproduces every evaluation they record: the root value and the
//! value of every legal move at every ply, then the terminal result.

use std::collections::BTreeMap;

use quarto_solver::Solver;
use quarto_solver::book::Book;
use quarto_solver::notation::{
	cell_from_string, cell_to_string, eval_to_string, piece_from_string, piece_to_string,
};
use quarto_solver::rules::Rules;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
	Select,
	Place,
}

#[derive(Debug, PartialEq, Eq)]
struct Ply {
	phase: Phase,
	evaluation: String,
	moves: BTreeMap<String, String>,
	chosen: String,
}

#[derive(Debug, PartialEq, Eq)]
struct Fixture {
	plies: Vec<Ply>,
	result: String,
}

struct PendingPly {
	evaluation: String,
	moves: BTreeMap<String, String>,
}

/// Parses a `play()` transcript: blank-line separated blocks whose first line
/// is a header (`Board:`, `Player:`, `Eval:`, `Moves:`, `Piece:`, `Cell:`) or
/// the terminal `Win` / `Draw`.
fn parse_fixture(text: &str) -> Fixture {
	let mut plies = Vec::new();
	let mut result = None;
	let mut pending: Option<PendingPly> = None;

	for block in text.split("\n\n").map(str::trim).filter(|b| !b.is_empty()) {
		let mut lines = block.lines();
		let header = lines.next().expect("non-empty block");
		let body: Vec<&str> = lines.collect();
		match header {
			"Eval:" => {
				assert_eq!(body.len(), 1, "{block:?}");
				pending = Some(PendingPly {
					evaluation: body[0].to_owned(),
					moves: BTreeMap::new(),
				});
			}
			"Moves:" => {
				let ply = pending.as_mut().expect("Moves before Eval");
				for line in body {
					let (tokens, evaluation) = line.split_once(" : ").expect("`tokens : eval`");
					for token in tokens.split_whitespace() {
						ply.moves.insert(token.to_owned(), evaluation.to_owned());
					}
				}
			}
			"Piece:" | "Cell:" => {
				let PendingPly { evaluation, moves } = pending.take().expect("move before Eval");
				assert_eq!(body.len(), 1, "{block:?}");
				plies.push(Ply {
					phase: if header == "Piece:" {
						Phase::Select
					} else {
						Phase::Place
					},
					evaluation,
					moves,
					chosen: body[0].to_owned(),
				});
			}
			"Win" | "Draw" => result = Some(header.to_owned()),
			_ => {}
		}
	}

	Fixture {
		plies,
		result: result.expect("fixture has a terminal result"),
	}
}

fn fixture(index: usize) -> Fixture {
	let path = format!(
		"{}/tests/fixtures/games_reg/{index}.txt",
		env!("CARGO_MANIFEST_DIR")
	);
	parse_fixture(&std::fs::read_to_string(&path).expect(&path))
}

fn legal_moves(solver: &Solver) -> Vec<u8> {
	let taken = if solver.is_to_place() {
		solver.cells_taken()
	} else {
		solver.pieces_taken()
	};
	(0..16u8).filter(|&m| taken & (1 << m) == 0).collect()
}

fn replay_fixture(index: usize) {
	let Fixture { plies, result } = fixture(index);
	let mut solver = Solver::new(Rules::Squares);
	let book_path = format!("{}/books/squares.bin", env!("CARGO_MANIFEST_DIR"));
	let records = std::fs::read(&book_path).expect(&book_path);
	solver
		.load_book(Book::from_records(Rules::Squares, &records).expect("whole records"))
		.expect("squares book");

	for (ply_index, ply) in plies.iter().enumerate() {
		let context = format!("fixture {index} ply {ply_index} ({:?})", ply.phase);
		let moves_left = solver.moves_left();
		assert_eq!(solver.is_to_place(), ply.phase == Phase::Place, "{context}");
		assert_eq!(
			eval_to_string(moves_left, solver.evaluate()),
			ply.evaluation,
			"{context} root"
		);

		let actual: BTreeMap<String, String> = legal_moves(&solver)
			.into_iter()
			.map(|m| match ply.phase {
				Phase::Place => (cell_to_string(m), solver.evaluate_place(m)),
				Phase::Select => (piece_to_string(m), solver.evaluate_select(m)),
			})
			.map(|(token, value)| (token, eval_to_string(moves_left, value)))
			.collect();
		assert_eq!(actual, ply.moves, "{context} moves");

		let applied = match ply.phase {
			Phase::Place => solver.apply_place(cell_from_string(&ply.chosen).expect("cell")),
			Phase::Select => solver.apply_select(piece_from_string(&ply.chosen).expect("piece")),
		};
		assert!(applied, "{context}: {} is legal", ply.chosen);
	}

	let outcome = if solver.is_won() {
		"Win"
	} else if solver.is_done() {
		"Draw"
	} else {
		"ongoing"
	};
	assert_eq!(outcome, result, "fixture {index} result");
}

#[test]
fn the_parser_reads_a_transcript_into_plies() {
	let text = "Board:\n+----+\n\nPlayer:\n1\n\nEval:\nDraw\n\nMoves:\nao bo : Draw\nax : Loss in 3\n\n\
	            Piece:\nbo\n\nPlayer:\n2\n\nEval:\nWin in 2\n\nMoves:\na1 : Win in 2\nb1 c1 : Draw\n\n\
	            Cell:\na1\n\nBoard:\n+----+\n\nPlayer:\n2\n\nWin\n";
	assert_eq!(
		parse_fixture(text),
		Fixture {
			plies: vec![
				Ply {
					phase: Phase::Select,
					evaluation: "Draw".to_owned(),
					moves: [("ao", "Draw"), ("bo", "Draw"), ("ax", "Loss in 3")]
						.into_iter()
						.map(|(k, v)| (k.to_owned(), v.to_owned()))
						.collect(),
					chosen: "bo".to_owned(),
				},
				Ply {
					phase: Phase::Place,
					evaluation: "Win in 2".to_owned(),
					moves: [("a1", "Win in 2"), ("b1", "Draw"), ("c1", "Draw")]
						.into_iter()
						.map(|(k, v)| (k.to_owned(), v.to_owned()))
						.collect(),
					chosen: "a1".to_owned(),
				},
			],
			result: "Win".to_owned(),
		}
	);
}

#[test]
fn every_fixture_is_a_full_drawn_game_of_thirty_two_plies() {
	for index in 0..10 {
		let fixture = fixture(index);
		assert_eq!(fixture.plies.len(), 32, "fixture {index}");
		assert_eq!(fixture.result, "Draw", "fixture {index}");
		assert_eq!(fixture.plies[0].phase, Phase::Select, "fixture {index}");
		assert_eq!(fixture.plies[0].moves.len(), 16, "fixture {index}");
	}
}

macro_rules! fixture_tests {
	($($name:ident => $index:expr),* $(,)?) => {
		$(
			#[test]
			fn $name() {
				replay_fixture($index);
			}
		)*
	};
}

fixture_tests! {
	games_reg_0 => 0,
	games_reg_1 => 1,
	games_reg_2 => 2,
	games_reg_3 => 3,
	games_reg_4 => 4,
	games_reg_5 => 5,
	games_reg_6 => 6,
	games_reg_7 => 7,
	games_reg_8 => 8,
	games_reg_9 => 9,
}
