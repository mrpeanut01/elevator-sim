# Elevator Engineering Reference

Reference values for configuring realistic elevators. Sources are listed at the bottom.
Machine-readable form: [`data/elevator-specs.json`](../data/elevator-specs.json).

## Classes, speeds, and rises

| Class | Rated speed | Max rise | Typical capacity | Application |
|---|---|---|---|---|
| Hydraulic | 0.5–0.75 m/s (100–150 fpm) | ~5–6 floors | 1,600–3,500 lb | Low-rise, low duty, freight |
| MRL gearless (low) | 1.0–1.75 m/s (200–350 fpm) | ~76 m / 250 ft | 2,000–3,500 lb | Mid-rise residential & office |
| Geared traction | 1.75–2.5 m/s (350–500 fpm) | ~76 m / 250 ft | 2,500–4,000 lb | Mid-rise |
| Gearless traction | 2.5–7 m/s (500–1,400 fpm) | up to ~600 m | 3,000–4,000 lb | High-rise local |
| High-speed gearless | 7–10 m/s (1,400–2,000 fpm) | supertall | 3,500–5,000 lb | Express / shuttle |
| Ultra high-speed | 10–20.5 m/s | shuttle only | double-deck, 12–14/deck | Supertall shuttle, observation |

### Real-world anchors

| Building | Speed | Note |
|---|---|---|
| Shanghai Tower | 20.5 m/s | World's fastest (Mitsubishi) |
| Burj Khalifa | 10 m/s (600 m/min) | Reaches floor 124 in ~60 s; world's fastest double-deck |
| Shanghai World Financial Center | 10 m/s | Double-deck shuttles to 240 m sky lobby |

### Code minimum speeds by rise

Useful as validation rules in the building editor:

| Rise | Minimum rated speed |
|---|---|
| 24–44 ft (7.3–13.4 m) | 200 fpm (1.0 m/s) |
| 44–100 ft (13.4–30.5 m) | 350 fpm (1.75 m/s) |
| over 100 ft (30.5 m) | 500 fpm (2.5 m/s) |

## Motion parameters

| Parameter | Typical design value | Notes |
|---|---|---|
| Acceleration | 0.8–1.2 m/s² | Comfort-bound, not motor-bound |
| Jerk | 1.0–1.6 m/s³ | Below ~0.7 feels sluggish; above ~2.0 unpleasant |
| Motor start delay | ~0.5 s | Brake lift + torque build |
| Leveling / settle | 0.5–1.0 s | |

**Model acceleration and jerk properly** — a trapezoidal or S-curve velocity profile. Over
short hops the car never reaches rated speed, which is exactly why a 500 fpm car is not
2.5× better than a 200 fpm car in a six-story building. The simulator must reproduce this;
it is the single most common source of naive over-optimism about faster elevators.

### S-curve profile phases

```
jerk+ → accel const → jerk− → cruise → jerk− → decel const → jerk+ → stop
```

For a short journey the cruise phase has zero duration, and for a very short journey the
constant-acceleration phases collapse too, leaving a pure jerk-limited profile.

## Door parameters

| Parameter | Typical value | Notes |
|---|---|---|
| Door open | 1.5–2.5 s | Center-opening faster than side-opening |
| Door close | 2.5–4.0 s | Center ~3.0 s, side ~4.0 s |
| Dwell — car call | 2–4 s | |
| Dwell — hall call | 4–7 s | Longer; passenger must walk to the car |
| Passenger transfer | 1.0–1.2 s (office), 1.5–2.0 s (residential) | Per passenger, per direction |

ISO 4190-6 uses 1.75 s passenger transfer time for residential. Residential is slower than
office because of luggage, strollers, carts, and children.

## Capacity and the load sensor

US convention: `persons = rated load ÷ 150 lb`. EN 81 uses 75 kg per person.

