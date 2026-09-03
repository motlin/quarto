//! Generates an opening book, or encodes one for the web app.
//!
//! Usage:
//!
//! ```text
//! book --depth N --rules lines|squares [--threads T] [--out PATH]
//! book --encode BIN --rules lines|squares [--out PATH]
//! ```
//!
//! Generation enumerates every canonical select-phase position up to a depth
//! and evaluates each one exactly, in the 11-byte record format of
//! `books/<rules>.bin`. Positions are split into contiguous chunks, one thread
//! per chunk, each with its own transposition tables. Progress goes to stderr;
//! the book goes to `--out` (default `books/<rules>.bin`).
//!
//! Encoding reads such a `.bin` and writes the compact delta-varint `.qbk`
//! that `quarto_solver::book_codec` decodes, by default to
//! `../web/src/solver/books/<rules>.qbk` where the web app imports it from.

use std::error::Error;
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

use quarto_solver::book::Book;
use quarto_solver::book_codec;
use quarto_solver::bookgen::{Generator, Progress, write_entries};
use quarto_solver::rules::Rules;

const USAGE: &str = "usage: book --depth N --rules lines|squares [--threads T] [--out PATH]\n       book --encode BIN --rules lines|squares [--out PATH]";

#[derive(Debug, PartialEq, Eq)]
enum Command {
	Generate {
		depth: u8,
		rules: Rules,
		threads: usize,
		out: PathBuf,
	},
	Encode {
		input: PathBuf,
		rules: Rules,
		out: PathBuf,
	},
}

fn main() -> ExitCode {
	match run() {
		Ok(()) => ExitCode::SUCCESS,
		Err(error) => {
			eprintln!("{error}");
			eprintln!("{USAGE}");
			ExitCode::FAILURE
		}
	}
}

fn run() -> Result<(), Box<dyn Error>> {
	match parse_args(std::env::args().skip(1), default_threads())? {
		Command::Generate {
			depth,
			rules,
			threads,
			out,
		} => generate(depth, rules, threads, &out),
		Command::Encode { input, rules, out } => encode(&input, rules, &out),
	}
}

fn generate(depth: u8, rules: Rules, threads: usize, out: &PathBuf) -> Result<(), Box<dyn Error>> {
	let generator = Generator::new(rules, depth, threads);
	eprintln!("generating {rules:?} book to depth {depth} on {threads} threads");

	let started = Instant::now();
	let entries = generator.generate(&|progress: Progress| {
		eprintln!(
			"shard {}/{}: {} of {} ({} nodes)",
			progress.shard, threads, progress.evaluated, progress.total, progress.nodes
		);
	});

	let mut file = BufWriter::new(File::create(out)?);
	write_entries(&entries, &mut file)?;
	eprintln!(
		"wrote {} entries to {} in {:.1?}",
		entries.len(),
		out.display(),
		started.elapsed()
	);
	Ok(())
}

fn encode(input: &PathBuf, rules: Rules, out: &PathBuf) -> Result<(), Box<dyn Error>> {
	let records = fs::read(input).map_err(|error| format!("{}: {error}", input.display()))?;
	let book = Book::from_records(rules, &records)?;
	let bytes = book_codec::encode(&book);
	if let Some(parent) = out.parent() {
		fs::create_dir_all(parent)?;
	}
	fs::write(out, &bytes)?;
	eprintln!(
		"encoded {} entries ({} bytes) to {} ({} bytes)",
		book.len(),
		records.len(),
		out.display(),
		bytes.len()
	);
	Ok(())
}

fn default_threads() -> usize {
	std::thread::available_parallelism().map_or(1, usize::from)
}

