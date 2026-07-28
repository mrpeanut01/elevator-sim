# Test matrix

Scenario-level coverage. Component tests alone do not close a row — this project's dominant defect
class passes every component test it has.

Legend: ⬜ not started · 🟡 in progress · ✅ passing · ❌ failing · ⚪ n/a

**Suite as of 2026-07-28: 167 files, 3,100 tests (3,092 passing, 8 skipped), `tsc -b` clean.**

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
| `core` builds and tests with `viz` absent | build | invariant 6, in its strong form once `viz` exists | T5 | ⚠️ see **C28** — the *import* direction is asserted by `viz/src/boundaries.test.ts`; the *doc-tree* guard in `core` currently reddens if `packages/viz` is deleted |
| Stored run replays visually identically | integration | replay from a stored seed reproduces the same frame sequence, with a per-field negative control | T5 | ✅ |
| **The first frame places every car where the run says it started** | integration | the raised Phase 4 clause (**C16**), asserted on all five buildings by `describe.each(BUILDING_IDS)` | T8 | ✅ |

## 2. Regression — must stay green through every merge

| Guard | What it protects | Status |
|---|---|---|
| `core/src/sim/seam.test.ts` | behavioural liveness of dispatch behaviours | ✅ |
| `core/src/dispatch/deadCode.test.ts` | mechanical dead-export audit | ✅ — two scanner holes remain open as **C7** |
| `experiments/src/tuning/deadCode.test.ts` | the same audit for `tuning/{search,space,report}` | ✅ |
| `estimateCost` purity (3 guards) | invariant 1 | ✅ |
| No global RNG / no wall-clock in `core/` | invariants 2, 3 | ✅ |
| Closed-form RTT oracle | correctness oracle | ✅ — now across **all five** buildings |
| CRN determinism — same seed, bit-identical paired differences | invariants 4, 5 | ✅ |
| `benchmark/published.test.ts` | a published number cannot appear without a study behind it, nor change in silence | ✅ |
| `viz/src/boundaries.test.ts` | invariant 6, plus the no-DOM rule with positive controls (D66) | ✅ |
| `core/src/browser.test.ts` + the import-graph guard | no `node:` builtin reachable from the browser barrel (D31–D33) | ✅ |

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
| Property-based fuzzing | no passenger lost, none delivered to the wrong floor, no car over capacity, no negative waits, no deadlock, bounded starvation | ✅ built — 64-case always-on corpus (0 violations), 2 000-case deep tier (**1 violation, open**) |
| Analytical cross-validation | closed-form agreement across all five buildings | ✅ `oracle/fiveBuildings.test.ts`, `bankCensus.test.ts`; three banks recorded as unmeasurable with mechanisms rather than reconciled (D39) |
| Physics verification | S-curve times vs hand calculations; degenerate short hops | ✅ `validation/physics.test.ts` |
| Statistical self-validation | Phase 3 results re-run as regression | ✅ `crnVarianceReduction`, `nullComparison`, `sequentialStopping`, `operatingPoint` |
| Determinism regression | golden runs replay byte-identically from stored seeds | ✅ `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` |
| Scale & performance | large buildings, long sweeps, memory profile | ✅ `validation/perfScaling.test.ts` — always-on tier asserts **simulation outputs** (legs, kernel events); wall-clock gates are `ELEVATOR_SIM_DEEP=1` (D91) |
| Adversarial edge cases | saturation, single car, all calls one floor, access lockout, all cars out of service, mid-run mode changes | ✅ `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix | every dispatcher × building × traffic; Pareto front over (AWT, energy, WT95) with explicit INDISTINGUISHABLE verdicts | ⬜ **not started** — carries Phase 7's acceptance interval at 50–200 replications with it |

### Open findings from the campaign

| # | Finding | Status |
|---|---|---|
| 1 | A published mean beside an abandoned passenger — `fuzz-1001074`, max wait 922.7 s with `awtIsValid: true` | ✅ fixed — a fourth `awtIsValid` ground |
| 2 | An out-of-service car parked at an occupied landing threw out of `run()` and killed the run | ✅ fixed — `#carCanCarry` and `#park` |
| 3 | P5 termination blind to a fleet that never moves at all — 0 of 365 journeys, zero violations | ✅ fixed by strengthening; the bound was not moved |
| 4 | **`fuzz-1000384`** — 1 694.3 s of fleet inactivity with a servable journey outstanding | ❌ **OPEN.** Pre-existing at `c072f97`; reduced to 29 passengers; belongs to `sim/`/`dispatch/`. Blocks Phase 8's acceptance |

## 5. Phase 6 — destination dispatch

| Flow / behaviour | Scenario | Status |
|---|---|---|
| The gate metric | TTD beats the baseline with a paired-t interval excluding zero (D27) | ✅ 6a `−1.562 [−1.916, −1.208] s` |
| The reporting clause | AWT and WT95 carry explicit verdicts, including WORSE | ✅ 6a AWT `+0.514`, WT95 `+1.010`, both WORSE and both published |
| Disclosure is worth zero until something prices it | shipped `destination-eta` vs `eta` on an unzoned building | ✅ 150/150 paired differences exactly zero, every metric |
| Coverage under access control (H-ACCESS-1) | conventional dispatch cannot serve `secure-tower` interfloor traffic at any budget | ✅ 0/30 quotable, 33.5 % unserved, vs 30/30 and 0.00 % |
| Optimization under access control (H-ACCESS-2) | difference-of-differences across two buildings | ✅ measured, and it **REFUTES** the roadmap's mechanism: `+0.982 [+0.584, +1.380] s` |
| Every leg promised, promise kept, promise bites | zero wrong-car boardings on 5 buildings; 70 of 96 legs board a different car than under conventional dispatch | ✅ `sim/destinationDispatch.test.ts` |
| The panel's cost where it binds | Midtown interfloor-mix 4.5 %, D − C | ✅ TTD `+5.94` WORSE, WT95 `+37.34` WORSE, ride `−1.02` BETTER |
| `compare` refuses to gate across passenger models | two arms with different models → headline moves to TTD, `core`'s nine-metric list printed | ✅ `cli/src/cli.test.ts` |
| The refuted mechanism is pinned by a test | no test asserts that the seven mechanism sites stay corrected | ❌ **not built** — see the recommendation in `AGENT_STATUS.md` **C23** |
