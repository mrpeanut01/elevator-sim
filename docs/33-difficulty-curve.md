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

**And the word *visibly* in that column is carried by nothing in this document, deliberately.**
`DC-1` discharges it as *at least one non-comparative goal is not met*, which is a figure rather than
a sight — the strongest testable form available to an instrument that measures runs.
[`34-problem-per-mode.md`](34-problem-per-mode.md) is the document that carries the other half: what
the player can **see** of each mode's problem before any figure names it, and what the two renderers
can and cannot draw. Its `PM-TT2` adds a legibility clause on top of `DC-4` for exactly this reason,
and its § 9.3 measures the building where the gap is widest.

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
> stage admits — `judgeStage(...).metOnTuningSeeds === false`.

**`metOnTuningSeeds`, not `cleared`, and the field is the rule rather than a detail of it.** GitHub
issue **#255** split the judged seed set from the tuning seed set: `cleared` now requires a second
batch over the stage's holdout seeds as well, so a DC-2 written over `cleared` would be satisfied by
a sweep that never ran that batch — a gate that passes because nothing was asked. What DC-2 is about
is whether the dropdown can *meet a stage's bars at all*, and that is the field with that meaning.
The stronger question — whether a dropdown move survives the holdout too — is answered by DC-2's
own measurement and reported beside it in § 3.1.

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

**On which seeds the witness must clear — rewritten, because the product changed underneath it.**
This clause used to read *"DC-3 asks for a clear on the stage's **own judged seeds** … it does not
ask for a clear on the holdout set"*, and it said so as a refusal to specify something the shipped
campaign could not deliver. GitHub issue **#255** delivered it. `campaign/judge.ts` now clears a
stage only when every goal is met on the tuning batch **and** on a second batch over
`stage.holdoutSeeds`, judged against that seed set's own published counts, with the second batch's
master seed checked rather than taken on the caller's word. So:

> **DC-3b.** Each witness must clear on the stage's **holdout** seed set as well as on its tuning
> seeds, because that is what `cleared` now means. A vector that meets every bar on the seeds it was
> tuned on and is beaten on the holdout is **not a witness** — it is the shortcut O7 named, and the
> register records it as a stage with no witness rather than as a witness with a caveat.

**The one witness that existed is that case, and it no longer clears.** `campaign.test.ts` plays
stage 2's authored vector — `weights.waitTime: 1`, `weights.loadFactor: 2.25`, found by sweeping
`loadFactor` on the stage's own tuning seeds — through both batches and pins both halves: it meets
every bar on the tuning seeds, and on the declared holdout seeds it loses `long-waits-under` (41
against a published bar of 45) and is **beaten on three measures** with `beat-the-baseline`
resolving against it. `cleared` is `false`. The sensitivity that says what it is still holds:
`2.2`, `2.25` and `2.3` met the tuning bars and `2.35` did not.

So **stage 2 has no registered witness either**, and § 3.1's DC-3 row read *ten of ten* rather
than nine. That is a worse-looking campaign and a truer one: the vector that used to stand there was
a fit to fifty passenger populations, and O7 is the reason it stood there at all.

**It reads *nine* now, and not because anything about stage 2 changed.** § 3.3c measures a vector
that clears **stage 1** on both batches — park the idle cars in the middle of the building — and it
had existed the whole time behind a stage that would not accept it. Two things follow that this
clause did not anticipate. A stage can fail DC-3 because of its **`editable` list** rather than
because no vector clears it, so *"no witness"* has two causes and only one of them is about the
building; the register § 2.4 asks for must therefore say **which**, or it will record a scope
decision as a difficulty finding. And the witness registry itself is still unbuilt: stage 1's
witness is pinned by `packages/viz/src/campaign/stageOneParking.test.ts` rather than authored in
`data/`, which is the shape this clause forbids for the same reason it forbids a hand-written list
anywhere else. That file is a measurement, not the registry, and it says so.

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
| **DC-3** — a witness edited vector clears the stage on its judged seeds | **one — stage 1, and it was measured later: § 3.3c** | **nine.** Stage 2's authored vector met every bar on the tuning seeds and is refused on the holdout under the post-#255 judge (§ 2.4), so the one witness that existed *then* is not one. Stage 1's — park the idle cars in the middle of the building — clears both batches and was locked out by the stage's own `editable` list rather than by the building; § 3.3c is the measurement and the correction |

**DC-1 and DC-2b fail on the same three stages**, which is not a coincidence and is the whole reason
DC-2b exists: stages 8 and 10 admit only their own baseline and stage 9 admits one other profile, so
on those three the dropdown can neither break the stage nor clear it.

**The DC-3 row is the one that has since moved, and how it moved is the more useful half.** It read
*none / all ten* when this sweep was taken, and it was reading the campaign's `editable` lists rather
than the campaign: stage 1's clearing vector existed the whole time and `admitProfile` refused to run
it, because the stage did not open the dimension its own building says decides it. The row above is
corrected rather than rewritten, on this section's own rule that its tables record what a named run
produced. **The DC-1 and DC-2 rows are unmoved by that work** — § 3.3c measures both and neither
changed — and stage 1's DC-1 breach, added by § 3.1a, still stands.

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

#### 3.1a Correction — two rows of the tables above were measured on a tree that has moved

GitHub issue **#255** landed both halves of the campaign's measurement integrity: the campaign path
now sets a reporting window, and a stage is judged on a seed set the player did not tune against.
Both move numbers this section published, and they are corrected here rather than silently rewritten
into the tables, because the tables are a record of what a named run produced.

**Stage 1's row is no longer *all four rules hold*, and the cause is the window.** § 3.2 says this
stage teaches because *"`nearest-car` fails `answer-the-demand` where the shipped `collective` meets
it"*. `answer-the-demand` is `personsPer5Min >= offeredPer5Min`, and it was being read over the
demand template's five-minute band on a building with about a dozen arrivals in the whole 900 s run
— so what varied was **where the band fell**, not how the building was dispatched. Re-measured over
the window the experiment matrix declares for `garden-apartments`, the shipped setting scores
**50/50 on the tuning seeds and 50/50 on the holdout**, which R12 makes a fact for the briefing
rather than a goal; so do the other four per-run kinds. `data/campaign.json` therefore declares
`beat-the-baseline` alone on stage 1, and **stage 1 joins 8, 9 and 10 as a DC-1 breach**: there is
no non-comparative goal left for any admitted profile to fail. That is a content obligation for the
campaign rebalance — **C1 now names four stages, not three** — and it is a defect the fix *revealed*
rather than one it caused. § M30 of `docs/10` carries the moved cells. **§ 3.3a is the sweep that
went looking for a replacement goal and did not find one**, and it is what says the remaining fix is
fabric rather than a bar or a rate.

