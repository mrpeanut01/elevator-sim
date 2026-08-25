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
  suppressedConfig,
  timedOutConfig,
} from '../fixtures.test-helper.js';
import type { VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { overlayAt, queueAt } from '../frame/overlay.js';
import { playheadHasReachedEnd, undeliveredAt } from './canvas.js';
import { describeQueue } from './riderQueue.js';
import { buildingMood, moodObservationsOf } from './mood.js';
import { recordRun } from '../record/recordRun.js';
import { describeFrame } from './describeFrame.js';
import { carRestsAt } from './carRest.js';
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

  /**
   * `docs/20` defect 9 — the subtitle named the dispatcher `yours-1` where every other surface
   * said *Lobby holder*.
   *
   * Asserted both ways, because both are the contract: a caller that has the display name gets it
   * and the id is **gone** (not merely joined by a name, which would leave the engine string on
   * the surface), and a caller that has none gets exactly the sentence it had before the field
   * existed. The id used here is deliberately one that could not be a display name.
   */
  it('names the dispatcher a reader knows, and falls back to the id when given no name', () => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const frame = frameAt(recording, recording.endedAt / 3);

    const named = describeFrame({ recording, frame, dispatcherName: 'Lobby holder' });
    expect(named).toContain('dispatcher Lobby holder');
    expect(named).not.toContain(recording.dispatcherProfileId);

    expect(describeFrame({ recording, frame })).toContain(
      `dispatcher ${recording.dispatcherProfileId}`,
    );
  }, 300_000);
});

