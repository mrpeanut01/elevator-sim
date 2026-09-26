/**
 * `shift/scoredCrowd.ts` — which crowd a scored day belongs to, wave AK, § D1141.
 */

import { describe, expect, it } from 'vitest';

import { pressDayFor } from './ladder.js';
import { crowdIsShared, crowdMakesPractice } from './scoredCrowd.js';
import { openWeek, outcomeOf, REPLAY_CONTRACT_ID, RUSH_CONTRACT_ID } from './week.js';
import type { DayOutcome } from './types.js';
import type { WatchRecord } from '../watch/types.js';
import { CONTRACTS } from './contracts.js';

const DATE = 20_260_925n;

describe('a scored day belongs to its shared crowd — § D1141', () => {
  it('shares the date’s crowd and a pinned crowd, and nothing else', () => {
    const pinned = CONTRACTS.find((contract) => pressDayFor(contract.id) !== undefined);
    if (pinned === undefined) throw new Error('some contract pins a day');
    const pin = BigInt(pressDayFor(pinned.id)?.seedText ?? '0');
    expect(crowdIsShared(pinned.id, DATE, DATE)).toBe(true);
    expect(crowdIsShared(pinned.id, pin, DATE)).toBe(true);
    expect(crowdIsShared(pinned.id, 777n, DATE)).toBe(false);
    /* No clock: only the pin is known to be shared. */
    expect(crowdIsShared(pinned.id, DATE, undefined)).toBe(false);
    expect(crowdIsShared(pinned.id, pin, undefined)).toBe(true);
  });

  it('lets a link’s crowd begin a week and never enter one under way — the panel’s two paths', () => {
    const day = (n: number, seed: bigint | null): DayOutcome =>
      outcomeOf({
        day: n, dayIdx: n - 1, eventId: 'ordinary', readings: [], minutePct: 80, carried: 10, arrived: 10,
        record: seed === null ? null : ({ seed: seed.toString() } as unknown as WatchRecord),
        recordRefusal: seed === null ? 'no record' : null,
      });
    const fresh = openWeek('c2');
    /* A fresh week: the link's crowd begins it, § D1047's newcomer. */
    expect(crowdMakesPractice(fresh, 777n, DATE)).toBe(false);
    /* Seat D: Monday and Tuesday banked on the date's crowd, then `?seed=777` on Wednesday. */
    const underWay = { ...fresh, history: [day(1, DATE - 1n), day(2, DATE)] };
    expect(crowdMakesPractice(underWay, 777n, DATE)).toBe(true);
    /* Seat A: Thursday's day on `seed=12345`. */
    expect(crowdMakesPractice(underWay, 12_345n, DATE)).toBe(true);
    /* The day's shared crowd always banks. */
    expect(crowdMakesPractice(underWay, DATE, DATE)).toBe(false);
    /* A week begun on a link's crowd keeps banking on it — the tier's `?seed=424242` weeks. */
    const begunOnALink = { ...fresh, history: [day(1, 424_242n)] };
    expect(crowdMakesPractice(begunOnALink, 424_242n, DATE)).toBe(false);
    expect(crowdMakesPractice(begunOnALink, 777n, DATE)).toBe(true);
    /* A first day with no record: the crowd it began on is unknown, so only the shared crowd banks. */
    expect(crowdMakesPractice({ ...fresh, history: [day(1, null)] }, 424_242n, DATE)).toBe(true);
    for (const sentinel of [REPLAY_CONTRACT_ID, RUSH_CONTRACT_ID]) {
      expect(crowdMakesPractice({ ...underWay, contractId: sentinel }, 777n, DATE)).toBe(false);
    }
  });
});
