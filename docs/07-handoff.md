# Handoff — resuming at Phase 6c and Phase 9

**Phases 0–5, 7 and 8 are landed and accepted. Phase 6 is partially complete.** A cold reader needs
the shape of both:

<!-- The sentence above is parsed by validation/documentation.test.ts. Its phase list must match
     § 1's table, README.md § Status and CLAUDE.md's status line, all four. -->


- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against
  the criterion [`DECISIONS.md` § D27](../DECISIONS.md) **raised**, and that criterion has now been
  measured on the building it names ([§ D100](../DECISIONS.md)). The gate is **met by the Level-0
  arm and not met by the Level-1 panel at any measured point** — both halves are the result. 6c
  (learned control) is **no longer deferred: it is implemented, measured, and NOT ACCEPTED** —
  ΔTTD `−0.213 [−0.440, +0.014]` against `collective` at n = 200 on a disjoint seed, an interval
  containing zero, unchanged at 24 and 64 search candidates ([§ D139](../DECISIONS.md) is the
  criterion, dated before the code; [§ D145](../DECISIONS.md) is the verdict). Double-deck operation
  is **simulated** ([§ D131](../DECISIONS.md)) and **benchmarked** ([§ D147](../DECISIONS.md)) to a
  **dispatcher-dependent** verdict; the disclaimer survives only in the narrower case of a
  double-deck bank declaring no `servesFloorPairs`, which no shipped building raises
  ([§ D132](../DECISIONS.md)).
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

### What wave 6 moved — four standing deferrals measured, and **no verdict rounded up**

Wave 6 (2026-07-28, board at [`WAVE6_PLAN.md`](../WAVE6_PLAN.md)) is the first wave that was allowed
to move a phase verdict, and **none moved.** That is the result rather than the absence of one: 6c
was built, measured against a criterion written before it existed, and **refused**, so Phase 6 is
still ⚠️. Read the four rows that carry verdicts before anything else:

| | |
|---|---|
| **Phase 6c — implemented, measured, and NOT ACCEPTED** | Built as **learned weight selection** rather than a 400-parameter RL vector, which dissolves two of § D28's three objections instead of arguing them away; the third — *its criterion was stated in the metrics 6b makes non-comparable* — was answered **first**, in [§ D139](../DECISIONS.md), dated before a line of the policy existed. ΔTTD `−0.213 [−0.440, +0.014]` against `collective`, n = 200, disjoint seed, CRN; the interval **contains zero**, and is unchanged at 24 and at 64 search candidates. [§ D145](../DECISIONS.md) |
| **Phase 7's one undelivered bullet ships, and is *not* a win either** | The fuzzy traffic-pattern detector with hysteresis now drives per-pattern weight sets and is live on trajectories, not on a mean ([§ D143](../DECISIONS.md)). Its ΔTTD `−0.212 [−0.416, −0.007]` **does** exclude zero — and is **still reported below the resolution limit**, because both arms are structurally different dispatchers for part of the run and § 4 prices that regime's smallest detectable effect at **1.9 s**. [§ D140](../DECISIONS.md) made that a **gate condition** rather than a caveat, and wrote the raise into the study before either arm was run |
| **The search is not what failed** | The known-answer check passed: pointed at `idle.repositionThresholdS`, the same machinery returned **1.691 s at 64 draws, 1.490 s at 128, 1.874 s at 256** against a shipped 8 s. The 32-draw run returned 4.855 s and is reported rather than discarded — under-sampled, not wrong-surfaced — and **that** is what set `SEARCH_CANDIDATES = 64`, from a dimension whose answer was known and not from 6c's result. [§ D144](../DECISIONS.md) |
| **Double-deck is simulated, and benchmarked to a `DISPATCHER-DEPENDENT` verdict** | ΔTTD on `vertical-city` up-peak: **WORSE under `eta`** (`+1.950 [+0.975, +2.925]` at 1 %), **BETTER under `collective`** (`−1.408` at 1 %, `−5.291` at 1.5 %), and one cell **permanently unresolvable** — required n ≈ 869 against a ceiling of 386. **There is no verdict of the form *double-deck is better*.** Energy is WORSE in all four cells and did not buy it by serving fewer people: `unservedFraction` is exactly 0 on both arms at every replication. [§ D131](../DECISIONS.md), [§ D147](../DECISIONS.md) |

Closed alongside them, each verified rather than taken on report: **`C33`** (both halves,
[§ D126](../DECISIONS.md)) · **all three `C4` findings** ([§ D127](../DECISIONS.md)) ·
**`C34`** (0 → 3 non-test callers) and W4's TypeScript export-condition gap
([§ D134](../DECISIONS.md)) · the fuzz corpus's third rung, `destination-entry`
([§ D128](../DECISIONS.md)) · `deepCampaignRequested` as a **recorded exemption** and `withCallType`
as **never having been a weak seam** ([§ D129](../DECISIONS.md)) · **the eleventh dead seam, the
whole deck API** ([§ D131](../DECISIONS.md)) and its disclaimers, argued one site at a time
([§ D132](../DECISIONS.md)) · `moveFloor`'s scope call ([§ D135](../DECISIONS.md)) ·
`garden-down-peak`'s open question ([§ D136](../DECISIONS.md)) · **`C35`, opened and closed inside
the wave** ([§ D130](../DECISIONS.md) opened it as a blocking fuzz finding,
[§ D137](../DECISIONS.md) closed it in `core`) · the citation-guard gap
([§ D138](../DECISIONS.md)) · the bare-kiosk re-pin ([§ D149](../DECISIONS.md)). **TWIN** — two
independently driven cars in one shaft — is **designed and not built**, in
[`docs/11-twin-shaft-contract.md`](11-twin-shaft-contract.md); it is **not** double-deck
([§ D148](../DECISIONS.md)).

> **Six of the things wave 6 found were wrong were in the register itself, and every one was
> optimistic.** A register read rather than checked is a register that drifts in one direction.
> § 8 carries all six with the evidence; the short form is: one `C4` finding was **already closed**;
> another was **ten places, not one, and six of the ten were false about the code**; that finding's
> *"only reachable below the 50-replication floor"* was wrong about the phenomenon; **`withCallType`'s
> row was wrong on both halves and it was never a weak seam**; the dead-seam count was **ten in code
> plus one in `data/`**, not nine; and `garden-down-peak`'s row **asked a question whose answer is
> yes**. A seventh is about the guards rather than the register and is in § 3.

**Wave 6 opened items as well as closing them**, which is why § 8 is not shorter — the `G → 2` lobby
leg, `PROFILE_OBJECT_SECTIONS` (**closed by T54**, § D152), the selector's CLI gap, TWIN's nine
gating questions and eight more.
A register that only ever shrinks is not being read honestly.

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
`C5`. (`C4` has since closed — [§ D119](../DECISIONS.md) and [§ D125](../DECISIONS.md) — and closing it moved no number either:
nothing outside a test ever injected a stopping rule, so the budget it asked about had no subject.)
The pin table moved **40 rows changed, 12 added, 0 removed, all `destination-eta`**.

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
| 7 — Automated tuning | ✅ **ACCEPTED** — search space, three searches, held-out validation, a CLI `tune` that calls them, **and its one undelivered bullet — the fuzzy traffic-pattern detector with hysteresis driving per-pattern weight sets — now ships and drives a run**; measured BETTER on TTD and reported **below the resolution limit** |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `fuzz`, `watch` |
| **6 — Destination dispatch & learned control** | ⚠️ 6a and 6b accepted against the raised criterion, measured on the building it names: **met by Level 0, not met by the Level-1 panel**; **6c implemented, measured and NOT ACCEPTED**; double-deck **simulated and benchmarked**, to a **dispatcher-dependent** verdict |
| **8 — Testing campaign** | ✅ Blocking clause **discharged** — 0 outstanding property violations, deep tier green at 2 000 cases — and all eight tracks landed, the last being the full experiment matrix (8 cells × 12 profiles, Pareto over AWT / energy / WT95) with Phase 7's acceptance interval at n = 150 |

**Every sub-phase now has a measurement rather than a deferral, and Phase 6 is still ⚠️ because one
of them was refused.** Phase 7's one undelivered scope bullet — the fuzzy traffic-pattern detector —
was carried as not-done in [the roadmap](05-roadmap.md) rather than folded into the ✅ for as long as
`data/dispatcher-profiles.json` shipped a schema-validated `patternSwitching` block that no runtime
code read. It is read now: `dispatch/selector.ts` is the mechanism, the block is its arm set, and
`weightSetsByPattern`'s dangling `energy-saver` is repointed to the shipped `energy-aware` with the
selector **refusing** a dangling name rather than falling back silently
([§ D141](../DECISIONS.md), [§ D142](../DECISIONS.md)). Phase 6c got the same treatment in the other
direction: it is `⬜ IMPLEMENTED, MEASURED, AND NOT ACCEPTED` in the roadmap, with its criterion
([§ D139](../DECISIONS.md)) dated before its code, rather than swept into a neighbouring tick.
Phase 8's eighth track was carried this way until it landed; it is now ✅ with the study that
discharges it named.

