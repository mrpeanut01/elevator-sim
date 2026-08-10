# UI readiness audit — every dispatcher, every building

**Date:** 2026-08-10 · **Tree:** `main` at `29ee760`, clean · **Test suite:** green (`npm test`, exit 0)

Commissioned ahead of a new UI that will add building types, failure modes, simulation tweaks and
new gameplay. The question asked was **not** which dispatcher is best. It was whether each of the
13 shipped dispatchers *operates correctly* — cars move, banks serve, floors get visited, riders
board, transfers complete, escalators carry, decks pair, nothing throws — in each of the 8 shipped
buildings, including shuttles, expresses and escalators.

**5 096 cells** were run: 8 buildings × 13 dispatchers × {3 seeds, 24 seeds, 5 extra demand
templates, 5 traffic-profile overrides, 5 demand tweaks, 5 failure modes, the 600-minute
`office-day` template}. **3 800 clean, 1 296 carrying at least one error.**

Ten investigation lanes ran in parallel against that sweep. Seven fix lanes then ran against the
findings. What follows is ranked by what it costs the release.

## Status after the fix round

| # | finding | outcome |
|---|---|---|
| B0 | `nearest-car` parks cars | **mechanism refuted, profile left alone** — the fix is a one-line viewer change to read `role: "baseline"` |
| B1 | landing panel pins an unbounded queue to one car | **fixed, held for review** — `office-day` 4 597 stranded → 0, but it moves **Phase 6b's acceptance criterion**; branch `fix/destination-panel-pin` |
| B2 | dispatch layer is deck-blind | **fixed, held for review** — `not-at-floor` refusals 45–126/run → 0, but it moves a Pareto front; branch `fix/deck-blind-dispatch` |
| B3 | 70 s main-thread freeze | **fixed** — shift runs on a worker, with cancel |
| B4 | 114 controls that bind nothing | **fixed** — `patience` wired, the other eleven schemas labelled NOT APPLIED on screen |
| S1 | `secure-tower` floor 30 credential-isolated | **fix built, costed, withdrawn** — 14 pinned figures move; documented one line away |
| S2 | three service modes are one | **reported, not built** — a feature, deliberately out of scope |
| S3 | `garden-apartments` collapses the menu | **real, no data-legal fix** — needs a UI label |
| S3b | stale deck-balancing claim | **fixed** in the building's notes |
| S3c | mis-wired bank silently loses demand | **fixed** — connectivity now checked at load time |
| S4 | new building type = five code sites | **fixed** — now one code site plus one data row |
| S5 | editor round-trip deletes hardware | **fixed** — all 8 buildings round-trip losslessly |
| — | `onTimeout` held by repetition | **guarded** across all 23 producers |

Parked cars across the 2 496-cell matrix, with all seven lanes applied: **474 → 277**;
`destination-panel` 147 → 40.

### Why B1 and B2 are held rather than merged

Both fixes are correct and both were verified. Neither is merged, because each changes a *claim*
this project has published, and a claim is not a pin:

- **B1 trips `benchmark/mixedUseHighRise.test.ts`'s assertion that the Level-1 panel does not beat
  `eta` or `collective` on TTD at any measured point.** That sentence is **Phase 6b's stated
  acceptance criterion** (CLAUDE.md; § D100). A dispatch fix that flips a phase verdict is a
  measurement to run and record, not a number to regenerate — and the direction here is *toward*
  acceptance, which is exactly when it is tempting to skip the measurement.
- **B2 removes `destination-eta` from the Pareto front** at `vertical-city-up-peak`, and flips
  `doubleDeck.test.ts`'s energy claim: `carStarts` now comes back BETTER against a test whose own
  comment says such a result *"would be a result … and must not pass silently"*.

There is also a portability argument against re-pinning either locally: CI deliberately runs a
**two-OS matrix** because pins in this repository have twice proved environment-dependent, each
environment reproducing its own pin set exactly (§ D196, § D201). Pins regenerated on one machine
are not evidence for the other.

Everything that does not move a published claim is merged. Between them, the two held branches carry
the audit's two largest operational wins; both are one review away.

---

## The headline

**Nothing in the simulator is structurally broken.** Across all 5 096 cells there was not one
conservation imbalance, not one wrong-car boarding, not one deck-mismatched leg and not one lost
passenger. Determinism holds: 104 building × dispatcher pairs replay bit-identically from their
seed, and the seed is live in every one. The books always balance. Nothing threw — though that
last one rests on every shipped caller passing `onTimeout: 'report'`, which is true of all of them
today and is asserted by no test (see *Cleared*).

**But three dispatchers routinely park cars while riders stack up**, and that is precisely the
failure the audit was asked to look for.

A car counts as parked when it completed **no move for ≥ 180 s** while **≥ 5 riders it could
actually carry** — both ends of the trip inside its own bank — stood waiting throughout, and the
car was in service the whole time.

