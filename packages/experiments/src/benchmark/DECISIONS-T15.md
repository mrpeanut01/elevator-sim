# T15 — Phase 6a decisions

Decisions taken while landing **Phase 6a — destination *disclosure*** (`feat/phase6a-disclosure`).
Recorded here rather than in the repository's `DECISIONS.md`, which this task does not own. Anything
below marked **HANDBACK** needs an owner outside `packages/experiments/src/benchmark/**` and `data/`.

Every number quoted is measured in this worktree, at seed `20260726`, against the real `data/`
directory. Nothing is transcribed from `docs/09-destination-dispatch-contract.md`; where a figure
agrees with the contract that is a reproduction on a different seed set, and where it disagrees the
disagreement is stated.

---

## T15-1 — The shipped destination profile authors `mobile-credential`, not `destination-entry`

**Context.** `DECISIONS.md` § D30 rules that a destination-entry kiosk **authorizes**. Implementing
that is panel-stage authorization in `Simulation.#openCalls` — a `core` change, and Phase 6b's. Until
it lands, `costRequestFor` (`core/src/dispatch/lifecycle.ts:106-134`) forwards the destination under
`destination-entry` and **drops the credential**, so `estimateCost` is asked whether an unbadged
passenger may reach a zoned floor.

**Measured, at the interfloor-mix operating point, 300 replications:**

| arm on `secure-tower` | replications with no quotable AWT | unserved |
|---|---|---|
| `eta`, `up-down-buttons` | 259 / 300 | 33.5 % |
| `eta`, `destination-entry` | 259 / 300, and **worse**: 51.7 % unserved | 51.7 % |
| `destination-eta`, `mobile-credential` | **0 / 300** | **0.00 %** |

**Chosen.** `data/dispatcher-profiles.json` ships one destination profile and it authors
`dispatch.callType: mobile-credential`. **Why:** a shipped profile that breaks one of the five
shipped buildings is not a dispatcher, it is a defect with a name; and on a building with no
`accessZones` the two call types are bit-identical, so nothing is given up. `destination-entry` is
still measured — as a derived arm in `accessControl.ts`, where its failure *is* the result that
justifies D30 rather than an inconvenience.

---

## T15-2 — The shipped profile does **not** weight `rideTime`, and that is a blocked promotion — **HANDBACK**

**Context.** The natural Phase 6a profile is `{waitTime: 1, rideTime: 1}` with
`callType: mobile-credential`. It cannot ship today.