**Stage 5's named clearer has moved again, and the cause is the seed split.** § 3.1's table records
`eta` as the profile that clears stage 5 from the dropdown. Swept again over all thirteen shipped
profiles, both batches, under the post-#255 judge: **six** meet every bar on the tuning seeds —
`eta`, `energy-aware`, `fairness-first`, `capacity-aware`, `predictive-balanced`, `auction` — and
**one** clears, `predictive-balanced`. `eta` loses `deliver-everyone`, `no-divergence` *and*
`answer-the-demand` on the holdout. Five of six apparent clears on this stage were a fit to fifty
passenger populations, which is the case for the split stated as a measurement rather than as an
argument. The **DC-2 breach stands** — a shipped dropdown profile still clears stage 5 — and only
its name changed. `campaign.test.ts` pins the sweep and asserts that the holdout removes somebody,
so a split that stopped biting would be red rather than quietly decorative.

**Neither correction re-runs the other eight stages**, so the DC-1, DC-2 and DC-2b columns above are
otherwise as measured. A full re-sweep under the new judge is the § 6 sweep's job and is the reason
row 2 of § 6.3 now names `metOnTuningSeeds`.

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
| **C1** | Stages **1**, 8, 9 and 10 must fail a non-comparative goal under some admitted profile | DC-1. Today every admitted profile meets every count goal on all four, so the only thing a player can miss is `beat-the-baseline`, and standing still misses that everywhere. **Stage 1 joined this list with GitHub issue #255** and not by anybody changing it: its only count goal was `answer-the-demand` read over a five-minute band, which measured where the band fell rather than how the building was dispatched, and over the honest window all five of its per-run kinds are `50/50, 50/50`. See § 3.1a | DC-R1: demand or fabric on `garden-apartments`, `chancery-house`, `crown-hotel` and `st-jude-hospital`. Note that `chancery-house` is measured elsewhere in the tree as the building whose *six 5 m/s cars never produce a wait over a minute* at any plausible rate, so its pressure has to come from fabric or from zoning rather than from demand; and `garden-apartments` has a **hard rate ceiling** — the residential profile's `max` is `7`, which DC-R1 forbids exceeding — so its pressure has to come from fabric too. **That last clause has now been measured rather than inferred, and it holds with room to spare: § 3.3a.** Stage 1's quarter of C1 is closed to demand and to the dispatcher menu, and open to fabric |
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

### 3.3a Stage 1's quarter of C1, measured — the demand axis is exhausted and the fabric axis is not

C1's *"permitted by"* column above ends on a hedge: *"`garden-apartments` has a **hard rate ceiling**
… so its pressure has to come from fabric too."* It was an inference from the ceiling rather than a
measurement, and this section is the measurement. **The hedge was right, and the margin is much
larger than the ceiling alone suggests.**

**Instrument.** The shipped `scenario/measure.ts#measureScenario` — the same function
`data/scenario-goals.json` is regenerated by — on `garden-apartments` at stage 1's own 900 s horizon,
over **both** declared seed sets (`tuning-20260730` and `holdout-20260731`, 50 replications each) and
the campaign's own full-run window. Every cell is *passes of 50 on the tuning set* | *passes of 50 on
the holdout set*, and a goal ships only when both read `variable`.

**Result 1 — the four non-wait count goals never move.** `deliver-everyone`, `no-divergence`,
`nobody-abandoned` and `answer-the-demand` are **50 | 50** in every cell of every table below, at
every rate from 3 % to 30 %, at every horizon from 450 s to 3 600 s, and under all thirteen shipped
dispatchers. The single exception in the whole sweep is `no-divergence` at 30 %pop/5 min under
`nearest-car` (48 | 49), and 30 % is 4.3 times the declared maximum. **This building does not
saturate, strand anybody, starve anybody or fail to carry what it is offered**, and no legal setting
makes it. Only `long-waits-under (≤ 10 %)` moves at all, so it is the only column in the tables.

**Result 2 — no demand level the profile declares makes it variable on both sets.** The residential
profile declares `{ min: 3, typical: 5, max: 7 }`, and `null` resolves to `typical` (measured
identical to an explicit `5`, which is worth stating because the stage declares `null`).

| rate %pop/5 min | 3 | 4 | 5 (`null`) | 5.5 | 6 | 6.5 | 7 (`max`) |
|---|---|---|---|---|---|---|---|
| `collective` | 50 \| 50 | 50 \| 50 | **50 \| 50** | 49 \| 50 | 50 \| 49 | 48 \| 50 | 49 \| 50 |

Not one cell is `variable` on both sets. The four that are variable on one are `not-shippable` by
`measure.ts`'s own rule — the classification did not survive a disjoint seed set — which is stage 9's
`deliver-everyone` shape one stage down.

**Result 3 — the demand *shape* does not either.** At the same rates, through
`SimulationDemandOptions`: the PM inversion the residential profile's own `$comment` declares
(`{0.75, 0.15, 0.10}`), a pure up-peak (`{1, 0, 0}`), a flattened `baselineFraction` of 0.05, and a
raised geometric group mean of 3. `collective` reads 49 or 50 on the tuning set in every one of them,
and 50 on the holdout in every one **except** the two group-mean cells — **49 | 47** at `typical` and
**49 | 44** at `max`.

Those two are the only cells in the entire demand sweep that are `variable` on both sets, and neither
is taken, for two independent reasons. A mean group size of 3 is **not declared anywhere for this
profile**: `data/traffic-profiles.json` gives residential `batchSize.mean: 1.8` with no range and the
comment *"families travel together"*, so authoring 3 per stage is inventing traffic data — the same
class of move as exceeding `max: 7`, which the ceiling clause already forbids. And 49 of 50 is 98 %:
a goal the shipped setting misses on one run in fifty is what R12 refuses one run short of, not a
goal a player can be asked about. **A cell that clears the letter of R12 and none of its point is
exactly the fix this section exists not to make.**

