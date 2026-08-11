/**
 * § 14.1's *"`dayClosed` is untouched, and so is your own day's state"*, asserted by identity.
 *
 * `toBe` rather than `toEqual` throughout, and that is the whole method: a deep compare passes for
 * a state that was rebuilt into something equal, and *rebuilt* is exactly the failure — a player
 * would come back to a week that matched theirs rather than to theirs. Identity also survives a
 * field being added tomorrow, which a listed comparison would not.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { bankingRefusalFor } from '../shift/banking.js';

import { watchingStateOf } from './session.js';

describe('the state a spectator watches under', () => {
  const before = {
    ...baseState(),
    week: { ...baseState().week, day: 3, streak: 2, cleanRun: 1 },
    interventions: [{ atS: 60, change: { kind: 'park-cars-lobby' } }] as const,
  };
  const watched = recordRun(shiftRunConfigOf(RESOURCES, baseState()).config).recording;

  it('moves the recording and nothing else', () => {
    const during = watchingStateOf(before, watched);
    expect(during.recording).toBe(watched);
    // The four § 14.1 names, by identity.
    expect(during.week).toBe(before.week);
    expect(during.report).toBe(before.report);
    expect(during.tomorrow).toBe(before.tomorrow);
    expect(during.interventions).toBe(before.interventions);
    // And everything else, derived rather than listed — so a field added tomorrow is covered.
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (key === 'recording') continue;
      expect(during[key], `watching moved viewer.${key}`).toBe(before[key]);
    }
  }, 60_000);

  it('leaves the player’s own state to come back to, unchanged', () => {
    // The transition returns a new object and mutates nothing — `week.ts`'s own discipline.
    const snapshot = before;
    watchingStateOf(before, watched);
    expect(before).toBe(snapshot);
    expect(before.recording).toBeUndefined();
  }, 60_000);

  it('cannot bank, because the watched run is not the run this shell simulated', () => {
    /*
     * The lock, driven on a real pair rather than trusted. `enterWatch` never writes
     * `simulatedRecording`, so the two arguments below are exactly what `closeShift` compares: the
     * watched run on the state, and the player's own run still held as *simulated*.
     */
    const own = recordRun(shiftRunConfigOf(RESOURCES, baseState()).config).recording;
    const during = watchingStateOf(before, watched);
    expect(bankingRefusalFor(during.recording, own)).not.toBeNull();
    // And the player's own run is bankable again the instant it is back on the state — the restore
    // puts back the same object, so nothing has to be re-simulated for this to become true.
    expect(bankingRefusalFor(own, own)).toBeNull();
  }, 60_000);
});
