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
 * So {@link BASELINE_DIGESTS} claimed, in its first revision, to have been produced by running
 * `d7e8571` — the commit this branch is based on — in a separate git worktree, against
 * `packages/core/dist`. That claim did not survive measurement: the constants it held did not
 * describe that baseline and matched **no committed tree** — provenance unknown, produced from an
 * unmeasurable working state. DECISIONS.md § D196 carries the finding. The digests below are
 * re-pinned (2026-07-30) to what commits `9f1adf7`, `9fd738c` and HEAD all reproduce on the
 * runner that re-pinned them — Node 22 and Node 26 agree byte for byte, and `goldenRuns` replays
 * stored run records byte-identically on the same runner, so a moved run and a moved pin stay
 * distinguishable. The superseded constants are kept, per this file's own convention, in
 * {@link SUPERSEDED_BASELINE_DIGESTS} and as the `unattributed` state of
 * {@link VERTICAL_CITY_BEFORE}. It is a pin in exactly the sense
 * `experiments/benchmark/published.ts` means: a number this tree must reproduce and did not
 * compute for itself.
 *
 * ## The two fields that are excluded, and why excluding them is not a hole
 *
 * `ConservationAudit.transportHops` is new, so a baseline result has no such key and a digest
 * over it could never match. It is deleted before hashing — and asserted to be `0` separately, in
 * the same test. That is the difference between excluding a field and hiding one: if this change
 * ever made a lift-only building take a hop, the exclusion would not conceal it.
 *
 * `RunSummary.awtInvalidGround` is the second, added when the four `awtIsValid` grounds acquired a
 * machine-readable code beside their prose (`metrics/awtValidity.ts`). It is new in exactly the same
 * sense and is excluded in exactly the same way — and the assertion that replaces it is **stronger
 * than the digest was**, because a digest over the key only ever pinned its bytes. What is asserted
 * instead, on every cell of both suites, is that the code is present precisely when `awtIsValid` is
 * `false`, that it is one of `AWT_INVALID_GROUNDS`, and that the prose it sits beside is still
 * there. A digest could not have said any of that: it would have gone green on a summary that
 * carried a code with no sentence, or a sentence with no code, as long as the bytes matched.
 *
 * Nothing else is excluded, and nothing else needed to be: `GeneratedPassenger.transportHops` and
 * `PassengerRecord.egressTransitSeconds` are both **omitted rather than emptied** when they carry
 * nothing, which is what makes the serialized objects identical rather than merely equivalent.
 */

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { AWT_INVALID_GROUNDS } from '../metrics/awtValidity.js';
import { BUILDING_IDS, DATA_DIR, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

/**
 * SHA-256 of `JSON.stringify(result)` at `seed: 20260726`, `onTimeout: 'report'`, with
 * `conservation.transportHops` deleted.
 *
 * Re-pinned 2026-07-30: these are the values commits `9f1adf7`, `9fd738c` and HEAD all reproduce
 * (Node 22 and 26 agree). The first revision's constants — which claimed baseline `d7e8571` and
 * matched no committed tree, § D196 — are kept in {@link SUPERSEDED_BASELINE_DIGESTS}.
 * `mixed-use-high-rise` needs `onTimeout: 'report'` because `nearest-car` leaves 93 of 757
 * journeys in the system there — a known property of the weakest shipped dispatcher (`docs/07`
 * § 4), and exactly the kind of run whose bytes are worth pinning.
 */
const BASELINE_DIGESTS: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    'c47d765cc87fa35f3a03c142997bd38c5d38b570a84132702ba3604cd64181aa',
  'garden-apartments|eta': '1e7df20dcdedfe7d7e3c2a0bea7d4543378511a9485787b1d4936a603befb717',
  'garden-apartments|collective': '56c830df0fe911e79a877d3a154ef6f442895dc575d9e672db846f86ed2b8077',
  'midtown-office|nearest-car': 'e2d9a8eafcddbb8de6cc70972bd3a88e0ba730078cd202bd51d7636581dcf7d6',
  'midtown-office|eta': '37d267f389c3260aaf40f25dc211170bb53a59c6b86b959a0626f4d86bae0a6c',
  'midtown-office|collective': 'bfd5d294787297a021120966e41d6f9ee3ade08431802f565ad984761135f326',
  'mixed-use-high-rise|nearest-car':
    '124f60a05bdc770e68c683aede89507f0507ac89827565a051fe499109bf4668',
  'mixed-use-high-rise|eta': 'bb25180e575374a9ad25d17b3128dc3a25d5a42e6338a33b70e1dd808192fb83',
  'mixed-use-high-rise|collective':
    '4baaa48dd6f88a120e1ac50263891399d9c397be74f1046d182f84a78edfff4c',
  'secure-tower|nearest-car': 'ed00cfe1d84b3c671ceb5ec1c60b5e2c408f6500c35fb77e6a279f20d66611f4',
  'secure-tower|eta': '00cf4d534ca51071ec76c63020d74c14a2ffc207f832b633cc1b4acec8616600',
  'secure-tower|collective': '7637e886f329517ec39d58165008390bb09277f441a9eac7818b54fdeb6c0b57',
};

