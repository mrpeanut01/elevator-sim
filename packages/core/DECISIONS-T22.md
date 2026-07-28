# DECISIONS-T22

Decisions taken while closing the last open blocking Phase 8 finding — the **P5 deadlock**,
`fuzz-1000384` — on `fix/dispatch-deadlock`. Recorded here rather than in the repository's
`DECISIONS.md`, which this task does not own. Anything marked **HANDBACK** needs an owner outside
this task's files.

---

## The finding, reproduced

`caseFromSeed(1_000_384, generateOptionsFrom(config, DEEP_SPACE))`, at the 2 000-case deep budget:

```
case      fuzz-1000384      simSeed 205687583
topology  sky-lobby         32 floors, 3 banks, 2 access zones
dispatch  destination-panel / mobile-credential
demand    3.8 %pop/5min over 1629 s, drain 1800 s, obstruction 0.06
service   schedule: 472s low/low-1 → independent

[termination] deadlock: the last passenger boarded or alighted anywhere at t=1734.7, and nothing
              has happened for the 1694.3 s before this run's hard deadline of t=3429 (it stopped
              at t=1734.7, status timed-out), while journey "j35" (G to 4, waiting) was servable
              and outstanding since t=152.9
```

Reproduced to the same decimal on this branch before any change was made. **1 694.3 s**, as
reported.

### Shrunk — 33 steps, 139 candidate evaluations, 4.1 s

| | parent | minimal |
|---|---|---|
| floors | 32 | **4** (`G`, `18`, `19`, `27`) |
| banks | 3 | **1** |
| cars | 6 | **2** (`low-1` ultra-high-speed, `low-4` gearless) |
| access zones | 2 | **0** |
| service schedule | 1 entry | **1 entry** — `472s low/low-1 → independent` |
| passengers | 480 | 29 |
| idle stretch | 1 694.3 s | 1 795.7 s |

**The access zones fall away entirely**, despite the `access-zones` tag on the case — so the finding
is not about access zoning. **The service schedule survives**, down to its single entry, and so does
the two-car bank. `dropCar` can remove neither: dropping `low-4` leaves the bank with no serving car
after t = 472 and `everyBankAlwaysServes` discards the candidate; dropping `low-1` takes the schedule
entry with it (`candidateFrom` filters unresolvable entries) and the case stops failing. That pair of
refusals *is* the diagnosis — the defect needs a car to be withdrawn and another car to be available
and idle.

---

## T22-D1 — a promise whose car has left group control is **revoked**, not held

**Context.** `DECISIONS.md` § D29 makes a destination assignment write-once, and § T16-D3 enforces it
at the candidate set: `Simulation.#candidateCars` scores a call whose remaining passengers are
already promised over **only the promised car's snapshot**. `#onServiceChange` releases a withdrawn
car's hall calls and re-offers them through `#reofferCall`, which is correct as far as it goes.

**What actually happens under a panel**, instrumented through the documented `createPolicy` seam on
the shrunk case:

```
t=460.3 REGISTER low#G:up→27                                      (journey j9 arrives)
t=460.3 DISPATCH low#G:up→27  cands=[low-1,low-4] -> assigned [low-1]   ← j9 promised low-1
t=472.0 (service event: low-1 → independent; hall calls released, call re-offered)
t=472.0 DISPATCH low#G:up→27  cands=[low-1]       -> unassigned, low-1:serviceMode
t=477.0 DISPATCH low#G:up→27  cands=[low-1]       -> unassigned, low-1:serviceMode
  … identically, every dispatchRetryS = 5 s, 592 times, to t=3427 …
```

`cands=[low-1]` is the whole defect. The re-offer reaches the group and `#candidateCars` hands it
straight back to the car that just left. `serviceMode` is deliberately **not** in
`STRUCTURAL_INELIGIBILITY` (so a returning car is found by the pending tick), so the call is retried
rather than marked unservable — and retried, and refused, until the drain deadline, while `low-4`
serves every other landing in the building and stands idle in between. Seven journeys, all `G → 27`,
never board; six of the 29 legs are never even *promised*, because a call that is never assigned
never reaches `#tellThePanel`, so everybody who joins that landing after t = 472 is invisible to the
panel too.

**Chosen.** `Simulation.#revokePromisesTo`, called from `#onServiceChange` and nowhere else, gated on
`Car.acceptsHallCalls === false`. It voids every promise the affected landings hold to the withdrawn
car; the pending `#dispatchBank` then re-decides the re-registered call over the whole bank and
`#tellThePanel` names whichever car it chooses. Supporting changes: `Passenger.releasePromise`,
`MetricsRecorder.releaseAssignment`, `ConservationAudit.promisesRevoked`.