describe('the description carries the two facts a picture must not hide', () => {
  it('reports a suppressed mean as not reported, never as a number', () => {
    /*
     * `suppressedConfig` rather than `breadthConfig(config, 'vertical-city')` — `DECISIONS.md`
     * § D260. The building was refused at its shipped rate by § D254's pickup access check, not by
     * its traffic; served properly it completes at 100 % delivery. The rate is now stated.
     */
    const { recording } = recordRun(suppressedConfig(config));
    expect(recording.summary.awtIsValid).toBe(false);
    const describeAt = (t: number): string =>
      describeFrame({ recording, frame: frameAt(recording, t), metrics: overlayAt(recording, t) });

    /*
     * At the end, where `core`'s own sentence is what the paragraph carries. Mid-run it is gated —
     * `docs/20` defect 3, and the test below — because `awtInvalidReason` is a whole-run verdict in
     * past tense and this paragraph published it byte-identically at 14 %, 64 % and 97 % of one run.
     * What is unconditional, and is asserted at **both** playheads, is that no mean is quoted.
     */
    const end = describeAt(recording.endedAt);
    expect(end).toContain('Mean waiting time is suppressed');
    expect(end).toContain('is not reported');
    expect(end).not.toMatch(/Rolling mean wait over the last \d+ seconds is \d/);

    const half = describeAt(recording.endedAt / 2);
    expect(half).not.toMatch(/Rolling mean wait over the last \d+ seconds is \d/);
  }, 300_000);

  /**
   * The refusal is dated — `docs/20` defect 3, on the surface with no picture to contradict it.
   *
   * A reader on the text alternative was told at 00:00 what the queues did by 16:29. The
   * **withholding** does not move: the paragraph still says there is no mean here at every playhead,
   * because a text alternative that fell silent while the canvas went on refusing would put the
   * sighted and non-sighted halves back out of step. What is gated is `core`'s verdict.
   */
  it('does not publish the finished day’s reason at a playhead short of the end', () => {
    const { recording } = recordRun(suppressedConfig(config));
    const reason = recording.summary.awtInvalidReason;
    expect(reason).toBeDefined();

    const t = recording.endedAt * 0.14;
    const early = describeFrame({ recording, frame: frameAt(recording, t) });
    expect(early).toContain('Mean waiting time is not reported');
    expect(early).toContain('A mean over part of a day is not this day’s average');
    expect(early).not.toContain(reason ?? '<no reason>');

    // The end earns it, so this is a gate and not a deletion.
    const end = describeFrame({ recording, frame: frameAt(recording, recording.endedAt) });
    expect(end).toContain(reason ?? '<no reason>');
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
    /*
     * `timedOutConfig` — the same building, at a rate that genuinely outruns it. `DECISIONS.md`
     * § D260: `mixed-use-high-rise` at its shipped rate used to end with people still in the system
     * because § D254's pickup access check never collected the landings inside its access zones. It
     * now completes at 100 % delivery, so the undelivered count this test prints has to come from
     * demand instead — 80 % of population per five minutes, which the drain tail cannot clear.
     */
    const { recording } = recordRun(timedOutConfig(config));
    expect(recording.status).not.toBe('completed');
    expect(recording.summary.undelivered).toBeGreaterThan(0);
    const text = describeFrame({ recording, frame: frameAt(recording, recording.endedAt) });
    expect(text).toContain(`Run status ${recording.status}`);
    expect(text).toContain(`${String(recording.summary.undelivered)} passengers undelivered`);
  }, 300_000);

  /*
   * R6, on the fully reachable half of the same sentence — `dev/main.ts` passes `recording` and
   * `frame` at both call sites, so this one is on screen readers today.
   *
   * `summary.undelivered` is the count **when the run ended**. Until R6 measured it, this sentence
   * printed that count at every playhead, so a paragraph read at 00:00 announced the ending of a run
   * that had not started serving anybody. Reverting `describeFrame.ts`'s status branch turns the
   * third assertion below red: the whole-run figure comes back at a mid-run playhead.
   */
  it('does not announce the run’s ending at a playhead short of it', () => {
    const { recording } = recordRun(timedOutConfig(config));
    const t = recording.endedAt * 0.5;
    const frame = frameAt(recording, t);
    const text = describeFrame({ recording, frame });
    const reading = undeliveredAt(recording, frame);

    expect(reading.wholeRun).toBe(false);
    expect(reading.count).not.toBe(recording.summary.undelivered);
    expect(text).not.toContain(`${String(recording.summary.undelivered)} passengers undelivered`);
    expect(text).toContain(
      `${String(reading.count)} people still in the building and not yet where they were going`,
    );
    // The status word itself is never withheld — § D294 on this same header. RV-16's lead survives.
    expect(text).toContain(`Run status ${recording.status}`);
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
   * anywhere in the viewer was the caption drawn for a landing picked out of a `<select>` **that
   * defaults to `none`** — so the fact went unwritten unless the reader already suspected the
   * floor.
   *
   * That clause used to end *"a `<select>` that is dropped below 1280 px of viewport"*, and it is
   * **withdrawn** — issue #260. No such rule has existed since `22a1021`; the argument, and what
   * does govern the control, is in `describeFrame.ts`'s `unansweredCallFloorIds` and in
   * `render/canvas.ts`'s. The selection default is the support that survives, and it is the
   * stronger one: a width rule hid the control on some screens, while `none` hides the fact on all
   * of them. This file was registered as still asserting the withdrawn claim in
   * `viewportClaims.test.ts#KNOWN_STALE`; that entry is deleted on this commit.
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
  /** The mood as a caller builds it: at the playhead, off the queues at that playhead. */
  function moodAt(recording: VizRecording, t: number): ReturnType<typeof buildingMood> {
    return buildingMood(moodObservationsOf(recording, queueAt(recording, t), t));
  }

  it('says the headline, every driver and the caveat once the run has finished', () => {
    const { recording } = recordRun(breadthConfig(config, 'midtown-office'));
    expect(recording.summary.awtIsValid).toBe(false);
    const t = recording.endedAt;
    const queues = queueAt(recording, t);
    const mood = moodAt(recording, t);
    const text = describeFrame({ recording, frame: frameAt(recording, t), queues, mood });

    expect(text).toContain(mood.headline);
    for (const driver of mood.drivers) expect(text, driver.id).toContain(driver.text);
    expect(text).toContain(mood.caveat);
    // Nothing is being withheld, so nothing says it is.
    expect(mood.retraction).toBe('');
    expect(text).not.toContain('So far');
  }, 300_000);

  /*
   * ## R6 on the surface a screen-reader user gets — § D293's gate, on the join it did not reach
   *
   * The version of this block that shipped before R6 measured it asserted the **defect**: it drove the
   * paragraph at `endedAt / 2` and required *every* driver's sentence to be in it. Four of the five
   * carry `basis: 'whole-run'`, so at half past the day the text alternative read *"…334 of 334
   * people got where they were going"* beside a clock reading 08:14 — the finished day's
   * `summary.delivered`, where the count at that playhead is a different number. Found by the
   * honesty sweep's temporal axis on 49 of 49 always-on cases; `dev/leftRail.ts#moodDriverPanelOf`
   * has gated the same rows since § D293 and this join was not gated with it.
   *
   * Reverting `describeFrame.ts`'s mood branch to the ungated join turns the two assertions below
   * red: the whole-run sentences come back and the retraction that replaced them goes.
   */
  it('withholds the whole-run drivers mid-run, and puts the retraction where they were', () => {
    const { recording } = recordRun(breadthConfig(config, 'midtown-office'));
    const t = recording.endedAt / 2;
    const queues = queueAt(recording, t);
    const mood = moodAt(recording, t);
    const text = describeFrame({ recording, frame: frameAt(recording, t), queues, mood });

    // The fixture has to reach both sides of the gate, or this test passes on an empty set.
    const wholeRun = mood.drivers.filter((driver) => driver.basis === 'whole-run');
    const live = mood.drivers.filter((driver) => driver.basis === 'now');
    expect(wholeRun.length).toBeGreaterThan(0);
    expect(live.length).toBeGreaterThan(0);

    for (const driver of live) expect(text, driver.id).toContain(driver.text);
    for (const driver of wholeRun) expect(text, driver.id).not.toContain(driver.text);
    // The retraction is a sentence, not a flag — § D293. It names the rows it is standing in for.
    expect(mood.retraction).not.toBe('');
    expect(text).toContain(mood.retraction);
    for (const driver of wholeRun) expect(text).toContain(driver.label);
    expect(text).toContain(mood.headline);
    expect(text).toContain(mood.caveat);
    // R6, in the sentence a screen reader hears: mid-run is a preview and says so.
    expect(text).toContain('So far');
  }, 300_000);

  it('gates on the frame, and the mood built at that frame agrees — the two doors of one rule', () => {
    /*
     * `render/canvas.ts#playheadHasReachedEnd` reads the frame; `BuildingMood.provisional` is
     * `atS < endedAt` computed by `buildingMood`. Two doors onto one comparison, pinned equal
     * rather than argued — the pattern `leftRail.test.ts` uses for `moodDriverRowsOf`.
     */
    const { recording } = recordRun(breadthConfig(config, 'midtown-office'));
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      expect(playheadHasReachedEnd(recording, frameAt(recording, t)), String(fraction)).toBe(
        !moodAt(recording, t).provisional,
      );
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * AD-S17 — the rest bar, for a reader who cannot see it
 * -------------------------------------------------------------------------- */

/**
 * **The drawn mark is a rectangle, and a rectangle is nothing to a screen reader.**
 *
 * `docs/28` AD-A1 forbids a state a player must distinguish from riding on one channel, and for a
 * non-sighted reader the drawn channel is not one of them. The paragraph already said *standing*;
 * what it could not say is *for how long*, which is the whole of what AD-S17 carries and the whole
 * of what campaign stage 1's lesson turns on.
 *
 * Driven off a real run rather than a fixture, on the building the lesson is set on. Its lifts are
 * idle for most of the hour (`docs/34` § 9.3 measures the landings empty about 91 % of the time),
 * so the clause is the ordinary state of this building rather than a contrived one.
 */
describe('AD-S17 — a car standing still says how long, in words', () => {
  it('replaces the bare “standing” with a duration once the car has stood', () => {
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const span = recording.endedAt - recording.startedAt;

    /* At the very first instant nothing has stood for any time, so the old clause is what is said. */
    const opening = describeFrame({ recording, frame: frameAt(recording, recording.startedAt) });
    expect(opening).toContain('standing,');
    expect(opening).not.toContain('standing still for');

    /* And somewhere in the day a lift has stood long enough to say so. */
    const said = Array.from({ length: 41 }, (_unused, index) =>
      describeFrame({ recording, frame: frameAt(recording, recording.startedAt + (span * index) / 40) }),
    ).filter((text) => text.includes('standing still for'));
    expect(said.length, 'no frame of a mostly-idle building says a lift stood still').toBeGreaterThan(0);

    /* The unit is named, and a minute is spoken as a minute — AD-A5. */
    for (const text of said) {
      expect(text).toMatch(/standing still for (?:\d+ s|\d+ min(?: \d+ s)?)/);
    }
  }, 300_000);

  it('says it about the cars the mark is drawn over, and about no others', () => {
    /*
     * The paragraph and the picture must not drift — that is this module's whole reason for being a
     * pure function of the same frame. So the set of cars whose clause carries a duration is
     * asserted equal to the set the renderer marks, rather than merely non-empty.
     */
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const span = recording.endedAt - recording.startedAt;
    for (let index = 0; index <= 20; index += 1) {
      const frame = frameAt(recording, recording.startedAt + (span * index) / 20);
      const marked = new Set(carRestsAt(recording, frame).map((rest) => rest.carId));
      const text = describeFrame({ recording, frame });
      for (const car of frame.cars) {
        const clause = text.slice(text.indexOf(`Car ${car.label} at floor`));
        const said = clause.slice(0, clause.indexOf('.')).includes('standing still for');
        expect(said, `${car.carId} at ${String(frame.simTimeS)}`).toBe(marked.has(car.carId));
      }
    }
  }, 300_000);
});