| Rated load | Persons (US) | Typical use |
|---|---|---|
| 1,000 lb / 450 kg | 6 | Small residential |
| 1,600 lb / 730 kg | 10 | Residential standard |
| 2,500 lb / 1,150 kg | 16 | Office standard |
| 3,000 lb / 1,350 kg | 20 | Office / high-rise |
| 3,500 lb / 1,600 kg | 23 | High-rise, ADA stretcher |
| 4,000 lb / 1,800 kg | 26 | Service / high-rise |

### The 80% rule

Traffic analysis universally assumes cars fill to **80% of rated capacity**, not 100% —
people do not pack in. Design the dispatcher around this. Using 100% will make the
simulator systematically optimistic.

### Load weighing behavior

Real load-weighing devices drive exactly the behaviors this project targets. These are
production features, not inventions:

| Threshold | Behavior |
|---|---|
| ~80% of rated load | **Hall call bypass** — car stops answering new hall calls, serves only its car calls. This is the "skip floors that have been called" feature. |
| ~110% of rated load | **Overload alarm** — doors held open, car will not start |
| any load | Motor torque pre-compensation at start |

Model passenger mass as a distribution (drawn from the `passengerMass` stream), not a
constant, so the load sensor has something meaningful to measure.

## Energy and the counterweight

A traction lift's counterweight is sized at `car mass + 0.4…0.5 × rated load`. At the balance point
the drive sees **zero static out-of-balance**, and the worst case — a full car going up, an empty car
coming down — is symmetric about it. This is why ISO 25745-2's reference-cycle energy measurement is
taken at **empty, half and full load**: the mid point is the balance point.

| Quantity | Convention | Notes |
|---|---|---|
| Counterweight balance ratio | **0.5** of rated load | Literature range 0.4–0.5. `COUNTERWEIGHT_BALANCE_RATIO` in `core/src/metrics/types.ts`; a code constant, never configuration — see below |
| Standard gravity | 9.80665 m/s² | CODATA / ISO 80000-3 conventional value |
| Regeneration | **Assumed absent** | A drive without regeneration dissipates the overhauling direction in a brake resistor, so both directions cost |

### The simulator's energy proxy

`RunSummary.energy` reports **out-of-balance mechanical work**, summed per completed car move:

```
workJ = |loadKg − 0.5 · ratedLoadKg| · g · distanceM
```

It is sampled **per move and attributed at arrival**, so it windows exactly as every other statistic
does — a whole-run odometer beside a peak-5-minute AWT would not be describing the same 300 seconds.
`EnergyStatistics` publishes `workKJ` (the Pareto axis), `distanceM` and `starts` beside it, because
a dispatcher that cut energy by carrying fuller cars and one that cut it by driving less are
different findings with the same number — and `workPerServedLegKJ`, because **a configuration that
spends less by serving fewer people has not saved anything**.

**This is not kWh, and must not be read as kWh.** It deliberately omits acceleration losses (which
need car and counterweight masses, which no shipped spec carries), drive and gearing efficiency,
door-motor energy, and **standby/idle power** — ISO 25745-2's other half, which on a lightly-used
lift dominates the running term and is a property of the machine rather than of the dispatcher. What
it measures is *the work the dispatch decisions caused*, which is the quantity a comparison between
dispatchers is asking about. Because regeneration is assumed absent, a regenerative installation's
true consumption is bounded **above** by this figure.

**Why 0.5 is a constant.** A per-run counterweight ratio would let two arms of one comparison be
scored on different scales, and every figure this project publishes is a paired difference between
arms. 0.5 is also the value at which the proxy is symmetric — an empty car and a full car of equal
travel cost the same — so the number describes how far cars drove out of balance rather than one
installation's counterweight order. Full reasoning: [`DECISIONS.md` § D106](../DECISIONS.md).

**Energy is an axis, never a score.** Measured across the full experiment matrix, `nearest-car` — the
weakest shipped dispatcher — is on the Pareto front at six of eight cells, because it is best on
energy and worst on wait. Any aggregate "efficiency" number ranks it first. Report energy beside
AWT and WT95, never instead of them.

## Traffic mix by period, and the one period whose mix moves inside it

