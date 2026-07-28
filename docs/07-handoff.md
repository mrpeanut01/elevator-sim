# Handoff — resuming at Phase 6c and Phase 9

**Phases 0–5, 7 and 8 are landed and accepted. Phase 6 is partially complete.** A cold reader needs
the shape of both:

<!-- The sentence above is parsed by validation/documentation.test.ts. Its phase list must match
     § 1's table, README.md § Status and CLAUDE.md's status line, all four. -->


- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against
  the criterion [`DECISIONS.md` § D27](../DECISIONS.md) **raised**, and that criterion has now been
  measured on the building it names ([§ D100](../DECISIONS.md)). The gate is **met by the Level-0
  arm and not met by the Level-1 panel at any measured point** — both halves are the result. 6c
  (learned control) is **deferred out of the phase with reasons**, not dropped. Double-deck
  operation is configured, validated and disclaimed on every run of `vertical-city`, and still not
  simulated.
- **Phase 8** — **both blocking property violations are closed**, and neither was closed by moving a
  bound. The eighth track — the full experiment matrix and Pareto front at a real budget, which
  carries Phase 7's acceptance interval at 50–200 replications — **landed in `f895a16`**, so both
  halves of the criterion (*every track lands, **and** no property violation is outstanding*) now
  pass and the phase is accepted ([§ D108](../DECISIONS.md)). § D102 recorded the *partial* verdict
  that this supersedes; it is left standing as the record of why the phase was not rounded up
  before the measurement existed.

