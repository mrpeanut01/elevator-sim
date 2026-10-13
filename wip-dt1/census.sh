#!/bin/bash
# The week pool census, detached. Resumes from census.jsonl (the checkpoint) on every start.
S=/tmp/claude-0/-home-user-elevator-sim/96ab6e1a-00db-5ceb-940f-5b1532967d30/scratchpad/dt1
cd "$S/tree" || exit 1
export NODE_OPTIONS=--max-old-space-size=4096
export WEEK_POOL_SWEEP=1
export WEEK_POOL_OUT="$S/census.jsonl"
export WEEK_POOL_ASSEMBLE="$S/census-pool.json"
[ -n "$1" ] && export WEEK_POOL_PASS="$1"
echo "start $(date +%H:%M:%S) pass=${1:-all}" >> "$S/census.log"
npx vitest run --project viz --maxWorkers=1 --testTimeout=36000000 packages/viz/src/shift/weekPool.sweep.test.ts >> "$S/census.log" 2>&1
echo "census done $? $(date +%H:%M:%S)" >> "$S/census.log"
