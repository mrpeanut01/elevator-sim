# T19 — service mode, made reachable

Decisions taken while adding `CarConfig.mode` and `BuildingConfig.serviceEvents`. Recorded here
rather than in the repository-level `DECISIONS.md`, which this task does not own.

## D-T19-1 — the mid-run schedule is **authored data on the building**, not a `SimulationConfig` hook

Two forms were on the table:

| | authored `serviceEvents` on the building | `SimulationConfig.serviceSchedule`, beside `createPolicy` |
|---|---|---|
| survives `JSON.stringify` | yes | **no** — it is a function |
| in the persisted run envelope | yes, via `buildingId` | no |
| a stored run replays it | **yes** | **no** |
| widens the persisted config | no new envelope key | no new envelope key |
| validated, located, refusable | yes (`ConfigError` with a path) | no |
| CLAUDE.md invariant 7 | data | code |

The deciding fact is the replay. `experiments/src/reports/persistence.ts` records `buildingId`, not
the building, and a replay re-reads `data/buildings/<id>.json` and resolves it again. A schedule
authored *on the building* therefore replays with no change to the envelope schema at all — which
is why **no golden `envelopeKeys` list moves**, and why Phase 4's "any run replays exactly"
criterion and Phase 8's golden persistence contract both keep holding.

A hook could not be persisted. `createStoredRun` would drop it silently, the replay would run a
different experiment from the one that was stored, and nothing would say so. That is the failure
this repository's whole persistence contract exists to prevent, so the hook form was rejected even
though it is the smaller change.

Cost of the data form, accepted: the schedule is a property of the *building* rather than of the
*scenario*, which is a slight abuse of the noun. It is the same abuse `accessZones` already makes,
and the alternative is unreplayable.

## D-T19-2 — `mode`'s schema home is `config/schema.ts`, not `CAR_PARAMETERS`

Invariant 8 wants every tunable self-describing. `mode` is, and it is declared where every other
`carConfigSchema` enum is: as `z.enum(SERVICE_MODES)` in `config/schema.ts`, exactly as `doorType`
is.

A `car.mode` row was tried in `CAR_PARAMETERS` first and was wrong, on the module's own stated
rule: *"Rated speed, acceleration, jerk and the door timings are not here: they are already
declared by `config/schema.ts` and `DOOR_PARAMETERS`, and a second declaration would be a second
source of truth."* `car.test.ts` already guards that rule by name for four ids; `car.mode` and
`car.doorType` are now on that list, because a categorical is the easiest way to break it — neither
has a `range`, so a row for one also slips past the "fully specified" check beside it.

Two guards caught the mistake and both were right to:

- `core/src/model/car/car.test.ts` — every `CAR_PARAMETERS` row must carry a finite `range`. A
  categorical does not.
- `experiments/src/tuning/space/collect.test.ts` — `expect(rows).toBe(98)`, a deliberate pin on the
  number of declared parameter rows across `core`, so that a schema which stops being discovered
  fails loudly. The row took it to 99.

Neither was touched. The row was removed instead, and the count pin is back at 98.

`CAR_PARAMETERS` would also have been the wrong place on the merits: it is the optimizer's
discovery surface, and a search that took the fleet out of service to improve a dispatcher
objective would be tuning the ruler.

## D-T19-2b — `SERVICE_MODES` moved from `model/types.ts` to `config/types.ts`

`config/schema.ts` needs the four names at run time to build its `z.enum`. Importing them from
`model/types.ts` widened `parse.ts`'s static import graph to include `model/` and `kernel/`, which
`config/parse.test.ts` pins exactly — the pin encodes "`config/` depends on nothing outside
`config/`", and that is worth keeping.

The repository already has one direction for this: every closed set that appears in authored JSON —
`DOOR_TYPES`, `CALL_TYPES`, `PARKING_STRATEGIES`, `AGGREGATIONS`, `BUILDING_TYPES` — is declared in
`config/types.ts`, and `dispatch/` and `model/` import them from there. `SERVICE_MODES` became an
authored vocabulary the moment `CarConfig.mode` existed, so it moved to join them.
`model/types.ts` re-exports it, so no import path anywhere else changed, and
`acceptsHallCalls`/`acceptsCarCalls` — the predicates that give the modes their meaning — stay
where they were.

