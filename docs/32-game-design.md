# 32 — Game Design Document

**Status: M1 specification artefact. Written 2026-08-24 on the charter programme branch, against
issue #194.** Documents only — nothing here changes a `.ts` file, a `data/*.json` file, or a shipped
string.

**Governed by [`22-charter.md`](22-charter.md)** ([§ D342](../DECISIONS.md)), whose five pillars and
ten success criteria this document may not amend, restate or add to. Criteria are cited as
`charter S1`…`charter S10` per [§ D343](../DECISIONS.md). **Built on
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md)**, which already states the core
loop, its five beats, its three-to-five-minute turn budget, the per-mode declaration and the
minute-1 / minute-10 / hour-3 sequence. **This document does not restate any of them.** Where
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) answers a question, it is cited and
the words are spent elsewhere.

---

## 0. Why this document exists, and the one rule it is written under

**There is no game design document in this repository, and there never has been.** What there is, is
a directory of design contracts — **31 numbered documents in `docs/`, 30 distinct ordinals, `16-`
being used twice** (measured 2026-08-24 by `ls docs/*.md`; the figure moves as this wave lands, so
the command is the claim and the number is a reading of it). They are excellent and they are
**engineering contracts**: they specify what a surface must not say, which figure may not travel
without its denominator, on what grounds a mean is refused, and what a control must do before it may
be drawn.

**None of them specifies what the player does, how progression works, what a unit of currency means,
or what losing looks like.** That is the gap, and it is the whole of this document's remit.

### 0.1 The rule this document is written under

> **A contract that already answers a question is cited and not restated.**

Restating a contract creates two accounts of one thing that can drift apart, which is the defect
class this repository exists to record — [`CLAUDE.md`](../CLAUDE.md) carries it in four forms (a
stale published number, a stale stated mechanism, a stale stated *refusal*, and a dead seam), and
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 0 refused to open on a blank page
for exactly this reason. **Nothing below weakens a contract**, and § 8 is the register that makes
that claim checkable rather than asserted.

Three consequences worth stating before anybody reads further:

1. **No second loop statement.** [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md)
   § 3.1 is the loop. This document builds progression, economy and failure **on** its five beats and
   uses its numbering unchanged.
2. **No second interface.** `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` is
   canonical for the interface per [`CLAUDE.md`](../CLAUDE.md). Where this document and the handoff
   appear to disagree, the handoff wins and the disagreement is **recorded** (§ 9) rather than
   arbitrated.
3. **No second set of numbers.** The simulator wins every disagreement about what a number means.
   Every quantity named below is one `packages/core/` already produces.

### 0.2 This document's own numbered series

Rules stated here are numbered **`GD1`…`GDn`** and are cited as `docs/32 GD4`, never bare —
[§ D343](../DECISIONS.md)'s rule, applied to a fresh letter pair rather than to one of the four
already in use. `S1`–`S10` is claimed twice in this directory (`charter S1`–`S10` and
`docs/16-change-scope-contract.md` `S1`–`S10`), `R1`–`R13` by
[`10-experience-layer-contract.md`](10-experience-layer-contract.md), `A1`–`A4` / `B1`–`B4` by
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md), `E1`–`E6` by
[`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md), and `G1`–`G9` **twice
over** by [`13-phase-6c-handover.md`](13-phase-6c-handover.md) and
[`25-vertical-slice.md`](25-vertical-slice.md). `GD` was checked against `docs/` and is unclaimed.

### 0.3 What this document decides, and what it does not

**Decides.** What every shipped mode is for and which half of the loop it serves; what progression
means in a product that has already decided not to gate; what a unit of currency is, what it buys
and what it may never buy; what losing looks like in each mode and what happens next; how difficulty
rises; and how one build serves two audiences without forking.

**Does not decide.** Mode ordering and the default entry point (an M2 human decision —
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 8, [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 9);
whether Endless rush is cut, merged or kept (§ 1.4 states a **recommendation** and flags it);
anything about art, audio, telemetry or the support matrix, which are their own lanes' documents;
and any change to a shipped string, which is M2's.

---

## 1. The shipped modes, declared

### 1.1 The two halves of the loop

[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 3.2 numbers five beats: **observe,
diagnose, change one thing, re-run the same crowd, read a verdict.** This document needs a coarser
handle than five and finer than one, so it names the two halves the beats already fall into — and
the split is the one § 3.2 itself draws when it says *beat 4 is where the honesty comes from and
beat 5 is where the satisfaction does*:

> **GD1 — The loop has two halves.** The **diagnostic half** is beats 1–2: you are given a building
> and you form a view. The **adjudicative half** is beats 3–5: you change one thing, you re-run the
> held crowd, and something that had no reason to agree with you tells you whether you were right.
> **A mode may serve one half without serving the other, and must say which.**

The halves are not equal in cost. The diagnostic half needs a run and a stage. **The adjudicative
half needs a held crowd**, which is common random numbers, which is the only reason a verdict can be
honest at all. That asymmetry is why three of the four shipped modes are complete in front and
incomplete behind ([`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 6): the
diagnostic half is the cheap half.

