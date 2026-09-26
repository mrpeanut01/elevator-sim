/**
 * `shift/nextTower.ts` — a held week's close offers the next tower the census admits, and nothing
 * is locked (swarm DO § 3, lane AM-E, § D1259).
 *
 * The offer is read off a census, so most cases hand the module a census built here: the shipped
 * one plus rows that admit or refuse a named tower. That keeps the rule's arms checkable whatever
 * the shipped file happens to admit; the last block reads the shipped census itself.
 */

import { describe, expect, it } from 'vitest';

import { scheduledEventFor } from './calendar.js';
import { CONTRACTS } from './contracts.js';
import { growthPerDayOf, ladderRowFor } from './ladder.js';
import {
  earliestTargetDayOf,
  NEXT_TOWER_STAY_LABEL,
  nextAdmittedTowerAfter,
  nextTowerOfferOf,
  weekIsOffered,
  weekWasHeld,
} from './nextTower.js';
import { weekAdmitsANewcomer, weekDealOf } from './weekStake.js';
import { WEEK_WAY, type WeekWay, type WeekWayRow } from './weekWay.js';

const NAMES: Readonly<Record<string, string>> = {
  'midtown-office': 'Midtown Office',
  'chancery-house': 'Chancery House',
  ashgate: 'Ashgate',
  'harbour-point': 'Harbour Point',
};
const nameOf = (buildingId: string): string | undefined => NAMES[buildingId];

/** One weekday row, as dealt, for `contractId` at its ladder slope. */
function rowFor(contractId: string, day: number, admitted: boolean): WeekWayRow {
  const eventId = scheduledEventFor(null, day, day - 1, WEEK_WAY.protocol.horizon).id;
  return {
    contractId,
    day,
    eventId,
    growthPerDay: growthPerDayOf(ladderRowFor(contractId)),
    breather: false,
    chosen: { dispatcherId: 'predictive-balanced', press: '', atFraction: 0 },
    tuningClears: admitted ? 8 : 0,
    tuningN: 8,
    chosenVerdicts: (admitted ? 'C' : 'm').repeat(20),
    standingVerdicts: 'm'.repeat(10) + 'C'.repeat(10),
    queueOnlyMisses: 0,
    lowestPeakQueue: 5,
    screenRuns: 130,
  };
}

/**
 * The shipped census with `contractId`'s own rows replaced: days 1 to 5 as dealt, each admitted
 * where `admitted(day)` says so. Day 1 also carries its unwrinkled row, which is what makes the
 * tower *measured* (`weekDealOf`'s own test).
 */
function censusWith(towers: Readonly<Record<string, (day: number) => boolean>>): WeekWay {
  const kept = WEEK_WAY.rows.filter((row) => !(row.contractId in towers));
  const added: WeekWayRow[] = [];
  for (const [contractId, admitted] of Object.entries(towers)) {
    for (let day = 1; day <= 5; day += 1) {
      const row = rowFor(contractId, day, admitted(day));
      added.push(row);
      if (day === 1 && row.eventId !== 'ordinary') added.push({ ...row, eventId: 'ordinary' });
    }
  }
  return { ...WEEK_WAY, rows: [...kept, ...added] };
}

const EVERY_DAY = (): boolean => true;
const HELD = { yours: 4, target: 4 };

describe('a held week', () => {
  it('is one whose clean counted days met a target it had', () => {
    expect(weekWasHeld({ yours: 4, target: 4 })).toBe(true);
    expect(weekWasHeld({ yours: 5, target: 4 })).toBe(true);
    expect(weekWasHeld({ yours: 3, target: 4 })).toBe(false);
    /* A week that counted nothing had no target, and nothing to hold. */
    expect(weekWasHeld({ yours: 0, target: 0 })).toBe(false);
    expect(weekWasHeld(undefined)).toBe(false);
  });
});

