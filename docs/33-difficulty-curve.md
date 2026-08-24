# The difficulty curve

**What the player is expected to understand at each point of the product, what pressure produces that
understanding, and what has to go wrong for the lesson to land.** Written to GitHub issue **#200**,
which is the brief, and bounded by [§ D345](../DECISIONS.md), which is the rule.

## 0. What this document is, and what it is written against

### 0.1 Why it exists in the first code milestone

#200 was deferred to before M4. [§ D348](../DECISIONS.md) lifted that deferral and pulled it into
**M2**, because #208 — a P0 in M2 — says of itself that *"the difficulty specification governs it"*,
and a P0 cannot be governed by a document scheduled after the milestone it sits in. **#208 does not
start until this lands.** That shapes what is here: this document is complete over the three surfaces
#200's AC1 names and it is deliberately not exhaustive over everything difficulty could mean.

### 0.2 It is written against the post-§ D345 world, and that is not a detail

[§ D345](../DECISIONS.md) amended `charter` non-goal 6. Of the four axes
`packages/viz/src/campaign/economy.ts`'s `DIFFICULTIES` moves today, three are permitted and one is
forbidden:

| axis | shipped example | verdict |
|---|---|---|
| `rates` | `[6,7,8,9]` on Easy vs `[3,4,5,6]` on Standard | **allowed** — demand |
| `purse` | 16 units vs 8 | **allowed** — a stake |
| `miss` | 6 missed days vs 3 | **allowed** — a stake |
| `tests` | `worstS: 240` on Easy vs `180` on Standard | **FORBIDDEN** — a fudge factor on a metric |

§ D345 obliges `tests` to stop varying by difficulty: **one bar per stage, whatever tier is
selected.** That fix has not landed yet. **Every clause below is written against the world in which
it has**, and says so wherever the difference is visible, because a curve specified against the
current code would bake in the thing § D345 forbids and would then have to be re-specified by the
lane that removes it.

§ 1.4 says concretely where the single bar comes from, because *"one bar per stage"* is a constraint
and not yet an address.

### 0.3 The non-goal this document restates rather than reinterprets

> **Difficulty is demand and building fabric. It is never a fudge factor on a metric.**

`charter` non-goal 6, as amended. Its mechanical test travels with it and is the only test that
matters when a proposal is arguable: **take a run and a difficulty, and ask whether changing the
difficulty changes any figure or verdict the run produces. If it does, it is forbidden.**

### 0.4 What this document decides, and what it does not

**Decides.** What each campaign stage, each week and each fix case is *for*; the rule that makes a
teaching claim falsifiable; the rule on dispatcher-dropdown clears and the vacuity guard it needs;
where the single post-§ D345 bar comes from; and the sweep that measures all of it.

**Does not decide.** Which building opens the product — that is #208's, and this document governs it
rather than answering it. Nor the *values* in `data/scenario-goals.json`: § D345 sequences that
regeneration with **#255** and **#234**, and a third proposal for the same table from here would be
the regeneration happening three times that § D345 exists to prevent.

### 0.5 Correction note — the brief's own central figure did not survive measurement

#200 asserts *"four of ten stages clear from the dispatcher dropdown alone."* Measured on this tree,
over all ten stages and all thirteen shipped profiles at the stages' own seeds: **three of ten** —
stage 3, stage 5 and stage 7. The measurement, the instrument and the three other claims it moved are
§ 3.1. Everything below is written against **three**.

---

## 1. The two substrates, and the test that separates them

### 1.1 DC-R1 — difficulty is made of exactly two things

A difficulty change may move **declared traffic parameters** and **building fabric**, and nothing
else.

| substrate | what may move | where it is declared |
|---|---|---|
| Demand | arrival rate, directional split, group size, inter-day variability | [`docs/14-building-behaviour-contract.md`](14-building-behaviour-contract.md) §§ 2.1–2.3; `data/traffic-profiles.json` |
| Demand | demand template — which shape the day has (`rise-and-fall`, `lunch-two-way`, …) | `data/traffic-profiles.json → demandTemplates` |
| Demand | lift-lobby crowding — boarding slows as the queue deepens | `docs/14` § 3.2 |
| Fabric | floors, shafts, speed, capacity, population, service zoning, access zoning | `data/buildings/`, [`docs/04-test-buildings.md`](04-test-buildings.md) |
| Fabric | availability — a car out of service, a bank derated | `packages/viz/src/shift/incidents.ts`, `packages/viz/src/shift/events.ts` |
| Fabric | population growth over a contract | `packages/viz/src/shift/growth.ts` |

Two constraints ride on that table and are not negotiable here.

**A rate must stay inside its profile's declared range.** `data/traffic-profiles.json` declares a
`max` per profile — the residential profile's is `7` — and a difficulty setting that exceeded it
would be inventing a CIBSE-unsupported arrival rate, which `CLAUDE.md` § Reference data forbids and
which `data/buildings/garden-apartments.json` refuses in capitals on its own face.

**Growth is applied to the building, not to the header.** `shift/growth.ts` edits a real
`BuildingConfig` and puts it back through `parseBuilding` and `resolveBuilding`; its own docstring
says why, and the reason is this repository's standing requirement — *"a growth factor that only
reached the tenant count in the header would be a dead seam, and it would be a lying one."* Any new
difficulty mechanism inherits that: **it edits the thing the simulation reads, or it does not exist.**

### 1.2 DC-R2 — stakes are a separate axis and are not difficulty

The purse, the miss allowance and what ends a contract are **stakes**. They may vary with the tier.
They never touch a figure the simulator publishes: a player on Easy and a player on Standard who post
the same run read the same numbers and receive the same verdict, and only what it costs them differs.

Stakes are therefore **outside this document's curve**. A stage that is too easy is not fixed by
making a miss cost more, and this document will not accept that as a curve change.

### 1.3 DC-R3 — no dial that buys difficulty by deleting evidence

Restated from `docs/32-game-design.md` GD20 and binding here: **difficulty may not be raised by a
dial that suppresses a figure.**

The instance that makes it concrete: abandonment *improves* AWT by construction, because it removes
the longest waits from the sample — at `midtown-office` 6 % with a 120 s mean patience the mean goes
61.9 s → 23.3 s with fifty-one riders gone — and an abandonment rate above 2 % suppresses the mean
outright, the fifth of `CLAUDE.md`'s five `awtIsValid` grounds. A difficulty setting that raised
patience-driven abandonment would make the product **say less** about the run, which is the
refusal test failing rather than the difficulty rising.

**Crowding is the preferred non-linear dial** precisely because it makes the run harder without
removing anybody from the sample. Patience is legitimate as a **building property** — a hotel's guests
and a hospital's visitors are not equally patient — and illegitimate as a **difficulty knob**.

### 1.4 Where the single bar comes from once `tests` stops varying

§ D345 requires one bar per stage whatever tier is selected. It does not say which bar. **This
document specifies it: the career campaign's day tests are read from the daily loop's own day-indexed
ladder, `packages/viz/src/shift/goals.ts#goalsForDay`, and `Difficulty.tests` is deleted rather than
frozen at one tier's row.**

Three reasons, in the order they decide it.

1. **The daily loop already solved this exact problem, and solved it the way § D345 asks.**
   `goalsForDay(day)` is a function of the day and of nothing else. Its own docstring says the
   worst-wait ladder is *bracketed by the handoff's difficulty table* — it opens just under Easy at
   `240 − 10 = 230 s` on day 1, hardens 10 s a day, and floors at Hard's `150 s`. **The four tiers
   were already converted into a day ramp there.** Doing it a second way in the career campaign
   would be two answers to one question.