The three directional shares are not a constant of a building — they are a constant of a *period*.
An office's morning up-peak, its lunch period and its evening down-peak have different mixes, and
`data/traffic-profiles.json`'s per-building-type `directionalSplit` describes the **governing** one.

| period | incoming / outgoing / interfloor | source |
|---|---|---|
| morning up-peak, standard office | 85 / 5 / 10 | the shipped `office-standard` profile |
| **lunch two-way** | **45 / 45 / 10** | CIBSE Guide D (2010, carried into 2020); BCO *Guide to Specification 2014* pairs it with a 13 %/5 min lunchtime two-way demand |
| lunch two-way, alternatives | 40 / 40 / 20 (Barney 2003a); 42 / 42 / 16 (BCO 2009) | recorded because they differ, not to be averaged with the above |

The lunch peak is worth designing for on its own: measured office lunch-hour demand runs **12–16 %
of population per 5 minutes**, and the period's intensity can exceed the up-peak handling capacity
by **20–30 %**, so a system tuned only for the morning can disappoint at midday.

### What could not be cited, stated plainly

The three rows above give the lunch period's mix as **one triple for the whole period**. No CIBSE
Guide D or BCO page giving that mix *as a function of time within the period* was available while
this was written, and the shipped `lunch-two-way` template needs one — so it is **derived from the
mechanism the same sources describe**, not quoted, exactly as the escalator traversal time below is
derived from EN 115-1 geometry rather than quoted from a table.

The mechanism: occupants ride down to the terminal to leave the building and ride back up on their
return, so the same period is outgoing-dominant early and incoming-dominant late. Three stated
assumptions close the arithmetic:

| step | value | source |
|---|---|---|
| interfloor share, held constant through the period | 10 % | the cited period mix |
| incoming share at the instant the period opens | 0 % | nobody has returned yet — the mechanism, not a table |
| the arc between the ends | linear in time, symmetric about the midpoint | assumption |
| ⇒ mix at the start | **0 / 90 / 10** | derived |
| ⇒ mix at the end | **90 / 0 / 10** | the mirror |
| ⇒ time-average of the arc | `(0+90)/2 / (90+0)/2 / (10+10)/2` = **45 / 45 / 10** | **reproduces the cited figure** |

The last row is the check: the endpoints are pinned by the mechanism *and* by having to integrate
to the published period mean, rather than being a plausible-looking pair set beside it.

**The limitation cuts the wrong way and is therefore stated first, not last.** An endpoint of
exactly zero incoming is the **widest** arc consistent with the cited mean; a measured building's
departures and returns overlap, so a real arc is smoother at its ends. A wider arc is the one a
traffic-pattern-sensitive dispatcher would find easiest to exploit, so this is **not** a
conservative choice and must not be reported as one. `traffic.lunchTwoWay.mixAmplitude` narrows it,
and 0 collapses it to a flat 45/45/10 at identical total demand.

**The period's *length* is not cited either.** The template inherits the CIBSE rise-and-fall run's
own 30-minute horizon, its 5-minute hold and its zero baseline, so it introduces no duration that
no source supports. The cited part of `lunch-two-way` is its mix, not its clock.

## Non-lift transport

A building may declare **transport modes** — escalators, stairs — as edges of the routing graph
(`BuildingConfig.transportModes`). One edge, two floors, one landing-to-landing traversal time.
They exist for one reason: before them, the ground hop of a two-level lobby had nowhere to go but
a lift, and a journey was charged an entire elevator leg the real building never pays.

**The traversal time is a reference value, so it is derived and cited rather than chosen.** For
`vertical-city`'s `G ↔ 2` pair, rise 4.5 m:

| step | value | source |
|---|---|---|
| inclination | 30° | BS EN 115-1 — the only permitted angle above a 6 m rise, and the usual commercial compromise below it |
| nominal speed | 0.5 m/s | the common commercial nominal speed; EN 115-1 permits up to **0.75 m/s** at ≤ 30° and caps 30–35° at **0.50 m/s** |
| incline length | `4.5 / sin 30° = 9.00 m` | geometry |
| time on the incline | `9.00 / 0.5 = 18.0 s` | |
| flat steps | 2 at each landing (rise ≤ 6 m; 3 above it), step depth **0.40 m** | BS EN 115-1 |
| time on the flat steps | `2 × 2 × 0.40 / 0.5 = 3.2 s` | |
| **landing to landing** | **21.2 s** | |

