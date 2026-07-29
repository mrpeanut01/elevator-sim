/**
 * **The opt-in guard.** A building that declares no transport mode must produce the run it
 * produced before transport modes existed — the same trace, the same record, the same summary,
 * the same seconds, bit for bit.
 *
 * ## Why a digest of the whole result and not a handful of means
 *
 * Every softer form of this check can pass while the thing it is guarding is broken. A test that
 * compared AWT would miss a leg boarding a different car; one that compared the record's length
 * would miss a timestamp shifted by a rounding; one that re-ran the same code twice would prove
 * only that the code is deterministic, which was never in question. The question is whether
 * *this* tree reproduces *that* tree, and the only answer is a value taken from that tree.
 *
 * So {@link BASELINE_DIGESTS} was produced by running `d7e8571` — the commit this branch is based
 * on — in a separate git worktree, against `packages/core/dist`, and is pasted here. It is a pin
 * in exactly the sense `experiments/benchmark/published.ts` means: a number this tree must
 * reproduce and did not compute for itself.
 *
 * ## The one field that is excluded, and why excluding it is not a hole
 *
 * `ConservationAudit.transportHops` is new, so a baseline result has no such key and a digest
 * over it could never match. It is deleted before hashing — and asserted to be `0` separately, in
 * the same test. That is the difference between excluding a field and hiding one: if this change
 * ever made a lift-only building take a hop, the exclusion would not conceal it.
 *
 * Nothing else is excluded, and nothing else needed to be: `GeneratedPassenger.transportHops` and
 * `PassengerRecord.egressTransitSeconds` are both **omitted rather than emptied** when they carry
 * nothing, which is what makes the serialized objects identical rather than merely equivalent.
 */

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { BUILDING_IDS, DATA_DIR, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

/**
 * SHA-256 of `JSON.stringify(result)` at `seed: 20260726`, `onTimeout: 'report'`, with
 * `conservation.transportHops` deleted.
 *
 * Produced on baseline `d7e8571` in a detached worktree, not on this tree. `mixed-use-high-rise`
 * needs `onTimeout: 'report'` because `nearest-car` leaves 93 of 757 journeys in the system there
 * — a known property of the weakest shipped dispatcher (`docs/07` § 4), and exactly the kind of
 * run whose bytes are worth pinning.
 */
const BASELINE_DIGESTS: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    'da2cf8d8be8c1d9d9d1e0a58ae1a85c6e412e9ef67b47aa5ace54f1b66df77e3',
  'garden-apartments|eta': 'c60a23308b1d803a8e8597e54928b5d565362b04c1775d5c3ab0b7acae4460e5',
  'garden-apartments|collective': 'c2f909557818a65cc2afcafd6b05799648e360ede33e84f41d7dfc5645a03a80',
  'midtown-office|nearest-car': 'c7b2edee3c1376870355da08734b8265cfff562ba958ba3d662105f02dbf4fdc',
  'midtown-office|eta': 'e25747189958d0c09c7cafe8d9102915a1b9d5e0be39363f7744b3217bcf1e45',
  'midtown-office|collective': 'bd05f5f101ff9c99502c3da2553c7ebddad80e40760f660a75be008de63d15f8',
  'mixed-use-high-rise|nearest-car':
    'eaa3b17b53fc1bf3a3c22ebd8361bb18c555972ba1b5c458c934990056bb818f',
  'mixed-use-high-rise|eta': 'eeb3b3e4584c4f62c028213d1dadf0b253804d8ed082509b6b7643e8acfbe7d3',
  'mixed-use-high-rise|collective':
    'e34efc7812c374e24b3de012fb9ec27cb36d7f779dc14df2511818a7db8b8b2f',
  'secure-tower|nearest-car': '88a0dccaf7151fb3264f7c7442d2f062e6742df6178c29c36b118305624afcd4',
  'secure-tower|eta': '8d0be77a01cf1d6f992831cadfc5bf29cec3ea9af5a1f79cfdd619bed6e209b9',
  'secure-tower|collective': '5a42a40a4503cc15e18833e0357f0cf827d10770bff1374ba1356f6e648f9f62',
};

/**
 * The current digests for the one building that declares a transport mode — `vertical-city` with
 * an escalator at **all four** of its two-level lobbies: `G ↔ 2`, `26 ↔ 27`, `51 ↔ 52`, `76 ↔ 77`.
 *
 * Pinned rather than omitted. The moved figure is the finding, and a guard that simply stopped
 * looking at the building the change was made for would be the fourth entry in this repository's
 * list of tests that cannot fail.
 */
const MOVED_DIGESTS: Readonly<Record<string, string>> = {
  'vertical-city|nearest-car': '77c37f9b186e2e210e610deb6d68e172428e5beb4bf36639f7943dbacf1a0b12',
  'vertical-city|eta': '37d5a747c45a3c3a43f33c50e080deca27fa16c47a562361f50c2e7a901cdf59',
  'vertical-city|collective': 'a91bf06e4b1c708a5b78c6fd78657af71c8bcd69c44fad4dbae546d5923866af',
};

