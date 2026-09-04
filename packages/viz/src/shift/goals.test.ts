/**
 * Goals harden, goals read observations, and **nothing is graded before the building wakes up**.
 *
 * The third of those is the one with teeth. `design.html` :2382 refuses to grade under twenty
 * arrivals, and the failure it prevents is arithmetic rather than generosity: `carryPct` is 100 %
 * when three people arrived and three were carried, and `peakQueue` is 0 before anybody arrived.
 * Both of those clear their bars, so a viewer without the gate hands out a clean shift for an empty
 * morning — and `week.ts` banks it toward a scenario.
 *
 * The suite therefore asserts `pending` at the boundary **and** asserts that the observations at
 * the boundary would otherwise have read `met`, which is what makes the gate load-bearing rather
 * than decorative.
 */

import { describe, expect, it } from 'vitest';

import {
  GOAL_BARS,
  PENDING_DISPLAY,
  bestLineFor,
  goalsForDay,
  readGoal,
  readGoals,
  wasDisplayOf,
} from './goals.js';
import { outcomeOf } from './week.js';
import {
  GOAL_OBSERVATION_IDS,
  WAKE_UP_ARRIVALS,
  type DayOutcome,
  type GoalObservations,
  type ShiftGoal,
} from './types.js';

function observations(overrides: Partial<GoalObservations> = {}): GoalObservations {
  return {
    arrived: 400,
    carryPct: 95,
    minutePct: 80,
    peakQueue: 6,
    abandoned: 0,
    worstWaitS: 90,
    worstWaitIsCensored: false,
    // Under `GOAL_BARS.energyPerLegMaxKJ`, so the default fixture clears all five bars. The absent
    // case is exercised deliberately, in the gate suite below, rather than by default here.
    workPerServedLegKJ: 41.2,
    ...overrides,
  };
}

/** A closed day, through the real `outcomeOf`, so the history entries are the shipped shape. */
function closedDay(day: number, forDay: GoalObservations): DayOutcome {
  return outcomeOf({
    record: null,
    recordRefusal: null,
    day,
    dayIdx: (day - 1) % 7,
    eventId: 'ordinary',
    arrived: forDay.arrived,
    carried: Math.round((forDay.carryPct / 100) * forDay.arrived),
    minutePct: forDay.minutePct,
    readings: readGoals(goalsForDay(day), forDay),
  });
}

