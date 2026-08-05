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
/**
 * **Re-pinned for `stageActivity.diversions`, and the delta was proved rather than assumed.**
 *
 * `structuralDigestOfResult` hashes the whole `SimulationResult`, so it moves when the result
 * grows a *field* just as surely as when a run changes. `eligibility.enRouteDiversion`
 * (`DECISIONS.md` § D205) added one always-zero counter to `StageActivity`, and all fifteen
 * digests below moved on that alone.
 *
 * The claim that nothing else moved is checked, not asserted: deleting `stageActivity.diversions`
 * from the cloned result before hashing reproduces **every** superseded digest exactly — for
 * example `garden-apartments|nearest-car` returns to `80247759f477…` and `midtown-office|collective`
 * to `3bd0fa8bc0a8…`. `headlineDrift` below is the standing check on the same question in units an
 * engineer can read, and it is empty for all fifteen. So these buildings still run exactly as they
 * did; the record describing the run is one key wider.
 *
 * ## And re-pinned again for `startOfDayS`, with the delta proved for all fifteen rather than two
 *
 * `DECISIONS.md` § D244 gave four of the five shipped demand templates a time of day. The hour is
 * invisible to `intensityAt`, `splitAt` and `integratedIntensityS`, so **no arrival, leg, stop or
 * statistic moved** — but `PassengerTrace` is part of a `SimulationResult` and
 * `structuralDigestOfResult` hashes every key, so all fifteen digests below moved on the key alone,
 * exactly as they did for `stageActivity.diversions`.
 *
 * The claim is again checked rather than asserted, and this time mechanically and for every cell:
 * `traffic/dayStartIdentity.test.ts` deletes `startOfDayS` from a **current** result and requires
 * the digest to equal the superseded value, for all fifteen keys, in the same run that requires the
 * whole result — byte for byte, not by digest — to equal one produced against `data/` with every
 * `startOfDayMin` stripped out. So the delta here is one key wide, and that is a measurement.
 * `headlineDrift` is empty for all fifteen, as before.
 *
 * ## And re-pinned a third time for § D254 — nine of fifteen, and the six that held are the point
 *
 * The two re-pins above moved **all fifteen** digests because the *record* grew a key. This one is
 * the opposite shape: the runs themselves moved, and only some of them. Access zoning was being
 * applied to a hall call's **pickup** floor, so on every building that declares `accessZones` a
 * conventional landing call — which carries no credential by construction — was refused by every
 * car in the bank, and the building was unserviceable. § D254 asks the credential question about
 * the destination instead.
 *
 * So the nine cells on `mixed-use-high-rise`, `secure-tower` and `vertical-city` moved, and every
 * one of them moved in the same direction: `timed-out` to `completed`, with every passenger
 * delivered. `mixed-use-high-rise|collective`, for instance, goes from 642 of 725 delivered to 725
 * of 725, and its longest wait from 1 096.7 s to 123.6 s.
 *
 * **The six cells on `garden-apartments` and `midtown-office` did not move by one bit** — same
 * digest, same eight headline reals to the last place. Those two buildings declare no access
 * zones, and that is the controlled half of this re-pin: it is what says the change is the access
 * check and not a perturbation of the dispatcher. `mixed-use-high-rise|nearest-car`'s own
 * `onTimeout: 'report'` allowance above is now unnecessary for the reason it was granted — that
 * arm delivers everybody — and is kept because the flag is what the pins were taken under.
 */
const BASELINE_STRUCTURAL: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    'a721ea412cb91990a2cc85f2d4aa48f45b1ce516b771d52b5969f359ed0f4458',
  'garden-apartments|eta': 'ddc08973567c2379f201cfc290986d80d34368cda0289d0c86bd3719e618b94d',
  'garden-apartments|collective': 'ccfe134d70b873a0fa6a8007a63216402ead003b670026939263d20d8062b3bc',
  'midtown-office|nearest-car': 'b1330d5f6ff9c942a9474bddac18947a83c64db3fb3ec548abb26c09e100aed8',
  'midtown-office|eta': 'eddb3f97da5dbd23457c3b2fe2ee95c9476f354d44c09ef0bfa1fda44c0ec412',
  'midtown-office|collective': '434a08434d9d1c1e2197e9e0efe7926680b5ea9e11614ed5f556b6281d48d6ba',
  'mixed-use-high-rise|nearest-car':
    '129b89a1c877a09a520b82f9f3452f98bf070137d2585b6fcaf144c9bb332b9e',
  'mixed-use-high-rise|eta': '4bd639964c8dcc727adef90a94b457042f58506c9cd902f1b260fb7ccbd35da3',
  'mixed-use-high-rise|collective':
    '15341e131d854be514d06c5fdb4fa905fe964e29c6b2dffdbf62d13d755155ff',
  'secure-tower|nearest-car': '140d67af62ffc1e9c85b9e78ea9f82f48f2e57abf602decf55017f26f5e30888',
  'secure-tower|eta': '96327524c4e5129fce937eb76116e73b86af8f3a671cc041c5dc3810d1b67ebe',
  'secure-tower|collective': '259356762940596271b96914ccfa0ab705ef1228d342b7c141c3081566a1f9c9',
};

