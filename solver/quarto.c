// 🎯 Quarto perfect-play solver. Freestanding C port of indjev99/Quarto-Solver
// (standard board: rows, columns, diagonals, 2x2 squares). No libc.
#include "quarto.h"

typedef struct __attribute__((packed))
{
    uint64_t keyLow;
    uint16_t cellsTaken;
    int8_t value;
} BookEntry;

#ifdef BOOK_EMPTY
#define BOOK_DEPTH 0
#define BOOK_ENTRIES 0
static const BookEntry bookData[1] = { { 0, 0, 0 } };
#else
#include "book_data.h"
#endif

#ifdef __wasm__
#define EXPORT(name) __attribute__((export_name(name)))
#else
#define EXPORT(name)
#endif

#define NUM_VARS 2
#define NUM_PROPS 4
#define NUM_PIECES 16
#define NO_PIECE 16
#define NUM_ROWS 4
#define NUM_COLS 4
#define NUM_CELLS 16
#define NUM_MOVES 16
#define WIN_LEN 4
#define WIN_SQ_SIDE 2
#define NUM_ROTS 8
#define NUM_CELL_MASKS 65536
#define MAX_WIN_MASKS 19
#define NUM_LOSE_MASKS 256
#define KEY_BITS 56
#define KEY_BITS_MASK ((1ull << KEY_BITS) - 1)
#define TT_DIV 5
#define NUM_TTS ((NUM_MOVES - 2) / TT_DIV + 1)
#ifndef TT_SIZE
#define TT_SIZE 4194301
#endif
_Static_assert(TT_SIZE < (1ull << 32), "TT_SIZE must fit in 32 bits");
#define INF 32767

typedef unsigned __int128 uint128_t;

#define FOR_PROPS(i) for (uint16_t i = 0; i < NUM_PROPS; ++i)
#define FOR_PROPS_VARS(i, j) for (uint16_t i = 0; i < NUM_PROPS; ++i) for (uint16_t j = 0; j < NUM_VARS; ++j)
#define FOR_PIECES(i) for (uint16_t i = 0; i < NUM_PIECES; ++i)
#define FOR_CELLS(i) for (uint16_t i = 0; i < NUM_CELLS; ++i)
#define FOR_WIN_LEN(i) for (uint16_t i = 0; i < WIN_LEN; ++i)

static uint16_t winMasks[MAX_WIN_MASKS];
static uint16_t numWinMasks;
static uint16_t cellWinMasks[NUM_CELLS][MAX_WIN_MASKS];
static uint16_t numCellWinMasks[NUM_CELLS];
static uint16_t rotMasks[NUM_ROTS][NUM_CELL_MASKS];
static uint16_t losePropVarCells[NUM_CELL_MASKS];
static uint16_t notLosingSelects[NUM_LOSE_MASKS][NUM_PIECES];
static uint16_t numNotLosingSelects[NUM_LOSE_MASKS];

typedef struct
{
    uint64_t key : KEY_BITS;
    int64_t val : 6;
    uint64_t isAlpha : 1;
    uint64_t isBeta : 1;
} Entry;

_Static_assert(sizeof(Entry) == 8, "Entry must pack to 8 bytes");

static Entry transTables[NUM_TTS][TT_SIZE];

typedef struct
{
    uint16_t movesLeft;
    uint16_t currPiece;
    uint16_t piecesTaken;
    uint16_t cellsTaken;
    uint16_t cellsProps[NUM_PROPS][NUM_VARS];
} State;

static State state;
static uint16_t history[2 * NUM_MOVES];
static uint16_t historyLength;
static uint64_t totalEvalStates;

static uint16_t rowColToCell(uint16_t row, uint16_t col) { return row * NUM_COLS + col; }
static uint16_t cellToRow(uint16_t cell) { return cell / NUM_ROWS; }
static uint16_t cellToCol(uint16_t cell) { return cell % NUM_COLS; }
static uint16_t getBit(uint16_t val, uint16_t n) { return (val >> n) & 1; }
static void setBit(uint16_t* val, uint16_t n) { *val |= 1 << n; }
static void clearBit(uint16_t* val, uint16_t n) { *val &= ~(1 << n); }
static uint16_t min16(uint16_t a, uint16_t b) { return a < b ? a : b; }
static int16_t max16s(int16_t a, int16_t b) { return a > b ? a : b; }

static void addWinMask(uint16_t winMask)
{
    winMasks[numWinMasks++] = winMask;
}

