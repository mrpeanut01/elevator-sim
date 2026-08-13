/**
 * **The rating** — that it reproduces from its inputs, that it says what it is a mean of, and that
 * a hole in it is a hole rather than a zero (R13).
 */

import { describe, expect, it } from 'vitest';

import { fakeArm, fakeReplication } from '../batch/fixtures.test-helper.js';
import type { BatchResult } from '../batch/types.js';

import { proofCasesOf, type ProofCase, type ProofCaseSet } from './proofCases.js';
import {
  proofCaseCountOf,
  proofCaseScoreOf,
  ratedCaseOf,
  ratingFigureOf,
  ratingOf,
  RATING_BASIS,
  RATING_CAVEAT,
  RATING_METRIC,
} from './rating.js';

const SET: ProofCaseSet = {
  version: 1,
  towers: [
    { id: 'tower-a', arrivalRatePctPop5min: 1, why: 'a' },
    { id: 'tower-b', arrivalRatePctPop5min: 2, why: 'b' },
  ],
  crowds: [
    { id: 'one', label: 'One', tests: 't', durationS: 900, demand: {} },
    { id: 'two', label: 'Two', tests: 't', durationS: 900, demand: {} },
  ],
};

const CASES = proofCasesOf(SET);

/** One case's finished batch, with `pctOverLongWait` set — `null` meaning nothing was measured. */
function resultWith(...pctOverLongWait: readonly (number | null)[]): BatchResult {
  return {
    buildingId: 'tower-a',
    buildingName: 'Tower A',
    seed: '1',
    durationS: 900,
    arrivalRatePctPop5min: null,
    arms: [
      fakeArm(
        'candidate',
        'eta',
        pctOverLongWait.map((value, index) =>
          fakeReplication(index, 10, { metrics: { [RATING_METRIC]: value } }),
        ),
      ),
    ],
    crn: { traceKey: 'k', checkedComparisons: 0, mismatches: [], aligned: true },
    elapsedMs: 1,
  };
}

const caseAt = (index: number): ProofCase => {
  const entry = CASES[index];
  if (entry === undefined) throw new Error('no such case');
  return entry;
};

describe('a case’s score', () => {
  it('is the share of rides that waited no more than the long-wait threshold', () => {
    expect(proofCaseScoreOf(resultWith(12)).score).toBe(88);
  });

  it('means the replications that measured something, and drops the ones that did not', () => {
    expect(proofCaseScoreOf(resultWith(10, null, 30)).score).toBe(80);
  });

  it('refuses rather than scoring zero when nothing was carried — R13', () => {
    const answer = proofCaseScoreOf(resultWith(null));
    expect(answer.score).toBeNull();
    expect(answer.reason).toContain('rather than counted as zero');
  });
});

describe('the rating', () => {
  it('is the mean of the scored cases, and reproduces from the same inputs', () => {
    const rated = [resultWith(0), resultWith(20), resultWith(40), resultWith(60)].map(
      (result, index) => ratedCaseOf(caseAt(index), result),
    );
    const first = ratingOf(rated, CASES.length);
    const second = ratingOf(rated, CASES.length);
    expect(first.rating).toBe(70);
    expect(second).toEqual(first);
    expect(first.complete).toBe(true);
    expect(proofCaseCountOf(first)).toBe('4 of 4');
  });

  it('carries the seed of every case it rated — invariant 5', () => {
    const rated = CASES.map((entry) => ratedCaseOf(entry, resultWith(10)));
    expect(rated.map((entry) => entry.seed)).toEqual(CASES.map((entry) => entry.seed));
  });

  it('names the case it did worst on — § 14’s *weakest at*', () => {
    const rated = [resultWith(5), resultWith(70), resultWith(5), resultWith(5)].map(
      (result, index) => ratedCaseOf(caseAt(index), result),
    );
    expect(ratingOf(rated, 4).weakest?.caseId).toBe(caseAt(1).id);
  });

  it('drops an unscored case from the mean and from the denominator, never counting it zero', () => {
    const rated = [resultWith(20), resultWith(null), resultWith(20), resultWith(20)].map(
      (result, index) => ratedCaseOf(caseAt(index), result),
    );
    const summary = ratingOf(rated, 4);
    expect(summary.rating).toBe(80);
    expect(summary.casesRated).toBe(3);
    expect(summary.casesRun).toBe(4);
    expect(summary.complete).toBe(false);
    expect(proofCaseCountOf(summary)).toBe('3 of 4');
  });

  it('counts the cases that never ran against the denominator, not the rows it received', () => {
    /*
     * The interesting incomplete rating: a gauntlet stopped at case one has no row for cases two
     * to four at all, and a denominator derived from the rows would report `1 of 1`.
     */
    const summary = ratingOf([ratedCaseOf(caseAt(0), resultWith(10))], 4);
    expect(proofCaseCountOf(summary)).toBe('1 of 4');
    expect(summary.complete).toBe(false);
  });

  it('draws an em dash where there is no figure — § 13, never a zero', () => {
    expect(ratingFigureOf(ratingOf([], 4))).toBe('—');
    expect(ratingFigureOf(ratingOf([ratedCaseOf(caseAt(0), resultWith(10))], 4))).toBe('90.0%');
  });
});

describe('what is published beside the number', () => {
  it('says what the mean is a mean of, including that every entrant met the same crowd', () => {
    expect(RATING_BASIS).toContain('forty proof cases');
    expect(RATING_BASIS).toContain('identical crowd');
  });

  it('refuses to let a gap between two rows be read as a measured difference', () => {
    expect(RATING_CAVEAT).toContain('not a measured difference');
    expect(RATING_CAVEAT).toContain('bench');
  });

  it('is folded from an observation, so a saturated run still scores', () => {
    /*
     * R1 forbids reading an estimate off a run whose `awtIsValid` is false. The rating is folded
     * from `pctOverLongWait`, which `batch/types.ts` classes an observation — so a case that
     * saturated still contributes, and a rating cannot move with the saturation instead of with the
     * dispatcher.
     */
    const saturated: BatchResult = {
      ...resultWith(20),
      arms: [
        fakeArm('candidate', 'eta', [
          fakeReplication(0, 10, { awtIsValid: false, metrics: { [RATING_METRIC]: 20 } }),
        ]),
      ],
    };
    expect(proofCaseScoreOf(saturated).score).toBe(80);
  });
});
