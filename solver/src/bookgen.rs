//! Opening-book generation: enumerate every canonical select-phase position
//! up to a depth, evaluate each one exactly, and collect the sorted entries
//! that [`crate::book`] reads back.
//!
//! This mirrors the C prototype's `bookgen.c`: a depth-first walk over
//! placements records each new canonical position together with the move
//! path that reached it, and the positions are then evaluated in contiguous
//! chunks so that neighbours in DFS order, which share subtrees, also share a
//! transposition table.

use std::collections::HashSet;
use std::io::{self, Write};

use crate::book::BookEntry;
use crate::position::Position;
use crate::rules::Rules;
use crate::table::BOOK_TABLE_SIZE;
use crate::tables::{RotMasks, Tables, rot_masks};
use crate::{NUM_CELLS, NUM_PIECES, Solver};

/// How many positions a shard evaluates between progress reports.
pub const PROGRESS_INTERVAL: usize = 500;

/// A position to put in the book: its canonical key and a path that reaches it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
	/// Canonical key as [`Position::canonical_key`] computes it.
	pub key: u128,
	/// Alternating piece and cell tokens from the empty board to this position.
	pub path: Vec<u8>,
}

impl Candidate {
	/// Placements on the board in this position.
	#[must_use]
	pub fn moves_done(&self) -> usize {
		self.path.len() / 2
	}
}

/// Every canonical select-phase position with at most `depth` placements, in
/// DFS order, each recorded once.
#[must_use]
pub fn enumerate(rules: Rules, depth: u8) -> Vec<Candidate> {
	let mut walk = Walk {
		tables: Tables::new(rules),
		rot: rot_masks(),
		position: Position::new(),
		path: Vec::new(),
		seen: HashSet::new(),
		found: Vec::new(),
		depth: usize::from(depth),
	};
	walk.visit();
	walk.found
}

struct Walk {
	tables: Tables,
	rot: &'static RotMasks,
	position: Position,
	path: Vec<u8>,
	seen: HashSet<u128>,
	found: Vec<Candidate>,
	depth: usize,
}

impl Walk {
	fn visit(&mut self) {
		if self.position.is_won(&self.tables) || self.position.is_done() {
			return;
		}
		let key = self.position.canonical_key(self.rot);
		if !self.seen.insert(key) {
			return;
		}
		self.found.push(Candidate {
			key,
			path: self.path.clone(),
		});
		if self.path.len() / 2 == self.depth {
			return;
		}
		for piece in 0..u8::try_from(NUM_PIECES).expect("pieces fit in u8") {
			if !self.position.is_piece_free(piece) {
				continue;
			}
			self.position.move_select(piece);
			self.path.push(piece);
			for cell in 0..u8::try_from(NUM_CELLS).expect("cells fit in u8") {
				if !self.position.is_cell_free(cell) {
					continue;
				}
				self.position.move_place(cell);
				self.path.push(cell);
				self.visit();
				self.path.pop();
				self.position.undo_place(piece, cell);
			}
			self.path.pop();
			self.position.undo_select();
		}
	}
}

/// A progress report from one shard of the evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progress {
	/// Which shard, counting from zero.
	pub shard: usize,
	/// Positions this shard has evaluated so far.
	pub evaluated: usize,
	/// Positions this shard will evaluate in total.
	pub total: usize,
	/// Search nodes this shard has visited so far.
	pub nodes: u64,
}

/// Settings for one book generation run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Generator {
	/// Which win condition the book is for.
	pub rules: Rules,
	/// Deepest position to include, as a number of placements.
	pub depth: u8,
	/// Shards to evaluate in parallel, each on its own thread with its own tables.
	pub threads: usize,
	/// Transposition-table slots per shard of each thread's solver.
	pub table_size: usize,
}

impl Generator {
	/// A generator with the prototype's table size.
	#[must_use]
	pub const fn new(rules: Rules, depth: u8, threads: usize) -> Self {
		Self {
			rules,
			depth,
			threads,
			table_size: BOOK_TABLE_SIZE,
		}
	}

	/// Enumerate and evaluate every position up to the depth.
	///
	/// The result is sorted by [`BookEntry::sort_key`], ready to be written.
	///
	/// # Panics
	///
	/// Panics when `threads` is zero, or when a shard thread panics.
	#[must_use]
	pub fn generate(self, progress: &(dyn Fn(Progress) + Sync)) -> Vec<BookEntry> {
		let mut entries = self.evaluate(&enumerate(self.rules, self.depth), progress);
		entries.sort_by_key(|entry| entry.sort_key());
		entries
	}

