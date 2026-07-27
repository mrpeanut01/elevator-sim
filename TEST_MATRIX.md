# Test matrix

Scenario-level coverage. Component tests alone do not close a row — this project's dominant defect
class passes every component test it has.

Legend: ⬜ not started · 🟡 in progress · ✅ passing · ❌ failing · ⚪ n/a

---

## 1. Wave 1 — correctness foundation

| Flow / behaviour | Test type | Scenario | Owner | Status |
|---|---|---|---|---|
| Phase 7 tuning reachable from the package surface | integration | every `tuning/` entry point has a non-test importer; `@elevator-sim/experiments` re-exports them | T1 | ⬜ |
| CLI `tune` runs a real search | e2e | `sim -- tune` on a shipped building produces a candidate and a held-out verdict | T1 | ⬜ |
| CLI `tune` — invalid input | e2e | unknown building / unknown profile / n below the resolution floor → clear error, non-zero exit | T1 | ⬜ |
| Experiments dead-code audit | mechanical | every export of `tuning/{search,space,report}` has a real importer or an allowlist entry stating why | T1 | ⬜ |
| Published paired interval uses t(n−1) | unit | `pairedDifferenceEstimate` at n=26 → `method:'t'`, `df:25`; Monte-Carlo coverage ≥ 95% | T2 | ⬜ |
| Sequential stopping keeps its own z crossover | unit | the stopping rule's n>25 switch is unchanged by the above | T2 | ⬜ |
| `compare` distinguishes identical from indistinguishable | e2e | `--a eta --b eta` → names the case identical, does **not** print "Raise --reps" | T2 | ⬜ |
| `compare` reproduce line reproduces | e2e | parse the printed `reproduce:` line, re-run it, assert byte-identical verdict | T2 | ⬜ |
| Every search-space dimension is live | integration | for each of the 48 dimensions, two profiles differing only in it produce different trajectories on ≥1 shipped building — or the dimension declares why not | T3 | ⬜ |
| `idle.predictorHorizonS` | integration | moves a decision at the shipped defaults, or declares an `activeWhen` that deactivates it | T3 | ⬜ |
| `answer.reopenOnLateArrival` | integration | a late-arrival reopen is emitted by a real run, or the knob is removed with a recorded decision | T3 | ⬜ |
| `answer.overloadThreshold` | integration | can bind given boarding stops at 0.8 × rated, or its range/decision is recorded | T3 | ⬜ |
| Double-deck cars | integration | a `doubleDeck: true` car is either simulated as paired, or `loadConfig` warns into every run record | T3 | ⬜ |
| `patternSwitching` | integration | two configs differing only in `weightSetsByPattern` differ in trajectory, or the roadmap bullet is marked not-done | T3 | ⬜ |
| Doc claims match code | consistency | phase set agrees across `CLAUDE.md`, `README.md`, `docs/07-handoff.md`; docs' JSON examples parse and satisfy their gates; docs/01's module tree matches disk | T4 | ⬜ |
| `core` builds and tests with `viz` absent | build | invariant 6, in its strong form once `viz` exists | T5 | ⬜ |
| Stored run replays visually identically | integration | replay from a stored seed reproduces the same frame sequence | T5 | ⬜ |

## 2. Regression — must stay green through every merge

| Guard | What it protects | Status |
|---|---|---|
| `core/src/sim/seam.test.ts` | behavioural liveness of dispatch behaviours | ✅ baseline |
| `core/src/dispatch/deadCode.test.ts` | mechanical dead-export audit | ✅ baseline |
| `estimateCost` purity (3 guards) | invariant 1 | ✅ baseline |
| No global RNG / no wall-clock in `core/` | invariants 2, 3 | ✅ baseline |
| Closed-form RTT oracle | correctness oracle | ✅ baseline |
| CRN determinism — same seed, bit-identical paired differences | invariant 4, 5 | ✅ baseline |

## 3. Phase 4 — UI scenarios (wave 2, seeded by T5's flow inventory)

Rows are placeholders until T5 delivers the role / task / success-condition inventory. Every UI
feature must carry: primary happy path, alternate valid path, invalid input, empty state, loading
state, failure and recovery, keyboard and focus behaviour, responsive behaviour.

| Flow | Scenario class | Status |
|---|---|---|
| Load a building and watch a run | happy path | ⬜ |
| Load a building and watch a run | empty state — no building selected | ⬜ |
| Load a building and watch a run | error — malformed building JSON | ⬜ |
| Replay from a stored seed | happy path | ⬜ |
| Replay from a stored seed | error — seed/record mismatch | ⬜ |
| Building editor — edit floors, banks, cars, zones | happy path | ⬜ |
| Building editor — invalid geometry | validation & recovery | ⬜ |
| Live metrics overlay | saturated run → suppressed statistics surfaced, not averaged | ⬜ |
| Playback transport (play/pause/scrub/speed) | keyboard & focus | ⬜ |
| All views | responsive behaviour | ⬜ |

## 4. Phase 8 — testing campaign (wave 4)

| Track | Proves | Status |
|---|---|---|
| Property-based fuzzing | no passenger lost, none delivered to the wrong floor, no car over capacity, no negative waits, no deadlock, bounded starvation | ⬜ |
| Analytical cross-validation | closed-form agreement across all five buildings | ⬜ |
| Physics verification | S-curve times vs hand calculations; degenerate short hops | ⬜ |
| Statistical self-validation | Phase 3 results re-run as regression | ⬜ |
| Determinism regression | golden runs replay byte-identically from stored seeds | ⬜ |
| Scale & performance | 100-floor building, 20k-replication sweep, memory profile | ⬜ |
| Adversarial edge cases | saturation, single car, all calls one floor, access lockout, all cars out of service, mid-run mode changes | ⬜ |
| Full experiment matrix | every dispatcher × building × traffic; Pareto front over (AWT, energy, WT95) with explicit INDISTINGUISHABLE verdicts | ⬜ |
