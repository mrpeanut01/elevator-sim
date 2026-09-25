/**
 * **The week census, held to its own claims** — `docs/33` DC-10, [§ D1067](../../../../DECISIONS.md).
 *
 * `shift/weekWay.sweep.test.ts` is the instrument and runs by hand; this file runs on every suite
 * and asserts what can be asserted without re-running the census:
 *
 * - the shipped census is well formed, current (every row measured at the slope the ladder grows
 *   its tower at now) and complete (every whole-day tower's weekdays are measured or named as not);
 * - the interval and the admission rule are the arithmetic `docs/33` states;
 * - **one held-out crowd of one shipped row is re-run** on the product's chain and must reproduce
 *   the recorded verdicts, so a row cannot outlive a change to the building, the day's template,
 *   the dispatchers or the bars without this file going red;
 * - the brief's sentence is drawn exactly where a measured day fails, says what was measured, and
 *   gives no advice.
 */

import { describe, expect, it } from 'vitest';

import { buildingConfigOf, shiftRunConfigOf } from '../dev/state.js';

import { contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { wholeDayFor } from './dayLength.js';
import { growthFactor, scaledBuilding } from './growth.js';
import { CONTRACT_LADDER, growthPerDayOf, ladderRowFor, ladderTowerConfig } from './ladder.js';
import { openWeek } from './week.js';
import {
  clopperPearsonLower,
  crowdDates,
  dc10Of,
  parseWeekWay,
  wayThroughSentenceOf,
  WEEK_WAY,
  weekWayIssues,
  type WeekWay,
  type WeekWayRow,
} from './weekWay.js';
import { crowdSeeds, WEEK_WAY_RESOURCES as resources, weekWayCell } from './weekWay.test-helper.js';

/** The contracts whose Scenario day is a whole authored day — the towers DC-10 speaks about. */
const WHOLE_DAY = CONTRACTS.filter(
  (contract) =>
    wholeDayFor(resources.trafficProfiles, buildingConfigOf(resources, [], contract.buildingId)) !==
    undefined,
).map((contract) => contract.id);

describe('the shipped census', () => {
  it('is well formed and current against the ladder', () => {
    expect(weekWayIssues(WEEK_WAY)).toEqual([]);
  });

  it('measures every weekday of every whole-day tower, or names the tower and why not', () => {
    const measured = new Set(WEEK_WAY.rows.map((row) => row.contractId));
    const unmeasured = new Set(WEEK_WAY.unmeasured.map((entry) => entry.contractId));
    for (const id of WHOLE_DAY) {
      expect(measured.has(id) || unmeasured.has(id), `${id} is neither measured nor named`).toBe(true);
      expect(measured.has(id) && unmeasured.has(id), `${id} is both`).toBe(false);
      if (measured.has(id)) {
        for (const day of [1, 2, 3, 4, 5]) {
          expect(
            WEEK_WAY.rows.some((row) => row.contractId === id && row.day === day && row.eventId === 'ordinary'),
            `${id} day ${String(day)}`,
          ).toBe(true);
        }
      }
    }
    for (const entry of WEEK_WAY.unmeasured) {
      expect(WHOLE_DAY, entry.contractId).toContain(entry.contractId);
      expect(entry.reason.length, entry.contractId).toBeGreaterThan(20);
    }
  });

  it('keeps its held-out crowds apart from its tuning crowds', () => {
    const p = WEEK_WAY.protocol;
    const tuning = new Set(crowdDates(p.tuningFrom, p.tuningCount));
    for (const date of crowdDates(p.heldOutFrom, p.heldOutCount)) expect(tuning.has(date)).toBe(false);
  });

  it('re-runs one held-out crowd of the first measured row and reproduces both verdicts', () => {
    /*
     * A census row is a claim about the product's chain on the day it was taken. Re-running every
     * crowd of every row is `weekWay.verify.test.ts`'s weekly job; re-running one crowd of one row
     * here is what stops the file aging silently — the week's template, a dispatcher, a rung or the
     * bars moving under it turns this red on the next suite run rather than on the next census.
     */
    const row = WEEK_WAY.rows[0];
    expect(row, 'the census carries at least one row').toBeDefined();
    if (row === undefined) return;
    const seed = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, 1)[0] ?? 0n;
    const scheduled = row.eventId !== 'ordinary';
    const verdictOf = (dispatcherId: string, press: string, atFraction: number): string =>
      weekWayCell(row.contractId, row.day, seed, { dispatcherId, press, atFraction }, scheduled).cleared ? 'C' : 'm';
    expect(verdictOf(row.chosen.dispatcherId, row.chosen.press, row.chosen.atFraction)).toBe(
      row.chosenVerdicts[0],
    );
    expect(verdictOf(WEEK_WAY.protocol.standingOrder, '', 0)).toBe(row.standingVerdicts[0]);
  });
});