static void computeRegWinMasks(void)
{
    numWinMasks = 0;

    FOR_CELLS(i)
    {
        uint16_t row = cellToRow(i);
        uint16_t col = cellToCol(i);

        if (col + WIN_LEN <= NUM_COLS)
        {
            uint16_t winMask = 0;
            FOR_WIN_LEN(j) setBit(&winMask, rowColToCell(row, col + j));
            addWinMask(winMask);
        }

        if (row + WIN_LEN <= NUM_ROWS)
        {
            uint16_t winMask = 0;
            FOR_WIN_LEN(j) setBit(&winMask, rowColToCell(row + j, col));
            addWinMask(winMask);
        }

        if (row + WIN_LEN <= NUM_ROWS && col + WIN_LEN <= NUM_COLS)
        {
            uint16_t winMask = 0;
            FOR_WIN_LEN(j) setBit(&winMask, rowColToCell(row + j, col + j));
            addWinMask(winMask);
        }

        if (row + WIN_LEN <= NUM_ROWS && col >= WIN_LEN - 1)
        {
            uint16_t winMask = 0;
            FOR_WIN_LEN(j) setBit(&winMask, rowColToCell(row + j, col - j));
            addWinMask(winMask);
        }

        if (row + WIN_SQ_SIDE <= NUM_ROWS && col + WIN_SQ_SIDE <= NUM_COLS)
        {
            uint16_t winMask = 0;
            FOR_WIN_LEN(j) setBit(&winMask, rowColToCell(row + j / WIN_SQ_SIDE, col + j % WIN_SQ_SIDE));
            addWinMask(winMask);
        }
    }
}

static void computeCellWinMasks(void)
{
    FOR_CELLS(i)
    {
        numCellWinMasks[i] = 0;
        for (uint16_t w = 0; w < numWinMasks; ++w)
        {
            if (getBit(winMasks[w], i)) cellWinMasks[i][numCellWinMasks[i]++] = winMasks[w];
        }
    }
}

static void computeRotMasks(void)
{
    for (uint16_t rot = 0; rot < NUM_ROTS; ++rot)
    {
        for (uint32_t mask = 0; mask < NUM_CELL_MASKS; ++mask)
        {
            if (rot == 0)
            {
                rotMasks[rot][mask] = mask;
                continue;
            }

            uint16_t prev = rotMasks[rot != NUM_ROTS / 2 ? rot - 1 : 0][mask];
            uint16_t next = 0;

            FOR_CELLS(i)
            {
                uint16_t row = cellToRow(i);
                uint16_t col = cellToCol(i);
                uint16_t row2 = rot != NUM_ROTS / 2 ? NUM_COLS - col - 1 : NUM_COLS - row - 1;
                uint16_t col2 = rot != NUM_ROTS / 2 ? row : col;
                uint16_t i2 = rowColToCell(row2, col2);
                if (getBit(prev, i)) setBit(&next, i2);
            }

            rotMasks[rot][mask] = next;
        }
    }
}

static void computeLosePropVarCells(void)
{
    for (uint32_t propVarMask = 0; propVarMask < NUM_CELL_MASKS; ++propVarMask)
    {
        losePropVarCells[propVarMask] = 0;

        FOR_CELLS(i)
        {
            if (getBit(propVarMask, i)) continue;

            for (uint16_t w = 0; w < numCellWinMasks[i]; ++w)
            {
                uint16_t winMask = cellWinMasks[i][w];
                clearBit(&winMask, i);

                if ((propVarMask & winMask) == winMask)
                {
                    setBit(&losePropVarCells[propVarMask], i);
                    break;
                }
            }
        }
    }
}

static void computeNotLosingSelects(void)
{
    for (uint16_t loseMask = 0; loseMask < NUM_LOSE_MASKS; ++loseMask)
    {
        numNotLosingSelects[loseMask] = 0;

        FOR_PIECES(i)
        {
            int bad = 0;

            FOR_PROPS_VARS(j, k)
            {
                if (getBit(loseMask, j * NUM_VARS + k) && getBit(i, j) == k)
                {
                    bad = 1;
                    break;
                }
            }

            if (!bad) notLosingSelects[loseMask][numNotLosingSelects[loseMask]++] = i;
        }
    }
}

static void stateReset(State* s)
{
    s->movesLeft = NUM_MOVES;
    s->currPiece = NO_PIECE;
    s->piecesTaken = 0;
    s->cellsTaken = 0;
    FOR_PROPS_VARS(i, j) s->cellsProps[i][j] = 0;
}