### Running it

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- fuzz --cases 8                  # or: --tier deep --cases 2000, the overnight pass
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test          # full suite: 190 files, 3,505 tests (3,496 pass, 9 skip)
```

Measured on this tree after wave 6 closed, 2026-07-28, **serially on an idle machine**:
`npx tsc -b` clean, `npx vitest run --testTimeout=120000` → **190 files / 3 505 tests, 3 496
passed, 9 skipped**, exit 0, 473 s. The benchmarks execute real replications, which is where the
runtime goes.

> **This is the *second* serial run, and the first one was red.** It came back
> **2 failed | 3 494 passed**, and neither failure belonged to any lane — both were guards catching
> staleness that no lane could see from inside its own scope. `runner/deadCode.test.ts` reported
> `replicationSeeds — now has a caller`: allowlisted as a plural whose collision check is never armed
> in a run, which was true until a new study began drawing a whole experiment's seeds at once, so
> the entry was **deleted rather than annotated**, as that guard's second assertion requires.
> `benchmark/matrix.test.ts` reported **176 stale pins**, and its message is explicit that you must
> *"establish WHICH of the two numbers is correct before regenerating"* — so it was established
> rather than assumed: all 176 sit on `vertical-city-up-peak` and **none anywhere else**,
> independently reproducing three lanes' separate blast-radius measurements. The old pins described
> single-deck hardware on a building that has always declared eight double-deck cars. They were
> stale because the simulator **stopped being wrong** ([§ D150](../DECISIONS.md)).
>
> **Report the red run, not only the green one.** A suite that is green on the second attempt is a
> different fact from a suite that was green, and this document exists so a cold reader gets the
> first kind of fact.

> **Wave 6's +152 is accounted for by lane**, as wave 5's +129 was: `validation/quantileFamily`
> (§ D127) and `validation/citations` (§ D138) are new files, as are `fuzz/deadCode` (§ D129),
> `core/sim/doubleDeckSeam` (§ D131), `core/sim/bareKiosk` (§ D137), `core/dispatch/selector`
> (§ D141), `benchmark/downPeakDestination` (§ D136), `benchmark/weightSetSelection` (§ D145),
> `benchmark/doubleDeck` (§ D147), and `viz/src/controls/{controls,render}` (§ D134) — **179 → 190
> files**. The skip count is **unchanged at 9** through both waves, which is the number worth
> watching: a wave that quietly skips a test to go green moves it.
>
> **Wave 5's +129 is accounted for, test by test**, as § D115's +48 was: `reports` +4 (§ D117);
> `cli/commands/fuzz.test.ts` +16 and `index.test.ts` +1 (§ D118); `browser.test.ts` +22 (§ D121);
> `fuzz/generate.test.ts` +10 (§ D122); `runner/stoppingBudget.test.ts` +6 (§ D119);
> `config/parse.test.ts` +6 (§ D116); `viz` `bootstrap.test.ts` + `motion.test.ts` +9 (§ D120);
> `validation/phaseStatus.test.ts` +55 (§ D123). **3 220 → 3 349**, and **172 → 178 files** for the
> six new files in that list. A concurrent session then added **+4 tests and the seventh new file**,
> `runner/deadCode.test.ts` ([§ D125](../DECISIONS.md)) — **3 349 → 3 353, 178 → 179**. The skip
> count is unchanged at 9 throughout.

**Do not treat the wall-clock as a fixture.** The commit that landed the eighth track (`f895a16`)
measured the suite going from 435 s to **519 s** on its machine; a re-run of the same tree took
**793 s**; the 3 220-test tree took **578 s**; the 3 349-test tree took **567 s**; the 3 353-test
tree took **466 s**; and this **3 505**-test tree took **473 s** — *fewer* seconds for *more* tests,
three times over, which is the point. All six are true and none is a property of the code. If you
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

**This project shipped ten defects of the form "configurable, unit-tested in isolation,
dead in the shipped path" — plus one in `data/` rather than in code.** Each passes every other
check the repo runs. The count is the length of this table, not a number carried in prose — **and
the register carried it as *nine plus one* until wave 6 measured the eleventh** ([§ D131](../DECISIONS.md)),
in `CLAUDE.md`, here, and in `WAVE6_PLAN.md` § 2. The numbering below is **not** renumbered to fit:
the `data/` instance keeps the 10 it was given, *"the ninth dead seam"* elsewhere in these documents
still correctly names § D114's instance, and the deck API is 11.

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
| **11** | **The whole deck API on `model/bank.ts`** — `isDoubleDeck`, `deckAt`, `deckAssignmentFor`, `pairedFloorOf`, `servesFloorPair` | **0 non-test, non-barrel callers anywhere in the tree**, measured with the repository's own binding rule before a line was written. It is the instructive one because **nothing about it looked neglected**: `vertical-city` had authored eight double-deck cars and four `servesFloorPairs` since the building was written, `config/parse.ts` cross-validated the pairing against the floor heights with **four dedicated warning codes**, and `Bank` built a `deckByFloorId` index that was correct. **The configuration was right, the validation was right, and nothing consulted either** — instance 6's shape (`seedSetFromReplications` *"existed **to be** the seam"*) with a whole subsystem behind it. Closed by **simulating** it; `pairedFloorOf` and `servesFloorPair` were **deleted** rather than wired, because the model that made the rest live had no use for them ([§ D131](../DECISIONS.md)) |

**The weaker instance that was recorded here is CLOSED**: `fuzz/`'s only non-test caller used to be
a test (`campaign.ts` ← `corpus.test.ts`), tracked as **C24**. `cli/src/commands/fuzz.ts` is now the
named non-test caller of `runCampaign`, `formatStats`, `STANDARD_CORPUS`, `deepSeeds` and
`deepCampaignSize` — **verified with the repository's own scanner rather than asserted**
([§ D118](../DECISIONS.md)).

**Three weaker instances stood here after wave 5. Wave 6 resolved all three, and only one of them
was what this section said it was:**

| | |
|---|---|
| `deepCampaignRequested` — **a recorded exemption** | Still scans to `[]`, and now **allowlisted with a stated reason and asserted in both directions** in the new `fuzz/deadCode.test.ts`. Wiring it to `cli/src/commands/fuzz.ts` is the caller § D118 **refused** — *"a tier chosen by an ambient variable is a tier a user cannot see in their own shell history"* — so making the count go down would have reversed a recorded decision to satisfy a guard. The allowlist's staleness assertion is what makes the exemption falsifiable: **an importer appearing turns the suite red and forces § D118 to be re-argued** ([§ D129](../DECISIONS.md)) |
| `withCallType` — **this row was wrong on both halves, and it was never a weak seam** | It said *"its only caller outside `fuzz/generate.ts` is `validation/adversarial.test.ts`"*. Checked with the scanner: **`generate.ts` does not call it at all** — `run.ts:163` does — and that call sits on a live chain whose far end is a shipped CLI command: `cli/commands/fuzz.ts → runCampaign → evaluateCase → fuzzSimulationConfigFor → withCallType`. **Two of the three links are intra-file**, so `nonTestImportersOf` genuinely answers `[]` and the row read as true. `nonTestImportersOf` answers *"who imports it"*; the standing rule asks *"name the non-test caller"* — **when the answer is a chain those are different questions, and the register recorded the answer to the easier one.** The chain is now pinned link by link, each cross-file link as an import binding and each intra-file link as a second occurrence in stripped source, with the `[]` kept beside it in the other direction ([§ D129](../DECISIONS.md)) |
| `experiments/src/browser.ts` (**C34**) — **CLOSED** | **0 → 3** non-test, non-barrel importers, counted with `auditModules` with comments stripped so a `{@link}` is not an import: `viz/src/controls/controls.ts`, `viz/src/controls/types.ts`, `viz/src/dev/parameterForm.ts`. The reading worth having is one layer down — `activeParameters`, `parameterOf` and `defaultCandidate` were three of `tuning/space`'s six uncalled exports, **and a generic editor is what they were written for** ([§ D134](../DECISIONS.md)) |

The stopping rule was a fourth and is now **a recorded exemption too**: nothing outside
`validation/` ever injects one, the port is admissible only for single-cell precision-targeted
estimation of which none ships, and one of `runner/deadCode.test.ts`'s assertions **pins the
exemption itself** — a study that injects a stopping rule turns it red ([§ D125](../DECISIONS.md)).

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
| `experiments/src/runner/deadCode.test.ts` | The **third** copy — 86 `runner/` exports, 7 uncalled, all seven allowlisted with reasons and asserted in both directions. One assertion pins the stopping-rule **exemption itself** | `C4` ([§ D125](../DECISIONS.md)) |
| `experiments/src/fuzz/deadCode.test.ts` | The **fourth** copy, in the directory that carried `C24`, which none of the other three audited: 63 exports, 8 uncalled — the seven fault injectors (a fault injector *with* a shipped caller would be the defect) and `deepCampaignRequested`. It also pins `withCallType`'s **caller chain**, link by link, because an importer query cannot see an intra-file link | The `withCallType` row above, which was wrong on both halves ([§ D129](../DECISIONS.md)) |
| `experiments/src/benchmark/published.test.ts` | A published interval that the code no longer produces, or that changes in silence. Every interval-shaped literal in `benchmark/` is either reproduced by a pinned estimate at its own printed precision or declared unpinned with a count. **Now with a second pair of layers for *counts*** — `PINNED_COVERAGE` field-for-field at the same tolerance, and `derivedCoverageForms()` as the vocabulary a table row must be renderable from | Three figures that did not reproduce — one measured before a seam was wired, two double-rounded. **And then a fourth it could not see at all**: see the note below this table |
| `experiments/src/validation/documentation.test.ts` | Five separate drifts: the phase set disagreeing across `CLAUDE.md` / `README.md` / this file; this file contradicting *itself* between its opening line and its own table; a `docs/*.md` on disk and not in README's table; a roadmap reproduction instruction naming a function nobody exports; and — since [§ D149](../DECISIONS.md) — `docs/05`'s H-ACCESS-1 coverage rows, which must be **renderable from the study's own pins** rather than transcribed, watched failing on a single drifted digit. **And** the refuted access-control mechanism, three ways — a claim with no refutation within 400 characters, a correction silently deleted, and `estimateCost.ts`'s exclusion asserted in both directions | Review findings #2, #17, #18; § D60, where seven places asserted a refuted mechanism and *nothing went red*; and the bare-kiosk figures, which drifted for four days with nothing red |
| `experiments/src/validation/citations.test.ts` | **A cited path that cannot be followed**, in two forms — every relative markdown link, and every backticked `.md` path resolved against the root *or* the citing file — **plus every `§ Dnnn` naming a real `## Dnnn` heading in `DECISIONS.md`**. Fenced blocks are blanked, not removed, so a reported line number still means something; both halves assert they found something to check | Four lane records — `DECISIONS-T16`, `-T20`, `-T29`, `-T30` — merged into `DECISIONS.md` and deleted, leaving **eight citations to paths that have never existed**, one of them the home of a decision a whole scope call rested on. And a `§ D144` cited by hand for a verdict whose entry was not yet numbered ([§ D138](../DECISIONS.md)) |
| `experiments/src/validation/quantileFamily.test.ts` | The deleted `n ≤ 25` **t/z crossover** stated anywhere under `packages/*/src` without a supersession marker within **300** characters. The file list is derived from disk; markdown is out of scope on purpose, because `DECISIONS.md`'s job is to carry superseded statements verbatim | `C4`'s stale docstring, recorded as one place, corrected to four by `WAVE6_PLAN.md` § 1, and **measured at ten — six of them false about the code**. The window is tighter than § D60's 4× because 4× was measured too loose: restoring the original one-liner put it **349 characters** from a marker belonging to the *neighbouring* corrected docstring, and a generous window lets a newly-stale sentence **borrow its neighbour's refutation** ([§ D127](../DECISIONS.md)) |
| `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree disagreeing with disk, **in both directions** — a phantom directory and an undocumented one both fail. Scoped to workspace members that are installed, with `core`'s presence asserted so the scope cannot degrade into "skip everything" | Review finding #15, and C28 |
| `viz/src/boundaries.test.ts` | Invariant 6's import direction, plus the no-DOM rule, both with positive controls | Phase 4 |
| `core/src/browser.test.ts` + the import-graph guard | A `node:` builtin reachable from the browser barrel — `loadConfig` imports `node:fs/promises`, so a browser import used to throw at module evaluation | C2 (§ D31–§ D33) |
| Three `estimateCost` purity guards | Invariant 1, including a source-level guard that the module cannot import an RNG | — |
| `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` | A stored run that no longer replays byte-identically | Invariants 4 and 5 |
| `benchmark/saturationCensus.test.ts` | An operating point excluded by its **ceiling** being reported as if it were excluded by its **answer**. The two are indistinguishable in a results table | § D100's 3 % row |

