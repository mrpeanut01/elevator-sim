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
