# T12 — property-based fuzzing: decisions

Phase 8's highest-value track, per [`docs/07-handoff.md`](../../../../docs/07-handoff.md) § 7.
Everything here is a decision that shaped the code in this directory; the measurements are in
the task report and are reproduced by running the suites.

---

## D1 — Generate buildings, not just seeds

Re-seeding the five shipped buildings varies one thing: which passengers arrive. It cannot reach
a two-floor building, a single-car bank, a 12 m floor pitch, a shaft that skips floor 13, a
basement entrance, a sky lobby nobody authored, or a bank of six cars. Four of the six properties
are invisible without that variation.

So `generate.ts` produces the **configuration** and runs it through `parseBuilding` (the real
`buildingConfigSchema`) and `resolveBuilding` (the real cross-reference pass). Every case that
reaches the simulator is one `loadConfig` would accept. A fuzzer that emitted invalid configs
would be testing the validator and reporting the result as a simulator finding.

## D2 — Connectivity is a construction guarantee, not a filter

`RoutePlanner.requireRoute` throws when no chain of banks connects two floors. That is *correct*
behaviour for a building nobody could ride, and a **generator** defect rather than a simulator
one. Filtering such cases out after the fact would have hidden how often the generator emitted
them; instead all four topologies are connected by construction (`sky-lobby` and `shuttle` always
share a floor flagged `isTransferFloor`), `FuzzOutcome.skipped` records any that still occur, and
`corpus.test.ts` asserts the corpus produces zero.

The same rule constrains access zones: a zone never covers an entrance or a transfer floor,
because a restricted transfer floor makes a route no single credential can complete and the trace
generator correctly refuses to generate the trip — which would silently narrow the demand instead
of testing anything. `generate.test.ts` asserts it.

## D3 — No new dependency; the shrinker is hand-written

`fast-check` was considered and rejected. Dependency hygiene is part of it — `core` keeps exactly
one runtime dependency (`zod`), `experiments` keeps none beyond `core`, and adding one is a real
decision — but it is not the deciding part.

The deciding part is that a generic shrinker shrinks *values*, and a building config is a graph of
**cross-references**: `servesFloors` names floor ids, `accessZones.floors` names floor ids,
`servesFloorPairs` names pairs of them, and a transfer floor is meaningful only where two banks
meet. Removing a floor id from `floors` without removing it from the three places that name it
produces a config `parseBuilding` rejects, so a generic shrinker's candidates are almost all
invalid and it converges on nothing while burning a replication per attempt.

`shrink.ts`'s five reducers are therefore domain-aware — each removes one building element *and*
every reference to it — and each candidate is re-validated through the real schema before it is
run. Measured on a real counterexample (`fuzz-101`, deadlocked by an injected controller fault):
**11 floors and 2 banks reduce to 2 floors and 1 bank in 11 accepted steps over 20 candidate
evaluations**, a size measure of 815 down to 133. The reduced case still fails the same property,
still resolves through `resolveBuilding`, and still replays to the same verdict — all three
asserted in `shrink.test.ts`.

**The rule that keeps it honest:** a candidate is accepted only if it still violates a property
the *original* violated. A shrinker allowed to wander from a lost-passenger bug to an unrelated
starvation bound would report the wrong minimal case with total confidence.

## D4 — Every draw comes from a named stream (CLAUDE.md invariant 2)

`caseFromSeed` derives seven streams off an injected `StreamSet` — `fuzz.shape`, `fuzz.floors`,
`fuzz.banks`, `fuzz.cars`, `fuzz.access`, `fuzz.run` — one per generation concern. There is no
`Math.random()` anywhere in this directory and no wall clock. Separate streams are not ceremony:
with one stream, changing the floor count would shift every later decision, and a corpus pinned by
seed would reshuffle on any edit to the generator's draw order.

A **shrunk** case is not seed-derivable — `caseFromSeed` returns its unshrunk parent — so
`FuzzCase` is entirely JSON-serializable and `formatOutcome` prints the whole thing. Invariant 5's
spirit: a finding nobody can replay is a rumour.

## D5 — Two properties are stated in order-invariant form, because the record cannot support more

This is the one place a property was *weakened*, and it was weakened because the stronger form was
**wrong**, not because it was inconvenient.

A stop boards several people at one simulated instant, and the record does not preserve the order
they went in. `Simulation.#boardFrom` admits while `massBefore < designLoadKg`, so exactly one
boarder may cross the cap — but *which* one is an ordering fact. A first draft asserted "the mass
before this boarder was under the cap" against a reconstructed order, and reported a violation on
a run that had obeyed the rule perfectly (`fuzz-116`, car `high-high-1`, 1380.1 kg against a
1379.2 kg design load — the reconstruction had simply put a lighter passenger last).

What survives every reordering, and is implied by the model for all of them:

