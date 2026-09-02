# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

# Build the solver wasm and serve prototype/web/index.html with vite at http://localhost:3002/
[working-directory('prototype')]
dev:
    npm run dev

# Build the solver wasm and run the prototype tests
[working-directory('prototype')]
test:
    npm test

# Build the solver wasm and the inlined dist/quarto.html
[working-directory('prototype')]
build:
    npm run build

# Run all pre-commit checks
verify: test build
    @echo "All pre-commit checks passed!"

# Deprecated alias for `verify`
precommit: verify
