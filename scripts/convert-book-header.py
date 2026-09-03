#!/usr/bin/env python3
"""Convert the prototype's C opening-book headers into the solver's binary book files.

Each header line of the form `{ 0x000000000000000full, 0x0001, 0 },` becomes an
11-byte little-endian record `[key_low u64][cells_taken u16][value i8]`, written in
(popcount(cells_taken), cells_taken, key_low) order so a reader can find the book
depth from the last record.

Usage: convert-book-header.py <input.h> <output.bin> [<input.h> <output.bin> ...]
"""

import re
import struct
import sys
from pathlib import Path

ENTRY = re.compile(
    r"^\s*\{\s*0x([0-9a-fA-F]+)ull\s*,\s*0x([0-9a-fA-F]+)\s*,\s*(-?\d+)\s*\}\s*,?\s*$"
)
RECORD = struct.Struct("<QHb")


def parse_header(path: Path) -> list[tuple[int, int, int]]:
    entries = []
    with path.open(encoding="utf-8") as header:
        for line in header:
            match = ENTRY.match(line)
            if match:
                key_low = int(match.group(1), 16)
                cells_taken = int(match.group(2), 16)
                value = int(match.group(3))
                entries.append((key_low, cells_taken, value))
    return entries


def sort_key(entry: tuple[int, int, int]) -> tuple[int, int, int]:
    key_low, cells_taken, _ = entry
    return (cells_taken.bit_count(), cells_taken, key_low)


def convert(source: Path, target: Path) -> int:
    entries = sorted(parse_header(source), key=sort_key)
    if not entries:
        raise SystemExit(f"{source}: no book entries found")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as out:
        for key_low, cells_taken, value in entries:
            out.write(RECORD.pack(key_low, cells_taken, value))
    return len(entries)


def main(argv: list[str]) -> int:
    if len(argv) < 3 or len(argv) % 2 == 0:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    for source, target in zip(argv[1::2], argv[2::2]):
        count = convert(Path(source), Path(target))
        print(f"{target}: {count} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
