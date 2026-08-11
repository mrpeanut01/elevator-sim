/**
 * The race strip's pure half — GAMEPLAY §7.4, slice 4d.
 *
 * The three claims that decide the surface, each asserted rather than trusted:
 *
 * 1. **The lanes agree with the rest of the product about who is standing.** `raceSamplesOf`
 *    reaches its counts through `frame/overlay.ts#isWaitingAt`, and the suite still compares its
 *    answer against `live/observations.ts#observationsAt` — different code over the same legs —
 *    at every grid point, because agreement between two paths is evidence and a call is only
 *    plumbing.
 * 2. **With nobody picked the strip invents no rival**: one line per lane, no note, no verdict —
 *    the verdict slot carries the plain figure, and the ghost polyline is the empty string.
 * 3. **No interval claim, ever.** One day each is an anecdote; the footer is §7.4's permanent
 *    sentence verbatim, and no producer's output may smuggle interval language past it.
 */

import { describe, expect, it } from 'vitest';

import { observationsAt } from './observations.js';
import {
  GHOST_OPTIONS,
  LEVEL_WITHIN_POINTS,
  RACE_FOOTER,
  RACE_NOT_RUN,
  RACE_PENDING,
  RACE_SAMPLE_INTERVAL_S,
  SAME_CROWD_NOTE,
  raceLaneOf,
  raceSamplesOf,
  raceStripViewOf,
  raceVerdictOf,
} from './raceStrip.js';
import { servedLeg, syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

/** A 600 s day: one rider served quickly, one standing from 100 s to the end. */
function recordingOf(): ReturnType<typeof syntheticRecording> {
  return syntheticRecording({
    legs: [
      servedLeg('p-served', 50, 110, 200),
      waitingLeg('p-standing', 100),
    ],
  });
}

describe('raceSamplesOf', () => {
  it('samples the four-minute grid from startedAt, plus the playhead tip', () => {
    const samples = raceSamplesOf(recordingOf(), 500);
    expect(samples.map((sample) => sample.atS)).toEqual([0, 240, 480, 500]);
  });

  it('clamps the tip into the recording’s own span', () => {
    const samples = raceSamplesOf(recordingOf(), 10_000);
    const tip = samples[samples.length - 1];
    expect(tip?.atS).toBe(600);
  });

  it('counts the standing and averages their own waits — zero when nobody stands', () => {
    const samples = raceSamplesOf(recordingOf(), 480);
    // At 0 s nobody has arrived: no wait, not a missing value.
    expect(samples[0]).toEqual({ atS: 0, standing: 0, standingWaitS: 0 });
    // At 240 s the served rider boarded at 110; only p-standing (since 100 s) stands: 140 s.
    expect(samples[1]).toEqual({ atS: 240, standing: 1, standingWaitS: 140 });
    // At 480 s the same rider has stood 380 s.
    expect(samples[2]).toEqual({ atS: 480, standing: 1, standingWaitS: 380 });
  });

  it('agrees with observationsAt about who is standing, at every grid point', () => {
    const recording = recordingOf();
    for (const sample of raceSamplesOf(recording, recording.endedAt)) {
      expect(sample.standing).toBe(observationsAt(recording, sample.atS).waitingNow);
    }
  });
});

describe('raceVerdictOf', () => {
  it('is level under three points, in §6.5’s own words', () => {
    expect(raceVerdictOf(50, 48.5)).toBe('level with');
    expect(raceVerdictOf(50, 52.9)).toBe('level with');
    expect(LEVEL_WITHIN_POINTS).toBe(3);
  });

  it('names the direction and the points at three or more', () => {
    expect(raceVerdictOf(55, 50)).toBe('ahead by 5 points');
    expect(raceVerdictOf(50, 55.4)).toBe('behind by 5 points');
    expect(raceVerdictOf(53, 50)).toBe('ahead by 3 points');
  });

  it('refuses in words when either side has no share yet', () => {
    expect(raceVerdictOf(undefined, 50)).toBe('no score yet — too few served on one side to say');
    expect(raceVerdictOf(50, undefined)).toBe('no score yet — too few served on one side to say');
  });
});

describe('raceStripViewOf', () => {
  it('with a ghost: both series, the same-crowd note, and the verdict from both shares', () => {
    const recording = recordingOf();
    const view = raceStripViewOf({ recording, ghost: recording, simTimeS: 480 });
    expect(view.ghost).toBeDefined();
    expect(view.note).toBe(SAME_CROWD_NOTE);
    // The same recording on both sides is level with itself by construction.
    expect(view.verdict).toBe('level with');
    expect(view.footer).toBe(RACE_FOOTER);
  });

  it('with nobody: one line, no band, no verdict — the plain figure in its place', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    expect(view.ghost).toBeUndefined();
    expect(view.note).toBe('');
    expect(view.verdict).toBe('1 standing now');
    // The footer is permanent — it does not depend on there being a rival.
    expect(view.footer).toBe(RACE_FOOTER);
    // And the lane geometry draws nothing for the rival: the strip never invents one.
    const lane = raceLaneOf(view.yours, view.ghost, (sample) => sample.standing, { width: 640, height: 40 }, 600, 10);
    expect(lane.ghost).toBe('');
    expect(lane.you.length).toBeGreaterThan(0);
  });

  it('carries §7.4’s footer verbatim', () => {
    expect(RACE_FOOTER).toBe('One day each on the same crowd. That is a race, not proof.');
  });

  it('sampling interval is §7.4’s four simulated minutes', () => {
    expect(RACE_SAMPLE_INTERVAL_S).toBe(240);
  });
});

