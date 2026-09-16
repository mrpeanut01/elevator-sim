# `charter S9` B1 run history

GitHub issue #408, [`DECISIONS.md`](../../../DECISIONS.md) § D618.

`tti-history.jsonl` is the per-commit store `docs/31-support-matrix.md` § 3 says B1 needs: *"gates
only on a rolling comparison, never on a single run"*. One JSON object per line, oldest first,
append-only.

## Schema

Each line is validated against `packages/viz/src/dev/ttiHistory.ts`'s `ttiRecordSchema` (zod,
`.strict()` — an unrecognized field is an error, matching this repository's other data schemas in
`packages/core/src/config/schema.ts`):

| field | type | meaning |
|---|---|---|
| `commit` | full 40-character git SHA | the commit measured |
| `branch` | string | the branch measured — the gate's rolling window only ever reads `'main'` |
| `timestampMs` | positive integer | wall-clock time of the measurement, ms since the Unix epoch |
| `ttiMs` | non-negative finite number | time to interactive, per `docs/31` § 3's definition |
| `ci` | boolean | `true` for a measurement taken in CI, `false` for one taken by a person by hand |

## Why here and not `data/`

Argued in full in `ttiHistory.ts`'s header. Short version: `data/` is simulator reference data that
`packages/core` loads, and `CLAUDE.md` invariant 6 keeps `core/` buildable with `viz` absent — a CI
timing log for `viz`'s own shipped bundle is a different kind of thing and belongs beside the
package it measures, not inside the directory that boundary exists to protect. CI artifacts were
rejected as invisible six months later; the telemetry store (`server/`) was rejected because it is
consented player data and this is neither consented nor a player's.

## Why it ships with no `main`-branch history

**Zero `main`-branch records.** No CI job in this repository has ever measured B1 on `main`, and
this change does not fabricate a starting point for that branch — seeding the store with an
invented number would be exactly the "made-up historical data" this store exists to replace.
`packages/viz/src/dev/recordTti.ts` is the writer; it is not yet wired into any CI workflow (see
that file's header for why, and for how to run it by hand). Until it has run `ROLLING_WINDOW_N`
(currently 20) times on `main`, every gate evaluation is `'advisory'` by construction — see
`ttiGate.ts`.

The one line the file does carry is a real measurement, not a fabricated one: `recordTti.ts` run
once against this change's own worktree branch while it was being tested (**569.7 ms**, 2026-09-16,
commit `cb0a24c`), which demonstrates the writer end to end without touching the number the gate
actually compares against — the rolling window only ever reads `branch: "main"`, and this record's
`branch` is the worktree's own.

## JSON Lines, not a single JSON array

A new measurement is one line appended at the end, so the diff for a commit that adds a
measurement is a one-line addition, never a rewrite of an array's closing bracket and the trailing
commas above it. Parsed and written by `packages/viz/src/dev/ttiHistory.ts`; nothing else should
touch this file directly.
