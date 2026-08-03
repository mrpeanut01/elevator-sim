# Wave 13 — resume brief

**Paused 2026-07-31 at open, by decision, to relocate the Development folders out of Dropbox and
OneDrive.** Nothing is half-done: both lanes were stopped before either wrote a file, `git fsck` is
clean, and the only commit the wave has made is its own board.

Read [`WAVE13_PLAN.md`](WAVE13_PLAN.md) for the plan and
[`docs/14-building-behaviour-contract.md`](docs/14-building-behaviour-contract.md) for the contract.
This file is only what you need to *restart*.

---

## 0. Before anything else — confirm the second writer is gone

The wave halted because a sync client was rewriting the tree under two live agents. That is the one
precondition, and it is checkable rather than assumable.

```bash
ps aux | grep -iE "dropbox|onedrive|google.*drive|syncthing" | grep -v grep
```

Then, from the repository root:

```bash
pwd && git rev-parse --show-toplevel
```

Expect a path **outside** `~/Documents`, `~/Desktop`, and any Dropbox/OneDrive root.

Then the stability probe that actually failed last time — write an untracked file, wait, and require
it to still be there and the tree to still be clean:

```bash
echo probe > .sync-probe.tmp && sleep 30 && cat .sync-probe.tmp && git status --short && rm .sync-probe.tmp
```

**Expect:** `probe`, and a `git status` showing nothing but `.sync-probe.tmp`. Last time this
sequence lost the file, reverted a staged edit, and reverted a `git checkout`.

Finally, clear the conflict copies the client already left. `GAPS 3.md` is a stale 18 KB copy of the
current 24 KB `GAPS.md` and is not a file anyone wrote:

```bash
git clean -nxd '* 2.*' '* 2' '* 3.*' '* 3'
```

Inspect that list, then re-run with `-fxd`. `scripts/review-gates.mjs` gates on these because they
once produced **21 test failures that had nothing to do with the code**.

---

## 1. Where the work stands

| | |
|---|---|
| Branch | `fix/repin-to-reproducible-values`, at `ea94d7f` |
| PR | #4, open, **eight commits, last five `[skip ci]` — no CI result for the current head** |
| Baseline | `d52f347` — **4 896 tests, 4 886 passed, 0 failed, 10 skipped**, `tsc -b` clean, `review-gates` green, all 981 pins and both identity digests reproducing |
| Landed this program | **Step 1 only** (`d52f347`) — the traffic seed |
| Wave board | `ea94d7f` — plan, status, three permanent risk rows, coverage rule |

Two branches were cut and are still there at `d52f347`, unused and safe to delete or reuse:
`feat/w13-sky-lobby-authoring`, `feat/w13-traffic-model-v2`. Also `integration/wave-13`.

**Re-establish the baseline before trusting anything.** The number above was measured on a tree a
second process was rewriting, so it is inherited rather than confirmed:

```bash
npx tsc -b && npx vitest run --reporter=dot && node scripts/review-gates.mjs
```

If that is not 4 896 / 4 886 / 0 / 10, **that is the first finding and the wave does not start until
it is explained.** Do not adjust a pin to fit it — see § 4.

---

## 2. The todos, in dependency order

`T1` is done. `T0` and `T2` are the only two that can start immediately, and they are the only safe
parallel pair in the whole wave — `T0` is `packages/viz` and moves no draw, `T2` is `packages/core`
and moves every draw it is allowed to. They are file-disjoint.

| ID | Task | Branch | Depends | Parallel with |
|---|---|---|---|---|
| **T0** | Sky-lobby / escalator authoring in the designer (§ 5a) | `feat/w13-sky-lobby-authoring` | — | T2 |
| **T2** | `trafficModel: 'v2'` + `batchSize` stream (§ 1.3) | `feat/w13-traffic-model-v2` | — | T0 only |
| **T3** | Mass control, group-size curve (§ 2.1–2.2) | `feat/w13-traffic-variance` | T2 | T5 |
| **T4** | Day variation (§ 2.3) | `feat/w13-day-variation` | T3 | — |
| **T5** | Patience, lobby crowding, stairs (§ 3) | `feat/w13-passenger-behaviour` | T2 | T3 |
| **T6** | Learned-dispatcher teaching surface (§ 4) | `feat/w13-teaching-surface` | T3, T4 | — |

**T2 merges alone**, with the full suite run before anything is merged on top of it. It is the one
change that can move a published number, and there is no value in discovering that alongside a
feature.

### T0 — sky-lobby / escalator authoring

The engine is **complete**; only the authoring surface is missing. `TransportModeConfig` ships,
`data/buildings/vertical-city.json` authors four escalators (`G↔2`, `26↔27`, `51↔52`, `76↔77`),
`traffic/route.ts` routes over them, `ConservationAudit.transportHops` counts every crossing.
**Do not change `packages/core/`.**

