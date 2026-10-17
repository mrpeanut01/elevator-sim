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
import { buildingConfigOf, pressDayCallOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { waitBandsAt } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { ManualClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { recordRun } from '../record/recordRun.js';
import { legibilityOf } from '../shift/legibility.js';
import { contractBuildings, contractDayState, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { openWeek } from '../shift/week.js';
import { actsOf, runHorizonOf, wholeDayFor, wholeDayRun } from '../shift/dayLength.js';

import { clockAt } from '../live/timeline.js';
import { dayCallChangeOf } from '../shift/dayCalls.js';

import { pacedDayRealS } from './sittingShape.js';
import {
  BETWEEN_PEAKS_SIM_PER_REAL_S,
  PACE_HOLD_WAIT_S,
  SKIP_BEAT_REAL_S,
  STAGE_SKIP_BEAT_NOTE,
  WATCH_ALLOWANCE_REAL_S,
  firstMinuteWaitFrom,
  nextPeakStartAfter,
  stagePaceNoteOf,
  stagePaceOf,
  stageSkipApplies,
  stageSkipLineOf,
  stageSkipLineStands,
  stageSkipOf,
  stageStatusOf,
  watchedRealAfter,
  type StagePaceInput,
  type StagePaceReason,
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

  /*
   * Wave AO, lane DR-1, § D1435: once the stage has read the day lost, the rest plays at the fast rung
   * whoever is waiting (red before: `watching` at the player's rung), a chip pressed after that
   * instant is the player's to the end, and nothing changes before it.
   */
  it('plays a lost day fast whoever waits, keeps a chip pressed after the loss, and nothing before it — § D1435', () => {
    const lostAtS = 4000;
    const held = stagePaceOf(scored(lostAtS + 60, { longestStandingS: PACE_HOLD_WAIT_S + 30, lostAtS }));
    expect(held).toEqual({ simPerRealS: BETWEEN_PEAKS_SIM_PER_REAL_S, reason: 'lost' });
    expect(stagePaceNoteOf(held, { acts: [], simTimeS: lostAtS + 60 })).toBe(
      'the day can no longer clear: playing the rest at 30×, and no call is asked',
    );
    /* A chip pressed after the loss is the player's rung, even a slow one; one pressed before it is not. */
    const chosen = stagePaceOf(scored(lostAtS + 60, { longestStandingS: PACE_HOLD_WAIT_S + 30, lostAtS, playerChoseSpeedAtS: lostAtS + 10 }));
    expect(chosen).toEqual({ simPerRealS: WATCHING, reason: 'lost' });
    expect(stagePaceOf(scored(lostAtS + 60, { longestStandingS: 10, lostAtS, playerChoseSpeedAtS: lostAtS - 10 })).simPerRealS).toBe(
      BETWEEN_PEAKS_SIM_PER_REAL_S,
    );
    /* Before the loss, or with none, § D1169's rule as it was; and a call still stops the transport first. */
    expect(stagePaceOf(scored(lostAtS - 1, { longestStandingS: PACE_HOLD_WAIT_S + 30, lostAtS })).reason).toBe('watching');
    expect(stagePaceOf(scored(lostAtS + 60, { longestStandingS: PACE_HOLD_WAIT_S + 30 })).reason).toBe('watching');
    expect(stagePaceOf(scored(lostAtS + 60, { lostAtS, callAtS: lostAtS + 30 })).reason).toBe('call');
    /* Unscored, nothing is lost. */
    expect(stagePaceOf(inputAt(day, lostAtS + 60, { lostAtS })).reason).not.toBe('lost');
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
 * The stage's frame loop, over the real transport: § D1169's pace, § D1212's skip exactly as
 * `stageScreen.ts#skipBetweenPeaks` asks it, and a stop at each of `stops` that puts the playhead on
 * the stop's second (§ D1153) and records it. The pause at a stop is the player's and costs nothing.
 * `allowance` is § D1493's limit on the hold, counted as `stageScreen.ts#pace` counts it; `false` is
 * § D1169's hold as it was. `frameMs` is the frame interval, half a second unless a case needs the
 * stage's own precision.
 */
function play(recording: VizRecording, stops: readonly number[], skip: boolean, allowance = true, frameMs = FRAME_MS) {
  const clock = new ManualClock();
  const playback = new Playback(recording, clock, { speed: WATCHING, autoplay: true });
  const acts = actsOf(recording.demandPhases);
  const pending = [...stops].sort((a, b) => a - b);
  const stoppedAt: number[] = [];
  const stoppedRealS: number[] = [];
  const skips: StageSkip[] = [];
  let armedAtS: number | undefined;
  let landedAtS: number | undefined;
  /* § D1493, as `stageScreen.ts#pace` counts it: watching since the last stop, frame by frame. */
  let watchedRealS = 0;
  let last: { reason: StagePaceReason; atS: number; simPerRealS: number } | undefined;
  while (playback.state !== 'ended') {
    const t = playback.simTimeS;
    const stop = pending[0];
    if (last !== undefined) {
      watchedRealS = watchedRealAfter(watchedRealS, { reason: last.reason, fromS: last.atS, toS: t, simPerRealS: last.simPerRealS });
    }
    const answer = stagePaceOf({
      ...inputAt(recording, t, { longestStandingS: waitBandsAt(recording, t).longestCurrentWaitS }),
      scored: true,
      callAtS: stop,
      watchedRealS: allowance ? watchedRealS : undefined,
    });
    last = { reason: answer.reason, atS: t, simPerRealS: answer.simPerRealS };
    if (answer.reason === 'call' && stop !== undefined) {
      if (playback.simTimeS > stop) playback.seekTo(stop);
      stoppedAt.push(playback.simTimeS);
      stoppedRealS.push(clock.now() / 1000);
      pending.shift();
      armedAtS = undefined;
      watchedRealS = 0;
      last = undefined;
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
        endedAt: recording.endedAt,
      });
      if (taken !== undefined) {
        skips.push(taken);
        landedAtS = taken.toS;
        armedAtS = undefined;
        playback.seekTo(taken.toS);
        continue;
      }
    }
    clock.advance(frameMs);
  }
  return { realS: clock.now() / 1000, stoppedAt, stoppedRealS, skips, endedAtS: playback.simTimeS };
}

/**
 * **Between a scored whole day's peaks, the quiet is skipped** — [§ D1212](../../../../DECISIONS.md),
 * swarm DN's Q1 (c). The stage plays a beat, then seeks to the first instant anybody reaches a
 * minute, the next call or the next peak's start, read exactly off the recording; inside a peak
 * § D1169 is unchanged, and the playhead is the only thing that moves.
 */
describe('the skip across a scored whole day’s quiet — § D1212, widened by § D1266', () => {
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
      endedAt: day.endedAt,
    });

  it('reads a peak as an act of the authored phases, and applies anywhere in the day while fast (§ D1266)', () => {
    const acts = actsOf(day.demandPhases);
    /* The acts are the three the first describe block pins: 08:30, 12:15 and 17:15, half an hour each. */
    expect(nextPeakStartAfter(acts, 900)?.startS, 'before the first peak').toBe(1800);
    expect(nextPeakStartAfter(acts, 2000)?.startS, 'inside the morning peak').toBe(15300);
    expect(nextPeakStartAfter(acts, 9000)?.startS).toBe(15300);
    expect(nextPeakStartAfter(acts, 16000)?.startS, 'inside lunch').toBe(33300);
    expect(nextPeakStartAfter(acts, 35500), 'after the last peak').toBeUndefined();

    const gate = { horizon: 'whole-day' as const, scored: true, acts, simTimeS: 9000, reason: 'fast' as const };
    /* § D1212 skipped only between two peaks; § D1266 skips before the first, inside one and after the last too. */
    for (const simTimeS of [900, 2000, 9000, 16000, 35500]) {
      expect(stageSkipApplies({ ...gate, simTimeS }), String(simTimeS)).toBe(true);
    }
    /* Every other reason, every other horizon, an unscored day, and a day with no peaks: no skip. */
    for (const reason of ['yours', 'watching', 'unheld', 'call', 'between', 'held', 'act', 'chosen', 'unmanaged'] as const) {
      expect(stageSkipApplies({ ...gate, reason }), reason).toBe(false);
    }
    expect(stageSkipApplies({ ...gate, horizon: 'period' }), 'a slice').toBe(false);
    expect(stageSkipApplies({ ...gate, scored: false }), 'a replay or a watched run').toBe(false);
    expect(stageSkipApplies({ ...gate, acts: [] }), 'a day with no peaks').toBe(false);
  });

  it('after the last peak lands on the day’s end, and plays the tail where it is not given the end', () => {
    const acts = actsOf(day.demandPhases);
    const held = heldOf(day);
    const lastPeakEnd = Math.max(...acts.map((act) => act.endS));
    let checked = 0;
    for (let t = lastPeakEnd; t < day.endedAt; t += 30) {
      if (held.some(([a, b]) => t >= a && t < b)) continue;
      const skip = skipAt(t);
      if (skip === undefined) continue;
      checked += 1;
      expect(held.some(([a, b]) => a < skip.toS && b > skip.fromS), `${String(t)} passes a wait`).toBe(false);
      if (skip.until === 'end') expect(skip.toS).toBe(day.endedAt);
      else expect(skip.until).toBe('wait');
      /* Without the run's end there is nowhere to land after the last peak. */
      const noEnd = stageSkipOf({ acts, legs: day.legs, simTimeS: t, armedAtS: t - BEAT_SIM_S, simPerRealS: FAST });
      if (skip.until === 'end') expect(noEnd).toBeUndefined();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('lands exactly where somebody first reaches a minute or the next peak starts, and passes nobody at a minute', () => {
    const acts = actsOf(day.demandPhases);
    const held = heldOf(day);
    const seen = new Set<string>();
    for (let t = 0; t < 33300; t += 300) {
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
        expect(skip.toS).toBe(nextPeakStartAfter(acts, t)?.startS);
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
    /*
     * § D1266: it skips anywhere, and still passes no wait and no peak's start: every skip lands at
     * or before the next peak's start, or the day's end after the last peak.
     */
    const held = heldOf(day);
    for (const taken of withSkip.skips) {
      expect(held.some(([a, b]) => a < taken.toS && b > taken.fromS), String(taken.fromS)).toBe(false);
      expect(taken.toS).toBeLessThanOrEqual(nextPeakStartAfter(acts, taken.fromS)?.startS ?? day.endedAt);
    }
    /* And it does skip where § D1212 did not: before the first peak or inside one. */
    const firstPeak = Math.min(...acts.map((act) => act.startS));
    expect(
      withSkip.skips.some(
        (taken) => taken.fromS < firstPeak || acts.some((act) => taken.fromS >= act.startS && taken.fromS < act.endS),
      ),
    ).toBe(true);
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

/*
 * ---- Wave AP, lane G-3: the hold lasts so long with nothing to decide — § D1493 ----
 *
 * GitHub issue #626 item 5: on Midtown's day 1 at seed n = 2, a pinned press day with its call at
 * 10:40, a first-time player at 4× waited 181.3 real seconds for the first thing to decide, 161.1 of
 * them held at their rung by § D1169 while somebody on a landing had waited a minute.
 */
describe('the hold with nothing to decide — § D1493', () => {
  const held = { scored: true, longestStandingS: PACE_HOLD_WAIT_S + 30 } as const;

  it('holds the player’s rung for the allowance, then plays on at the fast rung, and outranks nothing else', () => {
    const just = stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: WATCH_ALLOWANCE_REAL_S - 0.1 }));
    expect(just).toEqual({ simPerRealS: WATCHING, reason: 'watching' });
    const on = stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: WATCH_ALLOWANCE_REAL_S }));
    expect(on).toEqual({ simPerRealS: BETWEEN_PEAKS_SIM_PER_REAL_S, reason: 'unheld' });
    /* A rung faster than the fast one is never slowed; with no allowance given, § D1169 as it was. */
    expect(stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: 99, watchingSimPerRealS: 90 })).simPerRealS).toBe(90);
    expect(stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: undefined })).reason).toBe('watching');
    /* A call, a lost day and an unscored run are untouched; nobody waiting is `fast` as before. */
    expect(stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: 99, callAtS: 8990 })).reason).toBe('call');
    expect(stagePaceOf(inputAt(day, 9000, { ...held, watchedRealS: 99, lostAtS: 8000 })).reason).toBe('lost');
    expect(stagePaceOf(inputAt(day, 9000, { longestStandingS: PACE_HOLD_WAIT_S + 30, watchedRealS: 99 })).reason).toBe('held');
    expect(stagePaceOf(inputAt(day, 9000, { scored: true, longestStandingS: 5, watchedRealS: 99 })).reason).toBe('fast');
    /* Drawn, never skipped. */
    expect(stageSkipApplies({ horizon: 'whole-day', scored: true, acts: actsOf(day.demandPhases), simTimeS: 9000, reason: 'unheld' })).toBe(false);
    expect(stagePaceNoteOf(on, { acts: [], simTimeS: 9000 })).toBe(
      'nothing to decide yet: playing on at 30× though somebody has waited over a minute · pick a speed to watch',
    );
  });

  it('counts only the frames it held for watching, a real second a frame at most', () => {
    expect(watchedRealAfter(3, { reason: 'watching', fromS: 100, toS: 102, simPerRealS: 4 })).toBe(3.5);
    expect(watchedRealAfter(3, { reason: 'fast', fromS: 100, toS: 160, simPerRealS: 30 })).toBe(3);
    expect(watchedRealAfter(3, { reason: 'watching', fromS: 102, toS: 100, simPerRealS: 4 })).toBe(3);
    expect(watchedRealAfter(3, { reason: 'watching', fromS: 100, toS: 5000, simPerRealS: 4 }), 'a seek').toBe(4);
  });

  /*
   * Red before (181 real seconds through the real transport, with no allowance), green after: the
   * first call comes inside a minute, the stage stops on its second either way, and the recording is
   * the same, because the allowance moves the transport's speed and nothing else.
   */
  it('brings the press day’s call inside a real minute at 4×, and stops on the same second with the same legs', () => {
    const opened = todaysScenarioDayState(RESOURCES, 'c2', {
      seed: SEED + 7_919n * 2n,
      over: { week: { ...openWeek('c2'), day: 1, dayIdx: 0 }, campaignEventId: undefined },
    });
    const plan = shiftRunConfigOf(RESOURCES, opened.state);
    const press = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
    const call = pressDayCallOf(RESOURCES, opened.state, press)?.call;
    if (call === undefined) throw new Error('the press day has no call');
    const legs = structuredClone(press.legs);
    /* Frames a twentieth of a second apart: the limit is a minute and the rule lands at 59 seconds. */
    const before = play(press, [call.atS], true, false, 50);
    const after = play(press, [call.atS], true, true, 50);
    expect(before.stoppedRealS[0]!).toBeGreaterThan(150);
    expect(after.stoppedRealS[0]!).toBeLessThanOrEqual(60);
    expect(after.stoppedAt).toEqual(before.stoppedAt);
    expect(press.legs).toEqual(legs);
    /* `scoredDayPlayOf` mirrors the stage both ways, to within a few half-second frames. */
    const model = (watchAllowanceRealS: number | undefined) =>
      scoredDayPlayOf({
        legs: press.legs,
        acts: actsOf(press.demandPhases),
        startedAt: press.startedAt,
        endedAt: press.endedAt,
        stopsAtS: [call.atS],
        watchingSimPerRealS: WATCHING,
        skip: true,
        untilS: call.atS,
        watchAllowanceRealS,
      }).realS;
    expect(model(undefined)).toBeLessThanOrEqual(60);
    expect(Math.abs(before.stoppedRealS[0]! - model(Number.POSITIVE_INFINITY))).toBeLessThan(5);
    expect(Math.abs(after.stoppedRealS[0]! - model(undefined))).toBeLessThan(5);
  });
});