2. **The two already share a grading rule and a type.** `everyday/campaignModel.ts#campaignTestGoals`
   returns `ShiftGoal`s so that `shift/goals.ts#readGoal` grades them and `#wasDisplayOf` supplies
   the *was* column — *"one grading rule for the daily loop and the campaign, rather than a second
   opinion here about what met means."* Its bars being the tier's is the only part that is not
   already shared.
3. **Freezing at a tier's row would be a silent difficulty change in both directions** — it makes
   Easy harder and Hard easier without anybody choosing that — whereas a day ramp is a curve, which
   is what this document is for.

**Alternatives considered.** (a) Freeze `tests` at Standard's row. Simplest, and rejected for reason
3. (b) Author a bar set per contract, so a bar moves with the building rather than with the day. This
is `docs/32` § 9's open question **Q6** and is the more interesting answer — *a bar that moves with a
setting and a bar that moves with a building are different games* — and it is rejected **for now**,
not on merit: it needs a per-contract measurement over eight buildings that nobody has taken, and it
can be adopted later without re-specifying anything above, because the address changes and the rule
does not. (c) This.

**One consequence to state, so the lane that lands it is not surprised.** The trip-budget row
(`tests.trips`) is **ungraded today** — `campaignModel.ts#TRIPS_REFUSAL` says the run records how many
people were carried and how long they stood, and not how many loaded departures the machines made. It
therefore has no `goalsForDay` counterpart and no measurement behind it. It is a **stake-shaped row on
a difficulty-shaped screen**, and the honest disposition is to keep it varying with the tier *only if*
it stays ungraded, since an ungraded row moves no verdict. **If it is ever graded, it falls under
DC-R1 immediately and must stop varying by tier.** That conditional is the whole of what this document
says about it.

### 1.5 A finding about § D345's own sequencing note, reported and not acted on

§ D345 sequences the `tests` fix with **#255** and **#234**, *"all three of which move
`data/scenario-goals.json`"*. The first half is right and the parenthesis is not:
`DIFFICULTIES.tests` lives in `packages/viz/src/campaign/economy.ts` and is read by
`packages/viz/src/everyday/campaignModel.ts`. `data/scenario-goals.json` is the **stage** campaign's
published goal table, and **no difficulty tier touches it** — `economy.ts`'s own docstring says the
two campaigns *"share a word and nothing else."* So the `tests` fix is a code change in two viewer
modules, and the collision § D345 wants to avoid is between #255 and #234 alone.

The sequencing advice still stands on its merits: doing all three together is one regeneration rather
than three. **Recorded here rather than corrected there**, because `DECISIONS.md` is not this lane's
to edit.

---

## 2. What a stage owes the player

### 2.1 The three things every stage names

Every stage in every mode names three things, and a stage that cannot fill all three columns is not
specified:

| | what it is | how it fails |
|---|---|---|
| **Lesson** | the one thing the player should be able to say afterwards, in their own words | a lesson nobody can state in a sentence is two lessons |
| **Pressure** | the declared demand and fabric that make the lesson unavoidable | pressure that is not demand or fabric is a fudge factor (DC-R1) |
| **Failure mode** | what visibly goes wrong when the player does the obvious thing | a stage where nothing goes wrong teaches nothing |

The third column is the one that does work. A lesson is a claim about the player's head; a failure
mode is a claim about a run, and a claim about a run can be measured.

### 2.2 DC-1 — the teaching rule, in testable form

> **Every stage must fail at least one goal under at least one plausible player choice.**

That is #200's sentence. Its testable form needs *plausible player choice* to be a set rather than an
adjective, so:

**A plausible player choice is a member of the stage's own admitted move set.** For a campaign stage
that is the shipped dispatcher profiles `campaign/dimensions.ts#admitProfile` admits given the
stage's `editable` list. For a week day it is the shipped default configuration at the day's own
seeds. For a fix case it is any single offered repair, or none.

> **DC-1.** For every stage `s`: `∃ m ∈ moves(s)` such that at least one **non-comparative** goal is
> **not met**.

Red when a stage clears every non-comparative goal under every plausible move. Note the direction:
DC-1 is about the **existence of a failure**, and a hard stage satisfies it trivially. It exists to
catch the gentle end.

**The word *non-comparative* is the whole of DC-1's teeth, and the first draft of this rule did not
have it.** A campaign stage's goals are of two kinds: count goals that read the run's own numbers
(`answer-the-demand`, `long-waits-under`, `deliver-everyone`, `nobody-abandoned`, `no-divergence`) and
`beat-the-baseline`, which compares the player's arm with the stage's own starting profile.
**`beat-the-baseline` is unmet on the control arm at all ten shipped stages by construction** — that
is § D161's *"standing still clears nothing"*, and it is correct — so a DC-1 written over *any* goal
is satisfied at every stage by the player changing nothing. It would be a rule that could not fail.
Measured over the ten shipped stages, the two forms disagree on **three** of them, which is § 3.1.

### 2.3 DC-2 — the dropdown rule, and the vacuity guard it needs

> **No stage may clear from the dispatcher dropdown alone.**

#200's AC3. Its testable form:

> **DC-2.** For every campaign stage `s`: `∀ p ∈ admitted(s)` — the shipped dispatcher profiles the
> stage admits — `judgeStage(...).cleared === false`.

**DC-2 without a companion is satisfied by having no dropdown**, and three shipped stages satisfy it
that way today: stages 8 and 10 admit **exactly one** profile — the stage's own baseline, the
identical control — and stage 9 admits two, one of which is that control. On those stages the player
cannot make a dropdown move at all, so the rule passes while saying nothing. That is the shape of a
gate that has stopped measuring, and it needs its own clause:

> **DC-2b.** For every campaign stage `s`: `admitted(s)` must contain **at least two** profiles other
> than the stage's own baseline — two shipped dispatchers that actually differ from its own starting
> profile — so that DC-2 is a statement about difficulty rather than about the size of a list.

DC-2b is **not** a difficulty change and does not fall under DC-R1: widening a stage's `editable`
list changes what the stage *offers*, not what the building faces. It is a scope decision, and the
stage's own `teaches` line decides how wide it should be — stage 1 opens three dimensions on purpose
and passes DC-2b with exactly two real profiles, which is the intended shape.

### 2.4 DC-3 — the winnability rule, which is what stops DC-2 from being cruelty

DC-2 forbids the dropdown from clearing a stage. On its own it permits a campaign nothing can win,
which teaches exactly as little as one that clears itself. So DC-2 travels with:

> **DC-3.** For every campaign stage `s` there exists an **edited weight vector**, inside the
> dimensions `s` declares editable, that clears every goal. Each stage names one such vector — its
> **witness** — and the sweep runs the witness and requires the clear.

That is not a new mechanism. It is `docs/10-experience-layer-contract.md` § 11 **W6**, the player move
the campaign panel already supports, and the apparatus exists: `campaign/campaign.test.ts` carries an
authored `EditedVector` for stage 2 and plays it through the shipped `batchRequestForStage`.

**Where the witnesses live.** In `data/`, as a new file — one entry per stage, each an
`EditedVector` — for `CLAUDE.md` invariant 7's reason: a witness vector is tunable data and would be
a hand-written list in a test file otherwise, which is the shape `src/index.test.ts` had to fix in
`experiments`. Its only reader is the sweep, and **that is declared here rather than discovered
later**: the sweep is #200 AC4's deliverable, so a registry whose non-test caller is the sweep is the
instrument working as specified and not the standing requirement's dead seam.

