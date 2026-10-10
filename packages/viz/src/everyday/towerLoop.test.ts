/**
 * **A tower card plays the last filed day, and playing it files nothing** — GitHub issue #536's
 * permitted half, [§ D716](../../../../DECISIONS.md) § 3 and [§ D1301](../../../../DECISIONS.md).
 *
 * The career day here is a real one: `runCampaignDay` writes the tower's day onto the state, the
 * run is simulated from exactly that state through `dev/state.ts#shiftRunConfigOf`, as the shift
 * runner does, and `closeDay` files it. So the recording the card is handed is the one the verdict
 * was graded from, simulated from the seed the career derived for that tower and day, rather than a
 * stand-in a card could be shown and the day never ran.
 */

import { describe, expect, it } from 'vitest';

import { towerById } from '../campaign/career.js';
import { encodeCareer } from '../campaign/careerPersist.js';
import { careerDaySeedFor } from '../campaign/incidents.js';
import type { ViewerState } from '../dev/state.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { ManualClock } from '../playback/clock.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { createEverydayHost, type EverydayHost, type EverydayHostBindings } from './host.js';
import { TOWER_LOOP_SPEED, towerLoopOf, type TowerLoopSource } from './towerLoop.js';

interface Harness {
  readonly bindings: EverydayHostBindings;
  readonly patches: Partial<ViewerState>[];
  state: ViewerState;
  filed: string | undefined;
}

/** `host.test.ts`'s campaign harness, cut to what a filing needs: a merging patch and a latch. */
function harness(): Harness {
  const patches: Partial<ViewerState>[] = [];
  const h: Harness = {
    patches,
    state: baseState(),
    filed: undefined,
    bindings: {
      resources: RESOURCES,
      state: () => h.state,
      playheadS: () => 0,
      dayClosed: () => h.state.recording !== undefined && h.filed === h.state.recording.runId,
      runIsOwn: () => true,
      playerHasChosen: () => true,
      dayStartS: () => undefined,
      /* `dev/main.ts#runShift`, as a node test can do it: simulate the state the press wrote. */
      startRun: () => {
        const plan = shiftRunConfigOf(RESOURCES, h.state);
        const { recording } = recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        });
        h.state = { ...h.state, recording };
      },
      intervene: () => {},
      closeDay: () => {
        if (h.state.recording === undefined) return;
        h.filed = h.state.recording.runId;
      },
      openRunTab: () => {},
      ghostRace: () => ({ pick: 'none' as const, rival: undefined, refusal: undefined, pending: false }),
      raceAgainst: () => {},
      applyPatch: (patch) => {
        patches.push(patch);
        h.state = { ...h.state, ...patch };
      },
      loadReferenceRuns: () => Promise.resolve([]),
      simulateRecord: () => {
        throw new Error('this harness does not simulate a record');
      },
      enterWatch: () => {},
      stopWatching: () => {},
      playThisCrowd: () => {},
      watching: () => undefined,
      dailyBoard: undefined,
      onChange: () => () => {},
    },
  };
  return h;
}

/** A host whose every method call is written down, so a test can say which ones a caller made. */
function spied(host: EverydayHost): { readonly host: EverydayHost; readonly calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(host, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(key));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { host: proxy, calls };
}

describe('the tower card’s loop — #536, § D716 § 3, § D1301', () => {
  it('keeps each filed day with the recording it was graded from, simulated from the career’s own seed', () => {
    const h = harness();
    const host = createEverydayHost(h.bindings);
    const sessionSeed = h.state.seed;
    expect(host.campaignFiledDays?.().size).toBe(0);

    host.runCampaignDay('c1');
    const ranOn = h.state.recording;
    expect(ranOn, 'the press simulated a day').toBeDefined();
    host.closeDay();

    const filed = host.campaignFiledDays?.().get('c1');
    expect(filed?.day).toBe(1);
    expect(towerById(host.campaign(), 'c1')?.day, 'the day was filed').toBe(2);
    expect(filed?.recording, 'the card holds the run the verdict was graded from').toBe(ranOn);
    expect(filed?.recording.seed).toBe(careerDaySeedFor(sessionSeed, 'c1', 1).toString());
    expect(['cleared', 'missed']).toContain(filed?.verdict);
  });

  it('plays the last filed day from its stored seed, and replaces it when the next day files', () => {
    const h = harness();
    const host = createEverydayHost(h.bindings);
    const sessionSeed = h.state.seed;
    host.runCampaignDay('c1');
    host.closeDay();
    const clock = new ManualClock(0);
    const first = towerLoopOf(host, 'c1', clock);
    expect(first?.day).toBe(1);
    expect(first?.recording.seed).toBe(careerDaySeedFor(sessionSeed, 'c1', 1).toString());

    host.runCampaignDay('c1');
    host.closeDay();
    const second = towerLoopOf(host, 'c1', clock);
    expect(second?.day).toBe(2);
    expect(second?.recording.seed).toBe(careerDaySeedFor(sessionSeed, 'c1', 2).toString());
    expect(second?.recording).toBe(host.campaignFiledDays?.().get('c1')?.recording);
    /* A tower with no filed day this sitting has nothing to play. */
    expect(towerLoopOf(host, 'c6', clock)).toBeUndefined();
  });

  it('runs for a simulated hour with no file-day and leaves the career byte-unchanged', () => {
    const h = harness();
    const host = createEverydayHost(h.bindings);
    host.runCampaignDay('c1');
    host.closeDay();

    const careerBefore = encodeCareer(host.campaign());
    const patchesBefore = h.patches.length;
    const stateBefore = h.state;
    const filedBefore = host.campaignFiledDays?.().get('c1');
    const { host: watched, calls } = spied(host);

    const clock = new ManualClock(0);
    const loop = towerLoopOf(watched as TowerLoopSource, 'c1', clock);
    expect(loop).toBeDefined();
    if (loop === undefined) return;
    const { startedAt, endedAt } = loop.recording;

    /* A simulated hour of picture, in 100 ms frames, counting every wrap. */
    let played = 0;
    let wraps = 0;
    let last = loop.frame().simTimeS;
    const stepMs = 100;
    while (played < 3_600) {
      clock.advance(stepMs);
      const now = loop.frame().simTimeS;
      expect(now).toBeGreaterThanOrEqual(startedAt);
      expect(now).toBeLessThanOrEqual(endedAt);
      if (now < last) wraps += 1;
      played += (stepMs / 1000) * TOWER_LOOP_SPEED;
      last = now;
    }
    /* And a second hour, so the loop is seen to wrap rather than to stop at the day's end. */
    for (let ms = 0; ms < (3_600 / TOWER_LOOP_SPEED) * 1000; ms += stepMs) {
      clock.advance(stepMs);
      const now = loop.frame().simTimeS;
      if (now < last) wraps += 1;
      last = now;
    }
    loop.stop();

    expect(wraps, 'the picture loops').toBeGreaterThan(0);
    expect(calls, 'the loop only ever read the filed days').toEqual(['campaignFiledDays']);
    expect(calls).not.toContain('campaignAct');
    expect(calls).not.toContain('closeDay');
    expect(encodeCareer(host.campaign()), 'the career record').toBe(careerBefore);
    expect(towerById(host.campaign(), 'c1')?.day).toBe(2);
    expect(h.patches.length, 'nothing was written to the state').toBe(patchesBefore);
    expect(h.state).toBe(stateBefore);
    expect(host.campaignFiledDays?.().get('c1')).toBe(filedBefore);
  });
});
