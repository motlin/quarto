//! Plays a Quarto game from move tokens on stdin, printing the transcript in
//! the format of the upstream solver's `play()` so the two can be diffed.
//!
//! Usage: `play [skip_plies] [lines|squares] [book] < moves.txt`
//!
//! The first `skip_plies` plies are applied silently; from then on every ply
//! prints the board, the player to move, the exact evaluation and the value of
//! every legal move, then echoes the token read. Timings go to stderr.
//!
//! The opening book is read from `book`, a `.bin` of records or a `.qbk` as the
//! web app fetches, defaulting to this crate's `books/<rules>.bin`.

use std::error::Error;
use std::io::{self, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use quarto_solver::book::Book;
use quarto_solver::book_codec;
use quarto_solver::notation::{
	cell_from_string, cell_to_string, eval_to_string, piece_from_string, piece_to_string,
};
use quarto_solver::rules::Rules;
use quarto_solver::{NUM_CELLS, NUM_COLS, NUM_PIECES, Solver};

/// Values lie in `-(NUM_MOVES + 1)..=NUM_MOVES + 1`; the groups are printed
/// from the best value down, as upstream's reversed map iteration does.
const MAX_VALUE: i8 = 17;

fn main() -> ExitCode {
	match run() {
		Ok(()) => ExitCode::SUCCESS,
		Err(error) => {
			eprintln!("{error}");
			ExitCode::FAILURE
		}
	}
}

fn run() -> Result<(), Box<dyn Error>> {
	let mut args = std::env::args().skip(1);
	let skip_plies: usize = match args.next() {
		Some(text) => text
			.parse()
			.map_err(|_| format!("skip_plies must be a number, got {text}"))?,
		None => 0,
	};
	let rules = match args.next().as_deref() {
		None | Some("squares") => Rules::Squares,
		Some("lines") => Rules::Lines,
		Some(other) => return Err(format!("rules must be lines or squares, got {other}").into()),
	};
	let book_path = args
		.next()
		.map_or_else(|| default_book_path(rules), PathBuf::from);

	let mut input = String::new();
	io::stdin().read_to_string(&mut input)?;
	let mut tokens = input.split_whitespace();

	let mut out = BufWriter::new(io::stdout().lock());
	let mut solver = Solver::new(rules);
	solver.load_book(read_book(rules, &book_path)?)?;
	let mut player = 0;

	for ply in 0.. {
		let evaluating = ply >= skip_plies;
		if evaluating {
			print_board(&mut out, &solver)?;
			print_player(&mut out, player)?;
		}

		if solver.is_won() {
			writeln!(out, "Win")?;
			break;
		}
		if solver.is_done() {
			writeln!(out, "Draw")?;
			break;
		}

		if evaluating {
			print_eval(&mut out, &mut solver, ply)?;
		}

		let Some(token) = tokens.next() else {
			break;
		};

		if solver.is_to_place() {
			if evaluating {
				writeln!(out, "Cell:\n{token}\n")?;
			}
			let cell = cell_from_string(token).ok_or_else(|| format!("bad cell {token}"))?;
			if !solver.apply_place(cell) {
				return Err(format!("illegal cell {token}").into());
			}
		} else {
			if evaluating {
				writeln!(out, "Piece:\n{token}\n")?;
			}
			let piece = piece_from_string(token).ok_or_else(|| format!("bad piece {token}"))?;
			if !solver.apply_select(piece) {
				return Err(format!("illegal piece {token}").into());
			}
			player = 1 - player;
			if evaluating {
				print_player(&mut out, player)?;
			}
		}
		out.flush()?;
	}

	out.flush()?;
	eprintln!("nodes: {}", solver.node_count());
	Ok(())
}

fn default_book_path(rules: Rules) -> PathBuf {
	let name = match rules {
		Rules::Squares => "squares",
		Rules::Lines => "lines",
	};
	Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("books")
		.join(format!("{name}.bin"))
}

/// The book at `path`: `.qbk` files carry their own rules, anything else is
/// taken as records for `rules`.
fn read_book(rules: Rules, path: &Path) -> Result<Book, Box<dyn Error>> {
	let bytes = std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
	let book = if path.extension().is_some_and(|ext| ext == "qbk") {
		book_codec::decode(&bytes)?
	} else {
		Book::from_records(rules, &bytes)?
	};
	Ok(book)
}

fn print_board(out: &mut impl Write, solver: &Solver) -> io::Result<()> {
	writeln!(out, "Board:")?;
	writeln!(out, "+----+----+----+----+")?;
	for cell in 0..NUM_CELLS {
		let piece = solver.piece_at(u8::try_from(cell).expect("cell fits in u8"));
		write!(out, "| {} ", piece_to_string(piece))?;
		if cell % NUM_COLS == NUM_COLS - 1 {
			writeln!(out, "|")?;
			writeln!(out, "+----+----+----+----+")?;
		}
	}
	writeln!(out)
}

fn print_player(out: &mut impl Write, player: u8) -> io::Result<()> {
	writeln!(out, "Player:\n{}\n", player + 1)
}

fn print_eval(out: &mut impl Write, solver: &mut Solver, ply: usize) -> io::Result<()> {
	let started = Instant::now();
	let nodes_before = solver.node_count();
	let value = solver.evaluate();
	let evaluated = Instant::now();
	let nodes_evaluated = solver.node_count();
	let best = solver.best_move();
	let chosen = Instant::now();
	eprintln!(
		"ply {ply}: evaluate {:.3}s ({} nodes), best_move {:.3}s ({} nodes) -> {}",
		(evaluated - started).as_secs_f64(),
		nodes_evaluated - nodes_before,
		(chosen - evaluated).as_secs_f64(),
		solver.node_count() - nodes_evaluated,
		best.map_or(-1, i32::from),
	);

	let moves_left = solver.moves_left();
	writeln!(out, "Eval:\n{}\n", eval_to_string(moves_left, value))?;

	let to_place = solver.is_to_place();
	let taken = if to_place {
		solver.cells_taken()
	} else {
		solver.pieces_taken()
	};
	let count = if to_place { NUM_CELLS } else { NUM_PIECES };
	let moves: Vec<(u8, i8)> = (0..count)
		.map(|m| u8::try_from(m).expect("move fits in u8"))
		.filter(|&m| taken & (1 << m) == 0)
		.map(|m| {
			let value = if to_place {
				solver.evaluate_place(m)
			} else {
				solver.evaluate_select(m)
			};
			(m, value)
		})
		.collect();

	writeln!(out, "Moves:")?;
	for value in (-MAX_VALUE..=MAX_VALUE).rev() {
		let group: Vec<&(u8, i8)> = moves.iter().filter(|&&(_, v)| v == value).collect();
		if group.is_empty() {
			continue;
		}
		for &&(m, _) in &group {
			let text = if to_place {
				cell_to_string(m)
			} else {
				piece_to_string(m)
			};
			write!(out, "{text} ")?;
		}
		writeln!(out, ": {}", eval_to_string(moves_left, value))?;
	}
	writeln!(out)
}
