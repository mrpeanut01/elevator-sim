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
import { refusedLeg, syntheticRecording, servedLeg, waitingLeg } from './synthetic.test-helper.js';

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
    /*
     * The fourth pair is the simulator's rather than the design's — `docs/20` defect 4, and
     * `docs/12` § 4.11. The handoff spells them *taking the stairs* and *gave up*; it also gives
     * the Day report's abandonment cell the phrase *TOOK THE STAIRS*, and the product puts the two
     * on one screen, where the audit read 534 against 288 under one label. The other three are the
     * handoff's, byte for byte, which is what makes this one entry a deviation rather than a drift.
     */
    expect(WAIT_BANDS.map((band) => band.label)).toEqual([
      'breezy',
      'tapping foot',
      'checking watch',
      'eyeing the stairs',
    ]);
    expect(WAIT_BANDS.map((band) => band.legendLabel)).toEqual([
      'under 30 s',
      'a minute',
      'two minutes',
      'past two minutes',
    ]);
    /*
     * Token names, not hexes — § D251. The four values live in `index.html`'s two `:root` blocks,
     * where a theme can reach them; a hex here is the copy that could not be repainted, and it is
     * what left the mood legend at 1.77:1 on a light page. `live/palette.test.ts` asserts the
     * general rule and that each of these is a property the page declares.
     */
    expect(BAND_COLORS).toEqual([
      'var(--band-0)',
      'var(--band-1)',
      'var(--band-2)',
      'var(--band-3)',
    ]);
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

/* -------------------------------------------------------------------------- *
 * The retrospective card's two ways of printing a wait nobody waited — issue #288
 * -------------------------------------------------------------------------- */

describe('a rider the door turned away is not somebody who stood all shift', () => {
  it('bands them at the wait they served, which is none of it', () => {
    /*
     * The defect in its smallest form. A refused leg never boards, so an ending rule reading
     * `boardedAt` alone walked their wait up with the playhead: at `t = 3000` this rider read as
     * having stood for **2 900 s** and took the card's fourth band and its longest-wait figure with
     * them. `refusedAt` equals `arrivedAt` on every refused leg the simulator produces, so the
     * honest banding is the first one.
     */
    const recording = syntheticRecording({
      legs: [refusedLeg('p1', 100), servedLeg('p2', 0, 20, 90)],
      endedAt: 3000,
    });
    const bands = waitBandsAt(recording, 3000, 'whole-run');
    expect(bands.total).toBe(2);
    expect(bands.counts.map((entry) => entry.count)).toEqual([2, 0, 0, 0]);
    expect(bands.longestCurrentWaitS).toBe(20);
    expect(bands.longestWaitIsCensored).toBe(false);
    expect(moodOf(bands).sub).toBe('across the whole shift, nobody stood half a minute');
  });

  it('still bands a refusal that came late at the wait it really cost', () => {
    // The negative control: the fix resolves the wait *at the refusal*, it does not skip the leg.
    const recording = syntheticRecording({ legs: [refusedLeg('p1', 0, 200)], endedAt: 3000 });
    const bands = waitBandsAt(recording, 3000, 'whole-run');
    expect(bands.longestCurrentWaitS).toBe(200);
    expect(bands.counts.map((entry) => entry.count)).toEqual([0, 0, 0, 1]);
  });

  it('qualifies a longest wait that belongs to somebody who never got a car', () => {
    /*
     * Issue #288's second mechanism, which the first does not fix: this rider was never refused and
     * never boarded, so the record never saw their wait end. The project's rule —
     * `shift/goals.ts` will not grade a censored maximum in either direction — now reaches the card
     * that prints one.
     */
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)], endedAt: 3000 });
    const bands = waitBandsAt(recording, 3000, 'whole-run');
    expect(bands.longestWaitIsCensored).toBe(true);
    expect(moodOf(bands).sub).toContain('the longest 3000 s — that wait had not ended');
    // And it is a qualification rather than a suppression: the figure is still there.
    expect(moodOf(bands).sub).toContain('1 riders stood past two minutes');
  });

  it('does not call the figure a lower bound, because this layer cannot prove it is one', () => {
    /*
     * The word `shift/report.ts#worstWaitFigure` uses is *at least*, and it may: `core` can see
     * `abandonedAt`, so a leg it calls censored really was still waiting. `VizLeg` carries none, so
     * an unresolved leg here may belong to a rider who ran out of patience and walked out long ago,
     * for whom `t - arrivedAt` **overstates**. `at least` would be a claim this layer cannot make,
     * which is exactly why `goals.ts` refuses rather than qualifies — so the clause says what is
     * true under both readings and nothing more.
     */
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)], endedAt: 3000 });
    expect(moodOf(waitBandsAt(recording, 3000, 'whole-run')).sub).not.toContain('at least');
  });

  it('does not qualify a maximum that a rider actually served', () => {
    const recording = syntheticRecording({ legs: [servedLeg('p1', 0, 200, 260)], endedAt: 3000 });
    const bands = waitBandsAt(recording, 3000, 'whole-run');
    expect(bands.longestWaitIsCensored).toBe(false);
    expect(moodOf(bands).sub).toContain('the longest 200 s');
    expect(moodOf(bands).sub).not.toContain('had not ended');
  });

  it('leaves the live card’s wait age unqualified, because that number is exact', () => {
    // The two bases mean different things by one figure — `WaitBands.longestWaitIsCensored`. A
    // rider standing at 130 s has stood 130 s; the card says so and claims nothing about their day.
    const recording = syntheticRecording({ legs: [waitingLeg('p1', 0)], endedAt: 3000 });
    const bands = waitBandsAt(recording, 130);
    expect(bands.longestWaitIsCensored).toBe(false);
    expect(moodOf(bands).sub).toBe('1 riders past two minutes');
  });
});

describe.each(BUILDING_IDS)('%s — the card and the fold agree about the worst wait', (buildingId) => {
  it('reaches the same maximum, and the same verdict on whether it is a bound', () => {
    /*
     * Two modules, two walks of the legs, one answer — the evidence idiom this package uses for
     * `peakQueue` against the landing fold. `observationsAt` and `waitBandsAt(…, 'whole-run')` apply
     * the same ending rule to the same population, and they are deliberately **not** refactored into
     * one call: deriving the card from the fold would make this a tautology, and this is the check
     * that would have caught issue #288 the day it landed, since the two disagreed by 34 000 s on
     * Secure Tower's own day while each looked internally consistent.
     */
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const bands = waitBandsAt(recording, t, 'whole-run');
      const fold = observationsAt(recording, t);
      expect(`${String(t)}: ${String(bands.longestCurrentWaitS)}`).toBe(
        `${String(t)}: ${String(fold.worstWaitSoFarS)}`,
      );
      expect(`${String(t)}: ${String(bands.longestWaitIsCensored)}`).toBe(
        `${String(t)}: ${String(fold.worstWaitIsCensored)}`,
      );
    }
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