### The three sky lobbies, and why their derivation is the same arithmetic

`vertical-city` declares an escalator at **all four** of its two-level lobbies, and the other three
come out at 21.2 s as well. That is not a shortcut — it is a constraint of the building:

| pair | lower floor | upper floor | rise | incline `rise / sin 30°` | incline time | flat steps | **total** |
|---|---|---|---|---|---|---|---|
| `G ↔ 2` | 0.0 m | 4.5 m | **4.5 m** | 9.00 m | 18.0 s | 3.2 s | **21.2 s** |
| `26 ↔ 27` | 105.6 m | 110.1 m | **4.5 m** | 9.00 m | 18.0 s | 3.2 s | **21.2 s** |
| `51 ↔ 52` | 211.2 m | 215.7 m | **4.5 m** | 9.00 m | 18.0 s | 3.2 s | **21.2 s** |
| `76 ↔ 77` | 303.0 m | 307.5 m | **4.5 m** | 9.00 m | 18.0 s | 3.2 s | **21.2 s** |

**The rise is not a free parameter here, and that is the point.** A two-level lobby in this tower is
a lobby a double-deck car serves, and `resolveBuilding` refuses any `servesFloorPairs` entry whose
two floors are not *exactly* `deckSeparationM` apart (`ISSUE_CODES.deckSeparationMismatch`). Every
shuttle in `vertical-city` declares `deckSeparationM: 4.5`, so every lobby pair is 4.5 m by
construction and the EN 115-1 derivation lands on the same number four times. Both halves are
asserted in `traffic/transportRoute.test.ts` — the rises against the floor heights, and the
transport modes against the shuttle's own pairs — so a floor height that moves fails the derivation
rather than silently invalidating it. Each is 4.5 m ≤ 6 m, so 30° is permitted and two flat steps
per landing is the requirement; nothing in the table changes with height.

**What could not be cited, stated plainly:** no CIBSE Guide D page giving a *lumped* escalator
door-to-door traversal time was available while this was written, so the figures above are
constructed from EN 115-1's geometry and speed limits rather than quoted from a table. If a Guide D
figure is later found and disagrees, the number moves and every `vertical-city` pin moves with it —
which is the normal treatment of a moved published figure, not an exception.

**Two of the four carry nobody, and it is published rather than left to be found.** `51 ↔ 52` and
`76 ↔ 77` are on 0 hops of the shipped trace, because `zone-5-local` serves *both* 51 and 52 and
`zone-6-local` serves *both* 76 and 77 — so breadth-first search reaches the two levels of those
lobbies at the same depth and the escalator never shortens anything a passenger can ask for. They
are declared because the hardware is really there and removing them would make the building's own
notes false; they are **measured** because a declared field that changes no decision is the shape
`DECISIONS.md` § D112 found in `data/dispatcher-profiles.json`. The census is pinned in both
directions in `traffic/transportRoute.test.ts`. Sky lobby A is the one that matters:
`zone-3-local` is anchored to 26 and `zone-4-local` to 27, so its two levels are not
interchangeable, and joining them took a cross-lobby interfloor journey from **four lift legs to
two**.

### Stairs — this section carries no calibrated figure, and none has been invented

`packages/core/src/config/types.ts` tells the author of a transport mode that `traversalTimeS` is a
**reference value and must be cited** in the declaring building's `$comment`, and points here. For
an escalator that pointer is good: the table above is a derivation from BS EN 115-1's own limits,
and every step of it is checkable. **For a stairs mode this document has nothing to give you, and
this subsection exists to say so rather than to let the pointer read as coverage.**

A stairs mode declares two things an escalator does not, and neither is derivable the way 21.2 s
was:

| field | what kind of number it is | why the escalator derivation does not transfer |
|---|---|---|
| `traversalTimeS: { upS, downS }` | a **human** ascent and descent time over a known rise | EN 115-1 fixes an *escalator's* angle, nominal speed and flat-step count, so its traversal time is geometry. A stair standard governs the stair's geometry — going, riser, width — and says nothing about the speed of the person on it, still less about how much slower that person climbs than descends |
| `use: { up, down }` | a **behavioural** probability, per building | `StairsUseConfig` requires it per building precisely because it is not a constant: a hotel's guests, an office tower's staff and a hospital's do not behave alike. There is no default in code for the same reason — a default would put an uncited behavioural claim into every study that declared a stair |

**Nothing here has been consulted.** No CIBSE Guide D page, no ISO 8100-32 clause, and no
lift-engineering paper on stair uptake was opened while this subsection was written, so no figure
is quoted and no source is named as though one had been. That is a deliberate outcome and not an
oversight: this repository retracted **two** escalator/lobby citations in a single wave for exactly
the fault of naming a document nobody had read (`DECISIONS.md` § D207), and the same wave's
crowding term now cites nothing and says so. A stated *"we have no calibrated figure for this"* is
a fact a reader can act on. A plausible number beside a plausible source is not.

**What an author of the first stairs mode must do.** In order, and all four:

1. **Open a document and record which one**, in the declaring building's `$comment`: title,
   edition or year, and the clause, table or figure the number comes from. Not "CIBSE Guide D" —
   the part of it you read.
2. **Say what population it was measured on.** `use` is population-specific by construction, so a
   figure with no stated population cannot be checked against the building it is authored on.
3. **Show the arithmetic if the figure is derived** rather than quoted, the way the `G ↔ 2` table
   above shows every step from inclination to landing-to-landing seconds. A derived number whose
   derivation is not written down is a quoted number with the source removed.
4. **If no citable figure can be found, do not declare the stair.** A building with no stairs mode
   is a stated absence and costs nothing; a stairs mode carrying invented numbers is a fabricated
   result that every run will happily average and no test will question.

**What the loader will and will not do for you.** `config/schema.ts` refuses a scalar
`traversalTimeS` on a stairs mode, refuses a directional pair on an escalator, requires `use` on a
stairs mode, refuses `use` on an escalator, and refuses `upS < downS` as an inverted asymmetry
rather than a declared one. Every one of those is an **internal-consistency** check. A pair of
invented numbers that happen to satisfy `upS >= downS` passes all five, which is the whole reason
this subsection is written as a citation requirement and not as a schema note.

**Where to look, offered as leads and explicitly not as citations.**
`docs/14-building-behaviour-contract.md` § 3.3's closing note names CIBSE Guide D (stair usage by
floor delta, lobby densities) and ISO 8100-32 (transfer times under crowding) as the documents to
start from. Neither has been consulted for this section, so neither appears in § Sources below on
its account. Whoever does consult one should replace this subsection with a derivation table in the
shape of the escalator's, add the entry to § Sources, and say which of the two fields it calibrates
— a source for `upS`/`downS` is not a source for `up`/`down`.

**Nothing in this repository depends on a stair figure today.** No shipped building in
`data/buildings/` declares a `stairs` mode; `vertical-city` is the only building with
`transportModes` at all, and all four of them omit `kind`, which is `escalator`. The routing and
uptake code is exercised from test fixtures. So this is a gap in front of the first author, not
underneath a published number.

### Two things the model deliberately does not have

Each because nothing would read them: a direction (a one-way escalator is a real configuration and
is not expressible), and a capacity or headway (an escalator's handling capacity dwarfs a lift's,
and modelling it would put a queue on the one edge that exists to remove one). See
`packages/core/src/config/types.ts`.

*This list said **three** until the stairs work landed, and the third was "a `kind` enum — nothing
branches on escalator-versus-stair". That is no longer true: `TRANSPORT_MODE_KINDS` ships,
`transportModeSchema` branches on it four times, `traffic/route.ts` filters `stairs` out of the
edge set it plans over, and `packages/core/src/sim/stairs.ts` selects on it to decide which modes
are offered at the landing. The sentence is corrected here rather than deleted, because a reader
who remembers the old one should be able to see what moved.*

