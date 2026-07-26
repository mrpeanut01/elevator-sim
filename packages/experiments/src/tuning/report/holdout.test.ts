/**
 * Held-out seeds — the guard, and the ways it can be defeated.
 *
 * Every candidate here is constructed to a **known** answer rather than measured, because the claim
 * under test is that the code recognizes overfitting, and a simulation cannot supply a run that is
 * overfitted on purpose. The construction is the same in each case: a fixed offset with a small
 * fixed jitter, so the paired interval's verdict is arithmetic rather than a distributional
 * accident, and no RNG appears anywhere (CLAUDE.md invariant 2 — and a fixture that reached for
 * `Math.random()` would also make a failure unreproducible).
 */

import { describe, expect, it } from 'vitest';

import {
  accountSeedSets,
  assertDisjointSeedSets,
  assessHoldout,
  gainOf,
  seedsOf,
  sharedSeedsOf,
  shrinkageInterval,
  summarizeSeedSet,
} from './holdout.js';
import { AWT_OBJECTIVE_ID, TUNING_OBJECTIVES } from './pareto.js';
import { TuningReportError, type CandidateEvaluation, type HoldoutAssessment } from './types.js';
import { HOLDOUT_SEEDS, TUNING_SEEDS, candidate, observation, wobble } from './fixtures.test-helper.js';

/** ±`size`, alternating. Keeps a series' spread non-degenerate without an RNG. */
const jitter = (values: readonly number[], size: number): readonly number[] =>
  values.map((value, index) => value + (index % 2 === 0 ? size : -size));

const REF_TUNING = wobble(16, TUNING_SEEDS.length);
const REF_HOLDOUT = wobble(16.4, HOLDOUT_SEEDS.length);

const reference: CandidateEvaluation = candidate({
  candidateId: 'predictive-balanced',
  tuningAwt: REF_TUNING,
  holdoutAwt: REF_HOLDOUT,
});

/** A candidate offset from the reference by a constant on each set, plus a fixed jitter. */
function offsetCandidate(
  candidateId: string,
  tuningOffset: number,
  holdoutOffset: number,
  spread = 0.1,
): CandidateEvaluation {
  return candidate({
    candidateId,
    tuningAwt: jitter(
      REF_TUNING.map((value) => value + tuningOffset),
      spread,
    ),
    holdoutAwt: jitter(
      REF_HOLDOUT.map((value) => value + holdoutOffset),
      spread,
    ),
  });
}

const awtAssessment = (assessments: readonly HoldoutAssessment[]): HoldoutAssessment =>
  assessments.find((assessment) => assessment.objectiveId === AWT_OBJECTIVE_ID) ??
  expect.fail('no AWT assessment');

/* -------------------------------------------------------------------------- *
 * The split has to be a split
 * -------------------------------------------------------------------------- */

describe('seed-set accounting', () => {
  it('refuses a holdout set that shares a seed with the tuning set', () => {
    const overlapping = candidate({
      candidateId: 'leaky',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      holdoutSeeds: [...HOLDOUT_SEEDS.slice(0, 11), TUNING_SEEDS[0] as number],
    });

    expect(() => assertDisjointSeedSets([overlapping])).toThrow(TuningReportError);
    expect(() => assertDisjointSeedSets([overlapping])).toThrow(/no guard at all/);
  });

  it('names the shared seeds, because the one that overlaps is the one that matters', () => {
    const overlapping = candidate({
      candidateId: 'leaky',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      holdoutSeeds: [...HOLDOUT_SEEDS.slice(0, 10), TUNING_SEEDS[3] as number, TUNING_SEEDS[7] as number],
    });

    expect(() => assertDisjointSeedSets([overlapping])).toThrow(/4/);
    expect(sharedSeedsOf(overlapping.tuning, overlapping.holdout as never)).toEqual(['4', '8']);
  });

  it('accepts the disjoint case and reports both sets', () => {
    const accounting = accountSeedSets([reference]);

    expect(accounting.disjoint).toBe(true);
    expect(accounting.sharedSeeds).toEqual([]);
    expect(accounting.tuning.replications).toBe(12);
    expect(accounting.holdout?.replications).toBe(12);
  });

  it('refuses a repeated seed inside one set', () => {
    const evaluation = {
      ...reference.tuning,
      observations: [...reference.tuning.observations, observation(TUNING_SEEDS[0] as number)],
    };
    expect(() => seedsOf(evaluation)).toThrow(TuningReportError);
    expect(() => summarizeSeedSet(evaluation)).toThrow(/pairing key/);
  });

  it('refuses sets whose declared roles are not tuning and holdout', () => {
    const mislabelled: CandidateEvaluation = {
      candidateId: 'mislabelled',
      tuning: reference.tuning,
      holdout: { ...reference.tuning, seedSetId: 'hold-b' },
    };
    expect(() => assertDisjointSeedSets([mislabelled])).toThrow(TuningReportError);
  });
});