describe('a re-derived slope reaches the run (§ D1066)', () => {
  it('grows each rung that declares a slope by that slope, and not by the default', () => {
    /*
     * The standing requirement: move the control and require the run to change. The control is a
     * rung's `growthPerDay`; the run's building on day 5 must carry the rung's population and not the
     * default's. Compared on the resolved population the kernel is handed, which is what growth
     * writes and all it writes.
     */
    const rungs = CONTRACT_LADDER.rows.filter((row) => row.growthPerDay !== undefined);
    for (const rung of rungs) {
      const authored = buildingConfigOf(resources, [], rung.buildingId);
      if (authored === undefined) throw new Error(rung.buildingId);
      const state = contractDayState(rung.contractId, {
        seed: 20_261_001n,
        over: { week: { ...openWeek(rung.contractId), day: 5, dayIdx: 4 } },
      });
      const run = shiftRunConfigOf(resources, state).building.totalPopulation;
      const handed = ladderTowerConfig(authored, rung.contractId, resources.elevatorSpecs);
      const expected = scaledBuilding(handed, growthFactor(5, growthPerDayOf(rung))).totalPopulation;
      const atDefault = scaledBuilding(
        handed,
        growthFactor(5, CONTRACT_LADDER.defaultGrowthPerDay),
      ).totalPopulation;
      expect(run, rung.contractId).toBe(expected);
      if (growthPerDayOf(rung) !== CONTRACT_LADDER.defaultGrowthPerDay) {
        expect(run, rung.contractId).not.toBe(atDefault);
      }
    }
  });
});

