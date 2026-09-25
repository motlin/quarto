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

# Check every module; web::verify also runs the pre-commit hooks over the whole repo
verify:
    just solver::check
    just web::verify
    @echo "All pre-commit checks passed!"

# set up `git-test`
[group('setup')]
setup-git-test:
    git test add --test default 'just --global-justfile _check-local-modifications && (should-skip-commit || just verify) && just --global-justfile _check-local-modifications' --forget

# Deprecated alias for `verify`
precommit: verify