| dispatcher | cells | cells with an error | **cells with a parked car and a standing queue** |
|---|---|---|---|
| `nearest-car` | 392 | 339 | **324 (83 %)** |
| `destination-panel` | 392 | 194 | **147 (38 %)** |
| `energy-aware` | 392 | 132 | **78 (20 %)** |
| `auction-multi-round` | 392 | 76 | 25 (6 %) |
| `collective-enroute`, `auction`, `destination-eta`, `collective`, `eta`, `fairness-first` | 392 each | 63–70 | 10–20 (3–5 %) |
| `zoned-uppeak` | 392 | 54 | 4 (1 %) |
| **`capacity-aware`** | 392 | 52 | **0** |
| **`predictive-balanced`** | 392 | 51 | **0** |

Two dispatchers never park a car anywhere, under any building, template, traffic profile, seed or
failure mode. That is the standard the other eleven can be held to.

Worst single windows, all with **no fault injected** — this is the shipped configuration:

| building / dispatcher | car | motionless for | riders it could carry, waiting throughout | it carried, all run | it drove, all run |
|---|---|---|---|---|---|
| vertical-city / `destination-panel` | `shuttle-S8` | **18 740 s** | ≥ 1 224 | 37 | 3 691 m |
| vertical-city / `destination-panel` | `shuttle-S6` | 12 050 s | ≥ 2 872 | 32 | 4 508 m |
| chancery-house / `nearest-car` | `main-F` | 10 050 s | ≥ 60 | 38 | 260 m |
| mixed-use-high-rise / `nearest-car` | `office-local-O7` | 9 690 s | ≥ 298 | 24 | 342 m |
| mixed-use-high-rise / `nearest-car` | `office-local-O8` | 7 330 s | ≥ 914 | 40 | 650 m |

A car standing still for five hours while a thousand people wait on the floors it serves is the
thing a player will call a bug, whatever the cost function says.

**The mechanism, corrected by intervention.** Tracing every dispatch decision the idle car's bank
was handed: on `vertical-city`/`nearest-car`, car `zone-1-local-Z1-E` was **eligible in 2 854 of
2 854 decisions, filtered out of none, and won none**, while its three siblings moved 61–67 times
in the same window. 2 791 of those decisions were `retained / reassignment-disabled`.

This report originally concluded from that correlation that `reassignmentPolicy: never` was the
cause. **That was wrong, and changing the setting refutes it.** Measured over 24 cells (8 buildings
× 3 seeds), one field group changed per arm:

| arm | change | cells with a parked car | fleet travel |
|---|---|---|---|
| shipped | — | **21 of 24** | 294 199 m |
| A | `reassignmentPolicy: until-commitment` — *this report's original recommendation* | **19** | −0.2 % |
| C | `assignmentMode: split-demand` | 20 | — |
| B | all of `capacity-aware`'s `dispatch` section | 16 | — |
| E | `idle.parkingStrategy: lobby` | 6 | **+50.4 %** |
| **D** | `capacity-aware`'s **weights**, `reassignmentPolicy` left at `never` | **0** | +30.1 % |

Arm D settles it: with the setting this report blamed left untouched, the finding vanishes when the
weight vector changes. Stage 5 is worth **2 cells of 21**. The cause is the argmin over
`distanceTravelled` itself — a moving car's *added* metres are near zero, so calls snowball onto
whichever car is already going that way — with `idle.parkingStrategy: stay` the second contributor.
An intervention beats a correlation, and the correlation was the more plausible story.

Same building, same seed, same trace, `st-jude-hospital` under an office profile — **not
saturated**, run completed, everybody delivered:

| dispatcher | legs waiting > 600 s | p95 wait | max wait |
|---|---|---|---|
| `nearest-car` | **41** | 672 s | **1 569 s** |
| `collective` | 0 | 54 s | 112 s |
| `eta` | 0 | 52 s | 136 s |
| `fairness-first` | 0 | 78 s | 322 s |
| `destination-panel` | 0 | 82 s | 215 s |

On that run `main-E` drove 44 m and carried **one person**; `main-A` drove 716 m and carried 148.
The landing queue climbed to 130 and stayed there.

**Triage of the 665 flagged cells** (independently re-derived from the leg records): **60 % are the
real class** — the car is idle, its siblings are moving, and the queue it could serve is *growing*.
11 % are defensible parking where the queue was flat or falling. The rest were harness artefacts,
now fixed and excluded from the figures above.

---

## Blocking — fix or gate before the UI ships

### B0. `nearest-car` parks cars permanently, on every non-trivial building

83 % of its cells. The mechanism, the leg-level comparison against four other dispatchers on an
identical trace, and the worst instances are in **The headline** above; they are not repeated here.
The two things that make it a release decision rather than a curiosity:

- It is **not** saturation. The `st-jude-hospital` case completes, delivers everybody, and is not
  diagnosed saturated — and four other dispatchers on the same trace produce *zero* legs waiting
  over 600 s against `nearest-car`'s 41.