describe('the bars harden with the day, and then stop', () => {
  it('asks the handoff’s four tests plus the energy bar every day, per § 8.6 and § D367', () => {
    // The fifth is § D367's independent energy bar (GitHub issue #275). Order is asserted rather
    // than membership: the rail draws them in this order and the report sheet pairs them by index.
    for (let day = 1; day <= 30; day += 1) {
      expect(goalsForDay(day).map((goal) => goal.id)).toEqual([
        'carry',
        'minute',
        'queue',
        'worst-wait',
        'energy',
      ]);
    }
  });

  it('raises the shares and lowers the queue depth and the wait ceiling as the week goes on', () => {
    const early = goalsForDay(2);
    const late = goalsForDay(8);
    const barOf = (goals: readonly { readonly id: string; readonly bar: number }[], id: string): number =>
      goals.find((goal) => goal.id === id)?.bar ?? Number.NaN;
    expect(barOf(late, 'carry')).toBeGreaterThan(barOf(early, 'carry'));
    expect(barOf(late, 'minute')).toBeGreaterThan(barOf(early, 'minute'));
    expect(barOf(late, 'queue')).toBeLessThan(barOf(early, 'queue'));
    expect(barOf(late, 'worst-wait')).toBeLessThan(barOf(early, 'worst-wait'));
  });

  it('caps every bar, so the week never becomes unwinnable', () => {
    // "No losing — just a line you are trying to bend upward." A bar that kept hardening would
    // eventually ask for a building that cannot exist.
    for (const day of [50, 500]) {
      const goals = goalsForDay(day);
      const carry = goals.find((goal) => goal.id === 'carry');
      const minute = goals.find((goal) => goal.id === 'minute');
      expect(carry?.bar).toBe(GOAL_BARS.carryMax);
      expect(minute?.bar).toBe(GOAL_BARS.minuteMax);
    }
    expect(goalsForDay(50).find((goal) => goal.id === 'queue')?.bar).toBe(GOAL_BARS.queueMin);
    expect(goalsForDay(50).find((goal) => goal.id === 'worst-wait')?.bar).toBe(GOAL_BARS.worstMinS);
  });

  it('floors the wait ceiling at the handoff’s Hard tier, short of the one named Impossible', () => {
    // § 8.6's own table: Easy 240 s, Hard 150 s, Impossible 120 s. The floor is a promise the
    // line stays bendable, and converging on a tier named Impossible would break it.
    expect(GOAL_BARS.worstMinS).toBe(150);
    expect(GOAL_BARS.worstBaseS).toBe(240);
  });

  it('subsumes the retired odd-day horizon goal — a met ceiling implies nobody abandoned', () => {
    /*
     * The argument `goalsForDay`'s docstring retires the alternation on, checked: every shipped
     * worst-wait bar sits far under the 900 s abandonment horizon, so `worst-wait` met (and
     * uncensored) implies `abandoned` would have read 0 — the ceiling is strictly the stronger
     * test of the same tail, and alternating them would alternate difficulty by parity.
     */
    for (let day = 1; day <= 30; day += 1) {
      const worst = goalsForDay(day).find((goal) => goal.id === 'worst-wait');
      expect(worst).toBeDefined();
      expect(worst?.bar ?? Number.NaN).toBeLessThan(900);
    }
  });

  it('puts the bar in the label, so the sentence and the test agree', () => {
    const goals = goalsForDay(4);
    for (const goal of goals) {
      expect(goal.label, goal.id).toContain(String(goal.bar));
    }
  });

  it('says on the worst-wait label which window it grades — the whole shift (docs/19 defect 3)', () => {
    /*
     * The sheet carries a second “worst wait” — the WORST WAIT cell, which is the reporting
     * window's — and on the audit's Midtown day the two read 1 725 s and 1 488 s four inches
     * apart, reconciled only in the small print. The goal reads `Observations.worstWaitS`, the
     * shift-wide maximum, so its label says so where it stands.
     */
    const worst = goalsForDay(4).find((goal) => goal.id === 'worst-wait');
    expect(worst?.label).toContain('across the whole shift');
    expect(worst?.reads).toBe('worstWaitS');
  });

  it('keeps the retired goal’s observation id readable, for restored histories', () => {
    // `persist/validate.ts` checks restored readings' `reads` against this list, and a saved
    // week that closed an odd day under the old build carries an `abandoned` reading.
    expect(GOAL_OBSERVATION_IDS).toContain('abandoned');
  });
});

/* -------------------------------------------------------------------------- *
 * The horizon — `ISSUE_VERIFICATION_FINDINGS.md` § AB
 * -------------------------------------------------------------------------- */

/**
 * A goal measured over thirty minutes is not a goal over ten hours, and **exactly one of the four
 * knows it**.
 *
 * Every expectation below is derived from the other arm rather than transcribed from a table, so
 * the ladder can be re-tuned without touching this block, and a second bar quietly acquiring a
 * horizon allowance fails here rather than passing silently. `WORST_WAIT_WHOLE_DAY_FACTOR` carries
 * the measurement, the mechanism, and the refutation of the assumption that both maxima grow.
 */
