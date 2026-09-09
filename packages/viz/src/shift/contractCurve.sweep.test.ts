/**
 * **The contract arm of `docs/33` § 6 — every contract's day-1 miss rate, on the shipped path.**
 * GitHub issue **#382**.
 *
 * `docs/33` § 4.2 published a table of day-1 miss rates and the instrument that produced it lived
 * nowhere: it was a measurement somebody took once and typed into a document. That is precisely the
 * shape `CLAUDE.md` records three failures of — *a published number goes stale the same way* — so
 * the rebalance this issue asks for begins by making the measurement re-runnable. This file is that
 * instrument. Nothing here is new arithmetic: it is § 4.2's own recipe, expressed against the
 * shipped modules rather than against a transcript of them.
 *
 * ## What it measures
 *
 * For each contract, on **day `d`** of that contract, over `n` seeds: *on how many seeds did the day
 * miss at least one of `goalsForDay`'s goals?* A day is **missed** when any reading is anything but
 * `met` — `week.ts#outcomeOf`'s own rule, *unjudged is not passed*, so a `pending` reading counts as
 * a miss exactly as it does in the product.
 *
 * DC-4's band is `[1/3, 2/3]` and it is **read**, never moved. This file asserts nothing about the
 * band at the always-on tier; it writes the table and the caller compares. The reason is § 6.4's:
 * eight contracts × thirty seeds is a compute job rather than a check, and a gate that took twenty
 * minutes on every PR would be deleted within a week.
 *
 * ## Why the run is built through `dev/state.ts#shiftRunConfigOf` and not assembled here
 *
 * The standing requirement in `docs/05-roadmap.md`: an instrument that does not reproduce the
 * shipped call path measures the instrument. `shiftRunConfigOf` is where growth, commissioning,
 * fit-out, the demand pattern, the calendar's day and the day's event compose, and every one of
 * those is a substrate `docs/33` DC-R1 admits. Rebuilding that composition here would produce a
 * number about a run no player can take. `scope/probes.test-helper.ts#legsOf` learned that the
 * expensive way — it dropped `outOfServiceCarIds` and reported a live control as inert — and the
 * same care is taken here: `plan.outOfServiceCarIds` is passed to `recordRun` beside the config.
 *
 * The goal horizon comes from `dayLength.ts#runHorizonOf` for the same reason. § 4.2's table was
 * taken with `goalsForDay(d)`'s default `'period'`; the product asks `runHorizonOf` first, and on a
 * building with an authored whole day that the window covers the worst-wait bar is scaled. Reading
 * the horizon the product reads is what keeps this a measurement of the game rather than of a
 * default argument.
 *
 * ## The five-goal question, resolved rather than caveated
 *
 * § 4.2's published table was taken when `goalsForDay` returned **four** goals; § D468 added the
 * energy bar and it returns **five**. § 4.3 says a figure quoted against DC-4 must say which set it
 * was taken over. This instrument takes it over **the shipped set**, whatever that is on the day it
 * runs, and prints the per-goal attribution beside every cell so the figure cannot be read without
 * seeing which bars did the missing. `CONTRACT_CURVE_GOALS=four` drops the energy bar, for the one
 * purpose of reproducing the historical row; it is not what the published figures are taken over.
 *
 * ## Seeds
 *
 * `20 260 824 + 7 919 n`, § 4.2's and § 4.6's, unchanged — so a cell measured here is comparable
 * with the two tables already published rather than merely similar to them. Common random numbers
 * across contracts are meaningless (different buildings, different traces) and none is claimed; what
 * the shared seed set buys is that *this* table and *that* one are about the same thirty days.
 *
 * ## Why it writes a file rather than printing
 *
 * `CLAUDE.md` records the trap: vitest 4 intercepts `console.log`, so a sweep whose deliverable is a
 * table cannot hand it back on stdout. `honesty/measure.corpus.test.ts` exists for exactly that
 * reason and this file follows it — `CONTRACT_CURVE_OUT` names the path, and the run is worthless
 * without one, so an absent path is a failure rather than a silent no-op.
 *
 * ## What it is not
 *
 * It compares no two configurations and calls neither better, so no paired interval is offered and
 * none is required — `docs/33` § 6.5's second prohibition, and the same disclaimer § 4.2 carries.
 * What is reported is a proportion with its `n`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';

import {
  buildingConfigOf,
  shiftDemandTemplateId,
  shiftLengthForContract,
  shiftRunConfigOf,
} from '../dev/state.js';
import type { BrowserResources } from '../dev/data.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { CONTRACTS } from './contracts.js';
import { runHorizonOf } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';

const SEEDS = Number(process.env['CONTRACT_CURVE_SEEDS'] ?? '30');
const DAYS = (process.env['CONTRACT_CURVE_DAYS'] ?? '1').split(',').map((value) => Number(value));

/** DC-4's band, read and never moved (`docs/33` § 4.3, § 7 O1). */
const DC4_BAND = Object.freeze({ lo: 1 / 3, hi: 2 / 3 });

/**
 * Every shipped building, not `probes.test-helper.ts`'s two — `legibility.sweep.test.ts`'s helper,
 * with the id list derived from the contracts rather than transcribed, so a contract that moves to
 * a new building cannot leave this sweep resolving the old one.
 */
function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')),
    );
    return {
      file: `${id}.json`,
      config,
      resolved: resolveBuilding(config, RESOURCES.elevatorSpecs),
    };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

