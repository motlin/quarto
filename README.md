# QuartoBot

Quarto with a perfect-play opponent. Sixteen wooden pieces, a four-by-four board, and a twist:
you never place your own piece — your opponent hands it to you. The Bot has solved the game, so
every move it makes is the best one there is, and when annotations are on it tells you exactly how
far you are from winning or losing.

Play it at _(link to come once the site is deployed)_.

## The rules

Each of the sixteen pieces has four traits, and each trait comes in two kinds:

| Trait  | Kinds           |
| ------ | --------------- |
| Colour | light or dark   |
| Shape  | round or square |
| Height | tall or short   |
| Top    | solid or hollow |

Every combination appears exactly once, so no two pieces are alike.

A turn has two halves. The player to move places the piece they were handed on any empty cell,
then picks one of the remaining pieces and hands it to the opponent. The first player only picks.

You win by placing a piece that completes a line of four pieces sharing a trait — four dark
pieces, four hollow ones, four tall ones, and so on. Which lines count depends on the variant:

- **Lines** (the basic game): the four rows, four columns and two diagonals.
- **Squares** (the advanced game): those ten lines plus the nine two-by-two squares.

If all sixteen pieces are placed without a line, the game is a draw.

## Running it

```bash
just install     # install the toolchain with mise
just             # list every recipe, including the solver:: and web:: modules
just verify      # everything CI runs
```

Tool versions are pinned in `.mise/config.toml`; nothing else needs installing by hand.

## How it is built

The repository has two modules, each with its own `justfile`:

- `solver/` — a Rust crate that plays Quarto perfectly. It compiles natively for generating the
  opening book and for tests, and to WebAssembly for the browser.
- `web/` — the site: a TypeScript and React app that runs the solver in a Web Worker so the page
  never freezes while the Bot thinks.

`reference/` holds the upstream C++ solver, kept for differential testing, and `prototype/` holds
the freestanding C port and single-file page the rewrite grew out of.

## Deploying

The site is static, so it goes to Cloudflare Pages. Deployment details will follow once the web
module exists.

## Where it came from

The solver is a port of Emil Indzhev's [Quarto-Solver](https://github.com/indjev99/Quarto-Solver),
released under the MIT license. The search, the transposition table and the position canonicalisation
follow that implementation closely enough that the two produce byte-identical transcripts, which is
how the port is tested.

## License

Apache 2.0. See [LICENSE](LICENSE).
