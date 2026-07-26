/**
 * The front, and the noise floor that decides what may be excluded from it.
 *
 * Two kinds of assertion here, and the split is deliberate.
 *
 * - **Hand-computed.** The pointwise front runs on a five-point set whose non-dominated subset is
 *   worked out in the test's own comment. A dominance relation is exactly the kind of code that
 *   passes a plausibility check while being wrong on the boundary (equal on one axis, better on
 *   another), so the fixture contains that case explicitly.
 * - **Constructed to a known statistical answer.** The interval-based front runs on paired series
 *   whose differences are fixed by construction: a constant offset gives an interval of zero width
 *   that provably excludes zero, and an offset that alternates sign gives one that provably contains
 *   it. Neither depends on a distributional assumption holding in a fixture.
 */

import { describe, expect, it } from 'vitest';

import { classify } from '../../benchmark/verdict.js';
import { comparePaired } from '../../validation/harness.js';
import { pairedDifferenceEstimate } from '../../reports/statistics.js';
import {
  AWT_OBJECTIVE_ID,
  ENERGY_OBJECTIVE_ID,
  TUNING_OBJECTIVES,
  WT95_OBJECTIVE_ID,
  assertDistinctObjectives,
  bestByObjective,
  compareObjective,
  dominanceOf,
  dominatesPointwise,
  objectivePointOf,
  objectiveVerdict,
  paretoFrontOfPoints,
  statisticalParetoFront,
} from './pareto.js';
import { TuningReportError, type ObjectivePoint, type ObjectiveSpec } from './types.js';
import { TUNING_SEEDS, candidate, observation, shift, wobble } from './fixtures.test-helper.js';

/** A three-axis point, all lower-is-better. */
const point = (id: string, awt: number, energy: number, wt95: number): ObjectivePoint => ({
  id,
  values: { [AWT_OBJECTIVE_ID]: awt, [ENERGY_OBJECTIVE_ID]: energy, [WT95_OBJECTIVE_ID]: wt95 },
});

/* -------------------------------------------------------------------------- *
 * The hand-computed front
 * -------------------------------------------------------------------------- */

/**
 * Five points, worked out by hand:
 *
 * ```
 *      awt  energy  wt95
 *  A    10     5      20
 *  B    12     4      22
 *  C    11     6      21
 *  D    10     5      19
 *  E    13     3      25
 * ```
 *
 * - **A** is dominated by **D**: equal on awt and energy, better on wt95. This is the boundary case
 *   a sloppy implementation gets wrong, because A is not *strictly* worse on two of the three axes.
 * - **C** is dominated by both **A** and **D**: strictly worse on all three than either.
 * - **B** survives: nothing matches its energy of 4 without being worse elsewhere (E has energy 3
 *   but is worse on awt and wt95).
 * - **D** survives: nothing is as good on awt without being worse on wt95.
 * - **E** survives on energy alone — the cheapest point on the axis nothing else reaches.
 *
 * Non-dominated set = **{B, D, E}**.
 */
const HAND_SET: readonly ObjectivePoint[] = [
  point('A', 10, 5, 20),
  point('B', 12, 4, 22),
  point('C', 11, 6, 21),
  point('D', 10, 5, 19),
  point('E', 13, 3, 25),
];

