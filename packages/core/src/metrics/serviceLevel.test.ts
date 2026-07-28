/**
 * The fourth `awtIsValid` gate: a backlog that cleared, but not before somebody was abandoned.
 *
 * ## What this is a regression on
 *
 * The counterexample is `fuzz-1001074`, found by the Phase 8 property campaign's deep tier and
 * handed back to `core` by `validation/the root DECISIONS.md` § D83. Its shrunk form is an eleven-floor,
 * single-bank, single-car, all-in-service building at 6.1 % of population per 5 minutes, and it
 * reported:
 *
 * ```
 * verdict   stable            awtIsValid  true
 * slope     0.416 persons/min (gate is 0.5)     growth   11.20 persons (gate is 8)
 * g2n       1.32              (gate is 4)       t        3.71          (gate is 2)
 * AWT       172.07 s          median 101.79 s   p95 686.43 s   max 922.65 s
 * unserved  0 of 177          status completed  queue mean 20.8, peak 41, drained to 0
 * ```
 *
 * Two people waited **922.7 s** and the run published a mean. It escaped the trend gate because
 * the queue rose to 41 and came back — a hump fits a shallow line with large residuals, which is
 * the *false negative* twin of the false positive `SaturationThresholds` already documents — and
 * it escaped the censoring gate because everybody was eventually collected. The two existing gates
 * are both proxies for "did the backlog clear?" and neither sees a backlog that cleared *late*.
 *
 * ## What is asserted here, and in which direction
 *
 * A suppression rule that fires everywhere computes nothing, so both directions are load-bearing:
 * the gate must fire on a queue that cleared late, and must **not** fire on the same cohort a
 * few seconds under the horizon, on an ordinary run, or on the run's own tail statistics.
 * `benchmark/saturationCensus.test.ts` carries the same obligation against the shipped operating
 * points, at their own budgets.
 */

import { describe, expect, it } from 'vitest';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import {
  DEFAULT_MAX_WAIT_HORIZON_S,
  diagnoseServiceLevel,
  summarizeRun,
} from './summarize.js';
import { MetricsError, SERVICE_LEVEL_VERDICTS, type PassengerRecord } from './types.js';

