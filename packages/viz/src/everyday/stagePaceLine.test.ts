/**
 * **The line beside the speed chips, over the real Midtown Monday** — wave AS, lane AS-2, GitHub
 * issue #637 item 1, [§ D1554](../../../../DECISIONS.md).
 *
 * The playtest saw the line change ten times in about fourteen real seconds around 17:29 to 17:36,
 * some changes a third of a second apart, with the 30× chip lit throughout: *skipping ahead* drawn for
 * 0.32 s and 0.67 s and then gone without a skip, and a stale *skipped 17:31–17:32* drawn again at
 * 17:35 after a beat that never landed. The same stale repeat came at 11:52 and 12:07.
 *
 * This plays the day the playtest played (Today's scenario on Midtown, week 1's Monday, the press
 * day's seed, the cars parked at every placement call and the driver kept), through the real
 * {@link Playback} at sixty frames a real second, with the stage's own frame loop:
 * `stageScreen.ts#pace`, `#skipBetweenPeaks` and `#showStatus` call exactly these functions in this
 * order. It records what the line says on every frame and holds three rules:
 *
 * 1. no line lasts under a real second unless the chip changed when it went, or the stage stopped;
 * 2. a skip's line is never drawn again once another line has replaced it;
 * 3. *skipping ahead* is always followed by its skip.
 *
 * Red before § D1554 over the whole day: four beat notes drawn for 0.25 to 0.63 real seconds with no
 * chip change, one drawn 2.25 s and then dropped without its skip, and *skipped 08:46–08:56* drawn
 * again after a dropped beat. The speeds and the skips are not touched: this loop seeks exactly
 * where `stageSkipOf` says, as it did before.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import { ManualClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { actsOf } from '../shift/dayLength.js';
import { openWeek } from '../shift/week.js';

import { playScoredDay, SITTING_POLICIES } from './sittingBot.test-helper.js';
import {
  FRESH_PACE_COUNTERS,
  STAGE_SKIP_BEAT_NOTE,
  paceCountersAfter,
  stagePaceNoteOf,
  stagePaceOf,
  stagePaceStateOf,
  stageSkipApplies,
  stageSkipLineOf,
  stageSkipLandsOf,
  stageSkipLineStands,
  stageSkipOf,
  stageSkipSpeechOf,
  stageStatusOf,
  type PaceCounters,
  type StagePace,
  type StagePaceReason,
} from './stagePace.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const FRAME_S = 1 / 60;

/** One frame as a player sees it: the lit rung, the line, and whether a stop or a skip came on it. */
interface LineFrame {
  readonly realS: number;
  readonly simTimeS: number;
  readonly rung: number;
  readonly line: string;
  readonly stopped: boolean;
  readonly landed: boolean;
}

let day: VizRecording;
let stops: readonly number[];

beforeAll(() => {
  const played = playScoredDay({
    resources: contractBuildings(),
    contractId: 'c2',
    week: { ...openWeek('c2'), day: 1, dayIdx: 0 },
    seed: 20_260_824n + 7_919n * 2n,
    policy: SITTING_POLICIES.find((policy) => policy.id === 's1-fairness-keep-park')!,
  });
  day = played.recording;
  stops = played.stopsAtS;
}, 120_000);

/** The stage's frame loop over `recording` from `fromS`, stopping at each of `stops` and playing straight on. */
function frames(recording: VizRecording, calls: readonly number[], fromS: number, toS: number): LineFrame[] {
  const clock = new ManualClock();
  const playback = new Playback(recording, clock, { speed: DEFAULT_STAGE_SIM_PER_REAL_S, autoplay: true });
  playback.seekTo(fromS);
  const acts = actsOf(recording.demandPhases);
  const pending = calls.filter((atS) => atS > fromS).sort((a, b) => a - b);
  let counters: PaceCounters = FRESH_PACE_COUNTERS;
  let watched: { pace: StagePace; atS: number; simPerRealS: number } | undefined;
  let armedAtS: number | undefined;
  let armedAtRungChange = false;
  let landedAtS: number | undefined;
  let skipLine = '';
  let skipLineReason: StagePaceReason | undefined;
  const out: LineFrame[] = [];
  while (playback.state !== 'ended' && playback.simTimeS < toS) {
    const t = playback.simTimeS;
    if (watched !== undefined) {
      counters = paceCountersAfter(counters, { pace: watched.pace, fromS: watched.atS, toS: t, simPerRealS: watched.simPerRealS });
    }
    const pace = stagePaceOf({
      horizon: 'whole-day',
      acts,
      simTimeS: t,
      watchingSimPerRealS: DEFAULT_STAGE_SIM_PER_REAL_S,
      longestStandingS: observationsAt(recording, t).longestCurrentWaitS,
      playerChoseSpeedAtS: undefined,
      callAtS: pending[0],
      scored: true,
      watchedRealS: counters.watchedRealS,
      lingerRealS: counters.lingerRealS,
    });
    watched = { pace, atS: t, simPerRealS: pace.simPerRealS };
    if (pace.reason === 'call') {
      /* The stage stops on the call's second, the player answers, and the day plays on. */
      if (playback.simTimeS > pending[0]!) playback.seekTo(pending[0]!);
      pending.shift();
      counters = FRESH_PACE_COUNTERS;
      watched = undefined;
      armedAtS = undefined;
      skipLine = '';
      skipLineReason = undefined;
      out.push({ realS: clock.now() / 1000, simTimeS: playback.simTimeS, rung: playback.speed, line: 'stopped for the day’s call', stopped: true, landed: false });
      continue;
    }
    if (skipLine !== '') {
      const state = stagePaceStateOf(pace);
      if (!stageSkipLineStands({ landedReason: skipLineReason, reason: state })) {
        skipLine = '';
        skipLineReason = undefined;
      } else if (skipLineReason === undefined) {
        skipLineReason = state;
      }
    }
    const rungChanged = playback.speed !== pace.simPerRealS;
    if (rungChanged) playback.setSpeed(pace.simPerRealS);
    let landed = false;
    const applies =
      !(landedAtS !== undefined && Math.abs(t - landedAtS) < 1) &&
      stageSkipApplies({ horizon: 'whole-day', scored: true, acts, simTimeS: t, reason: pace.reason });
    if (!applies) armedAtS = undefined;
    else if (armedAtS === undefined || t < armedAtS) {
      armedAtS = t;
      armedAtRungChange = rungChanged;
    }
    else {
      const skip = stageSkipOf({
        acts,
        legs: recording.legs,
        simTimeS: t,
        armedAtS,
        simPerRealS: playback.speed,
        stopAtS: pending[0],
        endedAt: recording.endedAt,
      });
      if (skip !== undefined) {
        armedAtS = undefined;
        landedAtS = skip.toS;
        skipLine = stageSkipLineOf(skip);
        skipLineReason = undefined;
        playback.seekTo(skip.toS);
        landed = true;
      }
    }
    const armedRealS = armedAtS === undefined ? undefined : Math.max(0, (playback.simTimeS - armedAtS) / playback.speed);
    const lands =
      armedAtS !== undefined &&
      stageSkipLandsOf({
        acts,
        legs: recording.legs,
        simTimeS: playback.simTimeS,
        armedAtS,
        simPerRealS: playback.speed,
        stopAtS: pending[0],
        endedAt: recording.endedAt,
      }) !== undefined;
    const said = stageSkipSpeechOf({ armedRealS, lands, line: skipLine, armedAtRungChange });
    if (said.line !== skipLine) {
      skipLine = said.line;
      skipLineReason = undefined;
    }
    const status = stageStatusOf({
      pace: stagePaceNoteOf(pace, { acts, simTimeS: t }) ?? '',
      stopped: false,
      skip: said.speech,
    });
    out.push({ realS: clock.now() / 1000, simTimeS: playback.simTimeS, rung: playback.speed, line: status.pace || status.skip, stopped: false, landed });
    clock.advance(FRAME_S * 1000);
  }
  return out;
}