- `total < overloadKg` — the admission test is `massBefore + candidate < overloadKg`, and the
  final boarder's instance of it *is* this, whoever the final boarder was;
- `total − heaviest < designLoadKg` — boarding stops the moment the cap is crossed, so removing
  whoever crossed it leaves the car under the cap, and the heaviest occupant is at least as heavy
  as that person.

A car with one extra body in it fails both by a whole passenger, which the fault injection
demonstrates. The stronger per-boarder form would need the recorder to preserve intra-stop
boarding order; that is a `core` change and is not in this track's scope.

## D6 — Deadlock is measured against the deadline, not against `endedAt`

`docs/07-handoff.md` asks for "no state where calls exist, cars are idle, and nothing is
scheduled". *Nothing is scheduled* is precisely the case where the run **stops early**: the kernel
runs out of events and `endedAt` lands wherever the last one was, so `endedAt − lastActivity` is
zero however completely the group has stalled. A first draft used exactly that and measured
nothing — a run with 101 servable passengers still on the landings scored an idle time of 0.0 s.

`checkTermination` measures `deadlineS − lastActivity`, which is large for both shapes of stall:
the run that idles to its deadline, and the run that quietly runs dry with people waiting. A
legitimately truncated run — one whose next event would fall past the deadline, so it is not
scheduled — loses at most one car event, two orders of magnitude inside the 600 s bound.

## D7 — The two bounds are stated, and are discriminators rather than restatements

`PROPERTY_BOUNDS` carries two numbers and both are chosen so the property says something the run
does not already say about itself:

- **`deadlockIdleBoundS = 600`.** A saturated system is *not* idle — its cars board and alight
  continuously and only the queue grows — so an idle-time bound distinguishes deadlock from
  saturation instead of re-detecting it.
- **`starvationBoundS = 900`.** `docs/03-traffic-and-statistics.md` treats anything past 60 s as a
  bad wait and the shipped buildings run at 10–30 s AWT, so a quarter of an hour is two orders of
  magnitude out. The property fires **only if the run is not flagged** (`awtIsValid` and a
  `stable` saturation verdict), which is `CLAUDE.md` § Statistical discipline's own rule: a
  diverging queue must be flagged and its AWT suppressed, and a run that does so is reporting
  honestly however long the waits were.

Neither was moved to make a case pass. The starvation demonstration in `faults.test.ts` *searches*
for a (case, floor) pair rather than pinning one, and the search is the interesting half: on a
case already near capacity, starving a landing makes the queue diverge and the simulator correctly
flags the run, so the property does not fire — and should not.

## D8 — Always-on 64 cases, deep opt-in; what each covers is stated, never capped

The full suite is ~200 s of CI on an idle machine. A fuzz track that added ten minutes would be
turned off inside a week and would then protect nothing.

- **Always-on** (`corpus.test.ts`): 64 pinned seeds in `STANDARD_SPACE`, one replication each,
  about a second of wall clock. Pinned so it is a regression suite and a failure is a seed
  somebody can type. Its coverage claims — every topology, single-car banks, access zones with and
  without a credential at the landing, basements, two entrances, mixed-use, the two-floor
  building, and the declared ceilings — are **asserted** by `generate.test.ts`, because a
  generator edit that quietly narrowed the corpus would otherwise leave it green and the claim
  false.
- **Deep** (`deep.test.ts`): opt-in via `ELEVATOR_SIM_FUZZ=deep`, `ELEVATOR_SIM_FUZZ_CASES` cases
  (250 by default) in `DEEP_SPACE` — up to 40 floors, 6 cars a bank, 30-minute horizons, demand
  well past handling capacity, and the only place `constant-iso` is reachable.

## D9 — Faults are injected, not simulated

Four properties are predicates over a finished `SimulationResult`, so their faults are corrupted
results — and each corruption is built so the **simulator's own audit still says everything is
fine**. `withLostPassenger` deletes a leg *and decrements `conservation` to match*, leaving
`balanced: true`, so a property that merely echoed `result.conservation` would sail past it. That
is the point of the demonstration: the checks are independent re-derivations, not restatements.

Two properties are claims about behaviour and cannot be forged in a record, so they are injected
into a **real run** through `SimulationConfig.createPolicy` — the hook `sim/types.ts` documents
for instrumentation. The injected policy is a `Proxy` over the shipped one with stages 2–5
subverted for the calls a predicate names; a `Proxy` rather than a hand-written delegate because
the policies carry private fields, and every other method is the real one bound to the real
object. The physics, doors, trace and recorder are untouched, so the run really does deadlock.

## D10 — Exported from the package barrel, with two names renamed rather than omitted

`fuzz/` goes on `@elevator-sim/experiments`'s public surface for the reason `benchmark/` and
`tuning/` do and `validation/` does not: what a consumer needs from here is a **library** — a
generator, six predicates over a finished run, and a shrinker — not the gate. The gate stays in
`fuzz/*.test.ts`.

