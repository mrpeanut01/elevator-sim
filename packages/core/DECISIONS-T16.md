# T16 — Phase 6b, destination *dispatch*: decisions taken in `packages/core`

Decisions taken while landing **Phase 6b** (`feat/phase6b-dispatch`). Recorded here rather than in
the repository's `DECISIONS.md`, which this task does not own. Anything marked **HANDBACK** needs an
owner outside `packages/core/**`.

Every number below was measured in this worktree at seed `20260726` against the real `data/`
directory, through `runSimulation`. Nothing is transcribed from
`docs/09-destination-dispatch-contract.md`; where a figure agrees with the contract that is a
reproduction, and where it disagrees the disagreement is stated.

---

## T16-D1 — Level 1 is a **declared tunable of its own**, not a consequence of `callType`

**Context.** `dispatch.callType: destination-entry | mobile-credential` moves the destination into
the cost request. Phase 6a shipped that (Level 0, "disclosure") and pinned twelve published figures
against it. Phase 6b is the *passenger-model* change (Level 1, "dispatch"): the passenger is told
which car to walk to and boards only that car. The two are separate systems — docs/09 § 1.1 — and
arms C and D of the contract's study differ in exactly this.

**Alternatives.** (a) Make a destination `callType` imply per-passenger assignment. (b) A new
declared categorical.

**Chosen:** (b) — `dispatch.passengerAssignment: 'none' | 'panel'`, default `none`, gated
`activeWhen: { 'dispatch.callType': ['destination-entry', 'mobile-credential'] }`.

**Why.** (a) would silently change the shipped `destination-eta` profile's behaviour and move every
Phase 6a pin, and worse, it would make arms C and D inexpressible — the contrast the phase exists to
measure would have no configuration. It would also conflate a change that keeps all nineteen
replication metrics comparable with one that breaks nine of them.

**Measured consequence:** with `none` as the default, **0 of 55 cells** (5 buildings × 11 shipped
profiles, seed 20260726) move — compared on status, events, AWT, WT95, TTD, ride, interval, handling
capacity, undelivered, legs, warning count, the full passenger-trajectory digest **and a SHA-256 of
the whole serialized `RunRecord`**. No pin moves.

A profile that authors `panel` under `up-down-buttons` is **refused** at policy construction, in the
same style as the existing `destination-entry` + `deferred` refusal: a panel that cannot ask for a
destination is an up/down button, and `tuning/space/encode.ts` runs the real `createPolicyFor` in
`validateValues`, so a sampler rejects the pair rather than handing a search a throw.

**Not** re-refused: `panel` + `deferred` under `mobile-credential`. The existing throw covers the
kiosk, which is the case docs/09 § 1.4 says must not be relaxed — a kiosk holds a person at a
screen. A `mobile-credential` assignment is delivered to the phone of somebody still walking in from
the street and can honestly wait out a defer window. Refusing that pair would also make
`dispatch.passengerAssignment` **unsweepable** by `sim/searchSpaceLiveness.test.ts`, whose base
profile (`predictive-balanced`) defers — the dimension would report `inadmissible`, which that file
requires be fixed rather than allowlisted.

---

## T16-D2 — The **panel** is what authorizes, so D30 lands with Level 1 and not before

**Context.** `DECISIONS.md` § D30 rules that a destination-entry kiosk authorizes. Phase 6a (§ D56)
measured that a bare kiosk breaks `secure-tower` outright — 51.7 % unserved against conventional's
33.5 % — because `costRequestFor` drops the credential under `destination-entry`, so `estimateCost`
is asked whether an *unbadged* passenger may reach a zoned floor.

**Alternatives.** (a) Forward the credential under `destination-entry` always. (b) A third knob.
(c) Tie panel-stage authorization to `passengerAssignment: 'panel'`.

**Chosen:** (c). `#callValue` sets `DispatchCall.panelAuthorized` only under a panel, and
`costRequestFor` forwards the credential for an authorized request.

**Why.** (a) changes `destination-entry`'s meaning and would move Phase 6a's `accessControl.ts`
bare-kiosk arm — whose *failure* is the published result that justifies D30. (b) invents an
unrequested knob, which is this repository's documented defect class. (c) is the semantically
correct reading: **the kiosk is Level 1's landing panel.** Level 0 does not model a kiosk at all; it
moves information the runner already honestly holds one field earlier. A panel is a physical thing
that a passenger stands at, states a destination to, and is answered by — and *that* is the thing
D30 says performs the access check.

**Measured**, `secure-tower` at the interfloor-mix operating point, seed 20260726:

