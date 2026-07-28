/**
 * The frame producer, against a real run.
 *
 * The claim worth testing is not that a frame has the right fields; it is that the height in
 * the frame is the car's *analytic* position. That is asserted by re-deriving it from the
 * motion profile with `positionAt` — the same call `Car.positionAt` makes — at instants chosen
 * to land inside a move, at its motor-start delay, and inside its levelling settle, which are
 * the three places a naive linear interpolation would be wrong.
 */

import { loadConfig, positionAt, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import type { VizRecording, VizShaft } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { carDirectionAt, carFloorIdAt, carHeightAt, doorFractionAt, frameAt } from './frameAt.js';

let recording: VizRecording;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  recording = recordRun(fixtureConfig(config)).recording;
}, 120_000);

/** The first shaft that actually moved. */
function movingShaft(): VizShaft {
  const shaft = recording.shafts.find((candidate) => candidate.motions.length > 0);
  if (shaft === undefined) throw new Error('no car moved in the fixture run.');
  return shaft;
}

describe('carHeightAt', () => {
  it('stands at the start height before the first move', () => {
    const shaft = movingShaft();
    expect(carHeightAt(shaft, recording.startedAt)).toBe(shaft.startHeightM);
  });

  it('is the analytic S-curve position, not an interpolation between stops', () => {
    const shaft = movingShaft();
    let checked = 0;
    for (const motion of shaft.motions.slice(0, 20)) {
      const span = motion.arrivesAt - motion.startedAt;
      for (const fraction of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
        const t = motion.startedAt + span * fraction;
        const expected = motion.fromHeightM + positionAt(motion.profile, t - motion.startedAt);
        expect(carHeightAt(shaft, t)).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is flat through the motor-start delay and settled by the arrival', () => {
    const shaft = movingShaft();
    const motion = shaft.motions[0];
    if (motion === undefined) throw new Error('no motion');
    // `commandedAt <= t <= startedAt` is the motor-start delay: commanded, not yet moving.
    expect(carHeightAt(shaft, motion.commandedAt)).toBe(motion.fromHeightM);
    expect(carHeightAt(shaft, motion.startedAt)).toBe(motion.fromHeightM);
    // And by `arrivesAt` the car is levelled at the destination, settle included, and stays
    // there until the *next* move is commanded — which is why the upper probe stops short of it.
    expect(carHeightAt(shaft, motion.arrivesAt)).toBeCloseTo(motion.toHeightM, 9);
    const next = shaft.motions[1];
    const standing = next === undefined ? motion.arrivesAt + 60 : (motion.arrivesAt + next.commandedAt) / 2;
    expect(carHeightAt(shaft, standing)).toBeCloseTo(motion.toHeightM, 9);
  });

  it('never leaves the shaft', () => {
    const shaft = movingShaft();
    const heights = recording.floors.map((floor) => floor.heightM);
    const lowest = Math.min(...heights);
    const highest = Math.max(...heights);
    for (let t = recording.startedAt; t <= recording.endedAt; t += 0.37) {
      const h = carHeightAt(shaft, t);
      expect(h).toBeGreaterThanOrEqual(lowest - 1e-6);
      expect(h).toBeLessThanOrEqual(highest + 1e-6);
    }
  });
});

describe('carDirectionAt and carFloorIdAt', () => {
  it('report standing before the first move and at the floor the car started on', () => {
    const shaft = movingShaft();
    expect(carDirectionAt(shaft, recording.startedAt)).toBe(0);
    expect(carFloorIdAt(shaft, recording.startedAt)).toBe(shaft.startFloorId);
  });

  it('report the travel direction only while the car is between its endpoints', () => {
    const shaft = movingShaft();
    const motion = shaft.motions[0];
    if (motion === undefined) throw new Error('no motion');
    const mid = (motion.startedAt + motion.arrivesAt) / 2;
    expect(carDirectionAt(shaft, motion.startedAt)).toBe(0);
    expect(carDirectionAt(shaft, motion.arrivesAt)).toBe(0);
    expect(carDirectionAt(shaft, mid)).toBe(motion.toHeightM > motion.fromHeightM ? 1 : -1);
    // A moving car reports the floor it left; an arrived one reports the floor it reached.
    expect(carFloorIdAt(shaft, mid)).toBe(motion.fromFloorId);
    expect(carFloorIdAt(shaft, motion.arrivesAt)).toBe(motion.toFloorId);
  });
});

describe('doorFractionAt', () => {
  it('stays within [0, 1] across the whole run', () => {
    for (const shaft of recording.shafts) {
      for (let t = recording.startedAt; t <= recording.endedAt; t += 0.53) {
        const fraction = doorFractionAt(shaft, t);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is shut before the first door command', () => {
    for (const shaft of recording.shafts) {
      expect(doorFractionAt(shaft, recording.startedAt - 1)).toBe(0);
    }
  });
});

describe('frameAt', () => {
  it('is pure: the same instant gives an identical frame however it is reached', () => {
    const at = (fraction: number): string => {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      return JSON.stringify(frameAt(recording, t));
    };
    // Reached going forwards…
    at(0);
    at(0.25);
    const forwards = at(0.42);
    // …and reached going backwards, after the producer has seen a much later instant.
    at(0.9);
    const backwards = at(0.42);
    expect(backwards).toBe(forwards);
    expect(at(0.42)).toBe(forwards);
    expect(forwards.length).toBeGreaterThan(0);
  });

  it('clamps outside the run rather than extrapolating', () => {
    const before = frameAt(recording, recording.startedAt - 10_000);
    const after = frameAt(recording, recording.endedAt + 10_000);
    expect(before.simTimeS).toBe(recording.startedAt);
    expect(after.simTimeS).toBe(recording.endedAt);
    expect(JSON.stringify(before)).toBe(JSON.stringify(frameAt(recording, recording.startedAt)));
  });

  it('emits one landing per floor, in the building’s floor order, whether or not anybody waits', () => {
    // A renderer lays out one row per floor. Landings must not appear and vanish under it as
    // queues form and clear, so the list is the building's floors, not the busy ones.
    for (const fraction of [0, 0.5, 1]) {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      const frame = frameAt(recording, t);
      expect(frame.landings.map((l) => l.floorId)).toEqual(recording.floors.map((f) => f.id));
      expect(frame.landings.every((l) => l.waitingUp >= 0 && l.waitingDown >= 0)).toBe(true);
    }
  });

  it('emits one car per shaft, in shaft order', () => {
    const frame = frameAt(recording, recording.endedAt);
    expect(frame.cars.map((c) => c.carId)).toEqual(recording.shafts.map((s) => s.carId));
  });

  it('reports no mean wait until somebody has boarded, and a real one afterwards', () => {
    expect(frameAt(recording, recording.startedAt).runningMeanWaitS).toBeUndefined();
    const end = frameAt(recording, recording.endedAt);
    expect(end.served).toBeGreaterThan(0);
    expect(end.runningMeanWaitS).toBeGreaterThan(0);
  });

  it('keeps the headline counters consistent with the landings it drew', () => {
    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      const frame = frameAt(recording, t);
      const summed = frame.landings.reduce((n, l) => n + l.waitingUp + l.waitingDown, 0);
      expect(summed).toBe(frame.totalWaiting);
    }
  });
});