**Where a witness does not exist yet.** The stage is entered in the sweep's `OUTSTANDING` register
with the reason, on `honesty.test.ts`'s precedent, and **the register is checked in both
directions**: a stage in the register must actually have no clearing witness, and a stage with a
witness may not be in it. A register that can only grow is decoration.

**On which seeds the witness must clear, and the finding that forces the question.** DC-3 asks for a
clear on the stage's **own judged seeds**, because that is what the product judges and therefore what
*winnable* means to a player. It does **not** ask for a clear on the holdout set, and that is not a
softening — it is a refusal to specify something the shipped campaign cannot deliver, stated with the
measurement attached:

> **DC-3b.** Each witness's behaviour on the stage's **holdout** seed set is recorded beside it and
> is not required to clear. A witness that clears on the tuning seeds and is beaten on the holdout is
> registered as exactly that.

The one witness that exists is that case. `campaign.test.ts` plays stage 2's authored vector and
pins **both halves**: it clears on the tuning seeds, and on the stage's declared holdout seeds the
same vector is **beaten by the shipped setting on three measures** and `beat-the-baseline` resolves
against it — with a sensitivity that says what it is, since `2.2`, `2.25` and `2.3` clear and `2.35`
does not. That suite states the consequence in its own words: *"the campaign judges on the tuning
seeds, so a live weight editor makes overfitting them the dominant strategy, and nothing in the
shipped surface says so."*

**That is a finding about the campaign's difficulty rather than about one vector**, and it is this
document's § 7 **O7**. A curve whose intended solution is *tune until the judged seeds clear* is a
curve with a shortcut in it, and the shortcut is invisible to every rule above, because every rule
above judges on the same seeds the player tunes against. DC-3b makes the shortcut visible in the
register; it does not close it.

### 2.5 Why the three rules together are the closed form

DC-2 alone permits an unwinnable campaign. DC-3 alone permits a campaign the dropdown solves. DC-1
alone permits both. Together they say: **something must go wrong, the easy move must not fix it, and a
real move must.** That is the whole of what #200 asks for, and each third of it is red on its own
condition.

DC-2b and DC-3b are not further rules: DC-2b guards DC-2's *measurement*, and DC-3b guards DC-3's
*honesty*. Neither adds an obligation the campaign has to satisfy — they stop the other three from
passing on a technicality.

---

## 3. The campaign — ten stages

### 3.1 The measurement, and the four claims it moved

**Instrument.** For each of the ten stages in `data/campaign.json`, `admitProfile` was run over all
**thirteen** shipped profiles in `data/dispatcher-profiles.json`; every admitted profile was played
through the shipped `campaign/stageRun.ts#batchRequestForStage` — two arms, the stage's own tuning
seeds, 50 replications, common random numbers — and judged by the shipped
`campaign/judge.ts#judgeStage`. 130 stage-profile cells, 77 of them admitted and run.

**Result: three of ten stages clear from the dispatcher dropdown alone.**

| stage | building | admitted | of which the control | clears from the dropdown |
|---|---|---|---|---|
| 1 `stage-1-first-call` | `garden-apartments` | 3 | 1 | — |
| 2 `stage-2-morning-rush` | `midtown-office` | 5 | 1 | — |
| 3 `stage-3-overwhelmed` | `midtown-office` | 5 | 1 | **`fairness-first`** |
| 4 `stage-4-two-banks` | `mixed-use-high-rise` | 8 | 1 | — |
| 5 `stage-5-credentials` | `secure-tower` | 5 | 1 | **`eta`** |
| 6 `stage-6-the-tall-one` | `vertical-city` | 12 | 1 | — |
| 7 `stage-7-prove-it` | `midtown-office` | 13 | 1 | **`destination-panel`** |
| 8 `stage-8-the-headline-address` | `chancery-house` | 1 | 1 | — |
| 9 `stage-9-both-ways-at-once` | `crown-hotel` | 2 | 1 | — |
| 10 `stage-10-the-bed-and-the-visitor` | `st-jude-hospital` | 1 | 1 | — |

Read against §§ 2.2–2.4, the same 130 cells give the three rules directly:

| rule | stages that hold | stages that fail |
|---|---|---|
| **DC-1** — some admitted profile fails a non-comparative goal | 1–7 | **8, 9, 10** |
| **DC-2** — no admitted profile clears the stage | 1, 2, 4, 6, 8, 9, 10 | **3, 5, 7** |
| **DC-2b** — at least two admitted profiles differ from the baseline | 1–7 | **8, 9, 10** |
| **DC-3** — a witness edited vector clears the stage on its judged seeds | 2 (`campaign.test.ts` carries one, and it is **beaten on the holdout** — DC-3b) | **the other nine have none registered** |

**DC-1 and DC-2b fail on the same three stages**, which is not a coincidence and is the whole reason
DC-2b exists: stages 8 and 10 admit only their own baseline and stage 9 admits one other profile, so
on those three the dropdown can neither break the stage nor clear it.

Four claims in the tree did not survive that run, and each is written down rather than quietly
superseded:

1. **#200's *"four of ten"* is wrong.** It is three. #200 inherited the figure rather than measuring
   it, and its real home is `docs/10-experience-layer-contract.md:1680-1694`, where it says four of
   ***seven*** — a denominator the campaign left behind when it grew to ten.
2. **`docs/10`'s correction is itself stale.** `docs/10:1683-1691` says *"That count is now four …
   Stage 6 clears under `destination-eta` and under `destination-panel`"*. **Stage 6 clears under
   nothing**, over all thirteen profiles. `campaign/campaign.test.ts` has already inverted its own
   stage-6 case and pins the negative; `docs/10` was never re-read against it.
3. **Stage 5's clearer has moved.** § D161 and `docs/10` name `destination-eta`; the measured clearer
   is **`eta`**, and `destination-eta` does **not** clear. `campaign.test.ts`'s stage-5 case survives
   this untouched, because it was deliberately written as *a search with a stated floor* rather than
   as a pinned profile id — which is that decision earning its keep for the second time.
4. **A count in a docstring is off by one.** `campaign.test.ts`'s stage-6 case says it sweeps *"all
   twelve shipped profiles"*; there are **thirteen**. The test iterates the array, so it is correct
   and only its prose is wrong.

**None of the four is a defect this lane fixes.** They are reported, per this lane's brief and per
`CLAUDE.md`'s rule that a published number is pinned to the run that produced it.

### 3.2 The curve, stage by stage

The `lesson` column is `data/campaign.json`'s own `teaches`, quoted rather than re-authored, because
two accounts of one stage's purpose drift apart. **Pressure** is the demand and fabric that produce
it. **Failure mode** is what visibly goes wrong when the player takes the obvious move.
**Status** is the measurement in § 3.1 read against §§ 2.2–2.4, and the summary is short: **DC-1 and
DC-2b fail on exactly the same three stages — 8, 9 and 10 — and for exactly the same cause.** A stage
that admits no dispatcher but its own cannot be failed from the dropdown *and* cannot be cleared from
it, so it satisfies DC-2 while teaching nothing, which is why DC-2 needed DC-2b written beside it.