## Sources

- [Elevator Types — Archtoolbox](https://www.archtoolbox.com/elevator-types/)
- [Minimum Travel and Speed Requirements — UpCodes](https://up.codes/s/minimum-travel-and-speed-requirements)
- [Rated Load and Maximum Available Car Area — Elevator World](https://elevatorworld.com/article/rated-load-and-maximum-available-car-area/)
- [Applying ISO 8100-32:2020 to Rated Load and Available Car Area — Elevator World](https://elevatorworld.com/article/applying-iso-8100-322020-to-rated-load-and-available-car-area/)
- [How Is Elevator Capacity Calculated? — TK Elevator](https://www.tkelevator.com/us-en/company/insights/how-is-elevator-capacity-calculated.html)
- [ISO 8100-32:2020 Guidance — Elevator World](https://elevatorworld.com/article/iso-8100-322020-guidance/)
- [CIBSE Guide D: Transportation Systems in Buildings (2020)](https://www.cibse.org/knowledge-research/knowledge-portal/guide-d-transportation-systems-in-buildings-2020/) — § 13 covers lift power and energy, and is the basis for the counterweight balance ratio above
- [ISO 25745-2:2015 — Energy performance of lifts, escalators and moving walks, Part 2: Energy calculation and classification for lifts](https://www.iso.org/standard/61551.html) — the reference cycle measured at empty / half / full load, the non-regenerative measurement convention, and the standby term this project's proxy deliberately omits
- Barney, G. and Al-Sharif, L., *Elevator Traffic Handbook: Theory and Practice* (2nd ed., Routledge 2016) — drive sizing, counterbalancing, and the round-trip-time derivation this project's oracle implements
- [BS EN 115-1:2017 — Safety of escalators and moving walks, Part 1: Construction and installation](https://standards.iteh.ai/catalog/standards/cen/89597718-b77e-4b2d-b8da-287ce6d9b9b3/en-115-1-2017) — inclination limits (30°, and 35° only for rises ≤ 6 m), the nominal-speed caps (0.75 m/s at ≤ 30°, 0.50 m/s at 30–35°), and the flat-step requirement (2 for a rise ≤ 6 m, 3 above it) behind the `G ↔ 2` traversal time above
- [KONE Planning guide — Escalators, ramps and autowalks](https://distributors.kone.com/en/Images/KONE-Escalator-Planning-Guide_tcm90-100695.pdf) — 30° as the commercial/infrastructure compromise angle, 0.5 m/s as the common commercial nominal speed, and the 0.40 m standard step depth
- [Fundamentals of Traffic Analysis — Elevator World](https://elevatorworld.com/article/fundamentals-of-traffic-analysis/) — the four office traffic types (up-peak, down-peak, lunch mixed-peak, random interfloor), the lunch period's leave-and-return mechanism, and the 12–16 %/5 min lunch demand band behind the traffic-mix table above
- [Lift Passenger Demand in Office Buildings — Elevator World](https://elevatorworld.com/article/lift-passenger-demand-in-office-buildings/) — the 45 % / 45 % / 10 % lunch mix attributed to CIBSE (2010), the 40/40/20 (Barney 2003a) and 42/42/16 (BCO 2009) alternatives, and the BCO *Guide to Specification 2014* lunchtime two-way demand of 13 %/5 min
- [Traffic planning methodology — Siikonen, KONE (CTBUH)](https://global.ctbuh.org/resources/papers/download/1049-traffic-planning-methodology.pdf) — lunch mixed-peak as a distinct design condition rather than a variant of up-peak
- [World's Fastest Elevators — e-architect](https://www.e-architect.com/worlds-fastest-elevators)
- [KONE Destination Control brochure](https://www.kone.us/Images/kone-destination-brochure_tcm25-18769.pdf)
- [Elevator Access Control Systems — Genea](https://www.getgenea.com/blog/elevator-access-control-systems-everything-you-need-to-know/)
