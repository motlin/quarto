#!/usr/bin/env bash
# Prints one hash over everything `just solver::wasm` reads and writes: the crate
# sources, the toolchain versions, the smoke test and its fixtures, and the built
# package. The recipe records it after a passing run and skips the next run while
# it still matches.
set -euo pipefail
cd "$(dirname "$0")/.."

{
	(cd solver && rustc --version && cargo --version && wasm-pack --version && node --version)
	find solver/src solver/Cargo.toml solver/Cargo.lock solver/tests/fixtures/games_reg/1.txt \
		scripts/wasm-smoke.mjs web/src/solver/books web/src/solver/pkg -type f -print0 |
		sort -z |
		xargs -0 shasum -a 256
} | shasum -a 256 | cut -d ' ' -f 1
