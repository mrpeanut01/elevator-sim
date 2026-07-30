# TWIN shafts — the locked contract, written before the implementation

**Status: design only. No production code was written for this document, and nothing in it was
measured.**
**Owner: T52 (wave 6). Date: 2026-07-28. Baseline: `63186a8`, plus lane T44's deck geometry, which
is present on this tree.**

A **TWIN** shaft carries **two independently driven cars on one set of guide rails in one hoistway**.
It is not the double-deck car lane T44 made simulatable: a double deck is *two cabs bolted into one
frame*, one position, one drive, a fixed offset. A TWIN is *two lifts sharing a hole*, two positions,
two drives, and a separation that has to be maintained by the control system rather than by the
steel. The decision taken by the owner is **design it now, build it after wave 6 closes**, and this
document is that design.

It is written in the manner of [`docs/09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md) —
a locked interface contract, a measured comparison design, and the open questions that gate
implementation — with one difference that must be stated at the top rather than discovered at the
bottom.

> **`docs/09` could open with a table of claims *verified by running the code*. This one cannot.**
> This lane was scoped to write no production code and to run no simulation or benchmark, because a
> heavy measuring lane was running concurrently and a campaign statistic taken off a tree somebody
> else is mid-edit in is not a measurement ([§ D130](../DECISIONS.md) records that exact discipline).
> So every claim below is one of three kinds and is **labelled as one**:
>
> | label | means |
> |---|---|
> | **verified in code** | read at a named file and line on this tree. Not run |
> | **reference data** | taken from published literature or a manufacturer's own material, cited in § Sources, **not measured here** |
> | **proposed** / **unmeasured** | this document's design, or a question it declines to answer |
>
> **No performance figure in this document is a result of this project.** Where the literature gives
> a number it is quoted with its source and marked reference data. Where it gives none — and for the
> two quantities that matter most it gives none — this document says so instead of inventing one.

---

## 0. What the code already does — verified in code, not read from the docs

Nine facts a TWIN plan will otherwise get wrong. Each was checked by reading the named file at the
named line on this tree.

| # | Claim | Verdict |
|---|---|---|
| 1 | **A shaft is not an object today. It is a per-car value derived from the bank.** | **TRUE.** `sim/simulation.ts:643` calls `shaftForBank(resolved, context.bankId)` **inside the per-car factory**, so four cars in a bank get four structurally identical but distinct `CarShaft` values. Nothing in `core/` represents "these two cars are in the same physical hole" |
| 2 | `CarShaft` carries geometry and zoning, and no occupancy | **TRUE.** `model/car/types.ts:103-140`: floors, indices, access groups, and T44's deck maps. No car id, no position, no reference to any `Car`. Its docstring calls it *"immutable building fabric, built once and shared by reference"* |
| 3 | **`Car.departFor` cannot refuse or defer.** It either moves or throws | **TRUE.** `model/car/car.ts:598-650` throws on already-moving, doors not shut, overloaded, floor not served, already there. There is no "not yet" return value, and every throw is a programming error rather than a schedulable condition |
| 4 | **There is exactly one chokepoint through which a car moves** | **TRUE.** `sim/simulation.ts:2528` `#depart`. Its own comment (2548-2554) says it is *"the only place in the shipped path where a completed move is observable"*, and that **stage-7 repositioning goes through it too**. It already returns silently on `!car.canStart` and on `car.floorId === target` — so a *refusal* path exists in shape today, and a *deferral* path does not |
| 5 | **A blocked car has no wake-up.** The arrival event re-steps only the car that arrived | **TRUE.** `simulation.ts:2556` steps `arriving` and nothing else. A whole bank is re-stepped only inside `#dispatchBank` (`1471`), which runs on a dispatch tick. A car that declined to depart would sit there until an unrelated tick happened to wake it |
| 6 | **`estimateCost` can see exactly one car** | **TRUE.** `model/car/estimateCost.ts` is a free function over `(CarSnapshot, CostRequest)`; `CarSnapshot` (`types.ts:618-655`) has *"no methods, no back-reference to the {@link Car} that produced it, no `Rng`, and no scheduler"*. There is no handle through which the twin's state could be reached — which is the purity mechanism and also the exact obstacle § 4 has to solve |
| 7 | **Not every infeasibility reason is permanent, and the code already knows it** | **TRUE.** `INFEASIBILITY_REASONS` has seven values (`types.ts:713-728`); `STRUCTURAL_INELIGIBILITY` (`simulation.ts:229-234`) names **four**, and `simulation.ts:1096` says `serviceMode` is *"deliberately absent"* so a returning car is found again. A structural reason stops the retry timer (`#markUnservable`); a transient one does not |
| 8 | **Double-deck geometry is static and authored, in two places** | **TRUE.** `CarConfig.deckSeparationM` (`config/types.ts:698`) and `BankConfig.servesFloorPairs` (`711-722`). Both are constants for the run. A TWIN clearance is not |
| 9 | **No run record carries a car-position series** | **TRUE, and documented.** [`docs/07-handoff.md`](07-handoff.md) § 5 records `mixed-use-high-rise/residential-local` as unmeasurable because *"the fix is a car-position series, which no run record carries"*. § 3.4 below turns that from a note into a dependency |

**The consequence, and it is the most useful thing this document says up front: TWIN is not a car
feature. It is a *shaft* feature in a codebase that has no shafts, and its whole risk is
concentrated in two files — `model/car/types.ts` and `sim/simulation.ts` — one of which the
repository has already recorded as the cause of its largest defect.**

---

## 1. The model

### 1.1 A shaft becomes a first-class object

**Proposed.** `CarShaft` today answers *"which floors does this open onto, and who may reach them"*.
It gains an identity and an occupancy:

```
ShaftId          = string                    // unique within a bank
CarShaft {
  + readonly id: ShaftId
  + readonly carIds: readonly [string] | readonly [string, string]   // lower first
  + readonly separation?: ShaftSeparation | undefined                // absent ⇒ single-car
}
ShaftSeparation {
  readonly standingClearanceM: number   // two cars levelled and standing, floor to floor
  readonly bufferM: number              // added to the computed braking distance while moving
}
```

Three properties are deliberate and each is a lesson taken from T44:

- **`carIds` is a tuple, not a set, and it is ordered lower-first.** The order is a physical fact
  that INV-TWIN-1 (§ 3.1) forbids from changing, so it is expressed in the type rather than
  recomputed from positions. A `readonly string[]` would let a three-car shaft typecheck, and a
  three-car shaft is a different system with a different safety argument.
- **`separation` is `undefined` on a single-car shaft, and every helper short-circuits on it.**
  This is verbatim T44's structural trick — *"every collection below is empty when it is `false` …
  not an assertion, a structural property"* (`types.ts:113-122`) — and it is what makes
  "every building without a TWIN shaft produces a bit-identical run" a property of the shape rather
  than a claim in a docstring.
- **The clearance is in metres, not floors.** Floor pitch is authored per floor (`createShaft`
  requires `heightM` to increase strictly with `index` but never requires a constant step) and this
  repository ships buildings with mixed pitch. A separation rule in floor indices is therefore *not*
  equivalent to one in metres, and the physical constraint is a braking-distance constraint, which is
  metres. `CarShaft`'s own docstring already draws exactly this distinction — *"`index` is the shaft
  order the dispatcher means by 'up'; `heightM` is the distance the car physically travels"* — and
  the separation constraint is on the second.

### 1.2 What changes, precisely

**Proposed. Additive except for one signature.**

| Symbol | File | Change |
|---|---|---|
| `CarShaft` | `core/src/model/car/types.ts` | `id`, `carIds`, `separation?` as above |
| `createShaft` | same | takes `ShaftOptions.carIds` and `ShaftOptions.separation`; **throws** if `separation` is present and `carIds` has length 1, and if `standingClearanceM` is not positive |
| `shaftForBank` | same | **breaking, and it is the only breaking change in `core`.** Signature becomes `shaftsForBank(building, bankId): readonly CarShaft[]`, returning one shaft per declared shaft rather than one shaft per call. `shaftForBank` is retained only if it can be defined as "the single shaft of a bank that declares one", and **deleted otherwise** — a helper that silently returns the first of two is how a TWIN building gets simulated as a conventional one |
| the car factory | `core/src/sim/simulation.ts:636-656` | assigns each car the shaft it is *in*, instead of building a fresh one per car |
| `BankConfig` | `core/src/config/types.ts:711` | `shafts?: readonly ShaftConfig[]`. Absent ⇒ today's meaning exactly: one shaft per car, no separation |
| `ShaftConfig` | same | `{ id, carIds: [string] \| [string, string], standingClearanceM?, bufferM? }` |
| `ResolvedBank` | `config/types.ts:872` | `shafts: readonly ResolvedShaft[]`, always populated — a bank with no `shafts` block resolves to one single-car shaft per car, so the runtime has one representation and the *absence* is handled by the loader rather than by every consumer |
| `INFEASIBILITY_REASONS` | `model/car/types.ts:713` | `'shaftBlocked'` — see § 4.3, and note § 3.5 for what must **not** happen to `STRUCTURAL_INELIGIBILITY` |
| `CarSnapshot` | `model/car/types.ts:618` | `shaftMate?: ShaftMateSnapshot` — § 4.2 |
| `StageActivity` | `core/src/sim/types.ts` | four counters: departures deferred by separation, decisions in which the mate changed the argmin, clearing moves commanded, and separation checks evaluated. These are the liveness evidence § 6 gates on, and they exist so it is *counted* rather than argued |

**Explicitly unchanged, and the design is void if any of these move:**

- `Car.estimateCost()` stays pure (invariant 1). § 4.2 is the whole argument.
- `Car` gains no reference to another `Car`. The mate reaches the estimator as a frozen value and
  reaches the movement layer through the `Simulation`, which already holds every car.
- Cost terms remain weight vectors in `data/dispatcher-profiles.json` (invariant 7). TWIN introduces
  **at most one** genuinely new cost term (§ 4.4) and no `if (shaft.isTwin)` branch in a policy.
- The trace streams. A TWIN run at seed *s* must draw the identical passenger population a
  conventional run at seed *s* draws (invariant 2, and `docs/09` § 2.4's stream-neutrality test).
  Nothing in this design draws a random number.

### 1.3 The same shape as double-deck in one respect, and the opposite in the other

This is worth stating precisely, because "it is like double-deck" is the sentence that will produce
the wrong implementation.

| | double-deck (T44, landed) | TWIN (this document) |
|---|---|---|
| positions per shaft | **one** | **two** |
| coupling | `pos(upper) = pos(lower) + deckSeparationM`, **always**, and it is not enforced because it cannot be violated | `pos(upper) ≥ pos(lower) + clearance(t)`, **an inequality that must be enforced** |
| what it adds to the model | *geometry* — a normalization (`stopFloorIdOf`) and a dwell split | *a constraint* — a predicate over two cars' futures |
| where it lands in the code | the shaft's floor maps and five normalization boundaries in `Car` | the movement chokepoint, the feasibility filter, and the group controller |
| what it costs at a stop | a stop serves two floors, so `(S+1)` overcounts and the dwell is the busier deck | a stop *blocks the other car*, so a stop's cost is no longer a property of the stopping car alone |
| refusal | a cross-deck leg is refused, and the refusal is **static** — the deck map never changes | a blocked leg is refused, and the refusal is **dynamic** — the same leg is legal a second later |

**The last row is the whole difficulty.** T44's refusal is safe because the reachable set of a
double-deck car is a constant of the building; a leg it refuses at t=0 it refuses forever, and P5's
servability question has a stable answer. A TWIN car's reachable set is a function of the other
car's commitments, so a refusal is a *statement about right now*, and treating it as permanent is
precisely the defect [§ D130](../DECISIONS.md) records under `C35` — a call refused for a reason the
group then filed as structural, stranding a queue nobody could serve.

---

## 2. The separation constraint

### 2.1 Two constraints, not one

**Proposed, informed by the reference data in § Sources.**

> **C-ORDER.** For a shaft with cars `(lower, upper)`, at every simulated instant `t`:
> `height(lower, t) < height(upper, t)`. The cars never swap order and never pass.
>
> **C-CLEAR.** At every simulated instant `t`:
> `height(upper, t) − height(lower, t) ≥ clearance(lower, upper, t)`,
> where `clearance` is the **standing clearance** when both cars are stationary, and the standing
> clearance **plus the approaching car's stopping distance plus `bufferM`** when either is moving
> toward the other.

C-ORDER is implied by C-CLEAR whenever the clearance is positive, and it is stated separately
anyway, because it is the one an implementation can assert cheaply on every event and because a
violation of it is a *different bug* — a crossing is a modelling failure, a clearance breach is a
control failure.

**The literature agrees that these are two quantities and not one.** Gerstenmeyer and Peters (2016)
give *"the minimum distance possible between two cars while levelling and standing at floors as well
as the possible distance between cars while travelling during normal operation"* as two separately
calculated results — **reference data; the paper's full text was not read here and no numeric value
from it is quoted.** The Mitsubishi Electric Research Laboratories motion-planning patent states the
static half as `d ≥ the distance between consecutive floors` and expresses the dynamic half through a
deceleration term of the form `ẋ²/2a` — **reference data**.

### 2.2 The stopping distance comes from the S-curve model, and that is the point

`CLAUDE.md` § Modeling rules insists on jerk- and acceleration-limited motion because *"a simulator
that ignores this will wrongly conclude faster elevators always help"*. TWIN puts that model on the
critical path of a **safety** constraint rather than only of an ETA, which is the first time in this
project that the motion model decides whether a move is *legal* rather than how long it takes.

**Proposed.** The stopping distance is derived from the existing motion primitives and **no new
kinematics are written**:

- `physics/motion/sCurve.ts` already exports `buildProfile`, `travelTime`, `speedAt`, `velocityAt`,
  `positionAt` and `kinematicsAt` over a `MotionProfile`, and `Car.kinematicsAt(t)` (`car.ts:563`)
  returns absolute height, signed velocity and acceleration at any `t` **without advancing anything**.
- The emergency stopping distance at `t` is a function of `velocityAt(t)` and a declared emergency
  deceleration. **It is not the comfort deceleration**: `MotionConstraints` describes the ride the
  passenger gets, and a safety stop is not that ride. So it is a new *car* tunable —
  `motion.emergencyDecelerationMps2` — declared in the parameter schema with type, range, default and
  unit (invariant 8), **not** a dispatcher weight (invariant 7 puts strategy in data; this is
  hardware).
- **A conservative closed form is used, not the profile integral.** The braking distance under
  constant deceleration `a` from speed `v` is `v²/2a`; the jerk-limited stop is *longer*, so the
  constant-`a` figure is the optimistic one and must be padded by `bufferM` rather than used bare.
  **Whether `bufferM` is calibrated against the jerk-limited stop, or the jerk-limited stop is
  integrated directly, is OQ-3.** This document does not guess a number for it.

**A note that is easy to get wrong and expensive to discover late:** `positionAt` and `kinematicsAt`
are *analytic* — they evaluate the profile at an arbitrary `t` with no kernel event in between
(`car.ts:530-547`). That is what makes a continuous-time separation check possible at all. It is also
what makes a **sampled** check dishonest: two cars can breach the clearance entirely between two
kernel events and both endpoints look clean. § 3.4 addresses this.

### 2.3 Where the constraint is expressed, and where it is checked

**Proposed. Three places, with three different jobs, and conflating them is how this ships broken.**

| # | Where | Job | Cost |
|---|---|---|---|
| 1 | `estimateCost` — a **feasibility filter** | Refuse to *price* a call the mate makes unreachable. Returns `feasible: false`, `infeasibleReason: 'shaftBlocked'`, `etaSeconds: Infinity` | O(1) against the mate's envelope (§ 4.2). Called thousands of times per decision, so it may not be more |
| 2 | `Simulation.#depart` — a **movement gate** | Refuse to *command* a move that would breach C-CLEAR before it completes. The last line of defence and the only one that is authoritative | Once per commanded move |
| 3 | `fuzz/properties.ts` — a **property** | Assert C-ORDER and C-CLEAR held over a whole run, from evidence the run emitted | Once per fuzz case |

**(1) may be wrong and the run is merely inefficient. (2) may not be wrong.** Gate 2 is the analogue
of `Car.canStart`, which the code already documents as *"checked here rather than left to the
dispatcher because it is a car function that no dispatcher setting may override"* (`car.ts:576-586`).
No dispatcher weight, no profile, and no tuning run may make gate 2 pass.

**Gate 2 lands in `#depart` and not in `Car.departFor`.** `departFor` sees one car; the constraint is
a fact about two. Pushing it into `Car` would require a `Car` to hold a reference to another `Car`,
which breaks the snapshot discipline in the one class that has most carefully avoided it. `#depart`
already holds the whole building.

### 2.4 What happens when a departure would violate it — the part `departFor` cannot do

**Verified in code:** `departFor` throws or moves; it has no third answer (§ 0 row 3). `#depart` has
one — it already `return`s silently when `!car.canStart`.

**Proposed.** `#depart` gains a **deferral**, not a refusal, and the difference is the entire liveness
argument:

```
#depart(car, floorId, at):
    ... existing guards ...
    blockedUntil = separationBlock(shaft, car, target, at)     // undefined ⇒ legal
    if blockedUntil is defined:
        record stageActivity.separationDeferrals += 1
        register (car, target) on the shaft's wake list
        return                                  // the car does NOT move, and does NOT lose the stop
```

Three requirements on that, each of which is a way it goes wrong:

1. **The car keeps its commitment.** A deferred departure must not discard the stop, hand the call
   back, or mark anything unservable. The car is *waiting*, and `committedStops()` is unchanged.
2. **The car must be woken.** § 0 row 5 is the trap: nothing re-steps a car that declined to move.
   The wake must be **event-driven and not a poll** — when the mate completes an arrival
   (`carArrivedEvent`, `simulation.ts:2544-2557`) or completes a stop, every car on that shaft's wake
   list is re-stepped through `#stepCar`. A `dispatchRetryS` poll would work and is **rejected**: it
   makes the deferral's cost a function of an unrelated tunable, and it would put a TWIN building's
   results on a knob that means something else everywhere in the repository.
3. **The deferral must be bounded and observable.** A car deferred for longer than a declared bound
   is a deadlock in progress. `#depart` records the deferral start; the run's own diagnosis reports
   the longest single deferral, in the same way the simulator already reports a structurally
   unservable landing rather than papering over it (`simulation.ts:1561-1571`).

**Rejected alternative: reserving the shaft segment at assignment time and refusing to assign
otherwise.** It removes the deferral, and it also removes the flexibility the hardware exists to
provide — a car may not commit to a floor merely because the mate *might* want the segment. It is
recorded here because it is the obvious first design and because rejecting it is a decision, not an
oversight.

---

## 3. Deadlock — the design's biggest risk, stated as an invariant

### 3.1 The invariants

> **INV-TWIN-1 (safety).** C-ORDER and C-CLEAR (§ 2.1) hold at **every** instant of the run, not at
> every sampled instant.
>
> **INV-TWIN-2 (liveness).** No car holds a commitment it cannot discharge. Formally: for every car
> `c` and every stop `f` in `c.committedStops()`, there exists a finite sequence of moves, each legal
> under INV-TWIN-1, that places `c` at `f`. **A commitment that fails this is a bug at the moment it
> was made, not at the moment the car stops moving.**
>
> **INV-TWIN-3 (no starvation by construction).** A passenger refused for `shaftBlocked` is
> **servable**. The fleet can reach them; it is choosing not to right now. Nothing in the properties,
> the diagnosis, or the unservable-call machinery may classify them otherwise.

INV-TWIN-3 is the one that will be violated by accident, and § 3.5 is about why.

### 3.2 Why deadlock is a *first-class* hazard here and not a corner case

The literature names it and defines it, which is the strongest evidence available that it is not
hypothetical. The MERL patent defines a deadlock as *"a situation where the lower car is carrying a
passenger whose destination is at or above the upper car, and the upper car is carrying a passenger
whose destination is at or below the lower car"* and notes it *"can only be resolved by reversing the
motion of one car, which is undesirable for passengers"* — **reference data, not measured here.**

Restated in this repository's vocabulary: **a deadlock is created by a `CommittedStop`, and once both
cars hold one, no legal move discharges either.** It cannot be fixed at movement time, because by
then the passengers are aboard, and `Car` has no operation that un-boards them. So:

> **The design decision: deadlock is prevented at *commitment*, and only checked at *movement*.**

That is the same division T44 chose for the deck-mismatch case — refuse the leg rather than simulate
an impossible journey — with the one difference that makes TWIN harder: the reachable set is dynamic
(§ 1.3). Two regimes follow, and **the design ships both, because one of them is the fallback that
makes the phase land and the other is the thing worth measuring.**

| regime | rule | deadlock | what it costs |
|---|---|---|---|
| **R1 — sectored** | The shaft is partitioned: lower car serves `[lowest … k]`, upper serves `[k … highest]`, overlapping only at `k`. Declared as data — `shaft.sectorBoundaryFloorId` — never as code | **Impossible by construction.** The reachable set is static again, so `shaftServes` answers it and T44's refusal machinery applies unchanged | Most of what TWIN is sold for. Two cars that cannot both serve the lobby are close to two small lifts |
| **R2 — free** | Both cars may serve any floor. Reachability is a function of the mate's commitments | **Must be prevented at commitment**, by the estimator refusing a request whose stop lies in the mate's deadlock zone | The estimator gets a hard, dynamic predicate, and § 4 is about keeping it pure and O(1) |

**R1 is not a strawman and must be an arm.** [`docs/07-handoff.md`](07-handoff.md) § 6 is this
project's headline result and it is exactly this shape: naive `zone-center` parking beats the
predictive strategy by **29.7 %** while the predictive one measures *exactly zero*. A design that
does not carry its own naive baseline as a measured arm has no way to discover it was the better
one. § 6 puts R1 in the arm set for that reason and for no other.

### 3.3 The deadlock zone, and where it is computed

**Proposed.** For the lower car, the **deadlock zone** is `[height(upper) − clearance, +∞)` extended
by the upper car's committed stops in its current direction; symmetrically for the upper car. The
patent gives two readings of the same idea — *"all floors in a current direction of the motion of the
second car"* (conservative) and *"limited by the schedule of actual stops of the second car"*
(tight) — **reference data**. **Which of the two this project uses is OQ-2**, and it is a real choice:
the conservative reading is cheap, obviously correct, and throws away capacity; the tight reading is
the interesting one and depends on the mate's route being stable, which under a re-assigning
dispatcher it is not.

Computed **once per dispatch pass per shaft**, beside the group context, and shared. The precedent is
explicit: `groupContext` is resolved *"once per dispatch pass and shared across every call in the
pass"* because *"a bank that disagrees with itself about its own zones inside one instant is not a
bank a paired comparison can measure"* (`dispatch/policies/groupContext.ts:105-120`). A shaft that
disagrees with itself about its own deadlock zone inside one instant is worse.

### 3.4 The property that catches a violation, and the dependency it exposes

**Proposed. Two properties, and they catch different things.**

> **P7 — separation.** Over the whole run, C-ORDER and C-CLEAR held. A violation is a **hard
> failure**, in the class of P1–P6, and no bound tuning may make it pass.

**P7 has a dependency this document will not paper over.** § 0 row 9: **no run record carries a
car-position series**, and `docs/07` § 5 already records a bank that cannot be oracled for exactly
that reason. So P7 has two candidate implementations and they are not equivalent:

- **(a) Post-hoc, from a new per-move series.** `RunRecord` gains the car-move series
  (`from`, `to`, `commandedAt`, `startedAt`, `arrivesAt`, `profile` identity). P7 then reconstructs
  both cars' analytic positions and checks the *continuous* constraint by finding the minimum of
  `height(upper,t) − height(lower,t)` over each overlapping interval — which is tractable precisely
  because `positionAt` is analytic. This is the honest check, it also unblocks the oracle gap
  `docs/07` § 5 records, and it is **new work in `core` that this design depends on**.
- **(b) In-simulation, at the chokepoint.** `#depart` asserts the constraint on the commanded move
  and increments a counter; P7 asserts the counter is zero. Cheap, and it **cannot see a breach that
  arises from two independently legal moves**, which is the only interesting kind.

**Recommendation: (b) ships first because it is the safety gate anyway (§ 2.3 gate 2), and (a) is
required before TWIN may be called simulated.** A property that can only see the violations its own
gate already prevented is a tautology, and this repository has a name for that shape.

> **P5 — termination — needs no change, and that is the finding.** `checkTermination`
> (`experiments/src/fuzz/properties.ts`) already fires when *"the fleet did no passenger work … for
> `deadlockIdleBoundS` simulated seconds before its own hard deadline, while at least one passenger
> it could serve was already waiting."* A TWIN deadlock is **exactly** that signature. P5 catches it
> **provided** INV-TWIN-3 holds — see § 3.5.

### 3.5 The one way this quietly goes blind, stated in advance

`isServable` in `properties.ts` exempts passengers the fleet *legitimately* cannot serve — an access
lockout, a floor no bank reaches — because *"a run that cannot collect them is reporting the truth."*

**If anybody adds a shaft-blocking clause to `isServable`, P5 stops seeing TWIN deadlock entirely,
and the whole deep tier goes green while the feature is broken.** A shaft-blocked passenger is not in
the exempt class: the hardware reaches them, the credential permits them, and the block is the
control system's own choice. **INV-TWIN-3 exists to forbid that edit**, and it must be asserted in
both directions, in the manner [§ D130](../DECISIONS.md) describes for its own correction to the same
function — *"It is a correction, not a relaxation, and the proof is that the case still fails."*

The same trap has a second door. `STRUCTURAL_INELIGIBILITY` (`simulation.ts:229-234`) is the set of
reasons that stop the retry timer. **`shaftBlocked` must not be in it.** It follows `serviceMode`,
which `simulation.ts:1096` records as *"deliberately absent"* so a returning car is found again, and
not `accessDenied`. Filing a transient reason as structural is the `C35` failure with a new label,
and it must be asserted in both directions — the reason is absent from the set, **and** a call
refused only for `shaftBlocked` is retried.

### 3.6 How the fuzz corpus must widen to reach any of this

**Verified in code:** `FuzzTopology` has four values — `single-bank`, `parallel-banks`, `sky-lobby`,
`shuttle` (`fuzz/generate.ts:617-640`) — and `GENERATED_CALL_TYPES` is *derived from* `CALL_TYPES`
rather than hand-listed (`generate.ts:252`), which is the pattern to copy.

**Proposed.** A fifth generated dimension, `shaftLayout ∈ {one-car-per-shaft, twin}`, **derived from a
domain constant, crossed with topology and call type**, and generated across its whole domain rather
than filtered — the discipline [§ D122](../DECISIONS.md) and [§ D130](../DECISIONS.md) establish for
the call-type ladder, where narrowing the generator to avoid a failing configuration was explicitly
recorded as the thing that did **not** happen.

**Three requirements, and the third is the one that decides whether the campaign proves anything:**

1. **Every case asserts it carries what it says.** The precedent is `assertCarriesCallType`, which
   runs on every generated case ([§ D122](../DECISIONS.md)); a case tagged `twin` whose building
   resolves to two single-car shafts is a corpus that measures nothing.
2. **The shrinker must not remove the second car.** Shrinking a two-car shaft to a one-car shaft
   removes the property under test, in the way `shrink.ts` already guards against removing the bank
   that makes P5 meaningful.
3. **The campaign must report its own denominator.** § D130's deep tier found the `C35` class in a
   sub-population of **90 of 2 000** cases and reported it that way — *"of 2 000 deep cases, 523 draw
   the middle rung; 115 of those also carry access zones; 90 are lockouts, and 32 of those 90
   (35.6 %) fail P5"*. The TWIN analogue is the population that is **blocking-prone**: a twin shaft
   whose traffic puts both cars' work on the same side — a single low entrance with all destinations
   high, or a top-heavy down-peak. **If the generator does not draw that population, a clean campaign
   is evidence of nothing, and the report must show the count rather than the pass.**

---

## 4. Dispatch

### 4.1 The requirement

`estimateCost` must price **reachability given the mate's commitments** while staying pure
(invariant 1: no mutation, no draw, no scheduled event, called thousands of times per decision). The
obstacle is § 0 row 6: a `CarSnapshot` deliberately has no handle to any other car, and that absence
*is* the purity mechanism.

### 4.2 How: the mate arrives as a frozen value, and it is an envelope, not a route

**Proposed.**

```
ShaftMateSnapshot {                       // frozen, no methods, no back-reference
  readonly carId: string;
  readonly isAbove: boolean;              // the mate is the upper car of this shaft
  readonly heightM: number;               // analytic, at snapshot.at
  readonly velocityMps: number;
  readonly clearanceM: number;            // standing clearance + stopping distance + buffer, at .at
  readonly reachableIndexRange: readonly [number, number];   // this car's legal stop positions now
  readonly matePlannedExtentM?: number | undefined;          // furthest the mate is committed toward us
}
```

**Purity is preserved by exactly the mechanism `types.ts:604-617` already relies on**: this is a plain
frozen value, built by the `Simulation` (which owns both cars), with no method, no `Rng`, no
scheduler, and no reference back to a `Car`. The estimator gains a field to read, not a capability.
**The three existing `estimateCost` purity guards — including the source-level guard that the module
cannot import an RNG — apply unchanged and must be asserted to still apply.**

**It is an envelope and not the mate's route, and that is a cost decision.** `#snapshots` builds one
snapshot per car per dispatch pass (`simulation.ts:2781`); handing each car a copy of the other's
`CommittedStop[]` doubles snapshot construction, which the type's own docstring says is *"what keeps
snapshot construction cheap enough to call ten thousand times"*. `reachableIndexRange` is O(1) to
read and sufficient for the feasibility filter, which is the part that must be fast. **Whether an ETA
*penalty* — as opposed to a hard filter — needs the mate's full route is OQ-4**, and this document
does not assume it does.

### 4.3 The refusal

`infeasibilityOf` gains a check **after** the destination access checks and **before** the load cell,
and the placement follows the ordering rule the function already documents — *"the most structural
answer wins"*. `shaftBlocked` is less structural than a service zone and more structural than a load
reading, because a load reading can be overridden by the dispatcher's starvation guard and a shaft
block may not be.

```
6'.  const mate = snapshot.shaftMate;
     if (mate !== undefined && !withinReachable(mate, requestedStopIndex)) return 'shaftBlocked';
```

Under **R2** the same check also covers the *destination*, and this is the deadlock prevention of
§ 3.2 in one line: a request whose **destination** stop lies in the mate's deadlock zone is refused
even when the pickup is reachable, because accepting it boards a passenger the car cannot deliver.
That is structurally identical to T44's cross-deck refusal — *"letting them alight on the other
deck's floor would simulate a physically impossible journey and flatter every TTD figure on the
building"* — with a dynamic predicate in place of a static one.

### 4.4 Cost terms

**At most one new term, and it may not be needed.** Invariant 7's bar is *"only a genuinely new cost
term justifies new code"*. A hard filter needs no term at all. A soft preference — *prefer the car
whose service of this call constrains its mate least* — is a genuinely new quantity and would be
`shaftInterference`, normalized like every other term before weighting (`CLAUDE.md` § Modeling rules),
declared with `activeWhen: { 'shaft.layout': ['twin'] }`, and **required to prove its gated-off region
is flat** — the obligation `docs/09` § 3.2 records as R6-2 and the roadmap's standing rule.

**Whether it is needed is OQ-5, and it must be measured before it is written**, because this
repository has shipped a weighted term that produced 0 non-zero evaluations out of 2,142
([`docs/07-handoff.md`](07-handoff.md) § 3, instance 3) and a whole profile that changed no decision
(instance 10, in `data/`).

### 4.5 Why TWIN effectively requires destination dispatch, and what it therefore depends on

**Reasoned from the hardware, and the hardware sources agree.** Two cars serve one landing through
**one set of landing doors** (thyssenkrupp's own material: the cars *"share the same guide rails and
landing doors in a single elevator shaft"* — **reference data**). A passenger at that landing must be
told **which of the two** to wait for, and an up/down button cannot express it. The manufacturer's
description of the safety concept makes the same point from the control side: step one of the
four-step concept is the **destination selection control** issuing drive commands *"so that the cars
do not hinder each other"* — **reference data**.

**So TWIN is a Level-1 feature in `docs/09`'s vocabulary, and it inherits Phase 6's dependencies
rather than restating them:**

| dependency | state on this tree | verified |
|---|---|---|
| the destination is known at call time | `dispatch.callType ∈ {destination-entry, mobile-credential}` | `dispatch/parameters.ts:232` |
| the panel names a car and the passenger must board it | `dispatch.passengerAssignment: 'panel'`, `activeWhen` on the destination call types | `dispatch/parameters.ts:240-247` |
| the promise survives a car that fills up | write-once, revoked only when the car leaves group control | [§ D29, § T22-D1, § D101](../DECISIONS.md) |
| assignment cannot be deferred under destination entry | thrown at policy construction | `dispatch/policy.ts` |

**Phase 6a and 6b are accepted, so this dependency is satisfied and not speculative.** It is also a
constraint on the acceptance design: a TWIN arm and its conventional control **must both** run under a
panel, or the comparison is confounded with the passenger-model change that
[`docs/09`](09-destination-dispatch-contract.md) § 1.6 shows makes **nine of the recorded metrics
non-comparable**. § 6 states this as a rule rather than leaving it to the implementer.

**One consequence that must not be lost:** § D100 records that the Level-1 panel does **not** clear
Phase 6's gate at any measured point while the Level-0 arm does. A TWIN study therefore runs on the
arm this project has measured as the *weaker* one. That is not an argument against TWIN — the
hardware requires the panel — but it means the TWIN contrast must be measured **against a panel
control**, never against the Level-0 arm, or the panel's own cost is silently charged to TWIN.

---

## 5. Pre-positioning stops being optional — stated as a question, not a prediction

### 5.1 Why it is compelled

Under R2, the non-serving car is frequently *in the way*. Clearing it is not the same operation as
parking:

| | stage-7 parking (shipped) | a TWIN clearing move (proposed) |
|---|---|---|
| when | the car is idle and has nothing to do | possibly while the car holds committed stops |
| why | to be nearer future demand | to make the mate's committed stop reachable |
| may it be declined? | yes — that is what the deadband is for | **no, or the mate never moves** |
| who decides | the group controller, stage 7 | the group controller, and it is a liveness decision |

`Simulation.#park` (`simulation.ts:2583`) is the only shipped path that moves a car with no passenger
purpose, and its own guards are exactly wrong for this: it returns early when demand has stopped, and
it returns early for a car that does not accept hall calls. A clearing move must happen in both
cases.

### 5.2 The deadband is now a correctness hazard, and this is the question

**Verified in code and in the handoff.** `idle.repositionThresholdS` is a deadband — *"do not move an
idle car unless every call it answers from the new park is expected to be served this many seconds
sooner"* (`dispatch/parameters.ts:374-384`). [`docs/07-handoff.md`](07-handoff.md) § 5 records that
the shipped `predictive-balanced` profile carries **8 s**, that the swept interior optimum is **2 s**,
and that the wrong value is left shipped **on purpose** as a known-answer test: *"A future optimizer
that returns 8 s here has failed, not agreed. Do not hand-edit it to 2 s."*

> **The question this design raises, and does not answer:**
>
> **Q-PP.** Does a compelled clearing move pass through `repositionThresholdS`?
>
> - **If yes**, then a profile shipping an 8 s deadband can **veto a move the separation constraint
>   requires**, and a knob that is an efficiency tradeoff everywhere else becomes a liveness hazard on
>   a TWIN shaft. The failure mode is a deadlock produced by a *tuning* value.
> - **If no**, then clearing is a new kind of move that stage 7's measured apparatus does not cover,
>   and it needs its own liveness evidence, its own counter, and its own place in the energy
>   accounting — because a clearing move is empty-car driving and
>   [§ D106](../DECISIONS.md) exists because empty-car driving is what an energy proxy reconstructed
>   from passenger records is blind to.

**Nothing is predicted about which is better.** [`docs/07-handoff.md`](07-handoff.md) § 6 is the
reason: predictive pre-positioning, *fully connected*, measured **exactly zero** — half-width 0.016 s
against a 0.3 s target — while naive `zone-center` beat it by **29.7 %**. The mechanism was legible,
the wiring was live, and the prediction was still wrong. `CLAUDE.md` is explicit that a sentence about
*why* something performs better is either measured or declared unmeasured, so:

> **This document declares the performance of TWIN clearing strategies UNMEASURED.** No claim is made
> that clearing helps, that predictive clearing beats naive clearing, or that the 2 s figure
> transfers. The 2 s deadband stays shipped at 8 s and **is not to be hand-edited for TWIN**; if a
> TWIN implementation needs a different deadband it declares a separate tunable and says why.

---

## 6. The acceptance criterion, written before the implementation

**This section is dated before any TWIN code exists, and that is the point.**
[§ D139](../DECISIONS.md) recorded Phase 6c's criterion before its implementation for the stated
reason that *"a criterion written after a result is indistinguishable from a criterion fitted to
it"*, and `CLAUDE.md` § Working agreements forbids weakening a criterion to make a phase pass. This
criterion follows § D139's shape deliberately.

### 6.1 The pairing problem, and why naming the arms is the hardest part

TWIN is a **hardware** change, so a comparison has to hold something constant, and there are two
choices that measure two different things. **Getting this wrong is the single most likely way a TWIN
study publishes a wrong conclusion.**

| pairing | what is held constant | what it measures | why it is or is not a gate |
|---|---|---|---|
| **equal-core** — *N* shafts × 1 car vs *N* shafts × 2 cars | the **shaft count** | doubling the fleet | **Not a gate.** TWIN nearly cannot lose, and winning proves only that more cars serve more people. This is the manufacturer's framing and it is a *sales* comparison, not a scientific one |
| **equal-car** — 2*N* shafts × 1 car vs *N* shafts × 2 cars | the **fleet** | **the cost of the separation constraint, in seconds** | **This is the gate.** Same cars, same capacity, same traffic; the only difference is that two of them cannot pass each other. TWIN can only lose or tie here, and *how much it loses* is the number a designer needs |

**The equal-car contrast is the primary one, and its expected direction is stated in advance: TWIN is
expected to be worse or indistinguishable.** A constraint removes options; it does not add them. A
study that returns "TWIN is significantly better on equal cars" has found a bug, not a result, and
must be treated as one.

### 6.2 The criterion

**TWIN is accepted when all six hold. Nothing here may be relaxed; a criterion that turns out to be
too weak is raised.**

1. **Liveness — the constraint binds, and it is counted rather than argued.** At the operating point,
   over the campaign: `separationDeferrals > 0`, `clearingMoves > 0`, and the number of dispatch
   decisions in which the mate's envelope **changed the argmin** is `> 0` with cross-car spread.
   **Zero is a wiring bug, not a small effect** — `docs/07` § 4: *"A bit-identical result is a wiring
   bug until proven otherwise: an interval of exactly `[0, 0]` with `rho = 1` … is not a small effect,
   and no budget will resolve it."* This clause exists because this repository has shipped **eleven**
   configurable-tested-and-dead features, one of them in `data/`, and a TWIN shaft that resolves to
   two independent cars would be the twelfth and would look exactly like a pass.
2. **Safety — zero violations of INV-TWIN-1.** P7 (§ 3.4) green over the always-on corpus **and** over
   a widened deep tier at 2 000 cases, with the blocking-prone denominator reported (§ 3.6). Zero P5
   violations attributable to shaft blocking. **No bound may be moved to achieve this** — the standard
   Phase 8 set: `fuzz-1001074` was closed by a fourth `awtIsValid` ground and `fuzz-1000384` by
   revoking a promise, neither by relaxing a threshold.
3. **The cost is measured, both arms under a panel.** On the **equal-car** pairing, under common
   random numbers, at the budget of § 6.3: a **paired-t confidence interval on ΔTTD**, quoted whichever
   way it falls. TTD and not AWT, for `docs/09` § 1.6's reason — AWT and WT95 are among the nine
   metrics that stop being comparable across passenger models, and both arms here run under a panel
   precisely so that the *remaining* difference is the shaft constraint and nothing else. An interval
   containing zero is reported as **below the resolution limit**, with the point's own limit stated,
   and never as "no cost".
4. **The axis is reported beside the verdict and never folded into it.** [§ D106](../DECISIONS.md)'s
   rule, applied to a second axis: **shaft count is what TWIN buys, and it is an axis, not a score.**
   The report carries, side by side and unaggregated: AWT, WT95, **TTD**, the energy proxy **with
   `EnergyStatistics.workPerServedLegKJ` beside the raw figure**, and **shafts per bank**. There is no
   composite grade, no "TWIN score", and no weighting of core area against seconds — that exchange
   rate is the building owner's and it is not a constant this project may bake in. The precedent is
   exact: the Phase 8 matrix put `nearest-car`, the weakest shipped dispatcher, on the Pareto front at
   **six of eight cells** because it is best on energy and worst on wait, and *"a dispatcher that
   drives less carries fewer people."* A shaft layout that serves fewer people has not saved core.
5. **R1 is an arm, and the naive answer is allowed to win.** The sectored regime runs beside the free
   one at the same operating point and budget. If R1 is indistinguishable from R2 the correct product
   is that finding, and it is a **publishable success** in the same way that `zone-center` beating the
   predictive strategy by 29.7 % was.
6. **Generalization.** Any weight vector or sector boundary tuned for TWIN is tuned on one seed set
   and validated on a **disjoint** one, with both printed and a holdout verdict, the discipline
   `elevator-sim tune` already prints as `DISJOINT` / `GENERALIZES`.

### 6.3 The budget, and where it comes from

**50–200 replications, sized from the operating point's *own* saturation census, run before the
budget is committed.** Never inherited: [`docs/07-handoff.md`](07-handoff.md) § 4 records that a
saturation ceiling belongs to a **(building, traffic, seed)** and not to a building, that the same arm
on the same building gives **287** in one study and **174** in another, and that *"this repository has
made that mistake twice and corrected it twice."* No figure from `arms.ts` or `matrix.ts` may be
reused for a TWIN point.

The census is a **precondition**, not a step: TWIN halves the number of shafts at equal cars, so the
equal-car pairing's TWIN arm is a *different* physical system whose ceiling has no relationship to its
control's. `benchmark/saturationCensus.test.ts` is the machinery; running it at the TWIN point is
**OQ-1**, and it gates every number in § 6.2 clause 3.

**Resolution, stated in advance so an under-powered result is not read as a null.** `docs/07` § 4
gives two limits at n = 100 — **0.20 s** for near-neighbour weight vectors and **1.9 s** for
structurally different dispatchers. A TWIN arm against its conventional control is **structurally
different by construction**, so the coarse limit is the one that applies, and an effect below it is
permanently unresolvable at that budget rather than absent. **`sd(ΔTTD)` for this contrast is
unknown** — it has never been measured, in this project or, so far as § Sources found, anywhere this
document could read — so the budget is derived from the census and a pilot, and **not** from
`docs/09` § 2.5's figures, which are a destination contrast on a different pairing.

### 6.4 What would make this a bad criterion — stated so a reviewer can check

- Gating on the **equal-core** pairing. It is the comparison TWIN cannot lose.
- Gating on **AWT**. Objection 3 of § D28 returning under a new name.
- Choosing the operating point or the control arm **after** seeing a result.
- Reporting a bit-identical run as a small effect. It is a wiring bug until proven otherwise.
- Widening the budget until the interval excludes zero, rather than reporting the effect as below the
  resolution limit.
- Folding shaft count into a score. That is § D106's failure with a new axis.
- **Suppressing clause 1 because clauses 2–6 passed.** A TWIN feature that is safe, cheap, measured
  and *inert* passes every other clause in this list.

### 6.5 The outcome this criterion explicitly permits

**Implemented, measured, and reported as costly.** If the equal-car interval says TWIN costs 4 s of
TTD, that is the deliverable — a designer trading core area against service now has the number and
did not have it before. TWIN "failing" clause 3 in the sense of losing time is **not** a failure of
the phase; the phase fails on clause 1, clause 2, or a criterion bent to fit a result.

---

## 7. What it ships without: there is no oracle

**The Barney/CIBSE closed-form round-trip-time calculation does not describe a TWIN shaft, and this
project does not have one that does.**

`analytical/roundTripTime.ts` implements `RTT = 2(H·tv + tx) + (S+1)·ts + 2·P·tp`, whose derivation
assumes **one car per shaft, free to travel the whole rise**. Neither assumption survives: a TWIN
car's rise is restricted by its mate, and its round trip includes waiting that the formula has no term
for. **`CLAUDE.md` § Correctness oracle's standing instinct — "if simulation and closed form diverge,
assume the simulation is wrong" — gives the wrong answer here**, exactly as `docs/09` § 1.7 argues it
does for destination dispatch. A TWIN work item that "fixes" the oracle to agree has broken the
oracle.

**This is the same position T44 landed double-deck in, and T44's own record is the model for how to
say it.** `analytical/upPeak.ts`'s warning was **kept and strengthened** rather than retired, with the
message changed to say that the simulator models something the closed form does not, *"so a simulated
round trip for this bank is deliberately not comparable with this expression."* A TWIN bank gets the
same treatment: a warning code raised at load, carried into `RunRecord.warnings`, asserted in **both
directions**, and read by a named non-test caller — `planRun` in `cli/src/commands/run.ts`, which is
already the named reader of a load-time disclaimer code ([§ D23](../DECISIONS.md)) and which
`docs/09` § 6.3 warned must not lose that branch.

**And the honest scale of the gap, because `vertical-city/shuttle` is the precedent.**
[`docs/07-handoff.md`](07-handoff.md) § 5 records that bank as blocked from the oracle **four separate
ways**, and T44 changed exactly one of them — blocker (1) did not go away, *it changed sides*: the
simulator now models the decks and the closed form does not. **A TWIN bank would be blocked the same
way from day one**, and adding TWIN to `vertical-city` would make a bank that is already unmeasurable
four ways unmeasurable five.

**Searched and not found.** § Sources records what was looked for: a published closed-form round-trip
time for a two-car shaft. The sources reachable here derive RTT for **one car per shaft**, including
the destination-control and general-traffic extensions. **A TWIN RTT derivation may well exist in the
lift-engineering literature this document could not read in full** — several of the relevant papers
are paywalled — so the correct statement is **"not located here"**, not "does not exist". Deriving or
locating one is **OQ-7**, and until it is done, **TWIN ships un-oracled and must say so on every
run.**

---

## 8. The ownership map

Per [`docs/05-roadmap.md`](05-roadmap.md) § Standing requirement: for every behaviour, the file it is
**implemented in** and the file it is **called from**, non-test and non-barrel. A barrel re-export and
a `{@link}` are not callers.

| # | Behaviour | Implemented in | **Called from (non-test)** | Owner |
|---|---|---|---|---|
| 1 | Shaft identity and occupancy | `core/src/model/car/types.ts` (`createShaft`, `shaftsForBank`) | `core/src/sim/simulation.ts` car factory (**636-656**) | **O-SHAFT** |
| 2 | Shaft config and resolution | `core/src/config/{types,parse,schema}.ts` | `core/src/config/loader.ts` ← `cli/src/data.ts` ← the five commands | **O-CONFIG** |
| 3 | Separation arithmetic (clearance, stopping distance) | `core/src/model/car/separation.ts` (new) | `core/src/model/car/estimateCost.ts` **and** `core/src/sim/simulation.ts` `#depart` (**2528**) | **O-SHAFT** |
| 4 | The mate snapshot | `core/src/model/car/types.ts` | `core/src/sim/simulation.ts` `#snapshots` (**2781**) | **O-SEAM** |
| 5 | Feasibility refusal (`shaftBlocked`) | `core/src/model/car/estimateCost.ts` | `dispatch/scoringEngine.ts` → `dispatch/policy.ts` → `simulation.ts` `#dispatchBank` (**~1449**) | **O-SHAFT** |
| 6 | The movement gate and the deferral | `core/src/sim/simulation.ts` `#depart` (**2528**) | itself, from `#stepCar` (**1741**) and the arrival event (**2556**) | **O-SEAM** |
| 7 | The wake list | `core/src/sim/simulation.ts` | the arrival event handler (**2544-2557**) | **O-SEAM** |
| 8 | Clearing moves | `core/src/dispatch/policies/prepositioning.ts` **or** a new stage | `core/src/sim/simulation.ts` `#park` (**2583**) or its successor — **Q-PP decides which** | **O-SEAM** |
| 9 | The car-move series | `core/src/metrics/{types,recorder}.ts` | `core/src/sim/simulation.ts` arrival handler, beside `sampleTravel` (**2555**) | **O-METRICS** |
| 10 | P7 and the widened corpus | `experiments/src/fuzz/{properties,generate,shrink}.ts` | `experiments/src/fuzz/campaign.ts` ← `cli/src/commands/fuzz.ts` | **O-FUZZ** |
| 11 | The study and its pins | `experiments/src/benchmark/twinShaft.ts` (new) | `benchmark/index.ts` **and** `regeneratePins.ts` **and** `published.ts` `PINNED_ESTIMATES` | **O-STUDY** |
| 12 | The un-oracled disclaimer | `core/src/config/schema.ts`, `core/src/analytical/upPeak.ts`, `core/src/sim/simulation.ts` | `cli/src/commands/run.ts` `planRun` | **O-CONFIG** |

**`packages/core/src/sim/simulation.ts` has exactly one owner: O-SEAM**, appearing in rows 1, 4, 6, 7,
8 and 9. Every other owner delivers into it and **may not edit it**. This is the direct remedy for the
Phase 5 cause: that file *"appeared in no agent's ownership list"*. Rows 6, 7 and 8 are strictly
serial and cannot be parallelised — they are three edits to overlapping methods whose **composition**
is the deliverable, which is `docs/09` § 7's Wave B lesson in a new costume.

---

## 9. Open questions that gate implementation

In the manner of [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 13: each
with the method that would settle it, and each labelled **measured** / **decided** / **already
answered by** a named decision.

| # | Question | Why it blocks | How it is settled |
|---|---|---|---|
| **OQ-1** | **What is the saturation ceiling at the TWIN operating point, for every arm?** | Blocks the entire budget of § 6.3, and therefore clause 3 of the criterion | **Measured.** Run `benchmark/saturationCensus.test.ts` at the point, for every arm including the equal-car control and R1, over its own replication count. **No ceiling from `arms.ts` or `matrix.ts` may be reused** (`docs/07` § 4) |
| **OQ-2** | **Conservative or tight deadlock zone?** *All floors in the mate's current direction*, or *only its scheduled stops*? | Blocks § 3.3 and § 4.2's envelope, and the two produce measurably different systems | **Decided, then measured.** The conservative form is provably safe and is the fallback; the tight form is only safe if the mate's route cannot change under it, which a re-assigning dispatcher makes false. Decide the semantics, record it, then measure the capacity difference as an arm |
| **OQ-3** | **Is the clearance derived from the jerk-limited stop, or from `v²/2a` plus a buffer?** | Blocks § 2.2, and a wrong answer is an unsafe simulator that looks fine | **Decided, with a measured check.** `v²/2a` is optimistic (the jerk-limited stop is longer), so if the constant-`a` form is used, `bufferM` must be shown to cover the difference across the shipped speed range. **No number is proposed here** |
| **OQ-4** | **Does an ETA *penalty* need the mate's full route, or is the envelope enough?** | Decides whether snapshot construction stays cheap enough for ten thousand calls per decision | **Measured.** Build the envelope-only version, count how often the hard filter alone already changes the argmin (criterion clause 1's counter), and only add the route if a soft term is shown to be needed |
| **OQ-5** | **Is a `shaftInterference` cost term needed at all?** | Invariant 7's bar; and a weighted term that never evaluates is defect instance 3 repeating | **Measured, before it is written.** If the hard filter carries the whole effect, no term ships. If a term ships, it must produce a counted non-zero evaluation rate with cross-car spread, and prove its gated-off region flat |
| **Q-PP** | **Does a compelled clearing move pass through `idle.repositionThresholdS`?** (§ 5.2) | Decides whether a *tuning* value can cause a deadlock, and whether clearing needs its own stage | **Decided, then measured.** Whichever way, the 2 s deadband stays shipped at 8 s and is not hand-edited (`docs/07` § 5) |
| **OQ-6** | **Which building carries the TWIN configuration?** No shipped building declares two cars in one shaft | Blocks every measurement; and a new building is a new traffic regime, not a free variable | **Decided.** Either a new entry in `data/buildings/` with its own README row and its own oracle position, or a declared variant of an existing one. `vertical-city` is the obvious candidate and is the **wrong** one — its shuttle is already blocked from the oracle four ways (`docs/07` § 5) |
| **OQ-7** | **Is there a published closed-form round-trip time for a two-car shaft?** | Decides whether TWIN can ever have an oracle, or ships permanently un-oracled | **Already partly answered: not located here** (§ Sources). Settled by a literature search with access to the paywalled lift-engineering journals, or by deriving one and validating it the way `analytical/docFormula.test.ts` validates the single-car form against the doc |
| **OQ-8** | **Does `RunRecord` gain a car-move series?** | Blocks P7(a), and it is also the fix `docs/07` § 5 already names for an unrelated oracle gap | **Decided by the owner of `core`.** It is new record schema, so it carries a version bump and a both-directions parse test. Two consumers want it; that is the argument for doing it once |
| **OQ-9** | **Three cars in one shaft — in or out?** | Determines whether `carIds` is a tuple (§ 1.1) or a list, and whether the safety argument generalises | **Decided: OUT, and the type enforces it.** The literature treats *more than two cars per shaft* as a separate problem with its own collision-avoidance methods. A design that quietly admits three has a safety argument nobody wrote |

---

## 10. What this document could not settle, and did not paper over

- **No figure here is a measurement of this project.** The lane ran nothing, by instruction. Every
  number quoted is either a code fact with a file and line, or reference data with a citation.
- **`sd(ΔTTD)` for a TWIN contrast is unknown**, so § 6.3 gives a *method* for the budget and not a
  number. Anyone who writes `n = 150` into a TWIN study before OQ-1 has inherited a ceiling, which is
  the mistake `docs/07` § 4 records this project making twice.
- **No minimum separation distance in metres is stated anywhere in this document**, because no source
  read here publishes one, and inventing one would be exactly the failure the brief for this lane
  names. The *form* of the constraint is specified (§ 2.1); its constants are configuration, and they
  come from the hardware a building declares.
- **The manufacturer's capacity claims are not independently verified.** *"40 % more people can travel
  or 25 % less construction volume is needed"* and *"up to 40 percent more passengers"* are the
  vendor's own figures for a system sold on those figures. They are recorded as reference data and as
  **the hypothesis a study would test**, not as an input to one.
- **The interaction between TWIN and double-deck is untouched.** A double-deck TWIN is physically
  built and would be a shaft holding two cars each holding two decks. Nothing here is designed for it,
  and `carIds` being a two-tuple does not by itself forbid it.
- **Whether TWIN helps is not predicted.** Neither for wait, nor for energy, nor for the clearing
  strategies of § 5. The one directional statement made — that the **equal-car** contrast should
  favour the conventional arm or tie — is a statement about what a constraint can do, not a
  performance prediction, and § 6.1 makes the opposite result a bug report rather than a win.

---

## Sources

**Nothing in this document was measured.** Code facts were read on this tree at baseline `63186a8`
plus lane T44's landed deck geometry, at the file and line given in each claim. External facts are
below, each marked with what was actually read.

### External — reference data, not measured here

- **thyssenkrupp, *TWIN — Two cars. One shaft. One quantum leap.*** (press release, March 2003) —
  https://www.tkelevator.com/global-en/newsroom/press-releases/twin-two-cars-one-shaft-one-quantum-leap-1629.html
  — *full page read.* Two cars on the same tracks, one above the other, in one shaft; *"each elevator
  has its own traction sheave drive and its own counterweight"*; *"the two cars … are not connected
  with each other"*; a four-step safety concept — destination selection control, monitored minimum
  clearances with speed reduction on approach, emergency brake, safety gear; *"40 % more people can
  travel or 25 % less construction volume is needed"*; suited to travel heights over 50 m; first
  installation at Stuttgart University with TÜV approval in December. **The page states no SIL level
  and no numeric separation distance.**
- **thyssenkrupp North America press material, *TWIN Technology Comes to U.S.*** (via Facilities
  Management Coverage) —
  http://www.facilitiesnet.com/site/pressreleases/thyssenkrupp-Companys-TWIN-Technology-Comes-to-US-with-2-Elevator-Cars-Operating-Independently-in-One-Shaft--36979
  — *full page read.* The two cars *"share the same guide rails and landing doors in a single elevator
  shaft"*; *"four safety systems which ensure that a minimum separation of the cars is maintained"*,
  compliant with *"IEC EN 61 508 … Safety Integrity Level 3 (SIL3)"*; *"up to 40 percent more
  passengers than conventional elevators"*; system introduced 2003; first US installation at Coda,
  Atlanta. **Manufacturer's own claims. No independent verification was located.**
- **Gerstenmeyer, S. and Peters, R., *Safety distance control for multi-car lifts*, Building Services
  Engineering Research & Technology **37**(6), 730–754, 2016** —
  https://journals.sagepub.com/doi/abs/10.1177/0143624416642266 — **abstract only; the full text is
  paywalled and was not read.** Cited for one structural point: the separation problem is a
  *stopping-distance* problem, and the standing/levelling minimum and the travelling minimum are two
  separately calculated quantities. **No numeric value is taken from it.**
- **Nikovski, D. et al. (Mitsubishi Electric Research Laboratories), *Motion planning for elevator cars
  moving independently in one elevator shaft*, US 8,424,650 B2, filed 2010, granted 2013** —
  https://patents.google.com/patent/US8424650B2/en — *record read.* Cited for the definition of
  deadlock (*"the lower car is carrying a passenger whose destination is at or above the upper car,
  and the upper car is carrying a passenger whose destination is at or below the lower car"*), for the
  two readings of the deadlock zone, for the static minimum `d ≥ the distance between consecutive
  floors`, and for expressing the dynamic half through a deceleration term of the form `ẋ²/2a`.
- **Searched for and NOT located: a published closed-form round-trip-time derivation for a two-car
  shaft.** The RTT literature reachable here — including the universal and destination-control
  extensions of the Barney/CIBSE form — derives round trip time for **one car per shaft**. This is
  recorded as *not found in the sources consulted*, not as *does not exist*, and it is **OQ-7**.

### Internal — prior art and constraints

[`CLAUDE.md`](../CLAUDE.md) — invariants 1, 2, 3, 7 and 8, § Statistical discipline, § Correctness
oracle, § Modeling rules, § Tuning discipline, § Working agreements;
[`docs/01-architecture.md`](01-architecture.md) § The interface that decides everything, § Security
zones are three different things, § Determinism strategy;
[`docs/02-elevator-reference.md`](02-elevator-reference.md) § Motion parameters, § The 80 % rule;
[`docs/03-traffic-and-statistics.md`](03-traffic-and-statistics.md) Part 2 (the RTT expression and its
terms) and § Saturation detection (the four `awtIsValid` grounds);
[`docs/05-roadmap.md`](05-roadmap.md) § Standing requirement;
[`docs/06-parameterization-and-tuning.md`](06-parameterization-and-tuning.md) § Stage 1, § Stage 7;
[`docs/07-handoff.md`](07-handoff.md) § 3 (the eleven dead seams and the permanent guards), § 4
(resolution limits, the saturation-ceiling warning, `nearest-car` as a poor reference arm), § 5 (the
2 s deadband; the five-building RTT residuals; `vertical-city/shuttle` blocked four ways), § 6 (the
headline result);
[`docs/09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md) § 1.6, § 1.7, § 2.4,
§ 3.3, § 6.3, § 7;
[`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 13, § 14;
[`RISKS.md`](../RISKS.md) R9;
[`DECISIONS.md`](../DECISIONS.md) § D23, § D29, § D30, § D100, § D101, § D106, § D112, § D114, § D122,
§ D130, § D137, § D139.
