/**
 * Regenerate `data/scenario-goals.json` by re-running every candidate scenario's two seed sets.
 *
 * ```
 * npx vitest run --project viz src/scenario/regenerate.test.ts
 * ```
 *
 * **A tool, not a fix** — the same discipline `experiments/src/benchmark/regeneratePins.ts`
 * states for the published intervals: *"a re-run that disagrees with the file is a question, not
 * an answer."* If this writes different counts than the file holds, something moved; find out
 * what before pasting.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`. It is a
 * `.test-helper.ts` because it reads and writes the repository from Node, which
 * `boundaries.test.ts` confines to the dev entry point and the test helpers.
 *
 * ## The regenerator and the guard share the measurement, not the expectation
 *
 * `goalRates.test.ts` re-derives the table by calling the same {@link measureScenario} this file
 * calls, and then compares against what is **on disk**. That is the shape that catches a stale
 * file: a guard that recomputed the expectation from the same run would agree with itself.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@elevator-sim/core';

import { CANDIDATE_SCENARIOS } from './candidates.js';
import { measureScenario, publishedScenarioFor } from './measure.js';
import type { PublishedGoalRates } from './published.js';
import type { BatchResources } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

/** Where the published table lives. One constant, so the guard and the writer cannot diverge. */
export const SCENARIO_GOALS_PATH = fileURLToPath(
  new URL('../../../../data/scenario-goals.json', import.meta.url),
);

/** Run every candidate scenario and assemble the table. Minutes, not seconds — it simulates. */
export async function measurePublishedGoalRates(): Promise<PublishedGoalRates> {
  const config = await loadConfig(DATA_DIR);
  const scenarios = CANDIDATE_SCENARIOS.map((scenario) => {
    const resources: BatchResources = {
      building: requireBuilding(config, scenario.buildingId),
      dispatcherProfilesById: config.dispatcherProfilesById,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
    return publishedScenarioFor(measureScenario(scenario, resources));
  });

  return {
    generatedBy: 'packages/viz/src/scenario/regenerate.test-helper.ts',
    contract:
      'docs/10-experience-layer-contract.md § 1 R12 and § 5.2. Counts, never quotients: a rate ' +
      'is passes / n and is derived at read time. Every goal kind is accounted for on every ' +
      'scenario — a kind in no bucket is a guard failure, not an omission.',
    scenarios,
  };
}

/** Write the table where the guard reads it. */
export async function regenerateScenarioGoals(): Promise<PublishedGoalRates> {
  const table = await measurePublishedGoalRates();
  await writeFile(SCENARIO_GOALS_PATH, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
  return table;
}
