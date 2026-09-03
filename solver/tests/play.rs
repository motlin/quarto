//! Drives the `play` binary and checks its transcript against an upstream
//! fixture byte for byte.

use std::io::Write;
use std::process::{Command, Output, Stdio};

/// The tail upstream's `play()` printed on a full board: an evaluation with no
/// moves before the result. The driver, like the reference build, prints only
/// the result.
const FIXTURE_TAIL: &str = "Eval:\nDraw\n\nMoves:\n\nDraw\n";

/// Upstream's `play()` printed the board once per turn, before the selection;
/// the driver prints it before every ply. Dropping each board (and the player
/// line after it) that follows a player line gives the upstream layout.
fn to_fixture_layout(transcript: &str) -> String {
	let blocks: Vec<&str> = transcript.split("\n\n").collect();
	let mut kept: Vec<&str> = Vec::new();
	let mut index = 0;
	while index < blocks.len() {
		let block = blocks[index];
		let after_player = kept
			.last()
			.is_some_and(|last| last.starts_with("Player:\n"));
		if block.starts_with("Board:\n") && after_player {
			assert_eq!(blocks[index + 1], *kept.last().expect("player"));
			index += 2;
			continue;
		}
		kept.push(block);
		index += 1;
	}
	kept.join("\n\n")
}

fn fixture_text() -> String {
	let path = format!(
		"{}/tests/fixtures/games_reg/0.txt",
		env!("CARGO_MANIFEST_DIR")
	);
	std::fs::read_to_string(&path).expect(&path)
}

/// The move tokens a transcript echoes: the line after each `Piece:` / `Cell:`.
fn moves_of(transcript: &str) -> Vec<&str> {
	let lines: Vec<&str> = transcript.lines().collect();
	lines
		.windows(2)
		.filter(|pair| pair[0] == "Piece:" || pair[0] == "Cell:")
		.map(|pair| pair[1])
		.collect()
}

fn play(args: &[&str], input: &str) -> Output {
	let mut child = Command::new(env!("CARGO_BIN_EXE_play"))
		.args(args)
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.spawn()
		.expect("spawn play");
	child
		.stdin
		.take()
		.expect("piped stdin")
		.write_all(input.as_bytes())
		.expect("write moves");
	child.wait_with_output().expect("play exits")
}

#[test]
fn the_full_transcript_matches_the_upstream_fixture() {
	let fixture = fixture_text();
	let moves = moves_of(&fixture).join("\n");
	assert_eq!(moves.split('\n').count(), 32);
	let expected = fixture
		.strip_suffix(FIXTURE_TAIL)
		.expect("fixture ends with the old full-board tail")
		.to_owned()
		+ "Draw\n";

	let output = play(&["0", "squares"], &moves);
	assert!(
		output.status.success(),
		"{}",
		String::from_utf8_lossy(&output.stderr)
	);
	let stdout = String::from_utf8(output.stdout).expect("utf-8");
	assert_eq!(
		stdout.matches("Board:").count(),
		33,
		"a board before every ply"
	);
	assert_eq!(to_fixture_layout(&stdout), expected);
}

#[test]
fn skipped_plies_are_applied_without_printing() {
	let fixture = fixture_text();
	let moves = moves_of(&fixture).join(" ");
	let output = play(&["30"], &moves);
	assert!(
		output.status.success(),
		"{}",
		String::from_utf8_lossy(&output.stderr)
	);
	let stdout = String::from_utf8(output.stdout).expect("utf-8");

	let last_board = fixture.rfind("Board:").expect("a board");
	let expected = fixture[..last_board].rfind("Board:").expect("two boards");
	let expected = fixture[expected..]
		.strip_suffix(FIXTURE_TAIL)
		.expect("fixture tail")
		.to_owned()
		+ "Draw\n";
	assert_eq!(to_fixture_layout(&stdout), expected);
	assert_eq!(stdout.matches("Board:").count(), 3);
	assert_eq!(stdout.matches("Eval:").count(), 2);
}

#[test]
fn lines_rules_change_the_evaluations() {
	let squares = play(&["24", "squares"], &moves_of(&fixture_text()).join("\n"));
	let lines = play(&["24", "lines"], &moves_of(&fixture_text()).join("\n"));
	assert!(squares.status.success());
	assert!(lines.status.success());
	assert_ne!(squares.stdout, lines.stdout);
}

#[test]
fn an_illegal_move_fails_with_a_message() {
	let output = play(&[], "ao a1 ao");
	assert!(!output.status.success());
	let stderr = String::from_utf8(output.stderr).expect("utf-8");
	assert!(stderr.contains("illegal piece ao"), "{stderr}");
}

#[test]
fn a_malformed_token_fails_with_a_message() {
	let output = play(&[], "ao z9");
	assert!(!output.status.success());
	let stderr = String::from_utf8(output.stderr).expect("utf-8");
	assert!(stderr.contains("bad cell z9"), "{stderr}");
}

#[test]
fn unknown_rules_are_rejected() {
	let output = play(&["0", "torus"], "");
	assert!(!output.status.success());
	let stderr = String::from_utf8(output.stderr).expect("utf-8");
	assert!(
		stderr.contains("rules must be lines or squares"),
		"{stderr}"
	);
}

#[test]
fn running_out_of_tokens_ends_the_transcript_after_the_evaluation() {
	let output = play(&[], "ao");
	assert!(output.status.success());
	let stdout = String::from_utf8(output.stdout).expect("utf-8");
	assert_eq!(stdout.matches("Eval:").count(), 2);
	assert!(stdout.ends_with(": Draw\n\n"), "{stdout:?}");
}
