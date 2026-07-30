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

import { GOAL_BARS, PENDING_DISPLAY, bestLineFor, goalsForDay, readGoal, readGoals } from './goals.js';
import { GOAL_OBSERVATION_IDS, WAKE_UP_ARRIVALS, type GoalObservations } from './types.js';

function observations(overrides: Partial<GoalObservations> = {}): GoalObservations {
  return {
    arrived: 400,
    carryPct: 95,
    minutePct: 80,
    peakQueue: 6,
    abandoned: 0,
    ...overrides,
  };
}

describe('the bars harden with the day, and then stop', () => {
  it('asks for three goals every day', () => {
    for (let day = 1; day <= 30; day += 1) expect(goalsForDay(day)).toHaveLength(3);
  });

  it('raises the shares and lowers the queue depth as the week goes on', () => {
    const early = goalsForDay(2);
    const late = goalsForDay(8);
    const barOf = (goals: readonly { readonly id: string; readonly bar: number }[], id: string): number =>
      goals.find((goal) => goal.id === id)?.bar ?? Number.NaN;
    expect(barOf(late, 'carry')).toBeGreaterThan(barOf(early, 'carry'));
    expect(barOf(late, 'minute')).toBeGreaterThan(barOf(early, 'minute'));
    expect(barOf(late, 'queue')).toBeLessThan(barOf(early, 'queue'));
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
  });

  it('alternates the third goal, so a bad day is not three inverted bars', () => {
    expect(goalsForDay(2).map((goal) => goal.id)).toEqual(['carry', 'minute', 'queue']);
    expect(goalsForDay(3).map((goal) => goal.id)).toEqual(['carry', 'minute', 'stairs']);
  });

  it('puts the bar in the label, so the sentence and the test agree', () => {
    const goals = goalsForDay(4);
    for (const goal of goals) {
      if (goal.id === 'stairs') continue;
      expect(goal.label, goal.id).toContain(String(goal.bar));
    }
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
    const quiet = observations({ arrived: 3, carryPct: 100, minutePct: 100, peakQueue: 0, abandoned: 0 });
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

  it('treats one abandonment as the whole failure of the horizon goal', () => {
    const stairs = goalsForDay(3).find((goal) => goal.id === 'stairs');
    expect(stairs).toBeDefined();
    if (stairs === undefined) return;
    expect(readGoal(stairs, observations({ abandoned: 0 })).state).toBe('met');
    expect(readGoal(stairs, observations({ abandoned: 1 })).state).toBe('missed');
    expect(readGoal(stairs, observations({ abandoned: 1 })).progressPct).toBe(0);
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
    const readings = readGoals(goalsForDay(4), observations({ carryPct: 91, peakQueue: 5 }));
    expect(readings.find((reading) => reading.goal.id === 'carry')?.display).toBe('91%');
    expect(readings.find((reading) => reading.goal.id === 'queue')?.display).toBe('5');
  });

  it('carries a glyph that is never the only signal', () => {
    for (const reading of readGoals(goalsForDay(4), observations())) {
      expect(reading.glyph, reading.goal.id).not.toBe('');
      // KB-15: the state is on the reading beside the glyph, so a surface can say the word.
      expect(['met', 'missed', 'pending']).toContain(reading.state);
    }
  });
});