describe('the next tower', () => {
  it('is the first tower after this one, in contract order and wrapping, whose week the census admits', () => {
    const census = censusWith({ c6: EVERY_DAY, c10: EVERY_DAY });
    expect(weekAdmitsANewcomer('c6', census)).toBe(true);
    /* The ladder's order, DC-6's: Chancery House is a rung below Midtown, Ashgate a rung above. */
    const order = CONTRACTS.map((contract) => contract.id);
    expect(order.indexOf('c6')).toBeLessThan(order.indexOf('c2'));
    expect(order.indexOf('c2')).toBeLessThan(order.indexOf('c10'));
    expect(nextAdmittedTowerAfter('c2', census)).toBe('c10');
    /* Past the top admitted rung it wraps to the lowest, and from there climbs again. */
    expect(nextAdmittedTowerAfter('c10', census)).toBe('c6');
    expect(nextAdmittedTowerAfter('c6', census)).toBe('c2');
    /* A refused tower's next is still an admitted one. */
    expect(nextAdmittedTowerAfter('c9', census)).toBe('c2');
    expect(nextAdmittedTowerAfter('no-such-contract', census)).toBeUndefined();
  });

  it('is held to the Thursday rule the first tower meets (§ D1180)', () => {
    /* Ashgate counting Monday to Wednesday only: target 2, met on Tuesday at the earliest. */
    const early = censusWith({ c6: EVERY_DAY, c10: (day) => day <= 3 });
    expect(weekAdmitsANewcomer('c10', early)).toBe(true);
    expect(earliestTargetDayOf('c10', early)).toBe(2);
    expect(weekIsOffered('c10', early)).toBe(false);
    expect(nextAdmittedTowerAfter('c2', early)).toBe('c6');
    /* Every weekday counted: target 4, met on Thursday at the earliest, and offered. */
    expect(earliestTargetDayOf('c6', early)).toBe(4);
    expect(weekIsOffered('c6', early)).toBe(true);
    /* Midtown, the first tower, meets it on the shipped census. */
    expect(weekIsOffered('c2')).toBe(true);
  });

  it('is never the tower itself, so a census admitting one tower offers nothing', () => {
    const only: WeekWay = { ...WEEK_WAY, rows: WEEK_WAY.rows.filter((row) => row.contractId !== 'c6' && row.contractId !== 'c10') };
    expect(CONTRACTS.filter((contract) => weekIsOffered(contract.id, only)).map((c) => c.id)).toEqual(['c2']);
    expect(nextAdmittedTowerAfter('c2', only)).toBeUndefined();
  });

  it('skips a tower the census refuses, and one it has not measured', () => {
    /* Ashgate measured with only Monday admitted: one counted day, a target of one, no room. */
    const census = censusWith({ c6: EVERY_DAY, c10: (day) => day === 1 });
    expect(weekDealOf('c10', census)?.counted).toBe(1);
    expect(weekAdmitsANewcomer('c10', census)).toBe(false);
    expect(nextAdmittedTowerAfter('c2', census)).toBe('c6');
    /* Unmeasured: no rows at all for Chancery House or Ashgate. */
    const bare: WeekWay = { ...WEEK_WAY, rows: WEEK_WAY.rows.filter((row) => row.contractId !== 'c6' && row.contractId !== 'c10') };
    expect(weekDealOf('c10', bare)).toBeUndefined();
    expect(nextTowerOfferOf('c2', HELD, nameOf, bare)).toBeUndefined();
  });
});

