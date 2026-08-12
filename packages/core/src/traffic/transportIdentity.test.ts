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
 * `DECISIONS.md` § D244 gave four of the five demand templates shipping at the time a time of day —
 * five of six since § D263 split `evening-egress` into a venue record and an office one. The hour is
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
 *
 * ## And a fourth time for § D265 — the same nine, and the same six that held
 *
 * The credential gap gives a declared share of in-building journeys the badge their own floor
 * implies rather than the one their destination needs, so the building turns them away and they do
 * not travel. That is § D254's partition arrived at from the opposite direction: nine cells moved,
 * and they are exactly the three buildings that declare `accessZones`, under all three conventional
 * dispatchers.
 *
 * Every one of the nine still reports `completed` with **`undelivered: 0`** — the lifts strand
 * nobody, which is § D254's finding and it is untouched. What moved is that 4 of 396 journeys on
 * `secure-tower`, 11 of 757 on `mixed-use-high-rise` and 13 of 1 956 on `vertical-city` are counted
 * in `conservation.accessRefused` rather than in `delivered`, and the run's figures move with the
 * population that actually rode.
 *
 * **The six cells on `garden-apartments` and `midtown-office` did not move by one bit** — same
 * digest, same eight headline reals to the last place, `midtown-office` still refusing its mean on
 * the same `saturated` ground. That is the control, and it is the run this lane's byte-identity
 * claim rests on rather than an argument about which code paths are reachable.
 */
