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
- [World's Fastest Elevators — e-architect](https://www.e-architect.com/worlds-fastest-elevators)
- [KONE Destination Control brochure](https://www.kone.us/Images/kone-destination-brochure_tcm25-18769.pdf)
- [Elevator Access Control Systems — Genea](https://www.getgenea.com/blog/elevator-access-control-systems-everything-you-need-to-know/)
