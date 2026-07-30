/**
 * The four grounds, and the guard that a fifth cannot arrive silently.
 *
 * ## What this file is defending against
 *
 * The refusal used to be prose alone, produced by a nested conditional. Adding a code beside it
 * creates exactly one new way to be wrong, and it is the way this repository has been wrong twice
 * (`the root DECISIONS.md` § D152 and § D163): **a code and the branch that produces it drifting
 * apart.** So the assertions below are about the *relationship* between the enumeration, the
 * branches and the sentences, not about the four members:
 *
 * - {@link CASES} is typed `Record<AwtInvalidGround, …>`, so a fifth entry in
 *   `AWT_INVALID_GROUND_SPECS` **fails to compile here** until somebody writes evidence that fires
 *   it. That is the compile-time half.
 * - Its keys are then asserted equal to `AWT_INVALID_GROUNDS`, in both directions, so a ground
 *   removed from the table while a case for it survives is red too. That is the runtime half, and it
 *   is the direction the type cannot see.
 * - Every case asserts the **prose**, in full, alongside the code. A code with the wrong sentence is
 *   the one failure a "does it return a member of the union" test cannot see, and it is the failure
 *   that would put a saturated run's words on an abandoned run's row.
 *
 * ## Why the prose is pinned in full rather than by a keyword
 *
 * These four sentences are the most safety-critical copy this project produces — `docs/07` § 3 and
 * § D111 — and this module *moved* them out of `summarize.ts`. A move that reworded one of them
 * while relocating it would be invisible to every other test in the tree, because nothing else
 * re-derives a suppression sentence. `traffic/transportIdentity.test.ts` covers the same claim from
 * the other side and more strongly still: its digests are over whole `SimulationResult`s from a
 * baseline commit, `awtInvalidReason` is inside them, and twelve of its eighteen cells are refused
 * runs. Those digests reproduced unchanged across this move.
 */

import { describe, expect, it } from 'vitest';