/**
 * The two superseded states of the same building, kept so the guard can say *which* change moved
 * it rather than only *that* it moved.
 *
 * `allLift` is baseline `d7e8571`, before `core` had a transport mode at all. `groundOnly` is the
 * tree that declared the ground-lobby escalator and nothing else — the configuration every
 * `vertical-city` figure published between those two changes was measured under, and the arm
 * `sim/transportHop.test.ts` and `config/doubleDeck.test.ts` still run live.
 */
const VERTICAL_CITY_BEFORE: Readonly<Record<string, { allLift: string; groundOnly: string }>> = {
  'vertical-city|nearest-car': {
    allLift: 'a8f78f82129dcefc6b36d905b500047906b2a9d10358ffcf033607a98ece08f3',
    groundOnly: '788a0199c73089092bb78f863a745364cfee8a4f1cdf2f8ced88b12fb94360ac',
  },
  'vertical-city|eta': {
    allLift: 'f3587fabdc00d41057fe972bdf15c50f96c194e20c2620f41be497964d2147f6',
    groundOnly: '96a55b58dee7fa618242d06cf16dec777a63df3f06fa068c97037dd2535a6c54',
  },
  'vertical-city|collective': {
    allLift: 'd7f3f3bf74d36a72ede1288612e1b3ba173eec69b932d907ccfd724510907cd4',
    groundOnly: '03fe08156be7ec5da7b7f2969fe514660743f6f4e805adcbcbf9334813ef935f',
  },
};

const PROFILES = ['nearest-car', 'eta', 'collective'] as const;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

interface Measured {
  readonly digest: string;
  readonly transportHops: number;
}

function measure(buildingId: string, profileId: string): Measured {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  const result = runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260726,
    onTimeout: 'report',
  });
  const clone = JSON.parse(JSON.stringify(result)) as {
    conservation: { transportHops?: number };
  };
  const transportHops = clone.conservation.transportHops ?? 0;
  delete clone.conservation.transportHops;
  return { digest: createHash('sha256').update(JSON.stringify(clone)).digest('hex'), transportHops };
}

describe('a building that declares no transport mode runs exactly as it did before they existed', () => {
  it('loads the shipped data directory', () => {
    expect(config.dataDir).toBe(DATA_DIR);
  });

  /*
   * Written down, not derived — `describe` bodies run before `beforeAll`, so the config is not
   * loaded yet and this list cannot be read out of it. That is exactly the shape that lets a
   * partition go stale, so the *next* test asserts it against the shipped data in both
   * directions: give a fifth building an escalator and that assertion fails by name, rather
   * than this guard quietly comparing a moved digest against a stale pin.
   */
  const withoutModes = BUILDING_IDS.filter((id) => id !== 'vertical-city');

  it('exactly one shipped building declares a transport mode, and the rest declare none', () => {
    const declaring = BUILDING_IDS.filter(
      (id) => (config.buildingsById.get(id)?.transportModes ?? []).length > 0,
    );
    expect(declaring).toEqual(['vertical-city']);
    for (const id of withoutModes) {
      expect(config.buildingsById.get(id)?.transportModes).toEqual([]);
    }
  });

  for (const buildingId of withoutModes) {
    for (const profileId of PROFILES) {
      const key = `${buildingId}|${profileId}`;
      it(`${key} reproduces baseline d7e8571 byte for byte`, () => {
        const { digest, transportHops } = measure(buildingId, profileId);
        expect(digest).toBe(BASELINE_DIGESTS[key]);
        // The excluded field, asserted rather than assumed. A lift-only building taking a hop
        // would be invisible to the digest and is not invisible here.
        expect(transportHops).toBe(0);
      });
    }
  }
});

describe('the building that declares one moved, and moved everywhere', () => {
  for (const profileId of PROFILES) {
    const key = `vertical-city|${profileId}`;
    it(`${key} reproduces the re-derived digest and is neither superseded one`, () => {
      const { digest, transportHops } = measure('vertical-city', profileId);
      expect(digest).toBe(MOVED_DIGESTS[key]);
      // Distinct from *both* prior states, so a regression that silently reverts either the
      // sky-lobby escalators or the ground one fails here by name rather than by a moved mean.
      expect(digest).not.toBe(VERTICAL_CITY_BEFORE[key]?.allLift);
      expect(digest).not.toBe(VERTICAL_CITY_BEFORE[key]?.groundOnly);
      expect(transportHops).toBeGreaterThan(0);
    });
  }

  /*
   * The three prior digests are only meaningful if they are three *different* digests. Without
   * this, a copy-paste that made `allLift` and `groundOnly` the same value would leave the
   * `not.toBe` pair above asserting one thing twice — the "value with two readers" shape, in the
   * expectation rather than in the subject.
   */
  it('the three pinned states of this building are three distinct runs', () => {
    for (const profileId of PROFILES) {
      const key = `vertical-city|${profileId}`;
      const before = VERTICAL_CITY_BEFORE[key];
      expect(new Set([before?.allLift, before?.groundOnly, MOVED_DIGESTS[key]]).size, key).toBe(3);
    }
  });
});
