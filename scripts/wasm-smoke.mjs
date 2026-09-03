// 🧪 Smoke test for the wasm-pack output: loads web/src/solver/pkg without the web
// app and replays upstream fixture games_reg/1.txt, asserting every evaluation.
//
// Run with `just solver::wasm` or directly: `node scripts/wasm-smoke.mjs`.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const packageDirectory = new URL("../web/src/solver/pkg/", import.meta.url);
const fixturePath = new URL("../solver/tests/fixtures/games_reg/1.txt", import.meta.url);

// Pieces, cells and placements all number 16, and 16 doubles as the sentinel for
// an empty hand or cell.
const NUM_MOVES = 16;
const NO_PIECE = 16;

const {default: init, WasmSolver, version} = await import(new URL("quarto_solver.js", packageDirectory));
await init({module_or_path: await readFile(new URL("quarto_solver_bg.wasm", packageDirectory))});

// 📜 Transcript notation, ported from prototype/test/parse-fixture.mjs.

function pieceFromString(text) {
	assert.equal(text.length, 2, `piece token ${text}`);
	const [first, second] = text;
	assert.match(first, /^[abAB]$/, `piece token ${text}`);
	assert.match(second, /^[oxOX]$/, `piece token ${text}`);
	let piece = 0;
	if (first.toLowerCase() === "b") piece |= 1;
	if (second.toLowerCase() === "x") piece |= 2;
	if (first === first.toUpperCase()) piece |= 4;
	if (second === second.toUpperCase()) piece |= 8;
	return piece;
}

function pieceToString(piece) {
	let first = piece & 1 ? "b" : "a";
	let second = piece & 2 ? "x" : "o";
	if (piece & 4) first = first.toUpperCase();
	if (piece & 8) second = second.toUpperCase();
	return first + second;
}

function cellFromString(text) {
	assert.match(text, /^[a-d][1-4]$/, `cell token ${text}`);
	const column = text.charCodeAt(0) - "a".charCodeAt(0);
	const row = text.charCodeAt(1) - "1".charCodeAt(0);
	return row * 4 + column;
}

function cellToString(cell) {
	return (
		String.fromCharCode("a".charCodeAt(0) + (cell % 4)) +
		String.fromCharCode("1".charCodeAt(0) + Math.floor(cell / 4))
	);
}

function evaluationToString(movesLeft, value) {
	if (value === 0) return "Draw";
	const distance = movesLeft + 1 - Math.abs(value);
	return `${value > 0 ? "Win" : "Loss"} in ${distance}`;
}

// Returns { plies: [{ phase: "select"|"place", evaluation, moves: Map<token, evaluation>, chosen }], result: "Win"|"Draw" }
function parseFixture(text) {
	const blocks = text
		.split(/\n\n+/)
		.map((block) => block.trim())
		.filter(Boolean);
	const plies = [];
	let result = null;
	let current = null;
	for (const block of blocks) {
		const [header, ...body] = block.split("\n");
		if (header === "Eval:") {
			assert.equal(body.length, 1, block);
			current = {evaluation: body[0], moves: new Map()};
		} else if (header === "Moves:") {
			assert.ok(current, "Moves before Eval");
			for (const line of body) {
				const [tokens, evaluation] = line.split(" : ");
				for (const token of tokens.trim().split(" ")) current.moves.set(token, evaluation);
			}
		} else if (header === "Piece:" || header === "Cell:") {
			assert.ok(current, `${header} before Eval`);
			assert.equal(body.length, 1, block);
			current.phase = header === "Piece:" ? "select" : "place";
			current.chosen = body[0];
			plies.push(current);
			current = null;
		} else if (header === "Win" || header === "Draw") {
			result = header;
		}
	}
	assert.ok(result, "fixture has no terminal result");
	return {plies, result};
}

function legalMoves(solver) {
	const taken = solver.isToPlace() ? solver.cellsTaken() : solver.piecesTaken();
	const moves = [];
	for (let move = 0; move < NUM_MOVES; move++) if (!((taken >> move) & 1)) moves.push(move);
	return moves;
}

function outcome(solver) {
	if (solver.isWon()) return "Win";
	if (solver.isDone()) return "Draw";
	return "ongoing";
}

// 🎮 Replay the fixture and compare every root and move evaluation.

const solver = new WasmSolver(true);
assert.equal(solver.rulesSquares(), true);
assert.ok(solver.bookEntries() > 40_000, `book entries ${solver.bookEntries()}`);
assert.equal(solver.bookDepth(), 4);
assert.equal(solver.movesLeft(), NUM_MOVES);
assert.ok(solver.bestMove() >= 0, "a move is available at the empty board");

const {plies, result} = parseFixture(await readFile(fixturePath, "utf8"));
solver.reset();
for (const [index, ply] of plies.entries()) {
	const movesLeft = solver.movesLeft();
	const context = `ply ${index} (${ply.phase})`;
	const isPlace = ply.phase === "place";
	assert.equal(solver.isToPlace(), isPlace, context);
	assert.equal(evaluationToString(movesLeft, solver.evaluate()), ply.evaluation, `${context} root`);
	const actualMoves = new Map();
	for (const move of legalMoves(solver)) {
		const token = isPlace ? cellToString(move) : pieceToString(move);
		const value = isPlace ? solver.evaluatePlace(move) : solver.evaluateSelect(move);
		actualMoves.set(token, evaluationToString(movesLeft, value));
	}
	assert.deepEqual(actualMoves, ply.moves, `${context} moves`);
	const applied = isPlace
		? solver.applyPlace(cellFromString(ply.chosen))
		: solver.applySelect(pieceFromString(ply.chosen));
	assert.equal(applied, true, `${context} apply ${ply.chosen}`);
}
assert.equal(outcome(solver), result, "result");
assert.equal(solver.bestMove(), -1, "no best move once the game is over");
assert.ok(solver.nodeCount() > 0, "search visited nodes");

// ↩️ Undo back to the start, then confirm rule switching and seeding are wired up.
let undone = 0;
while (solver.undo()) undone += 1;
assert.equal(undone, plies.length);
assert.equal(solver.movesLeft(), NUM_MOVES);
assert.equal(solver.currentPiece(), NO_PIECE, "no piece in hand");
assert.equal(solver.pieceAt(0), NO_PIECE, "empty cell");

solver.setRules(false);
assert.equal(solver.rulesSquares(), false);
assert.ok(solver.bookEntries() > 40_000);
solver.setSeed(7);
assert.ok(solver.applySelect(0));
assert.ok(solver.applyPlace(0));
assert.equal(solver.pieceAt(0), 0);
assert.equal(solver.evaluate(), 0);

console.log(`wasm smoke test passed: solver ${version()}, fixture games_reg/1.txt (${plies.length} plies, ${result})`);