Two names collided with names the barrel already carries, and `tsc` found both, which is the whole
reason that barrel is written by hand rather than with `export *`:

- `simulationConfigFor` — `runner/`'s builds a *cell's* config from an experiment spec;
- `formatCase` — `benchmark/`'s formats a benchmark case.

Both are resolved by **renaming at the source** (`fuzzSimulationConfigFor`, `formatFuzzCase`)
rather than by omission, following `tuning/index.ts`'s `SearchCandidate` precedent: a consumer
gets both surfaces, and neither can silently shadow the other in a file that imports both. Nothing
is held back, so `index.test.ts`'s structural coverage check applies to the whole module — which
required registering `fuzz` in that test's `submodules` map, the one edit this track made outside
its own directory and the package barrel.

**On `docs/05-roadmap.md`'s standing requirement — name the non-test caller.** This track's
honest answer is weaker than `tune`'s answer for `tuning/`, and it is stated rather than dressed
up: the non-test consumer of `fuzz/` is `campaign.ts` itself, driven by `deep.test.ts` under
`ELEVATOR_SIM_FUZZ=deep`. What keeps the surface from being dead is not a CLI command — there
isn't one — but that `corpus.test.ts` executes `runCampaign` against the real `data/` directory on
every `vitest run`, and `generate.test.ts` fails when the corpus stops covering what it claims. A
CLI `fuzz` command would be a real improvement and is not built here.

---

## The campaign actually run

Measured on 2026-07-28 on the final code, on a machine running four other builds concurrently, so
the wall-clock figures are pessimistic.

| | always-on (`corpus.test.ts`) | deep (`ELEVATOR_SIM_FUZZ=deep`) |
|---|---|---|
| generated buildings | 64 | 2 000 |
| replications | 64 (one per case) | 2 000 |
| passengers generated | 7 889 | 1 396 887 |
| simulated time | 14.17 h | 1 217.27 h |
| wall clock | **≈1.0 s** | 568 s |
| run outcomes | 59 completed, 5 timed-out | 1 205 completed, 795 timed-out |
| topologies | single 24, parallel 17, sky-lobby 14, shuttle 9 | single 520, sky-lobby 505, shuttle 492, parallel 483 |
| property violations | **0** | **0** |
| unroutable / invalid generated | 0 | 0 |

The whole fuzz directory adds **≈3 s** to `vitest run` (six suites, 21 tests plus one skipped),
against a baseline suite of ~200 s. The always-on corpus is about a second of that; the rest is
the fault injections, the shrink demonstration and the determinism pass.

Zero failures is a claim about the *simulator*, not about the properties: all six are shown to
fire on injected faults in `faults.test.ts`, and the two false positives the campaign produced
against **first drafts of the properties** are recorded above as D5 and D6.

---

## What remains unfuzzed, and why

Stated rather than discovered later.

| Axis | Why not |
|---|---|
| **Double-deck banks** (`servesFloorPairs`, `deckSeparationM`, `ratedLoadLbPerDeck`) | The runtime does not simulate them — `WARNING_CODES.doubleDeckNotSimulated` says so out loud — so fuzzing them would fuzz the parser. Phase 6. |
| **Out-of-service cars** | Not authorable: `carConfigSchema` has no service-mode field, and `INELIGIBILITY_REASONS.serviceMode` is reachable only from a `CarSnapshot` a run constructs itself. Generating one needs a `core` change. |
| **`floorRanges`** (the compact floor form) | Generated buildings use the explicit `floors` form only. `expandFloors` has its own suite; what this track adds is variation the *simulator* sees, and both forms resolve to the same `ResolvedBuilding`. A generator that emitted both would be re-testing `expandFloors`. |
| **Mid-run mode changes** | No mechanism exists to change a dispatcher, a zone or a car's availability during a run. Listed in the Phase 8 table as its own adversarial-edge-case track. |
| **Dispatcher weight vectors** | Cases draw a *shipped* profile id. Fuzzing weights is Phase 7's search space (`tuning/space.ts`), which already samples them; fuzzing them here would duplicate it and make a counterexample two variables wide. |
| **Statistics** | One replication per case. Nothing here says a mean is right — only that the mechanics under it are sound. Phase 3's `validation/` suites own the statistical claims. |
| **`elevator-specs.json` and `traffic-profiles.json`** | Held fixed as reference data. Fuzzing the reference data tests the loader, and a counterexample against invented elevator classes tells an engineer nothing. |
| **Persistence and replay round-trips** | `reports/replay.test.ts` and `validation/storedRunReplay.test.ts` own that; a fuzz case is evaluated in memory. Feeding generated buildings through `serializeRunRecord`/`parseRunRecord` is a clear next step and is not done here. |
| **Multi-replication CRN alignment on generated buildings** | `runner/crn.test.ts` owns it for shipped buildings. A generated-building CRN check would be a strong addition to the deep campaign. |
