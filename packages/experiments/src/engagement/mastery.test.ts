/**
 * The mastery slope over supplied verdicts: the interval it reads, the refusals it makes, the paired
 * form, and the named gap (one repeated holdout batch) reported rather than papered over.
 *
 * There are no persona attempts yet, so every series here is written by hand. The pass indicators a
 * real series carries are the game's own (`campaign/judge.ts`), never computed in this package.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../validation/harness.js';
import { parseEngagementBands } from './bands.js';
import { masterySlopeOf, pairedMasterySlope, type MasteryAttempt } from './mastery.js';

const RAW = JSON.parse(readFileSync(join(DATA_DIR, 'engagement-bands.json'), 'utf8')) as Record<string, unknown>;
const BANDS = parseEngagementBands(RAW).masterySlope;

/** The game's own holdout batch for stage 1, the same on every attempt. */
const BATCH = { role: 'holdout', name: 'holdout-20260731' } as const;
const series = (passes: readonly (boolean | null)[], seedSet: MasteryAttempt['seedSet'] = BATCH): MasteryAttempt[] =>
  passes.map((pass) => ({ pass, seedSet }));
const fromBits = (bits: string): MasteryAttempt[] => series([...bits].map((bit) => bit === '1'));

describe('the slope over eight attempts', () => {
  it('reads four fails then four passes as rising, with the OLS interval at t(0.975, 6)', () => {
    const slope = masterySlopeOf(fromBits('00001111'), BANDS);
    // slope = Sxy / Sxx = 8 / 42; residual sd = sqrt((2 - 8 · 8/42) / 6); SE = sd / sqrt(42).
    expect(slope.slopePerAttempt).toBeCloseTo(8 / 42, 12);
    expect(slope.standardError).toBeCloseTo(Math.sqrt((2 - 64 / 42) / 6) / Math.sqrt(42), 12);
    expect(slope.lower).toBeCloseTo(8 / 42 - 2.4469118511 * slope.standardError, 8);
    expect(slope).toMatchObject({ verdict: 'rising', attempts: 8, required: 8, passes: 4, fails: 4, refused: 0 });
    expect(masterySlopeOf(fromBits('11110000'), BANDS).verdict).toBe('falling');
  });

  it('reads no trend as flat, and a constant series as flat with no spread at all', () => {
    expect(masterySlopeOf(fromBits('01010101'), BANDS).verdict).toBe('flat');
    expect(masterySlopeOf(fromBits('11111111'), BANDS)).toMatchObject({ verdict: 'flat', slopePerAttempt: 0, lower: 0, upper: 0 });
  });
});

describe('what suppresses a slope', () => {
  it('says there are no attempts when there are none, which is the baseline until the playtest phase', () => {
    expect(masterySlopeOf([], BANDS)).toMatchObject({ verdict: 'no-attempts', attempts: 0, required: 8 });
    expect(pairedMasterySlope([], [], BANDS).verdict).toBe('no-attempts');
  });

  it('withholds a slope on fewer attempts than the bands file asks for, and moving the count in the data moves that', () => {
    const seven = fromBits('0001111');
    expect(masterySlopeOf(seven, BANDS)).toMatchObject({ verdict: 'suppressed', passes: 4 });
    const relaxed = parseEngagementBands({ ...RAW, masterySlope: { ...(RAW['masterySlope'] as object), attempts: 7 } }).masterySlope;
    expect(masterySlopeOf(seven, relaxed).verdict).toBe('rising');
  });

  it('withholds a slope when any verdict refused, and still shows the counts (§ D158)', () => {
    const slope = masterySlopeOf(series([false, false, false, null, true, true, true, true]), BANDS);
    expect(slope).toMatchObject({ verdict: 'suppressed', passes: 4, fails: 3, refused: 1 });
    expect(Number.isNaN(slope.slopePerAttempt)).toBe(true);
    expect(slope.suppressedBecause).toMatch(/1 of 8 verdicts refused/u);
  });

  it('withholds a slope over attempts judged on the tuning seeds, which the bands file does not name', () => {
    const tuning = series([false, false, false, false, true, true, true, true], { role: 'tuning', name: 'tuning-20260730' });
    expect(masterySlopeOf(tuning, BANDS).suppressedBecause).toMatch(/holdout set/u);
  });
});

describe('the named gap: one holdout batch, repeated', () => {
  it('reports that the game’s attempts share one seed set, and that disjoint ones would not', () => {
    expect(masterySlopeOf(fromBits('00001111'), BANDS)).toMatchObject({ distinctSeedSets: 1, seedSetsDisjoint: false });
    const disjoint = [...'00001111'].map((bit, index) => ({ pass: bit === '1', seedSet: { role: 'holdout', name: `fresh-${String(index)}` } }) as const);
    expect(masterySlopeOf(disjoint, BANDS)).toMatchObject({ distinctSeedSets: 8, seedSetsDisjoint: true });
  });
});

describe('two series are compared paired, attempt by attempt', () => {
  it('reads the difference of the slopes from one fit on the differences', () => {
    const candidate = fromBits('00001111');
    const baseline = fromBits('01010101');
    const paired = pairedMasterySlope(candidate, baseline, BANDS);
    expect(paired.slopeDifference).toBeCloseTo(
      masterySlopeOf(candidate, BANDS).slopePerAttempt - masterySlopeOf(baseline, BANDS).slopePerAttempt,
      12,
    );
    expect(paired.pairs).toBe(8);
    expect(pairedMasterySlope(candidate, candidate, BANDS)).toMatchObject({ verdict: 'flat', slopeDifference: 0 });
  });

  it('refuses series of different lengths, or a series that could not carry a slope of its own', () => {
    expect(pairedMasterySlope(fromBits('00001111'), fromBits('0001111'), BANDS).verdict).toBe('suppressed');
    expect(pairedMasterySlope(fromBits('00001111'), series([false, false, false, null, true, true, true, true]), BANDS).verdict).toBe('suppressed');
  });
});