/** One cell: how many of `seeds` missed at least one goal, and which goal did the missing. */
interface CurveCell {
  readonly contractId: string;
  readonly buildingId: string;
  readonly day: number;
  readonly missed: number;
  readonly seeds: number;
  /** Per goal id, on how many seeds that goal was not `met`. Attribution, so a fix has a target. */
  readonly byGoal: Record<string, number>;
  readonly meanArrivals: number;
  /** The arrival rate the cell ran at, or `undefined` for the building's own profile. */
  readonly rate: number | undefined;
}

function measureCell(
  resources: BrowserResources,
  contractId: string,
  buildingId: string,
  day: number,
  seeds: number,
  goalIds: readonly string[] | undefined,
  rate: number | undefined,
): CurveCell {
  let missed = 0;
  let arrivals = 0;
  const byGoal: Record<string, number> = {};
  for (let n = 0; n < seeds; n += 1) {
    const base = baseState();
    const state = {
      ...base,
      buildingId,
      dispatcherId: 'collective',
      shiftLengthS: shiftLengthForContract(contractId),
      seed: seedAt(n),
      campaignEventId: 'ordinary' as const,
      week: { ...base.week, contractId, day },
      /*
       * The rate-sensitivity arm, and it goes through **Free Play's own axis** rather than a private
       * one. `shiftRunConfigOf` reads `state.freePlay.arrivalRatePctPop5min` and writes it over the
       * pattern's demand, which is the same seam a contract's declared rate reaches the run by, so a
       * scan taken here is a scan of the thing the ladder moves. `demandTemplateId` is set to the
       * template the day would have run anyway (`shiftDemandTemplateId` with no override), so the
       * only field that moves is the rate — and `CONTRACT_CURVE_RATES` including the building's own
       * `typical` is what checks that: the cell must reproduce the no-override cell exactly.
       */
      ...(rate === undefined
        ? {}
        : {
            freePlay: {
              demandTemplateId: shiftDemandTemplateId(
                resources,
                { ...base, buildingId, shiftLengthS: shiftLengthForContract(contractId) },
                buildingConfigOf(resources, base.savedBuildings, buildingId),
              ),
              arrivalRatePctPop5min: rate,
            },
          }),
    };
    const plan = shiftRunConfigOf(resources, state);
    const recording = recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording;
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    arrivals += observations.arrived;
    const horizon = runHorizonOf(
      resources.trafficProfiles,
      buildingConfigOf(resources, state.savedBuildings, buildingId),
      state,
    );
    const all = goalsForDay(day, horizon);
    const goals = goalIds === undefined ? all : all.filter((goal) => goalIds.includes(goal.id));
    const readings = readGoals(goals, observations);
    let dayMissed = false;
    for (const reading of readings) {
      if (reading.state === 'met') continue;
      dayMissed = true;
      byGoal[reading.goal.id] = (byGoal[reading.goal.id] ?? 0) + 1;
    }
    if (dayMissed) missed += 1;
  }
  return {
    contractId,
    buildingId,
    day,
    missed,
    seeds,
    byGoal,
    meanArrivals: Math.round(arrivals / seeds),
    rate,
  };
}

describe.runIf(process.env['CONTRACT_CURVE_SWEEP'] === '1')(
  'the contract curve sweep — docs/33 § 4.2, issue #382',
  () => {
    it('writes each contract’s miss rate in the order a player meets them', () => {
      const out = process.env['CONTRACT_CURVE_OUT'];
      expect(out, 'CONTRACT_CURVE_OUT names the file the table is written to').toBeTypeOf('string');
      const resources = allBuildings();
      const goalIds =
        process.env['CONTRACT_CURVE_GOALS'] === 'four'
          ? (['carry', 'minute', 'queue', 'worst-wait'] as const)
          : undefined;
      const scan = process.env['CONTRACT_CURVE_RATES'];
      const rates: readonly (number | undefined)[] =
        scan === undefined ? [undefined] : scan.split(',').map((value) => Number(value));
      const only = process.env['CONTRACT_CURVE_ONLY'];
      const wanted =
        only === undefined ? CONTRACTS : CONTRACTS.filter((c) => only.split(',').includes(c.id));
      const rows: CurveCell[] = [];
      for (const day of DAYS) {
        for (const contract of wanted) {
          for (const rate of rates) {
            rows.push(
              measureCell(resources, contract.id, contract.buildingId, day, SEEDS, goalIds, rate),
            );
          }
        }
      }
      const lines: string[] = [
        '| contract | building | day | asked rate | missed | of | rate | in band | mean arrivals | by goal |',
        '|---|---|---|---|---|---|---|---|---|---|',
      ];
      for (const row of rows) {
        const rate = row.missed / row.seeds;
        const inBand = rate >= DC4_BAND.lo && rate <= DC4_BAND.hi;
        const attribution = Object.entries(row.byGoal)
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => `${id}=${String(count)}`)
          .join(' ');
        lines.push(
          `| ${row.contractId} | ${row.buildingId} | ${String(row.day)} | ${row.rate === undefined ? 'profile' : String(row.rate)} | ${String(row.missed)} | ${String(row.seeds)} | ${rate.toFixed(2)} | ${inBand ? 'yes' : 'NO'} | ${String(row.meanArrivals)} | ${attribution} |`,
        );
      }
      writeFileSync(String(out), `${lines.join('\n')}\n`);
      expect(rows.length).toBe(wanted.length * DAYS.length * rates.length);
    }, 14_400_000);
  },
);
