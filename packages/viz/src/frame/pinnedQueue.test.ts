/**
 * The landing that cannot clear, and the sentence that says why.
 *
 * Driven against a real saturated run rather than a hand-built queue, because the whole claim is
 * about a shape real traffic produces. A synthetic fixture would prove the arithmetic and nothing
 * about whether the condition ever fires, and a condition that never fires is exactly how a
 * surface like this ends up shipped and inert (the standing requirement in `docs/05-roadmap.md`).
 *
 * **Not the reported seed.** The report came from `vertical-city` / `destination-panel` at seed
 * 101390945715201 over two hours; this drives `suppressedConfig`'s own building, seed and length —
 * the same building and the same saturation, at the fixture budget the rest of this package uses.
 * The claim being tested is that the condition arises from write-once promises under load, not
 * that one seed does something, so pinning the reported seed here would buy a slower test and a
 * narrower property. The reported run's numbers are in `pinnedQueue.ts`'s own docstring, where
 * they are cited as the measurement they are.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import {
  DATA_DIR,
  PANEL_DISPATCHER_ID,
  SUPPRESSED_BUILDING_ID,
  suppressedConfig,
} from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { queueAt } from './overlay.js';
import { describePinnedQueues, pinnedQueuesAt, type PinnedQueue } from './pinnedQueue.js';

let panel: VizRecording;
let conventional: VizRecording;
/**
 * The instant this run is most pinned, found by sweeping it rather than assumed to be the end.
 *
 * **This used to be `panel.endedAt - 1`, and § D333 is why it cannot be.** That worked because the
 * panel run did not finish: it timed out with thousands of riders still standing, so the last
 * instant was also the worst one. With the unbounded promise fixed the run *drains* — the landings
 * are empty when it ends, and a probe at `endedAt - 1` now finds nothing pinned and would report
 * this surface dead.
 *
 * It is not dead. Swept at 400 instants across the same recording, the condition holds in **194**
 * of 401 frames, peaking at floor `G` with 73 riders standing for `shuttle-S5`, which seats 26. So
 * the surface still fires on real traffic, which is the claim this file exists to make; what
 * changed is that the moment it fires is no longer the moment the run stops.
 *
 * Derived rather than pinned to a constant `t`, deliberately. A hard-coded instant would be a
 * second thing to re-measure every time dispatch moves, and it is exactly what made this file fail
 * for a fix that improved the product.
 */
let pinnedMoment: number;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  // `suppressedConfig` is already Vertical City under enough demand to saturate — the building and
  // the condition the report came from. The two arms differ **only** in the dispatcher, so nothing
  // below can be about crowding rather than about promises.
  panel = recordRun(
    suppressedConfig(config, { dispatcherId: PANEL_DISPATCHER_ID, onTimeout: 'report' }),
  ).recording;
  conventional = recordRun(suppressedConfig(config, { onTimeout: 'report' })).recording;
  expect(panel.buildingId).toBe(SUPPRESSED_BUILDING_ID);

  // The sweep. Worst-first ordering is `pinnedQueuesAt`'s own guarantee, so the largest overhang
  // in the run is the head of whichever frame has the largest head.
  let worstSeen = 0;
  pinnedMoment = panel.endedAt - 1;
  const steps = 400;
  for (let i = 0; i <= steps; i += 1) {
    const t = panel.startedAt + ((panel.endedAt - panel.startedAt) * i) / steps;
    const head = pinnedAt(panel, t)[0];
    if (head !== undefined && head.waiting > worstSeen) {
      worstSeen = head.waiting;
      pinnedMoment = t;
    }
  }
}, 600_000);

const pinnedAt = (recording: VizRecording, t: number): readonly PinnedQueue[] =>
  pinnedQueuesAt(queueAt(recording, t), recording.shafts, recording.passengerModel);

