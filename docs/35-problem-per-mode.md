# 35 — A problem per mode

**This document is [§ D414](../DECISIONS.md)** (2026-08-29). It proposed **D361** for itself; that
number had already been taken on a branch this document could not see, which is
[§ D404](../DECISIONS.md)'s subject appearing in the very line that asked for a number.

---

## 0. What this document is

### 0.1 The instruction

*Every mode should present the player a problem to solve.* This document specifies, for each of the
four front-door modes, **what problem the player meets, how they see it before they are told a
number, what they can change, and how they find out whether they were right.**

It was also asked to question the design where questioning it makes the game better. § 8 does that
against three named choices and disagrees with one of them.

### 0.2 Where it sits, and why it is a new file rather than a section of the GDD

Three documents now govern the game layer and they divide cleanly:

| document | the question it answers |
|---|---|
| [`32-game-design.md`](32-game-design.md) | **What is a mode?** Which beats it serves, what a retry costs, what losing is, what a unit buys |
| [`33-difficulty-curve.md`](33-difficulty-curve.md) | **How hard is it?** What pressure the building faces, what has to go wrong for the lesson to land, and the sweep that re-derives all of it |
| **this document** | **What can the player *see*?** Which problem each mode poses, and by what visible antecedent |

Three arguments for a new file rather than a section inside `docs/32`:

1. **`docs/32` is a declaration; this is a specification.** `docs/32` § 0.3 states what it decides and
   what it does not, and its per-mode table is deliberately one row per mode. What follows is four
   mode designs with drawing requirements and code changes attached, which is a different kind of
   text and a different review.