/* -------------------------------------------------------------------------- *
 * The flag
 * -------------------------------------------------------------------------- */

describe('overfitting is flagged', () => {
  it('flags a candidate whose tuning-set gain does not survive on disjoint seeds', () => {
    // −2 s on the seeds it was tuned against; exactly nothing on seeds it never saw.
    const overfitted = offsetCandidate('overfitted', -2, 0);
    const assessment = awtAssessment(assessHoldout(reference, overfitted));

    expect(assessment.tuning.verdict).toBe('BETTER');
    expect(assessment.holdout?.verdict).toBe('INDISTINGUISHABLE');
    expect(assessment.verdict).toBe('overfitted');
    expect(assessment.confirmedOnHoldout).toBe(false);
    expect(assessment.gainShrankSignificantly).toBe(true);
    expect(assessment.reason).toContain('OVERFITTED');
    expect(assessment.tuningGain).toBeCloseTo(2, 6);
    expect(assessment.holdoutGain).toBeCloseTo(0, 6);
    expect(assessment.retainedFraction).toBeCloseTo(0, 6);
  });

  it('does not flag a gain that reproduces on unseen traffic', () => {
    const honest = offsetCandidate('honest', -2, -2);
    const assessment = awtAssessment(assessHoldout(reference, honest));

    expect(assessment.verdict).toBe('generalizes');
    expect(assessment.confirmedOnHoldout).toBe(true);
    expect(assessment.gainShrankSignificantly).toBe(false);
    expect(assessment.retainedFraction).toBeCloseTo(1, 6);
  });

  it('separates a real-but-smaller gain from one that vanished', () => {
    const shrunk = offsetCandidate('shrunk', -2, -1);
    const assessment = awtAssessment(assessHoldout(reference, shrunk));

    expect(assessment.verdict).toBe('degraded');
    expect(assessment.confirmedOnHoldout).toBe(true);
    expect(assessment.gainShrankSignificantly).toBe(true);
    expect(assessment.retainedFraction).toBeCloseTo(0.5, 6);
    expect(assessment.reason).toContain('Quote the holdout number');
  });

  it('separates an underpowered holdout set from overfitting, and says which it is', () => {
    // The holdout gain is nominally the same −2 s, but so noisy that neither its own interval nor
    // the shrinkage interval excludes zero. That is a statement about the holdout budget, not about
    // the dispatcher, and reporting it as overfitting would be a different wrong answer.
    const noisy = candidate({
      candidateId: 'noisy-holdout',
      tuningAwt: jitter(
        REF_TUNING.map((value) => value - 2),
        0.1,
      ),
      holdoutAwt: jitter(
        REF_HOLDOUT.map((value) => value - 2),
        4,
      ),
    });
    const assessment = awtAssessment(assessHoldout(reference, noisy));

    expect(assessment.tuning.verdict).toBe('BETTER');
    expect(assessment.holdout?.verdict).toBe('INDISTINGUISHABLE');
    expect(assessment.verdict).toBe('unconfirmed');
    expect(assessment.gainShrankSignificantly).toBe(false);
    expect(assessment.reason).toContain('underpowered');
  });

  it('has nothing to validate when the tuning set showed no improvement', () => {
    const flat = offsetCandidate('flat', 0, 0);
    const assessment = awtAssessment(assessHoldout(reference, flat));

    expect(assessment.verdict).toBe('not-selected');
    expect(assessment.reason).toContain('no improvement');
  });

  it('says the guard was not exercised when there is no holdout set at all', () => {
    const noHoldout = candidate({
      candidateId: 'tuning-only',
      tuningAwt: jitter(
        REF_TUNING.map((value) => value - 2),
        0.1,
      ),
    });
    const assessment = awtAssessment(
      assessHoldout({ ...reference, holdout: undefined }, noHoldout),
    );

    expect(assessment.verdict).toBe('unquotable');
    expect(assessment.holdout).toBeUndefined();
    expect(assessment.reason).toContain('CLAUDE.md § Tuning discipline');
  });

  it('reports the energy axis as unquotable rather than as a passed guard', () => {
    const overfitted = offsetCandidate('overfitted', -2, 0);
    const energy = assessHoldout(reference, overfitted).find(
      (assessment) => assessment.objectiveId === 'energy',
    );

    expect(energy?.verdict).toBe('unquotable');
    expect(energy?.reason).toContain('never as zero');
  });
});