describe('what a whole day asks, against what a slice asks', () => {
  const barOf = (goals: readonly ShiftGoal[], id: string): number =>
    goals.find((goal) => goal.id === id)?.bar ?? Number.NaN;

  it('moves the worst-wait ceiling and moves nothing else', () => {
    for (let day = 1; day <= 30; day += 1) {
      const slice = goalsForDay(day, 'period');
      const whole = goalsForDay(day, 'whole-day');

      // The same four tests, in the same order, reading the same observations. A day is a longer
      // run, not a different brief.
      expect(whole.map((goal) => goal.id)).toEqual(slice.map((goal) => goal.id));
      expect(whole.map((goal) => goal.reads)).toEqual(slice.map((goal) => goal.reads));
      expect(whole.map((goal) => goal.compare)).toEqual(slice.map((goal) => goal.compare));

      // Two shares and one maximum are horizon-blind, and the queue's flatness is measured rather
      // than assumed — see `WORST_WAIT_WHOLE_DAY_FACTOR` for the four cells it was measured on.
      for (const id of ['carry', 'minute', 'queue']) {
        expect(barOf(whole, id), `day ${String(day)} ${id}`).toBe(barOf(slice, id));
      }
      expect(barOf(whole, 'worst-wait'), `day ${String(day)}`).toBe(
        barOf(slice, 'worst-wait') * GOAL_BARS.worstWholeDayFactor,
      );
    }
  });

  it('defaults to the slice, which is what three shipped crowds and every published figure ran', () => {
    for (const day of [1, 4, 12, 50]) {
      expect(goalsForDay(day)).toEqual(goalsForDay(day, 'period'));
    }
  });

  it('still hardens and still floors, because the allowance scales the ladder rather than replacing it', () => {
    const early = goalsForDay(2, 'whole-day');
    const late = goalsForDay(8, 'whole-day');
    expect(barOf(late, 'worst-wait')).toBeLessThan(barOf(early, 'worst-wait'));
    // The floor is the ladder's floor carrying the same allowance — never the raw 150 s, which
    // would hand a ten-hour day the difficulty change this argument exists to prevent.
    expect(barOf(goalsForDay(50, 'whole-day'), 'worst-wait')).toBe(
      GOAL_BARS.worstMinS * GOAL_BARS.worstWholeDayFactor,
    );
  });

  it('keeps the ceiling under the abandonment horizon, so it still subsumes the retired goal', () => {
    // The same argument the slice arm is held to, re-asked of the looser bar: if a whole day's
    // ceiling ever reached 900 s it would stop being the stricter test of the tail, and the
    // retirement of the odd-day `abandoned` goal would stop being sound.
    for (let day = 1; day <= 30; day += 1) {
      expect(barOf(goalsForDay(day, 'whole-day'), 'worst-wait')).toBeLessThan(900);
    }
  });

  it('puts the bar it actually grades in the label, on both horizons', () => {
    // § D227 at the scale of a sentence: a whole day judged at 460 s may not print 230 s.
    for (const goal of goalsForDay(1, 'whole-day')) {
      expect(goal.label, goal.id).toContain(String(goal.bar));
    }
    const worst = goalsForDay(1, 'whole-day').find((goal) => goal.id === 'worst-wait');
    expect(worst?.label).not.toContain(
      String(barOf(goalsForDay(1, 'period'), 'worst-wait')),
    );
  });

  it('grades a wait the slice bar would have missed and the day’s bar does not', () => {
    /*
     * The measured consequence, as a reading rather than as a number. Secure Tower's median worst
     * wait over the whole day is 310 s against a slice ceiling of 230 s — 9 of 10 seeds missing a
     * bar that 4 of 10 missed on the slice, on a run nobody made worse. Held here at the boundary
     * so the allowance is load-bearing rather than decorative.
     */
    const observations: GoalObservations = {
      arrived: 400,
      carryPct: 100,
      minutePct: 100,
      peakQueue: 0,
      abandoned: 0,
      worstWaitS: 310,
      worstWaitIsCensored: false,
    };
    const worstOn = (over: 'period' | 'whole-day') => {
      const goal = goalsForDay(1, over).find((entry) => entry.id === 'worst-wait');
      if (goal === undefined) throw new Error('no worst-wait goal');
      return readGoal(goal, observations).state;
    };
    expect(worstOn('period')).toBe('missed');
    expect(worstOn('whole-day')).toBe('met');
  });
});

describe('a goal may only read an observation', () => {
  it('reads one of the four named observation fields and nothing else', () => {
    // The structural claim, checked: `ShiftGoal.reads` is a key of `GoalObservations`, which
    // carries no `meanWaitS`, no `wait95S` and no `meanTimeToDestinationS`. A goal that wanted to
    // grade a suppressible estimate would not compile — this asserts the shipped set stays inside
    // the four the design named.
    for (let day = 1; day <= 20; day += 1) {
      for (const goal of goalsForDay(day)) {
        expect(GOAL_OBSERVATION_IDS).toContain(goal.reads);
      }
    }
  });
});

