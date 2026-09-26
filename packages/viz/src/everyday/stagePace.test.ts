/**
 * **A whole day plays in about forty minutes, and nothing else changes speed** — GitHub issue
 * **#592**, [§ D991](../../../../DECISIONS.md).
 *
 * Four claims, and each is asserted in the direction that would catch the defect it guards:
 *
 * 1. **The standing requirement pointed at a clock.** A whole Midtown day is recorded through the
 *    shipped config builder and played end to end through the real {@link Playback}, over a
 *    {@link ManualClock}, with the stage's own rule asked once a frame exactly as
 *    `stageScreen.ts#pace` asks it. What is asserted is the real duration — measured in simulated
 *    seconds per real second from the code path, never from a wall clock on a shared box.
 * 2. **Both directions of the gate.** A slice, a rush and anything not a whole day play at one
 *    rung; and the rush's own template, paced as if it were a day, would not — which is why the
 *    gate is there.
 * 3. **R6.** The drain clause reads the present frame only: the pace at `t` over the real recording
 *    equals the pace at `t` over a copy with everything after `t` erased.
 * 4. **The owner's fallback is one constant.** With the between-peaks rung at or under the watching
 *    rung, the rule answers the watching rung everywhere.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { waitBandsAt } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { ManualClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { recordRun } from '../record/recordRun.js';
import { legibilityOf } from '../shift/legibility.js';
import { contractBuildings, contractDayState } from '../shift/contractDay.test-helper.js';
import { actsOf, runHorizonOf, wholeDayFor, wholeDayRun } from '../shift/dayLength.js';

import { clockAt } from '../live/timeline.js';
import { dayCallChangeOf } from '../shift/dayCalls.js';

import { pacedDayRealS } from './sittingShape.js';
import {
  BETWEEN_PEAKS_SIM_PER_REAL_S,
  PACE_HOLD_WAIT_S,
  SKIP_BEAT_REAL_S,
  STAGE_SKIP_BEAT_NOTE,
  firstMinuteWaitFrom,
  nextPeakFromBetween,
  stagePaceNoteOf,
  stagePaceOf,
  stageSkipApplies,
  stageSkipLineOf,
  stageSkipOf,
  type StagePaceInput,
  type StageSkip,
} from './stagePace.js';
import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S, STAGE_SPEEDS } from './stageScreenModel.js';

/** Simulated seconds of act in a day. */
const actSecondsOf = (acts: readonly { readonly startS: number; readonly endS: number }[]): number =>
  acts.reduce((sum, act) => sum + (act.endS - act.startS), 0);

/**
 * The contract the assessors measured, **as Today's scenario hands it over**: `c2`, Midtown Office,
 * with its rung — a car booked out and its letting — at `collective`, day 1, the sweep's first seed.
 * `contractDayState` is the helper every sweep builds a contract's day through, so the run here is
 * the one a player gets rather than the tower as built (which holds a landing all day and would
 * measure a different building).
 */
const RESOURCES = contractBuildings();
const WATCHING = DEFAULT_STAGE_SIM_PER_REAL_S;
const SEED = 20_260_824n;

/** The frame interval the measurement steps at. Coarser than a browser's; see the clock leg. */
const FRAME_MS = 500;

let dayState: ViewerState;
let day: VizRecording;
let config: ReturnType<typeof buildingConfigOf>;

beforeAll(() => {
  const probe = contractDayState('c2', { seed: SEED });
  config = buildingConfigOf(RESOURCES, probe.savedBuildings, probe.buildingId);
  const whole = wholeDayFor(RESOURCES.trafficProfiles, config);
  if (whole === undefined) throw new Error('midtown-office has no whole day');
  dayState = contractDayState('c2', { seed: SEED, over: wholeDayRun(whole) });
  const plan = shiftRunConfigOf(RESOURCES, dayState);
  day = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  }).recording;
});

function inputAt(recording: VizRecording, simTimeS: number, over: Partial<StagePaceInput> = {}): StagePaceInput {
  return {
    horizon: 'whole-day',
    acts: actsOf(recording.demandPhases),
    simTimeS,
    watchingSimPerRealS: WATCHING,
    longestStandingS:
      'longestStandingS' in over ? over.longestStandingS : observationsAt(recording, simTimeS).longestCurrentWaitS,
    playerChoseSpeedAtS: undefined,
    ...over,
  };
}

