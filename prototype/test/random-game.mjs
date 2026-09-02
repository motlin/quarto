// 🎲 Prints a random legal Quarto move sequence (piece, cell, piece, cell, ...) for a seed.
import { pieceToString, cellToString } from "./parse-fixture.mjs";

const seed = Number(process.argv[2]);
if (!Number.isInteger(seed)) throw new Error("usage: random-game.mjs <seed>");

let stateValue = seed * 2654435761 + 12345;
function nextRandom(limit) {
  stateValue = (Math.imul(stateValue, 1664525) + 1013904223) >>> 0;
  return stateValue % limit;
}

const pieces = [...Array(16).keys()];
const cells = [...Array(16).keys()];
const tokens = [];
while (pieces.length > 0) {
  const piece = pieces.splice(nextRandom(pieces.length), 1)[0];
  const cell = cells.splice(nextRandom(cells.length), 1)[0];
  tokens.push(pieceToString(piece), cellToString(cell));
}
console.log(tokens.join("\n"));
