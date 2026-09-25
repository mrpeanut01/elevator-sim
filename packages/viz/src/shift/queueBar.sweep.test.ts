/**
 * **The queue bar at the horizon the day actually runs** — [§ D1085](../../../../DECISIONS.md),
 * under [§ D468](../../../../DECISIONS.md)'s protocol and [§ D106](../../../../DECISIONS.md)'s check.
 *
 * Gated on `QUEUE_BAR_SWEEP=1`, for `energyBar.sweep.test.ts`'s reason: thirteen contracts of
 * ten-hour days is a compute job rather than a check. `queueBar.test.ts` pins one crowd at both
 * horizons on every run; this file is what re-derives the ruling when a building, a rung, a demand
 * template or the ladder moves. Unlike its energy sibling it **asserts** the ruling's four claims
 * rather than only writing rows, because § D1085 kept a bar on a measurement and a measurement that
 * moves should say so in red.
 *
 * ## The cell
 *
 * § D962's: every contract `shift/dayLength.ts#wholeDayFor` admits, day 1, ordinary, seeds
 * `20 260 824 + 7 919 n`, each tower as its contract hands it over (`contractDay.test-helper.ts`,
 * issue #584). Each seed runs **twice**, as the contract's own slice and as the whole authored day
 * Today's scenario plays, so every difference below is paired under common random numbers.
 *
 * ## What it asserts, and the figure § D1085 recorded for each
 *
 * `derive` (the first case):
 *
 * 1. **The pool is derived, never listed**: the contracts whose whole-day queue verdict at the
 *    day-1 bar is **not decided by the building**, meaning at least one seed meets and at least one
 *    misses. The six game contracts `c2`, `c3`, `c4`, `c6`, `c9`, `c10` on the ruling's tree; `c5`
 *    and the six reference towers missed on every seed measured and are the building's verdict
 *    (`docs/33` O2, #234), and pooling them is what returns a bar of 271 people.
 * 2. **The shipped day-1 bar refuses one third of pooled whole days, to within 1.96 standard
 *    errors** of a one-third proportion. Recorded: 52 of 150, **34.7 %**, inside 25.8 to 40.9 %,
 *    against a pooled two-thirds point of **34.00**.
 * 3. **The pooled five-goal day-miss rate sits in `docs/33` DC-4's band**, one third to two thirds.
 *    Recorded: **52.7 %**.
 * 4. **The paired whole − slice interval on the peak does not lie wholly above zero.** Recorded:
 *    **−1.63 [−4.03, +0.76]** people over 150 pairs, the whole day deeper on 62. If a later tree
 *    makes the whole day reliably deeper, the horizon question § D1085 closed is open again and
 *    this case is where it says so.
 *
 * `d106` (the second case), on the contracts `QUEUE_BAR_D106_CONTRACTS` names (`c6` and `c9`, the
 * two the honesty member measured), all thirteen shipped dispatchers, the whole day:
 *
 * 5. **The arm that drives least does not win the queue goal**: the arm with the lowest median
 *    work per delivered leg meets it on fewer seeds than `collective` (recorded: `nearest-car`,
 *    **0 of 25** on both, against 16 and 16), and stacks deeper than `collective` at the median.
 * 6. **No arm that meets the goal more often than `collective` carries fewer people doing it**,
 *    which is the perverse route § D106 exists to close, asked of this bar directly. Recorded:
 *    every arm carried 100 % on every seed.
 *
 * ## Budget, stated rather than implied
 *
 * `derive` at 25 seeds is 650 runs. Priced off the engineering member's per-run wall clock on this
 * container **under load 20 to 125** (§ D1085): the six game contracts' whole days at 3.5 to 15 s
 * and their slices under 1.5 s, about **25 minutes**; `vertical-city` at about 55 s a pair, about
 * **23 minutes**; and the six reference towers at 59 to 430 s a whole day, about **11 hours**, which
 * is nearly all of it. That is why the case is annotated at six hours and why
 * `QUEUE_BAR_CONTRACTS` exists: `QUEUE_BAR_CONTRACTS=c2,c3,c4,c6,c9,c10` runs the game pool
 * alone and reproduces every recorded figure above exactly: lane AJ-F ran it on 2026-09-25 with
 * `QUEUE_BAR_D106_SEEDS=10`, at load 14 to 25 on this container, and read 150 whole days, 52
 * refused (34.7 %), a two-thirds point of 34, a day-miss rate of 52.7 % and a paired interval of
 * −1.63 [−4.03, +0.76] with 62 deeper, both cases green, **2 241 s** for the two together. A
 * restricted run derives the pool from what it ran and **names what it did not run** in its summary
 * row, so a partial figure cannot read as the whole. `d106` at 25 seeds is 650 whole days on two
 * office towers; at 10 seeds that run read `nearest-car` meeting the queue goal on 0 of 10 on both
 * towers against `collective`'s 7, with every arm carrying the same 34 986 and 39 716 riders. No
 * quiet-box figure was taken for either case.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, contractDayState, todaysScenarioDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { runHorizonOf, wholeDayFor } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import type { RunHorizon } from './types.js';

const SEEDS = Number(process.env['QUEUE_BAR_SEEDS'] ?? '25');
const D106_SEEDS = Number(process.env['QUEUE_BAR_D106_SEEDS'] ?? String(SEEDS));
const ONLY = process.env['QUEUE_BAR_CONTRACTS'];
const D106_CONTRACTS = (process.env['QUEUE_BAR_D106_CONTRACTS'] ?? 'c6,c9').split(',');
const OUT = process.env['QUEUE_BAR_OUT'] ?? '/tmp/queue-bar.jsonl';

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

interface Row {
  readonly arm: 'derive' | 'd106';
  readonly contractId: string;
  readonly dispatcherId: string;
  readonly n: number;
  readonly horizon: RunHorizon;
  readonly peakQueue: number;
  readonly arrived: number;
  readonly carried: number;
  readonly carryPct: number;
  readonly energyKJPerLeg: number | undefined;
  /** Goal id → `met` / `missed` / `pending`, all five, graded at day 1 on the run's own horizon. */
  readonly goals: Readonly<Record<string, string>>;
}

