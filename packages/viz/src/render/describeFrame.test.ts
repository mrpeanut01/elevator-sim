/**
 * The canvas's text alternative — `KB-13`.
 *
 * Asserted the same way as the picture: every claim about the sentence is recomputed from the
 * frame, so a description that stopped reading the frame and started reciting a template fails.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  BUILDING_IDS,
  DATA_DIR,
  PANEL_DISPATCHER_ID,
  breadthConfig,
} from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { overlayAt, queueAt } from '../frame/overlay.js';
import { describeQueue } from './riderQueue.js';
import { buildingMood, moodObservationsOf } from './mood.js';
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

describe('D10 — a call no car answers is said in words, not only drawn', () => {
  /*
   * The sighted half of this signal is `canvas.ts`'s `✗` on the landing and the count in the
   * banner. `KB-13` is the rule that the non-sighted reader is told the same thing, and it bites
   * hardest here: before `D10` the only surface for "no car answered this call in this run"
   * anywhere in the viewer was the caption drawn for a landing picked out of a `<select>` that is
   * dropped below 1280 px of viewport.
   *
   * Driven off a real run rather than a literal, so the sentence is asserted against a recording
   * the rest of this file also uses.
   */
  it('names the landings it was handed, and says nothing when there are none', () => {
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const frame = frameAt(recording, recording.endedAt / 2);

    const quiet = describeFrame({ recording, frame });
    expect(quiet).not.toContain('no car');

    const one = describeFrame({ recording, frame, unansweredCallFloorIds: ['4'] });
    expect(one).toContain('1 landing with a call no car answers in this run: 4.');

    // The count and the ids are both read, so neither can be a constant.
    const two = describeFrame({ recording, frame, unansweredCallFloorIds: ['2', '5'] });
    expect(two).toContain('2 landings with a call no car answers in this run: 2, 5.');
    expect(two).not.toContain('1 landing with');
  }, 300_000);
});

describe('the description says which passenger model produced the run — version 4', () => {
  it('names destination dispatch, and only on a run that used it', () => {
    /*
     * `KB-13`'s claim is that a non-sighted reader is told what is on screen. Under a landing
     * panel "6 legs waiting at floor 10" is six people already assigned to as many as six
     * different cars, not one hall call — and a version-3 recording gave the two models the
     * same paragraph because it carried nothing to tell them apart.
     */
    const panel = recordRun(
      breadthConfig(config, 'midtown-office', { dispatcherId: PANEL_DISPATCHER_ID }),
    ).recording;
    const conventional = recordRun(breadthConfig(config, 'midtown-office')).recording;
    expect(panel.passengerModel).toBe('destination-dispatch');
    expect(conventional.passengerModel).toBe('conventional');

    const at = (r: typeof panel): string =>
      describeFrame({ recording: r, frame: frameAt(r, r.endedAt / 2) });
    expect(at(panel)).toContain('Destination dispatch');
    expect(at(panel)).toContain('one call per destination');
    // The discriminating half: a constant sentence would appear on both.
    expect(at(conventional)).not.toContain('Destination dispatch');
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * § 6.3 — the per-floor clause, which lands with the renderer rather than after it
 * -------------------------------------------------------------------------- */

describe('the queue reaches a reader who cannot see the glyphs', () => {
  it('says a floor’s count, its longest wait and its band — on a real building', () => {
    /*
     * § 6.3: *"`describeFrame` gains, per floor with anybody on it, one clause… This is not
     * optional; it is how the individual-glyph information reaches a reader who cannot see it."*
     *
     * Every clause is recomputed from `queueAt` rather than compared with a literal, so a
     * description that stopped reading the queue would fail rather than keep saying something
     * plausible.
     */
    const { recording } = recordRun(breadthConfig(config, 'midtown-office'));
    const t = recording.startedAt + (recording.endedAt - recording.startedAt) * 0.5;
    const queues = queueAt(recording, t);
    const busiest = [...queues].sort((a, b) => b.total - a.total);
    expect(busiest[0]?.total ?? 0).toBeGreaterThan(0);

    const text = describeFrame({ recording, frame: frameAt(recording, t), queues });
    for (const queue of busiest.slice(0, 6)) {
      expect(text, `floor ${queue.floorId}`).toContain(describeQueue(queue));
      expect(text).toContain(`Floor ${queue.floorId}: ${String(queue.total)}`);
    }
    // The tail is summarised rather than dropped, so the paragraph never understates the queue.
    const rest = busiest.slice(6);
    if (rest.length > 0) {
      const people = rest.reduce((sum, queue) => sum + queue.total, 0);
      expect(text).toContain(
        `${String(rest.length)} further floors with ${String(people)} people between them`,
      );
    }
  }, 300_000);

  it('describes the busiest floors, not the first six in building order', () => {
    // A reader is being told where the trouble is. Walking the building bottom to top and
    // stopping at six would describe the quiet floors of a tower and omit the queue.
    const { recording } = recordRun(breadthConfig(config, 'vertical-city'));
    const t = recording.startedAt + (recording.endedAt - recording.startedAt) * 0.6;
    const queues = queueAt(recording, t);
    const deepest = [...queues].sort((a, b) => b.total - a.total)[0];
    expect(deepest).toBeDefined();
    const text = describeFrame({ recording, frame: frameAt(recording, t), queues });
    expect(text).toContain(`Floor ${String(deepest?.floorId)}:`);
  }, 300_000);

  it('says nothing about queues when none are supplied', () => {
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const frame = frameAt(recording, recording.endedAt / 2);
    expect(describeFrame({ recording, frame })).not.toContain('waiting, the longest for');
  }, 300_000);
});

describe('the mood is spoken, on the run whose statistics are refused', () => {
  it('says the headline, every driver and the caveat', () => {
    const { recording } = recordRun(breadthConfig(config, 'midtown-office'));
    expect(recording.summary.awtIsValid).toBe(false);
    const t = recording.endedAt / 2;
    const queues = queueAt(recording, t);
    const mood = buildingMood(moodObservationsOf(recording, queues, t));
    const text = describeFrame({ recording, frame: frameAt(recording, t), queues, mood });

    expect(text).toContain(mood.headline);
    for (const driver of mood.drivers) expect(text, driver.id).toContain(driver.text);
    expect(text).toContain(mood.caveat);
    // R6, in the sentence a screen reader hears: mid-run is a preview and says so.
    expect(text).toContain('So far');
  }, 300_000);
});