## D-T19-3 — `ResolvedBuilding.serviceEvents` is optional, and its absence is announced

Required would have been tidier. It would also have broken every hand-assembled `ResolvedBuilding`
in the repository at compile time — the fuzz generator, `experiments/validation/syntheticBuilding.ts`,
several fixtures — in packages this task does not own.

Optional buys one silent failure mode: a hand-built resolved building whose `config` declares a
schedule that was never located. So it is not silent. `Simulation`'s constructor compares
`resolved.config.serviceEvents` against `resolved.serviceEvents` and pushes a **disclaimer** (not an
advisory) when the first is non-empty and the second is not — "the model is not the configuration",
which is precisely what `#disclaimers` is for.

## D-T19-4 — authored order is preserved; the kernel is the only ordering authority

`resolveBuilding` does not sort the schedule. The kernel's total order is `(time, sequence)` and the
runner schedules entries in array order, so two entries at the same `atS` fire in authored order
(invariant 4). Sorting in the resolver would be a second authority stating the same rule, and two
authorities is how one of them drifts.

This is visible and asserted: two recalls authored at the same instant are two events, and the first
one's re-offer can legally land on the second car in the instant before that car's own event fires.

## D-T19-5 — `#carCanCarry` now checks service mode, and `#park` skips a car the group does not control

**This is the defect the feature exposed, and it is not cosmetic.** Every landing boarding in
`sim/simulation.ts` runs through `#boardFrom` → `Car.board` → `Car.registerCarCall`, which
**throws** a `ModelError` for a mode that does not honour car calls — and `run()` propagates a
`ModelError` unchanged. `#loadWhileIdle` boards a landing queue from a car already standing there
*without consulting the dispatcher*, deliberately. So the first out-of-service car parked at an
occupied landing crashed the run, and "all cars out of service" was not merely untested but
unrunnable.

It was unreachable before this change: the only previous way to produce a not-in-service car was
`experiments/validation/serviceMode.ts`'s `Proxy` over the dispatcher's *view*, which leaves the
physical car in service. That is why the adversarial campaign correctly asserts allocations rather
than boardings, and why **nothing about that campaign's results changes** — its cars really were in
service, and `#carCanCarry`'s new clause is inert for them.

`acceptsHallCalls` and not `acceptsCarCalls` is deliberate. The predicate answers "may this car take
somebody standing at a landing", and for `independent` the answer is no: an attendant-operated car
honours the buttons pressed inside it (which `Car` still allows) but is not under group control.
`#park` is gated on the same predicate for the same reason — stage 7 is the group placing its fleet,
and a recalled car driving itself to a lobby is the controller operating hardware that has been
taken away from it.

Both clauses are inert on every shipped configuration: every car of every building in
`data/buildings` is `in-service` for the whole run, so `car.acceptsHallCalls` is `true` at every
evaluation and both expressions reduce to exactly the code that was there.

## D-T19-6 — no shipped building was changed

`data/buildings/*.json` is untouched. Adding a `mode` or a `serviceEvents` entry to a shipped
building would move every published pin in `experiments/src/benchmark/published.ts` — files this
task does not own — for a demonstration that a fixture makes just as well. Reachability is proved
instead through `parseBuilding` + `resolveBuilding`, which is the exact path `loadConfig` takes.

## Known limitations, recorded rather than hidden

1. **A car recalled with passengers aboard strands them.** `setMode` clears its car calls, so it
   has no reason to move, and its passengers end the run as `undelivered: 'riding'` — named,
   counted, and the conservation audit still balances. A real Phase I recall discharges at the
   recall level. That is a *behaviour*, not a config field, and is out of scope here.
2. **Under destination dispatch, recalling a promised car strands its promises.**
   `Passenger.assign` is write-once, so `#candidateCars` keeps restricting those calls to the
   recalled car, which is permanently ineligible; the call retries until the drain deadline.
   `#reofferCall` counts each of them in `brokenPromises`, which is the honest reading. Fixing it
   means re-promising, which is a change to D29's write-once rule and belongs with Phase 6b.
3. **`independent` is modelled only as "outside group control".** No attendant drives it, so it
   answers the car calls of whoever is already aboard and then stands. That is what
   `acceptsCarCalls` already said; nothing new was invented for it.