**The blocker, precisely.** `packages/core/src/dispatch/policies/policies.test.ts`'s
*"has no weight that contributes nothing"* scores every shipped profile over
`contributionScenarios()` and requires every weighted term to reach a positive contribution in at
least one of them. All three scenarios build their call from
`packages/core/src/dispatch/policies/fixtures.test-helper.ts`'s `call(floorId, direction,
registeredAt)`, which sets **no `destinationFloorId`**. `costRequestFor` therefore forwards no
destination, and `rideTime` — the only term in the library with an `activeWhen` — returns 0 for
every car in every scenario **by construction**. Adding the weight makes that assertion fail with
`{ 'destination-eta': ['rideTime'] }`, and the failure is a fixture gap rather than a defect in the
profile.

That it is a fixture gap is provable from the file itself: the very next test,
*"makes a weight its stage settings gate off bite the moment the declared condition is met"*
(around line 459), takes `contributionScenarios()[1]` and spreads
`{ destinationFloorId: '19', destinationFloorIndex: 19 }` onto its call — and then measures
`rideTime` at 0 under `up-down-buttons` and above 0 under `destination-entry`. The apparatus already
exists; the contribution scenarios simply never had a destination on them, because until this branch
no shipped profile weighted the one term that needs one.

**The fix, for whoever owns `packages/core/**`.** Give the three scenarios a destination — either on
`call()` in `fixtures.test-helper.ts` or on the scenarios in `policies.test.ts` — and add a
`rideTime` row to that function's *"Each scenario exists for the terms it is the only one to feed"*
table. Then `data/dispatcher-profiles.json` can carry `weights.rideTime` on `destination-eta` and
this branch's derived `+ride1` arm becomes the shipped profile.

**Chosen until then.** The shipped profile authors the call type and no gated weight; the three
`rideTime` weights (0.3, 1.0, 2.0) are **derived profiles** built by `harness.derivedProfile`, which
is the mechanism this repository already uses for a study variant (`withoutReassignment`,
`parkingVariant`). Every measured result in Phase 6a is produced against them, so nothing is lost
except the promotion. **Why not ship it and leave the suite red:** a `data/` change that reddens a
`core` guard blocks integration for four concurrent branches, and the guard is not wrong — it simply
cannot see this configuration.

---

## T15-3 — Phase 6a's operating points are `DESTINATION_CASES`, not a fourth `BENCHMARK_CASES` row

**Context.** `arms.ts` needed a case for Midtown interfloor-mix. The obvious move is to append it to
`BENCHMARK_CASES`.

**Chosen.** A separate `DESTINATION_CASES`, same `BenchmarkCase` type, censused by the same suite.
**Why**, in the order it binds:

1. `BENCHMARK_CASES` is *Phase 5's* gate — its own docstring calls it "the three cases the acceptance
   criterion is argued on". A fourth row silently changes what a landed, accepted phase was argued
   on.
2. Its baseline is `nearest-car`; Phase 6a's reference arm is `eta`, for the reason docs/09 § 2.3
   gives — `nearest-car` is the only profile that saturates anywhere and it caps the budget.
3. On `secure-interfloor-mix` **both** conventional profiles are unquotable on every replication, so
   a Phase 5-shaped table there would have no cells at all rather than the categorical result that
   is the finding.

The shipped `destination-eta` **is** added to `ARM_PROFILES`, because
`dispatcherBenchmark.test.ts` requires every shipped profile to be the baseline or an arm and a
profile that escaped that gate would escape the whole Phase 5 table. It is bit-identical to `eta` on
all three Phase 5 cases, which is correct — none of them is access-zoned in a way the credential
changes — and its 12 new pins duplicate `eta`'s. **No existing pin moved**, verified by diffing the
regenerated table key by key before pasting it.

---

## T15-4 — OQ-5 settled: neither of `arms.ts`'s ceilings transfers, and one of the new points has none

**Measured** over 1000 replications at Midtown interfloor-mix, every Phase 6a arm plus `nearest-car`:
**no arm loses its AWT, at any index.** `nearest-car` first fails at replication 287 on the *same
building* at up-peak; at the interfloor point the lobby plateau never forms and it survives all 1000.
So `admissibleReplications` is `undefined` and `n` is a choice.

Over 300 replications at Secure Tower interfloor-mix: `nearest-car`, `eta` and the bare-kiosk arm are
invalid **from index 0**; every credentialled arm is clean throughout. `admissibleReplications` is
recorded as `0` — there is no budget at which that case's arm list is uniformly quotable, which is
why H-ACCESS-1 is counts and not an interval.

**Budget, re-derived rather than copied.** `sd(ΔTTD)` at the shipped weight is 2.195 s measured at
n = 150 here (the contract's pilot said 2.1–2.7 s on a different seed set). `n = 150` puts the
95 % half-width at 0.354 s against a 1.562 s effect — 4.4× margin — and is inside `CLAUDE.md`'s
50–200 band with no ceiling forcing it there. ±0.5 s on TTD would need n ≈ 75; ±0.5 s on **WT95**
would need n ≈ 305, which is why WT95's interval is the widest thing in the table and is reported
with its required `n` rather than narrowed by picking a budget after seeing it.

---

## T15-5 — H-ACCESS-2 is **refuted**, and *seven* places assert the refuted mechanism — **HANDBACK**

Measured at n = 150 per building under CRN, in both absolute and baseline-relative form, the
difference-of-differences `Δ_secure − Δ_midtown` excludes zero **on the positive side**: given the
credential, pricing the destination buys *less* on the access-controlled building than on the one
with no access zones. The saving is real and it is entirely in the credential (H-ACCESS-1), which is
a claim about **authorization** and not about **optimization**.

`DECISIONS.md` § D30 anticipated this and named four places needing correction. Grepped rather than
counted, there are **seven**, and none of them is this task's file:

| # | place | what it asserts |
|---|---|---|
| 1 | `docs/01-architecture.md:103-105` | "destination dispatch is *better* under access control, because … authorize and optimize in the same step" |
| 2 | `docs/05-roadmap.md:549-550` | "demonstrating that destination dispatch improves *because* authorization and optimization happen in the same step" |
| 3 | `docs/07-handoff.md:271-273` | "destination dispatch should be *better* under access control, because …" |
| 4 | `packages/core/src/dispatch/lifecycle.ts:100-104` | "which is precisely why destination dispatch does better under access control" |
| 5 | `packages/core/src/model/types.ts:122-124` | "destination dispatch does better under access control precisely because …" |
| 6 | `packages/core/src/model/car/types.ts:470-473` | the same sentence, on `CostRequest` |
| 7 | `packages/core/src/sim/simulation.ts:2020-2022` | "access control is cheaper when authorization and optimization happen in the same step" |

**Not** on the list, and correct as written: `packages/core/src/model/car/estimateCost.ts:123`, which
says only that the destination *lets* a dispatcher authorize and optimize in one step. That is a
description of the code and it is true; what is refuted is the performance claim built on it.

The correction each of the seven needs is the same sentence: *the credential is what makes an
access-controlled building servable at all — conventional dispatch cannot serve it under any budget;
the destination's contribution to **optimization** is smaller there than on an unzoned building,
because once the credential is present the access check has already passed and Secure Tower's three
identical cars per bank leave less for a destination to differentiate.*

Note also that `validation/documentation.test.ts` does **not** currently pin any of these seven
strings, so nothing goes red when they are corrected — and nothing went red while they were wrong,
which is the same defect class as a published number nothing re-derives.

---

## T15-6 — Negative controls are reported with an interval as well as a count

**Context.** docs/09 § 2.2 records the blind operating points as bit-identity counts (Garden 30/30,
Midtown down-peak 29/30). Reproduced here at `rideTime` 0.3, Garden is **exactly** 30/30 identical.
At the shipped-arm weight of 1.0 it is 29/30, and Midtown up-peak differs on 5 of 30 with individual
replications moving by up to 11.6 s in *both* directions.

**Chosen.** Each control reports its differing-replication count **and** a paired-t on TTD with a
verdict. **Why:** a count answers *"does anything change at all?"* and nothing else, and at
Midtown up-peak the honest answer to "how much" is *not resolvable at this budget* rather than
*nothing*. All four controls come back `INDISTINGUISHABLE` at n = 30 while the primary point is
`BETTER` by 4.4× its half-width at the same weight, on the same commit — which is what separates an
expected zero from a wiring zero. The predictions are stated in `NEGATIVE_CONTROLS` **before** the
run and are not edited to match the result; where the contract's 30/30 no longer holds at a higher
weight, that is recorded rather than smoothed.

---

## T15-7 — No new export from `benchmark/index.ts` — **HANDBACK**

`packages/experiments/src/index.test.ts` requires the package barrel to re-export **every** runtime
value from `benchmark/index.ts`, and `packages/experiments/src/index.ts` is not this task's file. So
the three new study entry points are deliberately **not** added to `benchmark/index.ts`; they are
reachable at `benchmark/destinationDisclosure.js`, `benchmark/accessControl.js` and
`benchmark/destinationLiveness.js`, and their non-test caller is `benchmark/regeneratePins.ts`,
exactly as `runTailStudy`'s is.

If the barrel owner wants them on the package surface, the names are:

```
runDestinationDisclosureStudy  runNegativeControls  formatDisclosureStudy  disclosureArm
disclosureProfiles  disclosureCase  rideArmId  replicationsForHalfWidth
DISCLOSURE_BASELINE  DISCLOSURE_PROFILE  DISCLOSURE_METRICS  DISCLOSURE_METRIC_LABELS
RIDE_TIME_WEIGHTS  DEFERRED_ARM  NEGATIVE_CONTROLS  MIDTOWN_DOWN_PEAK_1PCT
runAccessControlStudy  formatAccessControlStudy  accessControlProfiles  differenceOfDifferences
BARE_KIOSK_ARM  CREDENTIAL_ARM  CREDENTIAL_PLUS_DESTINATION_ARM
measureDestinationLiveness  formatDestinationLiveness  livenessCases
DESTINATION_CASES  destinationCase  MIDTOWN_INTERFLOOR_MIX  SECURE_INTERFLOOR_MIX
MIDTOWN_UP_PEAK_1PCT  GARDEN_RESIDENTIAL_2PCT  SECURE_UP_PEAK_2PCT
```

They must be added to `benchmark/index.ts` and `src/index.ts` **in the same commit**, or
`index.test.ts` goes red.

---

## T15-8 — Pre-existing failure this branch did not cause — **HANDBACK**

`packages/experiments/src/validation/documentation.test.ts` *"lists every docs/*.md on disk"* fails
on `integration` before any change on this branch: `docs/09-destination-dispatch-contract.md` landed
without a matching row in `README.md`'s documentation table. `README.md` and `docs/**` are not this
task's files. Verified as pre-existing by running the full suite at `09b486f` before touching
anything: **133 files / 2641 tests, 1 failed — that one.**