	/// Evaluate `candidates` in contiguous chunks, one thread per chunk,
	/// reporting progress from each shard every [`PROGRESS_INTERVAL`]
	/// positions and when it finishes. Entries come back in shard order.
	///
	/// # Panics
	///
	/// Panics when `threads` is zero, or when a shard thread panics.
	#[must_use]
	pub fn evaluate(
		self,
		candidates: &[Candidate],
		progress: &(dyn Fn(Progress) + Sync),
	) -> Vec<BookEntry> {
		assert!(self.threads > 0, "at least one thread is needed");
		let total = candidates.len();
		std::thread::scope(|scope| {
			let handles: Vec<_> = (0..self.threads)
				.map(|shard| {
					let first = total * shard / self.threads;
					let last = total * (shard + 1) / self.threads;
					let chunk = &candidates[first..last];
					scope.spawn(move || self.evaluate_shard(shard, chunk, progress))
				})
				.collect();
			handles
				.into_iter()
				.flat_map(|handle| handle.join().expect("shard thread panicked"))
				.collect()
		})
	}

	fn evaluate_shard(
		self,
		shard: usize,
		chunk: &[Candidate],
		progress: &(dyn Fn(Progress) + Sync),
	) -> Vec<BookEntry> {
		let mut solver = Solver::without_book(self.rules, self.table_size);
		let report = |evaluated: usize, nodes: u64| {
			progress(Progress {
				shard,
				evaluated,
				total: chunk.len(),
				nodes,
			});
		};
		let mut entries = Vec::with_capacity(chunk.len());
		for (index, candidate) in chunk.iter().enumerate() {
			if index % PROGRESS_INTERVAL == 0 {
				report(index, solver.node_count());
			}
			while solver.undo() {}
			replay(&mut solver, &candidate.path);
			let value = solver.evaluate();
			entries.push(entry_for(candidate.key, value));
		}
		report(chunk.len(), solver.node_count());
		entries
	}
}

fn replay(solver: &mut Solver, path: &[u8]) {
	for pair in path.chunks_exact(2) {
		assert!(solver.apply_select(pair[0]), "bad path: select {}", pair[0]);
		assert!(solver.apply_place(pair[1]), "bad path: place {}", pair[1]);
	}
}

fn entry_for(key: u128, value: i8) -> BookEntry {
	#[allow(clippy::cast_possible_truncation)]
	let key_low = key as u64;
	let cells_taken = u16::try_from(key >> 64).expect("canonical cell mask fits in u16");
	BookEntry {
		key_low,
		cells_taken,
		value,
	}
}

/// Write `entries` as book records in the given order.
///
/// # Errors
///
/// Returns any error from `out`.
pub fn write_entries(entries: &[BookEntry], out: &mut impl Write) -> io::Result<()> {
	for entry in entries {
		out.write_all(&entry.to_record())?;
	}
	out.flush()
}

#[cfg(test)]
mod tests {
	use std::collections::{BTreeMap, HashMap, HashSet};

	use super::{Candidate, Generator, Progress, enumerate, write_entries};
	use crate::book::{self, BookEntry};
	use crate::rules::Rules;
	use crate::tables::rot_masks;
	use crate::{Solver, position::Position};

	fn count_by_depth(candidates: &[Candidate]) -> BTreeMap<usize, usize> {
		let mut counts = BTreeMap::new();
		for candidate in candidates {
			*counts.entry(candidate.moves_done()).or_insert(0) += 1;
		}
		counts
	}

	#[test]
	fn the_empty_board_is_the_only_position_at_depth_zero() {
		let candidates = enumerate(Rules::Squares, 0);
		assert_eq!(
			candidates,
			vec![Candidate {
				key: 0,
				path: vec![]
			}]
		);
	}

	#[test]
	fn one_placement_leaves_three_positions_up_to_symmetry() {
		let candidates = enumerate(Rules::Lines, 1);
		assert_eq!(
			count_by_depth(&candidates),
			BTreeMap::from([(0, 1), (1, 3)])
		);
		assert_eq!(candidates[0].path, Vec::<u8>::new());
		assert_eq!(candidates[1].path, vec![0, 0], "corner");
		assert_eq!(candidates[2].path, vec![0, 1], "edge");
		assert_eq!(candidates[3].path, vec![0, 5], "centre");
	}

	#[test]
	fn every_path_replays_to_its_key() {
		let rot = rot_masks();
		for candidate in enumerate(Rules::Squares, 3) {
			let mut position = Position::new();
			for pair in candidate.path.chunks_exact(2) {
				position.move_select(pair[0]);
				position.move_place(pair[1]);
			}
			assert_eq!(position.canonical_key(rot), candidate.key);
		}
	}