| # | Lesson | Pressure (demand · fabric) | Failure mode that teaches it | Status |
|---|---|---|---|---|
| 1 | *a call, a car, a wait* | the building's own gentle profile · 6 floors, 2 hydraulic cars at 0.63 m/s | `nearest-car` fails `answer-the-demand` where the shipped `collective` meets it — the building is sparse enough that parking policy alone decides it | **all four rules hold**, which is the finding: the *stage* teaches on this building even though the *week's day 1* on the same building does not. See § 4.2 F2 |
| 2 | *rise and fall, and the gap between demand offered and demand carried* | 2.5 %/5 min up-peak · 20 uniform floors, 4 geared cars | the gap between arrived and carried opens and does not close; `nearest-car` resolves behind on two metrics | **holds.** Nothing clears; `capacity-aware` gets three metrics ahead and one behind — the Pareto move the stage is about |
| 3 | *saturation, and why a diverging queue has no average* | the shipped saturating rate · same fabric as 2 | the queue diverges and the mean is **suppressed** — the number the player wanted is refused | **DC-2 breach.** `fairness-first` clears it from the dropdown |
| 4 | *service zoning, and a journey with two waits* | 1.5 %/5 min · two banks and a sky lobby | the transfer leg doubles the wait and no single dial reaches both halves | **holds, and is the front.** Nothing clears; `zoned-uppeak` is 2 ahead and 1 behind, which is what makes *"and nothing resolved against it"* falsifiable |
| 5 | *access zoning, and the one problem no dial reaches* | the building's own profile · 30 floors, credentialed above 21 | landings that **no car may legally answer**, which look nothing like slow ones | **DC-2 breach.** `eta` clears it from the dropdown |
| 6 | *that at a hundred floors the geometry decides more than the weights do* | 0.5 %/5 min · 100 floors, sky lobbies, double-deck shuttles | every weight vector the dropdown offers is behind on something; the geometry is the binding constraint | **holds, and is the strongest cell in the campaign.** 12 profiles admitted, 0 clear, and somebody is ahead on something in several — so the refusal is `beat-the-baseline` asking for a dominating move rather than a dead comparison |
| 7 | *that an improvement you cannot measure is not one* | 1.5 %/5 min · the same building as 2 | an improvement that does not survive the holdout set | **DC-2 breach.** `destination-panel` clears it, and this stage admits **all thirteen** profiles |
| 8 | *that spare cars are not the same as a short interval* | 3 %/5 min · 6 fast cars, prestige bank | **none is reachable from the dropdown** — the control meets every count goal | **DC-1 and DC-2b both breached, and by one cause.** Admits **only the control**: there is no dropdown move to make, so nothing can go wrong |
| 9 | *demand with no dominant direction, and a car unlike its neighbours* | 2.5 %/5 min · a hotel with one odd car | **none is reachable from the dropdown** — both admitted profiles meet `answer-the-demand` | **DC-1 and DC-2b both breached.** Admits the control and `eta`: one real move, and it fails nothing |
| 10 | *that two cars in one bank can be the wrong car* | 2 %/5 min · bed cars and passenger cars in one bank | **none is reachable from the dropdown** — the control meets `deliver-everyone` and `answer-the-demand` | **DC-1 and DC-2b both breached, and by one cause.** Admits **only the control** |

### 3.3 What the curve requires that the shipped campaign does not have

Six obligations follow from the table, in the order a lane should take them. **Every one of them is
expressible as demand or fabric or as a stage's `editable` list**, and none is a bar change.

| | obligation | why | permitted by |
|---|---|---|---|
| **C1** | Stages 8, 9 and 10 must fail a non-comparative goal under some admitted profile | DC-1. Today every admitted profile meets every count goal on all three, so the only thing a player can miss is `beat-the-baseline`, and standing still misses that everywhere | DC-R1: demand or fabric on `chancery-house`, `crown-hotel` and `st-jude-hospital`. Note that `chancery-house` is measured elsewhere in the tree as the building whose *six 5 m/s cars never produce a wait over a minute* at any plausible rate, so its pressure has to come from fabric or from zoning rather than from demand |
| **C2** | Stages 3, 5 and 7 must stop clearing from the dropdown | DC-2 | DC-R1 — the demand or the fabric moves, never the goal |
| **C3** | The same three stages must admit at least two non-control profiles | DC-2b, and it is C1's other half rather than a second job: both breaches have one cause | a scope change to each stage's `editable` list; not a difficulty change, so DC-R1 does not bind it |
| **C4** | Every stage names a witness vector that clears it | DC-3 | W6, already built |
| **C5** | The published clear count must be re-derived by a test, not by a document | it has now gone stale **three** times — seven→ten in the denominator, four→three in the numerator, and twice in which stages | the sweep, § 6 |
| **C6** | The four stale claims in § 3.1 are corrected at their sites | `CLAUDE.md`: a published number is pinned to the run that produced it | not this lane's edit; each site is named in § 3.1 |

**C2 is the one to think about before doing.** § D161 published *which* stages the dropdown already
solves precisely because *"publishing which stages are already solved by a dropdown is less flattering
than not measuring it, and it is the only version a player cannot be misled by."* Adopting DC-2 does
not delete that honesty — it converts a published measurement into a gate, and the sweep in § 6 is
what keeps it a measurement afterwards. What DC-2 does change is `campaign.test.ts`'s stage-5 case,
which asserts today that **at least one** shipped profile clears stage 5. **Under DC-2 that assertion
inverts**, exactly as the stage-6 case already did, and the clause it was protecting — *is this
campaign winnable at all?* — moves to DC-3's witness, which is the better home for it: winnability is
a property of the whole move set, and the dropdown is a proper subset of it.

---

## 4. The week — Today's tower and the daily loop

### 4.1 What the week's difficulty is made of

Four mechanisms, all of them already built, all of them demand or fabric:

| mechanism | substrate | where |
|---|---|---|
| the day's goal bars harden with the day index | *not difficulty* — see below | `shift/goals.ts#goalsForDay` |
| the building fills up overnight, `1 + 0.11 × (day − 1)`, linear | fabric → demand | `shift/growth.ts` |
| today's event — a car out of service, a swung mix, a raised or lowered rate, an interfloor share | demand and service | `shift/events.ts`, `shift/incidents.ts` |
| the contract you are on — which building, and for how long a shift | fabric | `shift/contracts.ts#CONTRACTS` |

**The bar ladder is already post-§ D345 and is the model for § 1.4.** `goalsForDay(day)` reads the
day and nothing else: no difficulty tier reaches it, so two players on different tiers are judged
against identical bars. Day 1 asks carry ≥ 87 %, ≥ 61 % away inside a minute, no landing past 32, and
a worst wait inside 230 s; each hardens per day and each stops at a floor, because *"a bar that kept
hardening would eventually ask for a building that cannot exist."*

That ladder is a **curve**, not a difficulty setting, and the distinction is worth keeping: the bars
harden identically for everybody, and what varies between players is only which building they are on
and what the day did to it.

### 4.2 The measurement

**Instrument.** For each of the eight contracts, the contract's own building was grown to day *d* by
the shipped `shift/growth.ts#grownBuilding`, re-parsed and resolved through `core`'s own door, and run
under the shipped default dispatcher (`collective`) for the contract's own shift length —
`garden-apartments` at its authored 3 600 s, the rest at the 1 800 s default — over 30 seeds, on an
ordinary day with no event. Each run's four `goalsForDay(d)` readings were taken through the shipped
`shift/observations.ts` → `shift/goals.ts#readGoal` path.

**What is reported is a proportion of seeds with its `n`**, never a mean: *on how many of 30 seeds did
all four of the day's goals hold*. No claim below compares two configurations, so no paired interval
is required; where one would be required, none is offered.

