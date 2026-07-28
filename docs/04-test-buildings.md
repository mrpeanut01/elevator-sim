# Test Buildings

Five reference buildings, each chosen to stress a different aspect of the dispatcher.
Machine-readable configs in [`data/buildings/`](../data/buildings/).

| Name | Floors | Bank config | Zones | Stress case |
|---|---|---|---|---|
| Garden Apartments | 6 | 2 × hydraulic, 0.63 m/s, 1,600 lb | none | Sparse traffic, long idle, parking policy |
| Midtown Office | 20 | 4 × geared, 2.5 m/s, 2,500 lb | lobby + garage | Classic up-peak, interval target |
| Secure Tower | 30 | 6 × gearless, 4 m/s, 3,000 lb; low 1–15 / high 1, 16–30 | 4 tenant zones + exec | Access control × dispatch interaction |
| Mixed-Use High-Rise | 60 | 4 shuttle @ 8 m/s → sky lobby 31; 2 local banks | retail 1–5, office 6–30, resi 32–60 | Overlapping peaks, transfer modeling |
| Vertical City | 100 | Double-deck shuttles, 3 sky lobbies | 6 zones | Double-deck, even/odd assignment |

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
