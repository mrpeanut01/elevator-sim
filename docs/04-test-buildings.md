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
position matters more than any assignment cleverness. Also the building where faster
elevators demonstrably do *not* help, because travel distances are too short for the car
to ever reach rated speed. Good sanity check against over-optimism.

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
