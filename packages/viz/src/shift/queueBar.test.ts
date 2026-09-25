/**
 * **The queue goal grades a whole day with the slice's own ladder, pinned to one run on each
 * horizon** — [§ D1085](../../../../DECISIONS.md).
 *
 * § D1085 ruled, three members of three, that the queue goal keeps `max(12, 34 − 2d)` on both
 * horizons: no whole-day constant, no factor, no window and no withholding. The ground is a
 * measurement rather than an argument, and the claim this file pins is the one a later change could
 * silently falsify: **a whole authored day does not grade the queue harder than the slice does.**
 * `peakQueue` is the deepest single landing over the **whole run** on both horizons
 * (`live/observations.ts#sweepQueues`) and never reads the reporting window, which is why
 * [§ D962](../../../../DECISIONS.md)'s defect, one constant grading a window that grew from 300 s to 36 000 s,
 * has no queue analogue. `goals.test.ts` asserts the ladder is horizon-blind; this file asserts the
 * quantity it grades still behaves as the ruling measured it, on the cell the engineering member
 * named.
 *
 * ## The cell
 *
 * `c6` `chancery-house` as its contract hands it over, seed `20 260 824` (`n = 0` of `docs/33`
 * § 4.6's sequence), day 1, ordinary, through `dev/state.ts#shiftRunConfigOf` → `recordRun` →
 * `observationsAt(recording, endedAt)` → `readGoals(goalsForDay(1, runHorizonOf(…)))`. The slice is
 * the contract's own 1 800 s `rise-and-fall`; the whole day is the 36 000 s `office-day` Today's
 * scenario plays (`contractDay.test-helper.ts#todaysScenarioDayState`).
 *
 * - **`collective`**, the shipped default: the slice stacks **43** at one landing and misses 32; the
 *   whole day stacks **29** and meets it. A crowd on which the slice is the harder horizon, which is
 *   the direction the ruling measured on five of the six game contracts at day 1.
 * - **`nearest-car`** on the same whole day: **128**, missing by a factor of four, with every
 *   arriving rider carried and the same legs delivered as `collective`'s. That is § D106's half: the
 *   arm that drives least cannot pass this bar by leaving people behind, because a rider left
 *   standing stays in the depth (`goals.ts#ABANDONMENT_FLATTERS.peakQueue` is `false`).
 *
 * `c6` rather than the honesty member's `c9` for the second pin, on cost and on pairing: it reuses
 * the building the first pin already loaded, it is the same crowd `collective` is pinned on so the
 * two whole days differ by the dispatcher alone, and its whole day is about half of `c9`'s wall
 * clock (measured 4.6 s against 7.5 s median under load). The honesty member's `c9` reading (peak
 * 110 to 178, missed on 25 of 25) is in `shift/queueBar.sweep.test.ts`'s § D106 arm.
 *
 * ## What would make these pins fail, and what that would mean
 *
 * A change that deepens a whole day's queue past the slice on this crowd reddens the first case,
 * and the ruling's *not harsher* reading has to be re-measured with `QUEUE_BAR_SWEEP=1` before
 * anybody reaches for a second bar. A change that lets `nearest-car` meet the queue goal on this
 * day, or carry fewer people than `collective` while its depth falls, reddens the second, which is
 * the perverse ranking § D106 forbids arriving through this bar.
 *
 * Three runs, about **8 s** of simulation on a quiet box and under 30 s at the load the ruling was
 * measured at, all under the `viz` project's own 300 000 ms ceiling, so nothing here is annotated.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, contractDayState, todaysScenarioDayState } from './contractDay.test-helper.js';
import { runHorizonOf } from './dayLength.js';
import { GOAL_BARS, goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import type { RunHorizon } from './types.js';

/** `docs/33` § 4.6's sequence at `n = 0`. */
const SEED = 20_260_824n;

interface Graded {
  readonly horizon: RunHorizon;
  readonly peakQueue: number;
  readonly queue: string;
  readonly queueBar: number;
  readonly carryPct: number;
  readonly carried: number;
  readonly arrived: number;
  readonly legs: number;
}

let resources: BrowserResources;

beforeAll(() => {
  resources = contractBuildings();
});

/** One day, run and graded exactly as the shipped path grades it. */
function grade(state: ViewerState): Graded {
  const plan = shiftRunConfigOf(resources, state);
  const { recording } = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    resources.trafficProfiles,
    buildingConfigOf(resources, state.savedBuildings, state.buildingId),
    state,
  );
  const reading = readGoals(goalsForDay(1, horizon), observations).find(
    (entry) => entry.goal.id === 'queue',
  );
  if (reading === undefined) throw new Error('no queue goal on day 1');
  return {
    horizon,
    peakQueue: observations.peakQueue,
    queue: reading.state,
    queueBar: reading.goal.bar,
    carryPct: observations.carryPct,
    carried: observations.carried,
    arrived: observations.arrived,
    legs: recording.legs.length,
  };
}

/** The whole day, once per dispatcher: both cases read `collective`'s, and it is not run twice. */
const wholeDays = new Map<string, Graded>();
function wholeDay(dispatcherId: string): Graded {
  const known = wholeDays.get(dispatcherId);
  if (known !== undefined) return known;
  const graded = grade(todaysScenarioDayState(resources, 'c6', { seed: SEED, dispatcherId }).state);
  wholeDays.set(dispatcherId, graded);
  return graded;
}

describe('the queue goal on one crowd at both horizons — § D1085', () => {
  it('reads 43 on the slice and misses, and 29 over the whole day and meets, on the same bar', () => {
    const slice = grade(contractDayState('c6', { seed: SEED }));
    const whole = wholeDay('collective');

    expect(slice.horizon).toBe('period');
    expect(whole.horizon).toBe('whole-day');
    // One ladder: the same bar on both horizons, and it is the ladder's day-1 rung.
    expect(whole.queueBar).toBe(slice.queueBar);
    expect(slice.queueBar).toBe(GOAL_BARS.queueBase - GOAL_BARS.queuePerDay);

    expect(slice.peakQueue).toBe(43);
    expect(slice.queue).toBe('missed');
    expect(whole.peakQueue).toBe(29);
    expect(whole.queue).toBe('met');
    // The whole day is not the harsher horizon on this crowd, which is the ruling's reading.
    expect(whole.peakQueue).toBeLessThan(slice.peakQueue);
  });

  it('misses with nearest-car on the same whole day, carrying everybody collective carries', () => {
    const collective = wholeDay('collective');
    const nearest = wholeDay('nearest-car');

    expect(nearest.horizon).toBe('whole-day');
    expect(nearest.peakQueue).toBe(128);
    expect(nearest.queue).toBe('missed');
    expect(nearest.peakQueue).toBeGreaterThan(collective.peakQueue);
    // § D106: the depth is not bought by leaving people behind. Same crowd, same legs, and the
    // arm that stacks deepest carries exactly as many as the arm that meets the bar.
    expect(nearest.legs).toBe(collective.legs);
    expect(nearest.arrived).toBe(collective.arrived);
    expect(nearest.carried).toBe(collective.carried);
    expect(nearest.carryPct).toBe(100);
  });
});
