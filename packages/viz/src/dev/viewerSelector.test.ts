/**
 * **The weight-set selector, reached from the browser viewer.**
 *
 * [`DECISIONS.md`](../../../../DECISIONS.md) § D153 wired the selector into `elevator-sim run`,
 * `compare` and `tune`, and closed with a known limitation stated rather than absorbed:
 *
 * > *"the browser viewer still cannot enable one — `viz/src/dev/data.ts` bundles only the profile
 * > array and never the file-level block, so a selecting profile is refused there by name."*
 *
 * This file is that limitation's acceptance evidence, and it is written the way
 * `cli/src/commands/run.selector.test.ts` is written, deliberately: **nothing here hands the
 * simulator a hand-built resource bundle.** Every test drives `loadBrowserResources` — the
 * function `dev/main.ts` boots with — over the real `data/` directory through a `fetch` stub that
 * answers exactly what the Vite dev server answers, and then goes through `shiftRunConfigOf`,
 * which is the function `main.ts`'s `runShift` calls. A hand-built bundle is precisely what was
 * already possible before this lane, and asserting one would be
 * [§ D159](../../../../DECISIONS.md)'s *fixture routing the test past its subject*.
 *
 * It originally went through `viewerRunConfig` (`dev/runConfig.ts`), the run builder the shift
 * rebuild superseded — so the § D153 seam was being vouched for on a function no shipped path
 * called, which is § D159's shape one file up. The fifth dead-code audit caught it
 * ([§ D192](../../../../DECISIONS.md)); `viewerRunConfig` is deleted and this file now asserts
 * the seam on the builder the **Run** button reaches.
 *
 * ## The claims, and what a failure of each would mean
 *
 * | claim | what a failure would mean |
 * |---|---|
 * | the viewer's loader carries the file-level `patternSwitching` block | the seam is still open: `main.ts` has nothing to pass |
 * | no shipped profile opts in | the viewer's default changed, and every figure the viewer draws is now of a different dispatcher |
 * | default-off is **byte-identical** to a config that never carried the file | closing the seam cost a number on screen |
 * | a profile that opts in changes the run, and permuting the arm map changes it *again* | the file is read and the arms are not — the same defect one level down |
 * | the batch and campaign paths carry it too | one of the viewer's three run paths would refuse a profile the other two run |
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Simulation, type DispatcherProfiles, type SimulationConfig } from '@elevator-sim/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import type { BatchRequest } from '../batch/types.js';
import { demonstrationConfigFor } from '../campaign/stageRun.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

import { loadBrowserResources, type BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, type ViewerState } from './state.js';

/* -------------------------------------------------------------------------- *
 * The dev server, as a fetch stub
 * -------------------------------------------------------------------------- */

/**
 * Answer the four requests `loadBrowserResources` makes, from `data/` on disk.
 *
 * The three top-level files are served by name and `/__buildings.json` is the manifest
 * `packages/viz/vite.config.ts` synthesises, in the same shape — `{ files: [{ name, data }] }`,
 * sorted. Written against that plugin rather than against the loader, so this stub is a statement
 * about the server the viewer actually runs behind.
 *
 * `edit` is applied to `dispatcher-profiles.json` after parsing, which is the one thing a reader
 * opting into a selector would do: change the data file and reload the page.
 */
function serveData(edit?: (file: Record<string, unknown>) => void): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const path = String(input);
    const json = async (value: unknown): Promise<Response> =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    if (path === '/__buildings.json') {
      const dir = join(DATA_DIR, 'buildings');
      const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
      const files = await Promise.all(
        names.map(async (name) => ({
          name,
          data: JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown,
        })),
      );
      return json({ files });
    }

    const file = JSON.parse(await readFile(join(DATA_DIR, path.slice(1)), 'utf8')) as Record<
      string,
      unknown
    >;
    if (path === '/dispatcher-profiles.json' && edit !== undefined) edit(file);
    return json(file);
  }) as typeof globalThis.fetch;
}

type ProfilesFile = {
  profiles: { id: string; selection?: unknown }[];
  patternSwitching?: { weightSetsByPattern: Record<string, string> } | undefined;
};

/** Load the viewer's resources exactly as the page does, over a `data/` the caller may edit. */
async function loadAs(edit?: (file: ProfilesFile) => void): Promise<BrowserResources> {
  const real = globalThis.fetch;
  globalThis.fetch = serveData(edit as ((file: Record<string, unknown>) => void) | undefined);
  try {
    return await loadBrowserResources();
  } finally {
    globalThis.fetch = real;
  }
}