const BASELINE_STRUCTURAL: Readonly<Record<string, string>> = {
  'garden-apartments|nearest-car':
    'a721ea412cb91990a2cc85f2d4aa48f45b1ce516b771d52b5969f359ed0f4458',
  'garden-apartments|eta': 'ddc08973567c2379f201cfc290986d80d34368cda0289d0c86bd3719e618b94d',
  'garden-apartments|collective':
    'ccfe134d70b873a0fa6a8007a63216402ead003b670026939263d20d8062b3bc',
  'midtown-office|nearest-car': 'b1330d5f6ff9c942a9474bddac18947a83c64db3fb3ec548abb26c09e100aed8',
  'midtown-office|eta': 'eddb3f97da5dbd23457c3b2fe2ee95c9476f354d44c09ef0bfa1fda44c0ec412',
  'midtown-office|collective': '434a08434d9d1c1e2197e9e0efe7926680b5ea9e11614ed5f556b6281d48d6ba',
  'mixed-use-high-rise|nearest-car':
    'dd497989b07c8a45f8458ca586d27537cd66ad9442e6800f043f5ceca548ad4a',
  'mixed-use-high-rise|eta': 'c76524aefd38f871c0a1be23c6ca07cb7e27ae9e1b1108e7bf74fcf849442f54',
  'mixed-use-high-rise|collective':
    '1bb075b1d5b3d055ee8f1ed4d60f2877e83c9de6dda4efaf1b664b552c2158f0',
  'secure-tower|nearest-car': 'f591700fd7b205af757ce7d38dce4b5f555d99322488af6879c7348bf9549661',
  'secure-tower|eta': '75e35ec8db83190c85be04371ed05a3e0e2bb58d32105bcdc9c5ea1037f61d4d',
  'secure-tower|collective': '6536ff4ffada1dfb8d5d0012241713ae6ade194d27626a2eff084093c9b10bcd',
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
 *
 * **Re-pinned again for § D332's deck fix, and the escalator claim is re-read rather than
 * inherited.** A double-deck car may now answer a call at the floor its upper deck already has
 * open, which moves this building's run and therefore its digest. What it does *not* move is the
 * thing this table exists to watch: `transportHops` below is unchanged in all three arms, so the
 * riders taking the escalator are the same riders, and the digest moved because the lifts around
 * them behaved differently. A transport pin that moved *with* its hop count would be a different
 * and much more interesting failure, and this is the assertion that tells the two apart.
 *
 * Regenerated locally on the same measured-platform-stable grounds as {@link BASELINE_STRUCTURAL} —
 * CI's linux leg, CI's macOS leg and the local run reported these three character for character.
 */
const MOVED_STRUCTURAL: Readonly<Record<string, string>> = {
  'vertical-city|nearest-car': 'c27d5005cd0753365ec12f2a7ce73a6903f34d04343db7594287bf0b95b8b151',
  'vertical-city|eta': '11935af9e94650a804295699dc304e06eaf620f2195ef0d5fd6c2c3830b13fc2',
  'vertical-city|collective': '522ee3ff6efb10bfc5a79a707ad263bf18cd363ec4dfbd95ad4e30455bed4c89',
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
 *
 * ## The three `vertical-city` rows, re-measured for § D332 and § D333
 *
 * All eight figures moved in all three arms, because both fixes land on this building: the deck
 * fix (§ D332) lets a paired car answer at the deck it already has open, and the panel-pin fix
 * (§ D333) stops one car being promised a queue it cannot hold. The twelve rows above are
 * unchanged, which is the control.
 *
 * **What moved, stated as arithmetic on one seed and not as a result:**
 *
 * | arm | waitMean | waitP95 | longestWait | workKJ |
 * |---|---|---|---|---|
 * | `nearest-car` | 130.3 → 97.1 | 471.7 → 337.3 | 633.3 → 507.5 | 50 275 → 56 214 |
 * | `eta` | 24.2 → 23.2 | 79.4 → 67.0 | 120.9 → 137.6 | 70 223 → 64 522 |
 * | `collective` | 30.2 → 27.2 | **80.4 → 97.1** | **408.6 → 148.6** | 81 058 → 71 945 |
 *
 * **`collective` is the row to read, and it is not the good-news row it looks like.** Its mean
 * improves, its worst wait falls by 64 %, and its **p95 gets 21 % worse** at the same time. That
 * combination is what a redistribution looks like rather than an improvement: the panel fix serves
 * riders who used to be pinned behind a full car, and a rider who is finally served with a
 * two-minute wait enters the percentile they were previously absent from. Reporting the mean and
 * the longest wait without the p95 beside them would turn this row into a claim it does not
 * support — which is the § D106 rule about energy, applied to a wait distribution.
 *
 * **`nearest-car` moves the other way on energy** — waits down across the board, `workKJ` **up
 * 12 %** — and that is § D106's own case: it answers more calls at paired landings, so it drives
 * more and carries more, and `workPerLegKJ` rises with it (59.3 → 63.2) rather than falling, so
 * the extra energy is not being bought by serving extra people per trip.
 *
 * **None of the above is an interval.** These are single-seed structural pins with a relative
 * tolerance, kept so that drift is noticed; they are not paired-t comparisons and nothing here may
 * be quoted as one dispatcher beating another. The statistical claims live in `benchmark/`, where
 * they are measured at 50–200 replications under common random numbers.
 */
const BASELINE_HEADLINE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'garden-apartments|nearest-car': { waitMeanS: 22.516504973257074, waitP95S: 44.3475961534573, rideMeanS: 28.671768707483043, ttdMeanS: 51.18827368074012, workKJ: 159.47144369607724, workPerLegKJ: 22.781634813725322, handlingPct: 6.666666666666667, longestWaitS: 48.503080914483576 },
  'garden-apartments|eta': { waitMeanS: 15.8856145903432, waitP95S: 28.257276272241313, rideMeanS: 28.171768707483075, ttdMeanS: 44.05738329782628, workKJ: 264.4397170490541, workPerLegKJ: 37.77710243557915, handlingPct: 6.666666666666667, longestWaitS: 29.309523809523853 },
  'garden-apartments|collective': { waitMeanS: 17.698884915959166, waitP95S: 35.73930415138283, rideMeanS: 24.70408163265313, ttdMeanS: 42.4029665486123, workKJ: 267.84313533857943, workPerLegKJ: 38.26330504836849, handlingPct: 6.666666666666667, longestWaitS: 38.49492429789382 },
  'midtown-office|nearest-car': { waitMeanS: 1625.3073142849905, waitP95S: 2778.5301723158727, rideMeanS: 101.4917970264325, ttdMeanS: 1726.7991113114228, workKJ: 1485.6773233378524, workPerLegKJ: 7.541509255522094, handlingPct: 4.035087719298246, longestWaitS: 2906.760720955624 },
  'midtown-office|eta': { waitMeanS: 803.5837920145476, waitP95S: 1451.3328596031365, rideMeanS: 103.1891892481786, ttdMeanS: 906.772981262727, workKJ: 2143.0568396923136, workPerLegKJ: 10.87846111518941, handlingPct: 4.7953216374269, longestWaitS: 1482.5906698639715 },
  'midtown-office|collective': { waitMeanS: 791.9363372638369, waitP95S: 1415.12165477437, rideMeanS: 100.09924603990174, ttdMeanS: 892.0355833037382, workKJ: 2285.0767835145743, workPerLegKJ: 11.599374535606977, handlingPct: 4.619883040935672, longestWaitS: 1436.744534680982 },
  'mixed-use-high-rise|nearest-car': { waitMeanS: 145.55932170547212, waitP95S: 382.66480657762986, rideMeanS: 87.71659701524483, ttdMeanS: 306.6194441822547, workKJ: 20187.25418119246, workPerLegKJ: 75.32557530295693, handlingPct: 8.743409490333919, longestWaitS: 403.9571933061047 },
  'mixed-use-high-rise|eta': { waitMeanS: 18.677243897186987, waitP95S: 47.866201988667136, rideMeanS: 88.45922413158152, ttdMeanS: 133.67971334875568, workKJ: 27869.788231567258, workPerLegKJ: 108.02243500607464, handlingPct: 9.182776801405975, longestWaitS: 64.81390615945668 },
  'mixed-use-high-rise|collective': { waitMeanS: 22.263212841048855, waitP95S: 64.98740058634255, rideMeanS: 80.88911937790147, ttdMeanS: 128.49625251724177, workKJ: 33817.25292375409, workPerLegKJ: 132.61667813236897, handlingPct: 9.358523725834798, longestWaitS: 97.59904714023628 },
  'secure-tower|nearest-car': { waitMeanS: 117.50578060891134, waitP95S: 236.49202767237338, rideMeanS: 99.05396066082899, ttdMeanS: 224.9833335727993, workKJ: 3692.412283657347, workPerLegKJ: 27.351202101165534, handlingPct: 6.754032258064516, longestWaitS: 261.24994780096097 },
  'secure-tower|eta': { waitMeanS: 33.18829302490414, waitP95S: 86.37592396911488, rideMeanS: 100.83803786988547, ttdMeanS: 139.19270979268728, workKJ: 6256.948630612125, workPerLegKJ: 46.347767634163894, handlingPct: 10.483870967741936, longestWaitS: 91.88634249324991 },
  'secure-tower|collective': { waitMeanS: 28.077489232750207, waitP95S: 103.06062675292485, rideMeanS: 95.86154920637641, ttdMeanS: 127.06784142193546, workKJ: 6714.034768258036, workPerLegKJ: 49.73359087598545, handlingPct: 11.088709677419354, longestWaitS: 166.82792671858385 },
  'vertical-city|nearest-car': { waitMeanS: 97.13014568650004, waitP95S: 337.25608353894995, rideMeanS: 82.74957073652443, ttdMeanS: 308.15939581212535, workKJ: 56214.400543239244, workPerLegKJ: 63.233296449088016, handlingPct: 12.461632903621854, longestWaitS: 507.52118017113503 },
  'vertical-city|eta': { waitMeanS: 23.152778551459914, waitP95S: 66.97290344311216, rideMeanS: 81.27008148592162, ttdMeanS: 181.66679441775838, workKJ: 64522.176112578585, workPerLegKJ: 74.24876422621242, handlingPct: 12.482095355023532, longestWaitS: 137.6494509933474 },
  'vertical-city|collective': { waitMeanS: 27.225913682314914, waitP95S: 97.11772561190551, rideMeanS: 78.78784705110202, ttdMeanS: 183.5741238700387, workKJ: 71945.19279067186, workPerLegKJ: 80.47560714840253, handlingPct: 12.318395743810107, longestWaitS: 148.6349797575955 },
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
