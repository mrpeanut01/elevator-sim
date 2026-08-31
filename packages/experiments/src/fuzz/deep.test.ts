/**
 * The opt-in deep campaign.
 *
 * Skipped unless `ELEVATOR_SIM_FUZZ=deep`, and that is a deliberate split rather than a silent
 * cap. The always-on corpus (`corpus.test.ts`) is 64 cases and about a second; this is 250 by
 * default, in a space that reaches 40 floors, 6 cars a bank, 30-minute horizons and demand well
 * past handling capacity, and it takes minutes. A suite that grew by ten minutes would be turned
 * off inside a week and would then protect nothing, so the deep pass runs on request and in CI
 * cron rather than on every `vitest run`.
 *
 * ```bash
 * ELEVATOR_SIM_FUZZ=deep npx vitest run --testTimeout=600000 packages/experiments/src/fuzz/deep.test.ts
 * ELEVATOR_SIM_FUZZ=deep ELEVATOR_SIM_FUZZ_CASES=2000 npx vitest run ... # an overnight pass
 * ```
 *
 * Failures are shrunk before they are printed, and every one carries the seed that produced its
 * unshrunk parent plus the whole reduced config — a deep finding has to survive the walk from
 * the machine that found it to the person who fixes it.
 *
 * ## Status, measured
 *
 * | when | budget | result |
 * |---|---|---|
 * | T22 | `ELEVATOR_SIM_FUZZ=deep` (250 cases, the tier's own default) | **green**, 0 failures |
 * | T22 | `ELEVATOR_SIM_FUZZ_CASES=2000` (the overnight pass) | **green**, 0 failures |
 * | **2026-08-29**, `0cd422a` | `ELEVATOR_SIM_FUZZ=deep` (250 cases) | **RED — 1 failure**, `fuzz-1000130`, [termination], GitHub issue #305. See {@link MEASURED_1000130} |
 * | **2026-08-29**, wave H lane B | `ELEVATOR_SIM_FUZZ=deep` (250 cases) | **green**, 0 failures — the P5 defect is fixed in `core` ([§ D398](../../../../DECISIONS.md)) |
 *
 * **The two T22 rows were true when they were taken and had stopped being true long before anybody
 * looked, and that gap is the finding rather than the cost.** They were measured at T22 and never
 * re-taken, because until GitHub issue #163 wired this tier into `.github/workflows/deep-tiers.yml`
 * there was nothing on any cadence that could re-take them: `ci.yml` runs a bare `npm test`, no
 * workflow set `ELEVATOR_SIM_FUZZ`, and no workflow in the repository had a `schedule:` at all. So this table published *green* for every wave between T22
 * and now, over a tree that moved underneath it — which is CLAUDE.md's *"a published number goes
 * stale the same way"* on a table whose whole job was to say whether this tier passes.
 *
 * The old rows are kept with their date rather than deleted. A row that says *when* it was true is
 * worth more than a tidy one, and the sequence is the argument for the schedule. **Only the last
 * row is a claim about this tree**; every row above it is a claim about the tree it was taken on.
 *
 * **The RED row's finding is closed**, one wave later and in `core` rather than here
 * ([§ D398](../../../../DECISIONS.md), GitHub issue #305): `Simulation.#depart` gated the instant a
 * car was *commanded* against the drain deadline and then scheduled its arrival unconditionally, so
 * a car told to move a second inside the deadline carried the run a whole flight time past it. The
 * bounds are untouched — `checkTermination` is unchanged line for line, `EPSILON` is still `1e-9`,
 * `PROPERTY_BOUNDS` is unmoved and the generator was not narrowed.
 *
 * **The RED row stays**, with its date and its commit. A row that says when this tier failed is
 * worth more than a tidy table, and it is the only thing that makes the green row under it mean
 * anything: the green row was measured after a fix, not after a re-run.
 *
 * **The defect was never about this seed, and the sweep is why that is stated rather than assumed.**
 * Over 96 shipped cells — three buildings, four dispatchers, four drain tails, two demand levels —
 * **84** carried a completed move past their own deadline, the worst by 39.2 s, and **none of them
 * reported it in `endedAt`**, which is the only thing P5 can see. `fuzz-1000130` surfaced because
 * its late arrival also registered a landing assignment, which the recorder observes. The always-on
 * guard therefore lives in `packages/core/src/sim/simulation.test.ts`, where it can assert the
 * travel sample this property cannot reach.
 *
 * T21's open P5 finding — `fuzz-1000384` — is **closed**, by a `core` fix rather than by anything
 * in this package. `checkTermination` and `PROPERTY_BOUNDS` are unchanged line for line, and the
 * generator was not narrowed. See the block at the bottom of this file for the reproduction, and
 * `the root DECISIONS.md` § T22-D1 for the mechanism.
 *
 * The 2 000-case pass was diffed **per case** across the fix on
 * `(status, simulatedSeconds, violations)`: **8 cases move, 1 992 are identical**, and all eight are
 * `destination-panel` runs with a `serviceEvents` schedule, which is exactly the path the fix
 * touches. Seven drain sooner; one (`1001011`) loses its last trip to the drain deadline and turns
 * `completed` into `timed-out` without anybody failing to board. `the root DECISIONS.md` § "Blast radius"
 * carries the table.
 */

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  DEEP_SPACE,
  deepCampaignRequested,
  deepCampaignSize,
  deepSeeds,
  formatStats,
  runCampaign,
} from './campaign.js';
import { caseFromSeed, reparse } from './generate.js';
import {
  CORPUS_DISPATCHER_PROFILE_IDS,
  CORPUS_TRAFFIC_PROFILE_IDS,
  evaluateCase,
  fuzzSimulationConfigFor,
  generateOptionsFrom,
} from './run.js';
import { formatOutcome } from './shrink.js';
import { PROPERTY_BOUNDS } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  if (!deepCampaignRequested()) return;
  config = await loadConfig(DATA_DIR);
}, 60_000);