describe('the interval and the rule', () => {
  it('is the two-sided Clopper–Pearson lower bound', () => {
    expect(clopperPearsonLower(0, 10, 0.95)).toBe(0);
    expect(clopperPearsonLower(24, 50, 0.95)).toBeCloseTo(0.3366, 4);
    expect(clopperPearsonLower(12, 20, 0.95)).toBeCloseTo(0.3605, 4);
    expect(clopperPearsonLower(11, 20, 0.95)).toBeLessThan(1 / 3);
    expect(clopperPearsonLower(20, 20, 0.95)).toBeCloseTo(0.8316, 4);
  });

  it('admits a day on both halves, and a breather on the first alone', () => {
    const p = WEEK_WAY.protocol;
    const base: WeekWayRow = {
      contractId: 'c2',
      day: 3,
      eventId: 'ordinary',
      growthPerDay: 0,
      breather: false,
      chosen: { dispatcherId: 'eta', press: '', atFraction: 0 },
      tuningClears: 8,
      tuningN: 8,
      chosenVerdicts: 'C'.repeat(12) + 'm'.repeat(8),
      standingVerdicts: 'C'.repeat(10) + 'm'.repeat(10),
      queueOnlyMisses: 0,
      lowestPeakQueue: 20,
      screenRuns: 130,
    };
    expect(dc10Of(base, p).admitted).toBe(true);
    expect(dc10Of(base, p).queueBar).toBe(28);
    /* The queue gate: no screened play met day 3's bar of 28, so the day is not admitted. */
    expect(dc10Of({ ...base, lowestPeakQueue: 29 }, p).queueFeasible).toBe(false);
    expect(dc10Of({ ...base, lowestPeakQueue: 29 }, p).admitted).toBe(false);
    expect(dc10Of({ ...base, lowestPeakQueue: 28 }, p).queueFeasible).toBe(true);
    expect(dc10Of({ ...base, chosenVerdicts: 'C'.repeat(11) + 'm'.repeat(9) }, p).wayThrough).toBe(false);
    const easy = { ...base, standingVerdicts: 'C'.repeat(15) + 'm'.repeat(5) };
    expect(dc10Of(easy, p).asksSomething).toBe(false);
    expect(dc10Of({ ...easy, breather: true }, p).admitted).toBe(true);
  });

  it('counts crowds as consecutive dates across a month and a year', () => {
    expect(crowdDates('2026-12-30', 4)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(crowdDates('2028-02-28', 2)).toEqual(['2028-02-28', '2028-02-29']);
    expect(crowdSeeds('2026-10-01', 1)).toEqual([20_261_001n]);
  });
});

describe('the brief’s sentence on a day that fails DC-10', () => {
  /** A census with one row per case, at the ladder's current slope so it is not stale. */
  const censusWith = (rows: readonly Partial<WeekWayRow>[]): WeekWay =>
    parseWeekWay({
      version: 1,
      protocol: { ...WEEK_WAY.protocol },
      rows: rows.map((row) => ({
        contractId: 'c2',
        day: 4,
        eventId: 'ordinary',
        growthPerDay: growthPerDayOf(ladderRowFor('c2')),
        breather: false,
        chosen: { dispatcherId: 'fairness-first', press: '', atFraction: 0 },
        tuningClears: 1,
        tuningN: 8,
        chosenVerdicts: 'm'.repeat(20),
        standingVerdicts: 'm'.repeat(20),
        queueOnlyMisses: 0,
        lowestPeakQueue: 20,
        screenRuns: 130,
        ...row,
      })),
      unmeasured: [],
    });
  const input = {
    contractId: 'c2',
    day: 4,
    eventId: 'ordinary',
    hasCalendar: false,
    horizon: 'whole-day' as const,
  };

  it('says nothing was found when nothing cleared, with the count of crowds', () => {
    expect(wayThroughSentenceOf(input, censusWith([{}]))).toBe(
      'No standing order or press we measured cleared this day on 20 crowds.',
    );
  });

  it('gives the best configuration’s count when it cleared some but too few', () => {
    const census = censusWith([{ chosenVerdicts: 'C'.repeat(5) + 'm'.repeat(15) }]);
    expect(wayThroughSentenceOf(input, census)).toBe(
      'The best standing order or press we found cleared this day on 5 of 20 crowds.',
    );
  });

  it('says how often the standing order clears a day that asks too little', () => {
    const census = censusWith([{ chosenVerdicts: 'C'.repeat(20), standingVerdicts: 'C'.repeat(18) + 'mm' }]);
    expect(wayThroughSentenceOf(input, census)).toBe(
      'The tower’s standing order, left alone, cleared this day on 18 of 20 crowds we measured.',
    );
  });

  it('names the difference when the census measured the day without today’s wrinkle', () => {
    const sentence = wayThroughSentenceOf({ ...input, eventId: 'conference:full-floor' }, censusWith([{}]));
    expect(sentence).toBe(
      'Measured on this day of the week without today’s wrinkle: no standing order or press we ' +
        'measured cleared this day on 20 crowds.',
    );
  });

  it('names the queue goal when no screened play kept the landings under its bar', () => {
    const census = censusWith([{ lowestPeakQueue: 31, chosenVerdicts: 'C'.repeat(16) + 'm'.repeat(4) }]);
    expect(wayThroughSentenceOf(input, census)).toBe(
      'No standing order or press we measured kept every landing to 26 people or fewer on this day: ' +
        'the fewest any of 130 runs reached was 31.',
    );
  });

  it('draws nothing on an admitted day, a stale row, a calendar week, another horizon or an unmeasured day', () => {
    const admitted = censusWith([
      { chosenVerdicts: 'C'.repeat(16) + 'm'.repeat(4), standingVerdicts: 'C'.repeat(5) + 'm'.repeat(15) },
    ]);
    expect(wayThroughSentenceOf(input, admitted)).toBeUndefined();
    expect(wayThroughSentenceOf(input, censusWith([{ growthPerDay: 0.109 }]))).toBeUndefined();
    expect(wayThroughSentenceOf({ ...input, hasCalendar: true }, censusWith([{}]))).toBeUndefined();
    expect(wayThroughSentenceOf({ ...input, horizon: 'period' }, censusWith([{}]))).toBeUndefined();
    expect(wayThroughSentenceOf({ ...input, day: 9 }, censusWith([{}]))).toBeUndefined();
  });

  it('keeps a day-1 row current at any slope, because day 1 is the building as handed', () => {
    const dayOne = { day: 1, growthPerDay: 0.109 };
    expect(wayThroughSentenceOf({ ...input, day: 1 }, censusWith([dayOne]))).toBe(
      'No standing order or press we measured cleared this day on 20 crowds.',
    );
    expect(weekWayIssues(censusWith([dayOne])).filter((issue) => issue.includes('re-run'))).toEqual([]);
    expect(weekWayIssues(censusWith([{ growthPerDay: 0.109 }])).some((issue) => issue.includes('re-run'))).toBe(true);
  });

  it('gives no advice in any arm — a measurement licenses no *do this tomorrow*', () => {
    const arms = [
      censusWith([{}]),
      censusWith([{ chosenVerdicts: 'C'.repeat(5) + 'm'.repeat(15) }]),
      censusWith([{ chosenVerdicts: 'C'.repeat(20), standingVerdicts: 'C'.repeat(20) }]),
      censusWith([{ lowestPeakQueue: 40 }]),
    ];
    for (const census of arms) {
      const sentence = wayThroughSentenceOf(input, census) ?? '';
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).not.toMatch(/tomorrow|\btry\b|should|better|instead|next time/i);
    }
  });
});
