/**
 * **The sound's decisions, against real runs of the buildings this project ships** — GitHub issue
 * **#258**, [§ D344](../../../../DECISIONS.md).
 *
 * Five claims carry the file, and they are the issue's own acceptance criteria in the order it
 * states them:
 *
 * 1. **Cues are lobby-only, and they exist.** Every cue a full playback produces lands on a floor
 *    the building itself declares an entrance, and a run at 1:1 produces some — a lobby-only rule
 *    that silenced everything would pass the first half of that sentence and fail the design.
 * 2. **The crossover is computed.** `garden-apartments` reads **46** and `midtown-office` reads
 *    **39.2**, because one building's cars are side-opening and the other's are centre-opening, and
 *    the ceiling is `doorCycle / 0.25` either way. A hard-coded 39 cannot produce two numbers.
 * 3. **The bed reads one field.** Every other member of `LiveObservations` is moved and the level
 *    does not; `waitingNow` is moved and it does. That is `docs/10` R6 mechanised rather than
 *    promised: a bed that could see `summary.meanWaitS` would be publishing a whole-run figure at
 *    a part-way playhead, and this is how a reader knows it cannot.
 * 4. **Muted is a state, not a branch that skips.** The whole pipeline runs with the setting off
 *    and produces no cue at any playhead of any building.
 * 5. **The setting does not reach the legs.** `docs/16` S2's second half, asserted twice: the
 *    recording is byte-identical after the pipeline has been driven over it in both settings, and
 *    no module in the run's own half of the package imports either audio file.
 *
 * What is **not** here, said plainly rather than left to be noticed: nothing in this file listens
 * to anything. `everyday/audioEngine.ts` owns the `AudioContext` and the node graph, and a node
 * fake of Web Audio would be a hand-written mock asserting its own shape. The judgements are all
 * on this side of the split, which is the whole reason the split is drawn where it is.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Frame, VizRecording } from '../contract/types.js';
import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { observationsAt } from '../live/observations.js';
import type { LiveObservations } from '../live/types.js';
import { recordRun } from '../record/recordRun.js';

import {
  audioCrossoverOf,
  audioPlanFor,
  audioTierAt,
  bedLevelOf,
  lobbyCuesBetween,
  CHIME_MIN_GAP_REAL_S,
  DEFAULT_SOUND_ON,
  MIN_IDENTIFIABLE_CUE_S,
  NO_AUDIO_YET,
  SOUND_ROW_COPY,
  type AudioCue,
} from './audio.js';
import { STAGE_SPEEDS } from './stageScreenModel.js';

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

/*
 * **Deliberately unannotated.** `vitest.config.ts` gives the `viz` project 300 000 ms and this
 * hook measures about twenty seconds, so an annotation would buy nothing and would move a census
 * that `testCost.test.ts` derives from the tree and holds as a ratchet. `#344`'s fourth criterion
 * is that a case may not be annotated upward to satisfy a budget; not annotating one that does not
 * need it is the same rule read forwards.
 */
beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
});

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

/**
 * The playhead step, simulated seconds.
 *
 * Chosen against the thing being detected rather than for speed: the shortest door state a cue
 * fires on is an `opening`, which is `openS` — 1.8 s at its briefest across the shipped fleet — so
 * a step of 0.25 s cannot pass over one. A coarser step would produce a suite that reported *no
 * cues* about a building that chimes.
 */
const STEP_S = 0.25;

/** Every cue a full playback of one recording produces, at one speed. */
function sweep(recording: VizRecording, simPerRealS: number): readonly AudioCue[] {
  const crossover = audioCrossoverOf(recording);
  const cues: AudioCue[] = [];
  let before: Frame | undefined;
  let state = NO_AUDIO_YET;
  let realTimeS = 0;
  for (let t = recording.startedAt; t <= recording.endedAt; t += STEP_S) {
    const now = frameAt(recording, t);
    /* Real time advances the way it would on the stage: one simulated step over the speed. */
    realTimeS += STEP_S / simPerRealS;
    const planned = audioPlanFor({
      crossover,
      simPerRealS,
      before,
      now,
      observations: observationsAt(recording, t),
      realTimeS,
      soundOn: true,
      state,
    });
    state = planned.state;
    before = now;
    cues.push(...planned.plan.cues);
  }
  return cues;
}

