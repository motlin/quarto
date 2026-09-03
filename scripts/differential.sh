#!/usr/bin/env bash
# Differential test: the Rust play binary against the upstream C++ reference on random games.
# Usage: scripts/differential.sh [games] [skip_plies] [lines|squares]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
games="${1:-20}"
skip="${2:-8}"
rules="${3:-squares}"
work="$root/.llm/differential-$rules"
reference="$root/reference/quarto_reference"
play="$root/solver/target/release/play"

mkdir -p "$work"

if [ ! -x "$reference" ] || [ "$root/reference/reference.cpp" -nt "$reference" ]; then
	echo "building $reference"
	g++ -std=c++20 -O3 -o "$reference" "$root/reference/reference.cpp"
fi

cargo build --release --manifest-path "$root/solver/Cargo.toml" --bin play

for seed in $(seq 1 "$games"); do
	moves="$work/moves-$seed.txt"
	python3 "$root/scripts/random-game.py" "$seed" > "$moves"
	"$reference" "$skip" "$rules" < "$moves" > "$work/reference-$seed.txt"
	"$play" "$skip" "$rules" < "$moves" > "$work/play-$seed.txt" 2> /dev/null
	if ! diff -q "$work/reference-$seed.txt" "$work/play-$seed.txt" > /dev/null; then
		echo "MISMATCH seed=$seed"
		diff "$work/reference-$seed.txt" "$work/play-$seed.txt" | head -20
		exit 1
	fi
	echo "seed=$seed ok ($(grep -c '^Eval:' "$work/play-$seed.txt") evaluated plies)"
done
echo "all $games games match"
