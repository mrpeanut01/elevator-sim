/**
 * § 6.1's replay — GitHub issue #177 item 1, § D517.
 *
 * Three claims, each driven rather than argued. A replay week stands on the day asked for, with that
 * day's weekday and the days before it as history. A run on it **is the day it was**, compared on the
 * legs: the same building at the same growth, the same seed, the same crowd. And closing it counts
 * for nothing — the sentinel contract banks nothing and clears nothing — while the parked week is
 * put back exactly as it was.
 */

import { describe, expect, it } from 'vitest';

import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { openWeek, closeDay, outcomeOf, REPLAY_CONTRACT_ID, PARKED_WEEKS_MAX, WEEK_CONTRACT_SENTINELS } from '../shift/week.js';
import { CONTRACTS, contractById } from '../shift/contracts.js';
import type { DayOutcome } from '../shift/types.js';

import { REPLAY_COPY, replayBeforeOf, replayDayIdxOf, replayPatchOf, replayRestorePatchOf, replayableDay } from './replay.js';

function outcome(day: number, dayIdx: number): DayOutcome {
  return outcomeOf({
    day,
    dayIdx,
    eventId: 'ordinary',
    readings: [],
    minutePct: 60 + day,
    carried: 100,
    arrived: 100,
    record: null,
    recordRefusal: 'a test outcome carries no record',
  });
}

describe('which days a week can hand back', () => {
  it('is every day before the standing one, inside this week', () => {
    const week = { ...openWeek(), day: 5, dayIdx: 4 };
    expect([0, 1, 2, 4, 5, 6, 1.5].map((day) => replayableDay(week, day))).toEqual([false, true, true, true, false, false, false]);
    expect(replayableDay(openWeek(), 1)).toBe(false);
  });

  it('counts the weekday back from the standing day, around the week', () => {
    expect(replayDayIdxOf({ ...openWeek(), day: 5, dayIdx: 4 }, 2)).toBe(1);
    expect(replayDayIdxOf({ ...openWeek(), day: 3, dayIdx: 0 }, 1)).toBe(5);
  });
});

describe('the replay week', () => {
  const live = {
    ...baseState().week,
    day: 4,
    dayIdx: 3,
    streak: 3,
    bestMinutePct: 80,
    history: [outcome(1, 0), outcome(2, 1), outcome(3, 2)],
  };

  it('stands on the day, on its weekday, with the days before it as history and nothing else carried', () => {
    const state = { ...baseState(), week: live };
    const patch = replayPatchOf(state, 2);
    expect(patch.week?.contractId).toBe(REPLAY_CONTRACT_ID);
    expect(patch.week?.day).toBe(2);
    expect(patch.week?.dayIdx).toBe(1);
    expect(patch.week?.history.map((entry) => entry.day)).toEqual([1]);
    expect(patch.week?.streak).toBe(0);
    expect(patch.week?.bestMinutePct).toBe(0);
    expect(patch.playMode).toBe('shift-week');
    /* The player's week is parked, whole. */
    const parked = patch.parkedWeeks?.find((week) => week.contractId === live.contractId);
    expect(parked?.day).toBe(4);
    expect(parked?.streak).toBe(3);
    expect(parked?.history).toHaveLength(3);
  });

  it('resolves to no contract, so a close banks nothing and clears nothing', () => {
    const state = { ...baseState(), week: live };
    const week = replayPatchOf(state, 2).week;
    if (week === undefined) throw new Error('a replay patch carries a week');
    expect(contractById(week.contractId)).toBeUndefined();
    const closed = closeDay(week, { ...outcome(2, 1), allMet: true });
    expect(closed.cleared).toBeNull();
    expect(closed.completed).toEqual([]);
    expect(closed.banked?.completed ?? []).toEqual([]);
  });

  it('is put back exactly as it was parked, whatever the replay did to its own week', () => {
    const state = { ...baseState(), week: live, playMode: 'endless' as const };
    const before = replayBeforeOf(state);
    const inReplay = { ...state, ...replayPatchOf(state, 3) };
    const played = { ...inReplay, week: closeDay(inReplay.week, { ...outcome(3, 2), allMet: true }) };
    const restored = { ...played, ...replayRestorePatchOf(played, before) };
    expect(restored.week).toEqual(live);
    expect(restored.playMode).toBe('endless');
    expect(restored.parkedWeeks.some((week) => week.contractId === live.contractId)).toBe(false);
  });

  it('has a parked slot of its own, counted off the sentinel table', () => {
    expect(Object.values(WEEK_CONTRACT_SENTINELS)).toContain(REPLAY_CONTRACT_ID);
    expect(PARKED_WEEKS_MAX).toBe(CONTRACTS.length + Object.keys(WEEK_CONTRACT_SENTINELS).length);
  });
});

describe('a replay is the day it was — compared on the legs', () => {
  it('runs the same crowd on the same grown building as the week did on that day, and a later day differs', () => {
    const base = { ...baseState(), shiftLengthS: 900 };
    const live = { ...base.week, day: 3, dayIdx: 2, history: [outcome(1, 0), outcome(2, 1)] };
    const onDayTwo = { ...base, week: { ...base.week, day: 2, dayIdx: 1, history: [outcome(1, 0)] } };
    const replayOfTwo = { ...base, week: live, ...replayPatchOf({ ...base, week: live }, 2) };
    expect(replayOfTwo.week.day).toBe(2);
    expect(legsOf(replayOfTwo)).toBe(legsOf(onDayTwo));
    /* Non-vacuous: the standing day meets a different crowd, because the building has grown. */
    expect(legsOf({ ...base, week: live })).not.toBe(legsOf(onDayTwo));
  }, 120_000);
});

describe('the words', () => {
  it('say the day and that it never counts, and say why a chip before the week cannot be handed back', () => {
    expect(REPLAY_COPY.doorNote(3)).toContain('Day 3');
    expect(REPLAY_COPY.doorNote(3)).toMatch(/never counts/u);
    expect(REPLAY_COPY.beforeTheWeek).toMatch(/before this week/u);
    for (const text of [REPLAY_COPY.doorNote(2), REPLAY_COPY.beforeTheWeek, REPLAY_COPY.leaveConsequence]) {
      expect(text).not.toMatch(/\bbetter\b|\bworse\b/iu);
    }
  });
});