	#[test]
	fn depth_four_enumerates_exactly_the_committed_book_positions() {
		for rules in [Rules::Squares, Rules::Lines] {
			let candidates = enumerate(rules, 4);
			assert_eq!(
				count_by_depth(&candidates),
				BTreeMap::from([
					(0, 1),
					(1, 3),
					(2, 84),
					(3, 1586),
					(4, book::entry_count(rules) - 1674)
				]),
				"{rules:?}"
			);
			let found: HashSet<u128> = candidates.iter().map(|c| c.key).collect();
			let committed: HashSet<u128> = book::entries(rules).map(BookEntry::key).collect();
			assert_eq!(
				found.len(),
				candidates.len(),
				"{rules:?}: keys are distinct"
			);
			assert_eq!(found, committed, "{rules:?}");
		}
	}

	#[test]
	fn written_entries_read_back_as_the_same_book() {
		let entries: Vec<BookEntry> = book::entries(Rules::Squares).take(10).collect();
		let mut bytes = Vec::new();
		write_entries(&entries, &mut bytes).unwrap();
		assert_eq!(bytes.len(), 10 * book::RECORD_SIZE);
		let read: Vec<BookEntry> = bytes
			.chunks_exact(book::RECORD_SIZE)
			.map(BookEntry::from_record)
			.collect();
		assert_eq!(read, entries);
	}

	/// Depth 2 is 88 positions, dominated by solving the empty board from
	/// scratch: about a quarter of an hour per rules in the test profile.
	/// Run with `just solver::book-check`.
	#[test]
	#[ignore = "takes half an hour; run via just solver::book-check"]
	fn book_check_depth_two_matches_the_committed_books() {
		for rules in [Rules::Squares, Rules::Lines] {
			let reports = std::sync::Mutex::new(Vec::new());
			let generated = Generator::new(rules, 2, 4).generate(&|progress: Progress| {
				reports.lock().unwrap().push(progress);
			});
			let committed: Vec<BookEntry> = book::entries(rules)
				.filter(|entry| entry.moves_done() <= 2)
				.collect();
			assert_eq!(generated.len(), 88, "{rules:?}");
			assert_eq!(generated, committed, "{rules:?}");
			let reports = reports.into_inner().unwrap();
			let finished: Vec<usize> = reports
				.iter()
				.filter(|p| p.evaluated == p.total)
				.map(|p| p.shard)
				.collect();
			assert_eq!(
				finished.len(),
				4,
				"{rules:?}: every shard reports finishing"
			);
		}
	}

	/// Positions the book says are decided within a couple of placements
	/// search quickly, which keeps this check well under a second.
	#[test]
	fn shards_evaluate_their_chunks_and_report_progress() {
		let rules = Rules::Squares;
		let values: HashMap<u128, i8> = book::entries(rules)
			.map(|entry| (entry.key(), entry.value))
			.collect();
		let candidates: Vec<Candidate> = enumerate(rules, 4)
			.into_iter()
			.filter(|candidate| values[&candidate.key].abs() >= 8)
			.take(4)
			.collect();
		let reports = std::sync::Mutex::new(Vec::new());
		let generator = Generator {
			table_size: 100_003,
			..Generator::new(rules, 4, 2)
		};
		let entries = generator.evaluate(&candidates, &|progress: Progress| {
			reports.lock().unwrap().push(progress);
		});
		let expected: Vec<BookEntry> = candidates
			.iter()
			.map(|candidate| super::entry_for(candidate.key, values[&candidate.key]))
			.collect();
		assert_eq!(entries, expected);
		let mut reports = reports.into_inner().unwrap();
		reports.sort_by_key(|p| (p.shard, p.evaluated));
		let summary: Vec<(usize, usize, usize)> = reports
			.iter()
			.map(|p| (p.shard, p.evaluated, p.total))
			.collect();
		assert_eq!(summary, vec![(0, 0, 2), (0, 2, 2), (1, 0, 2), (1, 2, 2)]);
		assert!(reports.iter().all(|p| p.nodes > 0 || p.evaluated == 0));
	}

	#[test]
	fn a_solver_replays_a_candidate_path() {
		let candidate = enumerate(Rules::Squares, 2).pop().unwrap();
		let mut solver = Solver::without_book(Rules::Squares, 97);
		super::replay(&mut solver, &candidate.path);
		assert_eq!(solver.canonical_key(), candidate.key);
		assert_eq!(
			usize::from(16 - solver.moves_left()),
			candidate.moves_done()
		);
	}
}