/** The profile put under a selector. Its own weights differ from every arm's, so a switch shows. */
const OPTED_IN = 'collective';

/** Opt `collective` into the fuzzy selector — six scalars of data and not a line of code. */
function optIn(file: ProfilesFile): void {
  const profile = file.profiles.find((entry) => entry.id === OPTED_IN);
  expect(profile, `data/dispatcher-profiles.json has no profile "${OPTED_IN}"`).toBeDefined();
  profile!.selection = { policy: 'fuzzy' };
}

/** Midtown Office, 900 s, the operating point § D153 measured this contrast at. */
const SEED = 20_260_729n;
const DURATION_S = 900;

function configFrom(resources: BrowserResources, profileId = OPTED_IN): SimulationConfig {
  const state: ViewerState = {
    ...initialState(resources, SEED),
    buildingId: 'midtown-office',
    dispatcherId: profileId,
    shiftLengthS: DURATION_S,
    seed: SEED,
  };
  const plan = shiftRunConfigOf(resources, state);
  // The operating point must stay the plain building at its shipped demand. Day 1 of a fresh
  // week is the `ordinary` event, which changes nothing — asserted rather than assumed, so a
  // reordered event schedule cannot silently move this file's operating point off § D153's.
  expect(plan.event.effect.changesNothing).toBe(true);
  expect(plan.withheld).toEqual([]);
  return plan.config;
}

/**
 * Where the **cars** went, as a sequence.
 *
 * `metrics/types.ts`: *"Passenger records say where passengers went; they cannot say where the
 * cars went."* A mean is the statistic that hides a structural difference, so the liveness
 * contrasts below compare trajectories and not AWT.
 */
function trajectoryOf(config: SimulationConfig): readonly string[] {
  const { record } = new Simulation(config).run();
  const samples = record.travelSamples ?? [];
  expect(samples.length, 'the run recorded no car movement at all').toBeGreaterThan(0);
  return samples.map(
    (sample) =>
      `${sample.carId}@${sample.at.toFixed(6)}:${sample.direction}:${sample.distanceM.toFixed(6)}`,
  );
}

/** The whole record, canonically, for a byte-identity claim rather than a similarity one. */
function recordTextOf(config: SimulationConfig): string {
  return JSON.stringify(new Simulation(config).run().record);
}

describe('the browser viewer can enable a weight-set selector', () => {
  let shipped: BrowserResources;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    shipped = await loadAs();
  }, 120_000);

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('bundles the whole dispatcher-profiles file, not just its profiles array', () => {
    // The seam itself: `loadBrowserResources` → `BrowserResources.dispatcherProfiles` →
    // `shiftRunConfigOf` → `SimulationConfig.dispatcherProfiles` → `Simulation` →
    // `weightSetSourceFrom` → `resolveWeightSets` → `selectWeightSet`.
    const file: DispatcherProfiles = shipped.dispatcherProfiles;
    expect(file.patternSwitching).toBeDefined();
    expect(file.profiles.length).toBeGreaterThan(0);
    expect(configFrom(shipped).dispatcherProfiles).toBe(file);
  });

  it('leaves every profile the viewer offers with the selector off', () => {
    // Nothing is switched on. Asserted against the file the *viewer* loaded, not against
    // `loadConfig`'s — they read the same bytes, and this is the copy the page would run.
    for (const profile of shipped.dispatcherProfiles.profiles) {
      expect(profile.selection?.policy ?? 'off', `profile "${profile.id}"`).toBe('off');
    }
    expect(shipped.dispatcherProfiles.profiles).toHaveLength(12);
  });

  it('is byte-identical to a configuration that never carried the file', () => {
    // Criterion: closing the seam must cost nothing while nothing opts in. Not "the same to four
    // decimal places" — the same record.
    const carried = configFrom(shipped);
    // Asserted first, because without it this test passes vacuously the day the field goes away:
    // `asBefore` would be `carried`, and "the same record" would be a tautology.
    expect(carried.dispatcherProfiles).toBeDefined();
    const { dispatcherProfiles: _omitted, ...asBefore } = carried;
    expect(recordTextOf(carried)).toBe(recordTextOf(asBefore));
  }, 180_000);

  it('honours a profile that opts in, with only the data file changed', async () => {
    const selecting = await loadAs(optIn);
    const config = configFrom(selecting);
    expect(config.dispatcherProfile.selection?.policy).toBe('fuzzy');
    expect(trajectoryOf(config)).not.toStrictEqual(trajectoryOf(configFrom(shipped)));
  }, 240_000);

  it('selects among the arms the file names, rather than one fixed vector', async () => {
    // Two loads differing **only** in `weightSetsByPattern`, one seed, different car trajectories.
    // Without this, "turning it on changed the run" is satisfied by a selector that reads the
    // block and always picks the same arm.
    const base = configFrom(await loadAs(optIn));
    const permuted = configFrom(
      await loadAs((file) => {
        optIn(file);
        const map = file.patternSwitching?.weightSetsByPattern;
        expect(map?.['two-way']).toBe('predictive-balanced');
        map!['two-way'] = 'nearest-car';
      }),
    );
    expect(trajectoryOf(permuted)).not.toStrictEqual(trajectoryOf(base));
  }, 300_000);

  it('refuses a selecting profile whose file authors no arms, rather than running without them', async () => {
    // The failure the seam's *closed* state must keep: a dispatcher that declares it switches
    // weight sets, finds none, and quietly runs its own.
    const resources = await loadAs((file) => {
      optIn(file);
      delete file.patternSwitching;
    });
    expect(() => new Simulation(configFrom(resources)).run()).toThrow(
      /patternSwitching library was supplied/,
    );
  }, 180_000);
});