- `nearest-car` was **the viewer's default** until § D134, and it is the first entry in the
  dispatcher list.

**Resolution: leave the profile alone and label it.** The only arm that fixes it replaces the weight
vector — and a `nearest-car` that weights `waitTime` is not nearest car. `published.ts` holds **56
pinned figures naming it**, and § D106 puts it on the Pareto front at 6 of 8 cells *precisely
because* it drives least. Arm E prices the alternative: +50.4 % fleet travel to remove 15 of 21
cells. The refusal and all six measurements are now recorded in the profile's own `$comment`.

**The labelling channel already exists and nothing reads it.** `data/dispatcher-profiles.json`
declares `role: "baseline"` on this profile, the design handoff already draws that card with a
`BASELINE` tag (`docs/design/…dc.html:1125`) — and `viz` reads `profile.name` and never
`profile.role`. That is a one-line viewer change, and it is the whole fix.

### B1. `destination-panel` pins an unbounded queue to one car while the rest of the bank stands empty

The landing panel promises **every** unpromised waiter at a call to `carIds[0]` with no capacity
bound (`packages/core/src/sim/simulation.ts:1968`), and `#candidateCars` (`:3706`) then restricts
every later decision for that call to already-promised cars. A rider arriving later at a busy
landing **inherits other people's pin**. § D29 protects a *bumped* rider's assignment; it does not
say a *new* rider must be handed a full car.

Measured on vertical-city, at the moment of a bump: **81 riders promised to one car** at the median
(max 148, against a car holding 13–20), with **4 of 7 other cars in that bank idle and completely
empty** at the median — and an idle empty car standing *at that very landing* in 39–77 % of bumps.

Consequence, `vertical-city` / `office-day` (10 h), same trace as every other dispatcher:

| | 12 other dispatchers | `destination-panel` |
|---|---|---|
| delivered | 19 293 of 19 293 | **14 725** |
| still in the system | 0 | **4 597** |
| longest served wait | 570–4 240 s | **23 405 s** (6.5 h) |
| fleet travel | 912–1 642 km | **980 km** |

Riders piling up *while the fleet does less work*. It is not capacity — twelve other dispatchers
clear the identical trace. Median bumped leg is passed **100 times**; the maximum is 441.

**The pin is a defect on its own, and the double deck amplifies it.** Both halves were measured
separately, because the obvious isolation is confounded:

- *Standalone.* It reproduces with no double-deck car anywhere: `midtown-office` with 2 of 6 cars
  recalled at t=900 s — 11 of 13 dispatchers deliver 719 of 719; `destination-panel` times out with
  185 undelivered. And forcing `vertical-city`'s shuttles single-deck still leaves the panel at 19×
  the mean shuttle wait and 26× the p95 of `collective` on the same trace.
- *Amplification.* Making the shuttles single-deck converts `timed-out` to `completed` at 4 of 4
  seeds (40, 60 and 109 undelivered → 0), with broken promises per assigned leg falling 7.1–7.8 →
  0.9–2.2. **But that control is not clean**: dropping `doubleDeck` also drops `servesFloorPairs`,
  which frees routing (escalator hops 285 → 10). So the deck is confirmed as the *trigger*; it is
  not confirmed as the *mechanism*, and no mechanism sentence is offered here. Instrumenting
  `#promiseAllows` on a paired stop would settle it.

Per-deck load is ruled out as the driver: `doubleDeckDeckFullRefusals` under `destination-panel`
(55–89) sits in the same band as every other dispatcher (50–93).

**Recommendation:** bound the riders promised to one car by that car's capacity, and stop new
arrivals inheriting an existing pin. Until then, do not offer `destination-panel` on `vertical-city`
or `mixed-use-high-rise`, and do not offer it in combination with mid-run car withdrawal anywhere.

### B2. The dispatch layer is deck-blind, so an upper-deck call can never be answered by the car standing at it

`packages/core/src/dispatch/lifecycle.ts:607` compares floor ids literally:

```ts
if (car.floorId !== call.floorId || car.motion !== undefined) return decision(false, 'not-at-floor');
```

`CarSnapshot.floorId` is, by its own docstring, the **lower deck's** stop floor. The runner one line
earlier *is* deck-aware (`simulation.ts:2267`) and then hands the raw call to a stage that is not.
Grepping the whole dispatch layer for any deck-aware helper returns **zero hits**.

Measured on vertical-city: **2 441** broken promises with reason `not-at-floor`, **100 % of them at
an upper-deck floor**, the car→call floors being exactly the four declared pairs (`G→2` 2 390,
`26→27` 44, `51→52` 6, `76→77` 1), and **1 949 of them with the promised car completely empty**.

This is dispatcher-independent (`eta` produces 95 of them on the same trace) — only the panel turns
it into starvation, because B1 hands the call straight back to the same car. Presenting the call at
the car's stop floor drops broken promises 10 223 → 6 337 and the longest wait 2 662 → 1 381 s.

