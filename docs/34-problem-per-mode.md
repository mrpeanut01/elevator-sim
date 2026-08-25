# 34 — A problem per mode

**A decision number is owed for this document. Next free is D361; it is allocated at integration.**

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
   and gets `PM1`–`PM7`. A third series inside `docs/32` would be the `S1`–`S10` collision
   [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 8 already records, manufactured
   on purpose.
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
> `everyday/stageScreenModel.ts#STAGE_NO_GHOST` already uses — *"no rival lane — a ghost is a second
> run of the same crowd, and this screen cannot ask for one yet."* This is `charter` non-goal 5 and
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
has not happened yet. `everyday/stageScreenModel.ts:572` mounts it. `INTERVENTION_KINDS` in
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

### 4.5 The one thing this mode needs and does not have

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

**And today the mode poses none of it**, for the reason GitHub issue #181 records in four verified
breaks: closing a day records nothing, the wear clock is frozen at zero, the `build` select writes a
field no run reads, and — the one that matters here — **nothing bought reaches a run.** `fittedLevel`
and `bookedLevel` are display-only; `host.runCampaignDay` writes `buildingId` and `dispatcherId` and
nothing else. A player books faster doors, watches the purse fall, and runs a day identical to the
one before it.

> **The design verdict is that Campaign's problem is the right problem and its wiring is absent.**
> Nothing below asks for a new mechanic. It asks for the shop to reach the run (#181), and then for
> three things the mode does not have even once it does.

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

> **`PM-CA3` — A works night is watched, not just paid for.** The purchase that reaches the run
> (#181) reaches the *picture* too: a shaft bought is a well that appears, a car derated is a car
> that moves differently, a service window is a shaft that goes dashed for a day. Every one of those
> is in § 3.1's palette. **A purchase whose only visible consequence is the purse falling is the
> economy this mode already has.**

### 5.3 What the player changes

| | control | writes | shipped? |
|---|---|---|---|
| Works night | the shop — fittings, shafts, doors, destination panels | **Nothing today.** #181 break 3 | **No** |
| Career | difficulty tier | the purse `16 / 8 / 5 / 3`, the rate ladder, the miss allowance `6 / 3 / 1 / 0` — **stakes, never a bar**, per [§ D345](../DECISIONS.md) | Yes |
| Day | dispatcher, the three group levers, the pattern rows | `SimulationConfig.dispatcherProfile`, `GroupLevers`, `authoring/patternSpec.ts#PATTERN_ROWS` | Yes |
| Stage | the shipped interventions | `interventions[]` | Yes |

> **`PM-CA4` — The shop needs `PM-b`, and the moment #181 lands is the moment it becomes possible to
> get wrong.** Fix a building's five standing extras carry **no patch at all** and exist *so the
> budget can be spent badly*; `docs/33` `DC-9` requires that a repair be inert only where the case
> **declares** it inert, asserted on the legs in both directions. Campaign's shop has the opposite
> problem today — every item is inert and none of them says so, which is
> [§ D219](../DECISIONS.md)'s defect at the scale of a mode's whole economy, as #181 itself puts it.
> **So the rule arrives with the wiring:** once the shop reaches a run, every item is swept against a
> no-purchase control on the same seed, and an item that moves no leg is either removed or given the
> sentence that says so. An item that is *defensible and useless* is good design; an item that is
> silently useless is the thing this repository has recorded eleven times.

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