describe('a landing promised to one full car', () => {
  it('fires on the run a player reported, rather than only in principle', () => {
    // The report: "numerous people in the lobby and cars on the lobby floor, but they were not
    // serving riders, they were just sitting there." Measured on this recording, one promised car
    // holds more riders than it can carry — which is that picture, stated.
    const pinned = pinnedAt(panel, pinnedMoment);
    expect(pinned.length).toBeGreaterThan(0);
    const worst = pinned[0];
    expect(worst).toBeDefined();
    if (worst === undefined) return;
    expect(worst.waiting).toBeGreaterThan(worst.capacityPersons);
    expect(worst.tripsNeeded).toBeGreaterThanOrEqual(2);
  });

  it('is silent on a conventional run, because there is no promise to be pinned to', () => {
    // Not a threshold that happens not to be met — a model with no assignment at all. This is the
    // control that keeps the case above from being about crowding rather than about promises.
    expect(conventional.passengerModel).not.toBe('destination-dispatch');
    for (const t of [conventional.startedAt, conventional.endedAt / 2, conventional.endedAt - 1]) {
      expect(pinnedAt(conventional, t), `t=${String(t)}`).toEqual([]);
    }
  });

  it('is silent before anybody has queued past a carful', () => {
    // The start of the same panel run. A surface that fired at t=0 would be describing the model
    // rather than the moment, and would train a reader to ignore it by the time it mattered.
    expect(pinnedAt(panel, panel.startedAt)).toEqual([]);
  });

  it('counts trips by the car’s own capacity, not by a number chosen here', () => {
    const pinned = pinnedAt(panel, pinnedMoment);
    for (const entry of pinned) {
      const shaft = panel.shafts.find((candidate) => candidate.carId === entry.carId);
      // The capacity is read off the building, so a re-authored car changes the trigger with it.
      expect(shaft?.capacityPersons, entry.carId).toBe(entry.capacityPersons);
      expect(entry.tripsNeeded).toBe(Math.ceil(entry.waiting / entry.capacityPersons));
    }
  });

  it('orders worst first, and totally, so a banner does not reshuffle between frames', () => {
    const pinned = pinnedAt(panel, pinnedMoment);
    for (let i = 1; i < pinned.length; i += 1) {
      const previous = pinned[i - 1];
      const current = pinned[i];
      if (previous === undefined || current === undefined) continue;
      expect(previous.waiting).toBeGreaterThanOrEqual(current.waiting);
    }
    // Deterministic: the same instant twice is the same array, which is what the playhead scrubbing
    // backwards requires of everything in `frame/`.
    expect(pinnedAt(panel, pinnedMoment)).toEqual(pinned);
  });
});

describe('the sentence', () => {
  it('says the cause, not just that something is wrong', () => {
    const pinned = pinnedAt(panel, pinnedMoment);
    const long = describePinnedQueues(pinned);
    // R3: a suppressed thing is replaced by *why*, never by a blank — and never by a bare alarm.
    // The named car and the capacity are the whole content; without them this is "queue pinned".
    const worst = pinned[0];
    expect(worst).toBeDefined();
    if (worst === undefined) return;
    expect(long).toContain(worst.carId);
    expect(long).toContain(String(worst.capacityPersons));
    expect(long).toContain(worst.floorId);
  });

  it('does not read as an accusation against the dispatcher', () => {
    // § D29 chose the write-once promise deliberately, and a non-zero count is a result rather
    // than a failure. Copy that called it a fault would be this repository asserting a verdict its
    // own decision record contradicts.
    const long = describePinnedQueues(pinnedAt(panel, pinnedMoment)).toLowerCase();
    for (const word of ['fail', 'broken', 'error', 'bug', 'stuck', 'fault']) {
      expect(long, word).not.toContain(word);
    }
    // And it says what was bought, so the trade is legible rather than only its cost.
    expect(long).toContain('shorter journey');
  });

  it('has a short form that keeps the cause and drops the arithmetic', () => {
    const pinned = pinnedAt(panel, pinnedMoment);
    const short = describePinnedQueues(pinned, { short: true });
    expect(short).toContain('one named car');
    expect(short.length).toBeLessThan(describePinnedQueues(pinned).length);
    // The banner is one line beside several other fields.
    expect(short.length).toBeLessThan(60);
  });

  it('is empty when nothing is pinned, rather than saying so', () => {
    // An empty string, so the caller joins nothing. A chip reading "no queues pinned" on every
    // conventional run is the noise that makes a reader stop seeing the one that matters.
    expect(describePinnedQueues([])).toBe('');
    expect(describePinnedQueues([], { short: true })).toBe('');
  });
});
