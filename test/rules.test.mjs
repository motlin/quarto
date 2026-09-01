// ✅ set_rules toggles the 2x2-square win condition and reseeds the matching opening book.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSolver, applyMove } from "./solver.mjs";

const solver = await loadSolver();

// Pieces 0, 4, 8, 12 share bit0 = 0 (all light); cells 0, 1, 4, 5 form the top-left 2x2 square.
function playTopLeftSquare() {
  const pieces = [0, 4, 8, 12];
  const cells = [0, 1, 4, 5];
  for (let i = 0; i < 4; i++) {
    applyMove(solver, pieces[i]);
    applyMove(solver, cells[i]);
  }
}

test("default rules include 2x2 squares", () => {
  solver.set_rules(1);
  assert.equal(solver.rules_squares(), 1);
  playTopLeftSquare();
  assert.equal(solver.is_won(), 1);
});

test("lines-only rules ignore 2x2 squares", () => {
  solver.set_rules(0);
  assert.equal(solver.rules_squares(), 0);
  playTopLeftSquare();
  assert.equal(solver.is_won(), 0);
  assert.equal(solver.is_done(), 0);
});

test("a completed row wins under both rule sets", () => {
  for (const squares of [1, 0]) {
    solver.set_rules(squares);
    for (const [piece, cell] of [[1, 0], [5, 1], [9, 2], [13, 3]]) {
      applyMove(solver, piece);
      applyMove(solver, cell);
    }
    assert.equal(solver.is_won(), 1, `squares=${squares}`);
  }
});

test("each rule set has its own opening book covering the empty board", () => {
  for (const squares of [1, 0]) {
    solver.set_rules(squares);
    assert.ok(solver.book_entries() > 40000, `squares=${squares} book entries ${solver.book_entries()}`);
    assert.equal(solver.book_depth(), 4, `squares=${squares}`);
    assert.equal(solver.evaluate(), 0, `empty board is a draw with squares=${squares}`);
    assert.ok(solver.node_count() < 100, `squares=${squares} empty board should be a book hit`);
  }
});

test("set_rules restarts the game", () => {
  solver.set_rules(1);
  applyMove(solver, 3);
  solver.set_rules(1);
  assert.equal(solver.moves_left(), 16);
  assert.equal(solver.current_piece(), 16);
});
