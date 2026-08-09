# CLAUDE.md

Instructions for agents working in this repository.

## What this project is

An elevator traffic simulator for designing and benchmarking smart dispatch algorithms.
Read [`docs/00-project-brief.md`](docs/00-project-brief.md) first, then
[`docs/01-architecture.md`](docs/01-architecture.md).

**Current status: Phases 0–5 and 7–9 are landed and accepted, plus a six-command CLI. Phase 6 is
partially complete.** Read the three that need care precisely — and **Phase 9's tick is the one that
must never travel alone**, because it is *accepted with named gaps* and the gaps are part of the
verdict:

- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against a
  **raised** criterion, now measured on the building that criterion names ([§ D100](DECISIONS.md)).
  The gate is **met by the Level-0 arm and not by the Level-1 panel at any measured point** — say
  both. 6c (learned control) is **no longer deferred — it is implemented, measured, and NOT
  ACCEPTED**: ΔTTD `−0.213 [−0.440, +0.014]` against `collective` at n = 200 on a disjoint seed, an
  interval containing zero, unchanged at 24 and 64 search candidates ([§ D139](DECISIONS.md) is the
  criterion, dated before the code; [§ D145](DECISIONS.md) is the verdict). **That refusal is now
  swept over eight pre-registered operating points and it held** — NOT ACCEPTED at all five PRIMARY
  cells under Holm–Bonferroni, with the resolution limit measured on **TTD at each cell** rather
  than inherited, and two cells that clear the correction refused anyway because the effect is a
  third to a half of what the apparatus can resolve there ([§ D151](DECISIONS.md) is the protocol,
  dated before any sweep ΔTTD; [§ D156](DECISIONS.md) is the result). The one cell that clears every
  gate is a **secondary** one, and what its policy learned is a *busy/idle schedule* rather than a
  traffic-pattern selection — because the demand template shipped at that time varied the **level**
  and never the **directional split**, which § D156 measures rather than asserts. **The missing
  condition was then built (`lunch-two-way`, [§ D169](DECISIONS.md)) and the re-measurement
  [§ D162](DECISIONS.md) pre-registered has now run — and refused a third time
  (`benchmark/lunchTwoWaySelection.ts`):** at `midtown-office`/`lunch-two-way` 1.5 %, with the detector's
  `two-way` pattern the incumbent on 66.1 % of observations, the learned arm's ΔTTD is
  `−0.170 [−0.405, +0.064]` at n = 200 on the disjoint seed — containing zero and below the cell's
  own TTD-measured 0.412 s limit — and the flat-mix negative control's own BETTER
  (`−0.576 [−0.833, −0.319]`) was investigated, not filed: a constant weight-vector hybrid beats
  the reference by more on *both* cells than the selector does on either, so the advantage is
  static and the switching subtracts from it. The mix-varying question is closed in the refusing
  direction; what would move 6c now is a different selector, not a different measurement.
  Double-deck operation is
  **simulated** — paired stops, per-deck design load, deck-bound legs ([§ D131](DECISIONS.md)) — and
  the disclaimer survives only in the narrower case of a double-deck bank declaring no
  `servesFloorPairs`, which no shipped building raises.
- **Phase 8** — **both blocking property violations are closed**, and neither was closed by moving a
  bound: `fuzz-1001074` by a fourth `awtIsValid` ground, `fuzz-1000384` by revoking a promise a
  withdrawn car cannot keep. The deep tier is green at 2 000 cases. **All eight tracks have landed**;
  the eighth — the full experiment matrix and Pareto front at a real budget, which carries Phase 7's
  acceptance interval at 50–200 replications — landed in `f895a16`, so the phase's criterion (*every
  track lands, and no property violation is outstanding*) is met ([§ D108](DECISIONS.md); § D102 is
  the superseded partial verdict, left standing).