| arm | status | undelivered |
|---|---|---|
| `eta`, `up-down-buttons` | **timed-out** | 22 |
| `eta`, `destination-entry` (bare kiosk) | **timed-out** | 38 |
| `eta`, `destination-entry` + `panel` | **completed** | **0** |
| `eta`, `mobile-credential` | completed | 0 |
| `eta`, `mobile-credential` + `panel` | completed | 0 |

The bare kiosk breaks the building *harder* than conventional dispatch, reproducing § D56's
direction on a different operating point. The authorizing panel serves it.

**There is deliberately no "rejected at the panel" accounting path.** A passenger the panel would
refuse cannot reach the code: `#openCalls` already throws for anybody no bank serving the floor can
carry, and the trace's route planner never generates one. Building a rejection branch nothing in
this simulator can reach would be a ninth dead seam — which is the defect this phase is most at risk
of shipping, so the branch is absent and the reason is in the code.

---

## T16-D3 — D29's write-once promise is enforced at the **candidate set**, not at `#reofferCall`

**Context.** `DECISIONS.md` § D29: when a car fills and leaves promised passengers behind, their
`assignedCarId` stands. `#reofferCall` puts a still-occupied landing back out to the group and
"must be overridden for assigned passengers".

**Chosen.** The override is `Simulation.#candidateCars`: a decision for a call whose remaining
passengers are already promised is scored over **only the promised car's snapshot**, so stage 4's
argmin cannot return anything else. `#reofferCall` is otherwise unchanged and simply counts.

**Why.** Three separate paths reach a re-offer — stage 6's `bypassing-load` / `direction-mismatch`
refusal, the `nobody-would-board` livelock guard, and `#finishStop`'s overflow case. Patching one
of them leaves the other two re-offering a promised passenger to whichever car scores best, which is
the panel silently changing its mind. Restricting the candidate set applies the rule where *every*
re-offer is eventually decided. If the promised car is full, no car is eligible, the call is retried
on the ordinary timer, and the passengers wait — which **is** the cost, and
`ConservationAudit.brokenPromises` counts how often it is paid.

`brokenPromises` is an **event count, not a headcount**: a passenger bumped from three successive
trips counts three times, because three times is what it cost them.

**Measured**, `midtown-office`, seed 20260726, `eta + rideTime 1.0`, `mobile-credential` + `panel`:

| operating point | legs | assigned | broken promises | wrong-car boardings |
|---|---|---|---|---|
| interfloor-mix 1.5 %, 1800 s | 96 | 96 | 4 | **0** |
| shipped default demand (saturated) | 660 | 660 | 2 584 | **0** |
| shipped default demand, `assignedWalkS: 10` | 660 | 660 | 3 131 | **0** |

Re-assignment is **out of scope and not built**, and no knob for it exists (§ D29).

---

## T16-D4 — A promise binds the **bank**, not only the car

**Context.** A landing served by two banks opens the same origin-destination request twice, once per
bank. Bank 1 wins it and promises car X. Bank 2 still counts the passenger as waiting.

**Chosen.** `#bankMayServe` — once the panel has named a car, only that car's bank still has
business with the passenger.

**Why.** Without it, bank 2 sends one of its own cars, which arrives, may board nobody (the boarding
predicate is per car), surrenders the call as *nobody would move*, and is sent straight back: a
livelock that burns events and would present as "the run was a bit slow". `secure-tower`'s screened
lobby, both of `mixed-use-high-rise`'s shared floors and all eight of `vertical-city`'s are
multi-bank, so this is a shipped configuration and not a hypothetical. All five buildings complete
under a panel at the interfloor-mix point with 0 wrong-car boardings.

---

## T16-D5 — The comparability list is **data on the run**, and the oracle pin is a **test helper**

**Context.** The contract identifies nine of the nineteen replication metrics as changing construct
under Level 1 and asks that this be machine-checkable rather than a doc note.
`REPLICATION_METRICS` lives in `packages/experiments`, which this task does not own, and `core`
cannot depend on it.

**Chosen.** `packages/core/src/metrics/comparability.ts` declares the nine **with a per-metric
reason and a dotted `summaryPath`**, plus the ten that survive. Its non-test callers are inside
`Simulation`: the constructor raises a **disclaimer** naming all nine into `result.warnings` (the
double-deck mechanism, § D11/§ D22), `#finish` attaches `result.comparability`, and the recorder
stamps `RunRecord.passengerModel`. `comparability.test.ts` walks every `summaryPath` into a summary
a real run produced and asserts the two lists partition the nineteen disjointly and exhaustively.

**Why not an exported `assertComparable(...)` guard:** it would have no non-test caller, which is
precisely the `tuning/report` defect — the fifth of the eight dead seams, and the one that shipped
*after* both guards were installed. A declaration every run carries, that a study can read off the
result it is already holding, is reachable by construction.