describe('an observation nobody took is not graded, in either direction', () => {
  /** A trip budget — the shape `everyday/campaignModel.ts#campaignTestGoals` builds. */
  const trips: ShiftGoal = {
    id: 'trips',
    label: 'No more than 520 trips on the machines',
    unit: '',
    bar: 520,
    compare: 'at-most',
    reads: 'loadedDepartures',
  };

  it('grades the count when the run carried one', () => {
    expect(readGoal(trips, observations({ loadedDepartures: 300 })).state).toBe('met');
    expect(readGoal(trips, observations({ loadedDepartures: 521 })).state).toBe('missed');
    expect(readGoal(trips, observations({ loadedDepartures: 300 })).display).toBe('300');
  });

  it('refuses when the field is absent, rather than reading it as a zero', () => {
    /*
     * The direction that matters, and the reason the gate is over the *value* rather than over the
     * goal's id: this bar is `at-most`, so a `?? 0` anywhere upstream would grade **met** on every
     * run nobody measured — a pass awarded for a measurement that was never taken. The censoring
     * gate one property up refuses for the opposite reason; both come out `pending`.
     */
    const unmeasured = readGoal(trips, observations());
    expect(unmeasured.state).toBe('pending');
    expect(unmeasured.observed).toBeNull();
    expect(unmeasured.display).toBe(PENDING_DISPLAY);
    expect(unmeasured.progressPct).toBe(0);
  });

  it('leaves the five daily goals alone, because none of them reads it', () => {
    // The daily loop asks five things and this is not one of them; the trip budget is the
    // campaign's bar. So a day with no trip count still grades every goal `goalsForDay` returns.
    for (let day = 1; day <= 20; day += 1) {
      for (const goal of goalsForDay(day)) {
        expect(goal.reads).not.toBe('loadedDepartures');
        expect(readGoal(goal, observations()).state).not.toBe('pending');
      }
    }
  });
});

describe('nothing is graded before the building wakes up', () => {
  it('reads pending at every arrival count below the threshold', () => {
    for (const arrived of [0, 1, 7, WAKE_UP_ARRIVALS - 1]) {
      for (const goal of goalsForDay(4)) {
        const reading = readGoal(goal, observations({ arrived }));
        expect(reading.state, `${goal.id} at ${String(arrived)} arrivals`).toBe('pending');
        expect(reading.display).toBe(PENDING_DISPLAY);
        expect(reading.observed).toBeNull();
        expect(reading.progressPct).toBe(0);
      }
    }
  });

  it('is never `met` below the threshold — even on observations that would clear every bar', () => {
    // The gate is load-bearing precisely because these observations *do* clear the bars. Three
    // people arrived, three were carried, nobody queued: perfect by arithmetic, and not a shift.
    const quiet = observations({
      arrived: 3,
      carryPct: 100,
      minutePct: 100,
      peakQueue: 0,
      abandoned: 0,
      workPerServedLegKJ: 12.5,
    });
    const woken = { ...quiet, arrived: WAKE_UP_ARRIVALS };
    for (const goal of goalsForDay(4)) {
      expect(readGoal(goal, quiet).state).toBe('pending');
      expect(readGoal(goal, woken).state).toBe('met');
    }
  });

  it('starts grading at exactly the threshold', () => {
    const goal = goalsForDay(4)[0];
    expect(goal).toBeDefined();
    if (goal === undefined) return;
    expect(readGoal(goal, observations({ arrived: WAKE_UP_ARRIVALS - 1 })).state).toBe('pending');
    expect(readGoal(goal, observations({ arrived: WAKE_UP_ARRIVALS })).state).not.toBe('pending');
  });

  it('says so in the footer line rather than printing a best day nobody set', () => {
    expect(bestLineFor(observations({ arrived: 4 }), 0)).toContain('nothing graded');
    expect(bestLineFor(observations(), 73)).toBe('best day 73%');
  });
});

