# 24 — Competitive teardown

**Issue:** #189 · **Milestone:** M0, concept and direction · **Written:** 2026-08-24 against `aac8d17`
on `claude/elevator-sim-charter-kickoff-rexfw8` · **Character:** a document. M0 writes no production
code, and nothing here proposes any.

**This document extends [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md)
§ 3. It does not replace it and does not restate it.** § 3 is a five-part cited prior-art survey
covering Mini Metro, SimTower, Project Highrise and Factorio, with 13 sources at its § 15
(lines 2402–2419, measured 2026-08-24). Where a cell below is already answered there, this document
**points at it** rather than paraphrasing it. Two accounts of the same finding are two things that
can drift apart, and drift between a stated finding and its source is the defect class this
repository exists to record — see [`CLAUDE.md`](../CLAUDE.md) § *A stated mechanism goes stale the
same way* and [§ D280](../DECISIONS.md).

What § 3 does **not** contain, and what this document is: a **teardown against a common template**,
with an **adopt-or-refuse verdict per entry**, over a set that includes five titles the tree had
never named.

---

## 0. What this document is for, and the one thing it is not

It is for two consumers named by #189's own acceptance criteria: the art-direction brief (#195) and
the onboarding specification (#197), both M1. It is also evidence for #186 — a charter whose
non-goals are supposed to be refusable at review needs to know which of them are eccentric and which
are industry-standard.

**It is not a market study.** No sales figure, player count, revenue estimate or review score is
used to support any verdict here, and where a search result offered one it was discarded. A
teardown's job is to say what a design does and what it costs; the size of the audience that bought
it is a different question and this document does not answer it.

---

## 1. Correction note — #189's two premises did not survive verification

Recorded so that a later reader does not re-derive it. The evidence is in
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § Q; it is restated here in one
table because #189 is worked from this document and a reader of this document should not have to
find that one.

| #189's premise | verdict | what is actually true |
|---|---|---|
| *"No competitive analysis exists in the repository"* | **PARTIALLY REFUTED** | `docs/10` § 3 (lines 673–770) is a cited four-title prior-art survey with 13 sources at lines 2402–2419. The half that **is** true: no teardown against a common template exists, and no entry anywhere carried an adopt-or-refuse verdict |
| *"`docs/10` observes that 'the elevator-sim genre has already learned the hard lesson' without saying which lesson or where"* | **REFUTED** | `docs/10` § 3.2 (lines 699–711) states the lesson exactly — SimTower's elevator micromanagement became unwieldy at scale; Project Highrise deliberately abstracted elevators away and became a building-management game — and cites its source |

**The second premise should be struck from #189 before the issue is closed**, rather than answered.
An issue that survives with a refuted sentence in it is a stale statement in the backlog, and this
repository's standing position is that a stale *refusal* or a stale *description* is more dangerous
than an absent one, because it tells the next reader not to look ([§ D227](../DECISIONS.md)).

### 1.1 A third correction, found while checking the first two

§ Q states that Elevator Saga, Mini Motorways, Two Point Hospital, Opus Magnum and Shapez *"appear
nowhere in the tree."* Re-measured on this tree at `aac8d17`, that is true of four of the five.
**Two Point Hospital appears once**, at
[`docs/elevator-sim-playtest-report.md`](elevator-sim-playtest-report.md) line 34, as an
art-direction reference for the Casual renderer — *"cars gliding, tiny figures boarding, a door that
visibly opens."* It is a one-clause visual comparison with no teardown, no verdict and no source, so
§ Q's conclusion holds and only its wording is wrong. Recorded rather than quietly fixed, because
the count is the sort of thing a later document will cite.

**And the document it appears in carries a status.** [`README.md`](../README.md) files the playtest
report as *"a report rather than a finding"*, noting that verification has since refuted or
re-attributed a large share of it. Every citation of it below carries that qualification inline.

---

## 2. The template

Seven fields. They are applied to all nine entries identically, including to the four that
`docs/10` § 3 already covers — for those, the cells § 3 owns are **pointers**, and only the cells § 3
does not address are filled in here.

| field | what it asks |
|---|---|
| **What the player does** | The verb. What is under the player's hands, minute to minute |
| **What it refuses to do** | The designed absence. What a reasonable player expects and does not get |
| **How it teaches** | How a first-time player learns the system, and whether a tutorial wall is involved |
| **How it shows failure** | What losing looks like, where it is located on screen, and whether the number behind it is an observation or an estimate |
| **Session length** | How long one unit of play is, and whether the game chooses the end or the player does |
| **Adopt** | One concrete practice this project should take, and what it costs |
| **Refuse** | One concrete practice this project must not take, **naming the rule or non-goal the refusal protects** |

**Every refusal names a rule that exists on this tree**, because a refusal justified by a rule
nobody wrote down is an opinion. The rules available are:

- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) **R1–R13** and its § 5.5
  *What must never be built*.
