// 📜 Parses upstream `games_reg/*.txt` play() transcripts into structured plies.
import assert from "node:assert/strict";

export function pieceFromString(text) {
  assert.equal(text.length, 2, `piece token ${text}`);
  const first = text[0];
  const second = text[1];
  assert.match(first, /^[abAB]$/, `piece token ${text}`);
  assert.match(second, /^[oxOX]$/, `piece token ${text}`);
  let piece = 0;
  if (first.toLowerCase() === "b") piece |= 1;
  if (second.toLowerCase() === "x") piece |= 2;
  if (first === first.toUpperCase()) piece |= 4;
  if (second === second.toUpperCase()) piece |= 8;
  return piece;
}

export function pieceToString(piece) {
  let first = piece & 1 ? "b" : "a";
  let second = piece & 2 ? "x" : "o";
  if (piece & 4) first = first.toUpperCase();
  if (piece & 8) second = second.toUpperCase();
  return first + second;
}

export function cellFromString(text) {
  assert.match(text, /^[a-d][1-4]$/, `cell token ${text}`);
  const column = text.charCodeAt(0) - "a".charCodeAt(0);
  const row = text.charCodeAt(1) - "1".charCodeAt(0);
  return row * 4 + column;
}

export function cellToString(cell) {
  return String.fromCharCode("a".charCodeAt(0) + (cell % 4)) + String.fromCharCode("1".charCodeAt(0) + Math.floor(cell / 4));
}

// Returns [{ phase: "select"|"place", evaluation, moves: Map<token, evaluation>, chosen }]
// Plus `result`: "Win" | "Draw" for the terminal position.
export function parseFixture(text) {
  const blocks = text.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
  const plies = [];
  let result = null;
  let current = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0];
    const body = lines.slice(1);
    if (header === "Eval:") {
      assert.equal(body.length, 1, block);
      current = { evaluation: body[0], moves: new Map() };
      continue;
    }
    if (header === "Moves:") {
      assert.ok(current, "Moves before Eval");
      for (const line of body) {
        const [tokens, evaluation] = line.split(" : ");
        for (const token of tokens.trim().split(" ")) current.moves.set(token, evaluation);
      }
      continue;
    }
    if (header === "Piece:" || header === "Cell:") {
      assert.ok(current, `${header} before Eval`);
      assert.equal(body.length, 1, block);
      current.phase = header === "Piece:" ? "select" : "place";
      current.chosen = body[0];
      plies.push(current);
      current = null;
      continue;
    }
    if (header === "Win" || header === "Draw") {
      result = header;
      continue;
    }
    if (block.startsWith("Draw\n") || block.startsWith("Win\n")) {
      // Older transcript layout glued the result to the following block.
      result = lines[0];
      continue;
    }
  }
  assert.ok(result, "fixture has no terminal result");
  return { plies, result };
}