describe('reading a goal that is being graded', () => {
  it('meets an at-least goal at the bar and misses below it', () => {
    const carry = goalsForDay(4).find((goal) => goal.id === 'carry');
    expect(carry).toBeDefined();
    if (carry === undefined) return;
    expect(readGoal(carry, observations({ carryPct: carry.bar })).state).toBe('met');
    expect(readGoal(carry, observations({ carryPct: carry.bar - 1 })).state).toBe('missed');
  });

  it('meets an at-most goal at the bar and misses above it', () => {
    const queue = goalsForDay(4).find((goal) => goal.id === 'queue');
    expect(queue).toBeDefined();
    if (queue === undefined) return;
    expect(readGoal(queue, observations({ peakQueue: queue.bar })).state).toBe('met');
    expect(readGoal(queue, observations({ peakQueue: queue.bar + 1 })).state).toBe('missed');
  });

  it('meets the wait ceiling at the bar and misses above it', () => {
    const worst = goalsForDay(4).find((goal) => goal.id === 'worst-wait');
    expect(worst).toBeDefined();
    if (worst === undefined) return;
    expect(readGoal(worst, observations({ worstWaitS: worst.bar })).state).toBe('met');
    expect(readGoal(worst, observations({ worstWaitS: worst.bar + 1 })).state).toBe('missed');
  });

  it('refuses to grade a censored worst wait, in either direction', () => {
    /*
     * The second gate. Under the bar the number is a lower bound, so `met` would be a guess; and
     * `missed` is refused too because the recording carries no `abandonedAt`, so an "unresolved"
     * leg may be a rider who walked out long ago — a bound that might overstate proves nothing.
     * See `readGoal`'s docstring; the em dash and the null observed are the same refusals the
     * wake-up gate makes.
     */
    const worst = goalsForDay(4).find((goal) => goal.id === 'worst-wait');
    expect(worst).toBeDefined();
    if (worst === undefined) return;
    for (const worstWaitS of [worst.bar - 1, worst.bar + 500]) {
      const reading = readGoal(worst, observations({ worstWaitS, worstWaitIsCensored: true }));
      expect(reading.state, `censored at ${String(worstWaitS)} s`).toBe('pending');
      expect(reading.display).toBe(PENDING_DISPLAY);
      expect(reading.observed).toBeNull();
    }
  });

  it('leaves the other goals graded while the worst wait is censored', () => {
    // The censoring flag gates the one observation it names, not the day: the wake-up gate is the
    // only whole-day refusal.
    const readings = readGoals(goalsForDay(4), observations({ worstWaitIsCensored: true }));
    const states = new Map(readings.map((reading) => [reading.goal.id, reading.state]));
    expect(states.get('worst-wait')).toBe('pending');
    expect(states.get('carry')).toBe('met');
    expect(states.get('minute')).toBe('met');
    expect(states.get('queue')).toBe('met');
  });

  it('keeps the bar decorative — rounding it can never move a verdict', () => {
    // The bar is computed separately from the state on purpose: a 4 px progress bar rounds, and a
    // rounding that could flip `met` would put a display concern in a grading path.
    const minute = goalsForDay(6).find((goal) => goal.id === 'minute');
    expect(minute).toBeDefined();
    if (minute === undefined) return;
    const justUnder = readGoal(minute, observations({ minutePct: minute.bar - 1 }));
    expect(justUnder.state).toBe('missed');
    expect(justUnder.progressPct).toBeGreaterThan(90);
  });

  it('appends the unit and never invents one', () => {
    const readings = readGoals(
      goalsForDay(4),
      observations({ carryPct: 91, peakQueue: 5, worstWaitS: 87 }),
    );
    expect(readings.find((reading) => reading.goal.id === 'carry')?.display).toBe('91%');
    expect(readings.find((reading) => reading.goal.id === 'queue')?.display).toBe('5');
    // SI style, space before the unit — the same spelling `worstWaitFigure` prints.
    expect(readings.find((reading) => reading.goal.id === 'worst-wait')?.display).toBe('87 s');
  });

  it('carries a glyph that is never the only signal', () => {
    for (const reading of readGoals(goalsForDay(4), observations())) {
      expect(reading.glyph, reading.goal.id).not.toBe('');
      // KB-15: the state is on the reading beside the glyph, so a surface can say the word.
      expect(['met', 'missed', 'pending']).toContain(reading.state);
    }
  });

  it('draws missed as the handoff’s cross, not the prototype’s ring', () => {
    // § 20.6: *"the calendar draws an ×"*. The handoff wins what the screen looks like.
    const carry = goalsForDay(4).find((goal) => goal.id === 'carry');
    expect(carry).toBeDefined();
    if (carry === undefined) return;
    expect(readGoal(carry, observations({ carryPct: 0 })).glyph).toBe('×');
    expect(readGoal(carry, observations({ carryPct: 100 })).glyph).toBe('✓');
  });
});

