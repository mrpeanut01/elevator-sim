# Test Buildings

Eight reference buildings, each chosen to stress a different aspect of the dispatcher.
Machine-readable configs in [`data/buildings/`](../data/buildings/).

The first five are the original set. The last three were added later and each closes a gap the
first five could not pose: a traffic profile with no building, a demand with no dominant direction,
and a bank whose cars are not alike.

| Name | Floors | Bank config | Zones | Stress case |
|---|---|---|---|---|
| Garden Apartments | 6 | 2 × hydraulic, 0.63 m/s, 1,600 lb | none | Sparse traffic, long idle, parking policy |
| Midtown Office | 20 | 4 × geared, 2.5 m/s, 2,500 lb | lobby + garage | Classic up-peak, interval target |
| Secure Tower | 30 | 6 × gearless, 4 m/s, 3,000 lb; low 1–15 / high 1, 16–30 | 4 tenant zones + exec | Access control × dispatch interaction |
| Mixed-Use High-Rise | 60 | 4 shuttle @ 8 m/s → sky lobby 31; 2 local banks | retail 1–5, office 6–30, resi 32–60 | Overlapping peaks, transfer modeling |
| Vertical City | 100 | Double-deck shuttles, 3 sky lobbies | 6 zones | Double-deck, even/odd assignment |
| Chancery House | 19 | 6 × gearless, 5 m/s, 3,000 lb | none | Prestige service level on an oversupplied bank |
| Crown Hotel | 24 | 4 × gearless 3 m/s + 1 × geared 1.75 m/s service | back of house | Two-way demand, unlike cars, a single-floor crowd |
| St Jude Hospital | 13 | 3 × gearless 2.5 m/s + 2 × geared 1.75 m/s bed | clinical + diagnostics | Never off-peak, bed cars, the first shipped stair |

---

## 1. Garden Apartments

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

Twenty floors, four geared traction cars, a lobby and a garage entrance (two distinct
ground-level origins, which breaks naive single-lobby assumptions). This is the classic
up-peak sizing problem and the primary building for **validating against the analytical
round-trip-time baseline**.

**Watch for:** simulated interval and handling capacity matching the closed-form
calculation within a few percent under pure up-peak.

## 3. Secure Tower

Thirty floors, six gearless cars split into a low bank (1–15) and a high bank (1, 16–30),
with four tenant access zones plus a restricted executive floor. Every one of the three
zoning concepts is active here simultaneously — service, access, and operational.

**Watch for:** access-control checks must not become a dispatch bottleneck, and the
dispatcher must never assign a passenger to a car that cannot legally or physically serve
their destination.

## 4. Mixed-Use High-Rise

Sixty floors: retail 1–5, office 6–30, residential 32–60, with a sky lobby at floor 31
served by four 8 m/s shuttles plus two local banks. **This is the main event.** Office
down-peak and residential up-peak overlap around 18:00 and compete for the same shuttle
capacity — a genuinely hard, genuinely realistic scheduling conflict where a predictive
dispatcher should visibly beat reactive ones.

**Watch for:** transfer modeling at the sky lobby (passengers become new arrivals at the
transfer floor, and their total journey time spans two trips). Time-to-destination, not
average waiting time, is the metric that matters here.

## 5. Vertical City

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
