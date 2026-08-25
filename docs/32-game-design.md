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

Rules stated here are numbered **`GD1`…`GDn`** and are cited as `docs/32 GD5`, never bare —
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

**Today's tower's fifth beat is *social*, and that is a real counterfactual rather than a substitute
for one.** The mode has no beat 4 of its own, because the day does not come back. But every player
on the board met **the identical crowd** — it is the same day for everybody — so the comparison is
like-for-like by construction, which is what common random numbers buy inside one player's session
bought instead across players.

> **GD2 — A board publishes what happened on a day. It never publishes which dispatcher is
> better.** That distinction is what keeps a daily board inside `docs/10 R2` (*no leaderboard
> ranking dispatchers from single runs*), and the product has already taken the same position twice:
> `shift/goals.ts` argues that a per-day goal *"is not a claim about a dispatcher"* and is legitimate
> for exactly that reason, and `gauntlet/rating.ts` emits no verdict, no comparison and no winner.
> Two further guards are already decided and are not this document's to relax: every posted run is
> **replayed and verified by a server** before it appears (a forged submission returns
> `422 metrics-do-not-reproduce`), and seeded reference rows are labelled **reference** and posted
> through the ordinary path, *"so nobody is invented"* ([§ D300](../DECISIONS.md) E-3).

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

> **GD3 — The hour-3 containers take the loop's object, not its turn.**
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

> **GD4 — Endless rush is a calibration instrument, and its home is the bench.** It is declared as
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
modes — of the other product — and they are declared here for one reason only**: to record that they
are the *same five beats in the technical register*, not a second loop.

| Challenge | Beats | Note |
|---|---|---|
| `docs/21 E1` — commission to the brief | **3**, under a declared capital constraint | The constraint the loop's beat 3 requires, priced |
| `docs/21 E2` — design to the interval | **3–5** | The interval *is* beat 5, stated as the goal rather than as the outcome |
| `docs/21 E3` — diagnose the saturation | **1–2** | The diagnostic half alone, and the only challenge that is |
| `docs/21 E4` — find what moved | **4–5** | The adjudicative half alone. `docs/32 GD1`'s split, arriving as two separate briefs |
| `docs/21 E5` — meet the handling-capacity target | **3–5**, against an analytic ceiling | The verdict is the judge's; the closed-form plate sits beside it, *"two bases, labelled, never merged"* |
| `docs/21 E6` — the Pareto trade study | **Does not map, and that is the finding** | It varies more than one thing on purpose, so beat 3's *change one thing* does not hold. What it delivers is a **front**, not a verdict — which is § 1.4's *limit rather than differential* distinction arriving on the Engineer side |

**`docs/21 E6` is the useful row.** Under this document's own rule — *a challenge that does not map
onto the five beats is a finding to record, not a seventh challenge* — it is recorded rather than
forced: a trade study is a **different question**, asked over a candidate set rather than over one
change, and it is the second thing in this document (Endless rush is the first) that is legitimate,
valuable and **not a turn of the loop**. Two of them, found independently on the two products, is
the loop being a real constraint rather than a label. The other five rows are § 6's evidence that
one loop serves both audiences.

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

> **GD5 — Nothing is ever locked. Progression is the order in which mechanisms are introduced and
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

> **GD6 — An introduction fires on a completed turn of a named kind, never on a threshold over a
> metric.** A door that opens when a number crosses a line is a score with a door on it, and a score
> over a run is `charter` non-goal 1 and `docs/10` § 5.5's first three bullets. *Completing a Fix a
> building case* is a valid trigger; *reaching 85 % away-inside-a-minute* is not.