function arrival(overrides: Partial<RecordablePassenger> & { id: string }): RecordablePassenger {
  return {
    journeyId: overrides.id,
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

function leg(overrides: Partial<PassengerRecord> & { passengerId: string }): PassengerRecord {
  return {
    journeyId: overrides.passengerId,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: '13',
    destinationFloorId: 'G',
    finalDestinationFloorId: 'G',
    direction: 'down',
    massKg: 75,
    arrivedAt: 0,
    journeyStartedAt: overrides.arrivedAt ?? 0,
    ...overrides,
  };
}

/**
 * A run whose queue **cleared**, with one passenger left on a landing for `worstWaitS`.
 *
 * Deliberately built so neither existing gate can fire: everybody boards (nought censored), and
 * the waits are drawn so that the queue is not monotonically rising over the window. The whole
 * point of the counterexample is that it is invisible to the trend and to the censoring test.
 */
function recordWithWorstWait(worstWaitS: number, cohort = 40): ReturnType<MetricsRecorder['finish']> {
  const recorder = new MetricsRecorder({ seed: 20260728, runId: 'late-clearing-backlog' });
  for (let i = 0; i < cohort; i += 1) {
    const id = `p${i}`;
    const arrivedAt = i * 10;
    // A hump: waits rise into the middle of the cohort and fall away again, so the fitted queue
    // trend is shallow and its residual scatter is large.
    const half = cohort / 2;
    const waitS = 20 + (half - Math.abs(i - half)) * 4;
    recorder.recordArrival(arrival({ id, arrivedAt, originFloorId: '13', destinationFloorId: 'G' }));
    recorder.recordBoarding(id, arrivedAt + waitS);
    recorder.recordAlighting(id, arrivedAt + waitS + 40);
  }
  const worstId = 'worst';
  recorder.recordArrival(
    arrival({ id: worstId, arrivedAt: 100, originFloorId: '13', destinationFloorId: 'G' }),
  );
  recorder.recordBoarding(worstId, 100 + worstWaitS);
  recorder.recordAlighting(worstId, 100 + worstWaitS + 40);
  return recorder.finish(100 + worstWaitS + 200);
}

describe('diagnoseServiceLevel — the longest wait, with the unserved counted at their lower bound', () => {
  it('reports the longest served wait, and names the passenger', () => {
    const level = diagnoseServiceLevel(
      [
        leg({ passengerId: 'a', arrivedAt: 0, boardedAt: 30 }),
        leg({ passengerId: 'b', arrivedAt: 10, boardedAt: 210, originFloorId: '7' }),
        leg({ passengerId: 'c', arrivedAt: 20, boardedAt: 60 }),
      ],
      { censoredAtS: 1000 },
    );
    expect(level.longestWaitS).toBe(200);
    expect(level.longestWaitLegId).toBe('b');
    expect(level.longestWaitOriginFloorId).toBe('7');
    expect(level.longestWaitIsCensored).toBe(false);
    expect(level.verdict).toBe('served');
    expect(level.starved).toBe(false);
    expect(level.arrivalCount).toBe(3);
    expect(level.overHorizonCount).toBe(0);
  });

  it('counts a leg that never boarded at its lower bound, and says the figure is one', () => {
    const level = diagnoseServiceLevel(
      [
        leg({ passengerId: 'served', arrivedAt: 0, boardedAt: 300 }),
        leg({ passengerId: 'abandoned', arrivedAt: 50 }),
      ],
      { censoredAtS: 1400 },
    );
    // 1400 - 50 = 1350, a floor on what that passenger actually waited.
    expect(level.longestWaitS).toBe(1350);
    expect(level.longestWaitLegId).toBe('abandoned');
    expect(level.longestWaitIsCensored).toBe(true);
    expect(level.verdict).toBe('starved');
    expect(level.overHorizonCount).toBe(1);
  });

  it('is strict at the horizon: exactly 900 s is not past it', () => {
    const at = diagnoseServiceLevel([leg({ passengerId: 'a', arrivedAt: 0, boardedAt: 900 })], {
      censoredAtS: 2000,
    });
    expect(at.longestWaitS).toBe(DEFAULT_MAX_WAIT_HORIZON_S);
    expect(at.verdict).toBe('served');

    const past = diagnoseServiceLevel(
      [leg({ passengerId: 'a', arrivedAt: 0, boardedAt: 900.001 })],
      { censoredAtS: 2000 },
    );
    expect(past.verdict).toBe('starved');
  });

  it('breaks ties toward the first leg in record order, so the named passenger is deterministic', () => {
    const level = diagnoseServiceLevel(
      [
        leg({ passengerId: 'first', arrivedAt: 0, boardedAt: 500 }),
        leg({ passengerId: 'second', arrivedAt: 100, boardedAt: 600 }),
      ],
      { censoredAtS: 2000 },
    );
    expect(level.longestWaitLegId).toBe('first');
  });

  it('reports no-arrivals rather than a zero for an empty cohort', () => {
    const level = diagnoseServiceLevel([], { censoredAtS: 100 });
    expect(level.verdict).toBe('no-arrivals');
    expect(level.starved).toBe(false);
    expect(Number.isNaN(level.longestWaitS)).toBe(true);
    expect(level.longestWaitLegId).toBeUndefined();
  });

  it('refuses a horizon that is not a finite, non-negative number of seconds', () => {
    expect(() => diagnoseServiceLevel([], { censoredAtS: 0, horizonS: -1 })).toThrow(MetricsError);
    expect(() => diagnoseServiceLevel([], { censoredAtS: 0, horizonS: Number.NaN })).toThrow(
      MetricsError,
    );
  });

  it('declares every verdict it can return', () => {
    expect([...SERVICE_LEVEL_VERDICTS].sort()).toEqual(['no-arrivals', 'served', 'starved']);
  });
});

describe('awtIsValid — the gate fires on a backlog that cleared late, and only then', () => {
  it('suppresses a run whose queue did not diverge and whose window is not censored', () => {
    const summary = summarizeRun(recordWithWorstWait(950), { window: 'full-run' });

    // Neither existing gate fires. That is the whole point of the counterexample.
    expect(summary.saturation.verdict).toBe('stable');
    expect(summary.saturation.saturated).toBe(false);
    expect(summary.counts.unserved).toBe(0);

    expect(summary.serviceLevel.verdict).toBe('starved');
    expect(summary.serviceLevel.longestWaitS).toBeCloseTo(950, 9);
    expect(summary.serviceLevel.longestWaitLegId).toBe('worst');
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/abandonment horizon/);
    expect(summary.awtInvalidReason).toMatch(/"worst"/);
    expect(summary.awtInvalidReason).toMatch(/950\.0 s/);
  });

  it('leaves the same cohort quotable when the worst wait is under the horizon', () => {
    const summary = summarizeRun(recordWithWorstWait(850), { window: 'full-run' });
    expect(summary.saturation.verdict).toBe('stable');
    expect(summary.serviceLevel.verdict).toBe('served');
    expect(summary.serviceLevel.longestWaitS).toBeCloseTo(850, 9);
    expect(summary.awtIsValid).toBe(true);
    expect(summary.awtInvalidReason).toBeUndefined();
  });

  it('is a tunable, so the horizon can be re-thresholded on a stored run without re-simulating', () => {
    const record = recordWithWorstWait(850);
    expect(summarizeRun(record, { window: 'full-run' }).awtIsValid).toBe(true);
    const strict = summarizeRun(record, { window: 'full-run', maxWaitHorizonS: 600 });
    expect(strict.serviceLevel.horizonS).toBe(600);
    expect(strict.awtIsValid).toBe(false);
  });

  it('yields to saturation and to censoring, so an already-suppressed run keeps its reason', () => {
    // Every leg unserved: censoring dominates, and the reason must still be the censoring one
    // rather than the tail — a run tripping several gates should report the most fundamental.
    const recorder = new MetricsRecorder({ seed: 1, runId: 'censored' });
    for (let i = 0; i < 20; i += 1) {
      recorder.recordArrival(arrival({ id: `p${i}`, arrivedAt: i }));
    }
    recorder.recordArrival(arrival({ id: 'one', arrivedAt: 0 }));
    recorder.recordBoarding('one', 10);
    recorder.recordAlighting('one', 50);
    const summary = summarizeRun(recorder.finish(2000), { window: 'full-run' });
    expect(summary.serviceLevel.verdict).toBe('starved');
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/censoring limit/);
    expect(summary.awtInvalidReason).not.toMatch(/abandonment horizon/);
  });

  it('does not fire on an ordinary run', () => {
    const recorder = new MetricsRecorder({ seed: 2, runId: 'ordinary' });
    for (let i = 0; i < 50; i += 1) {
      const id = `p${i}`;
      recorder.recordArrival(arrival({ id, arrivedAt: i * 5 }));
      recorder.recordBoarding(id, i * 5 + 15 + (i % 7));
      recorder.recordAlighting(id, i * 5 + 60);
    }
    const summary = summarizeRun(recorder.finish(600), { window: 'full-run' });
    expect(summary.serviceLevel.verdict).toBe('served');
    expect(summary.serviceLevel.longestWaitS).toBeLessThan(30);
    expect(summary.awtIsValid).toBe(true);
  });
});