describe('the acts the stage reads are the record’s own three peaks', () => {
  it('the recording’s schedule and the record agree, and the peaks are 08:30, 12:15 and 17:15', () => {
    const fromRecording = actsOf(day.demandPhases);
    const fromRecord = wholeDayFor(RESOURCES.trafficProfiles, config)?.acts;
    expect(fromRecording).toEqual(fromRecord);
    expect(fromRecording.map((act) => [act.startS, act.endS])).toEqual([
      [1800, 3600],
      [15300, 17100],
      [33300, 35100],
    ]);
    expect(runHorizonOf(RESOURCES.trafficProfiles, config, dayState)).toBe('whole-day');
  });
});

describe('a whole day, played through the real transport', () => {
  /*
   * The clock leg. The transport is the shipped `Playback`; the rule is asked once a frame with the
   * present frame's longest wait, as the stage asks it, and the speed is moved only when the answer
   * changes. The real duration is the clock's own reading when the transport reports `ended`.
   *
   * `FRAME_MS` is half a second rather than a browser's sixteenth: a pace change lands on the next
   * frame, so the coarser step can only overshoot an act boundary by `30 × 0.5 = 15` simulated
   * seconds, which moves the total by a few seconds of forty minutes — and the loop costs a
   * thirtieth as much. The longest wait is read through `waitBandsAt`, the fold
   * `observationsAt` takes it from, because the whole observation fold per frame is what made this
   * leg slow under load; the R6 block below asserts the two agree.
   */
  it('takes about forty minutes at 4×, not the hundred and fifty it took at one rung', () => {
    const clock = new ManualClock();
    const playback = new Playback(day, clock, { speed: WATCHING, autoplay: true });
    const acts = actsOf(day.demandPhases);
    let simAtBetween = 0;
    let lastT = playback.simTimeS;
    while (playback.state !== 'ended') {
      const t = playback.simTimeS;
      const answer = stagePaceOf(inputAt(day, t, { longestStandingS: waitBandsAt(day, t).longestCurrentWaitS }));
      if (playback.speed === BETWEEN_PEAKS_SIM_PER_REAL_S) simAtBetween += t - lastT;
      lastT = t;
      if (playback.speed !== answer.simPerRealS) playback.setSpeed(answer.simPerRealS);
      clock.advance(FRAME_MS);
    }
    const realS = clock.now() / 1000;
    const flatS = (day.endedAt - day.startedAt) / WATCHING;
    const floorS = pacedDayRealS({ periodS: 36000, recordedS: 36000, slowS: actSecondsOf(acts) }, WATCHING);

    // The published floor, 2 370 s, is what a day with nobody held would take; a real day holds.
    expect(floorS).toBe(2370);
    expect(realS).toBeGreaterThanOrEqual(floorS - 15);
    // About forty minutes, and nowhere near one rung's 150 — the ruling measured ~47 on the
    // tower whose peaks drain longest, so anything past fifty is a regression rather than a drain.
    expect(realS).toBeLessThanOrEqual(50 * 60);
    expect(realS).toBeLessThan(flatS / 3);
    // And the between rung was really used for most of the quiet, rather than the total landing
    // under fifty by some other route.
    expect(simAtBetween).toBeGreaterThan((36000 - actSecondsOf(acts)) / 2);
    /*
     * The frame-by-frame transport agrees with the sweep's leg-based reading of the same day:
     * `stagePace.sweep.test.ts` computes this seed's day at **2 415.5 real s** from the union of the
     * acts and the held stretches. The frames step half a second, so they may overshoot each change
     * by a frame; thirty seconds of forty minutes is the tolerance, and a rule that disagreed with
     * its own sweep would miss it by minutes.
     */
    expect(Math.abs(realS - 2415.5)).toBeLessThan(30);
  });
});

describe('§ D512 on the whole day, pinned on one seed', () => {
  /*
   * § D991 moved the legibility table to the day Today's scenario plays. The fifty-seed rows are
   * pinned at budget by the gated sweeps; this pins the one whole day this file already pays for,
   * so a change to the crowd, the bands, the union or the whole-day run is red on every suite run.
   * `stagePace.sweep.test.ts` read the same run at 1 031 s.
   */
  it('reads c2’s first seed as legible, with the longest held landing at 1 031 s', () => {
    const legibility = legibilityOf(day);
    expect(legibility.legible).toBe(true);
    expect(Math.round(legibility.longestS)).toBe(1031);
  });
});

