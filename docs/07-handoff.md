# Handoff — resuming at Phase 6c and Phase 8's last track

Written at a deliberate pause. **Phases 0–5 and 7 are landed and accepted. Phases 6 and 8 are a
foundation only** — in the three-state vocabulary this sentence is checked against, which has no
word for *"every track landed and one finding still open"*. Concretely:

- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against
  the criterion as [`DECISIONS.md` § D27](../DECISIONS.md) **raised** it. 6c (learned control) is
  **deferred out of the phase with reasons**, not dropped. Double-deck operation is configured,
  validated and disclaimed on every run of `vertical-city`, and still not simulated.
- **Phase 8** — all seven built tracks have landed and found four real defects, three of them now
  fixed. The eighth track (the full experiment matrix at a real budget) is not done, and **one
  property violation, `fuzz-1000384`, is open**. Phase 8's own rule is that a failure blocks
  release, so the phase is **not accepted** while it stands.

> **This opening sentence has been wrong twice, in the same place, about the same phase.** It once
> read "Phases 0–5 … are complete; Phases 6, 4 and 8 remain" — asserting Phase 4 both complete and
> outstanding in a single sentence, and contradicting its own status table two lines below
> ([review finding #18](08-review-findings.md)). An agent resuming cold from a brief's first line —
> which is what this document exists for — can skip a whole phase on that. The three places the
> phase set is stated (this line, the table below, and [`CLAUDE.md`](../CLAUDE.md)'s status line)
> are now asserted equal by `packages/experiments/src/validation/documentation.test.ts`, together
> with the rule that no phase may appear in both the complete list and the remaining list.

This document exists so work can resume cold without re-deriving anything. Everything
below was measured by this project, not assumed. Where a published figure turned out not
to hold here, that is recorded too — several did not.

> **Read [`08-review-findings.md`](08-review-findings.md) before planning.** A whole-system
> review on 2026-07-26 produced **21 findings — 1 critical, 13 major, 7 minor**, none of which
> the test suite could catch at the time. Wave 1 worked the register on 2026-07-27 and **all 21 are
> now closed**: 19 fixed, and 2 (#5's fuzzy pattern detector, #11's double-deck dispatch) closed by
> a recorded decision to defer the *capability* to a later phase while removing the thing that made
> it look shipped — each being one of the two remedies its own finding prescribed. Every finding
> carries its disposition and the evidence for it; read those before assuming one still stands.
> The critical finding — the entire `tuning/` module having no non-test caller, which blocked
> Phase 7's acceptance — is closed, and Phase 7 is **accepted**.

---

## 1. Where things stand

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 4 — Visualization | ✅ Viewer, building editor, live metrics overlay, playback from a stored seed; 87-scenario UX ledger |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ **ACCEPTED** — search space, three searches, held-out validation, and a CLI `tune` that calls them |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `watch` |
| **6 — Destination dispatch & learned control** | ⚠️ 6a and 6b accepted against the raised criterion; **6c (learned control) deferred out of the phase**; double-deck still not simulated |
| **8 — Testing campaign** | ⚠️ Seven tracks landed and found four defects; the full experiment matrix is not done and **`fuzz-1000384` is open**, which blocks acceptance |

Phase 7's one undelivered scope bullet — the fuzzy traffic-pattern detector — is marked not-done in
[the roadmap](05-roadmap.md) rather than folded into the ✅. `data/dispatcher-profiles.json` ships a
schema-validated `patternSwitching` block that no runtime code reads; editing it changes nothing.

The same treatment is applied to Phase 6c and to Phase 8's eighth track: both are marked not-done in
the roadmap with their reasons, rather than swept into a neighbouring tick.

> **A vocabulary limitation, reported rather than worked around.**
> `packages/experiments/src/validation/documentation.test.ts` recognises exactly three phase states
> — *landed and accepted*, *a foundation only*, *not started* — and the middle phrase is a poor fit
> for both Phase 6 and Phase 8. The phrase is kept because it is what the guard reads and this
> document does not own that file; the accurate statement is the bullet list above the table. A
> fourth phrase (*"are partially complete"*) is the fix, and it is a `packages/experiments` change.

### Running it

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test          # full suite: 167 files, 3,100 tests, ~345 s — benchmarks execute real replications
```

Two opt-in tiers exist and are **not** part of that run: `ELEVATOR_SIM_FUZZ=deep` runs the
2 000-case fuzz campaign (~360 s), and `ELEVATOR_SIM_DEEP=1` enables the wall-clock scaling
assertions that were moved out of the always-on tier because a timing gate that fails under
concurrent load trains everyone to ignore red ([`DECISIONS.md` § D91](../DECISIONS.md)).

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

**This project shipped eight defects of the form "configurable, unit-tested in isolation,
dead in the shipped path."** It passes every other check the repo runs.

| Defect | How it presented |
|---|---|
| `parkingStrategy: zone-center` | Never moved a car under its own defaults |
| `assignmentMode: split-demand` | Named N cars, never divided the landing |
| `rideTime`, `zoneAffinity`, `predictedDemand` | 0 non-zero evaluations out of 2,142 |
| The entire predictor | Never constructed, never fed, never consulted |
| `multiRoundIsReachableFromSimulation()` | `return true;` — asserted by a test as a guard |
| `seedSetFromReplications` | Existed *to be* the seam; its only caller was a test |
| The whole of `tuning/` | No barrel, no package export, no CLI command — every importer a `*.test.ts`. Asserted closed by the roadmap itself |
| `StageActivity`'s late-arrival counters, `WARNING_CODES.doubleDeckNotSimulated` | On an object `runSimulation()` discards, and a code no shipped path branched on. Both asserted in both directions by their own tests |

Add three more of the same shape that were **not** dead code but stale *numbers*: a published
interval measured before a seam was wired and never regenerated, and two intervals hand-transcribed
with a double rounding. Nothing in the suite re-derived a published interval, so no test could see
any of them. `packages/experiments/src/benchmark/published.test.ts` now does.

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

Both halves are now mechanised — `packages/core/src/dispatch/deadCode.test.ts` for the two `core`
modules and `packages/experiments/src/tuning/deadCode.test.ts` for
`experiments/src/tuning/{search,space,report}`. When this section was written the second did not
exist, and the sentence above was read as though it did: the audit named `experiments/tuning/` and
no test could see it. **A standing requirement stated in prose is not a standing requirement.**

One known gap in the `core` scanner, carried forward rather than fixed here: its export pattern does
not match `export async function`, and it strips comments but not string literals, so a symbol that
names itself in its own error message counts as self-used and is unfalsifiably live. Demonstrated by
removing a real importer and watching the audit stay green. Tracked as **C7**.

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

At 90% confidence on Midtown up-peak AWT (s = 3.60 s, CoV 23%), with `t[n−1]` — which is what this
simulator uses at every `n`:

| Target | ±2 s | ±1 s | ±0.8 s | ±0.5 s | ±0.4 s | ±0.25 s |
|---|---|---|---|---|---|---|
| n | 11 | 37 | 57 | 143 | 222 | 563 |

The doc's flat "50–200" corresponds to a ±0.5–0.8 s target.

> **This table was the deleted normal quantile's answer** (**C19**). It read
> **9 / 36 / 55 / 141 / 220 / 563**; five of those six rows reproduce exactly at `z = 1.6449` and not
> at `t`. `t` is strictly wider, so the published table **understated the budget at every rung** —
> the optimistic direction. A direct consequence of [`DECISIONS.md` § D14](../DECISIONS.md), and
> missed by wave 1's blast-radius scan because that scan covered *published intervals* and this is a
> *planning* table. Re-derived from `studentTQuantile` on 2026-07-28. **No conclusion changes.**

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

**It has now been passed once.** `elevator-sim tune`, searching this dimension from the shipped 8 s
against the real `data/` directory, returned **2.582 s** — with the tuning and holdout seed sets
printed `DISJOINT` and a holdout verdict of `GENERALIZES` at `--validate-reps 150`. That is the
evidence Phase 7's acceptance rests on, and the reason the wrong value stays shipped: it is the only
test in this repository whose answer was known before the machinery existed. A future optimizer that
returns 8 s here has failed, not agreed.

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
| `predicted-demand` (8 s deadband) | −0.006 s [−0.021, +0.010] | INDISTINGUISHABLE |
| `predicted-demand` (3 s deadband) | −0.98 s [−1.28, −0.68] | BETTER |
| `lobby` | **+1.98 s [+1.75, +2.20]** +12.0% | **WORSE** |

> **The second row read `[−0.031, +0.019]` and contradicted the sentence three lines below it.**
> That is the **n = 300** deadband-sweep bound in an n = 500 table; the half-width it implies is
> 0.025 s, against the 0.016 s this section then quotes — which is the value the code actually
> produces. At n = 500 the interval is `[−0.021, +0.010]`, half-width 0.0157 s.
> [Review finding #4](08-review-findings.md), corrected from a re-run of `runPrepositioningStudy()`
> at its own defaults. **The other three rows were re-measured and are unchanged**: at n = 500 the
> Student-t correction is 0.243 %, below the last printed digit in every one.

A measured zero, not an unresolved one: half-width 0.016 s against a 0.3 s target. The
forecast is supplied on 35.40/35.40 reposition decisions and `reposition` fires 0.00
times — the deadband vetoes every move. `zone-center` moves 5.93×/run through the *same*
deadband. Demand was swept 2/4/8/16% to kill the "nothing to learn" excuse; at 4% it is
300/300 bit-identical.

---

## 7. Remaining phases

### Phase 6 — Destination dispatch, access control, learned control

Split into 6a / 6b / 6c by [`DECISIONS.md` § D28](../DECISIONS.md). The interface contract is
[`09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md); full results and the
raised acceptance criterion are in [the roadmap](05-roadmap.md).

- ✅ **6a — destination disclosure.** Accepted. At Midtown interfloor-mix, n = 150 CRN, the priced
  destination is **−1.562 [−1.916, −1.208] s on TTD (BETTER)** — with AWT **+0.514** and WT95
  **+1.010** reported as WORSE rather than hidden, which is what the raised criterion demands.
- ✅ **6b — destination dispatch.** Accepted. Per-passenger assignment, write-once promises,
  a `brokenPromises` counter, and the landing panel rendered at `VIZ_SCHEMA_VERSION = 4`.
- ⬜ **6c — learned control.** `LearnedDispatcher`, an RL policy. **Deferred out of the phase** — it
  shares no interface with 6a or 6b, it strains invariant 8 (is a 400-parameter policy vector a
  declarable tunable?), and its acceptance criterion was stated in the metrics 6b makes
  non-comparable. It needs its own acceptance question before it needs an implementation.
- ⬜ **Double-deck and `vertical-city`** — still the most deferrable scope in the project.
  Configured and validated, **not simulated**, and disclaimed on every run of that building.

**The access-control hypothesis was the interesting one to test, and half of it is refuted.** This
section used to say destination dispatch *should be better under access control, because
authorization and optimization happen in the same step*, and `secure-tower` existed to show it.
Measured:

- **Coverage — CONFIRMED, categorically.** Conventional dispatch does not perform *worse* on Secure
  Tower's interfloor traffic; **it does not perform** — 0 of 30 replications with a quotable AWT,
  18.2 undelivered journeys per run, 33.5 % unserved, because an access-restricted pickup carries no
  credential and every car answers `accessDenied`. The credential arm completes 30 of 30 with 0.00 %
  unserved. Structural, not load-driven, so no arrival rate rescues it and no interval is possible.
- **Optimization — REFUTED.** Difference-of-differences across the two buildings, n = 150 each:
  `Δ_secure − Δ_midtown = +0.982 s [+0.584, +1.380]`, excluding zero on the **positive** side.
  Given the credential, pricing the destination buys **less** where access is controlled. The saving
  is entirely in the credential — a claim about **authorization**, not about **optimization**.

Seven places asserted the refuted mechanism as fact and **no test pinned any of them**, so nothing
went red while they were wrong. Four `core` docstrings were corrected by
[§ T16-D9](../DECISIONS.md); this paragraph, `docs/01` § Zoning and the roadmap's Phase 6 bullet were
corrected on 2026-07-28.

**The real tension to measure — and it turned out to run the other way at the point tested.**
Destination dispatch **cannot defer** assignment, because the passenger must be told which car to
walk to immediately, and that is written up as a documented cost of the approach. Measured at
Midtown interfloor-mix, `eta` deferring 1.5 s is WORSE on TTD by `+1.123 [+0.848, +1.397] s`, on AWT
by `+1.081` and on WT95 by `+1.895`, 0 of 150 replications identical — so at that operating point
the constraint removes a liability. That does **not** generalise: `predictive-balanced` is the
profile that defers and it has ten weights, not one. What the cost *does* look like when it bites is
Phase 6b's 4.5 % row: TTD +5.94 s, WT95 +37.34 s, in-car time −1.02 s. Compare on **TTD**, not AWT —
`core`'s own `comparabilityOf` lists AWT and WT95 among nine metrics that stop being comparable
across the two passenger models, and `compare` now refuses to gate on them across models.

### Phase 4 — Visualization (COMPLETE)

`packages/viz` ships all four scope bullets and both acceptance clauses pass:

- ✅ Web viewer consuming `core` with no reverse dependency — asserted by `viz/src/boundaries.test.ts`
- ✅ Renderer samples `Car.positionAt(t)` at display framerate **between** kernel events
  (`frame/frameAt.ts`, driven by `playback/clock.ts`)
- ✅ Replay from a stored seed, with a **per-field** negative control
- ✅ **Building editor** over the existing JSON schema — four pure modules plus `dev/editor.ts`. It
  never renders a second opinion about legality: every issue comes from `parseBuilding` /
  `resolveBuilding`, and it says which stage produced them (§ D67)
- ✅ **Live metrics overlay** — it suppresses *estimates* and keeps *observations*, and copies
  `awtIsValid` from the summary rather than recomputing it (§ D64)
- ✅ A rendering contract (`VIZ_SCHEMA_VERSION = 4`), a Canvas renderer, and an **87-scenario UX
  ledger** at `packages/viz/UX.md` § 7.0 with per-scenario ids and differentiated states — 78 ✅,
  2 half, 4 built-but-unverified (`RV-11 17 21`, `KB-14`), 2 re-marked against the schema
  (`ED-12 13`), 1 not built (`PB-09`)

**Acceptance:** a stored run replays visually identically, **and the first frame places every car
where the run says it started**; `core` builds and tests with `viz` absent.

> **The second clause is new, and it was added because the first one passed on a wrong picture.**
> The recorder placed every car at its *final* position until its first move — wrong on 4 of the 5
> shipped buildings — and replayed identically anyway, because a replay-identity criterion cannot
> see an error present in both replays. Raised rather than relaxed, per
> [`CLAUDE.md`](../CLAUDE.md) § Working agreements. Also fixed in the same pass: the viewer defaulted
> to throwing on a frame-budget timeout, so **Run failed outright on 3 of the 5 buildings**; it now
> defaults to `onTimeout: 'report'`.

Stack as suggested: plain TypeScript + Canvas, Vite as a **dev-only** bundler. The CLI's `watch`
command exercises the same interpolation loop.

**Read [`DECISIONS.md`](../DECISIONS.md) § D5 and § D15 before extending it.** D5 fixes that the
renderer consumes a *recorded* run rather than a live `Simulation` — a live clock in `core` would
break invariant 3 — and D15 records that the recording schema is deliberately **not** frozen, which
UX.md § 7 overstated. **C2 is closed** — `core` now routes a browser barrel and a Node entry through
an export condition (§ D31), the dev shims are gone, and the import graph is guarded in both
directions (§ D32, § D33).

### Phase 8 — Testing campaign (tracks landed; **not accepted**, one violation open)

| Track | State | Where |
|---|---|---|
| **Property-based fuzzing** | ✅ | `experiments/src/fuzz/` — generator, hand-written shrinker, six properties, 64-case always-on corpus, 2 000-case deep tier |
| Analytical cross-validation, all five buildings | ✅ | `experiments/src/oracle/fiveBuildings.test.ts`, `bankCensus.test.ts` |
| Physics verification | ✅ | `validation/physics.test.ts` |
| Statistical self-validation | ✅ | `validation/{crnVarianceReduction,nullComparison,sequentialStopping,operatingPoint}.test.ts` |
| Determinism regression | ✅ | `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` |
| Scale & performance | ✅ | `validation/perfScaling.test.ts`, `perfSweep.test.ts` (wall-clock gates are opt-in — § D91) |
| Adversarial edge cases | ✅ | `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix + Pareto at a real budget | ⬜ **not done** | — and with it Phase 7's acceptance interval at 50–200 replications, which § Phase 7 of the roadmap assigns here |

**Property-based fuzzing was the highest-value track, and it paid.** Hand-written tests check cases
someone thought of; randomized buildings find the ones nobody did. Four real defects, three fixed:

1. **A published mean beside an abandoned passenger** — `fuzz-1001074` reported mean wait 172.1 s,
   p95 686.4 s, **max 922.7 s**, 67.8 % of legs over 60 s, and `awtIsValid` **true**. Fixed by a
   **fourth `awtIsValid` ground** (starvation past a 900 s horizon); the trend and censoring gates
   both miss a queue that grew enormously and drained just in time. See `docs/03` § Saturation.
2. **A crash reachable the moment out-of-service cars became authorable** — an out-of-service car
   parked at an occupied landing threw a `ModelError` out of `run()` and killed the run, because
   `#loadWhileIdle` boards from a car standing there without consulting the dispatcher. Fixed in
   `#carCanCarry` and `#park`; both clauses are inert on every shipped building (§ D76).
3. **P5 termination was blind to a fleet that never moves** — an all-out-of-service fleet delivered
   0 of 365 journeys and passed all six properties. The idle stretch is now measured per passenger;
   **strictly stronger**, and the bound was not touched (§ D86).
4. 🟡 **`fuzz-1000384` — an open deadlock.** 1 694.3 s of fleet inactivity before the hard deadline
   with journey `j35` (G to 4) servable and outstanding since t = 152.9. Sky-lobby topology, 480
   passengers, `timed-out`. **P5 termination, not P6 starvation, and proven pre-existing** — it
   reproduces to the same decimal at the branch point `c072f97`. The shrinker reduces it in 33 steps
   to a 29-passenger case on a bank whose remaining car is `mode: "independent"`. It belongs to
   `sim/` and `dispatch/`. A fix is in flight; **this brief records the finding, not a verdict.**

Treat any Phase 8 failure as **blocking**. A simulator producing confident numbers from
broken mechanics is worse than one that crashes. That rule is why the phase is marked not accepted
while item 4 stands, rather than accepted with a footnote.

---

## 8. Open debt

| Item | Notes |
|---|---|
| `stats/` consolidation | Statistics live in `reports/statistics.ts` and `runner/stopping.ts`; `docs/01` layout records this as outstanding |
| Profiles bit-identical to `eta` | `eta ≡ fairness-first` survives on both up-peak buildings and is *correct* there (`starvation` is zero for every candidate when no car holds a committed hall call). It still means "9 of 9 beat baseline" counts fewer distinct dispatchers than it sounds |
| `prepositionPlan` | Zero callers — superseded by `resolvePrepositionContext`. **Classified**, not deleted: it is one of the 14 entries in `dispatch/deadCode.test.ts`'s `PUBLIC_API_ONLY`, which is asserted in both directions |
| Mixed-use interval | Reports `unmeasurable` by design: a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so **no** departure-gap threshold is valid there |
| Double-deck operation | Configured and validated on `vertical-city`, **not simulated**; disclaimed on every run of that building, and the disclaimer now reaches `RunRecord` and the CLI report |
| Fuzzy pattern switching | `patternSwitching` is authored in `data/` and schema-validated, and no runtime code reads it. Deferred scope, not a defect to fix in passing — see `DECISIONS.md` § D12 |
| **`fuzz-1000384` — an open P5 deadlock** | The one outstanding Phase 8 property violation, and the reason Phase 8 is not accepted. Pre-existing at `c072f97`, reduced to 29 passengers, belongs to `sim/`/`dispatch/`. Fix in flight |
| Phase 8's full experiment matrix | Every dispatcher × building × traffic with a Pareto front over (AWT, energy, WT95), and **Phase 7's acceptance interval re-measured at 50–200 replications**. The roadmap assigns the latter to Phase 8 explicitly; accepting Phase 7 did not discharge it |
| Phase 6c — learned control | Deferred out of Phase 6 with reasons (§ D28). Needs its own acceptance question first |
| **Phase 6 was never measured on the building its criterion named** | The original gate said *"on the Mixed-Use High-Rise"*; the raise (§ D27) dropped the building and every 6a/6b result is on Midtown Office and Secure Tower. The substitution has good reasons and was never argued, and dropping a named building from a criterion is the shape of a weakening. `mixed-use-high-rise` is also the building whose achieved interval is `unmeasurable` by design. **Not resolved** — Phase 8's full experiment matrix is where it closes |
| `C4` — the sequential stopping rule's budget | `productionStoppingRule` injects `estimateMean`, now Student-t at every `n`, so sequentially-stopped experiments may run marginally more replications. Deliberate and conservative; **needs a decision, not a default** |
| `C5` — a `'z'` label can still print | `reports/compare.ts:607` can print `'z'` as a fallback family label on a convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic, and it is the exact mislabelling finding #14 was about |
| `C7` — two holes in `core`'s dead-code scanner | It does not match `export async function`, and it strips comments but not string literals. Demonstrated to stay green with a real importer removed |
| `C24` — `fuzz/`'s only non-test caller is a test | `campaign.ts` is driven by `corpus.test.ts`. Defensible (a fuzzer's product *is* a test) but weaker than what `tune` gives `tuning/`. A CLI `fuzz` command closes it |
| `C27` — Phase 6a/6b studies are off the package barrel | Reachable at their module paths with `regeneratePins.ts` as the non-test caller, but not on `benchmark/index.ts` or `src/index.ts`. Name list in § D62; both files must change in one commit |
| `C28` — a doc guard couples `core`'s suite to `viz` on disk | `core/src/sim/moduleTree.test.ts` compares `docs/01`'s tree against `packages/*/src` in both directions, so removing `packages/viz` makes its rows phantoms and reddens **core**. Invariant 6 still holds — a doc coupling, not an import — but the guard should scope its directory set to packages that exist |
| `C29` — `viz/editor/` does not exist | The editor's four modules are flat files at `packages/viz/src/`. Moving them into `viz/editor/` and adding the line to `docs/01` must happen in **one** commit, because the guard above is bidirectional |
| `C30` — two UX rows contradict the schema | `ED-12` ("a zero-car bank is a warning") against `bankConfigSchema`'s *a bank must have at least one car*, and `ED-13`'s per-car `servesFloors`, which the schema does not have. `ED-12` is a `core` schema question |
| `C32` — the fuzz generator picks call types blind to the profile | `fuzz/generate.ts` can name a call type the profile cannot carry a destination for; `run.ts` works around it in `withCallType`. A real corpus extension |
| `C20` — a stale figure in a `core` docstring | `analytical/upPeak.ts` still cites *"102.8 % … instead of 26.3 %"* for `deriveUpPeakTerms`, which reproduces **only at `tp = 1.2 s`** — a value no car of that bank declares. At the declared 1.75 s it is 82.5 % / 21.2 %. **Verified still present 2026-07-28**; the figures themselves are transcribed from Phase 8's oracle track and are not re-measured here |
| `C21` — an omission in a `core` docstring | `metrics/summarize.ts`'s `DepartureGapBracket` names three empty brackets and does not mention that `vertical-city/zone-5-local`'s band is **1.23 s** — 5× tighter than the next and 29× below the widest, i.e. the case where the bracket is technically non-empty and practically meaningless. **Verified still present 2026-07-28**; the figure is transcribed, not re-measured here |
| Phase-status vocabulary | `validation/documentation.test.ts` recognises three phase states and none of them fits *"tracks landed, one finding open"*. See § 1 |

**Closed since this table was last written**, each verified rather than taken on report: `C2`
(`core` routes a browser barrel and a Node entry through an export condition — § D31–§ D33, and the
viz dev shims are deleted from disk), `C10`, `C11`, `C15`, `C16`, `C19`, `C22`, `C23`, `C26`, `C31`.

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