**The oracle pin is `packages/core/src/analytical/oraclePin.test-helper.ts`**, called from
`analytical/validation.test.ts` and `sim/oracle.test.ts` — which is what the contract's ownership
map (row 13) specifies, "called from themselves". It refuses **both** halves of destination dispatch
and carries the reasoning in its own docstring: `S = N(1 − (1 − 1/N)^P)` assumes independent uniform
destinations, destination dispatch exists to violate that, so a destination arm *should* disagree
with the closed form. This is the one place where `CLAUDE.md`'s *"assume the simulation is wrong
until proven otherwise"* gives the wrong answer, and the sentence is in the code where somebody
under pressure will read it. A `.test-helper.ts` rather than a runtime export, for the same
no-dead-seam reason as above.

---

## T16-D6 — `sim.assignedWalkS` is charged between `arrivedAt` and `boardedAt`, and is not
profile-authorable

Declared in `SIM_PARAMETERS` with `activeWhen: { 'dispatch.passengerAssignment': ['panel'] }`,
range `[0, 30]`, **default 0**. Implemented as a boarding predicate — a promised passenger may not
board before `assignedAt + assignedWalkS` — so `arrivedAt` never moves.

`arrivedAt` is the window-membership key: dispatcher-independent by contract, so the same passenger
falls in the same report window under every configuration compared. Charging the walk by moving it
later would change *which* passengers each arm reports on, and a paired-t over differently-populated
windows is not a paired-t — a failure that invalidates every interval in the phase and makes no test
go red.

**Measured**: on the single-leg buildings (`midtown-office`, `garden-apartments`) the `arrivedAt`
column is byte-identical between a Level-0 run and Level-1 runs at `assignedWalkS` ∈ {0, 5, 10, 30}.
On `secure-tower` it is **not**, and that is the pre-existing transfer asymmetry docs/09 § 2.4
records rather than this change: a second leg's arrival is the first leg's alighting time plus the
transfer walk, which is dispatcher-dependent today. Journey-level pairing (TTD) survives it;
leg-level pairing (AWT) does not — a second, independent reason TTD is the comparison metric.

It is **not** in `DISPATCH_PARAMETERS`: a dispatcher that could tune its own walk distance could
tune away its own cost, and the Pareto front would be a lie.
`searchSpaceLiveness.test.ts`'s authorability rule keeps it out of the dispatcher space by
construction, exactly as it does `sim.doorObstructionProbability`.

---

## T16-D7 — No new profile ships in `data/dispatcher-profiles.json` — **HANDBACK**

**Context.** The task grants `data/dispatcher-profiles.json` "to ship a destination-dispatch
profile". `packages/experiments/src/benchmark/dispatcherBenchmark.test.ts:301` asserts
`[BASELINE_PROFILE, ...ARM_PROFILES].sort()` equals the shipped profile set, and
`benchmark/arms.ts` is not this task's file.

