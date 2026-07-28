/**
 * The always-on fuzz gate.
 *
 * Twenty-eight generated buildings, one replication each, all six properties checked on every
 * one. Pinned seeds rather than fresh ones, so this is a **regression** suite: the same
 * twenty-eight buildings on every machine forever, and a failure is a seed somebody can type.
 *
 * The cost is printed rather than assumed, because a fuzz track that quietly grows into a
 * ten-minute suite gets disabled and then protects nothing.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { STANDARD_CORPUS, formatStats, runCampaign } from './campaign.js';
import { formatOutcome } from './shrink.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

describe('the always-on corpus', () => {
  it('holds all six properties on every pinned case', () => {
    const campaign = runCampaign({ config, seeds: STANDARD_CORPUS });

    if (campaign.failures.length > 0) {
      const report = campaign.failures
        .map(
          (failure) =>
            `original:\n${formatOutcome(failure.original)}\n\nshrunk in ${String(failure.steps)} steps (${String(failure.evaluations)} evaluations):\n${formatOutcome(failure.minimal)}`,
        )
        .join('\n\n========\n\n');
      throw new Error(`fuzz corpus found ${String(campaign.failures.length)} counterexample(s)\n\n${report}`);
    }

    // Not a silent cap: what this gate actually ran, on the record.
    console.log(`\nfuzz corpus\n${formatStats(campaign.stats)}\n`);

    expect(campaign.stats.failures).toBe(0);
    // A corpus that generated nobody would pass every property vacuously.
    expect(campaign.stats.generatedPassengers).toBeGreaterThan(2000);
    expect(campaign.stats.skipped).toBe(0);
  }, 120_000);
});
