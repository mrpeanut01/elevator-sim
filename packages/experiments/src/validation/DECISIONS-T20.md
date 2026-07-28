# T20 — service-mode coverage

Decisions and measurements taken while collecting the coverage that `CarConfig.mode` and
`BuildingConfig.serviceEvents` (T19) unblocked. Recorded here rather than in the repository-level
`DECISIONS.md`, which this task does not own; anything marked **HANDBACK** needs an owner outside
`packages/experiments/src/{validation,fuzz}/**`.

Every number below is measured in this worktree, against the real `data/` directory.

---

## D78 — `validation/serviceMode.ts` keeps its `Proxy`, promoted from "the reachable half" to **the dispatcher-view control arm**

The module was written when nothing could set a car's mode from a configuration. Its "what is
missing" table and its three "does not reproduce" bullets described a gap that T19 closed, and both
are now gone. The `Proxy` is not.

It is kept because **the difference between the two arms is a property of the simulator**, not an
artefact of the instrument:

| | arm A — `seenAsMode` (Proxy) | arm B — authored `mode` / `serviceEvents` |
|---|---|---|
| what changes | the `mode` on every `CarSnapshot` the group is shown | the car's own `#mode` |
| `infeasibilityOf` answers `serviceMode` | yes | yes |
| hall calls **allocated** | 0 | 0 |
| committed hall calls released and re-offered | no — `Car.setMode` is never called | yes |
| **legs boarded** | **338 of 365** | **0 of 365** |

Measured on one synthetic building at one seed, both arms in one test
(`adversarial.test.ts`, "differ in exactly one place"). The cause is `sim/simulation.ts`
`#loadWhileIdle`, which opens a car already standing at an occupied landing **without consulting
the dispatcher**, deliberately — so a *dispatcher-blinded* fleet keeps collecting people while a
*physically recalled* one cannot, and `#carCanCarry` is what stops the second.

So `legsBoarded === 0` is the **wrong** assertion in arm A and the **right** one in arm B, from the
same reason code and the same zero allocation count. Deleting the `Proxy` would have lost the
ability to say that, and a change that made `#loadWhileIdle` consult the dispatcher would silently
collapse the two arms into one. Pinned, so it fails loudly instead.

---

## D79 — **FINDING.** P5 termination was blind to a fleet that never moves at all

**The most extreme corner in the adversarial suite passed all six properties.** An authored
all-out-of-service fleet delivered **0 of 365** journeys, boarded nobody, allocated nothing, and
`checkAll` returned an empty violation list.

The cause is one line. `checkTermination` measured the idle stretch once for the run:

```ts
let lastActivityAt = result.record.startedAt;   // ← the fallback
// … max over every boardedAt / alightedAt …
const idleSeconds = result.deadlineS - lastActivityAt;
if (idleSeconds <= bounds.deadlockIdleBoundS) return violations;
for (const journey of result.undelivered) {
  const waitingSince = …;
  if (waitingSince > lastActivityAt) continue;   // ← skips everybody
```

When the fleet does no work at all, `lastActivityAt` never leaves `record.startedAt`. Every
passenger arrives after the run starts, so `waitingSince > lastActivityAt` holds for *all* of them
and every candidate is skipped as "not yet waiting when the stall began". The deadest possible
building reported nothing.

**Fixed, by strengthening — never by relaxing.** The stretch is now measured per passenger, over
the overlap between the fleet's inactivity and that passenger's own wait:

```ts
const stallBeganAt = Math.max(lastActivityAt, waitingSince);
const idleSeconds = result.deadlineS - stallBeganAt;
if (idleSeconds <= bounds.deadlockIdleBoundS) continue;
```

This is **strictly stronger**: whenever `waitingSince <= lastActivityAt` the maximum *is*
`lastActivityAt` and the expression reduces to the original exactly, so nothing that fired before
stops firing. `PROPERTY_BOUNDS.deadlockIdleBoundS` is untouched at 600 s — the bound was never the
problem and moving it would have been the failure mode this whole track exists to prevent.

**Reproduce (no seed needed — it is a config, which is the point):** a two-car bank with both cars
authored `mode: "out-of-service"`; `adversarial.test.ts` → "boards nobody at all when every car is
authored out of service". Before the fix: `violations = []`. After: `violations = ['termination']`,
and that is now the assertion.

**Blast radius, measured:** zero new failures. 64/64 always-on cases and 2 000/2 000 deep cases
still hold all six; `faults.test.ts`'s P5 demonstration still fires; every adversarial corner is
unchanged except that the shrinker now reduces its counterexample further (815 → **49** units,
against 315 before), because a stronger property survives more reductions.

