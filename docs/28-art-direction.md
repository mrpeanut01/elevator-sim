# 28 — Art direction, and the stage visual style guide

**Issue:** #195 · **Milestone:** M1, pre-production · **Written:** 2026-08-24 on
`claude/elevator-sim-charter-kickoff-rexfw8` · **Character:** a specification of the visual language
that already exists, plus a build order for the one surface nobody owns.

M1 writes no production code. No `.ts` file, no `.json` file, no CSS and no shipped string is changed
by this document. Every rule below is written so that a later lane can execute it without further
judgement, and every rule that could be checked is written as a property a test can hold.

**Series are cited with their document** — `charter P3`, `docs/10 R6`, `guide § 7.2`, `docs/21 § 6`
— never bare ([§ D343](../DECISIONS.md)). *Guide* means
[`design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md);
`ENGINE_CONTRACT § N` means its sibling
[`design/design_handoff_casual_mode/ENGINE_CONTRACT.md`](design/design_handoff_casual_mode/ENGINE_CONTRACT.md).
The two number their sections independently and **§ 14 means something different in each**, which is
why neither is cited bare. [`../CLAUDE.md`](../CLAUDE.md) makes both canonical for the interface.

---

## 1. What this document is, and the one sentence it is built on

Most of this product's visual language is **already decided, already shipped, and already pinned by
tests**. An art-direction brief that restated it would create a second opinion about colour, and a
second opinion about colour is how this repository got six private palettes and a shaft band that was
the same string as a credential-restricted floor ([§ D336](../DECISIONS.md)).

So this document sorts every visual question into three registers and treats each differently:

| register | what this document does | where the authority lives |
|---|---|---|
| **Already specified and shipped** | cites it, and states the property that must survive | `everyday/tokens.ts`, `guide § 19`, [§ D336](../DECISIONS.md) |
| **Shipped, and divergent from the handoff** | names the divergence and the constraint that forced it, and forbids reverting it silently | [`12-design-handoff.md`](12-design-handoff.md) § 4, [§ D336](../DECISIONS.md) |
| **Genuinely unowned** | specifies it | § 5–§ 7 below |

The governing sentence is [`../CLAUDE.md`](../CLAUDE.md)'s, and it is worth reading twice before any
pixel is argued about:

> **The handoff wins every disagreement about what the screen looks like, and the simulator wins
> every disagreement about what a number means.**

Both halves bite. The handoff is a prototype with its own toy simulator — its report sheet computes
average wait as `28 + (100 − pct) × 0.9` — so its layout, copy and interaction are the deliverable
and its numbers are not. But a *boundary* is a number, which is why the stage's wait ramp breaks at
30/60/120 s and not at the guide's 30/75/150 (§ 5.6), and why the stage opens on the run's own
morning rather than the guide's literal 06:00 (§ 5.3).

### 1.1 What was already specified, and what this document actually adds

Stated plainly, because a brief that claims to invent a palette it merely transcribed is the same
defect as a figure re-measured per branch:

- **Palette, type, radii, gaps** — specified in `guide § 19`, transcribed once into
  `packages/viz/src/everyday/tokens.ts`, and pinned three ways by `dev/tokens.test.ts`. This document
  adds nothing to them and § 2 says so.
- **The elevation's contents** — specified in `guide § 7.2` and **built**: floor slabs, tenant
  gutter, shaft wells as light voids, dark cars with amber doors, rider marks, `n/capacity`, the
  direction arrow, the dashed out-of-service well, one capsule per waiting rider coloured by wait
  age, the `+N` overflow, the legend, the alarm strip. All of it is in
  `packages/viz/src/everyday/stageScreen.ts` today.
- **What this document adds** is four things nobody owns, and they are all in § 5: how a **shut
  door** reads, what the stage **opens on**, how **pressure becomes legible before the report names
  it**, and the **cap conventions** — plus the two constraints that bound all four, which are
  `charter P3` (§ 4) and the measured accessibility floor (§ 7).

### 1.2 The rules this document adds, in one table

Twenty-six, all in three families, all stated as properties rather than preferences so that a lane
can turn each into a test. Anything in this document not carrying one of these labels is context.

| family | rules | section |
|---|---|---|
| **AD-S** — the stage | S1–S3 the shut door · S4–S6 the opening · S7–S10 legible pressure · S11–S14 the caps · S15–S16 the wait ramp | § 5 |
| **AD-M** — motion | M1 no easing · M2 no transitions on the playhead · M3 state not events · M4 no rider entrances | § 6 |
| **AD-A** — accessibility | A1 never colour-only · A2 measure against the real ground · A3 a live region is not a paint target · A4 refusals are drawn · A5 mono figures with units and `n` · A6 motion is bounded | § 7 |

### 1.3 The premise this document had to refute first

Issue **#212** is an M2 **P0** asking to *"rebuild the stage so the crowd is visible"*, and the
verification wave **largely refuted it** ([`../ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)
§ U). People, doors and queues are all drawn. The reporter was demonstrably on the right screen — the
issue quotes the `0/10` occupancy label, which only this renderer produces. Two narrow causes account
for the whole perception:

1. **The stage opens paused at the start of the day**, when nobody has arrived, so the true picture
   *is* an empty building.
2. **A shut car is painted entirely amber**, so door state is drawn and is invisible in the state a
   car spends most of its time in.

**This is a door-fill inversion and an opening-playhead decision, not a renderer rebuild**, and this
document specifies both rather than authorising the rebuild. That distinction is the single most
valuable thing in here: it converts a P0 rewrite of a 954-line canvas module into two bounded
changes with acceptance tests.

---

## 2. The visual language that already exists

### 2.1 One palette module, two products

`packages/viz/src/everyday/tokens.ts` is `guide § 19` transcribed once — named frozen objects, plain
strings and numbers, **no helper functions and no CSS assembly**, because a token module that
composed CSS would be a second opinion about layout. The consumers build inline styles, which is the
handoff's own rule (*"Inline styles throughout, no stylesheet"*).

Both shells read that one module. `render/tokens.ts` — the single source for everything the canvas
draws — takes every § 19-sourced value **by import** from it, never by a third copy
([§ D336](../DECISIONS.md)). `dev/tokens.test.ts` asserts that in three directions: the resolver
against each `:root` block, `everyday/tokens.ts` against `:root`, and the guide's § 19 fenced block
against both, **read as text**.

