# Test matrix

> ## ↩️ Wave 10 — the design handoff. This matrix stays retired in place; wave 10's coverage is in [`WAVE10_PLAN.md`](WAVE10_PLAN.md) § 5.
>
> Wave 10's own standing rule is this file's, one level down. This file says *a component test does
> not close a row, because this project's dominant defect class passes every component test it has*.
> Wave 10 applies that to the four editors the handoff adds: **every control has a test that moves it
> and requires the resulting run to differ**, compared on the legs — who was carried by which car and
> when — and never on a window statistic, because a summary over the peak five minutes can
> legitimately be equal for two visibly different runs.
>
> It found three defects that way ([§ D177](DECISIONS.md)): a dwell control writing a field that does
> nothing under the default door policy, a default lever silently rewriting a shipped dispatcher, and
> a *load sensor off* value the model layer rejects. None of the three would have failed a component
> test of the control.

> ## ↩️ The delivery reopened 2026-07-28 as **wave 5**, and this matrix stays retired in place.
>
> Two of the three items it left carried forward are wave-5 scope and are being worked now: the
> **four ⚠️ unverified UX rows** (T39, driven against a dev server serving its own worktree) and
> **C7**, which closed after this file was written. The third — the full experiment matrix — landed
> in `f895a16`.
>
> Wave 5's coverage is tracked in [`WAVE5_PLAN.md`](WAVE5_PLAN.md) § 5 and
> [`AGENT_STATUS.md`](AGENT_STATUS.md) § Wave 5. Its standing rule is this file's own: **a component
> test does not close a row**, because this project's dominant defect class passes every component
> test it has.

