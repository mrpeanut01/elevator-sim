# Destination dispatch — the locked contract for Phase 6

**Status: design only. No implementation code was written for this document.**
**Owner: T14 (architect). Date: 2026-07-27.**

> **Read this first (added 2026-07-28). Phase 6a and 6b have shipped, and parts of this contract are
> now refuted by measurement rather than merely superseded.** The document is kept in the present
> tense of the day it was written, so a prediction can be checked against what happened instead of
> being quietly replaced. Where a section was refuted, the correction is inline and marked ⚠️.
>
> | Prediction | Outcome |
> |---|---|
> | § 3.1 — a Level-1 run renders an **empty landing series** | ⚠️ **REFUTED.** The real defect was a *collapse*: 28 landings drawn against 92 landing calls and 132 promise groups, and a caption saying "unassigned" about promised passengers. The instruction it justified was right, and was followed |
> | § 4.3 / § 8 — H-ACCESS-2, the *optimization* half of the access-control hypothesis | ⚠️ **REFUTED, as the pilot predicted.** `Δ_secure − Δ_midtown = +1.020 s [+0.625, +1.414]` at n = 150 per building — `runAccessControlStudy({})`, seed 20 260 726, pinned in `benchmark/published.ts` and re-measured by [§ D280](../DECISIONS.md); the superseded `+0.982 s [+0.584, +1.380]` predates [§ D254](../DECISIONS.md). This row used to end *"the saving is in the credential, and that is H-ACCESS-1, which is **CONFIRMED categorically**"* — **H-ACCESS-1 is REFUTED** ([§ D256](../DECISIONS.md), [§ D279](../DECISIONS.md)), so the credential buys nothing under conventional dispatch and **where the saving comes from is unmeasured** |
> | § 4.3 — H-ACCESS-1, the *coverage* half | ⚠️ **REFUTED, and it was measuring a defect.** *"Not servable at all"* was [§ D254](../DECISIONS.md)'s pickup-access check, not a property of conventional dispatch. Re-measured, `eta` and `destination-eta-unpriced` are **bit-identical on 150 of 150** Secure Tower replications on all seven identity metrics, and every access-zoned building ships servable at 100 % delivery. The **bare kiosk** survives at 61.2 % unserved — authorization of a *destination*, which § D254 never touched |
> | § 8 — "the most likely way Phase 6 publishes a wrong conclusion is a single-building H-ACCESS-2" | ✅ **Correct, and the trap was avoided by design.** The study asserts the trap explicitly: Secure Tower alone *does* exclude zero on the confirming side |
> | § 2.2 / § 4 — the operating points, arms and the n = 150 budget | ✅ Held. `sd(ΔTTD)` for the C→D contrast measured 0.908 s at the primary point, inside the contract's stated headroom by 3.7× |
> | "Level 1 is trajectory-identical to Level 0 at the primary point" | ⚠️ **A single-seed reading.** 27 of 150 replications are bit-identical; 123 are not. The effect is near zero *and* the arms are demonstrably wired — the two readings that together rule out a dead seam |
> | § 1.3 / § 1.4 — OQ-1, and *"assignment is immediate and **irrevocable** at the panel"* | ⚠️ **Qualified by a defect the contract did not foresee.** OQ-1 was settled write-once ([§ D29](../DECISIONS.md)), and that stands for the case the contract asks about — a car that **fills up**. It does **not** hold for a car that leaves *group control*: Phase 8's fuzzer found `fuzz-1000384`, where write-once handed a re-offered call straight back to a withdrawn car **592 times at 5 s intervals** and stranded the passenger for the rest of the run. [§ T22-D1](../DECISIONS.md) revokes such a promise; [§ D101](../DECISIONS.md) records it. "Irrevocable" is now *irrevocable for optimisation* |
> | § 4 — Level 1 is the arm that will justify the passenger-model change | ⚠️ **Not shown, on the building the criterion names.** At `mixed-use-high-rise` up-peak, the Level-1 panel's ΔTTD contains zero against `eta` and `collective` at every measured rate, and is `+9.083 [+5.683, +12.484]` s WORSE on WT95 at 4 %. **Level 0** is the arm that clears the gate there ([§ D100](../DECISIONS.md)) |
>
> Live results and verdicts are in [`05-roadmap.md` § Phase 6](05-roadmap.md).

This document exists because [`RISKS.md` R9](../RISKS.md) says the passenger model changes
fundamentally and [`docs/05-roadmap.md` § Standing requirement](05-roadmap.md) says Phase 5 shipped
four dead seams simultaneously *because work was partitioned by module directory before the
interfaces were locked*. Its job is to make Phase 6 partitionable. It is not a restatement of the
roadmap: everything below that is a number was measured in this worktree against the built code, and
where a shipped document and the code disagree, this document believes the code and says so.

