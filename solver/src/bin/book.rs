//! Generates an opening book: every canonical select-phase position up to a
//! depth, each with its exact value, in the record format `quarto_solver::book`
//! embeds.
//!
//! Usage: `book --depth N --rules lines|squares [--threads T] [--out PATH]`
//!
//! Positions are split into contiguous chunks, one thread per chunk, each with
//! its own transposition tables. Progress goes to stderr; the book goes to
//! `--out` (default `books/<rules>.bin`).

use std::error::Error;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

use quarto_solver::bookgen::{Generator, Progress, write_entries};
use quarto_solver::rules::Rules;

const USAGE: &str = "usage: book --depth N --rules lines|squares [--threads T] [--out PATH]";

#[derive(Debug, PartialEq, Eq)]
struct Args {
	depth: u8,
	rules: Rules,
	threads: usize,
	out: PathBuf,
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
	let args = parse_args(std::env::args().skip(1), default_threads())?;
	let generator = Generator::new(args.rules, args.depth, args.threads);
	eprintln!(
		"generating {:?} book to depth {} on {} threads",
		args.rules, args.depth, args.threads
	);

	let started = Instant::now();
	let entries = generator.generate(&|progress: Progress| {
		eprintln!(
			"shard {}/{}: {} of {} ({} nodes)",
			progress.shard, args.threads, progress.evaluated, progress.total, progress.nodes
		);
	});

	let mut out = BufWriter::new(File::create(&args.out)?);
	write_entries(&entries, &mut out)?;
	eprintln!(
		"wrote {} entries to {} in {:.1?}",
		entries.len(),
		args.out.display(),
		started.elapsed()
	);
	Ok(())
}

fn default_threads() -> usize {
	std::thread::available_parallelism().map_or(1, usize::from)
}

fn parse_args(
	args: impl IntoIterator<Item = String>,
	default_threads: usize,
) -> Result<Args, String> {
	let mut depth = None;
	let mut rules = None;
	let mut threads = default_threads;
	let mut out = None;
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
				threads = value
					.parse()
					.ok()
					.filter(|&count| count > 0)
					.ok_or_else(|| format!("threads must be a positive number, got {value}"))?;
			}
			"--out" => out = Some(PathBuf::from(value)),
			other => return Err(format!("unknown flag {other}")),
		}
	}
	let depth = depth.ok_or("--depth is required")?;
	let rules = rules.ok_or("--rules is required")?;
	let out = out.unwrap_or_else(|| PathBuf::from(format!("books/{}.bin", rules_name(rules))));
	Ok(Args {
		depth,
		rules,
		threads,
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

	use super::{Args, parse_args};

	fn parse(args: &[&str]) -> Result<Args, String> {
		parse_args(args.iter().map(ToString::to_string), 8)
	}

	#[test]
	fn the_required_flags_fill_in_the_defaults() {
		assert_eq!(
			parse(&["--depth", "4", "--rules", "lines"]),
			Ok(Args {
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
			Ok(Args {
				depth: 2,
				rules: Rules::Squares,
				threads: 3,
				out: PathBuf::from("/tmp/x.bin"),
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
	}
}
