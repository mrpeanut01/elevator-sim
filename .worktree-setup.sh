#!/usr/bin/env bash
# Set up a worktree so BUILT artifacts resolve against the worktree's own packages.
# The naive approach (symlink the root node_modules) fails: node resolves the symlink to
# its realpath in the main checkout, so @elevator-sim/* points at the WRONG tree and any
# built-artifact evidence is about code you did not write. This builds a real node_modules
# whose third-party entries are symlinks to the shared store and whose @elevator-sim
# entries point back into this worktree.
#
# ----------------------------------------------------------------------------------------------
# Do NOT reap test processes with `pkill -f` while lanes share a container.
#
# The Bash harness runs each command as `/bin/bash -c -l ... eval '<the entire command text>'`, so
# the whole command string — worktree path and log path included — sits in that shell's own
# /proc/<pid>/cmdline. Verified in-container: a command containing the literal
# `/home/user/.worktrees/lane-d-demo` was matched by `pgrep -af /home/user/.worktrees/lane-d-demo`,
# and the single hit was the caller's own wrapper shell. Two consequences:
#
#   pkill -f "vitest run"       reaps EVERY concurrent lane's in-flight suite, not only yours.
#   pkill -f "<your worktree>"  kills your OWN shell, because the wrapper's command line holds
#                               that path.
#
# The victim's log is near-empty — no FAIL, no AssertionError, often just the RUN header — which
# at a glance reads like a container OOM kill under load. Runs have been misattributed that way.
#
# Read the exit code; do not recognise it. Measured on this toolchain, SIGTERM — what a bare
# `pkill` sends — yields 143, for bash and for node alike. 144 is 128+16, i.e. SIGSTKFLT, which a
# default `pkill` does not send. Reports of this failure have cited 144, and that discrepancy is
# unresolved: if you genuinely see 144, SIGTERM is not the whole story and the sender is worth
# finding before the run is attributed to anything.
#
# Safe form — narrow to the real test process, prove you own it, exclude yourself, kill by PID.
# Confirm the pattern with `pgrep -af` before you trust it; the argv shape is not guaranteed.
#
#   WT=$(pwd -P)
#   anc=""; p=$$                     # Your own wrapper matches any pattern you pass, and so do its
#   while [ "$p" -gt 1 ]; do         # ancestors — the agent harness's cwd is the worktree root too,
#     anc="$anc $p"                  # so a cwd check ALONE still signals it. Measured, not assumed.
#     ppid=$(awk '/^PPid:/{print $2}' "/proc/$p/status" 2>/dev/null)
#     [ -n "$ppid" ] || break
#     p=$ppid
#   done
#   for pid in $(pgrep -f 'vitest'); do
#     case " $anc " in *" $pid "*) continue;; esac              # never yourself or your parents
#     owner=$(readlink -f "/proc/$pid/cwd" 2>/dev/null) || continue
#     case "$owner" in "$WT"|"$WT"/*) kill "$pid";; esac        # by PID, only once ownership holds
#   done
#
# `pgrep` is the read-only counterpart of `pkill`: put the pattern through it first and read what
# it would have hit. Doing exactly that is what found the ancestor case above.
#
# The rule this protects: a run is evidence only if its exit code was read and understood. A kill
# signal from a sibling process is not a test outcome — a signal death is neither a failing suite
# nor a passing one, it is no result at all, and filing it as either is the mistake.
# ----------------------------------------------------------------------------------------------
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
