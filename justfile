set dotenv-filename := ".envrc"

mod solver
mod web

# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

# Install the toolchain via mise
[group('setup')]
install:
    mise install --quiet
    mise current

# Check every module, then run all pre-commit hooks
verify:
    just solver::check
    just web::verify
    pre-commit run --all-files
    @echo "All pre-commit checks passed!"

# set up `git-test`
[group('setup')]
setup-git-test:
    git test add --test default 'just --global-justfile _check-local-modifications && (should-skip-commit || just verify) && just --global-justfile _check-local-modifications' --forget

# Deprecated alias for `verify`
precommit: verify
