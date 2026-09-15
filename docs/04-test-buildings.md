# Test Buildings

Seventeen reference buildings, each chosen to stress a different aspect of the dispatcher.
Machine-readable configs in [`data/buildings/`](../data/buildings/).

The first five are the original set. The next three were added later and each closes a gap the
first five could not pose: a traffic profile with no building, a demand with no dominant direction,
and a bank whose cars are not alike. The ninth is a different kind of thing again — a **reference**
rather than a scenario, added to give the engine, the closed form and the stage something at the top
of the size range to be measured against. The tenth and eleventh are the two buildings
[`docs/37` § 7.3](37-content-plan.md) says the content plan owes, and they close two more gaps: a
group that **cannot cope with its own crowd**, which no shipped tower was authored to be, and a
tower with floors **below the datum** that only one of its cars reaches.

**The twelfth, thirteenth and fourteenth are three more *reference* towers**, GitHub issues #425,
#424 and #430, and each carries one thing the shipped set had never held: a car that is **not one
speed** (20 m/s up, 10 m/s down), a car at the **top of the speed catalogue** (20.5 m/s, where
everything before it stopped at 10), and a supertall with **one sky lobby instead of three**, so the
Burj-class tower's population assumption finally has something to be compared against. All three are
named in this repository's convention — `<name>-class-reference`, `burj-class-reference`'s — because
the real building is the reference and the figures in the file are the project's own.

**The fifteenth, sixteenth and seventeenth are three more, and they are the first that are not all
supertalls** — GitHub issues #428, #427 and #426. One-WTC-class is the **second building Phase 6a/6b
has ever been measured on**, which is what turns § D100's accepted result into a finding rather than
a cell. Empire-State-class is a **1931 relay**: eight banks, no express anywhere in it, and a top
reached by changing lifts twice — and it is the only building in the set that carries a **published
external distance figure** for the energy proxy to be compared against. Willis-class is the other
double-deck arrangement, the older and commoner one: sixteen double-deckers running as the
**locals**, pairing every floor in their zone at 1970s speeds, where the two shipped double-deck
banks before it were both supertall shuttles.

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
| [Harbour Point](../data/buildings/harbour-point.json) | 16 | 6 × geared, 2.5 m/s, 2,500 lb, side-opening | none | Demand above the group's handling capacity: the mean is suppressed rather than quoted |
| [Ashgate Mixed-Use](../data/buildings/ashgate.json) | 22 | 4 × geared 2.5 m/s (G–19); 1 × MRL 1.6 m/s, 3,500 lb (B2–G) | service zone, car park | Negative-index floors, and a service restriction that makes most journeys two legs |
| [CTF-class reference tower](../data/buildings/ctf-class-reference.json) | 112 | 8-car shuttle at **20 m/s up / 10 m/s down**, pressurised; 4 locals (8/8/6/6) | 3 sky lobbies | **Directional speed asymmetry** — the only shipped bank the closed form must refuse on `symmetric-speed` |
| [Shanghai-class reference tower](../data/buildings/shanghai-class-reference.json) | 129 | 14-car shuttle at **20.5 m/s**, pressurised; 4 office locals of 20, a hotel bank of 12 | 4 sky lobbies | **106 cars**, and whether the top of the speed catalogue is ever reached on a hop short enough to matter |
| [Merdeka-class reference tower](../data/buildings/merdeka-class-reference.json) | 119 | 34 low locals at 8 m/s **straight off the street**; 18 shuttles at 10 m/s; 32 high locals; 8 hotel | 1 office sky lobby | **Fewer transfers over a similar rise**, and a second supertall occupancy to compare the first against |
| [One-WTC-class reference tower](../data/buildings/one-wtc-class-reference.json) | 104 | 8-car shuttle at 10 m/s; 2 low/mid locals of 16; 2 high locals of 14; 5-car observatory express | **two-level** sky lobby at 64/65 | **A second building for destination dispatch**, and an escalator that carries an eighth of the tower's rides |
| [Empire-State-class reference tower](../data/buildings/empire-state-class-reference.json) | 102 | 6 ground banks of 10 (2.5–6.1 m/s), a 7-car relay to 86, a 6-car relay to 102 | relay lobbies at 80 and 86 | **A relay with no express at all**, and the energy proxy against a published annual car distance |
| [Willis-class reference tower](../data/buildings/willis-class-reference.json) | 108 | 16 double-deck **locals** at 2.5 m/s over two zones; 2 express banks of 16 at 8.1 m/s; 46 upper locals; 10-car Skydeck express | two two-level sky lobbies | **Double-deck as the local service** at 1970s kinematics, where floor parity decides the deck |

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

## 10. Harbour Point

**Config:** [`harbour-point.json`](../data/buildings/harbour-point.json)

Sixteen floors, 1,560 people and one bank of six identical cars — **the simplest building in
[`data/buildings/`](../data/buildings/), and the only one that cannot serve its own occupants.**
GitHub issue #500; [`docs/37` § 7.2](37-content-plan.md) authors it because no tower in the shipped
forty holds that role, and the vendored `ENGINE_CONTRACT.md` § 12.3 gives the shape: *16 floors ·
6 lifts · more demand than the group can clear, whatever you do.*