- **Phase 9** — **ACCEPTED WITH NAMED GAPS (2026-07-30)** against [§ D163](DECISIONS.md), which also
  wrote the rule that *the status row and the verdict land together or neither does*. All nine units
  are built. The two clauses that decide the phase are the two the product **failed** when the
  criterion was written, and both are now met **by a run rather than by an argument**: the honesty
  property holds under *search* — and it **found two violations first**, one real and one a check
  accepting the wrong branch, so [§ D172](DECISIONS.md)'s *"the refinement relation, not a run"* had
  to be corrected ([§ D186](DECISIONS.md)); and mode parity is **derived from the code**, proved
  against a fail state the product deliberately does not ship.

  **The figures this row published have now gone stale twice, which is the thing to notice about
  them.** They read *"60 cases, 271 985 strings, 4 650 simulations, 23 surfaces, 0 violations"*, were
  re-measured by [§ D307](DECISIONS.md) to 246 875 always-on and 312 104 deep — and **both of those
  had moved again before anybody looked**. Measured on `integration/issue-wave-15` 2026-08-09,
  **before** this wave's work: always-on **49 cases, 259 956 strings, 30 surfaces, 0 violations**;
  deep **60 cases, 327 805 strings, 31 surfaces, 4 650 simulations, 10 violations in one case**. Two
  of those were already wrong in the published row — the deep tier's surface count is **31**, not 30,
  because `campaign/judge.ts#judgeStage` speaks in no other tier, and *0 violations* had stopped
  being true of the deep half the day the temporal axis landed. The current figures, re-measured on
  both tiers after issues #127 and #137 — the second of which fixed what the first found, so the
  strings moved a third time (a decision number is owed for each; the arguments are in
  `honesty/surfaces.ts`, `honesty/run.ts`, `shift/types.ts#ReportFigure.count` and
  `dev/reportPanel.ts#DeltaRowView`):

  | tier | cases | strings | simulations | surfaces | failing cases | verdict |
  |---|---|---|---|---|---|---|
  | always-on | 49 | **286 054** | **606** | 30 | **0** | **green**, and on its own merits |
  | deep (`ELEVATOR_SIM_HONESTY=deep`) | 60 | **361 057** | **4 710** | **31** | **1** | **green** — the one finding is registered |

  Measured 2026-08-09 on the integrated tree, both tiers, in one sitting — and that is the point of
  the sentence rather than a detail of it. **Three lanes in this wave each measured the corpus on a
  different base and reported three different pairs of numbers**, every one of them correct where it
  was taken and none of them correct here. A figure re-measured per branch is a figure that is stale
  the moment the branch merges, so the measurement now happens once, after integration, or not at
  all.

  **The verdict column says *green* rather than *0 violations*, and the difference is deliberate.**
  Both tiers pass, which means every violation the search finds is in `honesty.test.ts`'s
  `OUTSTANDING` register with a ghost check holding it. **One finding is open**, and it is the
  cue-rule coincidence rather than a product defect:

  - **`suppressed-mean`** — `honesty-9100031`, deep tier only, 10 violations in one case: the caveat
    says *"a quotable average on 6 of 20 consecutive seeds"* and that run's refused `meanWaitS` also
    rounds to 20. It was published as *outstanding* in this file and the roadmap **while being held
    by no register at all**, so the deep tier was genuinely red on `integration/issue-wave-15` before
    this wave entered it. Now registered in both directions.

  **`estimate-without-n` was the second, and it is closed in the product** (issue **#137**). The Day
  report's delta row published `AVERAGE WAIT was 17.8 s → 23.4 s` — a mean with **no count in its
  own box**, on 24 of 49 always-on cases and 28 of 60 deep — and § D310's editor strip drew the same
  row with no figure grid anywhere near it. The row now carries the count each mean was taken over,
  **one per side**: the two values are means of two different runs, so one `n` under both would be a
  claim neither sheet made. A refused mean carries none, because a refusal has no sample. Fixed in
  the view (`ReportFigure.count` → `DeltaRowView.beforeCount`/`afterCount`) so both renderers draw it
  from one decision, and **both `OUTSTANDING` entries were deleted on the commit that made the
  finding stop reproducing** — a registered finding that has been fixed must stop being registered,
  or the register becomes decoration. Violations went **48 → 0** always-on and **104 → 0** deep; the
  string counts moved **+100** and **+112**, which is the counts themselves entering the corpus. A
  decision number is owed; the argument is in the docstrings named in § D322's closing note.

  The column that moved into the table is **failing cases**, which the run prints and which nobody
  has to derive. A count of *violations* is still not published as a headline: two attempts to
  extract one from the run's output disagreed with each other, because a finding is reported once per
  property that sees it rather than once per string. Where a violation count appears below it is
  quoted as *reported violation lines on a named property*, which is a thing a reader can grep the
  run's output for — and the only violation count that needs no such care is **zero**.

  The surface column is corrected as well as re-measured — it published `30` for both tiers, and the
  deep tier reaches **31**, because `campaign/judge.ts#judgeStage` is silent in the always-on tier by
  construction (`STANDARD_SPACE` sets `stageProbability: 0`, a stage being 50 replications) and loud
  in the deep one. `honesty.test.ts` asserts that silence in one tier and that noise in the other, so
  *30* was never the deep tier's number.

  **Both string counts went up, and both for the same reason**: issue #127 put the Day report's
  **run-to-run delta block** into the corpus, which had never been in it — `honesty/surfaces.ts`
  rendered `reportViewOf(shaped)` with no `previous`, so the caption, both arms of the note, the
  comparability refusal § D311 added and every paired row were swept by nothing, on a block § D310
  draws on **two** surfaces. Six pairings per case, each a state a player can produce, add **+1 220**
  always-on and **+1 552** deep. The simulations move by exactly one per case (**+49** and **+60**)
  because a *drawn* comparison needs two runs, and the case's candidate arm is the honest second one.

  **Then they went up again by a hundred each, and that is the fix rather than a second sweep.**
  Issue #137 put a count beside each paired mean, so the corpus acquired those strings: **285 954 →
  286 054** always-on and **360 945 → 361 057** deep, with the simulations, the cases and the
  surfaces all unmoved. A string count that rose while nothing else did is what a fix adding words to
  one row is supposed to look like, and saying it beside the violation count is the point — the same
  change took `estimate-without-n` from **48 reported violations to 0** and from **104 to 0**, and
  took the always-on tier from **24 failing cases to none**.

  **The violation counts had gone up first, and that was the finding rather than the cost.** The
  block's first sweep produced one R13 violation, in 24 of 49 always-on and 28 of 60 deep cases:
  `AVERAGE WAIT was 17.8 s → 23.4 s`, a mean with **no count anywhere in its box**. It was real
  rather than a classification artefact — the block's rows carried no note, and on
  `dispatcherEditor.ts`'s result strip there is no figure grid nearby either — and it was **recorded
  rather than fixed** in that lane, on § D307's own precedent that a corpus which acquired a surface
  and had to be repaired first is a different claim from one that acquired it and reported. It is
  fixed now, one wave later, in the view both surfaces draw from.

  The deep tier's **remaining** failure — its only one — is `honesty-9100031` / `suppressed-mean`, a
  **cue-rule coincidence rather than a product defect**: the caveat says *"a quotable average on 6 of
  20 consecutive seeds"* and that run's refused `meanWaitS` (19.65) also rounds to 20. It has been
  published as outstanding since the temporal axis landed **and was in no register**, so the deep
  tier was simply red on this base; it is entered in `honesty.test.ts`'s `OUTSTANDING` now, where the
  ghost check holds it accountable in both directions. It is also the reason issue #137's count was
  seeded as its own string rather than spliced into the row: the row's label *is* R3's cue, and a
  denominator set beside the word `AVERAGE` on a run whose mean is refused is that same collision,
  manufactured on purpose.

  **The sweep now has a temporal axis, and it is the first thing in this verdict that did not come
  back green** ([§ D300](DECISIONS.md)'s E-4, [§ D307](DECISIONS.md)). A seventh property asks
  whether a surface publishes, at a playhead short of `endedAt`, a figure that can only be true of
  the whole run. It found two on its first run — `render/canvas.ts`'s stage banner reading **127
  undelivered at 00:00 and still 127 at 704 s while 376 people were standing**, and
  `render/describeFrame.ts` joining every mood driver ungated where § D293 gated the rail. **Both
  are now fixed**; both were deliberately *recorded rather than fixed* in the lane that found them,
  because a corpus that grew an axis and stayed green is a different claim from one that had to be
  repaired first. **Say the gaps in the same breath.** Clause 4 —
  *every unit names its non-test caller* — is **satisfied in prose and mechanised by nothing**: all
  **19** `packages/viz/src` directories sit outside every `AUDITED_MODULES`, the four dead-code
  audits cover 7 of 49, and the evidence is a hand-written table plus one prose line per unit. It is
  the clause to distrust first, and a fifth audit under `packages/viz` is the fix — **done in
  wave 12** (`packages/viz/src/deadCode.test.ts`, [§ D192](DECISIONS.md)): 19 directories derived
  from disk and asserted both ways, 1 017 exports classified, and it immediately found two
  docstrings naming callers that do not call; the verdict itself is unchanged. Also named in the
  verdict: `Escape` does not dismiss the drawer *(closed in wave 12, [§ D188](DECISIONS.md))*, the
  honesty sweep's `mode` axis has one value *(closed in wave 12, [§ D194](DECISIONS.md) — the
  second value produced zero new strings, **and that measured null has since stopped being true**:
  the Day report and the live-metrics panel became mode-aware for GitHub issues #110 and #100, and
  both adapters now render **both** registers on every case, which is where the always-on tier's
  string count moved to 278 756. A null is a measurement of a tree, not a property of the axis)*,
  three DOM panels are statically swept rather than driven, and **U6**, **U7's rider models** and
  **Basic's curated three-dimension subset** are unbuilt.

**Phase 9's row is the first status to move since Phase 8's on 2026-07-28, and wave 6 is the reason
that is worth saying rather than assuming.** That wave
built double-deck simulation, a mid-run weight-set selector, Phase 7's undelivered fuzzy detector,
Phase 6c, and Phase 9's W4 — and **not one phase verdict changed**, because 6c did not clear the
criterion written before it ([§ D139](DECISIONS.md)) and Phase 6 is
therefore still partial. The fuzzy arm *did* return an interval excluding zero, ΔTTD
`−0.212 [−0.416, −0.007]`, and is still reported **below the resolution limit** — both arms sit in
the structural regime whose smallest detectable effect is 1.9 s, and an interval excluding zero is
not a win when the effect is smaller than the apparatus can resolve.

What has moved is what the phases are *true of*: `destination-eta` weights `rideTime` at **0.5**
([§ D112](DECISIONS.md)); the viewer and `elevator-sim watch` no longer print a mean the same run
says is suppressed ([§ D111](DECISIONS.md)); the ninth dead seam and the two holes in `core`'s
dead-code scanner are closed ([§ D114](DECISIONS.md)); and the eleventh dead seam — the whole deck
API — is closed by simulating it ([§ D131](DECISIONS.md)). **Two more have been found and closed
since** — `serviceEvents`, a mid-run service scheduler no shipped building called, and
`patternSwitching`, the weight-set selector library that was loaded, carried into `SimulationConfig`,
resolved, and **writable by nothing in the viewer** ([§ D219](DECISIONS.md)) — which takes the count
to **eleven in code plus two in `data/`**. The existing ordinals do not move: *the ninth* and *the
eleventh* name specific instances, and renumbering them would break every reference for a running
total. None of that was allowed to round a verdict up.

**Energy is an axis, never a score.** The matrix that closed Phase 8 measured `nearest-car` — the
weakest shipped dispatcher, and the viewer's default until § D134 — **on the Pareto front at six of
eight cells**, because it is best on energy and worst on wait. A dispatcher that drives less carries fewer people.
So the energy proxy may be shown **beside** AWT and WT95 and never aggregated into a grade, and
`EnergyStatistics.workPerServedLegKJ` goes beside the raw figure: a configuration that spends less
by serving fewer people has not saved anything. See [§ D106](DECISIONS.md).

**The viewer is now built to a design handoff, and the handoff is canonical for the interface.**
*Elevator Sim Reimagined* is vendored at [`docs/design/`](docs/design/); the requirements extracted
from it, the audit of the old viewer against it, and every deviation with the constraint that forced
it are [`docs/12-design-handoff.md`](docs/12-design-handoff.md) ([§ D174](DECISIONS.md)–[§ D179](DECISIONS.md)).
Two halves, both load-bearing: **the handoff wins every disagreement about what the screen looks
like, and the simulator wins every disagreement about what a number means.** The handoff is a
prototype with its own toy simulator — its report sheet computes *average wait* as
`28 + (100 − pct) × 0.9` — so its layout, copy and interaction are the deliverable and its numbers
are not.

The rule that carried that work is the standing requirement below, pointed at a slider:
**move the control and require the run to change**, compared on the legs rather than on a window
statistic. It found three inert or wrong controls and one false claim about a mechanism before a
single editor was mounted ([§ D177](DECISIONS.md)). If you add a control, add that test.

[`docs/07-handoff.md`](docs/07-handoff.md) is the resume brief. Work proceeds by the phases
in [`docs/05-roadmap.md`](docs/05-roadmap.md), which carries each phase's acceptance verdict and the
measurements behind it. Read its **Standing requirement — the integration seam has an owner** before
planning work: a behaviour that is configurable, unit-tested in isolation and never called from a
shipped path passes every other check this repository runs, and has already shipped **ten** times in
code — plus, once, in `data/`. The instructive one is the sixth: the whole of `tuning/` was reachable
from nothing outside its own tests, the module said so in its own docstring, and the roadmap asserted
the phase green anyway. So the rule is not "is it reachable?" but **"name the non-test caller"**. A
barrel re-export and a `{@link}` tag look exactly like a caller and are not one.

**And the most recent one is the one to read if you are about to build a surface.**
`patternSwitching` was authored in `data/`, calibrated against eight measured operating points,
loaded correctly, carried into `SimulationConfig`, and resolved by `resolveWeightSets` — everything
about it worked except that **no code in the viewer could write it**. A five-select editor over that
would have passed every check this repository runs while binding nothing: the player moves a
control, the run does not change, and the screen looks right. The rule that caught it is the one
below — *move the control and require the run to change, compared on the legs* — applied before the
panel was written rather than after ([§ D219](DECISIONS.md)).

**And the newest one is the same defect with its polarity reversed, which is why it is not in the
count.** `accessZones` was loaded, schema-checked, cross-validated with four dedicated warning
codes, indexed correctly by `Bank` and consulted by `Simulation` in three places — and **could not
change a result**, because `traffic/generator.ts` issued every rider the credential their own route
needs, so every generated trip was authorised by construction and the gate never bit. Not a
behaviour with no caller: a caller with no behaviour to reach. It is closed by giving a declared
share of journeys that begin *inside* the building the badge their own floor implies rather than the
one their destination needs ([§ D265](DECISIONS.md)); the share is **an uncited assumption with its
reasoning attached in `data/traffic-profiles.json`**, not a citation, and the rider it turns away is
a **fourth outcome** — neither delivered, nor waiting, nor abandoned — published beside AWT on
exactly the footing `workPerServedLegKJ` sits beside raw energy ([§ D266](DECISIONS.md)). It was
found only because [§ D254](DECISIONS.md) removed the defect that had been hiding it, which is the
lesson: a feature can be observable **through a bug** and inert without one.

**The eleventh is the most recent and the most instructive, and it is the one to read first.** The
whole deck API on `model/bank.ts` — `isDoubleDeck`, `deckAt`, `deckAssignmentFor`, `pairedFloorOf`,
`servesFloorPair` — had **no non-test caller anywhere in the tree**. Every reference outside its own
file was `bank.test.ts` or a barrel re-export. It is instructive because nothing about it looked
neglected: `vertical-city` had authored eight double-deck cars and four floor pairs since the
building was written, the config layer cross-validated them with four dedicated warning codes, and
`Bank` indexed the geometry correctly. **The configuration was right, the validation was right, and
nothing consulted either.** Closed by simulating it ([§ D131](DECISIONS.md)) — which is why the
count above moved from nine to ten in code, while *"the ninth dead seam"* elsewhere in these
documents still correctly names § D114's instance and must not be renumbered.

**The ninth, and the one in `data/`, are the next two worth reading.**
The ninth is `measureEnergyLiveness` — and it was not a one-off: `published.ts` splits `benchmark/`
into studies that publish an interval and studies classified `'no-intervals'`, the first half has
`regeneratePins.ts` as its driver, and the second half had **no driver at all**, so **all five** of
its members were dead by the same measure. `benchmark/livenessSuite.ts` is now that driver and
`src/index.test.ts`'s guard iterates the entry-point set **derived from the directory** rather than
five hand-written names. The one in `data/` is `destination-eta`: two authored fields, a schema-valid
profile, its own tests, and `weights.rideTime: 0` — so the destination reached `estimateCost` and
changed no decision, **bit-identical to `eta` at 8 of 8 matrix cells**. Invariant 7 makes strategy
data; it does not make data exempt. See [§ D112](DECISIONS.md) and [§ D114](DECISIONS.md).

**A stated mechanism goes stale the same way, and the correction is now pinned.** Seven places
in this repository asserted, as fact, that destination dispatch does better under access control
*because* authorization and optimization happen in the same step. Measured at n = 150 per building
under common random numbers, the difference-of-differences is `+1.020 s [+0.625, +1.414]` — it buys
*less* where access is controlled. The run is `runAccessControlStudy({})` at seed 20 260 726, held in
`benchmark/published.ts` under `difference-of-differences/absolute` and re-pinned by
[§ D280](DECISIONS.md); the superseded `+0.982 [+0.584, +1.380]` was measured on the tree carrying
[§ D254](DECISIONS.md)'s pickup-access defect. All seven are
corrected, and `packages/experiments/src/validation/documentation.test.ts` now asserts it four
ways: the claim may not appear without a refutation within 400 characters of it, the correction may
not be silently deleted, `model/car/estimateCost.ts`'s exclusion — its sentence is *descriptive*
and true — is asserted in **both** directions, and no site may re-state the withdrawn destination for
the saving. If you write a sentence about *why* something
performs better, either measure it or say it is unmeasured.

**And the second half of that correction was itself a stated mechanism, which is why it is now
withdrawn rather than replaced.** Six of those sites went on to say *"and the saving is entirely in
the credential (H-ACCESS-1)"*. H-ACCESS-1 is **REFUTED** ([§ D256](DECISIONS.md),
[§ D279](DECISIONS.md)): under conventional dispatch `eta` and `destination-eta-unpriced` are
bit-identical on **150 of 150** `secure-tower` replications across all seven identity metrics, so the
credential buys nothing there and the saving is not in it either. What stays measured is the
**negative** — the same-step mechanism is not what produces the saving. **Where the saving does come
from is unmeasured, and no replacement mechanism may be offered in its place**, because a second
plausible sentence would be this defect again with new wording.

