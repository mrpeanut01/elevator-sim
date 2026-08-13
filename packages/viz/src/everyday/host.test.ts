/**
 * The Everyday data host's pure half — every derivation `createEverydayHost` layers over the
 * bindings, driven against the real shipped `data/` (the fixture rule `fixtures.test-helper.ts`
 * states: a fixture building proves that a fixture building works).
 *
 * The DOM/runtime half — the bindings `dev/main.ts` implements against its boot closure — is
 * driven in `shell.browser.test.ts`, where a real page starts a run through the host and meets
 * § 3.4's confirm strip.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, profileById, type ViewerState } from '../dev/state.js';
import type { ShapedDayReport } from '../shift/report.js';

import { createEverydayHost, EVERYDAY_HOST, type EverydayHostBindings } from './host.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = ['garden-apartments', 'midtown-office'] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();
const base = (): ViewerState => initialState(resources, 20260812n);

/**
 * A recording as far as the host ever reads one on these paths: `runState` asks only whether one
 * is on the stage. `goalsToday`'s with-a-recording arm folds a real one and is exercised by the
 * browser tier, where a real run exists.
 */
const A_RECORDING = { runId: 'host-test' } as unknown as VizRecording;

/** The host only asks whether a sheet is standing — see `openTomorrow`'s gate. */
const A_REPORT = { kind: 'week-day' } as unknown as ShapedDayReport;

interface Harness {
  readonly bindings: EverydayHostBindings;
  /** Every action press, in order, so compositions can assert their sequence. */
  readonly calls: string[];
  /** Every patch `applyPatch` received, in order. */
  readonly patches: Partial<ViewerState>[];
  state: ViewerState;
}

function harnessOf(
  state: ViewerState,
  flags?: Partial<{
    playheadS: number;
    dayClosed: boolean;
    runIsOwn: boolean;
    playerHasChosen: boolean;
  }>,
): Harness {
  const calls: string[] = [];
  const patches: Partial<ViewerState>[] = [];
  const harness: Harness = {
    calls,
    patches,
    state,
    bindings: {
      resources,
      state: () => harness.state,
      playheadS: () => flags?.playheadS ?? 0,
      dayClosed: () => flags?.dayClosed ?? false,
      runIsOwn: () => flags?.runIsOwn ?? false,
      playerHasChosen: () => flags?.playerHasChosen ?? false,
      startRun: () => {
        calls.push('startRun');
      },
      closeDay: () => {
        calls.push('closeDay');
      },
      openRunTab: () => {
        calls.push('openRunTab');
      },
      applyPatch: (patch) => {
        calls.push('applyPatch');
        patches.push(patch);
      },
      onChange: (listener) => {
        calls.push('onChange');
        void listener;
        return () => {
          calls.push('unsubscribe');
        };
      },
    },
  };
  return harness;
}

describe('runState — § 3.4’s latch, derived from the four grounds', () => {
  it('is closed with no run on the stage, whatever the flags say', () => {
    const h = harnessOf(base(), { dayClosed: true, runIsOwn: true, playerHasChosen: true });
    const run = createEverydayHost(h.bindings).runState();
    expect(run).toEqual({ hasRun: false, dayClosed: false, playheadS: 0, open: false });
  });

  it('opens only for the player’s own, chosen, unfiled run', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const open = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: true }).bindings,
    ).runState();
    expect(open).toEqual({ hasRun: true, dayClosed: false, playheadS: 0, open: true });
  });

  it('stays closed for boot’s demo run — § D232: a run nobody asked for warns nobody', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: false }).bindings,
    ).runState();
    expect(run.hasRun).toBe(true);
    expect(run.open).toBe(false);
  });

  it('stays closed for somebody else’s run — § 3.4: there is nothing of yours to lose', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: false, playerHasChosen: true }).bindings,
    ).runState();
    expect(run.open).toBe(false);
  });

  it('closes when the day files, and says so in dayClosed', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: true, dayClosed: true }).bindings,
    ).runState();
    expect(run).toEqual({ hasRun: true, dayClosed: true, playheadS: 0, open: false });
  });

  it('reads the playhead live from the bindings — a pull, not a stored copy', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(harnessOf(withRun, { playheadS: 417 }).bindings).runState();
    expect(run.playheadS).toBe(417);
  });
});

describe('the day-record reads', () => {
  it('answers the week, its contract, and no outcome before any day has closed', () => {
    const host = createEverydayHost(harnessOf(base()).bindings);
    const week = host.week();
    expect(week.day).toBe(1);
    // The page opens on CONTRACTS[0], so the contract resolves and names the opening building.
    expect(host.contract()?.buildingId).toBe('garden-apartments');
    expect(host.lastOutcome()).toBeUndefined();
    expect(host.lastReport()).toBeUndefined();
  });

  it('reads goals as all pending before any run — the wake-up gate doing its work', () => {
    const readings = createEverydayHost(harnessOf(base()).bindings).goalsToday();
    expect(readings.length).toBeGreaterThan(0);
    for (const reading of readings) {
      expect(reading.state, reading.goal.id).toBe('pending');
      expect(reading.observed, reading.goal.id).toBeNull();
    }
  });
});