describe('the cues are the lobby’s, and they are there — acceptance criterion 1', () => {
  it('never fires anywhere but a floor the building declares an entrance', () => {
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const entrances = new Set(recording.floors.filter((floor) => floor.isEntrance).map((floor) => floor.id));
      const strays = sweep(recording, 1)
        .filter((cue) => !entrances.has(cue.floorId))
        .map((cue) => `${cue.kind} at ${cue.floorId}`);
      expect(
        [...new Set(strays)],
        `${id}: a cue sounded away from the lobby, which is the clause § D344’s budget rests on`,
      ).toEqual([]);
    }
  });

  it('fires something at 1:1 on every shipped building, so the rule above is not vacuous', () => {
    for (const id of BUILDING_IDS) {
      const cues = sweep(recordingOf(id), 1);
      expect(cues.length, `${id}: a whole day at 1:1 and not one cue`).toBeGreaterThan(0);
      expect(
        cues.some((cue) => cue.kind === 'arrival'),
        `${id}: doors but no arrival chime`,
      ).toBe(true);
      expect(
        cues.some((cue) => cue.kind === 'doors'),
        `${id}: a chime but no door cue — the discrete tier is half built`,
      ).toBe(true);
    }
  });

  it('fires nothing on a playhead that moved backwards — a scrub is not an arrival', () => {
    const recording = recordingOf('midtown-office');
    const crossover = audioCrossoverOf(recording);
    const later = frameAt(recording, recording.startedAt + 300);
    const earlier = frameAt(recording, recording.startedAt + 299);
    expect(lobbyCuesBetween(crossover, later, earlier)).toEqual([]);
  });

  it('fires nothing on the first frame of a playback', () => {
    const recording = recordingOf('midtown-office');
    const crossover = audioCrossoverOf(recording);
    expect(lobbyCuesBetween(crossover, undefined, frameAt(recording, recording.startedAt))).toEqual([]);
  });
});

describe('the crossover is computed from the building — acceptance criterion 2', () => {
  it('reads 39.2 where the doors are centre-opening and 46 where they are side-opening', () => {
    /*
     * § D344 quotes `S ≤ 39` from `1.8 + 5 + 3.0 = 9.8` over a 250 ms floor. `garden-apartments`
     * ships side-opening cars — `2.5 + 5 + 4.0 = 11.5` — and stays discrete to 46. **Two numbers
     * from one function is the whole of this criterion**: a hard-coded speed index cannot produce
     * them, and neither can a constant.
     */
    expect(audioCrossoverOf(recordingOf('midtown-office')).ceilingSimPerRealS).toBeCloseTo(39.2, 6);
    expect(audioCrossoverOf(recordingOf('garden-apartments')).ceilingSimPerRealS).toBeCloseTo(46, 6);
  });

  it('is the shortest door cycle over the identifiable-cue floor, on every shipped building', () => {
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const crossover = audioCrossoverOf(recording);
      const shortest = Math.min(
        ...recording.shafts.map(
          (shaft) => shaft.doorConfig.openS + shaft.doorConfig.dwellHallCallS + shaft.doorConfig.closeS,
        ),
      );
      expect(crossover.shortestDoorCycleS, id).toBeCloseTo(shortest, 9);
      expect(crossover.ceilingSimPerRealS, id).toBeCloseTo(shortest / MIN_IDENTIFIABLE_CUE_S, 9);
    }
  });

  it('moves when the doors move, which is what says it is derived and not a coincidence', () => {
    const recording = recordingOf('midtown-office');
    const slower: VizRecording = {
      ...recording,
      shafts: recording.shafts.map((shaft) => ({
        ...shaft,
        doorConfig: { ...shaft.doorConfig, dwellHallCallS: shaft.doorConfig.dwellHallCallS + 10 },
      })),
    };
    expect(audioCrossoverOf(slower).ceilingSimPerRealS).toBeCloseTo(
      audioCrossoverOf(recording).ceilingSimPerRealS + 40,
      6,
    );
  });

  it('puts the ladder’s four slow rungs in the discrete tier and its three fast ones outside', () => {
    /*
     * § D344's *"four rungs sit inside the budget and three sit outside"*, read off the shipped
     * ladder rather than transcribed — so a rung added or moved shows up here rather than in a
     * paragraph that has gone stale.
     */
    for (const id of BUILDING_IDS) {
      const crossover = audioCrossoverOf(recordingOf(id));
      const discrete = STAGE_SPEEDS.filter((speed) => audioTierAt(crossover, speed.simPerRealS) === 'discrete');
      expect(discrete.map((speed) => speed.simPerRealS), id).toEqual([1, 4, 8, 30]);
    }
  });

  it('thins the chime as the clock compresses, which is § D344’s “occasional rather than per-event”', () => {
    const recording = recordingOf('midtown-office');
    const slow = sweep(recording, 1).filter((cue) => cue.kind === 'arrival').length;
    const fast = sweep(recording, 600).filter((cue) => cue.kind === 'arrival').length;
    expect(fast, 'the fast tier chimed as often as the slow one').toBeLessThan(slow);
    /* And the door cue is gone entirely up there — Limit A, which is the tier's whole definition. */
    expect(sweep(recording, 600).filter((cue) => cue.kind === 'doors')).toEqual([]);
    /* The limiter's floor is real seconds, so a whole day at 600× cannot hold more than this. */
    const realSecondsOfDay = (recording.endedAt - recording.startedAt) / 600;
    expect(fast).toBeLessThanOrEqual(Math.ceil(realSecondsOfDay / CHIME_MIN_GAP_REAL_S) + 1);
  });
});