- [`docs/21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 6's **nine
  non-goals**, with [§ D299](../DECISIONS.md)'s test: *a change to Engineer may make it easier to
  use; it may not make it say less.*
- [`CLAUDE.md`](../CLAUDE.md) — the eight invariants, § *Statistical discipline*, § *Tuning
  discipline*.
- [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 8's definition of done.

**The charter's five pillars are not among them, and that is deliberate.**
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) and `MULTI_AGENT_PLAN.md` § 0 both record that the
charter — vision, player promise, five pillars, two audiences, S1–S10, the non-goals — **is not yet
adopted** and is not in `docs/`. Binding a verdict to a pillar this tree does not carry would be a
citation a reader cannot follow, which is precisely what
`packages/experiments/src/validation/citations.test.ts` was written for. So every verdict below
binds to a rule that exists **today**, and § 9 lists the two places where a verdict wants a pillar
that #186 has yet to write.

---

## 3. The evidence standard

**This container's network egress is restricted**, and that shaped what could be verified. Direct
fetches of `play.elevatorsaga.com`, `dinopoloclub.com`, `en.wikipedia.org` and `shapezio.fandom.com`
were refused by the egress proxy (`curl` to the same hosts returns `CONNECT tunnel failed, response
403`). A search index and `github.com` / `raw.githubusercontent.com` were reachable. Every claim
below therefore carries one of three marks, and **the marks are load-bearing** — this repository's
position is that a confident wrong statement is worse than an absent one:

| mark | means |
|---|---|
| **[source]** | Read directly in this container from a primary artefact — the game's own shipped source, this repository's own files, or the GitHub API. Reproducible by anyone with the same URL |
| **[secondary]** | A named third-party page surfaced by a search index. The page itself could **not** be opened here, so the claim is attributed to it and not independently confirmed |
| **[unverified]** | Asserted by #189, or plausible from general knowledge, and **not** checked. Marked, and never used to carry a verdict |

**One title was verified at source and eight were not**, which is the honest shape of this teardown
and is stated up front rather than buried. Elevator Saga is open source under MIT
([magwo/elevatorsaga](https://github.com/magwo/elevatorsaga), 2 553 stars, 351 forks, created
2014-08-15, last pushed 2022-11-21 — GitHub API, measured 2026-08-24) **[source]**, so its entry
below is read out of the game's own code rather than described. The other eight are commercial or
unreachable, and their entries are correspondingly weaker. **That asymmetry is why the deepest
finding in this document is in the Elevator Saga entry**, and it is not a coincidence: it is what
happens when a claim can be checked.

**Nobody played these games for this document.** #189 asks for titles *played* and written up. What
happened instead is a source read, a documented-behaviour survey and a search pass. #189's first
acceptance criterion is therefore **partially met at best**, and saying so is cheaper than the
alternative — see § 9.

---

## 4. The four titles `docs/10` § 3 already covers

Cited, not restated. The **Adopt** rows for these four are largely *already adopted*, which is
itself the finding: § 3 did this work and § 11 of that document costed it out. What this teardown
adds is the **Refuse** row, which § 3 never wrote, and the verdict form.

### 4.1 Mini Metro

| field | |
|---|---|
| What the player does | See `docs/10` § 3.1 |
| What it refuses to do | Not addressed by § 3. It refuses to let the player move a train, route a passenger, or see a number: the whole state of the network is conveyed by the drawing **[unverified]** |
| How it teaches | See `docs/10` § 3.1, including the cited legibility **warning** it carries |
| How it shows failure | See `docs/10` § 3.1 |
| Session length | Not addressed by § 3, and not verified here **[unverified]** |
| **Adopt** | **Already adopted.** § 3.1 adopts the overcrowding fail state as R4 and adopts its legibility warning as the requirement that the diverging queue be visually unmistakable well before the run ends (U4, `docs/10` § 6). This teardown adds nothing and says so |
| **Refuse** | **The scalar that comes with it.** Mini Metro is understood to resolve a run to a delivered-passenger count and rank players on it **[unverified — not checked for this document]**. The refusal does not rest on that: `docs/21` § 6 non-goal 3 (*no scalar challenge score, ever*) and `docs/10` § 5.5 forbid the scalar whatever the source design does. What this teardown contributes is the **pattern**, and it recurs — in three of the nine entries a good fail state and a scalar score arrive as one package, and only the first half is adoptable |

### 4.2 SimTower

| field | |
|---|---|
| What the player does | See `docs/10` § 3.2 |
| What it refuses to do | Not addressed by § 3, and not verified here **[unverified]** |
| How it teaches | Not addressed by § 3, and not verified here **[unverified]** |
| How it shows failure | Not addressed by § 3, and not verified here **[unverified]** |
| Session length | Not addressed by § 3, and not verified here **[unverified]** |
| **Adopt** | **The subject.** § 3.2's cited finding is that SimTower's elevator management became unwieldy *at scale* — which is a failure of the interface at 100 floors, not a verdict that elevator scheduling is a bad subject for a game. This project keeps the subject and owes the scaling answer, which § 3.2 already assigns to aggregation (`docs/10` § 6's degrading queue renderer) rather than removal |
| **Refuse** | **Per-car micromanagement as the interaction.** Refused, with a caveat this document is obliged to state: **the tree carries no non-goal forbidding mid-run manual control of cars.** The nearest thing is an observation in `docs/elevator-sim-playtest-report.md` line 32 — *"dispatching in this genre is a policy you commit to and then observe, not a joystick you wiggle in real time"* — in a document `README.md` marks as *a report rather than a finding*. So this is a **proposed** non-goal, listed in § 9 for #186, not an existing one being applied |

### 4.3 Project Highrise

| field | |
|---|---|
| What the player does | See `docs/10` § 3.2 |
| What it refuses to do | See `docs/10` § 3.2 — the designed absence *is* the citation |
| How it teaches | Not addressed by § 3, and not verified here **[unverified]** |
| How it shows failure | Not addressed by § 3, and not verified here **[unverified]** |
| Session length | Not addressed by § 3, and not verified here **[unverified]** |
| **Adopt** | **The evidence, not the move.** Project Highrise abstracting elevators away *after* SimTower is the strongest available evidence that the scaling problem is real rather than theorised — a studio in this genre paid for the answer. Adopt the evidence into the charter's justification for U4's aggregation |
| **Refuse** | **The exit itself.** § 3.2 already refuses it in terms — *"This project cannot take Project Highrise's exit: the elevators are the subject"* — and this teardown's contribution is only to note that the refusal is now under pressure from a second direction. Everything in this document that is easy to adopt (Opus Magnum's histograms, Shapez's unlock ladder, Two Point's mission tutorialisation) is adoptable *because* it is indifferent to the subject; the abstraction is the one move that would make all of them easier and is refused on `docs/00-project-brief.md`'s vision |

### 4.4 Factorio

| field | |
|---|---|
| What the player does | See `docs/10` § 3.5 |
| What it refuses to do | Not addressed by § 3, and not verified here **[unverified]** |
| How it teaches | See `docs/10` § 3.5 |
| How it shows failure | Not addressed by § 3, and not verified here **[unverified]** |
| Session length | Not addressed by § 3, and not verified here **[unverified]** |
| **Adopt** | **Already adopted, and already costed.** § 3.5 identifies the elevator equivalent — offered demand against handling capacity, `offeredPer5Min` beside `personsPer5Min`, two observations rather than any estimate — and calls it *"the highest-value single addition in the whole of Phase 9"* (`docs/10` § 11.W2). This teardown adds no new adoption and does not re-argue the priority |
| **Refuse** | **The gated tech tree, applied to information.** Factorio's teaching device is that capability arrives when the level needs it; the failure mode when that pattern is copied onto a *simulator* is a metric that exists and is withheld until the player has earned it. Refused by R8 (*Basic mode may hide complexity; it may never hide a failure*) and by `docs/10` § 4's non-negotiable list — saturation, undelivered passengers, invalid statistics, locked-out calls and the seed are visible in every mode. Adopt the belt; refuse the tech tree |

---

## 5. Elevator Saga — the closest comparator, read out of its own source

**This is the entry that matters**, for three reasons. It is the only title in the set whose subject
is *this* subject. It is the one a stranger is most likely to confuse this product with. And it is
the only one whose behaviour could be verified rather than described, because it is MIT-licensed and
its model, its challenge ladder and its app loop are **625 lines of JavaScript across three files**.

Everything in this section marked **[source]** was read on 2026-08-24 from
`raw.githubusercontent.com/magwo/elevatorsaga/master/` — `challenges.js`, `world.js`, `index.html`,
`app.js`. The upstream repository's last push is 2022-11-21, so the files are stable; line numbers
are given so every claim can be checked. The live site was unreachable from this container (§ 3),
so nothing about how it *feels* to play is claimed here.

| field | |
|---|---|
| **What the player does** | Writes JavaScript. The player supplies an object with `init(elevators, floors)` and `update(dt, elevators, floors)`, subscribes to `"up_button_pressed"` / `"down_button_pressed"` on floors and `"idle"` / `"floor_button_pressed"` / `"passing_floor"` / `"stopped_at_floor"` on elevators, and drives cars with `goToFloor`, `stop`, `destinationQueue`, `loadFactor()`, `maxPassengerCount()` **[source: `documentation.html`]** |
| **What it refuses to do** | Almost everything else. The entire configurable surface of a challenge is **four fields** — `floorCount`, `elevatorCount`, `spawnRate`, `elevatorCapacities` **[source: `challenges.js:63-86`]**. No building editor, no traffic pattern, no access or service zoning, no physics beyond a fixed speed, no comparison of two programs against the same crowd |
| **How it teaches** | An 18-rung parameter ladder and one API page. The ladder runs 3 floors / 1 elevator / spawn 0.3 up to 21 floors / 8 elevators / spawn 1.5, and the *goal type* changes under the player three times — transport-within-time (8 challenges), transport-with-max-wait (7), transport-within-moves (2), one combined, plus a perpetual demo **[source: `challenges.js:63-86`]**. That is teaching by making the objective function move, which is a good idea and is noted as such below |
| **How it shows failure** | Binary, immediate, and with no diagnosis. `evaluate(world)` returns `true`, `false`, or `null` for undecided **[source: `challenges.js:1-60`]**; on `false` the screen reads **"Challenge failed" / "Maybe your program needs an improvement?"** **[source: `app.js:189`]**. The player is told the run failed and is not told what about the run failed |
| **Session length** | The scored challenges are **60–80 simulated seconds**, except one at **1 800 s** **[source: `challenges.js:63-86`]**. Wall-clock session length is dominated by writing and re-running code and was not measured **[unverified]** |

### 5.1 Adopt — and the adoption is a compliment this project should accept

**Its win conditions are observations, not estimates.** All four quantities any challenge is
decided on — `world.transportedCounter`, `world.elapsedTime`, `world.maxWaitTime`,
`world.moveCount` — are facts about the run that happened **[source: `challenges.js:1-60`]**. Not one
challenge is decided on a mean. That is **R1 arrived at independently**, by a designer who was not
reading this repository's statistical discipline, and it is worth adopting as evidence: R1 is not an
eccentric constraint invented to protect a confidence interval, it is what a designer converges on
when they need a pass/fail rule that holds up.

**And its worst-case observation is uncensored.** `world.maxWaitTime` is updated in the main update
loop over **every user currently present**, not only over users who have been delivered
**[source: `world.js:178`]**. The longest wait therefore includes the person still standing there,
which is exactly what `longestCurrentWaitS` is in `packages/viz/src/frame/overlay.ts`'s observation
half. Seven of the eighteen scored challenges are decided on it, and an eighth on it together with a
time limit **[source: `challenges.js:63-86`]**.

**Adopt: the moving objective.** The ladder changes *what is being optimised* — time, then worst-case
wait, then elevator moves — rather than only turning the demand up. This project has the same three
axes already and calls them AWT, WT95 and the energy proxy, and it already forbids collapsing them
([§ D106](../DECISIONS.md), `CLAUDE.md` § *Tuning discipline*: *do not scalarize too early*). A case
ladder whose *objective* moves is a way to teach the Pareto front without ever naming it. Cost: it is
a content-authoring decision for the Fix-a-building case set, not a code change.

### 5.2 Refuse — three, all read out of the source

**1. `avgWaitTime` is a censored mean, and it is displayed unconditionally.** The value is updated
in one place only, inside the `exited_elevator` handler **[source: `world.js:99-102`]**:

```
world.avgWaitTime = (world.avgWaitTime * (world.transportedCounter - 1)
                     + (world.elapsedTime - user.spawnTimestamp)) / world.transportedCounter;
```

The denominator is `transportedCounter`. **Riders still waiting are not in the sample.** A run whose
queues are diverging therefore reports an average waiting time computed over exactly the people the
system managed to serve — the population that, by construction, waited least — and the panel prints
it beside five honest observations with no qualification at all: *Transported, Elapsed time,
Transported/s, **Avg waiting time**, Max waiting time, Moves* **[source: `index.html:158-164`]**.

Refused by **R1**, **R3** (*suppression replaces the number, it never hides it*) and by
`awtIsValid`'s censoring ground in `CLAUDE.md` § *Statistical discipline*. This is not a hypothetical
defect being imputed to a competitor: it is the arithmetic, on line 102, of the closest comparator
this product has.

**2. There is no seed.** Arrivals, passenger weight, origin floor, destination floor and even the
iteration order over elevators are drawn from the ambient `_.random`
**[source: `world.js:32,34,36,46,47,51,54,55,133`]**. Nothing seeds it, nothing stores it, nothing
displays it. A player who passes a challenge cannot replay the crowd they passed it against, and two
players comparing programs are comparing them on different traffic.

Refused by `CLAUDE.md` **invariant 2** (*no global RNG*) and **invariant 5** (*every persisted run
record carries its seed*), and by **R7** (*the seed stays visible and copyable in every mode*).
Elevator Saga is, quite precisely, invariant 2 shipped as a product.

**3. A pass/fail verdict is named from one replication of a stochastic system.** Combine (1) and (2):
`spawnRate` drives random arrivals, one run decides, and the screen says *"Challenge completed"*.
Refused by **R2** (*a score is a property of a run, never of a dispatcher*) and **R12** (*a goal
judged on one run must have its across-seed variance measured and published, or it is a batch
goal*). `docs/10` § 1's **M7** is the measurement that makes this concrete on this project's own
buildings — Secure Tower under `collective`, 20 consecutive seeds: 6 of 20 return a quotable AWT and
4 of 20 are diagnosed saturated, *the same configuration*. A badge earned on one such run is a coin
flip presented as a skill outcome.

### 5.3 What is actually different, stated plainly

A reader who knows Elevator Saga and opens this product will assume they are the same thing. Two
differences, and neither is a matter of polish:

1. **This simulator refuses to publish a figure it cannot support; Elevator Saga publishes one it
   cannot support, on every run, in the same font as its observations.** The refusal is the product.
   `frame/overlay.ts` splits observations from estimates and suppresses the estimates with a reason
   ([§ D64](../DECISIONS.md)); `docs/10` R3 requires the reason to replace the number rather than
   blank it. The comparator does the opposite, at line 102.
2. **The player diagnoses; they do not program.** Elevator Saga's verb is *write a controller*. This
   product's verb is *read a run and change one thing* — [`README.md`](../README.md)'s five-step loop,
   whose step 5 is *"the same passengers, to the second, against both configurations"*, and whose
   answer is an interval or an honest refusal. The dispatcher is data, not code
   (`CLAUDE.md` invariant 7, `data/dispatcher-profiles.json`), which means the thing the player
   manipulates is a weight vector and a building, and the skill being taught is **reading the
   evidence**, not writing the policy.

**One claim in #189 about this title is not verified here.** #189 calls Elevator Saga *"the clearest
evidence that the enthusiast audience exists."* The only checkable datum found was the repository's
2 553 stars and 351 forks **[source: GitHub API, 2026-08-24]**, which measures interest among
developers who use GitHub in a browser tab. It is not a measurement of a market, it does not size an
audience, and it must not be quoted as if it did. Audience sizing is #188's question and is not
answered by this document.

---

## 6. The four remaining absent titles

### 6.1 Mini Motorways

| field | |
|---|---|
| **What the player does** | Draws roads connecting houses to destinations of the same colour, so cars can make trips; each completed round trip is one point **[secondary: [Mini Motorways Wiki](https://mini-motorways.fandom.com/wiki/Mini_Motorways)]**. Further infrastructure — traffic lights, roundabouts, motorways, bridges — is part of the vocabulary **[secondary: [autoevolution](https://www.autoevolution.com/news/mini-motorways-review-ios-apple-arcade-become-the-ultimate-road-network-planner-167032.html)]**; how it is acquired in a run was not verified here **[unverified]** |
| **What it refuses to do** | **The player never touches a vehicle.** Every input is an edit to the network; the cars route themselves. This is a designed absence in a game entirely about traffic **[secondary: as above]** |
| **How it teaches** | By the backlog being visible where it is caused. Pins accumulate on a destination and are removed one per visiting car, so an under-served destination is legible as a pile at that building **[secondary: [Mini Motorways Wiki](https://mini-motorways.fandom.com/wiki/Mini_Motorways), [The Scientific Gamer](https://scientificgamer.com/thoughts-mini-motorways/)]** |
| **How it shows failure** | A destination whose pins overflow starts a **timer**; if the count is not brought down before it expires the city shuts down and the run ends **[secondary: [Steam discussion](https://steamcommunity.com/app/1127500/discussions/0/3191359376161705321/)]** |
| **Session length** | Unbounded, and the game always wins: *all games end eventually*, and the goal is to survive while completing as many trips as possible **[secondary: as above]** |
| **Adopt** | **The player edits the system, never the vehicle** — arrived at independently by the most visually accomplished game in the adjacent set, in a domain where grabbing a car is the obvious interaction. This is the strongest external support available for the position that this product should not hand the player a joystick, and it should be quoted in #186's non-goal justification and in #197's flow maps. Also adopt the **location** of the fail state: the failure is at *that destination*, not in a global bar |
| **Refuse** | **The timer, and the trips-completed score.** The timer is a chosen number; `docs/10` R4's whole argument for saturation-as-fail-state is that it is *a real property of the building rather than a number someone chose*, fitted from queue samples. Refused by R4. The score is refused by `docs/21` § 6 non-goal 3 and `docs/10` § 5.5, on the same footing as § 4.1's — and it is the second time in this teardown that a good fail state and a scalar score arrive as a package |

### 6.2 Two Point Hospital

| field | |
|---|---|
| **What the player does** | Builds, staffs and runs hospitals across a campaign of levels, each introducing new illnesses, equipment and objectives **[secondary: [Two Point Hospital Wiki](https://two-point-hospital.fandom.com/wiki/Hospitals)]** |
| **What it refuses to do** | Not established here **[unverified]**. The claim that it hides its simulation depth behind comedy is plausible and was not checked |
| **How it teaches** | **The mission that needs a mechanic introduces it.** Campaign missions carry per-mission tutorialisation *"at a comfortable pace"* rather than a front-loaded tutorial **[secondary: [GameSpot](https://www.gamespot.com/reviews/two-point-hospital-review-laughter-is-the-best-med/1900-6416981/)]**. Presentation carries a lot of it — an in-game radio station with DJs and adverts **[secondary: [Impulse Gamer](https://www.impulsegamer.com/two-point-hospital-review/)]** |
| **How it shows failure** | Not established here **[unverified]**. What is established is the *success* ladder: every hospital carries a star rating up to 3, each star with its own objective set **[secondary: [Two Point Hospital Wiki](https://two-point-hospital.fandom.com/wiki/Hospitals)]** |
| **Session length** | Not established here **[unverified]** |
| **Adopt** | **Two things.** (a) *The mission that needs a mechanic introduces it* — the content-side counterpart to `docs/10` § 3.3's progressive disclosure, which is a rule about **controls**; this is a rule about **capability arrival**, and it is what the Fix-a-building case ladder and the campaign want. (b) **Difficulty knobs live in a separate, declared mode.** The explicit difficulty modifiers were added in Sandbox Mode, not retrofitted onto the campaign **[secondary: [SEGA press release](https://sega.prezly.com/two-point-hospital-sandbox-mode-available-now-as-a-free-update-on-consoles), [Two Point Hospital Wiki](https://two-point-hospital.fandom.com/wiki/Sandbox_Mode)]** — the same separation this product already draws between a scored run and a sandbox run (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 7: *changing the tower, machines or crowd still makes a run a sandbox run*) |
| **Refuse** | **The star rating, and half of Sandbox's difficulty axis.** A 1–3 star scalar per hospital is exactly the grade `docs/10` § 5.5 forbids (*a grade letter derived from AWT*) and `docs/21` § 6 non-goal 3 forbids outright. The difficulty split is the sharper refusal, and the two halves fall on opposite sides of a line this repository already drew: Sandbox reportedly exposes **patient arrival rate** *and* an **income modifier** and a per-tier **chance of treatment success** **[secondary: [Two Point Hospital Wiki](https://two-point-hospital.fandom.com/wiki/Sandbox_Mode), [GameFAQs](https://gamefaqs.gamespot.com/pc/230622-two-point-hospital/faqs/76595/sandbox-pc-only)]**. Arrival rate is legitimate — it is demand, this product's `TRAFFIC_PARAMETERS`. The other two are fudge factors on an outcome, and `docs/10` § 5.5 refuses them in one sentence: *"Difficulty is demand and geometry; it is never a fudge factor on a metric."* Adopt the first knob, refuse the other two, and note that a shipped game put all three behind one label |

### 6.3 Opus Magnum

| field | |
|---|---|
| **What the player does** | Builds a machine that produces a required output from given inputs. Any working solution advances; the puzzle is solved the moment the output is produced **[secondary: [Wikipedia, *Opus Magnum*](https://en.wikipedia.org/wiki/Opus_Magnum) via search index]** |
| **What it refuses to do** | **It refuses to combine its metrics.** There are three — **cost**, **cycles**, **area** — and no single combined score, deliberately: reported as a designer's position that there is no consistent way to compute a "best" and that combining them would limit creativity **[secondary: [Steam discussion, *Statistics "broken up"*](https://steamcommunity.com/app/558990/discussions/0/1480982971159216710/)]**. The attribution of that reasoning to a specific developer statement **could not be confirmed** and is not relied on; what is relied on is the shipped behaviour, corroborated across sources |
| **How it teaches** | By letting an inefficient solution pass. Progression never blocks on optimisation; the optimisation is the voluntary second game **[secondary: as above]** |
| **How it shows failure** | There is no fail state on a puzzle. The only failure is a machine that does not produce the output **[secondary: as above]** |
| **Session length** | Puzzle-length, then unbounded re-optimisation of a puzzle already passed **[secondary: as above]** |
| **Adopt** | **The three-histogram result screen — and the fact that it shipped.** This is the single most valuable finding in the teardown. `CLAUDE.md` § *Tuning discipline* says *"Do not scalarize too early. Report the Pareto front over (AWT, energy, WT95); the energy-versus-wait tradeoff is the operator's call"*; [§ D106](../DECISIONS.md) says energy is an axis and never a score; `docs/21` § 6 non-goal 3 says *no scalar challenge score, ever*. Those are held here on principle, against the standard objection that a mass audience needs one number. **Opus Magnum is the counter-example to that objection**: a commercially released puzzle game presents three independent distributions and refuses to add them up. The adoption is not new code — it is that #186 may now justify its hardest non-goal with a precedent instead of an argument. Second, smaller adoption: **the shareable artefact.** Opus Magnum's is an exported GIF of the machine **[secondary: [Steam discussion](https://steamcommunity.com/app/558990/discussions/0/3110269850323895741/)]**; this product's already exists and is the seed line, which R7 keeps visible in every mode and which the design handoff already prints on the door (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 6) |
| **Refuse** | **The histogram against other players, applied to a single run.** Opus Magnum's puzzles are **deterministic**: a solution's cycle count is exact and repeatable, so ranking one player's solution against a global distribution is honest there. This simulator's runs are **stochastic**, and the same screen over single runs is R2's defect in its most persuasive possible costume — `docs/10` § 5.5's *leaderboard ranking dispatchers from single runs*, with a histogram to make it look rigorous. Refused for a single run; permitted only over a replication batch at or above `MIN_REPLICATION_BUDGET`, where [§ D171](../DECISIONS.md) already governs what may be named. **The difference is determinism, not taste**, and any surface borrowing this idea must state which side of it the numbers came from |

### 6.4 Shapez

| field | |
|---|---|
| **What the player does** | Builds factories that produce required geometric shapes on an effectively unbounded map **[secondary: [Shapez.io Wiki, *Levels*](https://shapezio.fandom.com/wiki/Levels), [Zed Games](https://www.zedgamesau.net/reviews-2/shapez-io-review)]** |
| **What it refuses to do** | **It refuses to constrain.** No time limit, no meaningful resource scarcity, no fail state **[secondary: [SaaSHub](https://www.saashub.com/shapez-io-reviews), [Zed Games](https://www.zedgamesau.net/reviews-2/shapez-io-review)]** |
| **How it teaches** | **One mechanic per level, unlocked by the level that requires it.** 26 predetermined levels, each unlocking a new building — cutter after level 1, rotator after 4, painter after 6, stacker after 10 — with shape requirements that get harder in step **[secondary: [Shapez.io Wiki, *Levels*](https://shapezio.fandom.com/wiki/Levels)]** |
| **How it shows failure** | It does not. *"There's no explicit fail state other than failure to progress to the next level"* **[secondary: [SaaSHub](https://www.saashub.com/shapez-io-reviews)]** |
| **Session length** | Unbounded. After level 26, goals are randomly generated indefinitely **[secondary: [Shapez.io Wiki, *Freeplay*](https://shapezio.fandom.com/wiki/Freeplay)]** |
| **Adopt** | **The unlock is tied to the goal that needs it, not to a clock or a purchase.** `docs/10` § 3.3 already settles progressive disclosure as a rule about **controls** — Basic and Advanced, one product with one state, every Advanced control having a Basic default that is *set* rather than absent. Shapez adds a distinct rule this project has not written down: a **content-sequencing** rule, where the mechanic arrives in the level that cannot be finished without it. That is the shape the Fix-a-building case ladder and the campaign want, and it composes with § 6.2's version of the same idea. Cost: content authoring, no contract change |
| **Refuse** | **The no-fail posture, and the reason is measured rather than aesthetic.** A build with nothing to lose cannot show a saturated queue *as a result*, and R4's argument is that the suppressed run is the best fail state available precisely because it is real, diagnosable, and fixable by exactly the levers the product teaches. Refused by R4 and R8. The cost of the alternative is visible in the source design's own reception — the recurring criticism of the sequel is that it is *"too relaxed, too free of consequences"* **[secondary: [NGOHQ](https://www.ngohq.com/2026/04/23/shapez-2-review/)]** — and this product cannot pay it, because its fail state is its teaching instrument |

---

## 7. The tally

Nine entries, nine adopt verdicts, nine refuse verdicts. #189's criterion of *at least one concrete
practice to adopt and one to refuse per entry* is met; its criterion of *at least six titles played*
is not met as written (§ 3).

| entry | adopt | status of that adoption | refuse | the rule it protects |
|---|---|---|---|---|
| Mini Metro | overcrowding as fail state; the legibility warning | **already adopted** — `docs/10` § 3.1, R4, U4 | delivered-passenger scalar and its ranking | `docs/21` § 6 non-goal 3; `docs/10` § 5.5 |
| SimTower | keep the subject; solve scale by aggregation | **already adopted** — `docs/10` § 3.2, § 6 | per-car micromanagement as the interaction | **no such non-goal exists yet** — proposed, § 9 |
| Project Highrise | the abstraction move as *evidence* the scaling problem is real | **new**, and it is evidence rather than a change | taking the exit — abstracting elevators away | `docs/00-project-brief.md` vision; `docs/10` § 3.2 |
| Factorio | offered demand beside handling capacity | **already adopted** — `docs/10` § 3.5, § 11.W2 | gating information behind progression | R8; `docs/10` § 4's non-negotiable list |
| **Elevator Saga** | win conditions are observations; uncensored worst-case; the **moving objective** | **new** — the moving objective is the only content change proposed | censored mean displayed unconditionally; no seed; pass/fail on one stochastic run | R1, R3; `CLAUDE.md` invariants 2 and 5, R7; R2, R12 |
| Mini Motorways | **the player edits the system, never the vehicle**; the fail state is *located* | **new** as external support; the position is not yet written down | overflow timer as fail state; trips-completed score | R4; `docs/21` § 6 non-goal 3 |
| Two Point Hospital | the mission that needs a mechanic introduces it; difficulty lives in a declared mode | **new** as a content rule; the mode separation already exists | the 1–3 star scalar; income and success-rate modifiers | `docs/21` § 6 non-goal 3; `docs/10` § 5.5's difficulty sentence |
| **Opus Magnum** | **three axes, three histograms, no combined score — shipped** | **new**, and it is the most valuable finding here | the same histogram over a single stochastic run | R2; `docs/10` § 5.5; [§ D171](../DECISIONS.md) |
| Shapez | the unlock is tied to the goal that requires it | **new** as a content-sequencing rule | the no-fail posture | R4, R8 |

**Four of the nine adoptions were already adopted before this teardown was written**, and that is
the honest headline rather than a padding of the count. The teardown's actual yield is five: one
content-authoring idea from Elevator Saga, one from Two Point Hospital, one from Shapez, one piece
of external support from Mini Motorways for a position not yet written down, and one precedent from
Opus Magnum for the non-goal that is hardest to defend.

---

## 8. Where the differentiation actually sits

#189's third acceptance criterion. Stated as three claims, with what supports each.

**1. The refusal is the product, and exactly one comparator was checked against it.** The
differentiator is not fidelity — Elevator Saga has a load factor and a capacity too. It is that this
product will not print a number the run cannot support, and will print the reason in its place (R3,
[§ D64](../DECISIONS.md)). The comparator prints a mean over delivered riders only, unconditionally,
at `world.js:102` **[source]**. That is a verified instance, in the nearest title, of the exact thing
this product refuses.

**2. The player diagnoses rather than programs, and that is a claim about the audience.** Elevator
Saga's skill is writing a controller; this product's is reading a run and changing one thing
(`README.md`'s loop, step 5). The dispatcher being data rather than code (`CLAUDE.md` invariant 7)
is what makes that possible — there is a weight vector to move, so there is something to diagnose
*with*. Whether the second audience is larger than the first is #188's question and is **not**
answered here.

**3. One sentence in `README.md` is not supported by this teardown, and should not be read as
confirmed by it.** `README.md` says *"Step 5 is the whole point, and it is where most tower sims
quietly cheat."* This teardown verified **one** instance of quiet cheating, and it is not in a tower
sim — Elevator Saga is a programming toy. None of SimTower, Project Highrise, Two Point Hospital,
Mini Metro or Mini Motorways was checked for it, and three of them do not publish a comparable
statistic at all. The narrower sentence the evidence supports is: *the nearest comparator publishes a
censored mean, and this product refuses to.* Filed as a request in § 9, not edited — this document
does not own `README.md`.

---

## 9. What this teardown changes

**It changes none of the refusals, and that is a result rather than an absence.** Every one of the
nine refusals in § 7 was already forbidden by a rule on this tree before the teardown was written.
No non-goal is weakened, none is added under pressure, and nothing in the adjacent set suggested a
practice this project has forbidden and should not have. A teardown whose conclusion is *we were
right* is legitimate, and this one's is — for the refusals.

**It changes five things, all of them specifications or evidence, none of them code.** M0 writes no
code.

1. **#186 gains a precedent for its hardest non-goal.** *No scalar score, ever* is normally defended
   by argument against the objection that a mass audience needs one number. Opus Magnum is a shipped
   counter-example: three metrics, three histograms, no combination. Put it in the charter's
   justification for the non-goal, not in a footnote.
2. **#197 (onboarding) gains a worked adversary.** *Why does this thing refuse to show me an average?*
   is the first question a new player asks, and the best available answer is 60 lines of the nearest
   comparator's source. `world.js:102` divides by `transportedCounter`; the panel prints the result
   beside five honest observations; the run may be diverging. That is a better explanation of the
   product's central refusal than any prose about confidence intervals, and it is checkable.
3. **#195 (art direction) gains two references and one non-reference.** Mini Motorways for a
   *located* fail state — the pile is at the building that caused it, not in a status bar — and Two
   Point Hospital for presentation carrying onboarding, already the tree's one existing mention of
   it (`docs/elevator-sim-playtest-report.md` line 34, in a document `README.md` marks as *a report
   rather than a finding*). The non-reference is Mini Metro's cited legibility warning, which
   `docs/10` § 3.1 already carries and which this teardown does not re-argue.
4. **A non-goal is proposed that does not exist.** *The player edits the policy and the building; the
   player never drives a car.* The tree carries no such rule — only a playtest-report observation at
   line 32 of a document with a status. Mini Motorways is external support for it. **This is a
   proposal for #186, and until #186 adopts it, § 4.2's refusal stands on a proposal rather than on a
   rule**, which is why it is marked that way in the tally.
5. **Three content-sequencing ideas that no existing rule covers**, all for the case ladder and the
   campaign: the *moving objective* (Elevator Saga), *the mission that needs a mechanic introduces
   it* (Two Point Hospital), and *the unlock is tied to the goal that requires it* (Shapez). These
   are adjacent to `docs/10` § 3.3's progressive disclosure and are **not** the same rule — § 3.3
   governs which controls are shown, these govern when a capability arrives. Whoever writes #199
   (content plan) and #200 (difficulty curve) owns them.

**And it changes one thing about #189 itself.** Its second premise is refuted (§ 1) and should be
struck before the issue closes; its first acceptance criterion is not met as written (§ 3).

---

## 10. Requests to files this document does not own

Following `docs/21` § 7's convention. Each is a request, not an edit.

⬜ **`README.md`** — the Documentation table wants a row for this file. Owned by the integrator.

⬜ **`README.md`** — § 8 claim 3: *"where most tower sims quietly cheat"* is broader than any evidence
on this tree supports. Either narrow it to the verified instance, or mark it as an unmeasured
assertion. This repository's own standing rule applies to its own front page: *if you write a
sentence about why something performs better, either measure it or say it is unmeasured*
([§ D280](../DECISIONS.md)).

⬜ **GitHub issue #189** — strike the premise *"`docs/10` observes … without saying which lesson or
where"* (refuted, § 1), and record that acceptance criterion 1 is met by a source read and a
documented-behaviour survey rather than by play (§ 3).

⬜ **[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § Q** — the claim that all
five titles *"appear nowhere in the tree"* is wrong by one: Two Point Hospital appears at
`docs/elevator-sim-playtest-report.md` line 34 (§ 1.1). The conclusion is unaffected.

⬜ **[`DECISIONS.md`](../DECISIONS.md)** — a decision number is owed at integration if #186 adopts
either § 9 item 4 (the mid-run control non-goal) or § 9 item 5 (the content-sequencing rules). This
document allocates none; numbers are allocated at integration, never inside a lane
([`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 0).

