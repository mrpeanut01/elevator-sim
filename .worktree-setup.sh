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
# Derived from disk, never listed by hand. The hand-written list read
# `core experiments cli viz` and omitted `server`, which is a declared workspace — so a lane
# importing @elevator-sim/server in a worktree resolved it to the MAIN checkout, which is
# exactly the failure the comment at the top of this file exists to prevent, arriving through
# the list rather than through the symlink. A loop over packages/*/ cannot go stale when a
# sixth package is added.
mkdir -p "$WT/node_modules/@elevator-sim"
for dir in "$WT/packages"/*/; do
  dep=$(basename "$dir")
  ln -sfn "$dir" "$WT/node_modules/@elevator-sim/$dep"
done