const lines: string[] = [];
function write(entry: object): void {
  lines.push(JSON.stringify(entry));
  writeFileSync(OUT, `${lines.join('\n')}\n`);
}

function grade(
  resources: BrowserResources,
  arm: Row['arm'],
  contractId: string,
  n: number,
  state: ViewerState,
): Row {
  const plan = shiftRunConfigOf(resources, state);
  const { recording } = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    resources.trafficProfiles,
    buildingConfigOf(resources, state.savedBuildings, state.buildingId),
    state,
  );
  const goals: Record<string, string> = {};
  for (const reading of readGoals(goalsForDay(1, horizon), observations)) {
    goals[reading.goal.id] = reading.state;
  }
  const row: Row = {
    arm,
    contractId,
    dispatcherId: state.dispatcherId,
    n,
    horizon,
    peakQueue: observations.peakQueue,
    arrived: observations.arrived,
    carried: observations.carried,
    carryPct: observations.carryPct,
    energyKJPerLeg: observations.workPerServedLegKJ,
    goals,
  };
  write(row);
  return row;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? NaN) : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
};

/** The pooled two-thirds point, linear between order statistics — the reading § D468 publishes. */
const twoThirdsPoint = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * (2 / 3);
  const lo = sorted[Math.floor(at)] ?? NaN;
  const hi = sorted[Math.ceil(at)] ?? NaN;
  return lo + (hi - lo) * (at - Math.floor(at));
};

/**
 * A two-sided 95 % paired-t interval. The quantile is the Cornish–Fisher first-order expansion
 * about 1.96, which is within 0.001 of the table at the thirty-plus pairs this file refuses to go
 * below; `viz` may not import `experiments`' statistics, and a table transcribed here would be a
 * second copy of a published figure.
 */
function pairedInterval(differences: readonly number[]): { mean: number; lo: number; hi: number } {
  const n = differences.length;
  const mean = differences.reduce((sum, d) => sum + d, 0) / n;
  const variance = differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (n - 1);
  const z = 1.959_964;
  const t = z + (z ** 3 + z) / (4 * (n - 1));
  const half = (t * Math.sqrt(variance)) / Math.sqrt(n);
  return { mean, lo: mean - half, hi: mean + half };
}

const wholeDayContracts = (resources: BrowserResources): readonly string[] =>
  CONTRACTS.filter((contract) => {
    const entry = resources.entries.find((one) => one.file === `${contract.buildingId}.json`);
    return wholeDayFor(resources.trafficProfiles, entry?.config) !== undefined;
  }).map((contract) => contract.id);

