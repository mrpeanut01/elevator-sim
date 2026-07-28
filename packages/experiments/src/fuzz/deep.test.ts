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
 * ## Status, measured (T21)
 *
 * | budget | result |
 * |---|---|
 * | `ELEVATOR_SIM_FUZZ=deep` (250 cases, the tier's own default) | **green**, 0 failures |
 * | `ELEVATOR_SIM_FUZZ_CASES=2000` (the overnight pass) | **1 failure — `fuzz-1000384`, and it is not a T21 finding** |
 *
 * **OPEN FINDING at the 2 000-case budget — `fuzz-1000384`, simSeed 205687583. P5 termination,
 * not P6 starvation.** A sky-lobby case with access zones, an initial service mode *and* a mid-run
 * service schedule times out with the group having done no passenger work for 1 694 s before its
 * deadline while journey `j35` (G to 4) was servable and outstanding since t = 152.9. The shrinker
 * reduces it in 33 steps to a 29-passenger case that still deadlocks, on a bank whose remaining car
 * is `mode: "independent"`.
 *
 * **Proven pre-existing and separate.** Reproduced with
 * `caseFromSeed(1000384, generateOptionsFrom(config, DEEP_SPACE))` on `c072f97` — the branch point,
 * with every T21 change stashed — producing the identical violation to the same decimal. It is
 * mechanically untouchable by T21 in any case: `checkTermination` reads `result.status`,
 * `deadlineS`, the boarding and alighting timestamps and the servability of an undelivered journey,
 * and consults neither `awtIsValid` nor `serviceLevel`. It is a **dispatch or service-mode
 * liveness defect**, in the same family as `DECISIONS-T20.md` § D79's finding, and it belongs to
 * whoever owns `sim/` and `dispatch/` rather than to the metrics layer. **HANDBACK.**
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
import { caseFromSeed } from './generate.js';
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
