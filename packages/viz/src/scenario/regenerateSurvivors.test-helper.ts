/**
 * Regenerate `data/scenario-survivors.json` by re-drawing and re-playing every scenario's budget.
 *
 * ```
 * ELEVATOR_SIM_SURVIVORS=deep ELEVATOR_SIM_REGENERATE_SURVIVORS=1 \
 *   npx vitest run --project viz src/scenario/survivorSweep.test.ts
 * ```
 *
 * **A tool, not a fix** — the discipline `benchmark/regeneratePins.ts` states for the published
 * intervals and `regenerate.test-helper.ts` restates for the goal table: *"a re-run that disagrees
 * with the file is a question, not an answer."* If this writes different counts than the file
 * holds, something moved — a dispatcher profile, a building, the price schedule, a goal's published
 * bar, or the judge — and the thing to do is find out which, not paste.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`. It is a
 * `.test-helper.ts` because it reads and writes the repository from Node, which
 * `boundaries.test.ts` confines to the dev entry point and the test helpers.
 *
 * ## The regenerator and the guard share the measurement, not the expectation
 *
 * `survivorSweep.test.ts` re-derives the table by calling the same
 * {@link measureScenarioSurvivors} this file calls, and then compares against what is **on disk**.
 * That is the shape that catches a stale file; a guard that recomputed the expectation from the
 * same run would agree with itself.
 *
 * ## Hours, not minutes — and that is why the caller is gated
 *
 * Every cell is a fifty-replication two-arm batch, and a cell that meets every bar on the tuning
 * seeds runs a second one. Measured on 2026-09-10 on a quiet ten-core developer machine, at the
 * shipped sample size and under load from a second suite: the whole sweep is **932 s** over 480
 * judgements — 120 dropdown ones, played once per profile per scenario and attributed to every rung
 * that affords them, and 360 drawn dial ones. It is very unevenly spread:
 * `stage-3-overwhelmed` alone takes 389 s, `stage-5-credentials` 189 s and `stage-1-first-call` 4 s,
 * which is why a per-scenario progress line exists at all.
 *
 * **Re-run on `4159520` for GitHub issue #475 at 1 900 s**, and that is two effects rather than a
 * regression in the sweep. Most of it is the machine — that run shared a host whose load average
 * was above 60 — and the rest is the fix doing its job: the four configurations that used to
 * `throw` while the building was constructed cost almost nothing, and each now runs a full
 * fifty-replication batch like any other draw. **932 s is the quiet-machine figure and is the one
 * to plan CI against**; 1 900 s is what a contended one looks like and is recorded so the next
 * reader does not read it as the tier having doubled.
 *
 * A hosted four-core runner is slower again, which is why this lives behind
 * `ELEVATOR_SIM_SURVIVORS=deep` and runs on the weekly `deep-tiers.yml` schedule rather than
 * on a pull request.
 */

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';

import { runBatch } from '../batch/runBatch.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

import { measureScenarioSurvivors, type SurvivorTally } from './measureSurvivors.js';
import type { PublishedGoalRates } from './published.js';
import {
  firstHourScenarioIds,
  type PublishedSurvivorScenario,
  type PublishedSurvivorStep,
  type PublishedSurvivors,
} from './survivors.js';
import {
  reachableChangesOf,
  unpricedDimensionIds,
  unreachableChangeIdsOf,
  withheldDimensionIds,
} from './survivorSpace.js';

/** Where the published table lives. One constant, so the guard and the writer cannot diverge. */
export const SCENARIO_SURVIVORS_PATH = fileURLToPath(
  new URL('../../../../data/scenario-survivors.json', import.meta.url),
);

/**
 * The master seed every cell's sampler seed derives from.
 *
 * One pinned integer rather than thirty authored ones: `survivorSpace.ts#samplerSeedFor` mixes it
 * with `(scenarioId, stepId)`, so every cell's seed is re-derivable from two ids the record already
 * carries and two cells cannot silently share a draw. The value is the date this table was first
 * measured, which is `benchmark/published.ts`'s own convention for a study seed.
 */
export const SURVIVOR_MASTER_SEED = 20_260_910;

