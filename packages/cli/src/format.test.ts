import type { IntervalStatistics, RunSummary, ServiceLevelDiagnosis } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import {
  ABSENT,
  bar,
  clock,
  count,
  duration,
  fractionAsPct,
  num,
  pct,
  renderAchievedInterval,
  renderAwt,
  renderLongestWait,
  renderRunningMean,
  renderEstimate,
  renderSaturation,
  renderSignedEstimate,
  secs,
  signed,
} from './format.js';

/**
 * Minimal stand-ins.
 *
 * The renderers read a handful of fields each, and building a whole `RunSummary` literal here
 * would test the fixture rather than the rendering. The casts are confined to these two
 * builders; every assertion below goes through the real exported function.
 */
function interval(partial: Partial<IntervalStatistics>): IntervalStatistics {
  return {
    count: 0,
    meanS: Number.NaN,
    stdDevS: Number.NaN,
    minS: Number.NaN,
    medianS: Number.NaN,
    p90S: Number.NaN,
    p95S: Number.NaN,
    p99S: Number.NaN,
    maxS: Number.NaN,
    percentileMethod: 'linear',
    departureCount: 0,
    carCount: 0,
    boardingCount: 0,
    coefficientOfVariation: Number.NaN,
    departureGapS: Number.NaN,
    departureGapBasis: 'derived',
    ...partial,
  } as IntervalStatistics;
}

function summary(partial: {
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string;
  readonly meanS?: number;
  readonly saturated?: boolean;
  readonly serviceLevel?: Partial<ServiceLevelDiagnosis>;
}): RunSummary {
  return {
    awtIsValid: partial.awtIsValid,
    awtInvalidReason: partial.awtInvalidReason,
    waiting: { meanS: partial.meanS ?? Number.NaN },
    saturation: {
      saturated: partial.saturated ?? false,
      slopePersonsPerMinute: 3.25,
      sampleCount: 120,
      rSquared: 0.914,
      maxQueueLength: 87,
    },
    serviceLevel: {
      verdict: 'served',
      starved: false,
      horizonS: 900,
      longestWaitS: 41.2,
      longestWaitIsCensored: false,
      longestWaitLegId: 'p7',
      longestWaitOriginFloorId: 'G',
      longestWaitDestinationFloorId: '12',
      overHorizonCount: 0,
      arrivalCount: 220,
      censoredAtS: 1800,
      ...partial.serviceLevel,
    },
  } as unknown as RunSummary;
}

describe('numbers', () => {
  it('never prints floating-point noise', () => {
    expect(num(16.4499999999, 2)).toBe('16.45');
    expect(num(16.4499999999, 1)).toBe('16.4');
    expect(secs(16.4499999999)).toBe('16.4 s');
  });

  it('renders an absent measurement as a dash, never as zero', () => {
    expect(num(Number.NaN)).toBe(ABSENT);
    expect(secs(Number.NaN)).toBe(ABSENT);
    expect(pct(Number.POSITIVE_INFINITY)).toBe(ABSENT);
    expect(fractionAsPct(Number.NaN)).toBe(ABSENT);
    expect(count(Number.NaN)).toBe(ABSENT);
  });

  it('does not print a negative zero', () => {
    expect(num(-0.0004, 2)).toBe('0.00');
  });

  it('keeps the sign on a difference that rounds to zero', () => {
    expect(signed(-0.0004, 2)).toBe('-0.00');
    expect(signed(0.0004, 2)).toBe('+0.00');
    expect(signed(0, 2)).toBe('0.00');
    expect(signed(-2.5)).toBe('-2.50');
  });

  it('formats percentages and fractions with their units', () => {
    expect(pct(2.125, 1)).toBe('2.1 %');
    expect(fractionAsPct(0.8, 0)).toBe('80 %');
  });

  it('formats clocks and durations', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
    expect(duration(90)).toBe('90 s');
    expect(duration(1800)).toBe('30 min');
  });

  it('renders a load bar of the requested width', () => {
    expect(bar(0, 4)).toBe('····');
    expect(bar(1, 4)).toBe('████');
    expect(bar(0.5, 4)).toBe('██··');
    expect(bar(Number.NaN, 3)).toBe('   ');
  });
});