### 1.2 The four front-door modes

The first four columns are
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4's, which took them in turn from
`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`'s session-shapes table — the
same table `packages/viz/src/everyday/modes.ts` already reproduces word for word in each tile's
`shape` field. **They are cited, not re-derived.** The last two columns are this document's.

| Mode | Length | Beats | Retry costs | **Half served** | **What it is for** |
|---|---|---|---|---|---|
| **Today's tower** | ~3 min | 1 and 5 | one per day | **Diagnostic**, with a *social* fifth beat | The only mode whose verdict is against other people on the same seed rather than against your own previous attempt |
| **Campaign** | ~2 min a building-day | 3, by pricing it | units, and a works night | **Both**, with the adjudicative half made expensive | The only mode where a change costs something and persists past the day |
| **Endless rush** | ~5 min | 1 only | nothing — no retry exists | **Neither** — see § 1.4 | It answers *where does this configuration break*. That is a limit, not a differential |
| **Fix a building** | ~5 min a case | all five, on one screen | free, and it says so | **Both, entire** | The only mode that closes the loop without navigating |

**One mode serves the adjudicative half in full without qualification, and it is Fix a building.**
That is a structural fact about the build rather than a preference:
`packages/viz/src/everyday/fixitScreen.ts` calls `runFixitPair` in-screen, so the held crowd and the
verdict are on the surface the change was made on. It is also the mode with the least ceremony
around it — no career, no world, no currency — which is worth noticing before § 2 adds any.

### 1.3 The hour-3 containers, which are not modes and are declared anyway

Four shipped screens are not modes and are routinely mistaken for them, because they appear in the
same rail and the same registry (`packages/viz/src/everyday/screens.ts` registers **17** screen
keys). They are declared here so that a future proposal cannot smuggle a fifth mode in as a panel.

| Screen | What it is | Relation to the loop |
|---|---|---|
| **Dispatcher workshop** | Where a dispatcher is authored and edited | Not a turn. It changes **what beat 3 can reach** |
| **Test bench** | Where two dispatchers meet the same crowd under CRN and an interval is drawn | **Beat 4 and beat 5, with the day removed.** The bench is the adjudicative half as an instrument |
| **Design a building** | Where the fabric is authored | Not a turn. It changes **what beat 1 is a run of** |
| **Today's board / Dispatcher ladder** | The daily board, and the gauntlet's rating over forty fixed proof cases | Not a turn. It is **where a verdict is placed among others** |

