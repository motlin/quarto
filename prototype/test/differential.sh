#!/usr/bin/env bash
# 🔬 Differential test: native C port vs upstream C++ reference on random games.
# Usage: test/differential.sh [games] [skipPlies] [lines|squares]
set -euo pipefail
cd "$(dirname "$0")/.."

games="${1:-20}"
skip="${2:-10}"
rules="${3:-squares}"
work="../.llm/differential-$rules"
mkdir -p "$work"

for seed in $(seq 1 "$games"); do
  moves="$work/moves-$seed.txt"
  node test/random-game.mjs "$seed" > "$moves"
  ../reference/quarto_reference "$skip" "$rules" < "$moves" > "$work/reference-$seed.txt"
  ./solver/quarto_native "$skip" "$rules" < "$moves" > "$work/native-$seed.txt" 2>/dev/null
  if ! diff -q "$work/reference-$seed.txt" "$work/native-$seed.txt" > /dev/null; then
    echo "MISMATCH seed=$seed"
    diff "$work/reference-$seed.txt" "$work/native-$seed.txt" | head -20
    exit 1
  fi
  echo "seed=$seed ok ($(grep -c '^Eval:' "$work/native-$seed.txt") evaluated plies)"
done
echo "all $games games match"