---

## 11. Sources

Marked per § 3's standard. **[source]** was read in this container; **[secondary]** was surfaced by a
search index and could not be opened here.

**Primary, read at source 2026-08-24** — `magwo/elevatorsaga`, MIT, `master`, upstream last pushed
2022-11-21:

- https://github.com/magwo/elevatorsaga — repository; 2 553 stars, 351 forks, created 2014-08-15
  (GitHub API) **[source]**
- https://raw.githubusercontent.com/magwo/elevatorsaga/master/challenges.js — the five condition
  constructors and all 19 challenge definitions **[source]**
- https://raw.githubusercontent.com/magwo/elevatorsaga/master/world.js — `avgWaitTime` at
  `:99-102`, `maxWaitTime` at `:178`, `_.random` throughout **[source]**
- https://raw.githubusercontent.com/magwo/elevatorsaga/master/index.html — the six-row stats panel
  at `:158-164` **[source]**
- https://raw.githubusercontent.com/magwo/elevatorsaga/master/app.js — the failure feedback string
  at `:189` **[source]**
- https://raw.githubusercontent.com/magwo/elevatorsaga/master/documentation.html — the `init` /
  `update` contract, the elevator methods and the floor and elevator events **[source]**

**Secondary, attributed and not independently confirmed:**