**Fixed.** Stage 6 now asks the model where the car's decks actually stand
(`stopFloorIdOf`, the same accessor `Car.stopFloorFor` delegates to — no second source of truth).
`not-at-floor` refusals go **45–126 per run to zero** under all 13 dispatchers, and the upper-deck
calls are *answered* rather than re-refused on direction (`direction-mismatch` fires zero times;
every shipped profile leaves `allowOppositeDirectionPickup` at its default). Deck counters stay
healthy. The seven single-deck buildings are **bit-identical** — the 39 baseline cells that moved
are exactly `vertical-city` × 13 × 3, which is the strongest control available.

### What B2's fix costs — two decisions for the reader

The fix is correct: a car standing at a floor should be able to answer a call there. But
`vertical-city` results were measured against a lift group that could not, so several published
figures move. **None has been re-pinned.**

1. **`destination-eta` leaves the Pareto front** at `vertical-city-up-peak` (`matrix.ts`
   `PINNED_FRONTS`); verdicts go 9/1/34 → 8/4/32 BETTER/INDISTINGUISHABLE/WORSE. If the fix is
   accepted, `docs/05-roadmap.md` § *What the matrix found* must move in the same commit —
   `matrixFront.test.ts` holds that register. **This is a phase-adjacent claim and it is your call.**
2. **Double-deck now makes significantly fewer car starts than single-deck.** The ceiling in
   `benchmark/doubleDeck.test.ts` for `up-peak-1.5pct` goes 90 → 52, and the assertion that
   double-deck *"costs energy … does not pay for it by serving fewer people"* now fails with
   `carStarts` coming back BETTER. That test's own comment says such a result *"would be a result …
   and must not pass silently"* — so this is **a new finding to adjudicate, not a pin to bump**.
   The interval was not captured, only the verdict.

Also moving: 176 fields across 44 keys in `published.ts` § matrix (all at `vertical-city-up-peak`,
none at the other seven, `n` unmoved — the § D150 fingerprint), three `vertical-city` census rows in
`doubleDeckSeam.test.ts`, and three traffic-identity digests. Representative magnitudes:
`nearest-car` mean wait 130.27 → 97.13 s; `collective` longest wait 408.61 → 148.64 s.

**Two related deck-blind defects were found and deliberately left.** `assessDirectionReversal` and
`isCommitted` are both deck-blind in the same file; fixing them alongside would have given the same
39 cells two causes and no attribution. `isCommitted` is the more interesting: its docstring is
already correct and the code is not, and several shipped profiles use
`reassignmentPolicy: "until-commitment"`, so an upper-deck call can be reassigned away from the car
about to serve it. Demonstrated; rate not measured.

### B3. A single Free Play run blocks the browser main thread for up to 70 seconds

`packages/viz/src/dev/main.ts:3116` `runShift()` is synchronous, and `record/recordRun.ts:136` is
the only `new Simulation` in the viewer — also synchronous. Only the Compare tab uses a worker.

Measured on `vertical-city` / `destination-panel` / `constant-iso` (7 200 s, the longest run the
menu offers): **31 s uncontended, 57–70 s under load**. There is no progress indicator and no
cancel. The configuration is two clicks from the menu. The deep-link `rate` parameter has **no
upper bound**, so a shared link can multiply it.

**Recommendation:** put `recordRun` on a worker, or gate on a pre-run cost estimate. This is the
top structural risk for a UI that adds bigger buildings or longer days.

### B4. The Parameters tab draws 114 live controls that bind nothing

`dev/main.ts:2404` calls `mountParameterForm({…})` and **discards the returned handle**.
`ParameterFormHandle.candidate()` — the only route from that form to a value — is called by nothing
in `packages/viz/src` or `packages/cli/src`. The values live in a closure local, not in
`ViewerState`, so the repo's own scope test cannot see them.

A player can drag `sim.patience.meanS`, `sim.doorObstructionProbability`,
`traffic.passengerMass.meanKg` — **114 controls across 12 schemas** — and no run changes. The status
line reads like a configurator. Nothing on screen says the values are not applied.

This is honestly declared in `docs/10-experience-layer-contract.md:1609` — but in a document, not on
the screen, which is exactly the shape CLAUDE.md's standing requirement exists to catch. **The new
UI's "simulation tweaks" will be read into this surface.**

---

## Significant — decide before shipping, not necessarily fix

### S1. `secure-tower` floor 30 can place none of its interfloor demand, in every single run

**312 of 312** secure-tower cells carry it, under all 13 dispatchers, all templates, all traffic
profiles, all seeds. The `executive` zone is `["30"]` with credential groups `exec` / `exec-escort`,
and those two groups appear in **no other zone** while floors 2–29 are all zoned. An executive can
reach the lobby and nothing else, so 56 origin-destination pairs are dropped.

The simulator says so in a warning naming the floor and the rate. But it means that on
`secure-tower`, **moving the interfloor slider changes nothing for floor 30's riders** — their share
is silently redistributed. A UI that exposes zone editing will manufacture more of these.