describe('only a whole day is paced', () => {
  it('a slice, a career day, a fix case and a watched run play at the player’s rung throughout', () => {
    for (let t = 0; t < day.endedAt; t += 600) {
      const answer = stagePaceOf(inputAt(day, t, { horizon: 'period' }));
      expect(answer.simPerRealS).toBe(WATCHING);
      expect(answer.reason).toBe('unmanaged');
      expect(stagePaceNoteOf(answer, { acts: [], simTimeS: t })).toBeUndefined();
    }
  });

  /*
   * The rush's template is a phase list too, and its only peak is its last three minutes. Paced by
   * the day's rule it would be crossed at the between rung almost to the end — which is the defect
   * the horizon gate exists to prevent, shown rather than asserted.
   */
  it('the rush plays at one rung, and would not if the gate were missing', () => {
    const record = RESOURCES.trafficProfiles.demandTemplates.find((entry) => entry.id === 'endless-rush');
    const phases = record?.phases;
    if (phases === undefined) throw new Error('endless-rush has no phase list');
    const acts = actsOf(
      phases.map((phase) => ({
        startS: phase.startMin * 60,
        endS: phase.endMin * 60,
        startIntensity: phase.startIntensity,
        endIntensity: phase.endIntensity,
      })),
    );
    const base: StagePaceInput = {
      horizon: 'period',
      acts,
      simTimeS: 600,
      watchingSimPerRealS: WATCHING,
      longestStandingS: undefined,
      playerChoseSpeedAtS: undefined,
    };
    expect(stagePaceOf(base).simPerRealS).toBe(WATCHING);
    // Positive control: the same input under the whole-day horizon is not one rung.
    expect(stagePaceOf({ ...base, horizon: 'whole-day' }).simPerRealS).toBe(BETWEEN_PEAKS_SIM_PER_REAL_S);
  });

  it('a chip press is the player’s until the next act boundary, and the stage paces again after it — § D1029', () => {
    /*
     * § D1029 amends § D991 clause 2. Pressed at 10:00 (7 200 s, between the morning and lunch
     * peaks), the chip stands to 12:15 (15 300 s), the lunch act's start, and not a second past it.
     * Before the amendment it stood to the end of the day, and this case read `chosen` everywhere.
     */
    const pressedAt = 7200;
    for (let t = pressedAt; t < 15300; t += 600) {
      const answer = stagePaceOf(inputAt(day, t, { playerChoseSpeedAtS: pressedAt }));
      expect(answer.simPerRealS).toBe(WATCHING);
      expect(answer.reason, String(t)).toBe('chosen');
    }
    const after = stagePaceOf(inputAt(day, 15300, { playerChoseSpeedAtS: pressedAt }));
    expect(after.reason).toBe('act');
    /* Past the lunch act's end, back between peaks, the chip does not come back on its own. */
    const later = stagePaceOf(inputAt(day, 18000, { playerChoseSpeedAtS: pressedAt, longestStandingS: undefined }));
    expect(later.reason).toBe('between');
    /* The note says until when, from the timetable. */
    expect(
      stagePaceNoteOf(stagePaceOf(inputAt(day, 9000, { playerChoseSpeedAtS: pressedAt })), {
        acts: actsOf(day.demandPhases),
        simTimeS: 9000,
        dayStartS: 8 * 3600,
      }),
    ).toBe('your speed, 4×, until 12:15');
    /* A chip pressed after the last boundary stands to the end of the day, and says so. */
    const last = stagePaceOf(inputAt(day, 35500, { playerChoseSpeedAtS: 35400 }));
    expect(last.reason).toBe('chosen');
    expect(stagePaceNoteOf(last, { acts: actsOf(day.demandPhases), simTimeS: 35500 })).toBe(
      'your speed, 4×, to the end of the day',
    );
  });

  it('a pinned day’s call stops the stage at any rung, on either horizon, and outranks a chip — § D1029', () => {
    const callAtS = 15700;
    for (const horizon of ['whole-day', 'period'] as const) {
      for (const over of [{}, { playerChoseSpeedAtS: 15600 }, { watchingSimPerRealS: 600 }]) {
        const at = stagePaceOf(inputAt(day, callAtS, { horizon, callAtS, ...over }));
        expect(at.reason, horizon).toBe('call');
        const past = stagePaceOf(inputAt(day, callAtS + 30, { horizon, callAtS, ...over }));
        expect(past.reason, horizon).toBe('call');
      }
      /* Before the call, and once it is answered (no `callAtS`), nothing stops. */
      expect(stagePaceOf(inputAt(day, callAtS - 1, { horizon, callAtS })).reason).not.toBe('call');
      expect(stagePaceOf(inputAt(day, callAtS + 30, { horizon })).reason).not.toBe('call');
    }
    const note = stagePaceNoteOf(stagePaceOf(inputAt(day, callAtS, { callAtS })), {
      acts: actsOf(day.demandPhases),
      simTimeS: callAtS,
    });
    expect(note).toBe('stopped for the day’s call');
  });

  it('inside an act, or while somebody has waited past a minute, the stage plays at the player’s rung', () => {
    const acts = actsOf(day.demandPhases);
    for (const act of acts) {
      expect(stagePaceOf(inputAt(day, act.startS)).simPerRealS).toBe(WATCHING);
      expect(stagePaceOf(inputAt(day, act.endS - 1)).simPerRealS).toBe(WATCHING);
    }
    const quiet: StagePaceInput = { ...inputAt(day, 10000), longestStandingS: PACE_HOLD_WAIT_S };
    expect(stagePaceOf(quiet).reason).toBe('held');
    expect(stagePaceOf({ ...quiet, longestStandingS: PACE_HOLD_WAIT_S - 1 }).reason).toBe('between');
  });
});