describe.skipIf(!deepCampaignRequested())('the deep campaign', () => {
  it('holds all six properties across the wide space', () => {
    const cases = deepCampaignSize();
    const campaign = runCampaign({
      config,
      seeds: deepSeeds(cases),
      space: DEEP_SPACE,
      shrinkBudget: 200,
    });

    console.log(`\ndeep fuzz campaign\n${formatStats(campaign.stats)}\n`);

    if (campaign.failures.length > 0) {
      const report = campaign.failures
        .map(
          (failure) =>
            `original:\n${formatOutcome(failure.original)}\n\nshrunk in ${String(failure.steps)} steps (${String(failure.evaluations)} evaluations):\n${formatOutcome(failure.minimal)}`,
        )
        .join('\n\n========\n\n');
      throw new Error(`deep campaign found ${String(campaign.failures.length)} counterexample(s)\n\n${report}`);
    }

    expect(campaign.stats.failures).toBe(0);
    expect(campaign.stats.skipped).toBe(0);
    expect(campaign.stats.generatedPassengers).toBeGreaterThan(cases * 20);
  }, 3_600_000);
});

/* -------------------------------------------------------------------------- *
 * The counterexample that moved the travel gate onto the arrival
 * -------------------------------------------------------------------------- */

/**
 * **CLOSED (2026-08-29), GitHub issue #305, [§ D398](../../../../DECISIONS.md).** The one failure
 * in 250 deep cases on the first scheduled run of this tier since T22, and — like `fuzz-1000384`
 * below and unlike `fuzz-1001074` — a genuine defect in `sim/` rather than a reporting one.
 *
 * ```
 * case      fuzz-1000130      simSeed 288869761
 * topology  sky-lobby         tags: sky-lobby, access-zones, mixed-use,
 *                                   service-schedule, service-return
 * dispatch  destination-panel / destination-entry
 * demand    25.3 %pop/5min over 1693 s, drain 1800 s, obstruction 0.17
 * service   initial: all in-service
 *           schedule: 797 s low-4 → out-of-service; 1114 s low/low-4 → in-service
 * as found
 *   [termination] run ended at t=3493.7775825325903, past its hard deadline of t=3493
 * ```
 *
 * ## The mechanism, instrumented on the kernel's own queue
 *
 * The shrink was not a diagnosis: six steps, 167 candidate evaluations, and the reduced case
 * reported the *identical* run — same status, same 2 096 passengers, the same violation to the
 * last digit. A reduction that removes six things and moves no number has shown that the removed
 * things were never load-bearing, and nothing more. What survived was the service schedule, which
 * `fuzz-1000384` also survives with, and **that shared tag was the neighbourhood rather than the
 * cause**.
 *
 * Patching `SimKernel.prototype.schedule` and `cancel` for the last thirty seconds of the run
 * named it in one pass. Two `sim.carArrived` events were put on the queue **past** the deadline —
 * `low-low-1` at 3493.7776 and `low-low-3` at 3505.2351 — and both fired, because
 * `Simulation.run` drains with `runUntilEmpty()` and the deadline is enforced *only* by each
 * scheduling site refusing to queue past it. Nine of the ten sites gate on the instant their event
 * lands. `Simulation.#depart` gated on the instant the car was **commanded** and then scheduled
 * `motion.arrivesAt` unconditionally, so a car told to move a second inside the deadline carried
 * the run a whole flight time past it.
 *
 * ## Why P5 saw it so rarely, which is the part worth keeping
 *
 * `endedAt` is `max(recorder.lastEventAt, demand horizon)` and `MetricsRecorder.sampleTravel`
 * deliberately does not advance `lastEventAt` — so a late arrival that merely moved a car left
 * `endedAt` untouched and P5 saw nothing. Swept over three shipped buildings, four dispatchers,
 * four drain tails and two demand levels, **not one of the 96 cells reported `endedAt` past its
 * deadline**, while nearly every timed-out one had completed moves past it: at
 * `vertical-city`/`destination-panel` with a 60 s tail, sixteen of them, the last **39.2 s** past
 * the deadline. This case is visible only because it is a 2 096-passenger destination-panel run
 * whose late arrival *also* registered a landing assignment, which the recorder does observe.
 *
 * So the defect was never rare and never about this seed. `packages/core/src/sim/simulation.test.ts`
 * carries the always-on guard, on two shipped cells, asserting the thing P5 cannot see: no travel
 * sample past the deadline.
 *
 * ## The fix, and what it is not
 *
 * `Simulation.#depart` now prices the move through `Car.plannedDepartureFor` — `departFor` without
 * the writes, so there is one arithmetic for when a car arrives — and refuses a departure whose
 * arrival would land past the deadline. The check is **strictly stronger than the one it replaces**:
 * `arrivesAt` is the command instant plus three non-negative terms with `profile.duration > 0`, so
 * every departure the old gate refused this one refuses too.
 *
 * **Nothing in this package moved.** `checkTermination` is unchanged line for line, `EPSILON` is
 * still `1e-9`, `PROPERTY_BOUNDS` is unmoved, and the generator was not narrowed.
 *
 * Gating `#scheduleArrival` instead — letting the car depart and dropping its arrival — was
 * rejected: it leaves a car in flight forever and breaks the one-to-one pairing of commanded moves
 * to travel samples that `benchmark/energyLiveness.test.ts` checks against the fleet's own
 * odometers. Both fixes are mutation-checked in the core test named above.
 *
 * ## This record now declares its own axis, and it did not before
 *
 * The OPEN entry this replaces reproduced with `generateOptionsFrom(config, DEEP_SPACE)` — the
 * campaign's own call, over **every** shipped profile — and said in its own text that any edit to
 * `data/dispatcher-profiles.json` or `data/traffic-profiles.json` would move the case out from
 * under the seed and make the check fail about a building that no longer exists rather than a
 * defect. {@link CORPUS_DISPATCHER_PROFILE_IDS} names the fix for exactly that: *a case recorded
 * against a later library declares its own list beside it*. {@link AXIS_1000130} is that list,
 * frozen at the thirteen dispatcher and five traffic profiles shipped on the day the case was
 * found — which is the axis the campaign searched, so the case below **is** the case the campaign
 * found, and stays it.
 *
 * The pinned corpus lists could not have been used: they are frozen at twelve and four, so seed
 * 1 000 130 decodes to a different building under them and reports **zero** violations — which
 * reads exactly like the defect having been fixed, and was not. That trap is why this axis is
 * written out rather than borrowed.
 *
 * ## Still gated with the campaign, and for the reason it always was
 *
 * The two blocks below are always-on and this one is not. It has been run on a single Linux
 * container; § D201 found the § D196 pins EXACTLY INVERTED between Linux and darwin/arm64, and
 * this run's margin — it now ends 0.281 s *inside* its deadline — is a smaller number than that
 * disagreement was. The always-on coverage of the mechanism lives in `core`, on shipped buildings
 * with no floating-point margin in the assertion, so nothing is lost by leaving the record where
 * it was found.
 */