describe('pointwise Pareto front', () => {
  it('returns the hand-computed non-dominated subset', () => {
    const front = paretoFrontOfPoints(HAND_SET);

    expect(front.front).toEqual(['B', 'D', 'E']);
    expect(front.dominated).toEqual(['A', 'C']);
    expect(front.indeterminate).toEqual([]);
  });

  it('names who dominates each excluded point', () => {
    const front = paretoFrontOfPoints(HAND_SET);
    const entryOf = (id: string) =>
      front.entries.find((entry) => entry.candidateId === id) ?? expect.fail(`no entry ${id}`);

    expect(entryOf('A').dominatedBy).toEqual(['D']);
    expect(entryOf('C').dominatedBy).toEqual(['A', 'D']);
  });

  it('excludes on the boundary case: equal on two axes, better on the third', () => {
    expect(dominatesPointwise(point('D', 10, 5, 19), point('A', 10, 5, 20))).toBe(true);
    expect(dominatesPointwise(point('A', 10, 5, 20), point('D', 10, 5, 19))).toBe(false);
  });

  it('does not let a point dominate by tying on every axis', () => {
    const twin = point('A2', 10, 5, 20);
    expect(dominatesPointwise(twin, point('A', 10, 5, 20))).toBe(false);
    const front = paretoFrontOfPoints([point('A', 10, 5, 20), twin]);
    expect(front.front).toEqual(['A', 'A2']);
  });

  it('keeps a point with an unmeasured objective off the front rather than on it', () => {
    const incomplete = point('F', 9, Number.NaN, 18);
    const front = paretoFrontOfPoints([...HAND_SET, incomplete]);

    expect(front.indeterminate).toEqual(['F']);
    expect(front.front).not.toContain('F');
    expect(front.dominated).not.toContain('F');
  });

  it('drops an axis nobody measured, rather than making every point unplaceable', () => {
    const noEnergy = HAND_SET.map((entry) =>
      point(entry.id, entry.values[AWT_OBJECTIVE_ID] as number, Number.NaN, entry.values[WT95_OBJECTIVE_ID] as number),
    );
    const front = paretoFrontOfPoints(noEnergy);

    expect(front.inactiveObjectiveIds).toEqual([ENERGY_OBJECTIVE_ID]);
    expect(front.activeObjectiveIds).toEqual([AWT_OBJECTIVE_ID, WT95_OBJECTIVE_ID]);
    // Over (awt, wt95) alone: D=(10,19) dominates A=(10,20) and C=(11,21); B=(12,22) and E=(13,25)
    // are both dominated by D as well.
    expect(front.front).toEqual(['D']);
  });

  it('refuses a duplicated objective id', () => {
    const first = TUNING_OBJECTIVES[0] as ObjectiveSpec;
    expect(() => assertDistinctObjectives([first, first])).toThrow(TuningReportError);
  });
});

/* -------------------------------------------------------------------------- *
 * The verdict, pinned against Phase 5's
 * -------------------------------------------------------------------------- */

describe('objectiveVerdict agrees with benchmark/verdict.ts classify', () => {
  const cases: readonly { readonly name: string; readonly candidate: readonly number[]; readonly baseline: readonly number[]; readonly quotable: boolean }[] = [
    {
      name: 'bit-identical arms',
      candidate: [16, 15, 17, 16.5, 15.5, 16],
      baseline: [16, 15, 17, 16.5, 15.5, 16],
      quotable: true,
    },
    {
      name: 'a clear improvement',
      candidate: [14, 13, 15, 14.5, 13.5, 14],
      baseline: [16, 15, 17, 16.5, 15.5, 16],
      quotable: true,
    },
    {
      name: 'a clear regression',
      candidate: [18, 17, 19, 18.5, 17.5, 18],
      baseline: [16, 15, 17, 16.5, 15.5, 16],
      quotable: true,
    },
    {
      name: 'a difference inside the noise floor',
      candidate: [16.5, 14.5, 17.5, 16, 16, 15.5],
      baseline: [16, 15, 17, 16.5, 15.5, 16],
      quotable: true,
    },
    {
      name: 'an unquotable cell',
      candidate: [14, 13, 15, 14.5, 13.5, 14],
      baseline: [16, 15, 17, 16.5, 15.5, 16],
      quotable: false,
    },
  ];

  it.each(cases)('$name', ({ candidate: values, baseline, quotable }) => {
    const phase5 = classify(comparePaired('awtS', values, baseline), quotable);
    const estimate = pairedDifferenceEstimate(values, baseline);
    const differences = values.map((value, index) => value - (baseline[index] as number));
    const mine = objectiveVerdict({
      estimate,
      pairs: values.length,
      exactZeroPairs: differences.filter((difference) => difference === 0).length,
      direction: 'lower-is-better',
      quotable,
    });

    expect(mine).toBe(phase5);
  });

  it('flips the sense of the interval for a higher-is-better objective', () => {
    const values = [14, 13, 15, 14.5, 13.5, 14];
    const baseline = [16, 15, 17, 16.5, 15.5, 16];
    const estimate = pairedDifferenceEstimate(values, baseline);

    expect(
      objectiveVerdict({
        estimate,
        pairs: 6,
        exactZeroPairs: 0,
        direction: 'lower-is-better',
        quotable: true,
      }),
    ).toBe('BETTER');
    expect(
      objectiveVerdict({
        estimate,
        pairs: 6,
        exactZeroPairs: 0,
        direction: 'higher-is-better',
        quotable: true,
      }),
    ).toBe('WORSE');
  });
});

/* -------------------------------------------------------------------------- *
 * Paired objective comparison
 * -------------------------------------------------------------------------- */