**How this went unnoticed:** the corner was unauthorable until T19, so no campaign could produce a
run in which the fleet did *literally nothing*. The property was demonstrated to fail
(`faults.test.ts` P5) against a controller that stalls **after t=60** — which leaves
`lastActivityAt` at a real boarding and therefore never exercises the fallback. A property
demonstrated to fail on one shape is not a property demonstrated to fail on every shape.

---

## D80 — the fuzz generator never withdraws every serving car from a bank, and that is a construction rule rather than a filter

`generate.ts` emits both new shapes. It also enforces, by construction, that **every bank holds at
least one `in-service` car at every instant of the run** — an initial degradation is drawn only for
a bank of two or more, and a scheduled withdrawal only when the bank would still have one left.

The reason is not squeamishness. `properties.ts` `isServable` reasons about topology and access
credentials; it does not know about service mode. A bank with no serving car therefore produces
passengers the property believes are servable and nobody can collect, and P5 fires — **correctly**.
That verdict would be a *generator* artefact rather than a simulator finding, exactly like the
`unroutable` skip reason it sits next to, and a campaign that reported it would drown its real
findings.

The corner is not lost. It is covered where the expected outcome can be asserted rather than
avoided: `adversarial.test.ts` (`status === 'timed-out'`, `violations === ['termination']`,
`legsBoarded === 0`, books balanced) and `core/src/sim/serviceMode.test.ts`.

The rule is re-checked in the **shrinker** as well (`shrink.ts` `everyBankAlwaysServes`), because a
reducer can break it where the generator cannot: dropping the other car of a two-car bank leaves
the degraded one alone. Under shrinking that failure would be indistinguishable from the one being
reduced — same property, different cause — so such a candidate is discarded.

---

## D81 — the service axis draws from its own `fuzz.service` stream, so no pinned building moved

A new named stream (CLAUDE.md invariant 2) rather than more draws on `fuzz.run`. The consequence is
that every building the corpus generated before this axis existed is **bit-identical apart from the
keys the axis adds** — same floors, same banks, same pitch, same access zones, same arrival rate,
same horizon — so `generate.test.ts`'s pinned coverage assertions did not have to move to
accommodate a widening that has nothing to do with them.

The three run scalars (`arrivalRatePctPop5min`, `durationS`, `doorObstructionProbability`) were
hoisted out of the returned object literal, because the schedule needs the horizon in hand. They
are drawn in **exactly the previous order**, which is why nothing moved.

---

## D82 — the shrinker carries `serviceEvents`, and reduces them on purpose

`draftOf` used to drop the schedule silently. A shrinker that did that would report a "minimal"
counterexample no longer containing the mid-run mode change the original was about, and the
reduction step that did it would look exactly like a legitimate one — the candidate still fails,
for a different reason.

So the schedule is carried; `dropServiceEvent` and `restoreCarMode` remove one entry / one
degraded mode at a time, so "the recall was not needed" is a *measured* reduction; entries naming a
car a reduction removed are dropped with it, the way `dropFloor` drops every reference to a floor;
and `sizeOf` weights both, or the size guard would reject every candidate the two new reducers
produce and neither would ever fire.

---

## D83 — **FINDING, HANDBACK.** The deep campaign is red on `fuzz-1001074`, and it is not a service-mode bug

> **RESOLVED in T21 — this section is kept as the record of the finding, not as an open item.**
> The handback was accepted. `RunSummary.awtIsValid` gained a **fourth** ground —
> `core/src/metrics/summarize.ts` § `diagnoseServiceLevel`, evidence in
> `packages/core/DECISIONS-T21.md` — because the trend gate and the censoring gate are both proxies
> for *"did the backlog clear?"* and neither sees a backlog that cleared *late*. The deep tier is
> green: 0 failures in 250 and in 2 000 cases. Nothing in this package moved:
> `PROPERTY_BOUNDS.starvationBoundS` is still 900 s, `checkStarvation` is unchanged line for line,
> and the generator was not narrowed. The skipped placeholder in `fuzz/deep.test.ts` is now two
> passing regression tests.


One counterexample in 2 000 deep cases. P6 starvation:

```
case      fuzz-1001074      simSeed 2110294577
topology  single-bank       tags: basement, mixed-use, initial-service-mode
dispatch  auction-multi-round / mobile-credential
demand    6.1 %pop/5min over 1433 s, drain 1800 s
service   initial: main/main-2 = independent      schedule: none
status    completed, 177 passengers
  [starvation] leg "p106" (13 to G) waited 922.7 s, past the 900 s bound,
               in a run reporting saturation verdict "stable" with a valid AWT
  [starvation] leg "p107" (13 to G) waited 922.7 s, …
```