describe('the offer on the sheet', () => {
  const census = censusWith({ c6: EVERY_DAY, c10: EVERY_DAY });

  it('names the next tower, its counted days and its target, and keeps this tower open', () => {
    const offer = nextTowerOfferOf('c2', HELD, nameOf, census);
    const deal = weekDealOf('c10', census);
    expect(offer?.contractId).toBe('c10');
    expect(offer?.buildingId).toBe('ashgate');
    expect(offer?.label).toBe('Play Ashgate’s week');
    expect(offer?.stayLabel).toBe(NEXT_TOWER_STAY_LABEL);
    expect(offer?.line).toBe(
      'You held this week. Ashgate is the next tower whose week has been measured as it is ' +
        `dealt: ${String(deal?.counted)} of its days count, and its target is ${String(deal?.target)} clean. ` +
        'Midtown Office stays open, as every tower does, under This week’s tower on the front door.',
    );
  });

  it('is not made on a week that was not held, or that had no target', () => {
    expect(nextTowerOfferOf('c2', { yours: 3, target: 4 }, nameOf, census)).toBeUndefined();
    expect(nextTowerOfferOf('c2', { yours: 0, target: 0 }, nameOf, census)).toBeUndefined();
    expect(nextTowerOfferOf('c2', undefined, nameOf, census)).toBeUndefined();
  });

  it('never says a tower is locked or unlocked, in any arm it can draw', () => {
    const lines: string[] = [];
    for (const contract of CONTRACTS) {
      const offer = nextTowerOfferOf(contract.id, HELD, nameOf, census);
      if (offer !== undefined) lines.push(offer.label, offer.line, offer.stayLabel);
      /* Without a name the building id stands in, and the words are the same words. */
      const bare = nextTowerOfferOf(contract.id, HELD, () => undefined, census);
      if (bare !== undefined) lines.push(bare.label, bare.line);
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(/lock|earn|reward/iu);
  });
});

describe('the shipped census', () => {
  it('admits Chancery House’s and Ashgate’s weeks by § D1178 and offers neither, by § D1180 (§ D1258)', () => {
    /*
     * The census this lane ran: Chancery House counts Monday to Thursday, Ashgate Monday to
     * Wednesday, and both Fridays are refused as dealt. A target met before Thursday is the
     * week § D1180 refused for the first tower, so neither is the next step.
     */
    const counted = (id: string): number[] =>
      (weekDealOf(id)?.days ?? []).filter((day) => day.counts).map((day) => day.day);
    expect(counted('c6')).toEqual([1, 2, 3, 4]);
    expect(counted('c10')).toEqual([1, 2, 3]);
    expect([weekDealOf('c6')?.target, earliestTargetDayOf('c6')]).toEqual([3, 3]);
    expect([weekDealOf('c10')?.target, earliestTargetDayOf('c10')]).toEqual([2, 2]);
    for (const id of ['c6', 'c10']) {
      expect(weekAdmitsANewcomer(id), id).toBe(true);
      expect(weekIsOffered(id), id).toBe(false);
    }
    expect(CONTRACTS.filter((contract) => weekIsOffered(contract.id)).map((contract) => contract.id)).toEqual(['c2']);
    expect(nextAdmittedTowerAfter('c2')).toBeUndefined();
    expect(nextTowerOfferOf('c2', HELD, nameOf)).toBeUndefined();
    /* So Midtown is the next step from every other tower with a target, below it or above it. */
    for (const id of ['c6', 'c9', 'c10']) {
      const offer = nextTowerOfferOf(id, HELD, nameOf);
      expect(offer?.contractId, id).toBe('c2');
      expect(offer?.label, id).toBe('Play Midtown Office’s week');
    }
    /* Secure Tower's week counts no day, so it has no target and is never held. */
    expect(weekDealOf('c3')?.target).toBe(0);
  });

  it('offers, from a held Midtown week, only a tower whose week it admits', () => {
    const offer = nextTowerOfferOf('c2', HELD, nameOf);
    if (offer === undefined) {
      expect(nextAdmittedTowerAfter('c2')).toBeUndefined();
      return;
    }
    expect(weekAdmitsANewcomer(offer.contractId)).toBe(true);
    expect(weekIsOffered(offer.contractId)).toBe(true);
    const deal = weekDealOf(offer.contractId);
    expect(deal !== undefined && deal.target < deal.counted).toBe(true);
    expect(earliestTargetDayOf(offer.contractId) ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('never offers Harbour Point or Secure Tower, and from them offers only an offered week', () => {
    for (const id of ['c3', 'c9']) {
      expect(weekIsOffered(id)).toBe(false);
      const next = nextAdmittedTowerAfter(id);
      if (next !== undefined) expect(weekIsOffered(next)).toBe(true);
    }
  });
});
