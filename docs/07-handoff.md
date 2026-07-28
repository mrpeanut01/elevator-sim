# Handoff — resuming at Phase 6

Written at a deliberate pause. **Phases 0–3, 5 and 7 are landed and accepted. Phase 4 is a
foundation only. Phases 6 and 8 are not started.**

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
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ **ACCEPTED** — search space, three searches, held-out validation, and a CLI `tune` that calls them |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `watch` |
| **4 — Visualization** | ⚠️ **FOUNDATION ONLY** — contract, frame producer, replay harness, Canvas renderer, 85-scenario UX inventory. Building editor and live metrics overlay unbuilt |
| **6 — Destination dispatch & learned control** | ⬜ **NOT STARTED** |
| **8 — Testing campaign** | ⬜ **NOT STARTED** |

Phase 7's one undelivered scope bullet — the fuzzy traffic-pattern detector — is marked not-done in
[the roadmap](05-roadmap.md) rather than folded into the ✅. `data/dispatcher-profiles.json` ships a
schema-validated `patternSwitching` block that no runtime code reads; editing it changes nothing.

### Running it

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test          # full suite, ~200s — benchmarks execute real replications
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

### Phase 4 — Visualization (foundation landed; two scope bullets unbuilt)

`packages/viz` exists. What is built:

- ✅ Web viewer consuming `core` with no reverse dependency — asserted by `viz/src/boundaries.test.ts`
- ✅ Renderer samples `Car.positionAt(t)` at display framerate **between** kernel events
  (`frame/frameAt.ts`, driven by `playback/clock.ts`)
- ✅ Replay from a stored seed, with a **per-field** negative control
- ✅ A rendering contract (`VIZ_SCHEMA_VERSION = 2`), a minimal Canvas renderer, and an
  **85-scenario UX inventory** at `packages/viz/UX.md` with per-scenario ids
- ⬜ **Building editor** over the existing JSON schema — inventoried (UX.md § 4) and **not built**
- ⬜ **Live metrics overlay** — **not built**

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
UX.md § 7 overstated. Wave 2 fans out against that contract; one blocker is tracked as **C2**:
`core`'s barrel re-exports `loadConfig`, which imports `node:fs/promises`, so any browser import of
`@elevator-sim/core` throws at module evaluation. An fs-free subpath export is needed; the dev
server works around it.

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
| Profiles bit-identical to `eta` | `eta ≡ fairness-first` survives on both up-peak buildings and is *correct* there (`starvation` is zero for every candidate when no car holds a committed hall call). It still means "9 of 9 beat baseline" counts fewer distinct dispatchers than it sounds |
| `prepositionPlan` | Zero callers — superseded by `resolvePrepositionContext`. **Classified**, not deleted: it is one of the 14 entries in `dispatch/deadCode.test.ts`'s `PUBLIC_API_ONLY`, which is asserted in both directions |
| Mixed-use interval | Reports `unmeasurable` by design: a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so **no** departure-gap threshold is valid there |
| Double-deck operation | Configured and validated on `vertical-city`, **not simulated**; disclaimed on every run of that building. Implementing it is Phase 6 |
| Fuzzy pattern switching | `patternSwitching` is authored in `data/` and schema-validated, and no runtime code reads it. Deferred scope, not a defect to fix in passing — see `DECISIONS.md` § D12 |
| `C4` — the sequential stopping rule's budget | `productionStoppingRule` injects `estimateMean`, now Student-t at every `n`, so sequentially-stopped experiments may run marginally more replications. Deliberate and conservative; **needs a decision, not a default** |
| `C7` — two holes in `core`'s dead-code scanner | It does not match `export async function`, and it strips comments but not string literals. Demonstrated to stay green with a real importer removed |
| `C2` — `core` is not browser-importable | The barrel re-exports `loadConfig`, which imports `node:fs/promises`. Blocks Phase 4's wave 2 |

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
