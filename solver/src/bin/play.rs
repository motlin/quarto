//! Plays a Quarto game from move tokens on stdin, printing an upstream-format transcript.

use std::process::ExitCode;

fn main() -> ExitCode {
	eprintln!("usage: play [skip_plies] [lines|squares] < moves.txt");
	eprintln!("not implemented yet");
	ExitCode::from(2)
}