fn parse_args(
	args: impl IntoIterator<Item = String>,
	default_threads: usize,
) -> Result<Command, String> {
	let mut depth = None;
	let mut rules = None;
	let mut threads = None;
	let mut out = None;
	let mut encode = None;
	let mut args = args.into_iter();
	while let Some(flag) = args.next() {
		let value = args.next().ok_or_else(|| format!("{flag} needs a value"))?;
		match flag.as_str() {
			"--depth" => {
				depth = Some(
					value
						.parse()
						.map_err(|_| format!("depth must be a number, got {value}"))?,
				);
			}
			"--rules" => {
				rules = Some(match value.as_str() {
					"squares" => Rules::Squares,
					"lines" => Rules::Lines,
					other => return Err(format!("rules must be lines or squares, got {other}")),
				});
			}
			"--threads" => {
				threads = Some(
					value
						.parse()
						.ok()
						.filter(|&count| count > 0)
						.ok_or_else(|| format!("threads must be a positive number, got {value}"))?,
				);
			}
			"--out" => out = Some(PathBuf::from(value)),
			"--encode" => encode = Some(PathBuf::from(value)),
			other => return Err(format!("unknown flag {other}")),
		}
	}
	let rules = rules.ok_or("--rules is required")?;
	if let Some(input) = encode {
		if depth.is_some() || threads.is_some() {
			return Err("--encode takes neither --depth nor --threads".to_string());
		}
		let out = out.unwrap_or_else(|| {
			PathBuf::from(format!("../web/src/solver/books/{}.qbk", rules_name(rules)))
		});
		return Ok(Command::Encode { input, rules, out });
	}
	let depth = depth.ok_or("--depth is required")?;
	let out = out.unwrap_or_else(|| PathBuf::from(format!("books/{}.bin", rules_name(rules))));
	Ok(Command::Generate {
		depth,
		rules,
		threads: threads.unwrap_or(default_threads),
		out,
	})
}

fn rules_name(rules: Rules) -> &'static str {
	match rules {
		Rules::Squares => "squares",
		Rules::Lines => "lines",
	}
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use quarto_solver::rules::Rules;

	use super::{Command, parse_args};

	fn parse(args: &[&str]) -> Result<Command, String> {
		parse_args(args.iter().map(ToString::to_string), 8)
	}

	#[test]
	fn the_required_flags_fill_in_the_defaults() {
		assert_eq!(
			parse(&["--depth", "4", "--rules", "lines"]),
			Ok(Command::Generate {
				depth: 4,
				rules: Rules::Lines,
				threads: 8,
				out: PathBuf::from("books/lines.bin"),
			})
		);
	}

	#[test]
	fn every_flag_can_be_given_in_any_order() {
		assert_eq!(
			parse(&[
				"--out",
				"/tmp/x.bin",
				"--threads",
				"3",
				"--rules",
				"squares",
				"--depth",
				"2"
			]),
			Ok(Command::Generate {
				depth: 2,
				rules: Rules::Squares,
				threads: 3,
				out: PathBuf::from("/tmp/x.bin"),
			})
		);
	}

	#[test]
	fn encode_reads_a_bin_and_writes_next_to_the_web_app_by_default() {
		assert_eq!(
			parse(&["--encode", "books/squares.bin", "--rules", "squares"]),
			Ok(Command::Encode {
				input: PathBuf::from("books/squares.bin"),
				rules: Rules::Squares,
				out: PathBuf::from("../web/src/solver/books/squares.qbk"),
			})
		);
		assert_eq!(
			parse(&["--rules", "lines", "--out", "x.qbk", "--encode", "y.bin"]),
			Ok(Command::Encode {
				input: PathBuf::from("y.bin"),
				rules: Rules::Lines,
				out: PathBuf::from("x.qbk"),
			})
		);
	}

	#[test]
	fn bad_arguments_are_rejected() {
		assert_eq!(
			parse(&["--depth", "2"]),
			Err("--rules is required".to_string())
		);
		assert_eq!(
			parse(&["--rules", "lines"]),
			Err("--depth is required".to_string())
		);
		assert_eq!(
			parse(&["--depth", "x", "--rules", "lines"]),
			Err("depth must be a number, got x".to_string())
		);
		assert_eq!(
			parse(&["--depth", "2", "--rules", "diagonals"]),
			Err("rules must be lines or squares, got diagonals".to_string())
		);
		assert_eq!(
			parse(&["--depth", "2", "--rules", "lines", "--threads", "0"]),
			Err("threads must be a positive number, got 0".to_string())
		);
		assert_eq!(
			parse(&["--depth", "2", "--rules", "lines", "--out"]),
			Err("--out needs a value".to_string())
		);
		assert_eq!(
			parse(&["--verbose", "1"]),
			Err("unknown flag --verbose".to_string())
		);
		assert_eq!(
			parse(&["--encode", "a.bin"]),
			Err("--rules is required".to_string())
		);
		assert_eq!(
			parse(&["--encode", "a.bin", "--rules", "lines", "--depth", "2"]),
			Err("--encode takes neither --depth nor --threads".to_string())
		);
	}
}