**The art-direction rule that follows is one sentence: a colour that is not in `everyday/tokens.ts`
is not a colour this product has.** `dev/paletteLiterals.test.ts` sweeps for hex literals in `dev/`
in both directions, and its allowlist is **empty** — a measurement, not an aspiration, with a planted
entry as its negative control ([§ D192](../DECISIONS.md)'s discipline applied to colour). A brief
that introduced a shade would break a green test on the commit that drew it, which is correct.

### 2.2 The five values that are not § 19's, and may not be reverted

[§ D336](../DECISIONS.md) made the paper palette the Engineer shell's shipped appearance, and in the
same commit recorded that **five § 19 values cannot carry 9–13 px text on § 19's own paper**. These
are measurements, not preferences:

| claim | § 19 | measured on paper | shipped |
|---|---|---|---|
| eyebrow / secondary ink | `#8D8271` | 3.38:1 | `#5d564b` |
| accent | sun `#F2A63B` | **1.83:1** | `#8d6a2f` |
| warning band | sun | **1.83:1** | `#8a6212` |
| cleared / good | moss `#4F8A5B` | 3.68:1 | `#43774d` |
| alarm / abandoned | `#D4573A` | 3.60:1 | terracotta `#B8462B` |

Each shipped value is the same **family** at the value the floor demands; the last is § 19's own
deeper sibling rather than an invention. `dev/tokens.test.ts` asserts **both halves of every row** —
that § 19's value still fails the floor that forced the deviation, and that the shipped value clears
it. So a guide revision that moved a value past the floor turns the first half red and the § 19 value
is re-adopted, rather than the deviation outliving its reason.

**Do not propose reverting these to § 19, and do not propose a sixth deviation without the same two
assertions.** The rule is `docs/21` § 2.2 (5): *the simulator's accessibility floor outranks the
prototype's greys.*

### 2.3 Two tokens whose citation is the prototype, and eight that are deliberately absent

Both are stated in `everyday/tokens.ts`'s own docstring and are repeated here because a brief is
where a reader looks for them:

- **`EVERYDAY_RAIL_SURFACES`** carries two dark-rail values — the rail's sunk card `#2E2A24` and its
  border `#4A443A` — sourced from `design/elevator-sim-casual.dc.html` rather than the § 19 block.
  § 19 names the rail's ground (`ink`) but not its raised surfaces, and the prototype is canonical
  for what the screen looks like, so its two literals are carried with a note rather than replaced by
  invented shades of ink.
- **§ 19's eight shaft tints are not in `everyday/tokens.ts`**, on purpose: *"the lane that draws
  shafts adds the eight tints beside its caller."* A constant exported ahead of its consumer is the
  dead-seam shape this repository has now shipped eleven times in code plus twice in `data/`. They
  landed on the Engineer side as `--shaft-1…8` with [§ D336](../DECISIONS.md), and **eight rather
  than the six that were there**, because § 19's line has eight.

**A lane that draws shafts in Everyday Mode adds the tints beside its own caller and not before.**
That is not pedantry; it is the one rule in this repository with eleven instances behind it.

### 2.4 Type, radius and gap — and the one place the module rounds

`EVERYDAY_TYPE`: Familjen Grotesk 600/700 for headings and big numbers in prose; Instrument Sans
400/500/600 for body, labels and buttons; **DM Mono 500 for every figure, eyebrow, timestamp and code
line**. That third clause is a rule and not a preference: `docs/21` § 2.2 (4) restates it as *figures
are always mono, always with units*, and it is what makes a number recognisable as a number on a
surface written in plain words.

`EVERYDAY_RADII` is § 19's scale verbatim (5 · 8 · 9 · 10 · 12 · 14 cards · 20 pills).
`EVERYDAY_GAPS` is the one rounding in the module: § 19 gives four of the five as ranges, and the
module ships **midpoints rounded down** (26 / 17 / 13 / 8 / 5) so a consumer reads one number and the
range stays in the citation rather than being re-litigated at every call site. **Use the token, not a
number from the range.**

---

## 3. The two shells: what is shared, what is deliberately different

[§ D299](../DECISIONS.md) is *two products, one engine*. Casual is **a different door into the same
building, not a smaller building** — full capability, different vocabulary, layout and order of
encounter. [§ D336](../DECISIONS.md) then made the Engineer shell **paper**, so the two products now
share a palette as well as an engine.

**Shared, and a fork here is a defect:**

| shared | why it may not fork |
|---|---|
| `everyday/tokens.ts` | one module, imported; three-way pin in `dev/tokens.test.ts` |
| `live/bands.ts`'s wait banding | [§ D251](../DECISIONS.md) — the stage capsule and the Engineer mood card are two paints of **one** banding |
| `frame/frameAt.ts`, `frame/overlay.ts#queueAt`, `live/observations.ts` | where a car is, who is standing, what has happened by `t` |
| the accessibility floor | § 7 — it outranks both shells' aesthetics |
| every figure's meaning | `charter P1`; the register may change the words, never the number (`charter P5`) |

**Deliberately different, and a convergence here is also a defect:**

| Casual | Engineer | the decision |
|---|---|---|
| a 212 px rail, a pinned action bar, four mode tiles | a tab strip and rails, restyled in place | `docs/21` § 6 non-goal 4; `guide § 3`'s rail is Casual's and is not duplicated |
| a **drawn cutaway** — motion, doors, people one per person | the **schematic** stage on `render/canvas.ts` | [§ D299](../DECISIONS.md) § 3: the schematic is *genuinely better for engineers* |
| plain-language register | technical register | `charter P5`: same run, same figures, different words |

**Out of scope for this document and for any lane that cites it** — `docs/21` § 6 non-goal 5: **no
second renderer on the Engineer stage.** The schematic stays. Drawn people, doors and the
stage-as-the-stage are Casual's build. A lane that "improves the Engineer stage by drawing people"
has built the thing this non-goal names, however good it looks.

The two shells now cover each other rather than hide each other ([§ D335](../DECISIONS.md)):
`visibility:hidden` keeps the laid-out box, `display:none` does not, and a canvas measured under a
`display:none` ancestor gets a zero box and paints nothing when revealed. **Any new canvas surface in
either shell inherits that rule**, and `stageScreen.ts#sizeCanvas` shows the shape: a zero box is
*refused* rather than drawn into, and the draw is skipped until a later frame finds a real box.

---

## 4. `charter P3`, and the hard ceiling `docs/10 R6` puts on it

This is the section that decides whether anything else in this document is buildable, and it is the
one a brief most easily gets wrong.

### 4.1 The two rules, stated together

**`charter P3` — the stage shows what the report will later say** ([`22-charter.md`](22-charter.md)
§ 2, adopted by [§ D342](../DECISIONS.md)). Its refusal test: *where on the stage would a player have
seen this?* If the report's headline has no visible antecedent during the run, either the stage is
missing a cue or the report is asserting something the run did not show. **It is the one pillar the
build fails outright, and the only one whose wording is attested rather than reconstructed.**

**`docs/10 R6` — no figure that can only be true of the whole run, at a playhead short of its end**
([`10-experience-layer-contract.md`](10-experience-layer-contract.md); [§ D223](../DECISIONS.md),
[§ D293](../DECISIONS.md)). This is not advice. It is `honesty/properties.ts`'s
`whole-run-figure-early`, the seventh honesty property, added by [§ D300](../DECISIONS.md)'s E-4 and
[§ D307](../DECISIONS.md) — and **it caught the Engineer stage banner on its first run**, reading
*127 undelivered at 00:00 and still 127 at 704 s while 376 people were standing*.

`stageScreen.ts:40-48` is the Casual stage's own statement of the same rule, and its formulation is
the one to keep: the screen holds **no field** it could draw a whole-run figure from — *not because a
guard refuses it, but because the screen has nothing to draw it from.*

### 4.2 Where the line falls, exactly

**P3's ceiling: the stage may make a thing visible as it happens. It may not publish the run's
summary of it.**

That is a sentence, and a sentence is not a test. The decidable form comes from the property itself.
`honesty/properties.ts` pairs every whole-run count with **the shipped function that knows the same
quantity at a playhead**, and reports the defect as *the surface printed the finished-day value where
the value at this playhead is a different number*. So:

> **The test for any cue proposed on the stage: name the field on
> `live/observations.ts#observationsAt` it is drawn from. If the answer is a field of
> `VizRecording.summary`, the cue is refused.**

`observationsAt` is the permitted vocabulary, and it is generous. Every one of these is a count of
what had happened by `t`, or a state right now, and every one is R6-clean by construction:
`waitingNow`, `longestCurrentWaitS`, `arrived`, `boarded`, `carried`, `servedUnderThresholdCount`,
`servedCount`, `servedUnderThresholdPct` (with its `n`, `docs/10 R13`), `longWaitThresholdS`,
`peakQueue`, `deepestQueueNow`, `deepestQueueFloorId`, `abandoned`, `abandonedCarried`,
`worstWaitSoFarS` with its `worstWaitIsCensored` flag, and `horizonS`.

Two of those carry their own drawing rules and a brief must not lose them. **`worstWaitSoFarS` is
the playhead's own maximum and never `summary.serviceLevel.longestWaitS`** — its docstring names
[§ D307](../DECISIONS.md)'s violation class explicitly — and when `worstWaitIsCensored` is true the
figure is a **lower bound** over somebody still standing, which the header already draws as
`N s and counting`. **A censored maximum may never be drawn as a bare number**, in any encoding: a
bar whose length says 90 s about a wait that is still growing is the same claim with the qualifier
deleted.

Refused, and named so nobody proposes them: `summary.meanWaitS`, `summary.wait95S`,
`summary.meanTimeToDestinationS`, `summary.serviceLevel`, `summary.handlingCapacity`,
`summary.generated`, `summary.delivered`, `summary.undelivered`. **None of these may appear on the
stage in any form** — not as a number, not as a bar's full extent, not as a gauge's maximum, not as a
colour scale's endpoint. A gauge whose 100 % is the finished day's total publishes that total the
moment it is drawn.

### 4.3 The distinction that makes P3 buildable: a schedule is not an outcome

This is the finding that gives the stage room to work in, and it is worth stating as its own rule.

`VizRecording.demandPhases` is **the resolved template's own phase schedule** — the contract's
version-7 note says so outright: *"the phase schedule lives on the resolved template rather than on
the result"*. It is an **input** to the run, known before a single passenger was generated.

So:

- **Permitted.** *Overnight until 07:30* — the phase pill, drawn from `demandPhases` via
  `live/timeline.ts#phaseAt`. It is a statement about what the day was **built to do**.
- **Refused.** *The worst queue is at 08:12* — a statement about what the day **did**, knowable only
  by reading past the playhead.

The same split licenses the rest of the building's furniture: floor count, tenant names, shaft
geometry, rated capacity, which cars are out of service, `longWaitThresholdS`. These are the
building, not the run. **Configuration may be drawn in full at `t = 0`. Outcome may not be drawn
before `t` reaches it.**

### 4.4 What this rules out, concretely

A brief that ignored the ceiling would ask for each of these, and each would be rejected by the
corpus rather than by a reviewer:

- A **progress bar of the day** whose fill is `carried / summary.generated`. The denominator is the
  finished run. *(Permitted variant: `carried` against `arrived`, both folded at `t` — the share of
  people who have called a lift and are now where they were going.)*
- A **"today's average wait" ticker.** `docs/10 R3` forbids a mean on a run whose summary refuses it,
  and R6 forbids the whole-run mean early regardless. *(Permitted variant: the race strip's top lane
  — the average wait of the people standing **right now**, which is a state and not a fold, and which
  is already built in `live/raceStrip.ts`.)*
- A **verdict banner** — *this is going badly* — placed before the run ends. The banner may describe
  the instant (*47 people waiting, deepest at Level 3*) and may not grade the day.
- A **heat overlay whose scale endpoint is the day's peak.** The scale would encode the peak, which
  is a fold. *(Permitted variant: an absolute scale in people, or one whose endpoint is
  `peakQueue` folded at `t` and labelled as **so far**.)*
- **Foreshadowing of any kind** — dimming a floor that is about to fail, pre-tinting a car that will
  saturate. It reads the future by definition.

### 4.5 What P3 therefore *is*, on this stage

Everything left is a great deal, and it is all in one family: **P3 is discharged by making the
present state and its recent trend impossible to miss, not by summarising the run early.**

The report's headline figures are waits. Their honest live antecedents are:
the **wait ramp** on the capsules (`stageInkFor`), the **depth** of a landing's queue
(`deepestQueueNow`), the **duration** the queue has persisted (the race strip's two lanes, sampled up
to the playhead), and the **alarm strip** when more than forty are standing. § 5.4 specifies how to
make those four read, and § 7 constrains how they may be encoded.

---

## 5. The stage — the visual specification

The stage is `packages/viz/src/everyday/stageScreen.ts` (the DOM half, the canvas, the one
`requestAnimationFrame` loop) over `packages/viz/src/everyday/stageScreenModel.ts` (every word it
says and every number it publishes, pure and drivable without a document). **That split is load
bearing for this document**: a rule expressed as arithmetic in the model is a rule the honesty sweep
and the unit tests can check without a browser, and a rule expressed only in the renderer is a rule
that ships untested. **Where a rule below can live in the model, it must.**

### 5.1 What is drawn today, so the brief adds rather than repeats

`drawCutaway` paints, in order: a warm well behind the whole elevation (`cardSunk`), floor slabs with
the number and tenant line in a 74 px gutter (entrance floors `ink` and never thinned out), shaft
wells as light voids (`paper` — *a void is lighter than the building around it*), dashed
`OUT OF SERVICE` wells rotated down the shaft, **one capsule per waiting rider** at the landing,
coloured by `stageInkFor(waitedS)`, the `+N` overflow chip, cars as `ink` boxes, two `sun` door
leaves, up to nine `paper` rider marks inside each car, the `n/capacity` readout above it, and a
`terracotta` direction arrow while it travels.

Geometry worth knowing before proposing anything. Capsules are **4.5 px wide on a 6.5 px pitch**
(a 2 px gap); their height is `clamp(rowPitch × 0.62, 5, 11)`; they fill `floor((landingWidth − 8) /
6.5)` to a lane and then wrap, each further lane offset **up by a quarter of a capsule height** and
1.5 px left — so lanes overlap each other by three quarters. They are drawn **right to left from the
well**, so the queue reads as a crowd pressed against the doors and the oldest waiter is at the
front. The landing band is `clamp(wellWidth × 0.34, 60, wellWidth − 24)`. Cars are
`clamp(rowPitch × 0.86, 9, 20)` tall. Floor labels are dropped below a 13 px row pitch, entrance
floors excepted.

### 5.2 A shut door — the fill inversion, specified

**The defect, exactly.** The car body is filled `ink` at `x + 1.5` for `width − 3`. The doors are
then drawn as `leaf = ((width − 3) / 2) × (1 − doorFraction)`, twice — once from the left edge, once
inset from the right. At `doorFraction = 0` the two `sun` leaves are each **half the body**, they
abut exactly at the centre line, and they cover the body completely. **A shut car is a solid amber
block, and a car is shut for most of the run.**

The polarity is exactly backwards from the read the guide asks for. `guide § 7.2` says *"cars as dark
boxes with amber doors that split as they open"*. What ships is an amber box that becomes dark as it
opens: the car's identity colour is the **rare** state and the accent is the default.

There is a second, measured consequence that decides the fix. The nine occupancy marks are drawn
**after** the leaves, in `paper`. On an open car that is `paper` on `ink` — **14.54:1**. On a shut car
it is `paper` on `sun` — **1.83:1**, which is precisely the ratio [§ D336](../DECISIONS.md) measured
and refused for text on this palette. *The occupancy of a car is least legible in the state the car
is in most of the time.*

**Three rules. An implementation satisfying all three is conforming; the geometry after them is one
way, not the only way.**

- **AD-S1 — the car's identity is its body, never its door.** For every `doorFraction` in `[0, 1]`,
  the `ink` body must remain visible as a continuous margin on all four sides of the amber, at least
  1 device-independent pixel wide. **Amber is a doorway, never a face.**
- **AD-S2 — shut is a seam; open is a gap.** Shut and open must differ in **shape**, not only in
  amber area. A car's column is `0.76 × (wellBandWidth / shafts)`, and `vertical-city` ships
  **35 cars across seven banks** against `midtown-office`'s four — so the same well band draws a car
  roughly **nine times narrower** on one shipped building than on another, and at that end an
  area-only difference is a difference nobody can see. At
  `doorFraction = 0` the two leaves meet on the car's centre line and a 1 px `ink` seam is drawn at
  the join; as the fraction rises the leaves retract toward the doorway's outer edges and the
  widening gap shows the interior.
- **AD-S3 — nothing that must be counted sits on amber.** The occupancy marks keep an `ink` ground at
  every value of `doorFraction`. Either the doorway does not overlap the mark grid, or the marks move
  to a band of the body that the doorway never reaches.

**One conforming geometry**, offered so a lane does not have to invent one: the doorway is a centred
rectangle of `bodyWidth × 0.62` and `carHeight − 6`, leaving an `ink` frame on all four sides; each
leaf is half the doorway; the nine marks sit in the body's upper band above the doorway, or — where
`rowPitch` is too small for two bands — the marks are drawn over the `ink` frame's lower edge. Where
the car is too narrow to draw a doorway at all (a pitch under roughly 8 px), **draw the amber as a
1 px vertical seam on the car's centre line when shut and omit it when open**: at that size the seam
is the only door signal that survives, and an amber wash would be the current defect at a smaller
scale.

**Acceptance.** `stageScreenModel.ts` gains the doorway arithmetic — a pure function from
`(bodyWidth, carHeight, doorFraction)` to the leaf rectangles — so all three rules are checkable
without a canvas: assert that the ink margin is non-zero at `doorFraction` 0, 0.5 and 1; assert that
the leaf rectangles at 0 and at 1 differ in shape and not only in area; assert that the mark grid and
the doorway do not intersect. Then one browser case per shipped building, because the small-pitch
branch is where this fails.

### 5.3 What the stage opens on

**The playhead does not move, and this is the recommendation this document is most confident about.**

The stage opens **paused at `recording.startedAt`**, which is the run's own day start — **the demand
template's declared hour**, with `live/timeline.ts`'s `DAY_START_S` (06:00) only as the fallback for a
template that declares none. Six of the seven shipped templates declare one: `rise-and-fall` at
**08:30**, `office-day` at 08:00, `lunch-two-way` at 12:15, `office-down-peak` at 17:15,
`shift-change` at 14:45, `evening-egress` at 22:24; `constant-iso` declares none and is the only run
that actually opens at 06:00.

So `guide § 7.3`'s literal *"paused, at 06:00"* is the **deviation** and the product is right, on the
standing rule. `stageScreen.browser.test.ts` established that by asserting the guide's literal against
the product and failing: *"this build opens `garden-apartments` at 08:30 … forcing 06:00 over it would
be labelling this building with another building's morning."* The property that case pins is the one
to preserve — **the playhead is at the start of the day and time only ever moves forward from it.**

**Why the playhead must not be moved to a livelier instant**, stated because it is the obvious fix and
it is wrong twice over:

1. **`charter P1`.** Choosing a flattering opening frame is the camera answering *name the run this
   came from* with *the one that looked best*. The empty lobby at the start of the day is the true
   picture of the start of the day.
2. **`docs/10 R6`, one step removed.** *Open at the busiest moment* requires knowing where the
   busiest moment is, which requires reading past the playhead. Placing a camera is not publishing a
   figure, so this is not an R6 violation by itself — **but any caption on that frame is**. *Opening
   at the morning peak* is a statement about the whole run. There is no version of this that survives
   contact with the honesty corpus once it is labelled, and an unlabelled jump is worse: the player
   is shown a moment and not told which.

**What is specified instead — the empty stretch is a transport problem and is fixed with the
transport.**

- **AD-S4 — the opening frame states what the day is about to do, from the schedule and never from
  the outcome.** `demandPhases` is the resolved template's own schedule (§ 4.3), so the stage may say
  *overnight · the building starts filling at 07:30* at `t = 0`. The phase pill already draws the
  current segment; what it does not draw is **when the next one starts**, and that single addition is
  the difference between an empty screen and an empty screen that tells you it is early. It is
  R6-clean because it describes the input.
- **AD-S5 — the `Start` affordance is the day's, not the frame's.** `guide § 7.3` asks for *the day's
  first frame drawn and a single centred `Start`*. The centred `Start` is the moment to say the day's
  shape once — the phase schedule, the building, who is driving — because it is the last moment the
  player is not watching anything.
- **AD-S6 — how long the quiet lasts is the template's property, not the renderer's, and the
  measured answer moves the whole issue.** `data/traffic-profiles.json` ships seven demand templates.
  **`office-day` is the only one with a phase schedule** — 600 simulated minutes from 08:00, and its
  first phase is *08:00–08:30 at intensity `0.05`*, one twentieth of nominal, before the up-peak ramp
  begins. At the default speed (`1×` = 30 simulated seconds per real second) that is **60 real
  seconds** of a near-empty building at the head of a **20-minute** day. The shipped default,
  `rise-and-fall`, is a 30-minute run from 08:30 whose intensity ramps from its first second — **60
  real seconds end to end, with no quiet head at all.**

  So the empty opening is **template-shaped**, it is one minute rather than the several #212's
  wording implies, and on the most common shipped run it does not exist. **The fix, where one is
  wanted, belongs to whichever template a day is built from — not to the renderer.** That is the
  second half of why #212 is not a rebuild.
  **And no "skip to the action" control that jumps the playhead without saying how far it moved and
  to what.** An unlabelled jump loses the player's place in a record they are meant to be able to
  reason about, and a labelled one runs straight into reason 2 above.

**What is deliberately not specified here.** Whether the default speed should change, or whether
`office-day`'s opening half hour should be shorter, is a **playability** question with a measurable
answer and this document does not guess it. It is named in § 8.

**One divergence worth recording while the arithmetic is out.** `guide § 7.1` says *"A day at `1×`
takes about 26 minutes; at `30×` about eighty seconds"*, which implies a **13-hour** day. The longest
template this build ships is `office-day`'s **10 hours** — 20 minutes and 60 seconds respectively.
The guide's numbers are the prototype's, and the prototype's numbers are not canonical
([`12-design-handoff.md`](12-design-handoff.md) § 4.1 made the same correction about the day's clock);
its *interaction* — five relative speeds, a reset per run — is, and is built.

### 5.4 Making pressure legible before the report names it

This is `charter P3` discharged on the stage, inside § 4's ceiling. Four channels exist; each has a
finding and a rule.

**The ramp is the core read, and it is 4.5 px wide.** `guide § 7.2` says the wait ramp *"is the
game's core read — a player should learn to see a bad morning before reading a number"*. It is drawn
as one 4.5 px capsule per rider. A landing that is quietly going bad is a handful of small marks
changing hue, at the size where hue is the least reliable channel a screen has. **This is the P3 gap,
and it is a scale problem before it is a colour problem.**

- **AD-S7 — the ramp gets a second channel, and it is size.** A capsule's **height** encodes its band
  as well as its colour: the fourth band is visibly taller than the first. This is required by § 7
  anyway (*never colour-only*), and it is the one change that makes a landing's state readable at a
  glance, in greyscale, and by a reader who cannot resolve a 4.5 px hue difference. Height is chosen
  over width because capsules tile horizontally on a fixed 6.5 px pitch, so width would change how
  many fit a lane and therefore how many lanes a full landing needs — a visual change that would move
  § 8 (7)'s overlap arithmetic and, at the limit, where the `+N` cap bites.
- **AD-S8 — the landing carries its own worst band.** A queue's state is drawn today only in the
  marks. **The landing's ground takes a wash of the deepest band present at that floor**, at an
  opacity low enough that the capsules still read against it. A whole row going warm is visible from
  across a room; twenty-six capsules are not. This is a state at `t`, so it is R6-clean.
- **AD-S9 — the alarm strip's threshold is building-relative, or it is named as absolute.**
  `STAGE_ALARM_STANDING` is **40**, a bare integer transcribed from `guide § 7.2`'s *"more than forty
  people are standing"*, and it is the same 40 on every building. The buildings are not the same
  size: `garden-apartments` has **6** floors, `secure-tower` **30**, and `vertical-city` runs **35
  cars across seven banks** against `midtown-office`'s four. **Whether a fixed 40 fires constantly on
  one and never on another is unmeasured here** — the claim this document makes is only that a
  building-independent threshold across that range is a threshold nobody has checked, and *a
  threshold that fires always, or never, is not an alarm*. Either it scales with the building —
  this document does not pick the denominator, because picking one is a measurement (§ 8 (1)) — or
  the strip's own sentence states the absolute number it is drawn at, so a reader knows what it
  means. A silent absolute threshold across that range is the worst of the three.
- **AD-S10 — duration is the antecedent the report actually needs, and it is under the stage rather
  than on it.** The report's headline is a wait, and the honest live antecedent of a bad wait figure
  is not a big queue — it is a queue that **stays**. `live/raceStrip.ts`'s top lane is exactly that:
  the average wait of the people standing *right now*, sampled every four simulated minutes up to the
  playhead, with a dashed sixty-second line so it reads without a legend. **It is already built, it
  is already R6-clean, and it is the most under-weighted element on the screen.** Give it the visual
  weight its role deserves before proposing any new instrument. A new whole-run gauge is refused by
  § 4.4; this lane is the permitted version of the same wish, and it exists.

**The P3 acceptance test for this screen, written so a reviewer can run it:** take the report's
headline sentence for a bad day, and name the frame during the run at which the player could have
seen it coming. If the answer needs a figure `observationsAt` does not publish, the report is
asserting something the run did not show and the fix is in the report, not the stage.

### 5.5 The caps — why 26 and 9 are honest, and what would make them dishonest

`stageCrowdCapOf(total)` draws at most **`MAX_LANDING_FIGURES` = 26** capsules and then a `+N` chip;
cars draw at most **`MAX_CAR_RIDERS` = 9** marks beside an exact `n/capacity` label. Both numbers are
**`ENGINE_CONTRACT § 14`**'s — *"Landings draw at most 26 figures, then `+N`; cars draw at most 9
riders. A crowd of 400 must not cost a frame"* — and not `guide § 14`'s, which is a different section
of a different file about the week board. `guide § 7.2` carries the landing half in passing. Both
live in the pure model *"so it is arithmetic a test can check: **a crowd of 400 must not cost a
frame** is a claim about a number, and this is the number."*

**A cap is honest here for four reasons, and each is a rule a replacement must also satisfy.**

1. **The alternative is not "draw them all", it is "draw them all illegibly."** Lanes already overlap
   by three quarters of a capsule height (§ 5.1), so marks stop being individually countable well
   before the cap bites; past that point each further capsule is drawn largely **on top of** an
   earlier one, and the reader counts *fewer* people, not more. **A cap that raises the information
   on screen is not a shortcut; removing it would subtract.** Note what this argument does *not*
   establish: **26 is `ENGINE_CONTRACT § 14`'s literal and is not derived from the geometry**, and
   the geometry varies by building. § 8 (7) records the case where that matters.
2. **Nothing is withheld.** `+N` publishes the exact remainder. The cap changes the **encoding** — from
   one-mark-per-person to a numeral — at the point where marks stop being countable. Nothing is
   rounded, nothing is binned, no threshold is widened. This is what separates it from
   `charter P2`'s refused class.
3. **It is R6-clean.** `+N` is a count of who is standing at `t`. It is not a fold of anything.
4. **It does not bias the picture.** This is the subtle one and it currently holds **by contract
   rather than by accident**: `frame/overlay.ts#queueAt` returns riders in `legs` order, which the
   contract states is `(arrivedAt, passengerId)` — **oldest first** — so the twenty-six drawn are the
   twenty-six who have waited longest, drawn nearest the shaft, and the `+N` chip sits at the back of
   the queue where the newest arrivals are. The ramp's read survives the cap: **the cap hides the
   people whose colour is least alarming, never the people whose colour is the point.**

- **AD-S11 — a cap must publish its remainder exactly, in a different visual language from the
  marks.** The `+N` chip is `mono`, not a twenty-seventh capsule. A cap drawn in the same language as
  the thing it caps makes the reader count 27 objects, one of which is 374 people.
- **AD-S12 — the drawn subset is the worst-waiting subset, and that is a property to assert, not a
  coincidence to rely on.** `queueAt`'s ordering is a contract clause in another module. If a future
  change sorted riders by destination, by promised car, or by anything else, the ramp would silently
  start showing the calmest twenty-six of a bad landing and nothing would go red. **The stage should
  assert the ordering it depends on**, in `stageScreenModel.ts`, where it is arithmetic.
- **AD-S13 — the same three rules bind the car cap.** Nine marks then stop, with the exact
  `n/capacity` beside it in mono. A tenth mark says nothing a reader can count.
- **AD-S14 — never soften an overflow into a word.** `+374` is a fact; *"many"*, *"crowded"* and a
  three-dot ellipsis are not, and `charter P2`'s refusal test — *does this change make the product
  say less?* — refuses all three.

### 5.6 The wait ramp is the simulator's banding, not the guide's

The stage's only quantitative colour encoding. `stageBandOf(waitedS)` reads `live/bands.ts`'
`WAIT_BANDS` and never restates a boundary; `STAGE_BAND_INK` maps band id to a § 19 token, keyed by
`WaitBandId` **rather than by index, so a fifth band fails to type instead of quietly inheriting the
last colour**; `stageInkFor` composes the two; `stageLegend()` derives the four rungs under the stage
from `WAIT_BANDS` in its own order, using `legendLabel` because *"under the stage the legend says how
long, beside the mood card it says how it feels"*.

**`guide § 7.2` writes the ramp as green under 30 s, amber to 75 s, terracotta to 150 s, grey once
they have taken the stairs. The build breaks at 30 / 60 / 120.** That is a stated deviation and it is
correct: the handoff wins what the screen looks like and the simulator wins what a number means, and
a boundary is a number. The band members also carry fixed prose elsewhere — *checking watch* is a
claim about a minute — so 75 s under that label would be the caption-stops-describing-the-picture
defect `live/bands.ts` exists to prevent ([§ D251](../DECISIONS.md)).

- **AD-S15 — one banding, four inks, and no second ramp anywhere.** A ramp authored on a new surface
  would be an eleventh copy of a palette. What a surface authors is the **mapping** from band id to
  its own medium's ink; the boundaries come from `WAIT_BANDS`.
- **AD-S16 — the legend is not optional and is not a hover.** `guide § 7.2` puts it under the stage
  naming the four colours **in plain words**. A colour scale whose legend is behind an interaction is
  a colour scale that half the readers never decode, and § 7 makes this a hard requirement rather than
  a preference.

---

## 6. Motion, easing, and what time compression rules out

**There is no speed on this transport at which a lift behaves at the rate a lift behaves.**
`stageScreenModel.ts#STAGE_SPEEDS` ships five settings in *simulated seconds per real second*, and
the slowest is already **8×** compressed:

| chip | `simPerRealS` | sim-seconds per frame at 60 Hz | a 9.8 s hall-call door cycle |
|---|---|---|---|
| `½×` | 8 | 0.13 | 1.23 s of wall time · ~74 frames |
| `1×` *(default)* | 30 | 0.50 | **0.33 s** · ~20 frames |
| `4×` | 90 | 1.5 | 0.11 s · ~7 frames |
| `12×` | 240 | 4.0 | 41 ms · ~2 frames |
| `30×` | 600 | 10.0 | **16 ms · under one frame** |

The door figures are [`../data/elevator-specs.json`](../data/elevator-specs.json)'s, not invented — a
centre-opening hall-call stop is `openS 1.8 + dwellHallCallS.typical 5 + closeS 3.0`, and the slowest
shipped combination is a side-opening door at maximum hall dwell, `2.5 + 7 + 4.0 = 13.5 s`, which
makes every row of this table *longer* and changes none of its conclusions. The wall-clock column is
[`29-audio-direction.md`](29-audio-direction.md) § 4.1's arithmetic, which reached the same table for
the sibling discipline and recommended a cut partly on the strength of it. **The same constraint
binds pixels, and it binds them harder**, because a picture cannot be turned off in Settings.

Four rules follow, and each is arithmetic rather than taste.

- **AD-M1 — no easing on any quantity the kernel already computes.** `doorFraction` is exact between
  events; `frame/frameAt.ts` gives an exact car position at any `t`. Motion on this stage is smooth
  **by construction**, at every speed, because the model is continuous and the playhead is a real
  number. An easing curve laid over either would be a second opinion about a physical quantity, and
  it would be a *wrong* one: the simulator models jerk and acceleration properly precisely so that
  short hops never reach rated speed, and a UI easing curve would flatten that back out.
- **AD-M2 — no transition, anywhere, on a value tied to the playhead.** A 200 ms ease is
  **120 simulated seconds of lag at `30×`** — two simulated minutes — and 48 s at `12×`. The stage
  files an intervention at *this screen's own playhead*, for the stated reason that *"a change
  stamped at the Engineer transport's position would be filed at an instant nobody was looking at"*.
  An eased picture reintroduces exactly that defect from the other side: the stamp would name an
  instant the picture had not reached.
- **AD-M3 — information lives in state, never in events.** At `30×` a whole door cycle can fall
  between two frames. So a flash, a ripple, a pulse on arrival, an animated "ping" when a car answers
  a call — every event-shaped cue — is invisible at the speeds a player actually uses to get through
  a day, and a cue that fires for one event in twelve is decoration that looks like information.
  **Everything the stage must communicate has to be readable from a single frame**: queue depth, ramp
  colour, car position, door state, occupancy. This is why § 5.2's shut-door fix is a *shape* rule
  and not a *transition* rule.
- **AD-M4 — no entrance or exit animation on riders.** Passengers arrive in **batches**, not one at a
  time. At `30×` a batch appears within one frame, and a per-capsule stagger would be an animation
  queue that never drains on a busy building. A capsule is present at the playhead or it is not.

**What this does *not* rule out**, so the rules are not read as "no motion at all": the day itself
moves, and that is the whole point of the screen. Cars travel, doors open, queues grow and drain,
the two race-strip lanes extend. All of that is the simulation, is exact, and is the one thing
`KB-14` explicitly protects rather than suppresses.

### 6.1 Reduced motion — the seam that exists, and the reach it does not have

`packages/viz/index.html` carries `@media (prefers-reduced-motion: reduce) { * { transition: none
!important; animation: none !important; } }`, asserted in `packages/viz/src/dev/motion.test.ts` on
three things — that the block exists, that it selects everything, and that both properties carry
`!important` — *"so that it covers a transition somebody adds next year without knowing this row
exists"*. It is a global rule in the one document, so the Everyday shell inherits it.

**But a canvas draw loop is not CSS, and that block has no reach into it.** Three consequences a
later lane must not discover the hard way:

1. **The Everyday stage satisfies `KB-14`'s autoplay clause by construction, not by reading the
   preference.** It opens **paused** on every recording, so there is nothing to suppress.
   `dev/motion.ts#shouldAutoplayWith` — the shipped seam, over the Engineer's own switch, reachable
   from the Everyday Settings screen through `everyday/engineerBridge.ts` — is **not consulted by
   `stageScreen.ts` at all**. That is currently harmless and would stop being harmless the moment
   anything on this screen started moving on its own. **A lane that adds autoplay adds the bridge
   read in the same commit.**
2. **Any decorative canvas motion added to the cutaway is unreachable by the preference** and must
   read `prefersReducedMotion` itself, or not exist. Prefer *not exist*: § 6's four rules leave
   almost nothing that would qualify.
3. **`guide § 7.2`'s "breathing dot" is DOM and does not breathe.** `stageScreen.ts#breathingDot`
   returns a static 8 px circle with no animation and no keyframes. That end state is *correct* under
   a reduced-motion preference and it is a **stale name** the rest of the time — the same class as a
   stale refusal ([§ D227](../DECISIONS.md)), one register down. If the dot is made to breathe it
   must be a CSS animation so the global guard covers it; if it is not, the helper should stop
   promising motion in its own name.

---

## 7. Accessibility as a visual constraint

**Issue #204 writes the accessibility standard and this document does not.** What is stated here is
the set of **visual consequences** that already bind, plus the measurements a standard will have to
account for. Where #204 lands on a different floor, #204 wins and these rules move with it — but the
measured facts below do not move, because they are facts about hex values.

**Method, stated so the numbers are reproducible and so nobody has to trust them.** WCAG 2.x relative
luminance, ratio `(L₁ + 0.05) / (L₂ + 0.05)`, computed over `everyday/tokens.ts`'s literal values.
The same function reproduces **all four** of [§ D336](../DECISIONS.md)'s pinned figures exactly —
3.38, 1.83, 3.68, 3.60 — which is the check that licenses the derived numbers below.

### 7.1 The floor has already moved five values, and that is the precedent

§ 2.2's table is the shape every future deviation takes: the guide's value, the measured ratio, the
shipped value in the same family, and **both halves asserted** so the deviation cannot outlive its
reason. **The simulator's accessibility floor outranks the prototype's greys** (`docs/21` § 2.2 (5)).
A brief that proposed a colour on aesthetic grounds against a measured floor would be proposing to
delete a passing test.

### 7.2 The wait ramp has the least contrast headroom of anything measured here

The ramp is `guide § 7.2`'s *"core read"*, drawn as a 4.5 px capsule. Measured on the ground it is
actually drawn against — the plot's `cardSunk` `#F5EFE3` well, not `paper`:

| band | token | ink | vs its own ground |
|---|---|---|---|
| `breezy` | moss | `#4F8A5B` | 3.58:1 |
| `tapping-foot` | sun | `#F2A63B` | **1.78:1** |
| `checking-watch` | terracotta | `#B8462B` | 4.64:1 |
| `taking-the-stairs` | warm grey | `#6E665A` | 4.94:1 |

**Three of the four clear a 3:1 non-text floor; `tapping-foot` is at 1.78:1 against the surface it is
drawn on.** That is below the 1.83:1 [§ D336](../DECISIONS.md) already measured for the same ink and
refused for text on this palette, and below any non-text floor anyone would pick. *The band that
means "this is starting to go wrong" is the hardest one on the screen to see.* Which floor actually
applies is #204's to set; that this one value fails every candidate is not.

The second measurement is worse, and it is the one a colour-blindness audit will find first. Band
against band — **a discriminability measure rather than a compliance one**, since no standard sets a
ratio between two adjacent fills that mean different things, and 3:1 is only the conventional floor a
designer would reach for:

| pair | ratio |
|---|---|
| `checking-watch` vs `taking-the-stairs` | **1.06:1** |
| `breezy` vs `checking-watch` | **1.30:1** |
| `breezy` vs `taking-the-stairs` | 1.38:1 |
| `breezy` vs `tapping-foot` | 2.01:1 |
| `tapping-foot` vs `checking-watch` | 2.61:1 |
| `tapping-foot` vs `taking-the-stairs` | 2.77:1 |

**Three of the six pairs are separated by essentially nothing but hue, and not one of the six clears
3:1.** In greyscale, *checking watch* and *taking the stairs* — the ramp's two worst bands — are the
same value at 1.06:1. And *breezy* against *checking watch* at 1.30:1 is the calm end against the
alarming end: a green-versus-red discrimination at near-equal luminance, which is the textbook
red-green-confusion case. **These marks are 4.5 px wide**, which is the size at which hue is the
least reliable channel a screen has.

**This is not an argument for changing § 19's four inks.** They are the guide's, they are the same
four the Engineer mood card paints, and a second ramp is forbidden by AD-S15. It is an argument that
**hue cannot be the ramp's only channel**, which is § 5.4's AD-S7 arriving from the other direction:
capsule **height** encodes the band as well as colour, so the ramp survives greyscale, colour
blindness, a 4.5 px mark and a bad monitor. That single change discharges the constraint without
touching a token.

### 7.3 The rules that bind regardless of where #204 lands

- **AD-A1 — nothing is colour-only.** Every state a player must distinguish carries a second channel:
  size, shape, position, a label, or a pattern. This is `guide § 7.2`'s legend requirement (AD-S16)
  and AD-S7 in one sentence, and it is the rule the wait ramp currently fails.
- **AD-A2 — a graphical object that must be read carries at least the non-text floor against its own
  adjacent colour, and the ground it is measured against is the one it is actually drawn on.** The
  1.78:1 figure above was invisible until the ramp was measured against `cardSunk` rather than
  `paper`; measuring against the wrong ground is how a palette passes a review and fails a reader.
- **AD-A3 — a live region is not a paint target.** `stageScreen.ts`'s alarm strip is a DOM element
  with `role="status"`, and `draw()` calls `alarm.replaceChildren(...)` **unconditionally on every
  frame while the alarm is up** — up to sixty rewrites a second of an assistive-technology
  announcement region. A live region is rewritten when its **sentence changes** and at no other time.
  This is a defect today and it is named here because it is a *visual* decision (paint everything
  every frame) with an accessibility cost that no visual test can see.
- **AD-A4 — a refusal is drawn, in the same type as a figure, never in a lighter grey.**
  `charter P2` makes refusals a feature; typography that treats them as errata reverses that. The
  stage's own absences register (`STAGE_ABSENCES`) is drawn to the player for exactly this reason —
  *"a register nothing renders is read by nobody"*.
- **AD-A5 — every figure is mono and carries its unit** (§ 2.4), and an estimate carries its `n`
  (`docs/10 R13`). This is an accessibility rule as much as an honesty one: a number whose unit is
  implied by its position is a number that stops being a number when the layout is linearised.
- **AD-A6 — motion is bounded by § 6, and the preference has no reach into canvas** (§ 6.1). A
  reduced-motion reader on this stage is protected by the screen opening paused and by there being
  nothing decorative to suppress. **Both of those are properties to preserve, not accidents to build
  over.**

---

## 8. What this document does not decide, and what it could not support from the tree

Named rather than quietly omitted, because a brief that answers a question it could not measure is
the defect this repository has recorded most often.

1. **Whether the alarm threshold should scale with the building, and by what.** AD-S9 says a fixed
   **40** is wrong on eight buildings ranging from `garden-apartments` to `vertical-city`'s 35 cars
   across seven banks. It does **not** pick the denominator, because picking one is a measurement:
   *how many standing is unusual for this building* is a distribution, and this document has run no
   runs. Either measure it, or state the absolute threshold on the strip's own face.
2. **Whether `office-day`'s opening half hour should be shorter, or the default speed higher.**
   AD-S6 measures the quiet head at **60 real seconds** on `office-day` and at **nothing at all** on
   the shipped default `rise-and-fall`. Whether that minute is worth removing — by shortening the
   template's first phase, by opening at a higher speed, or not at all — is a playability question
   with a measurable answer, and guessing it here would be a preference wearing a specification.
   What this document does claim is the **negative**: it is not a renderer problem, so it must not be
   solved in the renderer.
3. **The exact doorway proportions.** § 5.2 gives three rules and one conforming geometry. The
   proportions in that geometry are **not measured** — they are a starting point that satisfies the
   rules. The rules are the specification; the numbers are a suggestion, and a lane that finds better
   ones while keeping AD-S1 to AD-S3 has not deviated from anything.
4. **The eight shaft tints in Everyday Mode.** They exist on the Engineer side as `--shaft-1…8`
   ([§ D336](../DECISIONS.md)) and are deliberately absent from `everyday/tokens.ts`. Whether the
   Casual cutaway should tint its wells at all is a question for the lane that draws them, and this
   document will not export a constant ahead of its consumer (§ 2.3).
5. **Iconography, illustration and any art beyond the elevation.** `guide § 19` specifies a palette,
   a type stack and a scale. It specifies no icon set, and the tree ships none. This document does
   not invent one.
6. **Anything about sound.** [`29-audio-direction.md`](29-audio-direction.md) recommends a cut and is
   awaiting the product owner. § 6 shares its arithmetic and reaches the same constraint for pixels;
   it takes no position on its recommendation.
7. **Whether a full landing's capsule stack crosses into the floor above — the arithmetic says yes in
   a wide band, and I could not render a shipped building to confirm it.** A lane rises
   `2 + capsuleH × (1 + 0.25 × (lanes − 1))` above its floor line, `capsuleH` is
   `clamp(rowPitch × 0.62, 5, 11)`, and a landing needs `ceil(26 / floor((landingWidth − 8) / 6.5))`
   lanes when it is full. Solving that against `rowPitch`:

   | lanes | crosses into the floor above when |
   |---|---|
   | 1 | `rowPitch` under ~5.3 px |
   | 2 | `rowPitch` under ~8.9 px |
   | 3 | `rowPitch` under ~18.5 px |
   | 4 | `rowPitch` under ~21.3 px |

   A landing needs four lanes whenever it is narrower than about 60 px of usable width, and a
   single-lane landing needs about **177 px**. So a tall building with a narrow well band draws part
   of level 3's crowd at level 4, and the wait ramp — which is the thing a player is supposed to read
   *by floor* — is attributed to the wrong storey. **What I could not do is measure a real
   `rowPitch`**: it is `(plotHeight − 2 × inset) / (floors − 1)` and `plotHeight` comes from a
   laid-out box, which needs a browser. The check is one browser case per shipped building asserting
   that a full landing's stack stays below `row.y − rowPitch`; the fix, if it reproduces, is to cap
   **lanes** as well as figures — `+N` absorbs the difference and is already exact.

**Two small findings that belong to nobody and are recorded here so they are not lost:**

- `packages/viz/src/dev/motion.ts`'s docstring cites **`reducedMotion.test.ts`** as the file
  asserting `index.html`'s media-query block. **No such file is in the tree.** The assertion itself is
  real and green — it is in `packages/viz/src/dev/motion.test.ts`'s fourth case, which reads
  `index.html` as text and checks the universal selector and both `!important` properties. So the
  mechanism is sound and the **citation** is stale, which is the smaller half of the class
  [§ D227](../DECISIONS.md) is about.
- `stageScreen.ts#breathingDot` names motion it does not have (§ 6.1 (3)).

---

## 9. Requests to files this document does not own

⬜ **Issue #204 (accessibility standard)** — § 7's measurements are inputs to it, not a substitute for
it. The two that need a ruling: the non-text contrast floor that decides whether `tapping-foot` at
**1.78:1** against its own ground must move, and whether *hue plus size* satisfies the standard's
non-colour-only requirement as AD-S7 assumes.

⬜ **Issue #212** — its stated remedy (*rebuild the stage*) is refuted by
[`../ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § U and superseded by § 5.2
and § 5.3 of this document. **The scope should be rewritten to the two bounded changes** before it is
scheduled, or M2 will budget a renderer rewrite for a fill inversion.

⬜ **`DECISIONS.md`** — one entry when a lane lands § 5.2's door fix, because it changes a shipped
appearance that `guide § 7.2` describes in words; and one if AD-S9 moves the alarm threshold off
`guide § 7.2`'s literal forty, on `docs/12` § 4's four-move pattern (the handoff, the constraint,
what is implemented, what is preserved).

⬜ **`docs/05-roadmap.md`** — no new phase row for this work while it is unstarted.

---

## Sources

- [`design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
  § 7 (the stage), § 16 (interaction rules), § 19 (design tokens) — canonical for the
  interface per [`../CLAUDE.md`](../CLAUDE.md), and
  [`design/design_handoff_casual_mode/ENGINE_CONTRACT.md`](design/design_handoff_casual_mode/ENGINE_CONTRACT.md)
  § 14 (performance and safety — the two caps, the one `requestAnimationFrame` loop, the canvas
  sizing rule).
- [`12-design-handoff.md`](12-design-handoff.md) § 4 — the deviation register and the four-move pattern
  every deviation in this document follows.
- [`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 2 (the restyle
  contract, the token source, the contrast rule) and § 6 (non-goals 4 and 5).
- [`22-charter.md`](22-charter.md) § 2 — the five pillars, adopted by [§ D342](../DECISIONS.md).
- [`10-experience-layer-contract.md`](10-experience-layer-contract.md) — R3, R6, R13.
- [`29-audio-direction.md`](29-audio-direction.md) § 4.1 — the time-compression arithmetic § 6 shares.
- [`../ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § U and § V — #212's
  refutation and the shut-car finding.
- [`../DECISIONS.md`](../DECISIONS.md) — § D106, § D192, § D219, § D223, § D227, § D251, § D293,
  § D299, § D300, § D307, § D335, § D336, § D342, § D343.
- Code read for this document: `packages/viz/src/everyday/tokens.ts`,
  `packages/viz/src/everyday/stageScreen.ts`, `packages/viz/src/everyday/stageScreenModel.ts`,
  `packages/viz/src/frame/overlay.ts`, `packages/viz/src/live/types.ts`,
  `packages/viz/src/live/timeline.ts`, `packages/viz/src/honesty/properties.ts`,
  `packages/viz/src/honesty/types.ts`, `packages/viz/src/dev/motion.ts`,
  `packages/viz/src/everyday/settingsView.ts`, `packages/viz/index.html`.
