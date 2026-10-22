/**
 * `weekPool.ts` — wave AP, lane DT-1, swarm DT's ruling Q1 and Q2 items 1 to 3
 * ([§ D1459](../../../../DECISIONS.md) to [§ D1462](../../../../DECISIONS.md)), on the week as the
 * census measured it before § D1603 ([§ D1616](../../../../DECISIONS.md)).
 *
 * The gates and the dealer are arithmetic over the file, so they are asserted here over pools built
 * for the purpose on the tower's own cells (`poolCellsOf`), each arm against the pool that should
 * take it. The pool is asserted last: its cells are the tower's, and what it deals.
 *
 * **Why on `preD1603/`.** The tower's cells are the days of the order it deals from week 2. On the
 * fixed engine § D1616 holds `midtown-early-lift`, so Midtown deals no order, the pool has no cell
 * and these cases would have none to build on. Here `data/week-way.json`, `week-dominance.json`,
 * `week-pool.json` and `call-bands.json` are mocked by the files as they stood on `4ee9557`, the
 * engine before the fix, where the order is dealt and the pool was measured on its cells, so every
 * gate and the dealer are tested on real cells. The runs are on today's engine. `weekPool.test.ts`
 * pins the shipped, empty pool.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../data/week-way.json', () => vi.importActual('./preD1603/week-way.json'));
vi.mock('../../../../data/week-dominance.json', () => vi.importActual('./preD1603/week-dominance.json'));
vi.mock('../../../../data/week-pool.json', () => vi.importActual('./preD1603/week-pool.json'));
vi.mock('../../../../data/call-bands.json', () => vi.importActual('./preD1603/call-bands.json'));

import { recordRun } from '../record/recordRun.js';
import { shiftRunConfigOf } from '../dev/state.js';

import { contractBuildings, todaysScenarioDayState } from './contractDay.test-helper.js';
import { openWeek } from './week.js';
import { weekTopOf } from './weekLevels.js';
import { dealtCrowdOf, weekRecordFor } from './weekRecord.js';
import { weekKeepDaysLinesOf } from './poolWays.js';
import {
  needDaysAt,
  poolCellsOf,
  poolCrowdFor,
  poolCrowdSeedOf,
  poolDealOf,
  poolLevelReadingOf,
  poolTopOf,
  WEEK_POOL,
  type PoolCall,
  type PoolCrowd,
  type PoolTag,
  type WeekPool,
} from './weekPool.js';

const C2 = 'c2';
const PROFILES = WEEK_POOL.protocol.profiles;
const DATE = 20_261_013n;

/** A crowd's marks: `C` for the named profiles, `m` for every other. */
function marks(cleared: readonly string[]): string {
  return PROFILES.map((id) => (cleared.includes(id) ? 'C' : 'm')).join('');
}

interface Spec {
  readonly tag: PoolTag;
  readonly cleared: readonly string[];
  readonly calls?: readonly PoolCall[];
}

/** A pool over the tower's own cells, each cell's crowds from `crowdsOf(cellIndex, crowd)`. */
function poolOf(crowdsOf: (cell: number, crowd: number) => Spec, count = WEEK_POOL.protocol.crowdCount): WeekPool {
  const cells = poolCellsOf(C2);
  return {
    version: 1,
    protocol: WEEK_POOL.protocol,
    cells: cells.map((cell, at) => ({
      key: cell.key,
      orderId: cell.orderId,
      day: cell.day,
      eventId: cell.eventId,
      bookings: cell.bookings,
      banded: cell.banded,
      crowds: Array.from({ length: count }, (_, crowd): PoolCrowd => {
        const spec = crowdsOf(at, crowd);
        return {
          seed: poolCrowdSeedOf(cell, crowd).toString(),
          tag: spec.tag,
          alone: marks(spec.cleared),
          calls: spec.calls ?? [],
        };
      }),
    })),
  };
}

const BANDED = poolCellsOf(C2)[0]!.banded;

/**
 * The pool the gates should admit: thirty live crowds the two banded drivers clear and the standing
 * order misses, eight need crowds split between two answers and a brief pick, two dead ones.
 */
function admittable(cell: number, crowd: number): Spec {
  if (crowd < 30) return { tag: 'live', cleared: BANDED };
  if (crowd < 38) {
    const answer = ['eta', 'auction', 'pick'][(crowd + cell) % 3]!;
    if (answer === 'pick') return { tag: 'need', cleared: ['nearest-car'] };
    return {
      tag: 'need',
      cleared: [],
      calls: [{ by: BANDED[0]!, atS: 30_000, question: 'driver', offered: [answer, 'collective'], clears: [answer] }],
    };
  }
  return { tag: 'dead', cleared: [] };
}