/**
 * The superseded first revision of {@link BASELINE_DIGESTS}, kept per this file's convention —
 * a superseded pin is retained beside its replacement so the guard can say *which* prior state a
 * regression resurrects rather than only *that* something moved.
 *
 * These constants claimed to be baseline `d7e8571` and were not: they reproduce from **no
 * committed tree** — provenance unknown, produced from an unmeasurable working state. Re-pinned
 * 2026-07-30; DECISIONS.md § D196 carries the finding.
 */
const SUPERSEDED_BASELINE_DIGESTS: Readonly<Record<string, string>> = {
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
 *
 * Re-pinned 2026-07-30: the previous revision of these three — now the `unattributed` state in
 * {@link VERTICAL_CITY_BEFORE} — matched no committed tree (§ D196). The values below are what
 * commits `9f1adf7`, `9fd738c` and HEAD all reproduce (Node 22 and 26 agree).
 */
const MOVED_DIGESTS: Readonly<Record<string, string>> = {
  'vertical-city|nearest-car': '63559cdad7ca92a184daabbd7bdae07412fbcc0c7eef95084c795c8c135bc1c8',
  'vertical-city|eta': 'f428ebd61bb756615ee0b7212f3eb94959f990c286a4f88d70177353c37bbd39',
  'vertical-city|collective': '45d7df2e72e1dc6bc28c5f69a33c18c475c07432aa2ea4d5e4aaf37c58af42ce',
};

/**
 * The three superseded states of the same building, kept so the guard can say *which* change moved
 * it rather than only *that* it moved.
 *
 * `allLift` is baseline `d7e8571`, before `core` had a transport mode at all. `groundOnly` is the
 * tree that declared the ground-lobby escalator and nothing else — the configuration every
 * `vertical-city` figure published between those two changes was measured under, and the arm
 * `sim/transportHop.test.ts` and `config/doubleDeck.test.ts` still run live. `unattributed` is
 * the first revision of {@link MOVED_DIGESTS}, superseded by the 2026-07-30 re-pin: it claimed to
 * be the re-derived all-escalator digest and reproduces from **no committed tree** — provenance
 * unknown, produced from an unmeasurable working state (§ D196).
 */
const VERTICAL_CITY_BEFORE: Readonly<
  Record<string, { allLift: string; groundOnly: string; unattributed: string }>
> = {
  'vertical-city|nearest-car': {
    allLift: 'a8f78f82129dcefc6b36d905b500047906b2a9d10358ffcf033607a98ece08f3',
    groundOnly: '788a0199c73089092bb78f863a745364cfee8a4f1cdf2f8ced88b12fb94360ac',
    unattributed: '77c37f9b186e2e210e610deb6d68e172428e5beb4bf36639f7943dbacf1a0b12',
  },
  'vertical-city|eta': {
    allLift: 'f3587fabdc00d41057fe972bdf15c50f96c194e20c2620f41be497964d2147f6',
    groundOnly: '96a55b58dee7fa618242d06cf16dec777a63df3f06fa068c97037dd2535a6c54',
    unattributed: '37d5a747c45a3c3a43f33c50e080deca27fa16c47a562361f50c2e7a901cdf59',
  },
  'vertical-city|collective': {
    allLift: 'd7f3f3bf74d36a72ede1288612e1b3ba173eec69b932d907ccfd724510907cd4',
    groundOnly: '03fe08156be7ec5da7b7f2969fe514660743f6f4e805adcbcbf9334813ef935f',
    unattributed: 'a91bf06e4b1c708a5b78c6fd78657af71c8bcd69c44fad4dbae546d5923866af',
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
  /** The excluded suppression code, kept so the assertion below can be about its *meaning*. */
  readonly awtInvalidGround: string | undefined;
  readonly awtInvalidReason: string | undefined;
  readonly awtIsValid: boolean;
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
    summary: {
      awtIsValid: boolean;
      awtInvalidReason?: string;
      awtInvalidGround?: string;
    };
  };
  const transportHops = clone.conservation.transportHops ?? 0;
  delete clone.conservation.transportHops;
  const { awtIsValid, awtInvalidReason, awtInvalidGround } = clone.summary;
  delete clone.summary.awtInvalidGround;
  return {
    digest: createHash('sha256').update(JSON.stringify(clone)).digest('hex'),
    transportHops,
    awtInvalidGround,
    awtInvalidReason,
    awtIsValid,
  };
}

/**
 * What replaces the excluded `awtInvalidGround` byte, and it asks more than the byte did.
 *
 * Three claims, and the first two are the ones a digest structurally could not make: the code and
 * the sentence travel **together or not at all**, and the code is a member of the derived
 * enumeration rather than any string the branch happened to return.
 */
function expectSuppressionCodeBesideItsProse(measured: Measured, key: string): void {
  if (measured.awtIsValid) {
    expect(measured.awtInvalidGround, key).toBeUndefined();
    expect(measured.awtInvalidReason, key).toBeUndefined();
    return;
  }
  expect(measured.awtInvalidGround, key).toBeDefined();
  expect(AWT_INVALID_GROUNDS as readonly string[], key).toContain(measured.awtInvalidGround);
  // The prose is not replaced by the code. It is the thing several guards assert on.
  expect(measured.awtInvalidReason ?? '', key).not.toBe('');
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
      it(`${key} reproduces the re-pinned digest byte for byte, and is not the superseded one`, () => {
        const measured = measure(buildingId, profileId);
        expect(measured.digest).toBe(BASELINE_DIGESTS[key]);
        // Not the first revision's constant, which matched no committed tree (§ D196).
        expect(measured.digest).not.toBe(SUPERSEDED_BASELINE_DIGESTS[key]);
        // The excluded fields, asserted rather than assumed. A lift-only building taking a hop
        // would be invisible to the digest and is not invisible here.
        expect(measured.transportHops).toBe(0);
        expectSuppressionCodeBesideItsProse(measured, key);
      });
    }
  }
});