static int isToPlace(const State* s) { return s->currPiece != NO_PIECE; }
static int isPieceFree(const State* s, uint16_t piece) { return !getBit(s->piecesTaken, piece); }
static int isCellFree(const State* s, uint16_t cell) { return !getBit(s->cellsTaken, cell); }
static int isDone(const State* s) { return s->movesLeft == 0; }

static void moveSelect(State* s, uint16_t piece)
{
    setBit(&s->piecesTaken, piece);
    s->currPiece = piece;
}

static void undoSelect(State* s)
{
    clearBit(&s->piecesTaken, s->currPiece);
    s->currPiece = NO_PIECE;
}

static void movePlace(State* s, uint16_t cell)
{
    setBit(&s->cellsTaken, cell);
    FOR_PROPS(i) setBit(&s->cellsProps[i][getBit(s->currPiece, i)], cell);
    s->currPiece = NO_PIECE;
    --s->movesLeft;
}

static void undoPlace(State* s, uint16_t piece, uint16_t cell)
{
    clearBit(&s->cellsTaken, cell);
    FOR_PROPS(i) clearBit(&s->cellsProps[i][getBit(piece, i)], cell);
    s->currPiece = piece;
    ++s->movesLeft;
}

static int isWon(const State* s)
{
    for (uint16_t w = 0; w < numWinMasks; ++w)
    {
        uint16_t winMask = winMasks[w];
        FOR_PROPS_VARS(i, j)
        {
            if ((s->cellsProps[i][j] & winMask) == winMask) return 1;
        }
    }
    return 0;
}

static uint16_t getPiece(const State* s, uint16_t cell)
{
    if (!getBit(s->cellsTaken, cell)) return NO_PIECE;

    uint16_t piece = 0;
    FOR_PROPS(i)
    {
        if (getBit(s->cellsProps[i][1], cell)) setBit(&piece, i);
    }
    return piece;
}

static void sortFour(uint16_t* values)
{
    // Sorting network for 4 elements
    #define SWAP_IF_GREATER(a, b) if (values[a] > values[b]) { uint16_t t = values[a]; values[a] = values[b]; values[b] = t; }
    SWAP_IF_GREATER(0, 1)
    SWAP_IF_GREATER(2, 3)
    SWAP_IF_GREATER(0, 2)
    SWAP_IF_GREATER(1, 3)
    SWAP_IF_GREATER(1, 2)
    #undef SWAP_IF_GREATER
}

static uint128_t getKey(const State* s)
{
    uint128_t minKey = (uint128_t) -1;
    uint16_t minCellsTaken = (uint16_t) -1;

    for (uint16_t rot = 0; rot < NUM_ROTS; ++rot)
    {
        minCellsTaken = min16(minCellsTaken, rotMasks[rot][s->cellsTaken]);
    }

    for (uint16_t rot = 0; rot < NUM_ROTS; ++rot)
    {
        if (rotMasks[rot][s->cellsTaken] != minCellsTaken) continue;

        uint16_t otherCellsProps[NUM_PROPS];
        FOR_PROPS(i)
        {
            otherCellsProps[i] = min16(rotMasks[rot][s->cellsProps[i][0]], rotMasks[rot][s->cellsProps[i][1]]);
        }

        sortFour(otherCellsProps);

        uint128_t key = minCellsTaken;
        FOR_PROPS(i) key = (key << 16) | otherCellsProps[i];

        if (key < minKey) minKey = key;
    }

    return minKey;
}

// key % TT_SIZE without 128-bit division (avoids libgcc/compiler-rt __umodti3).
// TT_SIZE < 2^32, so every intermediate product fits in 64 bits.
static uint64_t tableIndex(uint128_t key)
{
    uint64_t low = (uint64_t) key;
    uint64_t high = (uint64_t) (key >> 64);
    uint64_t twoTo64Modulo = ((uint64_t) -1 % TT_SIZE + 1) % TT_SIZE;
    return ((high % TT_SIZE) * twoTo64Modulo + low % TT_SIZE) % TT_SIZE;
}

static void tablePut(Entry* table, uint128_t key, int16_t val, int isAlpha, int isBeta)
{
    uint64_t i = tableIndex(key);
    table[i].key = (uint64_t) key;
    table[i].val = val;
    table[i].isAlpha = isAlpha;
    table[i].isBeta = isBeta;
}

