import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import type { VizRecording } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { frameSequence, frameTimes, serializeFrames } from './sequence.js';

let recording: VizRecording;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  recording = recordRun(fixtureConfig(config)).recording;
}, 120_000);

describe('frameTimes', () => {
  it('starts at the run start and ends exactly at the run end', () => {
    const times = frameTimes(recording, { fps: 30, speed: 10 });
    expect(times[0]).toBe(recording.startedAt);
    expect(times[times.length - 1]).toBe(recording.endedAt);
  });

  it('is strictly increasing', () => {
    const times = frameTimes(recording, { fps: 24, speed: 30 });
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] ?? 0).toBeGreaterThan(times[i - 1] ?? 0);
    }
  });

  it('is computed from the frame index, so it does not accumulate rounding', () => {
    // 10 s of simulated time per real second at 60 Hz is a step of 1/6 s, which has no exact
    // binary representation. An accumulated sequence drifts; an indexed one does not.
    const times = frameTimes(recording, { fps: 60, speed: 10, startAtS: 0, endAtS: 100 });
    expect(times[600]).toBe(100);
    expect(times[6]).toBe(1);
    expect(times[60]).toBe(10);
  });

  it('halving the speed at a fixed frame rate doubles the frames', () => {
    const fast = frameTimes(recording, { fps: 30, speed: 20 });
    const slow = frameTimes(recording, { fps: 30, speed: 10 });
    expect(slow.length).toBeGreaterThan(fast.length);
    expect(slow.length).toBeCloseTo(fast.length * 2, -1);
  });

  it('honours maxFrames rather than exhausting memory on a long run', () => {
    const times = frameTimes(recording, { fps: 240, speed: 0.5, maxFrames: 50 });
    expect(times).toHaveLength(50);
    expect(times[times.length - 1]).toBe(recording.endedAt);
  });

  it('rejects nonsense parameters instead of producing an empty picture', () => {
    expect(() => frameTimes(recording, { fps: 0 })).toThrow(RangeError);
    expect(() => frameTimes(recording, { speed: -1 })).toThrow(RangeError);
    expect(() => frameTimes(recording, { startAtS: 100, endAtS: 10 })).toThrow(RangeError);
  });
});

describe('frameSequence', () => {
  it('produces one frame per time, at that time', () => {
    const options = { fps: 5, speed: 60 } as const;
    const times = frameTimes(recording, options);
    const frames = frameSequence(recording, options);
    expect(frames).toHaveLength(times.length);
    expect(frames.map((frame) => frame.simTimeS)).toEqual([...times]);
  });

  it('serialises to a stable string', () => {
    const options = { fps: 5, speed: 60 } as const;
    expect(serializeFrames(frameSequence(recording, options))).toBe(
      serializeFrames(frameSequence(recording, options)),
    );
  });
});