describe('intervals never appear without their bounds', () => {
  it('renders a mean with its confidence interval', () => {
    expect(renderEstimate(18.4212, 17.1, 19.74, { digits: 2, unit: 's' })).toBe(
      '18.42 s  [17.10, 19.74]',
    );
  });

  it('says so rather than printing a bare mean when there is no interval', () => {
    const text = renderEstimate(18.42, Number.NaN, Number.NaN, { digits: 2, unit: 's' });
    expect(text).toContain('interval unavailable');
  });

  it('signs both the difference and its bounds', () => {
    expect(renderSignedEstimate(-3.15, -4.33, -1.98, { digits: 2, unit: 's' })).toBe(
      '-3.15 s  [-4.33, -1.98]',
    );
  });
});

describe('renderAwt — the saturated case', () => {
  it('prints the number when the run is reportable', () => {
    const rendered = renderAwt(summary({ awtIsValid: true, meanS: 14.8231 }));
    expect(rendered.quotable).toBe(true);
    expect(rendered.text).toBe('14.82 s');
  });

  it('prints SUPPRESSED with no digits at all when it is not', () => {
    const rendered = renderAwt(
      summary({
        awtIsValid: false,
        awtInvalidReason: 'the queue diverged over the window',
        meanS: 788.4,
        saturated: true,
      }),
    );
    expect(rendered.quotable).toBe(false);
    expect(rendered.text).toBe('SUPPRESSED');
    expect(rendered.text).not.toMatch(/\d/);
    expect(rendered.reason).toContain('diverged');
  });

  it('refuses a mean when nobody was served, rather than reporting zero', () => {
    const rendered = renderAwt(summary({ awtIsValid: true, meanS: Number.NaN }));
    expect(rendered.quotable).toBe(false);
    expect(rendered.text).toBe(ABSENT);
  });
});

describe('renderRunningMean — T29/D1, the live figure `watch` used to print unconditionally', () => {
  /*
   * `commands/watch.ts` printed `mean wait so far 41.5 s` on both of its render paths for the
   * whole of a run whose report, seconds later on the same terminal, said `AWT  SUPPRESSED`.
   * Being a *running* figure rather than the windowed AWT does not rescue it: it is a mean of the
   * same waits over the same run, and docs/03 forbids a mean for a queue that did not settle.
   */
  it('prints the running figure it was handed, not a constant', () => {
    const at = (value: number, unit = true): string =>
      renderRunningMean(summary({ awtIsValid: true }), value, { unit }).text;
    expect(renderRunningMean(summary({ awtIsValid: true }), 41.52).quotable).toBe(true);
    expect(at(41.52)).toBe('41.5 s');
    // A second value, because one is a constant with extra steps — this package has shipped a
    // frame seven of whose eight fields could be literals with the suite still green.
    expect(at(7.04)).toBe('7.0 s');
    expect(at(41.52, false)).toBe('41.5');
    expect(at(7.04, false)).toBe('7.0');
  });

  it('prints SUPPRESSED with no digits at all when it does not', () => {
    const rendered = renderRunningMean(
      summary({ awtIsValid: false, awtInvalidReason: 'the queue diverged over the window' }),
      41.52,
    );
    expect(rendered.quotable).toBe(false);
    expect(rendered.text).toBe('SUPPRESSED');
    expect(rendered.text).not.toMatch(/\d/);
    expect(rendered.reason).toContain('diverged');
    // …on both call sites, so the tabular fallback cannot keep its own opinion.
    expect(
      renderRunningMean(summary({ awtIsValid: false }), 41.52, { unit: false }).text,
    ).not.toMatch(/\d/);
  });

  it('still says "nobody yet" rather than "not admissible" on a reportable run', () => {
    // Two different facts. An em dash means nobody has been served; SUPPRESSED means the figure
    // exists and may not be quoted. Collapsing them would be a smaller lie in place of a larger.
    const rendered = renderRunningMean(summary({ awtIsValid: true }), Number.NaN);
    expect(rendered.text).toBe(ABSENT);
    expect(rendered.quotable).toBe(false);
  });
});