**A stated *refusal* goes stale the same way, and it is the more dangerous half.** The traffic
editor drew *mean group size* as a refusal — *"no field of `SimulationDemandOptions` carries it …
moving it would change this summary line and no passenger"* — for every wave after
`trafficProfilesWithPattern` made it live, which `shiftRunConfigOf` has called since wave 13. **It is
not a twelfth dead seam:** the seam was live and correctly wired end to end, and what was dead was
the sentence describing it. That is worse than a dead seam rather than better — a dead seam merely
does nothing, while a stale refusal tells the reader not to touch the control, and this one guarded
the parameter this file names outright (*passengers arrive in batches, not one at a time*). So the
standing requirement binds **both ways**: a control that writes nothing must say so, and a control
that writes something may not claim it writes nothing. A refusal is pinned by a run, never by
another sentence. See [§ D227](DECISIONS.md).

**A published number goes stale the same way.** Three figures in this repository did not reproduce
from the code that was supposed to produce them — one measured before a seam was wired and never
regenerated, two hand-transcribed through a double rounding — and no test noticed, because nothing
in the suite re-derived a published interval. If you publish a number, pin it to the run that
produced it.

## Non-negotiable invariants

These protect the statistical validity of every result the project produces. Treat
violations as bugs, and reject changes that introduce them.