describe('raceLaneOf', () => {
  it('draws both lines on one shared scale over one shared clock', () => {
    const yours = [
      { atS: 0, standing: 0, standingWaitS: 0 },
      { atS: 240, standing: 4, standingWaitS: 30 },
    ];
    const ghost = [
      { atS: 0, standing: 0, standingWaitS: 0 },
      { atS: 240, standing: 8, standingWaitS: 30 },
    ];
    const box = { width: 640, height: 40 };
    const lane = raceLaneOf(yours, ghost, (sample) => sample.standing, box, 480, 10);
    // 240 of 480 s is mid-box for both lines; the ghost's 8 of max(15, …) sits below your 4's y.
    const yourPoints = lane.you.split(' ').map((pair) => pair.split(',').map(Number));
    const ghostPoints = lane.ghost.split(' ').map((pair) => pair.split(',').map(Number));
    expect(yourPoints[1]?.[0]).toBeCloseTo(320, 0);
    expect(ghostPoints[1]?.[0]).toBeCloseTo(320, 0);
    expect(ghostPoints[1]?.[1] ?? 0).toBeLessThan(yourPoints[1]?.[1] ?? 0);
    // The marker sits inside the box.
    expect(lane.markY).toBeGreaterThan(0);
    expect(lane.markY).toBeLessThan(box.height);
  });
});

describe('no interval claim, ever', () => {
  it('keeps interval language out of every string the strip can produce', () => {
    const recording = recordingOf();
    const texts = [
      RACE_FOOTER,
      SAME_CROWD_NOTE,
      RACE_PENDING,
      RACE_NOT_RUN,
      ...GHOST_OPTIONS.flatMap((option) => [option.label, option.note]),
      raceVerdictOf(55, 50),
      raceVerdictOf(50, 55),
      raceVerdictOf(50, 49),
      raceVerdictOf(undefined, undefined),
      raceStripViewOf({ recording, ghost: recording, simTimeS: 480 }).verdict,
      raceStripViewOf({ recording, ghost: undefined, simTimeS: 480 }).verdict,
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/interval|confidence|±|significan|p\s*[<=]/i);
      // R2's line: no dispatcher is named better/worse — the verdict is about two shares.
      expect(text).not.toMatch(/\bbetter than\b|\bworse than\b|\bbeats\b/i);
    }
  });
});