const MEASURED_1000130 = Object.freeze({
  fuzzSeed: 1_000_130,
  simSeed: 288_869_761,
  /** The case's own arithmetic: 1693 s of demand plus an 1800 s drain. */
  deadlineS: 3493,
  /** As found. The overshoot was 0.7776 s — eight orders of magnitude past `EPSILON`. */
  endedAtAsFoundS: 3493.777_582_532_590_3,
  /** After the fix. The same run, 0.281 s inside the deadline it declared. */
  endedAtS: 3492.718_894_364_131_8,
  generatedPassengers: 2096,
});

/**
 * The profile axis seed 1 000 130 was decoded against, in the order `data/` shipped it.
 *
 * Not {@link CORPUS_DISPATCHER_PROFILE_IDS} / {@link CORPUS_TRAFFIC_PROFILE_IDS}: those are frozen
 * at the twelve and four profiles the T21/T22 findings were recorded under, and this case was found
 * a library later. Passing theirs here decodes a **different** building and reports no violation.
 */
const AXIS_1000130 = Object.freeze({
  dispatchers: Object.freeze([
    'nearest-car',
    'eta',
    'collective',
    'collective-enroute',
    'energy-aware',
    'fairness-first',
    'capacity-aware',
    'predictive-balanced',
    'auction',
    'auction-multi-round',
    'zoned-uppeak',
    'destination-eta',
    'destination-panel',
  ]) as readonly string[],
  traffic: Object.freeze([
    'office-prestige',
    'office-standard',
    'residential',
    'hotel',
    'hospital',
  ]) as readonly string[],
});