**Result 4 — the dispatcher axis inverts the problem instead of solving it.** All thirteen shipped
profiles were measured **as the stage's baseline**, since R12 classifies a goal on the baseline arm
and nothing else:

| baseline | at `typical` | at `max` |
|---|---|---|
| `nearest-car` | **48 \| 46** | **41 \| 46** |
| `eta`, `collective`, `collective-enroute`, `energy-aware`, `zoned-uppeak`, `destination-eta` | 50 \| 50 | 49 \| 50 |
| `fairness-first`, `capacity-aware`, `predictive-balanced`, `auction`, `auction-multi-round`, `destination-panel` | 50 \| 50 | 50 \| 50 |

`nearest-car` is the only profile whose rate is variable on both sets — and **making it the baseline
removes the failure rather than creating one.** DC-1 needs an admitted profile scoring *below* the
published count, the count goals compare with `>=`, and nothing on this building is worse than
`nearest-car`: every other profile is at or above it in both columns. A stage whose baseline is the
worst arm available satisfies R12 and breaches DC-1 in the same move.

**Result 5 — the horizon is a window artefact and is refused rather than used.** At 600 s
`collective` reads 49 | 49 — variable on both — and `nearest-car` reads 45 | 44, below it on both
halves, so DC-1 would formally hold. It is refused: `pctOverLongWait` is a *share* of the rides the
window served, and a shorter run makes it noisier without making the building harder. **A goal that
becomes failable because the run got shorter is § D355's defect wearing a different length**, and
this document will not accept it any more than it accepts a moved bar. For the record, the whole
axis: 450 s `49 | 47` (with a seed unjudgeable on each side), 600 s `49 | 49`, 900 s `50 | 50`,
1 800 s `49 | 49`, 3 600 s `50 | 50`.

**Result 6 — where the knee actually is, past the ceiling.** Diagnostic only; every row below is
forbidden by DC-R1 and is measured so that the distance is a number rather than an impression.

| rate %pop/5 min | 8 | 10 | 12 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|
| `collective` | 48 \| 49 | 49 \| 49 | 47 \| 46 | 39 \| 46 | 40 \| 40 | **25 \| 27** | 10 \| 17 |
| `nearest-car` | 41 \| 46 | 40 \| 40 | 39 \| 33 | 29 \| 30 | 24 \| 28 | 12 \| 16 | 4 \| 8 |

`collective` first lands inside DC-4's `[1/3, 2/3]` band at **25 %pop/5 min**, which is **3.6 times
the residential profile's declared maximum**. That is an independent reproduction of the building's
own note — *"the menu only fully separates at 20 %, three times the residential profile's own declared
maximum of 7 %"* — taken on a different instrument and landing in the same place.

**Result 7 — what fabric buys, and the trap in the obvious version of it.** The building was rebuilt
in memory with **one car instead of two** — through `parseBuilding` → `resolveBuilding`, the door
`shift/growth.ts` uses — at the building's own declared demand, with **no demand change at all**:

| baseline on a one-car Garden Apartments | `long-waits-under (≤ 10 %)` |
|---|---|
| `collective`, `collective-enroute` | **31 \| 32** |
| `predictive-balanced`, `zoned-uppeak` | 44 \| 41 |
| `nearest-car`, `eta`, `fairness-first`, `capacity-aware`, `auction`, `auction-multi-round`, `destination-eta`, `destination-panel` | 45 \| 41 |
| `energy-aware` | 46 \| 42 |

**31 of 50 and 32 of 50 is 62 % and 64 %** — inside DC-4's band on both seed sets, reached by fabric
alone. So C1's fabric route works, and the cheapest possible version of it is available.

**And the obvious version of it is a trap, which is the half worth carrying forward.** On one car
`collective` is the **worst** arm in the catalogue, not the best: with a single car there is no
assignment to make, so what separates the profiles is the order they take the queue in, and
oldest-first costs more travel than nearest-first. Keep `collective` as the baseline and every
admitted profile beats the bar — **DC-1 still breached, and DC-2 newly breached as well**, because a
dropdown move would now clear a stage that nothing cleared before. The shape that satisfies both is a
baseline from the 45 | 41 group with `collective` admitted below it, and that is a *pair* of
decisions — fabric and starting profile together — rather than a car removed.

