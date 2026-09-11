/**
 * Endless rush's arithmetic in `core` — GitHub issue #372, under the owner's ruling of 2026-09-10
 * that a round is a sitting, posted whole, and the server replays the chain.
 *
 * The server may not import `viz` (§ D215 § 3), so the stream, the hold line and the waves a round
 * outlasted have to be read from the package both ends already depend on. These cases pin the
 * contract's constants and the hold reader on legs built by hand; `packages/viz/src/everyday/rush.test.ts`
 * pins the same reader against `live/bands.ts#waitBandsAt` on a real run, which is the agreement
 * that makes the server's hold moment the viewer's hold moment.
 */

import { describe, expect, it } from 'vitest';

import {
  LAST_GENERATED_WAVE,
  RUSH_HOLD_LINE,
  RUSH_STREAM,
  RUSH_TEMPLATE_ID,
  arrivalsPerMinute,
  expectedPerBucket,
  playerWaveAt,
  rushHoldAtLegs,
  rushTopArrivalsPerMinute,
  rushTopRatePctPop5min,
  rushWavesOutlasted,
  waveIndexAt,
  type RushHoldLeg,
} from './rush.js';

describe('the stream — ENGINE_CONTRACT § 3.2, stated once for both ends', () => {
  it('carries the contract’s constants and one shared seed', () => {
    expect(RUSH_TEMPLATE_ID).toBe('endless-rush');
    expect(RUSH_STREAM).toEqual({
      lengthS: 5_400,
      bucketS: 2,
      waveS: 180,
      baseRate: 0.34,
      waveStep: 0.11,
      scale: 2 / 3,
      upShare: 0.62,
      seed: 90_210,
    });
    expect(Object.isFrozen(RUSH_STREAM)).toBe(true);
    expect(Object.isFrozen(RUSH_HOLD_LINE)).toBe(true);
  });

  it('numbers waves from one for a player and from zero for the expression, and generates thirty', () => {
    expect(waveIndexAt(0)).toBe(0);
    expect(waveIndexAt(179.999)).toBe(0);
    expect(waveIndexAt(180)).toBe(1);
    expect(playerWaveAt(0)).toBe(1);
    expect(playerWaveAt(180)).toBe(2);
    expect(LAST_GENERATED_WAVE).toBe(30);
  });

  it('asks 6.8 people a minute in wave 1 and 70.6 in wave 30, the same people on every tower', () => {
    expect(arrivalsPerMinute(0)).toBeCloseTo(6.8, 9);
    expect(arrivalsPerMinute(29)).toBeCloseTo(70.6, 9);
    expect(expectedPerBucket(0)).toBeCloseTo((0.34 * 2) / 3, 12);
    expect(rushTopArrivalsPerMinute()).toBe(arrivalsPerMinute(LAST_GENERATED_WAVE - 1));
    expect(rushTopRatePctPop5min(1_000)).toBeCloseTo((70.6 * 5 * 100) / 1_000, 9);
    expect(() => rushTopRatePctPop5min(0)).toThrow();
  });
});

/** `count` legs that arrived at `arrivedAt` and are still standing, unless a board or refusal says otherwise. */
function standing(count: number, arrivedAt: number, extra: Partial<RushHoldLeg> = {}): RushHoldLeg[] {
  return Array.from({ length: count }, () => ({ arrivedAt, ...extra }));
}

describe('the hold line — forty past two minutes at once, at the stream’s two-second buckets', () => {
  const startedAt = 28_800;
  const endedAt = startedAt + RUSH_STREAM.lengthS;

  it('names the first bucket at which forty have stood two minutes, and not a bucket earlier', () => {
    const legs = standing(40, startedAt + 100);
    expect(rushHoldAtLegs(legs, startedAt, endedAt)).toBe(startedAt + 220);
  });

  it('is not crossed by thirty-nine, however long they stand', () => {
    expect(rushHoldAtLegs(standing(39, startedAt), startedAt, endedAt)).toBeUndefined();
  });

  it('counts exactly two minutes as past the line, the way the fourth band does', () => {
    // 120 s at the bucket is the fourth band's `fromS`; 119.5 s is the third band.
    expect(rushHoldAtLegs(standing(40, startedAt + 80), startedAt, endedAt)).toBe(startedAt + 200);
    expect(rushHoldAtLegs(standing(40, startedAt + 80.5), startedAt, endedAt)).toBe(startedAt + 202);
  });

  it('does not count a rider who boarded or was turned away at or before the bucket', () => {
    const boarded = standing(1, startedAt, { boardedAt: startedAt + 200 });
    const refused = standing(1, startedAt, { refusedAt: startedAt + 200 });
    const rest = standing(39, startedAt);
    expect(rushHoldAtLegs([...rest, ...boarded], startedAt, endedAt)).toBe(startedAt + 120);
    expect(rushHoldAtLegs([...rest, ...boarded], startedAt + 200, endedAt)).toBeUndefined();
    expect(rushHoldAtLegs([...rest, ...refused], startedAt + 200, endedAt)).toBeUndefined();
  });

  it('does not depend on the order the legs arrive in', () => {
    const legs = [...standing(20, startedAt + 300), ...standing(20, startedAt + 10)];
    expect(rushHoldAtLegs(legs, startedAt, endedAt)).toBe(rushHoldAtLegs([...legs].reverse(), startedAt, endedAt));
    expect(rushHoldAtLegs(legs, startedAt, endedAt)).toBe(startedAt + 420);
  });
});

describe('waves outlasted — what a round pays its purse on', () => {
  const startedAt = 28_800;

  it('is the waves before the one the line was crossed in', () => {
    expect(rushWavesOutlasted(startedAt + 10, startedAt)).toBe(0);
    expect(rushWavesOutlasted(startedAt + 180, startedAt)).toBe(1);
    expect(rushWavesOutlasted(startedAt + 4 * 180 + 1, startedAt)).toBe(4);
  });

  it('is every generated wave when the replay never crosses the line, and never more', () => {
    expect(rushWavesOutlasted(undefined, startedAt)).toBe(LAST_GENERATED_WAVE);
    // A crossing while the building drains after the stream has stopped is not a thirty-first wave.
    expect(rushWavesOutlasted(startedAt + RUSH_STREAM.lengthS + 600, startedAt)).toBe(LAST_GENERATED_WAVE);
  });
});