> ## 🏁 FINAL STATE of waves 1–4 — 2026-07-28. This section is closed and is no longer updated.
>
> **What it was for.** Scenario-level coverage during the orchestrated completion of this project.
> It exists because component tests alone do not close a row: this project's dominant defect class —
> *configurable, unit-tested in isolation, dead in the shipped path* — passes every component test
> it has, **nine times over in code and once in `data/`**.
>
> **Where the live information is now.** [`docs/05-roadmap.md`](docs/05-roadmap.md) carries each
> phase's acceptance verdict and the measurements behind it;
> [`docs/07-handoff.md`](docs/07-handoff.md) § 3 lists the permanent guards and why each exists, and
> § 8 lists the open debt. This file is kept because it records *how* the coverage was assembled and
> because `packages/viz/UX.md` cites § 3 of it.
>
> **Its own carried-forward items, at close:** every row below is ✅ except three, and all three are
> stated rather than quietly ticked — **C7** (two holes in `core`'s dead-code scanner, still open),
> the four ⚠️ unverified UX rows, and the full experiment matrix (⬜, the one track between Phase 8
> and acceptance). The two rows that were ❌ or ⚠️ when this file was last written — `fuzz-1000384`
> and the unpinned refuted mechanism — are **both closed**, and are marked so below.
>
> > **Since close:** the full experiment matrix **landed** (`f895a16`) and its row below is ✅;
> > **Phase 8 is accepted** ([`DECISIONS.md` § D108](DECISIONS.md)).
>
> > ### ✅ **Final disposition of the three, after the closing wave (2026-07-28)**
> >
> > - **The full experiment matrix** — landed, ✅ below.
> > - **C7** — **CLOSED.** Both scanner holes fixed, both watched failing first, **no new dead
> >   exports surfaced**, allowlist unchanged in both directions. The second hole had made an
> >   existing assertion *unfalsifiable*, which is worse than a missing one because it reads as
> >   coverage. [`DECISIONS.md` § D114](DECISIONS.md).
> > - **The four ⚠️ UX rows** — **unchanged, and still not passing.** `RV-11`, `RV-17`, `RV-21`,
> >   `KB-14`, built and reachable, neither driven nor tested. Confirmed against
> >   `packages/viz/UX.md` § 7.0 after its edits landed: the ledger is now **88** rows, **79 ✅**,
> >   and § A.3's **Success** and **Saturated** rows were found *false* rather than unverified and
> >   are re-marked ([§ D111](DECISIONS.md)).

Legend: ⬜ not started · 🟡 in progress · ✅ passing · ❌ failing · ⚪ n/a

**Suite at close, measured on `docs/handoff` 2026-07-28: 168 files, 3,138 tests (3,130 passing,
8 skipped), 460 s, `tsc -b` clean.**

> **Superseded, and left standing as the close-of-delivery record.** Phase 8's eighth track landed
> after this board was retired (`f895a16`) and added 34 tests and one skip. Measured on
> `docs/drift-sweep` 2026-07-28: **172 files, 3 172 tests (3 163 passing, 9 skipped)**, `tsc -b`
> clean. The runtime is not restated because it is load-dependent and this board's 460 s was never
> reproducible as a property of the code — see [`docs/07`](docs/07-handoff.md) § *Running it*.
>
> > **Superseded again, at true close.** The closing wave added 48 tests in no new files. Measured
> > on `docs/final-truth` 2026-07-28: **172 files, 3 220 tests (3 211 passing, 9 skipped)**,
> > `tsc -b` clean, exit 0. +19 from [§ D111](DECISIONS.md) and +29 from
> > [§ D112](DECISIONS.md) / [§ D114](DECISIONS.md), accounted test by test.

---

## 1. Wave 1 — correctness foundation

| Flow / behaviour | Test type | Scenario | Owner | Status |
|---|---|---|---|---|
| Phase 7 tuning reachable from the package surface | integration | every `tuning/` entry point has a non-test importer; `@elevator-sim/experiments` re-exports them | T1 | ✅ |
| CLI `tune` runs a real search | e2e | `sim -- tune` on a shipped building produces a candidate and a held-out verdict | T1 | ✅ |
| CLI `tune` — invalid input | e2e | unknown building / unknown profile / n below the resolution floor → clear error, non-zero exit | T1 | ✅ |
| Experiments dead-code audit | mechanical | every export of `tuning/{search,space,report}` has a real importer or an allowlist entry stating why | T1 | ✅ |
| Published paired interval uses t(n−1) | unit | `pairedDifferenceEstimate` at n=26 → `method:'t'`, `df:25`; Monte-Carlo coverage ≥ 95% | T2 | ✅ |
| Sequential stopping keeps its own z crossover | unit | **superseded by D14** — `halfWidthQuantile` is deleted and the rule is Student-t at every `n`. The assertion is now that the rule and the report use the *same* estimator | T2 → T6 | ✅ |
| `compare` distinguishes identical from indistinguishable | e2e | `--a eta --b eta` → names the case identical, does **not** print "Raise --reps" | T2 | ✅ |
| `compare` reproduce line reproduces | e2e | parse the printed `reproduce:` line, re-run it, assert byte-identical verdict | T2 | ✅ |
| Every search-space dimension is live | integration | for each dimension, two profiles differing only in it produce different trajectories on ≥1 shipped building — or the dimension declares why not, with an executed proof | T3 → T7 | ✅ |
| `idle.predictorHorizonS` | integration | ungated and allowlisted, with a proof obligation on the gate (D21) | T3 → T7 | ✅ |
| `answer.reopenOnLateArrival` | integration | implemented, ships `false`, and its price is a measurement rather than a figure from a diverging queue (D9, D25) | T3 → T7 | ✅ |
| `answer.overloadThreshold` | integration | range narrowed to `[designLoadFactor, 1.5]` (D10) | T3 | ✅ |
| Double-deck cars | integration | not simulated; `loadConfig` warns, the warning reaches `SimulationResult.warnings`, `RunRecord` and the CLI report (D11, D22, D23) | T3 → T7 | ✅ |
| `patternSwitching` | integration | **recorded as deliberately unimplemented** and the roadmap bullet marked not-done (D12) | T3 | ✅ |
| Doc claims match code | consistency | phase set agrees across `CLAUDE.md`, `README.md`, `docs/07-handoff.md`; docs' JSON examples parse and satisfy their gates; docs/01's module tree matches disk in both directions; docs/03's formulas evaluate against `roundTripTime()` | T4 | ✅ |
| Published study intervals re-derive | mechanical | every interval-shaped literal in `benchmark/` is either reproduced by a pinned estimate at its own printed precision, or declared unpinned with a count | T9 | ✅ |
| `core` builds and tests with `viz` absent | build | invariant 6, in its strong form once `viz` exists | T5 | ✅ — **C28 closed.** `moduleTree.test.ts` is scoped to installed workspace members; verified by deleting and deregistering `packages/viz` in a scratch copy (`tsc -b` clean, `core` 77 files / 1 832 tests green), with the pre-fix guard reddening on the same copy |
| Stored run replays visually identically | integration | replay from a stored seed reproduces the same frame sequence, with a per-field negative control | T5 | ✅ |
| **The first frame places every car where the run says it started** | integration | the raised Phase 4 clause (**C16**), asserted on all five buildings by `describe.each(BUILDING_IDS)` | T8 | ✅ |

## 2. Regression — must stay green through every merge

| Guard | What it protects | Status |
|---|---|---|
| `core/src/sim/seam.test.ts` | behavioural liveness of dispatch behaviours | ✅ |
| `core/src/dispatch/deadCode.test.ts` | mechanical dead-export audit | ✅ — **C7 closed**: both scanner holes fixed and watched failing first, no new dead exports surfaced, allowlist unchanged in both directions ([§ D114](DECISIONS.md)) |
| `experiments/src/index.test.ts` § study entry points | every study in `STUDY_ENTRY_POINTS` — **derived from the `benchmark/` directory**, not a hand-written list — has a non-test, non-barrel caller | ✅ — added by the closing wave, after the whole `'no-intervals'` half of `benchmark/` was found dead ([§ D114](DECISIONS.md)) |
| `experiments/src/tuning/deadCode.test.ts` | the same audit for `tuning/{search,space,report}` | ✅ |
| `estimateCost` purity (3 guards) | invariant 1 | ✅ |
| No global RNG / no wall-clock in `core/` | invariants 2, 3 | ✅ |
| Closed-form RTT oracle | correctness oracle | ✅ — now across **all five** buildings |
| CRN determinism — same seed, bit-identical paired differences | invariants 4, 5 | ✅ |
| `benchmark/published.test.ts` | a published number cannot appear without a study behind it, nor change in silence | ✅ |
| `viz/src/boundaries.test.ts` | invariant 6, plus the no-DOM rule with positive controls (D66) | ✅ |
| `core/src/browser.test.ts` + the import-graph guard | no `node:` builtin reachable from the browser barrel (D31–D33) | ✅ |
| `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree against disk, both directions, scoped to installed packages | ✅ |
| `experiments/src/validation/documentation.test.ts` | phase-set agreement across three documents, `docs/07` against itself, README's doc table, the roadmap's entry points, **and the refuted mechanism at all seven sites** | ✅ |
| `experiments/src/benchmark/saturationCensus.test.ts` | an operating point excluded by its **ceiling** reported as if excluded by its **answer** | ✅ |

## 3. Phase 4 — UI scenarios

The inventory is `packages/viz/UX.md`; its per-scenario ledger is § 7.0 there. **87 rows**, with
differentiated states rather than a blanket tick:

| State | Rows | Ids |
|---|---|---|
| ✅ **wave 1** | 32 | `RV-01 04 05 10 12 13 15 16 19` · `PB-01 02 03 04 05 06 10 11 12 13 14` · `ED-11` · `KB-02 03 04 05 08 09 10 15` · `RS-01 06 07` |
| ✅ **run** — driven in a browser against the shipped `data/` | 34 | `RV-02 03 06 07 09 20` · `PB-07 08 15 16 17 18` · `ED-01 02 04 05 06 10 18 19 20 21 22` · `KB-01 06 07 11 12 13 15a` · `RS-02 03 05 08` |
| ✅ **test** — asserted, and the assertion proved to bite | 12 | `RV-08 14` · `ED-03 07 08 09 14 15 16 17` · `KB-15b` · `RS-04` |
| ✅ + ⚠️ — one clause each way | 2 | `RV-18` (editor half run, viewer half unverified) · `ED-23` (in-app half run, `beforeunload` unverified) |
| ⚠️ **unverified** — built and reachable, neither driven nor tested | 4 | `RV-11` `RV-17` `RV-21` `KB-14` |
| 🔲 **re-marked** — the row contradicts the schema, stated rather than papered over (**C30**) | 2 | `ED-12` `ED-13` |
| 🔲 **not built** | 1 | `PB-09` (window selection then loop) |

The seven ⛔ non-negotiable keyboard rows — `KB-01 02 08 10 11 13 14 15` — are all ✅ except
`KB-14`, which is built and unverified.

The scenario classes this matrix originally demanded of every UI feature — happy path, alternate
valid path, invalid input, empty state, loading state, failure and recovery, keyboard and focus,
responsive behaviour — are what those ids enumerate. Four rows are **unverified rather than
untested**, and that distinction is the point of publishing the ledger instead of a count.

## 4. Phase 8 — testing campaign

| Track | Proves | Status |
|---|---|---|
| Property-based fuzzing | no passenger lost, none delivered to the wrong floor, no car over capacity, no negative waits, no deadlock, bounded starvation | ✅ built — 64-case always-on corpus (0 violations), 2 000-case deep tier (**0 violations**; the one it found is fixed) |
| Analytical cross-validation | closed-form agreement across all five buildings | ✅ `oracle/fiveBuildings.test.ts`, `bankCensus.test.ts`; three banks recorded as unmeasurable with mechanisms rather than reconciled (D39) |
| Physics verification | S-curve times vs hand calculations; degenerate short hops | ✅ `validation/physics.test.ts` |
| Statistical self-validation | Phase 3 results re-run as regression | ✅ `crnVarianceReduction`, `nullComparison`, `sequentialStopping`, `operatingPoint` |
| Determinism regression | golden runs replay byte-identically from stored seeds | ✅ `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` |
| Scale & performance | large buildings, long sweeps, memory profile | ✅ `validation/perfScaling.test.ts` — always-on tier asserts **simulation outputs** (legs, kernel events); wall-clock gates are `ELEVATOR_SIM_DEEP=1` (D91) |
| Adversarial edge cases | saturation, single car, all calls one floor, access lockout, all cars out of service, mid-run mode changes | ✅ `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix | every dispatcher × building × traffic; Pareto front over (AWT, energy, WT95) with explicit INDISTINGUISHABLE verdicts | ✅ **landed after this board was retired**, in `f895a16` — `benchmark/matrix.ts` + `matrix.test.ts` (8 cells × 12 profiles, per-cell derived budgets n = 50…200), `benchmark/matrixCensus.test.ts` (opt-in census), `benchmark/phase7Acceptance.ts` (Phase 7's interval at n = 150 on disjoint seeds). **Phase 8 is accepted** (§ D108) |

### Findings from the campaign — all four closed

| # | Finding | Status |
|---|---|---|
| 1 | A published mean beside an abandoned passenger — `fuzz-1001074`, max wait 922.7 s with `awtIsValid: true` | ✅ fixed — a fourth `awtIsValid` ground |
| 2 | An out-of-service car parked at an occupied landing threw out of `run()` and killed the run | ✅ fixed — `#carCanCarry` and `#park` |
| 3 | P5 termination blind to a fleet that never moves at all — 0 of 365 journeys, zero violations | ✅ fixed by strengthening; the bound was not moved |
| 4 | **`fuzz-1000384`** — 1 694.3 s of fleet inactivity with a servable journey outstanding; 592 identical dispatches to a car that had left group control | ✅ **fixed** — a promise a withdrawn car cannot keep is revoked (§ T22-D1). `deadlockIdleBoundS` untouched at 600 s, `PROPERTY_BOUNDS` unchanged line for line, 60 of 60 shipped cells byte-identical. **R22 discharged** |

## 5. Phase 6 — destination dispatch

| Flow / behaviour | Scenario | Status |
|---|---|---|
| The gate metric | TTD beats the baseline with a paired-t interval excluding zero (D27) | ✅ 6a `−1.562 [−1.916, −1.208] s` |
| The reporting clause | AWT and WT95 carry explicit verdicts, including WORSE | ✅ 6a AWT `+0.514`, WT95 `+1.010`, both WORSE and both published |
| Disclosure is worth zero until something prices it | the **`destination-eta-unpriced`** arm vs `eta` on an unzoned building | ✅ 150/150 paired differences exactly zero, every metric. *(This control was the **shipped** `destination-eta` until [§ D112](DECISIONS.md) authored `weights.rideTime: 0.5`. It is now bound to the **configuration** rather than to the id: measurement unchanged, only the name moved. Left bound to the id, the shipped profile's new weight would have falsified this row by a pin regeneration alone.)* |
| Coverage under access control (H-ACCESS-1) | conventional dispatch cannot serve `secure-tower` interfloor traffic at any budget | ✅ 0/30 quotable, 33.5 % unserved, vs 30/30 and 0.00 % |
| Optimization under access control (H-ACCESS-2) | difference-of-differences across two buildings | ✅ measured, and it **REFUTES** the roadmap's mechanism: `+0.982 [+0.584, +1.380] s` |
| Every leg promised, promise kept, promise bites | zero wrong-car boardings on 5 buildings; 70 of 96 legs board a different car than under conventional dispatch | ✅ `sim/destinationDispatch.test.ts` |
| The panel's cost where it binds | Midtown interfloor-mix 4.5 %, D − C | ✅ TTD `+5.94` WORSE, WT95 `+37.34` WORSE, ride `−1.02` BETTER |
| `compare` refuses to gate across passenger models | two arms with different models → headline moves to TTD, `core`'s nine-metric list printed | ✅ `cli/src/cli.test.ts` |
| The refuted mechanism is pinned by a test | the seven mechanism sites stay corrected | ✅ **built** — `validation/documentation.test.ts`, three ways: a claim with no refutation within 400 chars fails, a deleted correction fails, and `estimateCost.ts`'s exclusion is asserted in both directions. All three watched failing. **C23 closed** |
| **The criterion measured on the building it names** | Phase 6's gate on `mixed-use-high-rise`, which § D27 dropped and § D99 owned | ✅ `benchmark/mixedUseHighRise.test.ts` + `saturationCensus.test.ts`, 72 pins. **Met by Level 0** (ΔTTD −21.239 / −2.072 / −2.116, all BETTER); **not met by Level 1** at any measured point |
| The building's own scenario admits no paired comparison | mixed 40/30/30, every `role:"baseline"` profile 0/30 quotable, unserved **rising** as load falls | ✅ measured, reported as counts and never as an interval |