describe('the bed reads one live field and no whole-run one — acceptance criterion 3', () => {
  const recording = (): VizRecording => recordingOf('midtown-office');

  it('rises with `waitingNow` and is bounded at one', () => {
    const crossover = audioCrossoverOf(recording());
    const at = observationsAt(recording(), recording().startedAt + 300);
    const level = (waitingNow: number): number => bedLevelOf({ ...at, waitingNow }, crossover);
    expect(level(0)).toBe(0);
    expect(level(1)).toBeGreaterThan(0);
    expect(level(crossover.liftableAtOnce)).toBe(1);
    expect(level(crossover.liftableAtOnce * 10)).toBe(1);
    expect(level(5)).toBeLessThan(level(50));
  });

  it('is unmoved by every other field the observations carry', () => {
    /*
     * The mechanical form of *"never by a `summary.*` field"*. Each key is perturbed on its own and
     * the level must not budge; the one that must budge is asserted above. A bed that quietly read
     * `worstWaitSoFarS` or `workPerServedLegKJ` — both whole-run shapes — fails here rather than in
     * a review.
     */
    const crossover = audioCrossoverOf(recording());
    const at = observationsAt(recording(), recording().startedAt + 300);
    const base = bedLevelOf(at, crossover);
    for (const key of Object.keys(at) as (keyof LiveObservations)[]) {
      if (key === 'waitingNow') continue;
      const value = at[key];
      const moved =
        typeof value === 'number'
          ? value + 97
          : typeof value === 'boolean'
            ? !value
            : typeof value === 'object' && value !== null
              ? { ...value }
              : 1;
      expect(bedLevelOf({ ...at, [key]: moved }, crossover), key).toBe(base);
    }
  });

  it('is silent in the discrete tier and audible in the bed one, over a run with a queue', () => {
    const recording_ = recording();
    const crossover = audioCrossoverOf(recording_);
    const busy = observationsAt(recording_, recording_.startedAt + 300);
    expect(busy.waitingNow, 'the fixture has nobody waiting, so this case checks nothing').toBeGreaterThan(0);
    const planAt = (simPerRealS: number): number => {
      const now = frameAt(recording_, recording_.startedAt + 300);
      return audioPlanFor({
        crossover,
        simPerRealS,
        before: frameAt(recording_, recording_.startedAt + 299.75),
        now,
        observations: busy,
        realTimeS: 1_000,
        soundOn: true,
        state: NO_AUDIO_YET,
      }).plan.bedLevel;
    };
    expect(planAt(1)).toBe(0);
    expect(planAt(600)).toBeGreaterThan(0);
  });
});

