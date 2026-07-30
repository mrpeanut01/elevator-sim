/**
 * The wait-age bands and the mood card, against real runs of every shipped building.
 *
 * The load-bearing claim is the first one, and it is the same by-construction agreement
 * `overlay.test.ts` requires of `waitingNow`: the stacked bar's total must equal
 * `frameAt(recording, t).totalWaiting`. The two come from different structures built by different
 * code paths — the bands walk `recording.legs` through `queueAt`, the frame samples the fold
 * `foldPassengers` produced — so equality is evidence rather than tautology, and it is the check
 * that catches a banding that drops or double-counts somebody.
 *
 * The boundaries and the copy are pinned against the design rather than against themselves: the
 * mood card's fourth sub-line says *"past two minutes"* in prose, so `WAIT_BANDS[3].fromS` is
 * asserted to be 120 and the two cannot drift apart in silence.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';

import { BAND_COLORS, WAIT_BANDS, bandIndexOf, moodAt, moodOf, waitBandsAt } from './bands.js';
import { syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
}, 600_000);

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

/** Eleven instants spread across the run, including both ends. */
function sampleTimes(recording: VizRecording): readonly number[] {
  const span = recording.endedAt - recording.startedAt;
  return Array.from({ length: 11 }, (_unused, i) => recording.startedAt + (span * i) / 10);
}

describe('the band definitions are the design’s, and the prose is pinned to them', () => {
  it('carries the design’s four boundaries, colours, labels and faces', () => {
    expect(WAIT_BANDS.map((band) => band.id)).toEqual([
      'breezy',
      'tapping-foot',
      'checking-watch',
      'taking-the-stairs',
    ]);
    expect(WAIT_BANDS.map((band) => band.fromS)).toEqual([0, 30, 60, 120]);
    expect(WAIT_BANDS.map((band) => band.toS)).toEqual([30, 60, 120, undefined]);
    expect(WAIT_BANDS.map((band) => band.label)).toEqual([
      'breezy',
      'tapping foot',
      'checking watch',
      'taking the stairs',
    ]);
    expect(WAIT_BANDS.map((band) => band.legendLabel)).toEqual([
      'under 30 s',
      'a minute',
      'two minutes',
      'gave up',
    ]);
    expect(BAND_COLORS).toEqual(['#3fb27f', '#e0b040', '#e0773a', '#e0473a']);
    expect(WAIT_BANDS.map((band) => band.face)).toEqual(['◡', '◠', '⌄', '×']);
  });

  it('keeps the fourth band’s boundary and the sentence that names it together', () => {
    // `moodOf`'s fourth sub-line reads "N riders past two minutes". Move the boundary without
    // moving the sentence and the card starts making a claim the band does not support.
    expect(WAIT_BANDS[3]?.fromS).toBe(120);
    const bands = waitBandsAt(
      syntheticRecording({ legs: [waitingLeg('p1', 0)] }),
      WAIT_BANDS[3]?.fromS ?? 0,
    );
    expect(moodOf(bands).sub).toBe('1 riders past two minutes');
  });

  it('classifies on the boundary the way the design does — the lower bound is inclusive', () => {
    for (const [waited, index] of [
      [0, 0],
      [29.999, 0],
      [30, 1],
      [59.999, 1],
      [60, 2],
      [119.999, 2],
      [120, 3],
      [10_000, 3],
    ] as const) {
      expect(`${String(waited)} → ${String(bandIndexOf(waited))}`).toBe(
        `${String(waited)} → ${String(index)}`,
      );
    }
  });

});

describe.each(BUILDING_IDS)('%s — the bands agree with the frame', (buildingId) => {
  it('bands exactly the people the frame says are waiting', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const bands = waitBandsAt(recording, t);
      const frame = frameAt(recording, t);
      expect(`${String(t)}: ${String(bands.total)}`).toBe(
        `${String(t)}: ${String(frame.totalWaiting)}`,
      );
      const summed = bands.counts.reduce((sum, entry) => sum + entry.count, 0);
      expect(summed).toBe(bands.total);
    }
  }, 300_000);

  it('reports a worst band that is actually occupied, and a longest wait iff somebody waits', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const bands = waitBandsAt(recording, t);
      if (bands.total === 0) {
        expect(bands.worstIndex).toBe(0);
        expect(bands.longestCurrentWaitS).toBeUndefined();
        continue;
      }
      expect(bands.counts[bands.worstIndex]?.count).toBeGreaterThan(0);
      // Nothing above the worst band may hold anybody, or "worst" is the wrong word.
      for (let above = bands.worstIndex + 1; above < WAIT_BANDS.length; above += 1) {
        expect(bands.counts[above]?.count).toBe(0);
      }
      expect(bands.longestCurrentWaitS).toBeDefined();
      expect(bands.longestCurrentWaitS ?? -1).toBeGreaterThanOrEqual(
        WAIT_BANDS[bands.worstIndex]?.fromS ?? 0,
      );
    }
  }, 300_000);

  it('gives the same answer scrubbing backwards as forwards', () => {
    const recording = recordingOf(buildingId);
    const times = sampleTimes(recording);
    const forwards = times.map((t) => JSON.stringify(waitBandsAt(recording, t)));
    const backwards = [...times]
      .reverse()
      .map((t) => JSON.stringify(waitBandsAt(recording, t)))
      .reverse();
    expect(backwards).toEqual(forwards);
    const moodForwards = times.map((t) => JSON.stringify(moodAt(recording, t)));
    const moodBackwards = [...times]
      .reverse()
      .map((t) => JSON.stringify(moodAt(recording, t)))
      .reverse();
    expect(moodBackwards).toEqual(moodForwards);
  }, 300_000);
});

describe('the mood copy is the design’s, at every band', () => {
  const heads = [
    'Everyone is getting on with their day.',
    'A few people are checking their phones.',
    'The lobby is starting to notice.',
    'The stairwell door is getting a workout.',
  ];

  it.each([0, 1, 2, 3])('band %i', (index) => {
    // One rider, aged into the band under test, so the worst band is exactly `index`.
    const waited = (WAIT_BANDS[index]?.fromS ?? 0) + 1;
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)] });
    const mood = moodAt(recording, waited);
    expect(mood.index).toBe(index);
    expect(mood.headline).toBe(heads[index]);
    expect(mood.face).toBe(WAIT_BANDS[index]?.face);
    expect(mood.edge).toBe(WAIT_BANDS[index]?.color);
  });

  it('says something true about an empty lobby rather than nothing', () => {
    const mood = moodAt(syntheticRecording(), 300);
    expect(mood.index).toBe(0);
    expect(mood.sub).toBe('nobody has waited a minute');
  });

  it('rounds the sub-line’s longest wait, as the design does', () => {
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)] });
    expect(moodAt(recording, 42.4).sub).toBe('longest wait 42 s');
  });
});
