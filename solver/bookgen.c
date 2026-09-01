// 📖 Opening book generator: enumerates canonical select-phase positions to a depth,
// evaluates each exactly, and emits solver/book_data.h.
// Usage: bookgen <depth> [--count-only]
#include "quarto.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SEEN_BITS 24
#define SEEN_SIZE (1u << SEEN_BITS)

typedef struct
{
    uint64_t keyLow;
    uint64_t keyHigh;
    int used;
} SeenSlot;

typedef struct
{
    uint64_t keyLow;
    uint64_t keyHigh;
    int movesDone;
    int value;
    uint8_t path[2 * 16];
} BookEntry;

static SeenSlot* seen;
static BookEntry* entries;
static size_t entryCount;
static size_t entryCapacity;
static size_t countByDepth[17];
static uint8_t currentPath[2 * 16];

static int markSeen(uint64_t keyLow, uint64_t keyHigh)
{
    uint64_t hash = (keyLow ^ (keyHigh * 0x9E3779B97F4A7C15ull)) * 0xC2B2AE3D27D4EB4Full;
    size_t index = (size_t) (hash >> (64 - SEEN_BITS));
    while (seen[index].used)
    {
        if (seen[index].keyLow == keyLow && seen[index].keyHigh == keyHigh) return 0;
        index = (index + 1) & (SEEN_SIZE - 1);
    }
    seen[index].used = 1;
    seen[index].keyLow = keyLow;
    seen[index].keyHigh = keyHigh;
    return 1;
}

static void addEntry(uint64_t keyLow, uint64_t keyHigh, int movesDone)
{
    if (entryCount == entryCapacity)
    {
        entryCapacity = entryCapacity ? entryCapacity * 2 : 1024;
        entries = realloc(entries, entryCapacity * sizeof(BookEntry));
        if (!entries) { fprintf(stderr, "out of memory\n"); exit(1); }
    }
    BookEntry entry = { keyLow, keyHigh, movesDone, 0, { 0 } };
    memcpy(entry.path, currentPath, 2 * movesDone);
    entries[entryCount++] = entry;
    ++countByDepth[movesDone];
}

// Visits select-phase positions (after a placement) in DFS order, deduplicated by canonical key.
// Depth counts placements. Records the move path that reaches each position.
static void enumerate(int maxDepth)
{
    int movesDone = 16 - moves_left();
    if (is_won() || is_done()) return;

    uint64_t keyLow = key_low();
    uint64_t keyHigh = key_high();
    if (!markSeen(keyLow, keyHigh)) return;
    addEntry(keyLow, keyHigh, movesDone);

    if (movesDone == maxDepth) return;

    for (int piece = 0; piece < 16; ++piece)
    {
        if (!apply_select(piece)) continue;
        currentPath[2 * movesDone] = piece;
        for (int cell = 0; cell < 16; ++cell)
        {
            if (!apply_place(cell)) continue;
            currentPath[2 * movesDone + 1] = cell;
            enumerate(maxDepth);
            undo();
        }
        undo();
    }
}

static void replay(const BookEntry* entry)
{
    reset();
    for (int i = 0; i < entry->movesDone; ++i)
    {
        if (!apply_select(entry->path[2 * i])) { fprintf(stderr, "bad path\n"); exit(1); }
        if (!apply_place(entry->path[2 * i + 1])) { fprintf(stderr, "bad path\n"); exit(1); }
    }
}

int main(int argc, char** argv)
{
    if (argc < 2) { fprintf(stderr, "usage: bookgen <depth> [--count-only | --shard <index>/<count>]\n"); return 1; }
    int maxDepth = atoi(argv[1]);
    int countOnly = argc > 2 && strcmp(argv[2], "--count-only") == 0;
    int shardIndex = 0;
    int shardCount = 1;
    if (argc > 3 && strcmp(argv[2], "--shard") == 0)
    {
        if (sscanf(argv[3], "%d/%d", &shardIndex, &shardCount) != 2 || shardIndex < 0 || shardIndex >= shardCount)
        {
            fprintf(stderr, "bad shard spec %s\n", argv[3]);
            return 1;
        }
    }

    seen = calloc(SEEN_SIZE, sizeof(SeenSlot));
    if (!seen) { fprintf(stderr, "out of memory\n"); return 1; }

    init();
    enumerate(maxDepth);

    if (countOnly)
    {
        for (int depth = 0; depth <= maxDepth; ++depth) fprintf(stderr, "depth %d: %zu positions\n", depth, countByDepth[depth]);
        fprintf(stderr, "total: %zu\n", entryCount);
        return 0;
    }

    // Contiguous chunks keep DFS-adjacent positions (which share subtrees) in one process
    size_t first = entryCount * shardIndex / shardCount;
    size_t last = entryCount * (shardIndex + 1) / shardCount;

    // Output lines: <keyLow hex> <cellsTaken hex> <value> — merged by solver/bookgen.sh
    for (size_t i = first; i < last; ++i)
    {
        replay(&entries[i]);
        int value = evaluate();
        printf("%016llx %04llx %d\n", (unsigned long long) entries[i].keyLow, (unsigned long long) entries[i].keyHigh, value);
        if ((i - first) % 500 == 0) fprintf(stderr, "shard %d/%d: %zu of %zu\n", shardIndex, shardCount, i - first, last - first);
    }

    fprintf(stderr, "shard %d/%d done: %zu positions, nodes: %lld\n", shardIndex, shardCount, last - first, (long long) node_count());
    return 0;
}
