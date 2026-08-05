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
import { BUILDING_IDS, DATA_DIR, breadthConfig, fixtureConfig } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';

import { BAND_COLORS, WAIT_BANDS, bandIndexOf, moodAt, moodOf, waitBandsAt } from './bands.js';
import { observationsAt } from './observations.js';
import { syntheticRecording, servedLeg, waitingLeg } from './synthetic.test-helper.js';

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

/* -------------------------------------------------------------------------- *
 * Issue #35 — the card at the terminal instant
 * -------------------------------------------------------------------------- */

describe('a shift that ended badly cannot be reported as a calm one', () => {
  /**
   * A run that **failed and then drained** — the exact shape issue #35 was filed on, and the one
   * the live banding cannot see.
   *
   * Every rider arrives at once, nobody boards for eleven minutes, and then everybody does. At any
   * instant inside the run the queue is deep and old; at `endedAt` it is empty, because that is
   * what a completed run *is*. The summary is authored to match — saturated, refused, and with the
   * service-level verdict a run like this earns — rather than left healthy, so the fixture is a
   * failed run and not a calm run with a flag on it.
   *
   * Held as a fixture rather than as a real replication because the claim is about a *class* of
   * run and a synthetic case can hold the class still. The real one is measured in
   * `dev/leftRail.test.ts`, on `midtown-office` under `collective`, and is the same defect.
   */
  const COLLAPSED_LEGS = 40;
  const collapsedRun = (): VizRecording =>
    syntheticRecording({
      endedAt: 700,
      legs: Array.from({ length: COLLAPSED_LEGS }, (_unused, i) =>
        servedLeg(`p${String(i).padStart(3, '0')}`, 0, 660, 690),
      ),
      summary: {
        saturated: true,
        awtIsValid: false,
        awtInvalidReason:
          'the run saturated: the queues did not reach a steady state, so a mean wait describes ' +
          'nothing.',
        serviceLevel: {
          verdict: 'starved',
          longestWaitS: 660,
          longestWaitIsCensored: false,
          overHorizonCount: 0,
          arrivalCount: COLLAPSED_LEGS,
          horizonS: 900,
        },
      },
    });

  it('the live banding really does go empty at the end — the defect, reproduced', () => {
    const recording = collapsedRun();
    // Mid-run: forty people, all past two minutes. This is what the shift was like.
    const during = waitBandsAt(recording, 600);
    expect(during.total).toBe(COLLAPSED_LEGS);
    expect(during.worstIndex).toBe(3);
    // At the end: nobody standing, because everybody has been carried. Both readings are correct.
    const atEnd = waitBandsAt(recording, recording.endedAt);
    expect(atEnd.total).toBe(0);
    expect(atEnd.worstIndex).toBe(0);
    expect(observationsAt(recording, recording.endedAt).waitingNow).toBe(0);
  });

  it('does not claim the building is fine once the shift is over', () => {
    const recording = collapsedRun();
    const mood = moodAt(recording, recording.endedAt, 'whole-run');
    // The headline is the assertion the issue asked for: it may not be the calm one, in either
    // tense, on a shift in which forty people stood for eleven minutes.
    expect(mood.headline).not.toBe('Everyone is getting on with their day.');
    expect(mood.headline).not.toBe('Nobody stood for long today.');
    expect(mood.index).toBe(3);
    expect(mood.face).toBe(WAIT_BANDS[3]?.face);
    expect(mood.bandId).toBe('taking-the-stairs');
    // And the sub-line may not be the sentence that sat above `served under 60 s 18%`.
    expect(mood.sub).not.toContain('nobody has waited a minute');
    expect(mood.sub).toContain('40 riders stood past two minutes');
    expect(mood.sub).toContain('across the whole shift');
  });

  it('bands the run’s own people, not the empty lobby', () => {
    const recording = collapsedRun();
    const bands = waitBandsAt(recording, recording.endedAt, 'whole-run');
    expect(bands.basis).toBe('whole-run');
    expect(bands.total).toBe(COLLAPSED_LEGS);
    expect(bands.counts.map((entry) => entry.count)).toEqual([0, 0, 0, COLLAPSED_LEGS]);
    expect(Math.round(bands.longestCurrentWaitS ?? 0)).toBe(660);
  });

  it('says which of the two questions it answered, in the copy and not only in the field', () => {
    // A rider parked squarely in the second band, so the same band reads two ways.
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)] });
    const live = moodAt(recording, 45);
    const closed = moodAt(recording, 45, 'whole-run');
    expect(live.index).toBe(closed.index);
    expect(live.basis).toBe('now');
    expect(closed.basis).toBe('whole-run');
    // KB-15's argument, one type up: the two must be distinguishable from the words alone.
    expect(closed.headline).not.toBe(live.headline);
    expect(closed.sub).not.toBe(live.sub);
    expect(closed.sub).toContain('across the whole shift');
  });

  it('is non-decreasing in the playhead, so a band cannot un-happen', () => {
    const recording = collapsedRun();
    let worst = -1;
    for (let t = 0; t <= recording.endedAt; t += 25) {
      const index = waitBandsAt(recording, t, 'whole-run').worstIndex;
      expect(index).toBeGreaterThanOrEqual(worst);
      worst = index;
    }
    expect(worst).toBe(3);
  });
});