### S2. Three of the four service modes are one mode

`out-of-service`, `independent` and `fire-recall` are **behaviourally identical**. Measured across
336 configurations (8 buildings × 3 dispatchers × 14 withdrawal instants, 874 rider-legs aboard at
the switch): **zero configurations where any two of the three differ on the legs.**

`fire-recall` does not recall — the car neither travels to a designated level nor parks with doors
open. That gap is honestly declared in the source. `independent` is not: `acceptsCarCalls` returns
`true` for it, and that method **has no non-test caller anywhere in the tree**.

**Do not ship three "failure mode" buttons with one behaviour, and do not label anything "fire
recall" until it recalls.**

### S3. Two dispatcher names are silent aliases where a player will actually meet them

- **`garden-apartments` collapses the menu.** 12 of 78 dispatcher pairs are bit-identical at all
  three seeds; 45 of 78 under `evening-egress`. `auction`, `auction-multi-round`, `capacity-aware`,
  `destination-eta` and `destination-panel` are mutually indistinguishable. Cause is thin trace, not
  structure — at 40 % arrival rate, 0 of 78 pairs are identical at any of 5 seeds. The building
  generates 26 legs in the default window; there are not enough decisions to separate strategies.
- **`fairness-first` becomes `eta` on `chancery-house`** at 2 of 3 seeds. Its weights are
  `waitTime 0.5 + starvation 0.5`, and an argmin is invariant under a positive scalar — so when the
  starvation term never fires, the profile *is* `eta`. On `secure-tower` the starvation term is dead
  in all 436 legs and the profile still differs from `eta`, but only through its stage settings, not
  through fairness.

In both cases the player picks a name and the run does not change.

### S3b. `vertical-city.json` describes a deck-balancing mechanism the code does not have

The building's own `notes` say *"Zones 5 and 6 board from either level of their sky lobby, so their
deck choice is pure load balancing between the decks."* Nothing balances. Measured, identical to the
person under all 13 dispatchers — **and the seed is named, because an earlier draft of this table
quoted two seeds' figures as one and they are not the same numbers**:

| sky lobby | seed 20260810 | seed 20270000 |
|---|---|---|
| B (51 / 52) | 196 / **7** | 206 / **9** |
| C (76 / 77) | 61 / **1** | 83 / **1** |

Both reproduce; 96–99 % of boardings are on the lower deck either way.

The level is fixed by `traffic/route.ts`'s breadth-first search with a **declared-order tie-break at
trace-generation time**, before any dispatcher sees the journey — and `servesFloors` lists 51 before
52, 76 before 77. The dispatcher is deck-aware for *pricing* only (`estimateCost.ts:227`) and never
*chooses* a deck.

This is the "stated mechanism goes stale" class CLAUDE.md pins, in shipped data. It matters here
because the new UI will otherwise render a deck-balancing story that is not there.

Related and measured: the tower's ~2.5 : 1 lower/upper boarding split is **caused by the ground
escalator**, not by dispatch. At seed 20260810 the split is 753 / 307; strip `lobby-escalator` and
it moves to **1 016 / 44**, all of the movement at the ground lobby with the sky lobbies unmoved.
The upper deck's load is almost entirely riders who walk G→2 and board there. Two of the four
escalators (`sky-lobby-b`, `sky-lobby-c`) carry **nobody in any run**; removing both leaves the run
byte-identical. The building's own `$comment` declares this, so it is documented rather than broken
— but a UI that draws four escalators will be drawing two that never move anyone.

### S3c. A mis-wired bank silently *reduces demand* instead of erroring

Dropping floor `26` from `zone-3-local.servesFloors` loads clean and takes `generated` from **1 833
to 1 570**: 263 journeys had no route and were dropped.

**Two corrections to this finding as first written.** The claim that nothing appeared in
`result.warnings` does not reproduce — that mutation raises **13** run-time warnings, including the
rejection census, and the audit harness does flag it. Run-time coverage was already consistent with
`secure-tower`'s floor-30 case; **what was missing was the load-time half**, and that is the real
defect. And the `zone-6-local` example was the wrong mutation: dropping `76` *or* `77` changes
nothing at all — byte-identical, 3 061 legs — because the zone still hangs off the other level of
sky lobby C. Dropping a populated floor such as `80` reproduces the shape.

So this is the sibling of S4's silent-unreachability finding, one level down — the *bank* edit
rather than the *floor* edit — and it is the single most likely mistake a player makes in a building
editor. **Fixed:** the loader now runs a real connectivity check at resolve time.

### S4. A new *building* is fine; a new **building type** is five code sites

Three new buildings were authored from scratch — including feature combinations no shipped building
has — and ran all 13 dispatchers with no throw, no imbalance, no deck mismatch. **Adding a building
works.**

Adding a *type* does not. `BUILDING_TYPES` is a closed set enforced by two `z.enum`/`strictObject`
whitelists and two duplicated `switch`es over passenger transfer time, plus a viz-side lookup that
**silently defaults an unknown type to the office 1.2 s**. The loader's own error message tells the
author to "add the type to the reference table" — an instruction the schema then refuses.

