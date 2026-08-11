# Parameterization and Tuning

How every model in this simulator gets tweaked **without recoding** — and how to search
that parameter space for an optimum rather than hand-guessing.

## The principle

> Anything you might want to vary is **data**. Code defines the *shape* of a behavior;
> configuration defines the *behavior*.

Concretely: there is no `NearestCarDispatcher` class with a hardcoded rule. There is one
scoring engine, and "nearest car" is a weight vector in a JSON file. Adding a new dispatch
strategy should require editing config, not writing a class. Only genuinely new *terms* —
a cost the engine cannot currently express — require code.

This has a second payoff. If every strategy is a point in a shared parameter space, then
**an optimizer can search that space directly**, and "find me a better dispatcher" becomes
a well-posed computational problem instead of a research project.

---

## Layer 1 — Physical parameters

The industry-standard knobs, already captured in
[`data/elevator-specs.json`](../data/elevator-specs.json) and documented in
[Elevator Reference](02-elevator-reference.md). Per car, overridable per building:

| Parameter | Typical range | Effect |
|---|---|---|
| `ratedSpeedMps` | 0.5–20.5 | Top speed; irrelevant on short hops |
| `acceleration` | 0.6–1.2 m/s² | Dominates short-hop time |
| `jerk` | 0.8–1.6 m/s³ | Comfort limit; dominates very short hops |
| `motorStartDelayS` | ~0.5 | Fixed cost per start |
| `levelingSettleS` | 0.5–1.0 | Fixed cost per stop |
| `doorOpenS` / `doorCloseS` | 1.5–4.0 | Dominates stop cost |
| `dwellCarCallS` / `dwellHallCallS` | 2–7 | Directly trades wait against throughput |
| `ratedLoadLb` | 1000–4000 | Capacity |
| `passengerTransferS` | 1.0–2.0 | Per passenger, per direction |

These are *physics*. They are tunable because buildings differ, not because the algorithm
is choosing them. **The one deliberate exception is dwell time**, which is both physical
and a control decision — see `dwellPolicy` below.

---

## Layer 2 — The call and answer mechanism

This is the heart of the question. Rather than one monolithic "dispatch algorithm," the
call lifecycle decomposes into **seven stages, each independently tunable**.

```
register → filter eligible → score → assign → (reassign?) → answer → reposition
```

### Stage 1: Registration

How a call enters the system, and what information exists at that moment.

| Parameter | Values | Notes |
|---|---|---|
| `callType` | `up-down-buttons` \| `destination-entry` \| `mobile-credential` | Determines whether destination is known at call time |
| `passengerAssignment` | `none` \| `panel` | Whether the landing panel names a car for each passenger (`panel`) or the landing keeps its up/down button (`none`) |
| `batchWindowS` | 0–5 | Group near-simultaneous calls at one floor before scoring |

Destination entry is not merely a UI change — it moves information *earlier*, which is the
entire source of its advantage.

### Stage 2: Eligibility filter

Hard constraints. Not costs — a car either can serve the call or cannot.

| Parameter | Values | Notes |
|---|---|---|
| service zoning | from building config | Physical: does the shaft open there |
| access zoning | from credential | Is this passenger permitted |
| `carMode` | in-service, independent, fire-recall, out-of-service | Car-owned state |
| `allowOppositeDirectionPickup` | bool | Whether a down-travelling car may take an up call |
| `enRouteDiversion` | bool, default `false` | Whether a car already in motion may be cut short at a floor it has not yet committed past. Off, a moving car is judged from its **destination** — the only place the kernel could stop it — so a call on a floor it is about to fly through costs it a full reversal. On, it is judged from its **commit point**, the last floor it can still decelerate into, and the runner really diverts it there. See [DECISIONS.md § D205](../DECISIONS.md). **The default stays `false` by measurement, not by inertia**: [§ D210](../DECISIONS.md) asked whether `collective` should carry it, found the mechanism better on wait at all five shipped buildings at n = 200 on a held-out seed and worse on nothing — and still refused, because adoption also ships `detourPenalty: 0.2`, and under pure up-peak that weight costs AWT while the mechanism fires **zero** times. The `diversionDetour` term removes that objection exactly — bit-identical at both up-peak cells, at every weight tried — and [§ D212](../DECISIONS.md) still refused adoption, on a building whose *reference* arm saturates once in 200 replications at every declared rate |
| `maxLoadFactorForAssignment` | 0.0–1.0 | Refuse assignment above this, distinct from bypass |

### Stage 3: Scoring

