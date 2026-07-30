/**
 * Turning one integer into one configuration of the experience layer.
 *
 * ## Why the space is shipped values and not generated ones
 *
 * `fuzz/generate.ts` invents buildings, because the claim it searches — *"nobody vanishes"* — is
 * a claim about **any** building, authored or not. The claim this directory searches is narrower
 * and is stated that way in [§ D163](../../../../DECISIONS.md): *"a generated sweep over
 * (building × shipped dispatcher × seed × mode)"*. It is a claim about the strings the shipped
 * product prints on the configurations a player can actually reach, so the space is the shipped
 * buildings, the shipped dispatcher profiles and the shipped campaign stages, swept over seeds
 * and over the two dials the viewer exposes — demand and horizon.
 *
 * Inventing a building here would search a product nobody can run, and it would do it at 200 ms
 * a replication.
 *
 * ## What is generated, and why each axis is in
 *
 * | axis | why |
 * |---|---|
 * | building | **M1**: 14 of 60 building × dispatcher cells produce a quotable mean, and 12 of the 14 are one building. The suppressed half of that table is where R3 lives. |
 * | dispatcher (two arms) | R2 is a rule about *comparisons*, so a case carries a baseline and a candidate. They are drawn independently, so the identical-arm control is generated rather than special-cased. |
 * | seed | **M7**: the same configuration returns a quotable AWT on 6 of 20 consecutive seeds and is diagnosed saturated on 4. Quotability is a property of the seed, not only of the building. |
 * | duration | The window is what `waitCount` is counted over, and R13's sharp clause is about a sample of five. A short horizon is how the search reaches it. |
 * | demand | **M8**: quotability is *not monotone in demand at a single seed*. The viewer ships this as a control, so the search sweeps it. |
 * | replications | R2 and R13 are both rules about `n`, and `batch/report.ts`'s own `budgetNote` exists because the panel accepts any integer ≥ 1. |
 * | stage | The campaign surfaces take a stage, not a building; a case that names one drives them. |
 * | mode | § D163's fourth dimension. One value today — see {@link HONESTY_MODES}. |
 *
 * ## Determinism
 *
 * Every draw comes from the `policyNoise` stream of a `StreamSet` constructed from the case seed
 * alone (CLAUDE.md invariant 2 — the stream is named, and it is the one stream in `STREAM_NAMES`
 * that no simulation this file configures will itself consume for generation). There is no
 * `Math.random()` and no clock.
 */

import { StreamSet, type Rng } from '@elevator-sim/core/browser';

import { HONESTY_MODES, type HonestyCase, type HonestyMode } from './types.js';

/**
 * A campaign stage a case may name, with the building it declares.
 *
 * The building is carried here rather than looked up, because a case that named a stage on one
 * building and ran its batch on another would be judging a stage's goals against a batch the
 * stage never ran — and it would look exactly like a case that worked.
 */
export interface HonestyStageRef {
  readonly id: string;
  readonly buildingId: string;
}

/** The axes a corpus may be drawn over. Stated as data so a deep campaign is a wider space, not more code. */
export interface HonestySpace {
  readonly buildingIds: readonly string[];
  readonly dispatcherProfileIds: readonly string[];
  /** Stages a case may name. Empty means no case drives a campaign surface. */
  readonly stages: readonly HonestyStageRef[];
  readonly minDurationS: number;
  readonly maxDurationS: number;
  /** Demand overrides drawn from, plus `null` for the building's own profile. */
  readonly arrivalRatesPctPop5min: readonly number[];
  readonly minReplications: number;
  readonly maxReplications: number;
  /** Probability a case names a stage, when the space has any. */
  readonly stageProbability: number;
  /** Probability a case overrides the building's own demand. */
  readonly demandOverrideProbability: number;
  /** Probability the two arms name the same profile — the identical-arm control. */
  readonly identicalArmProbability: number;
  readonly modes: readonly HonestyMode[];
}

