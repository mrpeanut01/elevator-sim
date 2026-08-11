# 18 — Everyday Mode against the tree: the slice 4–7 audit

> **Status: this audit corrects the vendored build plan, and the code won.** The Everyday Mode
> handoff ([`docs/design/design_handoff_casual_mode/`](design/design_handoff_casual_mode/))
> states its own precedence rule — *"where this plan and the code disagree about how a seam
> works, the code wins and this plan is what needs correcting"* — and the vendored copies are
> records that must not be edited (`docs/12`'s rule). So the corrections live here, the way
> `docs/12` § 4 holds the first handoff's re-sourced bindings. Every builder lane for slices
> 4–10 is scoped from this document, not from BUILD_PLAN §20's description of the prototype.
>
> Verified 2026-08-11 on `claude/casual-gameplay-implementation-ycybr1` (after slices 0–2
> landed), by a read-only lane with file:line evidence for every claim. The framing correction
> that governs everything below: **the prototype the handoff describes is not in this tree.**
> Every prototype identifier §20 names — `ruleList`, `ghostId`, `sw{…}`, `fixPct`, `restDelta`,
> `hc5`, `fixGuess`, `benchArms`, `benchVerdict`, `testsCount`, `RUSH_BESTS` — appears only in
> the vendored documents. §20's recurring sentence *"each of these renders today and reaches
> nothing"* is false of this repository: they do not render at all here. Builder lanes are
> therefore *port-into-existing-seams* jobs, never *wire-up-inert-controls* jobs.

The full findings, kept verbatim from the verification lane because the evidence is the
deliverable:

---

## Slice 4 — §20.2 / §20.3 / §20.4

### §20.2 `ruleList` (when/then rules) — DOES NOT EXIST

No rule-list, condition compiler, or first-match-wins evaluator anywhere in `packages/viz` or
`packages/core`, and no seam shaped like one: the nearest analogues are the per-pattern arm map
(data-driven, not player-authored conditions) and hard constraints in `core/dispatch/types.ts`
(filters, not conditional weight adjustments).

### §20.3 flags / group levers — EXISTS, AND ALREADY REACHES THE SIM

The plan's claim that `pool`, `sensor`, `park` "must affect the sim" is **already satisfied**:

- `packages/viz/src/authoring/dispatcherSpec.ts:55-62` — `DispatcherFlags { pool, zone, bypass }`,
  each documented with the engine field it writes; `:80-101` — `GroupLevers { parking, express,
  dwell }`.
- `profileFromSpec` (`:249`) writes them: `pool` → `dispatch.callType: mobile-credential` (`:261`);
  `zone`/`express` → zoning (`:268`); `bypass` → `answer.bypassLoadThreshold` (`:274`);
  `express||zone` → `parkingStrategy: 'zone-center'`, `parking` → `'lobby'` (`:318-319`).
- Proven live, not asserted: `authoring/authoring.test.ts:248` (*turning the load sensor off
  changes the run*), `:255` (*the zoning flag changes the run*), `:271` (the dwell control's
  earlier dead-seam failure, recorded).

### §20.3 the traffic-pattern detector — EXISTS IN CORE AND IN AN AUTHORING UI; NOT SURFACED ON A STAGE

Roughly 80 % of §20.3 is already true of this tree:

| Claim | Evidence |
|---|---|
| detector classifies observed traffic | `core/dispatch/selector.ts:524` `selectWeightSet`; `:96` `SELECTOR_INPUTS`; `:492` `armMembership` (trapezoidal, fuzzy-AND, max-membership) |
| classifies the last *judge* seconds | `selection.observationWindowS`; `selector.ts:161` `ArrivalWindow`, consumed at `dispatch/policy.ts:838-846` |
| honours *hold* | `selector.ts:571` — dwell hysteresis, `held: 'hysteresis'` |
| honours *margin* | `selector.ts:591` — `held: 'margin'` (and `dev/selectorEditor.ts:63-69` records the schema/engine disagreement: the code applies it under `fuzzy` too — the code wins) |
| *"under one setting all shift it must not be built at all"* | `selector.ts:35-38` — `selection.policy: 'off'` never constructs an `ArrivalWindow`; byte-identical by construction |
| a player-facing surface | `authoring/selectorSpec.ts` (839 lines) + `dev/selectorEditor.ts` (676 lines), mounted at `dev/main.ts:2423` |
| it reaches a run | `dev/state.ts:1148` `shiftRunConfigOf` writes both halves (`profileWithSelector`, `dispatcherProfilesWithSelector:1209`) |
| arms are data | `data/dispatcher-profiles.json` file-level `patternSwitching`; `config/schema.ts:940` |

**The one genuinely missing piece:** the detected pattern is never surfaced to a player during a
run. `dispatch/policy.ts:554` exposes `get activePattern()` and `:559` `get weightSetSwitches()`,
but the only readers are in `packages/experiments`; `packages/viz` never reads them and the viz
recording contract carries no `selection` field. *"The stage header names the detected pattern"*
therefore needs a **new recording field** (schema bump in `viz/src/contract/types.ts`), not a
wiring fix.

### §20.4 the ghost picker — DOES NOT EXIST

No `ghostId`, no five-way picker, no second-sim overlay, no race strip. The nearest real
machinery: `batch/runBatch.ts:116` (N arms over one crowd under enforced CRN);
`campaign/stageRun.ts:40-49` (a two-arm, same-seed pairing — the ghost's semantics minus the
visual overlay); `stageRun.ts:110` + `dev/campaignPanel.ts:30-34` (replication 0 re-run at the
batch's seed purely to recover a recording — a working "second sim of the same crowd, frames
kept" precedent). Missing entirely: the world/best/plain/prev identities and any dual-recording
overlay in `frame/` or `render/`.

### Verified work-order — slice 4

Split it; it is three unrelated jobs and only one is wiring. **(a)** Flags/levers: already done —
the honest remainder is the Everyday-words mount, whose pattern slice 1's `mode/plainLevers.ts`
established. **(b)** Detector: the smallest honest change is a **readout**, not a detector — carry
the pattern in force into the run record (schema bump), populated from
`DispatchPolicy.activePattern` exactly as `experiments/benchmark/selectionSweep.ts:768` samples
it, and render it in the stage header. **(c)** Rules and the ghost are greenfield, each its own
PR: the rule compiler needs a design decision first (conditional weight adjustment vs. behaviour
flag is settled by nothing in `core`); the ghost's viable seam is `stageRun.ts:49`'s two-arm
same-seed request with the second recording kept rather than discarded — and `none` is free,
because it is simply not issuing the second request.

---

## Slice 5 — §20.6, the campaign

### §20.6 points at the wrong module

`packages/viz/src/campaign/` is **not** the day/calendar campaign — it is a ten-stage teaching
campaign judged by batch statistics (`campaign/types.ts:84`, `judge.ts:123` — verdicts from
`measureGoalRate` over 50 replications plus a paired-t interval; a stage whose bar does not
reproduce is not judged at all). **The day-shaped campaign the handoff means lives in
`packages/viz/src/shift/`**, ported from a previous `design.html`
(`shift/goals.ts:70` cites it).

### Per-day tests — PARTIALLY EXISTS: three goals, evaluated for real, from the run

`shift/goals.ts:100` `goalsForDay(day)` returns exactly three:

| Handoff test | Shift equivalent | Evidence |
|---|---|---|
| away % | `minute` (reads `minutePct`) | `goals.ts:117-124` |
| peak lobby queue | `queue` — **any** landing, not lobby-specific; carries `peakQueueFloorId` | `goals.ts:128-134`, `shift/types.ts:296/313` |
| trips at close | `carry` (reads `carryPct`) | `goals.ts:110-116` |
| worst wait | **not a goal** — a report figure only | `shift/report.ts:1140` `worstWaitFigure`, with a censoring flag |
| (alternating 4th) | `stairs` on odd days | `goals.ts:126-137` |

Evaluation is honestly gated: `goals.ts:172` `readGoal` returns `pending`/`—` below
`WAKE_UP_ARRIVALS`, so a quiet morning cannot produce a `met` by arithmetic. The glyph set
(`:160`) is `✓ / ○ / ·` — **there is no `×`**.

### What exists beyond the tests

- **Difficulty** as bar-hardening (`goals.ts:78` `GOAL_BARS`, `+3/+1/−2` per day) — and a
  standing design ban on a difficulty *setting* (`shift/calendar.ts:7`, `docs/10` § 5.5),
  independently enforced at `dev/shiftRunner.ts:166`, `dev/state.ts:339`, `scope/surface.ts:167`.
- **Calendar**: `shift/calendar.ts` (periods, scheduled events, patches, asks), `shift/events.ts`,
  `shift/growth.ts`, `shift/incidents.ts`, `shift/week.ts` (`HISTORY_DAYS = 7`, `outcomeOf:216`,
  `closeDay:261`, `nextDay:360`), `shift/tomorrow.ts:193`.
- **Economy**: deliberately **not a currency** — commissioning capital with three prohibitions
  (`commissioning/types.ts:11-43`, enforced by `budget.test.ts` on imports and on every
  player-facing string); contract rewards are unlocks (`shift/contracts.ts:77-185`).

### Genuinely missing for §20.6

1. worst wait as a **test** (fourth goal) rather than a report figure;
2. peak **lobby** queue, if "lobby" is meant literally (`peakQueueFloorId` is already carried);
3. the "was" figures from the building's previous day — `WeekState.history` holds the data,
   nothing reads `history[n-1]`;
4. a `missed` mark (`×`) in the glyph set and on the week strip;
5. `testsCount` needs no port — derivable from `readGoals`.

### Verified work-order — slice 5

Four small edits on existing seams, not a port: (i) add `worstWaitS` to `GOAL_OBSERVATION_IDS`
(`shift/types.ts:270`), projected in `shift/observations.ts` from the same
`summary.serviceLevel.longestWaitS` the report reads — respecting `longestWaitIsCensored`, which
must read `pending`, never a false `met`; (ii) `goalsForDay` returns four, which means a fourth
ceiling in `GOAL_BARS` and re-deciding the `day % 2` alternation its docstring justifies;
(iii) narrow `peakQueue` to the bank's lowest served floor if "lobby" is literal; (iv) read
`week.history[day-1]` for the "was" figures and add a `missed` glyph. Everything else §20.6 asks
for already exists and needed this doc correction, not code.

---

## Slice 6 — §20.7 / §20.9, Fix-a-building

### The mechanic — DOES NOT EXIST; wholly greenfield

`complaint`, `repair`, `fixit`, `fixPct`, `restDelta`, `hc5`, `fixGuess`: zero meaningful hits in
`packages/` or `data/`. There is no dead quiz to delete (§20.9 names a prototype panel this tree
never had) and no fake inputs to replace — §20.7's framing as a swap is wrong here. What exists
is the paired-run machinery a real implementation needs: `batch/runBatch.ts:116` (CRN enforced by
`firstTraceDisagreement:369`) and `campaign/stageRun.ts:49`.

### Analytic sizing — EXISTS IN CORE, EXPORTED TO THE BROWSER, CALLED BY NOBODY IN VIZ

`analytical/index.ts:52-59` exports the full closed-form surface (`analyzeUpPeak`,
`roundTripTime`, `interval`, `handlingCapacity5Min`, …); it is the project's correctness oracle
and is already re-exported by `core/src/browser.ts:1024-1040`. `authoring/buildingSpec.ts` never
calls it — the sole non-core caller in the repo is `experiments/src/oracle/upPeakCase.ts`.

### Verified work-order — slice 6

The cheap, valuable half is one import: call `analyzeUpPeak` from `authoring/buildingSpec.ts`
against the spec's resolved building, so the designer's interval and handling capacity are
computed by literally the same code the oracle uses — **with `UpPeakAnalysis.warnings`
surfaced**, because the shipped buildings trip them. The paired as-built/as-specified run has a
real constraint the plan does not mention: `BatchArmRequest` (`batch/types.ts:179`) allows arms
to differ **only in dispatcher** — `traceKeyOf` makes anything else a different population. A
case whose "as-specified" differs in *fabric* (shafts, speed) cannot be a batch arm; it is two
batches, and the interval between them is not paired. Settle that before authoring any case
data.

---

## Slice 7 — §20.8, the bench

### `packages/viz/src/batch/` — EXISTS, and is stronger than the slice asks for

Matched crowds are **enforced, not assumed** (`runBatch.ts:9-20`, `:369`); the paired-t interval
is imported from `experiments/browser`, never reimplemented (`report.ts:62-63`, `:651`); `reps`
already changes the result (`BatchRequest.replications`; `MIN/MAX_REPLICATION_BUDGET` 50/200 with
a `budgetNote` outside the band); the interval plot returns `null` rather than inventing a bar
(`intervalPlot.ts:105`).

Two things the plan does not know, both load-bearing: **`under-budget`** (`report.ts:740-743`) —
below 50 reps the interval is drawn and the winner is deliberately not named; the plan's 10-reps
check must not be read as licence to relax that. **`shown` / R11** (`types.ts:103-107`) — an
energy-class row reports its interval and refuses to name a winner however the interval fell.

### "Legacy pairwise panel" — DOES NOT EXIST; §20.8 is inverted

There is exactly **one** bench (`dev/batchPanel.ts`, mounted `dev/main.ts:2497`) and it *is* the
pairwise one. The thing that does not exist is **the suite** (field × tests × reps): no
multi-building sweep exists in `packages/viz` at all.

### The eight fixtures — EXIST in `packages/experiments`, and are not what they look like

`experiments/src/benchmark/matrix.ts:274` `MATRIX_CELLS` — eight operating points with justified
budgets and rationales, plus `EXCLUDED_CELLS:474` recording four dropped points *with the
measurement that excludes each*. **Two different eights**: the matrix's eight are building ×
traffic-pattern cells over four buildings; `data/buildings/` separately holds eight buildings. A
builder who assumes "the eight buildings" produces a list that disagrees with `MATRIX_CELLS`.
**No gauntlet exists** — "the same fixtures as the gauntlet's forty" names a shared list neither
end of which is in the tree.

### Verified work-order — slice 7

Do not delete anything; consume. The Everyday screen renders `batchReport`/`intervalPlotFor`
output rather than reimplementing, with the pairwise verdict shown only when
`comparisons.length === 1`. Do **not** rename `unresolved` to *"too close to call"* without
changing `report.ts:99-105` and the honesty/parity suites that read those strings — if the copy
must change, change the spec too (BUILD_PLAN § 2 rule 8). The suite is the only new
construction: a loop over cells calling `runBatch` once per cell, whose fixture list is
**imported** from `MATRIX_CELLS`, never retyped — and the first real decision is where that list
becomes browser-reachable (`experiments/browser` is already imported by `dev/campaignPanel.ts:37`,
so the seam is open) or whether the cells move to `data/`.

---

## Implementation status register

Slice status lives here rather than in the vendored BUILD_PLAN, because the vendored handoff is
a record and records do not move (docs/12's rule; the plan's own "keep the documents updated"
clause is satisfied by this file). One entry per landed slice beyond 0–2:

- **Slice 4 item (b), the detector readout — LANDED.** The pattern in force now travels into the
  run record and onto the stage header, end to end: `VizRecording.patternSwitches` (schema **9**,
  `contract/types.ts` — one `{atS, bankId, patternId}` entry per change, `null` recording the
  detector's abstention) is populated in `recordRun` by sampling the policy's own `activePattern`
  after every `dispatch`/`reconsider` — the same read `selectionSweep.ts:768` performs, and the
  only two methods `#refreshWeightSet` runs from, so the trace is exact rather than sampled on a
  grid. Per **bank**, because a group controller is per bank and a merged stream would record a
  two-bank disagreement as detector oscillation. A run whose `selection.policy` is `off` — every
  shipped profile — carries **no field**, and a live detector that never left abstention carries
  an **empty** one; the two absences are different claims and both are asserted
  (`record/recordRun.test.ts` § the selector trace, on § D153's own `midtown-office` cell). The
  header pill (`index.html#pattern-label`, `dev/main.ts#drawHeader`) derives through the pure
  `live/patternReadout.ts#patternReadoutAt`, updates as the playhead crosses a switch, and hides
  — rather than placeholds — when there is no detector. Words are the model's, never a bare
  engine id (rule 11): `authoring/selectorSpec.ts#PATTERN_NAMES`, the short companion to
  `PATTERN_LINES` under the same both-ways key-set guard, with the honest fallback (*a pattern
  this build cannot name (id)*) for a recording written against edited data. New producers are
  driven in the honesty corpus (`PATTERN_NAMES` under the selector-editor adapter,
  `patternReadoutAt` under LIVE_RAIL, including a synthesized two-bank disagreement). Old
  recordings are refused by `record/document.ts`'s existing version rule — re-record from the
  seed — which is the bump discipline every prior version row followed. **Not built here,
  deliberately:** items (a) and (c) of the slice 4 work-order — the Everyday-words mount for the
  flags/levers, the rule compiler and the ghost — each its own lane, as the order above says.
- **Slice 7, first pass — LANDED.** The suite is a consumer of the bench, exactly as the
  work-order above scopes it: `packages/viz/src/batch/suite.ts` is the pure model — the field of
  two arms is a *tuple* (`SuiteField`), one `BatchRequest` per ticked cell, and the view model is
  read off `batchReport` with best-in-cell taken from `BatchComparisonRow.favours` alone and the
  pairwise verdict drawn **only when `comparisons.length === 1`**; `dev/suitePanel.ts` mounts it
  beside `dev/batchPanel.ts` inside the Compare panel (worker per cell-batch through the shipped
  `dev/batchWorker.ts`, cells sequential, cancel terminates and reports nothing), and the ticks
  render from `MATRIX_CELLS` at mount time so neither this file nor `index.html` retypes a cell.
  **The first decision landed as a module split**: the cells are imported through
  `@elevator-sim/experiments/browser` — measured first, the data is pure but `matrix.ts`'s graph
  reaches `node:url`, so the cells moved to `benchmark/matrixCells.ts` (docstring carries the
  argument; a decision number is owed) and `matrix.ts` re-exports them byte-identically; the
  `data/` fallback was rejected there. **The mapping forced the request to grow**:
  `BatchRequest.demand` (a whole authored block, mutually exclusive with the panel's rate/level —
  `runBatch` refuses the combination by name) and `BatchRequest.reportWindow`, because the two
  Midtown 900 s cells differ *only* in directional split and three cells need `full-run`;
  `batchReport`'s demand clause now names an authored condition rather than claiming the
  building's own profile ran. Held by `batch/suite.test.ts` — the cell→request mapping exact over
  all eight cells, the two Midtown cells separated **on the trace key in a real run**, CRN audited
  per cell, the field-of-two refusals driven, and one cheap garden-apartments cell end to end at
  n = 2 proving the under-budget refusal survives the suite (no winner named however the interval
  fell) — and driven by `honesty/surfaces.ts`'s `SUITE_BENCH` adapter, appended so no fault moves
  surface. **Not built, named rather than implied:** per-cell derived budgets (one replications
  control for the whole suite; each cell's report says what leaving 50–200 costs), the bench's
  drawn interval bars (the suite reuses `intervalPlotFor`'s geometry for a text form), and any
  viewer inheritance — a suite's cells fix building and traffic, which is the point of a fixed
  fixture list. Honesty-corpus string counts are deliberately **not** re-measured here: a figure
  measured per branch is stale on merge (CLAUDE.md's rule), and the SUITE_BENCH adapter will move
  both tiers' counts when the integrated tree is measured.
- **Slice 6, first pass — LANDED.** Fix-a-building, scored on **two single runs sharing the
  traffic seed** rather than the prototype's closed-form model, with § 9's thresholds unchanged
  and § 10.4's basis line printed verbatim. The engine is pure (`fixit/types.ts`, `parse.ts`,
  `engine.ts`, `run.ts`): case state, § 9 editor pricing (shaft 34 u · speed 6 u/0.5 m/s ·
  capacity 8 u/2 places · dwell free), affordability with the short-by wording, the run pairing
  through `parseBuilding`/`resolveBuilding`/`recordRun` — the loader's own door — and the four
  outcomes with their copy verbatim. Three cases ship in `data/fixit-cases.json` (§ 10.5's #1, #2,
  #4, each adapted to the shipped building and validated per § 10.6 rule 6 by
  `fixit/cases.test.ts`, which pins every figure the copy quotes: 9→0 long waits on the sky-lobby
  case, a 341.1 s→56.5 s scoped mean on the zoning case, 7→0 on the bunching case, with the rest
  of each building inside the 2-point floor). Every repair patch is held to § D177 — changed legs,
  or for the one deliberately inert purchase (the fourth lift under a nearest-car rule), a § D227
  pin that the run is byte-identical, which is the § 10.2 lesson made mechanical. The five
  standing extras' fix-nothing claim is pinned the same way (config equality). The mount is a
  TypeScript-built overlay (`dev/fixitPanel.ts`, `menuRoot`'s pattern — `index.html` and
  `elementMap` untouched), reached by a `Fix a building` row on the Scenarios menu screen through
  the new `open-fixit` intent; the case file is the viewer's seventh fixed-name fetch, added to
  both ends of the cache contract. Honesty: the `FIXIT` adapter drives the engine's every sentence
  over the context's own run pair; `fixit/parse.ts` refuses R10 words and engine ids (§ 16 rule
  11) in authored copy at load time. **Not built:** § 10.3's full elevation-grid editor (the
  machinery steppers and the priced repairs are the editor surface this slice ships), FIXED
  persistence across reloads, the worker-thread run pairing (the pair runs synchronously,
  ~0.5–2 s), and the dispatcher-commissioning row of § 9's dispatcher table.

- **Slice 4 item (c), the rules editor — LANDED.** §11.5's when/then rows, compiled onto the
  weight-set selector as a **fourth policy** (`selection.policy: 'rules'`) rather than a second
  mechanism: `dispatch/selector.ts#selectRuleArm` is a sibling of `selectWeightSet` — shared
  `SelectorState` and dwell arithmetic, untouched fuzzy/contextual path (golden runs and fuzz
  determinism re-run green) — with the two semantics §11.5 owns: first match wins in row order,
  and **no match releases to the profile's own weights** (*If no rule fits, Steady hand
  decides*), the release itself gated by the dwell. Rows are player data on the profile
  (`rules.rows`, the schema's eighth auto-discovered section); the nine conditions read **no
  rates and no window** — queue lengths, ages, load factors, structural facts, and a clock that
  is authored data end to end (`ResolvedDemandTemplate.startOfDayS` through
  `DispatchContext.startOfDayS`; a clockless crowd makes every time clause false and the editor
  says so as a refusal, § D227). Eight of §11.5's ten actions ship — four weight arms raising
  one term to `RULE_EMPHASIS` (0.5, a named constant with its argument), three idle arms
  (`lobby`, the new `fixed-floor` stage-7 strategy with its point-mass demand model, and
  `zone-center`, whose flagged inertness trap was **measured, not argued** — `Simulation.#park`
  resolves the per-car partition unconditionally, and the moved-control run proves it), and one
  **static compile** (`no-new-pickups` → `eligibility.maxLoadFactorForAssignment`, valid only
  against *a car is fuller than*). The two refused actions are **omitted vocabulary, with the
  reasons on `RULE_ACTIONS`**: *skip everything above* (service range is building fabric,
  §11.4's own boundary) and *treat up-calls as urgent* (no direction-conditional cost term — the
  reword *treat every call as urgent* is flagged as a design-owner decision, not made). Every
  buildable action is held by a moved-control run at a named measured cell
  (`dispatch/rules.test.ts`), and two cells are themselves findings: `prefer-same-direction` is
  **structurally inert on `collective`** (its `noDirectionReversal` hard constraint filters
  wrong-way cars before the soft term prices anything — measured on `eta`, where the lever
  exists), and `emptiest-car` needs a prestige-level 16 %/5min morning before load separates the
  fleet. Idle precedence is intervention `idleOverride` > rule arm > profile, most recent
  explicit statement first. The editor (`authoring/ruleSpec.ts`, `dev/ruleEditor.ts`) renders
  every word from core's own `RULE_CONDITION_WORDS`/`RULE_ACTION_WORDS` — `{v}` templates
  substituted, never concatenated, every row naming the lever its `moves` claim asserts — and
  writes through `dev/state.ts#shiftRunConfigOf` **after** the selector (most explicit last), so
  written rules take the run and the switching panel says so
  (`selectorEditor.ts#rulesOverrideNoteOf`; the `rules` policy is deliberately **not a chip**
  there — it is entered by writing rules). Rule arms expose provenance ids
  (`rule-2:lobby-queue-passes:12`) through the same `activePattern` getter, land in
  `VizRecording.patternSwitches` (the `enrollPolicy` gate widened to `ruleSets`), and the stage
  header names them in player words through `ruleProvenanceName` — `PATTERN_NAMES`' naming path
  extended, honest fallback kept. Byte identity everywhere nothing opts in: no shipped profile
  or `data/` change, `profileWithRules([])` is the identity by object, and the empty-rows arm of
  the `viewer.ruleRows` probe is the run before the field existed. **Not built, named rather
  than implied:** row persistence across reloads (`ruleRows` is session state exactly as
  `selectorSpec` is), the reworded urgency action, and any claim that a rule *helps* — no copy
  anywhere asserts an outcome, for § D145/§ D156/§ D169's standing reason.
- **Slice 4 item (d), the ghost picker and race strip — LANDED.** §20.4's ghost, on exactly the
  seam the work-order above names: the ghost is a **second recording of the same crowd** — the
  primary's own `SimulationConfig` with one field swapped (`dev/ghostRun.ts#ghostPlanOf`:
  `dispatcherProfile`, and the player's mid-run `interventions` dropped as no key at all) — run
  through the shipped `dev/shiftRunner.ts` as a second request **after the player's run lands**
  (sequential, cancel-safe by the runner's own *latest ask wins*), and adopted **read-only
  beside** the primary: never `state.recording`, never `simulatedRecording`, so
  `bankingRefusalFor`'s identity gate refuses it by construction and it can touch neither
  `dayClosed`, the week, nor the board (`dev/ghostRun.test.ts` asserts the refusal on a real
  pair). Both recordings replay at **one playhead** on PT-F2's one clock, so contract §4.6's
  both-sims-step-together is satisfied trivially by construction — there is no second live sim to
  drift — and speed/pause drive both lines for free. **The picker offers the honest three only**
  (`live/raceStrip.ts#GHOST_OPTIONS`): *the plain baseline* (§ D134's preference list through
  `dev/defaults.ts` — the profile a fresh shift opens on, `collective` in the shipped data, never
  a private literal), *your latest saved* (most recent save, and the option's own copy says
  *latest* because there is no rating to make *best* mean anything), and *nobody* — no second
  request, one line per lane, no note, no verdict, the strip never invents a rival (asserted in
  `raceStrip.test.ts`). The handoff's world/previous-day arms are **omitted, not stubbed** (no
  posting infrastructure). The strip (`index.html#race-strip`, under the stage) draws §7.4's two
  lanes — mean standing wait of those standing *now* with the dashed 60 s line, and
  still-standing count — as SVG polylines from the pure `live/raceStrip.ts` (samples every 240 s
  on a grid anchored at `startedAt` so the two lines are comparable point for point; who stands
  is `frame/overlay.ts#isWaitingAt`, exported and called rather than re-answered, and the lanes
  are asserted against `observationsAt` as a second code path). The live verdict is §6.5's own
  rule — *level with* under three points, else *ahead/behind by N points* — from each recording's
  away-inside-a-minute-**so-far**, playhead-honest by construction, and the footer is §7.4's
  sentence verbatim with **no interval claim anywhere** (`raceStrip.test.ts` greps every producer;
  the bench keeps proof). §7.4's band is **not drawn** — the world band and the different-morning
  band would both require data this build does not have — and the one §7.4 meaning that *is* true
  of a same-seed ghost is stated instead: *same crowd both runs — the gap is your change, not the
  morning*. Colour deviates from the handoff's terracotta to the shell's own `--accent` for *you*
  (the shell carries *yours* in accent everywhere; heavier stroke + named key keep KB-15), the
  documented-deviation pattern of docs/12. The pick is closure state on `bankFilter`'s precedent
  — it changes which comparison recording is made and no leg of the player's run, so it is
  deliberately not a `ViewerState` field, not persisted, and seeds *nobody* so boot costs no
  second simulation. Moved-control at the seam (§ D177 before the panel, § D219's lesson):
  `ghostRun.test.ts` compares the two picks' second recordings **on the legs**, pins CRN (every
  arrival identical to the primary's, service different), and pins determinism (same pick, same
  seed → fingerprint-identical across two runs, structured-clone included). Honesty: the
  `RACE_STRIP` adapter (appended, fault-ordering rule kept) drives every wording — the options,
  both strip states at every sampled playhead with the context's own `comparisonRecording` as a
  real second run, the three verdict arms, the footer as `reason` (R2's third narrowing), and
  `ghostPlanOf`'s two speaking arms through the shipped `shiftRunConfigOf` chain. **Not built,
  named rather than implied:** the world/previous arms and their bands (posting infrastructure
  first), a *best* saved arm (needs a rating that does not exist), the report's closing honesty
  block reusing the verdict expression (§6.5 — the report is another lane's surface), and any
  persistence of the pick. Honesty-corpus string counts are deliberately not re-measured here:
  a figure measured per branch is stale on merge (CLAUDE.md's rule).
- **Slice 8, the client half — LANDED.** §14.1's *watching somebody else's run*, on the only seam
  this build actually has. **There is no server**, so §1.5's *"which is why the pill can honestly
  say verified by the server"* has nothing behind it and the pill does not say it: it reads
  `REPLAY · <name> · VERIFIED BY RE-SIMULATION`, and `watch/types.ts` argues the substitution —
  re-simulating a record the player's own machine wrote refuses **staleness** and says nothing about
  **forgery**, so the stronger sentence would be a true-sounding claim about a check that did not
  happen.
  **The persisted shape could reconstruct nothing, and that is the finding rather than the cost.**
  `DayOutcome` carried the outcome — arrived, carried, `minutePct`, the readings — and not one fact
  about the *question*: no seed, no building, no dispatcher, no log. **Zero of eight**, where
  `shift/banking.ts` counts *one of eight* against a `VizRecording` and concludes the facts are not
  there to rebuild. So the shape is extended, minimally and versioned:
  `DayOutcome.record: WatchRecord | null` (**session schema 6**), written by `closeShift` through
  `watchRecordOf` and by nothing else — the derivation needs `BrowserResources` and the scope table,
  and a `shift/` module reaching for either would be a second answer to `dev/state.ts`'s question
  about what a run is. Versions 1–5 are read backwards on the strongest form of
  `persist/types.ts`' own test: a build with no record concept stored no seed, so every day it filed
  really is unwatchable and `null` is the **measured** state (`session.ts#withDayRecords`).
  `DayOutcomeInput.record` is **required**, so a caller that forgets it is a compile error rather
  than a day silently filed unwatchable — it caught fourteen call sites on its first run.
  The recordability gate is `scope/runIdentity.ts` **called, never restated**: `watchRecordIssues`
  is `runIdentityIssues('ranked')` minus `WATCH_RECORD_CARRIES`, a three-row table asserted against
  `WatchRecord`'s own fields both ways, holding exactly the three things a submission cannot say and
  a local record can — the intervention log (contract §1.4), the held cars, and the week's day pair
  (growth and `eventFor`). **One arm is added and it is load-bearing**: a calendar period that books
  the day's event, because `calendarAsks` has no vocabulary for `eventId` and the catch lived in the
  `week` arm the subtraction removes. Driven firing inside the window and silent outside it.
  Sources are the two that exist: the player's filed days, and **two shipped reference runs**
  (`data/reference-runs.json`) whose FIXTURE marker the parser requires verbatim and whose
  `source: 'reference'` is written by the parser rather than read from the file — so a fixture
  cannot declare itself a player (§20.11). Their four figures are pinned **twice**: `reference.test.ts`
  re-simulates each record, and the product's own reproduction gate performs the same check before
  offering the row, so a fixture that goes stale in a shipped build loses its affordance rather than
  lying. The eighth fixed-name fetch, added to both ends of the cache contract.
  **A watched run cannot be closed, banked or posted through the refusal the product already had**:
  `enterWatch` never writes `simulatedRecording`, so `bankingRefusalFor`'s object-identity gate
  refuses it by construction — slice 4d's ghost lock, reused. The first draft saved and restored the
  field and `main.progression.test.ts`'s single-writer guard caught it on its first run; *the field
  not moving* is the stronger lock, because there is no window in which a bug could put it back
  early. Interventions and the ghost picker are disabled (contract §1.5); the transport is
  deliberately **not**, which is the half of that sentence a disabling sweep gets wrong.
  **Posting was the hole, and it was not only a watching one.** *A watched run cannot be closed,
  banked or posted* is enforced through the refusal the product already had for the first two —
  but `submitScore` had no such gate: it posts `claimedMetricsOf(recording.summary)`, the metrics of
  **whatever is on screen**, under `state.buildingId`/`dispatcherId`/`seed`, which are the
  **player's own** selection. `runIdentityIssues` cannot see it — it inspects the *state*, and a
  spectator's state is perfectly reproducible; what is wrong is the recording beside it. The server
  would replay the submitted seed, fail to reproduce, and answer `422 metrics-do-not-reproduce`,
  which is `scope/runIdentity.ts`'s own named outcome: *this product's one accusation, aimed at a
  player who did nothing wrong*. Closed with `bankingRefusalFor`, reused rather than restated, so
  one answer to *is the run on screen this shell's own?* is now asked by both the thing that banks a
  day and the thing that posts one — **and it closes the same hole for a recording loaded from a
  file, which predates this slice** (issue #136 gated banking and not posting).
  §14.1's two stated defect conditions are both driven: `view.test.ts` walks every string the view
  draws — a corpus that is a *function of the view*, with a third case settling that it covers the
  view — and requires none to say `you`/`your`; the action bar is a closed list of two.
  `watch/reference.ts` applies the same rule to **authored** fixture copy at load time, where
  `fixit/parse.ts` refuses R10 words, because a rule enforced over everything except the words a
  human types is enforced in the one place a human can break it.
  **The browser tier is where this slice earned its keep, and it found three defects rather than
  confirming a working feature** (`dev/watch.browser.test.ts`, the whole route end to end):
  `#timeline`'s own `display` beat `[hidden]{display:none}`, so the scrubber stayed on screen; the
  chrome rebuilt at 60 Hz through `replaceChildren` and detached its own buttons between `mousedown`
  and `mouseup` — **issue #106 exactly**, sixty failed clicks — now keyed on the whole view; and
  stopping the watch **resumed a run the player had paused**, because `adopt` autoplays, so 08:30
  came back as 08:31. `wasPlaying` is in the snapshot, and the round trip now pins the recording,
  the report, the week and the playhead.
  **Not built, named rather than implied:** another player's posted run — §14.1's actual subject,
  which needs a board first, and both are absent together; the board rank (`#2 on today's board`),
  omitted rather than stubbed because `#—` where a position goes is `docs/10` R3's
  blank-where-a-number-should-be, with the row's source line in its place; the eyebrow's *vs the
  world's middle* half, dropped on slice 4d's own precedent; and the worker-thread gate — a row is
  checked **when it is pressed** rather than on open, because checking every row would run one
  simulation per filed day to draw a list. Honesty-corpus string counts are deliberately not
  re-measured here: a figure measured per branch is stale on merge (CLAUDE.md's rule).
- **Slice 10a, the honesty half — LANDED.** ENGINE_CONTRACT §12.2's withheld matrix, **enumerated
  from the state model** rather than written as fixtures: `honesty/generate.ts#WITHHELD_REASONS`
  declares the axes and `withheldStates()` takes their power set, so a sixth reason adds
  thirty-two states to the corpus without anybody listing one. §12.2 names four (*day not closed ·
  replay · sandbox · `noPost`*); there are **five** here and every one names the seam in this tree
  that makes it real, because three of the four names are the prototype's. **There is no
  `settings.noPost` in this tree** — what is real is the pair of gates that refuse a post
  (`menu/account.ts#postingRefusal`, and slice 8's `bankingRefusalFor` in front of `submitScore`) —
  and the fifth axis is §12.2's own second paragraph, *the API unreachable* (§16 rule 15, issue
  #123), which is an **axis rather than a constant** precisely because this build has no server: the
  other four would otherwise only ever be swept in it.
  **Two of §12.2's five surfaces do not exist here, and they are named rather than stubbed**
  (`surfaces.ts#WITHHELD_MATRIX`'s docstring carries the table): *Your week* is `dev/leftRail.ts`'s
  card, the *report* is `dev/reportPanel.ts#emptyReportView`, the *board* is `menu/screens.ts`'s
  leaderboard body — but **the ladder** needs a standing dispatcher rating that is unbuilt (slice 4d
  omitted the ghost's *best* arm for the same reason) and **the percentile line** needs a world
  distribution nothing in this tree computes and no endpoint carries. A surface invented in order to
  be swept is a surface with no reader, and the sweep would then certify it.
  The rule is an **eighth property** — `withheld-figure-published`: a cell standing where a withheld
  figure would be reads `—` or a labelled unavailable state, never a blank, a zero, a spinner or a
  stale figure. Two populations reach it: the marked cells, and **every string whose role is already
  `suppressed`** — a rule `TextRole`'s own docstring has carried since it was written (*"never a
  blank, never a zero"*) and that no property enforced. *Stale* is the half that needs the adapter:
  a number is a leak only if it is the figure that cell may not carry, so `WithheldFigure.ifPublished`
  is declared where the state is known, exactly as `TextPlayhead.basis` is.
  **It found two, and both were shipping.** `runFiguresOf` published **0 %** under *best day so far*
  on a week with no closed day — a new player's whole first shift, and a best over an empty sample is
  not a bad best; and while watching somebody else's run the week strip's provisional bar drew the
  **watched** player's share as the spectator's own *today, so far*, because `drawShift` read the
  recording on the stage and `watch/session.ts#watchingStateOf` deliberately leaves the week
  untouched. Both are fixed in the product (`dev/leftRail.ts#todayShareFor` over a new
  `ViewAt.watching`; the history gate on the best-day cell) and both are **restored as faults**, so
  the property is shown to fire on the defects it was written for rather than only on invented ones.
  The axis's own size is measured beside the temporal axis's and for the same reason — **31 of 32
  states mark a cell**, and the missing one is `nothing-withheld`, because a state that withholds
  nothing marks nothing and asserting otherwise would demand the false claim the property refuses.
  §20.11 and §16 rule 15 are closed the same way, mechanically: every numeral in a fix-a-building
  case's authored copy must be a figure the run produced (at the copy's own precision, so *341 s*
  matches a measured `341.1`) or an entry in `cases.test.ts`'s `AUTHORED_FACTS` naming its source —
  a floor of the building, a served headcount off the building document — asserted in both
  directions; and `boundaries.test.ts` confines **value-level** imports of the leaderboard client to
  two files. That list came out shorter than it was written: `dev/menuPanel.ts` draws every board in
  the product and imports the client **for its types only**, so it is handed a page and, handed
  none, draws the labelled example (issue #28) rather than an empty table. The Everyday surfaces this
  delivery built hold no client at all, which is what makes them complete with no server by
  construction rather than by inspection. **Not built, named rather than implied:** the ladder and
  the percentile line (both need machinery that does not exist); *"no board row survives with no
  server"*, which is the absence of a string and belongs where absences are assertable
  (`menu/screens.ts`'s own tests) rather than in an instrument that judges what a surface said; and
  the three DOM panels, which are still statically swept. Honesty-corpus string counts are
  deliberately **not** re-measured here: a figure measured per branch is stale on merge (CLAUDE.md's
  rule), and this lane moves both tiers' counts and the surface count.
- **Slice 3, first pass — LANDED.** `SimulationConfig.interventions` carries the log as data
  (`packages/core/src/sim/types.ts`); the override travels through
  `RepositionContext.idleOverride` into stage 7; a tenth kernel event walks the idle fleet at
  each `atS`. The stage control (*Park the cars in the lobby*), the stamp under the header and
  the playhead resume are in `dev/main.ts`; the words in `live/interventions.ts`. Prefix
  identity, zero-log byte identity, replay determinism and the past-deadline refusal are held by
  `sim/interventions.test.ts`; the moved-control requirement by `scope/probes.test-helper.ts`'s
  `viewer.interventions` probe (a measured cell — midtown-office, `atS` 120). **Not yet built:**
  dispatcher switching as the union's second arm; the campaign incident answer unified onto this
  mechanism (§7.5); the report listing the log in its account of the day; and a wire field for
  the log — until that exists, `scope/runIdentity.ts` refuses to post a run carrying one, so
  replay verification cannot be tripped into a false accusation. Known honest gap: on
  garden-apartments the control is measured inert at the 900 s refit cell — a §7.6
  "cannot take effect now" refinement is the fix, not a different mechanism.

## Where the plan and the code disagree — the register

1. §20's *"renders today and reaches nothing"* is false here; the prototype is external.
2. §20.3 is ~80 % already true; only the stage readout of the detected pattern is missing.
3. §20.3's flags/levers "must affect the sim" is already satisfied and run-identity-tested.
4. §20.6 points at the wrong module; the day judge is `shift/`, with an honest `pending` gate
   the four-test model must keep.
5. §20.7/§20.9 are net-new, not a replacement; the analytic sizing is browser-exported and
   uncalled.
6. §20.8 is inverted: one bench exists, it is the pairwise one, and the suite is what is
   missing.
7. *"Too close to call"* is not this repo's verdict vocabulary, and the six-verdict set encodes
   distinctions one phrase would collapse.
8. No gauntlet, no forty cases, no ghost, no rule list, no `testsCount`; the nearest shared
   fixture list is `MATRIX_CELLS`, which is not "the eight buildings".
9. ENGINE_CONTRACT §12.2 names five surfaces the withheld matrix must be swept across and **two of
   them do not exist here**: the dispatcher ladder needs a standing rating (unbuilt), and the
   percentile line needs a world distribution nothing computes and no endpoint carries. Its four
   withheld *reasons* are the prototype's names — `noPost` in particular is a `settings` flag this
   tree does not have, and what is real is the pair of gates that refuse a post.
