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
 * ## Status, measured (T22)
 *
 * | budget | result |
 * |---|---|
 * | `ELEVATOR_SIM_FUZZ=deep` (250 cases, the tier's own default) | **green**, 0 failures |
 * | `ELEVATOR_SIM_FUZZ_CASES=2000` (the overnight pass) | **green**, 0 failures |
 *
 * T21's open P5 finding — `fuzz-1000384` — is **closed**, by a `core` fix rather than by anything
 * in this package. `checkTermination` and `PROPERTY_BOUNDS` are unchanged line for line, and the
 * generator was not narrowed. See the block at the bottom of this file for the reproduction, and
 * `packages/core/DECISIONS-T22.md` § T22-D1 for the mechanism.
 *
 * The 2 000-case pass was diffed **per case** across the fix on
 * `(status, simulatedSeconds, violations)`: **8 cases move, 1 992 are identical**, and all eight are
 * `destination-panel` runs with a `serviceEvents` schedule, which is exactly the path the fix
 * touches. Seven drain sooner; one (`1001011`) loses its last trip to the drain deadline and turns
 * `completed` into `timed-out` without anybody failing to board. `DECISIONS-T22.md` § "Blast radius"
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
import { evaluateCase, fuzzSimulationConfigFor, generateOptionsFrom } from './run.js';
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
 * The counterexample that closed the fourth `awtIsValid` gate
 * -------------------------------------------------------------------------- */

/**
 * **CLOSED (T21).** Widening the generator to emit service modes turned up one counterexample in
 * 2 000 deep cases, and it was **not** a service-mode bug. Reproduce the parent with
 * `caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`:
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
 * `metrics/summarize.ts` § `diagnoseServiceLevel` and `packages/core/DECISIONS-T21.md` — because
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
    const options = generateOptionsFrom(localConfig, DEEP_SPACE);
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
    const options = generateOptionsFrom(localConfig, DEEP_SPACE);
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
 * `caseFromSeed(1000384, generateOptionsFrom(config, DEEP_SPACE))`:
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
 * `packages/core/DECISIONS-T22.md` § T22-D1. D29's argument is about a car that is **full**: the
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

  it('reproduces, and the fleet now works to its deadline instead of idling for 1 694 s', () => {
    const options = generateOptionsFrom(localConfig, DEEP_SPACE);
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

    /* **The mechanism, pinned.** 45 promises were taken back from cars leaving group control. If
       this goes to 0 the fix has been removed; if it goes non-zero on a run *without* a service
       schedule, `#revokePromisesTo` has acquired a second trigger — which is the thing D29 exists
       to stop, and `sim/serviceMode.test.ts` asserts the control. */
    expect(result.conservation.promisesRevoked).toBe(45);

    /* **What P5 measures, restated on the run itself.** The property fires when the fleet did no
       passenger work for `deadlockIdleBoundS` before the deadline. The last boarding or alighting
       anywhere used to be t = 1734.7 against a deadline of 3429 — 1 694 s of nothing. It is now
       within a few seconds of the deadline, so the run is *busy* right up to it. */
    const lastActivityAt = Math.max(
      result.record.startedAt,
      ...result.record.passengers.flatMap((leg) => [leg.boardedAt ?? 0, leg.alightedAt ?? 0]),
    );
    expect(result.deadlineS).toBe(3429);
    expect(lastActivityAt).toBeCloseTo(3423.14, 1);
    expect(result.deadlineS - lastActivityAt).toBeLessThan(PROPERTY_BOUNDS.deadlockIdleBoundS);

    /* It is still a `timed-out` run, and that is the honest answer rather than a residual defect:
       3.8 %pop/5 min on this building with a car withdrawn is past handling capacity, the queue
       genuinely diverges, and the run refuses to publish a mean for it. P5 exempts a *busy*
       saturated fleet by construction and P6 exempts a run that flags itself, both for the right
       reason. */
    expect(result.status).toBe('timed-out');
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
    const options = generateOptionsFrom(localConfig, DEEP_SPACE);
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