**Why this is not a weakening of D29.** D29's argument is stated about a car that is **full**: the
promise stands *because the car will empty and come back*, so waiting for it is a real cost of
committing at the panel, and re-offering the passenger would be the panel changing its mind to get a
better answer — which is how a destination arm would quietly recover the deferral advantage it is
supposed to have surrendered. None of that survives contact with a car on `independent`,
`fire-recall` or `out-of-service`. It does not come back unless a later schedule entry says so, so
the promise is not a cost being paid; it is a promise that cannot be kept, and holding a passenger to
it strands them for the rest of the run. `Car.setMode`'s own docstring already says the intent —
*"leaving them attached to a recalled car would strand every passenger waiting on them"* — and
`#onServiceChange`'s says it too. Only the panel path defeated it.

The rule is a fact about the **car**, not about the score, and no dispatch decision can produce it.
That is what keeps it from becoming a general `reassign()`:

- `Passenger.releasePromise` is called from exactly one place;
- that place is gated on `acceptsHallCalls === false`;
- `promisesRevoked` is counted separately from `brokenPromises`, so the two can never be read as one
  number, and a run that started revoking for another reason would say so in its own books;
- `sim/serviceMode.test.ts` asserts `promisesRevoked === 0` on a panel run of the same building with
  **no** schedule, in which 18 promises are broken by full cars. That control is the guard on D29.

**Rejected — leave the property to absorb it.** Not admissible: the brief forbids it, and it would be
wrong on the merits. `low-4` is in service, serves both `G` and `27`, and demonstrably carries
`G → 27` at t = 92 and `19 → 27` at t = 726. The passenger is servable by an idle car in the same
bank; `isServable` is right and `checkTermination` is right.

**Rejected — treat a promise to a withdrawn car as absent in `#candidateCars` without clearing it.**
The call would be re-decided, but `#tellThePanel` skips `passenger.isAssigned`, so nobody would be
told the new car, and `#promiseAllows` would refuse the boarding — turning a stranded passenger into
a `wrongCarBoardings` assertion failure. The promise has to actually move.

**Rejected — sweep only the calls `setMode` returns.** A call whose promised car was full at its last
re-offer is active and held by nobody, so it is not in the released list, and its waiters would be
stranded exactly as before. The sweep is over every active call of the bank.

### Measured

**The shrunk minimal case**, 29 legs:

| | status | delivered | undelivered | promises made | revoked |
|---|---|---|---|---|---|
| before | `timed-out` | 22 | **7** (all `G → 27`) | 23 | — |
| after | `completed` | **29** | **0** | 30 | 1 |

`j9` arrives at t = 460.3, is promised `low-1`, has that promise revoked at t = 472.0, is re-promised
`low-4`, and boards at t = 502.6.

**The parent `fuzz-1000384`**, 480 journeys:

| | status | last passenger activity | idle before deadline (3429) | revoked |
|---|---|---|---|---|
| before | `timed-out` | t = 1734.7 | **1 694.3 s** | — |
| after | `timed-out` | t = 3423.1 | **5.9 s** | 45 |

Still `timed-out`, and that is the honest answer rather than a residual defect: 3.8 %pop/5 min on this
building with a car withdrawn is past handling capacity, `saturation.verdict` is `diverging-queue`,
and `awtIsValid` is `false`, so no mean is published. All six properties hold — P5 exempts a *busy*
saturated fleet by construction, P6 exempts a run that flags itself.

**The walk-up fixture** (`sim/serviceMode.test.ts` § 4, seed 20260728, 15 %pop/5 min, 78 legs,
`A → independent` at t = 200):

| | status | undelivered | promises made | revoked |
|---|---|---|---|---|
| before | `timed-out` | **25** | 54 | — |
| after | `completed` | **0** | 79 | 1 |

---

## T22-D2 — `legsAssigned` counts promise **events**, and the audit's claim 6 nets the revocations

**Context.** `#reconcile` claim 6 asserted `legsAssigned === legsCreated` on a panel run that
delivered everybody. A re-promise makes a second `recordAssignment` on the same leg, so the raw event
count exceeds `legsCreated` by exactly the number of revocations.