**Everything else about it is deliberately uninteresting.** One entrance, one zone, no credential,
no transfer, no car unlike its neighbours, a uniform 104 people a floor and a uniform 3.7 m pitch.
That is the point: on every other building here the dispatcher's problem is structural, and the
finding could always be attributed to the structure. Here there is nothing to attribute it to
except the arithmetic between the crowd and the group.

**The over-subscription is measured on both sides.** The closed form gives the bank a handling
capacity of **155.0 persons / 5 min**, which is **9.94 %** of the population it serves, against the
`office-standard` profile's typical 12 % per 5 min of which 0.85 is incoming — **10.2 % offered
against 9.94 % carried**, before a dispatcher makes a decision. Run rather than reasoned: over the
**thirteen shipped dispatcher profiles × five seeds** (20 260 824 + 7 919 n) at 1 800 s, **64 of 65
runs report a diverging queue and have the mean wait suppressed**.

**The sixty-fifth is worth more than the sixty-four.** `zoned-uppeak` at seed 20 276 662 comes back
`awtIsValid: true` and publishes a quotable **278.8 s** mean with **88 %** of arrivals over the
long-wait threshold and a queue rising at 12.3 persons a minute. That is the trend test's own
scatter ratio failing to clear rather than a run that coped, and it is exactly the shape
[`CLAUDE.md` § Statistical discipline](../CLAUDE.md) warns about: *neither gate sees a queue that
grew enormously and drained just in time.* **No AWT is published for this building**, and none may
be.

**The population is 1,560 and not eleven hundred, and that is a measurement rather than a
preference.** `GAMEPLAY_AND_NAVIGATION.md` § 10.5's fix case reads *"One start time for eleven
hundred"*. Measured, eleven hundred does not hold the § 12.3 why line. The same building scaled to
0.7 — 1,095 people — was run over the identical grid of thirteen profiles × five seeds, and only
**27 of 65** runs saturate: **38 of 65 publish a quotable mean**, against 1 of 65 at the shipped
population. A tower authored to the fix case's figure would ship with a *why* line its own runs
refute on more than half of them. [`docs/12` § 4.4](12-design-handoff.md)'s rule that **the file
wins** is applied to a population here, and the departure is recorded rather than absorbed — the
fix case is GitHub issue #233's and carries its own figure.

**The closed-form oracle reaches it with no caveat at all.** `analyzeUpPeak` raises no warning on
this bank — one entrance, one zone, six identical cars, uniform populations, uniform pitch, no
express run — so it is the **second** shipped bank the Barney/CIBSE round trip describes without
one, beside Chancery House's. Reconciled in
`packages/experiments/src/oracle/remainingBuildings.test.ts` at 64 replications from seed 810 000:
raw divergence **+28.63 %**, residual **−0.14 %** once the two documented omissions are restored,
`explained` against a 4 % tolerance.

**Playable, and let at three fifths to be so.** The Career contract `c9` hands the player the tower
at `occupancy: 0.60` — **930 desks**, which is the stat line `ladderTowersOf` draws once each floor is rounded — because a day nobody can pass teaches nothing;
[`data/contract-ladder.json`](../data/contract-ladder.json) carries the rung and its bracket, and
the measured day-1 miss rate there is **0.42 of 50 seeds**, inside `docs/33` DC-4's band. **The
building as built is what this section is about; the scenario is a let of it.**