1. **`Car.estimateCost()` is pure.** No mutation of any simulation state. The dispatcher
   calls it thousands of times per decision to evaluate hypotheticals.
2. **No global RNG.** Every random draw comes from a named stream on the injected
   `StreamSet`. A single shared RNG desynchronizes common random numbers and destroys
   comparison power — see [Architecture § Determinism](docs/01-architecture.md#determinism-strategy).
3. **No wall-clock time in `core/`.** All time comes from the kernel. No `Date.now()`,
   no `performance.now()`, no timers.
4. **Event queue ties break deterministically** by `(time, sequenceNumber)`. Never by
   insertion order into a hash structure.
5. **Every persisted run record carries its seed**, so any run replays exactly.
6. **`core/` never depends on `viz/`.** The core must build and test with `viz` absent.
7. **Anything tunable is data, not code.** Dispatch strategies are weight vectors in
   `data/dispatcher-profiles.json`, not classes. If you find yourself writing
   `if (strategy === 'nearest-car')`, stop — that belongs in config. Only a genuinely new
   *cost term* justifies new code. See
   [Parameterization & Tuning](docs/06-parameterization-and-tuning.md).
8. **Every tunable declares its schema** — type, range, default, and `activeWhen` for
   conditional parameters — so a generic optimizer can search the space without
   elevator-specific knowledge.

## Statistical discipline

The single most likely way this project fails is by reporting confident nonsense. The
literature documents the exact failure mode: *increasing lift speed appearing to increase
average waiting time*, because the real difference is smaller than the noise.

- **Never** declare one dispatcher better than another without a **paired-t confidence
  interval that excludes zero**.
- **Never** compare two separate confidence intervals and conclude from overlap. Overlapping
  intervals do not imply no significant difference.
- **Budget 50–200 replications** per configuration. Ten is not enough — it produced a 12%
  error against the converged mean in the reference study.
- Always feed **the same passenger traces** to every alternative under comparison (common
  random numbers). It is worth 5–20× in required run count.
- If a configuration saturates, **flag it and suppress the AWT interval**. Do not report a
  mean for a system whose queues grow without bound. **Saturation is one of five grounds**, not the
  whole rule: `awtIsValid` also fails on an empty window, on censoring above the unserved limit, and
  — since Phase 8 found a run publishing a mean beside a **922.7 s** wait — on a leg past the 900 s
  abandonment horizon. The trend test sees a queue still growing at the horizon and the censoring
  test sees one that has not cleared by it; **neither sees a queue that grew enormously and drained
  just in time.**
  **The fifth landed with wave 13's patience feature, and it sits above censoring rather than
  below it.** Once riders actually leave, an abandonment rate above 2 % suppresses the mean outright
  — because abandonment *improves* AWT by construction, removing the longest waits from the sample:
  at `midtown-office` 6 % with a 120 s mean patience, AWT goes **61.9 s → 23.3 s** with fifty-one
  riders gone. The ordering is by cause and was moved by measurement: drafted below `censored`, the
  first run that abandoned anyone reported *"too many arrivals were never served"* about a window
  whose queue had drained perfectly — true, and useless, since it sends a reader hunting a backlog
  that went home. **Abandonment and stairs uptake are published beside AWT, never folded into it**,
  on exactly the footing `workPerServedLegKJ` sits beside raw energy ([§ D106](DECISIONS.md)): a
  configuration that improves its wait by serving fewer people has not improved anything.
  See [`docs/03` § Saturation detection](docs/03-traffic-and-statistics.md).

Full detail in [`docs/03-traffic-and-statistics.md`](docs/03-traffic-and-statistics.md).

## Correctness oracle

Under pure up-peak, simulated interval and handling capacity must match the closed-form
Barney/CIBSE round-trip-time calculation within a few percent. Implement that calculation
as a test. If simulation and closed form diverge, assume the simulation is wrong until
proven otherwise.

## Modeling rules that are easy to get wrong

- **Cars fill to 80% of rated capacity, not 100%.** Using 1.0 makes everything
  systematically optimistic.
- **Model jerk and acceleration properly.** Short hops never reach rated speed. A simulator
  that ignores this will wrongly conclude faster elevators always help.
- **Passenger mass is a distribution, not a constant.** Otherwise the load sensor has
  nothing to measure.
- **Passengers arrive in batches**, not one at a time.
- **The three kinds of zoning are distinct concepts** — service (physical), access
  (credential), operational (dispatcher strategy). Never collapse them into one field.
- **Normalize cost terms before weighting.** Raw `waitTime` (0–120 s) and `stopCount`
  (0–20) on the same scale produce uninterpretable weights and an unsearchable space.

## Tuning discipline

- **Hold out traffic seeds.** Tune on one seed set, validate on a disjoint one, or you
  overfit the weight vector to specific passenger traces and the gain vanishes on new
  traffic.
- **Use common random numbers across candidates** within an optimization round.
- **Do not scalarize too early.** Report the Pareto front over (AWT, energy, WT95); the
  energy-versus-wait tradeoff is the operator's call, not a constant to bake in.
- **Tune per traffic pattern.** The optimum for up-peak is not the optimum for down-peak.

## Conventions

- TypeScript. Strict mode.
- Units are SI internally (metres, seconds, kilograms, m/s). Imperial values appear only
  in reference data and display formatting, always with the unit in the identifier
  (`ratedLoadLb`, `speedFpm`).
- Time is simulated seconds, a plain number, always sourced from the kernel.
- Prefer pure functions in `core/`. Side effects belong in the kernel and the runner.
- Tests colocate with source as `*.test.ts`.

## Reference data

- [`data/elevator-specs.json`](data/elevator-specs.json) — elevator classes, capacities, timings
- [`data/traffic-profiles.json`](data/traffic-profiles.json) — demand profiles by building type
- [`data/dispatcher-profiles.json`](data/dispatcher-profiles.json) — cost term library and dispatcher weight vectors
- [`data/buildings/`](data/buildings/) — test building configs; see its README for the schema

Reference values come from CIBSE Guide D, ISO 8100-32, and published lift-engineering
literature. Sources are cited at the bottom of each doc. If you change a reference value,
cite why.

## Working agreements

- Keep [`docs/05-roadmap.md`](docs/05-roadmap.md) phase status current as work lands.
- A phase is done when its stated acceptance criteria pass, not when the code exists.
- If you hit a decision the docs don't cover, record it in the relevant doc rather than
  only in a commit message.
- Do not weaken an acceptance criterion to make a phase pass. Raise it instead.
