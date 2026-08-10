# opcheck — shared brief for investigation lanes

## Why this exists

A new UI ships in hours. It will add building types, failure modes, simulation tweaks and new
gameplay. Before that lands, every **current dispatcher** must be shown to *operate correctly* in
every **current building** — cars move, banks serve, floors get visited, riders board, transfers
complete, escalators carry, decks pair, nothing throws.

**This is not a performance exercise.** Do not compare dispatchers on AWT. Do not declare one
better than another. A saturated building is not a bug — a lift group that leaves riders standing
while its cars sit still *is*, saturated or not.

## The harness

- `scripts/opcheck/opcheck.mjs` — runs one cell and checks it. `--cells <json> --out <ndjson>`, or
  `--building X --dispatcher Y --pretty` for one.
- `scripts/opcheck/matrix.mjs <dir> --slices N --set core|templates|traffic|stress|all` — writes the
  cell matrix, sliced.
- `scripts/opcheck/report.mjs <dir> [--code CODE] [--group G] [--json]` — aggregates NDJSON.

A cell is `{building, dispatcher, traffic?, template?, seed?, durationS?, demand?, patience?,
doorObstructionProbability?, serviceEvents?, label?, group?}`. `serviceEvents` accepts either a
literal schedule (`[{atS, bankId, carId, mode}]`) or the sugar `{withdraw: N, atS, restoreAtS?,
mode?}`.

Build first if `dist/` is stale: `npm run build`.

## Baseline already measured

Full sweep, 2 496 cells (8 buildings × 13 dispatchers × {3 seeds, 5 extra templates, 5 traffic
overrides, 5 demand tweaks, 5 failure modes}), results in `/tmp/opcheck-all/*.ndjson`:

- **2 483 clean, 13 with an error.** All 13 are `floor-never-served` on `garden-apartments` under
  `withdraw-half` — which withdraws both of that building's two cars, i.e. the whole fleet.
- **Never fired at all:** `dead-car`, `dead-bank`, `stuck-car-with-queue`, `conservation-imbalance`,
  `wrong-car-boarding`, `alighted-exceeds-boarded`, `deck-mismatch`, `double-deck-*`,
  `everyone-refused`, `no-demand`, `no-transfers`, `no-transport-hops`,
  `stranded-on-completed-run`, `car-carried-nobody`.
- **Warnings:** `very-long-wait` 472, `floor-never-reached` 468, `status-timed-out` 63,
  `promise-churn` 57 (all `destination-panel`), `stranded-in-car` 47.

## The rule this repository runs on, and it binds you

From `CLAUDE.md` / `docs/05-roadmap.md`: **a check that cannot fail is not evidence.** A green
result is worth nothing until you have shown the check *can* go red. Before you report a lane
clean, inject the fault it is supposed to catch and watch it trip. Likewise, **name the non-test
caller** — a mechanism that is configured, validated and consulted by nothing is a dead seam, and
this repo has shipped eleven of them.

Second rule, from the same source: **move the control and require the run to change, compared on
the legs** — not on a window statistic. If you claim a knob does something, show two runs whose
leg records differ.

## What to report back

Return a compact structured report:

1. **Confirmed defects** — each with: what breaks, the exact reproducing cell (a JSON cell object
   or an `elevator-sim` command line), the evidence (leg counts, per-car distances, counters — not
   prose), which buildings × dispatchers it spans, and severity for the UI release.
2. **Explained non-defects** — findings you chased and cleared, with the measurement that cleared
   them. Say plainly when something is a legitimate consequence of the configuration.
3. **Blind spots** — what your lane could NOT check, and what would be needed.
4. **Negative controls** — the faults you injected and whether the check caught them.

Be precise about uncertainty. Do not round a "probably fine" up to "fine". If you could not
measure something, say so rather than asserting it.

Work in `/Users/nrene/Development/04-personal-projects/elevator-sim`. Use `/tmp/opcheck-<yourlane>/`
for scratch output. Do not modify `data/` or `packages/*/src/` — this is an audit, not a fix
pass — except that you may add throwaway probe scripts under `/tmp`.
