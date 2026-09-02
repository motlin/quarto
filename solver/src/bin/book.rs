//! Generates an opening book by evaluating every canonical position up to a depth.

use std::process::ExitCode;

fn main() -> ExitCode {
	eprintln!("usage: book --depth N --rules lines|squares --threads T --out books/<rules>.bin");
	eprintln!("not implemented yet");
	ExitCode::from(2)
}
