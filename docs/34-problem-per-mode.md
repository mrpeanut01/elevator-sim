# 34 — A problem per mode

**A decision number is owed for this document. Next free is D361; it is allocated at integration.**

---

## 0. What this document is

### 0.1 The instruction

*Every mode should present the player a problem to solve.* This document specifies, for each of the
four front-door modes, **what problem the player meets, how they see it before they are told a
number, what they can change, and how they find out whether they were right.**

It was also asked to question the design where questioning it makes the game better. § 7 does that
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
[§ D350](../DECISIONS.md), and § 7.3 argues a position without taking one. Whether Endless rush is
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
| **Measured here** | § 8.3 only, and it names its instrument |
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
printed on a static schematic band, and the second half of that sentence is a figure — *"a 341 s
mean wait to board, on one car for nine dense floors"*. `everyday/actionBar.ts` gives the `fixit`
row no timeline; nothing in the mode plays a day.

So on the four constraints this specification is written against, the exemplar mode scores:

| constraint | Fix a building today |
|---|---|
| 1 — the engine can produce it | **Passes**, entirely. Every axis is a real config patch through `parseBuilding` + `resolveBuilding` |
| 2 — the symptom is visible before a figure | **Fails.** There is nothing to watch, and two of the case's own `symptom` strings lead with a number |
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