describe.skipIf(!deepCampaignRequested())(
  'deep campaign counterexample fuzz-1000130 (a run past its own hard deadline)',
  () => {
    it('is still the same case, and now stops inside the deadline it declares', () => {
      const options = generateOptionsFrom(
        config,
        DEEP_SPACE,
        AXIS_1000130.dispatchers,
        AXIS_1000130.traffic,
      );
      const fuzzCase = caseFromSeed(MEASURED_1000130.fuzzSeed, options);

      // The record's subject, asserted before anything is claimed about it: a seed only means what
      // it meant against the library it was found under, and a reproduction that quietly decoded a
      // different building would be reporting about something else entirely.
      expect(
        fuzzCase.simSeed,
        'seed 1 000 130 no longer decodes to the case this block records; the axis above has lost its subject',
      ).toBe(MEASURED_1000130.simSeed);
      expect(fuzzCase.dispatcherProfileId).toBe('destination-panel');
      expect(fuzzCase.callType).toBe('destination-entry');
      expect(fuzzCase.durationS + fuzzCase.drainGraceS).toBe(MEASURED_1000130.deadlineS);

      const outcome = evaluateCase(fuzzCase, { config });
      expect(outcome.generatedPassengers).toBe(MEASURED_1000130.generatedPassengers);
      expect(outcome.status).toBe('timed-out');

      // The finding, gone — and P5 asked directly rather than through the whole set, so a *new*
      // violation on this case fails as a new violation instead of hiding in this one's place.
      expect(outcome.violations.filter((violation) => violation.property === 'termination')).toEqual(
        [],
      );
      expect(outcome.violations).toEqual([]);

      // Asserted as a bound rather than on the digits: `3492.718…` is what this container reported
      // and pinning it would fail for a reason that is not the defect the moment a tie broke
      // differently. The digits live in MEASURED_1000130 as the record of the run.
      const result = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config }));
      expect(result.endedAt).toBeLessThanOrEqual(result.deadlineS);
      expect(
        (result.record.travelSamples ?? []).filter((sample) => sample.at > result.deadlineS),
      ).toEqual([]);
    }, 600_000);
  },
);

/* -------------------------------------------------------------------------- *
 * The counterexample that closed the fourth `awtIsValid` gate
 * -------------------------------------------------------------------------- */

