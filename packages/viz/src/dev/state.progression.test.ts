/**
 * Whose progress a run is allowed to write — § D231, issue #64.
 *
 * ## Why this suite exists at all, and why it is not in `state.test.ts`
 *
 * The defect it pins was **data loss**, and it lived where nothing could reach it. `dev/main.ts`'s
 * `closeShift` shaped the report sheet's `subject` on `state.playMode` and called
 * `closeDay(state.week, outcome)` unconditionally, forty lines above that branch — so a Free Play
 * run banked into the campaign week while its own sheet printed *"one run, not part of a week —
 * nothing is banked"*, and `saveSessionNow()` wrote the result to `localStorage`, where it survived
 * a reload.
 *
 * The decision now lives in `dev/state.ts` for the reason that file's docstring already gives:
 * *a decision made inside a click handler cannot be tested, because the handler needs a document, a
 * canvas and a click.* This suite is what that move buys.
 *
 * The central assertion is deliberately an **identity** check rather than a deep compare. `toBe`
 * cannot be satisfied by a copy that happens to agree on today's fields, so a `WeekState` that
 * grows an eighth counter cannot quietly start being rebuilt on a free-play close.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalObservations, PlayMode, WeekState } from '../shift/types.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';
import { PLAY_MODES } from '../scope/types.js';

import type { BrowserResources } from './data.js';
import {
  advancesTheWeek,
  closedWeekOf,
  initialState,
  weekForSession,
  type ViewerState,
} from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const config = parseBuilding(read('buildings/garden-apartments.json'));
  const entries = [
    { file: 'garden-apartments.json', config, resolved: resolveBuilding(config, elevatorSpecs) },
  ];
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();

/** Observations good enough to meet every bar the day asks for. */
const CLEAN: GoalObservations = Object.freeze({
  arrived: 355,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 4,
  abandoned: 0,
});

/** A day nobody would want banked: everything asked for, nothing delivered. */
const AWFUL: GoalObservations = Object.freeze({
  arrived: 523,
  carryPct: 61,
  minutePct: 38,
  peakQueue: 51,
  abandoned: 7,
});

function outcome(week: WeekState, observed: GoalObservations) {
  return outcomeOf({
    day: week.day,
    dayIdx: week.dayIdx,
    eventId: 'ordinary',
    readings: readGoals(goalsForDay(week.day), observed),
    minutePct: observed.minutePct,
    carried: Math.round((observed.arrived * observed.carryPct) / 100),
    arrived: observed.arrived,
  });
}

/**
 * The state the play-tester was in: a scenario week with one clean Monday banked, exactly as the
 * issue's own `localStorage` dump reads — `streak: 1, bestMinutePct: 100, cleanRun: 1`, one history
 * entry of 355 arrived and 355 carried.
 */
function bankedWeek(): WeekState {
  return closeDay(openWeek('c1'), outcome(openWeek('c1'), CLEAN));
}

describe('a run may write the week only if its mode owns one', () => {
  it('the three modes the shell actually enters answer as the product describes them', () => {
    // `shift-week` and `endless` are weeks — days, growth, a seven-day history. Free Play is one
    // run whose week is scaffolding `enterFreePlay` opened for it at day 1.
    expect(advancesTheWeek('shift-week')).toBe(true);
    expect(advancesTheWeek('endless')).toBe(true);
    expect(advancesTheWeek('free-play')).toBe(false);
  });

  it('answers for every declared play mode — a ninth cannot arrive undecided', () => {
    // Derived from the union rather than listed, § D213's rule: a mode added to `PLAY_MODES` with
    // no arm here is a compile error at the switch, and this is what proves the switch is total
    // rather than merely present.
    for (const mode of PLAY_MODES) {
      expect(typeof advancesTheWeek(mode)).toBe('boolean');
    }
    expect(PLAY_MODES.filter((mode: PlayMode) => advancesTheWeek(mode))).toEqual([
      'shift-week',
      'endless',
    ]);
  });
});

describe('issue #64 — a free-play run does not overwrite the saved scenario week', () => {
  const week = bankedWeek();

  it('leaves the banked week untouched, by identity', () => {
    /*
     * The regression. Before § D231 this returned `closeDay(week, …)`: the Day-1 history entry was
     * replaced by the free-play run's, `streak` and `cleanRun` were recomputed against it, and the
     * result went to `localStorage` on the next line of `closeShift`.
     */
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'free-play',
      week,
    };
    expect(closedWeekOf(state, outcome(week, AWFUL))).toBe(week);
  });

  it('is not a vacuous test — the same day on the same week does move a campaign week', () => {
    // Without this the assertion above would pass on a `closedWeekOf` that had been broken to
    // return its input, which is the failure mode of every "nothing changed" test.
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'shift-week',
      week,
    };
    const after = closedWeekOf(state, outcome(week, AWFUL));
    expect(after).not.toBe(week);
    expect(after.streak).toBe(0);
    expect(after.history.at(-1)?.arrived).toBe(AWFUL.arrived);
  });

  it('keeps every field the issue watched: streak, best day, banked count and history', () => {
    // The issue quotes the saved state before and after. These are the four it named.
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'free-play',
      week,
    };
    const after = closedWeekOf(state, outcome(week, AWFUL));
    expect(after.streak).toBe(1);
    expect(after.bestMinutePct).toBe(100);
    expect(after.cleanRun).toBe(1);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]?.arrived).toBe(355);
    expect(after.history[0]?.carried).toBe(355);
    expect(after.history[0]?.minutePct).toBe(100);
    // And the attempt counter, which is what a navigation used to increment (§ D232).
    expect(after.attempt).toBe(week.attempt);
  });

  it('an endless day still advances, because endless is a week with no assignment', () => {
    // The negative case for the mode next door. `Keep going` promises *"it grows"*, and a mode that
    // stopped closing days would stop growing the building — which is the whole of what it is for.
    const endless = openWeek('endless');
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'endless',
      week: endless,
    };
    const after = closedWeekOf(state, outcome(endless, CLEAN));
    expect(after).not.toBe(endless);
    expect(after.streak).toBe(1);
    // …and still banks nothing: the sentinel resolves to no contract.
    expect(after.completed).toEqual([]);
    expect(after.cleared).toBeNull();
  });
});

describe('issue #64 — the session keeps the week on disk while a mode does not own one', () => {
  const stored = bankedWeek();

  it('writes back what the slot already has when the mode does not advance the week', () => {
    /*
     * The half a `closeDay` guard alone does not close. `enterFreePlay` replaces `state.week` with
     * a fresh day-one week the moment Free Play starts, so *any* later save — and changing a
     * setting saves — would have written that scaffolding over the campaign's banked days.
     */
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'free-play',
      week: openWeek('c1'),
    };
    expect(weekForSession(state, stored)).toBe(stored);
  });

  it('writes the live week when the mode does own one', () => {
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'shift-week',
      week: stored,
    };
    expect(weekForSession(state, openWeek('c1'))).toBe(stored);
  });

  it('writes the live week on a first visit, when there is nothing to protect', () => {
    // `absent` is not a failure — it is an ordinary first visit, and refusing to write there would
    // mean a free-play player's settings never persisted at all.
    const fresh = openWeek('c1');
    const state: ViewerState = {
      ...initialState(resources, 20260804n),
      playMode: 'free-play',
      week: fresh,
    };
    expect(weekForSession(state, undefined)).toBe(fresh);
  });
});