Reproduce with `caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`.

**The service mode is only how the campaign reached it.** `main-2` is `independent`, so a
fourteen-floor building is served by one car for hall calls — and the **shrinker removed the
mode**, reducing in five steps to an eleven-floor, genuinely single-car, all-in-service building
that reproduces both violations exactly. The old corpus simply never drew a building of that shape
at that rate.

What disagrees is two definitions, both defensible. `metrics/summarize.ts` calls the run `stable`
because its queue does not *diverge* — it spikes under a transient overload one car cannot absorb,
then clears, and the run `completed` with nobody undelivered. `properties.ts` `checkStarvation`
calls it starvation because the run publishes an AWT while two people waited 15.4 minutes, which
is precisely the "statistics improve as the bug gets worse" failure `CLAUDE.md` is written
against. "The queue is not diverging" and "nobody was abandoned" are being treated as one claim
and are two.

The resolution belongs in `core/src/metrics/summarize.ts`, which this package does not own.
**HANDBACK.** A skipped, documented regression test naming it sits in `fuzz/deep.test.ts`.

`PROPERTY_BOUNDS.starvationBoundS` was **not** moved and the generator was **not** narrowed. 900 s
is two orders of magnitude past the 10–30 s AWT the shipped buildings run at; relaxing it to make
the case pass is the exact failure mode this track exists to prevent. The deep tier is therefore
red on this finding, on purpose, and `npx vitest run` is unaffected — the deep campaign is opt-in.

---

## D84 — `perfScaling.test.ts` splits by **what the number is made of**, not by grid size

Raised mid-task: the file flaked again on the integration branch —
`expected 0.8870047674272091 to be greater than 0.9` under concurrent load, 5/5 in isolation. Its
demand `R²` gate had already been loosened 0.9 → 0.75 and its exponent floor 0.6 → 0.5 for the same
reason. A threshold loosened three times asserts nothing.

**Not loosened a third time.** The always-on tier now asserts only quantities that are *simulation
outputs* — legs carried and kernel **events** — which are identical on every machine at every load,
because they are functions of the seed. Every wall-clock gate moved to `ELEVATOR_SIM_DEEP=1`,
where it reads the grid the always-on sweep already ran (so enabling it costs nothing but the
assertions). Timings are still printed in both tiers.

The scaling claim itself stays **asserted, not merely printed**, and the dominance finding survives
the change because the two rankings agree:

| axis | events exponent (asserted always-on) | seconds exponent (asserted deep only) |
|---|---|---|
| demand | **0.63** (R² 0.999), 8× axis → 3.65× events | 0.85, 6.09× cost |
| cars | 0.36 (R² 0.994), 4× axis → 1.66× events | 0.45, 1.86× cost |
| floors | 0.03 (R² 0.213), 4× axis → 1.04× events | 0.33, 1.59× cost |

Two new always-on assertions come free and are worth having on their own: `legRatio ∈ (0.9, 1.1)`
on the floor and car sweeps, which is the module's own "population held constant" confound stated
as a check rather than as prose.

**What the split costs, stated rather than glossed.** Event count catches a regression that creates
more *work* — an extra dispatch pass, a re-offer storm, a duplicated stop. It does **not** catch one
that makes each unit of work more expensive: a per-floor scan inside the per-event path, or a car
loop nested inside a car loop, leaves every count identical and moves only the milliseconds. That
guard is real and it now runs on request. The trade is deliberate — a guard that runs on request
and means something beats one that runs always and gets ignored.

Delta: 5 always-on tests (was 5), plus 4 tests that are skipped unless `ELEVATOR_SIM_DEEP=1`.
Verified green in both tiers: 5 passed / 4 skipped by default, 9 passed under `ELEVATOR_SIM_DEEP=1`.

---

## Campaign statistics

Measured on this code. The machine was running another builder's suite concurrently for part of
the time, so the wall-clock figures are pessimistic; every other number is deterministic.

| | always-on (`corpus.test.ts`) | deep (`ELEVATOR_SIM_FUZZ=deep`, 2 000 cases) |
|---|---|---|
| generated buildings | 64 | 2 000 |
| passengers generated | 7 889 | 1 396 887 |
| simulated time | 14.84 h (53 431 s) | 1 242.86 h (4 474 284 s) |
| wall clock | ≈1.1 s (whole `fuzz/` directory ≈2.4 s) | 358 s |
| run outcomes | 55 completed, 9 timed-out | 1 143 completed, 857 timed-out |
| topologies | single 24, parallel 17, sky-lobby 14, shuttle 9 | single 520, sky-lobby 505, shuttle 492, parallel 483 |
| unroutable / invalid generated | 0 | 0 |
| **property violations** | **0** | **1** (D83) |