/* -------------------------------------------------------------------------- *
 * The shrinkage arithmetic
 * -------------------------------------------------------------------------- */

describe('shrinkageInterval', () => {
  const estimate = (mean: number, standardError: number, n: number) =>
    ({
      n,
      mean,
      stdDev: standardError * Math.sqrt(n),
      standardError,
      confidence: 0.95,
      method: 't' as const,
      degreesOfFreedom: n - 1,
      halfWidth: standardError * 2,
      lower: mean - standardError * 2,
      upper: mean + standardError * 2,
      min: Number.NaN,
      max: Number.NaN,
    }) as const;

  it('adds the two standard errors in quadrature — the sets are disjoint, so nothing is paired', () => {
    const interval = shrinkageInterval(
      estimate(-2, 0.3, 100),
      estimate(-0.5, 0.4, 100),
      'lower-is-better',
    );

    // gains are +2 and +0.5, so the gap is +1.5 — the gain shrank by 1.5 s.
    expect(interval.mean).toBeCloseTo(1.5, 10);
    expect(interval.standardError).toBeCloseTo(Math.sqrt(0.3 ** 2 + 0.4 ** 2), 10);
    expect(interval.lower).toBeGreaterThan(0);
  });

  it('uses the Satterthwaite degrees of freedom, which lie between the two sample sizes', () => {
    const interval = shrinkageInterval(
      estimate(-2, 0.3, 30),
      estimate(-0.5, 0.31, 120),
      'lower-is-better',
    );

    expect(interval.degreesOfFreedom).toBeGreaterThan(29);
    expect(interval.degreesOfFreedom).toBeLessThan(149);
  });

  it('flips the sense of a gain for a higher-is-better objective', () => {
    const lower = shrinkageInterval(estimate(-2, 0.3, 50), estimate(-0.5, 0.3, 50), 'lower-is-better');
    const higher = shrinkageInterval(estimate(-2, 0.3, 50), estimate(-0.5, 0.3, 50), 'higher-is-better');

    expect(lower.mean).toBeCloseTo(1.5, 10);
    expect(higher.mean).toBeCloseTo(-1.5, 10);
  });

  it('produces a non-finite interval rather than a narrow one when a side has no spread', () => {
    const degenerate = shrinkageInterval(
      estimate(-2, 0, 1),
      estimate(-0.5, 0, 1),
      'lower-is-better',
    );
    expect(Number.isFinite(degenerate.lower)).toBe(false);
  });
});

describe('gainOf', () => {
  it('is positive for an improvement whatever the objective direction is', () => {
    const overfitted = offsetCandidate('overfitted', -2, 0);
    const assessments = assessHoldout(reference, overfitted, {
      objectives: [TUNING_OBJECTIVES[0] as never],
    });
    expect(gainOf(assessments[0]?.tuning)).toBeCloseTo(2, 6);
    expect(gainOf(undefined)).toBeNaN();
  });
});
