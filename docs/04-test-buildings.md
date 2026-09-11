# Test Buildings

Nine reference buildings, each chosen to stress a different aspect of the dispatcher.
Machine-readable configs in [`data/buildings/`](../data/buildings/).

The first five are the original set. The next three were added later and each closes a gap the
first five could not pose: a traffic profile with no building, a demand with no dominant direction,
and a bank whose cars are not alike. The ninth is a different kind of thing again — a **reference**
rather than a scenario, added to give the engine, the closed form and the stage something at the top
of the size range to be measured against.

**A new building owes a row in this table, a numbered section below, and a row in
[`data/buildings/README.md`](../data/buildings/README.md) — and that is now a test rather than a
convention.** `packages/experiments/src/validation/buildingRegisters.test.ts` reads
`data/buildings/*.json` off disk and asserts both registers against it in both directions. It
matches on each section's `**Config:**` link, never on the heading, so a renamed title cannot
satisfy it. The rule exists because both registers sat one building stale for two waves and nothing
failed: *checkable by looking* is not checkable.

| Name | Floors | Bank config | Zones | Stress case |
|---|---|---|---|---|
| [Garden Apartments](../data/buildings/garden-apartments.json) | 6 | 2 × hydraulic, 0.63 m/s, 1,600 lb | none | Sparse traffic, long idle, parking policy |
| [Midtown Office](../data/buildings/midtown-office.json) | 20 | 4 × geared, 2.5 m/s, 2,500 lb | lobby + garage | Classic up-peak, interval target |
| [Secure Tower](../data/buildings/secure-tower.json) | 30 | 6 × gearless, 4 m/s, 3,000 lb; low 1–15 / high 1, 16–30 | 4 tenant zones + exec | Access control × dispatch interaction |
| [Mixed-Use High-Rise](../data/buildings/mixed-use-high-rise.json) | 60 | 4 shuttle @ 8 m/s → sky lobby 31; 2 local banks | retail 1–5, office 6–30, resi 32–60 | Overlapping peaks, transfer modeling |
| [Vertical City](../data/buildings/vertical-city.json) | 100 | Double-deck shuttles, 3 sky lobbies | 6 zones | Double-deck, even/odd assignment |
| [Chancery House](../data/buildings/chancery-house.json) | 19 | 6 × gearless, 5 m/s, 3,000 lb | none | Prestige service level on an oversupplied bank |
| [Crown Hotel](../data/buildings/crown-hotel.json) | 24 | 4 × gearless 3 m/s + 1 × geared 1.75 m/s service | back of house | Two-way demand, unlike cars, a single-floor crowd |
| [St Jude Hospital](../data/buildings/st-jude-hospital.json) | 13 | 3 × gearless 2.5 m/s + 2 × geared 1.75 m/s bed | clinical + diagnostics | Never off-peak, bed cars, the first shipped stair |
| [Burj-class reference tower](../data/buildings/burj-class-reference.json) | 165 | 16-car single-deck shuttle @ 10 m/s, 4 locals (10/10/11/8), 2 double-deck observation | none | Scale: 57 cars, 3 sky lobbies, what the engine and the stage cost at the top of the range |

---

## 1. Garden Apartments

**Config:** [`garden-apartments.json`](../data/buildings/garden-apartments.json)

Six floors, two hydraulic cars, no zoning. Deliberately boring on paper — and it is the
building where **parking policy dominates**. Traffic is sparse enough that a car's idle
position matters more than any assignment cleverness.