> **A guard missed a stale published figure at *both* of its layers, by construction, and the shape
> is worth more than the instance.** The `C35` fix moved the bare-kiosk arm's Secure Tower figures
> from `27.6` undelivered / `51.7 %` unserved to **`52.2` / `100.0 %`**, and nothing went red for
> four days. `published.test.ts` is the guard whose entire purpose is catching this.
> **Layer A** — the pin table — excluded H-ACCESS-1 on the *correct* observation that a categorical
> has no standard error, and **that was read as a licence to hold nothing**: a categorical does not
> need an interval pin, it needs a **count** pin. **Layer B** scans `benchmark/` for literals shaped
> `N [N, N]`, and `51.7 %` is not interval-shaped — *the scan did not fail to match it; it was never
> asked to.* Meanwhile `accessControl.test.ts` asserts **inequalities**, and every one of them held
> *more* strongly after the change, because the figure moved in the direction that makes its own
> sentence more true. **A stale number that still supports its own sentence is the only kind nobody
> re-checks, and it is worse than one that contradicts it.** Both layers now carry a count form
> ([§ D149](../DECISIONS.md)) — **for this study.** The class is still open, in § 8.

### Standing dead-code audit

For every exported symbol in `dispatch/policies/`, `dispatch/predictor/`, `experiments/tuning/`,
`experiments/runner/` and `experiments/fuzz/`, count callers outside its own module and tests. Every
zero must be classified as dead or as deliberate public API. Do this each phase. **All of it is
mechanised** — four copies of one audit now, over one scanner (`auditModules` in
`tuning/callers.test-helper.ts`), not four scanners; when this section was first written the second
copy did not exist and the sentence was read as though it did. *A standing requirement stated in
prose is not a standing requirement.* **Each new copy has found something in the directory nobody
had audited**: `runner/` gave 7 uncalled of 86, `fuzz/` 8 of 63, and both shared blind spot is
stated in their headers — a symbol used twice inside its own file reads as live regardless of who
imports it, which is the rule that (correctly) reports `withCallType` live.

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

**It has now been passed twice, by two different searches, and the shipped value is still 8 s.**
The second pass is Phase 6c's own machinery — `runDeadbandKnownAnswer` runs the **same search** that
fitted the learned policy, on a different building at a different metric, and nothing in the
procedure knows what a deadband is. It returned **1.691 s at 64 draws, 1.490 s at 128 and 1.874 s at
256**. The **32-draw run returned 4.855 s and is reported rather than discarded**: it is not the
failure § D139 names — it did not return 8 s — but it is not the known answer either, and it is
diagnosable, because only 3 of 32 draws land below the shipped 8 s over the declared `[0, 60]` range
and the two that do reproduce the sweep's own direction. **The surface was right and the search was
under-sampled, and that is what set `SEARCH_CANDIDATES = 64`** — calibrated on a dimension whose
answer was known rather than on 6c's result, which § D139 names as a way to make its own criterion a
bad one ([§ D144](../DECISIONS.md)).

