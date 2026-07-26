# Handoff — resuming at Phase 6

Written at a deliberate pause. Phases 0–5 and 7 are complete; **Phases 6, 4 and 8 remain**.

This document exists so work can resume cold without re-deriving anything. Everything
below was measured by this project, not assumed. Where a published figure turned out not
to hold here, that is recorded too — several did not.

---

## 1. Where things stand

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ Search space, successive halving, Pareto reporting |
| CLI | ✅ `list`, `run`, `compare`, `watch` |
| **6 — Destination dispatch & learned control** | ⬜ **NOT STARTED** |
| **4 — Visualization** | ⬜ **NOT STARTED** |
| **8 — Testing campaign** | ⬜ **NOT STARTED** |

### Running it

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test          # full suite, ~150s — benchmarks execute real replications
```

---

## 2. Invariants — do not violate

These are in [`CLAUDE.md`](../CLAUDE.md) and every one exists because breaking it would
silently invalidate results rather than fail loudly.

1. `Car.estimateCost()` is **pure** — defended by three tests including a deep-frozen,
   sealed-Map snapshot and a source-level guard that the module cannot import an RNG
2. No global RNG — only named streams on an injected `StreamSet`
3. No wall-clock time in `core/`
4. Event ordering is total by `(time, sequence)` — ties are structurally impossible
5. Every persisted record carries its seed
6. `core/` never imports `viz/`
7. Anything tunable is **data, not code** — no `if (strategy === ...)`
8. Every tunable declares its schema

---

## 3. Standing requirements — learned the hard way

### The integration seam must have an owner

**This project shipped five defects of the form "configurable, unit-tested in isolation,
dead in the shipped path."** It passes every other check the repo runs.

| Defect | How it presented |
|---|---|
| `parkingStrategy: zone-center` | Never moved a car under its own defaults |
| `assignmentMode: split-demand` | Named N cars, never divided the landing |
| `rideTime`, `zoneAffinity`, `predictedDemand` | 0 non-zero evaluations out of 2,142 |
| The entire predictor | Never constructed, never fed, never consulted |
| `multiRoundIsReachableFromSimulation()` | `return true;` — asserted by a test as a guard |

The root cause of the largest instance: Phase 5 partitioned work by module directory and
`sim/simulation.ts` was in **no agent's ownership list**. Each module was built correctly.
Nobody owned the wiring.

**Therefore:** when parallelising, one agent owns the integration seam, and liveness is
**measured, not read**. "It looks wired" is not evidence. Instrument a real run and count
invocations.

### Standing dead-code audit

For every exported symbol in `dispatch/policies/`, `dispatch/predictor/` and
`experiments/tuning/`, count callers outside its own module and tests. Every zero must be
classified as dead or as deliberate public API. Do this each phase.

---

## 4. Measured facts that bound what you may claim

### Resolution limits — two numbers, not one

| Comparison regime | ρ | Smallest detectable effect (n=100) |
|---|---|---|
| Near-neighbour weight vectors | 0.98–1.00 | **0.20 s (1.3% of AWT)** at 80% power |
| Structurally different dispatchers | ~0.61 | **1.9 s (12%)** at 80% power — ~10× coarser |

An improvement below these is **not measurable at that budget**. Report it as "below the
resolution limit", never as a win.

### CRN is regime-dependent — the literature's figure does not hold universally

`docs/03` originally claimed ~94% variance reduction and 5–20× fewer runs, from published
sources. Measured here:

| Comparison | ρ | Reduction | Factor |
|---|---|---|---|
| `eta` vs `eta` + 0.1·distance | 0.997 | **99.69%** | **324×** |
| `eta` vs `eta` + 0.8·distance | 0.903 | 89.77% | 9.8× |
| `eta` vs `nearest-car` | 0.608 | **43.75%** | **1.8×** |

Synchronization is fine — this was investigated. Unequal marginal variances (150.8 vs
62.5 s²) cap the bottom row at 71.9% even at ρ=1. **Budget replications by arm similarity.**

### Flat plateaus, not noise

Weight perturbations below the decision-flip threshold (δ ≤ 0.03) produce **bit-identical
runs** — exactly zero gradient over finite regions. Any finite-difference method stalls.
An optimizer must detect and escape plateaus.

### Replication budget by target precision

At 90% confidence on Midtown up-peak AWT (s = 3.60 s, CoV 23%):

| Target | ±2 s | ±1 s | ±0.8 s | ±0.5 s | ±0.4 s | ±0.25 s |
|---|---|---|---|---|---|---|
| n | 9 | 36 | 55 | 141 | 220 | 563 |

The doc's flat "50–200" corresponds to a ±0.5–0.8 s target.

### `nearest-car` is a poor reference arm

It is the **only** profile that saturates, which caps the replication budget at n=287 on
Midtown and makes ~0.8 s a permanent resolution floor there. Prefer `collective` or `eta`.

### CRN pairing quality is per-building

Garden Apartments ρ=0.90; Midtown ρ=0.62. Not a constant.

---

## 5. Known-answer tests — validate new machinery against these

### The 2 s deadband (deliberately left un-fixed)

Phase 5 swept `idle.repositionThresholdS` on Garden Apartments, `predictive-balanced`,
n=300, against a `stay` baseline of 16.31 s AWT:

| deadband | 8 s | 6 s | 5 s | 4 s | 3 s | **2 s** | 1 s | 0 s |
|---|---|---|---|---|---|---|---|---|
| Δ AWT | −0.006 | −0.021 | −0.217 | −0.430 | −0.792 | **−1.110** | −0.881 | −0.623 |

**Interior optimum at 2 s.** The shipped profile carries **8 s**, which is why predictive
pre-positioning measures exactly zero — its own deadband vetoes every move. This is left
as-is on purpose: any optimizer that rediscovers ~2 s blind has validated itself.
**Do not hand-edit it to 2 s.**

### Closed-form RTT residuals

The simulator does not reproduce the closed form's arithmetic — no faithful simulator
would, because the formula ignores acceleration entirely. It reproduces the *physical
system* the formula describes:

| | Raw divergence | After charging documented simplifications |
|---|---|---|
| Midtown Office | +27.5% INT / −23.2% %POP | **0.001%** |
| Garden Apartments | +7.5% / −7.1% | **0.69%** |

Pushing those simplifications *into* the simulator via per-car config (huge acceleration,
zero dwell) collapses its round trip onto the textbook figure at −0.4%.

**Why Garden agrees better despite being the short building:** the governing quantity is
floor pitch relative to `v²/a`, the distance needed to reach rated speed. Midtown's 2.5 m/s
car needs 6.25 m against a 3.8 m pitch and *never* reaches rated speed; Garden's 0.63 m/s
hydraulic needs 0.66 m and spends most of a hop at rated speed. A slow hydraulic is
**closer** to the constant-velocity idealisation than a fast traction car.

### Determinism

Same seed under CRN gives **bit-identical** paired differences — exactly zero on all 19
metrics, not "an interval containing zero". Across 40 disjoint seed pairs, 38/40 intervals
contained zero (5.0% rejection against nominal 5%).

---

## 6. Headline result so far

**Predictive pre-positioning, fully connected, shows no measurable improvement — and naive
`zone-center` parking beats it by 29.7%.**

Garden Apartments, n=500, CRN, one field changed, `stay` baseline 16.45 s:

| Strategy | Δ AWT | Verdict |
|---|---|---|
| `zone-center` | **−4.88 s [−5.27, −4.49]** −29.7% | BETTER |
| `predicted-demand` (8 s deadband) | −0.006 s [−0.031, +0.019] | INDISTINGUISHABLE |
| `predicted-demand` (3 s deadband) | −0.98 s [−1.28, −0.68] | BETTER |
| `lobby` | **+1.98 s [+1.75, +2.20]** +12.0% | **WORSE** |

A measured zero, not an unresolved one: half-width 0.016 s against a 0.3 s target. The
forecast is supplied on 35.40/35.40 reposition decisions and `reposition` fires 0.00
times — the deadband vetoes every move. `zone-center` moves 5.93×/run through the *same*
deadband. Demand was swept 2/4/8/16% to kill the "nothing to learn" excuse; at 4% it is
300/300 bit-identical.

---

## 7. Remaining phases

### Phase 6 — Destination dispatch, access control, learned control

- `DestinationDispatcher` — destination known at call time. **Changes the passenger model
  fundamentally**, which is why it was deferred past v1.
- Access-control integration. The interesting hypothesis to test: destination dispatch
  should be *better* under access control, because authorization and optimization happen
  in the same step. `secure-tower` exists for this.
- `LearnedDispatcher` — RL policy. Accept component-level nondeterminism; keep the
  environment deterministic so variance is attributable to the policy, not the world.
- Double-deck and `vertical-city` — the most deferrable scope in the project.

**Note the real tension to measure:** destination dispatch **cannot defer** assignment,
because the passenger must be told which car to walk to immediately. That is a documented
cost of the approach and this simulator can quantify it. Compare on **TTD**, not AWT —
AWT alone unfairly penalises it.

### Phase 4 — Visualization

- Web viewer consuming `core` with no reverse dependency
- Renderer samples `Car.positionAt(t)` at display framerate **between** kernel events —
  that method has existed since Phase 1 for exactly this
- Building editor over the existing JSON schema (which already validates)
- Replay from a stored seed — already built and validated in Phase 3, including a
  negative control proving seed+1 does *not* reproduce

**Acceptance:** a stored run replays visually identically; `core` builds and tests with
`viz` absent.

Suggested stack: plain TypeScript + Canvas, Vite as a **dev-only** bundler. Keeps the
no-dependency discipline. The CLI's `watch` command already exercises the same
interpolation loop, so borrow from it.

### Phase 8 — Testing campaign

The largest remaining phase; replication-hungry. Tracks:

| Track | Proves |
|---|---|
| Analytical cross-validation | Closed-form agreement across **all five** buildings, not just the two done |
| Physics verification | S-curve times vs hand calculations; degenerate short-hop cases |
| Statistical self-validation | Already done in Phase 3 — re-run as regression |
| **Property-based fuzzing** | Randomized buildings/traffic: no passenger lost, none delivered to the wrong floor, no car over capacity, no negative waits, no deadlock, bounded starvation |
| Determinism regression | Golden runs replay byte-identically from stored seeds |
| Scale & performance | 100-floor building, 20k-replication sweep, memory profile |
| Adversarial edge cases | Saturation, single car, all calls one floor, access lockout, all cars out of service, mid-run mode changes |
| Full experiment matrix | Every dispatcher × building × traffic, Pareto front over (AWT, energy, WT95), with explicit INDISTINGUISHABLE verdicts |

**Property-based fuzzing is the highest-value track.** Hand-written tests check cases
someone thought of; randomized buildings find the ones nobody did. "Passenger silently
lost" and "delivered to the wrong floor" are exactly the bugs that hide behind a plausible
average waiting time.

Treat any Phase 8 failure as **blocking**. A simulator producing confident numbers from
broken mechanics is worse than one that crashes.

---

## 8. Open debt

| Item | Notes |
|---|---|
| `stats/` consolidation | Statistics live in `reports/statistics.ts` and `runner/stopping.ts`; `docs/01` layout records this as outstanding |
| Three profiles bit-identical to `eta` | "8 of 8 beat baseline" overstates how many distinct dispatchers exist |
| `prepositionPlan` | Zero callers — superseded by `resolvePrepositionContext`; classify or delete |
| Mixed-use interval | Reports `unmeasurable` by design: a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so **no** departure-gap threshold is valid there |

---

## 9. How to work here

- Build → adversarial review → conditional fix → gate → integration verify. **Every phase
  so far has needed a follow-up; none passed its gate clean first time.** That is evidence
  the gates are set right, not that something is wrong.
- Gates must be told: *determine whether this is true, do not make it true.* The Phase 2
  gate refuted a stated prediction, the Phase 3 gate found the project's own CRN claim
  wrong by 10×, and the Phase 5 gate reported its headline feature producing exactly zero.
  All three were successes.
- Reviewers must **run things**, not read them. Agents have reported green suites that
  were red, and a tautological guard survived being flagged *and* reported fixed.
- Never weaken an acceptance criterion to pass. Raise it.
