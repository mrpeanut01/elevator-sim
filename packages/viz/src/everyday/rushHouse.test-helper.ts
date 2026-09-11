/**
 * **Measuring the house's rush runs** — the instrument behind `data/rush-house-runs.json`, GitHub
 * issue #418 and § D547. Read by `rushHouse.test.ts` (one cell, always-on) and
 * `rushHouseSweep.test.ts` (every cell, behind `ELEVATOR_SIM_RUSH_HOUSE=deep`).
 *
 * ## The path is a player's, step for step
 *
 * `EverydayHost.startRush` reads the standing state, takes the population from
 * `resolvedBuildingOf` on it, applies `rushPatchOf`, and runs; `dev/shiftWorker.ts` calls `recordRun`
 * with the plan's out-of-service cars beside the config. This does the same, from a fresh session
 * standing on the building through `withBuilding` and on the dispatcher through `withDispatcher` —
 * the two setters the pickers call. A bare `buildingId` write would leave the first contract's week
 * in place, and `withBuilding`'s own docstring records that as a defect rather than a shortcut. The
 * population is read **before** the patch, as the host reads it, because a week can scale a tower's
 * occupancy and the rush's rate is people per tower.
 *
 * `recordDecisions` is off: it decides whether the recording keeps the dispatcher's decision log,
 * which no house row reads, and the legs are the same either way.
 *
 * Not a `*.test.ts` file, so vitest does not collect it; a test helper, so `boundaries.test.ts`
 * lets it read the disk and run `git`.
 */

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';

import type { BrowserResources } from '../dev/data.js';
import { initialState, resolvedBuildingOf, shiftRunConfigOf, withBuilding, withDispatcher } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { RUSH_SEED, rushHoldAt, rushOutcomeOf, rushPatchOf } from './rush.js';
import type { RushHouseRun, RushHouseTable } from './rushHouse.js';
import { RUSH_HOLD_LINE, RUSH_STREAM } from './rushScreenModel.js';

export const RUSH_HOUSE_PATH = join(DATA_DIR, 'rush-house-runs.json');

/** The command that regenerates the table, written into it verbatim. */
export const RUSH_HOUSE_COMMAND =
  'ELEVATOR_SIM_RUSH_HOUSE=deep ELEVATOR_SIM_REGENERATE_RUSH_HOUSE=1 ' +
  'npx vitest run --project viz src/everyday/rushHouseSweep.test.ts';

const PATH =
  'initialState → dev/state.ts#withBuilding → #withDispatcher; population from ' +
  '#resolvedBuildingOf on that state, as EverydayHost.startRush reads it; everyday/rush.ts#rushPatchOf ' +
  '→ dev/state.ts#shiftRunConfigOf → record/recordRun.ts#recordRun with the plan’s out-of-service ' +
  'cars; read at everyday/rush.ts#rushHoldAt and #rushOutcomeOf';

const CONTRACT =
  'GitHub issue #418, the owner’s ruling of 2026-09-10 and DECISIONS.md § D547. One Endless rush ' +
  'per shipped dispatcher per shipped building, on the rush’s one seed, played through the path a ' +
  'player’s rush takes and read at the hold line. The rush setup screen draws the house’s runs on ' +
  'the building the player stands on (packages/viz/src/everyday/rushHouse.ts). Nothing in this file ' +
  'is chosen: every figure is the output of the command below, and a figure that does not reproduce ' +
  'is a finding to report rather than a number to edit.';

/** `BrowserResources` over every shipped building — `honesty/surfaces.ts#browserResourcesOf`'s shape. */
export function browserResourcesFrom(config: LoadedConfig): BrowserResources {
  return {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    buildings: config.buildings,
    entries: config.buildings.map((building) => ({ file: `${building.id}.json`, config: building.config, resolved: building })),
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

export async function loadRushHouseResources(): Promise<BrowserResources> {
  return browserResourcesFrom(await loadConfig(DATA_DIR));
}

/** One house run, measured — see the module docstring for why each step is the one it is. */
export function measureRushHouseRun(resources: BrowserResources, buildingId: string, dispatcherId: string): RushHouseRun {
  const standing = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
  const building = resolvedBuildingOf(resources, standing);
  if (building === undefined) throw new Error(`no shipped building "${buildingId}" to run the rush on`);
  const state = { ...standing, ...rushPatchOf(standing, building.totalPopulation) };
  const plan = shiftRunConfigOf(resources, state);
  const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
  const holdAt = rushHoldAt(recording);
  const outcome = rushOutcomeOf(recording, undefined);
  return {
    buildingId,
    dispatcherId,
    brokeAtS: holdAt === undefined ? null : holdAt - recording.startedAt,
    arrived: outcome.arrived,
    carried: outcome.carried,
    legs: recording.legs.length,
    awtIsValid: recording.summary.awtIsValid,
    saturationVerdict: recording.summary.saturation?.verdict ?? null,
  };
}

/** The table a set of measured runs makes, stamped with the commit and the day. */
export function rushHouseTableOf(runs: readonly RushHouseRun[], tree: string, measuredAt: string): RushHouseTable {
  return {
    generatedBy: 'packages/viz/src/everyday/rushHouse.test-helper.ts',
    contract: CONTRACT,
    provenance: {
      kind: 'measured',
      command: RUSH_HOUSE_COMMAND,
      tree,
      measuredAt,
      seed: String(RUSH_STREAM.seed),
      streamLengthS: RUSH_STREAM.lengthS,
      holdLine: { people: RUSH_HOLD_LINE.people, overS: RUSH_HOLD_LINE.overS },
      path: PATH,
    },
    runs,
  };
}

/** One run per line, so a regeneration diffs by cell rather than by brace. */
export function formatRushHouseTable(table: RushHouseTable): string {
  const { runs, ...head } = table;
  const top = JSON.stringify(head, null, 2).replace(/\n\}$/u, '');
  const lines = runs.map((run) => `    ${JSON.stringify(run)}`);
  return `${top},\n  "runs": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export async function writeRushHouseTable(runs: readonly RushHouseRun[]): Promise<void> {
  const tree = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const measuredAt = new Date().toISOString().slice(0, 10);
  await writeFile(RUSH_HOUSE_PATH, formatRushHouseTable(rushHouseTableOf(runs, tree, measuredAt)));
}