Against the pre-task figures recorded in `DECISIONS.md`: always-on simulated time 14.17 → 14.84 h
and timed-out runs 5 → 9; deep simulated time 1 217.27 → 1 242.86 h and timed-out runs 795 → 857.
That is the axis biting — a bank one car short finishes less of its work inside the horizon.
Passenger counts are unchanged, because the trace is a function of the seed and the building
*shape*, and the service axis changes neither.

Passenger counts are unchanged from before this task (7 889), because the passenger trace is a
function of the seed and the building *shape*, and the service axis changes neither. Simulated time
rose from 14.17 h to 14.84 h and timed-out runs from 5 to 9: a bank one car short finishes less of
its work inside the horizon, which is the axis biting.

### Service-mode coverage of the pinned corpus

Asserted against exact seed lists in `generate.test.ts`, not sampled:

| shape | pinned seeds |
|---|---|
| a car starts the run out of group control | 101, 102, 107, 111, 116, 121, 128, 137, 181 (**9**) |
| a mid-run `serviceEvents` schedule | 101, 107, 108, 113, 129, 131, 141, 142, 144, 156, 193 (**11**) |
| …of which the car comes back | 101, 107, 113, 141, 144, 156, 193 (**7**) |
| …of which it does not | 108, 129, 131, 142 (**4**) |

All four `SERVICE_MODES` are reached, and both the `bankId`-qualified and unqualified event forms
(6 unqualified, 12 qualified), so both of `resolveBuilding`'s lookup paths are exercised.

---

## What is still unreachable, and which kind of gap each one is

Checked, not inherited. The three limitations T19 recorded:

1. **A car recalled with passengers aboard strands them** — `setMode` clears its car calls, so it
   has no reason to move and they end `undelivered: 'riding'`; the audit balances. A real Phase I
   recall discharges at the recall level.
   → **A modelled behaviour, not a coverage gap.** The simulator does something definite and says
   so; what is missing is a *different behaviour* (discharge-at-recall-level), which is a `core`
   change and not a config field. Reproduced incidentally by generated cases that withdraw a busy
   car, and it is why P1 conservation is checked on every one of them.
2. **Under destination dispatch, recalling a promised car strands its promises**, counted in
   `brokenPromises`, because `Passenger.assign` is write-once (**D29**).
   → **A modelled behaviour with an honest counter, and a blocked improvement.** Fixing it means
   re-promising, which changes D29's write-once rule and belongs with Phase 6b. **HANDBACK.**
   Not covered here: `runCorner` and `fuzzSimulationConfigFor` both drive conventional dispatch, so
   the interaction of `serviceEvents` with `passengerAssignment: 'destination'` is **untested in
   this package**. That *is* a coverage gap, and it is the clearest next step on this axis.
3. **`independent` is modelled only as "outside group control"** — no attendant drives it, so it
   answers the car calls of whoever is aboard and then stands.
   → **A modelled behaviour.** `acceptsCarCalls` already said exactly this and nothing new was
   invented. It is generated (it is one of the three degraded modes the fuzzer draws), so the
   branch that distinguishes it from `out-of-service` is visited rather than assumed.

Added by this task:

4. **A bank with no serving car is generated by neither corpus** — see D80. Covered by two named
   tests instead, which is the right place for a corner whose expected outcome is a violation.
5. **Multi-replication statistics over service-mode cases.** One replication per case, as
   everywhere in `fuzz/`. Nothing here says a mean under a degraded fleet is right, only that the
   mechanics under it are sound.
6. **A wall-clock regression that does not change the work done** — see D84. Reachable only under
   `ELEVATOR_SIM_DEEP=1` now, by choice.

---

## Records elsewhere that are now false — **HANDBACK**

`DECISIONS.md` § "What remains unfuzzed, and why" is not this task's file. Two of its rows no longer
describe the code:

| row | recorded | now |
|---|---|---|
| **Out-of-service cars** | *"Not authorable: `carConfigSchema` has no service-mode field … Generating one needs a `core` change."* | The `core` change landed (T19). Generated, from the `fuzz.service` stream, in 9 of the 64 pinned cases; all four modes reached. |
| **Mid-run mode changes** | *"No mechanism exists to change a dispatcher, a zone or a car's availability during a run."* | A car's availability does have a mechanism: `BuildingConfig.serviceEvents`, fired by the kernel at a simulated time. Generated in 11 of the 64 pinned cases. **A dispatcher and a zone still have none**, so the row should be narrowed rather than deleted. |

A third row is worth adding, and is stated in `campaign.ts` in the meantime: **a bank with no
serving car** is deliberately outside both corpora (D80).