describe.each(BUILDING_IDS)('%s — the whole-run banding, on a real run', (buildingId) => {
  it('never reports a calmer worst band than the live one did at any sampled instant', () => {
    const recording = recordingOf(buildingId);
    const closing = waitBandsAt(recording, recording.endedAt, 'whole-run');
    for (const t of sampleTimes(recording)) {
      const live = waitBandsAt(recording, t);
      // Everyone the live banding can see is somebody the whole-run banding has already counted,
      // at a wait age at least as old. So the retrospective worst band dominates every live one —
      // which is the property that makes the terminal card impossible to flatter.
      expect(`${String(t)}: ${String(closing.worstIndex)}`).toBe(
        `${String(t)}: ${String(Math.max(closing.worstIndex, live.worstIndex))}`,
      );
    }
  }, 300_000);

  it('counts everybody who called, and the live banding is a subset of it', () => {
    const recording = recordingOf(buildingId);
    const closing = waitBandsAt(recording, recording.endedAt, 'whole-run');
    const observations = observationsAt(recording, recording.endedAt);
    expect(closing.total).toBe(observations.arrived);
    expect(closing.total).toBeGreaterThanOrEqual(
      waitBandsAt(recording, recording.endedAt).total,
    );
  }, 300_000);
});

describe('a real collapsed run — the one the issue was filed on', () => {
  let recording: VizRecording;

  beforeAll(async () => {
    // `midtown-office` under `collective` over an hour of demand: the reporter's own selection.
    recording = recordRun(
      fixtureConfig(config, {
        buildingId: 'midtown-office',
        dispatcherId: 'collective',
        durationS: 3600,
        onTimeout: 'report',
      }),
    ).recording;
  }, 600_000);

  it('really did collapse, or the rest of this proves nothing', () => {
    const observations = observationsAt(recording, recording.endedAt);
    expect(recording.summary.saturated).toBe(true);
    expect(recording.summary.awtIsValid).toBe(false);
    // It drained: nobody is left standing, which is why the live card smiled.
    expect(observations.waitingNow).toBe(0);
    expect(observations.abandoned).toBeGreaterThan(100);
    expect(observations.servedUnderThresholdPct ?? 100).toBeLessThan(50);
  }, 600_000);

  it('is reported by its worst, not by its last frame', () => {
    const mood = moodAt(recording, recording.endedAt, 'whole-run');
    expect(mood.headline).not.toBe('Everyone is getting on with their day.');
    expect(mood.index).toBe(3);
    expect(mood.sub).toContain('across the whole shift');
    // And the reading that produced the defect is still available and still says what it says.
    expect(moodAt(recording, recording.endedAt).headline).toBe(
      'Everyone is getting on with their day.',
    );
  }, 600_000);
});