const BASE_AWT = wobble(16, TUNING_SEEDS.length);
const BASE_ENERGY = wobble(100, TUNING_SEEDS.length, 3);

const armOf = (id: string, awt: readonly number[], energy: readonly number[]) =>
  candidate({
    candidateId: id,
    tuningAwt: awt,
    tuningEnergy: energy,
    tuningWt95: awt.map((value) => value * 2),
  });

describe('compareObjective', () => {
  it('reports IDENTICAL, not INDISTINGUISHABLE, when every paired difference is exactly zero', () => {
    const a = armOf('a', BASE_AWT, BASE_ENERGY);
    const b = armOf('b', BASE_AWT, BASE_ENERGY);
    const comparison = compareObjective(
      TUNING_OBJECTIVES[0] as ObjectiveSpec,
      { candidateId: 'b', evaluation: b.tuning },
      { candidateId: 'a', evaluation: a.tuning },
    );

    expect(comparison.verdict).toBe('IDENTICAL');
    expect(comparison.exactZeroPairs).toBe(comparison.pairs);
    expect(comparison.reason).toContain('bit-identical');
    expect(comparison.reason).toContain('plateau');
  });

  it('reports the noise floor and the replications a sub-floor effect would need', () => {
    // Differences alternate ±0.4 with mean exactly 0.05 — inside any plausible half-width here.
    const nudged = BASE_AWT.map((value, index) => value + (index % 2 === 0 ? 0.45 : -0.35));
    const comparison = compareObjective(
      TUNING_OBJECTIVES[0] as ObjectiveSpec,
      { candidateId: 'b', evaluation: armOf('b', nudged, BASE_ENERGY).tuning },
      { candidateId: 'a', evaluation: armOf('a', BASE_AWT, BASE_ENERGY).tuning },
    );

    expect(comparison.verdict).toBe('INDISTINGUISHABLE');
    expect(comparison.noiseFloor).toBeGreaterThan(Math.abs(comparison.meanDifference));
    expect(comparison.requiredReplications).toBeGreaterThan(comparison.pairs);
    expect(comparison.reason).toContain('noise floor');
  });

  it('refuses an objective no replication measured, rather than calling it zero', () => {
    const withoutEnergy = candidate({ candidateId: 'a', tuningAwt: BASE_AWT });
    const comparison = compareObjective(
      TUNING_OBJECTIVES[1] as ObjectiveSpec,
      { candidateId: 'b', evaluation: withoutEnergy.tuning },
      { candidateId: 'a', evaluation: withoutEnergy.tuning },
    );

    expect(comparison.verdict).toBe('UNQUOTABLE');
    expect(comparison.reason).toContain('never as zero');
  });

  it('refuses to compare a tuning arm against a holdout arm', () => {
    const a = candidate({ candidateId: 'a', tuningAwt: BASE_AWT, holdoutAwt: BASE_AWT });
    expect(() =>
      compareObjective(
        TUNING_OBJECTIVES[0] as ObjectiveSpec,
        { candidateId: 'a', evaluation: a.tuning },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        { candidateId: 'a', evaluation: a.holdout as NonNullable<typeof a.holdout> },
      ),
    ).toThrow(TuningReportError);
  });

  it('suppresses a saturation-invalidated objective and keeps the energy axis', () => {
    const saturated = {
      ...armOf('b', BASE_AWT, BASE_ENERGY).tuning,
      observations: armOf('b', BASE_AWT, BASE_ENERGY).tuning.observations.map((entry, index) =>
        index === 0
          ? observation(entry.seed, {
              ...entry,
              saturated: true,
              awtIsValid: false,
              awtInvalidReason: 'diverging queue',
            })
          : entry,
      ),
    };
    const reference = armOf('a', BASE_AWT, BASE_ENERGY);

    const awt = compareObjective(
      TUNING_OBJECTIVES[0] as ObjectiveSpec,
      { candidateId: 'b', evaluation: saturated },
      { candidateId: 'a', evaluation: reference.tuning },
    );
    const energy = compareObjective(
      TUNING_OBJECTIVES[1] as ObjectiveSpec,
      { candidateId: 'b', evaluation: saturated },
      { candidateId: 'a', evaluation: reference.tuning },
    );

    expect(awt.verdict).toBe('UNQUOTABLE');
    expect(awt.reason).toContain('selection on the outcome variable');
    // Energy is spent whether or not the queue diverged, exactly as handling capacity is measured.
    expect(energy.verdict).not.toBe('UNQUOTABLE');
  });
});

