// 🖥️ Native driver: reads move tokens from stdin, prints upstream play() transcript format.
// Usage: quarto_native [skipPlies]  — skipPlies plies are applied without evaluation (cold timing).
#include "quarto.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>

static double secondsNow(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec / 1e9;
}

static const char* evalToString(int movesLeft, int val)
{
    static char buffer[32];
    if (val == 0) return "Draw";
    snprintf(buffer, sizeof buffer, "%s in %d", val > 0 ? "Win" : "Loss", movesLeft + 1 - abs(val));
    return buffer;
}

static void pieceToString(int piece, char* out)
{
    if (piece == QUARTO_NO_PIECE) { strcpy(out, "  "); return; }
    out[0] = (piece & 1) ? 'b' : 'a';
    out[1] = (piece & 2) ? 'x' : 'o';
    if (piece & 4) out[0] = toupper(out[0]);
    if (piece & 8) out[1] = toupper(out[1]);
    out[2] = 0;
}

static int pieceFromString(const char* text)
{
    int piece = 0;
    if (tolower(text[0]) == 'b') piece |= 1;
    if (tolower(text[1]) == 'x') piece |= 2;
    if (isupper(text[0])) piece |= 4;
    if (isupper(text[1])) piece |= 8;
    return piece;
}

static void cellToString(int cell, char* out)
{
    out[0] = 'a' + cell % 4;
    out[1] = '1' + cell / 4;
    out[2] = 0;
}

static int cellFromString(const char* text)
{
    return (text[1] - '1') * 4 + (text[0] - 'a');
}

static void printBoard(void)
{
    printf("Board:\n+----+----+----+----+\n");
    for (int cell = 0; cell < 16; ++cell)
    {
        char text[3];
        pieceToString(piece_at(cell), text);
        printf("| %s ", text);
        if (cell % 4 == 3) printf("|\n+----+----+----+----+\n");
    }
    printf("\n");
}

static void printMoves(void)
{
    int movesLeft = moves_left();
    int values[16];
    int count = 0;
    int moves[16];
    for (int move = 0; move < 16; ++move)
    {
        if (is_to_place() ? (cells_taken() >> move) & 1 : (pieces_taken() >> move) & 1) continue;
        moves[count] = move;
        values[count] = is_to_place() ? evaluate_place(move) : evaluate_select(move);
        ++count;
    }
    printf("Moves:\n");
    // Group by value, descending, matching upstream's reversed std::map order
    for (int value = 17; value >= -17; --value)
    {
        int any = 0;
        for (int m = 0; m < count; ++m)
        {
            if (values[m] != value) continue;
            char text[3];
            if (is_to_place()) cellToString(moves[m], text); else pieceToString(moves[m], text);
            printf("%s ", text);
            any = 1;
        }
        if (any) printf(": %s\n", evalToString(movesLeft, value));
    }
    printf("\n");
}

int main(int argc, char** argv)
{
    int skipPlies = argc > 1 ? atoi(argv[1]) : 0;
    init();

    int player = 0;
    int ply = 0;
    char token[16];

    while (1)
    {
        int evaluating = ply >= skipPlies;
        if (evaluating) printBoard();
        if (evaluating) printf("Player:\n%d\n\n", player + 1);

        if (is_won()) { printf("Win\n"); break; }
        if (is_done()) { printf("Draw\n"); break; }

        if (evaluating)
        {
            double started = secondsNow();
            long long nodesBefore = node_count();
            int value = evaluate();
            double evaluated = secondsNow();
            long long nodesEvaluated = node_count();
            int best = best_move();
            double chosen = secondsNow();
            fprintf(stderr, "ply %d: evaluate %.3fs (%lld nodes), best_move %.3fs (%lld nodes) -> %d\n",
                ply, evaluated - started, nodesEvaluated - nodesBefore, chosen - evaluated, (long long) node_count() - nodesEvaluated, best);
            printf("Eval:\n%s\n\n", evalToString(moves_left(), value));
            printMoves();
        }

        if (scanf("%15s", token) != 1) break;

        if (is_to_place())
        {
            if (evaluating) printf("Cell:\n%s\n\n", token);
            if (!apply_place(cellFromString(token))) { fprintf(stderr, "illegal cell %s\n", token); return 1; }
        }
        else
        {
            if (evaluating) printf("Piece:\n%s\n\n", token);
            if (!apply_select(pieceFromString(token))) { fprintf(stderr, "illegal piece %s\n", token); return 1; }
            player = 1 - player;
            if (evaluating) printf("Player:\n%d\n\n", player + 1);
        }
        ++ply;
        fflush(stdout);
    }

    fprintf(stderr, "nodes: %lld\n", (long long) node_count());
    return 0;
}
