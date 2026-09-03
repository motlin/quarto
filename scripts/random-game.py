#!/usr/bin/env python3
"""Print a random legal Quarto move sequence (piece, cell, piece, cell, ...) for a seed.

The generator is the linear congruential sequence the prototype's
`test/random-game.mjs` used, so a seed names the same game everywhere:
`state = seed * 2654435761 + 12345`, then
`state = (state * 1664525 + 1013904223) mod 2^32` per draw, taking
`state mod remaining` to pick the next unused piece, then the next free cell.

Usage: random-game.py <seed>
"""

import sys

MODULUS = 1 << 32


def piece_to_string(piece: int) -> str:
    first = "b" if piece & 1 else "a"
    second = "x" if piece & 2 else "o"
    if piece & 4:
        first = first.upper()
    if piece & 8:
        second = second.upper()
    return first + second


def cell_to_string(cell: int) -> str:
    return chr(ord("a") + cell % 4) + chr(ord("1") + cell // 4)


def random_game(seed: int) -> list[str]:
    state = (seed * 2654435761 + 12345) % MODULUS

    def next_random(limit: int) -> int:
        nonlocal state
        state = (state * 1664525 + 1013904223) % MODULUS
        return state % limit

    pieces = list(range(16))
    cells = list(range(16))
    tokens = []
    while pieces:
        piece = pieces.pop(next_random(len(pieces)))
        cell = cells.pop(next_random(len(cells)))
        tokens.append(piece_to_string(piece))
        tokens.append(cell_to_string(cell))
    return tokens


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].lstrip("-").isdigit():
        sys.exit("usage: random-game.py <seed>")
    print("\n".join(random_game(int(sys.argv[1]))))


if __name__ == "__main__":
    main()