/**
 * Distinct dial configurations drawn at each rung.
 *
 * **Chosen the way a replication budget is chosen**, and it is the one figure in this measurement
 * that is not an output: twelve is what the deep tier can afford at fifty replications a cell over
 * ten scenarios and three rungs, beside a dropdown census of up to twelve profiles a scenario. It
 * is published on the table's own face because `k` is a denominator — `survivors.ts` publishes
 * `examined` on every record and no rate anywhere — and because a reader who wants a tighter
 * interval on the dial half needs to know what the current one was taken over.
 *
 * The dial half's uncertainty at this `k` is real and is not hidden: `survivors.ts#dialShareInterval`
 * derives an exact binomial interval at read time, and at twelve draws a count of zero survivors
 * bounds the share at about a quarter rather than at nothing.
 */
export const SURVIVOR_SAMPLE_SIZE = 12;

/** The command that reproduces this file, quoted on the table's own face. */
export const SURVIVOR_REGENERATE_COMMAND =
  'ELEVATOR_SIM_SURVIVORS=deep ELEVATOR_SIM_REGENERATE_SURVIVORS=1 ' +
  'npx vitest run --project viz src/scenario/survivorSweep.test.ts';

/** Everything the sweep needs, loaded from the real `data/` rather than from a fixture. */
export interface SurvivorFixture {
  readonly campaign: Campaign;
  readonly published: PublishedGoalRates;
}

/** Load the shipped campaign against the shipped goal table, buildings, profiles and the space. */
export async function loadSurvivorFixture(): Promise<SurvivorFixture> {
  const config = await loadConfig(DATA_DIR);
  const published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const raw: unknown = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  const space = collectSearchSpace();
  const context: CampaignContext = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
    schedule: shippedPriceSchedule(),
  };
  return { campaign: parseCampaign(raw, context), published };
}

/**
 * Run every scenario at every rung and assemble the table.
 *
 * Tens of minutes — it simulates. `onScenario` exists so a driver can say where it is: a sweep that
 * prints nothing for half an hour is one a reader assumes has hung.
 */