describe('the rung and its fallback', () => {
  it('the between-peaks rung is a chip on the ladder, so the strip can always name it', () => {
    expect(STAGE_SPEEDS.some((speed) => speed.simPerRealS === BETWEEN_PEAKS_SIM_PER_REAL_S)).toBe(true);
  });

  /*
   * § D991's named overrule. With the between rung at or below the player's rung, `max` answers the
   * player's rung between peaks too, so the whole day plays at one speed — today's behaviour before
   * this change — and nothing else has to move.
   */
  it('a watching rung at or above the between rung makes the rule answer the watching rung everywhere', () => {
    for (let t = 0; t < day.endedAt; t += 900) {
      expect(stagePaceOf(inputAt(day, t, { watchingSimPerRealS: BETWEEN_PEAKS_SIM_PER_REAL_S })).simPerRealS).toBe(
        BETWEEN_PEAKS_SIM_PER_REAL_S,
      );
    }
  });
});

describe('R6: the drain clause reads the present frame and nothing after it', () => {
  /** The recording as it stood at `t`: nobody who had not arrived, and nothing that had not happened. */
  function truncatedAt(recording: VizRecording, t: number): VizRecording {
    const cut = (value: number | undefined): number | undefined =>
      value === undefined || value > t ? undefined : value;
    const legs: VizLeg[] = recording.legs
      .filter((leg) => leg.arrivedAt <= t)
      .map((leg) => ({
        ...leg,
        boardedAt: cut(leg.boardedAt),
        alightedAt: cut(leg.alightedAt),
        refusedAt: cut(leg.refusedAt),
      }));
    return { ...recording, legs };
  }

  it('the pace at every sampled playhead is the same over the run and over the run cut at that playhead', () => {
    for (let t = 1200; t < day.endedAt; t += 1500) {
      const whole = stagePaceOf(inputAt(day, t));
      const cut = truncatedAt(day, t);
      const seen = stagePaceOf({ ...inputAt(day, t), longestStandingS: observationsAt(cut, t).longestCurrentWaitS });
      expect(seen, `at ${String(t)} s`).toEqual(whole);
      // The clock leg's cheaper read agrees with the stage's.
      expect(waitBandsAt(day, t).longestCurrentWaitS).toBe(observationsAt(day, t).longestCurrentWaitS);
    }
  });
});

/**
 * **A scored day is paced by the tutorial's hold rule** — [§ D1169](../../../../DECISIONS.md), the
 * decide-al ruling's Q1 clause 1. Fast while nobody on a landing has waited a minute, at the
 * player's rung while somebody has, on the present frame only, peaks and slices included.
 */