Files: `packages/viz/src/authoring/buildingSpec.ts`, `authoring.test.ts`,
`packages/viz/src/dev/buildingEditor.ts`.

Two findings already made and verified at file:line, both in this scope:

1. **`specFromBuilding()` maps `accessZones` back into the spec and never reads `transportModes`.**
   Loading `vertical-city` into the designer silently drops its four escalators. Closing this
   round-trip loss is part of the task.
2. **`BuildingSpec.skyFloors` already ships** — the designer can mark floor 26 a transfer floor and
   cannot say *26 connects to 27*. **The gap is the connection, not the flag**, which is why this is
   an authoring task and not an engine one. Decide deliberately how the new structure and
   `skyFloors` relate, and write it down.

Deliverables: `SpecTransportMode` following the `SpecAccessZone` precedent exactly (floor *numbers*,
`nextZoneId`-style id minting); `buildingFromSpec` emits `transportModes`; `specFromBuilding` reads
them back; `validateSpec` refuses what `transportModeSchema`
(`packages/core/src/config/schema.ts:869`) refuses, **in the designer**, with a message naming the
field — *a designer that can produce a config the loader rejects is worse than one that cannot
produce it at all*; UI in `buildingEditor.ts` following the access-zone editor's idiom.

The case worth deciding rather than discovering: **what happens when the user shrinks `floors` below
a floor an escalator connects.**

### T2 — `trafficModel: 'v2'` and the `batchSize` stream

`drawBatchSize` draws from `streams.arrivals` at `packages/core/src/traffic/generator.ts:1006`, so
group size and arrival instants share a sequence. **Any** change to the group-size curve — even one
preserving the mean — consumes a different number of draws and shifts every subsequent arrival
instant. Not a little: completely. That is why T3 is impossible until this lands, and why this is a
correctness change rather than a tidiness one.

Files: `random/streams.ts`, `traffic/generator.ts`, `sim/types.ts`, `sim/simulation.ts` and tests.
**Not `packages/experiments/src/benchmark/published.ts`** — see § 4.

Deliverables: `batchSize` added to `STREAM_NAMES` **and** `TRAFFIC_STREAM_NAMES` (it is demand, so
step 1's `trafficSeed` must seed it); `trafficModel?: 'v1' | 'v2'` on the run config defaulting to
`'v1'`; the draw switching on it; **reported on `SimulationResult`** — a model version no shipped
path reports is dead seam #12.

Read `git show d52f347` first. It is step 1 of this same program and answers the plumbing question
already, including the one worth re-deciding here: it recorded a *missing key* rather than
`undefined`, because *"there was no traffic seed"* and *"the traffic seed matched the run seed"* are
different runs. Decide the analogous absent-vs-`'v1'` question deliberately.

---

## 3. The test that decides every task in this wave

`docs/14 § 5` criterion 2, which is the roadmap's standing requirement pointed at a knob:

> **Move the control and require the run to change** — compared on the legs, not on a window
> statistic. A control that fails this is deleted, not documented.

Asserting on emitted config is not this test. Asserting on a mean is not this test.
[§ D170](DECISIONS.md) records the shape the T0 version has — *26 journeys routed over different
floors; `30 → 45` stops going `30>26>G>2>27>45` and goes `30>26>27>45`*.

**T2's version is the sharpest and should be written first**, because it is the falsifiable
statement of what the whole task buys: under **v1**, changing the group-size mean shifts arrival
*instants*; under **v2**, changing the group-size mean leaves arrival instants **untouched** and
changes only group sizes. Both directions, one test.

Every new test is **watched failing** before it is made to pass, and which ones were watched fail is
part of the lane report.

---

## 4. The line that is not crossed

`docs/14 § 0`, quoting [§ D151](DECISIONS.md) § 7 — written before the last traffic-model change
landed:

> It must be opt-in and byte-identical when unused. Every existing published number must reproduce
> exactly.

**981 pinned estimates** plus both identity digests. **A moved pin is a finding, never a value to
edit.** Editing one to fit a changed tree is exactly what [§ D196](DECISIONS.md)/[§ D201](DECISIONS.md)
cost this repository a wave to unpick — a pin correct on one tree and wrong on another, with no way
to tell which was right.

Lane agents are forbidden `packages/experiments/src/benchmark/published.ts`. If a pin moves, stop
and report.

---

## 5. Lane conduct when restarting

One worktree per lane under `.worktrees/`, one branch per worktree, one agent per branch — `RISKS.md`
R25's remedy, which wave 12 adopted only after a commit described one lane and contained three.
Every `git add` names explicit paths.

Worktrees need `node_modules`. Symlinking it from the main checkout is what appeared to provoke the
sync client last time; **once the repo is outside the synced folder, prefer a real `npm install` in
each worktree** and keep the tree free of symlinks that cross the repository boundary.

Commits carry `[skip ci]` until the wave is ready for a matrix run. **PR #4 needs one CI run before
it merges** — its last five commits all skipped CI, so its current head has no result.
