// 🎯 Public API of the freestanding Quarto perfect-play solver.
#pragma once
#include <stdint.h>

#define QUARTO_NUM_PIECES 16
#define QUARTO_NUM_CELLS 16
#define QUARTO_NO_PIECE 16

void init(void);
void reset(void);

int32_t apply_select(int32_t piece);
int32_t apply_place(int32_t cell);
int32_t undo(void);

int32_t moves_left(void);
int32_t current_piece(void);
int32_t pieces_taken(void);
int32_t cells_taken(void);
int32_t piece_at(int32_t cell);
int32_t is_to_place(void);
int32_t is_won(void);
int32_t is_done(void);

int32_t evaluate(void);
int32_t evaluate_select(int32_t piece);
int32_t evaluate_place(int32_t cell);
int64_t node_count(void);
void set_seed(uint32_t seed);
int32_t best_move(void);

uint64_t key_low(void);
uint64_t key_high(void);
int32_t book_entries(void);
int32_t book_depth(void);
