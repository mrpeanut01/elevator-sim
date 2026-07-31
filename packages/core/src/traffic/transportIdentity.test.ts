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

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { AWT_INVALID_GROUNDS } from '../metrics/awtValidity.js';
import { BUILDING_IDS, DATA_DIR, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import {
  continuousFieldsOf,
  fieldDisagreements,
  structuralDigestOfResult,
} from './identity.test-helper.js';

/**
 * The **structural** digest of `runSimulation(...)` at `seed: 20260726`, `onTimeout: 'report'`,
 * with `conservation.transportHops` and `summary.awtInvalidGround` deleted — every decision and
 * every count, and no real number.
 *
 * ## Why these are not the whole-result digests they replace
 *
 * This table used to hold `SHA-256(JSON.stringify(result))`, pinning every double at full
 * precision, which asserts a bit-identical result on every machine. CI's two-OS matrix proved that
 * false: x64 and arm64 differ in the last bits of the traffic draws, so the same pins passed on
 * whichever platform last regenerated them and failed on the other
 * ([§ D196](../../../../DECISIONS.md), [§ D201](../../../../DECISIONS.md)).
 *
 * {@link structuralDigestOfResult} keeps everything that made this guard worth having — every
 * served-leg count, stop count, journey count, `awtIsValid` flag and suppression code is an
 * integer, boolean or string and is still hashed exactly — and elides only the magnitudes, which
 * {@link BASELINE_HEADLINE} holds to a tolerance instead. A key that appears or disappears still
 * moves the digest, because the placeholder is hashed in the value's place rather than dropped.
 *
 * `mixed-use-high-rise` still needs `onTimeout: 'report'` because `nearest-car` leaves 93 of 757
 * journeys in the system there — a known property of the weakest shipped dispatcher (`docs/07` § 4),
 * and exactly the kind of run worth pinning.
 *
 * Regenerated on this tree, because the digest is a different function and an inherited value would
 * be meaningless. What makes them trustworthy is that **both CI platforms reproduce them**.
 */
const BASELINE_STRUCTURAL: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    '80247759f477adbf1b462a3a5729f2e3287b459a910281c20c6c5c8578832f46',
  'garden-apartments|eta': '29971d4d1f911b8293f33fb4da2f09f63b66da61033ac37dc527326e0999696b',
  'garden-apartments|collective': '6c65bfdc0def833da5b85054aba3bdb5ff303e34cc34d44c25f1cbb509e11b95',
  'midtown-office|nearest-car': '6586eda16839a18e64fecc1bff1a658eb925c8e83e304e2ea59efb3f95eb02aa',
  'midtown-office|eta': 'b861089efbfc5c9106980ab06196279f2bc1c181e9102f4450ea56bfd8d713f4',
  'midtown-office|collective': '3bd0fa8bc0a8428cbe601c1ce1bd2735c9fa407d639ce3f4ef9e641ec60f03c7',
  'mixed-use-high-rise|nearest-car':
    '7f0e53938cbf82355ab887c73e81cdb67a59d71823b2ab4e9305849e4711d5ae',
  'mixed-use-high-rise|eta': '3434557bb0a40088c63b0751b9950de395d7218278bf30fb6871b9fa79eecfc3',
  'mixed-use-high-rise|collective':
    'aae8df80f22c6d791186360cca6311d584d39296f54f14c56874bf7805ea42a7',
  'secure-tower|nearest-car': 'f65085fb01dc47bab3ca522c179e497a794e86eae40c84325c0f8defe21ac362',
  'secure-tower|eta': '5cb5101eeb3b0dc9e3779cdb11a2fa6aa68f6285f08a10b041a2589f47eac66e',
  'secure-tower|collective': 'e20c72cbfe1981e1a0329f8be27a21b078cc7181ea232f6714ed922720f5d5c9',
};

/**
 * The same, for the one building that declares a transport mode — `vertical-city` with an escalator
 * at **all four** of its two-level lobbies: `G ↔ 2`, `26 ↔ 27`, `51 ↔ 52`, `76 ↔ 77`.
 *
 * Pinned rather than omitted. The moved figure is the finding, and a guard that simply stopped
 * looking at the building the change was made for would be the fourth entry in this repository's
 * list of tests that cannot fail.
 */
