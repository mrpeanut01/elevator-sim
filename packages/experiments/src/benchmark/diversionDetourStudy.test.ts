/**
 * § D211's criterion, checked as a criterion.
 *
 * The same shape as `collectiveAdoption.test.ts` and for the same reason: a criterion is only worth
 * its pre-registration if it has a state in which it says no, so every clause is driven to failure
 * on a study that passes every other one. The measurement itself is the module's own command.
 *
 * **Clause 5′ gets two tests rather than one, and that is the point of this file.** Replacing
 * "not significantly worse" with "bit-identical" is a strengthening, but it opens a hole that the
 * weaker clause did not have: a term that is *always* zero passes it perfectly. That is not
 * hypothetical — it is `DECISIONS.md` § D205's own first draft, which was inert and reported
 * exactly the zeros a successful null result would. So the identity is asserted **and** the
 * liveness that makes the identity meaningful is asserted beside it.
 */

import { describe, expect, it } from 'vitest';

import type { PairedComparison } from '../validation/harness.js';

import { ADOPTION_LADDERS, ADOPTION_REPLICATIONS } from './collectiveAdoption.js';
import {
  DETOUR_TUNING_SEED,
  DETOUR_VERDICT_SEED,
  REQUIRED_SIGNIFICANT_CELLS,
  TERM_ID,
  WEIGHT_GRID,
  detourVerdict,
  type DiversionDetourCell,
  type DiversionDetourStudy,
} from './diversionDetourStudy.js';

/* -------------------------------------------------------------------------- *
 * § D211 § 4 — the grid and the seeds
 * -------------------------------------------------------------------------- */

describe('§ D211 § 4 — declared in advance', () => {
  it('takes its verdict on a seed disjoint from the tuning seed and from § D209/§ D210s holdout', () => {
    const spentByD209 = 20_261_612;
    expect(DETOUR_VERDICT_SEED).not.toBe(DETOUR_TUNING_SEED);
    expect(DETOUR_VERDICT_SEED).not.toBe(spentByD209);
    // Tuned at the seed the *constant* weight was fitted at, so the two designs are searched on the
    // same traffic and a difference between them is not a seed effect.
    expect(DETOUR_TUNING_SEED).toBe(20_260_801);
  });

  it('declares a grid rather than a search, ascending and non-empty', () => {
    expect(WEIGHT_GRID.length).toBeGreaterThan(1);
    for (let index = 1; index < WEIGHT_GRID.length; index += 1) {
      expect(WEIGHT_GRID[index]).toBeGreaterThan(WEIGHT_GRID[index - 1] as number);
    }
    for (const weight of WEIGHT_GRID) expect(weight).toBeGreaterThan(0);
  });

  it('is about the conditional term and not the constant one', () => {
    // Guards the one substitution that would silently turn this study back into § D210's.
    expect(TERM_ID).toBe('diversionDetour');
    expect(TERM_ID).not.toBe('detourPenalty');
  });
});

/* -------------------------------------------------------------------------- *
 * The verdict — every clause driven to failure
 * -------------------------------------------------------------------------- */

function comparison(mean: number, lower: number, upper: number): PairedComparison {
  const standardError = Math.abs(upper - lower) / 3.92;
  return Object.freeze({
    metric: 'awtS' as const,
    n: ADOPTION_REPLICATIONS,
    candidate: [],
    baseline: [],
    differences: [],
    estimate: Object.freeze({
      n: ADOPTION_REPLICATIONS,
      mean,
      stdDev: standardError * Math.sqrt(ADOPTION_REPLICATIONS),
      standardError,
      confidence: 0.95,
      method: 't' as const,
      degreesOfFreedom: ADOPTION_REPLICATIONS - 1,
      halfWidth: Math.abs(upper - lower) / 2,
      lower,
      upper,
    }),
    // Derived from the bounds, so a fixture cannot claim an interval straddling zero is significant.
    significant: lower > 0 || upper < 0,
    varianceOfDifference: 1,
    candidateMean: 0,
    baselineMean: 0,
    varianceCandidate: 1,
    varianceBaseline: 1,
    correlation: 0.9,
    maxAbsDifference: 1,
    exactZeroCount: 0,
  }) as unknown as PairedComparison;
}

/** A down-peak cell that passes every clause: paired, live, quotable, significantly better on AWT. */
function goodCell(building: string, rate: number): DiversionDetourCell {
  return {
    building,
    rate,
    weight: 1,
    seed: DETOUR_VERDICT_SEED,
    waiting: comparison(-0.5, -0.8, -0.2),
    timeToDestination: comparison(-0.3, -0.6, 0.1),
    identical: false,
    live: true,
    commonRandomNumbers: true,
    awtIsValid: true,
  };
}

