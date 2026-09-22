/**
 * **The energy bar, re-derived over the horizon the day actually runs** — GitHub issue #583, under
 * [§ D468](../../../../DECISIONS.md)'s own protocol and [§ D106](../../../../DECISIONS.md)'s check.
 *
 * Gated on `ENERGY_BAR_SWEEP=1`, for `legibility.sweep.test.ts`'s reason exactly: thirteen
 * contracts × fifty ten-hour days is a compute job rather than a check. What it publishes is the
 * table `shift/goals.ts#ENERGY_PER_LEG_MAX_WHOLE_DAY_KJ` carries, and `goals.test.ts` pins the
 * constant so the two cannot drift in silence.
 *
 * Three arms, selected by `ENERGY_BAR_ARM`:
 *
 * - `derive` — every contract that can run a whole authored day, `collective`, day 1, ordinary,
 *   seeds `20 260 824 + 7 919 n`. § D468's cell with one field moved: the run is the day rather
 *   than the thirty-minute slice. It records every run's `workPerServedLegKJ` **and** the other
 *   four goals' readings, so the pooled two-thirds point and the five-goal miss rate that brackets
 *   the bar from below come out of one sweep rather than two.
 * - `d106` — the same cell over all thirteen shipped dispatchers on the contracts named by
 *   `ENERGY_BAR_CONTRACTS`, which is § D468's *"`nearest-car` wins the bar and loses the day"*
 *   check re-run against whatever bar this sweep produces.
 * - `rung` — § D468's **own** horizon, the contract's shift length, run twice per seed: once with
 *   the pair consistent and once with `baseState()`'s `c1` week, which is what issue #584's defect
 *   did. It exists because § D468's 400 runs were taken on 2026-09-04 and
 *   `data/contract-ladder.json` landed on 2026-09-10, so the 80 kJ bar was derived on towers **as
 *   built** — which was correct then and is a second way the constant has gone stale since, beside
 *   the horizon. Both pairings are run here rather than one, because a figure quoted against
 *   § 4.6's published table needs the arm that reproduces it standing beside the arm that does not.
 *
 * **Every state here carries a consistent `(buildingId, contractId)` pair** — GitHub issue #584.
 * `baseState()`'s week stands on `c1`, and `shift/ladder.ts#rungFor` checks the contract *and* the
 * building, so a sweep that moved only `buildingId` would measure every tower **as built** rather
 * than as its contract hands it over. `openWeek(contract.id)` is what makes this a measurement of
 * the game.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildingConfigOf, shiftRunConfigOf } from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { baseState } from '../scope/probes.test-helper.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { runHorizonOf, wholeDayFor, wholeDayRun } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';

const SEEDS = Number(process.env['ENERGY_BAR_SEEDS'] ?? '50');
const ARM = process.env['ENERGY_BAR_ARM'] ?? 'derive';
const OUT = process.env['ENERGY_BAR_OUT'] ?? '/tmp/energy-bar.jsonl';
const ONLY = process.env['ENERGY_BAR_CONTRACTS'];

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

interface Row {
  readonly contractId: string;
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly n: number;
  readonly horizon: string;
  /** `handed` — the pair consistent; `built` — issue #584's `c1` week, so no rung reaches the run. */
  readonly pairing: 'handed' | 'built';
  readonly energyKJPerLeg: number | undefined;
  readonly legs: number;
  readonly arrived: number;
  /** Goal id → `met` / `missed` / `pending`, the four bars that are not the energy one. */
  readonly others: Record<string, string>;
}

describe.runIf(process.env['ENERGY_BAR_SWEEP'] === '1')('the energy bar over a whole day — issue #583', () => {
  it('records work per delivered leg and the other four goals, day 1, whole-day runs', () => {
    const resources = contractBuildings();
    const dispatcherIds =
      ARM === 'd106'
        ? resources.dispatcherProfiles.profiles.map((profile) => profile.id)
        : ['collective'];
    const rows: Row[] = [];
    const lines: string[] = [];
    for (const contract of CONTRACTS) {
      if (ONLY !== undefined && !ONLY.split(',').includes(contract.id)) continue;
      const entry = resources.entries.find((one) => one.file === `${contract.buildingId}.json`);
      const day = wholeDayFor(resources.trafficProfiles, entry?.config);
      if (day === undefined && ARM !== 'rung') continue;
      /* `rung` runs § D468's own horizon; the other two run the day the player is handed. */
      const over = ARM === 'rung' || day === undefined ? {} : wholeDayRun(day);
      const pairings: readonly ('handed' | 'built')[] = ARM === 'rung' ? ['handed', 'built'] : ['handed'];
      for (const dispatcherId of dispatcherIds) {
        for (let n = 0; n < SEEDS; n += 1) {
          for (const pairing of pairings) {
            /* Issue #584: the week stands on this contract, so the rung reaches the run. */
            const handed = contractDayState(contract.id, { dispatcherId, seed: seedAt(n), over });
            /* The old shape, on purpose: `baseState()`'s week stands on `c1` and no rung applies. */
            const state = pairing === 'handed' ? handed : { ...handed, week: baseState().week };
            const plan = shiftRunConfigOf(resources, state);
            const { recording } = recordRun(plan.config, {
              recordDecisions: false,
              outOfServiceCarIds: plan.outOfServiceCarIds,
            });
            const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
            const horizon = runHorizonOf(
              resources.trafficProfiles,
              buildingConfigOf(resources, state.savedBuildings, contract.buildingId),
              state,
            );
            const readings = readGoals(goalsForDay(1, horizon), observations);
            const others: Record<string, string> = {};
            for (const reading of readings) {
              if (reading.goal.id === 'energy') continue;
              others[reading.goal.id] = reading.state;
            }
            const row: Row = {
              contractId: contract.id,
              buildingId: contract.buildingId,
              dispatcherId,
              n,
              horizon,
              pairing,
              energyKJPerLeg: observations.workPerServedLegKJ,
              legs: recording.legs.length,
              arrived: observations.arrived,
              others,
            };
            rows.push(row);
            lines.push(JSON.stringify(row));
            writeFileSync(OUT, `${lines.join('\n')}\n`);
          }
        }
      }
    }
    expect(rows.length).toBeGreaterThan(0);
  }, 14_400_000);
});