**The first pass is what Phase 7's acceptance rests on.**
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
810 000, each building's principal bank. **Double-deck simulation did not move any of it, and this
table does not need regenerating** — all five residuals reproduce bit-for-bit, Vertical City
included at **−0.140 %, RECONCILED**. That is not luck and it is not a tolerance: `isolateBank`
builds its single-bank building from `zone-1-local`, which has **no double-deck car**, so the
measurement is structurally untouched ([§ D131](../DECISIONS.md)).

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
| `vertical-city/shuttle` | Blocked **four separate ways**, none of them a tolerance: (1) eight double-deck cars — and this blocker **did not go away, it changed sides**: the simulator now models the decks (§ D131) and the **closed form does not**, `RTT = 2(H·tv + tx) + (S+1)·ts + 2·P·tp` being the single-deck Barney/CIBSE derivation, so the simulator makes one stop where `(S+1)` counts two. `analytical/upPeak.ts`'s warning was **kept and strengthened** rather than retired, which is the over-claim `WAVE6_PLAN.md` § 7 named in advance ([§ D132](../DECISIONS.md)); the double-deck closed form is not implemented and is out of scope by decision; (2) all eight served floors declare `population: 0`, so `U` is entirely onward traffic (2 872 occupants of zones 3–6) and `%POP` against a zero population is not a small number, it is not a number; (3) a 26-person car holds its doors 41.20 s against a shortest possible round trip of 30.03 s, so no clustering threshold separates a reopen from a return; (4) its eight floors are four *pairs* 4.5 m apart with binding deck assignment, so `N` is not the count the model means |
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
- ⬜ **6c — learned control. IMPLEMENTED, MEASURED, AND NOT ACCEPTED** — which is a different state
  from deferred and a better one: a deferral is an absence of evidence and this is evidence. § D28's
  first two objections were dissolved by **choosing a shape rather than arguing**: built as learned
  **weight selection** over the vectors already in `data/`, it shares the very weight vector 6a and
  6b price against, and a selection policy is a declarable tunable with type, range, default and
  `activeWhen`. The third — its criterion was stated in the metrics 6b makes non-comparable — was
  answered **first**, in [§ D139](../DECISIONS.md), dated before the code, and adopted verbatim
  except for one **raise**: [§ D140](../DECISIONS.md) makes *below the resolution limit* a **gate
  condition** instead of a caveat, written into the study before either arm ran.
  **The verdict**, Midtown Office interfloor-mix 1.5 %, reference arm `collective` chosen from this
  cell's own 200-replication census *before any selector arm existed*, n = 200, seed 20261537
  disjoint from the tuning seed, CRN: ΔTTD **`−0.213 [−0.440, +0.014]` — the interval contains
  zero.** Unchanged at 24 and at 64 candidates. Costs beside it, never folded in: ΔAWT `+0.424`
  WORSE, ΔWT95 `+0.675` INDISTINGUISHABLE, energy `+4.807 kJ` per served leg WORSE.
  22 of 200 replications bit-identical, so it is not the wiring bug § D139 warns about, and the
  holdout sign agrees with the tuning sign — **a generalizing effect that cannot be resolved is
  still an effect that cannot be resolved.** [§ D145](../DECISIONS.md)
- **Phase 7's fuzzy arm — measured in the same study, and the row that could have been
  over-claimed.** Its ΔTTD
  `−0.212 [−0.416, −0.007]` **does** exclude zero on the better side. Both arms switched weight sets
  on most replications, so both are structurally different dispatchers for part of the run, and § 4
  prices that regime at **1.9 s**: −0.212 s is a **tenth** of it. Reported below the resolution
  limit ([§ D143](../DECISIONS.md), [§ D145](../DECISIONS.md)).
- ✅ **Double-deck and `vertical-city` — SIMULATED and BENCHMARKED, to a `DISPATCHER-DEPENDENT`
  verdict.** Paired stops keyed by stop position, dwell charged to the **busier deck rather than the
  sum**, the 80 % design load applied **per deck**, and a cross-deck leg **refused** because the
  decks are bolted together (200 legs refused on a real run, conservation balanced, nobody left
  undelivered by it). Blast radius **48 of 60 shipped cells byte-identical**, the 12 that moved all
  `vertical-city` — the only building declaring a double-deck car ([§ D131](../DECISIONS.md)).
  **The gate, ΔTTD paired-t 95 % under CRN, budgets from this cell's own census and none inherited:**
  WORSE under `eta` (`+1.950 [+0.975, +2.925]` at up-peak 1 %, n = 153), BETTER under `collective`
  (`−1.408 [−2.400, −0.416]` at 1 %; `−5.291 [−6.350, −4.232]` at 1.5 %, n = 200), and `eta` at
  1.5 % **permanently unresolvable** — required n ≈ 869 against a ceiling of **386**.
  **So the sign is a property of the dispatcher held fixed, and no verdict of the form "double-deck
  is better" is available on this building.** Energy is WORSE in all four cells — more kilojoules,
  more metres, more starts — and it did **not** buy that by serving fewer people: `unservedFraction`
  is exactly `0` on both arms at **every** replication of both points. The naive *fewer stops ⇒ less
  driving* is refuted here; the mechanism is § 8's `G → 2` lobby leg. `nearest-car` is excluded by
  its **ceiling** and not by its answer, and is published rather than dropped.
  [§ D147](../DECISIONS.md). **This is not a Phase 6 verdict** — the phase's criterion is about
  destination dispatch; what moved is what the double-deck bullet is *true of*.

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
   `garden-down-peak`, and wave 6 measured *why*: the cell is blind to **`rideTime`** and **not**
   blind to the destination, and the class it names is only true at that cell's budget and seed
   (§ 8, [§ D136](../DECISIONS.md)).
3. `fairness-first` is identical to `eta` at **five** cells and `auction-multi-round` to `auction` at
   both Garden cells — both unchanged. **A third class was found in the re-measurement:**
   `destination-eta ≡ capacity-aware` at `garden-residential`, which no earlier report names.
4. A saturation ceiling is a property of (building, traffic, seed), not of a building — see § 4.

`docs/05` § *What the matrix found* carries the per-cell table, re-derived by running `runMatrix()`
after the weight landed rather than carried over.

---

## 8. Open debt — stated, not buried

**Four parts, and the order is deliberate**: what wave 6 **opened**, what is **standing**, what is
**closed and worth reading anyway**, and — last — the short form for someone planning work. **Six
rows that used to be in this table were checked against the code in wave 6 and six were wrong, every
one in the optimistic direction.** They are kept, corrected, in § *Where this register was wrong
about itself*, because deleting them would delete the evidence that a register has to be checked
against the code rather than read.

### Opened by wave 6