Worse for a UI that authors buildings at runtime: **a building whose floors are unreachable loads
with no error and no warning.** Stripping `isTransferFloor` from a lobby left 72 % of
origin-destination pairs unroutable and `loadConfig` accepted it silently. The connectivity check
that would catch this exists — but it is a *test* bound to the on-disk data directory, so it covers
the eight shipped files and nothing a UI creates.

### S5. The editor round-trip silently deletes hardware from shipped buildings

`specFromBuilding` → `BuildingSpec` → `buildingFromSpec` has no field for `doubleDeck`,
`servesFloorPairs`, `serviceEvents`, per-car spec/speed/load, or the lobby transfer flag. Measured:

| building | | banks | cars | transfers | double-deck paired stops |
|---|---|---|---|---|---|
| `vertical-city` | authored | 7 | 35 | 1 228 | **460** |
| | after round-trip | 8 | **12** | 248 | **0** |
| `pillar-tower` | authored | **6** | 6 | 0 | 0 |
| | after round-trip | **1** | 6 | 0 | 0 |

Both 6 m/s double-deck shuttles become 0.75 m/s hydraulics. Bounded by the fact that saving
allocates a new id, so nothing on disk is corrupted — but a player who opens a shipped building,
nudges a slider and saves gets a building that has quietly lost its hardware.

---

## Shuttles, sky lobbies, double decks and escalators — all healthy under all 13

The specifically-asked-about mechanisms live in three buildings. Mean per run over three seeds, on
each building's own traffic:

**`vertical-city`** — 100 floors, 7 banks, 8 double-deck shuttles, 4 two-level sky lobbies with
escalators:

| dispatcher | transfers | escalator hops | deck stops | **paired** | lower-deck boardings | upper-deck | **deck mismatches** | deck-full refusals |
|---|---|---|---|---|---|---|---|---|
| `eta` | 1 266 | 285 | 472 | **472** | 773 | 305 | **0** | 70 |
| `fairness-first` | 1 266 | 285 | 465 | **465** | 773 | 305 | **0** | 67 |
| `collective` | 1 266 | 285 | 455 | **455** | 773 | 305 | **0** | 61 |
| `destination-eta` | 1 266 | 285 | 449 | **449** | 773 | 305 | **0** | 68 |
| `capacity-aware` | 1 266 | 285 | 439 | **439** | 773 | 305 | **0** | 65 |
| `collective-enroute` | 1 266 | 285 | 428 | **428** | 773 | 305 | **0** | 56 |
| `auction` | 1 266 | 285 | 420 | **420** | 773 | 305 | **0** | 43 |
| `destination-panel` | 1 236 | 285 | 418 | **418** | 752 | 303 | **0** | 77 |
| `auction-multi-round` | 1 266 | 285 | 417 | **417** | 773 | 305 | **0** | 42 |
| `predictive-balanced` | 1 266 | 285 | 405 | **405** | 773 | 305 | **0** | 37 |
| `energy-aware` | 1 266 | 285 | 401 | **401** | 773 | 305 | **0** | 51 |
| `zoned-uppeak` | 1 266 | 285 | 393 | **393** | 773 | 305 | **0** | 79 |
| `nearest-car` | 1 266 | 285 | 388 | **388** | 773 | 305 | **0** | 65 |

Three things to read off it:

- **`paired` equals `deck stops` in every row.** Every deck stop opens both decks; the second deck
  is never dead weight, under any dispatcher.
- **`deckMismatchLegs` is 0 in every row.** Nobody ever boards a deck that does not serve their
  floor.
- **The lower/upper split is 773 / 305 — identical to the person across twelve of the thirteen.**
  That 2.5:1 asymmetry is therefore a property of the building's route tree, not of dispatch: more
  journeys legitimately need the lower deck (`G ↔ 26 / 51 / 76`) than the upper (`2 ↔ 27 / 52 / 77`).
  It is not a dispatcher under-using a deck.

**`mixed-use-high-rise`** — 178 transfers under all 13, identical. Its shuttles are single-deck, so
the deck counters are correctly zero. **`st-jude-hospital`** — 15 escalator hops and 15 stairs
journeys under all 13, identical. The two numbers coincide because a stairs journey *is* accounted
as a transport hop; it is one population counted consistently, not a double count.

**Express running cannot be broken by a dispatcher, because it is not a dispatch decision.** It is
enforced by the bank's `servesFloors` list: `vertical-city`'s shuttle serves exactly 8 of 100 floors
(the ground pair plus the three sky-lobby pairs), and `mixed-use-high-rise`'s serves exactly 2 of
60. A shuttle physically cannot stop at floor 40 — the bank does not serve it.