/**
 * Everything the generator needs from the loaded reference data.
 *
 * Handed in rather than read, for the reason `fuzz/run.ts` gives: which dispatcher runs is data
 * (CLAUDE.md invariant 7), and a generator that hard-coded a profile id would be a branch on a
 * strategy name in the one place nobody looks for one.
 */
export interface GenerateOptions {
  readonly space: HonestySpace;
}

/**
 * The always-on space.
 *
 * Bounded by wall clock rather than by ambition: the whole suite is ~200 s of CI on an idle
 * machine and a track that added ten minutes would be turned off within a week. Horizons stay at
 * or below 900 s — the viewer's own — and replications stay small, because the always-on tier is
 * a **regression** suite over the shapes the deep tier found, not a survey.
 *
 * `replications` deliberately reaches below `MIN_REPLICATION_BUDGET`. That is not sloppiness: the
 * viewer's replication control accepts any integer ≥ 1 (`dev/batchPanel.ts` refuses only `< 1`),
 * so a batch of four is a configuration a reader can produce, and R2 is precisely a rule about
 * what may be said over one. **That decision paid**: it is what produced § D171's second finding
 * — a winner named at n = 7 — and it is what now exercises `batch/report.ts`'s `under-budget`
 * verdict on every case in this tier.
 */
export const STANDARD_SPACE: HonestySpace = Object.freeze({
  buildingIds: Object.freeze([
    'garden-apartments',
    'midtown-office',
    'mixed-use-high-rise',
    'secure-tower',
    'vertical-city',
  ]),
  dispatcherProfileIds: Object.freeze([
    'nearest-car',
    'collective',
    'eta',
    'energy-aware',
    'zoned-uppeak',
    'predictive-balanced',
    'destination-panel',
  ]),
  stages: Object.freeze([] as HonestyStageRef[]),
  minDurationS: 600,
  maxDurationS: 900,
  arrivalRatesPctPop5min: Object.freeze([3, 5, 8, 12]),
  minReplications: 2,
  maxReplications: 8,
  stageProbability: 0,
  demandOverrideProbability: 0.5,
  identicalArmProbability: 0.15,
  modes: HONESTY_MODES,
});

/**
 * The opt-in deep space: every shipped stage, longer horizons, and batches inside the budget.
 *
 * This is the only place a batch reaches `MIN_REPLICATION_BUDGET`, because 50 replications of
 * Vertical City is ten seconds and the always-on tier cannot spend it. It is also the only place
 * the campaign surfaces are driven, since a stage's own `replications` is 50.
 */
export const DEEP_SPACE: HonestySpace = Object.freeze({
  ...STANDARD_SPACE,
  minDurationS: 600,
  maxDurationS: 1800,
  arrivalRatesPctPop5min: Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, 16]),
  minReplications: 2,
  maxReplications: 60,
  stageProbability: 0.35,
  /**
   * Every shipped stage, with its declared building.
   *
   * Pinned rather than read from `data/campaign.json`, for `STANDARD_CORPUS`'s reason: a space
   * that changed under the corpus would silently change what the pinned seeds mean.
   * `honesty.test.ts` asserts this list against the parsed campaign in both directions, so a
   * stage added to `data/` and not added here is red rather than quietly unsearched.
   */
  stages: Object.freeze([
    { id: 'stage-1-first-call', buildingId: 'garden-apartments' },
    { id: 'stage-2-morning-rush', buildingId: 'midtown-office' },
    { id: 'stage-3-overwhelmed', buildingId: 'midtown-office' },
    { id: 'stage-4-two-banks', buildingId: 'mixed-use-high-rise' },
    { id: 'stage-5-credentials', buildingId: 'secure-tower' },
    { id: 'stage-6-the-tall-one', buildingId: 'vertical-city' },
    { id: 'stage-7-prove-it', buildingId: 'midtown-office' },
  ] as HonestyStageRef[]),
});