| Item | Notes |
|---|---|
| **The `G → 2` lobby leg is charged as an elevator leg — the largest modelling debt in the wave** | `core` has **no escalator and no stair**, so the ground-level hop a real two-level double-deck lobby serves with an escalator is routed onto a local bank. On `vertical-city` a passenger boarding at `G` — the lower floor of the pair `["G", "2"]` — may only alight on lower-pair floors, and zone 4 is anchored to **27**, so every journey into the 27-side gains a leg: **110 of 593 journeys** are decomposed differently, +10.8 % / +11.6 % legs at the two operating points. It costs the double-deck arm legs, waiting, in-car time and fleet distance the hardware would not really pay. **This is the single largest reason to read § 7's WORSE-under-`eta` row as an upper bound on the cost of double-deck rather than as its true cost.** It is *not* a reason to discount the energy direction, which carries the same sign in all four cells. Named rather than corrected: correcting it means a non-elevator transport mode in `core` ([§ D147](../DECISIONS.md) § 6) |
| **The 1.5 % double-deck point is seed-marginal; the 1 % point is the robust one** | 1.5 % is the highest rate at which every arm keeps a quotable AWT — `arms.ts`'s rule, not the study's — and its ceiling is **386**. At the *pilot* seed the DD `eta` cell lost its AWT inside 100 replications, which is what a ceiling of 386 looks like from one seed over. Published rather than smoothed. The 1 % point's ceiling is **951** ([§ D147](../DECISIONS.md)) |
| ~~**`tuning/space/encode.ts`'s `PROFILE_OBJECT_SECTIONS` is a hand-written list**~~ **CLOSED** — and the sweep's copy of it is **open, and now stated** | The list is derived from `dispatcherProfileSchema`'s own shape by `core`'s `objectSectionsOf`; `encode.ts`'s constant **is** that value by identity, and the counts did not move — **56** dimensions, **106** declared rows, same seven sections in the same order. Measured on a fictional eighth section added to `core` alone: hand-written list **56, row absent**; derived list **57, row present**, with no edit in `experiments`. Proved against a schema the product does not ship (§ D134's technique), and the blind spot is asserted rather than stated — a section authored as a `z.record`, union, intersection or lazy is still invisible. **What is not closed:** `core`'s `sim/searchSpaceLiveness.test.ts` carries the same array and it was stale the same way (six against seven). Deriving it there turns the sweep red with exactly the seven `selection.*` ids, because `sim/simulation.ts` never builds a weight-set selector — the row below. Left red-free rather than allowlisted, and the omission is now an asserted claim with a reason ([§ D152](../DECISIONS.md)) |
| **The shipped demand template cannot vary the directional split within a run — so the condition selection exists to exploit does not exist at any shipped operating point** | Measured before any ΔTTD, at all eight sweep cells: Pearson homogeneity over the time-bin × direction-category table is inside its own noise everywhere (largest standardized deviation **+1.83 σ**), and four cells have one direction category by construction. `DemandPhase` carries `startIntensity`/`endIntensity` — a **scalar** — and `generator.ts` applies one `intensity(t)` to every demand source, so all three detector inputs swell and shrink together. What *does* move is the **level**, and exactly one of the five authored patterns (`idle`) is level-triggered, which is what the two significant one-regime arms actually found. **The fix is a `core` change** — a demand template whose split varies by phase — and [§ D151](../DECISIONS.md) § 7 fixes three constraints on it in advance: opt-in and byte-identical when unused, the same reference rule, and a win there stated as *"selection helps when the directional mix changes mid-run"* and never as *"selection helps"* ([§ D156](../DECISIONS.md)) |
| **The weight-set library reaches studies and not the shipped runner** — **CLOSED by T53** | It travelled as a `DispatchPolicyOptions` field, which `runner/experiment.ts` already plumbs per dispatcher arm, so a **study** could enable the selector and **`elevator-sim run` / `tune` / `watch` could not**. **Fixed as the row said it should be**: `SimulationConfig.dispatcherProfiles` carries the file the way `elevatorSpecs` already did, `Simulation` derives the arms through `dispatch/policy.ts`'s `weightSetSourceFrom`, and `cli/src/commands/run.ts`'s `planRun` — the function `runCommand` calls — supplies it, with `compare` and `tune` supplied through `ExperimentResources`. **The non-test caller is named**: `run.ts:planRun` → `simulation.ts` → `weightSetSourceFrom` → `resolveWeightSets` → `selectWeightSet`. A profile now opts in **as data**, and `cli/src/commands/run.selector.test.ts` proves it by editing a copy of `data/dispatcher-profiles.json` and running the command: default-off is byte-identical to a config that never carried the file, permuting `weightSetsByPattern` moves the car trajectories, and permuting a regime the point never enters does not. Two smaller holes closed with it — `dispatcherOptionsOf` dropped `selection` silently, and a hand-built `weightSets` library is now refused at store time rather than stored as a record that replays a different dispatcher. **Still open, narrowed**: the browser viewer cannot — `viz/src/dev/data.ts`'s resource bundle carries the profile *array* and never the file-level block, so `dev/main.ts` has nothing to hand `SimulationConfig.dispatcherProfiles`; a selecting profile is refused there by name rather than run, which is the safe failure but is not the seam. Unchanged and deliberate: **no shipped profile opts into a selector** — both arms are *derived* in `benchmark/weightSetSelection.ts`, the precedent being `destination-eta-unpriced`, and on § D145's measurement neither has earned a shipped slot |
| ~~**§ 4's two resolution limits were measured on AWT and were applied to TTD**~~ **CLOSED by measurement in wave 7** | The limits are now measured on **TTD at each cell** across all eight sweep cells: structural **0.509–0.991 s**, near-neighbour **0.077–0.727 s**. Every measured structural limit is **smaller** than the inherited 1.9 s, which is the *permissive* direction — measuring made the gate **easier** at every cell and nothing in the primary family cleared it anyway, so the refusal is robust to the choice. The formula is calibrated against § 4's own near-neighbour figure (`+0.4 distanceTravelled`, `s_D` 0.7728 s at n = 100 → **0.2165 s** against the published 0.2002 s, 8 %). **§ 4's own two numbers are not computed the same way** and that is now on the record: 0.20 s is an empirical 80 %-power figure, 1.9 s is `1.96·s_D/√n`, a just-significant one ([§ D156](../DECISIONS.md)) |
| ~~**Phase 6c's refusal is one operating point**~~ **CLOSED by measurement in wave 7 — and the refusal held** | Swept over **eight** pre-registered operating points across five buildings and five traffic patterns, Holm-corrected within two families that are never pooled ([§ D151](../DECISIONS.md) is the protocol, dated before any ΔTTD; [§ D156](../DECISIONS.md) is the result). **NOT ACCEPTED at all five PRIMARY cells.** Two of the five clear the correction and are refused anyway on § D140's raise. One **secondary** cell — Midtown down-peak 1 % — clears every gate at ΔTTD `−2.130 [−2.730, −1.529]` and does **not** accept the phase: a secondary cell cannot, and it is a one-regime cell whose learned arm turns out to have found a **busy/idle schedule** rather than a traffic-pattern selection |
| **`kioskRefusedLegs` had no consumer in `benchmark/` — CLOSED, and the cause was one package out** | Opened by wave 6 and closed by T56 with **two** named non-test readers: `benchmark/accessControl.ts`'s `coverageRow` (the `kiosk-refused/run` column of H-ACCESS-1, pinned in `PINNED_COVERAGE`) and `cli/src/commands/run.ts`'s `printRunReport` (a `refused at the kiosk` row inside the Passengers block, beside the `undelivered` figure it explains). **The row as written was right about the symptom and wrong about the location**: nothing in `benchmark/` *could* read the counter, because `ReplicationRecord` did not carry it — `StageActivity` reached `SimulationResult` and stopped at the replication runner, which is § D23's shape in a second place. `ReplicationRecord.kioskRefusedLegs` is that one field, landed **with** its readers. What it buys, measured: on `secure-tower` the conventional arm and the bare kiosk are both unserved and the column separates them, **0.0 against 29.0 refusals per run**, which an unserved fraction cannot do ([§ D137](../DECISIONS.md) item 2, [§ D149](../DECISIONS.md)) |
| ~~**`stopCount` has no `activeWhen`, and two shipped profiles sit one authored field away from a measured cost**~~ **CLOSED — and the remedy the row named is the one measurement refused** | The hazard is real and unchanged: `energy-aware` (`stopCount` 0.3) and `predictive-balanced` (`stopCount` 0.2) become destination-sensitive at `garden-down-peak` the moment anybody authors `dispatch.callType` on them, at `+1.320 [+0.988, +1.653] s` on AWT at weight 1, n = 200 — **WORSE**, by an interval excluding zero ([§ D136](../DECISIONS.md)). **The `activeWhen` this row asked for was written, measured, and thrown away.** `sim/searchSpaceLiveness.test.ts` § *finds no activeWhen gate that hides a live region* reported `weights.stopCount ... at dispatch.callType=up-down-buttons — outside that gate — it still moves a run (0 vs 5 on midtown-office)`, and `policies.test.ts` turned red on both shipped profiles the gate would have invalidated. Half of `stopCount`'s **raw value** is destination-conditional; its **dimension** is not, and a gate would have told a generic optimizer to skip a live one — the exact defect R17 and § D21 are about. Closed instead by `CostTermDefinition.partiallyActiveWhen`, declared on the term, folded into the `weights.stopCount` row's `description` by `parameters.ts` — so it reaches the collected space and the experience layer's help text without a `DispatchParameterSpec` field nothing outside a test would read. **The search space did not move: 56 dimensions, 106 declared rows, 19 conditional, before and after.** Guarded by `dispatch/terms/destinationDisclosure.test.ts`, which derives from `policy.score()` over 4 320 (car, call) pairs which terms read the destination and requires each to declare the form that is true of it — `rideTime` flat outside the gate (spread **0**), `stopCount` live outside it (spread **1**), the other ten reading no destination at all |
| **`nearest-car` is unusable on `vertical-city` at any budget in the band — a fifth building** | Its first invalid replication is at 26 (1 %) and at 6 (1.5 %), so no budget in 50–200 fits under it and both double-deck points would be `UNQUOTABLE` with it in the cell. Excluded **by its ceiling and not by its answer**, published rather than dropped, and carried in the study object as `CEILING_EXCLUDED_ARMS`. § 4 already records it as the only profile that saturates; **this is that finding on a fifth building, and it is still the viewer's default in places** — the editor's own picker was moved to `collective` in wave 6 ([§ D147](../DECISIONS.md), [§ D134](../DECISIONS.md)) |
| **`RunRecord` has no car-move series, and now has two consumers wanting it** | TWIN's **P7** separation property needs one to be more than a tautology, and § 5's `mixed-use-high-rise/residential-local` oracle gap has needed one since it was recorded. **That is the argument for doing it once** rather than twice or never ([§ D148](../DECISIONS.md)) |
| **`published.test.ts` holds nothing for a categorical study outside H-ACCESS-1** | The **instance** is fixed and the **class** is not, for the two structural reasons § D149 gives: a `PinnedEstimate` would carry three `NaN`s to hold a count, and Layer B's scan is interval-shaped. `DECISIONS.md`'s own copies of these counts are still transcribed ([§ D149](../DECISIONS.md)) |
| **TWIN — designed, not built, with nine questions gating implementation** | [`docs/11`](11-twin-shaft-contract.md): two independently driven cars in one shaft, **not** double-deck — double-deck adds *geometry* and TWIN adds *a constraint*, and a TWIN refusal is dynamic where a deck refusal is static. The gate is the **equal-car** pairing (2*N* shafts × 1 car vs *N* × 2), whose expected direction is stated in advance as **worse or indistinguishable**, because a constraint removes options; *"TWIN is significantly better on equal cars"* is a bug report. **No shipped building declares two cars in one shaft**, so nothing can be measured until one does. It gets no roadmap status row, deliberately ([§ D148](../DECISIONS.md)) |
| **Three smaller things W4 left behind** | The **structural-refusal reason is prose** — computed, correct, and keyed on a call id `VizLeg` does not carry, so it cannot be joined to a leg; the **authored W4 candidate is validated and not routed into Run**, so the parameters tab validates and does not yet simulate (W5/W6); and **`viz` now depends on `experiments`**, so `tsc -b packages/viz` builds `experiments` first and a red `experiments` makes `viz` unbuildable — correct, and worth knowing ([§ D134](../DECISIONS.md)) |