> **GD7 — One introduction names exactly one mechanism.** The mechanism is named in the player's
> words, and it is a thing the player can now *do* or *see*, never a reward. `data/campaign.json`
> already carries the field this rule is enforced against: every stage has a `teaches` string, and
> ten of ten are populated (*"a call, a car, a wait"*, *"saturation, and why a diverging queue has no
> average"*, *"that at a hundred floors the geometry decides more than the weights do"*).

> **GD8 — Nothing is ever re-introduced, re-hidden, or made conditional again.** A surface the
> product has offered stays offered. This is the half of `docs/32 GD5` that a difficulty setting or a
> reset would otherwise erode.

> **GD9 — An introduction may not be bought.** No currency in § 3 opens a surface, a mode, a
> building, a dispatcher or a case. Progression and economy are orthogonal, because a currency that
> buys access is a currency that measures progress, and a currency that measures progress is a score
> with a wallet on it.

**One shipped mechanic looks like a counterexample to all four and is not.** The career's
`economy.ts#SLOTS` opens a second tower at standing 14, a third at 30, and so on to a sixth at 180.
It survives `docs/32 GD5` and `docs/32 GD6` for reasons that are worth reading in full rather than
summarising, and they are in § 3.4: standing is a tally of *completed turns* rather than a statistic
over a run, it buys nothing, and what it opens is **how many contracts you may hold at once** rather
than any capability. **A slot is a limit on attention. It is the one form of scarcity in this
document that is not time, and § 3.4 is where it is admitted and bounded.**

### 2.3 What opens, when, and on what

**Specified.** Column 3 is the trigger, and every trigger is a *completed turn of a named kind* per
`docs/32 GD6`. Column 4 is the single mechanism per `docs/32 GD7`. **Column 5 is the honest one**:
what a player who ignores the whole table can already reach, which under `docs/32 GD5` is
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

> **GD10 — If a proposal's benefit is "the player has not earned this yet", it is refused.** The
> product's scarcity is *time* and *attention*, never *permission*.

### 2.5 What progression is actually made of, if not locks

Three things, and naming them is what stops `docs/32 GD5` reading as *there is no progression*:

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
| **Nights** | Days of the contract month a booking occupies before its tier counts as fitted | Not earned — **only spent** | Every works tier above zero nights | `economy.ts#WorksBooking.nights` |
| **Standing** | The record | `cleared × 2 − missed × 3`, summed over towers | Nothing. It is **spent on nothing** and opens slots | `economy.ts#standingOf` |

**Nights are the currency that makes the game**, and what they cost is *time in the contract* rather
than *cars in the building*. A booking's nights have to fit inside the twenty days and may not
overlap another booking (`economy.ts#startIsLegal`); the tier does not count as fitted until all of
them are behind today (`economy.ts#bookingIsLive`, read by `economy.ts#fittedLevel`); and every night
is a day of benefit not had, which is why `economy.ts#daysOfBenefit` refuses a purchase that would go
live after the contract ends and says so with `past-contract` rather than silently hiding the tier.
So the shape of a campaign decision is not *can I afford this* but *can I still get the use of it* —
*a fourth car* costs 34 u and eight nights, on a month twenty days long.

> **GD11 — Spending must make the near days harder.** A purchase that is purely additive is a
> number going up. The ordering that makes it a decision is **take capacity away first, give it back
> later**, and a future currency sink that costs nothing in the present is refused under this rule.

**GD11's ordering is the design intent and it is UNBUILT.** This paragraph read *"every works tier
above tier 1 in the shipped shop takes capacity away first and gives it back later, and that ordering
is the mechanic"*, stated as a fact about the shipped build, and it was false three ways:

1. **No campaign day takes a car out of passenger service.**
   `RecordRunOptions.outOfServiceCarIds` has no writer under `packages/viz/src/campaign/`, none in
   any `everyday/campaign*` module, and none in `everyday/host.ts#runCampaignDay` — which writes a
   tower's `buildingId` and `dispatcherId`, presses run, and reads no booking at all. This is the
   same claim GitHub issues **#264** and **#272** withdrew from `everyday/campaignModel.ts`'s
   calendar tip and from `campaign/economy.ts`'s `shafts` tier ([§ D364](../DECISIONS.md)); the
   `shafts` L1 line that this document quoted as *"eight nights with two cars out"* now reads only
   `'The tower stops being one car short.'`
2. **The other half is unbuilt too**, so *gives it back later* is not a survivor of the correction.
   Nothing bought reaches a run: `fittedLevel` is read only by `everyday/campaignModel.ts`'s
   contract and shop screens, and the day a player then watches is built from `buildingId` and
   `dispatcherId` alone. That is GitHub issue **#181**'s third break, still open.
3. **"Every works tier above tier 1" is false on its own terms**, before any question of capacity:
   `tenants` L2 (*Staggered start times*, 10 u) books **zero** nights, as do `doors` L1 and
   `tenants` L1. Nights are not a function of tier depth.

What *is* built is the ledger: the purse moves, the month grid fills, the tier's nights gate when it
reads as fitted, and a late purchase is refused. That is a real cost and it is the one stated above.
It is **not** GD11's ordering, and the difference is the whole of the rule — a delay is not a
subtraction. Building the ordering means giving a live booking a writer for
`RecordRunOptions.outOfServiceCarIds` on the path `runCampaignDay` takes, and it is pinned in the
repository's standing shape when it lands: *move the control and require the run to change, compared
on the legs*. A works day whose legs match an ordinary one has not taken a car out.

**What holds the three sentences above true, stated because the answer is uncomfortable.** No test
reads this file — `docs/32-game-design.md` is cited by `docs/33`, `docs/34` and
`CHARTER_PROGRAMME.md` and is read by nothing under `packages/` — so these sentences are held by
nobody re-reading them, which is how the withdrawn claim survived here for a wave after it was struck
from the product. What *is* mechanised is the product side of the same claim, in two places, and
either going red is the signal that this passage is owed a rewrite:
`campaign/economy.test.ts` § *no shop tier promises a car the works never take* sweeps every tier of
every category for the claim, and `everyday/campaignModel.test.ts` § *has no writer for
outOfServiceCarIds on the path a campaign day runs* derives the writer set from disk and says the
withdrawn sentences are owed back on the day one appears.

### 3.2 What a unit means

> **GD12 — A unit is a cleared day.** It has exactly one source — the contract's rate, paid per
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

> **GD13 — The five clauses that govern a currency. Four are prohibitions; the first is the single
> permission they bound.**
> 1. A currency may gate what can be **chosen** — which shafts, which machine class, which works.
>    (`commissioning/types.ts`, prohibition 1.) That is a limit on a *configuration*, never on a
>    surface, which is what keeps clause 4 from contradicting it.
> 2. It may **never** appear on a results page, be compared between players, or be folded into any
>    verdict. (Prohibition 2.)
> 3. Nothing may print *"you spent 82 % of budget"* beside a wait figure. (Prohibition 3.)
> 4. **It may not buy access** — no mode, screen, building, dispatcher, case or figure is for sale
>    (`docs/32 GD9`).
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

> **GD14 — A slot is a limit on attention, not on permission, and it is the only permitted form of
> scarcity that is not time.** At standing zero a player may reach every screen, every building,
> every dispatcher and every mode. What they may not do is run six contracts at once. That is
> `docs/32 GD10`'s scarcity — time and attention — expressed as a rule of the career, and it is why
> `docs/32 GD5` and the shipped `SLOTS` table are not in conflict.

**This also settles the boundary `docs/32 GD6` draws.** A threshold over a *count of completed
turns* is permitted, and `standingOf` is the model of it. A threshold over a *run metric* is not,
and never becomes permitted by being called standing.

### 3.5 The daily loop's economy, which is deliberately empty

**Today's tower has no currency and must not acquire one.** Its shape line is *"no losing — a day is
a score, not a pass"*; its output is a day, a record of it in the week, and a place on the board. A
currency there would make the same day worth more to a player who had played more days, which
breaks the one property the mode exists for: **the same day for everybody**. `docs/32 GD9` already
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

> **GD15 — Losing is a named cause with a place attached, never a score that fell short.** A failure
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
| **Fix a building** | Any of the three non-`fixed` outcomes: **`not-enough`**, **`building-worse`**, **`over-budget`** | **Nothing.** The retry is free and the mode says so | Retry, on the same screen. `fixit/engine.ts#BASIS_LINE` states what the verdict rests on — *"one run before, one run after — enough to see a repair this size; not enough to split hairs"* |
| **Today's tower** | **There is none.** *"no losing — a day is a score, not a pass"* | — | The day is filed to the week; the board places it among other people's |
| **Campaign — a day** | A missed day: one or more of the four day-goals unmet at close | A day's rate not paid, and one against the difficulty's miss allowance (`6 / 3 / 1 / 0`) | The next day, with the building one day fuller (§ 5.2) |
| **Campaign — a contract** | Missed days exceeding the allowance | The contract is lost; the tower's slot frees | One of `LOST_CONTRACTS_MAX` = **3** |
| **Campaign — a career** | Three lost contracts | *"the agency stops calling"* (`career.ts#LOST_CONTRACTS_MAX`, § 8.10) | A new career. Standing banked from finished contracts carries |
| **Endless rush** | The run ending is not losing — it is **the measurement** | — | The number is the output (§ 1.4) |
| **Bench, ladder, workshop** | **No failure state exists and none may be added** (`docs/32 GD3`) | — | — |

**Two shapes in that table are worth naming, because a designer will otherwise try to make them
uniform.** Fix a building's failure is free and immediate; the career's failure is cheap once,
serious three times, and slow. That is the retry-cost ladder of
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4 arriving as a failure model, and
it is the correct ordering for the same reason: a player meets an expensive failure only after they
have learned what a retry is for.

**Fix a building's four outcomes are worth reading as the model for the whole table**, because they
are the only ones in the product that are named rather than scored: `fixed` is *the complaint went
away and the rest of the building did not pay for it*, and the other three each name **which of
those two halves failed** — the repair was not enough, the rest of the building got worse, or the
budget would not cover it. Two measured thresholds and the case's own budget decide it
(`COMPLAINT_GONE_PCT = 80`, `REST_DROP_LIMIT_POINTS = 2`), and neither is a grade.

> **GD16 — A verdict badge states where the current configuration stands, never a high-water
> mark — unless it is worded as an observation about history.** `fixit/engine.ts#fixedBadgeAfter`
> already decides this and records why: the panel used to latch `FIXED` on the first success and
> never clear it, so *"a case stayed badged FIXED beside an outcome card reading `9 waits → 9 waits ·
> 0 % of it went away` — two verdicts about one case on one screen."* The contrast that makes it a
> rule is in the same docstring: `WeekState.bestMinutePct` **is** a high-water mark, deliberately,
> because it is worded as *an observation about what the building has been seen to do*.
> **This does not contradict `docs/32 GD8`.** GD8 is about *surfaces*, which stay offered; GD16 is
> about *verdicts*, which are about the run in front of you. A badge that outlived its run would be a
> figure the run did not produce — `charter` non-goal 2.

### 4.3 The fifth outcome, which is not a failure and must never be drawn as one

> **GD17 — A refusal is not a loss.** When the simulator declines to stand behind a figure — a
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
- **A failure a currency can pay off.** `docs/32 GD13` clause 5.
- **A retroactive failure.** `docs/32 GD8` — nothing is re-locked, and that includes a day already
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

> **GD18 — Difficulty is what the building faces. Stakes are what a miss costs you. They are set
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
would be the twelfth dead seam, and it would be a lying one."* (That ordinal is the module's own at
the time it was written; the running count is [`CLAUDE.md`](../CLAUDE.md)'s and is not restated
here.) It is also linear rather than
compounding for a stated reason — at day 20 the two differ by more than a factor of two, and Vertical
City compounded would carry 35 000 people.

> **GD19 — A difficulty mechanism is a run that differs, demonstrated on the legs.** This is
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

> **GD20 — Difficulty may not be raised by a dial that suppresses a figure.** Crowding is the
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

---

## 6. One build, two audiences

### 6.1 The positioning is settled and is not reopened here

[§ D299](../DECISIONS.md) — *two products, one engine* — was taken by the product owner on
2026-08-08 and is the parent of the whole #90–#119 backlog. Its two standing tests are quoted rather
than paraphrased, because both are refusal tests a reviewer uses on a pull request:

> **§ D299 § 1.** *A change to Engineer may make it **easier to use**. It may not make it **say
> less**.*

> **§ D299 § 2.** *Casual is a different door into the same building, not a smaller building* — every
> parameter that can be edited is editable there, a Casual player can author and tune their own
> dispatcher completely, and **named play styles are an entry point and never a ceiling**.

**Everything in §§ 2–5 is written downstream of those two sentences.** `docs/32 GD5` (nothing is
locked) is § D299 § 2 applied to progression; `docs/32 GD13` clause 4 (a currency may not buy
access) is the same sentence applied to the economy; `docs/32 GD18`'s third clause (neither
difficulty nor stakes may touch a measurement) is § D299 § 1 applied to a difficulty selector.

### 6.2 Depth is disclosure, and the difference from a fork is mechanical

> **GD21 — Depth is reached by opening, never by switching.** A simplified figure is a **collapsed
> form of the full one on the same surface**, opened in place. The test is a negative and it is the
> one to apply: **name a figure that is reachable in one product and not the other.** If such a
> figure exists, the two products have forked and the change is refused.

> **GD22 — Four things are identical across the two registers, and the list is closed.** The **run**,
> the **buildings**, the **figures**, and the **refusals with their grounds**. What differs is the
> **wording**, the **layout**, and the **order things are met in** — § D299 § 2's three, and no
> fourth.

**Both are already mechanised, which is why they are stated as rules rather than as aspirations.**

1. **The run.** [`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 3.3 carries the
   acceptance criterion — *"for every scenario, the recording produced in Basic mode is
   byte-identical to the recording produced in Advanced mode"* — with the test that makes it
   falsifiable: **if a mode switch can change a run, it is not the same product.**
   [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1.3 adopts it and § 2.6 records
   that it survives § D299 untouched, because it is a claim about *runs* rather than about products.
2. **The figures and the refusals.** The honesty corpus is the instrument. Both the Day report and
   the live-metrics panel are mode-aware, and **both adapters render both registers on every case**,
   so a claim that exists in only one register is a string the search reads and the other does not
   have. `charter S8` is the criterion; `packages/viz/src/honesty/` is the only one of the ten with a
   working instrument today.
3. **The wording.** [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1.4 is the
   restatement rule and it is not restated here. Its one-line form: *a figure may be renamed,
   re-united, or restated as a natural frequency; it may not be re-quantified, rounded into an
   adjective, or separated from its refusal.*

### 6.3 The consequence for game design specifically

The three sections above are contracts about *surfaces*. What they mean for a **game** is one rule,
and it is the rule most likely to be broken by somebody designing a tutorial:

> **GD23 — A game mechanic may not be a simplification.** Progression, economy, difficulty and
> failure are the **same in both products**, because they are properties of the run and the record,
> not of the register. There is no *casual campaign* and no *engineer campaign*; there is one
> campaign, described twice. A proposal to give one audience an easier bar, a shorter contract, a
> cheaper shop or a softer failure is a fork, and `docs/32 GD21` refuses it.

**The convergence is real and it arrives at hour 3.**
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 5 states it: the engineer at hour
3 and the curious player at hour 3 *"are doing the identical thing over the identical artefacts;
only the labels differ."* That is why § 2.3's rows 4–8 — workshop, bench, ladder, tuner — are the
**same eight introductions for both audiences in the same order**. The two audiences do not have two
progressions that meet; they have one, entered through two doors.

### 6.4 The door, and the one thing it may not remember

Both worlds ship in one build and the door between them is
[§ D338](../DECISIONS.md)'s: the Everyday rail's footer row crosses to Engineer, and the Engineer
header carries the way back. **The swap is not remembered** — a reload lands on the Everyday main
menu whichever world the player was in — because a remembered world is the entry-screen override the
design guide forbids, whatever storage it wears ([§ D335](../DECISIONS.md),
[§ D338](../DECISIONS.md)), and it is `charter` non-goal 10.

> **GD24 — No progression state may become an entry-screen override.** A career in progress, an
> unfinished contract, a case mid-retry and a saved dispatcher are all legitimate to persist and to
> *offer*; none of them may change which screen the product opens on. `charter` non-goal 10 is a rule
> about the front door, and progression is the most plausible reason somebody will eventually
> propose breaking it.

---

## 7. Minute 1, minute 10, hour 3 — what §§ 2–5 add

[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 5 states what the player is
*doing* at each of the three, and it is not restated. **This section states what has been introduced
by each**, which is the half § 5 does not carry and the half a progression schedule has to answer.

### 7.1 Minute 1 — nothing from §§ 2–5 exists yet

**No currency, no career, no record, no difficulty setting, no failure that costs anything.** The
first minute is a building in trouble and nothing else, and every mechanism in this document is
absent by design. `docs/32 GD6`'s trigger for the second introduction is *one Fix a building case
completed*, so the earliest any of this can appear is minute 5.

**This is also the structural fix for the condition that is currently failing.**
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1.1's **A1** — a queue on screen
inside 90 s that the building is visibly not draining — fails today because the day-one slot holds a
seeded day on a building whose own file states that sparseness is its purpose, and 91 of 100
consecutive seeds keep the worst wait under a minute. **A Fix a building case cannot be quiet.**
`data/fixit-cases.json`'s eighteen cases are each an authored fault with a complaint, a named
complainer, a scoped measure and a diagnosis — *"Every evening I finish up and wait an age on the sky
lobby for a car down to the street"* — pinned by `fixit/cases.test.ts` against a real paired run. Row
1 of § 2.3 is Fix a building **because a case is a building in trouble by construction and a seeded
day is a building in trouble by luck.**

That is an argument for issue #217's positioning change that #217 does not itself make, and it is a
second one alongside the structural argument
[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4.1 already records. **Neither
document takes the decision** (§ 9, **Q1**).

### 7.2 Minute 10 — two of eight introductions, and no economy

By minute 10 the player has met rows 1 and 2 of § 2.3 and nothing else: **the loop, and the held
day**. The schedule is built to `charter S3` (median first session ≥ 10 minutes) and `charter S2`
(60 % of first sessions complete one diagnose–change–prove cycle) with the handoff's own session
lengths as the arithmetic — ~5 minutes for a case and ~3 for a tower day puts the second
introduction at about minute 8, inside the budget with a turn to spare.

**Failure has been met exactly once and it cost nothing** — a Fix a building retry — which is the
ordering § 4.2 argues for. **The economy has not appeared.** Introducing a currency inside the first
ten minutes would put a wallet in front of a player who has not yet had a verdict, and the verdict is
what the product is for.

### 7.3 Hour 3 — the economy is the pacing device and the ladder is the placement

[`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 5's hour-3 sentence — the unit of
interest has moved from the run to the dispatcher — is what rows 4–8 of § 2.3 serve. Three additions
this document makes to it:

1. **The economy has become the pacing device.** A contract is twenty days, a perfect Standard month
   pays 98 u against a shop worth 324 u, and a tier's nights are days of that month spent before it
   counts as fitted. So the hour-3 session is no longer *how do I make this better* but *what do I
   buy, and how much of the contract am I willing to spend not having it yet* — which is the same
   question a real building operator has, arrived at without anybody explaining it.
   **The sharper version of that question — *when can I afford to be worse for a week* — needs
   GD11's ordering, which § 3.1 records as UNBUILT.** Works do not take the building apart before
   they help; today they delay a benefit rather than subtract a car, and the sentence here said
   otherwise until this correction.
2. **The ladder is where a verdict is placed, not where it is decided.** `gauntlet/rating.ts` orders
   forty fixed proof cases and emits no verdict, no comparison and no winner; the **bench** is where
   two dispatchers are compared under CRN with an interval. A player at hour 3 is using both, and the
   division between them is the product's whole honesty argument made into two screens.
3. **Difficulty has stopped being a setting and become the calendar.** The building fills up at
   `1 + 0.11 × (day − 1)`, the wear clock runs, and the twist changes each day. Nobody chose any of
   it after day one.

### 7.4 What brings them back — `charter S4`, and the one mechanism the product has for it

`charter S4` asks for **25 % of day-one players returning within 7 days**, and its instrument does
not exist. **The mechanism that would earn it is already designed and half-built**: Today's tower is
*the same day for everybody*, which is the only thing in this product that is different tomorrow
without the player doing anything. It needs the server the front door is built around
([`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4.1 row 4, § 6), and until that
exists the board shows a world that has no runs in it. **No other mechanism in this document
produces a reason to return on a specific day** — a career waits patiently, a case does not expire,
and a ladder does not move on its own. That is stated as a finding, not as a request: § 9's **Q4**.

---

## 8. Contracts-touched register

**This is the acceptance criterion *"every existing design contract it touches is referenced and
left intact"* made checkable.** One row per contract, what this document takes from it, and the
confirmation that nothing is weakened. **A cell reading *nothing* in the last column is the claim
being made**; where this document creates a tension rather than a weakening, the row says so and
points at § 9.

| Contract | What this GDD takes | What it changes in that contract |
|---|---|---|
| [`22-charter.md`](22-charter.md) | Pillars **P1**–**P5** as refusal tests; criteria **S1**–**S4**, **S6**, **S8**, **S10** as the targets §§ 2, 4 and 7 are built to; non-goals **1**, **3**, **5**, **6**, **10** as prohibitions | **Nothing.** No pillar amended, no criterion added or restated, no non-goal relaxed. `charter` non-goal 6's *wording* is narrower than a shipped mechanic — recorded as **Q2**, not resolved here |
| [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) | The core loop, the five beats and their numbering; the per-mode declaration table; the retry-cost ladder; **A1**–**A4**, **B1**–**B4**; § 1.4's restatement rule; § 3.4's Endless rush finding; § 5's minute-1/10/hour-3 behaviour | **Nothing.** No second loop statement (§ 0.1). `docs/32 GD1`'s two halves are a coarser handle on § 3.2's five beats, not a competing decomposition, and § 3.4's verdict on the rush is adopted whole |
| [`10-experience-layer-contract.md`](10-experience-layer-contract.md) | **R2** (no leaderboard from single runs), **R12**, **R13**; § 3.3's byte-identity criterion; § 3.4's dual-presentation finding; § 5.3's four fail states; § 5.4's *progression by mechanism introduced*; § 5.5's whole prohibition list | **Nothing.** § 5.4's campaign ordering is cited and not re-specified, including its own measured correction that stage 1 is not *"winnable trivially"*. § 5.5 is the list of record and § 4.4 is an index into it |
| [`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) | § 4's challenges **E1**–**E6**, mapped onto the five beats (§ 1.5); § 6's non-goals **3** (no scalar challenge score, capital on no results page), **6**, **7** | **Nothing.** The mapping adds no challenge and reorders none |
| [`14-building-behaviour-contract.md`](14-building-behaviour-contract.md) | § 0's opt-in / byte-identical-when-unused constraint; §§ 2.1–2.3's demand dials; § 3.1 patience and abandonment; § 3.2 crowding; § 3.3 stairs | **Nothing.** `docs/32 GD20` *narrows* what difficulty may use — patience is legitimate as a building property and refused as a difficulty knob — which is a restriction on this document, not on that contract |
| [`12-design-handoff.md`](12-design-handoff.md) and `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` | The session-shapes table; the mode lengths and lose-conditions; the fixed vocabulary; § 10's cut guess-the-fault quiz; `docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md` § 8's economy formulas and published totals | **Nothing.** The handoff wins every disagreement about the interface. § 1.4's demotion of Endless rush is a **recommendation** flagged as **Q1**, because moving a tile is an interface change and the interface is the handoff's |
| [`16-change-scope-contract.md`](16-change-scope-contract.md) and [`17-play-experience-audit.md`](17-play-experience-audit.md) | *There is no such thing as a mid-day change*; the retry as the product's verb; `docs/17` § 4.4's commissioning phase | **Nothing.** § 4.2's failure model is the retry-cost ladder, which is that fact read as a design consequence |
| [`CLAUDE.md`](../CLAUDE.md) | The eight invariants; the statistical discipline; the **five** grounds on which a mean is suppressed; energy as an axis and never a score; the standing requirement (*name the non-test caller*) | **Nothing.** Where this document and `CLAUDE.md` could disagree, `CLAUDE.md` wins by `22-charter.md` § 6, and no rule above needs that clause |
| [`05-roadmap.md`](05-roadmap.md) | The standing requirement, applied to difficulty (`docs/32 GD19`) and to currency sinks (`docs/32 GD11`) | **Nothing.** No phase status touched; no phase row added |
| [`25-vertical-slice.md`](25-vertical-slice.md) and [`13-phase-6c-handover.md`](13-phase-6c-handover.md) | Their `G1`–`G9` series, cited only to establish that the letter is taken twice and that this document therefore numbers `GD1`… (§ 0.2) | **Nothing.** No content taken from either |
| [`04-test-buildings.md`](04-test-buildings.md) and `data/buildings/` | The building set as the fabric half of the difficulty substrate | **Nothing** |

**Three shipped modules are treated as contracts in this register even though they are code**, because
each states a prohibition in its own docstring that this document adopts rather than re-decides:

| Module | What it decided | Adopted as |
|---|---|---|
| `packages/viz/src/commissioning/types.ts` | Capital gates what may be **chosen**, never appears on a results page, is never compared between players, and never stands beside a wait figure — asserted three ways by `budget.test.ts` | `docs/32 GD13` clauses 1–3, widened from capital to every currency |
| `packages/viz/src/shift/contracts.ts` | *Scenarios teach, they do not gate.* The design's own completion-based unlock ladder is deliberately not ported, and `contractStatus` has no `locked` | `docs/32 GD5` |
| `packages/viz/src/gauntlet/rating.ts` | A rating **orders a ladder and is not a measured difference**; forty single-replication cases are under budget, so the module emits no verdict, no comparison and no winner | § 1.3, § 7.3, and `docs/10 R2` honoured in the one place it was easiest to break |
| `packages/viz/src/fixit/engine.ts` | The `FIXED` badge is *a statement about the latest run, never a high-water mark*, and `WeekState.bestMinutePct` is the deliberate contrast because it is worded as an observation about history | `docs/32 GD16` |

**And the decisions relied on, none reopened:**
[§ D342](../DECISIONS.md) (the charter, adopted) and [§ D343](../DECISIONS.md) (cite the series with
its document) govern the whole file; [§ D299](../DECISIONS.md) governs § 6 and is the parent of
`docs/32 GD5`, `docs/32 GD13` clause 4 and `docs/32 GD18`'s third clause;
[§ D335](../DECISIONS.md) and [§ D338](../DECISIONS.md) give § 6.4 the door and the rule that the
swap is not remembered; [§ D106](../DECISIONS.md) is the argument § 3.3 reads one step earlier;
[§ D227](../DECISIONS.md) is the class § 1.4's tile belongs to; [§ D300](../DECISIONS.md) E-3 is the
board's verification and its labelled reference rows. **No decision above is amended, narrowed or
re-argued here, and no new decision number is claimed by this document** — one is owed for its
adoption and is allocated at integration.

---

## 9. Open questions, flagged rather than buried

**Each of these is a decision this tree does not settle and that this document declines to take on
its own authority.** They are stated with the reading this document would recommend, so that a
product owner can agree or refuse rather than start from a blank page.

| # | The question | What this document recommends, and why it does not decide it |
|---|---|---|
| **Q1** | **Is Endless rush a mode or an instrument?** (§ 1.4) | Recommend **demote to an instrument beside the bench**: it serves neither half of the loop, its output is a limit rather than a differential, and a limit is an hour-3 quantity. **Not taken here** — moving a tile off the front door is an interface change, and the interface is the handoff's. The separable half, which needs no positioning decision, is that its tile may not advertise a session shape the build cannot deliver |
| **Q2** | **`charter` non-goal 6 forbids more than it means to.** (§ 5.1) | It permits difficulty to move *only* declared traffic parameters and building fabric; the shipped difficulty tiers move the purse, the rate ladder, the miss allowance and four goal bars, none of which is either. Recommend the charter's wording be **narrowed to name *stakes* separately** (`docs/32 GD18`), or the tiers be changed. **A charter clause is amended by its owner, not by a lane** |
| **Q3** | **Should the campaign's failure odds be rolled?** (§ 3.6) | `failureOddsPct` computes a daily hazard that nothing rolls against, and `career.ts` publishes that refusal in its own words. Recommend building the seeded stream, because a wear clock that cannot bite makes every service booking a purely arithmetic decision. **It needs a seeded stream for a campaign day and an event calendar behind a contract, neither of which exists** |
| **Q4** | **What is the day-2 return mechanism?** (§ 7.4) | The only candidate the product has is Today's tower being the same day for everybody, and it needs the server the front door is built around. Recommend it be treated as `charter S4`'s critical path. **Nothing else in this document produces a reason to return on a specific day**, and inventing one — a daily reward, a streak bonus, an expiring case — would be a currency that measures progress, which `docs/32 GD9` forbids |
| **Q5** | **Where does the § 2.3 schedule live?** | The eight introductions are specified here and **implemented nowhere**: there is no progression state in the tree, and `docs/32 GD6`'s triggers (*a completed turn of a named kind*) need a record of completed turns that spans modes. Recommend it be built as one derived value over the existing records rather than as a new store, so it cannot disagree with them. **The store's shape is an M2 engineering decision** |
| **Q6** | **Does the campaign day-goal bar belong to the difficulty tier or to the contract?** | Today it is the tier's (`DIFFICULTIES[].tests`). Under `docs/32 GD18` that is *stakes* and legitimate. **But a bar that moves with a setting and a bar that moves with a building are different games**, and the second is closer to `docs/10` § 5.4's *progression by mechanism introduced*. Recommend deciding it explicitly rather than letting the tier own it by default |

### What this document could not support from the tree

Stated because a specification that hides its unsupported parts is the defect this repository
records:

- **No first-session measurement exists**, so § 7's schedule is built to `charter S1`–`S3` and
  cannot yet be tested against them. `charter` § 4 records the measurement: `grep -ril telemetry
  packages/*/src --include='*.ts'` returns **0 files**.
- **The § 2.3 ordering is derived, not measured.** Its three sources are named in § 2.3 and each is a
  design argument rather than a playtest result. The first playtest that runs it may reorder rows
  4–8; rows 1–3 are load-bearing and rest on the retry-cost ladder.
- **`docs/32 GD12`'s reading of a unit as a cleared day is arithmetic, not an authored intent.** It
  follows from the rate being per cleared day and the shop being priced in the same unit. If the
  handoff intended a different meaning, the handoff wins.
- **Nothing files a campaign day** (§ 3.6), so the economy specified in § 3 currently operates over a
  record that play cannot write to. Every rule in § 3 is stated to be true of the economy once that
  is closed.
- **`docs/32 GD11`'s ordering — *take capacity away first, give it back later* — is unbuilt**, and
  § 3.1 states it as intent rather than as a description. Neither half ships: no campaign day takes a
  car out of passenger service (`RecordRunOptions.outOfServiceCarIds` has no writer on the path
  `everyday/host.ts#runCampaignDay` takes — GitHub issues **#264**, **#272**,
  [§ D364](../DECISIONS.md)), and nothing bought reaches a run at all (**#181** break 3). § 3.1 said
  otherwise, as a fact about the shipped shop, for a wave after the product's own copy was corrected
  — which is this repository's *stale claim* class arriving in a document rather than in a string,
  and the reason § 3.1 now names what holds it true.

---

## Sources

- [`22-charter.md`](22-charter.md) — the charter this document is governed by: pillars, criteria
  `charter S1`–`S10`, and the ten non-goals. Adopted by [§ D342](../DECISIONS.md); cited per
  [§ D343](../DECISIONS.md).
- [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — the core loop, the five beats,
  the per-mode declaration, the retry-cost ladder, the restatement rule, and the minute-1 / minute-10
  / hour-3 behaviour this document's § 7 adds to rather than repeats.
- [`10-experience-layer-contract.md`](10-experience-layer-contract.md) §§ 3.3, 3.4, 5.3, 5.4, 5.5 —
  byte-identity, dual presentation, the four fail states, progression by mechanism introduced, and
  what must never be built.
- [`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) §§ 4, 6 — the six
  engineering challenges and the nine non-goals.
- [`14-building-behaviour-contract.md`](14-building-behaviour-contract.md) §§ 0, 2, 3 — the
  difficulty substrate and the opt-in constraint that governs it.
- `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` and
  `docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md` — canonical for the interface, and the
  source of the session shapes and the campaign economy's formulas. **Not** canonical for numbers.
- [§ D299](../DECISIONS.md) — two products, one engine, and the two standing tests § 6 is built on.
  [§ D335](../DECISIONS.md) and [§ D338](../DECISIONS.md) — the two shells and the door between them.
  [§ D106](../DECISIONS.md) — energy is an axis, never a score, which § 3.3 is the capital-side
  reading of. [§ D227](../DECISIONS.md) — the stale-refusal class, which § 1.4's tile is an instance
  of.
- [`CLAUDE.md`](../CLAUDE.md) — the invariants, the statistical discipline, the five suppression
  grounds, and the standing requirement that a behaviour must name its non-test caller.
- The shipped modules that already decided something this document adopts:
  `packages/viz/src/campaign/economy.ts`, `packages/viz/src/campaign/career.ts`,
  `packages/viz/src/campaign/failStates.ts`, `packages/viz/src/commissioning/types.ts`,
  `packages/viz/src/shift/contracts.ts`, `packages/viz/src/shift/goals.ts`,
  `packages/viz/src/shift/growth.ts`, `packages/viz/src/shift/events.ts`,
  `packages/viz/src/gauntlet/rating.ts`, `packages/viz/src/everyday/modes.ts`,
  `packages/viz/src/everyday/screens.ts`, and `data/campaign.json`, `data/fixit-cases.json`.
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) §§ M, Q, S — the verification
  behind § 7.1's A1 measurement and § 1's mode findings.