- Mini Motorways Wiki, *Gameplay* — https://mini-motorways.fandom.com/wiki/Mini_Motorways
- The Scientific Gamer, *Thoughts: Mini Motorways* — https://scientificgamer.com/thoughts-mini-motorways/
- Steam, *Mini Motorways* — the overflow timer — https://steamcommunity.com/app/1127500/discussions/0/3191359376161705321/
- autoevolution, *Mini Motorways review* — https://www.autoevolution.com/news/mini-motorways-review-ios-apple-arcade-become-the-ultimate-road-network-planner-167032.html
- Two Point Hospital Wiki, *Hospitals* — the 1–3 star ladder — https://two-point-hospital.fandom.com/wiki/Hospitals
- Two Point Hospital Wiki, *Sandbox Mode* — https://two-point-hospital.fandom.com/wiki/Sandbox_Mode
- SEGA, *Two Point Hospital: Sandbox Mode available now* — https://sega.prezly.com/two-point-hospital-sandbox-mode-available-now-as-a-free-update-on-consoles
- GameFAQs, *Two Point Hospital — Sandbox (PC only)* — the difficulty modifiers — https://gamefaqs.gamespot.com/pc/230622-two-point-hospital/faqs/76595/sandbox-pc-only
- GameSpot, *Two Point Hospital review* — per-mission tutorialisation — https://www.gamespot.com/reviews/two-point-hospital-review-laughter-is-the-best-med/1900-6416981/
- Impulse Gamer, *Two Point Hospital review* — https://www.impulsegamer.com/two-point-hospital-review/
- Steam, *Opus Magnum* — *Statistics "broken up"* — the three separate metrics and the refusal to
  combine them — https://steamcommunity.com/app/558990/discussions/0/1480982971159216710/
