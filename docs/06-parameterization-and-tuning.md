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
| `maxLoadFactorForAssignment` | 0.0–1.0 | Refuse assignment above this, distinct from bypass |

### Stage 3: Scoring

The weighted cost function. See [Layer 3](#layer-3--the-dispatch-cost-function) below.

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
| `overloadThreshold` | default 1.1 | Doors held, car will not start |
| `allowBypassIfSoleEligibleCar` | bool | Starvation guard — prevents a floor never being served |
| `dwellPolicy` | `fixed` \| `adaptive` | |
| `dwellAdaptationGain` | float | Extends dwell with hall queue length |
| `reopenOnLateArrival` | bool | Models the door-hold button and photo-eye |
| `maxDwellS` | seconds | Ceiling on adaptive dwell |

### Stage 7: Idle repositioning

Where cars go when they have nothing to do. On sparse-traffic buildings this dominates
everything else.

| Parameter | Values | Notes |
|---|---|---|
| `parkingStrategy` | `stay` \| `lobby` \| `zone-center` \| `predicted-demand` | |
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
  "id": "dispatch.parkingStrategy",
  "type": "categorical",
  "values": ["stay", "lobby", "zone-center", "predicted-demand"],
  "default": "stay"
}
```

Supported types: `continuous`, `integer`, `categorical`, `boolean`.
`activeWhen` expresses conditional parameters, so the optimizer does not waste evaluations
tuning a knob that is inert under the current configuration.

**This schema is the contract.** A generic optimizer reads it, samples valid
configurations, and never needs a line of elevator-specific code.

---

## The tuning loop

The objective is **noisy** — see [Traffic & Statistics](03-traffic-and-statistics.md).
A naive optimizer will happily chase statistical noise and report a winner that is
indistinguishable from the baseline. Everything below exists to prevent that.

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
    "rideTime": 0.3,
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