2. **The numbered series would collide.** `docs/32` carries `GD1`–`GD20` and a contracts-touched
   register; `docs/33` carries `DC-R1`–`DC-R3` and `DC-1`–`DC-9`. This document needs its own series
   and gets one. A third series inside `docs/32` would be the `S1`–`S10` collision
   [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 8 already records, manufactured
   on purpose.

   **The series, declared in full so nobody has to derive it.** `PM1`–`PM7` are the rules every mode
   is held to (§ 2). `PM-a`, `PM-b`, `PM-c` are the three mechanisms Fix a building has and the
   others should borrow (§ 1.4). The mode-scoped rules are `PM-TT1`–`PM-TT5` (Today's tower),
   `PM-CA1`–`PM-CA4` (Campaign), `PM-RU1`–`PM-RU3` (Endless rush) and `PM-FB1`–`PM-FB3` (Fix a
   building). Two stand alone because they belong to no single mode: **`PM-DOOR`** (§ 8.3, the
   first-run sequence) and **`PM-PARK`** (§ 9.4, an idle state on the frame). Ordinals are
   load-bearing from this commit and are not renumbered.
3. **The gap it fills is between the two, and belongs to neither.** `docs/33` § 2.1 says every stage
   names a **failure mode** — *"what **visibly** goes wrong when the player does the obvious thing"* —
   and then discharges that word with `DC-1`, which asks only that *a non-comparative goal is not
   met*. **A goal is a figure. A figure is not a sight.** That is not a criticism of `docs/33`: a
   claim about a run can be measured and a claim about a screen cannot be measured by the same
   instrument. But the word *visibly* is currently carried by nothing, and this document is what
   carries it.

### 0.3 What it decides, and what it does not

**Decides.** The problem each of the four modes poses; the visible antecedent of each problem; the
one thing the player changes; the form the verdict takes. The rules `PM1`–`PM7` those are built on.

**Does not decide.** The mode hierarchy and the front door — held for the product owner by
[§ D350](../DECISIONS.md), and § 8.3 argues a position without taking one. Whether Endless rush is
cut — [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 8 leaves it human. Any
difficulty number: `docs/33` `DC-4`'s band is the bar and this document does not re-derive it. Any
visual encoding: [`28-art-direction.md`](28-art-direction.md) § 5 owns the stage's pixels and this
document cites it rather than competing with it.

### 0.4 The register this document is read against

Stated here rather than in a footnote, because a specification whose evidence class is invisible is
the defect this repository records most often.

| claim class | how it appears below |
|---|---|
| **Read off the code** | file and symbol named. `fixit/engine.ts#classifyOutcome`, `render/riderQueue.ts#planQueueRow`, `live/interventions.ts` |
| **Cited from a document** | backticked path and section |
| **Measured here** | § 9.3 only, and it names its instrument |
| **Unverified** | said in those words, every time. Nine such claims are collected in § 11 |

---

## 1. The thesis, tested against the code

The thesis put to this lane: **Fix a building is the only mode that presents a problem, and the
other three should learn its shape** — symptom, hypothesis, intervention, verdict.

**It survives on its first clause and fails on its second, and the failure is the useful half.**

### 1.1 What Fix a building's loop actually is

Read off `packages/viz/src/fixit/`, `data/fixit-cases.json` (18 cases) and
`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 10:

1. **A complaint in a named person's words**, attributed — *"tenant, floor 62"*, *"resident, floor 4"*.
2. **A schematic of the building with the failing band flagged**, the case's `symptom` string printed
   on it.
3. **Four figures** — authored `reading: 'bad' | 'mid' | 'healthy'`, so the reader can see that
   everything else is fine.
4. **The diagnosis, printed plainly**, with its reasoning underneath.
5. **Four priced repairs and five standing extras**, none of them labelled as the right one.
6. **A budget of 10–16 u**, against a new shaft at a flat 34 u that is unaffordable in **0 of 18**
   cases (`docs/33` § 5.2).
7. **`Run the day`** — two runs sharing the traffic seed, as-built against as-repaired
   (`fixit/run.ts#fixitRunPlanOf`).
8. **Three rows and one of four named outcomes** (`fixit/engine.ts#classifyOutcome`), under the
   basis line *"one run before, one run after — enough to see a repair this size; not enough to
   split hairs."*

### 1.2 The correction: the player does not diagnose, and never watches anything

**Two things the thesis assumes about Fix a building are not true of it.**

**The player does not form the hypothesis.** Beat 4 of that list *is* the diagnosis, authored per
case, shown before any decision. The handoff cut the guess-the-fault quiz on purpose and said why:
*"it gated the interesting decision (what to spend) behind a comprehension test."*
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 3.4 has already tested the
programme thesis against this and amended it. **The problem Fix a building poses is not *what is
wrong*. It is *what to do about it, with less money than the obvious answer costs*.**

**And the player never sees a run.** Fix a building has **no stage**. Its symptom is a sentence
printed on a static schematic band — and in **2 of the 18 shipped cases** that sentence carries a raw
figure (`zoning-starves-the-top`: *"a 341 s mean wait to board, on one car for nine dense floors"*;
`car-park-nobody-serves`: *"a 322 s worst wait beside an empty hoistway"*). `everyday/actionBar.ts`
gives the `fixit` row no timeline; nothing in the mode plays a day. **The other sixteen symptom
sentences describe something that happens in a picture the mode never draws**, which § 7 is about.

So on the four constraints this specification is written against, the exemplar mode scores:

| constraint | Fix a building today |
|---|---|
| 1 — the engine can produce it | **Passes**, entirely. Every axis is a real config patch through `parseBuilding` + `resolveBuilding` |
| 2 — the symptom is visible before a figure | **Fails.** There is nothing to watch, and 2 of 18 `symptom` strings put a raw figure in the sentence |
| 3 — comprehensible without vocabulary | **Passes**, and better than anything else in the product. *"You can see the shuttles from the window — all eight of them, sat at the ground floor"* |
| 4 — no dishonest comparison | **Passes.** Same seed both runs, an 80 % bar rather than a subtraction, and the basis line printed under every result |

### 1.3 Verdict on the thesis

> **The thesis survives as *Fix a building is the only mode that poses a problem*. It fails as *Fix
> a building shows the player a symptom*. No shipped mode satisfies constraint 2 — including the
> one held up as the model — and that is the single most important finding in this document.**

The repository already knows this and states it as a pillar rather than as a mode defect.
[`22-charter.md`](22-charter.md) `P3` — *the stage shows what the report will later say* — carries
the note *"**This is the pillar the build currently fails outright**"*, and it is the only pillar
whose wording is attested rather than reconstructed. **Constraint 2 is `P3`.** This document does not
propose a new principle; it proposes the four things `P3` has to become, one per mode.

### 1.4 So what should the other modes copy?

Not the beat list — three of the four modes already have most of the beats on paper. **Three
mechanisms**, and each is portable:

- **`PM-a` — the named complainant.** Fix a building's problem arrives in the first person, from
  somebody with a floor number. Nothing else in the product has a person in it. A goal bar reading
  *61 % away inside a minute* is the same information with the human removed, and the human is the
  part a first-time player can hold on to.
- **`PM-b` — the priced decoy.** Five standing extras that carry **no patch at all**, so the budget
  can be spent badly, plus a costly fix that works less well than the free one, plus a shaft at 34 u
  that is never affordable. The decoys are what make the choice a choice. `docs/33` `DC-9` already
  requires that a repair be inert only when the case declares it inert — a rule the rest of the
  product has no equivalent of.
- **`PM-c` — the declared basis.** `BASIS_LINE`, printed under every verdict, in the player's
  register, saying exactly what one pair of runs can and cannot support. It is the project's
  statistical discipline shipped as a piece of writing a nine-year-old can read.

---

## 2. The seven rules

> **PM1 — Every mode names a problem, and the problem is a sentence a player could say out loud.**
> Not a goal, not a bar, not a metric: a state of the world someone would complain about. The test is
> `docs/33` § 2.1's test for a lesson, moved one column left — *a problem nobody can state in a
> sentence is two problems.* `docs/32` `GD15` already requires this of failure (*a named cause with a
> place attached*); `PM1` requires it of the problem, before anything has failed.

> **PM2 — The symptom precedes the figure, on the clock and on the screen.** A player meets the
> thing going wrong before they meet a number about it. This is `charter P3` and its refusal test is
> unchanged: *where on the stage would a player have seen this?* A screen that opens with AWT has
> answered the question before the player has asked it, and the number then explains nothing because
> there is nothing it is the explanation *of*.

> **PM3 — A symptom is a state, not an event.** This is the rule most likely to be got wrong, and
> § 8 is an entire section about one case of it. A symptom the player must *catch* is a symptom most
> players miss: a stage watched for thirty seconds shows the ~1 % of a 45-minute run it is 30 s of.
> A symptom that **persists** — a queue that is still standing, a car that is still parked in the
> wrong place — is legible at any moment the player happens to look. **Design the tableau, not the
> incident.**

> **PM4 — The engine constraint, and it is `charter P1` with a direction.** A proposed symptom names
> the field on `live/observations.ts#observationsAt` or the frame state it is drawn from, and a
> proposed intervention names the parameter in `packages/core/src/dispatch/parameters.ts` or the
> demand-template field it writes. *Where unsure, the proposal says **unverified**.* Nothing here may
> be specified as *the simulator probably does that*.

> **PM5 — A verdict pairs two runs of one crowd and never subtracts them.** [`CLAUDE.md`](../CLAUDE.md)
> forbids declaring one configuration better than another without a paired-t interval that excludes
> zero over 50–200 replications. A *"you improved it!"* built from two single runs is this project's
> documented central failure mode shipped as a feature. **Two shipped patterns already solve this and
> a third mode may use either**:
> - **The fixit pattern** — one pair on a shared seed, judged against a **categorical bar** far above
>   the noise (80 % of a named complaint gone), with the basis printed underneath. It says *the
>   complaint went away*, which is a statement about **this run**, not about a dispatcher.
> - **The § D310 pattern** — the dispatcher editor's result strip, **arithmetic-free by
>   construction**: every value is a string one of the two sheets already published, paired by figure
>   id, with *no subtraction, no ordering, no colour and no sum*, so a withheld mean pairs as
>   `withheld → withheld` rather than as a hole. It carries `ONE_RUN_PROMISE`, naming what would be
>   needed to say *better*: *50 or more paired runs against the same passengers and an interval that
>   excludes zero.*
>
> A mode may say *the complaint went away* or *here is what each run printed*. **No mode may say
> *better*.**

> **PM6 — The intervention is reachable from the surface the symptom is on.** A player who has just
> seen the problem must be able to act on it without navigating.
> [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 6 records that three of four
> modes are *complete in front and incomplete behind*, and § 4.1 disagreement 5 records that the
> stage → report step dead-ends in two of them. **A symptom the player cannot answer on the spot is a
> cutscene.**

> **PM7 — A mode that cannot yet draw its symptom says so where the symptom would be.** Not in a
> release note, not in a shell register: on the surface, in the player's register, in the shape
> `everyday/stageScreenModel.ts#STAGE_NO_GHOST` used — *"no rival lane — a ghost is a second run of
> the same crowd, and this screen cannot ask for one yet."* **That constant is gone**, deleted on the
> commit that gave the lane a rival (§ 4.5, GitHub issue #226, [§ D482](../DECISIONS.md)), and it is
> quoted here as the *shape* rather than as a live example — which is the rule working in the
> direction it is usually not tested in. This is `charter` non-goal 5 and
> [§ D227](../DECISIONS.md) both ways: an absent symptom may not be papered over with a figure, and a
> drawn symptom may not claim to be absent.

**`PM2` and `PM5` are the same rule seen from two ends, and noticing that is what makes both
buildable.** [`28-art-direction.md`](28-art-direction.md) § 4.2 fixes the ceiling on `P3`: *the stage
may make a thing visible as it happens; it may not publish the run's summary of it* — the seventh
honesty property, `whole-run-figure-early`, enforces it. So a symptom is, by construction, a
**present state or a fold to `t`** — `waitingNow`, `longestCurrentWaitS`, `deepestQueueNow`,
`peakQueue`, `worstWaitSoFarS` with its censoring flag — and never `summary.meanWaitS`. **The thing
a mode is allowed to show early is exactly the thing a player can be shown before a figure.** The
honesty rule and the pedagogy rule want the same screen.

---

## 3. The palette — what a symptom can be made of today

Every mode design below draws from this table and nothing else. It is an inventory of the shipped
renderers, taken from `packages/viz/src/render/` (the Engineer stage, `drawScene`, whose single
non-test caller is `dev/main.ts#drawStage`) and `packages/viz/src/everyday/stageScreen.ts`
(`drawCutaway`, the Casual cutaway). **Two independent renderers exist**, which is
[§ D299](../DECISIONS.md) § 3's decision working as intended, and a symptom must say which one it is
for.

### 3.1 Drawable today, on both stages

| symptom | how it is drawn | driven by |
|---|---|---|
| **People standing at a floor** | Engineer: one glyph per rider, oldest first, `○ ◑ ● ◆` by wait band, then `+N`, then a log-scaled bar past 40 (`render/riderQueue.ts#planQueueRow`); plus head-and-body **rider figures** in the rider lane, bobbing (`render/riderFigures.ts#drawRiderLane`). Casual: one 4.5 px capsule per rider tinted by `stageInkFor(waitedS)`, capped at 26 with a `+N` chip | `frame/overlay.ts#queueAt`; band from `waitBandOf` |
| **How long they have been standing** | Four bands, each carrying **shape, colour and bob amplitude** — never colour alone. Engineer bands come from `recording.summary`'s own thresholds; Casual's four rungs are `live/bands.ts#WAIT_BANDS` (`breezy`, `tapping-foot`, `checking-watch`, `taking-the-stairs`) | `t − arrivedAt` |
| **A crowd deep enough to be an emergency** | Engineer: a pulsing alarm rule across the whole plot when a landing passes `ALARM_STACK_DEPTH` = 24. Casual: the alarm strip at `STAGE_ALARM_STANDING` = 40 standing | `FloorQueue.total`; `waitingNow` |
| **Which way they want to go** | `▲n ▼n` per landing — **aggregate counts only** | `frame.landings[].waitingUp/.waitingDown` |
| **A car being full** | Body colour in four load bands (`room` / `carrying` / `at-design-load` ≥ 0.8 / `overloaded` ≥ 1.1), the occupant number inside it, a `!` glyph past the alarm, and Casual's `riders/capacity` readout | `frame.cars[].loadFactor`, `.occupants` |
| **Doors** | A continuous centre gap at `doorFraction`, a four-state glyph `▮ ◂▸ ▯ ▸◂`, and Casual's two amber leaves | `frame.cars[].doorFraction`, `.doorPhase` |
| **A car out of service** | Engineer: the shaft dimmed to `0.32` and an `OOS` pill. Casual: the well drawn dashed and empty with rotated `OUT OF SERVICE` | `recording.outOfServiceCarIds` |
| **Where the cars are, and which way they are moving** | Car body at its height, `▲`/`▼` beside it — **and nothing at all when `direction === 0`** | `frame.cars[].heightM`, `.direction` |
| **Somebody getting on** | A relief mark `✓N` over a landing, five-second window | `FloorQueue.recentlyBoarded` |
| **A call nobody ever answers** | `✗` on the landing | `SceneInput.unansweredCallFloorIds` |
| **A landing that cannot ride** | `▩` on the landing, and `describeLockedOut` in the description | `SceneInput.lockedOutLandings` |
| **The queue's history up to now** | The race strip's own lane: the average wait of the people standing *right now*, sampled to the playhead, with a dashed 60 s line (`live/raceStrip.ts`) | folds to `t` only |
| **A mid-run intervention having happened** | A stamp under the header — `09:14 · parked the cars in the lobby` — which **disappears if the player scrubs back past it** (`live/interventions.ts#interventionStampOf`) | `RunInterventionConfig.atS` |
| **All of the above, in words** | One deterministic paragraph, per-floor queue sentences busiest-first, one sentence per car, mood, suppression ground (`render/describeFrame.ts`). It is the canvas's `aria-label` and the live region | the same frame |

### 3.2 Not drawable today, and what each would take

Every mode design below that needs one of these says so and prices it.

| absent symptom | why | what it would take |
|---|---|---|
| **A parked car, distinguishable from a stopped one** | `grep` for `park`/`idle` across `render/` and both stage screens returns nothing. An idle car is a stationary car with `direction === 0` and near-zero load — **pixel-identical to any empty car that happens to be stopped**. `PARK_CARS_LOBBY_LABEL` exists as a button with **no visual consequence of its own** | A frame field. `FrameCar` carries no idle state; the renderer cannot invent one. See § 9, which is about this row |
| **A car passing a floor where somebody is waiting** | `FrameCar` carries `carId, bankId, label, heightM, floorId, direction, doorFraction, doorPhase, occupants, loadFactor` — **no stop list, no assigned calls, no destination set.** `VizShaft.motions` makes a future stop *derivable* and nothing renders it | Either a frame field, or a renderer that reads `motions` ahead of the playhead — the second is `docs/28` § 4.4's *foreshadowing*, **refused**, because it reads the future. The honest form is a mark on the **landing** at the moment of the pass, drawn from the past |
| **Doors closing on somebody / a boarding refused for lack of room** | No such event exists in the contract. `VizLeg` has `arrivedAt, boardedAt, alightedAt, carId, bankId, refusedAt, assignedCarId, credentialGroup`, and `refusedAt` is credential refusal, used only negatively — `isWaitingAt` returns `false` and the rider silently vanishes | A contract field on `VizLeg`, and therefore a `core` change. **This is the most expensive item in the table and the one a designer will reach for first** |
| **A rider giving up and walking away** | The band named `abandoned` is an **age**, not an outcome — `live/bands.ts` says so outright. `isWaitingAt` removes a rider on `boardedAt` or `refusedAt` and on nothing else, so **the stage keeps drawing somebody the Day report has already counted under `TOOK THE STAIRS`** | An `abandonedAt` on `VizLeg`. *Unverified*: whether the underlying simulation removes the rider — [`CLAUDE.md`](../CLAUDE.md) says patience is simulated and riders do leave, so this is likely a viewer-contract gap rather than an engine one. **The check that settles it: run a building with `sim.patience.distribution` set, and assert `queueAt` at the horizon does not still hold a leg the report counts as abandoned.** Named as a finding in § 11 |
| **A rival lane on the Casual stage** | Refused correctly and out loud: `STAGE_NO_GHOST`. `dev/ghostRun.ts#ghostPlanOf` — the module that builds a rival on the same crowd — **is inside the Engineer shell's closure**, on the far side of a façade the stage may not reach through | A **provided port**, exactly the shape [§ D338](../DECISIONS.md) used for the Engineer swap: `everyday/swap.ts` provides a capability into the shell rather than letting the shell import it. See § 4.5 |
| **Scrubbing on the Casual stage** | `mountStage` has play/pause and speed buttons and no timeline element; no `seek*` call exists there. The Engineer surface has the full transport, including click-to-scrub and ±1/±60 frame stepping | A timeline element wired to the `Playback` the screen already owns |

### 3.3 The two things this palette makes obvious

**The stage can already show a crowd better than it can show a lift.** Nine of the thirteen drawable
rows are about people; the car's own behaviour is four states of fullness, a door fraction, a
direction arrow, and nothing about intent. So a symptom phrased as *people are stacking up* is cheap
and a symptom phrased as *the lift is doing the wrong thing* is expensive. **Every design below is
phrased from the crowd's side**, and that is not a stylistic choice — it is the palette.

**`docs/28` § 5.4 has already specified the four channels and named the gap.** `AD-S7` (the wait
ramp gets height as a second channel), `AD-S8` (the landing's ground takes a wash of its deepest
band), `AD-S9` (the alarm's threshold is building-relative or names itself), `AD-S10` (the race
strip's duration lane is *"the most under-weighted element on the screen"*). **This document requires
none of them and depends on all four.** A mode whose symptom is a queue is a mode whose symptom is
4.5 px wide until `AD-S7` and `AD-S8` land.

---

## 4. Today's tower — *one press, and you have to spend it well*

### 4.1 The problem

> **You are given one morning and one instruction. The building will have one bad stretch in it. You
> have to notice which stretch, and say the right thing into it.**

Today's tower is ~3 minutes, one day, one score, one retry, and its fifth beat is social
(`docs/32` § 1.2). [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4 gives it
beats **1 and 5** and no beat 3 or 4, on the ground that *the day does not come back*.

**That ground is out of date, and the mechanism that changes it already ships.** A run is the record
`{ seed, config, interventions[] }`. `live/interventions.ts` is the Everyday intervention control:
`PARK_CARS_LOBBY_LABEL` (*"Park the cars in the lobby"*), `switchDispatcherLabelOf(name)`
(*"Switch to …"*), a `RECOMPUTING_BEAT`, and `interventionStampOf`, which answers **for a playhead** —
a player who scrubs back past their own press sees the stamp disappear, because at that instant it
has not happened yet. `everyday/stageScreenModel.ts#stageInterventionsOf` mounts it — cited by name
rather than by the line number this sentence carried, which moved the first time the file did.
`INTERVENTION_KINDS` in
`packages/core/src/sim/types.ts` declares three arms: `park-cars-lobby`, `switch-dispatcher`,
`answer-incident`.

So Today's tower can have **beat 3 on the stage** and **beat 4 for free**, and neither needs a new
engine capability:

- **Beat 3** is the press. It is not steering — [`16-change-scope-contract.md`](16-change-scope-contract.md)
  is unamended and there is still no such thing as a mid-day change. The player **writes one
  instruction into the day and the day is run again with the instruction in it**, which is the honest
  description and also the better one: *you cannot drive a building, you can only tell it something.*
- **Beat 4** is what falls out. The pressed day and the unpressed day differ in `interventions[]` and
  in nothing else — same seed, same building, same demand — so they are the same crowd by
  construction. That is common random numbers arriving without anybody having to build a batch.

### 4.2 The symptom, before any figure

> **`PM-TT1` — The mode opens on the stage, not on the plate.** Day one currently grades the building
> before the player has watched anything: *"How hard this looks: Comfortable. 60 people per working
> car today. Comfortable is around 400."* The copy is real and exact — `everyday/today.ts` computes
> 120 ÷ 2 = 60 against `COMFORTABLE_PER_CAR = 400` — and **the 400 is a citation to the design
> prototype rather than a measurement**, which that module's own docstring says. A difficulty verdict
> delivered before the run is `PM2` inverted twice over: a figure before the symptom, and a whole-day
> claim at `t = 0`. The plate is not deleted; it moves to where the player meets it **after** the
> morning, or is reworded as configuration (*two lifts, a hundred and twenty residents*), which
> `docs/28` § 4.3 permits in full at `t = 0` because it is the building rather than the run.

> **`PM-TT2` — The day must contain a legible bad stretch, and *legible* is a stronger claim than
> `DC-4`.** `docs/33` `DC-4` requires a contract's day 1 to miss at least one of the day's four goals
> on **a third to two thirds** of seeds. Necessary, and not sufficient: a day can miss *worst wait
> inside 230 s* on one rider at minute 41 and be invisible for the other fifty-nine minutes. So:
>
> **The day must hold, for at least 120 contiguous simulated seconds, a landing with somebody in the
> third wait band or worse.** The third band is `checking-watch` on the Casual ladder
> (`live/bands.ts#WAIT_BANDS`) and `long` on the Engineer one, both keyed to
> `metrics.longWaitThresholdS` — so this is the product's own 60 s and not a new number. **120 s is a
> design choice offered to be attacked**, and § 9.3 measures the building where it fails hardest.

> **`PM-TT3` — The stamp is the antecedent of the report's own sentence.** The Day report already
> carries `interventionLogOf` (`shift/report.ts:633`) in the player's words and on the same clock the
> stage stamp reads. `charter P3`'s refusal test — *where on the stage would a player have seen
> this?* — is answered by construction for every sentence the report makes about the press, because
> the stamp and the log are one producer. **That is the one place in the product where `P3` already
> holds, and it is the model for everywhere else.**

**What the player sees, in thirty seconds.** The clock runs; capsules appear at a landing and stay;
their colour and — after `docs/28` `AD-S7` — their height step up a band; the landing's ground washes
with the deepest band present (`AD-S8`); the race strip's lane climbs towards the dashed sixty-second
line. Nothing is announced. **The player says *"nobody is coming for those people"* and reaches for
the button.** Not one word of that sentence is a lift-engineering word, which is constraint 3 met by
the picture rather than by the copy.

### 4.3 What the player changes

| when | control | what it writes | shipped? |
|---|---|---|---|
| **During** | *Park the cars in the lobby* | `RunInterventionConfig { atS, change: { kind: 'park-cars-lobby' } }` — every idle car treated as though the profile had authored `idle.parkingStrategy: 'lobby'` from that instant, carried through `RepositionContext` rather than a second policy | **Yes** — `everyday/stageScreenModel.ts`, `dispatch/lifecycle.ts#repositionDecisionFor` |
| **During** | *Switch to …* | `{ kind: 'switch-dispatcher' }`, the profile inline. **Weights only**; no stage setting switches, and `SWITCH_PINS_NOTE` says so on the control before the press | **Yes** |
| **Before** | The three group levers — `parking` → `idle.parkingStrategy: 'lobby'`, `express` → `'zone-center'` (outranks parking), `dwell` ∈ `snappy \| normal \| patient` → six door parameters | `authoring/dispatcherSpec.ts#GroupLevers` | **Yes** |
| **Before** | The dispatcher | `SimulationConfig.dispatcherProfile` | **Yes** |

**One press is specified and not built, and it is the one this mode most wants.**
`park-cars-lobby` is the *wrong verb* for two of the three shipped parking faults:
`sleeping-sky-lobby` and `gym-on-the-top-floor` are both cured by parking cars **away from** the
lobby. The vocabulary needs its opposite.

> **`PM-TT4` — `INTERVENTION_KINDS` gains a `spread-cars` arm**, writing
> `idle.parkingStrategy: 'zone-center'`, labelled in the same register (*"Spread the cars through the
> building"*). One union member and one branch in `repositionDecisionFor`, on the existing
> `park-cars-lobby` precedent — *"it changes no weight, no constraint and no stage-1–6 setting; only
> where a car with nothing to do waits moves."* The words already exist one level up:
> `RULE_ACTION_WORDS` ships `hold-at-lobby`, `park-at-floor` and **`spread-out`**, all three writing
> `idle.parkingStrategy` and all three in the player's own language. The intervention row has two of
> those three verbs and is missing the useful one.

### 4.4 How the player finds out whether they were right

**The § D310 pattern, unmodified.** Two sheets — the day as it ran without the press and the day as
it ran with it — paired **by figure id**, with no subtraction, no ordering, no colour and no sum, so
a withheld mean pairs as `withheld → withheld` rather than as a hole. Under it, one sentence in the
`ONE_RUN_PROMISE` shape naming what saying *better* would take: *50 or more paired runs against the
same passengers and an interval that excludes zero.*

Three clauses make that honest rather than merely cautious:

1. **The crowd identity is asserted, not assumed.** The two runs differ only in `interventions[]`, so
   their legs must agree on `(passengerId, arrivedAt, originFloorId, destinationFloorId)` and may
   differ only on `boardedAt`, `alightedAt` and `carId`. **A required test, not a remark** — it is
   `fixit/run.ts`'s *"everything the passenger trace is a function of comes off the case and is
   identical between the two"* asserted rather than argued, and it is what would catch a future
   intervention arm that reached demand.
2. **No verdict word.** *Fixed*, *better*, *improved*, *worse* are all refused. What the mode may say
   is what the fixit engine says about a **named** quantity — *the queue at Level 4 cleared* — or the
   strip's nothing-at-all. `docs/32` `GD2` binds the social half: *a board publishes what happened on
   a day; it never publishes which dispatcher is better.*
3. **The unpressed day is the run that was on screen at the press**, captured then rather than looked
   up afterwards — § D310's own rule, for its own reason: the latest filed sheet is not always a
   sheet of the latest run.

### 4.5 The one thing this mode needed and did not have — **built, 2026-09-05**

**`PM-TT5` is closed** (GitHub issue **#226**, [§ D482](../DECISIONS.md)). `EverydayHost` carries the
port — `ghostRace()` and `raceAgainst(pick)` — the stage carries the picker, and `STAGE_NO_GHOST` was
deleted on that commit with the two register entries it was half of. What this section said is kept
below, unedited, because the argument for the shape is what the port was built to and is still the
reason it is a *provided* port rather than an import.

**One thing it did not anticipate, recorded here because the section claimed the drawing was free.**
*"The drawing is two SVG polylines that already exist"* is true, and the lines are **not always
distinguishable**: measured on `garden-apartments` at its shift demand, nobody is standing when any
four-minute grid point falls, so both runs plot flat and identical whatever the dispatchers did. And
at the shipped defaults the plain baseline **is** the dispatcher already driving, so the rival's
recording comes back byte-identical — which the strip now says in words rather than drawing twice and
calling it a race. Neither is a defect in the port; both are the difference between *a lane exists*
and *a lane shows something*.

**What it said, unedited:**

**A rival lane on the Casual stage.** `live/raceStrip.ts` draws two lanes; the Casual stage draws
one, and says why out loud (`STAGE_NO_GHOST`): *"a ghost is a second run of the same crowd, and this
screen cannot ask for one yet."* `dev/ghostRun.ts#ghostPlanOf` — the module that builds a rival by
swapping exactly one field of the primary's config — **is inside the Engineer shell's closure**, and
the stage may not reach through the façade to it.

> **`PM-TT5` — `EverydayHost` gains a provided ghost port**, in the shape [§ D338](../DECISIONS.md)
> used for the Engineer swap: `everyday/swap.ts` hands a capability *into* the shell rather than
> letting the shell import across the boundary — precisely because `boot.ts` already imports
> `dev/main.ts`, and closing that cycle is what produced this directory's last module-init
> `undefined`. `STAGE_NO_GHOST` is deleted **only** on the commit that lands the port, per `PM7` and
> per its own note that it is a *control's* refusal rather than a register entry.

This is the change with the best ratio of play value to cost in this document: it takes Today's
tower's fourth beat from *stated* to *drawn*, and the drawing is two SVG polylines that already exist.

---

## 5. Campaign — *the building fills up every night, and your money does not*

### 5.1 The problem

> **What cleared the building on Monday does not clear it on Friday. You have a purse, a works
> night, and a shop full of defensible things to buy. Only some of them are the thing that is
> actually wrong.**

`docs/32` § 1.2 gives Campaign beat **3, by pricing it** — *the only container that makes a change
cost something and persist past the day.* The problem statement above is that sentence turned into a
predicament, and the pressure that produces it is already built: `shift/growth.ts` grows the building
by `1 + 0.11 × (day − 1)` as **a real edit to a real `BuildingConfig` put back through
`parseBuilding` and `resolveBuilding`**, because *"a growth factor that only reached the tenant count
in the header would be … a lying one."*

**Two of issue #181's four verified breaks are closed and two are not, and the two halves have to be
read apart.** The paragraph here used to say the mode posed none of its problem, listing all four:
closing a day records nothing, the wear clock is frozen at zero, the `build` select writes a field no
run reads, and — the one that mattered here — *nothing bought reaches a run*, with `fittedLevel` and
`bookedLevel` display-only and `host.runCampaignDay` writing `buildingId` and `dispatcherId` and
nothing else.

**The first and the last of those have stopped being true.** § D400/§ D401 made a completed day file,
mark the month grid, move the purse and drive progression. And § D427 makes what is bought reach the
run: `everyday/host.ts#runCampaignDay` writes `ViewerState.campaignFitOut` from
`campaign/fitOut.ts#fitOutOf`, which folds § 8.2's *fitted* levels — so the nights a booking costs
gate the kit, not a second reading of them — and `shiftRunConfigOf` builds the day's building, crowd
and driving profile from it. Thirteen of the sixteen tiers move the **legs** at the campaign's own
cell; the other three are measured and named rather than assumed
(`packages/viz/src/campaign/fitOut.test.ts`).

**The wear clock and the `build` select are still exactly as described**, and neither is closed by
the above: nothing increments `trips`, and `CampaignTower.buildId` is still read by
`everyday/campaignModel.ts` and by no run.

> **The design verdict is that Campaign's problem is the right problem and half its wiring is still
> absent.** Nothing below asks for a new mechanic. The shop now reaches the run (#181's first clause,
> § D427); what the mode still does not have is the three things below, and a works night a player
> can watch rather than only pay for.

### 5.2 The symptom, before any figure

Campaign has the **best-drawn symptom in the product and does not use it as one.**

> **`PM-CA1` — Today's event is shown before it is described.** `shift/events.ts` ships five events
> writing real engine fields, and `events.test.ts` already asserts each one changes the run *in the
> way the event claims* — a car genuinely idle, a directional mix genuinely swung, a rate genuinely
> raised (`docs/32` `GD19`). One of those five is the most legible mark either renderer draws: **a car
> out of service** is a shaft dimmed to `0.32` behind an `OOS` pill on the Engineer stage, and a
> **dashed empty well with `OUT OF SERVICE` rotated down it** on the Casual cutaway. The day should
> open on the building with the hole in it, and the brief should confirm what the player has already
> seen. Today the order is the other way round.

> **`PM-CA2` — Growth has a visual antecedent nobody has claimed, and the Casual stage is missing
> it.** `render/canvas.ts#drawFloors` paints a **lit window band** — up to six panes per floor, a
> deterministic hash — driven by `recording.floors[].population` and the hour. Growth edits exactly
> that field. **So the Engineer stage already lights up as the building fills, and no document says
> so.** It is `charter P3` satisfied by accident, and it is the cheapest true sentence available to
> the campaign's own copy: *there are more people in the building than there were on Monday, and you
> can see them in the windows.* The Casual cutaway draws floor slabs and gutter labels and no
> windows, so it has no equivalent — and that is the gap `PM-CA2` names. **Unverified**: whether the
> band is legible at Casual row pitches; `docs/28` § 5.1's geometry is the place to settle it.

> **`PM-CA3` — A works night is watched, not just paid for.** The purchase reaches the run now
> (#181's first clause, § D427) and the *picture* follows for free where the fabric moves: a shaft
> bought **is** a well that appears, because `fittedBuilding` grows the bank through
> `commissionedBuilding` and the renderers draw the building the run was built on. What is still
> unbuilt is the works **night** — no campaign day takes a car out of passenger service, which is
> `docs/32` `GD11`'s ordering and issue #272's withdrawn sentence — so a booking under works is
> still a purse falling and a calendar cell filling, and nothing on the stage. **A purchase whose
> only visible consequence is the purse falling is the economy this mode already had.**

### 5.3 What the player changes

| | control | writes | shipped? |
|---|---|---|---|
| Works night | the shop — fittings, shafts, doors, destination panels | `ViewerState.campaignFitOut`, folded from § 8.2's fitted levels, and through it the run's `BuildingConfig` (shafts, machine class, rated speed, rated load, door timings, transfer time, floor populations), its `demand.arrivalRatePctPop5min` and its driving profile's `dispatch` block — [§ D427](../DECISIONS.md) | Yes, and proved on the legs |
| Career | difficulty tier | the purse `16 / 8 / 5 / 3`, the rate ladder, the miss allowance `6 / 3 / 1 / 0` — **stakes, never a bar**, per [§ D345](../DECISIONS.md) | Yes |
| Day | dispatcher, the three group levers, the pattern rows | `SimulationConfig.dispatcherProfile`, `GroupLevers`, `authoring/patternSpec.ts#PATTERN_ROWS` | Yes |
| Stage | the shipped interventions | `interventions[]` | Yes |

> **`PM-CA4` — The shop needs `PM-b`, and #181's first clause landing is the moment it became
> possible to get wrong.** Fix a building's five standing extras carry **no patch at all** and exist
> *so the budget can be spent badly*; `docs/33` `DC-9` requires that a repair be inert only where the
> case **declares** it inert, asserted on the legs in both directions. Campaign's shop used to have
> the opposite problem — every item inert and none of them saying so, which is
> [§ D219](../DECISIONS.md)'s defect at the scale of a mode's whole economy, as #181 itself puts it.
> **The rule arrived with the wiring** ([§ D427](../DECISIONS.md)): every one of the sixteen tiers is
> swept against a no-purchase control on the same seed at the campaign's own cell, and the three that
> move no leg there are named in the file with the cell where each does move —
> `cars` L1 and L2 (the fitted document really does put 16- and 21-person cars in, and two cars over
> an hour of a residential trickle never fill) and `control` L2 (Level-0 disclosure, which
> [§ D112](../DECISIONS.md) already measured as changing no decision, against `control` L3's
> Level-1 panel which does move it). An item that is *defensible and useless at a cell* is a
> measurement; an item that is silently useless is the thing this repository has recorded eleven
> times.

### 5.4 How the player finds out whether they were right

**Campaign is the only mode whose day verdict needs no second run at all, and that is worth saying
plainly because it is a design asset rather than a limitation.** The four day goals
(`shift/goals.ts#goalsForDay`) are **non-comparative count goals** read off the run's own numbers —
`docs/33` § 2.2 names the kind — so the day is judged against a bar every player meets identically,
with no comparison and therefore no opportunity for a dishonest one. `goalsForDay(day)` reads the day
and nothing else; no difficulty tier reaches it.

Three constraints keep it that way:

1. **`docs/10` R12 binds every new bar.** *A single-run goal whose across-seed variance has not been
   measured* is on `docs/10` § 5.5's never-build list. `docs/33` § 4.2 measured the shipped bars —
   8 contracts × 4 days × 30 seeds — and any bar added later owes the same before it ships.
2. **The works-night purchase gets the § D310 pairing**, not a subtraction: the day with the purchase
   and the day without, same seed, paired by figure id, no arithmetic. A purchase is fabric or
   dispatcher and never population, so the trace holds — **and that is a rule rather than an
   observation.** A shop item that edited `floorPopulations` would silently break the shared crowd,
   which is why `PM5`'s legs-identity assertion covers this pairing too.
3. **A refusal is not a miss, and they may not share a colour.** `docs/32` `GD17` and its corollary:
   a missed goal and a withheld mean are different kinds of thing, *"and a screen that renders both
   in the same red is teaching the player that the product's honesty is their punishment."* Campaign
   is the surface where that temptation is strongest, because it is the one keeping score.

**Growth is what a day-over-day comparison may not be built on.** Two campaign days differ in
population, so they are not the same crowd and nothing may be paired across them. The mode's
difficulty mechanism and its comparison mechanism are in direct tension, and the resolution is that
**Campaign compares within a day and never between days.** Between days it may say what happened —
*Monday cleared, Friday did not* — which is two observations rather than a comparison.

---

## 6. Endless rush — *call it before the building does*

### 6.1 The problem, which is the best one in the product and has no engine

> **A stream that climbs and never stops. Your one job is to say when the building stopped coping —
> and then to find out whether you called it early, late, or right.**

`docs/32` § 1.4 and [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 3.4 both
conclude that the rush **serves neither half of the loop**: no held crowd, so no counterfactual; and
its output is a *where* rather than a *why*. `docs/32` `GD4` recommends demoting it to an instrument
beside the bench. GitHub issue #220 asks for the climbing demand template, the held-time stage and
the result screen, or a clean cut.

**This document agrees with every word of that analysis and draws the opposite conclusion, on
constraint 2.** The rush is the only mode in the product that satisfies `PM2` *for free*: there is
nothing to explain, because the player watches the building lose. Every other mode is trying to
manufacture a visible symptom; this one is made of nothing else.

So the disposition proposed here is a fourth, beside `GD4`'s three:

> **`PM-RU1` — The rush is the product's demonstration, and its game is a judgement call rather than
> a configuration.** It serves neither half of the loop and it is not asked to. What it delivers is
> `charter S1` — *a first-time player reaches a building in visible trouble within 90 seconds of
> first load* — which is the criterion the tutorial building demonstrably cannot deliver (§ 9.3), and
> it delivers it without a tutorial building having to be made hard, which GitHub issue #270 measured
> as impossible within the legal axes.

**The mechanic.** The stream climbs. One button: **`Call it`**. The player presses when they believe
the building has stopped coping. The run then continues to its own end and the screen says where the
queue actually began to diverge, and how far off the call was.

Why this is a game and not a cutscene, against `PM6`: the press is the intervention, the symptom is
the thing being judged, and the verdict is about the player rather than about a configuration. It
needs no second run, no CRN and no interval, **because it makes no comparison between
configurations** — which is why it is the one mode in this document whose honesty section is short.

### 6.2 The symptom

Everything in § 3.1, used at once and without a single new mark:

- capsules accumulating at every landing and never clearing;
- the wait bands walking up through `breezy → tapping-foot → checking-watch → taking-the-stairs`;
- the queue rows degrading from glyphs to `+N` to `render/riderQueue.ts`'s log-scaled bar as the
  landings pass 12 and then 40;
- the alarm rule pulsing across the plot past `ALARM_STACK_DEPTH` = 24, and the Casual alarm strip
  past `STAGE_ALARM_STANDING` = 40;
- cars going from `room` through `carrying` to `at-design-load` and staying there;
- the race strip's lane crossing its own dashed sixty-second line and not coming back.

**That is the whole design.** The renderer is already a saturation instrument; nobody has pointed a
mode at it.

### 6.3 What the engine cannot do yet, exactly

`docs/23` § 6 names the blocker precisely: *no demand template ramps without a ceiling.* The shipped
templates in `data/traffic-profiles.json` are `rise-and-fall`, `constant-iso`, `lunch-two-way`,
`shift-change`, `evening-egress`, `office-down-peak` and `office-day`, and a `DemandTemplate` carries
`durationMin` plus an optional `phases: DemandPhaseRecord[]`, each
`{ startMin, endMin, startIntensity, endIntensity, startSplit?, endSplit? }`.

> **`PM-RU2` — The climbing stream is a template, authored in `data/`, and is therefore invariant 7
> work rather than engine work.** A phase list whose `endIntensity` exceeds its `startIntensity` on
> every phase, continuing past the profile's declared band, is expressible in the shipped schema.
> **Two things it owes, and neither is optional:**
> - **The departure from the cited band is declared where the number lives.** The residential profile
>   declares `arrivalRatePctPop5min { min: 3, typical: 5, max: 7 }`; a ramp goes past it by design.
>   `data/traffic-profiles.json` already carries the idiom for exactly this — the hospital profile's
>   `$comment` marks its rate band **`DERIVED, not quoted from a table`** and its split **`NOT CITED,
>   and stated as an assumption`**. A rush template writes its own such note. It is not a reference
>   value and must not be dressed as one.
> - **It may not be reachable from any judged surface.** A rate outside a profile's band is a
>   demonstration, not a design case, and `CLAUDE.md`'s reference-data rule is what keeps the two
>   apart.
>
> **Unverified**: whether `phases` alone gives a monotone ramp of arbitrary length, or whether the
> intensity is renormalised over `durationMin` in a way that caps it. `traffic/generator.ts:757` and
> `config/demandPhases.ts` are where that is settled, and it is settled by reading them rather than
> by this document guessing.

### 6.4 How the player finds out whether they were right

**The rush's verdict is a fact about one run and must be published as one.**

> **`PM-RU3` — The divergence point is a single-run figure and carries `docs/10` R12's obligation.**
> *A single-run goal whose across-seed variance has not been measured* is on the never-build list.
> Before *"you called it 90 s early"* is drawn, the across-seed spread of the divergence point at the
> shipped template must be measured and published, exactly as `docs/33` § 4.2 did for the day goals.
> If it is wide, the screen says the spread rather than the point.

The saturation machinery to find the divergence point already exists and must be the one used:
`summary.saturation` carries the verdict (`diverging-queue`) and the trend test that produced it.
**A second definition of *when it broke*, computed in the viewer, would be a second statistics** —
`charter` non-goal 7.

**And the mode may not say *better*, because it never has two configurations to compare.** This is
the one place in the product where that constraint costs nothing.

### 6.5 What this leaves undecided

`docs/32` `GD4` recommends the bench as the rush's home and explicitly does not decide it; `docs/23`
§ 8 leaves the cut human. **`PM-RU1` does not overturn either** — it says that *if* the rush is
built, its highest-value placement is minute one rather than hour three, because what it is good at
is being seen. Where the tile lives is still the product owner's.

---

## 7. Fix a building — *the diagnosis stays given, and the case gets a stage*

### 7.1 The problem, unchanged

> **A tower with one thing wrong and a tenant who has written in. The cause is stated. The decision
> is what to do about it, with less money than the obvious answer costs.**

This document proposes **no change to the mode's problem**, and § 8.1 explains why the obvious
change — making the player guess the fault — is refused.

### 7.2 The symptom, and the finding that makes it nearly free

**The mode already holds a complete recording of the building failing, and draws a diagram instead.**

`everyday/fixitScreen.ts:335-343` runs the as-built configuration **when the case opens** —
`session.asBuilt = recordRun(plan.asBuilt, { recordDecisions: false })`, synchronously, at the
~0.5–1.5 s the module's own docstring prices it at — because `fixit/run.ts#figureValuesOf` computes
the four opening figures from that run's legs. The docstring says it outright: *"The four figures —
computed from the as-built run, never authored."*

**So a full `VizRecording` of the failing morning exists on the screen, and four numbers are read out
of it before it is dropped.** Constraint 2 for this mode costs a renderer mount and a transport, not
a simulation.

> **`PM-FB1` — The case opens on the as-built run, played, before the four figures.**
> `GAMEPLAY_AND_NAVIGATION.md` § 10.1's order is complaint → schematic → figures → diagnosis. The
> amendment is one item: complaint → **the building, running** → schematic with the failing band →
> figures → diagnosis. The complaint already tells the player where to look (*"you can see the
> shuttles from the window — all eight of them, sat at the ground floor"*), so the watching has a
> subject from the first second, which is what a first-time player needs and what an unguided stage
> does not give them.

**The case authors have already written the shot list.** Of the eighteen shipped `symptom` strings,
**sixteen describe something that happens in a picture** — *"three cars stand together below"*, *"the
two bed cars pass the surgical floors without stopping"*, *"a landing crowd of hundreds, served one
carload at a time"*, *"two cars standing doors-open twenty-five seconds at every stop"*. Two carry a
raw figure instead (§ 1.2).

> **`PM-FB2` — A `symptom` string names a sight, not a figure**, and `fixit/parse.ts` enforces it in
> the shape it already enforces the other copy rules (no probability words, no engine identifier).
> The two cases that fail it are `zoning-starves-the-top` and `car-park-nobody-serves`; both have a
> sight available in their own diagnosis text. **The figure does not disappear — it is what the four
> figure cards are for**, one item further down the page, which is `PM2`'s ordering applied inside a
> screen rather than between screens.

**What the stage cannot show, and why that is fine here.** Three of those sixteen sentences describe
an *intent* rather than an event — a car passing without stopping, an express stopping below its
zone, a deck declining to board. § 3.2 records that a car's committed stop list is not on `FrameCar`
and that reading `VizShaft.motions` ahead of the playhead is `docs/28` § 4.4's refused foreshadowing.
**The stage shows what happened; the diagnosis panel says why.** That division is exactly why this
mode can afford to keep the diagnosis given.

### 7.3 What the player changes

Unchanged and already correct: four priced repairs, five inert standing extras, the full building
editor (elevation grid, zones, shafts, machinery at 6 u per half a metre per second and 8 u per two
places, **door dwell free**, where cars wait when idle, who drives), and a shaft at 34 u that is
unaffordable in **0 of 18** cases. `docs/33` § 5.2's measurement of the catalogue — 18 cases × 5
selections over 180 runs — is the record of what that choice is worth per case, and `DC-7` reorders
it.

### 7.4 How the player finds out whether they were right

Unchanged, and it is the model the rest of this document borrows from: two runs sharing the traffic
seed, three rows, four named outcomes, an 80 % categorical bar rather than a subtraction, and
`BASIS_LINE` printed under every result.

**One rule is added, because it is currently true by luck rather than by construction:**

> **`PM-FB3` — A repair may not patch `floorPopulations`.** `fixit/run.ts#fixitRunPlanOf` says
> *"everything the passenger trace is a function of — building id, seed, horizon, demand — comes off
> the case and is identical between the two"*, and that holds because both sides carry the `asBuilt`
> patch and **no shipped repair touches population**. `BuildingPatch.floorPopulations` exists and a
> repair could legally use it, at which point the two runs would meet different crowds and the whole
> basis would be gone silently. `fixit/parse.ts` refuses it, with the reason attached.

---

## 8. The three design choices this lane was asked to question

### 8.1 *"`garden-apartments` is deliberately easy, and that is the cause of #208 rather than a constraint around it. Is it the bug?"*

**Verdict: the instinct is right and the target is wrong. The easiness is not a bug. The slot is.**
And the reason is stronger than *the building is fine and the position is not* — it is that **the
building's own stated justification argues against putting it first.**

**First, a correction to the framing.** The prompt says verification *"treated the easiness as a
deliberate decision to be protected."* [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)
§ S does not: it concludes *"the building is correct; **putting it in the tutorial slot is what
produces the empty first session**"*, calls the fix *"a slot decision, not a data one"*, and lists
three candidates. § AA is the one that files #208 as *"arguing against a deliberate design decision"*
and routes it to the product owner. **That is where the word *deliberate* starts doing work it cannot
do**: a decision being deliberate is a fact about how it was taken, never an argument that it is
right. `CLAUDE.md`'s own working agreement is the same shape — *a phase is done when its stated
acceptance criteria pass, not when the code exists*.

**Second, the argument the contract makes against itself.** Contract `c1`'s brief reads: *"Nothing
here is hard — **it exists so the seven that follow have something to be different from**."* That is
a **contrastive** justification, and contrast has a precondition: the player has to still be holding
the first term when the second arrives. A day-one session in which nothing is observed leaves nothing
to be different **from**. The building is a perfectly good baseline for a reader comparing eight
contracts on a page, and a baseline nobody experienced is not a baseline a player can use. **The
stated reason for the easiness is a reason to place it second, not first.**

**Third, two measurements say the building cannot be rescued in place.** GitHub issue #270 swept
every legal axis — demand, demand shape, dispatcher, horizon — and found the knee at **25 %pop/5 min,
3.6× the declared max of 7**, with four of the five goal kinds constant across rates 3–30 % and
horizons 450–3 600 s; the fabric route (one car instead of two) makes two of stage 1's three editable
dials **inert**, breaks 78 tests in 32 files, and fails the correctness oracle's premise. § 9.3 below
measures the other half: at the shipped day-one configuration the landings are **empty about 91 % of
the time**, and on **16 of 20 seeds no moment exists at which anybody has been waiting sixty
seconds.**

**So the bug is `CONTRACTS[0]` and campaign stage 1, and `data/buildings/garden-apartments.json`
should not be touched** — its own file says so in capitals, it is two of the eight matrix cells,
three golden digests and two fix cases. #270's route 1 (a different tutorial building, authored to be
failable, with Garden left alone) and § 8.3's sequence are the two live options, and both are the
product owner's.

**One thing that is not settled and should be, because a shipped file already crosses the line the
argument rests on.** § S and `docs/33` `W1` both foreclose one route by saying that raising Garden's
rate past the residential profile's declared `max: 7` would invent a CIBSE-unsupported rate. The
fixit case **`gym-on-the-top-floor` runs `garden-apartments` at `arrivalRatePctPop5min: 9.5`**, and
`three-cars-one-cars-work` runs it at exactly `7`. Nothing validates a run's rate against the
profile's band — `traffic/generator.ts:757` treats `arrivalRatePctPop5min` as an override that
*"overrides every profile"*, and `TRAFFIC_PARAMETERS` declares its range as `[0, 25]`. **This is
reported as a finding rather than as an accusation**: a study override and a player-facing case are
plausibly different things, and the rate band is guidance for the `demandLevel` selector rather than
a schema bound. But the foreclosure is currently carried by a sentence in two documents and by
nothing in the code, and one shipped case sits outside it. **A decision is owed on whether the band
binds player-facing content, and if it does, `gym-on-the-top-floor` is out of compliance.**

### 8.2 *"The game gives numbers before symptoms. Should the first day be watched before it is scored?"*

**Verdict: agree, and the shipped defect is worse than the question implies — the day is graded
before it is *run*, not merely before it is read.**

`everyday/today.ts` draws *"How hard this looks: **Comfortable**. 60 people per working car today.
Comfortable is around 400"* on the brief. That is not a report arriving too early; it is a **verdict
about a run that has not happened**, and its yardstick is `COMFORTABLE_PER_CAR = 400`, which that
module's own docstring records as a **citation to the design prototype rather than a measurement**.
It fails `PM2` twice: a figure before the symptom, and a whole-day claim at `t = 0`.

**The honest objection, and the line that answers it.** A player dropped onto an unexplained stage
does not know what to look at, and orientation is a real need.
[`28-art-direction.md`](28-art-direction.md) § 4.3 has already drawn the line that resolves this, and
it is exactly the right one: **configuration may be drawn in full at `t = 0`; outcome may not be
drawn before `t` reaches it.** *Six floors, a hundred and twenty residents, two lifts* is the
building and is permitted. *Comfortable* is a claim about the day and is not. So the answer is not
*show less before the run* — it is *show the building before the run and the day after it*, which
loses no orientation at all.

`PM-TT1` is this verdict in rule form. It also gives `charter S1` its instrument: the criterion is
*a building in visible trouble within 90 s*, and a brief that says the building is comfortable is the
product actively spending those ninety seconds on the opposite claim.

### 8.3 *"Fix a building is the fourth tile and should arguably be the front door."*

**Verdict: partly disagree. #217's evidence about the mode is right; the conclusion drawn from it —
*make it the default entry point* — costs the mode the thing that makes it good.** A third option
gets what #217 wants and does not move a tile.

**What is right, and it is a lot.** Two prior playtests independently called its first case the best
moment in the product. `docs/23` § 4.1 disagreement 5 adds a structural reason #217 does not make:
Fix a building is **the only shipped mode whose fifth beat is reachable** — in two of the other three
the verdict exists and the player cannot navigate to it. And § 1 of this document confirms it is the
only mode that poses a problem at all.

**What the conclusion misses.** Fix a building's problem is *what to spend*, and a spending decision
is only a decision to somebody who knows what the options are. Its first screen offers four priced
repairs in a vocabulary — a shaft, door dwell, where idle cars wait, a zone redrawn by population —
that a first-time player has met **nowhere**, and by design offers no help telling them apart:
*"Nothing labels itself. The repair list does not mark which option is the diagnosed one."* The
handoff is right that the guess-the-fault quiz was a comprehension test in the wrong place; a priced
four-way choice over unfamiliar nouns, thirty seconds after first load, is the same test wearing a
price list.

**And the mode's own difficulty specification says the first case is where it is weakest.**
`docs/33` `DC-7` orders the catalogue by forgiveness, descending, and puts a **band-A** case first —
one where *three* of the offered repairs clear both bars and *"the case cannot be lost by choosing the
wrong repair."* That is correct pedagogy and it is an admission: the first case is deliberately the
one where the choice matters least. **A front door built on the case where the mode is least itself
is a strange front door.**

**The third option, and it settles four issues at once.**

> **`PM-DOOR` — The first-ever session is a *sequence*, not a tile: ninety seconds of the rush's
> climbing stream, then straight into a fix case.** The player watches a building lose — no
> vocabulary, no options, nothing to get wrong, the one thing in the product that satisfies
> constraint 2 for free (§ 6). Then a tenant writes in about a building, and now the four priced
> repairs are answers to a question the player has felt. The four-tile menu is untouched.
>
> | issue | what the sequence discharges |
> |---|---|
> | **#208** AC1, AC2 | a building visibly failing inside 90 s, legible on the stage before any report explains it — **without** making the tutorial building hard, which #270 measured as impossible |
> | **#210** | a guided first turn that teaches by playing rather than by reading, ending in a change and a verdict |
> | **#217** AC2 | Fix a building is the first thing the player actually *plays*, which is #217's substance |
> | **#220** | the climbing stream gets built, so the tile stops advertising a session that refuses |

**Two constraints it must satisfy, named rather than assumed.**

- **`charter` non-goal 10 — no entry-screen override that survives a reload.** A stored *seen the
  intro* flag is that override wearing `localStorage`, and [§ D335](../DECISIONS.md) and
  [§ D338](../DECISIONS.md) are explicit that a reload lands on the Everyday main menu whichever
  world the player was in. **The sequence must therefore be a cover over the menu rather than a
  destination instead of it** — `menuPanel.ts#coverShell`'s existing shape — and its condition must be
  **derived from state the player produced** (an empty week, no filed day) rather than stored as a
  flag. It is skippable, and skipping breaks nothing later, which is #210's AC3.
- **[§ D350](../DECISIONS.md) reserves the position question for the product owner.** `PM-DOOR` is
  offered as an argued option and is **not** a decision. What it claims is narrower and is worth
  separating: **whichever tile is first, the first ninety seconds should be a run rather than a
  menu**, and that claim is `PM2` rather than a positioning preference.

---

## 9. Is parking the right first lesson? — the comprehension question

The concurrent lane is measuring whether `idle.parkingStrategy` separates arms on
`garden-apartments`. **That is a different question from this one and its answer does not settle
this one.** A lesson can be statistically detectable and pedagogically unreachable, and § 9.3
measures that it is.

### 9.1 The case for parking, and it is strong

Four reasons, and they are the best case any candidate first lesson has:

1. **The product already believes it.** Three of eighteen fix cases are parking faults —
   `sleeping-sky-lobby`, `three-cars-one-cars-work`, `gym-on-the-top-floor` — and a fourth,
   `cars-that-always-go-home`, is the same family. `data/buildings/garden-apartments.json`'s own
   `$comment` says *"parking policy dominates here: traffic is sparse enough that idle car position
   matters more than assignment cleverness."*
2. **It needs no vocabulary at all.** The complaint text does the whole job: *"We are six floors with
   three lifts and I still watch all three sit downstairs together."* That sentence contains no
   lift-engineering word and states the entire problem. Compare a weight vector, which cannot be
   stated at all without teaching what a cost term is.
3. **It is spatial, and the stage is spatial.** A parking fault is a fact about *where things are*,
   which is the one thing a cutaway elevation is unambiguously good at.
4. **The fix is free, and that is the product's best lesson arriving first.** Both garden cases end
   on it: *"Nothing was bought: the cars were always enough, parked one letting out of date."* A
   first lesson that teaches *the answer was not more steel* is worth more than a first lesson that
   teaches a parameter.

### 9.2 The case against, and it is about seeing rather than about statistics

**A parking fault's symptom is an absence, and absences are the hardest thing on this list to draw.**

- **The thing that is wrong is what the building does when nothing is happening.** A player watching
  a busy stretch sees cars moving and doors cycling, which is the lift working. The fault is only
  legible in the quiet, which is the least eventful part of the picture.
- **It is a two-place symptom.** *Waits over a minute for a car up, while three cars stand together
  below* asks the player to hold two floors in mind at once and connect them, and on
  `vertical-city` the two places are three hundred metres apart on a 100-floor elevation.
- **And the decisive one: § 3.2 records that a parked car is not drawable.** `grep` for `park` or
  `idle` across `render/` and both stage screens returns nothing. An idle car is a stationary car
  with `direction === 0` and near-zero load — **pixel-identical to any empty car that happens to be
  stopped.** `PARK_CARS_LOBBY_LABEL` is a button whose press has no visual consequence of its own.
  **The product's most-used fault family has no mark on the stage.**

### 9.3 The measurement — what a player watching the tutorial building actually sees

**This is not the parking-arms measurement and does not overlap it.** It asks a question no lane has
asked: *at the shipped day-one configuration, how much of the run has anything at a landing to look
at?*

**Instrument.** `packages/core`'s own `runSimulation` over the shipped `garden-apartments`, dispatcher
`collective`, `durationS: 3600` (the contract's own authored hour), **no rate override** — the
residential profile's own `typical`. Waiting intervals are taken from the run's passenger records
under `packages/viz/src/frame/overlay.ts#isWaitingAt`'s exact predicate — half-open
`[arrivedAt, boardedAt)`, right-continuous, minus `refusedAt` — and occupancy is the **exact measure
of the interval union by sweep**, not a sample. 20 consecutive seeds, `20260810`–`20260829`, 827 legs.
**The harness was validated against the repository's own selectors**: at 4 001 instants per building
its count matched both `overlayAt(...).waitingNow` and `sum(queueAt(...).riders)` with a maximum
discrepancy of **0**.

| fraction of the hour with … | min | median | max |
|---|---|---|---|
| **at least one person waiting anywhere in the building** | 5.4 % | **9.0 %** | 16.3 % |
| at least three waiting | 0.6 % | 2.1 % | 6.5 % |
| at least five waiting | 0.0 % | 0.2 % | 2.5 % |
| **at least one person who has already waited 60 s** | 0.0 % | **0.0 %** | 0.4 % |
| time-averaged number of people waiting | 0.117 | **0.166** | 0.395 |

**Long-wait exposure is exactly zero on 16 of the 20 seeds.** Eight legs of 827 ever waited sixty
seconds or more. Unboarded legs: **zero, on every run.**

**Read the fourth row twice.** It is not that a thirty-second glance is likely to miss the bad
moment. **On sixteen of twenty first loads there is no bad moment to miss** — no instant in the whole
hour at which anybody in the building has been waiting a minute. The landings are empty about
**91 %** of the time and hold one person for most of the rest.

That corroborates § S from the other side. § S swept 100 seeds at the same configuration and found a
worst wait of 60 s or less on **91 of 100**; this sweep says the same fact as a fraction of the clock
rather than as a maximum, which is the form a question about *watching* needs.

**Contrast, with its caveat stated.** The same instrument on `midtown-office` under `collective` at
1 800 s and its own typical rate: at least one person waiting **91.3 %** of the run (median), at least
five waiting **86.4 %**, somebody past sixty seconds **82.8 %**, time-averaged queue **148.6**. **That
configuration is saturated on 20 of 20 seeds** — `awtIsValid === false`, verdict `diverging-queue` —
so it is an **upper bound on what a busy building looks like and not a model of a healthy one.** It is
quoted for the order of magnitude between the two buildings, which is roughly a factor of ten on
occupancy and *unbounded* on long-wait exposure, and for nothing else.

**Four caveats that bound every figure above.** Abandonment is **off** — no `sim.patience` was passed,
so nobody leaves and every occupancy figure is an over-estimate. No credential refusals — neither
building declares `accessZones`, so that term of the predicate is inert. `durationS: 3600` is a **2×
override of the `rise-and-fall` template's authored 30 minutes** and refits the shape's geometry, so
this is a sixty-minute rise-and-fall rather than thirty minutes of demand and an idle hour; it is the
shipped contract's own `shiftLengthS` and therefore the right thing to measure, but it is not the
template's own duration. And 20 seeds is a description of a distribution, not an interval — **no
claim above compares two configurations, so none is offered.**

### 9.4 Verdict

> **Parking is the right first *lesson* and the wrong first *symptom*, and `garden-apartments` is the
> wrong stage for either.**

Split into the three claims that make it up:

1. **As a lesson, parking is the best candidate in the product**, for § 9.1's four reasons, and
   nothing in § 9.3 touches that. *Where a car waits when it is doing nothing decides who waits* is
   statable in one sentence by somebody who has never thought about lifts, and it is true.
2. **As a symptom it is currently undrawable**, and that is a fact about `FrameCar` rather than about
   parking. This is the single highest-value entry in § 3.2's absent column, because it is the only
   one that blocks a *lesson the product has already committed to in four of its eighteen cases*.
3. **On this building the symptom does not exist to be drawn.** 91 % empty landings and no
   sixty-second wait at all on sixteen of twenty seeds is not a rendering problem.

**What follows, and it is buildable.** `PM3` says design the tableau rather than the incident, and a
parking fault has a genuinely good tableau available — **cars stopped low, people standing high, both
at once, both persistent.** Two of its three elements already draw. The third is one frame field:

> **`PM-PARK` — `FrameCar` gains an idle state, and the renderers mark it.** The mark is a state at
> `t`, so it is `docs/10` R6-clean by construction and needs no new figure. **Unverified**: whether
> `Simulation` can publish *idle* into the frame without ambiguity — a car stopped with its doors
> open at a landing is not idle, and a car repositioning under `repositionDecisionFor` is neither
> idle nor in service. **The check that settles it is naming the field on the simulation's own car
> state that already distinguishes them**, and if none exists this is a `core` change and should be
> priced as one rather than assumed. `dispatch/lifecycle.ts#parkingCandidates` and
> `#repositionDecisionFor` are where to look.

**And the ordering that follows for the game.** The parking lesson lands on the first building where
somebody is visibly standing while a car is visibly still — which the data says is
`sleeping-sky-lobby` on `vertical-city` (eight shuttles at the street, sky-lobby queues) or
`three-cars-one-cars-work` at 7 %pop/5 min, and is **not** `garden-apartments` on an ordinary day at
its own typical rate.

**That ordering has since been tested from the campaign's side and it held**, which is worth a
pointer because the two lanes measured different things and agreed.
[`33-difficulty-curve.md`](33-difficulty-curve.md) § 3.3e asks whether a campaign stage should
*start* on an authored point of its own search space — a starting setting that is deliberately
wrong, which is this section's tableau proposed as a game mechanic — and refuses it for stage 1 on
two independent grounds. The first is § 9.3's measurement above, unchanged. The second is a
structural one this document could not have found: an authored starting vector is either inside the
stage's `editable` list, in which case selecting the unedited base profile from the dropdown is a
one-click undo of the fault and the stage clears from the menu, or outside it, in which case
`campaign/dimensions.ts#admitProfile` refuses **all thirteen** shipped profiles and there is no menu.
Both horns are measured there. **The mechanism itself is not refused** — § 1.1's own exemplar
already ships it, and naming it as a mechanism is the useful half: `sleeping-sky-lobby`'s
`asBuilt.patch.dispatcher.idle.parkingStrategy: "lobby"` **is** a deliberately wrong dispatcher
parameter authored as the given state, which is exactly what the campaign was asking for and already
has a home.

---

## 10. Every code change this specification implies, listed and not built

**Nothing in this document is built.** The table is the whole cost, ordered by what it buys per unit
of work rather than by section. Every row names the rule that asks for it.

| # | rule | change | where | size |
|---|---|---|---|---|
| 1 | `PM-FB1` | Mount a stage over `session.asBuilt.recording` on the fix-case screen, above the four figures | `everyday/fixitScreen.ts` | **Small.** The recording already exists at `:343`; this is a renderer mount and a transport, not a simulation |
| 2 | `PM-TT1` | Move the *How hard this looks* plate off the pre-run position, or reword it as configuration | `everyday/today.ts` and its caller | **Small**, and it is a copy-and-ordering change rather than a deletion |
| 3 | `PM-TT5` | ~~A **provided ghost port** on `EverydayHost`~~ — **built 2026-09-05**, GitHub issue #226, [§ D482](../DECISIONS.md). `EverydayHost.ghostRace`/`raceAgainst`, the stage's picker, and `STAGE_NO_GHOST` deleted on the same commit with both register entries it was half of | `everyday/`, `live/raceStrip.ts`, `dev/main.ts` | Was **small–medium**; the wire was the work, and `dev/ghostRun.ts` is unchanged |
| 4 | `PM-FB3` | `fixit/parse.ts` refuses a repair patch carrying `floorPopulations`, with the reason attached | `fixit/parse.ts` | **Small.** One check; it protects the whole mode's basis |
| 5 | `PM5` | One shared **legs-identity assertion** — two runs agree on `(passengerId, arrivedAt, originFloorId, destinationFloorId)` and differ only on `boardedAt`, `alightedAt`, `carId` — used by the fixit pair, the intervention pair and the campaign works-night pair | a test helper under `packages/viz/src/` | **Small**, and it is the one row that makes three separate honesty claims checkable instead of argued |
| 6 | `PM-FB2` | `fixit/parse.ts` requires a `symptom` to name a sight rather than carry a raw figure, in the shape it already refuses probability words and engine identifiers. **Two `data/` corrections follow and belong to a content lane, not this rule** | `fixit/parse.ts`, then `data/fixit-cases.json` | **Small** code, **small** content |
| 7 | `PM-TT4` | `INTERVENTION_KINDS` gains `spread-cars`, writing `idle.parkingStrategy: 'zone-center'`; a label in `live/interventions.ts`; a row on the stage | `core/src/sim/types.ts`, `core/src/dispatch/lifecycle.ts`, `viz/src/live/interventions.ts`, `viz/src/everyday/stageScreenModel.ts` | **Medium.** A `core` change, on the `park-cars-lobby` precedent, which is exactly one union member and one branch |
| 8 | `PM-CA1`, `PM-CA3` | The day opens on the building with today's event visible in it; a works-night purchase changes the picture as well as the purse | `everyday/`, and **after** GitHub issue #181's wiring | **Medium**, and #181 is the precondition rather than part of it |
| 9 | `PM-CA4` | Once the shop reaches a run, sweep every item against a no-purchase control on the same seed; an item that moves no leg is removed or given the sentence that says so — `docs/33` `DC-9`'s rule, at campaign scale | `campaign/`, a test | **Medium** |
| 10 | `PM-RU2` | A climbing demand template, authored in `data/traffic-profiles.json` with its own uncited-assumption note where the rate leaves the profile's cited band | `data/traffic-profiles.json` | **Medium**, and it is `CLAUDE.md` invariant 7 work rather than engine work — **conditional on § 11's unverified item 3** |
| 11 | `PM-RU1`, `PM-RU3` | The rush's held-time stage, the `Call it` press, and a result screen that publishes the divergence point from `summary.saturation` — never from a second definition — with its across-seed spread measured first | `everyday/rushScreen*.ts`, a measurement | **Large.** This is GitHub issue #220's whole scope |
| 12 | `PM-PARK` | An idle state on `FrameCar`, and a mark for it on both renderers | `viz/src/contract/types.ts`, both stages, **possibly** `core` | **Large or medium** — see § 11's unverified item 4. It is the highest-value entry in § 3.2 |
| 13 | `PM-TT2` | A legibility arm on the difficulty sweep: for each contract's day 1, the fraction of seeds holding a third-band landing for 120 contiguous seconds | `docs/33` § 6's instrument | **Medium**, and it is the only way `PM-TT2` stops being an assertion |
| 14 | `PM-DOOR` | The first-run sequence as a **cover** over the Everyday menu, conditioned on derived state rather than a stored flag, skippable | `everyday/`, `menuPanel.ts#coverShell`'s shape | **Large**, and **blocked on a product-owner decision** ([§ D350](../DECISIONS.md), `charter` non-goal 10) |

**Two obligations every row above inherits and none of them restates.**

- **A surface that renders strings and is absent from `honesty/surfaces.ts` is not finished.** Every
  new screen, control label, refusal and result row in this document enters the corpus in the same
  change that draws it, and the figures in [`CLAUDE.md`](../CLAUDE.md)'s Phase 9 row are re-measured
  **once, after integration**, never per branch.
- **`charter P4`'s refusal test applies to every control added here**: *move the control and require
  the run to change, compared on the legs rather than on a window statistic.* Row 7 and row 9 are the
  two most likely to fail it, and row 5 is the shared instrument.

---

## 11. What is measured, what is read off the code, and what is not

### Measured in this document

**One thing, in § 9.3.** Landing occupancy on `garden-apartments` at the shipped day-one
configuration over 20 consecutive seeds, with `midtown-office` as a bounded contrast. The instrument
is named, the harness was cross-checked against the repository's own `overlayAt` and `queueAt` at
4 001 instants with a maximum discrepancy of 0, and four caveats bound it. **No claim in it compares
two configurations, so no interval is offered and none is required.**

### Read off the code, and re-checkable by grep

`fixitScreen.ts:343` running the as-built recording at case open · `fixit/run.ts#figureValuesOf`'s
*"computed from the as-built run, never authored"* · `INTERVENTION_KINDS`' three arms and
`live/interventions.ts`'s labels, stamp and recomputing beat · `everyday/stageScreenModel.ts:572`
mounting the intervention row · `STAGE_NO_GHOST` and its stated reason · `PARKING_STRATEGIES`' five
values and `dispatch/lifecycle.ts#parkingCandidates`' branches · `GroupLevers`' three fields ·
`RULE_ACTION_WORDS`' eight verbs including `spread-out` · `drawFloors`' lit window band driven by
`recording.floors[].population` · the absence of any `park`/`idle` reference in `render/` or either
stage screen · `FrameCar`'s ten fields and the absence of a stop list · `VizLeg`'s fields and the
absence of `abandonedAt` · the two of eighteen `symptom` strings carrying a raw figure ·
`gym-on-the-top-floor`'s `arrivalRatePctPop5min: 9.5` against the residential profile's `max: 7` ·
`traffic/generator.ts:757`'s override semantics and `TRAFFIC_PARAMETERS`' `[0, 25]` range.

### Unverified — nine, each with the check that would settle it

1. **Whether the simulation removes an abandoning rider** while the viewer keeps drawing them. `VizLeg`
   has no `abandonedAt` and `isWaitingAt` removes only on `boardedAt`/`refusedAt`; the Day report
   nonetheless publishes `TOOK THE STAIRS`. *Check:* run a building with `sim.patience.distribution`
   set and assert `queueAt` past the horizon does not still hold a leg the report counts as abandoned.
   **If it fails, this is a player-facing honesty defect and owes an issue rather than a design rule.**
2. **Whether the lit window band is legible at Casual row pitches**, and therefore whether growth has a
   usable antecedent there. *Check:* `docs/28` § 5.1's geometry against `garden-apartments` and
   `vertical-city`.
3. **Whether `DemandTemplate.phases` alone expresses a monotone ramp of arbitrary length**, or whether
   intensity is renormalised over `durationMin` in a way that caps it. *Check:*
   `traffic/generator.ts:757` and `config/demandPhases.ts`. **Row 10 of § 10 is conditional on this.**
4. **Whether `Simulation` can publish an unambiguous *idle* state into the frame.** A car stopped with
   its doors open is not idle; a car repositioning is neither idle nor in service. *Check:* name the
   field on the simulation's own car state that already distinguishes them —
   `dispatch/lifecycle.ts#repositionDecisionFor` is where to look. **If none exists, `PM-PARK` is a
   `core` change and must be priced as one.**
5. **Whether 120 contiguous seconds is the right legibility window** in `PM-TT2`. It is a design choice
   with its reasoning attached and **not** a citation. *Check:* § 10 row 13's sweep arm, and a
   playtest.
6. **Whether each of the sixteen sight-shaped `symptom` strings is legible at the sizes the stage
   actually draws.** Capsules are 4.5 px on a 6.5 px pitch. *Check:* `docs/28` `AD-S7` and `AD-S8`
   landing first, then a playtest.
7. **Whether a pressed and an unpressed day preserve the passenger trace.** The reasoning is sound —
   `interventions[]` reaches dispatch and not generation — and it is **stated as a required assertion
   rather than as a verified fact**, which is § 10 row 5.
8. **Whether every campaign shop item would move a leg once #181's wiring lands.** *Check:* § 10 row 9.
9. **Whether the residential profile's declared rate band binds player-facing content.** The code fact
   is verified (nothing validates it, and one shipped case sits outside it); what is unresolved is
   whether it *should*. **This is a decision owed rather than a measurement owed** — § 12 `Q1`.

---

## 12. Limitations, and what is open

### Limitations

- **Not one comprehension claim in this document has been tested on a human.** Constraint 3 —
  *could someone who has never thought about elevators state the problem after thirty seconds?* — is
  answered here by argument. [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)
  § AA is blunt about why: **no lane can produce a first-time tester**, and M2's remaining path is a
  human one. [`30-playtest-programme.md`](30-playtest-programme.md) is the protocol; every judgement
  in §§ 8 and 9.1–9.2 is a hypothesis for it.
- **§ 9.3 measures one building at one configuration.** Twenty seeds, abandonment off, and a duration
  that is the contract's own but twice the template's authored one. It is a description of a
  distribution and nothing in it is an interval.
- **The palette in § 3 is an inventory of two renderers**, not of every screen. A symptom drawn
  somewhere this document did not look would be missing from it.
- **§ 6's rush mechanic has never been played.** *Call it* is a design proposal whose appeal is
  asserted; it is the least evidenced thing here and it is deliberately the cheapest to abandon,
  because it rides on an engine (#220) that is wanted independently of it.
- **This document specifies and does not build.** Every row of § 10 is unwritten.

### Open questions

| | question | who owns it |
|---|---|---|
| **Q1** | Does a traffic profile's declared `arrivalRatePctPop5min` band bind **player-facing content**, or only the `demandLevel` selector? Nothing in the code enforces either reading, two documents assume the strict one, and `gym-on-the-top-floor` ships outside it | product owner, with `CLAUDE.md` § *Reference data* |
| **Q2** | Does `PM-DOOR`'s first-run **cover**, conditioned on derived state rather than a stored flag, satisfy `charter` non-goal 10? The intent is clearly met; the letter needs whoever owns [§ D335](../DECISIONS.md) to say so | product owner |
| **Q3** | Is Endless rush cut, demoted to the bench (`docs/32` `GD4`), or placed at minute one (`PM-RU1`)? Three arguments now exist and none is a decision | product owner |
| **Q4** | Which building carries the first session, given that `garden-apartments` cannot (#270, § 9.3)? #270's route 1, `dev/defaults.ts`' already-measured preference for `chancery-house`, and `PM-DOOR` are the three candidates | product owner |
| **Q5** | Is `PM-PARK` a `viz` change or a `core` one? § 11's unverified item 4 decides it, and the answer changes § 10 row 12's size | whoever picks up row 12 |

---

## Sources

- [`22-charter.md`](22-charter.md) — pillars `P1`–`P5`, non-goals 1–10, criteria `S1`–`S10`
- [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — the five beats, the per-mode
  declaration, § 6's honest register
- [`32-game-design.md`](32-game-design.md) — `GD1`–`GD20`, the mode table, failure, the economy
- [`33-difficulty-curve.md`](33-difficulty-curve.md) — `DC-R1`–`DC-R3`, `DC-1`–`DC-9`, and the
  measurements behind them
- [`28-art-direction.md`](28-art-direction.md) — `charter P3`'s ceiling, the stage's four channels,
  `AD-S7`–`AD-S10`
- [`10-experience-layer-contract.md`](10-experience-layer-contract.md) — `R1`–`R13`, § 5.5's
  never-build list, `U4`'s queue selector
- [`16-change-scope-contract.md`](16-change-scope-contract.md) — there is no mid-day change
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) — § S, § AA
- [`DECISIONS.md`](../DECISIONS.md) — § D227, § D299, § D310, § D311, § D335, § D338, § D345, § D350
- `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 10, `ENGINE_CONTRACT.md` § 9
- GitHub issues #181, #208, #210, #217, #220, #270
