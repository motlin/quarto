# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

# Build the solver wasm and serve web/index.html with vite at http://localhost:3002/
dev:
    npm run dev

# Build the solver wasm and run the tests
test:
    npm test

# Build the solver wasm and the inlined dist/quarto.html
build:
    npm run build

# Run all pre-commit checks
verify: test build
    @echo "All pre-commit checks passed!"

# Deprecated alias for `verify`
precommit: verify