/**
 * The same, for the one building that declares a transport mode — `vertical-city` with an escalator
 * at **all four** of its two-level lobbies: `G ↔ 2`, `26 ↔ 27`, `51 ↔ 52`, `76 ↔ 77`.
 *
 * Pinned rather than omitted. The moved figure is the finding, and a guard that simply stopped
 * looking at the building the change was made for would be the fourth entry in this repository's
 * list of tests that cannot fail.
 *
 * These three re-pinned alongside the twelve above for `startOfDayS`, on the same one key and with
 * the same delta proof — see {@link BASELINE_STRUCTURAL}. `vertical-city` runs `rise-and-fall`,
 * which now declares 08:30; its escalator routing is untouched and its `transportHops` count below
 * is unchanged.
 */
const MOVED_STRUCTURAL: Readonly<Record<string, string>> = {
  'vertical-city|nearest-car': '1c2501bd145de12e760ac2308f9750bb6adcdf54c66adb0732cb82c74d8f9127',
  'vertical-city|eta': '449c4ee9b5ef3370f45cd27e20c6d83c5c6b6b3a61bdd2da753a3b5363de2a93',
  'vertical-city|collective': 'a0448d161f89e23c343097b2df2f78f11cadd6030c4bb424b8be2cbda1eec1b3',
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
  'mixed-use-high-rise|nearest-car': { waitMeanS: 142.10544033145624, waitP95S: 387.1291283536797, rideMeanS: 85.83881085871421, ttdMeanS: 299.71599213814886, workKJ: 18554.753508457314, workPerLegKJ: 67.22736778426562, handlingPct: 8.787346221441124, longestWaitS: 411.2582877419493 },
  'mixed-use-high-rise|eta': { waitMeanS: 17.327972060875723, waitP95S: 45.84432718605183, rideMeanS: 83.81718832889898, ttdMeanS: 127.62874763554764, workKJ: 28689.576776790745, workPerLegKJ: 108.67263930602554, handlingPct: 9.622144112478031, longestWaitS: 97.87760181883891 },
  'mixed-use-high-rise|collective': { waitMeanS: 23.84993103248671, waitP95S: 67.51164623159896, rideMeanS: 80.36325778673698, ttdMeanS: 131.01089136245614, workKJ: 31561.450258943398, workPerLegKJ: 119.09981229789962, handlingPct: 9.666080843585236, longestWaitS: 123.61383347847595 },
  'secure-tower|nearest-car': { waitMeanS: 117.50578060891134, waitP95S: 236.49202767237338, rideMeanS: 99.05396066082899, ttdMeanS: 230.9134610017266, workKJ: 3692.412283657347, workPerLegKJ: 27.351202101165534, handlingPct: 6.754032258064516, longestWaitS: 261.24994780096097 },
  'secure-tower|eta': { waitMeanS: 33.834449274537576, waitP95S: 86.58687220630071, rideMeanS: 99.94210694401706, ttdMeanS: 141.43631161356444, workKJ: 6256.948630612125, workPerLegKJ: 46.00697522508916, handlingPct: 10.483870967741936, longestWaitS: 92.86280434382616 },
  'secure-tower|collective': { waitMeanS: 27.69737216856337, waitP95S: 103.06062675292485, rideMeanS: 93.31256304889672, ttdMeanS: 128.22673467578974, workKJ: 7141.873618804888, workPerLegKJ: 52.902767546702876, handlingPct: 11.088709677419354, longestWaitS: 166.82792671858385 },
  'vertical-city|nearest-car': { waitMeanS: 132.3612250003804, waitP95S: 450.8375837775556, rideMeanS: 87.32429712411934, ttdMeanS: 365.30942858725524, workKJ: 51285.39244586513, workPerLegKJ: 62.39098837696488, handlingPct: 11.847759361571516, longestWaitS: 614.7212331603102 },
  'vertical-city|eta': { waitMeanS: 27.93732451789864, waitP95S: 81.04027255941901, rideMeanS: 82.1993051894896, ttdMeanS: 190.43948716341964, workKJ: 64693.002379474885, workPerLegKJ: 73.2650083572762, handlingPct: 12.072846326989973, longestWaitS: 130.57283536186333 },
  'vertical-city|collective': { waitMeanS: 33.004990520236795, waitP95S: 90.01929999607432, rideMeanS: 78.64133260719593, ttdMeanS: 186.5091247249759, workKJ: 77951.89587917822, workPerLegKJ: 86.22997331767502, handlingPct: 12.318395743810107, longestWaitS: 426.01312542571054 },
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
      }, 60_000);
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
    }, 60_000);
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
  }, 60_000);
});
