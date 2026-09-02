// ✅ Regression: solver.wasm must reproduce every evaluation in upstream games_reg/*.txt
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parseFixture, pieceFromString, cellFromString, pieceToString, cellToString } from "./parse-fixture.mjs";
import { loadSolver, evaluationToString, legalMoves, applyMove } from "./solver.mjs";

const fixturesDirectory = new URL("../../.llm/upstream/games_reg/", import.meta.url);
const fixtureNames = (await readdir(fixturesDirectory)).filter((name) => name.endsWith(".txt")).sort();
const solver = await loadSolver();

for (const name of fixtureNames) {
  test(`games_reg/${name}`, async () => {
    const { plies, result } = parseFixture(await readFile(new URL(name, fixturesDirectory), "utf8"));
    solver.reset();
    for (const [index, ply] of plies.entries()) {
      const movesLeft = solver.moves_left();
      const context = `${name} ply ${index} (${ply.phase})`;
      assert.equal(Boolean(solver.is_to_place()), ply.phase === "place", context);
      assert.equal(evaluationToString(movesLeft, solver.evaluate()), ply.evaluation, `${context} root`);
      const expectedMoves = new Map();
      for (const move of legalMoves(solver)) {
        const token = ply.phase === "place" ? cellToString(move) : pieceToString(move);
        const value = ply.phase === "place" ? solver.evaluate_place(move) : solver.evaluate_select(move);
        expectedMoves.set(token, evaluationToString(movesLeft, value));
      }
      assert.deepEqual(expectedMoves, ply.moves, `${context} moves`);
      applyMove(solver, ply.phase === "place" ? cellFromString(ply.chosen) : pieceFromString(ply.chosen));
    }
    assert.equal(solver.is_won() ? "Win" : solver.is_done() ? "Draw" : "ongoing", result, `${name} result`);
  });
}
