/**
 * The transport, driven by hand.
 *
 * Every test here runs against a {@link ManualClock}. There is not a `setTimeout`, an `await`
 * or a fake-timer installation anywhere in the file, because there is no timer to fake: nothing
 * in the package schedules one. That is the practical payoff of injecting the clock, and it is
 * why the playback path can be regression-tested at all.
 *
 * A synthetic recording is used rather than a real run: these are assertions about arithmetic
 * and state, and a 600-second simulation would only make them slower and less legible. The
 * frame *content* is tested against a real run in `frameAt.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { FIXTURE_DOOR_CONFIG } from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type VizRecording } from '../contract/types.js';
import { ManualClock } from './clock.js';
import { MAX_SPEED, MIN_SPEED, displayMsAt, reanchor, simTimeAt } from './mapping.js';
import { Playback } from './playback.js';

const RECORDING: VizRecording = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  seed: '42',
  buildingId: 'synthetic',
  buildingName: 'Synthetic',
  dispatcherProfileId: 'eta',
  status: 'completed',
  startedAt: 0,
  endedAt: 100,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 10 },
  ],
  shafts: [
    {
      carId: 'main-A',
      bankId: 'main',
      label: 'A',
      startFloorId: 'G',
      startHeightM: 0,
      servedFloorIds: ['G', '2'],
      capacityPersons: 13,
      doorConfig: FIXTURE_DOOR_CONFIG,
      motions: [],
      doorMarks: [],
      occupants: constantSeries(0),
      loadFactor: constantSeries(0),
    },
  ],
  landings: [],
  progress: {
    waiting: constantSeries(0),
    served: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: {
    saturated: false,
    awtIsValid: true,
    meanWaitS: 0,
    wait95S: 0,
    meanTimeToDestinationS: 0,
    generated: 0,
    delivered: 0,
    undelivered: 0,
  },
  warnings: [],
};

describe('the display-to-simulated mapping', () => {
  const anchor = { atDisplayMs: 1000, atSimTimeS: 50, speed: 10 } as const;

  it('runs simulated time at `speed` simulated seconds per real second', () => {
    expect(simTimeAt(anchor, 1000)).toBe(50);
    expect(simTimeAt(anchor, 2000)).toBe(60);
    expect(simTimeAt(anchor, 500)).toBe(45);
  });

  it('inverts exactly', () => {
    expect(displayMsAt(anchor, 60)).toBe(2000);
    expect(simTimeAt(anchor, displayMsAt(anchor, 73.5))).toBeCloseTo(73.5, 9);
  });

  it('is frame-rate independent: elapsed display time alone decides the playhead', () => {
    // 60 steps of 16.6667 ms and 30 steps of 33.3333 ms cover the same wall-clock second, and
    // must land on the same simulated instant. An accumulating implementation would not.
    const at60 = simTimeAt(anchor, 1000 + 60 * (1000 / 60));
    const at30 = simTimeAt(anchor, 1000 + 30 * (1000 / 30));
    expect(at60).toBe(at30);
    expect(at60).toBe(60);
  });

  it('re-anchors without changing speed', () => {
    const moved = reanchor(anchor, 5000, 12);
    expect(moved.speed).toBe(anchor.speed);
    expect(simTimeAt(moved, 5000)).toBe(12);
  });
});

describe('Playback', () => {
  const make = (options?: ConstructorParameters<typeof Playback>[2]): [Playback, ManualClock] => {
    const clock = new ManualClock(0);
    return [new Playback(RECORDING, clock, options), clock];
  };

  it('starts paused at the beginning', () => {
    const [playback] = make();
    expect(playback.state).toBe('paused');
    expect(playback.simTimeS).toBe(0);
    expect(playback.progress).toBe(0);
  });

  it('does not move while paused, however much display time passes', () => {
    const [playback, clock] = make({ speed: 10 });
    clock.advance(10_000);
    expect(playback.simTimeS).toBe(0);
    expect(playback.frame().simTimeS).toBe(0);
  });

  it('advances at the speed multiplier once playing', () => {
    const [playback, clock] = make({ speed: 10, autoplay: true });
    clock.advance(1000);
    expect(playback.simTimeS).toBe(10);
    clock.advance(500);
    expect(playback.simTimeS).toBe(15);
    expect(playback.state).toBe('playing');
  });

  it('resumes from where it paused, not from where it would have been', () => {
    const [playback, clock] = make({ speed: 10, autoplay: true });
    clock.advance(1000);
    playback.pause();
    clock.advance(60_000); // a minute of the user reading the screen
    expect(playback.simTimeS).toBe(10);
    playback.play();
    clock.advance(1000);
    expect(playback.simTimeS).toBe(20);
  });

  it('stops at the end and reports `ended`', () => {
    const [playback, clock] = make({ speed: 10, autoplay: true });
    clock.advance(100_000);
    expect(playback.frame().simTimeS).toBe(100);
    expect(playback.state).toBe('ended');
    expect(playback.progress).toBe(1);
  });

  it('loops from the start when asked, without drifting', () => {
    const [playback, clock] = make({ speed: 10, autoplay: true, loop: true });
    clock.advance(10_000); // exactly one run length
    expect(playback.frame().simTimeS).toBe(0);
    clock.advance(1000);
    expect(playback.frame().simTimeS).toBe(10);
  });

  it('seeks in either direction, in either state', () => {
    const [playback, clock] = make({ speed: 10 });
    playback.seekTo(40);
    expect(playback.simTimeS).toBe(40);
    playback.seekBy(-15);
    expect(playback.simTimeS).toBe(25);
    playback.play();
    clock.advance(1000);
    expect(playback.simTimeS).toBe(35);
    playback.seekTo(5);
    clock.advance(1000);
    expect(playback.simTimeS).toBe(15);
    expect(playback.state).toBe('playing');
  });

  it('clamps a seek to the run rather than extrapolating', () => {
    const [playback] = make();
    playback.seekTo(-500);
    expect(playback.simTimeS).toBe(0);
    playback.seekTo(1e9);
    expect(playback.simTimeS).toBe(100);
    playback.seekToProgress(0.25);
    expect(playback.simTimeS).toBe(25);
    playback.seekToProgress(5);
    expect(playback.simTimeS).toBe(100);
  });

  it('changes speed without moving the playhead', () => {
    const [playback, clock] = make({ speed: 10, autoplay: true });
    clock.advance(2000);
    expect(playback.simTimeS).toBe(20);
    playback.setSpeed(1);
    expect(playback.simTimeS).toBe(20);
    clock.advance(1000);
    expect(playback.simTimeS).toBe(21);
  });

  it('refuses a speed outside the supported range', () => {
    const [playback] = make();
    expect(() => {
      playback.setSpeed(0);
    }).toThrow(RangeError);
    expect(() => {
      playback.setSpeed(Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
    expect(() => {
      playback.setSpeed(Number.NaN);
    }).toThrow(RangeError);
    playback.setSpeed(MIN_SPEED);
    playback.setSpeed(MAX_SPEED);
  });

  it('toggles and resets', () => {
    const [playback, clock] = make({ speed: 10 });
    playback.toggle();
    expect(playback.state).toBe('playing');
    clock.advance(1000);
    playback.toggle();
    expect(playback.state).toBe('paused');
    expect(playback.simTimeS).toBe(10);
    playback.reset();
    expect(playback.state).toBe('paused');
    expect(playback.simTimeS).toBe(0);
  });

  it('reads the clock once per frame, so the whole frame describes one instant', () => {
    let reads = 0;
    const clock = { now: (): number => { reads += 1; return 1000; } };
    const playback = new Playback(RECORDING, clock, { speed: 10, autoplay: true });
    const before = reads;
    playback.frame();
    expect(reads - before).toBe(1);
  });

  it('produces the same frame sequence for the same clock schedule', () => {
    const run = (): string => {
      const clock = new ManualClock(0);
      const playback = new Playback(RECORDING, clock, { speed: 10, autoplay: true });
      const frames: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        frames.push(JSON.stringify(playback.frame()));
        clock.advance(1000 / 30);
      }
      return frames.join('\n');
    };
    expect(run()).toBe(run());
  });
});