static const Entry* tableGet(const Entry* table, uint128_t key)
{
    uint64_t i = tableIndex(key);
    if (table[i].key != ((uint64_t) key & KEY_BITS_MASK)) return 0;
    return &table[i];
}

static Entry* tableForMovesDone(uint16_t movesDone)
{
    return transTables[movesDone / TT_DIV];
}

static int16_t evalSelect(State* s, int16_t alpha, int16_t beta);

typedef struct
{
    int16_t prior;
    uint16_t cell;
} CellPrior;

static int cellPriorLess(CellPrior a, CellPrior b)
{
    return a.prior < b.prior || (a.prior == b.prior && a.cell < b.cell);
}

static int16_t evalPlace(State* s, int16_t alpha, int16_t beta)
{
    ++totalEvalStates;

    uint16_t piece = s->currPiece;

    CellPrior cellsPriors[NUM_CELLS];
    uint16_t numMoves = 0;

    FOR_CELLS(i)
    {
        if (!isCellFree(s, i)) continue;

        int16_t prior = 0;
        for (uint16_t w = 0; w < numCellWinMasks[i]; ++w)
        {
            uint16_t winMask = cellWinMasks[i][w];
            clearBit(&winMask, i);

            if ((s->cellsTaken & winMask) == winMask)
            {
                FOR_PROPS(j)
                {
                    prior += 2 * ((s->cellsProps[j][!getBit(piece, j)] & winMask) == winMask);
                }
            }
            else
            {
                FOR_PROPS(j)
                {
                    uint16_t leftover = (s->cellsProps[j][getBit(piece, j)] & winMask) ^ winMask;
                    prior -= (leftover & (leftover - 1)) == 0;
                }
            }
        }

        if (s->movesLeft == 2) prior = -prior;

        // Insertion sort keeps (prior, cell) ascending, matching std::sort on pairs
        uint16_t position = numMoves++;
        CellPrior candidate = { prior, i };
        while (position > 0 && cellPriorLess(candidate, cellsPriors[position - 1]))
        {
            cellsPriors[position] = cellsPriors[position - 1];
            --position;
        }
        cellsPriors[position] = candidate;
    }

    int16_t val = -INF;

    for (uint16_t m = 0; m < numMoves; ++m)
    {
        uint16_t i = cellsPriors[m].cell;

        movePlace(s, i);
        int16_t nextVal = evalSelect(s, alpha, beta);
        undoPlace(s, piece, i);

        if (nextVal > val)
        {
            val = nextVal;
            alpha = max16s(alpha, val);
            if (alpha >= beta) break;
        }
    }

    return val;
}

static int16_t evalSelect(State* s, int16_t alpha, int16_t beta)
{
    ++totalEvalStates;

    int16_t oldAlpha = alpha;
    int16_t oldBeta = beta;

    uint16_t loseMask = 0;

    FOR_PROPS_VARS(i, j)
    {
        if (~s->cellsTaken & losePropVarCells[s->cellsProps[i][j]]) setBit(&loseMask, i * NUM_VARS + j);
    }

    const uint16_t* selects = notLosingSelects[loseMask];
    uint16_t numSelects = numNotLosingSelects[loseMask];

    int haveMove = 0;

    for (uint16_t m = 0; m < numSelects; ++m)
    {
        if (isPieceFree(s, selects[m]))
        {
            haveMove = 1;
            break;
        }
    }

    if (!haveMove) return -s->movesLeft;

    if (s->movesLeft == 1) return 0;

    alpha = max16s(alpha, -(s->movesLeft - 2));

    if (alpha >= beta) return alpha;

    uint128_t key = getKey(s);

    uint16_t movesDone = NUM_MOVES - s->movesLeft;

    Entry* currTransTable = tableForMovesDone(movesDone);

    const Entry* entry = tableGet(currTransTable, key);

    if (entry != 0 && entry->isAlpha && entry->val > alpha)
    {
        alpha = entry->val;
        if (alpha >= beta) return alpha;
    }

    if (entry != 0 && entry->isBeta && entry->val < beta)
    {
        beta = entry->val;
        if (alpha >= beta) return beta;
    }

    int16_t val = -INF;

    for (uint16_t m = 0; m < numSelects; ++m)
    {
        uint16_t i = selects[m];
        if (!isPieceFree(s, i)) continue;

        moveSelect(s, i);
        int16_t nextVal = -evalPlace(s, -beta, -alpha);
        undoSelect(s);

        if (nextVal > val)
        {
            val = nextVal;
            alpha = max16s(alpha, val);
            if (alpha >= beta) break;
        }
    }

    tablePut(currTransTable, key, val, val > oldAlpha, val < oldBeta);

    return val;
}

