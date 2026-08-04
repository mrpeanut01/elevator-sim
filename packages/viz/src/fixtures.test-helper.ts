/**
 * Shared fixtures for the `viz` tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper
 * named this way is imported by tests but never collected as a suite of its own.
 *
 * The real `data/` directory is loaded rather than mocked, for the reason `core`'s own fixtures
 * give: the claim under test is that the viewer renders the buildings the project ships, and a
 * fixture building would prove that a fixture building renders.
 */

import { fileURLToPath } from 'node:url';

import {
  resolveDoorConfig,
  type DispatcherProfile,
  type DoorConfig,
  type LoadedConfig,
  type ResolvedBuilding,
  type SimulationConfig,
} from '@elevator-sim/core';

import type { VizSummary } from './contract/types.js';

/**
 * Door timings for the synthetic buildings the unit tests draw.
 *
 * Built through `resolveDoorConfig` rather than written out as a literal, so a new field on
 * `DoorConfig` cannot leave the fixtures describing a door the physics module no longer
 * recognises — the fixture would simply pick up the default.
 */
export const FIXTURE_DOOR_CONFIG: DoorConfig = resolveDoorConfig({
  doorOpenS: 2,
  doorCloseS: 3,
  dwellCarCallS: 3,
  dwellHallCallS: 5,
});

/** The repository's `data/` directory. */
export const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

/**
 * The smallest shipped building, so a suite that runs several replications stays quick.
 *
 * Garden Apartments: a handful of floors and two cars, which is enough to exercise every part
 * of the contract (two shafts, both directions of landing call, doors, occupancy) without
 * paying for a tower.
 *
 * **It is not enough on its own, and the reason is recorded here so nobody re-pins to it.** Its
 * two cars start where they end, so the recorder's start-position defect — cars described at
 * their *final* floor and height, and therefore drawn there until their first commanded move —
 * was invisible on this building and on no other. Breadth-first suites iterate
 * {@link BUILDING_IDS}; this constant is only for the assertions that genuinely need one run.
 */
export const FIXTURE_BUILDING_ID = 'garden-apartments';
export const FIXTURE_DISPATCHER_ID = 'eta';

/**
 * The shipped Phase 6b profile — `mobile-credential` + `passengerAssignment: 'panel'`.
 *
 * The **shipped** one out of `data/dispatcher-profiles.json`, not a profile derived in a test.
 * A Level-1 suite built on a locally-patched profile would prove that a locally-patched profile
 * renders; the claim this package makes is about the run a reader can actually produce from the
 * viewer's dispatcher dropdown, and that list is `data/`.
 */
export const PANEL_DISPATCHER_ID = 'destination-panel';

/**
 * Every building the project ships, in load order — the same list `core`'s `sim/seam.test.ts`
 * iterates, kept here rather than imported because a test helper is not part of `core`'s
 * published surface.
 *
 * Pinned rather than derived so that adding a building to `data/buildings/` is a **deliberate**
 * act with a visible diff. `recordRun.test.ts`'s *the fixture list covers every building the
 * project ships* compares this list with {@link shippedBuildingIds} and fails when they
 * disagree, so a new building cannot arrive without the breadth suites covering it.
 */
export const BUILDING_IDS = [
  'chancery-house',
  'crown-hotel',
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'st-jude-hospital',
  'vertical-city',
] as const;

/**
 * The ids `loadConfig` actually found, sorted — for the guard that keeps {@link BUILDING_IDS}
 * honest.
 */
export function shippedBuildingIds(config: LoadedConfig): readonly string[] {
  return [...config.buildingsById.keys()].sort((a, b) => a.localeCompare(b));
}

/**
 * A duration short enough to run five buildings in one suite, long enough that cars leave their
 * start floors, doors cycle and landings queue. Breadth beats length here: the defect this
 * parameterisation exists to catch shows up in the first frame.
 *
 * It cannot go much below this. The CIBSE rise-and-fall template holds its peak for 300 s and
 * `riseAndFallTemplate` refuses a run shorter than its own hold rather than silently clipping
 * the peak; and the shorter the window, the more of each tall building's peak is still queued
 * when it closes. 900 s is what `src/dev/main.ts` runs, so the suites measure the recording the
 * viewer actually produces. Three of the five buildings still end that window with people in
 * the system — see {@link FixtureOptions.onTimeout} for why that is reported rather than fatal.
 */
export const BREADTH_DURATION_S = 900;

/** A short horizon. Long enough that cars move and queues form; short enough to run in a test. */
export const FIXTURE_DURATION_S = 600;

/** A fixed seed, so every assertion in the suite is about the same run. */
export const FIXTURE_SEED = 20_260_727n;

