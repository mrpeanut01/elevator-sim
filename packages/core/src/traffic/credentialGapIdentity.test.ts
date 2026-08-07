/**
 * **A building with no access zones is byte-identical at every credential-gap share.**
 *
 * `dayStartIdentity.test.ts`'s shape, pointed at [§ D265](../../../../DECISIONS.md)'s knob instead
 * of at § D244's hour, and it exists for the reason that file exists: the claim *"this only
 * touches buildings that declare `accessZones`"* is an argument about which code paths are
 * reachable, and an argument is not a run.
 *
 * ## What is being claimed, in three parts
 *
 * 1. **The trace.** Three of the eight shipped buildings — `chancery-house`, `garden-apartments`
 *    and `midtown-office` — declare no `accessZones`. Their passenger traces must be identical at
 *    `wrongZoneShare` 0, at the shipped share, and at 1: same people, same times, same masses, same
 *    (absent) credentials, byte for byte.
 * 2. **The run.** So must the whole `runSimulation` result, which is the stronger claim: a trace
 *    that matched while the *run* diverged would mean the refusal path was reachable without the
 *    generator putting anybody in the gap.
 * 3. **And it is not vacuous.** The same comparison on the five buildings that *do* declare zones
 *    must **differ** at those three shares — otherwise this file would pass just as happily against
 *    a knob nothing reads, which is precisely the dead seam this repository counts.
 *
 * ## Why the `credential` stream is drawn from anyway
 *
 * It is, on every run, once per passenger, including on the three buildings below — see
 * `random/streams.ts` § `credential` for why the draw is unconditional. That is the point of the
 * file rather than an exception to it: streams are independent by construction, so consuming from
 * one leaves every other exactly where it was. This is that guarantee observed at the level a
 * reader cares about — the trace — rather than at the level `streams.test.ts` proves it at.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { runSimulation } from '../sim/simulation.js';

import { generateTrace } from './generator.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const SEED = 20_260_805n;

/** The three shipped buildings that declare no access zones. Derived from disk, never listed. */
let unzoned: readonly string[];
/** The five that do. The control on the control. */
let zoned: readonly string[];

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const ids = [...config.buildingsById.keys()].sort();
  unzoned = ids.filter((id) => (config.buildingsById.get(id)?.accessZones ?? []).length === 0);
  zoned = ids.filter((id) => (config.buildingsById.get(id)?.accessZones ?? []).length > 0);
}, 120_000);

/** The shares compared: the control arm, the shipped value, and the degenerate upper end. */
const SHARES = [0, 1] as const;

function traceJson(buildingId: string, share: number | undefined, seed: bigint = SEED): string {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  return JSON.stringify(
    generateTrace({
      building,
      profiles: config.trafficProfiles,
      streams: new StreamSet(seed),
      ...(share === undefined ? {} : { credentialGap: { wrongZoneShare: share } }),
    }),
  );
}

function runJson(buildingId: string, share: number | undefined, seed: bigint = SEED): string {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error('no collective profile');
  return JSON.stringify(
    runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: Number(seed),
      onTimeout: 'report',
      ...(share === undefined ? {} : { demand: { credentialGap: { wrongZoneShare: share } } }),
    }),
  );
}

describe('a building with no access zones is byte-identical at every share', () => {
  it('names the three buildings from disk rather than from a list', () => {
    // Derived, so a ninth building that declares no zones joins this guard by existing — the
    // hand-written-list defect § D152 closed, applied to a fixture set.
    expect(unzoned).toEqual(['chancery-house', 'garden-apartments', 'midtown-office']);
    expect(zoned.length).toBe(5);
  });

  it('draws exactly the same passengers, byte for byte', () => {
    for (const buildingId of unzoned) {
      const shipped = traceJson(buildingId, undefined);
      for (const share of SHARES) {
        expect(traceJson(buildingId, share), `${buildingId} at ${String(share)}`).toBe(shipped);
      }
    }
  }, 120_000);

  it('produces exactly the same run, byte for byte', () => {
    for (const buildingId of unzoned) {
      const shipped = runJson(buildingId, undefined);
      for (const share of SHARES) {
        expect(runJson(buildingId, share), `${buildingId} at ${String(share)}`).toBe(shipped);
      }
    }
  }, 300_000);

  it('carries no credential at all on any of them, at any share', () => {
    // The mechanism behind the identity above, stated separately so a failure says *why*: with no
    // zone anywhere, `credentialForRoute` answers `undefined` and there is no gap to be in.
    for (const buildingId of unzoned) {
      for (const share of [undefined, ...SHARES]) {
        const building = config.buildingsById.get(buildingId);
        if (building === undefined) throw new Error(`no building "${buildingId}"`);
        const trace = generateTrace({
          building,
          profiles: config.trafficProfiles,
          streams: new StreamSet(SEED),
          ...(share === undefined ? {} : { credentialGap: { wrongZoneShare: share } }),
        });
        expect(
          trace.passengers.some((passenger) => passenger.credentialGroup !== undefined),
          `${buildingId} at ${String(share)}`,
        ).toBe(false);
      }
    }
  }, 120_000);
});

/**
 * The seed each zoned building is shown to move at, and `crown-hotel` is the reason this is a
 * table rather than one constant.
 *
 * Four of the five move at {@link SEED}. `crown-hotel` does not, and the reason is a **measured
 * fact about the building** rather than a flaw in the knob: its only access zone is `back-of-house`
 * over the single floor `B1`, so the population the gap draws from — journeys that begin inside the
 * building and end inside a zone the traveller's own floor does not reach — is one or two people
 * per run and is sometimes nobody. Censused at `wrongZoneShare: 1`, which is every candidate there
 * can be, over six seeds: **0, 1, 2, 1, 4, 6**. Seed 20 260 805 is the zero.
 *
 * So it is pinned at a seed where the building does produce somebody, and the zero is written down
 * rather than hidden by a `.some()`. A guard that swept seeds until one moved would pass on a
 * building where the knob had stopped working entirely.
 */
const NON_INERT_SEEDS: Readonly<Record<string, bigint>> = {
  'crown-hotel': 20_260_731n,
  'mixed-use-high-rise': SEED,
  'secure-tower': SEED,
  'st-jude-hospital': SEED,
  'vertical-city': SEED,
};

describe('and the knob is not inert, which is what makes the identity above worth having', () => {
  it('covers every zoned building, derived from disk', () => {
    expect([...zoned].sort()).toEqual(Object.keys(NON_INERT_SEEDS).sort());
  });

  it('moves the trace on every building that declares a zone', () => {
    for (const buildingId of zoned) {
      const seed = NON_INERT_SEEDS[buildingId];
      if (seed === undefined) throw new Error(`no seed pinned for ${buildingId}`);
      expect(traceJson(buildingId, 1, seed), buildingId).not.toBe(traceJson(buildingId, 0, seed));
    }
  }, 120_000);

  it('moves the run on every building that declares a zone', () => {
    for (const buildingId of zoned) {
      const seed = NON_INERT_SEEDS[buildingId];
      if (seed === undefined) throw new Error(`no seed pinned for ${buildingId}`);
      expect(runJson(buildingId, 1, seed), buildingId).not.toBe(runJson(buildingId, 0, seed));
    }
  }, 300_000);
});
