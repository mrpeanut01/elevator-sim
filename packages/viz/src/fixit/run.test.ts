/**
 * **A case's two runs survive the crossing to a worker** — GitHub issue #165's determinism half.
 *
 * Both Fix-a-building shells post their configs to `dev/shiftWorker.ts` through
 * `dev/offThreadRuns.ts`, which means every `SimulationConfig` `fixitRunPlanOf` builds is
 * `structuredClone`d twice — once by `postMessage` out and once by the reply coming back. CLAUDE.md
 * invariant 5 is that a run replays exactly from its seed; a transport that quietly dropped a field
 * would still produce a run, and **only the legs would say so**.
 *
 * `record/recordRun.test.ts` asserts this for its own fixture config. That is not enough for this
 * surface, and the reason is specific rather than cautious: a fixit config is not the fixture's. It
 * is built by re-parsing a **patched authored document** through `parseBuilding` + `resolveBuilding`
 * (`fixit/run.ts#configOf`), over eighteen cases on six towers — including a double-deck bank, a
 * building with access zones and one with service events. Those are exactly the shapes that carry
 * `Map`s and `bigint`s, which are what a clone has to get right and what JSON does not.
 *
 * So the assertion is made **per shipped case**, on both arms, and compared **on the legs** first
 * (§ D177: a mean can be unchanged for a run that is entirely different).
 *
 * ## The lossy transport is run beside it and required to fail
 *
 * `record/recordRun.test.ts`'s rule, kept: a test that only asserted *structured clone works* would
 * pass just as happily against a transport that did not. `JSON` is the obvious way to move an
 * object between threads and it is lossy here in two ways at once — it throws on the `bigint` seed,
 * and it writes `ResolvedBuilding`'s `Map` indexes as `{}`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { recordRun, type RecordedRun } from '../record/recordRun.js';

import { emptyFixitState, toggleRepair } from './engine.js';
import { parseFixitCases } from './parse.js';
import { fixitRunPlanOf, type FixitResources } from './run.js';
import type { FixitCase, FixitState } from './types.js';

const TIMEOUT_MS = 300_000;
const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

/** The loaded `data/`, in `FixitResources`' shape — `fixit/cases.test.ts`'s loader, same doors. */
function resourcesFromDisk(): FixitResources {
  const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
  const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const names = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const entries = names.map((name) => {
    const config = parseBuilding(dataFile(join('buildings', name)), name);
    return {
      config,
      resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
    };
  });
  return {
    entries,
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(dataFile('dispatcher-profiles.json')),
    trafficProfileIds,
  };
}

let resources: FixitResources;
let cases: readonly FixitCase[];

beforeAll(() => {
  resources = resourcesFromDisk();
  cases = parseFixitCases(dataFile('fixit-cases.json'), {
    floorIdsByBuilding: new Map(
      resources.entries.map((entry) => [
        entry.resolved.id,
        entry.resolved.floors.map((floor) => floor.id),
      ]),
    ),
    profileIds: new Set(resources.dispatcherProfiles.profiles.map((profile) => profile.id)),
    engineIds: [
      ...resources.entries.map((entry) => entry.resolved.id),
      ...resources.dispatcherProfiles.profiles.map((profile) => profile.id),
    ],
  }).cases;
}, TIMEOUT_MS);

/** The state a player presses `Run the day` in, so the as-repaired arm is a real second config. */
function diagnosedState(entry: FixitCase): FixitState {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  return diagnosed === undefined
    ? emptyFixitState()
    : toggleRepair(entry, emptyFixitState(), diagnosed.id);
}

/** Boarding identity — the legs, never a window statistic. `fixit/cases.test.ts`'s own key. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('a fixit case’s runs survive being posted to a worker', () => {
  it(
    'is byte-identical on both arms of every shipped case, compared on the legs first',
    () => {
      expect(cases.length).toBeGreaterThan(0);
      for (const entry of cases) {
        const plan = fixitRunPlanOf(entry, diagnosedState(entry), resources);
        for (const [arm, config] of [
          ['asBuilt', plan.asBuilt],
          ['asRepaired', plan.asRepaired],
        ] as const) {
          const direct = recordRun(config, { recordDecisions: false });
          const cloned = recordRun(structuredClone(config), { recordDecisions: false });
          expect(legsKey(cloned), `${entry.id}/${arm}: the legs moved`).toBe(legsKey(direct));
          expect(
            JSON.stringify(cloned.recording),
            `${entry.id}/${arm}: the recording moved`,
          ).toBe(JSON.stringify(direct.recording));
          // Invariant 5, held across the boundary: the seed is what a replay is.
          expect(cloned.recording.seed).toBe(direct.recording.seed);
        }
      }
    },
    TIMEOUT_MS,
  );

  it('would not survive a JSON transport, which is why the clone is the one asserted', () => {
    const entry = cases[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const { asBuilt } = fixitRunPlanOf(entry, diagnosedState(entry), resources);

    // The loud half: `fixit/run.ts#configOf` writes `seed: BigInt(entry.run.seed)`, and
    // `JSON.stringify` refuses a bigint rather than rounding it.
    expect(() => JSON.stringify(asBuilt)).toThrow(TypeError);

    // The quiet half, and the one that would have shipped: `resolveBuilding` returns `Map`
    // indexes, and JSON writes a `Map` as `{}`. A worker handed that would report a simulation
    // error rather than a different run — nothing in the shape says so, which is the point.
    const viaJson = JSON.parse(JSON.stringify(asBuilt.building.floorsById)) as Record<
      string,
      unknown
    >;
    expect(asBuilt.building.floorsById.size).toBeGreaterThan(0);
    expect(Object.keys(viaJson)).toEqual([]);
    expect(structuredClone(asBuilt.building.floorsById).size).toBe(
      asBuilt.building.floorsById.size,
    );
  });
});