describe('renderLongestWait — an observation, never suppressed', () => {
  it('reports the longest wait and names the passenger on a healthy run', () => {
    const rendered = renderLongestWait(summary({ awtIsValid: true, meanS: 12 }));
    expect(rendered?.quotable).toBe(true);
    expect(rendered?.text).toBe('41.2 s (leg p7, G to 12)');
  });

  /**
   * The regression this renderer exists for. The report used to print the word SUPPRESSED here,
   * off `waiting.maxS`, which removed the evidence at exactly the moment it mattered: on a run
   * suppressed *because* somebody waited a quarter of an hour, the longest wait is the finding.
   */
  it('still prints the digits when the mean is suppressed, because the tail is the evidence', () => {
    const rendered = renderLongestWait(
      summary({
        awtIsValid: false,
        awtInvalidReason: 'past the abandonment horizon',
        meanS: 172.1,
        serviceLevel: {
          verdict: 'starved',
          starved: true,
          longestWaitS: 922.7,
          longestWaitLegId: 'p106',
          longestWaitOriginFloorId: '13',
          longestWaitDestinationFloorId: 'G',
          overHorizonCount: 2,
          arrivalCount: 177,
        },
      }),
    );
    expect(rendered?.quotable).toBe(false);
    expect(rendered?.text).toBe('922.7 s (leg p106, 13 to G)');
    expect(rendered?.reason).toContain('900 s abandonment horizon');
    expect(rendered?.reason).toContain('2 of 177 arrivals in the window.');
  });

  it('says so when the figure is a lower bound because the passenger never boarded', () => {
    const rendered = renderLongestWait(
      summary({
        awtIsValid: false,
        serviceLevel: {
          verdict: 'starved',
          starved: true,
          longestWaitS: 1350,
          longestWaitIsCensored: true,
          overHorizonCount: 1,
        },
      }),
    );
    expect(rendered?.text).toBe('at least 1350.0 s (leg p7, G to 12)');
  });

  it('is silent when the window held no arrivals, rather than printing a zero', () => {
    const rendered = renderLongestWait(
      summary({
        awtIsValid: true,
        serviceLevel: { verdict: 'no-arrivals', longestWaitS: Number.NaN, arrivalCount: 0 },
      }),
    );
    expect(rendered).toBeUndefined();
  });
});

describe('renderSaturation', () => {
  it('is silent for a healthy run', () => {
    expect(renderSaturation(summary({ awtIsValid: true, meanS: 12 }))).toBeUndefined();
  });

  it('quantifies the divergence for a saturated one', () => {
    const line = renderSaturation(summary({ awtIsValid: false, saturated: true }));
    expect(line).toContain('3.25 persons/min');
    expect(line).toContain('87 waiting');
  });
});

describe('renderAchievedInterval — the unmeasurable case', () => {
  it('prints the measured interval with its provenance', () => {
    const rendered = renderAchievedInterval(
      interval({
        meanS: 62.1234,
        coefficientOfVariation: 0.4412,
        departureCount: 9,
        departureGapBasis: 'derived',
      }),
    );
    expect(rendered.quotable).toBe(true);
    expect(rendered.text).toContain('62.1 s');
    expect(rendered.text).toContain('CoV 0.44');
    expect(rendered.text).toContain('9 departures');
    expect(rendered.text).toContain('derived');
  });

  it('prints the word "unmeasurable" and no number for a building that has no valid threshold', () => {
    const rendered = renderAchievedInterval(
      interval({ departureGapBasis: 'unmeasurable', meanS: Number.NaN }),
    );
    expect(rendered.quotable).toBe(false);
    expect(rendered.text).toBe('unmeasurable');
    expect(rendered.text).not.toMatch(/\d/);
    expect(rendered.reason).toContain('door reopen');
  });

  it('explains too-few-departures separately from unmeasurable', () => {
    const rendered = renderAchievedInterval(
      interval({ departureGapBasis: 'derived', meanS: Number.NaN, departureCount: 1 }),
    );
    expect(rendered.quotable).toBe(false);
    expect(rendered.text).toBe(ABSENT);
    expect(rendered.reason).toContain('too few gaps');
  });
});