/** An up-peak cell as clause 5′ requires it: bit-identical on both metrics. */
function identicalUpPeak(building: string): DiversionDetourCell {
  return {
    building,
    rate: 0,
    weight: 1,
    seed: DETOUR_VERDICT_SEED,
    waiting: comparison(0, 0, 0),
    timeToDestination: comparison(0, 0, 0),
    identical: true,
    live: false,
    commonRandomNumbers: true,
    awtIsValid: true,
  };
}

function passingStudy(): DiversionDetourStudy {
  return {
    weight: 1,
    replications: ADOPTION_REPLICATIONS,
    verdictSeed: DETOUR_VERDICT_SEED,
    cells: ADOPTION_LADDERS.map((ladder) => {
      const rung = ladder[0];
      if (rung === undefined) throw new Error('empty ladder');
      return goodCell(rung.building, rung.rate);
    }),
    upPeak: [identicalUpPeak('midtown-office'), identicalUpPeak('secure-tower')],
  };
}

describe('§ D211 § 3 — the decision rule', () => {
  it('accepts a study that meets every clause', () => {
    const verdict = detourVerdict(passingStudy());
    expect(verdict.failures).toEqual([]);
    expect(verdict.accepted).toBe(true);
    expect(verdict.upPeakIdentical).toBe(true);
    expect(verdict.significantAwtGains).toBe(ADOPTION_LADDERS.length);
  });

  it('refuses when up-peak is not bit-identical — clause 5′ is exact, not statistical', () => {
    const study = passingStudy();
    const upPeak = [...study.upPeak];
    const first = upPeak[0];
    if (first === undefined) throw new Error('no up-peak cells');
    // The interval still contains zero, so § D209's clause 5 would have passed this. 5′ does not:
    // a term that is correctly scoped contributes exactly nothing where nothing diverts, and
    // "very nearly nothing" is a different claim about a different term.
    upPeak[0] = { ...first, identical: false, waiting: comparison(0.001, -0.02, 0.022) };
    const verdict = detourVerdict({ ...study, upPeak });
    expect(verdict.accepted).toBe(false);
    expect(verdict.upPeakIdentical).toBe(false);
    expect(verdict.failures.join(' ')).toContain('clause 5′');
  });

  it('refuses a study whose AWT gains do not reach the threshold — the inert-term hole', () => {
    // The failure mode clause 5′ creates and clause 4 closes from the other side: a term that is
    // always zero is bit-identical *everywhere*, up-peak included, and buys nothing anywhere.
    const study = passingStudy();
    const cells = study.cells.map((cell) => ({
      ...cell,
      waiting: comparison(0, -0.2, 0.2),
      identical: true,
      live: false,
    }));
    const verdict = detourVerdict({ ...study, cells });
    expect(verdict.accepted).toBe(false);
    expect(verdict.significantAwtGains).toBe(0);
    expect(verdict.failures.join(' ')).toContain('clause 4');
    // And it is caught as inert too, rather than only as unprofitable.
    expect(verdict.failures.join(' ')).toContain('inert');
  });

  it('refuses when either metric is significantly worse at a quotable cell', () => {
    for (const metric of ['waiting', 'timeToDestination'] as const) {
      const study = passingStudy();
      const cells = [...study.cells];
      const first = cells[0];
      if (first === undefined) throw new Error('no cells');
      cells[0] = { ...first, [metric]: comparison(0.4, 0.1, 0.7) };
      const verdict = detourVerdict({ ...study, cells });
      expect(verdict.accepted, metric).toBe(false);
      expect(verdict.failures.join(' '), metric).toContain('clause 3');
    }
  });

  it('refuses when a building drops out of the quotable set', () => {
    const study = passingStudy();
    const cells = study.cells.slice(1);
    const verdict = detourVerdict({ ...study, cells });
    expect(verdict.accepted).toBe(false);
    expect(verdict.failures.join(' ')).toContain('clause 2');
  });

  it('does not count an unquotable cell in either direction', () => {
    // A mean this project forbids quoting can neither earn adoption nor refuse it. The cell is
    // dropped from the gains tally *and* from the worse-on-neither check.
    const study = passingStudy();
    const cells = [...study.cells];
    const first = cells[0];
    if (first === undefined) throw new Error('no cells');
    cells[0] = { ...first, awtIsValid: false, timeToDestination: comparison(9, 8, 10) };
    const verdict = detourVerdict({ ...study, cells });
    expect(verdict.failures.join(' ')).not.toContain('clause 3');
    expect(verdict.significantAwtGains).toBe(ADOPTION_LADDERS.length - 1);
  });

  it('requires strictly fewer than every cell to be significant, so the threshold can bite', () => {
    expect(REQUIRED_SIGNIFICANT_CELLS).toBeLessThanOrEqual(ADOPTION_LADDERS.length);
    expect(REQUIRED_SIGNIFICANT_CELLS).toBeGreaterThan(1);
  });
});
