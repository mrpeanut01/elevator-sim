/**
 * **The deriver for the mastery harness** ([§ D1601](../../../../DECISIONS.md)): a playtest's
 * attempt file in, each kept attempt re-judged on its stage's held-back batch and on fresh batch
 * *k*, and the results and their table out.
 *
 * `campaign/masteryHarness.ts` is the harness and its docstring is the how-to: the attempt file's
 * shape, what one attempt costs, the cut-off, and what the output means. This file is only its
 * driver: reading `data/` and the attempt file and writing the results take `node:fs`, and a `node:`
 * import belongs to a test or a test helper in this package (`boundaries.test.ts`).
 *
 * ## Skipped unless asked for
 *
 * Gated on two variables, the input and the output, on `honesty/measure.corpus.test.ts`'s
 * precedent: vitest can swallow `console.log`, so the figures go to files.
 *
 * ```
 * MASTERY_ATTEMPTS=/path/attempts.json MASTERY_OUT=/path/mastery.json \
 *   npx vitest run --project viz --reporter=default --silent=false src/campaign/measure.mastery.test.ts
 * ```
 *
 * It writes the report as JSON to `MASTERY_OUT` and the table to `MASTERY_OUT` plus `.table.txt`,
 * and prints the table as well. Without the two reporter flags an agent session gets a reporter
 * that hides a passing case's console output, and the table is then only in its file.
 *
 * The attempt file is read and the whole plan is checked while this file is collected, so an
 * attempt file the harness cannot press in full fails before anything runs. Each kept attempt is a
 * case of its own and runs under the project's own timeout; a stage-1 attempt is one to three
 * batches of fifty short runs, because its two presses share their tuning batch. Not scheduled
 * (`deepTiers.test.ts`): its input is a playtest's own file, which no workflow has.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { loadSurvivorFixture } from '../scenario/regenerateSurvivors.test-helper.js';

import {
  formatMasteryReport,
  masteryReportJsonOf,
  masteryReportOf,
  planMasteryRejudge,
  rejudgeAttempt,
  type MasteryHarnessResources,
  type MasteryPlan,
  type RejudgedAttempt,
} from './masteryHarness.js';

const attemptsPath = process.env['MASTERY_ATTEMPTS'];
const out = process.env['MASTERY_OUT'];

/** The resources and the checked plan, loaded only when both variables are set. */
async function load(path: string): Promise<{ readonly resources: MasteryHarnessResources; readonly plan: MasteryPlan }> {
  const config = await loadConfig(DATA_DIR);
  const fixture = await loadSurvivorFixture();
  const resources: MasteryHarnessResources = {
    stages: fixture.campaign.stages,
    published: fixture.published,
    space: collectSearchSpace(),
    schedule: shippedPriceSchedule(),
    profiles: config.dispatcherProfiles.profiles,
    buildings: [...config.buildingsById.values()],
    elevatorSpecs: config.elevatorSpecs,
    run: (request) =>
      runBatch(request, {
        building: requireBuilding(config, request.buildingId),
        dispatcherProfiles: config.dispatcherProfiles,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
      }),
  };
  const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
  const plan = planMasteryRejudge({
    attempts: read(path),
    seeds: read(join(DATA_DIR, 'mastery-seeds.json')),
    bands: read(join(DATA_DIR, 'engagement-bands.json')),
    resources,
  });
  return { resources, plan };
}

const loaded = attemptsPath !== undefined && out !== undefined ? await load(attemptsPath) : undefined;

describe.skipIf(loaded === undefined || out === undefined)('the mastery harness, run on a playtest attempt file (§ D1601)', () => {
  const rejudged: RejudgedAttempt[] = [];
  const tasks = loaded?.plan.series.flatMap((series) => series.tasks) ?? [];

  for (const task of tasks) {
    const { personaId, attempt, stageId } = task.record;
    it(`${personaId}, attempt ${String(attempt)} on ${stageId}: ${task.moveName}, fresh batch ${task.batch.name}`, async () => {
      if (loaded === undefined) return;
      rejudged.push(await rejudgeAttempt(task, loaded.resources));
    });
  }

  it('writes the re-judged results and the table where a reporter cannot swallow them', () => {
    if (loaded === undefined || out === undefined) return;
    expect(rejudged).toHaveLength(tasks.length);
    const report = masteryReportOf(loaded.plan, rejudged);
    const table = formatMasteryReport(report);
    writeFileSync(out, `${JSON.stringify(masteryReportJsonOf(report), null, 2)}\n`, 'utf8');
    writeFileSync(`${out}.table.txt`, table, 'utf8');
    console.log(table);
  });
});