- Steam, *Opus Magnum* — *How to record gifs* — the post-solve screen and its histograms — https://steamcommunity.com/app/558990/discussions/0/3110269850323895741/
- Wikipedia, *Opus Magnum* — https://en.wikipedia.org/wiki/Opus_Magnum — *reached only through a
  search index; the page could not be opened from this container*
- Shapez.io Wiki, *Levels* — the 26 predetermined levels and their unlocks — https://shapezio.fandom.com/wiki/Levels
- Shapez.io Wiki, *Freeplay* — https://shapezio.fandom.com/wiki/Freeplay
- SaaSHub, *shapez.io reviews* — *"no explicit fail state other than failure to progress"* — https://www.saashub.com/shapez-io-reviews
- Zed Games, *Shapez.io review* — https://www.zedgamesau.net/reviews-2/shapez-io-review
- NGOHQ, *Shapez 2 review* — the *too relaxed, too free of consequences* criticism — https://www.ngohq.com/2026/04/23/shapez-2-review/

**Sources this document does not restate**, because `docs/10` § 15 already carries them: the Mini
Metro, SimTower/Project Highrise, progressive-disclosure, natural-frequency and IPCC-calibrated-
language sets — 13 entries at lines 2402–2419.

**Internal:** [`CLAUDE.md`](../CLAUDE.md) invariants 2, 5 and 7 and § *Statistical discipline*;
[`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) §§ 1, 3, 4, 5.5, 6, 11;
[`docs/21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 6;
[`docs/00-project-brief.md`](00-project-brief.md) § Vision;
[`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
§§ 5–7; [`docs/elevator-sim-playtest-report.md`](elevator-sim-playtest-report.md) lines 32 and 34,
read with the status [`README.md`](../README.md) assigns it;
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M0;
[`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) §§ 0 and 8;
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § Q;
[§ D64](../DECISIONS.md), [§ D106](../DECISIONS.md), [§ D171](../DECISIONS.md),
[§ D227](../DECISIONS.md), [§ D280](../DECISIONS.md), [§ D299](../DECISIONS.md).

---

*Written against `aac8d17`. Every internal claim was checked against the tree at that commit; every
external claim carries a mark saying whether it was verified at source, attributed to a page that
could not be opened here, or not checked at all.*