> **GD2 — The hour-3 containers take the loop's object, not its turn.**
> [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 5 states what happens at hour 3:
> *the unit of interest has moved from the run to the dispatcher — the day has become the test and
> the dispatcher has become the thing being tested.* These four screens are that sentence, built.
> **They are therefore never gated behind a mode** (§ 2), and they never carry a verdict of their own
> (§ 4).

**The ladder is the one that has to be read carefully, and the tree has already read it correctly.**
`packages/viz/src/gauntlet/rating.ts` computes a rating as *the share of rides that waited a minute
or less, averaged over the forty proof cases — one run of each, every entrant on the identical
crowd*, and states in its own docstring that a rating **orders the ladder and is not a measured
difference**: forty pairs is under the 50–200 budget
[`CLAUDE.md`](../CLAUDE.md) sets, so the module emits *no verdict, no comparison and no winner*, and
the caveat is drawn wherever the number is. That is `docs/10 R2` — *no leaderboard ranking
dispatchers from single runs* — honoured by a module that had every incentive to cheat it. **§ 4's
failure model and § 3's economy are written to the same standard.**

### 1.4 Endless rush — the disposition

**No mode is marked for cut.** One is marked for **re-declaration**, and it is Endless rush.

[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 3.4 establishes the structural
fact and this document accepts it without reopening it: the rush **has no beat 4**, because the
crowd is defined by how far you got, so it cannot be held constant across a change; with no held
crowd there is no counterfactual and nothing for a referee to adjudicate. What it produces is a
**limit**, not a differential.

Read through `docs/32 GD1`, that is sharper than *it is missing a beat*: **the rush serves neither
half.** It does not serve the adjudicative half for the reason above. And it does not serve the
diagnostic half either, because the diagnostic half ends in a *view about why*, and the rush's
output is a *where* — the point at which a fixed configuration stopped draining. A player who
watches a rush learns a number about a configuration they did not change.

**Three dispositions were available. This document recommends the third and does not take it.**

1. **Cut it.** Cheap, and it loses the one question no other mode asks. *Where does this break* is
   the question an hour-3 player has about a dispatcher they are maintaining, and today nothing else
   answers it.
2. **Build it as a mode.** It needs a demand template that ramps without a ceiling, a held-time
   stage and a result screen — none of which exists
   (`packages/viz/src/everyday/rushScreenModel.ts` draws four separate absences and refuses its own
   primary). At the end of that work it still serves neither half of the loop, so the spend buys a
   fourth tile that the loop cannot use.
3. **Demote it to an instrument.** Same engine work — the climbing demand template is the whole of
   the cost — but its output lands where a limit is useful: **beside the bench**, as the answer to
   *where does this dispatcher break*, on the dispatcher the player is maintaining. It stops being a
   front-door tile and becomes the third thing the hour-3 containers do, next to *edit it* and
   *compare it*.

> **GD3 — Endless rush is a calibration instrument, and its home is the bench.** It is declared as
> serving **neither half of the loop** and producing a **limit** rather than a differential, per
> [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 3.4. Its value is real and it is
> an hour-3 value, not a minute-1 value: a limit is only interesting once the player has a
> configuration they care about. **This is a recommendation, not a decision** — moving a tile off the
> front door is an interface change, and the interface is the handoff's (§ 9, open question **Q1**).

**One thing about the rush is not a disposition question and can be settled without one.** The tile
advertises *`~5 min · the run always ends; the question is when`* and opens onto a screen whose
primary refuses, because there is no engine behind it —
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4.1 row 2 names this as
disagreement 2 between the build and the handoff. **A session shape is a claim about a session the
build can deliver.** Advertising one it cannot is the polarity of [§ D227](../DECISIONS.md) that
`charter` non-goal 5 forbids — a control that writes nothing may not look live — arriving one level
up, on a tile rather than on a control. Whether the rush is a mode or an instrument, **the shape line
may not promise a session that refuses**, and that is an M2 gate item rather than a positioning
decision.

### 1.5 The fifth container: the Engineer product's challenges

[`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 4 specifies six
engineering challenges `E1`–`E6` (commission to the brief, design to the interval, diagnose the
saturation, find what moved, meet the handling-capacity target, the Pareto trade study). **They are
modes, they belong to the other product, and they are declared here for one reason only**: to record
that they are the *same five beats in the technical register*, not a second loop. `docs/21 E3`
(diagnose the saturation) is beats 1–2; `docs/21 E4` (find what moved) is beats 4–5; `docs/21 E1`
and `E2` are beat 3 under a constraint. **A challenge that does not map onto the five beats is a
finding to record, not a seventh challenge** — and the mapping is § 6's evidence that one loop
serves both audiences.

---

## 2. Progression and unlocks

### 2.1 The decision this repository has already taken, and this document honours

**Progression in this product does not gate, and that was decided before this document existed.**
`packages/viz/src/shift/contracts.ts` records it at source: the vendored design's own
`algoUnlocked` returns `true` unconditionally and says why in the same breath — *"Every dispatcher is
available from the start — scenarios teach, they do not gate"* — and the implementation deliberately
**did not port** the completion-based unlock ladder sitting dead beneath that early return, *"because
porting a branch the design disabled is how a gate arrives by accident"*. `contractStatus` has three
answers — `cleared`, `current`, `open` — and **none of them is `locked`**.

That is not merely a build state to be respected. It is the only reading compatible with
[§ D299](../DECISIONS.md) § 2, which forbids a capped Casual product and states that named play
styles are *an entry point, never a ceiling*. **A lock that cannot be opened by playing is a cap; a
lock that can be opened by playing is a cap with a timer on it.** Both are the broken promise
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1.3 names.

> **GD4 — Nothing is ever locked. Progression is the order in which mechanisms are introduced and
> surfaces are offered, never the set of things permitted.** Every screen in
> `packages/viz/src/everyday/screens.ts`'s registry is reachable from the main menu in the first
> session. What progression moves is what the product **puts in front of you next**; it never moves
> what you may reach.

This is not a weaker form of progression. It is the form
[`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.4 already specifies for the
campaign — *"progression is by **mechanism introduced**, not by score threshold"* — generalised from
one mode to the product. § 5.4's own list is the proof that the mechanism ordering carries a game on
its own: it is ordered so that each stage adds exactly one concept, and its stage 3 is *unwinnable as
configured* and says so.

### 2.2 The four rules

> **GD5 — An introduction fires on a completed turn of a named kind, never on a threshold over a
> metric.** A door that opens when a number crosses a line is a score with a door on it, and a score
> over a run is `charter` non-goal 1 and `docs/10` § 5.5's first three bullets. *Completing a Fix a
> building case* is a valid trigger; *reaching 85 % away-inside-a-minute* is not.

> **GD6 — One introduction names exactly one mechanism.** The mechanism is named in the player's
> words, and it is a thing the player can now *do* or *see*, never a reward. `data/campaign.json`
> already carries the field this rule is enforced against: every stage has a `teaches` string, and
> ten of ten are populated (*"a call, a car, a wait"*, *"saturation, and why a diverging queue has no
> average"*, *"that at a hundred floors the geometry decides more than the weights do"*).

> **GD7 — Nothing is ever re-introduced, re-hidden, or made conditional again.** A surface the
> product has offered stays offered. This is the half of `docs/32 GD4` that a difficulty setting or a
> reset would otherwise erode.

> **GD8 — An introduction may not be bought.** No currency in § 3 opens a surface, a mode, a
> building, a dispatcher or a case. Progression and economy are orthogonal, because a currency that
> buys access is a currency that measures progress, and a currency that measures progress is a score
> with a wallet on it.

### 2.3 What opens, when, and on what

**Specified.** Column 3 is the trigger, and every trigger is a *completed turn of a named kind* per
`docs/32 GD5`. Column 4 is the single mechanism per `docs/32 GD6`. **Column 5 is the honest one**:
what a player who ignores the whole table can already reach, which under `docs/32 GD4` is
everything.

| # | What is **offered** | On what | The one mechanism it names | Reachable before it? |
|---|---|---|---|---|
| **1** | **Fix a building**, first case | First load. Nothing precedes it | *The whole loop, on one screen, and the retry is free* | — it is first |
| **2** | **Today's tower** | One Fix a building case completed | *The held day: the same day for everybody, and only one go at it* | Yes, from the menu |
| **3** | **Campaign**, first contract | Two Fix cases completed, **or** one Today's tower day filed | *A change that costs something and lasts past today* | Yes, from the menu |
| **4** | **Dispatcher workshop** | The first campaign day whose suggested lever is a dispatcher weight | *The dispatcher is a thing you can open and edit* | Yes, from the menu |
| **5** | **Test bench** | The first edited dispatcher saved in the workshop | *Two dispatchers, one crowd, and an interval that can say "too close to call"* | Yes, from the menu |
| **6** | **Design a building** | The first campaign contract that offers a commissioning choice | *The fabric is a variable too, and it is the expensive one* | Yes, from the menu |
| **7** | **Dispatcher ladder** | The first bench comparison read to a verdict | *A rating orders a ladder; it does not settle a comparison* | Yes, from the menu |
| **8** | **Tune the tower** | The first ladder row read | *A search over the weight space, and a holdout set to catch it overfitting* | Yes, from the menu |

**The ordering is derived and not invented, and there are three sources under it.** Rows 1–3 follow
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4's retry-cost column read as a
ladder: **free → one a day → priced**, which is the only ordering under which the player meets an
expensive retry after they have learned what a retry is for. Rows 4–8 follow
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 5's hour-3 sentence — the object
of attention moves from the run to the dispatcher — and are ordered *author → compare → rank →
search*, which is the order in which each container's output becomes readable: a ladder row means
nothing to somebody who has not read an interval, and a tuner's holdout verdict means nothing to
somebody who has not seen a ladder.

**The campaign's own internal ordering is not re-specified here.**
[`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.4 owns it, `data/campaign.json`
ships ten stages against § 5.4's seven, and each carries its own `teaches`. § 5.4 also carries its own
measured correction — that *"winnable trivially"* is false of stage 1 under the bar the build ships —
and that correction is left exactly where it is.

### 2.4 What is never introduced, because it is never withheld

Stated as a list because each is a thing somebody will otherwise propose as an unlock:

- **Dispatcher profiles.** All of `data/dispatcher-profiles.json`, from the first session. The
  design's own comment is the authority (§ 2.1).
- **Buildings.** Every file in `data/buildings/`. A building is a *place a question is asked*, not a
  prize.
- **Cost terms, weights and constraints.** `docs/21` § 3.6 and [§ D299](../DECISIONS.md) § 2 —
  a Casual player can author and tune a dispatcher completely.
- **Any figure, and any refusal.** `charter P5`: the register changes, the figures do not. An
  interval is not an advanced feature.
- **The Engineer product.** The door is on the rail from the first load
  ([§ D338](../DECISIONS.md)), and the way back is in the Engineer header.

> **GD9 — If a proposal's benefit is "the player has not earned this yet", it is refused.** The
> product's scarcity is *time* and *attention*, never *permission*.

### 2.5 What progression is actually made of, if not locks

Three things, and naming them is what stops `docs/32 GD4` reading as *there is no progression*:

1. **A next thing to be curious about.** The `teaches` line of the next stage, the next contract's
   `reward` sentence — prose about what the scenario taught, which
   `packages/viz/src/shift/contracts.ts` keeps precisely because it is not a gate.
2. **A record that accumulates.** The week, the career, the ladder. § 3 is what that record is made
   of.
3. **A rising floor of difficulty**, which is § 5, and which is demand and fabric and nothing else.

---

## 3. The economy

### 3.1 There are three currencies, not one, and only one of them is money

The shipped career campaign (`packages/viz/src/campaign/economy.ts`, implementing
`docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md` § 8) already runs three scarce
quantities. They are named together here because every design mistake available in this area comes
from treating them as one.

| Currency | What it is | Earned by | Spent on | Where it lives |
|---|---|---|---|---|
| **Units (`u`)** | Money | Clearing a day, at the contract's rate | Works from the shop, service windows, refurbishment | `economy.ts#purseOf` |
| **Nights** | The building out of service | Not earned — **only spent** | Every works tier above zero nights | `economy.ts#WorksBooking.nights` |
| **Standing** | The record | `cleared × 2 − missed × 3`, summed over towers | Nothing. It is **spent on nothing** and opens slots | `economy.ts#standingOf` |

**Nights are the currency that makes the game.** Units are only interesting because the thing they
buy takes the building apart while it is being fitted: *a fourth car* costs 34 u and **eight nights
with two cars out**. So the shape of a campaign decision is not *can I afford this* but *can I
survive buying it*, and the answer changes with where in the contract you are —
`economy.ts#daysOfBenefit` refuses a purchase that would go live after the contract ends, and says
so with `past-contract` rather than silently hiding the tier.

> **GD10 — Spending must make the near days harder.** A purchase that is purely additive is a
> number going up. Every works tier above tier 1 in the shipped shop takes capacity away first and
> gives it back later, and that ordering is the mechanic. A future currency sink that costs nothing
> in the present is refused under this rule.

### 3.2 What a unit means

> **GD11 — A unit is a cleared day.** It has exactly one source — the contract's rate, paid per
> cleared day and stepping every five days — and exactly one sink, which is works. **So every price
> in the shop is a duration**, and it can be read as one without any conversion: at Standard's
> week-four rate of 6 u a day, *a fourth car* is about six cleared days, and *full destination
> dispatch* is four.

That is not a metaphor bolted on afterwards; it is what the arithmetic already is, and the two
published totals make it checkable. A perfect Standard month pays **98 u**
(`economy.ts#perfectMonthUnits`, summed from the rate table rather than written down) against a shop
worth **324 u** (`economy.ts#shopTotalUnits`, summed from the shop). **You cannot buy the shop, and
you cannot come close.** A perfect month buys about a third of it, and the difficulty tier's own
note says so in the player's words.

Two consequences that are design decisions rather than observations:

1. **The economy is a choosing problem, not an accumulating one.** With a third of the shop
   reachable in a perfect month, the interesting question is permanently *which third*, which is why
   the shop has six categories that fix different things (doors buy time at every stop, tenants
   change the demand itself, shafts change the fabric) rather than one ladder.
2. **Kit belongs to the building, not to the player.** `TowerEconomy.fitted` is carried separately
   from this month's bookings precisely so a renewed tower does not pay twice for doors it already
   owns, and *hand it back* frees the slot with the note *"the kit stays with the building, because
   it always belonged to it."* **There is no player inventory.** A career is a record of buildings
   improved, not a pile of possessions.

### 3.3 What a unit cannot buy

`packages/viz/src/commissioning/types.ts` states three prohibitions on the *capital* constraint and
has them asserted three ways by `budget.test.ts` — no capital figure reaches any report shape, no
runtime file in that directory can even import a reporting surface, and every player-facing string
it produces is scanned for comparative and scoring vocabulary. **Those prohibitions are adopted here
verbatim for every currency in § 3.1, not just for capital**, and two more are added.

> **GD12 — The five prohibitions on currency.**
> 1. A currency may gate what can be **chosen**. (`commissioning/types.ts`, prohibition 1.)
> 2. It may **never** appear on a results page, be compared between players, or be folded into any
>    verdict. (Prohibition 2.)
> 3. Nothing may print *"you spent 82 % of budget"* beside a wait figure. (Prohibition 3.)
> 4. **It may not buy access** — no mode, screen, building, dispatcher, case or figure is for sale
>    (`docs/32 GD8`).
> 5. **It may not buy a verdict, a retry that the mode declares free, or relief on a measurement.**

Prohibition 2 is the load-bearing one and it is
[§ D106](../DECISIONS.md)'s argument one step earlier in the pipeline, which
`commissioning/types.ts` states better than a restatement could: energy is an axis and never a score
because `nearest-car` sits on the Pareto front at six of eight cells *by carrying fewer people*, and
**the cheapest building is the one with the fewest shafts.** A capital score ranks the building that
served nobody first. `workPerServedLegKJ` exists so that raw energy has a *beside*; the decision
already taken, and honoured here, is that **capital has no beside** — it is spent before the week and
never displayed as an outcome.

### 3.4 Standing, and why it is not a score

Standing is the one quantity in this product that looks most like the thing the charter forbids: a
single number that goes up when you do well and down when you do badly. It survives for three
reasons, and the reasons are the specification.

1. **It is a tally of completed turns, not a statistic over a run.** `cleared × 2 − missed × 3`
   counts days, and a day is cleared or missed by the four day-goals in
   `packages/viz/src/shift/goals.ts` — whose observation type carries **no suppressible field at
   all**: no `meanWaitS`, no `wait95S`, no `meanTimeToDestinationS`. *A goal that wanted to grade a
   mean could not be written against this type.* That is `charter` non-goal 1 enforced structurally
   rather than by review.
2. **It buys nothing** (§ 3.1). It is spent on no purchase and confers no advantage on any run.
3. **What it opens is concurrency, not capability.** `economy.ts#SLOTS` — `0 / 14 / 30 / 60 / 110 /
   180` — governs *how many towers you may hold at once*, and the design's own note on the sixth is
   the whole justification: *"nobody supervises six towers by watching them."*

> **GD13 — A slot is a limit on attention, not on permission, and it is the only permitted form of
> scarcity that is not time.** At standing zero a player may reach every screen, every building,
> every dispatcher and every mode. What they may not do is run six contracts at once. That is
> `docs/32 GD9`'s scarcity — time and attention — expressed as a rule of the career, and it is why
> `docs/32 GD4` and the shipped `SLOTS` table are not in conflict.

**This also settles the boundary `docs/32 GD5` draws.** A threshold over a *count of completed
turns* is permitted, and `standingOf` is the model of it. A threshold over a *run metric* is not,
and never becomes permitted by being called standing.

### 3.5 The daily loop's economy, which is deliberately empty

**Today's tower has no currency and must not acquire one.** Its shape line is *"no losing — a day is
a score, not a pass"*; its output is a day, a record of it in the week, and a place on the board. A
currency there would make the same day worth more to a player who had played more days, which
breaks the one property the mode exists for: **the same day for everybody**. `docs/32 GD8` already
forbids it buying access; this is the stronger statement that the mode holds no wallet at all.

### 3.6 What is genuinely open in the economy

Named here rather than left for a reader to discover:

- **The daily failure draw does not exist.** `campaign/career.ts` publishes its own refusal:
  incidents are *"the two the building implies — a renewal falling due, and a service window the
  wear clock has reached"*, and the other two the design describes are *"draws this build cannot
  make: there is no seeded stream for a campaign day and no event calendar behind a contract."*
  So `failureOddsPct` — `0.4 + 7.5·wear^2.4 + 3·max(0, refit − 0.6)` per cent a day — computes a
  probability **nothing rolls against**. It is not a dead seam by this repository's definition (the
  screens read it and show it), but the odds are currently a forecast rather than a hazard, and
  § 9's **Q3** asks for the seeded stream that would make it one.
- **Nothing files a campaign day.** `career.ts` says so in its own words, and
  [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 6 files it as Campaign's failure
  at beat 5. Until a day is filed the whole economy above is arithmetic over a record that cannot be
  written to by playing.

---

## 4. Failure

### 4.1 The four named causes, and why they are causes rather than grades

[`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.3 specifies four fail
states — **Overwhelmed**, **Abandoned**, **Stranded**, **Locked out** — each with a plain sentence,
a one-line diagnosis naming the floor or the credential involved, and a suggested lever drawn from
the scenario's own editable dimensions, the lever being *"a hint, never an automatic fix, and never
phrased as 'the right answer' — there is a Pareto front here, not an optimum."* They are shipped in
`packages/viz/src/campaign/failStates.ts`. **This document adds nothing to that list and takes one
thing from it**, which is the mechanism that makes `charter` non-goal 1 survivable:

> **GD14 — Losing is a named cause with a place attached, never a score that fell short.** A failure
> is reported as *what went wrong*, *where*, and *how often*, and never as a quantity compared to a
> bar. This is what makes failure legible without a grade letter: a letter says how badly, and a
> cause says what to change — which is beat 2 of the loop delivered by the failure itself.

The frequency and the place come from different places, and `failStates.ts` already resolves that
correctly for the reason `charter P1` requires: *how often* is counted over the **batch**, because a
fail state read off one run is a coin flip (Secure Tower under `collective` returns a quotable AWT on
6 of 20 seeds and is diagnosed saturated on 4 of 20 — the same configuration); *where* is taken from
**one replayed replication of that same batch**, at its seed, and the report says which run it is and
prints the seed. **Locked out is the one the batch cannot count, and its frequency line is a refusal
with its reason rather than a zero.**

### 4.2 What losing looks like, per mode

| Mode | What losing is | What it costs | What happens next |
|---|---|---|---|
| **Fix a building** | Not clearing the case's bar on the re-run | **Nothing.** The retry is free and the mode says so | Retry, with the previous attempt still on screen to compare against |
| **Today's tower** | **There is none.** *"no losing — a day is a score, not a pass"* | — | The day is filed to the week; the board places it among other people's |
| **Campaign — a day** | A missed day: one or more of the four day-goals unmet at close | A day's rate not paid, and one against the difficulty's miss allowance (`6 / 3 / 1 / 0`) | The next day, with the building one day fuller (§ 5.2) |
| **Campaign — a contract** | Missed days exceeding the allowance | The contract is lost; the tower's slot frees | One of `LOST_CONTRACTS_MAX` = **3** |
| **Campaign — a career** | Three lost contracts | *"the agency stops calling"* (`career.ts#LOST_CONTRACTS_MAX`, § 8.10) | A new career. Standing banked from finished contracts carries |
| **Endless rush** | The run ending is not losing — it is **the measurement** | — | The number is the output (§ 1.4) |
| **Bench, ladder, workshop** | **No failure state exists and none may be added** (`docs/32 GD2`) | — | — |

**Two shapes in that table are worth naming, because a designer will otherwise try to make them
uniform.** Fix a building's failure is free and immediate; the career's failure is cheap once,
serious three times, and slow. That is the retry-cost ladder of
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4 arriving as a failure model, and
it is the correct ordering for the same reason: a player meets an expensive failure only after they
have learned what a retry is for.

### 4.3 The fifth outcome, which is not a failure and must never be drawn as one

> **GD15 — A refusal is not a loss.** When the simulator declines to stand behind a figure — a
> suppressed mean on any of [`CLAUDE.md`](../CLAUDE.md)'s five grounds, an interval containing zero,
> a `locked-out` frequency the batch cannot see — the player has not failed and must not be told
> they have. **The refusal is a result, and in the campaign's own stage 3 it is the intended
> result**: [`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.4's stage 3 is
> *unwinnable as configured*, says so, and its goal is *diagnose it*, not *beat it*.

This is `charter P2` — a refusal is a feature, not an error state — applied to the one surface where
the temptation to soften is strongest, which is the sheet that tells somebody how their day went. It
is also `charter S6`'s instrument: **six of ten testers being able to state, unprompted, why the
simulator refused a number** is only achievable if refusals are drawn as information rather than as
setbacks.

A practical corollary, and it is a copy rule: **a refusal and a miss may not share a visual
treatment.** A missed goal and a withheld mean are different kinds of thing, and a screen that
renders both in the same red is teaching the player that the product's honesty is their punishment.

### 4.4 What may never be built as a failure

- **A grade letter, a star rating or a score over a run**, on any surface, for any mode.
  `charter` non-goal 1; `docs/10` § 5.5's first three bullets.
- **A failure derived from a suppressed figure.** Structurally impossible in the day goals today
  (§ 3.4) and it must stay that way.
- **A failure a currency can pay off.** `docs/32 GD12` prohibition 5.
- **A retroactive failure.** `docs/32 GD7` — nothing is re-locked, and that includes a day already
  filed.
- **A "you were close" softener.** `charter` non-goal 3.

---

## 5. The difficulty model

### 5.1 Difficulty and stakes are two different things, and the charter's wording covers one

`charter` non-goal 6 forbids *"a difficulty setting that changes anything other than declared
traffic parameters and building fabric. Difficulty is demand and geometry; it is never a fudge
factor on a metric."* [`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.5
carries the same sentence.

**The shipped difficulty tiers do not move demand or geometry at all.**
`packages/viz/src/campaign/economy.ts`'s four tiers move the starting purse (`16 / 8 / 5 / 3`), the
rate ladder, the miss allowance (`6 / 3 / 1 / 0`) and four bar values — the away share, the worst
wait, the lobby queue cap and the trip budget. **None of those is a traffic parameter and none is
fabric**, so read literally the shipped mechanic sits outside the charter's permission and inside
its prohibition.

This document resolves that by drawing a distinction the charter's sentence does not, and it is
flagged for the product owner as § 9's **Q2** rather than assumed:

> **GD16 — Difficulty is what the building faces. Stakes are what a miss costs you. They are set
> separately and they are never confused.**
> - **Difficulty** may move exactly two things: **demand** and **building fabric**. That is
>   `charter` non-goal 6 unchanged.
> - **Stakes** may move the purse, the rate, the miss allowance and the **bar** a day is cleared
>   against — and nothing else. A bar is not a metric: the figure is measured identically at every
>   setting, displayed identically at every setting, and what changes is only what counts as
>   clearing a day.
> - **Neither may touch a measurement.** No setting scales a wait, widens a suppression ground,
>   relaxes a censoring limit, or changes a replication count.

**Why the distinction is real and not a loophole.** A fudge factor on a metric makes two runs
incomparable — it is the defect `charter P1` exists to prevent, because the number stops meaning the
same thing. Moving a bar leaves every number identical and moves only the sentence *"today counted"*.
The test that separates them is mechanical and should be added to the M2 gate: **run the same seed at
all four settings and require the recording to be byte-identical.** That is
[`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 3.3's byte-identity criterion
pointed at a difficulty selector instead of a mode switch, and it fails the moment a tier touches
demand.

### 5.2 How difficulty actually rises, and it is one mechanism per mode

| Mode | The mechanism | Substrate it moves | Shipped? |
|---|---|---|---|
| **Campaign career** | The building fills up overnight — `1 + 0.11 × (day − 1)`, **linear, applied as a real edit to a real `BuildingConfig` put back through `parseBuilding` and `resolveBuilding`** | Fabric (floor populations) → demand | Yes — `packages/viz/src/shift/growth.ts` |
| **Campaign career** | Today's twist: five events, each writing engine fields — a car out of service, a swung directional mix, a raised or lowered rate, an interfloor share | Demand, and service | Yes — `packages/viz/src/shift/events.ts` |
| **Campaign career** | Wear: trips since the last service window raise the daily failure odds | Fabric (availability) | Partly — § 3.6 |
| **Campaign stages** | **Mechanism, not level.** Each stage adds one concept and one building | Fabric and demand, chosen per stage | Yes — `data/campaign.json`, 10 stages |
| **Fix a building** | The case's own fault, authored per case | Whatever the case declares | Yes — 18 cases |
| **Endless rush** | A demand ramp with no ceiling | Demand | **No** (§ 1.4) |

**`growth.ts` is the model of how a difficulty mechanism must be built**, and it says so in its own
docstring: the handoff's version scales the header, and this one edits the building and reloads it
through `core`'s own path, because *"a growth factor that only reached the tenant count in the header
would be the twelfth dead seam, and it would be a lying one."* It is also linear rather than
compounding for a stated reason — at day 20 the two differ by more than a factor of two, and Vertical
City compounded would carry 35 000 people.

> **GD17 — A difficulty mechanism is a run that differs, demonstrated on the legs.** This is
> `charter P4`'s refusal test — *move the control and require the run to change, compared on the legs
> rather than on a window statistic* — applied to difficulty. `packages/viz/src/shift/events.ts`
> already meets it: `events.test.ts` runs every event against a no-event control on a real shipped
> building and asserts the run differs **in the way the event claims** — a car genuinely idle, a
> directional mix genuinely swung, a rate genuinely raised. **That is the test a caption cannot
> pass**, and no new difficulty mechanism ships without its equivalent.

### 5.3 The substrate, cited and not restated

[`14-building-behaviour-contract.md`](14-building-behaviour-contract.md) is the contract for what
demand and passenger behaviour may be made of, and § 0 is the constraint every dial below inherits:
**every feature arrives opt-in and off by default, and a run that does not ask for it must be
bit-identical to the run before the feature existed.** That is why difficulty may reach into these at
all — a dial that is off by default cannot move a published pin.

| Dial | What it changes | Contract |
|---|---|---|
| Arrival rate, directional split, group size, inter-day variability | How many people, going where, in what batches | `docs/14` §§ 2.1–2.3 |
| **Patience and abandonment** | How long somebody will stand there before leaving | `docs/14` § 3.1 |
| **Lift-lobby crowding** | Boarding slows as the queue deepens — *the* non-linear term | `docs/14` § 3.2 |
| **Stairs, with real asymmetry** | Who leaves the queue upward or downward instead of waiting | `docs/14` § 3.3 |
| Floors, shafts, speed, capacity, population, zoning | The fabric | `data/buildings/`, `docs/04` |

**Two of those come with a published-figure obligation that difficulty may not evade.** Abandonment
*improves* AWT by construction — it removes the longest waits from the sample — so the abandonment
count and the stairs uptake are **published beside AWT and never folded into it**, on exactly the
footing `workPerServedLegKJ` sits beside raw energy, and an abandonment rate above 2 % suppresses the
mean outright as the fifth of [`CLAUDE.md`](../CLAUDE.md)'s five grounds. **A difficulty setting that
raised abandonment would therefore make the product say less about the run**, which is `charter P2`'s
refusal test failing. So:

> **GD18 — Difficulty may not be raised by a dial that suppresses a figure.** Crowding is the
> preferred non-linear dial precisely because it makes the run harder without removing anybody from
> the sample. Patience is legitimate as a **building property** — a hotel's guests and a hospital's
> visitors are not equally patient — and illegitimate as a **difficulty knob**, because turning it up
> buys difficulty by deleting the evidence.

### 5.4 The difficulty curve across a first session

Specified against the loop rather than as a numeric ramp, because a numeric ramp would be the score
this product does not have:

1. **First case (Fix a building).** The fault is *given*, plainly, before any decision — the handoff
   cut the guess-the-fault quiz because *"it gated the interesting decision (what to spend) behind a
   comprehension test"*. Difficulty here is zero by construction and the play is the choice.
2. **Later cases.** The fault stays given; what rises is the number of plausible responses and the
   cost of the wrong one.
3. **Today's tower.** Difficulty is whatever the day is. It is the same for everybody, which is the
   mode's whole point, and it is therefore not a dial at all.
4. **Campaign, first contract.** The forgiving building, day one, standing zero
   (`career.ts#openingCareer`). Difficulty rises **inside** the contract by growth, not between
   contracts by a setting.
5. **Campaign stage 3.** The first thing that cannot be won, arriving after the player has won
   things. `docs/10` § 5.4: *"A game that cannot be lost teaches nothing, and this simulator's losing
   condition is real."*