describe('a scored day — § D1169', () => {
  const scored = (t: number, over: Partial<StagePaceInput> = {}): StagePaceInput => inputAt(day, t, { scored: true, ...over });

  /** The stretches somebody on a landing has waited past a minute — the rule's slow set, read off the legs. */
  function heldSeconds(recording: VizRecording): number {
    const spans: [number, number][] = [];
    for (const leg of recording.legs) {
      const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
      const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
      if (left > from) spans.push([from, left]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cursor = -Infinity;
    for (const [a, b] of spans) {
      const from = Math.max(a, cursor);
      if (b > from) total += b - from;
      cursor = Math.max(cursor, b);
    }
    return total;
  }

  it('crosses a peak fast where nobody has waited a minute, and plays it at the player’s rung where somebody has', () => {
    const [morning] = actsOf(day.demandPhases);
    const inPeakQuiet = stagePaceOf(scored(morning!.startS + 60, { longestStandingS: 10 }));
    expect(inPeakQuiet).toEqual({ simPerRealS: BETWEEN_PEAKS_SIM_PER_REAL_S, reason: 'fast' });
    const inPeakHeld = stagePaceOf(scored(morning!.startS + 60, { longestStandingS: PACE_HOLD_WAIT_S }));
    expect(inPeakHeld).toEqual({ simPerRealS: WATCHING, reason: 'watching' });
    /* § D991's rule, the unscored path, still plays that peak at the player's rung. */
    expect(stagePaceOf(inputAt(day, morning!.startS + 60, { longestStandingS: 10 })).reason).toBe('act');
  });

  it('paces a slice the same way, where § D991 left a slice at one rung', () => {
    expect(stagePaceOf(scored(600, { horizon: 'period', longestStandingS: undefined })).reason).toBe('fast');
    expect(stagePaceOf(scored(600, { horizon: 'period', longestStandingS: 75 })).reason).toBe('watching');
    expect(stagePaceOf(inputAt(day, 600, { horizon: 'period' })).reason).toBe('unmanaged');
  });

  it('keeps a chip pressed while fast until somebody waits a minute, and a faster chosen rung throughout', () => {
    expect(stagePaceOf(scored(9000, { playerChoseSpeedAtS: 8900, longestStandingS: 5 }))).toEqual({
      simPerRealS: WATCHING,
      reason: 'yours',
    });
    /* A wait past a minute outranks the chip; the stage clears the chip there (`stageScreen.ts#pace`). */
    expect(stagePaceOf(scored(9000, { playerChoseSpeedAtS: 8900, longestStandingS: 61 })).reason).toBe('watching');
    /* A rung faster than the fast rung is never slowed down. */
    expect(stagePaceOf(scored(9000, { watchingSimPerRealS: 90, longestStandingS: undefined })).simPerRealS).toBe(90);
  });

  it('still stops for a pinned call', () => {
    expect(stagePaceOf(scored(15_700, { callAtS: 15_700 })).reason).toBe('call');
  });

  it('says what it is doing in one line, from the present frame', () => {
    const acts = actsOf(day.demandPhases);
    expect(stagePaceNoteOf({ simPerRealS: 30, reason: 'fast' }, { acts, simTimeS: 0 })).toBe(
      'fast-forwarding at 30× while nobody on a landing has waited a minute',
    );
    expect(stagePaceNoteOf({ simPerRealS: 4, reason: 'watching' }, { acts, simTimeS: 0 })).toBe(
      'at your speed, 4×, while somebody on a landing has waited over a minute',
    );
    expect(stagePaceNoteOf({ simPerRealS: 4, reason: 'yours' }, { acts, simTimeS: 0 })).toBe(
      'your speed, 4×, until somebody on a landing has waited a minute',
    );
  });

  it('reads the present frame and nothing after it — R6', () => {
    for (let t = 1200; t < day.endedAt; t += 1500) {
      const cut = {
        ...day,
        legs: day.legs
          .filter((leg) => leg.arrivedAt <= t)
          .map((leg) => ({
            ...leg,
            boardedAt: leg.boardedAt !== undefined && leg.boardedAt <= t ? leg.boardedAt : undefined,
            refusedAt: leg.refusedAt !== undefined && leg.refusedAt <= t ? leg.refusedAt : undefined,
          })),
      } as VizRecording;
      expect(
        stagePaceOf(scored(t, { longestStandingS: observationsAt(cut, t).longestCurrentWaitS })),
        String(t),
      ).toEqual(stagePaceOf(scored(t)));
    }
  });

  it('plays Midtown’s whole day in the real transport in the time its held stretches predict, well under § D991’s', () => {
    const clock = new ManualClock();
    const playback = new Playback(day, clock, { speed: WATCHING, autoplay: true });
    while (playback.state !== 'ended') {
      const t = playback.simTimeS;
      const answer = stagePaceOf(scored(t, { longestStandingS: waitBandsAt(day, t).longestCurrentWaitS }));
      if (playback.speed !== answer.simPerRealS) playback.setSpeed(answer.simPerRealS);
      clock.advance(FRAME_MS);
    }
    const realS = clock.now() / 1000;
    const slowS = heldSeconds(day);
    const predicted = pacedDayRealS({ periodS: 36000, recordedS: day.endedAt - day.startedAt, slowS }, WATCHING);
    /*
     * A pace change lands on the next half-second frame, which at 30× overshoots by up to fifteen
     * simulated seconds, and this rule changes pace far more often than § D991's did (every time a
     * landing crosses a minute, not four times a day), so the tolerance is a minute rather than half
     * of one. A rule that disagreed with its own slow set would miss by many minutes.
     */
    expect(Math.abs(realS - predicted)).toBeLessThan(60);
    /* § D991 read this seed at 2 415.5 real seconds; the acts are no longer slow of themselves. */
    expect(realS).toBeLessThan(2415.5 - 5 * 60);
    /* And no faster than the whole day crossed at the fast rung. */
    expect(realS).toBeGreaterThanOrEqual((day.endedAt - day.startedAt) / BETWEEN_PEAKS_SIM_PER_REAL_S - 15);
  });
});

/**
 * **Between a scored whole day's peaks, the quiet is skipped** — [§ D1212](../../../../DECISIONS.md),
 * swarm DN's Q1 (c). The stage plays a beat, then seeks to the first instant anybody reaches a
 * minute, the next call or the next peak's start, read exactly off the recording; inside a peak
 * § D1169 is unchanged, and the playhead is the only thing that moves.
 */
describe('the skip between a scored whole day’s peaks — § D1212', () => {
  const FAST = BETWEEN_PEAKS_SIM_PER_REAL_S;
  const BEAT_SIM_S = SKIP_BEAT_REAL_S * FAST;

  /** Every stretch with somebody past a minute, merged: the slow set, read off the legs directly. */
  function heldOf(recording: VizRecording): [number, number][] {
    const spans: [number, number][] = [];
    for (const leg of recording.legs) {
      const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
      const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
      if (left > from) spans.push([from, left]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [a, b] of spans) {
      const last = merged[merged.length - 1];
      if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return merged;
  }

  /** The skip the stage would take at `t` with the beat already played. */
  const skipAt = (t: number, stopAtS?: number): StageSkip | undefined =>
    stageSkipOf({
      acts: actsOf(day.demandPhases),
      legs: day.legs,
      simTimeS: t,
      armedAtS: t - BEAT_SIM_S,
      simPerRealS: FAST,
      stopAtS,
    });

  it('reads a peak as an act of the authored phases, and applies only between two of them', () => {
    const acts = actsOf(day.demandPhases);
    /* The acts are the three the first describe block pins: 08:30, 12:15 and 17:15, half an hour each. */
    expect(nextPeakFromBetween(acts, 900), 'before the first peak').toBeUndefined();
    expect(nextPeakFromBetween(acts, 2000), 'inside the morning peak').toBeUndefined();
    expect(nextPeakFromBetween(acts, 3600)?.startS, 'the morning peak has just ended').toBe(15300);
    expect(nextPeakFromBetween(acts, 9000)?.startS).toBe(15300);
    expect(nextPeakFromBetween(acts, 16000), 'inside lunch').toBeUndefined();
    expect(nextPeakFromBetween(acts, 24000)?.startS).toBe(33300);
    expect(nextPeakFromBetween(acts, 35500), 'after the last peak').toBeUndefined();

    const gate = { horizon: 'whole-day' as const, scored: true, acts, simTimeS: 9000, reason: 'fast' as const };
    expect(stageSkipApplies(gate)).toBe(true);
    /* Every other reason, every other horizon, an unscored day, and outside the gaps: no skip. */
    for (const reason of ['yours', 'watching', 'call', 'between', 'held', 'act', 'chosen', 'unmanaged'] as const) {
      expect(stageSkipApplies({ ...gate, reason }), reason).toBe(false);
    }
    expect(stageSkipApplies({ ...gate, horizon: 'period' }), 'a slice').toBe(false);
    expect(stageSkipApplies({ ...gate, scored: false }), 'a replay or a watched run').toBe(false);
    for (const simTimeS of [900, 2000, 16000, 35500]) {
      expect(stageSkipApplies({ ...gate, simTimeS }), String(simTimeS)).toBe(false);
    }
  });

  it('lands exactly where somebody first reaches a minute or the next peak starts, and passes nobody at a minute', () => {
    const acts = actsOf(day.demandPhases);
    const held = heldOf(day);
    const seen = new Set<string>();
    for (let t = 3600; t < 33300; t += 300) {
      if (nextPeakFromBetween(acts, t) === undefined) continue;
      if (held.some(([a, b]) => t >= a && t < b)) continue;
      const skip = skipAt(t);
      if (skip === undefined) continue;
      seen.add(skip.until);
      /* Nothing it passes over had anybody at a minute. */
      expect(held.some(([a, b]) => a < skip.toS && b > skip.fromS), `${String(t)} passes a wait`).toBe(false);
      if (skip.until === 'wait') {
        /* And where it lands, somebody has just reached one: a held stretch starts exactly there. */
        expect(held.some(([a]) => a === skip.toS), `${String(t)} lands on no wait`).toBe(true);
        expect(firstMinuteWaitFrom(day.legs, t)).toBe(skip.toS);
        expect(waitBandsAt(day, skip.toS + 1e-6).longestCurrentWaitS).toBeGreaterThanOrEqual(PACE_HOLD_WAIT_S);
      } else {
        expect(skip.until).toBe('peak');
        expect(skip.toS).toBe(nextPeakFromBetween(acts, t)?.startS);
      }
    }
    /* The day exercises both ends, or this case asserts less than it says. */
    expect([...seen].sort()).toEqual(['peak', 'wait']);
  });

  it('stops at a call and never passes one', () => {
    const t = quietInstant();
    const free = skipAt(t);
    if (free === undefined) throw new Error('no skip at the quiet instant');
    const call = (t + free.toS) / 2;
    expect(skipAt(t, call)).toEqual({ fromS: t, toS: call, until: 'call' });
    /* A call already behind the playhead, or beyond where the skip lands, changes nothing. */
    expect(skipAt(t, t - 10)).toEqual(free);
    expect(skipAt(t, free.toS + 10)).toEqual(free);
  });

  it('plays a beat first, and plays a stretch shorter than two beats rather than skipping it', () => {
    const t = quietInstant();
    const base = { acts: actsOf(day.demandPhases), legs: day.legs, simTimeS: t, simPerRealS: FAST };
    expect(stageSkipOf({ ...base, armedAtS: t })).toBeUndefined();
    expect(stageSkipOf({ ...base, armedAtS: t - BEAT_SIM_S + 1 })).toBeUndefined();
    expect(stageSkipOf({ ...base, armedAtS: t - BEAT_SIM_S })).toBeDefined();
    const target = skipAt(t)!.toS;
    /* One beat short of where it would land, there is nothing worth skipping. */
    expect(skipAt(target - BEAT_SIM_S + 1)).toBeUndefined();
  });

  it('names no instant ahead while it is coming, and only past instants once it has landed', () => {
    expect(STAGE_SKIP_BEAT_NOTE).not.toMatch(/\d/u);
    const skip = skipAt(quietInstant())!;
    const line = stageSkipLineOf(skip, 8 * 3600);
    expect(line).toMatch(/^skipped \d\d:\d\d–\d\d:\d\d: nobody on a landing waited a minute$/u);
    /* The later clock is where the stage now stands: nothing after the playhead is named. */
    expect(line).toContain(`–${clockAt(skip.toS, 8 * 3600)}:`);
  });

  /** An instant between the first two peaks where nobody has waited a minute and a skip is due. */
  function quietInstant(): number {
    const held = heldOf(day);
    for (let t = 3700; t < 15300; t += 60) {
      if (held.some(([a, b]) => t >= a && t < b)) continue;
      const skip = skipAt(t);
      if (skip !== undefined && skip.toS - t > 20 * BEAT_SIM_S) return t;
    }
    throw new Error('Midtown’s morning gap has no quiet stretch to skip');
  }

  /**
   * The stage's frame loop, over the real transport: § D1169's pace, § D1212's skip exactly as
   * `stageScreen.ts#skipBetweenPeaks` asks it, and a stop at each of `stops` that puts the playhead on
   * the stop's second (§ D1153) and records it. The pause at a stop is the player's and costs nothing.
   */
  function play(recording: VizRecording, stops: readonly number[], skip: boolean) {
    const clock = new ManualClock();
    const playback = new Playback(recording, clock, { speed: WATCHING, autoplay: true });
    const acts = actsOf(recording.demandPhases);
    const pending = [...stops].sort((a, b) => a - b);
    const stoppedAt: number[] = [];
    const skips: StageSkip[] = [];
    let armedAtS: number | undefined;
    let landedAtS: number | undefined;
    while (playback.state !== 'ended') {
      const t = playback.simTimeS;
      const stop = pending[0];
      const answer = stagePaceOf({
        ...inputAt(recording, t, { longestStandingS: waitBandsAt(recording, t).longestCurrentWaitS }),
        scored: true,
        callAtS: stop,
      });
      if (answer.reason === 'call' && stop !== undefined) {
        if (playback.simTimeS > stop) playback.seekTo(stop);
        stoppedAt.push(playback.simTimeS);
        pending.shift();
        armedAtS = undefined;
        continue;
      }
      if (playback.speed !== answer.simPerRealS) playback.setSpeed(answer.simPerRealS);
      const applies =
        skip &&
        !(landedAtS !== undefined && Math.abs(t - landedAtS) < 1) &&
        stageSkipApplies({ horizon: 'whole-day', scored: true, acts, simTimeS: t, reason: answer.reason });
      if (!applies) armedAtS = undefined;
      else if (armedAtS === undefined) armedAtS = t;
      else {
        const taken = stageSkipOf({
          acts,
          legs: recording.legs,
          simTimeS: t,
          armedAtS,
          simPerRealS: playback.speed,
          stopAtS: stop,
        });
        if (taken !== undefined) {
          skips.push(taken);
          landedAtS = taken.toS;
          armedAtS = undefined;
          playback.seekTo(taken.toS);
          continue;
        }
      }
      clock.advance(FRAME_MS);
    }
    return { realS: clock.now() / 1000, stoppedAt, skips, endedAtS: playback.simTimeS };
  }

  it('plays Midtown’s day in the time its legs predict, both ways, and the skip takes most of the quiet out', () => {
    const acts = actsOf(day.demandPhases);
    const model = (skip: boolean) =>
      scoredDayPlayOf({
        legs: day.legs,
        acts,
        startedAt: day.startedAt,
        endedAt: day.endedAt,
        stopsAtS: [],
        watchingSimPerRealS: WATCHING,
        skip,
      });
    const without = play(day, [], false);
    const withSkip = play(day, [], true);
    /* Half-second frames: a pace change or the end of a beat lands up to a frame late. */
    expect(Math.abs(without.realS - model(false).realS)).toBeLessThan(60);
    expect(Math.abs(withSkip.realS - model(true).realS)).toBeLessThan(60);
    expect(withSkip.skips.length).toBe(model(true).skips);
    /* The skip is worth having on this day: more than a third of § D1169's day goes. */
    expect(withSkip.realS).toBeLessThan(without.realS * (2 / 3));
    /* And it never skips inside a peak, before the first or after the last. */
    for (const taken of withSkip.skips) {
      expect(nextPeakFromBetween(acts, taken.fromS), String(taken.fromS)).toBeDefined();
      expect(taken.toS).toBeLessThanOrEqual(nextPeakFromBetween(acts, taken.fromS)!.startS);
    }
    expect(withSkip.endedAtS).toBe(day.endedAt);
  });

  /*
   * The ruling's one hard condition: the run, the goals, the census and the report stay the whole
   * day's. The skip moves the playhead and cannot touch the recording, so what could move is where
   * the stage stops for a call — and an answer is stamped where the stage stops. So the day is played
   * both ways with two calls inside long quiet stretches, a press is filed at each stop exactly where
   * the stage stood, and the day re-simulated with those presses must be the same run, leg for leg.
   */
  it('stops at every call on the same second with and without the skip, so a day answered either way is the same run', () => {
    const before = structuredClone(day.legs);
    const t = quietInstant();
    const free = skipAt(t)!;
    const stops = [(t + free.toS) / 2, 24_000];
    const withSkip = play(day, stops, true);
    const without = play(day, stops, false);
    expect(withSkip.stoppedAt).toEqual(stops);
    expect(without.stoppedAt).toEqual(stops);
    /* A skip landed on the first call rather than running past it. */
    expect(withSkip.skips.some((taken) => taken.until === 'call' && taken.toS === stops[0])).toBe(true);
    /* Playing it touched nothing the report reads. */
    expect(day.legs).toEqual(before);

    const change = dayCallChangeOf('park-cars-lobby');
    if (change === undefined) throw new Error('parking has no change');
    const answered = (at: readonly number[]) => {
      const plan = shiftRunConfigOf(RESOURCES, {
        ...dayState,
        interventions: at.map((atS) => ({ atS, change })),
      });
      return recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
    };
    const skipped = answered(withSkip.stoppedAt);
    const watched = answered(without.stoppedAt);
    expect(skipped.legs).toEqual(watched.legs);
    expect(observationsAt(skipped, skipped.endedAt)).toEqual(observationsAt(watched, watched.endedAt));
    /* Positive control: the presses do change the run, so equal legs are not equal by accident. */
    expect(skipped.legs).not.toEqual(day.legs);
  });
});