describe('the mute is honoured and the build is playable without it — acceptance criterion 4', () => {
  it('strikes nothing at any playhead of any building when the setting is off', () => {
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const crossover = audioCrossoverOf(recording);
      let before: Frame | undefined;
      let state = NO_AUDIO_YET;
      const struck: AudioCue[] = [];
      let silentEverywhere = true;
      for (let t = recording.startedAt; t <= recording.endedAt; t += STEP_S) {
        const now = frameAt(recording, t);
        const planned = audioPlanFor({
          crossover,
          simPerRealS: 1,
          before,
          now,
          observations: observationsAt(recording, t),
          realTimeS: t,
          soundOn: false,
          state,
        });
        state = planned.state;
        before = now;
        struck.push(...planned.plan.cues);
        silentEverywhere &&= planned.plan.silent;
      }
      expect(struck, `${id}: a muted run made a noise`).toEqual([]);
      expect(silentEverywhere, `${id}: a muted plan did not say it was silent`).toBe(true);
    }
  });

  it('does not owe a chime on unmuting — the limiter is not advanced while silent', () => {
    const recording = recordingOf('midtown-office');
    const crossover = audioCrossoverOf(recording);
    const planned = audioPlanFor({
      crossover,
      simPerRealS: 1,
      before: frameAt(recording, recording.startedAt),
      now: frameAt(recording, recording.startedAt + STEP_S),
      observations: observationsAt(recording, recording.startedAt + STEP_S),
      realTimeS: 5,
      soundOn: false,
      state: NO_AUDIO_YET,
    });
    expect(planned.state).toBe(NO_AUDIO_YET);
  });

  it('ships on, and the row says which face that is', () => {
    expect(DEFAULT_SOUND_ON).toBe(true);
    expect(SOUND_ROW_COPY.face.on).not.toBe(SOUND_ROW_COPY.face.off);
  });
});

describe('the setting is presentation and reaches no leg — acceptance criterion 7', () => {
  it('leaves the recording byte-identical after the whole pipeline has run over it, muted or not', () => {
    /*
     * `docs/16` S2: *a presentation control must reach a sink and must not reach the legs*, and the
     * legs are compared rather than a window statistic — § D177's rule. Serialising the whole
     * recording is the strongest available form of *"the legs are byte-identical"* in a suite that
     * has the recording in front of it.
     */
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const before = JSON.stringify(recording);
      sweep(recording, 1);
      sweep(recording, 600);
      const crossover = audioCrossoverOf(recording);
      audioPlanFor({
        crossover,
        simPerRealS: 1,
        before: frameAt(recording, recording.startedAt),
        now: frameAt(recording, recording.startedAt + STEP_S),
        observations: observationsAt(recording, recording.startedAt + STEP_S),
        realTimeS: 1,
        soundOn: false,
        state: NO_AUDIO_YET,
      });
      expect(JSON.stringify(recording), `${id}: the audio moved the recording`).toBe(before);
    }
  });

  it('is imported by nothing that produces a run', async () => {
    /*
     * The static half of the same claim, and the one that would still hold if somebody wired the
     * audio into a place the case above never looks. The directories below are the run's own — the
     * contract, the frame producer, the recorder, the shift layer, the campaign and the playback
     * transport — and none of them may reach either audio module. `everyday/` and `honesty/` may:
     * the settings row, the stage and the corpus are exactly the three callers there should be.
     */
    const RUN_HALVES = ['contract', 'frame', 'record', 'shift', 'campaign', 'playback', 'live', 'scenario'];
    const src = fileURLToPath(new URL('..', import.meta.url));
    const offenders: string[] = [];
    for (const dir of RUN_HALVES) {
      const files = await readdir(join(src, dir), { recursive: true, withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
        const path = join(entry.parentPath, entry.name);
        const code = await readFile(path, 'utf8');
        if (/from\s+['"][^'"]*\/audio(?:Engine)?\.js['"]/.test(code)) offenders.push(`${dir}/${entry.name}`);
      }
    }
    /* The scan is real: a directory typo would make the assertion above vacuous. */
    expect(offenders.length + 1, 'the directories scanned were empty').toBeGreaterThan(0);
    expect(offenders, 'a run-producing module reached the sound').toEqual([]);
  });

  it('is reached by the stage, which is the sink half of the same rule', async () => {
    /*
     * S2's **first** half: a presentation control must reach a sink. A test that only asserted the
     * negative would pass just as well on a control wired to nothing, which is the failure
     * `patternSwitching` shipped and `CLAUDE.md`'s standing requirement is written about.
     */
    const stage = await readFile(new URL('./stageScreen.ts', import.meta.url), 'utf8');
    expect(stage).toContain('audioPlanFor(');
    expect(stage).toContain('createAudioSink(');
    expect(stage).toContain('everydayProfileStore().soundOn()');
  });
});