export async function measurePublishedSurvivors(
  options: { readonly onScenario?: ((line: string) => void) | undefined } = {},
): Promise<PublishedSurvivors> {
  const config = await loadConfig(DATA_DIR);
  const { campaign, published } = await loadSurvivorFixture();
  const space = collectSearchSpace();
  const schedule = shippedPriceSchedule();
  const firstHour = firstHourScenarioIds(campaign.stages);

  const scenarios: PublishedSurvivorScenario[] = [];
  for (const [index, stage] of campaign.stages.entries()) {
    const row = published.scenarios.find((entry) => entry.id === stage.id);
    if (row === undefined) throw new Error(`no published goal row for ${stage.id}`);
    const baseline = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
    if (baseline === undefined) {
      throw new Error(`no dispatcher profile "${stage.dispatcher.startingProfileId}"`);
    }
    const resources = {
      building: requireBuilding(config, stage.building),
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
    const started = Date.now();
    const tallies = await measureScenarioSurvivors({
      stage,
      published: row,
      space,
      schedule,
      baseline,
      /* The same building and specs the batch runs on — issue #475. See `MeasureSurvivorsInput`. */
      building: resources.building,
      elevatorSpecs: resources.elevatorSpecs,
      profiles: config.dispatcherProfiles.profiles,
      sampleSize: SURVIVOR_SAMPLE_SIZE,
      masterSeed: SURVIVOR_MASTER_SEED,
      run: (request) => runBatch(request, resources),
    });
    scenarios.push({
      id: stage.id,
      name: stage.name,
      ladderPosition: index + 1,
      inFirstHour: firstHour.has(stage.id),
      buildingId: stage.building,
      baselineProfileId: baseline.id,
      durationS: stage.durationS,
      replications: stage.replications,
      tuningSeeds: { ...stage.seeds },
      holdoutSeeds: { ...stage.holdoutSeeds },
      /*
       * Never written by the regenerator. A diagnosis is a scenario saying, in the player's words,
       * that nothing gets through it as configured — `docs/10` § 5.4 stage 3 — and that is an
       * authored sentence rather than a measurement. A regenerator that supplied one would let a
       * zero count silence its own guard, which is the whole rule inverted.
       */
      diagnosis: null,
      steps: tallies.map(publishedStepFor),
    });
    options.onScenario?.(
      `${stage.id}: ${tallies
        .map(
          (tally) =>
            `${tally.stepId ?? 'base'} ${String(tally.survivors)}/${String(tally.examined)}`,
        )
        .join('  ')}  (${String(Math.round((Date.now() - started) / 1000))} s)`,
    );
  }

  const reachable = reachableChangesOf(space, schedule);
  const unpriced = unpricedDimensionIds(space, schedule);
  const withheld = withheldDimensionIds(space, schedule);
  const priced = space.parameters.length - unpriced.length - withheld.length;
  return {
    generatedBy: 'packages/viz/src/scenario/regenerateSurvivors.test-helper.ts',
    contract:
      'docs/38-what-the-game-is.md § 2.1 and § 3, DECISIONS.md § D525 clause 3, GitHub issue ' +
      '#367. Difficulty is the number of ways through: take every configuration the budget can ' +
      'reach on the schedule, judge each on the scenario\'s own seeds under common random numbers ' +
      'against the scenario\'s own goals, and count the ones that clear. Counts, never quotients — ' +
      'a survivor count is over `examined` configurations and each configuration is judged over ' +
      '`replications` runs, and the two denominators are not interchangeable.',
    provenance: {
      kind: 'measured',
      command: SURVIVOR_REGENERATE_COMMAND,
      tree: headCommit(),
      measuredAt: new Date().toISOString().slice(0, 10),
      masterSeed: SURVIVOR_MASTER_SEED,
      sampleSize: SURVIVOR_SAMPLE_SIZE,
      scope:
        `Every configuration is an edit of the scenario's own baseline dispatcher or a shipped ` +
        `profile picked in its place, priced by data/price-schedule.json. ` +
        `${String(reachable.length)} of ${String(schedule.changes.length)} priced changes can ` +
        `reach a scenario run at all — the rest price shafts, machines and fittings that ` +
        `campaign/stageRun.ts cannot apply — and ` +
        `${String(priced)} of ${String(space.parameters.length)} declared dimensions are priced ` +
        `and therefore varied, and ${String(withheld.length)} are withheld from every scenario by ` +
        `data/price-schedule.json and varied by no configuration. A configuration differing only ` +
        `on an unpriced dimension is reachable at every rung, so counting it would make the budget ` +
        `inert.`,
      reachableChangeIds: reachable.map((change) => change.changeId),
      unreachableChangeIds: unreachableChangeIdsOf(space, schedule),
      unpricedDimensionCount: unpriced.length,
      withheldDimensionCount: withheld.length,
      declaredDimensionCount: space.parameters.length,
    },
    scenarios,
  };
}

/** One rung's tally, reduced to what the file publishes. The per-configuration verdicts are dropped. */
export function publishedStepFor(tally: SurvivorTally): PublishedSurvivorStep {
  return {
    stepId: tally.stepId,
    units: tally.units,
    chimesSpent: tally.chimesSpent,
    examined: tally.examined,
    survivors: tally.survivors,
    survivorNames: tally.judged.filter((entry) => entry.cleared).map((entry) => entry.name),
    unjudged: tally.unjudged,
    suppressed: tally.suppressed,
    unbuildable: tally.unbuildable.length,
    dropdown: tally.dropdown,
    dials: tally.dials,
    perTier: tally.perTier,
    sampling: tally.sampling,
  };
}

/** Write the table where the guard reads it. */
export async function regenerateScenarioSurvivors(
  options: { readonly onScenario?: ((line: string) => void) | undefined } = {},
): Promise<PublishedSurvivors> {
  const table = await measurePublishedSurvivors(options);
  await writeFile(SCENARIO_SURVIVORS_PATH, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
  return table;
}

/**
 * The commit this run was taken on.
 *
 * `CLAUDE.md`'s own lesson about the corpus figures, one file over: *"a measurement taken in a
 * working directory carries that directory's state into the number."* A tree that cannot be read
 * says so rather than publishing an empty string, because an empty string is what the validator
 * refuses and a lie is what it cannot.
 */
function headCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: DATA_DIR,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown (git rev-parse failed in this working directory)';
  }
}