**Result, 8 contracts × 4 days × 30 seeds = 960 runs.** Each cell is *how many of 30 seeds missed at
least one of the day's four goals*. Every run cleared the twenty-arrival wake-up gate —
`garden-apartments` because its contract authors its own 3 600 s hour — so no cell is ungraded for
emptiness. **26 of the 960 runs carry a `pending` reading anyway**, all of them in `midtown-office`
day 20 (22 of 30), `midtown-office` day 10 (3) and `vertical-city` day 20 (1): the worst wait is
*censored* on a run whose legs never resolved, and the goal refuses rather than guesses. Every one of
those runs missed on the other three goals regardless, and *unjudged is not passed* — so they are
counted as misses here, which is what `shift/week.ts#outcomeOf` does.

| | contract | building | day 1 | day 5 | day 10 | day 20 |
|---|---|---|---|---|---|---|
| c1 | Learn the ropes | `garden-apartments` | **0/30** | **0/30** | **0/30** | 2/30 |
| c2 | The morning rush | `midtown-office` | **30/30** | **30/30** | **30/30** | **30/30** |
| c3 | Two banks, one lobby | `secure-tower` | 7/30 | **30/30** | **30/30** | **30/30** |
| c4 | The sky lobby | `mixed-use-high-rise` | 24/30 | **30/30** | **30/30** | **30/30** |
| c5 | Vertical City | `vertical-city` | **30/30** | **30/30** | **30/30** | **30/30** |
| c6 | The headline address | `chancery-house` | 1/30 | **30/30** | **30/30** | **30/30** |
| c7 | Both ways at once | `crown-hotel` | 9/30 | **30/30** | **30/30** | **30/30** |
| c8 | The bed and the visitor | `st-jude-hospital` | **0/30** | 7/30 | 29/30 | **30/30** |

Mean arrivals in the same cells, so the growth mechanism is visible beside the misses:

| contract | day 1 | day 5 | day 10 | day 20 |
|---|---|---|---|---|
| c1 | 41 | 56 | 82 | 122 |
| c2 | 718 | 1039 | 1425 | 2194 |
| c3 | 434 | 632 | 868 | 1348 |
| c4 | 941 | 1370 | 1907 | 2900 |
| c5 | 3193 | 4611 | 6395 | 9972 |
| c6 | 348 | 499 | 682 | 1055 |
| c7 | 360 | 520 | 718 | 1117 |
| c8 | 244 | 352 | 474 | 760 |

**Six findings, and the first two are what #200 and #208 are actually about.**

**F1 — the opening contract is unfailable for three quarters of its length.** `garden-apartments`
misses nothing on **0 of 30** seeds at day 1, day 5 **and** day 10, and only **2 of 30** at day 20,
after growth has taken it from 41 arrivals to 122. #208 reports this as a property of *day one*;
measured, it is a property of most of the contract. The building is not at fault —
`data/buildings/garden-apartments.json` states that the sparseness is the building's **purpose** —
and neither is the growth mechanism, which is plainly reaching the run. What is at fault is the
pairing of that building with these bars.

**F2 — the campaign's stage 1 does not have this problem, and conflating the two would misdirect the
fix.** On the same building, § 3.1 measured `nearest-car` failing `answer-the-demand` at campaign
stage 1. The **stage** presents a failure a player can produce; the **week's day** does not. They are
two products on one building, and #200's opening paragraph moves between them in consecutive
sentences.

**F3 — the contract order is not a ramp, and is not close to one.** Day-1 miss rates in shipped
order: **0, 30, 7, 24, 30, 1, 9, 0** of 30. It goes trivial → unpassable → moderate → hard →
unpassable → trivial → moderate → trivial. **The last contract ties the first for the easiest day 1
in the catalogue.** DC-6 is red on the shipped order.

**F4 — DC-4 is red on 8 of 8 contracts, and the band was written before the measurement.** No
contract's day 1 lands in `[1/3, 2/3]`: the closest are `secure-tower` at 0.23 and `crown-hotel` at
0.30, and the other six are at 0.00, 0.03, 0.80, 1.00, 1.00 and 0.00. **The band is not widened to
fit.** A specification nothing currently satisfies is what #200 asked for — the complaint is that the
curve is flat and unspecified — and the number stays in § 7 as **O1**, the figure most likely to be
argued with, rather than being tuned until the product passes it.

**F5 — day 5 is a cliff rather than a step.** `secure-tower` goes 7/30 → 30/30, `chancery-house`
1/30 → 30/30, `crown-hotel` 9/30 → 30/30, all between day 1 and day 5. Two mechanisms compound there
and neither is wrong on its own: the bars harden fastest early (`minute` 61 → 73, `queue` 32 → 24,
`worst-wait` 230 → 190 s over four days) while growth adds about 45 % more arrivals. **The bars then
floor by day 10** — after which day 20 differs only in the queue cap, 14 → 12 — so the second half of
a contract rises by growth alone. A curve that is steepest where the player is least experienced is
the shape to question first, and it is a bar-ladder question rather than a difficulty question, so it
belongs to whoever lands § 1.4.

**F6 — one of the four goals is very nearly inert.** `carry` is met on **every seed of every cell**
except `midtown-office` at day 10 and day 20. Three of the four tests do the discriminating; the
fourth passes almost everywhere. That is not a defect — a goal that is easy to hold is a goal a
player is not being asked about — but a four-test day whose fourth test never binds is a three-test
day with a decoration, and it should be said out loud rather than counted as four.

**DC-5 holds everywhere and is worth reporting green**: no contract's miss rate falls between day 1,
5, 10 and 20. The growth mechanism reaches the run on all eight buildings, which is the clause that
would have caught a difficulty knob wired to nothing.

### 4.3 The specified curve for a week

> **DC-4.** A contract's day 1 must fail at least one of the day's four goals on **at least a third
> and at most two thirds** of seeds under the shipped default configuration.

Both bounds do work, and both are stated so they can be argued with rather than assumed.

**The lower bound is DC-1 pointed at a day**: a contract whose first day holds every goal on nearly
every seed presents no problem, which is #208's finding, § 4.2's F1 and this document's § 4.4.

**The upper bound is new, and it is the half #200 does not ask for.** A day that misses on nearly
every seed is not a difficult day; it is a day the shipped configuration cannot pass, and the player
cannot tell their own choice apart from the building. The failure has to be *attributable* to be
teaching, and a fixed bar against an overwhelming building attributes nothing.

**The band is a design choice with the reasoning attached, not a citation.** A third to two thirds is
the widest band in which a player can both fail and succeed within one week of five days, which is the
loop's own unit. It is offered as the number to attack.

> **DC-5.** Over a contract's twenty days the miss rate must be **non-decreasing between day 1, day 5,
> day 10 and day 20** on the same seeds. Growth is linear and the bars floor out, so a contract whose
> later days are easier than its first is a contract whose growth mechanism is not reaching the run.

DC-5 is deliberately cheap to check and deliberately weak: it is a monotonicity assertion on four
points, not a shape. It exists because the failure it catches — a difficulty mechanism that does not
reach the simulation — is this repository's most-repeated defect, and the standing requirement's own
test is *move the control and require the run to change*.

> **DC-6.** The contract order `CONTRACTS[0..7]` must be non-decreasing in day-1 miss rate, up to the
> resolution of the sweep's seed count.

DC-6 is what makes the order an order. Note what it does **not** say: it does not require the
buildings to get bigger, or the demand to rise. `chancery-house` is 6 fast cars and `garden-apartments`
is 2 hydraulic ones, and a contract can be harder with fewer people in it.