describe('the resource lookups are honest — undefined, never a substitution', () => {
  const host = createEverydayHost(harnessOf(base()).bindings);

  it('answers a shipped building and refuses an unknown id', () => {
    expect(host.buildingById('garden-apartments')?.id).toBe('garden-apartments');
    expect(host.buildingById('no-such-tower')).toBeUndefined();
    expect(host.buildingIds()).toContain('midtown-office');
  });

  it('answers a shipped dispatcher and refuses an unknown id — unlike profileById, on purpose', () => {
    expect(host.dispatcherById('collective')?.id).toBe('collective');
    expect(host.dispatcherById('no-such-dispatcher')).toBeUndefined();
    // The contrast this lookup exists for: the state-selection resolver substitutes (a selector
    // must select something); a lookup about a named thing may not.
    expect(profileById(resources, [], 'no-such-dispatcher')).toBeDefined();
    expect(host.dispatchers().length).toBeGreaterThan(3);
  });

  it('answers a shipped traffic profile and refuses an unknown id', () => {
    expect(host.trafficProfileById('residential-standard')?.id ?? 'found').toBeDefined();
    expect(host.trafficProfileById('no-such-profile')).toBeUndefined();
  });
});

describe('the plain-lever seam — the same vector the Engineer editor holds', () => {
  it('reads the four levers off the working spec and group levers', () => {
    const views = createEverydayHost(harnessOf(base()).bindings).plainLevers();
    expect(views.map((view) => view.id)).toEqual(['patience', 'lobby', 'spread', 'room']);
  });

  it('writes one lever through applyPlainLever, patching only the two documents', () => {
    const h = harnessOf(base());
    createEverydayHost(h.bindings).setPlainLever('patience', 80);
    expect(h.calls).toEqual(['applyPatch']);
    const patch = h.patches[0];
    expect(patch).toBeDefined();
    expect(Object.keys(patch ?? {}).sort()).toEqual(['dispatcherSpec', 'levers']);
    expect(patch?.dispatcherSpec?.weights['starvation']).toBe(80);
  });
});

describe('the run actions', () => {
  it('startRun and closeDay are the bindings’ own presses, nothing added', () => {
    const h = harnessOf(base());
    const host = createEverydayHost(h.bindings);
    host.startRun();
    host.closeDay();
    expect(h.calls).toEqual(['startRun', 'closeDay']);
  });

  it('openTomorrow refuses while no closed day’s sheet is standing', () => {
    const h = harnessOf(base());
    createEverydayHost(h.bindings).openTomorrow();
    expect(h.calls).toEqual([]);
  });

  it('openTomorrow advances the day, clears the day’s artefacts, and runs — in that order', () => {
    const closed: ViewerState = { ...base(), recording: A_RECORDING, report: A_REPORT };
    const h = harnessOf(closed);
    createEverydayHost(h.bindings).openTomorrow();
    expect(h.calls).toEqual(['applyPatch', 'openRunTab', 'startRun']);
    const patch = h.patches[0];
    expect(patch?.week?.day).toBe(closed.week.day + 1);
    expect(patch?.week?.attempt).toBe(0);
    // The same composition as the report sheet's own press (`dev/reportPanel.ts`): the sheet, the
    // beat, the recording and yesterday's log all go in the patch that opens the day they are not
    // an account of.
    expect(patch).toMatchObject({
      recording: undefined,
      report: undefined,
      tomorrow: undefined,
      withheld: [],
      interventions: [],
    });
  });

  it('subscribe is onChange’s passthrough, unsubscribe included', () => {
    const h = harnessOf(base());
    const off = createEverydayHost(h.bindings).subscribe(() => {});
    off();
    expect(h.calls).toEqual(['onChange', 'unsubscribe']);
  });
});

describe('the slot — how the host crosses from dev/main’s boot to the shell', () => {
  it('starts empty, publishes, replays to late listeners, and honours unsubscribe', () => {
    // One lifecycle in one case, because the slot is the module singleton the shipped wiring
    // uses and this file owns its whole story in order.
    expect(EVERYDAY_HOST.current()).toBeUndefined();

    const heard: string[] = [];
    const early = EVERYDAY_HOST.whenReady(() => heard.push('early'));
    expect(heard).toEqual([]);

    const host = createEverydayHost(harnessOf(base()).bindings);
    EVERYDAY_HOST.publish(host);
    expect(EVERYDAY_HOST.current()).toBe(host);
    expect(heard).toEqual(['early']);

    // A listener arriving after the publish hears about the current host immediately.
    const late = EVERYDAY_HOST.whenReady(() => heard.push('late'));
    expect(heard).toEqual(['early', 'late']);

    // A re-publish (the loader retrying a failed boot) replaces and notifies everyone again.
    const second = createEverydayHost(harnessOf(base()).bindings);
    EVERYDAY_HOST.publish(second);
    expect(EVERYDAY_HOST.current()).toBe(second);
    expect(heard).toEqual(['early', 'late', 'early', 'late']);

    early();
    late();
    EVERYDAY_HOST.publish(host);
    expect(heard, 'an unsubscribed listener stays unsubscribed').toEqual([
      'early',
      'late',
      'early',
      'late',
    ]);
  });
});
