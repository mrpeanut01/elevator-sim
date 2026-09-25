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

import { pacedDayRealS } from './sittingShape.js';
import {
  BETWEEN_PEAKS_SIM_PER_REAL_S,
  PACE_HOLD_WAIT_S,
  stagePaceNoteOf,
  stagePaceOf,
  type StagePaceInput,
} from './stagePace.js';
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