### 4.4 Day one, which is what #208 is governed by

#208 asks that *"a new player sees a building visibly failing within 90 seconds of first load"*, and
says the difficulty specification governs how. It does, in exactly two clauses:

1. **The change is expressed as demand or building fabric, and as nothing else** (DC-R1). Raising
   `garden-apartments`' arrival rate past the residential profile's declared `max: 7` is **not** on
   the table; opening the contract under a **booked event** rather than an ordinary day is, and the
   machinery exists (`shift/events.ts`, `shift/incidents.ts#carsToDerate`); moving the opening
   contract to a different building is; making the first session a fix case is, because a fix case's
   difficulty is its authored fault, which is fabric.
2. **The target is DC-4's band, not "harder"** — at least a third of seeds missing something, at most
   two thirds. #208's AC1 is a statement about *one* first load; DC-4 is the same statement made
   about the distribution the first load is drawn from, which is the form it has to take because
   **the shipped first-load seed is random**. `ISSUE_VERIFICATION_FINDINGS.md` § S measured that
   distribution over 100 consecutive seeds at the shipped configuration and found what a
   specification has to plan for: a median worst wait of 31.4 s, and **9 of 100 loads already
   producing a wait over 60 s**. A first session specified as *"the day-one run looks like this"* is
   a first session specified on one draw from that.

**#200's and #208's shared opening figures, disposed of once.** *"Forty-four people"* — § S measured a
median of 40 and a mean of 40.2 over 100 seeds; correct as a typical day, wrong as a constant.
*"Worst wait thirty seconds"* — median 31.4 s; same disposition. *"Comfortable is around 400"* — the
copy is real and exact (`everyday/today.ts` computes 120 ÷ 2 = 60 per car against a
`COMFORTABLE_PER_CAR` of 400), **and the 400 is a citation to the design prototype rather than a
measurement**, which that module's own docstring states. This document does not re-derive those three;
it takes § S's measurement, and it names § S rather than restating the numbers as if they were fresh.

**What is not this document's to decide.** Which of #208's three options is taken. This document
supplies the bar the choice is measured against and refuses the fourth option — moving the goal — and
that is the whole of the governance § D348 pulled it in to provide.

### 4.5 What the curve requires that the shipped week does not have

| | obligation | why | permitted by |
|---|---|---|---|
| **W1** | The opening contract's day 1 lands in DC-4's band | F1 — it currently misses nothing on 0 of 30 seeds, and still misses nothing at day 10 | DC-R1, and the three options #208 itself lists. **Not** by moving `garden-apartments` past the residential profile's declared `max: 7` |
| **W2** | The contract order is non-decreasing in day-1 miss rate | F3 — the shipped order is 0, 30, 7, 24, 30, 1, 9, 0 of 30, and the last contract ties the first for easiest | reordering `CONTRACTS`, which is neither demand nor fabric and is therefore unconstrained by DC-R1; or moving the demand or fabric of the contracts themselves |
| **W3** | No contract's day 1 sits at 30 of 30 | F4 — `midtown-office` and `vertical-city` are unpassable on day 1 under the shipped default, so a player there cannot tell their own choice from the building | DC-R1. Note this is the direction nobody expects a difficulty specification to push, and it is the half that makes the rule a *curve* rather than a floor |
| **W4** | The day-5 cliff is either flattened or declared | F5 — three contracts go from passable to unpassable between day 1 and day 5, from the bars and the growth compounding | the bar ladder in `shift/goals.ts#GOAL_BARS`, which belongs to whoever lands § 1.4. A bar ladder is not a difficulty tier and DC-R1 does not forbid changing it; what DC-R1 forbids is making it depend on the tier |
| **W5** | The `carry` goal either binds somewhere or is described as what it is | F6 — met on every seed of every cell but two | a bar change, or a copy change. Both are legitimate; pretending it is a fourth test is not |

**W4 is the one that will be argued about, so its permission is stated precisely.** § D345 forbids a
*difficulty setting* from moving the bar a run is judged against. It says nothing about the bar
ladder itself, which every player meets identically — `goalsForDay(day)` reads the day and nothing
else. Changing what day 5 asks of everybody is a design change to the curve; changing what day 5 asks
of an Easy player specifically is the thing § D345 forbids. **The two are different and this document
does not let the first hide behind the second.**

---

## 5. Fix a building — the case ordering

### 5.1 What a fix case's difficulty is made of

A case is a building, a dispatcher, a seed, a horizon and a demand level, plus an authored `asBuilt`
fault expressed as a real config patch — so **every axis of a fix case is already demand or fabric**,
and DC-R1 is satisfied by construction. What varies between cases is not how hard the run is but **how
hard the choice is**, and that is the curve this section specifies.

The choice's shape is fixed by `GAMEPLAY_AND_NAVIGATION.md` § 10 and does not vary: four offered
repairs — one `diagnosed`, one `costly-fix`, one `cheap-fix`, one `new-shaft` at a flat 34 u against
budgets of 10–16 u, so the shaft is always an unaffordable decoy — plus five standing extras that
carry no patch at all and exist so the budget can be spent badly.

Three things therefore move a case's difficulty, and all three are already authored per case:

| axis | shipped range | what it does to the choice |
|---|---|---|
| how many affordable repairs clear **both** bars | **1 to 3 of 3**, measured in § 5.2 | at 3 the case cannot be lost by choosing wrongly; at 1 two affordable options look right and fail |
| the diagnosed repair's cost | **0 to 9 u**, against budgets of 10–16 u | at 0 u there is no trade-off to weigh; at 9 u there is |
| the headroom the budget leaves | **3 to 13 u** after the diagnosed repair | how many of the five inert extras can be bought before the right answer stops being affordable |

### 5.2 The measurement

**Instrument.** Every one of the eighteen cases was run through the shipped
`fixit/run.ts#fixitRunPlanOf` → `runFixitPair` → `measuredOf` → `engine.ts#classifyOutcome` path with
**each offered repair selected alone**, and once with nothing selected. Both bars are the shipped
ones: the complaint at least 80 % gone, and the rest of the building's away-inside-a-minute share down
by no more than 2 points.

**Result, 18 cases × 5 selections = 90 classified outcomes over 180 runs.**

| | measured |
|---|---|
| doing nothing clears | **0 of 18** — every do-nothing arm classifies `not-enough` |
| the diagnosed repair alone clears | **18 of 18** (already pinned by `fixit/cases.test.ts`) |
| the 34 u new shaft is affordable | **0 of 18** — it is an unaffordable decoy in every case, against budgets of 10–16 u |
| cases where **exactly one** affordable repair clears | **10 of 18** |
| cases where **two** do | **6 of 18** |
| cases where **three** do | **2 of 18** |

Per case, in the shipped order, with the order § 5.3 specifies beside it:

| shipped # | case | budget | diagnosed | affordable repairs that clear | band | specified # |
|---|---|---|---|---|---|---|
| 1 | `sleeping-sky-lobby` | 12 u | 0 u | **2** of 3 affordable | B | 3 |
| 2 | `zoning-starves-the-top` | 12 u | 6 u | **1** of 3 affordable | C | 16 |
| 3 | `three-cars-one-cars-work` | 10 u | 0 u | **1** of 3 affordable | C | 9 |
| 4 | `doors-that-never-close` | 12 u | 2 u | **1** of 3 affordable | C | 12 |
| 5 | `cars-that-always-go-home` | 10 u | 0 u | **2** of 3 affordable | B | 4 |
| 6 | `car-park-nobody-serves` | 12 u | 9 u | **1** of 3 affordable | C | 18 |
| 7 | `express-that-stops-everywhere` | 10 u | 0 u | **1** of 3 affordable | C | 10 |
| 8 | `deliveries-on-the-passenger-group` | 10 u | 1 u | **1** of 3 affordable | C | 11 |
| 9 | `one-start-time` | 11 u | 2 u | **2** of 3 affordable | B | 6 |
| 10 | `every-letter-says-nine` | 13 u | 2 u | **1** of 3 affordable | C | 13 |
| 11 | `everyone-leaves-at-once` | 11 u | 0 u | **3** of 3 affordable | A | 1 |
| 12 | `bed-cars-locked-out` | 15 u | 5 u | **2** of 3 affordable | B | 8 |
| 13 | `two-cars-out-wrong-month` | 14 u | 4 u | **3** of 3 affordable | A | 2 |
| 14 | `every-deck-calls-itself-full` | 16 u | 6 u | **1** of 3 affordable | C | 17 |
| 15 | `restaurant-above-the-ballroom` | 12 u | 3 u | **1** of 3 affordable | C | 14 |
| 16 | `controller-sends-every-car` | 11 u | 2 u | **2** of 3 affordable | B | 7 |
| 17 | `let-faster-than-the-lifts` | 16 u | 3 u | **1** of 3 affordable | C | 15 |
| 18 | `gym-on-the-top-floor` | 10 u | 0 u | **2** of 3 affordable | B | 5 |

**Two findings from that run, both about the shipped catalogue rather than about the engine.**

**DC-8 already holds and DC-9 already holds**, so the fix arm of the sweep would land green on those
two clauses today. That is worth saying rather than assuming: an ordering rule that arrives beside two
rules the product already satisfies is a smaller change than it looks.

**The shipped order is not a ramp.** Ten of eighteen cases sit in the least forgiving band and they
are scattered from position 2 to position 17, while both band-A cases sit at positions 11 and 13. The
first case a player meets, `sleeping-sky-lobby`, is band **B**. Under DC-7 the catalogue reorders
substantially — and reordering is the whole change, because **not one case's data moves**: the bands
are a property of what was already authored.

### 5.3 The specified ordering

> **DC-7.** The eighteen cases are ordered by **how many affordable offered repairs clear both bars**,
> *descending*, and within a band by the diagnosed repair's cost, *ascending*.

Three bands, and the band is what the ordering is really about:

| band | measured shape | what the player must do | where it belongs |
|---|---|---|---|
| **A** | three affordable repairs clear it | spend sensibly; the case cannot be lost by choosing the wrong repair | **first.** `docs/32` § 5.4: *the fault is given plainly … the play is the choice*, and the handoff cut the guess-the-fault quiz because it *"gated the interesting decision (what to spend) behind a comprehension test"* |
| **B** | two clear; one affordable option looks right and is not | notice that the affordable alternative addresses a symptom rather than the complaint | middle |
| **C** | exactly one clears; **two affordable options do not** | read the figures precisely, because a within-budget spend can still fail | **last.** This is `docs/32` § 5.4's *"what rises is the number of plausible responses and the cost of the wrong one"* |

**The direction is descending and that is the arguable half, so here is the argument.** A case where
three of the four offered repairs clear both bars is a case where nearly any spend passes — the choice
barely matters, which is what the *first* case should be. A case where exactly one clears and two
affordable alternatives do not is a case where a player who reads the figures loosely spends inside
budget and still fails. The measured axis is *forgiveness*, and difficulty is its inverse.

**A stated bound on the measurement.** The counts above are over **single-repair selections**. A
player may select several repairs within budget, and combinations were not swept — sixteen subsets per
case, of which the affordable ones are few, is about 576 runs and is worth doing once if the ordering
is ever contested. It is named as a bound rather than glossed, because *"how many affordable repairs
clear it"* sounds like a statement about all selections and is a statement about eighteen of them.

> **DC-8.** Doing nothing must clear no case. The do-nothing arm is run and required to classify as
> anything other than `fixed`.

DC-8 looks trivial and is not: it is the fix-mode form of *standing still clears nothing*, and it is
the one assertion that would catch a complaint whose measure had drifted to something the as-built run
already satisfies.

> **DC-9.** No case may offer a repair that is inert unless the case declares it inert. Already
> enforced — `fixit/cases.test.ts` compares the as-repaired run to the as-built one **on the legs**
> for every repair of every case, in both directions. Named here because it is DC-R1's companion at
> case scale and because a later case added without it would pass everything else.

### 5.4 What the ordering does not get to do

**The two bars do not move between cases.** 80 % of the complaint gone and no more than 2 points off
the rest of the building are `ENGINE_CONTRACT.md` § 9's thresholds, they are identical in every case,
and DC-R1 forbids a case being made *"harder"* by asking for 90 %. A case is made harder by authoring
a fault whose repair costs more, or by offering a decoy that nearly works.

---

## 6. The sweep

#200's AC4: *"an automated sweep specified that checks that rule across all shipped dispatchers."*
This is that specification. **It is not built by this lane.** It is specified in enough detail that
the lane that builds it needs no second design pass.

### 6.1 Shape — one instrument, three arms, colocated with their subjects

| arm | file | rules it enforces |
|---|---|---|
| campaign | `packages/viz/src/campaign/difficultyCurve.test.ts` | DC-1, DC-2, DC-2b, DC-3 |
| week | `packages/viz/src/shift/difficultyCurve.test.ts` | DC-4, DC-5, DC-6 |
| fix cases | `packages/viz/src/fixit/difficultyCurve.test.ts` | DC-7, DC-8 (DC-9 already lives in `cases.test.ts` and is not duplicated) |

**Colocated rather than gathered into a `curve/` directory**, for two reasons. `packages/viz/src`'s
dead-code audit derives its directory list from disk and asserts it both ways, so a new directory
holding only test files is a directory with no exports to classify and a change to that audit's
subject. And each arm's subject already has a suite that loads exactly the `data/` it needs —
`campaign/campaign.test.ts`, `shift/contracts.test.ts` and `fixit/cases.test.ts` — so three colocated
files reuse three loaders rather than writing a fourth. (`shift/week.test.ts` deliberately loads
nothing: the week is a pure state machine and its suite deep-freezes its input. The week arm belongs
beside `contracts.test.ts`, which already resolves all five — now eight — buildings.)

**They call the shipped constructors and never a second copy.** `batchRequestForStage`, `judgeStage`,
`grownBuilding`, `goalsForDay`, `readGoal`, `fixitRunPlanOf`, `classifyOutcome`. This is § D161's
second false-negative variant and `stageRun.ts`'s founding argument: a sweep that assembled its own
request would keep passing while the product drifted.

### 6.2 What each arm iterates

**Campaign arm.** The outer product of `parseCampaign(data/campaign.json).stages` × the profiles in
`data/dispatcher-profiles.json`. Both lists are read off `data/` and **neither is written down** — a
hard-coded stage count is what let *"four of seven"* survive the campaign growing to ten, and a
hard-coded profile list is what put *"twelve"* in a docstring beside thirteen profiles.

Per cell: `admitProfile(space, baseline, candidate, editableIds)`; skip if inadmissible; otherwise
`runBatch(batchRequestForStage(stage, id))` and `judgeStage`. Then, once per stage, the DC-3 witness
from the registry, through the same constructor with its `edit`.

