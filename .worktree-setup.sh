#!/usr/bin/env bash
# Set up a worktree so BUILT artifacts resolve against the worktree's own packages.
# The naive approach (symlink the root node_modules) fails: node resolves the symlink to
# its realpath in the main checkout, so @elevator-sim/* points at the WRONG tree and any
# built-artifact evidence is about code you did not write. This builds a real node_modules
# whose third-party entries are symlinks to the shared store and whose @elevator-sim
# entries point back into this worktree.
set -euo pipefail
ROOT="$1"; WT="$2"
mkdir -p "$WT/node_modules"
for entry in "$ROOT/node_modules"/*; do
  name=$(basename "$entry")
  [ "$name" = "@elevator-sim" ] && continue
  ln -sfn "$entry" "$WT/node_modules/$name"
done
for entry in "$ROOT/node_modules"/.bin; do
  [ -e "$entry" ] && ln -sfn "$entry" "$WT/node_modules/.bin"
done
mkdir -p "$WT/node_modules/@elevator-sim"
for dep in core experiments cli viz; do
  [ -d "$WT/packages/$dep" ] && ln -sfn "$WT/packages/$dep" "$WT/node_modules/@elevator-sim/$dep"
done
