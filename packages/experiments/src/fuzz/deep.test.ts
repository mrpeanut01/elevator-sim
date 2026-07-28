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
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
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
import { formatOutcome } from './shrink.js';

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
 * An open counterexample, named rather than filtered out
 * -------------------------------------------------------------------------- */

/**
 * **OPEN FINDING — the deep campaign is red on this, deliberately.**
 *
 * Widening the generator to emit service modes turned up one counterexample in 2 000 deep cases,
 * and it is **not** a service-mode bug. Reproduce the parent with
 * `caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`:
 *
 * ```
 * case      fuzz-1001074      simSeed 2110294577
 * topology  single-bank       tags: basement, mixed-use, initial-service-mode
 * dispatch  auction-multi-round / mobile-credential
 * demand    6.1 %pop/5min over 1433 s, drain 1800 s
 * service   initial: main/main-2 = independent      schedule: none
 * status    completed, 177 passengers
 * violations
 *   [starvation] leg "p106" (13 to G) waited 922.7 s, past the 900 s bound,
 *                in a run reporting saturation verdict "stable" with a valid AWT
 *   [starvation] leg "p107" (13 to G) waited 922.7 s, …
 * ```
 *
 * The service mode is only how the campaign *reached* it. `main-2` is `independent`, so the
 * fourteen-floor building is served by one car for hall calls — and **the shrinker removed the
 * mode**, reducing in five steps to an eleven-floor, genuinely single-car building with the whole
 * fleet in service, which reproduces both violations exactly. Nothing about the counterexample
 * requires `CarConfig.mode` to exist; the old corpus simply never drew a building of that shape
 * at that rate.
 *
 * ## What actually disagrees
 *
 * Two definitions, both defensible, and the run satisfies one:
 *
 * - `metrics/summarize.ts` calls the run **`stable`**, and by its own definition it is right: the
 *   verdict is a regression on queue length over the report window, and this queue does not
 *   *diverge* — it spikes under a transient overload the single car cannot absorb, and then
 *   clears. The run `completed`; nobody is undelivered.
 * - `properties.ts` `checkStarvation` calls it **starvation**, and by `CLAUDE.md`'s discipline it
 *   is also right: the run publishes an AWT while two people waited 15.4 minutes, which is the
 *   "statistics improve as the bug gets worse" failure the whole track exists to catch.
 *
 * So "the queue is not diverging" and "nobody was abandoned" are being treated as one claim and
 * are two. The resolution belongs in `core/src/metrics/summarize.ts` — a run that produced a
 * quarter-hour wait should say so in its own verdict, whether or not its queue diverges — and
 * that file is **not owned by this package**. **HANDBACK.**
 *
 * `PROPERTY_BOUNDS.starvationBoundS` is deliberately **not** moved. 900 s is two orders of
 * magnitude past the 10–30 s AWT the shipped buildings run at; raising it to make this case pass
 * is exactly the move this track exists to prevent, and the generator is not narrowed to avoid
 * the case either.
 */
describe('deep campaign counterexample fuzz-1001074 (starvation vs. a "stable" verdict)', () => {
  it.skip('a run that starves a passenger for 922.7 s should not report a quotable AWT — needs a resolution in core/src/metrics/summarize.ts', () => {
    /* Intentionally empty. The reproduction is the seed in the docstring above, and the assertion
       that would go here is one this package cannot make true: either `summarize.ts` widens what
       it is willing to call unquotable, or the project accepts that a transient single-car
       overload is a legitimate `stable` run with a legitimate 15-minute wait — and if it is the
       second, that decision belongs beside `SaturationThresholds`, not in a fuzz bound. */
  });
});