/**
 * **CLOSED (T21).** Widening the generator to emit service modes turned up one counterexample in
 * 2 000 deep cases, and it was **not** a service-mode bug. Reproduce the parent with
 * `caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS))`:
 *
 * ```
 * case      fuzz-1001074      simSeed 2110294577
 * topology  single-bank       tags: basement, mixed-use, initial-service-mode
 * dispatch  destination-eta / mobile-credential
 * demand    6.1 %pop/5min over 1433 s, drain 1800 s
 * service   initial: main/main-2 = independent      schedule: none
 * status    completed, 177 passengers, 1616.0 simulated s, full-run window
 * as found
 *   [starvation] leg "p106" (13 to G) waited 922.7 s, past the 900 s bound,
 *                in a run reporting saturation verdict "stable" with a valid AWT
 *   [starvation] leg "p107" (13 to G) waited 922.7 s, …
 * ```
 *
 * The service mode is only how the campaign *reached* it. `main-2` is `independent`, so the
 * fifteen-floor building is served by one car for hall calls — and **the shrinker removed the
 * mode**, reducing in five steps to an eleven-floor, genuinely single-car building with the whole
 * fleet in service, which reproduces the run summary to the last digit.
 *
 * ## What disagreed, and how it was settled
 *
 * `summarize.ts` called the run `stable` and was right by its own definition: the queue rose to 41
 * and drained to 0, so it did not *diverge*. `checkStarvation` called it starvation and was also
 * right: the run published an AWT of 172.1 s while two people waited 15.4 minutes. "The queue is
 * not diverging" and "nobody was abandoned" were being treated as one claim and are two.
 *
 * The resolution is in `core`, not here. `RunSummary.awtIsValid` gained a **fourth** gate — see
 * `metrics/summarize.ts` § `diagnoseServiceLevel` and `the root DECISIONS.md` — because
 * the trend gate and the censoring gate are both proxies for "did the backlog clear?" and neither
 * sees a backlog that cleared *late*. The run now reports `awtIsValid: false` with the passenger
 * named, and P6's existing escape clause (*"a fifteen-minute wait is legitimate in a run that says
 * so"*) is satisfied for the right reason.
 *
 * **Nothing in this package moved.** `PROPERTY_BOUNDS.starvationBoundS` is still 900 s,
 * `checkStarvation` is unchanged line for line, and the generator was not narrowed. The property
 * still has teeth that the core gate does not: it scans the **whole record** rather than the
 * report window, so a passenger starved outside a `peak-5min` window is invisible to
 * `serviceLevel` and visible here; and it re-derives servability from the building, so it can tell
 * an abandoned passenger from one the fleet could never legally carry.
 */