const MOVED_STRUCTURAL: Readonly<Record<string, string>> = {
  'vertical-city|nearest-car': 'a7c09984f2f2d050df7e1a470c4f5217da44922c37579bc40907c07778eaba34',
  'vertical-city|eta': '409eae733a067b212269fd4bca5af26c0d5c42b9a3a0af2f646caefe96d5adbb',
  'vertical-city|collective': '66654ec2533bffe860511e9e8d97fbd6dc970d4d1b07caac8bbe24cb763cf8b1',
};

/**
 * **What the superseded whole-result digests were, and why they are no longer asserted.**
 *
 * This file used to compare `vertical-city` against two earlier states — `allLift`, baseline
 * `d7e8571` before `core` had a transport mode at all, and `groundOnly`, the tree that declared the
 * ground-lobby escalator and nothing else — so the guard could say *which* change moved it rather
 * than only *that* it moved.
 *
 * Those are `SHA-256(JSON.stringify(result))` values, and this file no longer computes that
 * function. **A digest cannot be compared across a change of digest**, and re-deriving them would
 * need the two superseded trees checked out, which is not something a unit test can do. Asserting
 * them anyway — against a value the current code can never produce — is exactly the shape § D201
 * found in the re-pin it replaces.
 *
 * They are kept here as the record of what was measured, and the distinctness claim they supported
 * is not lost: {@link MOVED_STRUCTURAL} still pins the current routing exactly, and § D170 records
 * the mechanism — 26 journeys over different floors, lift legs 3 257 → 3 245. What is lost is the
 * automatic attribution to *which* of the two prior states, and that is stated rather than papered
 * over.
 *
 * | key | allLift (`d7e8571`) | groundOnly |
 * |---|---|---|
 * | `vertical-city\|nearest-car` | `a8f78f82…` | `788a0199…` |
 * | `vertical-city\|eta` | `f3587fab…` | `96a55b58…` |
 * | `vertical-city\|collective` | `d7f3f3bf…` | `03fe0815…` |
 */

/**
 * The magnitudes the decisions above carry: the eight figures this project actually reports.
 *
 * Compared within {@link RELATIVE_TOLERANCE}, which is where the cross-platform divergence lives.
 * Eight rather than all 116 reals in a summary because these are the ones a reader acts on — AWT
 * and WT95 are the acceptance statistics, `workPerLegKJ` is the § D106 companion the energy figure
 * may not be read without, and `longestWaitS` is the § D108 abandonment-horizon ground. A change
 * that moves the run without moving any of these has still moved the structural digest.
 */