**Chosen.** `legsAssigned` and `MetricsRecorder.assignedCount` stay event counts, and the claim
becomes `legsAssigned - promisesRevoked === legsCreated`. A new claim asserts
`promisesRevoked === recorder.releasedCount`, mirroring the existing
`legsAssigned === recorder.assignedCount`.

**Why not count distinct legs instead.** It would need a second `Set` of leg ids in two places and
would *lose* information: "how many times did the panel have to name a car" is the interesting
quantity, and it is the one that pairs with `brokenPromises`, which is already an event count for the
same reason (§ T16-D3: *"a passenger bumped from three successive trips counts three times, because
three times is what it cost them"*).

**Why the netted form is exactly as strong.** Every revocation either is followed by a fresh promise
or leaves that leg unpromised. A leg that boarded held a promise when it did — `#boardFrom` refuses
otherwise, and `wrongCarBoardings` is asserted zero — so on a run that delivered everybody,
`assigned - revoked` is exactly one per leg. Comparing the raw event count instead would fail every
run with a mid-run service change in it, which is the shape this arithmetic exists to survive.

`MetricsRecorder.releaseAssignment` **clears** `assignedCarId` rather than letting `recordAssignment`
overwrite it in place, so a stored record never claims a promise that is not in force. A reader
reconstructing "who was promised what at t" from a quietly re-pointed field would see a passenger
promised to a car that had been out of service for twenty minutes.

---

## Blast radius — measured, not argued

**5 shipped buildings × 12 shipped profiles = 60 cells, seed 20260726, 1800 s + 600 s drain.**
Full structural fingerprint (`status`, `endedAt`, `events`, the whole `record`, the whole `summary`,
`conservation`, `undelivered`, `warnings`):

- **60 of 60 byte-identical** once the new always-zero `promisesRevoked` field is stripped;
- `promisesRevoked` is **0 in all 60**.

That is not a coincidence to be re-checked later: no shipped building carries a `serviceEvents`
schedule or a non-default `CarConfig.mode` (`DECISIONS.md` § D77 — T19 deliberately changed none),
`#revokePromisesTo` is reachable only from `#onServiceChange`, and `#onServiceChange` is scheduled
only from `ResolvedBuilding.serviceEvents`. Every published pin therefore stands unmoved, and none
was touched.

### And where it *does* generalise — 8 of 2 000 deep cases

The whole deep campaign was re-run per case, before and after, and diffed on
`(status, simulatedSeconds, violations)`. **8 cases of 2 000 change**, and every one of them is
`destination-panel` **with a `serviceEvents` schedule** — which is exactly and only the path the fix
touches. The other 1 992 are identical to the microsecond.

| seed | before | after | |
|---|---|---|---|
| **1000384** | `timed-out`, 1734.7 s, **P5 violation** | `timed-out`, 3423.1 s, clean | the finding |
| 1001011 | `completed`, 2345.0 s | `timed-out`, 2512.1 s | **the one adverse flip** — see below |
| 1001049 | `completed`, 3147.3 s | `completed`, 3019.0 s | finishes 128 s sooner |
| 1000059 | `timed-out`, 3586.9 s | `timed-out`, 3585.5 s | −1.4 s |
| 1001151 | `timed-out`, 3149.8 s | `timed-out`, 3147.9 s | −2.0 s |
| 1001156 | `timed-out`, 3077.1 s | `timed-out`, 3069.9 s | −7.2 s |
| 1001546 | `timed-out`, 3505.1 s | `timed-out`, 3492.6 s | −12.5 s |
| 1001875 | `timed-out`, 3290.3 s | `timed-out`, 3258.3 s | −32.0 s |

All eight pass all six properties after the fix. Seven move in the expected direction — a promised
passenger who is no longer pinned to a withdrawn car boards sooner, and the run drains sooner.

**Seed 1001011 is the exception and is reported rather than buried.** 424 journeys,
`destination-panel`, two schedule entries (`a-4 → independent` at 153 s, back `in-service` at 311 s),
16.7 %pop/5 min:

| | status | endedAt | delivered | undelivered | mean wait | `awtIsValid` | saturation |
|---|---|---|---|---|---|---|---|
| before | `completed` | 2345.0 | 424 | 0 | 472.0 s | **false** | `diverging-queue` |
| after | `timed-out` | 2512.1 | 416 | 8 | 544.5 s | **false** | `diverging-queue` |

`legsBoarded` is **424 in both**: everybody got into a car. All eight undelivered journeys are
`reason: "riding"`, every one of them boarded car `a-a-3` at t = 2512.07 — which *is* `endedAt` — so
they are people aboard a lift when the drain deadline (2545) cut its last trip, not people stranded
on a landing. The single revocation puts one passenger into a car sooner, which reshuffles the
allocation of a bank that is already past handling capacity, and the last trip of the run lands on
the wrong side of the deadline.

It is not a liveness regression, and **no publishable number moves**: the run is `diverging-queue`
with `awtIsValid: false` and `serviceLevel: starved` in *both* states, so neither version may quote a
mean — which is the statistical discipline working exactly as intended. In a saturated system,
changing who boards first changes who waits; it does not change the capacity. Recorded as a real
behaviour change on a fuzz case, on a configuration no shipped building has.

---

## What was **not** done

- `checkTermination` and `PROPERTY_BOUNDS` are unchanged **line for line**.
  `deadlockIdleBoundS` is still 600 s. No property or bound was moved to make this pass.
- The fuzz generator was not narrowed. `DEEP_SPACE`, `STANDARD_SPACE` and `STANDARD_CORPUS` are
  untouched, and the case still generates exactly as it did.
- `data/dispatcher-profiles.json` is untouched — including `predictive-balanced`'s deliberately-wrong
  `idle.repositionThresholdS: 8`.
- No shipped building, no benchmark pin, no golden manifest.

---

## Known limitations

1. **A car recalled with passengers aboard still strands them.** T19 limitation 1, unchanged and out
   of scope: `setMode` clears its car calls, so it has no reason to move and they end
   `undelivered: 'riding'` — named, counted, books balanced. A real Phase I recall discharges at the
   recall level, which is a behaviour rather than a config field.
2. **A promise is revoked at the moment the car leaves group control, not lazily.** A passenger
   promised to a car that is withdrawn *and put back in service at the same simulated instant* is
   revoked and then re-decided over a bank that includes the returning car, so the outcome is right;
   but the revocation is still counted. That is the honest reading — the group did take the promise
   back — and the two events are separate kernel events by CLAUDE.md invariant 4.
3. **`brokenPromises` counts the withdrawal too.** `#reofferCall` runs before `#revokePromisesTo`, so
   a passenger the withdrawn car left behind is counted as a broken promise *and* as a revocation.
   That is deliberate: the car really did leave them, at the same moment and for the same reason a
   full car does, and the two counters answer different questions. A reader wanting "broken by a full
   car alone" subtracts.
4. **The interaction is now covered in `core` but not in `experiments/validation`.**
   `DECISIONS-T20.md` records that `runCorner` and `fuzzSimulationConfigFor` both drive conventional
   dispatch, so `serviceEvents` × `passengerAssignment: 'panel'` was untested there. The fuzz
   generator *does* reach it — that is how this was found, `destination-panel` being one of the
   twelve profiles it draws — and `sim/serviceMode.test.ts` § 4 now covers it directly. The
   `validation/` corner is still conventional-only. **HANDBACK** to whoever owns
   `packages/experiments/src/validation/**`.

---

## Doc corrections handed back

Files this task does not own. Each is now false as written.

1. **`DECISIONS.md` § D77, "Known limitations", item 2** — *"Under destination dispatch, recalling a
   promised car strands its promises. … Fixing it means re-promising, which is a change to D29's
   write-once rule and belongs with Phase 6b."* **Fixed here.** Replace with a pointer to § T22-D1.
2. **`DECISIONS.md` § "What is still unreachable", item 2** — same limitation, classified as *"a
   modelled behaviour with an honest counter, and a blocked improvement … **HANDBACK**"*. It was a
   defect, not a modelled behaviour: P5 reports it as a deadlock and it is now fixed.
3. **`DECISIONS.md` § T16-D3, closing line** — *"Re-assignment is **out of scope and not built**, and
   no knob for it exists (§ D29)."* Still true of re-assignment *for optimisation*; now false without
   qualification. It needs the § T22-D1 exception named.
4. **`DECISIONS.md` § D29** — the write-once rule needs the same one-sentence exception.
5. **`docs/07-handoff.md` § 7 / `docs/05-roadmap.md`** — the open P5 finding is closed; Phase 8's
   blocking list should lose it.
6. **`CLAUDE.md` § "What this project is"** — currently *"Phases 0–3, 5 and 7 are landed and
   accepted … Phases 6 and 8 are not started"*, which contradicts the repository root `CLAUDE.md`
   and the T18/T20/T21 work already merged onto `integration`. Not this task's to fix, but it is
   wrong in both copies in different ways.