/*
 * ---- Wave AO, lane AO-4: one message for one state ----
 *
 * The post-AN panel's seat B (lost moment 5, defect 3): a skip that landed on a call read *stopped
 * for the day's call skipped 09:46–10:40: …*, the two spans side by side, and on a phone a skip's
 * range stood beside every later note until the next skip.
 */
describe('one message for one state — wave AO, lane AO-4', () => {
  const SKIPPED = 'skipped 09:46–10:40: nobody on a landing waited a minute';
  const STOP = 'stopped for the day’s call';

  it('lets a stop speak alone, then a skip, then the pace note, and never two at once', () => {
    expect(stageStatusOf({ pace: STOP, stopped: true, skip: SKIPPED })).toEqual({ pace: STOP, skip: '' });
    expect(stageStatusOf({ pace: 'fast-forwarding at 30×', stopped: false, skip: SKIPPED })).toEqual({ pace: '', skip: SKIPPED });
    expect(stageStatusOf({ pace: 'fast-forwarding at 30×', stopped: false, skip: STAGE_SKIP_BEAT_NOTE })).toEqual({
      pace: '',
      skip: STAGE_SKIP_BEAT_NOTE,
    });
    expect(stageStatusOf({ pace: 'fast-forwarding at 30×', stopped: false, skip: '' })).toEqual({ pace: 'fast-forwarding at 30×', skip: '' });
    for (const stopped of [true, false]) {
      for (const skip of ['', SKIPPED]) {
        const lines = stageStatusOf({ pace: STOP, stopped, skip });
        expect([lines.pace, lines.skip].filter((line) => line !== '').length, `${String(stopped)} ${skip}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps a skip’s line while the stage stays where it landed, and drops it when it leaves or a call stops it', () => {
    /* The frame after landing has not been asked yet: the line stands. */
    expect(stageSkipLineStands({ landedReason: undefined, reason: 'watching' })).toBe(true);
    expect(stageSkipLineStands({ landedReason: 'watching', reason: 'watching' })).toBe(true);
    /* Somebody stopped waiting and the stage is fast again: a new state, the old line goes. */
    expect(stageSkipLineStands({ landedReason: 'watching', reason: 'fast' })).toBe(false);
    /* A call stops the transport: a stop speaks alone, even on the frame it lands. */
    expect(stageSkipLineStands({ landedReason: undefined, reason: 'call' })).toBe(false);
    expect(stageSkipLineStands({ landedReason: 'fast', reason: 'call' })).toBe(false);
  });
});