describe('the "was" figures — last night’s actual result, never a constant', () => {
  it('answers the em dash when there is no previous day', () => {
    const goal = goalsForDay(1)[0];
    expect(goal).toBeDefined();
    if (goal === undefined) return;
    expect(wasDisplayOf([], 1, goal)).toBe(PENDING_DISPLAY);
  });

  it('reads the previous day’s display for the same quantity', () => {
    const yesterday = closedDay(3, observations({ carryPct: 91, worstWaitS: 87 }));
    const today = goalsForDay(4);
    const carry = today.find((goal) => goal.id === 'carry');
    const worst = today.find((goal) => goal.id === 'worst-wait');
    expect(carry && wasDisplayOf([yesterday], 4, carry)).toBe('91%');
    expect(worst && wasDisplayOf([yesterday], 4, worst)).toBe('87 s');
  });

  it('finds yesterday by day number, so a re-closed today cannot pose as last night', () => {
    /*
     * The retry loop is the product's most-used verb (`WeekState.attempt`), and after a re-close
     * the history's **last** entry is today. A `was` that read `history[length - 1]` would show
     * this attempt's own figures as last night's — the mis-attribution this lookup exists to
     * refuse.
     */
    const yesterday = closedDay(3, observations({ carryPct: 91 }));
    const todayClosed = closedDay(4, observations({ carryPct: 62 }));
    const carry = goalsForDay(4).find((goal) => goal.id === 'carry');
    expect(carry && wasDisplayOf([yesterday, todayClosed], 4, carry)).toBe('91%');
  });

  it('answers the em dash for a quantity yesterday never measured', () => {
    // A restored session from the three-goal build has no worst-wait reading in its history —
    // and the honest answer is the dash, not a stand-in.
    const yesterday = closedDay(3, observations());
    const stripped: DayOutcome = {
      ...yesterday,
      readings: yesterday.readings.filter((reading) => reading.goal.reads !== 'worstWaitS'),
    };
    const worst = goalsForDay(4).find((goal) => goal.id === 'worst-wait');
    expect(worst && wasDisplayOf([stripped], 4, worst)).toBe(PENDING_DISPLAY);
  });

  it('passes an ungraded yesterday through as the dash it printed', () => {
    const quiet = closedDay(3, observations({ arrived: 3 }));
    const carry = goalsForDay(4).find((goal) => goal.id === 'carry');
    expect(carry && wasDisplayOf([quiet], 4, carry)).toBe(PENDING_DISPLAY);
  });
});

/* -------------------------------------------------------------------------- *
 * The energy bar. § D367, § D468, GitHub issue #275
 * -------------------------------------------------------------------------- */