describe('the gates over the pool as dealt — § D1461', () => {
  it('admits a pool with need crowds no single answer owns, and deals the least need days that hold DC-11', () => {
    const pool = poolOf(admittable);
    const reading = poolLevelReadingOf(C2, 2, pool);
    expect(reading?.verdict, reading?.because).toBe('admitted');
    expect(reading!.days.length).toBeGreaterThan(1);
    /* One need day leaves every banded driver the other counted days, which is the target: n = 2. */
    expect(reading!.needCount).toBe(2);
    expect(Math.max(...reading!.holds.map((hold) => hold.share ?? 1))).toBeLessThanOrEqual(0.5);
    expect(poolTopOf(C2, pool)).toBe(WEEK_POOL.protocol.throughWeek);
  });

  it('refuses a level no crowd of which needs a choice', () => {
    const pool = poolOf(() => ({ tag: 'live', cleared: BANDED }));
    const reading = poolLevelReadingOf(C2, 2, pool);
    expect(reading?.verdict).toBe('refused');
    expect(reading?.because).toMatch(/no crowd in its pool needs a choice/u);
    expect(poolTopOf(C2, pool)).toBe(1);
  });

  it('refuses a level one answer clears on more than two thirds of its need days (§ D1337)', () => {
    const pool = poolOf((cell, crowd) =>
      crowd < 30
        ? { tag: 'live', cleared: BANDED }
        : { tag: 'need', cleared: [], calls: [{ by: BANDED[0]!, atS: 30_000, question: 'driver', offered: ['eta', 'auction'], clears: ['eta'] }] },
    );
    const reading = poolLevelReadingOf(C2, 2, pool);
    expect(reading?.verdict).toBe('refused');
    expect(reading?.because).toMatch(/clears 100 % of its need days/u);
  });

  it('refuses a level whose standing order clears its days too often (DC-10)', () => {
    /* The standing order clears every live crowd and half the need ones, so it misses under a third. */
    const pool = poolOf((cell, crowd) => {
      if (crowd < 30) return { tag: 'live', cleared: [...BANDED, 'collective'] };
      if (crowd % 2 === 0) return { tag: 'need', cleared: ['collective'] };
      const answer = crowd % 4 === 1 ? 'eta' : 'auction';
      return { tag: 'need', cleared: [], calls: [{ by: BANDED[0]!, atS: 30_000, question: 'driver', offered: [answer, 'collective'], clears: [answer] }] };
    });
    const reading = poolLevelReadingOf(C2, 2, pool);
    expect(reading?.because).toMatch(/standing order, left alone, clears/u);
  });

  it('withdraws a level not measured on every crowd, and one whose live crowds lack a mark', () => {
    const short = poolOf(admittable, 12);
    expect(poolLevelReadingOf(C2, 2, short)?.verdict).toBe('unmeasured');
    expect(poolTopOf(C2, short)).toBe(1);
    const unfilled = poolOf(admittable);
    const blank: WeekPool = {
      ...unfilled,
      cells: unfilled.cells.map((cell) => ({
        ...cell,
        crowds: cell.crowds.map((crowd) =>
          crowd.tag === 'live' ? { ...crowd, alone: [...crowd.alone].map((mark, i) => (BANDED.includes(PROFILES[i]!) ? mark : '-')).join('') } : crowd,
        ),
      })),
    };
    expect(poolLevelReadingOf(C2, 2, blank)?.verdict).toBe('unmeasured');
  });
});