/** Each stretch of frames with one line on it, and why it ended. */
function stretchesOf(rows: readonly LineFrame[]) {
  const out: { line: string; fromRealS: number; toRealS: number; endedByChip: boolean; endedByStop: boolean; endedByLanding: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i += 1) {
    const row = rows[i];
    const prev = rows[i - 1]!;
    if (row !== undefined && row.line === prev.line) continue;
    out.push({
      line: prev.line,
      fromRealS: rows[start]!.realS,
      toRealS: row?.realS ?? prev.realS,
      endedByChip: row !== undefined && row.rung !== prev.rung,
      endedByStop: row?.stopped === true || prev.stopped,
      endedByLanding: row?.landed === true,
    });
    start = i;
  }
  return out;
}

/** The three rules, as the findings each breaks. */
function findingsOf(rows: readonly LineFrame[]) {
  const stretches = stretchesOf(rows);
  /* The last stretch has not ended, and the first began where the window did. */
  const inner = stretches.slice(1, -1);
  const short = inner.filter((s) => s.toRealS - s.fromRealS < 1 - 1e-9 && !s.endedByChip && !s.endedByStop);
  const seen = new Set<string>();
  const stale: string[] = [];
  let previous = '';
  for (const s of stretches) {
    if (s.line.startsWith('skipped ') && s.line !== previous && seen.has(s.line)) stale.push(s.line);
    if (s.line.startsWith('skipped ')) seen.add(s.line);
    previous = s.line;
  }
  const broken = stretches.filter((s, i) => s.line === STAGE_SKIP_BEAT_NOTE && i > 0 && i < stretches.length - 1 && !s.endedByLanding);
  return { stretches, short, stale, broken };
}

describe('the line beside the chips over the real Midtown Monday — § D1554', () => {
  it('is the day the playtest played: calls at 10:40, 12:20, 12:25, 17:20 and 17:25', () => {
    expect(stops).toHaveLength(5);
    const minutes = stops.map((atS) => Math.floor((atS - stops[0]!) / 60));
    expect(minutes).toEqual([0, 100, 105, 400, 405]);
  });

  it('around 17:25 to 17:40: no line under a second without the chip, no stale skip line, no warning without its skip', () => {
    const from = stops.at(-1)! - 1;
    const rows = frames(day, stops, from, from + 15 * 60);
    const { stretches, short, stale, broken } = findingsOf(rows);
    expect(stretches.length).toBeGreaterThan(3);
    expect(short.map((s) => `${s.line} (${(s.toRealS - s.fromRealS).toFixed(2)} s)`)).toEqual([]);
    expect(stale).toEqual([]);
    expect(broken.map((s) => `${s.fromRealS.toFixed(2)}`)).toEqual([]);
  });

  it('holds the same three rules over the whole day after the first call', () => {
    const from = stops[0]! - 1;
    const rows = frames(day, stops, from, day.endedAt);
    const { short, stale, broken, stretches } = findingsOf(rows);
    expect(stretches.some((s) => s.line === STAGE_SKIP_BEAT_NOTE)).toBe(true);
    expect(short.map((s) => `${s.line} (${(s.toRealS - s.fromRealS).toFixed(2)} s)`)).toEqual([]);
    expect(stale).toEqual([]);
    expect(broken.map((s) => `${s.fromRealS.toFixed(2)}`)).toEqual([]);
  }, 300_000);
});
