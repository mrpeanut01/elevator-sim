/**
 * The canvas's text alternative — `KB-13`.
 *
 * Asserted the same way as the picture: every claim about the sentence is recomputed from the
 * frame, so a description that stopped reading the frame and started reciting a template fails.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { overlayAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';
import { describeFrame } from './describeFrame.js';
import { LOAD_ALARM } from './overlay.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

describe.each(BUILDING_IDS)('%s — the frame description', (buildingId) => {
  it('names the building, the seed, the clock and every car it claims to describe', () => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const t = recording.startedAt + (recording.endedAt - recording.startedAt) * 0.4;
    const frame = frameAt(recording, t);
    const text = describeFrame({ recording, frame, metrics: overlayAt(recording, t) });

    expect(text).toContain(recording.buildingName);
    expect(text).toContain(recording.seed);
    expect(text).toContain(recording.dispatcherProfileId);
    for (const car of frame.cars.slice(0, 8)) {
      expect(text).toContain(`Car ${car.label} at floor ${car.floorId}`);
      expect(text).toContain(`${String(car.occupants)} aboard`);
      // KB-15a/b in words: the two signals D18 found were carried by colour alone.
      expect(text).toContain(`doors ${car.doorPhase}`);
      expect(text).toContain(car.loadFactor.toFixed(2));
    }
    if (frame.cars.length > 8) {
      expect(text).toContain(`${String(frame.cars.length - 8)} further cars not described.`);
    }
  }, 300_000);

  it('is deterministic — the same frame produces the same sentence', () => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const frame = frameAt(recording, recording.endedAt / 3);
    expect(describeFrame({ recording, frame })).toBe(describeFrame({ recording, frame }));
  }, 300_000);
});

describe('the description carries the two facts a picture must not hide', () => {
  it('reports a suppressed mean as not reported, never as a number', () => {
    const { recording } = recordRun(breadthConfig(config, 'vertical-city'));
    expect(recording.summary.awtIsValid).toBe(false);
    const t = recording.endedAt / 2;
    const text = describeFrame({
      recording,
      frame: frameAt(recording, t),
      metrics: overlayAt(recording, t),
    });
    expect(text).toContain('Mean waiting time is suppressed');
    expect(text).toContain('is not reported');
    expect(text).not.toMatch(/Rolling mean wait over the last \d+ seconds is \d/);
  }, 300_000);

  it('quotes the rolling mean it was handed, and the window it was computed over', () => {
    /*
     * The mutation this test exists for: the sentence's two numbers replaced by the literals
     * `300` and `0.0` survived, because the only assertion about this branch was that a
     * *suppressed* run does not produce a number. A run that is not suppressed had nothing
     * checking that the number was the right one.
     */
    const { recording } = recordRun(breadthConfig(config, 'secure-tower'));
    expect(recording.summary.awtIsValid).toBe(true);
    for (const windowS of [90, 600]) {
      // An instant the window actually covers something at — asserting "the number is right" at
      // an instant where there is no number would pass on any implementation.
      const t = recording.endedAt * 0.6;
      const metrics = overlayAt(recording, t, { windowS });
      const text = describeFrame({ recording, frame: frameAt(recording, t), metrics });
      expect(metrics.boardedInWindow).toBeGreaterThan(0);
      expect(metrics.rollingMeanWaitS).toBeDefined();
      expect(text).toContain(
        `Rolling mean wait over the last ${String(windowS)} seconds is ${(metrics.rollingMeanWaitS ?? 0).toFixed(1)} seconds.`,
      );
    }
  }, 300_000);

  it('reports a run that did not deliver everybody as such', () => {
    const { recording } = recordRun(breadthConfig(config, 'mixed-use-high-rise'));
    expect(recording.status).not.toBe('completed');
    const text = describeFrame({ recording, frame: frameAt(recording, recording.endedAt) });
    expect(text).toContain(`Run status ${recording.status}`);
    expect(text).toContain(`${String(recording.summary.undelivered)} passengers undelivered`);
  }, 300_000);

  it('says OVERLOADED for a car over the alarm, and not for one merely full', () => {
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const frame = frameAt(recording, recording.startedAt);
    const overloaded = {
      ...frame,
      cars: [{ ...(frame.cars[0] as (typeof frame.cars)[number]), loadFactor: LOAD_ALARM }],
    };
    const full = {
      ...frame,
      cars: [{ ...(frame.cars[0] as (typeof frame.cars)[number]), loadFactor: 0.9 }],
    };
    expect(describeFrame({ recording, frame: overloaded })).toContain('OVERLOADED');
    expect(describeFrame({ recording, frame: full })).toContain('full');
    expect(describeFrame({ recording, frame: full })).not.toContain('OVERLOADED');
  }, 300_000);
});