const BASELINE_HEADLINE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'garden-apartments|nearest-car': { waitMeanS: 22.516504973257074, waitP95S: 44.3475961534573, rideMeanS: 28.671768707483043, ttdMeanS: 51.18827368074012, workKJ: 159.47144369607724, workPerLegKJ: 22.781634813725322, handlingPct: 6.666666666666667, longestWaitS: 48.503080914483576 },
  'garden-apartments|eta': { waitMeanS: 15.8856145903432, waitP95S: 28.257276272241313, rideMeanS: 28.171768707483075, ttdMeanS: 44.05738329782628, workKJ: 264.4397170490541, workPerLegKJ: 37.77710243557915, handlingPct: 6.666666666666667, longestWaitS: 29.309523809523853 },
  'garden-apartments|collective': { waitMeanS: 17.698884915959166, waitP95S: 35.73930415138283, rideMeanS: 24.70408163265313, ttdMeanS: 42.4029665486123, workKJ: 267.84313533857943, workPerLegKJ: 38.26330504836849, handlingPct: 6.666666666666667, longestWaitS: 38.49492429789382 },
  'midtown-office|nearest-car': { waitMeanS: 1625.3073142849905, waitP95S: 2778.5301723158727, rideMeanS: 101.4917970264325, ttdMeanS: 1726.7991113114228, workKJ: 1485.6773233378524, workPerLegKJ: 7.541509255522094, handlingPct: 4.035087719298246, longestWaitS: 2906.760720955624 },
  'midtown-office|eta': { waitMeanS: 803.5837920145476, waitP95S: 1451.3328596031365, rideMeanS: 103.1891892481786, ttdMeanS: 906.772981262727, workKJ: 2143.0568396923136, workPerLegKJ: 10.87846111518941, handlingPct: 4.7953216374269, longestWaitS: 1482.5906698639715 },
  'midtown-office|collective': { waitMeanS: 791.9363372638369, waitP95S: 1415.12165477437, rideMeanS: 100.09924603990174, ttdMeanS: 892.0355833037382, workKJ: 2285.0767835145743, workPerLegKJ: 11.599374535606977, handlingPct: 4.619883040935672, longestWaitS: 1436.744534680982 },
  'mixed-use-high-rise|nearest-car': { waitMeanS: 214.79895769937508, waitP95S: 817.0781674975711, rideMeanS: 85.44825863703696, ttdMeanS: 361.4013442351988, workKJ: 23504.058602911486, workPerLegKJ: 106.35320634801577, handlingPct: 7.732864674868189, longestWaitS: 1962.5880445794123 },
  'mixed-use-high-rise|eta': { waitMeanS: 142.68115763876253, waitP95S: 678.3951693817187, rideMeanS: 87.32512167858219, ttdMeanS: 273.12609344906105, workKJ: 24407.92515308621, workPerLegKJ: 110.44310024020909, handlingPct: 7.996485061511424, longestWaitS: 1221.4802668737561 },
  'mixed-use-high-rise|collective': { waitMeanS: 65.38810805406801, waitP95S: 348.45548910819133, rideMeanS: 85.25698304659325, ttdMeanS: 177.7481384380594, workKJ: 33565.92654763983, workPerLegKJ: 152.57239339836286, handlingPct: 9.92970123022847, longestWaitS: 1096.7338414201085 },
  'secure-tower|nearest-car': { waitMeanS: 72.4930266924905, waitP95S: 220.07902498224018, rideMeanS: 104.8894473507938, ttdMeanS: 177.38247404328436, workKJ: 4096.166816972333, workPerLegKJ: 35.00997279463533, handlingPct: 6.552419354838709, longestWaitS: 1076.1934052835004 },
  'secure-tower|eta': { waitMeanS: 45.207463696766915, waitP95S: 159.40554814190463, rideMeanS: 90.30623461546863, ttdMeanS: 137.13810845064097, workKJ: 7239.030602709389, workPerLegKJ: 58.85390733910073, handlingPct: 10.383064516129032, longestWaitS: 1039.9714662955998 },
  'secure-tower|collective': { waitMeanS: 45.207463696766915, waitP95S: 159.40554814190463, rideMeanS: 90.30623461546863, ttdMeanS: 137.13810845064097, workKJ: 7239.030602709389, workPerLegKJ: 58.85390733910073, handlingPct: 10.383064516129032, longestWaitS: 1039.9714662955998 },
  'vertical-city|nearest-car': { waitMeanS: 134.4278217079031, waitP95S: 313.52651799960944, rideMeanS: 86.43287051347059, ttdMeanS: 351.612126023367, workKJ: 47832.64322089375, workPerLegKJ: 59.12564056970797, handlingPct: 10.92694904849601, longestWaitS: 1523.5322558070939 },
  'vertical-city|eta': { waitMeanS: 45.0333047611517, waitP95S: 86.67601262739815, rideMeanS: 81.49757654126381, ttdMeanS: 209.91356423350703, workKJ: 68339.09132618485, workPerLegKJ: 80.39893097198217, handlingPct: 11.49989768774299, longestWaitS: 1287.7649265606756 },
  'vertical-city|collective': { waitMeanS: 38.905844782544634, waitP95S: 86.9190792748077, rideMeanS: 77.2260836021643, ttdMeanS: 193.0443670458902, workKJ: 69517.1657090653, workPerLegKJ: 83.25409066953928, handlingPct: 11.888684264374874, longestWaitS: 1162.7707143022799 },
};

