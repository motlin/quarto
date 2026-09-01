#!/usr/bin/env bash
# 🔬 Differential test: native C port vs upstream C++ reference on random games.
# Usage: test/differential.sh [games] [skipPlies]
set -euo pipefail
cd "$(dirname "$0")/.."

games="${1:-20}"
skip="${2:-10}"
mkdir -p .llm/differential

for seed in $(seq 1 "$games"); do
  moves=".llm/differential/moves-$seed.txt"
  node test/random-game.mjs "$seed" > "$moves"
  ./reference/quarto_reference "$skip" < "$moves" > ".llm/differential/reference-$seed.txt"
  ./solver/quarto_native "$skip" < "$moves" > ".llm/differential/native-$seed.txt" 2>/dev/null
  if ! diff -q ".llm/differential/reference-$seed.txt" ".llm/differential/native-$seed.txt" > /dev/null; then
    echo "MISMATCH seed=$seed"
    diff ".llm/differential/reference-$seed.txt" ".llm/differential/native-$seed.txt" | head -20
    exit 1
  fi
  echo "seed=$seed ok ($(grep -c '^Eval:' ".llm/differential/native-$seed.txt") evaluated plies)"
done
echo "all $games games match"