import {
  AWT_INVALID_GROUNDS,
  diagnoseAwtValidity,
  type AwtInvalidGround,
  type AwtValidityEvidence,
} from './awtValidity.js';
import { summarizeRun } from './summarize.js';
import {
  DEFAULT_PERCENTILE_METHOD,
  METRICS_SCHEMA_VERSION,
  SATURATION_DEFAULTS,
  type Histogram,
  type PassengerRecord,
  type RunRecord,
  type SaturationDiagnosis,
  type ServiceLevelDiagnosis,
  type WaitStatistics,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Builders — the diagnoses `summarizeRun` hands the classifier
 * -------------------------------------------------------------------------- */

const EMPTY_HISTOGRAM: Histogram = Object.freeze({
  bins: [],
  count: 0,
  totalWeight: 0,
  underflow: 0,
  overflow: 0,
  mean: Number.NaN,
  min: Number.NaN,
  max: Number.NaN,
});

function waiting(overrides: Partial<WaitStatistics> = {}): WaitStatistics {
  return {
    count: 17,
    meanS: 42.5,
    stdDevS: 10,
    minS: 5,
    medianS: 40,
    p90S: 60,
    p95S: 70,
    p99S: 80,
    maxS: 90,
    percentileMethod: DEFAULT_PERCENTILE_METHOD,
    arrivalCount: 20,
    unservedCount: 3,
    longWaitThresholdS: 60,
    overLongWaitCount: 2,
    pctOverLongWait: 11.8,
    histogram: EMPTY_HISTOGRAM,
    ...overrides,
  };
}

/** A stable, unsaturated diagnosis. `saturated: true` in the overrides makes it the other one. */
function saturation(overrides: Partial<SaturationDiagnosis> = {}): SaturationDiagnosis {
  return {
    saturated: false,
    verdict: 'stable',
    source: 'recorded',
    windowStartS: 0,
    windowEndS: 300,
    sampleCount: 60,
    slopePersonsPerSecond: 0.04,
    slopePersonsPerMinute: 2.4,
    projectedGrowthPersons: 12,
    interceptPersons: 3,
    rSquared: 0.9,
    residualStdDevPersons: 2,
    growthToNoiseRatio: 6,
    tStatistic: 9,
    meanQueueLength: 9,
    maxQueueLength: 15,
    thresholds: SATURATION_DEFAULTS,
    ...overrides,
  };
}

function serviceLevel(overrides: Partial<ServiceLevelDiagnosis> = {}): ServiceLevelDiagnosis {
  return {
    verdict: 'served',
    starved: false,
    horizonS: 900,
    longestWaitS: 90,
    longestWaitIsCensored: false,
    longestWaitLegId: 'p-9',
    longestWaitOriginFloorId: 'G',
    longestWaitDestinationFloorId: '10',
    overHorizonCount: 0,
    arrivalCount: 20,
    censoredAtS: 1800,
    ...overrides,
  };
}

/** Evidence that fires nothing: served cohort, stable queue, censoring inside the limit. */
function cleanEvidence(overrides: Partial<AwtValidityEvidence> = {}): AwtValidityEvidence {
  return {
    waiting: waiting({ count: 19, arrivalCount: 20, unservedCount: 1 }),
    saturation: saturation(),
    serviceLevel: serviceLevel(),
    windowSeconds: 300,
    maxUnservedFraction: 0.05,
    unservedFraction: 0.05,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * One case per ground — exhaustive by type, and asserted exhaustive at runtime
 * -------------------------------------------------------------------------- */

interface GroundCase {
  /** Evidence on which **this** ground is the first that fires. */
  readonly evidence: AwtValidityEvidence;
  /** The whole sentence. Pinned, not sampled — see the module docstring. */
  readonly reason: string;
}

/**
 * **A fifth ground in `AWT_INVALID_GROUND_SPECS` is a compile error on this declaration.**
 *
 * `Record<AwtInvalidGround, GroundCase>` is total, and `AwtInvalidGround` is derived from the spec
 * table, so the union widens the moment a ground is added and this object stops satisfying it. That
 * is the § D152 defence at the member level: there is no list here to forget to update, only a map
 * that must cover whatever the table contains.
 */
const CASES: Readonly<Record<AwtInvalidGround, GroundCase>> = {
  saturated: {
    evidence: cleanEvidence({ saturation: saturation({ saturated: true, verdict: 'diverging-queue' }) }),
    reason:
      "Queue length rose by 12.0 persons (2.40/min, 6.0x the queue's own scatter) over the 300 s " +
      'reporting window, against thresholds 8 persons and 0.5/min; the system is saturated, AWT is ' +
      'not approximately normal and its confidence interval must be suppressed.',
  },
  'empty-window': {
    evidence: cleanEvidence({
      waiting: waiting({ count: 0, arrivalCount: 20, unservedCount: 20 }),
      unservedFraction: 1,
    }),
    reason:
      'No passenger was served within the reporting window, so there is no waiting time to average.',
  },
  censored: {
    evidence: cleanEvidence({
      waiting: waiting({ count: 17, arrivalCount: 20, unservedCount: 3 }),
      unservedFraction: 0.15,
    }),
    reason:
      '3 of 20 arrivals in the reporting window (15.0%) were never served, above the 5.0% ' +
      'censoring limit. AWT is the mean over the legs that boarded, which are systematically the ' +
      'passengers who waited least, so the reported mean is biased low by an unknown amount and ' +
      'its confidence interval must be suppressed.',
  },
  starved: {
    evidence: cleanEvidence({
      serviceLevel: serviceLevel({
        verdict: 'starved',
        starved: true,
        longestWaitS: 950,
        overHorizonCount: 1,
      }),
    }),
    reason:
      'Leg "p-9" (G to 10) waited 950.0 s, past the 900 s abandonment horizon; 1 of 20 arrivals ' +
      'in the reporting window are past it. The queue did not diverge and the window is not ' +
      'censored, so neither of those gates fires — but a mean of 42.5 s reported beside a wait of ' +
      '950.0 s describes a system nobody experienced, and its confidence interval must be ' +
      'suppressed.',
  },
};

describe('every ground is enumerated, reachable, and worded', () => {
  it('the enumeration and the cases cover each other exactly', () => {
    // The type makes a missing case a compile error; this makes a *stale* case a test failure,
    // which the type cannot see. A ground deleted from the spec table leaves an orphan here.
    expect([...Object.keys(CASES)].sort()).toEqual([...AWT_INVALID_GROUNDS].sort());
    // Not vacuous: an emptied enumeration would satisfy the line above against an emptied map.
    expect(AWT_INVALID_GROUNDS.length).toBeGreaterThan(3);
  });

  it('the codes are distinct, so no two grounds are indistinguishable to a consumer', () => {
    expect(new Set(AWT_INVALID_GROUNDS).size).toBe(AWT_INVALID_GROUNDS.length);
  });

  for (const ground of AWT_INVALID_GROUNDS) {
    it(`${ground} fires with its own sentence, and the sentence is not the code`, () => {
      const expected = CASES[ground];
      const verdict = diagnoseAwtValidity(expected.evidence);
      expect(verdict).toBeDefined();
      expect(verdict?.ground).toBe(ground);
      expect(verdict?.reason).toBe(expected.reason);
      /*
       * The prose is prose — a code substituted for it would pass a `toBeDefined` and nothing else.
       * Not `not.toContain(ground)`, which was the first form of this line and was wrong: the
       * saturation sentence contains the word *saturated* legitimately, and it says so precisely
       * because that is the honest word for what happened.
       */
      expect(verdict?.reason).not.toBe(ground);
      expect(verdict?.reason ?? '').toMatch(/[a-z]{2,} [a-z]{2,}/);
      expect(verdict?.reason.endsWith('.')).toBe(true);
      expect(verdict?.reason.length).toBeGreaterThan(60);
    });
  }

  it('the four sentences are four different sentences', () => {
    const reasons = AWT_INVALID_GROUNDS.map((ground) => CASES[ground].reason);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe('nothing fires when the mean is quotable', () => {
  it('returns undefined, so there is no code and no prose to show', () => {
    expect(diagnoseAwtValidity(cleanEvidence())).toBeUndefined();
  });

  it('censoring exactly at the limit is inside it — the comparison is strict', () => {
    // `unservedFraction > maxUnservedFraction`, not `>=`. Pinned because flipping it would refuse
    // every whole-run window that ends with one passenger still on a landing.
    expect(diagnoseAwtValidity(cleanEvidence({ unservedFraction: 0.05 }))).toBeUndefined();
    expect(diagnoseAwtValidity(cleanEvidence({ unservedFraction: 0.050_000_1 }))?.ground).toBe(
      'censored',
    );
  });
});

describe('the order of the table is the precedence, and the precedence is asserted', () => {
  it('a run tripping all four reports the most fundamental one', () => {
    const all = cleanEvidence({
      saturation: saturation({ saturated: true, verdict: 'diverging-queue' }),
      waiting: waiting({ count: 0, arrivalCount: 20, unservedCount: 20 }),
      unservedFraction: 1,
      serviceLevel: serviceLevel({ verdict: 'starved', starved: true, longestWaitS: 950, overHorizonCount: 20 }),
    });
    expect(diagnoseAwtValidity(all)?.ground).toBe('saturated');
  });

  it('emptiness beats censoring — the code has always done this, and the docstring used to disagree', () => {
    /*
     * The observable disagreement `RunSummary.awtIsValid`'s docstring had until this change: it
     * numbered censoring second and emptiness third and said the four were evaluated in that
     * order. Nobody boarded *and* the window is badly censored is the case that distinguishes
     * them, and the run reports emptiness.
     */
    const nobodyServed = cleanEvidence({
      waiting: waiting({ count: 0, arrivalCount: 20, unservedCount: 20 }),
      unservedFraction: 1,
    });
    expect(diagnoseAwtValidity(nobodyServed)?.ground).toBe('empty-window');
  });

  it('censoring beats starvation', () => {
    const both = cleanEvidence({
      unservedFraction: 0.5,
      serviceLevel: serviceLevel({ verdict: 'starved', starved: true, longestWaitS: 950, overHorizonCount: 4 }),
    });
    expect(diagnoseAwtValidity(both)?.ground).toBe('censored');
  });
});

describe('the classifier is pure — CLAUDE.md invariants 1, 2 and 3, one layer down', () => {
  it('does not touch the evidence it was given', () => {
    const evidence = CASES.starved.evidence;
    const before = JSON.stringify(evidence);
    void diagnoseAwtValidity(evidence);
    expect(JSON.stringify(evidence)).toBe(before);
  });

  it('gives the same answer twice, so nothing in it reads a clock or draws a number', () => {
    const first = diagnoseAwtValidity(CASES.censored.evidence);
    const second = diagnoseAwtValidity(CASES.censored.evidence);
    expect(second).toEqual(first);
  });

  it('names the censored tail as a lower bound when the longest wait never boarded', () => {
    // The one conditional inside a sentence. Dropping it would report a censored wait as a
    // measured one, which understates precisely where service is worst.
    const verdict = diagnoseAwtValidity(
      cleanEvidence({
        serviceLevel: serviceLevel({
          verdict: 'starved',
          starved: true,
          longestWaitS: 950,
          longestWaitIsCensored: true,
          overHorizonCount: 1,
        }),
      }),
    );
    expect(verdict?.ground).toBe('starved');
    expect(verdict?.reason).toContain(
      'and had still not boarded when the run ended, so that is a lower bound',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The seam: `summarizeRun` publishes both halves, or neither
 * -------------------------------------------------------------------------- */

function leg(overrides: Partial<PassengerRecord> & { passengerId: string }): PassengerRecord {
  return {
    journeyId: overrides.passengerId,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 75,
    arrivedAt: 0,
    journeyStartedAt: overrides.arrivedAt ?? 0,
    ...overrides,
  };
}

function record(passengers: readonly PassengerRecord[], endedAt = 1800): RunRecord {
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    runId: 'run-1',
    seed: '20260726',
    startedAt: 0,
    endedAt,
    passengers,
    loadSamples: [],
    queueSamples: [],
  };
}

describe('summarizeRun carries the ground beside the prose', () => {
  it('publishes both when it refuses, and the ground is a member of the enumeration', () => {
    // Nobody boarded: `empty-window`, and the run is also badly censored — see the precedence.
    const summary = summarizeRun(record([leg({ passengerId: 'p-0' })]), { window: 'full-run' });
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidGround).toBe('empty-window');
    expect(AWT_INVALID_GROUNDS as readonly string[]).toContain(summary.awtInvalidGround);
    expect(summary.awtInvalidReason).toBe(CASES['empty-window'].reason);
  });

  it('publishes neither when it does not refuse', () => {
    const passengers = Array.from({ length: 40 }, (_, i) =>
      leg({ passengerId: `p-${String(i)}`, arrivedAt: i * 10, boardedAt: i * 10 + 12, alightedAt: i * 10 + 40 }),
    );
    const summary = summarizeRun(record(passengers, 600), { window: 'full-run' });
    expect(summary.awtIsValid).toBe(true);
    expect(summary.awtInvalidGround).toBeUndefined();
    expect(summary.awtInvalidReason).toBeUndefined();
    // Not vacuous: the run really did produce a mean.
    expect(summary.waiting.meanS).toBeCloseTo(12, 6);
  });

  it('reports starvation with its code on a run that satisfies the other three gates', () => {
    /*
     * The ground the fourth gate exists for: everybody boarded, nothing is censored, the queue is
     * not diverging, and one passenger stood on a landing for longer than the horizon. Constructed
     * rather than found, because a run that does this is by construction rare.
     */
    const passengers = [
      ...Array.from({ length: 39 }, (_, i) =>
        leg({ passengerId: `p-${String(i)}`, arrivedAt: i * 10, boardedAt: i * 10 + 12, alightedAt: i * 10 + 40 }),
      ),
      leg({ passengerId: 'p-late', arrivedAt: 100, boardedAt: 1050, alightedAt: 1080 }),
    ];
    const summary = summarizeRun(record(passengers, 1800), { window: 'full-run' });
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidGround).toBe('starved');
    expect(summary.awtInvalidReason).toContain('abandonment horizon');
  });
});