describe('deep campaign counterexample fuzz-1001074 (starvation vs. a "stable" verdict)', () => {
  let localConfig: LoadedConfig;

  beforeAll(async () => {
    localConfig = await loadConfig(DATA_DIR);
  }, 60_000);

  it('reproduces, and no longer publishes a quotable AWT beside a 922.7 s wait', () => {
    const options = generateOptionsFrom(localConfig, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS);
    const fuzzCase = caseFromSeed(1_001_074, options);
    const result = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config: localConfig }));
    const summary = result.summary;

    // The run is unchanged: same status, same cohort, same numbers. Only the verdict on whether
    // they may be quoted has moved, which is what makes this a reporting fix and not a
    // behavioural one.
    expect(result.status).toBe('completed');
    expect(result.undelivered).toHaveLength(0);
    expect(summary.window.id).toBe('full-run');
    expect(summary.waiting.arrivalCount).toBe(177);
    expect(summary.waiting.unservedCount).toBe(0);
    expect(summary.waiting.meanS).toBeCloseTo(172.067, 2);
    expect(summary.waiting.maxS).toBeCloseTo(922.65, 2);

    // The queue genuinely did not diverge, and the fit still says so. The fix does not pretend
    // otherwise — that was the whole disagreement.
    expect(summary.saturation.verdict).toBe('stable');
    expect(summary.saturation.saturated).toBe(false);

    // What changed.
    expect(summary.serviceLevel.verdict).toBe('starved');
    expect(summary.serviceLevel.longestWaitS).toBeCloseTo(922.65, 2);
    expect(summary.serviceLevel.longestWaitIsCensored).toBe(false);
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/abandonment horizon/);

    // And therefore P6 passes, without P6 having been touched.
    const violations = evaluateCase(fuzzCase, { config: localConfig }).violations;
    expect(violations).toEqual([]);
  }, 120_000);

  it('still fails P6 if the gate is turned off, so the case is a live regression rather than a fixture', () => {
    const options = generateOptionsFrom(localConfig, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS);
    const fuzzCase = caseFromSeed(1_001_074, options);
    const config = fuzzSimulationConfigFor(fuzzCase, { config: localConfig });
    // A horizon past the run's own length is the gate's own off switch, and it restores the
    // original defect exactly: `stable`, a valid AWT, and a 922.7 s wait.
    const result = runSimulation({ ...config, summarize: { maxWaitHorizonS: 100_000 } });
    expect(result.summary.awtIsValid).toBe(true);
    expect(result.summary.saturation.verdict).toBe('stable');
    expect(result.summary.serviceLevel.verdict).toBe('served');
    expect(result.summary.waiting.maxS).toBeGreaterThan(PROPERTY_BOUNDS.starvationBoundS);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The counterexample that closed the recall-strands-a-promise deadlock
 * -------------------------------------------------------------------------- */

/**
 * **CLOSED (T22).** The one P5 failure in 2 000 deep cases, and unlike `fuzz-1001074` above it was
 * a genuine liveness defect in `sim/` rather than a reporting one. Reproduce the parent with
 * `caseFromSeed(1000384, generateOptionsFrom(config, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS))`:
 *
 * ```
 * case      fuzz-1000384      simSeed 205687583
 * topology  sky-lobby         tags: sky-lobby, access-zones, mixed-use,
 *                                   initial-service-mode, service-schedule
 * dispatch  destination-panel / mobile-credential
 * demand    3.8 %pop/5min over 1629 s, drain 1800 s
 * as found
 *   [termination] deadlock: the last passenger boarded or alighted anywhere at t=1734.7, and
 *                 nothing has happened for the 1694.3 s before this run's hard deadline of
 *                 t=3429 (it stopped at t=1734.7, status timed-out), while journey "j35"
 *                 (G to 4) was servable and outstanding since t=152.9
 * ```
 *
 * ## What survived shrinking, and what it showed
 *
 * 33 steps, 139 candidate evaluations, 4.1 s. The 32-floor three-bank tower reduces to
 * {@link MINIMAL_1000384}: **four floors, one bank, two cars, no access zones**. The access zones
 * fall away entirely — so the finding is not about access zoning, despite the tag — and the
 * *service schedule survives*, down to its single entry. That is the whole diagnosis in one
 * reduction: `dropCar` cannot remove either car, because removing `low-4` leaves the bank with no
 * serving car after t = 472 and `everyBankAlwaysServes` discards the candidate, while removing
 * `low-1` takes the schedule entry with it and the case stops failing.
 *
 * ## The mechanism, instrumented through `createPolicy`
 *
 * Every undelivered journey in the shrunk case is `G → 27`, and none of them was ever assigned a
 * car. The call trace says why:
 *
 * ```
 * t=460.3 REGISTER low#G:up→27      (journey j9 arrives)
 * t=460.3 DISPATCH low#G:up→27  cands=[low-1,low-4] -> assigned [low-1]      ← j9 promised low-1
 * t=472.0 (service event: low-1 → independent; its hall calls are released and re-offered)
 * t=472.0 DISPATCH low#G:up→27  cands=[low-1]       -> unassigned, low-1:serviceMode
 * t=477.0 DISPATCH low#G:up→27  cands=[low-1]       -> unassigned, low-1:serviceMode
 *   … identically, every 5 s, 592 times, to t=3427 …
 * ```
 *
 * `cands=[low-1]` is the defect. `#reofferCall` hands the call back to the group exactly as
 * `sim/serviceMode.test.ts` § 2 asserts — but `#candidateCars` then restricts it to the *promised*
 * car (D29's write-once promise, enforced at the candidate set: `DECISIONS.md` § T16-D3), and the
 * promised car is the one that just left group control. `serviceMode` is deliberately not a
 * *structural* ineligibility, so the call is retried rather than abandoned, and it is refused again
 * every `dispatchRetryS` until the drain deadline while `low-4` serves every other landing in the
 * building and stands idle in between. Recorded by T19 as a known limitation
 * (`DECISIONS.md` § D77, limitation 2) and handed back to Phase 6b; P5 turned it into a blocking
 * finding.
 *
 * ## The fix, and what it is not
 *
 * `Simulation.#revokePromisesTo`, gated on `Car.acceptsHallCalls === false` — see
 * `the root DECISIONS.md` § T22-D1. D29's argument is about a car that is **full**: the
 * promise stands because the car will empty and come back, and re-offering the passenger would be
 * the panel changing its mind to get a better answer. A car on `independent` will not come back,
 * so the promise is not a cost being paid but a promise that cannot be kept. Every revocation is
 * counted in `ConservationAudit.promisesRevoked`, separately from `brokenPromises`, so the two can
 * never be read as one number, and no scoring decision can produce the condition that triggers one.
 *
 * **Nothing in this package moved.** `checkTermination` is unchanged line for line,
 * `PROPERTY_BOUNDS.deadlockIdleBoundS` is still 600 s, and the generator was not narrowed.
 */
const MINIMAL_1000384 = Object.freeze({
  id: 'fuzz-1000384-minimal',
  name: 'Fuzz building 1000384 (shrunk)',
  type: 'mixed-use',
  trafficProfile: 'office-standard',
  floors: [
    { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
    { id: '18', index: 18, heightM: 55.8, population: 43 },
    { id: '19', index: 19, heightM: 58.9, population: 42 },
    { id: '27', index: 27, heightM: 83.7, population: 101, isTransferFloor: true },
  ],
  totalPopulation: 186,
  banks: [
    {
      id: 'low',
      servesFloors: ['G', '18', '19', '27'],
      cars: [
        {
          id: 'low-1',
          spec: 'ultra-high-speed',
          ratedSpeedMps: 13.89,
          ratedLoadLb: 3600,
          doorType: 'centerOpening',
          passengerTransferS: 2.16,
        },
        {
          id: 'low-4',
          spec: 'gearless-traction',
          ratedSpeedMps: 3.6,
          ratedLoadLb: 3250,
          doorType: 'centerOpening',
          passengerTransferS: 1.9,
        },
      ],
    },
  ],
  accessZones: [],
  serviceEvents: [{ atS: 472, carId: 'low-1', bankId: 'low', mode: 'independent' }],
});

describe('deep campaign counterexample fuzz-1000384 (a recalled car stranding its promises)', () => {
  let localConfig: LoadedConfig;

  beforeAll(async () => {
    localConfig = await loadConfig(DATA_DIR);
  }, 60_000);

  it('reproduces, and now delivers all 480 instead of idling for 1 694 s — while still refusing a mean', () => {
    const options = generateOptionsFrom(localConfig, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS);
    const fuzzCase = caseFromSeed(1_000_384, options);
    const outcome = evaluateCase(fuzzCase, { config: localConfig });

    // The case is still the case: same building, same seed, same cohort.
    expect(fuzzCase.simSeed).toBe(205_687_583);
    expect(fuzzCase.dispatcherProfileId).toBe('destination-panel');
    expect(outcome.generatedPassengers).toBe(480);

    // All six properties, and P5 in particular.
    expect(outcome.violations).toEqual([]);

    const result = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config: localConfig }));
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.wrongCarBoardings).toBe(0);

    /* **The mechanism, pinned.** Promises taken back from cars leaving group control. If this goes
       to 0 the fix has been removed; if it goes non-zero on a run *without* a service schedule,
       `#revokePromisesTo` has acquired a second trigger — which is the thing D29 exists to stop,
       and `sim/serviceMode.test.ts` asserts the control.

       **45 -> 20 for § D333, and the direction is the fix rather than a regression.** The panel
       used to promise every waiter at a landing to one car without bound, so a recalled car was
       carrying promises it could never have kept and all of them had to be revoked. Bounded to its
       per-deck design load, the same car is holding fewer than half as many when the schedule takes
       it out of group control — so there is less to take back, because less was over-committed in
       the first place. The count is still non-zero, which is what keeps this assertion a test of
       the revocation path rather than of the bound. */
    expect(result.conservation.promisesRevoked).toBe(20);

    /* **What P5 measures, restated on the run itself.** The property fires when the fleet did no
       passenger work for `deadlockIdleBoundS` before the deadline. The last boarding or alighting
       anywhere used to be t = 1734.7 against a deadline of 3429 — 1 694 s of nothing.

       **This used to assert `deadlineS - lastActivityAt < deadlockIdleBoundS`, and § D333 showed
       that was never P5 restated — only a proxy that happened to agree.** With the panel's promise
       bounded the fleet clears its backlog and goes quiet at t = 2821.6, which is **607 s** before
       the deadline and therefore *past* the 600 s bound. The proxy now says "deadlock" about a run
       P5 correctly passes.

       P5 does not fire because it is not a question about the fleet being idle; it is a question
       about somebody *waiting* while the fleet is idle. It takes each undelivered journey's
       `stallBeganAt = max(lastActivityAt, waitingSince)`, so a journey that arrived after the fleet
       went quiet has a short stall by construction. That is the real condition and it is what is
       asserted below: every outstanding journey on this run arrived after the stall window opens,
       so the quiet tail is a fleet that has **finished**, not one that is stuck.

       The distinction is the whole point of the property — `properties.ts` labours it for the
       all-out-of-service fleet that passed all six while delivering none — and the proxy was blind
       to it in the opposite direction. */
    const lastActivityAt = Math.max(
      result.record.startedAt,
      ...result.record.passengers.flatMap((leg) => [leg.boardedAt ?? 0, leg.alightedAt ?? 0]),
    );
    expect(result.deadlineS).toBe(3429);
    expect(lastActivityAt).toBeCloseTo(2821.56, 1);

    // The quiet tail is real, and longer than the bound — which is why the check below has to be
    // P5's actual predicate rather than this subtraction.
    expect(result.deadlineS - lastActivityAt).toBeGreaterThan(PROPERTY_BOUNDS.deadlockIdleBoundS);

    // P5's own condition, and the reason it is silent: there is nobody left to be waiting. P5
    // iterates `result.undelivered`, so an empty list is not a narrow escape from the bound — it is
    // the loop not executing at all. The quiet tail belongs to a fleet that ran out of work.
    expect(result.undelivered).toEqual([]);

    /* **It is no longer a `timed-out` run, and that is § D333 rather than a weakened assertion.**
       This asserted `timed-out`, reasoning that 3.8 %pop/5 min on this building with a car
       withdrawn is past handling capacity. The load is unchanged; what changed is that the panel no
       longer promises one car a queue it cannot hold, so all **480 of 480** journeys are delivered
       and the run completes.

       **The saturation verdict and the AWT suppression are still asserted, and they still hold** —
       which is the half worth keeping. The queue did diverge on the way, and a run that drained
       just in time is precisely the case `CLAUDE.md` says the trend and censoring tests cannot see
       between: *"neither sees a queue that grew enormously and drained just in time."* Delivering
       everybody is not the same as being unsaturated, and this run is now the standing example —
       `completed`, nobody undelivered, and still refusing to publish a mean. */
    expect(result.status).toBe('completed');
    expect(result.conservation.generated).toBe(480);
    expect(result.summary.saturation.verdict).toBe('diverging-queue');
    expect(result.summary.awtIsValid).toBe(false);

    // eslint-disable-next-line no-console
    console.log(
      `[T22] fuzz-1000384: status=${result.status}, undelivered=${String(result.undelivered.length)}/${String(result.conservation.generated)}, ` +
        `last activity t=${lastActivityAt.toFixed(1)} of deadline ${String(result.deadlineS)} (was 1734.7), ` +
        `promises made=${String(result.conservation.legsAssigned)} revoked=${String(result.conservation.promisesRevoked)} broken=${String(result.conservation.brokenPromises)}`,
    );
  }, 120_000);

  it('delivers everybody in the shrunk minimal case, which used to strand seven journeys', () => {
    /* The shrunk counterexample, run as a case in its own right. A shrunk case is not derivable
       from `fuzzSeed` — `caseFromSeed` gives back the unshrunk parent — so the building is carried
       in full, which is what `shrink.ts` means by "a counterexample nobody can replay is a rumour".
       The scalars are the parent's. */
    const options = generateOptionsFrom(localConfig, DEEP_SPACE, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS);
    const parent = caseFromSeed(1_000_384, options);
    const minimal = {
      ...parent,
      caseId: 'fuzz-1000384-minimal',
      building: reparse(MINIMAL_1000384, 'fuzz-1000384-minimal'),
    };

    const outcome = evaluateCase(minimal, { config: localConfig });
    expect(outcome.skipped).toBeUndefined();
    expect(outcome.violations).toEqual([]);

    const result = runSimulation(fuzzSimulationConfigFor(minimal, { config: localConfig }));

    /* 29 legs, all of them delivered. Before the fix this run was `timed-out` with **seven**
       undelivered journeys, every one of them `G → 27` and every one of them promised to `low-1`
       before it went to `independent` at t = 472 — including `j9`, which arrived at t = 460.3 and
       never boarded at all. It now boards `low-4` at t = 502.6. */
    expect(result.status).toBe('completed');
    expect(result.undelivered).toHaveLength(0);
    expect(result.conservation.legsCreated).toBe(29);
    expect(result.conservation.legsBoarded).toBe(29);
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.wrongCarBoardings).toBe(0);

    /* Exactly one promise was revoked — `j9`'s — and it was re-made, which is what
       `assigned - revoked === legsCreated` says. */
    expect(result.conservation.promisesRevoked).toBe(1);
    expect(result.conservation.legsAssigned).toBe(30);
    expect(result.conservation.legsAssigned - result.conservation.promisesRevoked).toBe(
      result.conservation.legsCreated,
    );

    const j9 = result.record.passengers.find((leg) => leg.journeyId === 'j9');
    expect(j9?.arrivedAt).toBeCloseTo(460.26, 1);
    expect(j9?.carId).toBe('low-low-4');
    expect(j9?.boardedAt).toBeCloseTo(502.6, 1);

    // eslint-disable-next-line no-console
    console.log(
      `[T22] fuzz-1000384 shrunk (4 floors, 1 bank, 2 cars, no access zones, 1 schedule entry): ` +
        `status=${result.status}, delivered=${String(result.conservation.delivered)}/${String(result.conservation.generated)}, ` +
        `promises made=${String(result.conservation.legsAssigned)} revoked=${String(result.conservation.promisesRevoked)}, ` +
        `j9 boarded ${String(j9?.carId)} at t=${j9?.boardedAt?.toFixed(1) ?? '-'}`,
    );
  }, 120_000);
});