> **It is NOT the speed negative control, and this section said it was.** The retracted claim was
> that faster elevators "demonstrably do not help" here "because travel distances are too short for
> the car to ever reach rated speed". Both halves are measurably false. Run through the repo's own
> `buildProfile`, a 3.0 m one-floor hop at `v = 0.63`, `a = 0.6`, `j = 0.8` comes back
> `kind = speedLimited` — the car *does* reach rated speed — and raising rated speed from 0.63 to
> 1.00 m/s cuts that hop from **6.562 s to 5.417 s** (−17.5 %) and the 15 m full-rise run from
> **25.610 s to 17.417 s** (−32.0 %). A test written to the old claim would pin a bug, which
> `data/buildings/garden-apartments.json`'s own `notes[1]` already warned about while this document
> did not. The governing quantity is floor pitch against `v²/a`, the distance needed to reach rated
> speed: Garden's 0.63 m/s hydraulic needs 0.66 m against a 3.0 m pitch and spends most of a hop at
> rated speed. [Review finding #3](08-review-findings.md).
>
> **The genuine negative control is Midtown Office.** `buildProfile(3.8, {v: 2.5, a: 1.0, j: 1.4})`
> is `accelerationLimited`, and raising `v` to 4.0 leaves the hop at **4.678 s, unchanged**: a
> 2.5 m/s car needs 6.25 m to reach rated speed against a 3.8 m pitch, so it never gets there. This
> is the direction [`CLAUDE.md`](../CLAUDE.md) § modelling rules warns about — *short hops never
> reach rated speed* — and it is a property of a fast car in a tight building, not of a slow one.

**Watch for:** whether the dispatcher wastes energy repositioning during dead hours.

## 2. Midtown Office

**Config:** [`midtown-office.json`](../data/buildings/midtown-office.json)

Twenty floors, four geared traction cars, a lobby and a garage entrance (two distinct
ground-level origins, which breaks naive single-lobby assumptions). This is the classic
up-peak sizing problem and the primary building for **validating against the analytical
round-trip-time baseline**.

**Watch for:** simulated interval and handling capacity matching the closed-form
calculation within a few percent under pure up-peak.

## 3. Secure Tower

**Config:** [`secure-tower.json`](../data/buildings/secure-tower.json)

Thirty floors, six gearless cars split into a low bank (1–15) and a high bank (1, 16–30),
with four tenant access zones plus a restricted executive floor. Every one of the three
zoning concepts is active here simultaneously — service, access, and operational.

**Watch for:** access-control checks must not become a dispatch bottleneck, and the
dispatcher must never assign a passenger to a car that cannot legally or physically serve
their destination.

## 4. Mixed-Use High-Rise

**Config:** [`mixed-use-high-rise.json`](../data/buildings/mixed-use-high-rise.json)

Sixty floors: retail 1–5, office 6–30, residential 32–60, with a sky lobby at floor 31
served by four 8 m/s shuttles plus two local banks. **This is the main event.** Office
down-peak and residential up-peak overlap around 18:00 and compete for the same shuttle
capacity — a genuinely hard, genuinely realistic scheduling conflict where a predictive
dispatcher should visibly beat reactive ones.

**Watch for:** transfer modeling at the sky lobby (passengers become new arrivals at the
transfer floor, and their total journey time spans two trips). Time-to-destination, not
average waiting time, is the metric that matters here.

## 5. Vertical City

**Config:** [`vertical-city.json`](../data/buildings/vertical-city.json)

One hundred floors, double-deck shuttles, three sky lobbies, six zones. The supertall
case. Double-deck introduces even/odd floor assignment: the two decks serve adjacent
floors simultaneously, so the dispatcher must pair calls that are one floor apart.

**Watch for:** this is the most likely candidate to be deferred past v1. The double-deck
model is a substantial addition and the other four buildings cover most of the algorithmic
ground.

> **Double-deck operation is configured, validated, and NOT simulated — and every run now says so.**
> `data/buildings/vertical-city.json` declares eight shuttles with `doubleDeck: true`,
> `deckSeparationM: 4.5`, `ratedLoadLbPerDeck: 2000` and four `servesFloorPairs`. `loadConfig`
> resolves all of it and builds a full `Bank.deckByFloorId` index; `Car` has no deck concept, so the
> runtime runs each shuttle as a single-deck car and makes up to eight separate stops where the
> declared hardware makes four paired ones. **Every shuttle-bank round-trip time, interval and
> handling-capacity figure this simulator reports for Vertical City is therefore for hardware nobody
> configured.** The config layer used to validate the pairing carefully enough to look wired and then
> go silent, and silence reads as "modelled". It now raises `double-deck-not-simulated` naming the
> building and the bank, `Simulation` raises the same statement into `result.warnings`, and
> `RunRecord` carries it so a stored run keeps the disclaimer. **Still not implemented as of
> 2026-07-28, and no longer inside a live phase:** Phase 6 split into 6a / 6b / 6c
> ([`DECISIONS.md` § D28](../DECISIONS.md)) and double-deck belongs to none of the three. It is
> deferred scope named in [the roadmap](05-roadmap.md) § Phase 6, which is where it now lives.
> [Review finding #11](08-review-findings.md); [`DECISIONS.md` § D11, § D22, § D23](../DECISIONS.md).

---

## Modeling notes

- **Population** drives arrival rates as a percentage of occupants per 5 minutes.
  Each building config declares per-floor population.
- **Multiple ground-level entrances** (lobby + garage) are common and break the
  single-source assumption baked into naive up-peak reasoning. Midtown Office includes
  this deliberately.
- **Transfer floors** (sky lobbies) require passengers to be re-injected as new arrivals
  at the transfer floor while retaining their original journey identity, so
  time-to-destination can be measured end to end.

---

## 6. Chancery House

**Config:** [`chancery-house.json`](../data/buildings/chancery-house.json)

Nineteen floors, six fast cars, no zoning, and 612 people — the smallest population of any office
here on the most demanding service level. It exists because **`office-prestige` was declared in
[`data/traffic-profiles.json`](../data/traffic-profiles.json) from Phase 1 and used by no shipped
building**: a schema-valid profile reachable from nothing, which is the shape
[`DECISIONS.md` § D112](../DECISIONS.md) found in `destination-eta`, one level up in `data/`.
Invariant 7 makes strategy data; it does not exempt data from having a caller.

What the profile asks for is the inverse of Midtown Office: 16 % of population per five minutes
against 12, a 25 s target interval against 30, a 20 s target wait against 25 — a **harder service
level on a smaller population**. The bank is oversupplied on purpose. The interesting question at a
headline address is not whether the lifts cope but whether a dispatcher can hold a 25 s interval
*while it has spare cars*, which is decided in stage 7 (repositioning) rather than stage 2.

**Watch for:** whether spare capacity is parked where the next burst will be, and what it costs in
energy to keep it there.

## 7. Crown Hotel

**Config:** [`crown-hotel.json`](../data/buildings/crown-hotel.json)

Twenty-four floors over a back-of-house basement, and the first shipped building to declare `hotel`
at the **building** level — until now the profile reached the simulator only through one floor range
of Vertical City, so every hotel figure this project had published described a hotel *stratum inside
an office tower*.

Two things here exist nowhere else. Its demand has **no dominant direction** — `governingPeak:
two-way`, a 40/40/20 split, and a mean group size of 2.0 against the offices' 1.4 — which is the
traffic `collective`'s `noDirectionReversal` hard constraint is least suited to, and the benchmark
gate has never had a cell that says so. And its bank holds **five unlike cars**: four guest cars at
3,000 lb and 3.0 m/s beside one service car at 4,000 lb and 1.75 m/s.

The 120-person ballroom on floor 2 is a deliberate single-floor crowd source — an office down-peak
arrives from everywhere, and a conference breaking arrives from one landing. Pair it with the
`evening-egress` demand template, which steps rather than ramps.

**Watch for:** whether a direction-constrained dispatcher is worse than an unconstrained one here,
and whether the slow service car gets sent to hall calls it should not.

## 8. St Jude Hospital

**Config:** [`st-jude-hospital.json`](../data/buildings/st-jude-hospital.json)

Thirteen floors and 986 people, and the only building here that never has an off-peak. Its demand is
two-way for eighteen hours a day and its peaks are **shift changes** rather than a morning arrival,
so it ships with its own `hospital` traffic profile and is meant to be run against the
`shift-change` template — the only one with two interior peaks and a trough the building never
empties into.

Three firsts. The bank holds **two bed cars** at 4,000 lb and 1.75 m/s beside three public cars at
3,500 lb and 2.5 m/s, so a dispatcher has only speed, capacity and transfer time to tell them apart
— whether it learns to leave them alone for an ordinary hall call is measurable, and no other
building can ask it. It is the **first shipped building to declare a `stairs` transport mode**, so
the asymmetric-propensity model of [`docs/14` § 3.3](14-building-behaviour-contract.md) finally has
a caller in `data/` rather than only in a test fixture. And the entrance is **not** the only crowd
source: Outpatients on floor 1 holds 180 people, so a clinic ending sends a burst *downward from an
intermediate floor*, a shape neither an office up-peak nor a residential down-peak produces.

**Named limitation:** the bed cars carry no per-car transfer time. The model has no notion of a bed
as an indivisible unit, so every derived bound multiplies a car's transfer time by its full person
count — a 26-person bed lift at an authored 3.0 s produces an 84.5 s loading bound describing a
journey no bed lift makes. The heterogeneity that *is* modelled is speed and capacity.

**Watch for:** whether the bed cars are wasted on visitor traffic, and how much load the single
stair takes off the lifts.

## 9. Burj-class Reference Tower

**Config:** [`burj-class-reference.json`](../data/buildings/burj-class-reference.json)

A hundred and sixty-five levels — two basements, ground, and floors 1–162 — with **57 cars in six
banks** and speeds to 10 m/s: a 16-car single-deck sky-lobby shuttle stopping at G and the lower
level of each two-level sky lobby (43, 76, 123), four locals of 10, 10, 11 and 8 cars, and two
double-deck observation cars serving G/1 and 123/124. About 1.6× the floors and the cars of Vertical
City, which was the tallest thing this tree had run.

**Corrected against its operator by GitHub issue #438** ([§ D545](../DECISIONS.md)), with every
chosen figure in the correction **drafted for the owner's approval**, which the owner approved as drafted on 2026-09-11. As first
authored the file had a 14-car double-deck shuttle, offices on 2–75 with residential above, and
4.0 m floors that put level 124 at 496 m. No source read gives the sky lobbies a double-deck shuttle —
the real tower's two double-deck cars serve the observation deck (Otis, 2024; Al-Kodmany, 2015) —
Emaar's fact sheet stacks the Armani Hotel low, the residences through the middle and the Corporate
Suites at 112–121 and 125–154, and Emaar puts observation level 124 at 452 m. The file now follows
all three. The 3.645 m floor, the per-use densities, the shuttle's stops and the observation pair at
123/124 are the agent's proposals, and the building's `$comment` gives the reasoning for each.

**It is a *reference*, not a scenario, and that is the whole of why it is here.**
[§ D527](../DECISIONS.md)'s point is that *"the reference is a floor, not a ceiling"* — the product
is sized against the largest real building rather than against the largest one already in `data/` —
and that it may not be called carried until it has been **measured**. Every other section
above names a dispatch problem; this one names a scale, and the interesting results are about what
the engine, the closed form and the stage do when handed one.

**The population is an assumption, not a citation, and the file says so on its own face.** No
published occupancy for the reference tower was available when it was authored, and the two figures
#438 found are recorded in the file as checked and not admitted. `totalPopulation: 3198` was published
as what this arrangement serves with a valid AWT, bracketed over a 1,800 s window at seed 376 under
`collective`: 3,198 people giving a 35 s mean wait and a 98 s 95th percentile, 5,307 saturating and
10,614 leaving 422 of 4,457 journeys unserved. **Those figures do not reproduce** — not on the tree
that landed the file (`63a9521`), nor on the parent of #438's correction, where the harness now
pinned in `packages/viz/src/record/burjOperator.test.ts` gives 23.6 s and 67.6 s over 1,284 journeys
at 3,198, saturation at 5,307, and 487 of 4,473 undelivered at 10,614. The verdicts agree and the
figures do not, and which run produced the published ones is not established. Seed 376 was also a
favourable seed for that arrangement: over seeds 376–425 it saturated at 3,198 on **16 of 50**.

**Re-measured on the corrected arrangement** — same seed, window and dispatcher, every floor's
population scaled in proportion:

| people | journeys | mean wait | 95th percentile | undelivered | AWT at seed 376 | saturated, seeds 376–425 |
|---|---|---|---|---|---|---|
| 3,198 | 989 | 11.4 s | 32.9 s | 0 | valid | 1 of 50 |
| 5,307 | 1,646 | withheld | withheld | 0 | suppressed — saturated | 37 of 50 |
| 10,614 | 3,473 | withheld | withheld | 30 | suppressed — saturated | 50 of 50, undelivered on 32 |

The seed-376 rows are pinned in `burjOperator.test.ts`; the last column is
`burjOperator.sweep.test.ts` under `BURJ_BRACKET_SWEEP=1`. **No AWT interval is published at any of
the three**, because each saturates on at least one seed. Read the journey counts beside the waits:
the same 3,198 people make 989 journeys in the window rather than 1,284, because most of them now
arrive on the `residential` and `hotel` profiles rather than on `office-standard`, so the corrected
arrangement carries less demand as well as different demand, and no share of the change in wait is
attributed to either. A higher published occupancy would still say something about the real tower's
lift count on this arrangement, which is what a reference building exists to expose. Do not restate
the figure as though it were sourced.

**There are no service lifts, and that is a finding about the model rather than a simplification.**
Five were declared at first. While they served the passenger lobby they were the only banks spanning
the entrance to the top, so the dispatcher never had to transfer anybody: the fourteen shuttle cars
carried **zero** legs while `service-high`'s two carried 277 of 827 at a **624 s** mean wait, at 1.03
legs a journey against Vertical City's 1.65. Moved to the loading dock they still overlapped every
local, and `config/buildingConnectivity.test.ts` requires every floor served by more than one bank to
be a declared transfer floor — which would have made **148 of 165 floors** transfer floors and
emptied the concept. This model has no notion of a staff-only bank; `accessZones` gates floors, not
banks. The honest shape is a building without them.

**Escalators are declared four where the reference has eight**, for the reason
[`data/buildings/README.md`](../data/buildings/README.md) gives: a declared mode with zero hops is a
dead field. Routed over every one of the 27,060 ordered floor pairs, all are reachable and **832 hops**
are taken across the four declared edges — 164, 266, 238 and 164 on the arrangement GitHub issue #438
corrected, and 28 (6, 8, 8 and 6) before it — which is that same README's *"if you add a
mode, add its measured hop count beside it"*. With a *pair* at each landing, four of the eight took
**zero** hops, because as modelled an escalator is an undirected, uncapacitated edge and the second of
an identical pair can never be chosen. One edge per landing is declared and the finding recorded,
which is the evidence § D527 wanted before anybody adds capacity or direction.

**What is pinned**, in `packages/viz/src/record/burjReference.test.ts` — four of § D527's five
measurements; the fifth is the stage's drawing and belongs to GitHub issue #377:

| case | what it holds |
|---|---|
| *is the shape § D527 names* | 165 floors, 57 cars, a fastest car at 10 m/s, and **zero loader warnings** — the bar the other eight meet |
| *runs a full day without aborting* | 3,600 s at seed 376 under `collective`: 0 undelivered, `awtIsValid`, and a recording **measured at 17.36 MB** as first authored and **16.42 MB** since GitHub issue #438, asserted as a ceiling because it is the first thing here that could be too big to post to a worker |
| *costs a bounded wall clock per replication* | **1.33–1.38 s per 3,600 s replication on an Apple M1 Max** (10 cores, 32 GB, Node v26.5.0) as first authored, and **0.72–0.84 s** on the same machine since GitHub issue #438, three runs in a later sitting, so the two ranges are not a controlled comparison. Asserted only as a generous ceiling — a test-cost figure is a claim about a machine ([§ D483](../DECISIONS.md)) |
| *routes every floor pair* | all 27,060 pairs reachable, no declared escalator with zero hops, and **832 hops** across the four edges (164, 266, 238, 164; 28 before GitHub issue #438) |

That wall-clock figure is the one to carry away: the live re-simulate-on-press path is comfortable at
~1.4 s, and 50–200 replications behind a published interval is **~2.3 to ~4.6 minutes serially** at
this size, so anything replicated here wants fan-out rather than a loop.

> **Three things about this building that a reader must not have to discover.**
>
> **The closed-form oracle does not cover it — all six banks refuse.** `shuttle` and `observation`
> throw on a zero served population; `local-lower`, `local-zone1`, `local-zone2` and `local-zone3`
> all throw `departureGapBracket` — the longest door reopen, **37.00 s**, is not shorter than the
> shortest round trip (32.32 s for `local-lower`, **29.34 s** for the three zones, on
> GitHub issue #438's 3.645 m floors; 32.83 s and 29.68 s on the 4.0 m floors before it).
> `packages/experiments/src/oracle/remainingBuildings.test.ts` carries it in `OWED_ELSEWHERE` and
> asserts the refusal on every bank rather than restating it. So the correctness oracle
> [`CLAUDE.md`](../CLAUDE.md) describes is **not** available here, #376's third criterion is open,
> and whoever takes it should expect to change the apparatus or the building rather than to run a
> measurement that is waiting. **The inference *internally uniform banks, therefore coverable* is
> refuted** by a row in that same file: St Jude Hospital refuses on the same bracket with a
> heterogeneous bank, so the bracket is not about heterogeneity at all.
>
> **The stage cannot draw it.** Measured on the shipped bundle
> ([`docs/12`](12-design-handoff.md) § 4.16): **35 legible floors at 1280 × 800 and 40 at
> 1440 × 900**, of 165 — roughly four fifths of the tower is off the stage at any moment, and the
> camera's three band positions are fixed rather than aimable. *Make the canvas taller* is not
> available: a legible pitch needs about **2,160 px** against a 900 px viewport, so there is no
> viewport this fits in and the fix cannot be geometry.
>
> **It is reference-only, not playable.** It has no Career contract:
> `packages/viz/src/shift/contracts.test.ts` holds it in `REFERENCE_ONLY`, and both
> [`data/campaign.json`](../data/campaign.json) and `packages/viz/src/shift/contracts.ts` carry
> **eight** buildings, not nine. Authoring a ninth contract — a month of goals, pay and difficulty
> for a 165-floor tower — is design work with an owner, and #376 says in terms that *which mode
> first uses the building* is not its decision to make. A contract for it would remove it from that
> set, which is the direction this is meant to move in.

**Watch for:** what a run costs before what a run scores. This is the building where the honest
answers are about apparatus — whether a replication budget is affordable, whether a screen can show
the result, and whether the closed form can check it — and it is the one place in this table where
*we cannot measure that here* is the finding rather than an omission.
