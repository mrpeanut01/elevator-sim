# 25 — The vertical slice

**Issue:** #198 · **Milestone:** M1, pre-production · **Written:** 2026-08-24 on
`claude/elevator-sim-charter-kickoff-rexfw8` · **Character:** a specification. M1 writes no
production code, and nothing here proposes any. No `.ts` file, no `data/*.json` file and no shipped
string is changed by this document.

**This document is the thing every M2 build issue points at.**
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1 makes *"no production issue can be opened
without a specification it points at"* an exit criterion, and § M2's entry criteria name this file
by its issue number. Thirteen issues (#206–#218) are blocked behind it.

**Governed by, and not reopened here:** [`docs/22-charter.md`](22-charter.md), adopted
[§ D342](../DECISIONS.md) — its five pillars **P1–P5**, its ten success criteria **charter S1–S10**
(cited with their document, [§ D343](../DECISIONS.md)), and its § 5 non-goals.
[`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — the two audiences, their
first-session conditions **A1–A4** and **B1–B4**, and the five-beat loop. And
[`CLAUDE.md`](../CLAUDE.md), which wins every disagreement with all three.

**It does not open on a blank page either.** [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2
already carries five proposed exit criteria, and issue **#218** restates them almost verbatim
([`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md) reduces #218 to *execute the review* for
exactly that reason). **§ 3 refines those five rather than repeating them, and every divergence is
named where it is taken.** Two of them are kept unchanged; three are sharpened; three more are
added; and one of the additions is the reason the slice can be reviewed at all.

---

## 0. What this document decides, and what it does not

**Decides.** What the vertical slice *is* — one mode, one building, one dispatcher, one traffic
pattern, one day, one change — and what evidence puts each of those there. What "shipping quality"
means for it, itemised so a reviewer can refuse work against it, with *complete* and *good* kept
apart. Exit criteria that can fail, each with the instrument that fails it and an honest statement
of whether that instrument exists today. What is in and what is out, with a reason per exclusion.
Which of #206–#218 the slice depends on. What the slice does in every state that is not the happy
path. And what makes it a no-go at the review, stated before the review rather than after it.

