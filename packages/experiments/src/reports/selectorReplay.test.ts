/**
 * **A selecting dispatcher, stored and replayed.** Invariant 5 under a weight vector that moves.
 *
 * `replay.test.ts` establishes that a stored run replays byte for byte; every run it stores holds
 * one weight vector for its whole life. T53 made the weight-set selector reachable from a shipped
 * command, which puts a *second* thing in the class of "changes the outcome and must therefore be
 * in the record": the `selection` stage, and the arms it selects among.
 *
 * The two are stored differently and deliberately so:
 *
 * | what | how it survives | why |
 * |---|---|---|
 * | `selection`, as a profile authors it | re-read from `data/dispatcher-profiles.json` with the profile | it *is* the profile |
 * | `selection`, as `dispatcherOptions` overrides it | stored on the envelope, six scalars | it exists nowhere else |
 * | the **arms** | derived on replay from `ReplaySources.dispatcherProfiles` | they are a function of the same file |
 * | a hand-built `weightSets` library | **refused at store time** | it has no reference into `data/`, so nothing can rebuild it |
 *
 * The last row is the one worth arguing about. Dropping it silently — which is what
 * `dispatcherOptionsOf` did before this lane, invisibly, because nothing could turn the selector
 * on — produces a record that replays a *different dispatcher* and reports the difference as a
 * determinism failure. A refusal at the point the record is written is the same argument
 * `createStoredRun` already makes about a summary that does not re-derive.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  runSimulation,
  type DispatcherProfile,
  type LoadedConfig,
  type SimulationConfig,
} from '@elevator-sim/core';

import { load } from './fixtures.test-helper.js';
import { createStoredRun, parseStoredRun, serializeStoredRun } from './persistence.js';
import { replaySourcesFrom, replayStoredRun, type ReplaySources } from './replay.js';
import { ReportsError } from './types.js';

const BUILDING_ID = 'midtown-office';
const BASE_PROFILE_ID = 'collective';
/** The derived profile's id. Distinct, so a replay resolves *it* and not the shipped one. */
const SELECTING_ID = 'collective-selecting';
const SEED = 20260728;

let config: LoadedConfig;
let baseProfile: DispatcherProfile;
let selecting: DispatcherProfile;
let sources: ReplaySources;

beforeAll(async () => {
  config = await load();
  const found = config.dispatcherProfilesById.get(BASE_PROFILE_ID);
  if (found === undefined) throw new Error(`no dispatcher profile "${BASE_PROFILE_ID}"`);
  baseProfile = found;
  // A derived profile, in the manner of `destination-eta-unpriced`: no shipped profile opts into a
  // selector, and this lane is not the one that earns it one.
  selecting = Object.freeze({
    ...baseProfile,
    id: SELECTING_ID,
    selection: { policy: 'fuzzy' as const },
  });
  sources = Object.freeze({
    ...replaySourcesFrom(config),
    dispatcherProfilesById: new Map(config.dispatcherProfilesById).set(SELECTING_ID, selecting),
  });
});

function configFor(profile: DispatcherProfile, overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const building = config.buildingsById.get(BUILDING_ID);
  if (building === undefined) throw new Error(`no building "${BUILDING_ID}"`);
  return {
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    // The file the arms come from. Absent it, a selecting profile is refused rather than run.
    dispatcherProfiles: config.dispatcherProfiles,
    seed: SEED,
    // 900 s over the full run: long enough for the observation window to fill and the detector to
    // decide, short enough to store and replay a real record four times in one suite.
    durationS: 900,
    reportWindow: 'full-run',
    onTimeout: 'report',
    ...overrides,
  };
}

describe('a selecting dispatcher is stored completely enough to replay', () => {
  it('is a different run from the profile it was derived from', () => {
    // Otherwise everything below would be true of a selector that did nothing.
    const off = runSimulation(configFor(baseProfile));
    const on = runSimulation(configFor(selecting));
    expect(JSON.stringify(on.record.travelSamples)).not.toBe(
      JSON.stringify(off.record.travelSamples),
    );
  }, 60_000);

  it('replays byte for byte after a trip through JSON', () => {
    const simConfig = configFor(selecting);
    const stored = parseStoredRun(
      serializeStoredRun(
        createStoredRun({
          experimentId: 'selector-replay',
          experimentSeed: SEED,
          replication: 0,
          config: simConfig,
          result: runSimulation(simConfig),
        }),
      ),
    );
    const outcome = replayStoredRun(stored, sources);
    expect(outcome.differences).toEqual([]);
    expect(outcome.identical).toBe(true);
    expect(outcome.summaryMatches).toBe(true);
  }, 60_000);

  it('refuses to replay when the sources cannot supply the arms', () => {
    // Not a silent fallback to the profile's own weights: that replay would succeed and mean
    // nothing, which is the argument `usesElevatorSpecs` makes about LOAD_SENSOR_DEFAULTS.
    const simConfig = configFor(selecting);
    const stored = createStoredRun({
      experimentId: 'selector-replay',
      experimentSeed: SEED,
      replication: 0,
      config: simConfig,
      result: runSimulation(simConfig),
    });
    const { dispatcherProfiles: _absent, ...withoutLibrary } = sources;
    expect(() => replayStoredRun(stored, withoutLibrary)).toThrow(
      /patternSwitching library was supplied/,
    );
  }, 60_000);

  it('round-trips a selection stage supplied as a dispatcherOptions override', () => {
    // The override half. `dispatcherOptionsOf` dropped this field silently until T53, which was
    // invisible while nothing could switch the selector on and an invariant-5 hole the moment
    // something could.
    const simConfig = configFor(baseProfile, {
      dispatcherOptions: { selection: { policy: 'fuzzy', hysteresisS: 60 } },
    });
    const stored = parseStoredRun(
      serializeStoredRun(
        createStoredRun({
          experimentId: 'selector-replay',
          experimentSeed: SEED,
          replication: 0,
          config: simConfig,
          result: runSimulation(simConfig),
        }),
      ),
    );
    expect(stored.config.dispatcherOptions?.selection).toEqual({
      policy: 'fuzzy',
      hysteresisS: 60,
    });
    expect(replayStoredRun(stored, sources).identical).toBe(true);
  }, 60_000);

  it('refuses to store a run whose weight-set library was handed in by hand', () => {
    const library = {
      patternSwitching: config.dispatcherProfiles.patternSwitching!,
      weightsByProfileId: new Map([['eta', new Map([['waitTime', 1]])]]),
    };
    const simConfig = configFor(baseProfile);
    const result = runSimulation(simConfig);
    expect(() =>
      createStoredRun({
        experimentId: 'selector-replay',
        experimentSeed: SEED,
        replication: 0,
        config: { ...simConfig, dispatcherOptions: { weightSets: library } },
        result,
      }),
    ).toThrow(ReportsError);
  }, 60_000);
});