/* -------------------------------------------------------------------------- *
 * Dominance under a noise floor
 * -------------------------------------------------------------------------- */

describe('statistical Pareto front', () => {
  /*
   * Four candidates on twelve shared seeds. Offsets are constant per candidate, so every paired
   * difference is a constant and the interval has zero width: significance is not a matter of
   * degree here, it is arithmetic.
   *
   *   ref    awt +0     energy +0
   *   fast   awt −1.0   energy +8      (better wait, worse energy — a genuine tradeoff)
   *   green  awt +1.0   energy −8      (the mirror image)
   *   worse  awt +1.0   energy +8      (worse on both — dominated by ref)
   */
  const ref = armOf('ref', BASE_AWT, BASE_ENERGY);
  const fast = armOf('fast', shift(BASE_AWT, -1), shift(BASE_ENERGY, 8));
  const green = armOf('green', shift(BASE_AWT, 1), shift(BASE_ENERGY, -8));
  const worse = armOf('worse', shift(BASE_AWT, 1), shift(BASE_ENERGY, 8));

  it('keeps genuine tradeoffs on the front and excludes only what is dominated', () => {
    const front = statisticalParetoFront({ candidates: [ref, fast, green, worse] });

    expect(front.basis).toBe('paired-interval');
    expect(front.front).toEqual(['ref', 'fast', 'green']);
    expect(front.dominated).toEqual(['worse']);
    const excluded = front.entries.find((entry) => entry.candidateId === 'worse');
    expect(excluded?.dominatedBy).toContain('ref');
  });

  it('does not exclude a candidate on a difference inside the noise floor', () => {
    // `noisy` differs from `ref` by an alternating ±0.4 with a near-zero mean: better on the point
    // estimate for half the seeds and worse for the other half, which no interval can separate.
    const noisy = armOf(
      'noisy',
      BASE_AWT.map((value, index) => value + (index % 2 === 0 ? 0.4 : -0.4)),
      BASE_ENERGY.map((value, index) => value + (index % 2 === 0 ? 2 : -2)),
    );
    const front = statisticalParetoFront({ candidates: [ref, noisy] });

    expect(front.front).toEqual(['ref', 'noisy']);
    expect(front.dominated).toEqual([]);
    expect(front.indistinguishablePairs).toHaveLength(1);
    expect(front.indistinguishablePairs[0]?.identical).toBe(false);
  });

  it('marks a bit-identical pair IDENTICAL, and both stay on the front', () => {
    const twin = armOf('twin', BASE_AWT, BASE_ENERGY);
    const front = statisticalParetoFront({ candidates: [ref, twin] });

    expect(front.front).toEqual(['ref', 'twin']);
    expect(front.indistinguishablePairs[0]?.identical).toBe(true);
    expect(front.indistinguishablePairs[0]?.objectives.every((o) => o.verdict === 'IDENTICAL')).toBe(
      true,
    );
  });

  it('drops the energy axis when nothing measured it, and says which axis it dropped', () => {
    const a = candidate({ candidateId: 'a', tuningAwt: BASE_AWT });
    const b = candidate({ candidateId: 'b', tuningAwt: shift(BASE_AWT, -1) });
    const front = statisticalParetoFront({ candidates: [a, b] });

    expect(front.inactiveObjectiveIds).toEqual([ENERGY_OBJECTIVE_ID]);
    expect(front.activeObjectiveIds).toEqual([AWT_OBJECTIVE_ID, WT95_OBJECTIVE_ID]);
    expect(front.front).toEqual(['b']);
  });

  it('leaves an axis active when only some candidates measured it, so nobody wins by not measuring', () => {
    const measured = armOf('measured', BASE_AWT, BASE_ENERGY);
    const unmeasured = candidate({ candidateId: 'unmeasured', tuningAwt: shift(BASE_AWT, -5) });
    const front = statisticalParetoFront({ candidates: [measured, unmeasured] });

    expect(front.activeObjectiveIds).toContain(ENERGY_OBJECTIVE_ID);
    // Much better on AWT, but it cannot be placed while an axis is missing for it alone.
    expect(front.indeterminate).toContain('unmeasured');
    expect(front.front).not.toContain('unmeasured');
    // And the arm that measured everything is placed on the evidence it has, rather than being
    // dragged off the front by the one that did not.
    expect(front.front).toEqual(['measured']);
  });

  /*
   * The asymmetric case, in full. Measured before the fix: `front: []`, `dominated: []`,
   * `indeterminate: ['a', 'b', 'c-no-energy']` — every fully-measured arm marked unplaceable by the
   * one that declined an axis, rendered as "0 of 3 non-dominated" with every row UNPLACEABLE and no
   * error anywhere. The cause was a pair's `'indeterminate'` verdict being written onto the
   * candidate under consideration instead of onto the candidate that was missing the measurement.
   */
  it('does not let one candidate’s missing axis empty the front for everybody', () => {
    const a = armOf('a', BASE_AWT, BASE_ENERGY);
    const b = armOf('b', shift(BASE_AWT, -2), BASE_ENERGY);
    const noEnergy = candidate({ candidateId: 'c-no-energy', tuningAwt: shift(BASE_AWT, 5) });
    const front = statisticalParetoFront({ candidates: [a, b, noEnergy] });

    // Exactly the non-dominated subset of the two complete arms: `b` is better on AWT and WT95 and
    // bit-identical on energy, so it dominates `a`.
    expect(front.front).toEqual(['b']);
    expect(front.dominated).toEqual(['a']);
    // Only the arm that omitted an axis is unplaceable, and the page says which axis.
    expect(front.indeterminate).toEqual(['c-no-energy']);
    const unplaceable = front.entries.find((entry) => entry.candidateId === 'c-no-energy');
    expect(unplaceable?.note).toContain('Energy (proxy)');
    expect(unplaceable?.note).toContain('takes no part in the dominance relation');
    // And it neither dominates nor is dominated: the incomplete arm is out of the relation, not
    // beaten by it.
    expect(unplaceable?.dominatedBy).toEqual([]);
    expect(front.entries.find((entry) => entry.candidateId === 'a')?.indeterminate).toBe(false);
  });

  it('keeps two arms that share no seeds on the front, and records that they were never compared', () => {
    const left = candidate({
      candidateId: 'left',
      tuningAwt: BASE_AWT,
      tuningEnergy: BASE_ENERGY,
    });
    const right = candidate({
      candidateId: 'right',
      tuningAwt: shift(BASE_AWT, -5),
      tuningEnergy: BASE_ENERGY,
      tuningSeeds: [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212],
    });
    const front = statisticalParetoFront({ candidates: [left, right] });

    // Both are individually placeable, so neither is unplaceable; but no pairing exists, so no
    // dominance verdict may be formed and neither excludes the other.
    expect(front.indeterminate).toEqual([]);
    expect(front.front).toEqual(['left', 'right']);
    const entry = front.entries.find((candidateEntry) => candidateEntry.candidateId === 'left');
    expect(entry?.notComparableWith).toEqual(['right']);
    expect(entry?.note).toContain('absence of evidence');
  });

  it('treats one unquotable objective as indeterminate rather than ignoring the axis', () => {
    const comparisons = [
      { verdict: 'BETTER' } as never,
      { verdict: 'UNQUOTABLE' } as never,
    ];
    expect(dominanceOf(comparisons)).toBe('indeterminate');
  });
});