> **This opening sentence has been wrong twice, in the same place, about the same phase.** It once
> read "Phases 0–5 … are complete; Phases 6, 4 and 8 remain" — asserting Phase 4 both complete and
> outstanding in a single sentence, and contradicting its own status table two lines below
> ([review finding #18](08-review-findings.md)). An agent resuming cold from a brief's first line —
> which is what this document exists for — can skip a whole phase on that. The three places the
> phase set is stated (this line, the table below, and [`CLAUDE.md`](../CLAUDE.md)'s status line)
> are asserted equal by `packages/experiments/src/validation/documentation.test.ts`, together
> with the rule that no phase may appear in both the complete list and the remaining list.

This document exists so work can resume cold without re-deriving anything. Everything below was
measured by this project, not assumed, and every figure names where it came from. **Where a
published figure turned out not to hold here, that is recorded too — several did not**, including
two handed to this task that did not reproduce.

### What has moved since `f895a16`, and what has not

**No phase status has changed.** Four things did, and each is a correctness fix in shipped code
rather than new capability:

| | |
|---|---|
| **`destination-eta` now weights `rideTime` at 0.5** | It shipped weighting `waitTime` only — a weight vector identical to `eta`'s — so the destination reached `estimateCost` and changed no decision, **bit-identical to `eta` at 8 of 8 matrix cells**. Any sentence in any document saying it is bit-identical to `eta`, weights `waitTime` only, or that the promotion is blocked, is **wrong**. [§ D112](../DECISIONS.md) |
| **The viewer and `elevator-sim watch` stopped printing a suppressed mean** | `render/canvas.ts` drew `mean wait so far 87.7 s` one line below its own `AWT suppressed` banner, on the `<canvas role="img">` whose `aria-label` said the mean did not exist; `watch` did the same on **both** of its render paths, which no prior report had caught. [§ D111](../DECISIONS.md) |
| **The ninth dead seam, and with it the whole `'no-intervals'` half of `benchmark/`** | All **five** categorical studies had no non-test caller, not one. `benchmark/livenessSuite.ts` is the driver and the guard now derives its entry-point set from the directory. [§ D114](../DECISIONS.md) |
| **`C7` — the two holes in `core`'s dead-code scanner** | Closed. Both watched failing first; **no new dead exports surfaced**, and the allowlist is unchanged in both directions. [§ D114](../DECISIONS.md) |

**What did *not* move, and should not be read as having moved:** every phase verdict, every published
interval outside the `destination-eta` rows, the four ⚠️ UX rows, and `C24`, `C27`, `C30`, `C32`,
`C4`, `C5`. The pin table moved **40 rows changed, 12 added, 0 removed, all `destination-eta`**.

### What wave 5 moved — the open-debt register, and still no phase verdict

Wave 5 (2026-07-28, board at [`WAVE5_PLAN.md`](../WAVE5_PLAN.md)) worked the nine items § D115 left
open. **No phase status changed, and none was ever in scope.** Eight lanes landed:

| | |
|---|---|
| **`C30` — a carless bank is an error at *both* gates** | The schema did **not** move; `ED-12`'s row was the thing that was wrong. `resolveBuilding` was **raised** to agree with `bankConfigSchema`, which it had been silently contradicting, and `ISSUE_CODES.emptyBank` — declared in the vocabulary and emitted by **nothing anywhere in the repository** — now fires. Measured: a carless bank publishes `awtIsValid: true` on **ten of twelve seeds**. [§ D116](../DECISIONS.md) |
| **`C5` — the row was stale; the *unheld convention* was the defect** | `'z'` could not print and had not been able to since `89bbf37`. What was open is that nothing held the correct literal there. Closed at the type. **Opens `C33`** — the same shape survives two files away. [§ D117](../DECISIONS.md) |
| **`C24` + `C27` — `elevator-sim fuzz`, and the D62 names on both barrels** | `campaign.ts` has a named non-test caller, verified with the repository's own scanner. The barrel work buys public API surface and **not** liveness, and says so. [§ D118](../DECISIONS.md) |
| **`C4` — Student-t stays, and now the cost is measured** | +0.59 % at the shipped policy, **+0** on the configuration § 4's table describes. Below the replication floor a normal quantile saves 3–8 replications and gives up **12–20 points of coverage**. [§ D119](../DECISIONS.md) |
| **The four ⚠️ UX rows — driven, and two were *false*** | `RV-21`'s **Retry was permanently dead after any failed load**, silently. The ⚠️ bucket is now empty and all seven ⛔ keyboard rows are green. [§ D120](../DECISIONS.md) |
| **`packages/experiments` has a browser export** | The `node:` reachability list is **three** modules, not the one on record. `W4` is **partly** unblocked, not fully — TypeScript does not apply the `browser` condition. [§ D121](../DECISIONS.md) |
| **`C32` — the fuzz generator draws the call type *against* the profile** | Two defects, not one: **122 of 2 000 deep cases (6.1 %)** were running something other than what they said. Deep tier green at 2 000 with 0 property violations. [§ D122](../DECISIONS.md) |
| **A phase's status is now bound to evidence** | § D115's *largest un-mechanised risk*, narrowed rather than closed — it binds status to evidence that **exists**, not evidence that **supports**. It found the roadmap stated **no status at all** for Phases 0 and 1. [§ D123](../DECISIONS.md) |

**Wave 5 opened items as well as closing them**, which is why § 8's table is longer in places rather
than shorter: `C33`, `C34`, and four smaller findings named in § 8. A register that only ever shrinks
is not being read honestly.

> **Read [`08-review-findings.md`](08-review-findings.md) before planning.** A whole-system
> review on 2026-07-26 produced **21 findings — 1 critical, 13 major, 7 minor**, none of which
> the test suite could catch at the time. All 21 are now closed: 19 fixed, and 2 (#5's fuzzy pattern
> detector, #11's double-deck dispatch) closed by a recorded decision to defer the *capability*
> while removing the thing that made it look shipped — each being one of the two remedies its own
> finding prescribed. **Ten of the twenty-one were documentation drift**, which is why this
> repository now carries guards that fail on drift; § 3 lists them. The critical finding — the
> entire `tuning/` module having no non-test caller — is closed, and Phase 7 is **accepted**.

---

## 1. Where things stand

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 4 — Visualization | ✅ Viewer, building editor, live metrics overlay, playback from a stored seed; 88-scenario UX ledger |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ **ACCEPTED** — search space, three searches, held-out validation, and a CLI `tune` that calls them |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `fuzz`, `watch` |
| **6 — Destination dispatch & learned control** | ⚠️ 6a and 6b accepted against the raised criterion, measured on the building it names: **met by Level 0, not met by the Level-1 panel**; **6c deferred out of the phase**; double-deck still not simulated |
| **8 — Testing campaign** | ✅ Blocking clause **discharged** — 0 outstanding property violations, deep tier green at 2 000 cases — and all eight tracks landed, the last being the full experiment matrix (8 cells × 12 profiles, Pareto over AWT / energy / WT95) with Phase 7's acceptance interval at n = 150 |

Phase 7's one undelivered scope bullet — the fuzzy traffic-pattern detector — is marked not-done in
[the roadmap](05-roadmap.md) rather than folded into the ✅. `data/dispatcher-profiles.json` ships a
schema-validated `patternSwitching` block that no runtime code reads; editing it changes nothing.
The same treatment is applied to Phase 6c: it is marked not-done in the roadmap with its reasons,
rather than swept into a neighbouring tick. Phase 8's eighth track was carried the same way until it
landed; it is now ✅ with the study that discharges it named.

### Running it

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- fuzz --cases 8                  # or: --tier deep --cases 2000, the overnight pass
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test          # full suite: 178 files, 3,349 tests (3,340 pass, 9 skip)
```

Measured on this tree after wave 5's eighth merge, 2026-07-28: `npx tsc -b` clean,
`npx vitest run --testTimeout=120000` → **178 files / 3 349 tests, 3 340 passed, 9 skipped**,
exit 0, 567 s. The benchmarks execute real replications, which is where the runtime goes.

> **Wave 5's +129 is accounted for, test by test**, as § D115's +48 was: `reports` +4 (§ D117);
> `cli/commands/fuzz.test.ts` +16 and `index.test.ts` +1 (§ D118); `browser.test.ts` +22 (§ D121);
> `fuzz/generate.test.ts` +10 (§ D122); `runner/stoppingBudget.test.ts` +6 (§ D119);
> `config/parse.test.ts` +6 (§ D116); `viz` `bootstrap.test.ts` + `motion.test.ts` +9 (§ D120);
> `validation/phaseStatus.test.ts` +55 (§ D123). **3 220 → 3 349**, and **172 → 178 files** for the
> six new files in that list. The skip count is unchanged at 9.

**Do not treat the wall-clock as a fixture.** The commit that landed the eighth track (`f895a16`)
measured the suite going from 435 s to **519 s** on its machine; a re-run of the same tree took
**793 s**; the 3 220-test tree took **578 s**; this 3 349-test tree took **567 s** — *fewer* seconds
for *more* tests, which is the point. All four are true and none is a property of the code. If you
need a runtime regression signal, measure it twice on an idle machine — this is the same class of
mistake as inheriting a saturation ceiling across studies (§ 4).

> **Wave 5 demonstrated the failure mode this warning is about, at scale.** Eight lanes were run
> concurrently on a **10-core** machine, each spawning a full vitest worker pool: load average
> reached **198 with 31 vitest processes**, roughly 20× oversubscription. Two lanes stalled without
> reporting, four committed nothing for tens of minutes, and one lane's stray unscoped
> `pkill -f vitest/dist/workers/forks` killed *other* lanes' workers — after which a builder saw a
> `1 error` in a package it had never touched and, correctly, **refused to say whether it was
> pre-existing**. It was not: the serial run above is green. **Parallelise the work, serialise the
> measurement.** A suite result taken under that load is not evidence.

Two opt-in tiers exist and are **not** part of that run: `ELEVATOR_SIM_FUZZ=deep` runs the
2 000-case fuzz campaign, and `ELEVATOR_SIM_DEEP=1` enables the oracle's deep campaign (11
measurable banks at n = 128) and the wall-clock scaling assertions that were moved out of the
always-on tier because a timing gate that fails under concurrent load trains everyone to ignore red
([`DECISIONS.md` § D91](../DECISIONS.md)).

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
6. `core/` never imports `viz/` — and now in its **strong** form: with `packages/viz` deleted and
   deregistered, `tsc -b` is clean and `core` passes 77 files / 1 832 tests (§ D104)
7. Anything tunable is **data, not code** — no `if (strategy === ...)`
8. Every tunable declares its schema

---

## 3. Standing requirements, and the guards that enforce them

### The integration seam must have an owner

**This project shipped nine defects of the form "configurable, unit-tested in isolation,
dead in the shipped path" — and a tenth in `data/` rather than in code.** Each passes every other
check the repo runs. The count is the length of this table, not a number carried in prose:

| # | Defect | How it presented |
|---|---|---|
| 1 | `parkingStrategy: zone-center` | Never moved a car under its own defaults |
| 2 | `assignmentMode: split-demand` | Named N cars, never divided the landing |
| 3 | `rideTime`, `zoneAffinity`, `predictedDemand` | 0 non-zero evaluations out of 2,142 |
| 4 | The entire predictor | Never constructed, never fed, never consulted |
| 5 | `multiRoundIsReachableFromSimulation()` | `return true;` — asserted by a test as a guard |
| 6 | `seedSetFromReplications` | Existed *to be* the seam; its only caller was a test |
| 7 | The whole of `tuning/` | No barrel, no package export, no CLI command — every importer a `*.test.ts`. Asserted closed by the roadmap itself |
| 8 | `StageActivity`'s late-arrival counters, `WARNING_CODES.doubleDeckNotSimulated` | On an object `runSimulation()` discards, and a code no shipped path branched on. Both asserted in both directions by their own tests |
| **9** | **The whole `'no-intervals'` half of `benchmark/`** — `measureAuctionAggregation`, `measureDestinationLiveness`, `measureEnergyLiveness`, `measureMultiRoundReachability`, `measurePredictorLag` | The interval half has `regeneratePins.ts` as its driver; the categorical half had **none**, so all five were dead. `measureEnergyLiveness` had two barrels, a string key in `published.ts` and its own test, and the repository's own scanner printed `measureEnergyLiveness -> []`. Closed by `benchmark/livenessSuite.ts`, and `index.test.ts`'s guard now iterates the entry-point set **derived from the directory** rather than five hand-written names ([§ D114](../DECISIONS.md)) |
| **10, in `data/`** | **`destination-eta`** | `dispatch.callType: mobile-credential` and a weight vector identical to `eta`'s. Schema-valid, loaded by the real loader, tested, named after the thing it did not do: **bit-identical to `eta` at 8 of 8 matrix cells**. Invariant 7 makes dispatch strategy *data*; it does not put data outside this requirement. Closed by authoring `weights.rideTime: 0.5` ([§ D112](../DECISIONS.md)) |

**The weaker instance that was recorded here is CLOSED**: `fuzz/`'s only non-test caller used to be
a test (`campaign.ts` ← `corpus.test.ts`), tracked as **C24**. `cli/src/commands/fuzz.ts` is now the
named non-test caller of `runCampaign`, `formatStats`, `STANDARD_CORPUS`, `deepSeeds` and
`deepCampaignSize` — **verified with the repository's own scanner rather than asserted**
([§ D118](../DECISIONS.md)).

**Three weaker instances are open in its place, and are recorded rather than dressed up** — which is
the same treatment C24 got, and the reason it eventually closed:

| | |
|---|---|
| `deepCampaignRequested` | Scans to `[]`. Its only importer is `fuzz/deep.test.ts` — **C24's exact shape, in the file that closed C24.** Defensible (it gates a vitest tier) and still the weaker answer |
| `withCallType` | Its only caller outside `fuzz/generate.ts` is `validation/adversarial.test.ts`, which uses it to build the conventional control arm of a destination comparison. Kept deliberately, and now **checked rather than relied on**: `assertCarriesCallType` runs on every case ([§ D122](../DECISIONS.md)) |
| `experiments/src/browser.ts` | Has **no** non-test caller and cannot have one until `docs/10`'s W4 exists. Stated in the file rather than dressed up; `browser.test.ts` is its mechanical owner meanwhile. Tracked as **C34** ([§ D121](../DECISIONS.md)) |

The stopping rule is a fourth: nothing outside `validation/` ever injects one, so
`productionStoppingRule` has no non-test caller at all. Deleting a documented port with a Phase 3
gate suite behind it needs its own recorded decision, so it is named here and not acted on.

Add three more of the same shape that were **not** dead code but stale *numbers*: a published
interval measured before a seam was wired and never regenerated, and two intervals hand-transcribed
with a double rounding. Nothing in the suite re-derived a published interval, so no test could see
any of them.

The root cause of the largest instance: Phase 5 partitioned work by module directory and
`sim/simulation.ts` was in **no agent's ownership list**. Each module was built correctly.
Nobody owned the wiring.

**Therefore:** when parallelising, one agent owns the integration seam, and liveness is
**measured, not read**. "It looks wired" is not evidence. Instrument a real run and count
invocations. The rule is not *"is this symbol reachable?"* but **"name the non-test caller"** — a
barrel re-export and a `{@link}` tag look exactly like a caller and are not one.

### The permanent guards, and why each one exists

Every row below was installed *after* the defect it catches had already shipped. None may be deleted
to make a phase pass.

| Guard | What it catches | The instance that caused it |
|---|---|---|
| `core/src/sim/seam.test.ts` | A behaviour the docs say must change the run, that does not. Asserts on **car trajectories**, not summary metrics, because a mean is exactly the statistic that hides a structural difference. Iterates the categorical's own domain, so a new value cannot be added uncovered | The four simultaneous Phase 5 dead seams |
| `core/src/dispatch/deadCode.test.ts` | An export of `dispatch/policies/` or `dispatch/predictor/` with no real importer. Barrel re-export is explicitly *not* a caller; only `import` / `export … from` bindings count. The `PUBLIC_API_ONLY` allowlist is asserted **in both directions**, so it cannot become where dead code goes to be forgotten. **Its own two blind spots are now closed** — see below | The same four; and, for the two fixes, **C7** |
| `experiments/src/index.test.ts` § study entry points | A study entry point with no non-test, non-barrel caller. Iterates `Object.keys(STUDY_ENTRY_POINTS)` — **derived** from the `benchmark/` directory, whose totality `published.test.ts` asserts in both directions — so a study added later is not invisible to it. It deliberately does *not* assert barrel re-export: six live entry points are on no barrel, and `measureEnergyLiveness` was on two and dead | Instance 9 above |
| `experiments/src/tuning/deadCode.test.ts` | The same audit for `tuning/{search,space,report}` | Review finding #1 — the whole of `tuning/`, reachable from nothing outside its own tests, asserted green by the roadmap |
| `experiments/src/benchmark/published.test.ts` | A published interval that the code no longer produces, or that changes in silence. Every interval-shaped literal in `benchmark/` is either reproduced by a pinned estimate at its own printed precision or declared unpinned with a count | Three figures that did not reproduce — one measured before a seam was wired, two double-rounded |
| `experiments/src/validation/documentation.test.ts` | Four separate drifts: the phase set disagreeing across `CLAUDE.md` / `README.md` / this file; this file contradicting *itself* between its opening line and its own table; a `docs/*.md` on disk and not in README's table; a roadmap reproduction instruction naming a function nobody exports. **And** the refuted access-control mechanism, three ways — a claim with no refutation within 400 characters, a correction silently deleted, and `estimateCost.ts`'s exclusion asserted in both directions | Review findings #2, #17, #18; and § D60, where seven places asserted a refuted mechanism and *nothing went red* |
| `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree disagreeing with disk, **in both directions** — a phantom directory and an undocumented one both fail. Scoped to workspace members that are installed, with `core`'s presence asserted so the scope cannot degrade into "skip everything" | Review finding #15, and C28 |
| `viz/src/boundaries.test.ts` | Invariant 6's import direction, plus the no-DOM rule, both with positive controls | Phase 4 |
| `core/src/browser.test.ts` + the import-graph guard | A `node:` builtin reachable from the browser barrel — `loadConfig` imports `node:fs/promises`, so a browser import used to throw at module evaluation | C2 (§ D31–§ D33) |
| Three `estimateCost` purity guards | Invariant 1, including a source-level guard that the module cannot import an RNG | — |
| `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` | A stored run that no longer replays byte-identically | Invariants 4 and 5 |
| `benchmark/saturationCensus.test.ts` | An operating point excluded by its **ceiling** being reported as if it were excluded by its **answer**. The two are indistinguishable in a results table | § D100's 3 % row |

### Standing dead-code audit

For every exported symbol in `dispatch/policies/`, `dispatch/predictor/` and
`experiments/tuning/`, count callers outside its own module and tests. Every zero must be
classified as dead or as deliberate public API. Do this each phase. **Both halves are mechanised**
(the first two rows above); when this section was first written the second did not exist and the
sentence was read as though it did. *A standing requirement stated in prose is not a standing
requirement.*

**The two holes in the `core` scanner are CLOSED (C7).** They were, for the record:

1. Its `EXPORTED` pattern did **not** match `export async function`, so those exports were never
   scanned at all — neither reportable as dead nor listable in the allowlist.
2. Its `code()` helper stripped block and line comments and **not string literals**, so a symbol
   that names itself in its own error message counted as self-used and was **unfalsifiably live**.

**Both were watched failing before being closed**, with the failure manufactured rather than
argued: an uncalled `export async function probeUncalledAsyncExport` added to `policies/zoning.ts`
left the unfixed audit at *4 passed* and makes the fixed one fail by name; deleting both real
importers of `createArrivalModel` did the same, because `PredictorError(\`createArrivalModel: …\`)`
read as a self-use. Measured self-use counts under the two implementations: `createArrivalModel`
3 → 1, `PredictorError` 2 → 1 — **both were live regardless of who imported them** before the fix.

**Closing them surfaced no new dead exports**; the allowlist is unchanged in both directions. What
changed is that **three existing assertions became falsifiable that previously could not fail**, and
three assertions were added pinning the two fixes against synthetic input, because
`dispatch/{policies,predictor}` contains no `export async function` today and a latent scanner gap
is invisible until the first symbol falls into it. The fixes are ported inline from
`experiments/src/tuning`'s copy rather than shared: `core` may not import from `experiments`.
[§ D114](../DECISIONS.md).

> **The guard on the guard is still the right thing to look for.** This is the second time a
> *permanent* audit in this repository was found to under-report, and the second time it was found
> by porting a fix that already existed in a sibling copy. Two copies of one audit that do not agree
> is a standing hazard; `core` and `experiments` have them because the dependency direction forbids
> sharing.

---

## 4. Measured facts that bound what you may claim

### Resolution limits — two numbers, not one

| Comparison regime | ρ | Smallest detectable effect (n=100) |
|---|---|---|
| Near-neighbour weight vectors | 0.98–1.00 | **0.20 s (1.3% of AWT)** at 80% power |
| Structurally different dispatchers | ~0.61 | **1.9 s (12%)** at 80% power — ~10× coarser |

An improvement below these is **not measurable at that budget**. Report it as "below the
resolution limit", never as a win. There is a third case, harder than either: an effect whose
required `n` exceeds the point's **saturation ceiling** is *permanently* unresolvable there, not
under-budgeted — see § D100's 2 % row, n ≈ 5161 against a ceiling of 395.

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
An optimizer must detect and escape plateaus. A bit-identical result is a wiring bug until proven
otherwise: an interval of exactly `[0, 0]` with `rho = 1` over hundreds of replications is not a
small effect, and no budget will resolve it.

### Replication budget by target precision

At 90% confidence on Midtown up-peak AWT (s = 3.60 s, CoV 23%), with `t[n−1]` — which is what this
simulator uses at every `n`:

| Target | ±2 s | ±1 s | ±0.8 s | ±0.5 s | ±0.4 s | ±0.25 s |
|---|---|---|---|---|---|---|
| n | **11** | **37** | **57** | **143** | **222** | **563** |

The doc's flat "50–200" corresponds to a ±0.5–0.8 s target.

> **This table was the deleted normal quantile's answer** (**C19**). It read
> **9 / 36 / 55 / 141 / 220 / 563**; five of those six rows reproduce exactly at `z = 1.6449` and not
> at `t`. `t` is strictly wider, so the published table **understated the budget at every rung** —
> the optimistic direction. A direct consequence of [`DECISIONS.md` § D14](../DECISIONS.md), and
> missed by wave 1's blast-radius scan because that scan covered *published intervals* and this is a
> *planning* table. Re-derived from `studentTQuantile` on 2026-07-28, and corrected in both copies
> (here and `docs/03` § *Measured: the replication budget…*). **No conclusion changes.**

### `nearest-car` is a poor reference arm

It is the **only** profile that saturates, which caps the replication budget at n=287 on
Midtown and makes ~0.8 s a permanent resolution floor there. Prefer `collective` or `eta`. On
`mixed-use-high-rise` up-peak it is the binding ceiling at 2 % (395) and 3 % (22).

### A saturation ceiling belongs to a **(building, traffic, seed)**, not to a building

**This is the single most reusable-looking number in the project and it is not reusable.** The same
arm, the same building and the same traffic pattern give different ceilings at different seeds:

| study | cell | arm | ceiling |
|---|---|---|---|
| `benchmark/arms.ts` (seed 20 260 726) | Midtown up-peak, 1 % pop/5 min, 900 s, peak-5min | `nearest-car` | **287** |
| `benchmark/matrix.ts` (its own seed and operating point) | Midtown up-peak | `nearest-car` | **174** |

Neither figure is wrong. Reusing one across studies is, and **this repository has made that mistake
twice and corrected it twice** — which is why `matrix.ts` establishes every cell's ceiling from its
own 200-replication census rather than inheriting one, and why its docstring says so in the same
sentence that gives both numbers. A ceiling read out of a neighbouring module is an unmeasured
assumption wearing a measured number's clothes.

The same caution applies to the n=287 in the section above, to the 395 and 22 on
`mixed-use-high-rise`, and to every ceiling in `arms.ts`: each is that study's seed's answer.

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

**It has been passed once, and that pass is what Phase 7's acceptance rests on.**
`elevator-sim tune`, searching this one dimension from the shipped 8 s against the real `data/`
directory, returned **2.582 s** — with the tuning and holdout seed sets printed `DISJOINT` (trace
seed 9876618837807159332 against holdout 11367898276632666949) and a holdout verdict of
`GENERALIZES` at `--validate-reps 150`. It is the only test in this repository whose answer was
known before the machinery that answers it existed, which is exactly why the wrong value stays
shipped. **A future optimizer that returns 8 s here has failed, not agreed.**

### Closed-form RTT residuals — all five buildings

The simulator does not reproduce the closed form's arithmetic — no faithful simulator would, because
`RTT = 2(H·tv + tx) + (S+1)·ts + 2·P·tp` charges neither acceleration nor door holds. It reproduces
the *physical system* the formula describes. Read literally the criterion is met on none of the
five; read as intended — *does the simulator reproduce the system the formula describes* — it is met
on all five, because charging the two simplifications `CLOSED_FORM_ASSUMPTIONS` enumerates **in
advance** as `bias: 'under'` closes every gap, with no fitted constant anywhere.

Re-measured on this tree on 2026-07-28 by `oracle/fiveBuildings.test.ts` at n = 64, seeds from
810 000, each building's principal bank:

| building | bank | raw INT | raw %POP | raw RTT | residual after charging | verdict |
|---|---|---|---|---|---|---|
| Midtown Office | `main` | +27.6 % | −24.2 % | +31.4 % | **−0.195 %** | RECONCILED |
| Garden Apartments | `main` | +7.3 % | −7.8 % | +13.0 % | **+1.021 %** | RECONCILED |
| Secure Tower | `low` | +31.8 % | −31.7 % | +41.3 % | **−0.884 %** | RECONCILED |
| Mixed-Use High-Rise | `office-local` | +33.1 % | −32.1 % | +39.4 % | **−0.220 %** | RECONCILED |
| Vertical City | `zone-1-local` | +25.9 % | −26.6 % | +32.0 % | **−0.140 %** | RECONCILED |

The two Phase 2 buildings are the check that extending the measurement did not change the question.
§ 5 of this brief previously recorded them at **+27.5 % / −23.2 %, residual 0.001 %** and
**+7.5 % / −7.1 %, residual 0.69 %** — measured at n = 128 on the whole building through
`core/src/analytical/validation.test.ts`, a different code path with a hard-coded `bankId`. Both
signs, both magnitudes and both residual scales come back. **The figures differ in the last digits
because the two are different measurements, not because either is wrong**; the n = 128 pair is the
one `core` asserts, the table above is the one `experiments` asserts, and both are pinned. If the
three new buildings had agreed and these two had not, the agreement would have been an artefact of
the new apparatus.

**Why Garden agrees best raw despite being the short building:** the governing quantity is floor
pitch relative to `v²/a`, the distance needed to reach rated speed. Measured as `real hop / tv`:
Garden 1.38 (**reaches rated speed in one floor**), Midtown 3.08, Vertical City 3.48, Mixed-Use
4.68, Secure Tower 4.85 — none of the last four do. A slow hydraulic is **closer** to the
constant-velocity idealisation than a fast traction car, and the raw RTT divergence orders exactly
with that ratio.

**Three of the fourteen shipped banks cannot be measured this way at all**, and each is recorded
with its mechanism rather than as a failure of the oracle:

| bank | why |
|---|---|
| `vertical-city/shuttle` | Blocked **four separate ways**, none of them a tolerance: (1) eight double-deck cars and double-deck operation is not simulated; (2) all eight served floors declare `population: 0`, so `U` is entirely onward traffic (2 872 occupants of zones 3–6) and `%POP` against a zero population is not a small number, it is not a number; (3) a 26-person car holds its doors 41.20 s against a shortest possible round trip of 30.03 s, so no clustering threshold separates a reopen from a return; (4) its eight floors are four *pairs* 4.5 m apart with binding deck assignment, so `N` is not the count the model means |
| `mixed-use-high-rise/residential-local` | 32.8 s of reopen against a 31.3 s round trip — departures cannot be reconstructed from boarding times. That is a limit of the reconstruction, not a defect in the simulator; the fix is a car-position series, which no run record carries |
| `vertical-city/zone-6-local` | Empty departure bracket, same mechanism |

Six further banks are measurable and covered by `oracle/deepCampaign.test.ts` (`ELEVATOR_SIM_DEEP=1`,
11 measurable banks at n = 128) rather than by the always-on budget.

Pushing the simplifications *into* the simulator via per-car config (huge acceleration, zero dwell)
collapses its round trip onto the textbook figure at −0.4 %.

### Determinism

Same seed under CRN gives **bit-identical** paired differences — exactly zero on all 23
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

## 7. The phases, in detail

### Phase 6 — Destination dispatch, access control, learned control

Split into 6a / 6b / 6c by [`DECISIONS.md` § D28](../DECISIONS.md). The interface contract is
[`09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md); full results and the
raised acceptance criterion are in [the roadmap](05-roadmap.md).

- ✅ **6a — destination disclosure.** Accepted. At Midtown interfloor-mix, n = 150 CRN, the priced
  destination is **−1.562 [−1.916, −1.208] s on TTD (BETTER)** — with AWT **+0.514** and WT95
  **+1.010** reported as WORSE rather than hidden, which is what the raised criterion demands.
- ✅ **6b — destination dispatch.** Accepted on the Midtown / Secure Tower contrast: per-passenger
  assignment, write-once promises, a `brokenPromises` counter, and the landing panel rendered at
  `VIZ_SCHEMA_VERSION = 4`. **Its acceptance carries a caveat** — see the next block.
- ⬜ **6c — learned control.** `LearnedDispatcher`, an RL policy. **Deferred out of the phase** — it
  shares no interface with 6a or 6b, it strains invariant 8 (is a 400-parameter policy vector a
  declarable tunable?), and its acceptance criterion was stated in the metrics 6b makes
  non-comparable. It needs its own acceptance question before it needs an implementation.
- ⬜ **Double-deck and `vertical-city`** — still the most deferrable scope in the project.
  Configured and validated, **not simulated**, and disclaimed on every run of that building.

#### The criterion, measured on the building it names

The original gate said *"on the Mixed-Use High-Rise"*; § D27 raised the metric clause and dropped
the building clause without arguing it. [§ D99](../DECISIONS.md) owned that as a weakening and
[§ D100](../DECISIONS.md) closed it by measurement. Three parts:

1. **The building's own mixed 40/30/30 scenario admits no paired comparison, and that is a
   measurement.** Every `role: "baseline"` profile is 0/30 quotable, and the unserved fraction
   **rises as the load falls** — 24.4 % → 31.7 % → 36.6 % at 1.5 / 0.75 / 0.2 %pop per 5 min, with
   39.2 / 22.7 / 6.4 undelivered per run. That is a *structural* refusal, not overload. The
   candidate reason already on record — the achieved interval being `unmeasurable` by design — was
   **checked and does not bite**: it constrains the oracle's departure reconstruction, and the gate
   is TTD.
2. **Incoming-only up-peak is the one comparable regime**, `G` being the only entrance outside both
   access zones — and it is not blind: three banks and a two-leg sky-lobby transfer sit behind one
   up button.
3. **At up-peak 4 %, n = 200, ΔTTD against the three baselines resolved from `data/`:**

| | vs `nearest-car` | vs `eta` | vs `collective` |
|---|---|---|---|
| **Level 0** | **−21.239 [−22.793, −19.685] BETTER** | **−2.072 [−2.868, −1.277] BETTER** | **−2.116 [−2.908, −1.325] BETTER** |
| Level 1 | −18.633 [−20.702, −16.563] BETTER | +0.534 [−0.855, +1.923] INDIST. | +0.490 [−0.902, +1.882] INDIST. |

With the costs published beside them, because omitting them fails the phase: **Level 0** ΔAWT
`+0.876 [+0.703, +1.050]` **WORSE**, ΔWT95 `+0.273 [−0.026, +0.571]` INDISTINGUISHABLE; **Level 1**
ΔAWT `+3.190 [+2.463, +3.916]` and ΔWT95 `+9.083 [+5.683, +12.484]`, both **WORSE**.

**Stated plainly: the criterion is met by the Level-0 arm and not by the Level-1 panel at any
measured point** — and not at 1 % or 2 % either. The 2 % gate needs **n ≈ 5161 against a ceiling of
395**, i.e. *permanently unresolvable*, not under-budgeted; **3 % is excluded by its ceiling, not by
its answer** (its effect is larger than 2 %'s), which `saturationCensus.test.ts` asserts because the
two are indistinguishable in a results table.

#### The access-control hypothesis — half of it is refuted

This section used to say destination dispatch *should be better under access control, because
authorization and optimization happen in the same step*, and `secure-tower` existed to show it.
Measured:

- **Coverage — CONFIRMED, categorically.** Conventional dispatch does not perform *worse* on Secure
  Tower's interfloor traffic; **it does not perform** — 0 of 30 replications with a quotable AWT,
  18.2 undelivered journeys per run, 33.5 % unserved, because an access-restricted pickup carries no
  credential and every car answers `accessDenied`. The credential arm completes 30 of 30 with 0.00 %
  unserved. Structural, not load-driven, so no arrival rate rescues it and no interval is possible.
  Reproduced on a second building by § D100's part 1.
- **Optimization — REFUTED.** Difference-of-differences across the two buildings, n = 150 each:
  `Δ_secure − Δ_midtown = +0.982 s [+0.584, +1.380]`, excluding zero on the **positive** side.
  Given the credential, pricing the destination buys **less** where access is controlled. The saving
  is entirely in the credential — a claim about **authorization**, not about **optimization**.

Seven places asserted the refuted mechanism as fact and **no test pinned any of them**, so nothing
went red while they were wrong. All seven are corrected, and the correction is now **pinned three
ways** by `validation/documentation.test.ts` (§ 3). `model/car/estimateCost.ts` is deliberately
excluded — its sentence says only that a destination *lets* a dispatcher authorize and optimize in
one step, which is a true description of the code — and that exclusion is asserted in **both**
directions, so it cannot go stale silently.

#### The real tension to measure — and it ran the other way at the point tested

Destination dispatch **cannot defer** assignment, because the passenger must be told which car to
walk to immediately, and that is written up as a documented cost of the approach. Measured at
Midtown interfloor-mix, `eta` deferring 1.5 s is WORSE on TTD by `+1.123 [+0.848, +1.397] s`, on AWT
by `+1.081` and on WT95 by `+1.895`, 0 of 150 replications identical — so at that operating point
the constraint removes a liability. That does **not** generalise: `predictive-balanced` is the
profile that defers and it has ten weights, not one. What the cost *does* look like when it bites is
Phase 6b's 4.5 % row: TTD +5.94 s, WT95 +37.34 s, in-car time −1.02 s — and § D100's 4 % row on
`mixed-use-high-rise`, WT95 +9.083 s, is the same mechanism on a third operating point. Compare on
**TTD**, not AWT — `core`'s own `comparabilityOf` lists AWT and WT95 among nine metrics that stop
being comparable across the two passenger models, and `compare` now refuses to gate on them across
models.

#### One exception to write-once, and why it is not a weakening

§ D29 makes a destination assignment write-once. [§ T22-D1](../DECISIONS.md) adds exactly one
exception: a promise to a car that **leaves group control** is revoked. D29's argument is stated
about a car that is **full** — the promise stands because the car empties and comes back, so waiting
is a real cost of committing at the panel. A car on `independent`, `fire-recall` or `out-of-service`
does not come back unless a later schedule entry says so, so the promise is not a cost being paid;
it is a promise that cannot be kept. The rule is a fact about the **car**, not about the score, and
no dispatch decision can produce it — which is what keeps it from becoming a general `reassign()`.
Guarded by a control: `sim/serviceMode.test.ts` asserts `promisesRevoked === 0` on a panel run of
the same building with **no** schedule, in which 18 promises are broken by full cars.
[§ D101](../DECISIONS.md) corrects the four earlier records that still describe this as live.

### Phase 4 — Visualization (COMPLETE)

`packages/viz` ships all four scope bullets and both acceptance clauses pass:

- ✅ Web viewer consuming `core` with no reverse dependency — asserted by `viz/src/boundaries.test.ts`
- ✅ Renderer samples `Car.positionAt(t)` at display framerate **between** kernel events
  (`frame/frameAt.ts`, driven by `playback/clock.ts`)
- ✅ Replay from a stored seed, with a **per-field** negative control
- ✅ **Building editor** over the existing JSON schema — four pure modules at
  `packages/viz/src/editor/` plus `dev/editor.ts`. It never renders a second opinion about legality:
  every issue comes from `parseBuilding` / `resolveBuilding`, and it says which stage produced them
  (§ D67)
- ✅ **Live metrics overlay** — it suppresses *estimates* and keeps *observations*, and copies
  `awtIsValid` from the summary rather than recomputing it (§ D64)
- ✅ A rendering contract (`VIZ_SCHEMA_VERSION = 4`), a Canvas renderer, and an **88-scenario UX
  ledger** at `packages/viz/UX.md` § 7.0 with per-scenario ids and differentiated states — **86 ✅**
  (32 wave 1, 37 driven, 4 driven *and* asserted, 13 asserted by a test proved to bite), 1 half
  (`ED-23`), **0 unverified**, 1 not built (`PB-09`). Wave 5 drove the last four ⚠️ rows and settled
  `ED-12`/`ED-13` against the schema ([§ D120](../DECISIONS.md), [§ D116](../DECISIONS.md))

> **Two of those rows were *false*, not merely unverified, and were found by driving the app.**
> `UX.md` § A.3's **Success** and **Saturated** rows each carried a "must not show" clause about the
> running mean, and the header drew one anyway — on the same `<canvas role="img">` whose `aria-label`
> said the mean did not exist, and which `Export PNG` bakes into a shareable file. It leaked on
> **both** suppression grounds, not only saturation. Fixed, re-marked with the evidence on screen and
> in the exported PNG, and the same defect was then found in `elevator-sim watch` on **both** of its
> render paths — which no prior report had caught, because the brief's claim that no other render
> site leaks was checked rather than trusted ([§ D111](../DECISIONS.md)). The suppression gate now
> has one home, `meansAreSuppressed` in `frame/overlay.ts`, with three named non-test callers.

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

### Phase 8 — Testing campaign (ACCEPTED — blocking clause discharged, all eight tracks landed)

| Track | State | Where |
|---|---|---|
| **Property-based fuzzing** | ✅ | `experiments/src/fuzz/` — generator, hand-written shrinker, six properties, 64-case always-on corpus, 2 000-case deep tier |
| Analytical cross-validation, all five buildings | ✅ | `experiments/src/oracle/{fiveBuildings,bankCensus,deepCampaign}.test.ts` |
| Physics verification | ✅ | `validation/physics.test.ts` |
| Statistical self-validation | ✅ | `validation/{crnVarianceReduction,nullComparison,sequentialStopping,operatingPoint}.test.ts` |
| Determinism regression | ✅ | `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` |
| Scale & performance | ✅ | `validation/perfScaling.test.ts`, `perfSweep.test.ts` (wall-clock gates are opt-in — § D91) |
| Adversarial edge cases | ✅ | `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix + Pareto at a real budget | ✅ | `benchmark/matrix.ts` + `matrix.test.ts` — 8 cells × 12 profiles, per-cell derived budgets n = 50…200, front over (AWT, energy, WT95); `benchmark/phase7Acceptance.ts` carries Phase 7's acceptance interval at n = 150; `benchmark/matrixCensus.test.ts` is the opt-in 200-replication census that re-derives the budgets |

**Deep tiers, measured:** the fuzz campaign is green at 2 000 cases — 1 396 887 passengers,
1 242.86 simulated hours, 1 143 completed / 857 timed-out, 0 unroutable, **0 property violations**;
the oracle's deep campaign is green at **11 measurable banks × n = 128**.

**Property-based fuzzing was the highest-value track, and it paid.** Hand-written tests check cases
someone thought of; randomized buildings find the ones nobody did. **Four real defects, all four
fixed, and not one of them by moving a bound:**

1. **A published mean beside an abandoned passenger** — `fuzz-1001074` reported mean wait 172.1 s,
   p95 686.4 s, **max 922.7 s**, 67.8 % of legs over 60 s, and `awtIsValid` **true**. `awtIsValid`
   had three grounds and the two substantive ones were both proxies for *did the backlog clear?* —
   a queue still growing at the horizon (the trend test) and a queue not cleared by it (censoring).
   **Neither sees a queue that grew enormously and drained just in time**, which is this case: it
   escapes the trend gate because a hump fits a shallow line with large residuals (`g2n` 1.32
   against a gate of 4) and the censoring gate because everybody was eventually collected, 177 of
   177. Little's Law confirms the simulator was right about everything — `λ·W = 0.1235 × 172.07 =
   21.2` against a measured mean queue of **20.8**. What was wrong was the report. Fixed by a
   **fourth `awtIsValid` ground** (starvation past a 900 s abandonment horizon). See `docs/03`
   § Saturation.
2. **A crash reachable the moment out-of-service cars became authorable** — an out-of-service car
   parked at an occupied landing threw a `ModelError` out of `run()` and killed the run, because
   `#loadWhileIdle` boards from a car standing there without consulting the dispatcher. Fixed in
   `#carCanCarry` and `#park`; both clauses are inert on every shipped building (§ D76).
3. **P5 termination was blind to a fleet that never moves** — an all-out-of-service fleet delivered
   0 of 365 journeys and passed all six properties. The idle stretch is now measured per passenger;
   **strictly stronger**, reducing to the original expression exactly whenever the old one applied,
   and `deadlockIdleBoundS` was not touched (§ D86).
4. **`fuzz-1000384` — a P5 deadlock. FIXED.** A destination-panel promise bound a passenger to a car
   withdrawn from group control; write-once handed the re-offered call straight back to it —
   `cands=[low-1] -> unassigned, low-1:serviceMode`, **592 identical dispatches at 5 s intervals**,
   while the bank's other car served every other landing and stood idle in between. Proven
   pre-existing (identical to the decimal at the branch point `c072f97`) and shrunk in 33 steps from
   a 32-floor sky-lobby with 3 banks, 6 cars and 480 passengers to **4 floors, 2 cars, 29
   passengers, no access zones** — the access zones falling away entirely, so it is not about access
   zoning. Fixed by § T22-D1's revocation. Blast radius: **60 of 60 shipped cells byte-identical**;
   8 of 2 000 deep cases change and every one is `destination-panel` with a `serviceEvents`
   schedule, exactly and only the path the fix touches.

Treat any Phase 8 failure as **blocking**. A simulator producing confident numbers from broken
mechanics is worse than one that crashes. That rule is why finding 4 withheld the phase's acceptance
rather than being footnoted, and why the phase stayed unaccepted afterwards for a *second* reason —
the eighth track had not landed ([§ D102](../DECISIONS.md)). It landed in `f895a16`, both clauses
now pass, and the phase is accepted ([§ D108](../DECISIONS.md)).

**The eighth track produced four findings of its own**, three of them about profiles that ship, and
one of the four has since been acted on:

1. `nearest-car` is on the Pareto front at **six of eight cells** because it is best on energy and
   worst on wait. Re-measured after the `destination-eta` weight landed: **still six**.
2. `destination-eta` was **bit-identical to `eta` at all eight cells**. **Acted on** — it now
   weights `rideTime` at 0.5 and separates at **seven of eight**; the one that remains is
   `garden-down-peak`, and it is structural rather than under-weighted (§ 8).
3. `fairness-first` is identical to `eta` at **five** cells and `auction-multi-round` to `auction` at
   both Garden cells — both unchanged. **A third class was found in the re-measurement:**
   `destination-eta ≡ capacity-aware` at `garden-residential`, which no earlier report names.
4. A saturation ceiling is a property of (building, traffic, seed), not of a building — see § 4.

`docs/05` § *What the matrix found* carries the per-cell table, re-derived by running `runMatrix()`
after the weight landed rather than carried over.

---

## 8. Open debt — stated, not buried

| Item | Notes |
|---|---|
| **Phase 6c — learned control** | Deferred out of Phase 6 with reasons (§ D28). Needs its own acceptance question before it needs an implementation |
| **Phase 9 — the experience layer: designed, not built** | [`docs/10`](10-experience-layer-contract.md) is a complete design — novice/expert modes, a schema-generated dispatcher and traffic editor, access-zone credentials, and the rules that keep a gamified surface honest — and **not one line of it is implemented**. No status table carries a Phase 9 row, deliberately: a design is not a phase in progress. Its § 13 lists the questions that must be settled before implementation starts |
| **`packages/experiments`' browser export — the prerequisite is CLOSED, `W4` is only *partly* unblocked** | A browser barrel, an export condition and a both-directions graph-walk guard landed ([§ D121](../DECISIONS.md)); `collectSearchSpace()` is importable, callable and provably `node:`-free, and M10 is confirmed corrected and pinned at 49 ids under both conditions. **The `node:` reachability list turned out to be three modules, not the one this row used to name** — `runner/parallel.ts`, `reports/persistence.ts`, and `validation/harness.ts` via `benchmark/verdict.ts`. **Still open:** TypeScript does not apply the `browser` export condition, so a browser-only file importing `@elevator-sim/experiments` typechecks against the **Node** types; the mitigation is the explicit `./browser` subpath and **nothing mechanically forces a `viz` file to pick it**. In `core` that gap was one function; here it is hundreds of names. The rest of `W4` — four control renderers, the `activeWhen` rule at the control, the fictional-schema liveness evidence — is unwritten |
| **`garden-down-peak` is `destination-eta`'s remaining identity class** | Measured bit-identical to `eta` there at `rideTime` **0.3, 1.0 and 2.0** — so it is a **blind operating point**, not an under-weighted term: every down trip ends at the lobby and the destination carries nothing the direction button did not. `destination-panel` lands in the same class there independently. Whether *any* destination weight can carry information at such a point is an open question rather than a defect, and raising the weight fourfold not moving it is the evidence that separates the two |
| **The editor's ⇧/⇩ buttons never moved a floor in the building** | `moveFloor` moves a floor within the **declaration array** and deliberately renumbers neither `index` nor `heightM`, for a good reason its own docstring gives: the loader fails a building whose two disagree (`floor-height-order`), and an editor that silently rewrote either would settle a modelling error by fiat. So the buttons reformat the JSON. Under the old array-ordered table that was invisible; under the `index`-ordered table it is visible, and they are **relabelled honestly** rather than repurposed or deleted — deleting them would leave `moveFloor` with no non-test caller, which is this repository's signature defect. **The scope call is handed back**: give the declaration list its own view, or drop `moveFloor` and let `index` be the only ordering control. `packages/viz/DECISIONS-T29.md` § T29-4, [§ D111](../DECISIONS.md) |
| **The Level-1 panel does not clear the Phase 6 gate on `mixed-use-high-rise`** | INDISTINGUISHABLE against `eta` and `collective` at every measured rate, and WT95 `+9.083` WORSE at 4 %. A measured result rather than a task, but it is what anyone planning further destination work needs. § 7 |
| **The four ⚠️ UX rows are CLOSED, and two of them were *false*** | Driven, not read ([§ D120](../DECISIONS.md)). `RV-21`: `main()` ran its data load **above** the `let started = false` that `start()` closes over, so any failed first load left that binding in its temporal dead zone for the life of the page — Retry then threw inside a floating `async` IIFE with no `catch`, the page cleared its own error message and sat at `loading data…` for ever, empty, with nothing in the console. **Retry was permanently dead after any failed load.** `RV-17`: Vite answers `Accept: */*` with `index.html` and a **200**, so `!response.ok` — the only branch that named the missing path — is exactly the branch a missing `data/` file does not take. A fifth row (§ B.3) was false on **both** clauses. The ⚠️ bucket is **0** and all seven ⛔ keyboard rows are green. **Two limitations are recorded in the rows rather than absorbed:** `KB-14`'s CSS clause is unexercised under a real OS preference (the media query cannot be emulated by the available tooling, so it was driven by replacing `window.matchMedia`), and `RV-11`'s *no passengers were generated* sentence exists only in the status line — the canvas, the exported PNG and `describeFrame` leave the reader to infer it |
| **`ED-12` / `ED-13` — CLOSED, and the schema did not move (`C30`)** | [§ D116](../DECISIONS.md). `ED-12`'s row was the thing that was wrong: a carless bank is an **error**, and relaxing `bankConfigSchema` so the ledger could show a green row would have been the weaken-a-criterion-to-pass failure `CLAUDE.md` forbids. What changed is that `resolveBuilding` — the editor's whole definition of legality under `ED-T8` — was **raised** to agree with the schema it had been silently contradicting, emitting an `empty-bank` code the vocabulary declared and **nothing anywhere in the repository had ever produced**. It matters because the run does not simply have no service there: on a seven-floor tower whose top floor was served only by a carless bank, **ten of twelve seeds published `awtIsValid: true`**, two with passengers never served at all, under the 5 % censoring limit. `ED-13`'s scenario was unrepresentable by design — a per-car `servesFloors` does not exist, because service zoning is a property of the shaft group |
| **The mixed-use study's replication margin is tight** | n = 200 at up-peak 4 % is **ceiling-bound**, not variance-derived: the requirement for the hardest pair is 666, the measured ceiling is 206, and 200 leaves **six replications of margin**. A change that costs the arms six replications of headroom invalidates the point rather than widening it. The pair needing 666 is reported unresolved rather than quoted |
| **`C24` — CLOSED by a named non-test caller** | `cli/src/commands/fuzz.ts`, verified with the repository's own scanner ([§ D118](../DECISIONS.md)). Three weaker instances stand in its place and are listed in § 3 — `deepCampaignRequested`, `withCallType`, and `experiments/src/browser.ts` (**C34**) — plus the stopping rule, which has no non-test caller at all |
| **A phase's status is now bound to *evidence that exists* — and still not to evidence that *supports* it** | § D115 called this the largest un-mechanised risk in the repository. It is **narrowed, not closed** ([§ D123](../DECISIONS.md)). `validation/phaseStatus.test.ts` parses the phase set, every status and every cited artefact out of `docs/05-roadmap.md` — never a hand-written list — and fails if an accepted phase cites a test, directory, study function or pin group that does not exist, if a discipline table carries an undischarged row, if Phase 8's campaign table reports a violation, or if its own parse degrades to asserting nothing. Ten manufactured failures were watched. **What it provably does not catch:** that any measurement is *correct*; that a cited suite actually asserts the criterion it is cited for (citations are checked for existence, not relevance); that the criterion is the right criterion — nothing mechanical distinguishes a raised criterion from a weakened one; and it is **asymmetric by design**, never questioning a `partial` or `deferred` phase, because over-claiming is the failure this repository has shipped. The remaining defence is `CLAUDE.md` § Working agreements and a reader who checks |
| **`C33` — the `'z'`-label shape survives two files from where it was fixed** | Opened by [§ D117](../DECISIONS.md) rather than folded into C5's closure. `reports/statistics.ts:332` stamps `method: 't' as IntervalMethod` on an interval whose `halfWidth`, `lower` and `upper` are all `NaN` — an assertion that **widens a correct literal to the union for no reason**, and the one remaining place in `reports/` where the family loses its narrow type. Separately, `ConvergenceReport.method` is non-optional in `types.ts`, so a suppressed metric still *names* a family for an interval that does not exist. *"C5 is closed"* and *"the same defect exists two files away"* must not be the same sentence — this repository has twice been burned by a fix that made its own report true and left a sibling copy wrong |
| **`C34` — the new browser barrel has no non-test caller** | And cannot have one until `docs/10`'s W4 exists. Stated in the file rather than dressed up, with `browser.test.ts` as its mechanical owner meanwhile ([§ D121](../DECISIONS.md)). This is the repository's signature defect shape, entered knowingly and with its owner named |
| **`destination-entry` is unreached by both fuzz corpora** | Legal for 11 of 12 profiles and drawn by neither the 64-case nor the 2 000-case corpus. Now **stated on `GENERATED_CALL_TYPES` and asserted**, rather than silently absent ([§ D122](../DECISIONS.md)). Widening it is its own task: it moves about half of every corpus and makes the access-zone arm a three-way case — a call carrying a destination but no credential |
| **Three findings from the `C4` measurement, recorded rather than fixed in passing** | `validation/sequentialStopping.test.ts:163` still projects the budget with a **hard-coded `z90`** and prints the row **C19** corrected in both doc copies — so the repository derives one answer and publishes another, and C19 fixed the docs and missed the code. `runner/types.ts`'s `StoppingVerdict.distribution` still documents the `'t'` ≤ 25 / `'z'` past it family § D14 deleted. And `estimateMean` returns `halfWidth = 0` on a zero-variance sample, which is finite and below any target, so the rule stops immediately — `stopping.ts`'s docstring implies such a sample yields a non-finite half-width. Only reachable below the 50-replication floor ([§ D119](../DECISIONS.md)) |
| `stats/` consolidation | Statistics live in `reports/statistics.ts` and `runner/stopping.ts`; `docs/01` layout records this as outstanding |
| Profiles bit-identical to one another | `eta ≡ fairness-first` survives on both up-peak buildings and is *correct* there (`starvation` is zero for every candidate when no car holds a committed hall call). It still means "9 of 9 beat baseline" counts fewer distinct dispatchers than it sounds. **Re-measured through `runMatrix()` on 2026-07-28**, after the `destination-eta` weight: `eta ≡ fairness-first` at **five** cells, `auction ≡ auction-multi-round` at both Garden cells, `destination-eta ≡ eta` at **`garden-down-peak` only** (where the class also contains `destination-panel`), and a class no earlier report names — **`destination-eta ≡ capacity-aware` at `garden-residential`**. This is why the matrix baselines on `collective`, which is in no identity class at any cell — a baseline that is secretly one of its own arms makes that arm's whole row a row of exact zeros |
| `prepositionPlan` | Zero callers — superseded by `resolvePrepositionContext`. **Classified**, not deleted: one of the 14 entries in `dispatch/deadCode.test.ts`'s `PUBLIC_API_ONLY`, asserted in both directions |
| Mixed-use achieved **interval** | Reports `unmeasurable` by design: a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so **no** departure-gap threshold is valid there. Constrains the oracle; **does not** constrain a TTD comparison, which § D100 checked rather than assumed |
| Double-deck operation | Configured and validated on `vertical-city`, **not simulated**; disclaimed on every run of that building, and the disclaimer reaches `RunRecord` and the CLI report |
| Fuzzy pattern switching | `patternSwitching` is authored in `data/` and schema-validated, and no runtime code reads it. Deferred scope, not a defect to fix in passing — see `DECISIONS.md` § D12 |
| `C4` — the sequential stopping rule's budget | `productionStoppingRule` injects `estimateMean`, now Student-t at every `n`, so sequentially-stopped experiments may run marginally more replications. Deliberate and conservative; **needs a decision, not a default** |
| `C5` — a `'z'` label can still print | `reports/compare.ts:607` can print `'z'` as a fallback family label on a convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic, and it is the exact mislabelling finding #14 was about |
| `C27` — Phase 6a/6b studies are off the package barrel | Reachable at their module paths with `regeneratePins.ts` as the non-test caller, but not on `benchmark/index.ts` or `src/index.ts`. Name list in § D62; both files must change in one commit. `runMixedUseHighRiseStudy` is in the same position |
| `C32` — the fuzz generator picks call types blind to the profile | `fuzz/generate.ts` can name a call type the profile cannot carry a destination for; `run.ts` works around it in `withCallType`. A real corpus extension |
| Multi-replication statistics over generated buildings | One replication per case, as everywhere in `fuzz/`. Nothing there says a *mean* under a degraded fleet is right, only that the mechanics under it are sound |
| A dispatcher or a zone cannot be changed mid-run | A car's availability can (`BuildingConfig.serviceEvents`); the other two have no mechanism |

**Closed since this table was last written**, each verified rather than taken on report:
`fuzz-1000384` (§ 7), `C2`, `C7`, `C10`, `C11`, `C15`, `C16`, `C19`, `C20`, `C21`, `C22`, `C23`,
`C25`, `C26`, `C28`, `C29`, `C31`, and the phase-status vocabulary limitation (a fourth term,
`partial`, now exists and this document uses it). Also: **`destination-eta`'s inert destination**
([§ D112](../DECISIONS.md)), **the ninth dead seam** ([§ D114](../DECISIONS.md)), and **the viewer
and CLI printing a suppressed mean** ([§ D111](../DECISIONS.md)).

**Closed by wave 5**, each verified rather than taken on report: **C4** · **C5** · **C24** ·
**C27** · **C30** · **C32** · the four ⚠️ UX rows · `packages/experiments`' browser export
(the *prerequisite*; W4 itself is only partly unblocked) · and *no test asserts any phase's status*,
**narrowed rather than closed**. [§ D116](../DECISIONS.md)–[§ D124](../DECISIONS.md).

**Still open, in one place, because a reader planning work needs the list and not the prose:**

*Deferred by a recorded argument, not by neglect* — Phase 6c · Phase 9 · double-deck simulation ·
`patternSwitching` · `garden-down-peak`'s identity class · the `moveFloor` scope call.

*Live debt* — **C33** (the `'z'` shape at `statistics.ts:332`, and `ConvergenceReport.method` being
non-optional) · **C34** (the browser barrel has no non-test caller) · W4's TypeScript-condition gap ·
`deepCampaignRequested`, `withCallType` and the stopping rule, each with a test as its only caller ·
`destination-entry` unreached by both fuzz corpora · `sequentialStopping.test.ts:163`'s hard-coded
`z90` · `StoppingVerdict.distribution`'s stale docstring · `estimateMean`'s zero-variance
`halfWidth = 0` · the mixed-use study's six-replication margin · `stats/` consolidation ·
`runDestinationDispatchStudy` off both barrels.

*And the one that no longer has a name of its own, because it is now everyone's:* a phase's status is
bound to evidence that **exists**, not to evidence that **supports** it. The guard cannot tell a
raised criterion from a weakened one, and it never questions a `partial` or `deferred` phase. **That
is the largest remaining un-mechanised risk**, and it is smaller than it was, not gone.

> **Wave 5 closed nine items and opened seven.** That is the register working. `WAVE5_PLAN.md` § 5
> made *"the debt table rewritten to what is actually left, including anything this wave opened"* a
> condition of done, precisely because a register that only ever shrinks is not being read honestly —
> and because five of the seven were found only by fixing something adjacent to them.

### Two figures corrected here, because the handed-back versions did not reproduce

Both were carried through earlier passes as *transcribed, not re-measured*, and both were re-measured
before being written down:

| figure | was | is |
|---|---|---|
| `deriveUpPeakTerms`' `%POP` example (`core/src/analytical/upPeak.ts`, **C20**) | "102.8 % … instead of 26.3 %" | **82.5 % / 21.2 %** at the declared `tp = 1.75 s`. The published pair reproduces **only at `tp = 1.2 s`**, which **no car of that bank declares** — every shuttle car in `data/buildings/mixed-use-high-rise.json` authors 1.75 s. The ratio is unchanged, so the *point* the paragraph makes survives; the numbers were from a bank that does not exist |
| `vertical-city/zone-5-local`'s departure band (`core/src/metrics/summarize.ts`, **C21**) | "**5×** tighter than the next" | **1.23 s, 2.95× tighter** than the next narrowest and 28.8× below the widest. **The handed-back "5×" did not reproduce** over the fourteen-bank sweep. The band itself, 1.23 s, is confirmed |

---

## 9. How to work here

- Build → adversarial review → conditional fix → gate → integration verify. **Every phase
  so far has needed a follow-up; none passed its gate clean first time.** That is evidence
  the gates are set right, not that something is wrong.
- Gates must be told: *determine whether this is true, do not make it true.* The Phase 2
  gate refuted a stated prediction, the Phase 3 gate found the project's own CRN claim
  wrong by 10×, the Phase 5 gate reported its headline feature producing exactly zero, and Phase 8's
  fuzz track produced the finding that withheld its own phase's acceptance. All four were successes.
- Reviewers must **run things**, not read them. Agents have reported green suites that
  were red, and a tautological guard survived being flagged *and* reported fixed.
- **Never weaken an acceptance criterion to pass. Raise it.** This project has done it once, by
  accident, inside a decision whose stated purpose was to strengthen a gate (§ D27 → § D99). The
  remedy was to measure the dropped clause, not to argue it away.
- **If you publish a number, pin it to the run that produced it**, and if you write a sentence about
  *why* something performs better, either measure it or say it is unmeasured. Prose is the only
  artefact in this repository that nothing executes — which is why ten of twenty-one review findings
  were documentation drift, and why § 3's guards exist.
