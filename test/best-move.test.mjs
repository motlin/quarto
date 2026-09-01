// ✅ best_move() must return a legal move whose exact value equals the best available.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFixture, pieceFromString, cellFromString } from "./parse-fixture.mjs";
import { loadSolver, legalMoves, applyMove } from "./solver.mjs";

const solver = await loadSolver();

function replayFixture(plies, count) {
  solver.reset();
  for (const ply of plies.slice(0, count)) {
    applyMove(solver, ply.phase === "place" ? cellFromString(ply.chosen) : pieceFromString(ply.chosen));
  }
}

const { plies } = parseFixture(await readFile(new URL("../.llm/upstream/games_reg/1.txt", import.meta.url), "utf8"));

test("book is embedded", () => {
  assert.ok(solver.book_entries() > 0);
  assert.ok(solver.book_depth() >= 1);
});

for (const count of [0, 1, 4, 7, 10, 13, 20, 26]) {
  test(`best_move matches max exact value after ${count} plies`, () => {
    replayFixture(plies, count);
    solver.set_seed(count + 1);
    const best = solver.best_move();
    const moves = legalMoves(solver);
    assert.ok(moves.includes(best), `best move ${best} is legal`);
    const values = moves.map((move) => (solver.is_to_place() ? solver.evaluate_place(move) : solver.evaluate_select(move)));
    const bestValue = solver.is_to_place() ? solver.evaluate_place(best) : solver.evaluate_select(best);
    assert.equal(bestValue, Math.max(...values));
  });
}

test("best_move tie-break varies with the seed", () => {
  replayFixture(plies, 0);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    solver.set_seed(seed);
    seen.add(solver.best_move());
  }
  assert.ok(seen.size > 1, "all sixteen opening pieces draw, so different seeds should pick different pieces");
});

test("undo restores the previous position", () => {
  replayFixture(plies, 6);
  const before = { cells: solver.cells_taken(), pieces: solver.pieces_taken(), piece: solver.current_piece(), movesLeft: solver.moves_left() };
  applyMove(solver, pieceFromString(plies[6].chosen));
  applyMove(solver, cellFromString(plies[7].chosen));
  assert.equal(solver.undo(), 1);
  assert.equal(solver.undo(), 1);
  assert.deepEqual({ cells: solver.cells_taken(), pieces: solver.pieces_taken(), piece: solver.current_piece(), movesLeft: solver.moves_left() }, before);
});

test("best_move returns -1 when the game is over", () => {
  replayFixture(plies, plies.length);
  assert.ok(solver.is_won() || solver.is_done());
  assert.equal(solver.best_move(), -1);
});