/* -------------------------------------------------------------------------- *
 * Winners
 * -------------------------------------------------------------------------- */

describe('bestByObjective', () => {
  const ref = armOf('ref', BASE_AWT, BASE_ENERGY);

  it('names a winner only when it beats every rival with an interval excluding zero', () => {
    const fast = armOf('fast', shift(BASE_AWT, -1), BASE_ENERGY);
    const slow = armOf('slow', shift(BASE_AWT, 1), BASE_ENERGY);
    const winners = bestByObjective({ candidates: [ref, fast, slow] });
    const awt = winners.find((winner) => winner.objectiveId === AWT_OBJECTIVE_ID);

    expect(awt?.winnerId).toBe('fast');
    expect(awt?.estimate).toBeDefined();
  });

  it('declares no winner when the leader is inside the noise floor of another candidate', () => {
    const nearly = armOf(
      'nearly',
      BASE_AWT.map((value, index) => value + (index % 2 === 0 ? 0.4 : -0.4)),
      BASE_ENERGY,
    );
    const winners = bestByObjective({ candidates: [ref, nearly] });
    const awt = winners.find((winner) => winner.objectiveId === AWT_OBJECTIVE_ID);

    expect(awt?.winnerId).toBeUndefined();
    expect(awt?.leaderId).toBeDefined();
    expect(awt?.tiedWith).toEqual(expect.arrayContaining(['ref', 'nearly']));
    expect(awt?.reason).toContain('inside the noise floor');
  });

  /*
   * The point estimate and the paired comparison disagree only when the arms have different
   * support — and then the paired one decides. `rival` runs the leader's twelve seeds 1.0 s better
   * on every one of them, plus twelve extra seeds around 20 s; its own mean is therefore worse
   * (17.0 against 15.0) and it loses the arg-min.
   *
   * Measured before the fix: `winnerId: 'leader'`, with the reason *"leader beats every other
   * candidate on AWT (mean wait) with a paired interval excluding zero at 95%"* — the page's
   * headline "who won" line, stating the exact opposite of what the paired interval said. The
   * cause was `BETTER` (the rival beat the leader) being treated as "successfully separated"
   * alongside `WORSE`.
   */
  it('does not declare a winner that a rival beats on the seeds they share', () => {
    const shared = wobble(15, 12);
    const extraSeeds = [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212];
    const leader = candidate({ candidateId: 'leader', tuningAwt: shared });
    const rival = candidate({
      candidateId: 'rival',
      tuningAwt: [...shared.map((value) => value - 1), ...wobble(20, 12)],
      tuningSeeds: [...TUNING_SEEDS, ...extraSeeds],
    });
    const winners = bestByObjective({ candidates: [leader, rival] });
    const awt = winners.find((winner) => winner.objectiveId === AWT_OBJECTIVE_ID);

    // The arg-min of the point estimates is still reported as the leader, and that is all it is.
    expect(awt?.leaderId).toBe('leader');
    expect(awt?.winnerId).toBeUndefined();
    expect(awt?.beatenBy).toEqual(['rival']);
    expect(awt?.reason).toContain('beats it on the seeds they share');
    expect(awt?.reason).not.toContain('beats every other candidate');
    // And the direction is the one the paired interval actually measured.
    const paired = compareObjective(
      TUNING_OBJECTIVES[0] as ObjectiveSpec,
      { candidateId: 'rival', evaluation: rival.tuning },
      { candidateId: 'leader', evaluation: leader.tuning },
    );
    expect(paired.verdict).toBe('BETTER');
    expect(paired.pairs).toBe(12);
  });

  it('still names a winner when every rival is significantly worse on the shared seeds', () => {
    const fast = armOf('fast', shift(BASE_AWT, -1), BASE_ENERGY);
    const slow = armOf('slow', shift(BASE_AWT, 1), BASE_ENERGY);
    const awt = bestByObjective({ candidates: [ref, fast, slow] }).find(
      (winner) => winner.objectiveId === AWT_OBJECTIVE_ID,
    );

    expect(awt?.winnerId).toBe('fast');
    expect(awt?.beatenBy).toBeUndefined();
  });

  it('says so when an objective has no quotable value at all', () => {
    const a = candidate({ candidateId: 'a', tuningAwt: BASE_AWT });
    const winners = bestByObjective({ candidates: [a] });
    const energy = winners.find((winner) => winner.objectiveId === ENERGY_OBJECTIVE_ID);

    expect(energy?.winnerId).toBeUndefined();
    expect(energy?.estimate).toBeUndefined();
    expect(energy?.reason).toContain('no best');
  });
});

/* -------------------------------------------------------------------------- *
 * Points
 * -------------------------------------------------------------------------- */

describe('objectivePointOf', () => {
  it('reports NaN for an unmeasured axis rather than zero', () => {
    const evaluation = candidate({ candidateId: 'a', tuningAwt: BASE_AWT }).tuning;
    const projected = objectivePointOf('a', evaluation.observations);

    expect(Number.isNaN(projected.values[ENERGY_OBJECTIVE_ID] as number)).toBe(true);
    expect(projected.values[AWT_OBJECTIVE_ID]).toBeCloseTo(16, 10);
  });

  it('excludes statistically invalid replications from the wait axes', () => {
    const evaluation = candidate({ candidateId: 'a', tuningAwt: [10, 10, 10, 90] }).tuning;
    const withInvalid = {
      ...evaluation,
      observations: evaluation.observations.map((entry, index) =>
        index === 3 ? observation(entry.seed, { ...entry, awtIsValid: false }) : entry,
      ),
    };

    expect(objectivePointOf('a', withInvalid.observations).values[AWT_OBJECTIVE_ID]).toBeCloseTo(
      10,
      10,
    );
  });
});