**Week arm.** `CONTRACTS` × `{1, 5, 10, 20}` × *S* seeds, at the contract's own `shiftLengthS ?? 1800`,
under the shipped default dispatcher, on an ordinary day. Per cell: `grownBuilding` → `parseBuilding`
→ `resolveBuilding` → `recordRun` → `observationsAt(recording, recording.endedAt)` →
`shiftObservationsOf` → `readGoal` over `goalsForDay(day)`.

**Fix arm.** The eighteen cases × their four repairs × the empty selection.

### 6.3 What makes it red

| # | red when | rule |
|---|---|---|
| 1 | a stage clears every **non-comparative** goal under every admitted profile | DC-1 |
| 2 | any admitted shipped profile clears any stage | DC-2 |
| 3 | a stage admits fewer than two non-control profiles | DC-2b |
| 4 | a stage's registered witness does not clear | DC-3 |
| 5 | a stage has no witness **and** is not in `OUTSTANDING` | DC-3 |
| 6 | a stage is in `OUTSTANDING` **and** its witness clears | DC-3 — the register in both directions |
| 6b | a witness's recorded holdout behaviour does not reproduce | DC-3b — a recorded measurement that stops reproducing is a stale published number |
| 7 | a contract's day-1 miss rate is outside `[1/3, 2/3]` | DC-4 |
| 8 | a contract's miss rate falls between day 1, 5, 10 and 20 | DC-5 |
| 9 | the contract order is not non-decreasing in day-1 miss rate | DC-6 |
| 10 | the case order does not agree with the measured band ordering | DC-7 |
| 11 | doing nothing clears a case | DC-8 |
| 12 | **the sweep found nothing to check** — zero stages, zero profiles, zero admitted cells, zero cases | the guard on the guard |

Row 12 is not decoration. `citations.test.ts` and `moduleTree.test.ts` both carry it and both say
why: an empty walk, a regex that stopped matching, or a skip list that swallowed the tree makes a
suite pass by asserting nothing. The count of admitted cells is asserted to exceed zero and the
counts are printed.

### 6.4 What it costs, and the tier that follows from the cost

Measured while taking §§ 3.1, 4.2 and 5.2, on this container, one worker:

| arm | work | wall clock |
|---|---|---|
| campaign | 77 admitted cells × 2 arms × 50 replications = 7 700 simulations | **198 s** |
| week | 8 contracts × 4 days × 30 seeds = 960 simulations | **589 s** |
| fix cases | 18 cases × 5 selections × 2 runs = 180 simulations | **16 s** |

**The campaign arm's cost is not where anyone expects it.** Stage 3 alone — `midtown-office` at its
saturating rate — is 64 s of the 198, and stage 6 — the hundred-floor tower — is 50. The stage that
runs a supertall building is *not* the expensive one; the stage whose queues diverge is. And the week
arm, whose runs are single replications, costs three times the campaign arm's, because
`vertical-city` at day 20 generates nearly ten thousand arrivals in an 1 800 s window.

Together that is about **thirteen minutes**, which is far too slow for the suite somebody runs on
every save and comfortably inside a CI job.

**So the sweep is tiered the way the honesty sweep is**, and for the same reason:

- **always-on** — the cheap, decisive half: **DC-2b** (pure, no simulation at all — it is
  `admitProfile` over two lists, and it is the clause three shipped stages fail), the **DC-3
  register in both directions** (also pure — it is a set comparison), and **DC-6**/**DC-7** read from
  a pinned table.
- **deep**, behind an environment variable, run in CI and before any change to `data/campaign.json`,
  `data/scenario-goals.json`, `data/fixit-cases.json`, `data/buildings/` or the witness registry —
  every rule, every cell. The fix arm is cheap enough at 16 s that it may reasonably sit in the
  always-on tier whole; that is the builder's call and either choice is defensible.

**The pinned table is the thing that keeps the always-on tier honest**: the deep tier writes the
measured clear count, the per-stage admitted counts and the per-case band into a pinned artefact, and
the always-on tier compares the pin against the cheap re-derivation. A pin that stops reproducing is
red. This is `benchmark/published.ts`'s pattern, and it is the direct answer to C5 — the published
count has now gone stale three times because **nothing re-derived it**.

### 6.5 Two things the sweep is not allowed to do

**It may not report a mean.** Every figure it publishes is a count with its denominator — *3 of 10
stages*, *11 of 30 seeds*, *2 of 4 repairs*. `campaign/judge.ts` already refuses to judge when the
baseline arm does not reproduce its published count, and the sweep inherits that refusal rather than
working around it.

**It may not compare two configurations and call one better.** It asks whether a configuration clears
a bar, which is a per-cell predicate. The moment a rule wants *better*, it needs a paired-t interval
excluding zero at 50–200 replications under common random numbers, and it stops being this sweep.

---

## 7. What is open

| | what | why it is open |
|---|---|---|
| **O1** | The `[1/3, 2/3]` band in DC-4 | a design choice with its reasoning attached, not a citation. It is the number most likely to be wrong and it is stated so it can be attacked |
| **O2** | Whether a day's bar should move with the **building** rather than with the day (`docs/32` § 9 Q6) | § 1.4 chose the day ramp and said why the building answer is the more interesting one. It needs a per-contract measurement over eight buildings that nobody has taken |
| **O3** | The DC-3 witness vectors themselves | nine of ten stages have none. Finding them is a search per stage, and the register's `OUTSTANDING` block is where that debt is visible until it is paid |
| **O4** | Whether stages 8, 9 and 10 should widen their `editable` lists or change their `teaches` | DC-2b says they must do one; which one is a content decision |
| **O5** | The trip-budget row | ungraded today, so it moves no verdict and § 1.4 leaves it varying by tier. **The moment it is graded it falls under DC-R1** |
| **O6** | Endless rush | `docs/32` § 1.4 records it as unshipped. A demand ramp with no ceiling is the one mode whose whole content is a difficulty curve, and it has none here because it has no code |
| **O7** | **The campaign judges on the seeds the player tunes against** | § 2.4's DC-3b. Every rule in this document judges a stage on its own tuning seeds, because that is what the product does — so *tune until the judged seeds clear* is a shortcut none of them can see. The one measured witness takes it: it clears on the tuning seeds and is beaten on the holdout. Closing it means judging on the holdout, which is a change to `campaign/judge.ts` and to what every published count in `data/scenario-goals.json` is a count of. **It is the largest open question here and it is deliberately not answered by a specification lane** |

---

## Sources

- GitHub issue **#200** — the brief this document answers; **#208** — the P0 it governs.
- [`DECISIONS.md`](../DECISIONS.md) § D345 (difficulty may raise the stakes and may not move the bar),
  § D348 (why this is in M2), § D161 (the campaign's own published clear count), § D227 (a stated
  refusal goes stale), § D254 and § D265 (what moved the stage clears).
- [`docs/22-charter.md`](22-charter.md) § 5 non-goal 6, as amended.
- [`docs/32-game-design.md`](32-game-design.md) § 5 — the difficulty model, GD18 and GD20, and § 9's
  open questions Q2 and Q6. This document specifies against § 5 rather than restating it.
- [`docs/14-building-behaviour-contract.md`](14-building-behaviour-contract.md) — what demand and
  passenger behaviour may be made of.
- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5 — the stage schema,
  the four fail states, the progression, and the published clear count § 3.1 corrects.
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S (the day-one
  distribution over 100 seeds), § W (the misattributed dropdown claim), § AA (the first contract's
  fabric).
- `data/campaign.json`, `data/scenario-goals.json`, `data/fixit-cases.json`, `data/buildings/`,
  `data/traffic-profiles.json` — everything measured above is measured on these.