describe('the dealer — § D1460', () => {
  const pool = poolOf(admittable);

  it('never deals a dead crowd, deals a need crowd on each need day and the need count a week', () => {
    for (let closed = 0; closed < 6; closed += 1) {
      for (let date = 0n; date < 9n; date += 1n) {
        const reading = poolLevelReadingOf(C2, 2, pool)!;
        let needDays = 0;
        for (const entry of reading.days) {
          const deal = poolDealOf(C2, 2, entry.day, closed, DATE + date, pool);
          expect(deal, `day ${String(entry.day)}`).toBeDefined();
          expect(deal!.crowd.tag).not.toBe('dead');
          expect(deal!.crowd.tag).toBe(deal!.needDay ? 'need' : 'live');
          if (deal!.needDay) needDays += 1;
          expect(poolCrowdFor(C2, 2, entry.day, deal!.seed, pool)?.crowd).toEqual(deal!.crowd);
        }
        expect(needDays).toBe(reading.needCount);
      }
    }
  });

  it('moves the need days by the weeks closed, through every need-capable weekday', () => {
    const capable = poolLevelReadingOf(C2, 2, pool)!.needCapable;
    const starts = new Set(Array.from({ length: capable.length }, (_, closed) => needDaysAt(capable, 2, closed)[0]));
    expect(starts.size).toBe(capable.length);
  });

  it('is a pure index: one date, day and record meet one crowd, and the date moves it', () => {
    const day = poolLevelReadingOf(C2, 2, pool)!.days[0]!.day;
    const one = poolDealOf(C2, 2, day, 1, DATE, pool)!;
    expect(poolDealOf(C2, 2, day, 1, DATE, pool)!.seed).toBe(one.seed);
    const seen = new Set(Array.from({ length: 12 }, (_, i) => poolDealOf(C2, 2, day, 1, DATE + BigInt(i), pool)!.seed));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('deals nothing in week 1, on a tower it does not cover, or past an unadmitted level', () => {
    expect(poolDealOf(C2, 1, 1, 0, DATE, pool)).toBeUndefined();
    expect(poolDealOf('c7', 2, 1, 0, DATE, pool)).toBeUndefined();
    expect(poolDealOf(C2, 2, 1, 0, DATE, poolOf(() => ({ tag: 'live', cleared: BANDED })))).toBeUndefined();
  });
});

describe('DC-13 in days — § D1462', () => {
  it('states each banded driver’s keep band over the level as dealt, and nothing for a withdrawn one', () => {
    const pool = poolOf(admittable);
    const lines = weekKeepDaysLinesOf({ contractId: C2, week: 2 }, () => undefined, pool);
    expect(lines).toHaveLength(2);
    const reading = poolLevelReadingOf(C2, 2, pool)!;
    expect(lines[0]).toContain(`each of the ${String(reading.keep[0]!.of)} need-day crowds`);
    expect(lines[0]).toMatch(/cleared \d+ of them: about \d+ per cent of the counted days as dealt\.$/u);
    expect(weekKeepDaysLinesOf({ contractId: C2, week: 2 }, () => undefined, poolOf(admittable, 12))).toEqual([]);
  });
});

describe('a different pool crowd changes the run — the integration seam', () => {
  it('runs the day on the dealt crowd: two crowds of one cell give different legs', () => {
    const resources = contractBuildings();
    const cell = poolCellsOf(C2)[0]!;
    const legsOf = (crowd: number): string => {
      const { state } = todaysScenarioDayState(resources, C2, {
        seed: poolCrowdSeedOf(cell, crowd),
        over: { week: { ...openWeek(C2), week: cell.week, day: cell.day, dayIdx: cell.day - 1 }, campaignEventId: undefined },
      });
      const plan = shiftRunConfigOf(resources, state);
      const recording = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
      return JSON.stringify(recording.legs.slice(0, 200).map((leg) => [leg.arrivedAt, leg.originFloorId, leg.destinationFloorId]));
    };
    expect(legsOf(0)).not.toBe(legsOf(1));
  });
});

describe('the pool as measured before § D1603 — § D1459', () => {
  it('measures only cells the tower deals, in crowd order, with every crowd its own seed', () => {
    const keys = new Map(poolCellsOf(C2).map((cell) => [cell.key, cell]));
    for (const stored of WEEK_POOL.cells) {
      const cell = keys.get(stored.key);
      expect(cell, stored.key).toBeDefined();
      expect(stored.crowds.length).toBeLessThanOrEqual(WEEK_POOL.protocol.crowdCount);
      stored.crowds.forEach((crowd, index) => {
        expect(crowd.seed).toBe(poolCrowdSeedOf(cell!, index).toString());
        expect(crowd.alone).toHaveLength(PROFILES.length);
      });
    }
  });

  it('never deals week 4’s Monday the dead crowd 2026101313 on the booking that killed it', () => {
    /* The panel's sitting: three weeks closed on 13 October, the date's own crowd already filed. */
    const week = { ...openWeek(C2), week: 4, day: 1, dayIdx: 0 };
    const record = { ...weekRecordFor([], C2), closed: 3, dateCrowd: DATE.toString() };
    const dealt = dealtCrowdOf(week, record, DATE);
    const pooled = poolDealOf(C2, Math.min(4, weekTopOf(C2)), 1, 3, DATE);
    if (pooled !== undefined) {
      expect(dealt).toBe(pooled.seed);
      expect(dealt.toString()).not.toBe('2026101313');
      expect(pooled.crowd.tag).not.toBe('dead');
    } else {
      /* Withdrawn: the tower deals below week 3, the first level whose Monday carries the 08:00 booking. */
      expect(weekTopOf(C2)).toBeLessThan(3);
    }
  });
});