Measured on the moves rather than assumed: `vertical-city`'s shuttle has 4 stop positions, and only
**5 distinct move distances exist** — 92, 106, 197, 211 and 303 m, exactly the inter-lobby gaps and
their sums. **18–33 % of shuttle moves skip at least one sky lobby** under all 13 dispatchers
(lowest `collective-enroute` 18.0 %, highest `destination-panel` 32.8 %), at 127–150 m per move
against the zone locals' 17–29 m. The locals are not all-stops either — only 28–48 % of their moves
are single-floor. `mixed-use-high-rise`'s 2-floor shuttle moves 126.0 m every time, under all 13.

**Nobody is stranded at a sky lobby.** On every run that completes, riders left at a transfer floor
equal `accessRefused` *exactly* (309 = 309 under both `eta` and `collective`, pooled over 12 cells)
— i.e. every one is a credential refusal, not a lift failing to arrive. Across all 13 dispatchers
only 8 journeys ever end with `reason: 'transferring'`, all of them `destination-panel`. Aggregate
second-leg wait is *lower* than first-leg wait for 11 of 13, so there is no systematic transfer
penalty. The one bad floor is **27**, whose transfer dwell runs 86–155 s against floor 26's 31–55 s
under 12 of 13 — and that is geometry, not dispatch: zone-4-local's served floors start 50.7 m above
its sky lobby where zone-3-local's start 9.0 m above.

The one deck-adjacent defect found is **B2** above, and it lives in the dispatch layer rather than
in the deck model.

## Cleared — chased and explained, no action needed

- **The throw-on-timeout risk does not exist.** Every shipped entry point — all six CLI commands,
  the experiments runner, all four viz run paths, and both server verify paths — passes
  `onTimeout: 'report'`. Reproduced through the real CLI: a timed-out run exits **0** with a
  `SATURATED` banner and a suppressed AWT. The viewer surfaces status, undelivered count and
  warnings in four places. *But:* the property held by hand-written repetition with **almost** no
  test asserting it — and both halves of that sentence were wrong as first written. The domain is
  not "five literals in five files" nor the "nine in nine" this report later said: measured by a
  scanner that parses the field list out of `sim/types.ts` rather than transcribing it, it is
  **23 literals in 19 files**, the fourteen unlisted ones being `benchmark/`'s study configs,
  `reports/replay.ts`, `validation/golden.ts` and the oracle. And one producer of the 23 *was*
  already asserted, at `viz/src/campaign/campaign.test.ts:252`. **Now guarded across all 23.**
- **Raising `drainGraceS` would buy nothing.** Of 64 timed-out cells, 17 are drain-tail remainders
  (2–40 undelivered, all convertible with +600 s) and 33 are genuine runaways; 14 are not
  deadline-limited at all. For every convertible cell the reported figures were **unchanged** —
  still saturated, still suppressed. The deadline is deciding a word on screen, not a number.
- **Zero in-service cars terminates promptly** — 18–112 ms, at the demand horizon, books balanced,
  nobody lost. No hang risk.
- **Riders are not stranded in a withdrawn car.** 874 rider-legs were aboard at the instant of
  withdrawal across 336 configurations; **all were delivered**. The docstring at
  `simulation.ts:1298` says the opposite and is stale.
- **No floor in any shipped building is unreachable.** All 37 flagged floors are 1–2 lift legs from
  an entrance and every one was alighted on in a longer run. 454 of the original 468 warnings were a
  defect in the audit harness, not the product.
- **Access refusals are exactly dispatcher-invariant** — one refusal count per building across all
  13, and across every failure mode. Correct: the credential is checked at the landing before
  dispatch. No building refuses everybody.
- **`stranded-in-car` is benign.** All 62 occurrences are on `timed-out` runs, with the rider having
  boarded 0–189 s before the clock ran out. The error-severity twin, `stranded-on-completed-run`,
  fired zero times — and is tautologically unreachable by construction, which is correct for an
  invariant guard.
- **The multi-round auction machinery is live** and needs no `dispatcherOptions` from the player
  path. Forcing `rounds: 1` makes it bit-identical to `auction` in 24 of 24 cells; at shipped
  settings it diverges from argmin 8–410 times per run.
- **The predictor is fed in all 168 cells that touch `predictive-balanced`**, and `predictedDemand`
  changes decisions in 7 of 8 buildings.
- **The long waits themselves are capacity, not starvation.** Of 169 080 long-wait legs across 472
  cells, **none** occurred while the fleet that could serve the rider was idle: the longest stretch
  during which no serving car completed a move was **72.4 s**, against a 180 s bar. The two
  questions are genuinely separate — the *fleet* is working during those waits; the finding above
  is that *individual cars within it* are not.
- **No rider was ever passed by the car holding their landing call while it had room.** Zero
  occurrences in every cell examined, reconstructed from the fleet snapshots the dispatcher is
  handed. Cases that first looked like it were two known confounds: a double-deck car at whole-car
  load factor 0.40 is a **full lower deck** at its own design load, and a destination-panel rider
  cannot board a car other than the one they were promised.