static int checkWinInOne(const State* s)
{
    FOR_CELLS(i)
    {
        if (!isCellFree(s, i)) continue;

        for (uint16_t w = 0; w < numCellWinMasks[i]; ++w)
        {
            uint16_t winMask = cellWinMasks[i][w];
            clearBit(&winMask, i);

            FOR_PROPS(j)
            {
                if ((s->cellsProps[j][getBit(s->currPiece, j)] & winMask) == winMask) return 1;
            }
        }
    }

    return 0;
}

static int16_t eval(State* s)
{
    if (isWon(s)) return s->movesLeft + 1;
    if (isDone(s)) return 0;
    if (isToPlace(s) && checkWinInOne(s)) return s->movesLeft;
    if (isToPlace(s) && s->movesLeft == 1) return 0;

    int16_t min = -(s->movesLeft - (isToPlace(s) ? 1 : 0));
    int16_t max = s->movesLeft - (isToPlace(s) ? 2 : 1);

    return isToPlace(s) ? evalPlace(s, min, max) : evalSelect(s, min, max);
}

// Seeds the transposition tables with exact values for every book position
static void loadBook(void)
{
    for (uint32_t i = 0; i < BOOK_ENTRIES; ++i)
    {
        uint128_t key = ((uint128_t) bookData[i].cellsTaken << 64) | bookData[i].keyLow;
        uint16_t movesDone = (uint16_t) __builtin_popcount(bookData[i].cellsTaken);
        tablePut(tableForMovesDone(movesDone), key, bookData[i].value, 1, 1);
    }
}

// ---------------------------------------------------------------- exports

EXPORT("init") void init(void)
{
    computeRegWinMasks();
    computeCellWinMasks();
    computeRotMasks();
    computeLosePropVarCells();
    computeNotLosingSelects();

    for (uint16_t t = 0; t < NUM_TTS; ++t)
    {
        for (uint64_t i = 0; i < TT_SIZE; ++i)
        {
            Entry empty = { 0, 0, 0, 0 };
            transTables[t][i] = empty;
        }
    }

    reset();
}

EXPORT("reset") void reset(void)
{
    loadBook();
    stateReset(&state);
    historyLength = 0;
    totalEvalStates = 0;
}

EXPORT("apply_select") int32_t apply_select(int32_t piece)
{
    if (isToPlace(&state) || isDone(&state) || isWon(&state)) return 0;
    if (piece < 0 || piece >= NUM_PIECES || !isPieceFree(&state, piece)) return 0;
    moveSelect(&state, piece);
    history[historyLength++] = piece;
    return 1;
}

EXPORT("apply_place") int32_t apply_place(int32_t cell)
{
    if (!isToPlace(&state)) return 0;
    if (cell < 0 || cell >= NUM_CELLS || !isCellFree(&state, cell)) return 0;
    movePlace(&state, cell);
    history[historyLength++] = cell;
    return 1;
}

EXPORT("undo") int32_t undo(void)
{
    if (historyLength == 0) return 0;
    uint16_t last = history[--historyLength];
    if (isToPlace(&state))
    {
        undoSelect(&state);
    }
    else
    {
        uint16_t piece = history[historyLength - 1];
        undoPlace(&state, piece, last);
    }
    return 1;
}

EXPORT("moves_left") int32_t moves_left(void) { return state.movesLeft; }
EXPORT("current_piece") int32_t current_piece(void) { return state.currPiece; }
EXPORT("pieces_taken") int32_t pieces_taken(void) { return state.piecesTaken; }
EXPORT("cells_taken") int32_t cells_taken(void) { return state.cellsTaken; }
EXPORT("piece_at") int32_t piece_at(int32_t cell) { return getPiece(&state, cell); }
EXPORT("is_to_place") int32_t is_to_place(void) { return isToPlace(&state); }
EXPORT("is_won") int32_t is_won(void) { return isWon(&state); }
EXPORT("is_done") int32_t is_done(void) { return isDone(&state); }

EXPORT("evaluate") int32_t evaluate(void)
{
    return eval(&state);
}

// Value of selecting `piece`, from the selecting player's perspective
EXPORT("evaluate_select") int32_t evaluate_select(int32_t piece)
{
    moveSelect(&state, piece);
    int16_t val = -eval(&state);
    undoSelect(&state);
    return val;
}