describe('the building that declares one moved, and moved everywhere', () => {
  for (const profileId of PROFILES) {
    const key = `vertical-city|${profileId}`;
    it(`${key} reproduces the re-pinned digest and is none of the superseded states`, () => {
      const measured = measure('vertical-city', profileId);
      const { digest, transportHops } = measured;
      expectSuppressionCodeBesideItsProse(measured, key);
      expect(digest).toBe(MOVED_DIGESTS[key]);
      // Distinct from *all three* prior states, so a regression that silently reverts either the
      // sky-lobby escalators or the ground one — or resurrects the unattributed first revision —
      // fails here by name rather than by a moved mean.
      expect(digest).not.toBe(VERTICAL_CITY_BEFORE[key]?.allLift);
      expect(digest).not.toBe(VERTICAL_CITY_BEFORE[key]?.groundOnly);
      expect(digest).not.toBe(VERTICAL_CITY_BEFORE[key]?.unattributed);
      expect(transportHops).toBeGreaterThan(0);
    });
  }

  /*
   * The four prior digests are only meaningful if they are four *different* digests. Without
   * this, a copy-paste that made two superseded states the same value would leave the
   * `not.toBe` chain above asserting one thing twice — the "value with two readers" shape, in the
   * expectation rather than in the subject.
   */
  it('the four pinned states of this building are four distinct digests', () => {
    for (const profileId of PROFILES) {
      const key = `vertical-city|${profileId}`;
      const before = VERTICAL_CITY_BEFORE[key];
      expect(
        new Set([before?.allLift, before?.groundOnly, before?.unattributed, MOVED_DIGESTS[key]])
          .size,
        key,
      ).toBe(4);
    }
  });
});