**Reproducing the measurements.** All figures were produced by `runSimulation()` from
`packages/core/dist/index.js` against the real `data/` directory, at the operating points named in
[§ 2.2](#22-the-operating-point-is-the-decision-that-matters-most). Seeds are stated per table.
No figure here is transcribed from another document.

---

## 0. What the code already does — verified, not read

Six claims that a Phase 6 plan will otherwise get wrong. Each was checked by running the code.

| Claim | Verdict |
|---|---|
| `dispatch.callType` exists with a `destination-entry` value, and it is live | **TRUE.** `config/types.ts:260` declares `CALL_TYPES`; `dispatch/lifecycle.ts:106-134` (`costRequestFor`) forwards `destinationFloorId` only under `destination-entry`/`mobile-credential`. It is one of the dimensions `sim/searchSpaceLiveness.test.ts` requires to be non-flat, and it is |
| The runner already knows and already discloses the destination | **TRUE.** `sim/simulation.ts:2041-2065` (`#callValue`) puts the head-of-queue passenger's `destinationFloorId` on the `DispatchCall`. Its own docstring says *"This is not destination dispatch: the passenger model, the landing panel and the 'which car do I walk to' constraint are Phase 6"* — which is exactly right |
| `estimateCost` authorizes the destination | **TRUE.** `model/car/estimateCost.ts:122-132` returns `destinationServiceZone` / `destinationAccessDenied` when the destination is known. Authorization and optimization already happen in one step *when the credential is also present* |
| `destination-entry` + `deferred` throws at policy construction | **TRUE.** `dispatch/policy.ts:166-171` throws `DispatchError`. `tuning/space/encode.ts` calls the real `createPolicyFor` in `validateValues`, so the sampler rejects the pair rather than handing a search a throw |
| Some shipped profile is a destination dispatcher | **WAS FALSE WHEN THIS TABLE WAS WRITTEN; NOW TRUE.** At the time: all ten shipped profiles authored no `dispatch.callType` and none weighted `rideTime`. Today `data/dispatcher-profiles.json` holds **twelve** profiles, of which **two** — `destination-eta` and `destination-panel` — declare `dispatch.callType: mobile-credential` **and weight `rideTime`**, at 0.5 and 1.0. There was an intermediate state in which the part that mattered was still false: `destination-eta` weighted `rideTime` at **zero**, and the full experiment matrix measured it **bit-identical to `eta` at all eight cells** — a destination that reached `estimateCost` and changed no decision. That is § 8's **R6-1 realised**, and it is closed ([`DECISIONS.md` § D112](../DECISIONS.md)). The profile now separates from `eta` at **seven of eight** cells; the eighth, `garden-down-peak`, is bit-identical at `rideTime` 0.3, 1.0 **and** 2.0 and is therefore a blind operating point rather than an under-weighted term |
| A passenger boards the car they were assigned | **FALSE, and this is the whole of the model change.** `sim/simulation.ts:1754-1778` (`#boardFrom`) takes whoever is at the head of `Floor.waiting(direction)` that the car *can carry*. There is no per-passenger car assignment anywhere in `core/`. `Passenger` (`model/passenger.ts:134-360`) has `board`/`alight` and no assignment field |

**The consequence is the single most useful decision this document makes: Phase 6 is two things, not
one, and they have different risk, different cost and different acceptance evidence.**

---

## 1. The passenger-model change, stated precisely

### 1.1 Two levels, and only one of them changes the passenger model

**Level 0 — destination *disclosure*. Already wired. Data-only. Passenger model unchanged.**
Setting `dispatch.callType: destination-entry` moves the destination into the `CostRequest`. The
landing is still one up/down button, assignment is still per (floor, direction), and any car that
opens still takes whoever fits. What changes is that `rideTime` can price the journey and
`estimateCost` can authorize the destination. **This produces a real, measurable TTD gain today**
(§ 2.4). It needs no new code — a profile in `data/dispatcher-profiles.json` and nothing else.

**Level 1 — destination *dispatch*. Not built. This is the model change.** The passenger is told
which car to walk to at the moment of registration, and must board that car.

Everything below in § 1 is Level 1.

### 1.2 What a passenger becomes

`Passenger` gains exactly one new piece of state, written once, in the same style as
`board`/`alight` (`model/passenger.ts:249-281`):

```
assignedCarId : string | undefined      // write-once; the car named at the landing panel
assignedAt    : SimTime  | undefined    // when the panel told them
```

It does **not** gain a mutable "reassigned to" field. Reassignment after the panel has spoken is a
different system (a landing panel that changes its mind), and modelling it silently would let a
Level-1 arm quietly recover the deferral advantage it is supposed to have given up. If a later phase
wants it, it is a declared categorical (`dispatch.panelMayReassign`), not an accident.

The write-once rule has a hard consequence: **`assignedCarId` must be set before the passenger can
be in a queue anyone serves**, which means assignment happens inside registration, not inside
dispatch's stage-4 loop. See § 3.3.

### 1.3 What a landing call becomes

Today (`dispatch/lifecycle.ts:66-68`): `batchKeyOf(call) = "${floorId}:${direction}"` — *"the
identity of the button: one live call per floor per direction."*

Under Level 1 the landing has no direction button. The call identity is **the destination request**:

```
batchKey = `${floorId}→${destinationFloorId}`      // one live call per origin-destination pair
```

Two arrivals for the same OD pair inside `batchWindowS` are the same request pressed by two people
and merge, exactly as two presses of the same up button do today. Two arrivals at the same floor for
*different* destinations are **two calls**, where today they are one. This is the mechanical heart of
the change and it has three knock-on effects that a work breakdown must budget for:

1. **Call count rises.** On Midtown Office up-peak from a single entrance, every passenger going to
   a distinct floor is now a distinct call. Stage 2 (`filterEligible`) is `O(cars)` per call and
   stage 3 is `O(cars × terms)`; the per-instant dispatch cost rises with the number of distinct
   destinations at the landing, not with the number of directions. `MAX_DISPATCH_PASSES` and the
   `#scheduleTick` coalescing (`sim/simulation.ts:1128-1154`) were sized against 2 calls per floor.
2. **`Floor.waiting(direction)` stops being the serve predicate.** `#boardFrom`,
   `#projectedBoarding`, `#waitingFor`, `#eligibleWaiting` and `#syncButton` all key on direction.
   Under Level 1 the queue a car loads is *its own assigned set*, and the direction filter becomes
   a consistency check rather than the selector.
3. **`#reofferCall` (`simulation.ts:1196-1227`) becomes illegal as written.** It re-offers a still-
   occupied landing to the group with a fresh credential from *"whoever is now at the head of what
   is left"*. Under Level 1 the people left behind were promised a specific car; re-offering them to
   the group is exactly the panel changing its mind. The Level-1 behaviour when a car fills up is
   that the *remaining* passengers get a **new** panel assignment and their `assignedCarId` is
   `undefined` again — which contradicts write-once. **This is Open Question OQ-1 and it must be
   settled before implementation starts.**

### 1.4 When assignment happens, and what it costs

Assignment is **immediate and irrevocable at the panel**. `dispatch/policy.ts:166-171` already
enforces the timing half by throwing on `destination-entry` + `deferred`, and that throw must not be
relaxed.

A new simulation-level tunable models the physical cost the panel imposes:

```
sim.assignedWalkS      continuous [0, 30], default 0    seconds from the panel to the named car
```

Declared in `SIM_PARAMETERS` (`core/src/sim/types.ts:156-190`), alongside `sim.transferWalkS` which
already works this way (`simulation.ts:1948`). **It is not dispatcher-profile-authorable**, and that
is deliberate: `searchSpaceLiveness.test.ts` decides search-space membership by *trying* to write the
dotted path through `parseDispatcherProfiles`, and a walk distance is a property of the lobby, not of
the algorithm. A profile that could tune its own walk time could tune away its own cost.

Default `0` so that turning Level 1 on does not silently move every number by an undeclared
constant; the study sets it explicitly and reports the sensitivity.

### 1.5 What `MetricsRecorder` must now record

Two new fields on `PassengerRecord` (`metrics/types.ts:208-247`), both optional so schema version 1
records still parse:

```
assignedCarId? : string    // the car the panel named
assignedAt?    : SimTime   // when it named it
```

and one new recorder entry point beside `recordArrival` / `recordBoarding` / `recordAlighting`:

```
recordAssignment(passenger, at, { carId, bankId }) : void
```

`recordAssignment` must be called from the **same** place `#admit` is, for the reason `#admit`'s own
docstring gives: *"the one entry point for 'a passenger begins waiting' … so no leg can reach a queue
without also reaching the metrics layer — which is what makes `legsCreated === legsRecorded` a
meaningful check rather than a tautology."* Under Level 1 the analogous invariant is
**`legsAdmitted === legsAssigned`** for any run where `callType` is a destination type, and it must
be asserted in `#reconcile` (`simulation.ts:2376`) next to the existing conservation checks.

### 1.6 Which of the 19 recorded metrics stop being comparable

`REPLICATION_METRICS` (`experiments/src/runner/metrics.ts:34-72`) has exactly 19 entries. Under
Level 1, **nine change construct** and ten do not. "Changes construct" means the number still has a
definition and still computes, but it is no longer measuring the same thing, so a Level-0-vs-Level-1
difference on it is not interpretable as an improvement.

| Metric | Verdict | Why |
|---|---|---|
| `awtS` | **changes construct** | Wait is `arrivedAt → boardedAt`. Under Level 1 it includes the walk to the named car, and the passenger has lost the option of boarding *any* arriving car. Two different penalties inside one number |
| `wt95S` | **changes construct** | Same, and the tail is where the "I was sent to the slow car" case lands |
| `wt99S` | **changes construct** | Same |
| `maxWaitS` | **changes construct** | Same |
| `pctOverLongWait` | **changes construct** | Same, and the 60 s threshold was calibrated against a conventional wait |
| `intervalS` | **changes construct** | Achieved interval between terminal departures. A destination-grouped bank departs the terminal in destination sectors, not round-robin; the departure gap stops being the quantity the Barney/CIBSE interval names |
| `intervalCoV` | **changes construct** | Bunching of a sectored departure pattern is not bunching of a round-robin one |
| `meanQueueLength` | **changes construct** | The landing queue is now partitioned by assigned car, and includes people walking. "Persons waiting at the landing" is a different set |
| `maxQueueLength` | **changes construct** | Same |
| `ttdMeanS` | **comparable** | `journeyStartedAt → alightedAt` on the final leg. Identical definition, identical construct, and the walk is honestly inside it. **This is the comparison metric** |
| `ttdP95S` | **comparable** | Same, and it is where a badly-assigned passenger shows up |
| `rideMeanS` | **comparable** | `boardedAt → alightedAt`. Identical definition. It is the quantity destination grouping is supposed to reduce, so it is the mechanism check |
| `personsPer5Min` | **comparable as a value, not against the oracle** | See § 1.7 |
| `pctPopulationPer5Min` | **comparable as a value, not against the oracle** | Same |
| `offeredPer5Min` | **comparable** | Demand offered. Dispatcher-independent by construction |
| `meanLoadFactor` | **comparable** | Time-weighted car load. Destination grouping raises it; that is a result, not a redefinition |
| `fractionAtDesignLoad` | **comparable** | Same |
| `queueSlopePersonsPerMinute` | **comparable** | Fitted growth of the unserved backlog. Saturation is saturation under either model |
| `unservedFraction` | **comparable** | Arrived in window, never boarded. Definition survives intact |

**So the reportable comparison set is `{ttdMeanS, ttdP95S, rideMeanS, meanLoadFactor,
unservedFraction, queueSlopePersonsPerMinute}`, and `awtS`/`wt95S` may be *shown* but must be
labelled `NOT COMPARABLE` rather than given a verdict.** `experiments/src/tuning/report/format.ts`
already exports a `NOT_COMPARABLE_LABEL`; Phase 6 should reuse it rather than inventing a second
form of the same disclaimer.

### 1.7 The correctness oracle does not survive Level 1, and must say so

`CLAUDE.md` § Correctness oracle requires simulated interval and handling capacity to match the
closed-form Barney/CIBSE round-trip-time calculation under pure up-peak.
`analytical/roundTripTime.ts` implements the textbook formula, whose expected number of stops
`S = N(1 − (1 − 1/N)^P)` **assumes each of the P passengers picks a destination independently and
uniformly**. Destination dispatch exists precisely to violate that assumption: it groups common
destinations into one car and drives `S` down.

**Therefore: the oracle test must be pinned to `callType: up-down-buttons` and must state that it
is.** It is not a bug that a Level-1 arm diverges from the closed form — it is the effect. A Phase 6
work item that "fixes" the oracle to agree with a destination dispatcher has broken the oracle. This
is the one place in Phase 6 where the repository's standing instinct (*"if simulation and closed form
diverge, assume the simulation is wrong"*) gives the wrong answer, and the test must carry that
sentence in its own docstring so nobody re-derives it under pressure.

---

## 2. Why TTD, not AWT — worked through, with the measurements

### 2.1 The claim is not rhetorical. It is a measured sign flip.

`docs/07-handoff.md` § 7 says *"Compare on TTD, not AWT — AWT alone unfairly penalises it."* That is
usually read as a fairness plea. It is not. Measured here at **Level 0** (the destination is
disclosed; the passenger model is untouched, so both arms are strictly comparable on every metric),
on Midtown Office, interfloor-mix operating point, **n = 40 paired replications under CRN**, seeds
5000–5039, `eta` + a `rideTime` weight against plain `eta`:

| `weights.rideTime` | Δ AWT (s), 95 % | Δ TTD (s), 95 % | ρ(TTD) | sd(ΔTTD) | bit-identical reps |
|---|---|---|---|---|---|
| 0.3 | +0.123 ± 0.287 | **−0.962 ± 0.651** | 0.884 | 2.102 | 5 / 40 |
| 1.0 | **+0.355 ± 0.337** | **−1.821 ± 0.738** | 0.847 | 2.381 | 0 / 40 |
| 2.0 | **+0.615 ± 0.393** | **−1.938 ± 0.838** | 0.797 | 2.703 | 0 / 40 |

At weights 1.0 and 2.0 **both intervals exclude zero, in opposite directions**. AWT says the change
is significantly worse; TTD says it is significantly better; they are the same runs. A study that
reports AWT and stops has not made a judgement call — it has reported the wrong sign. That is the
strongest available argument for the handoff's instruction, and it is now measured rather than
asserted.

Note also that the mechanism check agrees: `rideMeanS` moves −0.962 ± 0.605 at weight 0.3, i.e. the
whole of the TTD gain at that weight is in-car time, which is what destination grouping is supposed
to buy.

### 2.2 The operating point is the decision that matters most

**The three shipped benchmark operating points are all close to the worst possible place to measure
destination dispatch.** Measured, same code, same arms:

| Building / operating point | Result |
|---|---|
| Midtown Office, up-peak 1 %, 900 s, peak-5min (`arms.ts` `MIDTOWN_UP_PEAK_1PCT`) | Δ AWT +0.52 s, Δ TTD +0.35 s at n = 5 — the *wrong* sign, and the effect is dominated by plateau |
| Midtown Office, **down-peak** 1 % | **29 of 30 replications bit-identical.** Every down trip goes to the lobby, so the destination carries no information the direction button did not already carry |
| Garden Apartments, residential 2 %, full run | **30 of 30 replications bit-identical.** One bank, two cars, six floors: an argmin over two candidates almost never flips on a `rideTime` tiebreak |
| Secure Tower, up-peak 2 %, 900 s | AWT differs on **1 of 10** seeds; trajectories differ on 3 of 10. Three identical cars per bank and one unrestricted lobby, so destination information mostly permutes which of three identical cars goes |
| **Midtown Office, interfloor-mix** (40/30/30 incoming/outgoing/interfloor, 1.5 % pop/5 min, 1800 s, full-run) | **26 of 30 differ**, and the intervals in § 2.1 |

Three of those five rows are the "bit-identical" reading the roadmap says to *"treat as a defect
report, not as a measurement"*. Here they are not defects — the wiring is demonstrably live at the
fifth row on the same code — they are **the effect being genuinely zero because the information is
genuinely absent**. Down-peak destinations are all the lobby; a two-car bank has nothing to allocate;
a homogeneous bank serving one unrestricted lobby has nothing to differentiate. **Phase 6 must state
this in its own study module or the first reviewer will read it as the seventh dead seam.**

**Locked decision: the Phase 6 study's primary operating point is Midtown Office interfloor-mix as
specified above, and the shipped up-peak cases are carried only as negative controls with their
expected-zero result stated in advance.** A phase that measured destination dispatch at pure up-peak
from one entrance would report "no effect" and be wrong about why.

### 2.3 Which arms

| Arm | Profile | Purpose |
|---|---|---|
| **A. conventional** | `eta`, `up-down-buttons`, `immediate` | The reference. `eta` and not `nearest-car`: `nearest-car` is the only profile that saturates and it caps the budget (`docs/07-handoff.md` § 4) |
| **B. conventional deferred** | `eta`, `up-down-buttons`, `deferred`, `deferWindowS 1.5` | The thing destination dispatch **cannot do**. Isolates the cost of the immediacy constraint |
| **C. Level 0 disclosure** | `eta` + `rideTime`, `destination-entry`, `immediate` | Information moved earlier, model unchanged. Comparable on **all 23** metrics |
| **D. Level 1 dispatch** | as C + per-passenger assignment + `sim.assignedWalkS` | The model change. Comparable on **14** metrics — `REPLICATION_METRICS` is 23 and `MODEL_SENSITIVE_METRICS` is 9. The old "10" was 19 − 9, derived from a metric count that is now stale; the **nine** has not changed |
| **E. credential-aware** | `eta`, `mobile-credential`, `immediate` | The access-control hypothesis (§ 4). Isolates credential from destination |
| **F. destination + credential** | as C but `mobile-credential` | The interaction. Isolates whether the two compose |

**A→B and C→D are the two contrasts that carry the interesting claims.** A→C is the one already
measured in § 2.1; **E→F is the one that carries H-ACCESS-2, and it is measured in § 4.3.**

**Not every arm has a valid cell on every building, and the study must know it in advance.** Arm A
times out on 10 of 10 replications on Secure Tower at the interfloor-mix point (§ 4.2). That is a
*result*, reported as a count, and it means **arms A and B are absent from Secure Tower's interval
table** rather than present with a suppressed AWT. `arms.ts`'s existing rule — a cell has no interval
unless every arm returns a valid one — is what forces this, and Phase 6 must not work around it.

The "cannot defer" cost is already quantified and it does **not** go the way the handoff's phrasing
implies. Same operating point, n = 40, seeds 5000–5039, arm B minus arm A:

```
Δ AWT = +0.927 ± 0.325 s      Δ TTD = +0.811 ± 0.488 s      0 / 40 bit-identical
```

**Deferring 1.5 s makes both metrics significantly worse.** So at this operating point, with this
weight vector, the constraint destination dispatch is forced to accept costs nothing and in fact
removes a liability. That does not make the constraint free in general — `predictive-balanced` is the
profile that defers, and a richer weight vector may be able to exploit the batch — but it does mean
**the "documented cost of the approach" must be reported as a measurement, not assumed as a
handicap.** Phase 6 should re-run B against A with `predictive-balanced` before drawing a
conclusion; that is Open Question OQ-4.

### 2.4 CRN when the two arms do not have the same passenger model

This is the hard part of the brief, and the answer has two halves because the two levels differ.

**Measured fact first.** Across arms A, C, E, F on both Midtown and Secure Tower, at every seed
tested, `JSON.stringify(result.trace.passengers)` is **byte-identical**. The trace is a pure function
of `(seed, building, traffic config)`; `StreamSet` derives `arrivals`, `origins`, `destinations`,
`passengerMass` from the master seed independently of anything the dispatcher does, and
`traffic/generator.test.ts:104` already asserts the generator never touches `doorObstruction` or
`policyNoise`. So for **Level 0, CRN is perfect and unqualified**: identical passenger traces, and the
measured ρ(TTD) of 0.80–0.88 is the *outcome* correlation, not a synchronization artefact.

**For Level 1 the trace is still shareable, and this is a design requirement, not an observation.**
The passenger population — who arrives, when, from where, to where, weighing what — must remain a
pure function of `(seed, building, traffic)`. Level 1 changes *what happens to* those passengers, not
*which passengers exist*. Concretely, the three things Level 1 adds must draw from no trace stream:

- the panel's car choice is a deterministic `argmin`, drawing nothing;
- the walk is a constant `sim.assignedWalkS`, drawing nothing;
- any learned exploration draws from `policyNoise` and from nothing else (§ 5).

**If any of those consumes `arrivals`, `origins`, `destinations` or `passengerMass`, CRN is destroyed
and the whole comparison loses an order of magnitude of power.** This must be a test, not a
convention: the existing pattern is `traffic/generator.test.ts:104-116`, which snapshots
`Rng.getState()` before and after and asserts equality. Phase 6 must add the same assertion across a
whole `runSimulation` for a Level-1 profile: **after the run, the `arrivals`/`origins`/`destinations`/
`passengerMass` streams must be at exactly the state a Level-0 run at the same seed left them.**

**What is *not* shareable, and what it costs.** Three things:

1. **Per-leg outcomes are no longer paired by construction at the leg level.** Under Level 1 a
   passenger who would have boarded car A at t=40 boards car C at t=52. The pairing is still valid —
   it is the same person, same arrival, same destination, same replication — but the *variance* of
   the paired difference rises because the two arms route the same person differently. This is the
   ordinary structural-comparison regime, not a CRN failure.
2. **Window membership stays intact, and that is load-bearing.** `PassengerRecord.arrivedAt` is
   documented as *"the window membership key. Dispatcher-independent, so the same passenger falls in
   the same window under every configuration being compared."* Level 1 must not change `arrivedAt`.
   In particular, **the walk to the assigned car must be charged between `arrivedAt` and `boardedAt`,
   never by moving `arrivedAt` later.** Moving it would change which passengers are in the report
   window per arm, and paired-t over differently-populated windows is not a paired-t.
3. **Transfer legs are the one genuine asymmetry.** `#onTransfer` re-injects a leg at
   `at + transferWalkS`, and `at` is dispatcher-dependent. So on transfer-capable buildings
   (`mixed-use-high-rise`, `secure-tower`, `vertical-city`) the *second leg's* arrival time already
   differs between arms today — the roadmap records this at § Phase 5 (3 of 396 journeys multi-leg on
   Secure Tower; `conservation.transfers` 0 under `nearest-car`, 3 under `eta`). Level 1 will make
   that divergence larger, not new. **Journey-level pairing (TTD) survives it; leg-level pairing
   (AWT) does not.** A second, independent reason TTD is the comparison metric.

**Effect on the replication budget.** ρ is what CRN buys, and it is regime-dependent
(`docs/07-handoff.md` § 4: 0.98–1.00 near-neighbour, ~0.61 structural). Measured here for A→C:
**ρ(TTD) = 0.80–0.88**, which is neither. Destination dispatch against conventional is **its own
regime** and must be budgeted as one.

### 2.5 The replication budget, with the arithmetic

`docs/07-handoff.md` § 4 gives the resolution limits at n = 100: **0.20 s** near-neighbour, **1.9 s**
structural. Neither applies directly, because both were measured on AWT on the shipped up-peak
points. The budget below is derived from the sd of the paired difference measured here.

Measured at the primary operating point, n = 40: `sd(ΔTTD)` = 2.10 s (weight 0.3) rising to 2.70 s
(weight 2.0). Take the conservative 2.7 s. Half-width at 95 % is `1.96 · sd / √n`:

| target half-width on ΔTTD | required n |
|---|---|
| ±1.0 s | 29 |
| ±0.8 s | 44 |
| **±0.5 s** | **113** |
| ±0.4 s | 176 |
| ±0.25 s | 449 |

For AWT the sd of the paired difference is smaller — 0.93 s at weight 0.3, from the ±0.287 half-width
at n = 40 — so ±0.2 s costs n ≈ 84.

**Locked budget: n = 150 per cell for arms A–F at the primary operating point.** Reasoning, in the
order it binds:

- 150 puts the ΔTTD half-width at **±0.43 s**, which resolves the measured 0.96–1.94 s effect with
  margin of at least 2×, and is inside `CLAUDE.md`'s stated 50–200 band.
- It is **not** raised to 500 because the effect is not marginal — at n = 40 it already excludes zero
  by 1.5× the half-width — and spending 3× the budget to narrow an interval that already answers the
  question is the failure `docs/05-roadmap.md` § Phase 7 warns about from the other direction.
- It is **not** lowered to 100 because the Level-1 (C→D) contrast has not been measured and its sd is
  unknown; 150 leaves headroom for an sd up to ~3.4 s at ±0.5 s.
- **Saturation is the real ceiling and must be re-censused.** `arms.ts` records `nearest-car` first
  diverging at replication index 287 on Midtown up-peak and 190 on Secure Tower. Those are for
  up-peak with `nearest-car`; **neither is the ceiling for the interfloor-mix point with `eta`, and
  neither may be reused.** `saturationCensus.test.ts` is the machinery; it must be re-run at the new
  operating point before 150 is committed. This is Open Question OQ-5.
- The three negative-control cells (down-peak, Garden, Secure up-peak) get **n = 30**, because their
  predicted result is *exactly zero* and 30 bit-identical replications is already conclusive — an
  exact zero with ρ = 1 needs no interval (§ Standing requirement: *"no budget changes it"*).

---

## 3. The interface contract, locked

### 3.1 Types that change, and how

**Additive only — no existing field changes type or meaning:**

| Type | File | Addition |
|---|---|---|
| `Passenger` | `core/src/model/passenger.ts` | `assignedCarId`, `assignedAt` (write-once accessors + `assign(carId, at)`) |
| `PassengerInit` | same | nothing — assignment is never an init value; a passenger exists before the panel answers |
| `PassengerRecord` | `core/src/metrics/types.ts` | `assignedCarId?`, `assignedAt?` |
| `SIM_PARAMETERS` | `core/src/sim/types.ts` | `sim.assignedWalkS` |
| `SimulationConfig` | same | `assignedWalkS?: number` |
| `DISPATCH_PARAMETERS` | `core/src/dispatch/parameters.ts` | any new stage-1 knob (§ 3.2), each with `activeWhen: { 'dispatch.callType': ['destination-entry', 'mobile-credential'] }` |
| `COST_TERMS` | `core/src/dispatch/terms/index.ts` | any new term, each with the same `activeWhen` — **or `partiallyActiveWhen`, if only part of its raw value is destination-priced.** `stopCount` is the case: the gate was written and refused by measurement, because the term still separates candidate cars under `up-down-buttons` and a gate there hides a live dimension. `terms/destinationDisclosure.test.ts` decides which form a term needs by measuring it |
| `REPLICATION_METRICS` | `experiments/src/runner/metrics.ts` | `walkS` if the walk is reported separately (optional; see OQ-2) |

**Behaviourally changed, not type-changed:**

| Symbol | File | Change |
|---|---|---|
| `batchKeyOf` | `core/src/dispatch/lifecycle.ts:66` | keys on destination under a destination `callType`. **Takes `ResolvedDispatchConfig`** — it currently does not, and that signature change is the one breaking change in `core` |
| `Floor.waiting` / `takeWaiting` | `core/src/model/floor.ts` | gains an assigned-car predicate path |
| `costRequestFor` | `dispatch/lifecycle.ts:106` | unchanged. It is already correct |

**Explicitly unchanged, and asserted so:**

- `Car.estimateCost()` stays pure (invariant 1). Nothing in § 1 or § 3 gives it state.
- `VIZ_SCHEMA_VERSION` bumps 2 → 3 only if the landing panel is rendered. `VizLandingSeries`
  (`viz/src/contract/types.ts:164-166`) is keyed `(floorId, direction)`, which has no meaning under
  Level 1. **If the viz work is not in scope, the version does not move and the viewer renders a
  Level-1 run with an empty landing series — which is a silent wrong picture, exactly the class of
  defect `docs/07-handoff.md` § 7 records for the first-frame car positions.** So: either bump and
  render, or make `recordRun` refuse a Level-1 run outright. **Do not do neither.**

> ### ⚠️ Correction — the prediction above is REFUTED by measurement; the instruction it justified
> ### was right anyway (C31)
>
> **The predicted failure was an *empty* landing series. The real one was a *collapse*.** Phase 6b
> kept `PassengerRecord.direction` populated under a panel, so `foldPassengers` draws exactly the
> same landings a conventional recording does — 28 on Midtown Office under either model. Nothing is
> empty. What a version-3 recording actually did was **collapse 92 landing calls and 132 promise
> groups into 28 direction buckets, carrying no field from which the promise could be recovered**,
> and then say something false on screen: `describeSelection` printed *"unassigned — no car answered
> this call in this run"* about passengers the panel had already promised a car to. A wrong picture
> that is *populated* is harder to notice than an empty one, which makes this the more dangerous
> half of the prediction, not the milder one.
>
> The same reasoning applied one level out to the CLI: `watch` on a Level-1 configuration renders a
> **populated** landing column (measured — `▲71` and `▲8` against a header count of 79), so the
> flag that `watch` would show an empty series is likewise **not reproducible**, and for the same
> reason.
>
> **The instruction — bump and render, or refuse; do not do neither — was correct and was followed.**
> `VIZ_SCHEMA_VERSION` is **4**, `VizRecording` carries the per-leg promise, and the panel is
> rendered: a landing under a panel partitions into promise groups exhaustively
> (`frame/overlay.test.ts`, 5 buildings × 11 instants), the shaft highlight follows the *promise*
> rather than the outcome, and a promised passenger nobody served reads as **promised**, not as
> unassignable. See [`DECISIONS.md` § T18-D1](../DECISIONS.md).

### 3.2 Tunables — data, not code (invariant 7), each declaring its schema (invariant 8)

A destination dispatcher is a weight vector plus stage settings. Nothing in Phase 6 may introduce
`if (profile.id === …)`; `dispatch/lifecycle.ts:25-32` already states the rule and the distinction
that makes a categorical switch legal.

Minimum declared surface:

```
dispatch.callType                 (exists)  categorical, gates everything below
dispatch.assignmentTiming         (exists)  refuses `deferred` under destination-entry
weights.rideTime                  (exists)  activeWhen dispatch.callType ∈ {destination-entry, mobile-credential}
sim.assignedWalkS                 (new)     continuous [0,30] default 0 — NOT profile-authorable
```

Any new stage-1 knob (e.g. a destination-batching window distinct from `batchWindowS`) must carry
`activeWhen` on `dispatch.callType`, **and — per the roadmap's new rule — must prove its gated-off
region is flat.** If it cannot, the honest declaration is `partiallyActiveWhen`, which claims the
opposite about that region and carries the opposite proof obligation. `searchSpaceLiveness.test.ts`'s header is explicit that
`idle.predictorHorizonS` was *"a live dimension declared dead"* and that *"every remaining gate has to
assert that its gated-off region is flat."* A destination-only knob that turns out to move a run
under `up-down-buttons` is a wiring bug in the gate, not a bonus.

### 3.3 The ownership map

Per the standing requirement: for every behaviour, the file it is **implemented in** and the file it
is **called from**. A barrel re-export and a `{@link}` are not callers.

| # | Behaviour | Implemented in | **Called from (non-test)** | Owner |
|---|---|---|---|---|
| 1 | Destination profiles in `data/` | `data/dispatcher-profiles.json` | `core/src/config/loader.ts` `loadConfig` ← `cli/src/data.ts` ← `cli/src/commands/{run,compare,watch,tune}.ts` | **O-DATA** |
| 2 | Destination call identity | `core/src/dispatch/lifecycle.ts` `batchKeyOf` | `core/src/dispatch/policy.ts` `register`; **`core/src/sim/simulation.ts` `#openCalls` (line 940, `callIdOf`) and `#callValue` (2041)** | **O-SEAM** |
| 3 | Per-passenger assignment state | `core/src/model/passenger.ts` | **`core/src/sim/simulation.ts` `#applyDecision` (1062)** | **O-SEAM** |
| 4 | Assigned-car landing queue | `core/src/model/floor.ts` | **`core/src/sim/simulation.ts` `#boardFrom` (1754), `#projectedBoarding` (1796), `#waitingFor` (1526), `#eligibleWaiting` (2177), `#syncButton` (2190)** | **O-SEAM** |
| 5 | Walk-to-car delay | `core/src/sim/types.ts` (`SIM_PARAMETERS`) | **`core/src/sim/simulation.ts` `#admit` (852) / `#applyDecision` (1062)**; resolution at `simulation.ts:2523` | **O-SEAM** |
| 6 | Assignment metrics | `core/src/metrics/recorder.ts`, `metrics/types.ts`, `metrics/summarize.ts` | **`core/src/sim/simulation.ts` `#applyDecision`**; `experiments/src/runner/metrics.ts` `metricOf`; `cli/src/format.ts` | **O-METRICS** |
| 7 | Conservation of assignment | `core/src/sim/simulation.ts` `#reconcile` (2376) | itself, into `SimulationResult.conservation` ← `cli/src/commands/run.ts` `printRunReport` | **O-SEAM** |
| 8 | Any new cost term | `core/src/dispatch/terms/<term>.ts` | `core/src/dispatch/terms/index.ts` `COST_TERMS` → `dispatch/scoringEngine.ts` → `dispatch/policy.ts` → **`core/src/sim/simulation.ts` `#dispatchBank` (983)** | **O-TERMS** |
| 9 | Access-control study | `experiments/src/benchmark/accessControl.ts` (new) | `experiments/src/benchmark/index.ts` **and** `experiments/src/benchmark/regeneratePins.ts` **and** `published.ts` `PINNED_ESTIMATES` | **O-STUDY** |
| 10 | Destination-dispatch study | `experiments/src/benchmark/destinationDispatch.ts` (new) | same three | **O-STUDY** |
| 11 | Benchmark case for the new operating point | `experiments/src/benchmark/arms.ts` | `experiments/src/benchmark/suite.ts` → `dispatcherBenchmark.test.ts` | **O-STUDY** |
| 12 | Landing-panel rendering | `viz/src/contract/{types,series}.ts`, `viz/src/record/recordRun.ts`, `viz/src/render/canvas.ts` | `viz/src/replay/replay.ts`, `viz/src/dev/main.ts`, **`cli/src/commands/watch.ts`** | **O-VIZ** |
| 13 | Oracle pinned to conventional | `core/src/analytical/validation.test.ts`, `core/src/sim/oracle.test.ts` | themselves | **O-SEAM** |
| 14 | Guard extension | `core/src/dispatch/deadCode.test.ts` `AUDITED_MODULES` (line 52), `core/src/sim/seam.test.ts`, `core/src/sim/searchSpaceLiveness.test.ts` | themselves | **O-SEAM** |

**`packages/core/src/sim/simulation.ts` has exactly one owner: O-SEAM.** It appears in rows 2, 3, 4,
5, 6, 7, 8 and 13. Every other owner delivers into it and **may not edit it**; O-SEAM performs the
wiring and produces the liveness evidence. This is the direct remedy for the Phase 5 cause recorded
at `docs/05-roadmap.md:44-47` — *"`sim/simulation.ts` … appeared in no agent's ownership list."*

O-SEAM is therefore the critical path and cannot be parallelised away. See § 7.

---

## 4. The access-control hypothesis, made falsifiable

### 4.1 The roadmap's hypothesis is, as literally stated, already refuted

`docs/05-roadmap.md:549-550` asserts destination dispatch improves *"because authorization and
optimization happen in the same step."* `dispatch/lifecycle.ts:100-104` repeats it. **Measured, it is
false for `destination-entry` and true only for `mobile-credential`,** and the mechanism is visible in
the code.

`estimateCost` checks the destination's access zone using `request.credentialGroup`
(`estimateCost.ts:129`). Under `destination-entry`, `costRequestFor` forwards the destination and
**drops the credential** (`lifecycle.ts:112-113`). So the car is asked "may an *unbadged* passenger
reach floor 30?" and answers `destinationAccessDenied` for every zoned floor. Secure Tower, up-peak
2 %, `eta` + `rideTime` 0.3, seeds 1001–1005:

| Arm | status | mean unserved | mean undelivered | AWT |
|---|---|---|---|---|
| A. `up-down-buttons` | completed 5/5 | 0 | 0 | 15.511 s |
| C. `destination-entry` | **timed-out 5/5** | **24.2** | **43.2** | suppressed |
| F. `mobile-credential` | completed 5/5 | 0 | 0 | 15.511 s |

Disclosing the destination *without* the credential does not merely fail to help on an
access-controlled building — **it breaks the building.** The same shape appears on the default
mixed-traffic point (undelivered 19 → 349).

This is not a defect to fix in passing. It is a genuine semantic question the roadmap left open:
**does a destination-entry kiosk in an access-controlled lobby know who is standing at it?** Two
coherent answers, and Phase 6 must pick one and record it in `DECISIONS.md`:

- **(a) No.** A bare kiosk reads a destination, not a badge. Then `destination-entry` is
  *inapplicable* to access-controlled buildings, the correct configuration for Secure Tower is
  `mobile-credential`, and `loadConfig` should warn when a building declares `accessZones` and a
  profile authors `destination-entry`. The hypothesis is then about `mobile-credential`, not about
  destination entry.
- **(b) Yes, at the panel.** The kiosk rejects destinations the passenger is not authorized for
  *before* a call is registered, so an unauthorized request never reaches a car. This is what real
  destination-entry systems in secure buildings do, and it moves authorization one step earlier
  still. It requires a new registration-stage check in `#openCalls` and changes the undelivered
  accounting (a rejected request is a passenger who never called, not a passenger nobody served).

**Recommendation: (b), with (a)'s warning as a fallback if (b) does not fit the schedule.** (b) is
the configuration that makes the roadmap's sentence true, and (a) makes the sentence vacuous — it
reduces to "credentials help", which is not a claim about destination dispatch.

### 4.2 The conventional arm cannot be an arm on Secure Tower, and that changes the study design

Measured on Secure Tower at the **primary interfloor-mix operating point**, seeds 5000–5009, n = 10:

| Arm | status | undelivered / run | TTD |
|---|---|---|---|
| A. `up-down-buttons` | **timed-out 10 / 10** | **22.6** | no valid cell |
| E. `mobile-credential` | completed 10 / 10 | 0.0 | 53.15 s |
| F. `mobile-credential` + `rideTime` | completed 10 / 10 | 0.0 | 53.15 s |

The conventional arm does not perform *worse* on this building — **it does not perform.** The failure
is structural, not load-driven: an access-restricted pickup carries no credential under
`up-down-buttons`, so every car returns `accessDenied` and the call is permanently unassignable
(`simulation.ts:1087-1103` says exactly this, and names Secure Tower). Lowering the arrival rate does
not help, because the refusal has nothing to do with load.

`CLAUDE.md` § Statistical discipline forbids quoting a mean for a run whose queues grow without
bound, and `arms.ts` requires *every* arm in a cell to return a valid AWT before the cell has an
interval at all. **So there is no paired-t interval to be had between arms A and E on Secure Tower,
and a study that quotes one has broken its own rules.** H-ACCESS must therefore be split into two
claims with two different statistical shapes.

### 4.3 The hypothesis, restated so it can fail — in two parts

> **H-ACCESS-1 (coverage — categorical, not an interval).** Under conventional dispatch, an
> access-controlled building with down and interfloor traffic is **not servable at all**; under
> credential-aware dispatch it is. On a building with no access zones the two are **identical**.

Predicted: Secure Tower, interfloor-mix — arm A times out on ≥ 9 of 10 replications with > 15
undelivered journeys each, arm E completes 10 of 10 with 0 undelivered; Midtown Office — arm E is
**bit-identical** to arm A. **Measured above, and the Midtown null is measured too:** arm E was
byte-identical to arm A on Midtown at every seed tested. **Refuted if** conventional completes Secure
Tower's interfloor traffic, or credential-aware fails to, or Midtown shows any difference at all.

This is the stronger of the two claims and it needs no confidence interval — an outcome that is
categorical does not get one.

> **H-ACCESS-2 (optimization — the roadmap's actual mechanism claim).** *Given* that the credential
> is present, moving the **destination** to call time helps **more** on an access-controlled building
> than on one without access zones, "because authorization and optimization happen in the same step."
> Formally, with `Δ = TTD(credential + destination) − TTD(credential alone)` per building under CRN:
>
> `Δ_secure − Δ_midtown < 0`, with a 95 % interval on the difference-of-differences excluding zero.

**The pilot points at refutation, and this is reported before the study rather than after.** n = 30
per building, seeds 5000–5029, same operating-point shape on both:

| `weights.rideTime` | Δ_midtown (s) | Δ_secure (s) | Δ_secure − Δ_midtown | relative Δ_midtown | relative Δ_secure |
|---|---|---|---|---|---|
| 0.3 | **−0.962 ± 0.651** | **−0.455 ± 0.328** | **+0.507** | −1.43 % | −0.86 % |
| 1.0 | **−1.821 ± 0.738** | **−0.716 ± 0.404** | **+1.105** | −2.71 % | −1.35 % |

Both Δ are real and both exclude zero — destination disclosure helps on both buildings — but the
difference-of-differences is **positive at both weights, and in both absolute and
baseline-relative form.** At the pilot's precision that is the direction that **refutes** H-ACCESS-2.

The mechanism is legible and makes the refutation credible rather than a fluke: once the credential
is present, the destination adds nothing further to *authorization* — the access check has already
passed — so all it can contribute is ordinary `rideTime` optimization, and Secure Tower's banks are
3 identical cars over 15–16 floors against Midtown's larger, more differentiated bank. **There is
simply less for a destination to differentiate.** The "same step" saving is real, and it is entirely
in the *credential*, which is H-ACCESS-1.

> **⚠️ The last sentence above is withdrawn — its destination for the saving is unmeasured — and it
> is left standing as the prediction it was.**
> H-ACCESS-1 — § 4.3's coverage claim, *"not servable at all"* — was **REFUTED** on 2026-08-05
> ([§ D256](../DECISIONS.md), [§ D279](../DECISIONS.md)): it was measuring
> [§ D254](../DECISIONS.md)'s pickup-access defect rather than conventional dispatch. Re-measured,
> `eta` and `destination-eta-unpriced` are **bit-identical on 150 of 150** Secure Tower replications
> across all seven identity metrics, so the credential buys nothing there and the saving cannot be in
> it. **Where the saving is instead is unmeasured**, and this contract does not supply a replacement
> mechanism — the surviving measured statement is the *negative* one, that the same-step mechanism is
> not what produces it. H-ACCESS-2's own direction, and this section's prediction of it, are
> unaffected: the full-budget figure is `+1.020 [+0.625, +1.414]` ([§ D280](../DECISIONS.md)).

**What would refute H-ACCESS-2 at the full budget:** the interval on `Δ_secure − Δ_midtown` excluding
zero on the positive side, which is the pilot's direction. **What would confirm it:** the interval
excluding zero on the negative side, which would mean the pilot's sign is a small-n artefact and
would require an explanation of what changed. **What would leave it open:** an interval containing
zero, which at n = 150 and the pilot's ±0.4–0.7 s precision would itself be informative — it would
say the interaction is below the resolution limit and the roadmap's mechanism claim is not
measurable on the shipped building set.

**Two design consequences that follow from the pilot and must be built in:**

1. The DoD form is **mandatory**. A single-building interval on Secure Tower would show
   −0.455 ± 0.328 s, exclude zero, and read as confirmation. It is only against Midtown's larger
   −0.962 that it reads as refutation. **A single-building interval cannot distinguish "authorization
   and optimization in the same step" from "moving any information earlier helps everywhere", and the
   roadmap's sentence is a claim about the former.**
2. The two buildings' baselines differ (67 s vs 53 s TTD), so the DoD must be reported in **both**
   absolute and baseline-relative form, and the verdict taken only where the two agree. They agree
   here; if they ever disagree, that disagreement is the result.

**This project's gates have refuted stated predictions three times — the Phase 2 gate, the Phase 3
gate finding the project's own CRN claim wrong by 10×, and the Phase 5 gate reporting its headline
feature producing exactly zero — and all three were recorded as successes.** H-ACCESS-2 is written so
that the pilot's direction is a publishable answer. A Phase 6 report that returns
`Δ_secure − Δ_midtown > 0` has **succeeded**, and the correct product is a corrected sentence in
`docs/05-roadmap.md:549-550` and a `DECISIONS.md` entry, not a retuned weight vector.

---

## 5. `LearnedDispatcher` scope

### 5.1 Where the nondeterminism is allowed to live: `policyNoise`, and nowhere else

`StreamSet` already declares six streams (`random/streams.ts:52-59`), the sixth being `policyNoise`,
documented as *"Stochastic dispatcher exploration."* **The simulation never touches it today** —
`simulation.ts:722` says *"`policyNoise` is untouched by this phase"*, and
`traffic/generator.test.ts:104-116` asserts the trace generator never touches it either.

So: **a learned policy draws from `streams.policyNoise` and from no other stream, ever.** That single
rule is what keeps the environment reproducible while the policy is stochastic, and it works because
of the guarantee `streams.ts` exists to provide and `streams.test.ts` asserts in both directions:

> *Consuming any number of values from one stream leaves every other stream's sequence bit-identical
> to a freshly constructed `StreamSet` with the same master seed.*

A policy that explores as much as it likes therefore cannot perturb who arrives, when, from where, to
where, or weighing what. Two learned arms at the same seed see **the same passengers** and differ only
in what they did with them, which is the definition of attributable variance.

**Note the collision that is not one.** `experiments/src/tuning/search/round.ts:47` sets
`SEARCH_STREAM = 'policyNoise'`, and `tuning/space/sample.ts:116` builds `policyNoiseStream(seed)`
from a *fresh* `StreamSet`. That is a different `StreamSet` object from the simulation's, so a
learned policy drawing from the run's `policyNoise` and a search drawing from its own do not
interleave. But they do use the same derived sequence for the same master seed, so a search whose
candidates are learned policies must use a search seed disjoint from its trace seeds — which
`assertDisjointSeedSets` already enforces for trace/holdout and must be extended to cover this.
Recorded as Open Question OQ-6.

### 5.2 How the environment stays reproducible

Four requirements, each with an existing enforcement pattern to copy:

1. **No `Math.random`.** Enforced today by the source-level guard pattern that
   `estimateCost` already carries (invariant 1's third defence: *"a source-level guard that the
   module cannot import an RNG"*). The learned policy module gets the inverse guard — it may import
   `Rng`, but only the `policyNoise` accessor.
2. **No wall-clock (invariant 3).** A learned policy must not time its own inference. All time from
   the kernel.
3. **Stream neutrality, asserted end to end.** After a full `runSimulation` with a learned policy,
   `arrivals`/`origins`/`destinations`/`passengerMass` must be at exactly the state a run with a
   fixed policy at the same seed left them. This is § 2.4's test and it covers both features.
4. **Same seed ⇒ bit-identical run.** `sim/determinism.test.ts` already asserts this class; a learned
   policy must join it. "Component-level nondeterminism" means the policy is stochastic *as a
   function*, not that a replication is irreproducible. A learned dispatcher whose run is not
   replayable from its seed violates invariant 5 and is not shippable regardless of its AWT.

### 5.3 How a learned policy is evaluated without violating § Statistical discipline

The problem a learned policy adds is that its behaviour depends on **training**, and training is a
second thing to hold out. Three rules:

- **Train on one seed set, evaluate on a disjoint one.** This is `CLAUDE.md` § Tuning discipline's
  hold-out rule applied to weights that were learned rather than searched, and the machinery exists:
  `tuning/report/holdout.ts`, `holdoutRound.ts`, `assertDisjointSeedSets`. A learned policy evaluated
  on its training seeds is the same defect as a weight vector tuned and validated on one seed set,
  and `docs/07-handoff.md` § 5 records that the *tuning* seed set failed to show significance where
  the holdout set did — i.e. this project has already seen the two disagree.
- **Report the policy, not the run.** A stochastic policy's replication-to-replication variance has
  two sources, environment and exploration. Evaluate with exploration **off** (greedy) for the
  headline interval, and report the exploring variance separately. An interval that mixes the two
  cannot be compared to a deterministic arm's interval.
- **Paired-t against a deterministic arm, on TTD, at the budget of § 2.5.** No new statistics. The
  learned arm is an arm.

### 5.4 Is a learned policy data or code? — the invariant-7 question

**Position: the *policy* is data; the *architecture and the update rule* are code; and invariant 7 is
not violated, but invariant 8 is under real strain and must be honoured explicitly.**

The argument. Invariant 7's actual prohibition is stated precisely in `dispatch/lifecycle.ts:25-32`:
*"the failure is `if (profile.id === 'nearest-car')`, which puts behaviour in code that the config
claims to own."* A learned policy's parameters are a vector of numbers that a profile can carry, an
optimizer can write back, and a run can be replayed from. That is the same species as a weight
vector, only longer. Shipping it as a file of numbers referenced by a profile — the way
`data/dispatcher-profiles.json` already references `terms` — keeps the config the authority.

Where it genuinely strains is **invariant 8**: *"every tunable declares its schema — type, range,
default, and `activeWhen` — so a generic optimizer can search the space without elevator-specific
knowledge."* A 400-parameter network cannot be declared as 400 `continuous [−1, 1]` dimensions
without making `collectSearchSpace()` return a space no search in `tuning/search/` can handle, and
`searchSpaceLiveness.test.ts` would then have to prove 400 dimensions individually non-flat, which is
neither affordable nor meaningful.

**So the contract is:** a learned policy declares **one** tunable of a new declared type —

```
dispatch.policyWeights   type: 'opaque-vector'   dimension: N   source: a named file in data/
```

— which the search space **declares and excludes** rather than silently omits, with the exclusion
carrying its reason, exactly as `searchSpaceLiveness.test.ts`'s `DECLARED_INERT` entries do. An
opaque vector that the generic optimizer cannot search is honest; an opaque vector the optimizer
cannot *see* is the invariant-8 failure. The learned policy's own trainer is then a separate search
with its own gradient, which is fine — `tuning/search/` was never the only permitted optimizer.

**Consequence for scope: `LearnedDispatcher` should not be attempted in the same wave as
destination dispatch.** See § 7 and § 9.

---

## 6. Double-deck — recommendation: **OUT of Phase 6**

### 6.1 Where it stands, verified

`data/buildings/vertical-city.json` declares eight `doubleDeck: true` shuttles with
`deckSeparationM: 4.5`, `ratedLoadLbPerDeck: 2000` and four `servesFloorPairs`. `loadConfig` raises
`WARNING_CODES.doubleDeckNotSimulated = 'double-deck-not-simulated'` (`config/schema.ts:99`), the
`Simulation` raises the same statement into `result.warnings`, and `config/doubleDeck.test.ts`
asserts it **in both directions** — a building with no double-deck car must raise no warning.
`DECISIONS.md` § D11 records the decision and § D23 records that `planRun` in
`cli/src/commands/run.ts` is the non-test caller that branches on the code.

The building's own notes say it: *"This building is the most deferrable in the set; the other four
cover the algorithmic ground without a double-deck model."*

### 6.2 Recommendation and reasons

**Out.** Four reasons, in the order they bind:

1. **It shares no interface with destination dispatch.** Destination dispatch changes registration,
   assignment and boarding. Double-deck changes *the car*: a `Car` becomes two coupled decks with a
   fixed offset, `positionAt(t)` serves two floors at once, the load sensor is per deck, and
   `estimateCost`'s route projection must model a stop that opens on two floors. There is no shared
   type, no shared file, and no shared measurement. Bundling them buys nothing and doubles the
   surface O-SEAM owns.
2. **It has its own oracle problem, unsolved.** The Barney/CIBSE round-trip formula for double-deck
   is a different derivation, and `analytical/roundTripTime.ts` implements the single-deck one.
   `docs/07-handoff.md` § 8 already records `vertical-city`'s interval as `unmeasurable` by design
   (*"a shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so no
   departure-gap threshold is valid there"*). Double-deck would land on a building that has no valid
   interval to validate against.
3. **Phase 6's acceptance criterion does not need it.** The criterion names the **Mixed-Use
   High-Rise**, not Vertical City. `mixed-use-high-rise` declares no double-deck car.
4. **The disclaimer is already correct and already guarded in both directions**, so leaving it costs
   nothing and misleads nobody — which is the difference between this and the seven dead seams.

### 6.3 If out, what the disclaimer must keep saying

Unchanged in substance, and **three properties must be preserved**:

- `loadConfig` raises `double-deck-not-simulated` naming the **building and the bank**, and
  `runSimulation` carries the same statement into `RunRecord.warnings`, so a stored record and every
  report can see it (D11, D22).
- `config/doubleDeck.test.ts` keeps asserting it **in both directions**, so *"the day a `Car` learns
  about decks the disclaimer has to be revisited rather than quietly outliving its truth."*
- `planRun` in `cli/src/commands/run.ts` remains the named non-test caller that branches on
  `WARNING_CODES.doubleDeckNotSimulated` (D23). **Phase 6 must not remove that branch**, or the code
  becomes the eighth dead seam again.

One addition Phase 6 *should* make, because Phase 6 creates the risk: **if a Level-1 destination
profile is ever run against `vertical-city`, the disclaimer must also say that the shuttle's
destination grouping is being simulated on single-deck hardware**, since destination grouping's whole
benefit is stop reduction and a double-deck shuttle's stop economics are different. One sentence, in
the same warning, guarded by the same test.

---

## 7. Work breakdown and sequencing

Units are labelled by the owner in § 3.3. **Dependencies are on *interfaces*, not on code**, so a
unit may start as soon as its inputs are locked by this document.

### Wave A — parallel, no dependencies, starts immediately

| Unit | Deliverable | Acceptance criterion | Required liveness evidence (**measured**) | Non-test caller |
|---|---|---|---|---|
| **A1** (O-DATA) | Two Level-0 profiles in `data/dispatcher-profiles.json`: `destination-eta` (`destination-entry`, `weights.rideTime`) and `destination-secure` (`mobile-credential`) | Both load through the real `loadConfig`; `policies.test.ts`'s "no profile weights a term its own stage settings make inert" stays green | `rideTime` evaluations **> 0 and non-zero on > 90 % of evaluations** through `runSimulation`, counted via the `createPolicy` instrumentation hook. The roadmap's own baseline is 468/468 non-zero with spread in 57 decisions | `config/loader.ts` ← `cli/src/data.ts` |
| ↳ **A1 as executed, which differs from A1 as planned** | The two profiles that shipped are `destination-eta` and **`destination-panel`** — there is no `destination-secure` — and **both** declare `mobile-credential`, not `destination-entry`. `destination-panel` weights `rideTime: 1`. `destination-eta` **weighted it at zero for the whole of Phase 6**, which is why the full experiment matrix found it **bit-identical to `eta` at all eight cells**: A1's liveness criterion was not met by the profile carrying the plan's name, and nothing failed, **because the criterion was never wired to a test**. This row is left as planned rather than rewritten, per this document's own rule about checking a disposition against the claim | | | |
| ↳ **A1's liveness criterion, finally measured (2026-07-28)** | `weights.rideTime: 0.5` is authored ([`DECISIONS.md` § D112](../DECISIONS.md)) and the criterion is now **met and exceeded**: `rideTime` non-zero on **260 / 260** evaluations with cross-car spread in **12 of 65** decisions on `midtown-office`, and 159 / 159 with spread in 2 of 53 on `secure-tower`, counted through `runSimulation` at seed 20 260 726 — against **0 evaluations** before. The gated-off side is flat (0 / 248), which is **R6-2**'s proof obligation discharged in the same measurement. The plan's *"> 90 % of evaluations non-zero"* is cleared at 100 %. `benchmark/destinationLiveness.ts` is the study; `livenessSuite.ts` is its non-test caller | | | |
| **A2** (O-STUDY) | `experiments/src/benchmark/arms.ts`: new `BenchmarkCase` for Midtown interfloor-mix, with a re-run saturation census | `saturationCensus.test.ts` returns the first-invalid index at the new point for `eta` and for every arm | The census index itself, over 1000 replications. **`arms.ts`'s existing 287/190 may not be reused** | `benchmark/suite.ts` |
| **A3** (O-SEAM) | Oracle pinned to `up-down-buttons`, with the reasoning in § 1.7 in its docstring | `analytical/validation.test.ts` and `sim/oracle.test.ts` state the pin and fail if a destination profile is passed | A run of the oracle test with a `destination-entry` profile must **fail with a named reason**, not pass | themselves |
| **A4** (O-STUDY) | `destinationDispatch.ts` Level-0 study: arms A, B, C, E, F at the primary point, n = 150 | Every interval quotable (no saturated cell); `Δ TTD` for C−A excludes zero | The intervals, pinned into `published.ts` `PINNED_ESTIMATES` at full precision | `benchmark/index.ts` + `regeneratePins.ts` + `published.ts` |

**A4 is the highest-value unit in Phase 6 and it needs no `core` change at all.** It converts the
handoff's TTD instruction from prose into a pinned measured result, and it is a complete, defensible
Phase 6 deliverable on its own.

### Wave B — Level 1. **Serial on O-SEAM. This is the part that cannot be parallelised.**

`packages/core/src/sim/simulation.ts` is 2 765 lines and units B1–B5 all edit it, in overlapping
methods (`#openCalls`, `#admit`, `#applyDecision`, `#boardFrom`, `#reofferCall`, `#reconcile`). Four
agents editing that file concurrently produces either merge conflicts or — worse, and this is the
Phase 5 failure in a new costume — four correct edits that together do not compose. **One agent,
O-SEAM, does B1 through B5 in order.**

| Unit | Deliverable | Acceptance criterion | Required liveness evidence (**measured**) | Depends on |
|---|---|---|---|---|
| **B1** | `Passenger.assign()` write-once; `assignedCarId`/`assignedAt` | A second `assign` throws, exactly as a second `board` does | — (state, not behaviour) | — |
| **B2** | Destination call identity: `batchKeyOf` takes config; `#openCalls`/`#callValue` register per OD pair | On the primary point, **call count per replication is strictly greater** under a destination profile than under `up-down-buttons` | The two call counts, from `policy.calls` instrumented through `createPolicy`. A ratio of exactly 1.0 is a wiring bug | B1 |
| **B3** | Assigned-car queue: `Floor` predicate; `#boardFrom`/`#projectedBoarding` honour `assignedCarId` | **Zero** boardings onto a car other than the assigned one, over a full run | A counter of `passenger.assignedCarId !== car.id` boardings, asserted `=== 0`, plus `legsAdmitted === legsAssigned` in `#reconcile` | B2 |
| **B4** | `sim.assignedWalkS` declared and charged between `arrivedAt` and `boardedAt` | `arrivedAt` is **unchanged** from the Level-0 run at the same seed, per passenger | Byte-equality of the `arrivedAt` column across a Level-0 and a Level-1 run. Any difference invalidates window membership (§ 2.4) | B3 |
| **B5** | Conservation + stream neutrality | `#reconcile` reports assignment conservation; the four trace streams end at the state a Level-0 run leaves them | `Rng.getState()` before/after a full `runSimulation`, compared against a fresh `StreamSet` — the `generator.test.ts:104-116` pattern applied to the whole run | B4 |
| **B6** (O-METRICS, parallel with B4–B5) | `PassengerRecord.assignedCarId/assignedAt`; `recordAssignment` | Record schema version bumps; old records still parse | Count of records carrying `assignedCarId` equals `legsAssigned` | B1 |
| **B7** (O-STUDY, after B5) | Level-1 arm D added to the study; `NOT COMPARABLE` labelling for the nine metrics of § 1.6 | The report shows exactly nine metrics labelled not-comparable, derived from a declared list, not hand-written | The list, asserted against `REPLICATION_METRICS` in both directions | B5, A4 |
| **B8** (O-VIZ, after B5) | Landing panel, `VIZ_SCHEMA_VERSION` 2 → 3 — **or** `recordRun` refuses a Level-1 run | Whichever is chosen, a Level-1 run through `cli watch` either renders assignments or fails loudly | Frame-level assertion that the panel state at time t equals the assignment set at time t | B5 |

### Wave C — access control

| Unit | Deliverable | Acceptance | Evidence | Depends on |
|---|---|---|---|---|
| **C1** (O-SEAM) | Decision on § 4.1 (a) or (b), recorded in `DECISIONS.md`; if (b), panel-stage authorization in `#openCalls` | Secure Tower under a `destination-entry` profile no longer times out; rejected requests are accounted separately from unserved. **Arm A continuing to time out is H-ACCESS-1's result, not a bug C1 may "fix"** | Undelivered count on Secure Tower under `destination-entry`: **43.2 → 0** at the seeds of § 4.1 | A1 |
| **C2a** (O-STUDY) | `accessControl.ts`: **H-ACCESS-1**, categorical. Timeout rate and undelivered count per arm per building, n = 30 | Reported as counts with **no confidence interval**, and the Midtown null reported as bit-identity | Timeout rate, undelivered/run, and a byte-equality check of arm E against arm A on Midtown | C1, A2 |
| **C2b** (O-STUDY) | Same module: **H-ACCESS-2** as a difference-of-differences, n = 150, both buildings, both weights, absolute **and** baseline-relative | The DoD interval is produced and quoted with its verdict **whichever way it falls**; the pilot's positive sign is stated in the module docstring as the prior | The DoD interval, pinned in `published.ts` | C2a, A4 |

### Wave D — learned control. **Recommend deferring out of Phase 6 entirely.** See § 9.

### What cannot be parallelised, and why

1. **B1→B5 are strictly serial** — one file, overlapping methods, and the composition is the
   deliverable. Splitting them by method reproduces the Phase 5 cause exactly.
2. **C2b depends on C2a** — H-ACCESS-2's interval is only meaningful once H-ACCESS-1 has established
   which arms can serve the building at all. Quoting a TTD interval for an arm that times out on
   10/10 replications is the exact failure `CLAUDE.md` § Statistical discipline names.
3. **B7 depends on A4** — the not-comparable labelling is only meaningful against a report that
   already exists.
4. **A2 gates the budget for everything** — if the census shows the new operating point saturates an
   arm before n = 150, every budget in § 2.5 moves.

---

## 8. Risks — how Phase 6 ships a ninth dead seam, and what catches it

> ## ⚠️ **R6-1 HAPPENED. It is no longer a risk; it is an instance.**
>
> This table was written to predict the ninth dead seam. Both of its top two candidates came true,
> and neither was caught by the mitigation named beside it.
>
> - **R6-1 — *"a destination profile ships in `data/` and changes nothing"*.** `destination-eta`
>   shipped `dispatch.callType: mobile-credential` with a weight vector identical to `eta`'s. Its
>   `activeWhen`-gated term was weighted at zero, so the destination reached `estimateCost` and
>   changed no decision: **bit-identical to `eta` at 8 of 8 matrix cells**, measured by the full
>   experiment matrix and by nothing that ran before it. **The mitigation named in the row below did
>   not fire**, for exactly the reason the row itself gives — `searchSpaceLiveness.test.ts` needs
>   only *one shipped building to differ*, and A1's evaluation-count criterion "was never wired to a
>   test" (§ 7, Wave A, as-executed row). Closed by authoring `weights.rideTime: 0.5`
>   ([`DECISIONS.md` § D112](../DECISIONS.md)).
> - **The ninth in code was `measureEnergyLiveness`, which is R6-4's shape** — a study module whose
>   only callers were its own tests — and it was not a one-off: **all five** studies `published.ts`
>   classifies `'no-intervals'` were dead, because the interval half has `regeneratePins.ts` as its
>   driver and the categorical half had none. R6-4's mitigation is the **pin table**, and a study
>   that publishes *counts* has no interval to pin, so the mitigation could not reach it.
>   [`DECISIONS.md` § D114](../DECISIONS.md).
>
> **What the liveness proof looks like now that it exists.** Counted through the shipped engine at
> seed 20 260 726: `rideTime` non-zero on **260 / 260** evaluations with cross-car spread in **12 of
> 65** decisions on `midtown-office`, and 159 / 159 with spread in 2 of 53 on `secure-tower` —
> against **0 evaluations** before, because the shipped profile weighted no gated term. **R6-2's
> proof obligation is discharged in the same measurement**: the gated-*off* side is flat, 0 / 248
> evaluations and 0 / 62 decisions under `up-down-buttons`. That is an evaluation count with spread,
> which is what R6-1's mitigation column asks for and what did not exist until now.

`docs/07-handoff.md` § 3 now counts **nine** instances in code, plus one in `data/` — and the count
is the length of that table rather than a number in prose. (`CLAUDE.md` § *What this project is*
agrees; `docs/05-roadmap.md` § Standing requirement names the ninth as the `'no-intervals'` half of
`benchmark/` and the `data/` one as `destination-eta`.) The four
candidates as they were predicted, left as written so the prediction can be checked against the
outcome: 

| # | The shape it would take | What catches it |
|---|---|---|
| **R6-1** | **A destination profile ships in `data/` and changes nothing.** Most likely of all: measured here, `callType` alone is bit-identical on Garden (30/30) and near-identical on Midtown up-peak. A profile authored against those points would read as a clean, tested, weighted, dead feature | `sim/searchSpaceLiveness.test.ts` already requires `dispatch.callType` non-flat, but **only needs one shipped building to differ**. A1's acceptance must be an **evaluation count with spread**, not a trajectory difference. And the negative controls of § 2.2 must be *predicted in advance*, so an expected zero is not confused with a wiring zero |
| **R6-2** | **A new stage-1 tunable is `activeWhen`-gated on `callType` and is inert inside the gate.** The `idle.predictorHorizonS` shape, one step on | `searchSpaceLiveness.test.ts` satisfies gates transitively (`satisfyGates`, line ~265) and requires liveness *inside* the gate. **New in this phase: it also requires the gated-off region to be flat** — so a destination-only knob that moves an `up-down-buttons` run now fails, and that proof obligation is on the author, not the reviewer |
| **R6-3** | **A new cost term is weighted by a Phase 6 profile and never evaluates.** The `rideTime`/`zoneAffinity`/`predictedDemand` shape, which produced 0 non-zero evaluations out of 2 142 | `dispatch/terms/liveness.test.ts` and the "every weighted term prices something" row of `sim/seam.test.ts`. Unit A1's evidence is the counted-evaluations figure and nothing else |
| **R6-4** | **A study module whose only callers are its own tests.** The `tuning/report` shape — the fifth instance, and the one that happened *after* both guards were installed, in a module they did not audit | `experiments/src/benchmark/published.ts` `PINNED_ESTIMATES` + `regeneratePins.ts`. Every interval a Phase 6 study prints must be pinned there and re-derivable, and `published.test.ts` scans every `.ts` under `benchmark/` for interval-shaped literals and requires each to be pinned or allowlisted with a reason. **A new study module that publishes an unpinned interval fails today** |

**Two guards are permanent and may not be deleted, weakened, or `--exclude`d to make Phase 6 pass:**
`packages/core/src/sim/searchSpaceLiveness.test.ts` and `packages/core/src/dispatch/deadCode.test.ts`.
A third, `packages/core/src/sim/seam.test.ts`, is named alongside them by the roadmap. If Phase 6 adds
a module under `dispatch/`, extending `AUDITED_MODULES` (`deadCode.test.ts:52`) is a one-line change
the roadmap says any such phase **should** make.

**Further risks specific to this phase:**

| Risk | Impact | Mitigation |
|---|---|---|
| **Level 1 silently changes `arrivedAt`** by charging the walk at the wrong end | Window membership diverges per arm; every paired-t in the phase is invalid and nothing fails | B4's acceptance is byte-equality of the `arrivedAt` column against a Level-0 run |
| **The walk time is made profile-authorable** | A dispatcher tunes away its own cost; the Pareto front is a lie | `sim.assignedWalkS` in `SIM_PARAMETERS`, not in `DISPATCH_PARAMETERS`; `searchSpaceLiveness.test.ts` already asserts `sim.doorObstructionProbability` stays *out* of the dispatcher space by the authorability rule, and the same assertion covers this |
| **The oracle is "fixed" to agree with a destination dispatcher** | The project's only external correctness anchor is destroyed, and it looks like an improvement | A3 pins the oracle to `up-down-buttons` and fails loudly on a destination profile |
| **`#reofferCall` re-offers a promised passenger to the group** | Level 1 quietly recovers the deferral advantage it is supposed to have surrendered; the whole "cannot defer" measurement becomes meaningless | OQ-1 must be settled before B2 starts; the chosen semantics is asserted by a test that counts panel re-assignments |
| **The viz renders a Level-1 run with an empty landing series** ⚠️ *the risk was real; the shape was wrong — see § 3.1* | A silently wrong picture — the exact shape of the first-frame car-position defect that Phase 4's replay-identity criterion could not see | B8 forces the choice: render it or refuse it. Not neither. **Discharged by rendering**: `VIZ_SCHEMA_VERSION` 4 carries the per-leg promise and the panel is drawn |
| **A learned policy draws from a trace stream** | CRN destroyed across every arm in the phase; power drops ~10×; nothing fails | B5's stream-neutrality assertion, applied to the whole run |
| **H-ACCESS-2 is measured on one building** | Secure Tower alone shows −0.455 ± 0.328 s, excludes zero, and reads as confirmation — while the difference-of-differences against Midtown reads as refutation. **This is the most likely way Phase 6 publishes a wrong conclusion**, because the wrong answer is the comfortable one | H-ACCESS-2 is specified as a difference-of-differences in both absolute and baseline-relative form (§ 4.3), and the pilot's refuting sign is stated in the study module's own docstring as the prior |
| **An arm that times out is given an interval** | A "win" is quoted against a baseline that did not run. Secure Tower arm A times out 10/10 at the primary point | C2a is categorical with no interval; `arms.ts`'s all-arms-valid rule keeps A and B out of Secure Tower's interval table |

---

## 9. Open questions — must be settled before implementation starts

| # | Question | Why it blocks | What would settle it |
|---|---|---|---|
| **OQ-1** | **When a car fills up and leaves promised passengers behind, what happens to their `assignedCarId`?** Write-once forbids re-assignment; `#reofferCall` currently re-offers the landing to the group | Blocks B2 and B3. The three candidate answers — (i) they keep the assignment and wait for that car's next trip, (ii) the panel re-assigns and `assignedCarId` becomes multi-valued, (iii) `assignmentMode: split-demand` pre-allocates so it cannot happen — produce measurably different systems | A decision recorded in `DECISIONS.md`, plus a measurement of how often it fires: instrument `#reofferCall` at the primary point and count. If it fires < 1 % of calls, (i) is adequate and cheapest |
| **OQ-2** | **Is walk time reported as its own metric, or only inside wait?** | Affects `REPLICATION_METRICS` (19 → 20) and every downstream consumer, including `published.ts`'s pin domain | Cheap either way; decide before B4 so `metricOf`'s switch is written once |
| **OQ-3** | **§ 4.1: does a destination-entry kiosk authorize?** (a) no, (b) yes at the panel | Blocks C1 and therefore C2, and determines whether `destination-entry` is even applicable to three of the five shipped buildings | Recommendation (b) is in § 4.1; needs an explicit decision because it changes the undelivered accounting |
| **OQ-4** | **Does deferral pay for a richer weight vector?** Measured with `eta`, deferring 1.5 s costs +0.93 s AWT and +0.81 s TTD — i.e. the "cost" destination dispatch pays is negative. Is that an artefact of `eta`'s single weight? | Determines whether "destination dispatch cannot defer" is reported as a cost, as a non-issue, or as an advantage | Re-run arm B against arm A with `predictive-balanced` (the only shipped profile that defers) at the primary point, n = 150. ~20 minutes of compute |
| **OQ-5** | **Does any arm saturate at the interfloor-mix operating point?** `arms.ts` records 287 (Midtown up-peak) and 190 (Secure up-peak) for `nearest-car`; neither applies here | Blocks the n = 150 budget in § 2.5 for every unit | Re-run `saturationCensus.test.ts` at the new point over 1000 replications for every arm. This is unit A2 |
| **OQ-6** | **Does a learned policy drawing from the run's `policyNoise` collide with a search drawing from `SEARCH_STREAM = 'policyNoise'` at a related seed?** They are different `StreamSet` objects but the same derivation from the same master seed | Blocks any tuning of a learned policy | Extend `assertDisjointSeedSets` to cover search seed vs trace seed, and assert it. Not needed if Wave D is deferred |
| **OQ-8** | **Does the roadmap's access-control sentence survive H-ACCESS-2?** The pilot (n = 30) says the destination-information benefit is **smaller** on the access-controlled building once the credential is present — the opposite of `docs/05-roadmap.md:549-550` and of `dispatch/lifecycle.ts:100-104`, which both assert the mechanism as fact in a docstring | Two shipped documents and one `core` docstring state as fact a mechanism the pilot contradicts. If C2b confirms the pilot, three places need correcting, and `documentation.test.ts` already exists to keep such claims consistent | C2b at n = 150. **Whichever way it falls, `DECISIONS.md` gets an entry and `dispatch/lifecycle.ts:100-104` gets either a citation or a correction.** A docstring that asserts an unmeasured mechanism is the same species as a published number nothing re-derives |
| **OQ-7** | **Does Phase 6's acceptance criterion still stand?** It reads *"a learned dispatcher beats the naive baselines on AWT and WT95 on the Mixed-Use High-Rise."* § 1.6 shows **AWT and WT95 are two of the nine metrics that stop being comparable under Level 1**, and § 2.1 shows the AWT/TTD sign flip at Level 0 | This is the phase's gate. As written it is a gate on two metrics this document argues are the wrong ones | **A decision by the orchestrator, not by an implementer.** `CLAUDE.md` forbids weakening a criterion — so the correct move is to **raise** it: require the interval on TTD *and* require AWT/WT95 to be reported with an explicit INDISTINGUISHABLE-or-worse verdict rather than hidden. That is strictly harder than the current text, which is why it is admissible |

**Things this document could not determine and did not paper over:**

- The Level-1 (C→D) effect size and its `sd(Δ)` are **unknown**. Every budget above is derived from
  the Level-0 measurement and assumes Level 1's variance is not more than ~25 % larger. If B5 lands
  and `sd(ΔTTD)` exceeds 3.4 s, n = 150 no longer resolves ±0.5 s and the budget must be re-derived.
- Whether destination grouping produces a **stop-count** reduction large enough to show in
  `personsPer5Min` was not measured; only `rideMeanS` was.
- The performance cost of R6-2's call-count increase (§ 1.3) was **not** measured. On a large lobby it
  could be an order of magnitude more calls per instant, and `MAX_DISPATCH_PASSES` was not sized for
  it.

---

## 10. Recommendation on shape

**Split Phase 6 into three, and ship them in this order.**

1. **Phase 6a — destination disclosure (Wave A, plus C1 and C2a).** No `core` change beyond C1's
   panel-stage authorization. Two profiles, one benchmark case, one pinned study, one oracle pin, and
   the categorical access-control result. Delivers **two** real measured results — TTD −0.96 to
   −1.94 s with a paired-t interval excluding zero against an AWT that moves the other way, which is
   precisely what `docs/07-handoff.md` § 7 says this simulator exists to quantify; and H-ACCESS-1's
   categorical finding that conventional dispatch cannot serve an access-controlled building's
   interfloor traffic at all. **Low risk, high evidential value, and it settles the roadmap's second
   bullet in its coverage half.** Its optimization half (H-ACCESS-2, unit C2b) can ride with it or
   with 6b; the pilot says it will refute, and a refutation is a deliverable.
2. **Phase 6b — destination dispatch proper (Waves B and C).** The passenger-model change. Serial on
   O-SEAM. This is where R9 actually lives.
3. **Phase 6c — learned control (Wave D).** Deferred. It shares no interface with 6a or 6b, it
   introduces the invariant-8 strain of § 5.4 which deserves its own decision, and — decisively — its
   acceptance criterion (OQ-7) is stated in metrics that 6b makes non-comparable. **Attempting it in
   the same wave means gating a learned policy on a metric whose meaning the same wave is changing.**

Attempting all of Phase 6 as one wave means four owners against one 2 765-line file with an unlocked
answer to OQ-1 and an acceptance criterion (OQ-7) that contradicts the phase's own comparison metric.
That is the Phase 5 configuration with a larger blast radius.

---

## Sources

Every measurement in this document was produced in the `T14-dd-contract` worktree on 2026-07-27,
against `packages/core/dist/index.js` built from `1cd9d2a`, loading the repository's own `data/`
directory. Operating points:

- **Midtown interfloor-mix** (the primary point) — `{durationS: 1800, reportWindow: 'full-run',
  demand: {directionalSplit: {incoming: 0.4, outgoing: 0.3, interfloor: 0.3}, entranceWeights:
  {G: 1, P1: 0}, arrivalRatePctPop5min: 1.5, peakWindowS: 300}}`, seeds 5000–5039.
- **Secure Tower interfloor-mix** — identical but with no `entranceWeights` (one entrance), seeds
  5000–5029.
- **Secure Tower up-peak** — `arms.ts`'s `SECURE_UP_PEAK_2PCT`, seeds 1001–1010.
- **Midtown up-peak / down-peak, Garden residential** — `arms.ts`'s `MIDTOWN_UP_PEAK_1PCT` and
  `GARDEN_RESIDENTIAL_2PCT`, and a down-peak variant of the former, seeds 1001–1005 / 5000–5029.

Intervals are normal-approximation 95 % paired intervals at the stated n. They are **not** pinned in
`published.ts` and are therefore design inputs, not published results — units A4, C2a and C2b pin
them. Where a table says "bit-identical" it means `JSON.stringify` equality of the full passenger
record trajectory (`passengerId:carId:boardedAt:alightedAt` per leg), which is the same digest
`sim/seam.test.ts` uses, and not equality of a summary statistic.

Prior art and constraints: `CLAUDE.md` (invariants 1–8), `docs/03-traffic-and-statistics.md`
(§ Part 5), `docs/05-roadmap.md` (§ Standing requirement, § Phase 6, § Phase 7),
`docs/06-parameterization-and-tuning.md` (§ Layer 2 stages 1 and 4),
`docs/07-handoff.md` (§ 3, § 4, § 7), `docs/08-review-findings.md` (#1, #4, #5, #11, #14),
`DECISIONS.md` (§ D11, § D12, § D22, § D23), `RISKS.md` (R9).