describe('the energy bar is one bar, read alone', () => {
  const energyOf = (day: number): ShiftGoal => {
    const goal = goalsForDay(day).find((entry) => entry.id === 'energy');
    if (goal === undefined) throw new Error(`no energy goal on day ${String(day)}`);
    return goal;
  };

  it('grades the per-delivered-leg ratio and nothing else energy-shaped', () => {
    /*
     * The whole of § D367's permission, in one assertion. § D106 rule 2 forbids folding energy into
     * a figure that also carries wait; what makes an independent bar survive it is that the legs
     * delivered are the **denominator**, so a day that spends less by carrying fewer people fails
     * the bar rather than winning it. Grading `workKJ` would restore exactly the score § D106
     * refuses, and the type is what stops it: there is no raw-work id to name.
     */
    expect(energyOf(1).reads).toBe('workPerServedLegKJ');
    expect(GOAL_OBSERVATION_IDS).not.toContain('workKJ');
    expect(GOAL_OBSERVATION_IDS).not.toContain('energyKJ');
  });

  it('does not harden with the day, and the constant is the one `GOAL_BARS` publishes', () => {
    // The other four bars move nightly; this one is measured flat. § D468 carries the reason: the
    // quantity itself falls as the building grows, by 1.6x over nineteen days on one contract and
    // 15.6x on another, so a ladder fitted to either would be wrong about the other by an order of
    // magnitude, and one that hardened would tighten a bar growth is already loosening.
    for (const day of [1, 2, 5, 10, 20, 50, 500]) {
      expect(energyOf(day).bar, `day ${String(day)}`).toBe(GOAL_BARS.energyPerLegMaxKJ);
    }
    expect(energyOf(1).compare).toBe('at-most');
  });

  it('meets the bar at the bar and misses a tenth above it', () => {
    const bar = GOAL_BARS.energyPerLegMaxKJ;
    expect(readGoal(energyOf(1), observations({ workPerServedLegKJ: bar })).state).toBe('met');
    expect(readGoal(energyOf(1), observations({ workPerServedLegKJ: bar - 0.1 })).state).toBe('met');
    expect(readGoal(energyOf(1), observations({ workPerServedLegKJ: bar + 0.1 })).state).toBe(
      'missed',
    );
    // *Inside*, on the label, against an `at-most` comparison that meets at the bar: the same
    // preposition question `worst-wait` answered the same way. A label promising *under 80 kJ*
    // about a day that spent exactly 80 would claim a strictness the comparison does not have.
    expect(energyOf(1).label).toContain(String(bar));
    expect(energyOf(1).label).toContain('per ride delivered');
  });

  it('refuses a run that measured no energy rather than reading it as a zero', () => {
    // The `loadedDepartures` gate, inherited whole by the second optional observation. An
    // `at-most` bar folded to zero would grade **met** on every run nobody instrumented.
    const { workPerServedLegKJ: _absent, ...withoutEnergy } = observations();
    const reading = readGoal(energyOf(1), withoutEnergy);
    expect(reading.state).toBe('pending');
    expect(reading.observed).toBeNull();
    expect(reading.display).toBe(PENDING_DISPLAY);
    expect(reading.progressPct).toBe(0);
  });

  it('adds no term to any other goal, which is the property § D106 rule 2 is about', () => {
    /*
     * *Unweighted* is not a claim a docstring can carry on its own, so it is checked: the other
     * four readings are byte-identical across an energy figure of 1 kJ and one of 1 000 kJ, and the
     * energy reading itself is the only thing that moves. No combined number exists to inspect,
     * which is the point: a weighted score would show up here as one of the four moving.
     */
    const cheap = readGoals(goalsForDay(4), observations({ workPerServedLegKJ: 1 }));
    const dear = readGoals(goalsForDay(4), observations({ workPerServedLegKJ: 1000 }));
    const others = (readings: readonly { readonly goal: ShiftGoal }[]): unknown =>
      JSON.stringify(readings.filter((entry) => entry.goal.id !== 'energy'));
    expect(others(dear)).toBe(others(cheap));
    expect(cheap.find((entry) => entry.goal.id === 'energy')?.state).toBe('met');
    expect(dear.find((entry) => entry.goal.id === 'energy')?.state).toBe('missed');
  });

  it('displays the figure in the sheet’s own unit', () => {
    const reading = readGoal(energyOf(1), observations({ workPerServedLegKJ: 62.4 }));
    expect(reading.display).toBe('62.4 kJ');
    expect(energyOf(1).unit).toBe(' kJ');
  });
});