- **Floor-level and direction-level starvation are essentially absent.** Exactly one (floor, cell)
  pair in 472 has a floor p95 wait ≥ 5× the building's. The worst floors per building are the
  entrances — i.e. where the demand is. Under a 90 %-down stress the minority direction is served
  *better*, not starved.
- **The `starvation` cost term is live**: moving that weight alone changes the legs in 7 of 8
  buildings and compresses the upper tail. (A liveness measurement, not a performance claim.)

---

## The audit's own instrument, and why this report is trustworthy

The first pass of this sweep reported **2 483 of 2 496 cells clean**. That number was wrong, and
finding out why was the single most valuable thing the parallel lanes did.

- A **car-id namespace mismatch** — `bank.cars[].id` is `"A"`, `record.carIds` is `"main-A"` —
  meant the lookup resolved **0 of 79 cars in all 8 buildings**, silently disabling `dead-car`,
  `car-carried-nobody`, `stuck-car-with-queue` and all four double-deck checks.
- The stacked-lobby check was **also** wrong after that: it took `min(waiting)` across the gap
  between two travel samples, and a gap's edges are exactly the moments a queue is low. Ten injected
  parked-car faults: it caught three.
- It read the per-bank queue from `QueueSample.byFloorId`, which **no non-test caller ever
  populates**, so the per-bank branch was dead and every car was charged with the whole building's
  queue.
- `floor-never-reached` counted riders who were turned away at a credential reader as riders the
  lifts failed to carry — 454 of its 468 hits.
- It could not see an unreachable floor **at all**, because the generator drops unroutable demand
  before a leg exists. Three injected unreachability faults went undetected. The evidence was in
  `result.warnings` the whole time.
- After those fixes, two more: it charged a bank with riders standing in a **shared lobby bound for
  floors that bank's shaft cannot reach** (inflating 1 000 of 2 077 car findings, by up to 5 457
  riders), and it treated a **restore** event as erasing the withdrawal that preceded it, so every
  `withdraw-restore` cell reported an idle window that was exactly the withdrawal window.

All seven are fixed. Every check has since been shown to go red on an injected fault and stay green
on a clean control — and the cleanest control available is used for the headline finding: the same
building, the same seed and the same trace fire under `nearest-car` and stay silent under
`collective`.

**A check that cannot fail is not evidence.** That rule is this repository's, and it caught the
auditor more often than it caught the product. The first pass of this sweep would have told you
everything was fine.

---

## If there is time for only a few things

Ordered by risk-to-the-release per hour of work. None of this is implemented — the audit changed no
product source.

1. **Gate, don't fix, the two bad dispatchers.** Hiding or labelling `nearest-car` and
   `destination-panel` on the buildings where they fail is minutes of work and removes the two
   worst findings from the player's reach. Fixing B1 properly is a real change to
   `#tellThePanel`/`#candidateCars` and should not be rushed the night before a release.
2. **Put `recordRun` on a worker (B3).** A 70-second frozen tab is the failure a player cannot work
   around or misinterpret. Compare already has the worker; the shift path does not.
3. **Say something on the Parameters tab (B4).** One sentence on screen — "these values are not yet
   applied to the run" — converts a 114-control lie into a declared gap. The real wiring can follow.
4. **Add the `onTimeout: 'report'` guard test.** Five hand-written literals in five files, no
   assertion, and the new UI is the sixth surface. One test.
5. **Take B2** (`lifecycle.ts:607` deck-blindness). Small, self-contained, dispatcher-wide, and it
   is a correctness fix whether or not B1 is addressed.
6. **Decide about the three identical service modes (S2)** before any failure-mode UI is drawn.
   Shipping three buttons with one behaviour is harder to walk back than shipping one.

Everything else — S1, S3, S4, S5 — is safe to carry into the release as known and documented, so
long as it *is* documented.

## Reproducing any of this

```bash
node scripts/opcheck/matrix.mjs /tmp/opcheck --slices 10 --set all
```

Then run the slices in parallel and aggregate:

```bash
for i in $(seq 0 9); do node scripts/opcheck/opcheck.mjs --cells /tmp/opcheck/slice-$i.json --out /tmp/opcheck/slice-$i.ndjson & done; wait
```

```bash
node scripts/opcheck/report.mjs /tmp/opcheck
```

A single cell, with the full fact sheet:

```bash
node scripts/opcheck/opcheck.mjs --building vertical-city --dispatcher destination-panel --seed 20270000 --pretty
```

**Regression baseline.** `scripts/opcheck/baseline.json` pins how every dispatcher operates in every
building at three seeds — who boarded, which car, which bank, how far each car drove. It records
*operation*, never quality: a dispatcher that gets faster is not a regression, a bank that stops
serving is. After the UI lands:

```bash
node scripts/opcheck/baseline.mjs check scripts/opcheck/baseline.json
```

It exits 1 on any difference and prints what moved. A difference is not automatically a bug — it is
automatically something a human has to have decided to do.