describe.runIf(process.env['QUEUE_BAR_SWEEP'] === '1')('the queue bar over a whole day — § D1085', () => {
  it('derive: one ladder grades the whole day on § D468’s line, inside DC-4, and no harder than the slice', () => {
    const resources = contractBuildings();
    const admitted = wholeDayContracts(resources);
    const ran = admitted.filter((id) => ONLY === undefined || ONLY.split(',').includes(id));
    const slice = new Map<string, Row>();
    const whole = new Map<string, Row>();
    for (const contractId of ran) {
      for (let n = 0; n < SEEDS; n += 1) {
        const seed = seedAt(n);
        slice.set(`${contractId}/${String(n)}`, grade(resources, 'derive', contractId, n, contractDayState(contractId, { seed })));
        const day = todaysScenarioDayState(resources, contractId, { seed });
        expect(day.horizon, contractId).toBe('whole-day');
        whole.set(`${contractId}/${String(n)}`, grade(resources, 'derive', contractId, n, day.state));
      }
    }

    // 1. The pool: the contracts whose whole-day queue verdict the building does not decide.
    const wholeOf = (id: string): Row[] => [...whole.values()].filter((row) => row.contractId === id);
    const pool = ran.filter((id) => {
      const misses = wholeOf(id).filter((row) => row.goals['queue'] === 'missed').length;
      return misses > 0 && misses < wholeOf(id).length;
    });
    const pooled = pool.flatMap(wholeOf);
    const n = pooled.length;

    // 2. § D468's line: the shipped bar refuses one third, to within 1.96 standard errors.
    const refused = pooled.filter((row) => row.goals['queue'] === 'missed').length / n;
    const se = Math.sqrt((1 / 3) * (2 / 3) / n);
    // 3. DC-4: the five-goal day misses between one third and two thirds of pooled whole days.
    const dayMissed =
      pooled.filter((row) => Object.values(row.goals).some((state) => state === 'missed')).length / n;
    // 4. Paired whole − slice on the peak, over the pool's pairs.
    const differences = pool.flatMap((id) =>
      Array.from({ length: SEEDS }, (_, k) => {
        const key = `${id}/${String(k)}`;
        return (whole.get(key)?.peakQueue ?? NaN) - (slice.get(key)?.peakQueue ?? NaN);
      }),
    );
    const interval = pairedInterval(differences);

    write({
      summary: 'derive',
      ran,
      notRun: admitted.filter((id) => !ran.includes(id)),
      decidedByTheBuilding: ran.filter((id) => !pool.includes(id)),
      pool,
      n,
      refused,
      band: [1 / 3 - 1.96 * se, 1 / 3 + 1.96 * se],
      twoThirdsPoint: twoThirdsPoint(pooled.map((row) => row.peakQueue)),
      dayMissed,
      paired: interval,
      wholeDeeper: differences.filter((d) => d > 0).length,
    });

    expect(pool.length, 'a pool of fewer than two contracts is not a pool').toBeGreaterThanOrEqual(2);
    expect(n, 'the interval below needs thirty pairs').toBeGreaterThanOrEqual(30);
    expect(Math.abs(refused - 1 / 3), `refused ${refused.toFixed(3)} at n = ${String(n)}`).toBeLessThanOrEqual(1.96 * se);
    expect(dayMissed).toBeGreaterThanOrEqual(1 / 3);
    expect(dayMissed).toBeLessThanOrEqual(2 / 3);
    expect(
      interval.lo,
      `whole − slice ${interval.mean.toFixed(2)} [${interval.lo.toFixed(2)}, ${interval.hi.toFixed(2)}]`,
    ).toBeLessThanOrEqual(0);
  }, 21_600_000);

  it('d106: the arm that drives least loses the queue goal, and nobody wins it by carrying fewer', () => {
    const resources = contractBuildings();
    const dispatcherIds = resources.dispatcherProfiles.profiles.map((profile) => profile.id);
    expect(dispatcherIds).toContain('collective');
    expect(dispatcherIds).toContain('nearest-car');
    for (const contractId of D106_CONTRACTS) {
      const byArm = new Map<string, Row[]>();
      for (const dispatcherId of dispatcherIds) {
        const rows: Row[] = [];
        for (let n = 0; n < D106_SEEDS; n += 1) {
          const day = todaysScenarioDayState(resources, contractId, { seed: seedAt(n), dispatcherId });
          expect(day.horizon, contractId).toBe('whole-day');
          rows.push(grade(resources, 'd106', contractId, n, day.state));
        }
        byArm.set(dispatcherId, rows);
      }
      const met = (id: string): number =>
        (byArm.get(id) ?? []).filter((row) => row.goals['queue'] === 'met').length;
      const carried = (id: string): number =>
        (byArm.get(id) ?? []).reduce((sum, row) => sum + row.carried, 0);
      const medianOf = (id: string, read: (row: Row) => number): number =>
        median((byArm.get(id) ?? []).map(read));
      const energyOf = (row: Row): number => row.energyKJPerLeg ?? Number.POSITIVE_INFINITY;
      const leastWork = [...byArm.keys()].reduce((best, id) =>
        medianOf(id, energyOf) < medianOf(best, energyOf) ? id : best,
      );

      write({
        summary: 'd106',
        contractId,
        leastWork,
        arms: Object.fromEntries(
          [...byArm.keys()].map((id) => [
            id,
            {
              queueMet: met(id),
              medianPeak: medianOf(id, (row) => row.peakQueue),
              medianEnergy: medianOf(id, energyOf),
              carried: carried(id),
            },
          ]),
        ),
      });

      // 5. The arm that drives least does not win this goal, and stacks deeper doing it.
      expect(met(leastWork), `${contractId}: ${leastWork} meets the queue goal`).toBeLessThan(met('collective'));
      expect(medianOf(leastWork, (row) => row.peakQueue)).toBeGreaterThan(
        medianOf('collective', (row) => row.peakQueue),
      );
      expect(met('nearest-car')).toBeLessThan(met('collective'));
      // 6. No arm meets it more often than `collective` while carrying fewer people.
      for (const id of byArm.keys()) {
        if (met(id) <= met('collective')) continue;
        expect(carried(id), `${contractId}: ${id} beats collective on the queue`).toBeGreaterThanOrEqual(
          carried('collective'),
        );
      }
    }
  }, 7_200_000);
});