### Standing, and not closed by wave 6

| Item | Notes |
|---|---|
| **Phase 9 — the experience layer: designed, and now W4-only** | [`docs/10`](10-experience-layer-contract.md) is a complete design — novice/expert modes, a schema-generated dispatcher and traffic editor, access-zone credentials, and the rules that keep a gamified surface honest. **W4 is built** — four control renderers keyed on the declared `type`, one `activeWhen` rule enforced at the control, proved generic against a **fictional** schema the product does not ship, because a generated control that looks live only because the shipped schema happens to fit it is the risk `WAVE6_PLAN.md` § 7 named. Everything else is unwritten, and **§ 13's eight open questions are answered** with the evidence each one named ([§ D133](../DECISIONS.md), [§ D134](../DECISIONS.md)). No status table carries a Phase 9 row, deliberately: adding one for unstarted work is how a design starts reading as work in progress |
| **`W4`'s U7 half is blocked on a `core` fix** | `docs/10` § 11 says the `TRAFFIC_PARAMETERS` half is *"unblocked either way, because that schema is on the `core/browser` barrel."* **True about reachability, false about collectability**: of the ten schemas `discoverParameterSchemas()` finds, **two do not collect** — `TRAFFIC_PARAMETERS` (`traffic.arrivalRatePctPop5min` declares a `null` default, and a search needs a point to start from) and `SIM_PARAMETERS` (`sim.drainGraceS` declares a **log** scale over a range starting at 0). The form **draws the refusal** rather than hiding the schema, and a test derives both sets from discovery so a `core` fix turns it red instead of leaving a stale sentence ([§ D134](../DECISIONS.md)). The **TypeScript export-condition gap is CLOSED** — `boundaries.test.ts` now requires `viz` to reach `experiments` only through `/browser`, tests **not** exempt, watched failing on a manufactured bare import that `tsc` exits 0 on |
| **The Level-1 panel does not clear the Phase 6 gate on `mixed-use-high-rise`** | INDISTINGUISHABLE against `eta` and `collective` at every measured rate, and WT95 `+9.083` WORSE at 4 %. A measured result rather than a task, but it is what anyone planning further destination work needs. § 7 |
| **The mixed-use study's replication margin is tight** | n = 200 at up-peak 4 % is **ceiling-bound**, not variance-derived: the requirement for the hardest pair is 666, the measured ceiling is 206, and 200 leaves **six replications of margin**. A change that costs the arms six replications of headroom invalidates the point rather than widening it. The pair needing 666 is reported unresolved rather than quoted |
| `stats/` consolidation | Statistics live in `reports/statistics.ts` and `runner/stopping.ts`; `docs/01` layout records this as outstanding. Not started, and it has its own row rather than being folded into a lane |
| Profiles bit-identical to one another | `eta ≡ fairness-first` survives on both up-peak buildings and is *correct* there (`starvation` is zero for every candidate when no car holds a committed hall call). It still means "9 of 9 beat baseline" counts fewer distinct dispatchers than it sounds. **Re-measured through `runMatrix()` on 2026-07-28**, after the `destination-eta` weight: `eta ≡ fairness-first` at **five** cells, `auction ≡ auction-multi-round` at both Garden cells, and **`destination-eta ≡ capacity-aware` at `garden-residential`**, which no earlier report names. This is why the matrix baselines on `collective`, which is in no identity class at any cell — a baseline that is secretly one of its own arms makes that arm's whole row a row of exact zeros. **And an identity class belongs to a `(cell, seed, n)`** — see the correction below |
| `prepositionPlan` | Zero callers — superseded by `resolvePrepositionContext`. **Classified**, not deleted: one of the 14 entries in `dispatch/deadCode.test.ts`'s `PUBLIC_API_ONLY`, asserted in both directions |
| Mixed-use achieved **interval** | Reports `unmeasurable` by design: a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so **no** departure-gap threshold is valid there. Constrains the oracle; **does not** constrain a TTD comparison, which § D100 checked rather than assumed |
| `C5` — a `'z'` label can still print | `reports/compare.ts:607` can print `'z'` as a fallback family label on a convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic, and it is the exact mislabelling finding #14 was about. Distinct from `C33`, which is closed |
| `estimateMean` returns `halfWidth = 0` on a zero-variance sample | **Resolved against the docstring rather than the code, and pinned**: zero is the *true* half-width of an interval around a constant sample, and Phase 3's first acceptance criterion depends on it — making the estimator decline to bound such a sample turns **five** assertions red, including the one that pins *"a candidate compared against itself is INDISTINGUISHABLE, not unmeasurable."* What stays uncomfortable is recorded rather than fixed: a rule that stops the moment every replication agrees declares convergence on exactly the evidence that usually means the replications were never independent. Unreachable in anything shipped, because **no study injects a stopping rule at all** ([§ D127](../DECISIONS.md)) |
| Multi-replication statistics over generated buildings | One replication per case, as everywhere in `fuzz/`. Nothing there says a *mean* under a degraded fleet is right, only that the mechanics under it are sound |
| A **zone** cannot be changed mid-run | The dispatcher half of this row is **closed**: `selectWeightSet` changes the weight vector mid-run, off an explicit `SelectorState` threaded through deterministic simulation state, consuming **no** random stream — so a stored run still replays byte-identically and every paired comparison keeps its pairing, re-run rather than reasoned about ([§ D141](../DECISIONS.md)). A car's availability could already change (`BuildingConfig.serviceEvents`). **Zoning still has no mechanism** |
| **A phase's status is bound to *evidence that exists* — and still not to evidence that *supports* it** | § D115 called this the largest un-mechanised risk in the repository. It is **narrowed, not closed** ([§ D123](../DECISIONS.md)). `validation/phaseStatus.test.ts` parses the phase set, every status and every cited artefact out of `docs/05-roadmap.md` — never a hand-written list — and fails if an accepted phase cites a test, directory, study function or pin group that does not exist, if a discipline table carries an undischarged row, if Phase 8's campaign table reports a violation, or if its own parse degrades to asserting nothing. **What it provably does not catch:** that any measurement is *correct*; that a cited suite actually asserts the criterion it is cited for; that the criterion is the right criterion — nothing mechanical distinguishes a raised criterion from a weakened one; and it is **asymmetric by design**, never questioning a `partial` or `deferred` phase, because over-claiming is the failure this repository has shipped. The remaining defence is `CLAUDE.md` § Working agreements and a reader who checks |

### Closed, and kept because the lesson is the point