**Does not decide.** Whether the slice is *approved* — that is the pre-production gate, and it is a
human decision ([`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1's review). Whether **Fix a
building** is promoted to the front of the game (#217) — that is a positioning change, an M2
decision and a human one, left exactly where
[`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 0 leaves it. The difficulty
curve (#200), the telemetry schema (#201), the browser matrix (#203) and the accessibility standard
(#204) — this document *consumes* those M1 siblings and names what it needs from each; it does not
write them. And it does not weaken a single charter criterion: where the slice cannot meet one, it
says so and names the work, which is [`CLAUDE.md`](../CLAUDE.md)'s standing rule applied to a
milestone instead of a phase.

---

## 1. The slice, named

### 1.1 One sentence

> **The slice is one day in Today's tower at Chancery House.** A first-time player opens the game,
> is given a building whose lift group is one car short for most of the morning, watches the queue
> build where they can see it, reads a sheet that tells them what today showed and what can be done
> about it, changes one thing, re-runs **the same crowd**, and is told — by something that has
> already refused to tell them things — whether it worked.

### 1.2 The route, screen by screen

The route is `menu → door → brief → stage → report → week`, which is **T1** in
[`TEST_MATRIX.md`](../TEST_MATRIX.md) and is named verbatim in
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2's fifth exit criterion. It is the daily
loop's own flow, and the step numbers are the shipped ones: `actionBar.ts` gives the daily rows
`step: 1` (door), `2` (brief), `3` (stage), `4` (report), pinned by `actionBar.test.ts`.

| beat ([`docs/23`](23-audiences-and-core-loop.md) § 3.2) | screen | what the player does | what the slice must make true |
|---|---|---|---|
| — | `menu` | opens the game and presses one tile | *Today's tower* is the tile, and it opens the front door rather than a register of absences (#207) |
| 1 **observe** | `door` → `brief` → `stage` | reads today, presses *Start the day*, watches | A queue is visibly not draining **within 90 s of first load** — condition **A1**, which fails today |
| 2 **diagnose** | `stage` | forms a view | The cue is on the stage before the report states it — pillar **P3**, the pillar the build fails outright |
| 3 **change one thing** | `report` → `tuner` | presses a lever card, moves one control | The lever the sheet names is a control the player can actually reach and that actually writes |
| 4 **re-run the same crowd** | `tuner` → `stage` | presses *Run it and watch* | Same seed, same trace. Common random numbers, and the sheet says the run no longer counts for score |
| 5 **read a verdict** | `report` → `week` | reads the paired sheet | A `before → after` pair with a count on each side, or a refusal with its ground |

**Beat 5 is the one the shipped build cannot reach, and that is why the slice runs here.** The
stage's primary files the day and never navigates, and the breadcrumb's fourth stop is disabled and
carries no listener in every state, by construction
([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § M). Issue **#206** is that
defect and it is already fast-tracked ahead of milestone order.

**Why not Fix a building, which works.** [`docs/23`](23-audiences-and-core-loop.md) § 4 and § 6
establish that *Fix a building* is the only shipped mode whose fifth beat is reachable — it runs
`runFixitPair` in-screen, never calls `closeDay`, never navigates, and its bar row has no
breadcrumb to break. That is a good reason to like the mode and a **bad reason to put the slice
there**: a vertical slice exists to prove the loop end to end at shipping quality, and one routed
around every defect proves the defects are avoidable, not that they are fixed. Ten of the thirteen
M2 issues live on the route above; **none of them lives in `fixit/`.** **The slice runs through
the broken path deliberately.** #217 remains open on its own merits and is not settled here.

### 1.3 The building — Chancery House, and the four that were measured

**`chancery-house`.** Nineteen floors, 612 people, six cars at 5 m/s, one bank, its own
`office-prestige` profile. It is contract **c6** in `shift/contracts.ts`, so it ships with an
authored brief and a scenario reward already.

**The tree chose it first, and this document is agreeing with a measurement rather than making
one.** `packages/viz/src/dev/defaults.ts:72-84` is the argument in full: Garden Apartments was
rejected as the Free Play opener because it *"serves 2 to 8 riders in the reported window across six
seeds"*, `WT95` equals `AWT` on three of them, and *"`nearest-car` and `collective` return the same
numbers"* — while Chancery House at the same settings serves 81–115, publishes a mean on 6 of 6
seeds, and is *"the building where the dispatcher axis is most legible"*, the same seed under
`nearest-car` giving **146.72 s** and **87.7 %** of riders over a minute.

**Measured here, for the slice's own question**, which is not the same question `defaults.ts` asked.
Twelve consecutive seeds from `20260824`, `collective`, the building's own profile and template, the
CLI's default 1 800 s:

```
node packages/cli/dist/index.js run --building chancery-house --dispatcher collective \
  --seed <20260824..20260835> --no-color
```

| fabric | AWT suppressed | AWT (s) | WT95 (s) | riders over a minute | worst wait (s) | served in window |
|---|---|---|---|---|---|---|
| **six cars** — as shipped | **0 of 12** | 13.24 `[8.40, 21.74]` | 34.25 `[22.17, 53.87]` | 0.0 % `[0.0, 2.6]` | 48.2 `[31.2, 101.7]` | 95.5 `[78, 117]` |
| **five cars** — one held | **0 of 12** | 22.52 `[14.74, 40.00]` | 65.03 `[43.30, 101.13]` | 8.1 % `[0.0, 27.8]` | 104.2 `[47.9, 234.0]` | 95.5 `[78, 117]` |

Medians with the range beside them; single replications, a data point each, **not a dispatcher or
fabric ranking** — the CLI says so in its own help and `CLAUDE.md` says it louder. What the table is
evidence for is narrower and is exactly what the slice needs:

1. **Both states publish.** 0 of 12 suppressed at either fabric. The slice's *before* sheet is not a
   refusal by luck, so beat 5 has a paired figure at both ends. (§ 6 covers the day it *is* a
   refusal, because that day exists.)
2. **The trouble is real and it is in the right register.** The wait roughly doubles, the 95th
   percentile roughly doubles, and *riders over a minute* goes from nought to one in twelve — which
   is the figure the design handoff already makes the game's spine (*away inside a minute*), not a
   figure invented for this document.
3. **The crowd is held.** `served in window` is identical at both fabrics, median and range. The
   only thing that moved is the building, which is what makes beat 4 honest.

**The four buildings that were measured and rejected, each with the number that rejected it.**

| building | why not | measurement |
|---|---|---|
| **`garden-apartments`** | Too quiet, and the file says so itself | 100 seeds at the shipped day-one configuration: worst wait ≤ 60 s on **91 of 100**, `AWT SUPPRESSED: 0 of 100`, median 40 arrivals over the hour ([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S). `data/buildings/garden-apartments.json:29-30` states the sparseness is **the building's purpose** and forecloses the other route in capitals |
| **`midtown-office`** | Not troubled — **hopeless**, and one change cannot fix it | Same twelve seeds. At its shipped four cars it suppresses AWT on **12 of 12** at its profile's typical rate **and on 12 of 12 at the profile's declared minimum**; at **eight** cars — double the shipped fabric — it still suppresses on **8 of 12** at that minimum. A slice whose fault no single change can move is not a slice, whatever it looks like on the stage |
| **`crown-hotel`** | The refusal is a lottery | 12 seeds, shipped fabric: AWT suppressed on **3 of 12**. A first session that refuses its headline number on a quarter of loads is a different product on a quarter of loads, and the review cannot be run against it |
| **`secure-tower`** | Wrong first lesson, and adding a car made it worse | It is the access-control building — *"a call a car cannot legally take looks nothing like a slow one"* (`shift/contracts.ts` c3). Also measured: adding one car to the low bank took suppression from **0 of 12 to 2 of 12** on the same seeds. That is a single-replication data point, not a ranking — and it is the exact shape of a mechanism sentence this project may not write (charter § 5 non-goal 4) |

**One consequence of picking Chancery House that must be scheduled, not assumed.**
`dev/state.ts:987` opens the whole viewer on `CONTRACTS[0]`, which is `garden-apartments`. The slice
needs Chancery House in the *daily* opening slot, and **it must not move `CONTRACTS[0]`**: contract
`c1` is campaign stage 1, `data/scenario-goals.json` holds pass counts measured at that
configuration, and `campaign/judge.ts` refuses to judge when the baseline arm does not reproduce its
published count — the same cost [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)
§ T prices for the campaign report window. **The daily opening building and the campaign's first
contract must therefore become two decisions rather than one**, and that separation is the slice's
first piece of work under #208.

### 1.4 The dispatcher — `collective`, and the slice does not ask the player to change it

**`collective`.** `PREFERRED_VIEWER_DISPATCHERS[0]` (`dev/defaults.ts`), [§ D134](../DECISIONS.md)'s
move away from `nearest-car`, and the reference arm [`docs/07-handoff.md`](07-handoff.md) § 4
recommends. `dev/state.ts`'s own docstring gives the reason and it is the charter's energy rule
([§ D106](../DECISIONS.md)) in one sentence: opening on `nearest-car` *"shows a reader the weakest
shipped dispatcher and calls it the default"*.

**The slice does not make the dispatcher the change, and this is a deliberate refusal.** It is
tempting: the brief's play-style cards are right there, `defaults.ts` measured Chancery House as the
building where that axis is most legible, and the swap is one press. It is refused on two grounds
that are already written down:

- **`docs/10` R2** — a claim that orders two dispatchers needs a resolved paired interval over the
  documented budget, not one replication. `dev/reportPanel.ts#LEVER_SURFACES` already enforces
  exactly this: *Weight fairness up* and *Ask where they're going* keep their words and stay
  unclickable, **by argued decision**, because a card that navigated to the dispatcher editor with a
  lever named would be the sheet recommending a strategy off one run. Only *add a car* and *zone the
  tower* may ever be routed.
- **charter S5** — *no campaign stage clears from the dispatcher dropdown alone.* The slice is not a
  campaign stage, so charter S5 does not bind it directly. It binds the **shape**: a first session whose
  entire lesson is *pick the other item in the list* teaches the dropdown, not the building.

The dispatcher stays visible, stays changeable, and stays the thing the brief is about. It is simply
not what beat 3 is for.

### 1.5 The traffic and the day

**Traffic:** the building's own `office-prestige` profile at its **declared typical, 16 %pop/5 min**
(`data/traffic-profiles.json`; the declared range is 15–17). Demand template `rise-and-fall`,
1 800 s, the horizon every published figure in [`docs/05-roadmap.md`](05-roadmap.md) was measured
over. **No rate is invented and none is pushed to an edge.** Charter § 5 non-goal 6 and
[`CLAUDE.md`](../CLAUDE.md) § *Reference data* both bind here, and #208's own scope sentence says it
again: difficulty is demand and building fabric, never a fudge factor on a metric.

**The day:** day 1 under the **move-in** booked event — `SHIFT_EVENTS['move-in']` in
`shift/events.ts`, whose effect is `derate: { cars: 1, fromFraction: 0, toFraction: 2/3 }` and whose
note already reads *"A tenant is hauling boxes up — one car is tied up for the first two thirds of
the shift, then rejoins."*

Four reasons this is the day, and the fourth is the one that matters:

1. **The machinery ships.** `shift/incidents.ts#carsToDerate` chooses the car in the same total
   order the run itself uses, and the brief already draws the lettered out-of-service badge beside a
   sentence. Nothing is authored for the slice.
2. **It is [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S's own second
   candidate**, applied to its first candidate's building: *open it under a booked event rather than
   an ordinary day*.
3. **The fault is one a person can say out loud without a lift vocabulary** — condition **A2**.
   *One of the six lifts is tied up all morning* is a sentence a tester can produce unprompted, and
   it names a cause rather than a symptom.
4. **The car comes back two thirds of the way through**, which is the difference between a smaller
   building for a day and a group that has to absorb a loss and re-balance around a return. The
   `move-in` docstring makes that argument itself. It also means the trouble the player watches
   **resolves on screen before the day ends**, which is pillar **P3** given a free gift: the report's
   conclusion has a visible antecedent and so does its qualifier.

**The five-cars-all-shift figures in § 1.3 are an upper bound on the move-in day, not the move-in
day.** The derate holds one car for two thirds of the shift; a whole-shift hold is strictly worse.
They are quoted as the bound they are, and § 3's criterion **X7** requires the operating point
itself to be measured before M2 opens rather than inferred from the bound.

### 1.6 The seed — pinned, and it is load-bearing twice

`dev/main.ts` draws `randomSeed()` on every load, so **there is no day-one run to reproduce** and
every figure about the first session is a draw from a distribution
([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S states this as a
substitution before quoting a single number). The slice pins the seed for the **first-ever** load —
#208's third candidate — and nothing else.

**Reason one: A1 must be a property of the product.** *A building in visible trouble within 90 s* is
either true of the first session or true of some share of first sessions — and a share is not a
criterion, it is a hit rate. [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)
§ S is the worked example of the damage: two of the four numbers in issue #208 are properties of a
distribution stated as constants, because the configuration behind them draws a fresh seed on every
load.

**Reason two, and it was not obvious until it was measured: the slice's day is graded clean on most
seeds.** `shift/goals.ts` sets day-1 bars of *carry 87 %*, *61 % away inside a minute*, *no landing
past 32*, and *worst wait inside 230 s*. Over **30** consecutive seeds at Chancery House with one car
held, the worst-wait bar is missed on **1 of 30** and the minute bar on **2 of 30**:

```
node packages/cli/dist/index.js --data <five-car tree> run --building chancery-house \
  --dispatcher collective --seed <20260824..20260853> --no-color
```
> AWT median 23.36 `[11.45, 56.88]` · riders over a minute median 6.0 % `[0.0, 50.5]` ·
> worst wait median 110.8 s `[45.6, 234.0]`, above 230 s on 1 of 30, above 120 s on 10 of 30.

**So on 27 of 30 seeds the day a player watches go wrong is filed as a cleared shift with a streak.**
That is not an argument against the building; it is an argument against letting the goal grid carry
the slice's message, and it is a measured input to the difficulty curve (#200). The slice's response
is in three parts, all of them in § 3: the seed is pinned (**X7**), the stage carries the trouble
rather than the grid (**X5**), and *the day is graded as it is played* becomes an exit criterion a
run can fail (**X6**).

**Which seed is a measurement M2 owes, not a number this document invents.** Pinning the *rule* is
this document's job; choosing the integer is a run, and § 3 **X7** says what that run must assert.

### 1.7 The change — *add a car*, and the one open decision the slice creates

**The change is one control: the tuner's *Shafts* row**, which writes `banks[].cars[]`
(`everyday/tunerModel.ts#TUNE_CARDS`, range 1–12). It is the only lever in the Everyday build that
is all three of the following at once:

- **permitted to be routed from the report** — `dev/reportPanel.ts#LEVER_SURFACES` names `add-a-car`
  and `zone-the-tower`, and nothing else may ever be added ([`docs/10`](10-experience-layer-contract.md) R2);
- **reachable by a player** — the tuner has two doors by [`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
  § 3.2, the brief's *Take it to the sandbox* (built, `briefView.ts#lockedForScore`) and the report's
  third lever (**not built** — it is a live row of `EVERYDAY_SHELL_ABSENCES`);
- **measured to move the run** — § 1.3's table, on a held crowd.

`zone-the-tower` is routable in principle and **unreachable in fact**: no Everyday control writes a
bank's `servesFloors`, the tuner has no zoning row, and Chancery House is one bank anyway. It stays
a card with words on it, which is the honest state.

**The open decision, stated as a decision rather than smuggled in as a detail.** `shift/report.ts#leverPointersFor`
points at `add-a-car` on exactly three grounds: the run **saturated**, **legs never boarded**, or
**riders passed the give-up horizon**. On the slice's day none of them fires — measured, 12 of 12
seeds with 0 unserved legs in the window and 0 saturated, and patience is off. **So the sheet would
carry the *Add a car* card in its unpointed half and point at nothing the player can act on.**

Note what that means in general, because it is a property of the shipped design rather than an
accident: **the run that tells you to add a car is very nearly always the run that refuses its own
average**, since saturation is both the dominant pointer and a suppression ground. That is coherent
— capacity is named exactly when capacity binds — and it makes an *un*-saturated capacity problem
mute. Three ways out, and the slice picks one:

| option | what it costs | verdict |
|---|---|---|
| **A — choose a day that fires an existing pointer** | Only saturated or unserved days qualify, and § 1.3 rejected both classes of building for the slice | **Refused.** It reintroduces the refusal lottery the building was chosen to avoid |
| **B — give `add-a-car` a fourth ground: the day missed its own worst-wait or minute goal** | One argued change in `leverPointersFor`, with a hard constraint — the function may read **counts and goal readings only**, never `meanWaitS`, `wait95S` or `meanTimeToDestinationS`, because a card that appeared on a suppressed figure would be that figure published through the back door (`docs/10` R9, and the function's own docstring says so) | **Adopted.** It is the cheapest, it stays inside the rule the function already states, and it is checkable |
| **C — build a zoning control** | A new control, a new schema surface, and Chancery House has one bank | **Refused for the slice.** Not wrong; out of scope, and § 4 records it as out |

**Option B is a change to a shipped module and therefore an M2 issue, not an M1 one.** It is named
here because a slice specification that left beat 4 pointing at nothing would be a specification the
build could satisfy while the loop stayed open — which is the class of defect
[`CLAUDE.md`](../CLAUDE.md) § *Standing requirement* exists to record.

---

## 2. The quality bar

**Two lists, and keeping them apart is the point of the section.** *Complete* is a checklist: every
item is a thing that either exists or does not, and a reviewer can walk it without judgement.
*Good* takes judgement, and each clause is written as a sentence a reviewer may **quote to refuse a
pull request** — the form [`docs/22-charter.md`](22-charter.md) § 2 requires of a pillar.

**A slice can be complete and bad.** It can also be good and incomplete, which is the more common
and more dangerous state, because the demo lands well and the gate is passed on the demo. Both lists
must pass. Neither substitutes for the other.

### 2.1 Complete — the slice exists

| # | clause | how a reviewer checks it |
|---|---|---|
| **C1** | Every screen in § 1.2's route is reachable **and returnable** from the one before it, without leaving the mode | Walk it. `go()` preserves `ctx`; only `requestLeave`/`doLeave` clear it (`shell.ts:594-613`) |
| **C2** | The stage's primary navigates **on the confirmed file**, never on the press | Read `stageScreen.ts`'s primary: it must re-read `host.runState()`/`host.lastReport()`. `closeShift` has three silent early returns |
| **C3** | The breadcrumb's fourth stop is enabled by *does the destination have anything to show*, not by position | Read `shell.ts:965-982`. **Step numbers stay as they are** — `actionBar.test.ts` pins stage→3 and report→4 |
| **C4** | The report's lever card opens what its label names | Press it. Today it says *Open the simulator's ⟨tab⟩ panel* and calls `context.go('stage')` |
| **C5** | The change control writes the field it names, and the run changes | Move it and require the run to change, **compared on the legs**, not on a window statistic ([§ D219](../DECISIONS.md)) |
| **C6** | The re-run uses the same seed and the same trace as the run it is compared with | Assert the traces are identical, not that the seeds match |
| **C7** | The paired sheet draws a `before → after` row with a count **on each side** | `DeltaRowView.beforeCount`/`afterCount` are two fields, not one; a refused side carries none |
| **C8** | Every screen on the route is in `honesty/surfaces.ts` | A surface rendering strings and absent from the corpus is not finished. The corpus is the instrument, not the reviewer |
| **C9** | Every state in § 6 draws something a person can read — no blank region, no `undefined`, no zero standing in for unknown | Force each state; T15 and T16 in [`TEST_MATRIX.md`](../TEST_MATRIX.md) are the shape |
| **C10** | The route is driven end to end by one browser test that presses the player's own controls | `dailyLoop.browser.test.ts` currently routes **around** #206 and says so in a comment. That comment must go |
| **C11** | Nothing on the route names a section number, a source filename or a code identifier | § 3 **X3**, mechanised. It fails today |
| **C12** | No control on the route is inert, and no live control claims to be dead | Both polarities ([§ D219](../DECISIONS.md), [§ D227](../DECISIONS.md)) |

### 2.2 Good — the slice is worth reviewing

| # | clause — quotable at a pull request | the pillar or condition it serves |
|---|---|---|
| **G1** | *Where on the stage would a player have seen this?* Nothing in the report may be the first place a conclusion appears | **P3**, the pillar the build fails outright |
| **G2** | *Name the run this number came from.* No figure on the route is computed for effect, for pacing, or to fill a layout — including anything taken from the design prototype's own arithmetic | **P1**, charter § 5 non-goal 2 |
| **G3** | *Does this change make the product say less?* No figure removed, no threshold widened, no qualifier hidden, no refusal reworded into reassurance | **P2**, [§ D299](../DECISIONS.md)'s standing test |
| **G4** | *Which figure did this wording lose?* A plain-language restatement may rename or re-unit a figure; it may not re-quantify it, round it into an adjective, or separate it from its refusal | **P5**, [`docs/23`](23-audiences-and-core-loop.md) § 1.4 |
| **G5** | No copy on the route states **why** a configuration performed better unless the mechanism is measured — and where one was withdrawn, no replacement plausible sentence goes in its place | charter § 5 non-goal 4, [§ D280](../DECISIONS.md) |
| **G6** | A first-time player is never required to know what AWT stands for, and no engine term appears without the plain form beside it | **A2**, and it is a hard clause |
| **G7** | The slice's own copy passes the count it makes a reader do: a figure and its denominator are in the same box, and a likelihood word never travels without a number | `docs/10` R13; the Budescu finding in [`docs/10`](10-experience-layer-contract.md) § 3.4 |
| **G8** | The verdict is legible to **both** audiences off the same artefact — the engineer reads the interval, the curious player reads the sentence built from it, and neither gets a figure the other does not | **P5**, [§ D299](../DECISIONS.md) § 2 |

### 2.3 What the bar deliberately does not require

Stated so nobody adds them at review time.

- **Art or audio direction.** #195 and #196 are M1 siblings; the slice ships against whatever they
  decide and is not held to an unwritten standard.
- **Performance.** charter **S9**'s 3 s cold load has no instrument (§ 3 **X4**), and inventing a
  local stopwatch for the review would be a criterion satisfied by assertion.
- **Feature completeness.** [§ D163](../DECISIONS.md)'s second exclusion is preserved by the charter
  and preserved here: *a gate that requires every designed feature measures ambition rather than
  quality*. **Anything unbuilt at the review is named in the verdict** instead.
- **The other three modes.** § 4 says so, with reasons.

---

## 3. Exit criteria that can fail

**Eight criteria.** Five are [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2's, refined —
divergences flagged **◆** and argued underneath. Three are added, marked **＋**. Each names what
measures it and whether that instrument exists on this tree today.

| # | criterion, stated so it can fail | instrument | exists today? | fails when |
|---|---|---|---|---|
| **X1** | **Ten testers who have never seen the game complete the slice**, unaided, in one sitting | Moderated playtest to #205's script, recorded | **No** — #205 is an unstarted M1 sibling; no script, no recruits, no consent form (#202) | Fewer than ten complete it, or the session record cannot say where one stopped |
| **X2** ◆ | **Six of ten state, in their own words, what went wrong and why their change helped** — *and* at least six of ten state, unprompted, the ground on which something was refused | Same playtest, transcript coded against a rubric written before the sessions | **No** — same instrument | Fewer than six on either half. **Both halves fail independently** |
| **X3** ◆ | **No string a player can read on the slice's route names a section number, a source filename or a code identifier** | A **ninth** honesty property over `honesty/surfaces.ts` | **No, and it is cheap** — the corpus, both tiers and the surface list exist; the property does not | Either tier reports a violation not held in `honesty.test.ts`'s `OUTSTANDING` register. **Red today** |
| **X4** | **The slice runs on the target browser matrix** from #203 | CI, failing the build | **No** — `.github/workflows/` has `ci.yml`, `deploy-viz.yml`, `review.yml` and no browser matrix; the tier is 25 Chromium files on one runner | Any matrix entry fails, or #203 has not landed |
| **X5** ◆ | **T1 reads `passing`** in [`TEST_MATRIX.md`](../TEST_MATRIX.md), driven through the player's own controls — **and the test asserts the stage showed the trouble before the report stated it** | `everyday/dailyLoop.browser.test.ts`, extended | **Partly** — the test exists and currently **routes around** #206 by its own admission | The row still reads `planned`; or the test reaches the report by any path a player cannot; or the P3 assertion is absent |
| **X6** ＋ | **The slice's day is graded as it is played**: on the pinned seed the before-run misses at least one of its four goals and the after-run meets all four | One run pair through `shift/goals.ts` and `shift/report.ts`, asserted in a test | **No** — nothing asserts it. Measured: the goal grid files this day as **cleared on 27 of 30 seeds** | The before-run files as a clean shift, or the after-run does not clear |
| **X7** ＋ | **The slice's operating point is pinned to a run**, and every figure this document quotes about it is re-derived by a test rather than transcribed | A pinned-run test in the shape `benchmark/published.ts` already uses for study intervals | **No for prose figures** — published *study intervals* have a deriver; prose counts do not (`RISKS.md` R38) | A quoted figure stops reproducing and nothing goes red |
| **X8** ＋ | **No shipped surface on the route carries a refusal caused by something the slice built** | `deadCode.test.ts`'s six-array rule plus a read of `EVERYDAY_SHELL_ABSENCES` and `STAGE_ABSENCES` | **Partly** — the audits exist and enforce that a register has a real non-test caller; nothing checks a register against what was built | A register still names an absence the slice closed, or names one it created without an owner |

### Where this diverges from `CHARTER_PROGRAMME.md` § M2, and why

**◆ X2 adds a second half.** § M2 asks that six of ten *state what went wrong and why their change
helped*. That measures the diagnosis and misses the thing this product is actually for.
[`docs/23`](23-audiences-and-core-loop.md) § 1.2 is explicit that **B4** — a refused figure showing
its ground — is *"the condition this audience is actually testing"*, and **charter S6** is a criterion
in its own right. **A slice with no refusal in it cannot measure charter S6 at all**, and § 6 therefore makes
one reachable on purpose. The two halves fail independently so a slice cannot pass by being clear
about the easy half.

**◆ X3 says *ninth*, not *eighth*, and the correction is the point of saying it.**
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 and
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § U both call the
no-identifiers check *an eighth honesty property*. `honesty/types.ts#HONESTY_PROPERTIES` holds
**eight** already — `suppressed-mean`, `single-run-comparative`, `probability-word`,
`estimate-without-n`, `energy-wait-blend`, `goal-without-rate`, `whole-run-figure-early`,
`withheld-figure-published` — and `properties.ts` comments its own map *"check all eight"*.
[`CLAUDE.md`](../CLAUDE.md) describes the temporal axis ([§ D307](../DECISIONS.md)) as *"a seventh
property"*; **`withheld-figure-published` is the eighth and is named in no governing document at
all** — not [`CLAUDE.md`](../CLAUDE.md), not [`DECISIONS.md`](../DECISIONS.md), not
[`docs/22-charter.md`](22-charter.md), which is why the ordinal drifted without anybody noticing.
That is `RISKS.md` R38 in miniature: **a count published in prose drifts, and no test re-derives
it.** The scope claim underneath it is unaffected and was confirmed — the corpus already drove
`EVERYDAY_SHELL_ABSENCES`, so the check needed no new plumbing.

**Both have since happened, and the arrangement moved.** The check is `internal-notation`, the ninth
honesty property; it found 19 violations and GitHub issue #207 took the register to empty in both
tiers. `EVERYDAY_SHELL_ABSENCES` now lives in `everyday/buildNotes.ts` rather than the shell, and is
driven through that file's own adapter rather than the shell's — the line number this paragraph used
to cite is another file's text today, which is why it cites neither a line nor a module now.

**And it is red now.** `everyday/shell.ts:90-154` renders five entries to the player carrying
`§ 6.1`, `§ 6.2`, `§ 14`, `§ 12.2`, `§ 6.5`, `§ 3.2`, `§ 9`, `§ 9.2`, `§ 9.3` and the identifier
`` `dev/reportPanel.ts#LEVER_SURFACES` ``. The full count across the tree is **six surfaces, 27
entries, 17 carrying notation** ([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § N), against an issue that names four surfaces. **Build the check
before the fixes**, so the gate has an instrument rather than an opinion — that instruction is
§ M2's and this document keeps it verbatim.

One scoping note the property will need: every register *entry* is already swept as `role:'reason'`,
the role the existing rules **exempt** from `docs/10` R3, which is why no property has ever flagged this
content. Three register **headings** are outside the corpus entirely (`shell.ts:1130`,
`stageScreen.ts:563`, `campaignModel.ts:323`). A heading the search has never read is its own
finding.

**◆ X5 adds a clause § M2 does not have.** T1 as written is *happy path, day closed, figures
consistent*. That is a completeness test, and it would pass on a slice that fails **P3** outright —
a stage that shows nothing and a report that announces everything is a green T1. The added clause
asks the test to assert the antecedent.

**＋ X6, X7 and X8 are new.** X6 exists because the measurement in § 1.6 found that the shipped goal
grid does not grade the slice's own trouble; without it the slice can pass every other criterion
while filing a visibly bad day as a clean shift with a streak. X7 exists because this document
quotes numbers, and [`CLAUDE.md`](../CLAUDE.md)'s rule is *if you publish a number, pin it to the run
that produced it*. X8 exists because the slice's own fixes will make register entries stale, and
[§ D227](../DECISIONS.md)'s stale refusal is *"worse than a dead seam rather than better"*.

**Unchanged: X1 and X4.** § M2's first and fourth criteria are adopted word for word. They are the
two whose instruments belong entirely to other M1 lanes (#205, #203), and refining them here would
be this document writing another lane's specification.

### The honest total

**Two of eight have an instrument today, and one of those only partly.** X3 needs one property over
plumbing that exists. X5 needs an existing test extended. X6, X7 and X8 need small tests nobody has
written. X1, X2 and X4 need M1 siblings to land first. **No criterion may be reported as met before
its instrument exists** — charter § 4's rule, and it is why the slice review has a
prerequisites list rather than a start date.

---

## 4. What is in the slice, and what is out

### In

| in scope | why |
|---|---|
| `menu`, `door`, `brief`, `stage`, `report`, `week`, `tuner` — seven screens | The six of T1's route plus the one the change is made on |
| One building (`chancery-house`), one dispatcher (`collective`), one profile, one template, one day, one pinned first-load seed | § 1. A slice with two of anything is measuring the wrong thing |
| The daily loop's own filing path, including the campaign's shared `STAGE_SCREEN` | #206's fix lands on one code path that both flows use; fixing it for one and not the other is not available |
| The report's `add-a-car` lever, its pointer ground, and its route to the tuner | § 1.7 |
| Every failure and empty state in § 6 | The charter requires every state to be designed, and a slice that ships only the happy path has not been reviewed |
| The ninth honesty property and the register rewrite behind X3 | It is the only exit criterion with a cheap mechanical instrument, and it is red |

### Out, with a reason each

| out of scope | reason |
|---|---|
| **Endless rush, Campaign and Fix a building as *modes*** | One mode is what makes it a slice. Rush has no engine behind it at all ([`docs/23`](23-audiences-and-core-loop.md) § 6) and is a calibration instrument rather than a turn of the loop; Campaign's day-filing is M3 (#223); Fix a building already closes its loop and would prove nothing here |
| **The social half of Today's tower** — the world result, the histograms, *Race against* | Both need a server to post and verify runs, and this build has none. `RISKS.md` R32: a competitive surface is judged by a **round trip**, never by either end alone. M3 (#221, #222) |
| **Zoning as a player control** | § 1.7 option C. New control, new schema surface, and the slice's building has one bank |
| **Telemetry of any kind** | #202's privacy posture lands **before** any telemetry ships and that order is not recoverable ([`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1). The slice's criteria are all playtest- or test-measurable without it, deliberately |
| **The Engineer surface, and the door between the two worlds** | [§ D338](../DECISIONS.md)'s hand-off is built and works. The slice neither uses it nor changes it; the browser tier must keep reaching Engineer through the player's own path |
| **`packages/core/` and every published pin** | [`docs/22-charter.md`](22-charter.md) § 6. Reopening the engine is an escalation, not a lane. **A moved pin is a finding to report, not a number to edit** |
| **Anything that would make the product say less to hit a criterion** | If a criterion can only be met by cutting a figure, that criterion is not met. Charter § 6's closing line, applied — it is written about **charter S9**'s load budget and it binds every criterion in § 3 the same way |
| **A score, grade, rating or eco-metric over the slice's day** | charter § 5 non-goal 1, indexed to [`docs/10`](10-experience-layer-contract.md) § 5.5 and [`docs/21`](21-engineer-reimagined-contract.md) § 6. Energy may sit beside a figure; it is never aggregated into one ([§ D106](../DECISIONS.md)) |

---

## 5. The issue-by-issue map, #206–#218

Dispositions are [`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md)'s; the evidence is
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) §§ M–N and S–U. **Three of the
thirteen changed shape under verification and two of those got dramatically smaller.**

| # | on the slice's critical path? | what the slice needs from it | shape change |
|---|---|---|---|
| **#206** loop dead-end | **Blocking.** Beat 5 does not exist without it | Both gaps: navigate **on the confirmed file**, and re-base the breadcrumb's enabling predicate on *has the destination anything to show*. Step numbers stay. Also on this route: `stageScreen.ts:862` restarts a closed run on re-mount, so *‹ The day* currently starts a brand-new day — closing the stage↔report loop makes that reachable in one more place | Confirmed exactly; **three of the issue's claims are wrong**, including that Fix a building shares the path. It does not |
| **#207** front door sells absences | **Blocking** for X3 | The register moves to where a developer reads it; a build-information panel must be a **real non-test caller of all six arrays** or `viz/src/deadCode.test.ts` re-fires. X3's property is the check | **Undercounted**: six surfaces and 27 entries, not four. Three of the issue's claims are wrong — the register is *under* the tiles, not first, and the brief carries none |
| **#208** no problem to solve | **Blocking.** It is the slice's building, day and seed | § 1.3, § 1.5, § 1.6 — and the daily opening slot must separate from `CONTRACTS[0]` rather than move it | Confirmed in conclusion; **two of its four figures are properties of a distribution stated as constants**. The fix is a **slot decision, not a data one**, and raising the arrival rate is barred |
| **#209** tutorial refuses both headlines | **Not on the path** | Nothing. Do not schedule it | **REFUTED** — fixed by `e6a1a3d` on 2026-08-11, **thirteen days before the issue was filed**; 0 of 100 seeds suppress. Its live residual is the **campaign** path's missing `reportWindow`, which needs its own issue and invalidates `data/scenario-goals.json` when closed |
| **#210** first-run experience | **Blocking** for X1 | Built against #197's flow maps, which are an M1 sibling. The slice is the only journey it has to teach | Absence confirmed; one phrase the issue quotes is **in no document in this repository** |
| **#211** cut copy | On the path, not blocking | The report's closing block, in the **two views**, never in `shift/report.ts`; `shaped.smallPrint` must sit between lead and reach **byte for byte** | Both counts overstated: **338 words**, not ~400; stairs card **70**, not ~120 |
| **#212** rebuild the stage | On the path, **and the art cost collapsed** | Two narrow fixes: the door-leaf fill inversion at `doorFraction = 0`, where two leaves paint over the whole car body, and the opening playhead at 06:00 on an empty lobby | **LARGELY REFUTED.** People, doors and queues **are all drawn** — one capsule per waiting rider coloured by wait age, door leaves, up to nine marks inside each car, and the `0/10` occupancy label the issue itself quotes. **This is a fill inversion and a playhead decision, not a renderer rebuild** |
| **#213** actionable report advice | **Blocking.** It is beat 4 | The button must open what its label names; the label must not name an Engineer tab to a Casual reader; and the fourth ground of § 1.7 option B lands here | **Criterion must be narrowed.** *Every lever opens what it names* taken literally ships a non-goal violation: only **two of four** may ever route |
| **#214** rail contradicts the week | On the path | `drawRail` reads `dataHost.week()`, as `campaignRailOptions()` already does. The two-store split stays | **Not stale — unconditional.** No producer supplies `profile.streak`, so that sentence is the only string the line can render. A refusal nothing can retract |
| **#215** "ATTEMPT 4" after one run | **Blocking.** It is § 6's fourth state | Stop `stageScreen.ts:862` re-running a closed day, or extend `week.ts`'s `recordGrew` exemption to a bit-identical re-simulation | Confirmed in effect; **the stated mechanism is wrong**. Navigation was closed by [§ D232](../DECISIONS.md); the counter moves once per *close*, and the real cause is a silent re-run on re-mount |
| **#216** Monday called Tuesday-shaped | On the path, cheapest in the set | One string literal, and a weekday hard-coded in code rather than `data/` is a [`CLAUDE.md`](../CLAUDE.md) invariant 7 case. Assert against `WEEKDAYS` so the test cannot go stale | Confirmed exactly. Both strings come from **one function call**, so it is one record carrying a contradiction |
| **#217** promote Fix a building | **Not on the path** | Nothing. § 1.2 answers its structural argument and leaves the positioning decision to a human | **NOT-A-DEFECT** (positioning); **two mechanical criteria half wrong** — the stale refusal it asks to remove never renders, and the docstring it asks to correct is already correct |
| **#218** hold the slice review | **It is the review** | Its criteria are this document's § 3. **Reduce it to *execute the review*** | Duplicates § M2 almost verbatim, is blocked on #198, and **its criterion 3 fails today** |

**The one-line read.** **Six** issues block the slice — #206, #207, #208, #210, #213 and #215, the
last because § 6.4 is a designed state rather than a defect to fix later. **Three** more are on its
route without blocking it: #211, #212, #216. **Two** are off it entirely: #209 (refuted) and #217
(positioning, and a human decision). #218 **is** the review. **#212's rescoping is the largest
single change to the slice's cost**: a P0 filed as *rebuild the stage so the crowd is visible* is two
narrow defects on a renderer that already draws people, doors, queues and occupancy.

---

## 6. Failure paths and empty states

**Every state below is designed, drawn and driven by a test.** A slice that ships only the happy
path has not been reviewed — and two of these are not edge cases at all: § 6.3 is *the normal state*
of this build by its own admission, and § 6.4 is what the shipped product does today when a player
presses back.

### 6.1 The run saturates

The queue outruns the group and `awtIsValid` fails on the **saturation** ground. AWT, WT95 and TTD
are all refused together; the longest wait, the handling capacity, the demand offered and every count
still publish.

**What the slice does.** The sheet **leads with the refusal**, in the register of the reader in front
of it, and names the ground — not *"unavailable"*, not an em dash, and never a running mean wearing
the same label. It then publishes the two figures that make the day legible without a mean:
**handling capacity against demand offered**. On a saturated Midtown day those read *77 people every
five minutes* against *194 turned up*, which is the whole diagnosis in two numbers and no vocabulary.
**The four goals still grade, and that is structural rather than lucky**: `GoalObservations`
carries *"not one suppressible field"* — no `meanWaitS`, no `wait95S`, no `meanTimeToDestinationS` —
so a goal that wanted to grade a mean could not be written against the type, and the worst wait
clears the bar deliberately because a **maximum is not an estimate**. Where a maximum genuinely is
unknowable its leg is censored and the reading refuses rather than guesses. The `add-a-car` lever is
pointed at, because saturation is its first ground.

**What it must not do.** Show a provisional average, widen a threshold, defer the refusal to small
print, or replace it with encouragement (charter § 5 non-goal 3). And the verdict for beat 5 is read
on figures that survive suppression — **carried against turned up, the longest wait, the queue's
growth rate** — never on a delta taken across a refused mean.

### 6.2 A figure is refused on any of the other four grounds

`CLAUDE.md` lists **five**: saturation, an empty window, censoring above the unserved limit, a leg
past the 900 s abandonment horizon, and an abandonment rate above 2 %. The slice's day carries no
patience curve, so the fifth cannot fire; the second is the one that bit the tutorial building and
was fixed by choosing the window from a measurement the repo already owned.

**What the slice does.** One refusal wording per ground, each naming its own ground, drawn on
**every** surface that would otherwise have printed the figure — the left rail, the right rail, the
report, the canvas, `live/` and the exported PNG, which is where `meansAreSuppressed` is already
asserted separately six times. This is condition **B4**, and it is the half of the product the
engineer audience is actually testing.

**And it is deliberately reachable in the slice.** X2's second half cannot be measured against a
product that never refuses anything. The slice does not manufacture a refusal on the pinned first
session — that would be the same defect in the opposite direction — but it must be reachable in one
step from it, and the playtest script must reach it.

### 6.3 The API is unreachable

The world result, the daily board and the histograms all need a server this build does not have, and
**this is the normal state rather than an edge case** (`doorView.ts` says so in as many words).

**What the slice does.** Every world figure draws § 12.2's **labelled unavailable state**, the
screen is otherwise complete, and no zero stands in for an unknown. `boardScreen.ts` already does
this for the board; the door's `unavailableBand` already does it for the front door. **Nothing on the
slice's route may be blocked by the absence** — the day runs, the report writes, the week fills, and
the only thing missing is where the player's day sits against other people's.

**What it must not do.** Draw an empty board as though it were a board with nobody on it, spin
forever, or claim a mechanism the build does not have. `settingsView.ts:236-243` currently states
*"Every run you post is re-simulated by the server before it appears on a board"* two blocks below a
register saying this build has no server; the slice's route must carry no sentence of that shape.

### 6.4 The player changes nothing and re-runs

**This is issue #215 and it is the state the shipped build gets most wrong.** Re-entering the stage
after a close silently starts a new run — bit-identical, because the seed is unchanged — which the
Engineer tick then auto-files behind the cover. Report → stage → report yields *attempt 2* with the
player having asked for nothing and nothing having changed.

**What the slice does.** A re-run with no change is **the same run**, and the product says so: no new
attempt is counted, no new sheet is filed, and the paired block either does not draw or draws with
both sides identical and says *nothing changed* in as many words. `week.ts:288-304` already has the
right exemption for exactly this class (`recordGrew`) and it is not applied here.

**Why it is a designed state rather than a bug fix.** A player who re-runs without changing anything
is asking a real question — *is this day always like that?* — and the honest answer is *yes, and here
is why: it is the same crowd every time, which is the only reason the comparison you are about to
make will mean anything.* That sentence is beat 4 explaining itself at the moment the player has
asked for it, which is worth more than any tooltip.

### 6.5 Two more the review will meet

- **The player re-runs after changing something, and the two sheets are indistinguishable.** The
  verdict is *too close to call at this many runs* — never the better-looking arm named as the
  winner. One day each is a comparison, not proof; the bench settles it properly, and the sheet says
  which of the two it is.
- **The player leaves mid-day.** Progress does not survive the tab (#164, M3). The slice must not
  imply otherwise: no *saved* language, no resume affordance that resumes nothing.

---

## 7. What makes this slice a no-go

**Stated in advance so the verdict is not negotiated afterwards.** Any one of these is a no-go on its
own. They are conditions, not a weighting.

1. **The loop does not close on the player's own path.** If the review reaches the report by any
   route a player cannot — a test helper, a breadcrumb enabled for the demo, a hand-off — the slice
   has not been demonstrated. This is #206, and it is the one defect that makes every other
   measurement moot.
2. **X3 is still red.** A player surface naming a section number, a filename or a code identifier is
   a mechanical failure of a mechanical check, and it is the criterion this milestone already knew
   was failing before it opened. Passing the review with it red would be the milestone declining to
   run the one instrument it has.
3. **The stage does not show what the report says.** Pillar **P3**, refused with its own question:
   *where on the stage would a player have seen this?* If the answer is nowhere, the slice is a
   report with an animation above it.
4. **The change does not change the run.** A control that fails *move it and require the run to
   change, compared on the legs* is deleted, not documented. A slice built on one would pass every
   other check in this repository while binding nothing — which has now happened **eleven times in
   code and twice in `data/`**, most recently to a five-select editor that was never written because
   the rule was applied first ([§ D219](../DECISIONS.md)).
5. **A figure on the route cannot be traced to a run.** Including a figure taken from the design
   prototype's own arithmetic, which computes average wait as `28 + (100 − pct) × 0.9`. The handoff
   wins every disagreement about what the screen looks like; the simulator wins every disagreement
   about what a number means.
6. **A criterion was met by moving something in [`docs/22-charter.md`](22-charter.md) § 6.** A
   weakened suppression ground, a widened threshold, a deleted dead-seam guard, a skipped audit, an
   edited pin. **A moved pin is a finding to report, not a number to edit**, and a criterion met this
   way is a charter violation any reviewer may refuse as one.
7. **Fewer than six of ten testers can say what went wrong**, or fewer than six can say why something
   was refused. Both halves of X2, failing independently.
8. **The review is held without instruments.** If X1's playtest has no script, no consent basis and no
   recording, the sessions are anecdotes. **A criterion satisfied by assertion is exactly what
   [§ D163](../DECISIONS.md) refused to write**, and the charter replaced that exclusion with
   measurement rather than with confidence.

**And one thing that is explicitly *not* a no-go.** A named gap. Phase 9 was **accepted with named
gaps** and the gaps were part of the verdict; the slice may be accepted the same way. What is not
available is a gap that is discovered at the review — every one must be in the verdict document
before the session, which is what § 3's *exists today?* column is for.

---

## 8. What this document does not discharge

Recorded here because a specification that hides its own open items is the defect it exists to
prevent.

- ✅ **The slice definition is [§ D411](../DECISIONS.md)** (2026-08-29). That entry is an anchor
  and does not choose the seed § 1.6 leaves open.
- **The README *Documentation* table needs a row for this file**, or
  `packages/experiments/src/validation/documentation.test.ts` fails. **Owned by the integrator** —
  several M1 lanes would collide on that table.
- **The seed is not chosen.** § 1.6 pins the rule; **X7** says what the run that chooses the integer
  must assert.
- **The operating point is not validated by a run.** § 1.5's move-in day is specified from the event's
  own effect and bounded by § 1.3's whole-shift measurement. **X7** requires the day itself measured
  before M2 opens.
- **The fourth `add-a-car` pointer ground (§ 1.7 option B) is an M2 issue that does not exist yet.**
  It is a change to `shift/report.ts` and therefore not writable in M1.
- **X1, X2 and X4 depend on M1 siblings that have not landed** — #205's playtest programme, #202's
  privacy posture, #203's browser matrix. The slice cannot be reviewed before they do.
- **The difficulty curve (#200) inherits § 1.6's measurement**: the day-1 goal bars grade this
  slice's troubled day as clean on 27 of 30 seeds. That is an input to #200, not a defect against it.
- **Two counts in `CHARTER_PROGRAMME.md` § M2 and `ISSUE_VERIFICATION_FINDINGS.md` § U say *eighth
  honesty property* where the tree has eight already.** Corrected in § 3 rather than edited in place:
  this document does not own either file.

---

## Sources

- [`docs/22-charter.md`](22-charter.md) — adopted [§ D342](../DECISIONS.md). Pillars **P1–P5**,
  criteria **charter S1–S10**, § 5's non-goals, and § 6's untouchable list. Governs this document.
- [`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — conditions **A1–A4** and
  **B1–B4**, the five beats, the restatement rule, and § 6's honest register of which modes do not
  serve the loop.
- [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) §§ M1 and M2 — the milestone this document exits
  and the milestone it gates. § M2's five exit criteria are refined in § 3, never restated.
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) §§ M, N, S, T, U, V — the
  verified state of all thirteen M2 issues, and the 100-seed sweep behind § 1.3's first rejection.
- [`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md) — the dispositions § 5 tabulates.
- [`CLAUDE.md`](../CLAUDE.md) — the eight invariants, the statistical discipline, the five grounds a
  mean is refused on, and the standing rule that a published number and a stated refusal go stale the
  same way.
- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) — `docs/10` **R2**, **R9**,
  **R13**, § 3.4's dual-presentation finding, and § 5.5's *what must never be built*.
- [`docs/21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 6 — the other
  product's non-goals, cited rather than restated.
- [`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
  §§ 2, 3.2, 5, 6.1, 10 — the fixed vocabulary, the tuner's two doors, the session shapes, the front
  door and the cut quiz. Canonical for the interface; **not** for numbers.
- [`RISKS.md`](../RISKS.md) — **R30** (the engine is mature and the game is not), **R31** (no player
  is measured), **R32** (the competitive layer is dark client-side), **R35** (inbound feedback has a
  measured error rate), **R38** (a prose count drifts and no test re-derives it).
- [`TEST_MATRIX.md`](../TEST_MATRIX.md) — **T1**, **T2**, **T3**, **T15**, **T16**, **T20**; all
  twenty-one rows read `planned`.
- [§ D106](../DECISIONS.md), [§ D134](../DECISIONS.md), [§ D163](../DECISIONS.md),
  [§ D219](../DECISIONS.md), [§ D227](../DECISIONS.md), [§ D232](../DECISIONS.md),
  [§ D280](../DECISIONS.md), [§ D299](../DECISIONS.md), [§ D307](../DECISIONS.md),
  [§ D335](../DECISIONS.md), [§ D338](../DECISIONS.md), [§ D342](../DECISIONS.md),
  [§ D343](../DECISIONS.md).