/** The eight reported figures, and where each lives in a summary. */
const HEADLINE_PATHS: readonly (readonly [string, string])[] = [
  ['waitMeanS', 'waiting.meanS'],
  ['waitP95S', 'waiting.p95S'],
  ['rideMeanS', 'rideTime.meanS'],
  ['ttdMeanS', 'timeToDestination.meanS'],
  ['workKJ', 'energy.workKJ'],
  ['workPerLegKJ', 'energy.workPerServedLegKJ'],
  ['handlingPct', 'handlingCapacity.pctPopulationPer5Min'],
  ['longestWaitS', 'serviceLevel.longestWaitS'],
];

/** Compare a measured headline set against its pin, returning the paths that disagree. */
function headlineDrift(measured: Measured, key: string): readonly string[] {
  const pinned = BASELINE_HEADLINE[key];
  if (pinned === undefined) return [`${key}: no headline pin`];
  return fieldDisagreements(measured.headline, new Map(Object.entries(pinned)));
}

const PROFILES = ['nearest-car', 'eta', 'collective'] as const;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

interface Measured {
  /** Every decision and count. Compared exactly — it is expected to be portable. */
  readonly digest: string;
  /** The eight reported magnitudes, keyed as in {@link BASELINE_HEADLINE}. */
  readonly headline: ReadonlyMap<string, number>;
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
    summary: Record<string, unknown> & {
      awtIsValid: boolean;
      awtInvalidReason?: string;
      awtInvalidGround?: string;
    };
  };
  const transportHops = clone.conservation.transportHops ?? 0;
  delete clone.conservation.transportHops;
  const { awtIsValid, awtInvalidReason, awtInvalidGround } = clone.summary;
  delete clone.summary.awtInvalidGround;
  const reals = continuousFieldsOf(clone.summary);
  const headline = new Map<string, number>();
  for (const [name, path] of HEADLINE_PATHS) headline.set(name, reals.get(path) ?? 0);
  return {
    digest: structuralDigestOfResult(clone),
    headline,
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
      it(`${key} reproduces baseline d7e8571 byte for byte`, () => {
        const measured = measure(buildingId, profileId);
        expect(measured.digest, key).toBe(BASELINE_STRUCTURAL[key]);
        expect(headlineDrift(measured, key), `${key} headline drift`).toEqual([]);
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
    it(`${key} routes over its escalators exactly as pinned, and its figures agree`, () => {
      const measured = measure('vertical-city', profileId);
      const { digest, transportHops } = measured;
      expectSuppressionCodeBesideItsProse(measured, key);
      expect(digest, key).toBe(MOVED_STRUCTURAL[key]);
      expect(headlineDrift(measured, key), `${key} headline drift`).toEqual([]);
      /*
       * The load-bearing one, and the reason this building is pinned at all: a regression that
       * silently reverted the sky-lobby escalators would route these journeys back over lifts, and
       * a *structural* digest is exactly what notices. The comparison against the two superseded
       * whole-result digests is gone — see their table above for why a digest cannot be compared
       * across a change of digest — so this assertion carries the claim on its own, together with
       * the hop count below.
       */
      expect(transportHops).toBeGreaterThan(0);
    });
  }

  /*
   * The three structural digests are only meaningful if they are three *different* digests. A
   * copy-paste that gave two profiles the same pin would leave both of their assertions above
   * asserting one thing twice — the "value with two readers" shape, in the expectation rather than
   * in the subject.
   */
  it('the three profiles pin three distinct runs of this building', () => {
    const pinned = PROFILES.map((profileId) => MOVED_STRUCTURAL[`vertical-city|${profileId}`]);
    expect(new Set(pinned).size).toBe(PROFILES.length);
  });

  /*
   * Every journey over an escalator is one this building's lifts did not carry, so the hop count is
   * the same across dispatchers — the transport network is geometry, not policy. Asserted because
   * it is the one integer that ties the three runs together, and a change that moved it for one
   * dispatcher and not the others would be a routing bug wearing a dispatch change.
   */
  it('the escalator hop count is a property of the building, not of the dispatcher', () => {
    const counts = PROFILES.map((profileId) => measure('vertical-city', profileId).transportHops);
    expect(new Set(counts).size, `hops per profile: ${counts.join(', ')}`).toBe(1);
    expect(counts[0]).toBeGreaterThan(0);
  });
});