export interface FixtureOptions {
  readonly seed?: bigint;
  readonly buildingId?: string;
  readonly dispatcherId?: string;
  readonly durationS?: number;
  /**
   * `'throw'` (the kernel's default) or `'report'`.
   *
   * The breadth suites pass `'report'`, and the reason is worth stating rather than leaving as a
   * flag. At the shipped traffic profiles' own rates, Mixed-Use High-Rise, Secure Tower and
   * Vertical City routinely end a 900 s run with people still in the system, and `Simulation`
   * treats that as a *failed run* — correctly, because a mean over a system that never cleared
   * is exactly the confident nonsense this project exists to avoid. But a **picture** of such a
   * run is still meaningful and still has to be right: it is the `timed-out` state UX.md RV-16
   * describes. `'report'` is how a viewer gets the recording it must be able to draw; nothing
   * about the statistics changes, and `VizSummary.awtIsValid` still carries the suppression.
   */
  readonly onTimeout?: 'throw' | 'report';
}

/**
 * A schema-version-5 {@link VizSummary}, for the suites that build a synthetic recording.
 *
 * Written here rather than inline in four test files, and the reason is the change that created
 * it: `docs/10` § 11 W2 added eleven fields to `VizSummary` in one commit, and four suites held
 * a hand-written literal that then failed to compile. A helper means the twelfth field is one
 * edit, and — more importantly — means a suite cannot quietly keep an *old* summary shape by
 * spreading a stale literal.
 *
 * The defaults describe a small, healthy, fully-measured run: nothing suppressed, energy
 * recorded, an interval reconstructed. A test that wants a refusal overrides the field that
 * causes it, which is the direction that makes the override visible in the diff.
 */
export function fixtureSummary(overrides: Partial<VizSummary> = {}): VizSummary {
  return {
    saturated: false,
    awtIsValid: true,
    meanWaitS: 12,
    wait95S: 30,
    meanTimeToDestinationS: 40,
    generated: 50,
    delivered: 50,
    undelivered: 0,
    reportWindow: { id: 'peak-5min', startS: 60, endS: 360 },
    windowSeconds: 300,
    waitCount: 44,
    timeToDestinationCount: 40,
    pctOverLongWait: 9,
    longWaitThresholdS: 60,
    unservedCount: 2,
    handlingCapacity: { personsPer5Min: 41, offeredPer5Min: 62, pctPopulationPer5Min: 12.4 },
    achievedInterval: { meanS: 30, coefficientOfVariation: 0.4, count: 11 },
    serviceLevel: {
      verdict: 'served',
      longestWaitS: 88,
      longestWaitIsCensored: false,
      overHorizonCount: 0,
      arrivalCount: 46,
      horizonS: 900,
    },
    energy: {
      measured: true,
      workKJ: 1234.5,
      workPerServedLegKJ: 30.8,
      deliveredLegCount: 40,
      distanceM: 2100,
      starts: 96,
    },
    ...overrides,
  };
}

export function requireBuilding(config: LoadedConfig, id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) {
    throw new Error(`fixture building "${id}" is missing from ${DATA_DIR}.`);
  }
  return building;
}

export function requireDispatcher(config: LoadedConfig, id: string): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(id);
  if (profile === undefined) {
    throw new Error(`fixture dispatcher "${id}" is missing from ${DATA_DIR}.`);
  }
  return profile;
}

/**
 * A complete `SimulationConfig` over the shipped data.
 *
 * Every field a run needs is here, so a caller can vary the seed alone and know that nothing
 * else moved — which is what the replay negative control depends on.
 */
export function fixtureConfig(config: LoadedConfig, options: FixtureOptions = {}): SimulationConfig {
  const building = requireBuilding(config, options.buildingId ?? FIXTURE_BUILDING_ID);
  const profile = requireDispatcher(config, options.dispatcherId ?? FIXTURE_DISPATCHER_ID);
  return {
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: options.seed ?? FIXTURE_SEED,
    durationS: options.durationS ?? FIXTURE_DURATION_S,
    onTimeout: options.onTimeout ?? 'throw',
    runId: 'viz-fixture',
  };
}

/** Every shipped building, recorded over {@link BREADTH_DURATION_S}. See {@link FixtureOptions.onTimeout}. */
export function breadthConfig(
  config: LoadedConfig,
  buildingId: string,
  options: FixtureOptions = {},
): SimulationConfig {
  return fixtureConfig(config, {
    ...options,
    buildingId,
    durationS: options.durationS ?? BREADTH_DURATION_S,
    onTimeout: options.onTimeout ?? 'report',
  });
}