// Value of placing at `cell`, from the placing player's perspective
EXPORT("evaluate_place") int32_t evaluate_place(int32_t cell)
{
    uint16_t piece = state.currPiece;
    movePlace(&state, cell);
    int16_t val = eval(&state);
    undoPlace(&state, piece, cell);
    return val;
}

EXPORT("node_count") int64_t node_count(void) { return totalEvalStates; }

static uint32_t randomState = 0x9E3779B9u;

EXPORT("set_seed") void set_seed(uint32_t seed) { randomState = seed ? seed : 0x9E3779B9u; }

static uint32_t nextRandom(void)
{
    uint32_t x = randomState;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    randomState = x;
    return x;
}

static void shuffle(uint16_t* moves, uint16_t count)
{
    for (uint16_t i = count; i > 1; --i)
    {
        uint16_t j = nextRandom() % i;
        uint16_t t = moves[i - 1];
        moves[i - 1] = moves[j];
        moves[j] = t;
    }
}

// Root search: returns a move of maximal exact value using a tightening alpha window.
// Legal moves are shuffled first, so ties resolve randomly. Returns -1 if the game is over.
EXPORT("best_move") int32_t best_move(void)
{
    State* s = &state;
    if (isWon(s) || isDone(s)) return -1;

    uint16_t moves[NUM_CELLS];
    uint16_t count = 0;

    if (isToPlace(s))
    {
        uint16_t piece = s->currPiece;
        FOR_CELLS(i) if (isCellFree(s, i)) moves[count++] = i;
        shuffle(moves, count);

        // Immediate win if any placement completes a line
        for (uint16_t m = 0; m < count; ++m)
        {
            movePlace(s, moves[m]);
            int won = isWon(s);
            undoPlace(s, piece, moves[m]);
            if (won) return moves[m];
        }

        if (s->movesLeft == 1) return moves[0];

        int16_t alpha = -(s->movesLeft - 1);
        int16_t beta = s->movesLeft - 2;
        int16_t best = -INF;
        uint16_t bestMove = moves[0];

        for (uint16_t m = 0; m < count; ++m)
        {
            movePlace(s, moves[m]);
            int16_t val = evalSelect(s, alpha, beta);
            undoPlace(s, piece, moves[m]);

            if (val > best)
            {
                best = val;
                bestMove = moves[m];
                alpha = max16s(alpha, val);
                if (alpha >= beta) break;
            }
        }
        return bestMove;
    }

    // Mirrors evalSelect: only pieces that do not hand the opponent an immediate win are candidates
    uint16_t loseMask = 0;
    FOR_PROPS_VARS(i, j)
    {
        if (~s->cellsTaken & losePropVarCells[s->cellsProps[i][j]]) setBit(&loseMask, i * NUM_VARS + j);
    }
    const uint16_t* selects = notLosingSelects[loseMask];
    for (uint16_t m = 0; m < numNotLosingSelects[loseMask]; ++m)
    {
        if (isPieceFree(s, selects[m])) moves[count++] = selects[m];
    }

    if (count == 0)
    {
        // Every remaining piece loses; hand over a random one
        FOR_PIECES(i) if (isPieceFree(s, i)) moves[count++] = i;
        shuffle(moves, count);
        return moves[0];
    }

    shuffle(moves, count);

    if (s->movesLeft == 1) return moves[0];

    int16_t alpha = -(s->movesLeft - 2);
    int16_t beta = s->movesLeft - 1;
    int16_t best = -INF;
    uint16_t bestMove = moves[0];

    for (uint16_t m = 0; m < count; ++m)
    {
        moveSelect(s, moves[m]);
        int16_t val = -evalPlace(s, -beta, -alpha);
        undoSelect(s);

        if (val > best)
        {
            best = val;
            bestMove = moves[m];
            alpha = max16s(alpha, val);
            if (alpha >= beta) break;
        }
    }
    return bestMove;
}

// Canonical key of the current position, split in two 64-bit halves
EXPORT("key_low") uint64_t key_low(void) { return (uint64_t) getKey(&state); }
EXPORT("key_high") uint64_t key_high(void) { return (uint64_t) (getKey(&state) >> 64); }

EXPORT("book_entries") int32_t book_entries(void) { return BOOK_ENTRIES; }
EXPORT("book_depth") int32_t book_depth(void) { return BOOK_DEPTH; }