**Disposition.** None of the above is landed. The demand and dispatcher axes are inside this
document's C1 and are now measured shut; the fabric axis lives in
`data/buildings/garden-apartments.json` and belongs to the campaign rebalance (**#234**) with the
paired starting-profile decision beside it. What *is* landed is the gate:
`packages/viz/src/campaign/difficultyCurve.test.ts` derives DC-1's table half from
`data/campaign.json` and `data/scenario-goals.json`, registers stage 1 with this measurement as its
reason, and checks the register in both directions — so the entry is deleted by whoever fixes it
rather than surviving the fix.

### 3.3b Two claims about stage 1's failure mode did not survive the honest window

Both are recorded here rather than rewritten into §§ 3.2 and 4.2, on § 3.1a's own ground: those
tables are a record of what a named run produced.

1. **§ 3.2's stage-1 *failure mode* cell names the wrong goal.** It reads *"`nearest-car` fails
   `answer-the-demand` where the shipped `collective` meets it"*. Over the campaign's own full-run
   window `nearest-car` meets `answer-the-demand` on **50 of 50 and 50 of 50** — the same as
   `collective` — and what actually separates the two arms on this building is
   `long-waits-under (≤ 10 %)`: `nearest-car` 48 | 46 against `collective` 50 | 50. The cell's
   *reason* survives untouched, and is the more interesting half: the building is sparse enough that
   parking policy alone decides it, and parking policy shows up in the wait tail rather than in
   whether the demand was answered. **Both halves of that sentence are now measured rather than
   inherited from the building's `$comment` — § 3.3c** — and the second half is measured in the
   sharper form: `long-waits-under` is the *only* one of the five per-run kinds any parking value
   moves, on any legal demand level, in either direction.
2. **§ 4.2's F2 is half stale.** *"The **stage** presents a failure a player can produce; the
   **week's day** does not"* was true of the five-minute band and is not true now: § 3.1a records
   stage 1 joining the DC-1 breaches, and § 3.3a measures why. **F2's actual claim still stands** —
   the stage and the week's day 1 are two products on one building and must not be conflated — but
   the evidence for it has moved. They are now failing for *different* reasons: the week's day 1
   misses nothing on 0 of 30 seeds because the bars are loose against this building, and the stage
   has no failable goal because the shipped setting never misses one.

### 3.3c The parking axis, measured — it decides the stage and it does not make a goal failable

§ 3.3a swept demand, demand shape, dispatcher and horizon. It did not sweep the axis
`data/buildings/garden-apartments.json` names in its own first sentence:

> **Simplest case. Parking policy dominates here: traffic is sparse enough that idle car position
> matters more than assignment cleverness.**

`idle.parkingStrategy` is declared in `packages/core/src/dispatch/parameters.ts` with five values —
`stay` (the default, and what `collective` runs), `lobby`, `zone-center`, `predicted-demand`,
`fixed-floor` — and its own schema says *"on sparse-traffic buildings this stage dominates everything
else."* This section is that sweep. **The building's claim is true and the axis still does not
produce a failable count goal**, which are two separate findings and are reported separately.

**Instrument.** The same one §§ 3.3a–3.3b used, so the numbers are comparable cell for cell: the
shipped `scenario/measure.ts#measureScenario` on `garden-apartments` at stage 1's own 900 s horizon,
both declared seed sets (`tuning-20260730` and `holdout-20260731`, 50 replications each), the
campaign's full-run window. The parking value rides on the **arm**, which is where `BatchRequest`
puts a dispatcher and is why the passenger populations are unmoved: `traceKeyOf` does not read the
dispatcher, so every cell below sees the same fifty traces as § 3.3a's. The one thing added was a
twelve-line optional `edit` on the measured arm; it is **not landed**, because nothing in the shipped
tree would call it and a measurement instrument with no caller is this repository's signature defect.

Every cell is *passes of 50 on the tuning set* | *passes of 50 on the holdout set*.

**Result 1 — the four non-wait kinds still never move, on this axis either.** `deliver-everyone`,
`no-divergence`, `nobody-abandoned` and `answer-the-demand` are **50 | 50** in *every* cell of every
table below — all five parking values, both reposition dials, and all four legal demand levels. That
is an independent reproduction of § 3.3a's Result 1 on an axis it did not touch, and it is why
`long-waits-under (≤ 10 %)` is the only column below.

**Result 2 — at the stage's own demand, one cell is variable on both sets and it is a park at the
top floor.** Baseline `collective`, `arrivalRatePctPop5min: null`:

| parking | `long-waits-under (≤ 10 %)` |
|---|---|
| `stay` (shipped) | 50 \| 50 |
| `lobby` | 50 \| 50 |
| `zone-center` | 49 \| 50 |
| `predicted-demand` | 50 \| 50 |
| `fixed-floor` at the lobby | 50 \| 50 |
| `fixed-floor` at floor 2 · 3 · 4 | 50 \| 50 · 50 \| 50 · 50 \| 50 |
| `fixed-floor` at floor 5 | 48 \| 50 |
| `fixed-floor` at floor 6 (the top) | **49 \| 49** |

**It is refused, on § 3.3a's own two grounds and a third.** 49 of 50 is 98 %, which is *"a goal the
shipped setting misses on one run in fifty"* — the shape that section refused for the group-mean
cells one run short of R12. `nearest-car`, the profile that would have to miss it, scores 48 | 46:
the whole of the failure a player could produce is **one run in fifty on one set and four on the
other**, against a bar that itself moved by one. And the third ground is mechanical rather than
statistical: reaching that bar at all means putting a parking value on the stage's **baseline arm**,
and no field of `data/campaign.json` carries one. Adding it is not a data change — `stageRun.ts`
builds the baseline arm from `startingProfileId` alone, and `dev/campaignPanel.ts` computes every
admission against `profileById(startingProfileId)`, so a stage whose real baseline was an edited
vector would tell a player *"runs the same system on every declared dimension"* about a move that
changes the run. The axis is **not exhausted**; what is closed is reaching it from `data/`.

**Result 3 — crossing parking with legal demand does not rescue it.** The residential profile
declares `{ min: 3, typical: 5, max: 7 }` and DC-R1 forbids exceeding `max`. Every parking value at
every legal level, baseline `collective`; only the cells variable on **both** sets are listed, and
the rest are `constant-pass` on at least one:

| rate %pop/5 min | cells variable on both sets |
|---|---|
| 3 | none |
| 5 (`null`) | `fixed-floor` at the top — 49 \| 49 |
| 6 | `predicted-demand` 48 \| 49 · `fixed-floor` at 4 — 49 \| 49 · at 5 — 49 \| 49 |
| 7 (`max`) | `predicted-demand` 48 \| 49 · `fixed-floor` at 2 — 49 \| 49 · at 4 — 49 \| 49 · at the top — **46 \| 49** |

The widest margin in the whole legal box is **46 | 49** — 92 % and 98 % — and it needs the demand at
its declared ceiling *and* a parking value on the baseline arm. Both reposition dials
(`repositionThresholdS` at 0 and `repositionEnergyWeight` at 0, against their shipped 2 and 0.2) were
crossed with every cell above and moved no classification.

**Result 4 — and this is the finding worth carrying forward: parking is what clears the stage.**
Run through the shipped `campaign/stageSequence.ts#runStageToVerdict`, both batches, as a player's
edited vector against the stage's own `collective` baseline:

| the player's move | tuning batch | holdout | verdict |
|---|---|---|---|
| **park in the middle of the building** (`zone-center`) | ahead on **average wait** and **door-to-door time**, interval excludes zero, nothing resolved against | **agrees** | **cleared** |
| `fixed-floor` at floor 3 · at floor 4 | ahead on **three** measures | agrees | cleared |
| `predicted-demand` | ahead on average wait and 95th-percentile wait | **does not agree** | not cleared — O7's shortcut, exactly |
| **park at the ground floor** (`lobby`) | **behind** on average wait and door-to-door | not run | not cleared |
| `fixed-floor` at the lobby | **behind** on the same two | not run | not cleared |
| `fixed-floor` at the top | **behind** on three | not run | not cleared |
| `zone-center` with a 30 s deadband, or an energy price of 2 | nothing separated the two settings | not run | not cleared |

**So stage 1 has a DC-3 witness, and § 3.1's *ten of ten* was measuring the stage's `editable` list
rather than the stage.** The witness existed the whole time; `campaign/dimensions.ts#admitProfile`
refused to run it, because the stage opened three weight dials and not the dimension its own building
says decides it. That is a **scope** decision, which § 3.3's C3 already distinguishes from a
difficulty one, and it is landed: stage 1's `editable` list now carries `idle.parkingStrategy` and
the two dimensions moving it brings to life.

**Three dimensions and not one, and `admitProfile` is why.** `idle.repositionThresholdS` and
`idle.repositionEnergyWeight` both declare `activeWhen: { 'idle.parkingStrategy': [everything but
`stay`] }`, so moving the strategy makes two dimensions **appear** — and `dimensions.ts` says in as
many words that *"a dimension that appears or disappears is a move"*. Measured: with the strategy
alone opened, the witness is still refused with *"also moves 2 dimensions this stage does not open:
idle.repositionThresholdS (— → 2), idle.repositionEnergyWeight (— → 0.2)"*. Stages 4, 6 and 8 already
list exactly this trio, so the shape is the campaign's own rather than a new convention.

**Widening changed nothing about the dropdown.** The shipped profiles the stage admits are
`{nearest-car, eta, collective}` with the idle dimensions open and `{nearest-car, eta, collective}`
without them — `zoned-uppeak` and `predictive-balanced` are the two profiles that park somewhere, and
both are refused on weights the stage does not open (`weights.zoneAffinity`;
`weights.predictedDemand` and eight others). **DC-2 and DC-2b are therefore untouched by this
section** and neither was re-measured.

**The standing requirement, applied and passed.** *Move the control and require the run to change,
compared on the legs.* On stage 1's own demonstration replication —
`stageRun.ts#demonstrationConfigFor`, the run the fail-state report replays — all five parking values
produce different legs from `stay`, and each gated dial produces different legs against a fixed park.
The two gated dials pass in the interpretable direction: a 30 s deadband or an energy price of 2
makes every repositioning trip not worth taking, so the run collapses **byte-identically onto
`stay`** and is different from the same park at the shipped settings.
`packages/viz/src/campaign/stageOneParking.test.ts` holds all of it.

**And the copy is honest because the naive answer loses.** The brief hints the fix without naming it,
which is only defensible if *"park them at the ground floor"* is not automatically right. On this
building it is measurably wrong — behind on average wait and on door-to-door time — and the middle of
the building wins. The two losing moves are pinned in the same file, so a change that made the lobby
win would take the brief's last sentence down with it. The copy names **no count**, deliberately: the
briefing already derives *"judged over 50 runs"* from `stage.replications`, and an authored sentence
repeating it would be a second source for one number and stale the day the batch size moved.

### 3.3d A structural note on DC-1 that the parking sweep made unavoidable

Worth writing down because three lanes have now looked for a failable count goal on stage 1 and the
rule's shape is part of why it is hard.

`campaign/judge.ts` sets a count goal's bar to **the shipped setting's own measured count on these
seeds** and scores `met = candidate.passes >= target`, refusing to judge at all when the baseline arm
does not reproduce `target`. Two consequences follow arithmetically:

1. **A stage's starting setting can never fail one of its own count goals.** It scores the bar by
   construction. So a count goal is never *"here is a problem, fix it"*; it is only ever *"here is a
   trap, do not fall into it."*
2. **DC-1 is therefore a rule about punishing a wrong move**, not about presenting a problem. The
   goal that presents a problem the player fixes is `beat-the-baseline`, which every stage carries
   and which § D161's *"standing still clears nothing"* makes unmet on the control everywhere.

Neither is an argument for weakening DC-1 — a campaign where no wrong move is ever punished teaches
less, and the rule catches that. What it does mean is that **DC-1 green and *a new player meets a
comprehensible problem* are different claims**, and stage 1 is the clearest case: what a first-time
player can now see, understand and fix is where the cars wait, and that arrives through
`beat-the-baseline` rather than through anything DC-1 measures. A lane asked to make stage 1 teach
should read this before optimising for the gate.

### 3.3e Should a stage start on a *point* rather than on a profile? — refused, and the two cases behind it are answered separately

§ 3.3c Result 2 closed a route with a sentence rather than with a measurement:

> reaching that bar at all means putting a parking value on the stage's **baseline arm**, and no
> field of `data/campaign.json` carries one … The axis is **not exhausted**; what is closed is
> reaching it from `data/`.

This section asks whether that field should exist — whether `campaign/types.ts#StageDispatcher`
should carry an authored `EditedVector` beside `startingProfileId`, so that a stage starts on a
**point of its own declared search space** rather than on one of the thirteen shipped profiles.

**Two cases were put for it, and separating them is the first thing this section does**, because
three previous lanes were spent conflating them (§ 3.3a, § 3.3c, GitHub issue **#270**):

- **the gameplay case** — a starting setting that is *visibly wrong* hands the player a building
  being served badly rather than a dispatcher to beat, which is what
  [`34-problem-per-mode.md`](34-problem-per-mode.md) says every mode lacks and what **#208** is
  about;
- **the DC-1 case** — it would give stage 1 the failable count goal § D355 took away.

**Verdict, stated before the evidence so it cannot be read as a hedge.** **The DC-1 case is
refused on a measurement: the change does produce a failable count goal, and it breaches DC-2 or
DC-2b — one or the other, unavoidably — in the same move.** The gameplay case is refused *for the
campaign* and **not** as a mechanism: the mechanism already ships, in `data/fixit-cases.json`, on
the mode whose building can actually show the fault. **A decision number is owed** (next free
is D366).

#### The re-measurement — § 3.3c's legal box reproduces cell for cell

§ 3.3c's numbers were taken on a probe it says was *"not landed, because nothing in the shipped tree
would call it"*, so they are not re-derivable from `main` and nothing here may lean on them
untested. Re-measured on `integration/m2-wave-c`:

| cell (baseline arm, `long-waits-under ≤ 10 %`) | § 3.3c | re-measured |
|---|---|---|
| `collective` at `null`, no edit — the shipped stage | 50 \| 50 | **50 \| 50** |
| `collective` at `max` (7 %pop/5 min), no edit | 49 \| 50 | **49 \| 50** |
| `fixed-floor` at the top, at `null` | 49 \| 49 | **49 \| 49** |
| `predicted-demand`, at 6 | 48 \| 49 | **48 \| 49** |
| `fixed-floor` at 4, at 6 | 49 \| 49 | **49 \| 49** |
| `fixed-floor` at 5, at 6 | 49 \| 49 | **49 \| 49** |
| `predicted-demand`, at `max` | 48 \| 49 | **48 \| 49** |
| `fixed-floor` at 2, at `max` | 49 \| 49 | **49 \| 49** |
| `fixed-floor` at 4, at `max` | 49 \| 49 | **49 \| 49** |
| **`fixed-floor` at the top, at `max` — the widest cell in the legal box** | **46 \| 49** | **46 \| 49** |

**Instrument, stated so the figures are re-derivable without the harness.** It is
`scenario/measure.ts#measureScenario`'s own `runSeedSet` — the same
`shift/reportWindow.ts#shiftReportWindowFor` (`garden-apartments` → `full-run`), the same
`tuning-20260730` and `holdout-20260731` at 50 replications each, the same 900 s, the same
`scenario/goals.ts#measureGoalRate` behind `asPerReplicationGoal` — with an `edit` on the single
measured arm. That `edit` needs nothing new: `batch/types.ts#BatchArmRequest` already carries it and
`batch/runBatch.ts` already resolves it through `controls/editedProfile.ts#resolveEditedProfile`.
**Nothing in `packages/` was changed to take these numbers**, and the driver is ~70 lines outside
it, run as `node <driver> <repo-root>` over a JSON list of cells.

**The harness was validated before it was believed**, which is the only reason the agreement above
counts for anything: at the shipped stage-1 configuration it returns **50 | 50**, which is what
`data/scenario-goals.json` publishes for that scenario, and at 7 %pop/5 min under an unedited
`collective` it returns **49 | 50**, which is § 3.3a's own cell. Two independent anchors, one from
`data/` and one from a section this one is checking.

**And the disposition is unchanged from § 3.3c's: the probe is still not landed.** That is now the
**second** section of this document whose published figures come from an instrument the tree cannot
run, and it is `RISKS.md` **R38**'s shape — a number nothing re-derives. It is tolerable only
because the two anchors above are re-derivable from the shipped tree, and the fix is row 1 of the
scoped change priced below.

#### The DC-1 case: it works, and it breaks the campaign's other two rules in the same move

Take the widest cell as the proposal makes it — stage 1 starting on `collective` **with the idle
cars parked at the top floor**, at the residential profile's declared `max`. The bar a count goal is
judged against is the baseline arm's own count (§ 3.3d), so the bars become **46** on the tuning
seeds and **49** on the holdout. Measured, all five per-run kinds, both seed sets:

| arm | `deliver-everyone` · `no-divergence` · `nobody-abandoned` · `answer-the-demand` | `long-waits-under` |
|---|---|---|
| **baseline** — `collective` + park at the top (the bar) | 50 \| 50 in every kind | **46 \| 49** |
| `collective` as shipped — *put the parking back* | 50 \| 50 in every kind | 49 \| 50 |
| `eta` | 50 \| 50 in every kind | 49 \| 50 |
| `nearest-car` | 50 \| 50 in every kind | **41 \| 46** |

**DC-1 is satisfied.** `nearest-car` scores below the bar on both halves — 41 against 46, and 46
against 49 — so an admitted profile misses a non-comparative goal, which is the thing three lanes
have gone looking for on this building and not found.

**And then the same cell breaks DC-2.** Run as a stage — two arms, one seed set, `batch/report.ts`'s
paired-t rows, which is what `campaign/judge.ts` reads `beat-the-baseline` off:

| the player's dropdown move | tuning batch | holdout | `beat-the-baseline` |
|---|---|---|---|
| **`collective`** — the same base profile, unedited | ahead on average wait and door-to-door, nothing against | ahead on average wait, 95th-percentile wait and door-to-door | **met, both halves** |
| **`eta`** | ahead on all three, nothing against | ahead on average wait and 95th-percentile wait | **met, both halves** |
| `nearest-car` | **behind** on four rows | behind on two | not met |

Both of the first two also meet every count goal (49 ≥ 46 and 50 ≥ 49). **So the stage clears from
the dropdown, two ways**, and one of them is *select the profile the stage says it starts on* —
which is to say the menu now contains a one-click undo of the fault. That is precisely #200's AC3.

#### The dilemma is structural, and `admitProfile` decides which horn — not the author

The obvious repair is to close `idle.parkingFloorIndex`, so the undo cannot be selected. Run
through the shipped `campaign/dimensions.ts#admitProfile` against the edited baseline, over all
thirteen profiles:

| stage 1's `editable` list | admitted profiles | which rule breaks |
|---|---|---|
| **as shipped** (`idle.parkingFloorIndex` **closed**) | **none — all thirteen refused**, every one on *"also moves 1 dimension this stage does not open: `idle.parkingFloorIndex` (6 → —)"* | **DC-2b.** The dropdown is empty, `campaignPanel.ts#smallestAdmissibleChange` returns `undefined`, and the panel tells a first-time player that the weight editor is the only way to play — stage 8's and stage 10's shape, on the **first** screen anybody meets |
| widened by `idle.parkingFloorIndex` | `nearest-car`, `eta`, `collective` | **DC-2.** Two of the three clear the stage, as measured above |

Both horns are forced, and neither is a fact about this cell:

> **An authored starting vector `P + δ` is either inside the stage's `editable` list or outside
> it. Inside it, the shipped profile `P` is admitted and selecting it is *undo the fault*, which is
> the dropdown clearing the stage. Outside it, every shipped profile moves a dimension the stage does
> not open, so `admitProfile` refuses all thirteen and there is no dropdown at all.**

The escape a reader will think of next — keep δ inside `editable` but pick a `P` whose undo still
misses something — does not exist on this building: § 3.3a Result 1 and § 3.3c Result 1 both
measure that four of the five per-run kinds are **50 | 50** in every legal cell, so there is no
second goal for the undo to fail. It is closed for the same reason the demand axis was.

#### And the prize is outside DC-4's band even where it works

Say the numbers plainly rather than letting *"it would unblock DC-1"* carry the argument.
`46 | 49` is **92 % and 98 %** of runs passing at the *bar*, and the failure a player can actually
produce — `nearest-car` at `41 | 46` — is **82 % and 92 %**. DC-4 asks for the band `[1/3, 2/3]`.
Every one of those four figures is between one and a half and three times the top of it.

Compare what the fabric axis already buys on the same building for the same trouble: § 3.3a
Result 7's one-car rebuild reads **31 | 32 — 62 % and 64 %** — inside the band on both seed sets,
at the building's own demand, with no demand change at all. **This route is the more expensive way
to reach a worse number**, and it needs the demand at its declared ceiling on top. (The fabric route
is refused too, and for its own reasons — #270 measures that it makes two of stage 1's three
shipped dials inert and breaks 78 tests. Neither route being available is the finding; it is not an
argument for this one.)

#### The gameplay case, which is the stronger one, and which is refuted on this building rather than in principle

The premise is right and this section does not weaken it: *"here is a building being served badly,
work out why"* is a better opening than *"here is a dispatcher, beat it"*, and a starting setting
chosen from thirteen well-tuned shipped profiles cannot express the first. § 3.3d's structural note
is the reason this is not a DC-1 question at all — a count goal is *"here is a trap, do not fall
into it"* and never *"here is a problem, fix it"* — so the sentence *the starting setting is the
problem the player is handed* is a claim about `beat-the-baseline` and about what the player can
**see**, which is `docs/34`'s subject and not this document's gate.

**Three things measured elsewhere refuse the specific instance, and all three are about seeing.**

1. **On this building, at day one, there is usually nothing to see.**
   [`34-problem-per-mode.md`](34-problem-per-mode.md) § 9.3 measures `garden-apartments` under
   `collective` at its own typical rate over 20 seeds: the landings are **empty about 91 % of the
   time**, and on **16 of 20 seeds no instant in the whole hour** has anybody who has been waiting
   sixty seconds. A starting setting cannot hand the player a visible problem on a building that
   does not display one.
2. **A parked car has no mark on either renderer.** `docs/34` § 3.2 and § 9.2: an idle car is a
   stopped car with `direction === 0` and near-zero load, pixel-identical to any empty car that
   happens to be standing there. The cars' *positions* are drawn, so *"all of them are up at the
   top"* is weakly legible; *"and they are parked there on purpose"* is not drawn anywhere. `docs/34`
   § 10 row 12 (`PM-PARK`) prices the fix as **large**, and it is a precondition for this proposal
   rather than a companion to it.
3. **The tableau is inverted here.** `PM3` asks for cars stopped low and people standing high, both
   at once and both persistent. This cell gives cars stopped *high* and, 91 % of the time, nobody
   standing at all.

**And the mechanism the gameplay case actually wants already ships, one mode over.**
`data/fixit-cases.json`'s `sleeping-sky-lobby` starts the player on `collective` with
`asBuilt.patch.dispatcher.idle.parkingStrategy: "lobby"` — a deliberately wrong *dispatcher
parameter* as the given state, on `vertical-city`, where eight shuttles standing at the street while
sky-lobby queues build is a thing a player can point at, with a named complainant on floor 62
attached to it. That is this proposal, built, in the mode `docs/34` § 9.4 says the parking lesson
should land in. **The campaign does not need a second authoring surface for it; what stage 1 needs
is not to be the place it happens.**

#### What it would have cost, priced so the refusal is not free

Enumerated rather than estimated, because a refusal that has not counted the work is an opinion.
**Fourteen non-test sites in six files**, from `grep -rn startingProfileId packages/viz/src`:

| where | sites | what changes |
|---|---|---|
| `campaign/types.ts` | 1 | the field on `StageDispatcher` |
| `campaign/parse.ts` | 4 (3 checks) | the profile-exists check, the `str()` read — and the one that matters, the cross-check at `:204` pinning the stage's arm to `published.dispatcherProfileId`. A starting **vector** needs the same pin or it becomes the one part of the baseline the bar is not tied to, which is the defect `checkConfiguration` exists to prevent |
| `campaign/stageRun.ts` | 1 | the baseline arm gains `edit` — **and the argument against it, written in that function's own parameter docstring** (*"An edit on the baseline would move the bar and the run that is supposed to check it in the same step"*), has to be rewritten rather than deleted: it is answered by regenerating the bar with the vector, and the answer belongs where the objection is |
| `campaign/brief.ts` | 1 | `:86`'s *"starting on collective"* becomes false the moment a vector rides on it — a stale player-facing sentence, § D227's class |
| `dev/campaignPanel.ts` | 5 | `openingProfileFor`, `smallestAdmissibleChange`, `drawIntent`, `admissionNode`, `admitted` — **this is the half that makes it a design question.** All five compare against `profileById(startingProfileId)`; unfixed, the panel tells a player choosing the control *"both settings are collective — the two arms are the same system"* about a choice that changes the run. A shipped falsehood on the first screen |
| `honesty/run.ts` | 1 | `:196` builds the demonstration replication from the unedited profile, so the honesty corpus would sweep **a run the product never makes** |

Plus `data/campaign.json` (10 stages), and the measurement side that has to move with it or the bar
is set by a different arm: `scenario/measure.ts#GoalScenario` and its `runSeedSet`,
`scenario/candidates.ts`'s `stage()` helper and ten rows, `scenario/published.ts#PublishedScenario`,
and a regeneration through `scenario/regenerate.test-helper.ts`.

**Blast radius of that regeneration, estimated.** Small in rows and awkward in kind. If only stage 1
gains a vector, only stage 1's records move — but `long-waits-under` moves **bucket**, from
`configurationFacts` (`constant-pass 50 | 50`) to a shippable `goals` entry (`variable 46 | 49`), and
`campaign/parse.ts` refuses a stage declaring a goal outside its measured bucket, so
`data/campaign.json` has to declare the goal back that § D355 removed. The stage's `traffic` also
has to move to `7`, which `checkConfiguration` pins to the published scenario. Four test surfaces
follow: `campaign/campaign.test.ts`, `campaign/stageOneParking.test.ts`,
`campaign/reportWindow.test.ts` and `campaign/difficultyCurve.test.ts` — whose `OUTSTANDING` register
would have to lose stage 1, and whose both-directions check is what would go red if it did not.
`scenario/goalRates.test.ts` re-derives the table and would follow the regeneration. Nine other
stages, eight other buildings and every published interval in `experiments` are untouched, which is
the one cheap thing about it.

#### Verdict, and what would change it

> **Refused. The DC-1 case is refused on a measurement — the change buys DC-1 and spends DC-2 or
> DC-2b to do it, and the number it buys is 92 %/82 % against a band of [1/3, 2/3]. The gameplay
> case is refused for the campaign only, and it is the half worth revisiting.**

The two are not the same refusal and must not be quoted as one. § 2.5's closed form is why the first
is decisive: *something must go wrong, the easy move must not fix it, and a real move must* — and a
change that satisfies the first third by breaking the second has moved the breach rather than closed
it. § 3.3a Result 7 predicted exactly this shape for the fabric route (*"DC-1 still breached, and
DC-2 newly breached as well"*); it arrives here through a different door and it is now measured on
both, which is what makes it a property of the campaign's rules rather than of either route.

**Four things would change the answer, and only the first two change it for stage 1.**

1. **A second per-run goal kind that moves on this building.** Four of five are `50 | 50` in every
   legal cell of every sweep anybody has run here. That is what makes the undo unpunishable, and it
   is #270's own route 2. **This is the highest-value one**: it would reopen the demand and parking
   axes as well, not just this one.
2. **A stage whose `editable` list can hold δ while the undo still fails something.** Requires (1)
   on this building; on another building it may already be true and nobody has measured it.
3. **`PM-PARK`** — `docs/34` § 10 row 12, an idle state on `FrameCar` marked by both renderers. It
   does not touch DC-1 at all, and it is the whole of what would make a wrong starting setting
   *visible* rather than merely present. Until it lands, *"the player opens it and sees a building
   doing something visibly wrong"* is not a claim the renderers can support for a parking fault.
4. **A different stage.** Everything above is measured on `garden-apartments`, which is *designed*
   to be easy and is two matrix cells, three golden digests and two fixit cases besides. The
   structural dilemma is general; the numbers are not, and a stage on a building whose menu
   separates would have to be re-measured rather than inferred from these.

**What is landed by this section: nothing but the section.** No source file, no test and no `data/`
file was touched, and the register in `campaign/difficultyCurve.test.ts` still carries stage 1 with
§ 3.3c's reason — correctly, because this section did not fix it either. **C1's stage-1 quarter now
has three axes measured shut** — demand (§ 3.3a), parking-from-`data/` (§ 3.3c) and the starting
vector (here) — and one axis measured open and refused for its consequences (fabric, § 3.3a Result 7
and #270).

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

**One thing `DC-4`'s band cannot see, and where it is specified instead.** A day may miss a goal on a
single rider at minute 41 and be invisible for the other fifty-nine minutes, which satisfies `DC-4`
and satisfies nothing #208's AC2 asks for (*the failure is legible on the stage before the report
explains it*). [`34-problem-per-mode.md`](34-problem-per-mode.md) `PM-TT2` states the additional
clause — a landing holding somebody in the third wait band for at least 120 contiguous seconds — and
its § 9.3 measures `garden-apartments` against it: at the shipped day-one configuration the landings
are empty about **91 %** of the hour, and on **16 of 20 seeds** no instant exists at which anybody has
been waiting sixty seconds. That is a second, independent reason the tutorial slot cannot be fixed on
this building, alongside GitHub issue #270's sweep.

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

**The campaign arm's file now exists and holds one clause of one rule**, so the lane that builds the
sweep should expect to grow it rather than create it. `campaign/difficultyCurve.test.ts` decides
DC-1's **necessary** half from `data/campaign.json` and `data/scenario-goals.json` alone — a stage
that declares no non-comparative goal whose published rate is `variable` on both seed sets has
nothing any admitted profile could fail — and it runs in milliseconds because it simulates nothing.
It carries a register with stage 1 in it, checked in both directions per rows 5 and 6 below. Row 1 as
specified is the *sufficient* half and still needs the batches: having a variable goal is not the
same as some profile missing it, which is exactly how stages 8, 9 and 10 pass the file today while
breaching DC-1.

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
| 2 | any admitted shipped profile meets every bar on any stage (`metOnTuningSeeds`) | DC-2 |
| 3 | a stage admits fewer than two non-control profiles | DC-2b |
| 4 | a stage's registered witness does not clear | DC-3 |
| 5 | a stage has no witness **and** is not in `OUTSTANDING` | DC-3 |
| 6 | a stage is in `OUTSTANDING` **and** its witness clears | DC-3 — the register in both directions |
| 6b | a witness clears the tuning batch and not the holdout batch | DC-3b — post-#255 that is not a caveat on a witness, it is the absence of one |
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
| **O8** | **The second batch has no shipped caller** | O7's residual. `campaign/judge.ts` asks for a holdout batch and `campaign/stageRun.ts` builds the request for it; `dev/campaignPanel.ts` runs one batch and hands over one, so every stage it judges comes back *not validated* — the refusal is honest and it is not a verdict a player can act on. Wiring the panel to run both is a lane of its own, and until it lands the gate is enforced in the suite and refused in the product |
| **O7** | ~~The campaign judges on the seeds the player tunes against~~ — **CLOSED**, GitHub issue **#255** | It was closed the way this row said it would have to be: by judging on the holdout. `campaign/judge.ts` clears a stage only when every goal is met on the tuning batch **and** on a second batch over `stage.holdoutSeeds`, against that seed set's own published counts — so `data/scenario-goals.json`'s `holdout` block, which had been validated, published, quoted in the briefing and read by nothing that could change a verdict, is now half of what a bar is. The seed is checked rather than named, so the tuning batch handed over twice is refused. **The one measured witness no longer clears** (§ 2.4), which is the closure showing its work. What is *not* closed and is now O8: `dev/campaignPanel.ts` runs one batch, so the shipped Campaign tab cannot supply the second one and reports the stage as unvalidated until it is wired |

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