| Item | Notes |
|---|---|
| **`C35` — opened and closed inside one wave** | Under `destination-entry` beside a **conventional** profile a landing call carries a destination and no credential; if the passenger at the **head** of the queue was bound for a restricted floor, `infeasibilityOf` refused the call for **every car**, and **everybody behind them was stranded** — including passengers whose journey touches no restricted floor at all, **eight of the nine** on the shrunk counterexample, with a one-car fleet idle for 790.9 s. Found by widening the fuzz corpus and proven **pre-existing** at `63186a8`; 32 of 2 000 deep cases failed, and the class isolates perfectly — `destination-entry` 32 of 32, P5 only, nine profiles, four topologies. **A landing call speaks for a queue; a refusal that belongs to one person was being applied to all of them.** Fixed in `core` by asking one new **per-passenger** question at the landing **and** at the doorway — refusing at dispatch only was rejected with a measurement, because `#loadWhileIdle` boards from a car already standing there, so the refusal would have become **a matter of luck**. 60 of 60 shipped cells byte-identical; deep tier back to **0 failures at 2 000 cases** ([§ D130](../DECISIONS.md), [§ D137](../DECISIONS.md)) |
| **`destination-entry` is now drawn by both fuzz corpora** | The middle rung of the information ladder is in `GENERATED_CALL_TYPES`, and the credential question moved from being a property of the call type to a property of the **`(profile, call type)` pair** — because `destination-entry` beside `eta` is a call with a destination and no credential, and beside `destination-panel` it is a call with **both**. `properties.ts` and the generator now call **one** function: *a property that disagrees with `costRequestFor` about who is servable is not a weaker property, it is a wrong one.* Blast radius **900 of 2 064 cases changed `callType` and nothing else moved in any of them**, because the draw keeps to **one float** in the same stream position ([§ D128](../DECISIONS.md)) |
| **`C33` — CLOSED at the construction sites, not at the type** | `estimateMean` and `pairedDifferenceEstimate` return a narrow `PublishedMeanEstimate`; `ConvergenceReport.method` is **optional** and `convergenceOf` **omits the key** rather than setting it, so a suppressed metric no longer names a family for an interval that does not exist. Widening a required field to optional reads like a loosening and is the opposite: `'z'` is still a compile error where an interval exists. **The test that catches half of it is a type annotation, not an `expect`** — `tsc -b` is the runner. The stored shape stays wide, because a pre-2026-07 run set carries `'z'` and must still parse ([§ D126](../DECISIONS.md)) |
| **The editor's ⇧/⇩ buttons — the scope call is taken, and `moveFloor` keeps its caller** | A **Declaration order** fieldset lists `building.floors` in the order the array is written, with **no sort anywhere in the render path**, and ⇧/⇩ live only there. Deleting the buttons was the alternative and was refused: the honest form of *"delete the buttons"* is *"delete the function"*, and **owning a seam is better than removing one**. `index` and `heightM` are still not renumbered, and a test compares the `{id → [index, heightM]}` map across a move. **The count did not move — 1 non-test caller before, 1 after** — what moved is *which* call site ([§ D135](../DECISIONS.md)) |
| Double-deck operation | Configured, validated, **simulated** ([§ D131](../DECISIONS.md)) and **benchmarked** ([§ D147](../DECISIONS.md)). `WARNING_CODES.doubleDeckNotSimulated` is **deleted** because it became false; the narrower `missingFloorPairs` carries the same sentence for the one case still true — a double-deck bank declaring no `servesFloorPairs` — which **no shipped building raises**, which is the right state for a disclaimer: available, read, and not needed. `planRun` remains its named non-test reader; only which code it reads changed. The `analytical/upPeak.ts` warning was **kept and strengthened**, because retiring it would have been the over-claim ([§ D132](../DECISIONS.md)) |
| Fuzzy pattern switching | **Shipped.** `patternSwitching` is read by `dispatch/selector.ts` at decision time, with hysteresis and **no random draw**; the fourth declared detector input, `timeOfDay`, was **deleted rather than faked**, because `core` has no wall clock and every shipped operating point is a window from zero — *a declared detector input nothing can supply is the same configured-validated-dead shape this block already was*. Liveness measured on **trajectories**: a permutation of the shipped map is not identical to it, 137 vs 135 moves with the first divergence at move 42, and selector-off is identical to no-options-at-all ([§ D141](../DECISIONS.md), [§ D143](../DECISIONS.md)) |
| **`runner/` and `fuzz/` are now audited** *(`C4` and `C24` closed)* | The stopping rule turned out not to be one thing: the **port is exempt** — a rule stops *cells*, so a paired comparison's two arms would stop at different `n` — and the exemption is **pinned**, so a study that injects one turns the suite red. `fixedBudgetStoppingRule` is dead and claimed in its docstring to be the shipped default; `runner.acceptableRange` is inert, so `ConvergenceStatus` is `'not-assessed'` everywhere and CONVERGED / HIT CAP / IN PROGRESS have never been printed. **86 runner exports, 7 uncalled; 63 fuzz exports, 8 uncalled** — all allowlisted with reasons, both directions. What no guard catches is the other half: `runner.acceptableRange` is *read*, in a branch nothing takes, so it has callers and is invisible to all four ([§ D125](../DECISIONS.md), [§ D129](../DECISIONS.md)) |
| **`C32` — CLOSED by wave 5, and the row outlived it** | The fuzz generator drew the call type **against** the profile: **122 of 2 000 deep cases (6.1 %)** were running something other than what they said. Closed at the generator with `assertCarriesCallType` on every case ([§ D122](../DECISIONS.md)). It is listed here because it sat in this table as *open* while the same section's closing paragraph listed it as closed by wave 5 — **a register disagreeing with itself in one screen** |
| **`ED-12` / `ED-13` — CLOSED, and the schema did not move (`C30`)** | [§ D116](../DECISIONS.md). `ED-12`'s row was the thing that was wrong: a carless bank is an **error**, and relaxing `bankConfigSchema` so the ledger could show a green row would have been the weaken-a-criterion-to-pass failure `CLAUDE.md` forbids. `resolveBuilding` was **raised** to agree with the schema it had been silently contradicting, emitting an `empty-bank` code the vocabulary declared and **nothing anywhere had ever produced**. It matters because on a seven-floor tower whose top floor was served only by a carless bank, **ten of twelve seeds published `awtIsValid: true`**, two with passengers never served at all |
| **The four ⚠️ UX rows are CLOSED, and two of them were *false*** | Driven, not read ([§ D120](../DECISIONS.md)). `RV-21`: `main()` ran its data load **above** the `let started = false` that `start()` closes over, so any failed first load left that binding in its temporal dead zone for the life of the page — Retry then threw inside a floating `async` IIFE with no `catch`, the page cleared its own error message and sat at `loading data…` for ever, empty, with nothing in the console. **Retry was permanently dead after any failed load.** `RV-17`: Vite answers `Accept: */*` with `index.html` and a **200**, so `!response.ok` — the only branch that named the missing path — is exactly the branch a missing `data/` file does not take. A fifth row (§ B.3) was false on **both** clauses. The ⚠️ bucket is **0** and all seven ⛔ keyboard rows are green. **Two limitations are recorded in the rows rather than absorbed:** `KB-14`'s CSS clause is unexercised under a real OS preference (the media query cannot be emulated by the available tooling, so it was driven by replacing `window.matchMedia`), and `RV-11`'s *no passengers were generated* sentence exists only in the status line — the canvas, the exported PNG and `describeFrame` leave the reader to infer it |

**Closed since this table was last written**, each verified rather than taken on report:
`fuzz-1000384` (§ 7), `C2`, `C7`, `C10`, `C11`, `C15`, `C16`, `C19`, `C20`, `C21`, `C22`, `C23`,
`C25`, `C26`, `C28`, `C29`, `C31`, and the phase-status vocabulary limitation (a fourth term,
`partial`, now exists and this document uses it). Also: **`destination-eta`'s inert destination**
([§ D112](../DECISIONS.md)), **the ninth dead seam** ([§ D114](../DECISIONS.md)), and **the viewer
and CLI printing a suppressed mean** ([§ D111](../DECISIONS.md)).

**Closed by wave 5**, each verified rather than taken on report: **C4** · **C5** · **C24** ·
**C27** · **C30** · **C32** · the four ⚠️ UX rows · `packages/experiments`' browser export
(the *prerequisite*; W4 itself was only partly unblocked) · and *no test asserts any phase's status*,
**narrowed rather than closed**. [§ D116](../DECISIONS.md)–[§ D124](../DECISIONS.md).

**Closed by wave 6**, each verified rather than taken on report: **C33** ([§ D126](../DECISIONS.md))
· all three **C4** findings ([§ D127](../DECISIONS.md)) · **C34** and W4's TypeScript-condition gap
([§ D134](../DECISIONS.md)) · `destination-entry`'s corpus gap ([§ D128](../DECISIONS.md)) ·
`deepCampaignRequested` and `withCallType` ([§ D129](../DECISIONS.md)) · **C35**, opened and closed
inside the wave ([§ D130](../DECISIONS.md), [§ D137](../DECISIONS.md)) · the **eleventh** dead seam
and double-deck simulation ([§ D131](../DECISIONS.md)) with its disclaimers
([§ D132](../DECISIONS.md)) · `docs/10` § 13's eight questions ([§ D133](../DECISIONS.md)) ·
`moveFloor`'s scope call ([§ D135](../DECISIONS.md)) · `garden-down-peak`'s open question
([§ D136](../DECISIONS.md)) · the citation-guard gap ([§ D138](../DECISIONS.md)) · Phase 7's
fuzzy-detector bullet ([§ D143](../DECISIONS.md)) · the bare-kiosk re-pin
([§ D149](../DECISIONS.md)). **Phase 6c is neither closed nor open: it is measured and refused**
([§ D145](../DECISIONS.md)).