describe('the viewer’s other two run paths carry the file as well', () => {
  let shipped: BrowserResources;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    shipped = await loadAs();
  }, 120_000);

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  /**
   * Why these are here and not left to a later lane.
   *
   * The viewer runs a simulation from three places — **Run** (`dev/main.ts`), the Compare tab's
   * batch (`batch/runBatch.ts`, via `dev/batchWorker.ts`) and the Campaign tab's demonstration
   * replay (`campaign/stageRun.ts`). A profile that runs under one and is refused by name under
   * the other two is worse than one uniformly refused: the reader would have a dispatcher that
   * works on the picture and not on the measurement.
   */
  it('runs a batch whose arms opt in, and refuses one whose file authors no arms', async () => {
    const request: BatchRequest = {
      buildingId: 'midtown-office',
      seed: '20260729',
      durationS: 400,
      replications: 1,
      arms: [
        { armId: 'baseline', dispatcherProfileId: 'eta' },
        { armId: 'candidate', dispatcherProfileId: OPTED_IN },
      ],
      arrivalRatePctPop5min: null,
    };
    const building = shipped.buildings.find((candidate) => candidate.id === 'midtown-office')!;

    const selecting = await loadAs(optIn);
    const result = runBatch(request, {
      building,
      dispatcherProfiles: selecting.dispatcherProfiles,
      trafficProfiles: selecting.trafficProfiles,
      elevatorSpecs: selecting.elevatorSpecs,
    });
    expect(result.arms).toHaveLength(2);

    const armless = await loadAs((file) => {
      optIn(file);
      delete file.patternSwitching;
    });
    expect(() =>
      runBatch(request, {
        building,
        dispatcherProfiles: armless.dispatcherProfiles,
        trafficProfiles: armless.trafficProfiles,
        elevatorSpecs: armless.elevatorSpecs,
      }),
    ).toThrow(/patternSwitching library was supplied/);
  }, 300_000);

  it('replays a campaign demonstration with the file attached', () => {
    const stage = {
      durationS: 300,
      seeds: { seed: '20260729' },
      traffic: { arrivalRatePctPop5min: null },
    } as unknown as Parameters<typeof demonstrationConfigFor>[0]['stage'];
    const config = demonstrationConfigFor({
      stage,
      building: shipped.buildings.find((candidate) => candidate.id === 'midtown-office')!,
      dispatcherProfile: shipped.dispatcherProfiles.profiles.find((p) => p.id === OPTED_IN)!,
      trafficProfiles: shipped.trafficProfiles,
      elevatorSpecs: shipped.elevatorSpecs,
      dispatcherProfiles: shipped.dispatcherProfiles,
    });
    expect(config.dispatcherProfiles).toBe(shipped.dispatcherProfiles);
  });
});