The weighted cost function. See [Layer 3](#layer-3--the-dispatch-cost-function) below.

**Weight-set selection** — whether the vector may change *during* the run. Off in every shipped
profile, so a run selects nothing unless a profile asks it to; the arms are the file-level
`patternSwitching` block, and a profile declaring a policy with no library to select from is
refused rather than run.

| Parameter | Values | Notes |
|---|---|---|
| `selection.policy` | `off` \| `fuzzy` \| `contextual` | Whether the weight vector may change during the run, and by what rule |
| `selection.observationWindowS` | 30–1800 | Trailing window the three traffic rates are counted over. Too short and the detector tracks batches rather than patterns |
| `selection.lobbyArrivalRateGain` | 0–4, inert at 1 | Gain on the lobby arrival rate before its memberships are evaluated |
| `selection.interfloorRateGain` | 0–4, inert at 1 | Gain on the interfloor arrival rate |
| `selection.downPeakRateGain` | 0–4, inert at 1 | Gain on the down-travelling arrival rate |
| `selection.switchMargin` | 0–1 | Membership a challenger must exceed the incumbent's by before it takes the run, on top of the dwell hysteresis |

### Stage 4: Assignment

| Parameter | Values | Notes |
|---|---|---|
| `assignmentTiming` | `immediate` \| `deferred` | Deferring allows batching for better global assignment |
| `deferWindowS` | 0–10 | Only when deferred |
| `assignmentMode` | `single-car` \| `split-demand` | Split enables parallel service of heavy floors |
| `splitThresholdPassengers` | integer | Waiting count above which demand is split |

Note the real tension: **destination dispatch cannot defer**, because the passenger must
be told which car to walk to immediately. That constraint is a documented cost of the
approach, and this simulator should be able to measure it.

### Stage 5: Reassignment

Widely under-appreciated, and one of the highest-leverage knobs available.

| Parameter | Values | Notes |
|---|---|---|
| `reassignmentPolicy` | `never` \| `until-commitment` \| `continuous` | |
| `commitmentPoint` | `on-assignment` \| `on-deceleration` \| `on-door-open` | When an assignment becomes irrevocable |
| `reassignmentHysteresisS` | 0–30 | Minimum cost improvement required to switch; prevents thrashing |
| `maxReassignmentsPerCall` | integer | Starvation guard |

Real systems commit when the car begins decelerating for the floor. Before that,
reassignment is free. This is exactly the mechanism that makes **capacity-driven bypass**
work: when a car crosses its load threshold, its uncommitted calls migrate.

### Stage 6: Answering

The stop decision and what happens at the floor.

| Parameter | Values | Notes |
|---|---|---|
| `bypassLoadThreshold` | 0.0–1.0, default 0.8 | Car stops taking new hall calls |
| `overloadThreshold` | **`[designLoadFactor, 1.5]`**, default 1.1 | Doors held, car will not start |
| `allowBypassIfSoleEligibleCar` | bool | Starvation guard — prevents a floor never being served |
| `dwellPolicy` | `fixed` \| `adaptive` | |
| `dwellAdaptationGain` | float | Extends dwell with hall queue length |
| `reopenOnLateArrival` | bool, **default `false`** | The late-arrival courtesy hold. Ships off — see below |
| `maxReopensPerStop` | 0–20 | Reopens honoured at one stop before the doors close regardless; the anti-hold-forever rule |
| `maxDwellS` | seconds | Ceiling on adaptive dwell |
| `maxTransferSeconds` | seconds | Ceiling on the transfer-driven part of a stop |

> **`overloadThreshold`'s range starts at the design load factor, and it used to start at 1.0.**
> Over `[1, 1.5]` the dimension is a **flat plateau**: boarding stops at `designLoadFactor × rated`
> (0.8 — [`CLAUDE.md`](../CLAUDE.md) § modelling rules), so a threshold at or above 1.0 can only
> reject a candidate heavier than `0.2 × rated`, which is 146 kg on the lightest shipped car against
> a N(75, 15) passenger mass distribution — at least 4.7σ. Measured: 1.0 vs 1.5 is bit-identical on
> all five shipped buildings. The interlock is **one-sided rather than dead** — it starts biting as
> the threshold approaches the boarding cap from *below*, because the last boarder is the one that
> carries the load across — so the range floor moved instead of the knob being gated or deleted.
> The default is unchanged at EN 81's 110 %, so no shipped run moves; only the interval a search may
> explore does. [Review finding #21](08-review-findings.md);
> [`DECISIONS.md` § D10](../DECISIONS.md).

> **`reopenOnLateArrival` now ships `false`, and the price on it is a measurement rather than a
> number taken from a diverging queue.** The behaviour did not exist when this table was first
> written: the only non-test caller of `Car.requestReopen` hardcoded `'obstruction'` and the knob
> gates only `cause === 'lateArrival'`, so it was a schema-validated, optimizer-searchable boolean
> that could not move any run ([review findings #12 and #13](08-review-findings.md)). It is now
> implemented — when the doors start closing on a landing that still holds a passenger this car could
> carry, and the car is below its design load, the run requests a `lateArrival` reopen, with no
> random draw, because that is a deterministic consequence of the trace and a probability here would
> spend a stream on something the passenger population already decides (invariant 2).
>
> It ships **off**. Two figures for its cost were published and **both were unquotable for the same
> reason**: "~30 % AWT on `secure-tower`" and a reviewer's correction to "+59.1 %" are each a
> single-replication point estimate of a mean on a configuration that **saturates** — at seed
> 20260726 `secure-tower` reports `saturation: { saturated: true, verdict: 'diverging-queue' }` under
> the shipped profiles — and [`CLAUDE.md`](../CLAUDE.md) § Statistical discipline forbids reporting a
> mean for a system whose queues grow without bound. Re-measured under this project's own rules —
> 50 replications per cell, paired arms on common random numbers (seeds 20260726–20260775), a
> paired-t 95 % interval, and AWT suppressed wherever either arm saturates:
>
> | 5 buildings × 10 profiles | quotable | significantly worse | significantly better | no significant difference |
> |---|---|---|---|---|
> | | 34 of 50 | **0** | 2 | 32 |
>
> *(That grid is **as measured**: ten profiles shipped at the time. Twelve ship now —
> `destination-eta` and `destination-panel` were added in Phase 6 — so the study covers 50 of
> today's 60 cells. The two significant results are unaffected; nothing here has been re-run at
> 5 × 12, and this table is not a current census.)*
>
> Both significant cells are *improvements*: `secure-tower|auction-multi-round` −13.2 % (−7.66 s,
> CI [−12.72, −2.60]) and `vertical-city|predictive-balanced` −14.4 % (−6.80 s, CI [−11.36, −2.23]).
> The remaining 16 cells saturate in nearly every replication — `midtown-office` on all ten profiles,
> and most of `mixed-use-high-rise` and `vertical-city` — and are suppressed rather than quoted.
> **There is no measured AWT cost.** The default is nonetheless `false`, because "no measured cost"
> is not "no effect": the hold moves **41 of the 50** passenger-record trajectories at seed 20260726,
> on every building but `garden-apartments`, and turning it on would revalue the runs Phase 5's
> verdicts were measured against. Switching it on is a deliberate re-measurement, not a default.
> [`DECISIONS.md` § D9, § D25](../DECISIONS.md).

### Stage 7: Idle repositioning

Where cars go when they have nothing to do. On sparse-traffic buildings this dominates
everything else.

| Parameter | Values | Notes |
|---|---|---|
| `parkingStrategy` | `stay` \| `lobby` \| `zone-center` \| `predicted-demand` \| `fixed-floor` | |
| `parkingFloorIndex` | floor index | The floor `fixed-floor` parks at; an unserved index parks nothing (`no-target`) |
| `repositionThresholdS` | seconds | Do not move for gains smaller than this |
| `repositionEnergyWeight` | float | Trades anticipated wait saving against energy spent |
| `predictorHorizonS` | seconds | How far ahead the demand forecast looks |
| `predictorLearningRate` | float | Adaptation speed of the per-floor arrival model |

---

## Layer 3 — The dispatch cost function

Every scoring decision is a weighted sum of normalized terms:

```
cost(car, call) = Σᵢ wᵢ · normalize(termᵢ(car, call))
```

The dispatcher assigns the call to the eligible car with the lowest cost.

### Term library

| Term | Measures | Serves |
|---|---|---|
| `waitTime` | Estimated wait for the new passenger | AWT |
| `rideTime` | Estimated in-car time for the new passenger | TTD |
| `detourPenalty` | Added delay imposed on already-onboard passengers | Fairness to boarded |
| `diversionDetour` | The same passenger-seconds, charged **only** when the call cuts a moving car's run short | Fairness to boarded, without taxing traffic the diversion never touches ([§ D211](../DECISIONS.md)) |
| `existingCallDelay` | Added delay to other already-assigned calls | Global optimality |
| `directionReversal` | Penalty for reversing travel direction | Conventional collective behavior |
| `loadFactor` | Penalty rising as the car approaches capacity | Capacity awareness |
| `stopCount` | Number of stops added | Energy + ride annoyance |
| `distanceTravelled` | Metres of travel added | Energy proxy |
| `starvation` | Escalating penalty on the longest-waiting call | WT95, % > 60 s |
| `zoneAffinity` | Deviation from the car's assigned zone | Zoning strategies |
| `predictedDemand` | Misalignment with forecast future calls | Pre-positioning |
| `crowding` | Hall queue length at the pickup floor | Parallel service |

**Normalize every term** to a comparable scale before weighting. Without it, `waitTime`
(seconds, 0–120) and `stopCount` (0–20) produce weights that are uninterpretable and a
search space the optimizer cannot navigate.

### Known dispatchers are weight vectors

This is the test of whether the framework is expressive enough. It is:

| Strategy | Weight vector |
|---|---|
| Nearest car | `distanceTravelled: 1.0` |
| ETA / minimum wait | `waitTime: 1.0` |
| Conventional collective | `waitTime: 1.0`, `directionReversal: hard-constraint` |
| Energy-aware | `waitTime: 0.6, stopCount: 0.3, distanceTravelled: 0.1` |
| Fairness-first | `waitTime: 0.5, starvation: 0.5` |
| Capacity-aware | `waitTime: 0.7, loadFactor: 0.2, crowding: 0.1` |
| Predictive | `waitTime: 0.6, predictedDemand: 0.3, distanceTravelled: 0.1` |

Adding a strategy is a config entry. Only a genuinely novel *term* requires code.

### Where auction dispatch fits

`AuctionDispatcher` uses the same term library — each car computes its own bid from
`estimateCost()` — but changes *who* aggregates. It remains a
[policy to be benchmarked](01-architecture.md#the-resolution-auction-dispatch-is-a-policy-not-an-architecture),
not a separate architecture.

---

## Layer 4 — Mode and rule layer

Some decisions are not smooth costs. Traffic-pattern detection, mode switching, and hard
overrides belong in a small declarative rule layer rather than in the cost function.

The industry precedent is fuzzy logic: real group controllers use fuzzy rules to
**recognize traffic patterns and peaks from statistical forecasts**, then change behavior
accordingly.

```json
{
  "patternDetector": {
    "type": "fuzzy",
    "inputs": ["lobbyArrivalRate", "interfloorRate", "downPeakRate", "timeOfDay"],
    "patterns": ["up-peak", "down-peak", "two-way", "interfloor", "idle"],
    "hysteresisS": 120
  },
  "weightSetsByPattern": {
    "up-peak":    "aggressive-lobby",
    "down-peak":  "fairness-first",
    "interfloor": "balanced",
    "idle":       "energy-saver"
  }
}
```

**Per-pattern weight sets matter.** The optimum for up-peak is not the optimum for
down-peak. A single global weight vector is leaving performance on the table, and
`hysteresisS` prevents the detector from oscillating between patterns.

---

## The parameter schema — the mechanism that makes it tunable

For an optimizer to search this space **without knowing anything about elevators**, the
parameters must be self-describing. Every tunable declares its type and range:

```json
{
  "id": "weights.waitTime",
  "type": "continuous",
  "range": [0, 5],
  "scale": "linear",
  "default": 1.0,
  "description": "Weight on estimated passenger waiting time"
},
{
  "id": "dispatch.reassignmentHysteresisS",
  "type": "continuous",
  "range": [0, 30],
  "scale": "linear",
  "default": 5.0,
  "activeWhen": { "dispatch.reassignmentPolicy": ["until-commitment", "continuous"] }
},
{
  "id": "idle.parkingStrategy",
  "type": "categorical",
  "values": ["stay", "lobby", "zone-center", "predicted-demand"],
  "default": "stay"
}
```

> **That last `id` read `dispatch.parkingStrategy` until 2026-07-27, and no profile can hold it.**
> `dispatchStageSchema` is a `z.strictObject` with no `parkingStrategy` key, so
> `parseDispatcherProfiles` rejects a profile carrying it and the dimension is unsearchable — while
> the real knob, `idle.parkingStrategy`, never gets sampled. It is the exact contract the next
> section states, violated by the example that introduces it, and `parkingStrategy` is placed
> correctly under stage 7 / `idle` in this document's own Stage 7 table.
> [Review finding #7](08-review-findings.md); the ids that appear in this file's fenced blocks are
> now asserted against `collectSearchSpace().ids` by
> `packages/experiments/src/tuning/space/docExamples.test.ts`.

Supported types: `continuous`, `integer`, `categorical`, `boolean`.
`activeWhen` expresses conditional parameters, so the optimizer does not waste evaluations
tuning a knob that is inert under the current configuration.

### `activeWhen` has two forms and **one** evaluation rule

A condition is either the **values** that make the knob live, for a categorical or boolean
gate, or an inclusive **numeric interval**, for an integer or continuous one:

```json
{
  "id": "auction.reserveMarginalDelayS",
  "type": "continuous",
  "range": [0, 600],
  "activeWhen": {
    "auction.aggregation": ["contract-net"],
    "auction.rounds": { "min": 2 }
  }
}
```

`activeWhen` is a **conjunction**: every condition must hold. Both forms evaluate through one
function — `activeWhenSatisfied` in `dispatch/parameters.ts` — and an optimizer implements it
once:

- **value list:** the gate's current value is in the list (a boolean gate compares as `"true"` /
  `"false"`).
- **interval:** the gate's current value is a finite number within `[min, max]`, either bound
  optional.
- **either:** a gate that cannot be read — absent, or the wrong runtime type — is **not**
  satisfied. Guessing would activate a knob whose condition nobody evaluated.

The numeric form exists because the value-list form could not express a real gate.
`auction.reserveMarginalDelayS` is inert while `auction.rounds` is 1 — a single-round auction has
no later round to reallocate a declined contract into — and `auction.rounds` is an integer with a
range and no `values`. Encoding that as `["2", …, "8"]` satisfies the shape and none of the
semantics: an optimizer comparing its own sampled `3` against the string `"3"` never activates the
reserve. So the parameter shipped **ungated on that half**, and a search that sampled `rounds = 1`
spent 50–200 replications an evaluation on a dimension that cannot move the objective. A gate
whose evaluation rule differs from every other gate is exactly the elevator-specific knowledge
this schema exists to remove.

### A gate is a claim, and the wrong claim costs more than no claim

`activeWhen` says *"outside this condition the dimension is dead — skip it"*. That is a
machine-readable assertion with a proof obligation, and
`packages/core/src/sim/searchSpaceLiveness.test.ts` § *finds no activeWhen gate that hides a live
region* executes the contrapositive: **outside the gate, the dimension must be flat**. A gate that
fails it is not documentation, it is a false statement that costs an optimizer a whole live
dimension.

So a knob whose *value* is conditional is not automatically a knob whose *dimension* is. The two
destination-reading cost terms are the worked example of both sides, and they need **opposite**
declarations:

| term | raw value without a destination | spread between candidate cars without one | declaration |
|---|---|---|---|
| `rideTime` | 0, always | **0** — a constant cannot move an `argmin` | `activeWhen` — a gate |
| `stopCount` | the pickup stop, still counted | **1** — it still separates two cars | `partiallyActiveWhen` — **not** a gate |

Measured over 4 320 (car, call) pairs on `midtown-office` by
`dispatch/terms/destinationDisclosure.test.ts`, which derives the classification from
`policy.score()` rather than reading it off these paragraphs. Gating `stopCount` was tried first
and refused by measurement: the liveness sweep found `weights.stopCount` still moving a run at
`dispatch.callType: up-down-buttons`, *outside* the proposed gate, and the two shipped profiles
that weight it there — `energy-aware` and `predictive-balanced` — became invalid under the rule
that no profile may weight a term its own stage settings make inert.

`partiallyActiveWhen` is therefore declared on the **term**, not as a `DispatchParameterSpec`
field, and `dispatch/parameters.ts` folds it into the row's `description`. An optimizer must keep
searching the dimension on both sides of the condition, so there is nothing for a new structural
field to change; what the sentence tells a tuner is that **the term prices a different quantity on
either side, so a weight tuned under one call type does not transfer to another** — the same rule
this document already states for traffic patterns, one axis over. The cost of not knowing it was
measured: at `garden-down-peak`, authoring a destination call type onto a `stopCount`-weighted
profile moves AWT by `+1.320 [+0.988, +1.653] s` at weight 1, n = 200 — worse, by an interval that
excludes zero ([DECISIONS.md § D136](../DECISIONS.md)).

### `id` is a path a profile can actually hold

The contract's other half: **every declared `id` must be authorable into
`data/dispatcher-profiles.json` and survive a `loadConfig` round trip.** A parameter an optimizer
can sample but not write back is a dimension it searched for nothing; one it can write but never
sample is a knob the tuned result silently depends on. `dispatch/parameters.test.ts` asserts both
directions over every row in all three dispatch schemas, and it has caught the gap three times:
four predictor rows that `idleStageSchema` rejected as unrecognized keys, and the whole of
`eligibility.*` and `normalization.*`, which had no profile section at all and were reachable only
through an options object.

The one declared id whose authored form is **not** its dotted path is
`constraints.noDirectionReversal`, which is written as membership in the `hardConstraints` array —
because a set-valued parameter is not something a generic optimizer can sample, and a boolean per
constraint is. That translation is one line, and it is asserted rather than assumed.

**This schema is the contract.** A generic optimizer reads it, samples valid
configurations, and never needs a line of elevator-specific code.

### A description is machine-readable, so a false one is a wrong answer

`description` is the field a search reads to decide **where to spend budget**, and it is the one
part of the schema nothing type-checks. Two failures have shipped, both of the same kind — a
description asserting a dimension is inert when it is not:

- `idle.predictorCycleS` said *"on a 30-minute replication no value of this parameter changes any
  forecast"* and *"do not spend a search budget on this dimension"*. Measured on 20 floors after
  1 800 s of identical observations, the forecast at floor 5 runs `600 → 13.742`,
  `900 → 11.797`, `1 200 → 10.650`, `1 500 → 10.550`, `1 800 → 10.650` against the default's
  `12.674` — a **30 % spread**. It is inert only above the whole span the model is observed and
  queried over (`2 400` and `3 600` are bit-identical to `86 400`), which is a fact about the run
  length and not about the parameter.
- `idle.predictorPriorRatePerS` said the uniform prior *"cancels out of the comparisons the
  repositioning stage makes"*. True of the argmax and false of everything else: stage 7 scores a
  park by a **demand-weighted mean** response time, so a uniform additive term changes the weights
  it averages over. The busiest-to-quietest forecast ratio runs 27.6 at a prior of 0, 14.6 at the
  default and 2.3 at the top of the range, and through a real run on Garden Apartments at a 2 s
  deadband a prior of 0.0005 changes the journeys on 2 of 3 seeds and moves AWT by up to 1.6 s.

Both were rewritten to what is true, with the measurement in the text. **An inertness claim in a
description is a measurement, and it is only worth writing once it has been made** — an optimizer
is the one consumer of this schema that cannot detect being lied to, because a dimension it was
told not to search produces no evidence that it should have been searched.

The two honest inertness claims that survive are conditional and hold by construction: a
single-term profile is invariant to its own normalization reference, because the map is strictly
increasing and a lone term is ranked by its raw value (measured: `nearest-car` is bit-identical at
`distanceM` 5 and 200; `eta` at `waitTimeS` 10 and 180; `energy-aware` and `predictive-balanced`
diverge on both).

---

## The tuning loop

The objective is **noisy** — see [Traffic & Statistics](03-traffic-and-statistics.md).
A naive optimizer will happily chase statistical noise and report a winner that is
indistinguishable from the baseline. Everything below exists to prevent that.

### Pick a non-saturating reference arm — not `nearest-car`

Every candidate is scored against a reference, and the reference's own behaviour caps what the
search can resolve. **Use `collective` or `eta`. Do not use `nearest-car`.**

`nearest-car` is the only shipped profile that **saturates** inside the measured replication
budget — its queues grow without bound on the up-peak buildings, and a saturated arm has no
quotable AWT mean at all (CLAUDE.md § Statistical discipline: *flag it and suppress the AWT
interval*). Phase 5 measured the consequence: it capped Midtown Office at **n = 287**
replications, because the replications above that index had lost their AWT. A capped replication
budget is a capped resolution, and on Midtown that leaves a permanent floor of about **0.8 s** —
four times the ~0.20 s (1.3 % of AWT) that a near-neighbour comparison reaches at n = 100 with
CRN. Phase 7 searches exactly the near-neighbour regime, so a reference that costs a factor of
four in resolution costs the search most of what it is trying to see.

`eta` and `collective` do not saturate on any measured building and lose their AWT in no
replication of 1 000. `eta` is the better default: `collective` carries the
`noDirectionReversal` hard constraint, so a candidate that differs from it in a weight is not
differing in only a weight.

Two further facts about the reference, both measured and both per-building:

- **CRN pairing quality is a property of the building, not a constant.** Garden Apartments pairs
  at `rho = 0.90` against `nearest-car`'s regime; Midtown Office at `rho = 0.62`. Between
  near-neighbour weight vectors — Phase 7's actual regime — `rho` reaches 0.997 and the variance
  reduction 99.69 % (324×), against 43.75 % (1.8×) between structurally different dispatchers.
  Budget from the pairing you measure, not from the headline.
- **A reference arm that is bit-identical to a candidate is one arm under two names.** An interval
  of exactly `[0, 0]` with `rho = 1` is a wiring bug or a step below the plateau width, never a
  small effect.

### Use common random numbers across candidates

Within an optimization round, evaluate **every candidate on the same passenger traces**.
This makes candidate comparison paired, collapsing the variance the optimizer has to fight
and typically buying 5–20× in required replications. This is the single highest-leverage
thing in the loop.

### Successive halving on replication count

Replication count is a natural fidelity knob, which makes multi-fidelity search a clean
fit. Cheap, approximate evaluations rule out bad regions before expensive ones run:

| Round | Candidates | Replications each | Purpose |
|---|---|---|---|
| 1 | 100 | 10 | Eliminate obvious losers |
| 2 | 33 | 30 | Narrow |
| 3 | 11 | 100 | Refine |
| 4 | 3 | 300 | Final selection with paired-t |

This reuses the Phase 3 replication infrastructure directly — no separate machinery.

### Search algorithms

| Method | When to use |
|---|---|
| **Random search** | The honest baseline. Beats grid search in higher dimensions and is embarrassingly parallel. Always run it for comparison. |
| **Successive halving / Hyperband** | Default. Best fit given replication count is a natural fidelity dimension. |
| **Bayesian optimization** (noise-aware GP) | When each evaluation is expensive and the budget is ~50–200 evaluations. |
| **CMA-ES** | Continuous weight vectors with a larger budget; handles moderate noise with adaptive sampling. |
| **OCBA** | Final selection among finalists — allocates remaining replications to the candidates whose ranking is most uncertain. |

### Guardrails

**Hold out traffic seeds.** Tune on one set of seeds, validate on a disjoint set. Without
this you overfit the weight vector to specific passenger traces and the gain evaporates on
new traffic. This risk is rarely mentioned in the elevator literature and is entirely real.

**Do not scalarize too early.** Report the **Pareto front** over (AWT, energy, WT95) rather
than collapsing to a single number. Reducing energy generally costs waiting time; that
tradeoff is a decision for the building operator, not a constant to bake in.

> **The energy axis is now measurable, and that changes what this guardrail costs to honour.** Until
> `f895a16`, `RunSummary` recorded no energy, no metres travelled and no stop count, so every front
> this project produced silently degenerated to two axes with the third reported `inactive` — the
> guardrail above was correct advice that could not be followed. `RunSummary.energy` now carries an
> out-of-balance mechanical-work proxy over the reporting window, `runner/metrics.ts` projects
> `energyKJ`, `carDistanceM`, `carStarts` and `energyPerServedLegKJ`, and both `matrix.ts` and
> `phase7Acceptance.ts` decide their fronts over all three axes. Basis, constants and enumerated
> omissions: [`docs/02` § Energy and the counterweight](02-elevator-reference.md) and
> [`DECISIONS.md` § D106](../DECISIONS.md).
>
> **The tradeoff it exposes is real and it is expensive.** Phase 7's acceptance arms buy 1.09 s of
> AWT on Garden Apartments for **+30.3 %** energy (2 s deadband) and 1.11 s for **+27.7 %**
> (2.582 s), measured at n = 150 on held-out seeds. Report both. And note the direction the axis
> cuts: measured across the whole matrix, **`nearest-car` — the weakest shipped dispatcher — is on
> the front at six of eight cells**, because it is best on energy and worst on wait. That is why
> energy is an **axis and never a score**: any aggregate that folds it into one number ranks the
> worst dispatcher first.

**Report the noise floor.** If two candidates differ by less than the confidence-interval
half-width, they are **indistinguishable**. Say so. Do not rank them.

**Tune per traffic pattern.** Optimize each weight set against its own pattern, then
evaluate the assembled controller end-to-end on a full day.

---

## Worked example: a complete dispatcher config

```json
{
  "id": "predictive-balanced",
  "name": "Predictive balanced",
  "engine": "weighted-cost",
  "weights": {
    "waitTime": 1.0,
    "detourPenalty": 0.4,
    "existingCallDelay": 0.5,
    "directionReversal": 0.8,
    "loadFactor": 0.6,
    "stopCount": 0.2,
    "distanceTravelled": 0.1,
    "starvation": 0.7,
    "predictedDemand": 0.4,
    "crowding": 0.3
  },
  "dispatch": {
    "assignmentTiming": "deferred",
    "deferWindowS": 1.5,
    "assignmentMode": "split-demand",
    "splitThresholdPassengers": 12,
    "reassignmentPolicy": "until-commitment",
    "commitmentPoint": "on-deceleration",
    "reassignmentHysteresisS": 4.0,
    "maxReassignmentsPerCall": 3
  },
  "answer": {
    "bypassLoadThreshold": 0.8,
    "allowBypassIfSoleEligibleCar": false,
    "dwellPolicy": "adaptive",
    "dwellAdaptationGain": 0.4,
    "maxDwellS": 12
  },
  "idle": {
    "parkingStrategy": "predicted-demand",
    "repositionThresholdS": 8,
    "repositionEnergyWeight": 0.2,
    "predictorHorizonS": 300
  }
}
```

Everything above is data. Changing any of it requires no rebuild — which is the whole point.

> **This example carried `"rideTime": 0.3` until 2026-07-27, and pasting it into
> `data/dispatcher-profiles.json` — which the sentence above invites — turned the suite red.**
> The profile authors no `dispatch.callType`, so it sits at the `up-down-buttons` default, where
> `rideTimeTerm.activeWhen` declares the term **inert**; `policies.test.ts` § *"lets no profile
> weight a term its own stage settings make inert"* builds exactly that profile as a fixture and
> asserts `unsatisfiedGatesOf(offender) === ['rideTime']`. The shipped `predictive-balanced` dropped
> the weight in Phase 5 and records why in its own `$comment` — *"a weight that is decoration in
> every shipped configuration"* — and this worked example was never updated, so the one config the
> tuning doc presented as canonical was the one the repository forbids. Independently corroborated
> at the time: across all 5 buildings × 10 profiles, `rideTime` got **0 evaluations** under every
> shipped profile, and 468/468 non-zero under `destination-entry`.
>
> **That corroboration is now historical, and the reason is the point of the example.** Phase 6
> shipped two more profiles — `data/dispatcher-profiles.json` carries **twelve** — and **both** of
> them, `destination-panel` and `destination-eta`, weight `rideTime` (at 1.0 and **0.5**). They are
> allowed to precisely because both also author `dispatch.callType: mobile-credential`, which
> satisfies the term's `activeWhen`. The rule the red suite was enforcing has not changed: a profile
> may weight `rideTime` **iff** its own stage settings make the term live.
>
> > **Corrected 2026-07-28.** This paragraph read *"`destination-eta` ships the call type and not the
> > weight, so the two profiles together are the worked example of both sides of that gate"*. That
> > was true when written and is now false: [`DECISIONS.md` § D112](../DECISIONS.md) authored
> > `weights.rideTime: 0.5`, because a profile that discloses a destination nothing prices is a
> > shipped behaviour with no effect on any shipped path — measured **bit-identical to `eta` at 8 of
> > 8 matrix cells**. The *gate* is unchanged; what changed is that no shipped profile now sits on
> > its permissive side without using it. The other side of the gate — a profile weighting `rideTime`
> > **without** the call type — is still exercised, by `policies.test.ts` rather than by `data/`,
> > which is the right place for a configuration that must stay illegal.
> [Review finding #6](08-review-findings.md); the JSON blocks in this file are now parsed and run
> through the real `parseDispatcherProfiles` and the same `activeWhen` gate computation by
> `packages/experiments/src/tuning/space/docExamples.test.ts`, so this example can no longer drift
> from what the loader and the policy gate accept.

> **`idle.repositionThresholdS: 8` in this example is not a recommendation, and it is deliberately
> left where it is.** Phase 5 measured it as the binding constraint on predictive pre-positioning:
> at 8 s the forecast reaches every reposition decision, the deadband vetoes every move, and the
> arm is bit-identical to `stay`. The sweep on Garden Apartments at n = 300
> ([Roadmap § Phase 5](05-roadmap.md)) has an **interior optimum**, with the curve turning back up
> below it as repositioning churn sets in. `DISPATCH_DEFAULTS.repositionThresholdS` was corrected;
> the shipped `predictive-balanced` profile was **not**, on purpose — it is Phase 7's known-answer
> case, and an optimizer that independently rediscovers the optimum on this dimension has
> validated itself. Do not hand-edit it.

---

## Sources

- [Elevator Group Control Optimal — Elevator World](https://elevatorworld.com/article/elevator-group-control-optimal/)
- [Multiobjective Optimization in Elevator Group Control](https://www.researchgate.net/publication/31597314_Multiobjective_Optimization_in_Elevator_Group_Control)
- [Evolutionary bi-objective optimisation in the elevator car routing problem — European Journal of Operational Research](https://www.sciencedirect.com/science/article/abs/pii/S0377221704005703)
- [Improving waiting time and energy consumption performance of a bi-objective genetic algorithm embedded in an elevator group control system — Soft Computing](https://link.springer.com/article/10.1007/s00500-022-07358-4)
- [Genetic algorithm for controllers in elevator groups: analysis and simulation during lunchpeak traffic](https://www.sciencedirect.com/science/article/abs/pii/S1568494604000286)
- [Dynamic fuzzy logic elevator group control system for energy optimization](https://www.researchgate.net/publication/263801062_Dynamic_fuzzy_logic_elevator_group_control_system_for_energy_optimization)
- [Reducing Energy Consumption by an Optimization Algorithm in Elevator Group Control — Elevator World](https://elevatorworld.com/article/reducing-energy-consumption-by-an-optimization-algorithm-in-elevator-group-control/)
- [DEHB: Evolutionary Hyperband for Scalable, Robust and Efficient Hyperparameter Optimization](https://arxiv.org/pdf/2105.09821)
- [Constrained Bayesian Optimization with Noisy Experiments](https://arxiv.org/pdf/1706.07094)
- [Simulation Budget Allocation for Further Enhancing the Efficiency of Ordinal Optimization (OCBA)](https://link.springer.com/article/10.1023/A:1008349927281)
- [Improving CMA-ES convergence speed, efficiency, and reliability in noisy robot optimization problems](https://arxiv.org/html/2601.09594)
- [On Hyperparameter Optimization of Machine Learning Algorithms: Theory and Practice](https://arxiv.org/pdf/2007.15745)