**Not in the proof set.** The owner ruled on 2026-09-10 (GitHub issues #500 and #419) that it stays
out of the bench's forty so every rating stays comparable, so [`docs/37` § 7.3](37-content-plan.md)'s
proposed swap is settled in the refusing direction.

**Watch for:** which dispatcher loses more slowly, and whether the screen ever quotes a mean it
should be withholding. This is the building where the *refusal* is the output.

## 11. Ashgate Mixed-Use

**Config:** [`ashgate.json`](../data/buildings/ashgate.json)

Twenty-two floors — two car-park decks at **index −2 and −1**, a ground of shops, three more retail
floors and sixteen floors of offices — with **five cars in two banks, and only one of them reaching
the car park.** GitHub issue #501; [`docs/37` § 7.3](37-content-plan.md) specifies it and the
vendored `ENGINE_CONTRACT.md` § 12.3 gives the shape: *22 floors · 5 lifts · offices over shops, and
a car park below.*

**It is the only shipped building whose `servesFloors` restriction changes how many legs a journey
takes**, and that is measured rather than asserted — [§ D265](../DECISIONS.md)'s rule that a
restriction no rider ever needs is a dead seam. On seed 20 260 824 at 1 800 s under `collective` the
run draws **244 journeys and 381 legs**; 135 of those journeys begin in the car park and **every one
takes exactly 2.000 legs**, transferring at G. Give bank `main` the two basement floors as well —
the repair `GAMEPLAY_AND_NAVIGATION.md` § 10.5 case 6 names — and the **same 244 journeys take 244
legs**, no journey takes more than one, the mean time to destination falls **195.3 s → 150.8 s** and
the mean wait **rises 38.5 s → 50.2 s**, because the four tower cars now answer the car park too.
Two further seeds reproduce it (383 against 246, 353 against 217). The journey counts are identical
on both arms, so what moved is the routing and not the demand — **and that comparison is a run this
suite keeps, not a figure in a document**:
`packages/core/src/sim/serviceZoneSeam.test.ts` is the instrument, always on, and it asserts the
*relation* rather than the three integers, so a traffic-profile edit that leaves the restriction
binding does not fail it and an edit that stops it binding does.

**Why two banks rather than one restricted car.** `servesFloors` is declared per *bank*, so *one of
five cars reaches B1–B2* is only expressible as a bank of one. It is also the physically honest
arrangement: a shaft reaching both B2 (−7.2 m) and floor 19 (+72.7 m) is a **79.9 m** rise, past
`geared-traction`'s 76 m `maxRiseM` — the counterfactual arm above raises `rise-exceeds-class` and
the shipped building raises no loader warning at all. A car-park lift is a separate, slower machine
because one machine cannot do both.

**G is a transfer floor** because it is the only floor both banks serve, and
`config/buildingConnectivity.ts` requires the flag before it will route a journey across them —
`mixed-use-high-rise` declares its ground the same way for the same reason.

**The car-park share is a consequence, not an authored figure.** § 10.5 says the car park is what *a
third of the building arrives through*. **That share is not expressible in a building document**:
`traffic/generator.ts` weights entrances equally unless a run passes `entranceWeights`, which is a
field of `SimulationDemandOptions`. Three declared entrances therefore means a third of incoming
demand each, and measured, **135 of 244 journeys (55 %)** begin in the car park. The alternative —
declaring one basement an entrance and leaving the other a served floor nobody ever calls from or
to — is the dead-seam shape § D265 refuses, so the share is recorded rather than approximated.

**Every car states its own `passengerTransferS`, and states the same one.** The loader has no
`mixed-use` row and refuses to default
([`data/buildings/README.md`](../data/buildings/README.md) § Passenger transfer time), so all five
cars declare **1.2 s**, the office row. That is a claim rather than a shrug: this building's whole
population is people at work — shop staff and office staff — so one figure really does describe
every car, unlike `mixed-use-high-rise`, where a residential bank loads at 1.75 s against an office
bank's 1.2 s.

**The closed form reaches one bank and refuses the other, and both verdicts are measured.** `main`
reconciles — raw **+31.21 %**, residual **−0.26 %**, `explained` against a 4 % tolerance at 64
replications from seed 810 000 — with three declared departures from the model
(`nonUniformFloorPopulations`, `nonUniformInterfloorDistance`, `expressZone`), all three of which are
the building being mixed-use rather than defects. `carpark` is **refused**: `analyzeUpPeak` throws
because the bank serves no populated floor above its terminal, which is true — it lifts people from
two unpopulated parking decks to a transfer floor, and an up-peak round trip to a zone with no
occupants is not a quantity the Barney/CIBSE expression has.

**Playable as built.** The Career contract `c10` moves only the crowd — 13.5 % of population per
5 minutes, inside `office-standard`'s declared 11–15 band — and leaves the fabric alone, because
taking a car away or adding one would delete or dissolve the thing the scenario is about. Measured
day-1 miss rate **0.52 of 50 seeds**, inside `docs/33` DC-4's band.

**Not in the proof set**, on the same 2026-09-10 ruling as Harbour Point (GitHub issues #501, #419).

**Watch for:** whether a dispatcher notices that the car-park car is a queue nothing else can
relieve, and whether the report tells a rider who waited twice that they waited twice.


---

## 12. CTF-class Reference Tower

**Config:** [`ctf-class-reference.json`](../data/buildings/ctf-class-reference.json)

A hundred and eleven floors on three sky lobbies, and **the only shipped building whose cars are not
one speed**: its eight shuttles climb at 20 m/s and descend at 10. GitHub issue #425. Everything
else about the tower is ordinary — four symmetric local banks, one entrance, no credential, no
double deck — because a building in which every car were asymmetric could not tell a reader which
figures moved because of it.

**The issue's premise was stale, and that was checked rather than assumed.** #425's title says *the
car schema cannot express that*, and it could not when the issue was filed. GitHub issue #444 landed
`descentSpeedMps` and `cabinPressurised` on `CarConfig`, `sCurve` picks the top speed by the sign of
the move, and `CLOSED_FORM_ASSUMPTIONS` gained `symmetric-speed`. So #425's *exit 1 — widen the
schema* was already taken by somebody else; what was missing was a building that uses it.

**It is the first shipped bank to raise `directionalSpeedAsymmetry`, and that warning had never
fired on shipped data.** `CLAUDE.md` § Correctness oracle and `analytical/types.ts` both said *"it is
raised on no shipped building"* — the difference between a disclaimer and a defect while it lasted.
`analytical/upPeak.test.ts` now asserts it in **both** directions: this bank and no other, because
half the claim is that the detector is not simply on.

**The shuttle is pressurised, and that is a modelling decision with a measured reason rather than a
claim about the real machine.** The bank's travel is 451.2 m, above `elevator-specs.json`'s
`airPressure.appliesAboveTravelM` of 300, so an **unpressurised** cabin would be capped at
`descentCapMps` — 10.0 m/s, *the same figure Hitachi publishes*. `resolveCar` takes the lower of the
two limits, so on that arrangement deleting `descentSpeedMps` would change nothing at all and the
authored field would be a value with no consequence: [§ D265](../DECISIONS.md)'s defect exactly.
Pressurising removes the shaft's cap (`pressurisedDescentCapMps` is `null` — no cap), so the only
thing holding the descent to 10 m/s is the machine's own published limit.
`packages/core/src/sim/directionalSpeedSeam.test.ts` asserts **both halves**: on the unpressurised
arm the two configurations produce byte-identical legs, and on the shipped one they do not.

**The asymmetry binds, measured on the legs.** On three seeds at 1 800 s under `collective`, the
shipped tower and the same tower with `descentSpeedMps` deleted are handed **identical journeys** —
same origins, same destinations, same arrival instants — and carry them in **different legs**:
different cars, different boarding times. The leg *count* does not move, because a speed is not a
zone, which is why a leg-count comparison would have missed this entirely.

**The 20 m/s rating is reached on one hop and on no other.** `CLAUDE.md`'s *short hops never reach
rated speed*, at the top of the catalogue: at `ultra-high-speed`'s 1.2 m/s² and 1.2 m/s³ an s-curve
needs about 176.7 m to reach 20 m/s and the same again to stop, so a run under about 353 m is
acceleration-limited. G to the sky deck is 451.2 m and G to sky lobby 3 is 385.5 m and both reach
it; G to sky lobby 2 is 301.5 m and G to sky lobby 1 is 139.5 m and neither does. Downwards the car
is held at 10 m/s on all four.

**The closed form reaches four of the five banks and the verdicts are runs rather than sentences.**
`local-low` **reconciles** at raw **+48.935 %**, residual **−0.031 %** against a 4 % tolerance, 64 replications from seed 810 000 — and `analyzeUpPeak` raises **no warning at all** on the case that measurement drives, which is what makes the residual mean what it says. `local-mid` reconciles too (**+54.025 %** raw, **−0.309 %** residual) and so does `local-hotel` (**+35.066 %**, **−0.066 %**). Two are refused, by a throw rather than by a sentence: `local-apartments` on `departureGapBracket` — 20-person cars at the residential 1.75 s, so a full load's dwell (32.80 s) outlasts a one-floor round trip (29.05 s) — and the **shuttle** because the apparatus cannot drain the crowd it offers it. `packages/experiments/src/oracle/remainingBuildings.test.ts` asserts every one of those verdicts.

**So the asymmetric bank is the one bank this file publishes no residual for**, and that is stated rather than worked around. What a reader gets instead is `directionalSpeedAsymmetry`, which says the published expression charges one `tv` twice and therefore understates the return half of every round trip on it — `bias: 'under'`, one-sided, enumerated in `CLOSED_FORM_ASSUMPTIONS` as `symmetric-speed`. A reader who wants the number needs a different apparatus, not a looser tolerance.

**Playable, and handed as built.** Contract `c11` is *Scenario 11*, and its ladder rung is the
identity: `{ occupancy: 1, banks: [] }`, no rate override. That is **not** the shape Harbour Point
and Ashgate take, and the reason is measured: day 1 reads **50 of 50 seeds**, and no
admissible rung moves it, because the goal doing the missing is the energy bar. A ride in this tower
costs **105.9 kJ** against a bar of 80 — `docs/33` § 4.7k.

**Not in the proof set**, on the 2026-09-10 ruling that keeps the bench's forty fixed.

**Watch for:** whether a dispatcher's cost estimate notices that a down call and an up call of equal
distance are no longer equal cost, and whether any figure the product publishes about that bank
reads as though the round trip were symmetric.

---

## 13. Shanghai-class Reference Tower

**Config:** [`shanghai-class-reference.json`](../data/buildings/shanghai-class-reference.json)

A hundred and twenty-eight floors, four sky lobbies and **a hundred and six cars** — the densest
group in the set, against `burj-class-reference`'s fifty-seven over a similar rise. GitHub issue
#424. Its fourteen shuttles are rated **20.5 m/s**, which is the maximum of `ultra-high-speed` and
the figure `data/elevator-specs.json#realWorldAnchors` takes from this very machine.

**It is the first shipped building to reach the top of the speed catalogue.** Every car in
`data/buildings/` stopped at 10.0 m/s before it, so the upper half of that class's declared range
had a UI caller — `authoring/machineSpec.ts`'s ceiling, which a player can already dial — and no
content caller. #424's own correcting comment is why this is stated as *no authored example* rather
than as a dead seam: the range was never uncalled, it was uninhabited.

**Whether a 20.5 m/s car ever reaches its rated speed is the question, and the answer is once.** At
1.2 m/s² and 1.2 m/s³ an s-curve needs about 185.4 m to reach 20.5 m/s and the same again to stop,
so a leg shorter than about **370.7 m** never touches the plate figure. This shuttle makes exactly
one hop that does — G to sky lobby 4, **418.5 m** — and three that do not: 94.5 m, 202.5 m and
310.5 m. `directionalSpeedSeam.test.ts` moves the rating to 10.0 m/s, the fastest any shipped car
was before this file, and requires the legs to differ; they do, on all three seeds.

**The cabin is pressurised, and that citation was already in the repository.**
`elevator-specs.json`'s `airPressure` block quotes Al-Kodmany (Buildings 2015, § 3.1.4) recording
that *this tower* answers the air-pressure problem with a pneumatic system. Without it a 418.5 m
bank would cap the fastest machine in the catalogue at the speed of the slowest supertall shuttle in
the set. With it the car is symmetric at 20.5 m/s both ways — which is what makes this tower the
**symmetric** arm beside the CTF-class tower's asymmetric one.

**The observation deck is a populated floor and its visitors are not modelled**, which is stated
rather than left to be found. Floor 119 carries thirty people — the deck's staff and its restaurant
— so it is a real origin and a real destination and the hotel bank really serves it. What this
repository has no template for is the **visitor** crowd an observation deck draws, which is GitHub
issue #436's subject; authoring a separate observation express would have been a bank almost nobody
rides, which is § D265's defect rather than fidelity.

**The closed form:**
`local-hotel` **reconciles** at raw **+34.983 %**, residual **−0.209 %** against a 4 % tolerance, 64 replications from seed 810 000. The other five are refused by a throw: the **shuttle** because its terminal and its four sky lobbies house nobody, so there is no up-peak round trip to price — the ground `vertical-city`'s and `burj-class-reference`'s shuttles already meet — and **`local-1` through `local-4`** because `measureUpPeak` drives an isolated bank at `OVERLOAD_FACTOR × %POP` of its own capacity, and a twenty-car bank is therefore handed a crowd it cannot drain inside the deadline. That third ground is **new to this repository**: it is a limit of the departure reconstruction rather than of the closed form, and it means the largest lift group in `data/buildings/` is measurable on its smallest bank and on none of its others.

**Playable, and handed as built.** Contract `c12` is *Scenario 12* at the identity rung. Day 1 reads
**50 of 50 seeds** and the energy bar is again what does the missing: **109.4 kJ** a ride
against 80.

**The stage cannot draw it**, on `docs/12` § 4.16's measured 35 legible floors at 1280×800 and 40 at
1440×900 against this building's 129. It is in the same position as `burj-class-reference`, for the
same reason, and GitHub issue #377 owns the remedy.

**Not in the proof set.**

**Watch for:** whether raising a rated speed the shaft is too short to spend shows up anywhere as an
improvement, which is `docs/04` § 1's negative-control finding at the far end of the scale.

---

## 14. Merdeka-class Reference Tower

**Config:** [`merdeka-class-reference.json`](../data/buildings/merdeka-class-reference.json)

A hundred and eighteen floors over a 557 m rise with **one office sky lobby**, where the Burj-class
tower has three. Ninety-two cars. GitHub issue #430, and the building exists for two comparisons
rather than for a mechanic.

**Fewer transfers over a similar rise, measured.** Fifty-six populated office floors are reached
from the street in **one leg**. On seed 20 260 824 at 1 800 s under `collective` the tower draws
**3 529 journeys and 5 041 legs — 1.428 legs a journey**, against
`burj-class-reference`'s **1.940** on the same seed and horizon. `directionalSpeedSeam.test.ts` hands
floors 29–56 to the high locals, halving the one-leg zone, and requires the same journeys to need
strictly more legs; they do, on all three seeds.

**A second supertall occupancy, and the two disagree.** `burj-class-reference`'s own `$comment` says
its 3 198 people *"is an assumption"*, arrived at by measuring what a 57-lift arrangement serves with
a valid AWT, and that *"one supertall cannot expose that. Two can."* This tower's population is
authored by a **different method on purpose** — per-floor occupancy from a stated plate assumption,
never fitted to a lift count:

| tower | people | cars | people a car |
|---|---|---|---|
| `burj-class-reference` | 3 198 | 57 | **56.1** |
| `merdeka-class-reference` | 8 455 | 92 | **91.9** |

**They disagree by about 64 %, and that is the result rather than a failure.** #430 asks what
follows if two independently authored supertalls imply wildly different people-per-lift, and its own
answer is that *the assumption is where to look*. Neither figure was chosen with the other in view.
What the comparison establishes is a direction — on the same profile the Burj-class tower is the
**lift-rich** one of the pair, which is consistent with a population that was solved for rather than
surveyed — and it establishes nothing about which occupancy is right. Averaging two assumptions
would produce a third assumption and no measurement, so neither file moves.

**The shuttle is at the air-pressure cap rather than past it.** Its cars are rated 10.0 m/s and the
bank's travel is 446.4 m, above the 300 m threshold — so the cap reaches it and binds nothing,
because the cap *is* 10.0. That is the position every supertall shuttle in the shipped set has been
in since the `airPressure` block landed; buying speed on this bank is what would make it bite, and
that is a purchase a player makes rather than a figure authored here.

**The closed form:**
`local-hotel` **reconciles** at raw **+34.485 %**, residual **−0.466 %** against a 4 % tolerance, 64 replications from seed 810 000 — with three declared departures from the model (`expressZone`, `nonUniformFloorPopulations`, `nonUniformInterfloorDistance`), all three of which are the building being mixed-use rather than defects. The other three are refused by a throw: the **shuttle** on a zero served population, and **`local-low`** and **`local-high`** because the apparatus cannot drain what it offers a thirty-car bank — `local-low` is handed **5 695 journeys** in 5 400 s and leaves 1 351 of them in the system.

**Playable, and handed as built.** Contract `c13` is *Scenario 10* — the ids are names and the
labels are positions — at the identity rung. Day 1 reads **50 of 50 seeds**, and this is
the tower where the energy bar is furthest out of reach: **176.4 kJ** a ride against 80.

**The house has run all three in Endless rush, and the 143 existing rows reproduced exactly.**
`data/rush-house-runs.json` was regenerated over every shipped dispatcher × every shipped building —
182 runs in 1 104 s — and the only lines the diff moves besides the thirty-nine new rows are the
provenance's commit and date. That is the second wave running in which this table has been
re-measured whole and agreed with itself, which is what makes a row that *does* move mean something.

**What the three towers say in that table is worth one line**: under the rush's fixed crowd, only
two of the thirty-nine runs ever break — `ctf-class-reference` under `nearest-car` at 2 754 s and
under `destination-panel` at 4 550 s, and `shanghai-class-reference` under `destination-panel` at
4 778 s. Everything else carries the whole stream. That is the same finding [§ D582](../DECISIONS.md)
records from the other side: the rush is the same number of people on every tower, so a group of
ninety-two or a hundred and six cars is simply not the thing it was built to break.

**Not in the proof set.**

**Watch for:** whether the transfer accounting — a hop charged to `ttdMeanS` that lights no landing
button — reads sensibly when only a third of journeys have one, which is what #430 filed this
building to ask.

---

## 15. One-WTC-class Reference Tower

**Config:** [`one-wtc-class-reference.json`](../data/buildings/one-wtc-class-reference.json)

A hundred and four floors, 73 cars over six banks, one transfer on the way up, and **4 810** people.
GitHub issue #428. The building exists for a measurement rather than for a mechanic, and the
measurement is the one Phase 6a/6b had never had.

**A second building for destination dispatch, and it splits the two arms.** `CLAUDE.md` records 6a
and 6b as accepted against § D100 **on one building at one operating point**. #428's first sentence
is the honest limit of that. Measured here at n = 200 under common random numbers against `eta`, at
this tower's own highest quotable rate:

| arm | ΔTTD (s) | verdict | `requiredReplications` |
|---|---|---|---|
| `destination-eta` | **−0.092 [−0.804, +0.619]** | **INDISTINGUISHABLE** | **11 704** |
| `destination-panel` | **−1.293 [−2.069, −0.517]** | **BETTER** | **1** |

The Level-0 arm, which carries § D100's accepted result, does **nothing** here: its interval
straddles zero and the effect would need fifty-eight times the budget to resolve at this cell's own
spread. The Level-1 panel is the arm that works, which is the reverse of the shape Midtown Office
shows. Both pay at the landing — AWT and WT95 **WORSE** on both arms, § D27's rule that a cost
hidden is a cost claimed. `packages/experiments/src/benchmark/destinationSecondBuilding.test.ts`
carries the run and the census behind the rate.

**The rate is 2 %POP/5 min and that is measured rather than copied.** § D100's cell is 4 % because
4 % is the highest rate at which Midtown returns a valid AWT on every arm; the *property* is the
highest quotable rate and the *number* is Midtown's. At n = 200 on this tower, 2 % is clean on all
four arms, 3 % saturates `eta` on 1 of 200 and `destination-panel` on 4, and 4 % saturates
`destination-eta` on 18. A census at n = 10 would have published 4 % — every rate up to it looks
clean there — and then reported three arms of four as `UNQUOTABLE`.

**The escalator is part of the lift system rather than a garnish, and that is #428's second
criterion answered with a number.** The sky lobby is **two levels**: the shuttle lands at 64 and the
B-side high locals depart from 65. Measured under `collective` at 1 800 s on three seeds the pair
carries **391, 375 and 359 hops** against 2 873, 2 995 and 2 841 lift legs, and deleting the
`transportModes` block adds back **exactly one lift leg per hop**. About an eighth of this tower's
rides use it. Whether that justifies giving `transportModes` a capacity or a direction is the
owner's call and this building does not make it; what it supplies is the count that question needed.

**It declares no `landingCallType`, and the refusal is pinned by two runs rather than by a
sentence.** The real tower runs destination entry at its lobby, and § D553 built the per-landing
fixture for exactly that. It is not declared because on this arrangement it would be either inert or
a crash: under the shipped default dispatcher, `mobile-credential` on every landing leaves the legs
**byte-identical** — `collective` weights `waitTime` alone and `batchKeyOf` splits a landing per
destination only under a panel — and `destination-entry` makes the tower **throw** under
`predictive-balanced`, a shipped profile and a contract reward, because a kiosk cannot defer. A
building that crashes on a dispatcher the game offers is a product defect rather than fidelity.
`packages/core/src/sim/oneWtcSeam.test.ts` asserts both.

**The cabin is not pressurised, and that is the same kind of decision.** The observatory express
spans 414.8 m, above the 300 m air-pressure threshold, so the shaft caps an unpressurised cabin at
**10.0 m/s** — which is exactly these cars' rated speed. The field would remove a cap that is not
biting and change no leg, which is § D265's defect; § D577 clause 4 is the precedent from the other
side, where the CTF-class shuttle *is* pressurised because there the machine's limit is below the
shaft's.

**The closed form:** `observatory` **reconciles** at raw **+24.766 %**, residual **−0.028 %**
against a 4 % tolerance, 64 replications from seed 810 000. The other five are refused by a throw —
the shuttle on a zero served population, and the four local banks because `measureUpPeak` cannot
drain the crowd it offers a fourteen- or sixteen-car group inside the deadline.

**The occupancy is a third point on a comparison two other files started.** 4 810 over 73 cars is
**65.9** people a car, against `merdeka-class-reference`'s 91.9 and `burj-class-reference`'s 56.1
(§ D579 clause 4). Authored from a floor-plate assumption, like Merdeka's; it lands between them and
moves neither.

**Playable, and handed as built.** Contract `c14` is *Scenario 12* — the ids are names and the
labels are positions — at the identity rung.

**The Endless rush cannot break it**, at `nearest-car` with the whole group parked at the lobby from
60 s and again at `destination-panel` parked. It joins `shanghai-class-reference` in
`rushHoldAgreement.test.ts#NEVER_BREAKS`, and what that pair refutes is in § 17 below.

---

## 16. Empire-State-class Reference Tower

**Config:** [`empire-state-class-reference.json`](../data/buildings/empire-state-class-reference.json)

A hundred and two floors, 73 cars over **eight** banks, **8 230** people, and no express anywhere in
the tower. GitHub issue #427.

**The relay, and it is authored as an absence.** The top is reached by riding a *local* to 80,
changing, riding to 86, and changing again — three legs and two waits, which is the maximum
`config/buildingConnectivity.test.ts` allows from an entrance to a populated floor. This tower sits
exactly on that limit. Every other tall building in `data/buildings/` hangs its upper zones off a
dedicated shuttle; the property that makes this one a relay is negative — **no bank reaches both the
entrance and the top zone** — and a negative property is the kind that survives an edit nobody
notices, so `packages/core/src/sim/empireStateSeam.test.ts` asserts it and then moves it. Given bank
H a terminal at the street, over identical journeys at `collective`, 1 800 s, three seeds: legs a
journey fall from **1.2040 / 1.2228 / 1.2214** to **1.1134 / 1.1063 / 1.1172**, and the journeys
needing **three** legs fall from **167 / 216 / 182** to **13 / 13 / 8**.

**The energy proxy against a published figure, which is the point of #427 and not a decoration.**
The article that prompted the issue states *"its elevators cover a combined distance of over 180,000
miles"* a year. Both numbers, whatever they say:

| | |
|---|---|
| **Measured here** | **3.21, 3.22 and 3.33 km per car per hour** at 1 800 s and **3.15, 3.28 and 3.22** at 3 600 s — six runs at the `office-standard` profile's own typical 12 %POP/5 min under `collective`, seeds 20 260 824 / 20 268 743 / 20 276 662, every car in the fleet moving in every one. Mean **3.237 km/car/h**. |
| **Published** | 180,000 miles a year over 73 cars = 2,466 car-miles = **3 968 km per car per year**. |
| **The arithmetic** | 3 968 km at 3.237 km/h is **1 226 hours of this traffic a year** — **4.9 hours** on each of 250 working days, or 3.4 hours on each of 365. |

**That is a comparison and not a validation, and this document does not call it one.** The two agree
to the order of magnitude: a real office tower plausibly sees something like five hours a day of
demand at or near its own peak rate, so the proxy is not wrong about the world by a factor of ten in
either direction. What cannot be settled is the residual, because the published figure names **no
measurement window and no basis** — #427 says so itself — and **no mechanism is offered** for the
difference, which is [§ D256](../DECISIONS.md)'s rule. What would close it is a sourced statement
of what the 180,000 miles covers. **Neither number is adjusted towards the other**: the energy proxy
is not calibrated here and § D468's 80 kJ bar is untouched.

**The closed form reconciles on every one of its eight banks**, which no shipped building had done:
raw divergences +27.467 %, +29.048 %, +30.318 %, +28.984 %, +30.747 %, +21.250 %, +25.773 % and
+33.626 %; corrected residuals **−0.044 %, −0.076 %, −0.126 %, −0.309 %, −0.368 %, +0.047 %,
−0.119 %** and **−0.184 %**, all at 64 replications from seed 810 000 against a 4 % tolerance. The
reason is the counterweight to the newest refusal ground in `remainingBuildings.test.ts`: that
ground is *the apparatus cannot drain the crowd it offers a twenty- or thirty-car bank*, and this
tower's largest bank has **ten** cars. So the limit is the size of the group rather than the height
of the shaft, and a 1931 arrangement — many small banks rather than few large ones — is the
arrangement the closed form was written for.

**The occupancy is the lift-poorest in the set and that is the building rather than an error.**
8 230 over 73 cars is **112.7** people a car, against Merdeka-class's 91.9, One-WTC-class's 65.9 and
Burj-class's 56.1. A 1931 tower carries more people per car because its cars are smaller and its
zones are narrower; the population is a stated taper over four setbacks and nothing was solved for
it.

**It is also the sharpest thing this set has said about the stage.** It hides **40 of its 73 shafts
at a desktop canvas and 47 at a laptop one** — more than half — on a building that is not a
supertall by any other measure. `render/stageCrowd.test.ts` pins it, and GitHub issue **#377** owns
the remedy.

**Playable, and handed as built.** Contract `c15` is *Scenario 16*, the last position on the ladder,
at the identity rung.

**The Endless rush cannot break it either**, on the same escalation One-WTC-class survived.

---

## 17. Willis-class Reference Tower

**Config:** [`willis-class-reference.json`](../data/buildings/willis-class-reference.json)

A hundred and eight floors, **104** cars over seven banks — roughly one car per floor, which no
other shipped building comes near — **9 200** people, and **sixteen double-deckers running as the
local service**. GitHub issue #426.

**The other double-deck arrangement, and it is the older and commoner one.** `vertical-city` and
`burj-class-reference` both declare a double-deck bank and both are supertalls whose double-deckers
are **shuttles** running express between transfer levels. Here the decks are the **locals**: they
pair every floor in their zone — sixteen pairs each, `[G,2]`, `[3,4]` … `[31,32]` and `[33,34]`,
`[35,36]` … `[63,64]` — so a rider's floor parity decides which deck they board, and `bankDecksAllow`
is consulted on far more journeys. The cars are **2.5 m/s**, the bottom of `gearless-traction`'s
band, because the saving a double-decker buys is in *stop* time and stop time is a larger share of a
slow car's round trip.

**The uniform storey height is forced rather than chosen, and it is the first thing to understand
about the file.** `config/parse.ts` requires every entry of `servesFloorPairs` to be exactly
`deckSeparationM` apart in `heightM`. A double-deck **local** pairs every floor in its zone, so every
floor in that zone must sit exactly one deck separation above the last — which is why this tower has
**one** storey height where the three supertalls each have three or four. A double-deck local is a
constraint on the section, not just on the hoistway.

**The decks bind, and the escalator turns out to be a consequence of them.** `willisSeam.test.ts`
takes the decks off both local banks — pairs deleted, `doubleDeck`, `deckSeparationM` and
`ratedLoadLbPerDeck` deleted, whole-car capacity unchanged — and changes nothing else. The legs
differ on every seed and so does their count: **6 880 / 6 847 / 6 530** with the decks against
**6 764 / 6 757 / 6 446** without. And the `G ↔ 2` escalator carries **720, 725 and 653** hops as
shipped and **exactly zero** once the decks come off, because a deck-bound leg from the lower lobby
can only reach lower-deck floors and the escalator is how a rider bound for an even floor gets to
the upper one. Take the decks away and a single-deck car at G serves the whole zone. The mode is not
decoration beside the deck model; it is produced by it.

**The pairing is a bounded exception rather than an identity, and that is itself the measurement.**
The two arms offer the same number of journeys and **every journey starts at the same instant** —
asserted with no tolerance. What differs is **31 of 3 949** destinations, every one of them a journey
ending at the upper lobby level `2` on the decked arm and at `G` on the single-deck one:
`traffic/generator.ts` rejects a journey with no lift leg, and which journeys those are is decided
by the routing the control changes.

**The disclaimer `CLAUDE.md` names is not raised here, and that is checked in both directions.**
That file records double-deck operation as simulated and says the surviving disclaimer covers only a
double-deck bank declaring no `servesFloorPairs`. #426 asks whether this tower raises it. **It does
not** — both double-deck banks declare their pairs and the building loads with zero warnings — and
deleting one bank's pairs **does** raise `missing-floor-pairs`, which is what makes the first half
worth anything.

**The closed form:** `skydeck` **reconciles** at raw **+9.634 %**, residual **−0.052 %**, 64
replications from seed 810 000 — the smallest raw divergence any bank in the oracle has produced,
because it runs G to 103 and stops nowhere else, so the textbook's two omissions have one stop to
accumulate on instead of twenty. `local-mid` is refused on `departureGapBracket`, the two express
banks on a zero served population, and `local-high` and `local-top` on the drain deadline. **No
residual is published for a double-deck bank**, and the reason is the apparatus rather than the
building: `oracle/upPeakCase.ts#isolateBank` drops the deck fields with `servesFloorPairs`, so what
it would measure is a single-deck bank of the same cars. Calling that a residual for a double-deck
bank would be a different calculation wearing its name.

**Playable, and handed as built.** Contract `c16` is *Scenario 15*, at the identity rung.

**It breaks in the Endless rush at 5 228 s, and that refutes a recorded mechanism.**
[§ D582](../DECISIONS.md) clause 3 said whether a group can be broken is decided by **how many cars
it has**, because the rush stream is the same number of people on every tower. Measured: this tower
has **104** cars and breaks; `one-wtc-class-reference` and `empire-state-class-reference` have
**73** each and hold under every escalation the table can construct. The car count does not decide
it. What separates them is the speed of the group — Willis's locals are 2.5 m/s — and **no
replacement mechanism is offered**, because a second plausible sentence in place of a measurement is
what § D256 refuses. `NEVER_BREAKS` goes from one member to three and is still a list.