**Chosen.** Ship no profile. Every measurement here is taken against profiles built in the test from
`eta` plus the two stage settings — the mechanism `harness.derivedProfile` already establishes
(§ D57's precedent).

**Why.** Shipping the profile reddens one assertion in a file this task may not edit, and acceptance
criterion 2 is a green suite. The alternative — shipping it and handing back the companion edit —
trades a real, verifiable green tree for a red one, and the liveness evidence is identical either
way because it comes from `runSimulation` over the real buildings.

**HANDBACK — the profile, ready to paste**, together with the two edits that must land in the same
commit:

```json
{
  "id": "destination-dispatch",
  "name": "Destination dispatch",
  "$comment": "Level 1. The landing panel names a car per passenger and boarding honours it. mobile-credential rather than destination-entry only because the shipped destination profile already is (D56); either works now that the panel authorizes (T16-D2).",
  "weights": { "waitTime": 1.0, "rideTime": 1.0 },
  "dispatch": { "callType": "mobile-credential", "passengerAssignment": "panel" }
}
```

1. add `'destination-dispatch'` to `ARM_PROFILES` in `packages/experiments/src/benchmark/arms.ts`;
2. regenerate the twelve `PINNED_ESTIMATES` rows it adds via `regeneratePins.ts` — they are *new*
   keys, so no existing pin moves; verify that by diffing key by key before pasting, as § D58 did.

---

## T16-D8 — C26 is fixed; Phase 6a's skipped regression test can be un-skipped — **HANDBACK**

`dispatch/policies/fixtures.test-helper.ts`'s `call()` takes an optional `destinationFloorId`, and
all three `contributionScenarios()` in `policies.test.ts` now carry one (different per scenario,
above the call floor). `rideTime` therefore prices something in the contribution sweep instead of
returning 0 by construction, and the *"has no weight that contributes nothing"* assertion no longer
fails a profile that legitimately weights it.

Proven both ways by a new test in the same file: a `{ waitTime: 1, rideTime: 1 }` profile under
`mobile-credential` prices exactly `['rideTime', 'waitTime']` across the three scenarios, and the
same profile under `up-down-buttons` prices `rideTime` at 0 — so the fixture is not smuggling a
destination into a conventional scenario.

**HANDBACK:** `packages/experiments/src/benchmark/destinationProfile.test.ts` carries a skipped,
documented regression test naming this one-line fix. It can be un-skipped. That file is not this
task's.

---

## T16-D9 — Four `core` docstrings asserting the refuted H-ACCESS-2 mechanism are corrected

`DECISIONS.md` § D60 lists seven places asserting that destination dispatch does better under access
control *because* authorization and optimization happen in the same step, and records that the
difference-of-differences at n = 150 per building **refutes** it. Four of the seven are in
`packages/core`, and all four are corrected here:

| place | what it now says |
|---|---|
| `dispatch/lifecycle.ts` (`costRequestFor`) | the one-step mechanism is a true statement about the function; the performance claim built on it is measured false |
| `model/types.ts` (`HallCall`) | the asymmetry is real; "better under access control because of it" is refuted |
| `model/car/types.ts` (`CostRequest`) | same |
| `sim/simulation.ts` (`#callValue`) | same |

The remaining three are `docs/01-architecture.md:103-105`, `docs/05-roadmap.md:549-550` and
`docs/07-handoff.md:271-273`, which are **HANDBACK** — `docs/**` is not this task's.
`validation/documentation.test.ts` pins none of the seven strings, so nothing goes red either when
they were wrong or when they are fixed, which is itself the defect class § D60 names.

---

## T16-D10 — One pinned count outside `packages/core` was updated, deliberately and visibly

`packages/experiments/src/tuning/space/collect.test.ts` pins the size of the declared parameter
space: `expect(rows).toBe(96)` and `expect(SPACE.parameters.length).toBe(48)`. Declaring two new
tunables moves both — to **98** and **49** — and the file is outside this task's ownership.

**Chosen.** Update the two numbers, with a comment naming the two rows and why only one of them is
searchable. **Why:** the assertion's stated purpose is *"pinned so a schema that stops being found …
fails rather than silently shrinking the space"* — it is a change detector, and a phase that adds a
declared tunable is expected to move it, exactly as the roadmap says extending `AUDITED_MODULES` is
a one-line change any phase adding a `dispatch/` module should make. Nothing is weakened: the new
numbers are the correct ones, and the asymmetry (2 declared, 1 searchable) is itself evidence that
`sim.assignedWalkS` is correctly **not** profile-authorable, which is the discrimination the
biconditional above it exists to prove. Leaving it red would block integration for four concurrent
branches over two integers.

It is **not** in either concurrent builder's area (`packages/viz/src/**`,
`packages/experiments/src/{validation,perf}/**`).

---

## What was measured, and where it is asserted

| claim | assertion |
|---|---|
| every leg is promised a car, and the promise reaches the record | `sim/destinationDispatch.test.ts`; `#reconcile` claims 5 and 6 |
| **zero** wrong-car boardings, 5 buildings | `sim/destinationDispatch.test.ts`; `#reconcile` claim 4 fails the run |
| the promise **bites**: 70 of 96 legs board a different car than under conventional dispatch | `sim/destinationDispatch.test.ts` (> 20 % required) |
| the call count rises: 25 → 70 on Midtown, 18 → 42 on Secure Tower (interfloor-mix) | `sim/destinationDispatch.test.ts`, counted through `createPolicy` |
| broken promises non-zero on a configuration that fills cars | `sim/destinationDispatch.test.ts` |
| `arrivedAt` byte-identical at walk ∈ {0, 5, 10, 30}, single-leg buildings | `sim/destinationDispatch.test.ts` |
| the four trace streams end where a conventional run leaves them; traces byte-identical | `sim/destinationDispatch.test.ts` |
| `passengerAssignment: 'none'` is trajectory-identical to the run before the knob existed | `sim/destinationDispatch.test.ts`, 5 buildings; and 0 of 55 shipped cells moved |
| the oracle refuses a destination arm with a named reason | `analytical/oraclePin.test-helper.ts`, called from both oracle suites |
| the nine non-comparable metrics partition the nineteen and resolve against a real summary | `metrics/comparability.test.ts` |
| C26: `rideTime` prices something in the contribution sweep | `dispatch/policies/policies.test.ts` |
