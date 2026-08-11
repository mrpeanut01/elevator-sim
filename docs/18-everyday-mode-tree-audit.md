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