### Where this register was wrong about itself

**Six rows here were checked against the code in wave 6 and six were wrong — every one in the
optimistic direction.** This is the most transferable content in the wave, and it is stated rather
than quietly fixed, because *"the register says X"* and *"the code says Y"* being different
sentences is the whole reason a register is kept.

1. **One of the three `C4` findings was already closed.** `sequentialStopping.test.ts` reads
   `t[n−1]` back out of the shipped `estimateMean`; the hard-coded `z90` was gone. This section's own
   closing blockquote said a concurrent session had done it, and **the row was never updated to
   match** — a document contradicting itself two screens apart ([§ D127](../DECISIONS.md)).
2. **`C4`'s stale-docstring finding was ten places, not one — and six of the ten were false about
   the code**, not merely stale about a sibling document. The instructive one:
   `tuning/report/holdout.ts` claimed *"the `n <= 25` t/z split `reports/statistics.ts` **applies**"*,
   which it does not and has not since § D14. The register said one place; `WAVE6_PLAN.md` § 1
   corrected it to four; it was **ten**, and it is now guarded by `quantileFamily.test.ts`
   ([§ D127](../DECISIONS.md)).
3. **That finding's *"only reachable below the 50-replication floor"* was wrong about the
   phenomenon.** It is right about `n = 2` and wrong about the mechanism: the runner's **first**
   chunk is `policy.minReplications`, so under an injected rule a zero-variance cell stops **at** the
   floor — 50 by default — rather than continuing to `maxReplications`. Lowering the floor, which
   only `validation/sequentialStopping.test.ts` does, is what moves the stop from 50 to 2.
4. **`withCallType`'s row was wrong on both halves, and it was never a weak seam.** Detail in § 3.
   The method note is the part to carry: `nonTestImportersOf` answers *"who imports it"* and the
   standing rule asks *"name the non-test caller"* — **when the answer is a chain those are different
   questions, and two of this chain's three links are intra-file and invisible to any importer
   query** ([§ D129](../DECISIONS.md)).
5. **The dead-seam count was ten in code plus one in `data/`, not nine plus one** — in `CLAUDE.md`,
   in § 3 here, and in `WAVE6_PLAN.md` § 2 — and wave 6 made it **eleven** in code by finding the
   deck API. A count carried in prose beside a table is a count that drifts from it
   ([§ D131](../DECISIONS.md)).
6. **`garden-down-peak`'s row asked a question whose answer is yes.** It said *"whether **any**
   destination weight can carry information at such a point is an open question"*. Enumerated over
   every term `core` declares, at five weights, n = 200, CRN, two seeds:
   - it is blind to **`rideTime`** — the term **both** shipped destination profiles weight — which
     separates two candidate cars in **1 of 1 727 contested decisions**. A term with the same value
     for every car is a constant added to every candidate's cost, and **a constant cannot change an
     `argmin`**, so no weight rescues it: sixteen times the shipped weight buys the same single flip
     and no second one;
   - it is **not** blind to the destination. `stopCount` separates the cars in **139** of the same
     1 727, and pricing the destination with it is **WORSE on AWT, WT95 and TTD** at n = 200 at both
     seeds — arithmetic on the shipped normalization says why: one extra stop is 0.5 normalized
     units, so a candidate needs a **6.7 s** ETA advantage at w = 0.2, **20 s** at w = 0.5, and there
     is **no finite `t`** at w ≥ 1;
   - **an identity class belongs to a `(cell, seed, n)`**, exactly as a saturation ceiling does.
     `destination-eta ≡ eta` at `garden-down-peak` is **true at n = 51 at both seeds and false at
     n = 200** at one of them. **Four documents quote that class, and each needs its budget and its
     seed attached** ([§ D136](../DECISIONS.md)).

And a seventh, about the guards rather than the register: **`published.test.ts` missed a stale
published figure at both of its layers by construction**, and the story is in § 3.

**And an eighth, found in wave 7 and the same shape as `C32`'s: `C27`'s row outlived its own
closure by two waves.** The row in § *Standing* read *"Reachable at their module paths … but not on
`benchmark/index.ts` or `src/index.ts`. Name list in § D62; both files must change in one commit."*
Every clause of that was false when it was written. [§ D118](../DECISIONS.md) put § D62's list on
both barrels in wave 5 and **this document's own § *Closed by wave 5* paragraph says so, four
screens below the row** — the second time a register has disagreed with itself inside one section.
Checked rather than taken on report: all **34** names — § D62's fenced 33 plus
`runMixedUseHighRiseStudy` — are bound on `benchmark/index.ts` *and* on `src/index.ts`, and
`Object.is`-identical between the two. `benchmark/index.ts`'s own docstring and
`src/index.test.ts`'s comment both narrate the C27 work in the past tense.

**Nothing checked the list, which is why the row could rot without anything going red.** The two
structural barrel guards compare `src/index.ts` against `benchmark/index.ts`, so an edit that
dropped all 34 names from **both** — the exact edit § D62's *"in the same commit"* was written
against — leaves them green. `src/index.test.ts` § *DECISIONS.md § D62's handback list is on both
barrels* now parses the list out of § D62's fence and asserts presence on each barrel and identity
across them; watched failing on two names removed from `benchmark/index.ts` alone. One correction
falls out of the parse: § D118 calls it *"§ D62's 34 names plus `runMixedUseHighRiseStudy`"*, and
the fence holds **33** — the 34th *is* `runMixedUseHighRiseStudy`.

The short-form list below reads `C27` as *"`runDestinationDispatchStudy` off both barrels"*, and
**that sentence is true and is not what `C27` was**. `runDestinationDispatchStudy` is deliberately on
neither barrel — § D62 does not list it and § D118 refused to invent a list — and it is *live*
regardless, which `src/index.test.ts` pins in both directions as its standing demonstration that
reachability and liveness come apart. It is a note, not debt.

**Still open, in one place, because a reader planning work needs the list and not the prose:**

*Deferred by a recorded argument, not by neglect* — Phase 9 beyond W4 · **TWIN**, designed and not
built · the double-deck closed-form RTT · a **phase-varying directional split** in `DemandPhase`,
which [§ D151](../DECISIONS.md) § 7 constrains in advance and [§ D156](../DECISIONS.md) shows is the
condition the whole selection question turns on.

*Live debt* — the **`G → 2` lobby leg** charged as an elevator leg · the seed-marginal 1.5 %
double-deck point · the **liveness sweep's** section list hand-written, and its seven
`selection.*` rows unprobed because the sweep passes no `dispatcherProfiles` · **the shipped
demand template unable to vary the directional split within a run** · **W4's U7 half blocked on
a `core` fix** · the **viewer** still unable to enable a selector ·
`nearest-car` unusable on a **fifth** building and still a default in places · `RunRecord`'s missing
**car-move series**, now with two consumers · `published.test.ts` holding nothing for the
categorical **class** · the structural-refusal reason being prose keyed on a call id `VizLeg` does
not carry · the W4 candidate not routed into Run · `viz` now depending on `experiments` · **C5**
(`compare.ts:607` can still print `'z'`) ·
the mixed-use study's six-replication margin · `stats/` consolidation · zoning still unchangeable
mid-run.

*And the one that no longer has a name of its own, because it is now everyone's:* a phase's status is
bound to evidence that **exists**, not to evidence that **supports** it. The guard cannot tell a
raised criterion from a weakened one, and it never questions a `partial` or `deferred` phase. **That
is the largest remaining un-mechanised risk**, and it is smaller than it was, not gone. Wave 6 is the
first wave that could have exercised it in the dangerous direction — it wrote a gate and then
measured against it — and the answer was `NOT ACCEPTED`, with the criterion dated before the code and
**raised** once mid-wave.

> **Wave 6 closed fourteen items and opened fifteen.** That is the register working, not failing.
> `WAVE6_PLAN.md` § 6 made *"the debt register rewritten to what is actually left, including anything
> this wave opened"* a condition of done, for the reason wave 5 recorded: **five of wave 5's seven
> new items were found only by fixing something adjacent to them**, and wave 6's largest new item —
> the lobby leg — was found only by benchmarking a capability that had just been made to work.


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
