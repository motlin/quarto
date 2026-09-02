// 🧠 Thin loader for solver.wasm used by tests and tooling.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function loadSolver(wasmPath = new URL("../web/solver.wasm", import.meta.url)) {
  const bytes = await readFile(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports;
  exports.init();
  return exports;
}

export function evaluationToString(movesLeft, value) {
  if (value === 0) return "Draw";
  const distance = movesLeft + 1 - Math.abs(value);
  return `${value > 0 ? "Win" : "Loss"} in ${distance}`;
}

export function legalMoves(solver) {
  const moves = [];
  if (solver.is_to_place()) {
    const cellsTaken = solver.cells_taken();
    for (let cell = 0; cell < 16; cell++) if (!((cellsTaken >> cell) & 1)) moves.push(cell);
  } else {
    const piecesTaken = solver.pieces_taken();
    for (let piece = 0; piece < 16; piece++) if (!((piecesTaken >> piece) & 1)) moves.push(piece);
  }
  return moves;
}

export function applyMove(solver, move) {
  const ok = solver.is_to_place() ? solver.apply_place(move) : solver.apply_select(move);
  assert.equal(ok, 1, `illegal move ${move}`);
}
