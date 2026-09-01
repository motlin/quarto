#!/usr/bin/env bash
# 🔨 Builds the native driver and the freestanding WebAssembly module.
set -euo pipefail
cd "$(dirname "$0")"

TT_SIZE="${TT_SIZE:-4194301}"

clang -std=c11 -O2 -Wall -Wextra -DTT_SIZE="$TT_SIZE" -o quarto_native quarto.c main.c
clang -std=c11 -O2 -Wall -Wextra -DTT_SIZE=16782823 -DBOOK_EMPTY -o bookgen quarto.c bookgen.c

zig cc --target=wasm32-freestanding -std=c11 -O2 -Wall -Wextra -DTT_SIZE="$TT_SIZE" -nostdlib \
  -Wl,--no-entry -Wl,--export-dynamic \
  -o ../web/solver.wasm quarto.c

ls -la quarto_native bookgen ../web/solver.wasm