function pick<T>(rng: Rng, items: readonly T[]): T {
  const chosen = items[rng.nextInt(0, items.length)];
  /* c8 ignore next -- nextInt is in range by construction; this narrows the type. */
  if (chosen === undefined) throw new Error('cannot draw from an empty list');
  return chosen;
}

/**
 * The case seed `honestySeed` maps to, deterministically and with no relation to the case's own
 * fields.
 *
 * Derived through `StreamSet`'s own name-mixing rather than by arithmetic on the seed, so two
 * adjacent generator seeds do not produce two adjacent simulation seeds — adjacent PCG seeds are
 * not adjacent traces, but adjacent *stream* seeds are not either, and going through the shipped
 * derivation is one fewer thing to be wrong about.
 */
function simSeedFor(honestySeed: number): bigint {
  const rng = new StreamSet(BigInt(honestySeed)).stream('arrivals');
  return BigInt(rng.nextInt(1, 2_000_000_000)) * 1_000_003n + BigInt(honestySeed);
}

/**
 * One case, a pure function of one integer.
 *
 * @throws Error if the space names no building, no dispatcher or no mode — an empty axis is a
 *   configuration defect and must not silently become a corpus of zero cases.
 */
export function caseFromSeed(honestySeed: number, options: GenerateOptions): HonestyCase {
  const { space } = options;
  if (space.buildingIds.length === 0 || space.dispatcherProfileIds.length === 0) {
    throw new Error('honesty space must name at least one building and one dispatcher profile');
  }
  if (space.modes.length === 0) throw new Error('honesty space must name at least one mode');

  const rng = new StreamSet(BigInt(honestySeed)).stream('policyNoise');
  const tags: string[] = [];

  /*
   * The stage is drawn **first**, because a stage decides the building. A case that named a stage
   * on one building and ran its batch on another would judge a stage's goals against a batch the
   * stage never ran, and would look exactly like a case that worked.
   */
  const wantsStage = space.stages.length > 0 && rng.nextFloat() < space.stageProbability;
  const stage = wantsStage ? pick(rng, space.stages) : undefined;
  const stageId = stage?.id ?? null;
  if (stage !== undefined) tags.push('stage');

  const buildingId = stage?.buildingId ?? pick(rng, space.buildingIds);
  const baselineProfileId = pick(rng, space.dispatcherProfileIds);
  const identical = rng.nextFloat() < space.identicalArmProbability;
  const candidateProfileId = identical ? baselineProfileId : pick(rng, space.dispatcherProfileIds);
  if (candidateProfileId === baselineProfileId) tags.push('identical-arms');

  const durationS =
    space.minDurationS === space.maxDurationS
      ? space.minDurationS
      : 60 * rng.nextIntInclusive(Math.ceil(space.minDurationS / 60), Math.floor(space.maxDurationS / 60));

  const overrideDemand =
    space.arrivalRatesPctPop5min.length > 0 && rng.nextFloat() < space.demandOverrideProbability;
  const arrivalRatePctPop5min = overrideDemand ? pick(rng, space.arrivalRatesPctPop5min) : null;
  if (overrideDemand) tags.push(`demand-${String(arrivalRatePctPop5min)}`);

  const replications = rng.nextIntInclusive(space.minReplications, space.maxReplications);
  if (replications < 50) tags.push('under-budget');

  const mode = pick(rng, space.modes);

  return Object.freeze({
    caseId: `honesty-${String(honestySeed)}`,
    honestySeed: String(honestySeed),
    simSeed: String(simSeedFor(honestySeed)),
    buildingId,
    baselineProfileId,
    candidateProfileId,
    durationS,
    arrivalRatePctPop5min,
    replications,
    stageId,
    mode,
    tags: Object.freeze(tags),
  });
}

/** A case printed in full, so a counterexample is replayable from the report alone. */
export function formatHonestyCase(honestyCase: HonestyCase): string {
  return JSON.stringify(honestyCase, null, 2);
}
