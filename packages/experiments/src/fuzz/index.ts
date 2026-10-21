/**
 * `fuzz/` — Phase 8's property-based fuzzing track.
 *
 * Randomized **buildings**, not just randomized seeds, checked against the six invariants
 * `docs/07-handoff.md` § 7 requires of any configuration:
 *
 * ```ts
 * import { loadConfig } from '@elevator-sim/core';
 * import { runCampaign, STANDARD_CORPUS, formatStats } from '@elevator-sim/experiments';
 *
 * const config = await loadConfig('data');
 * const campaign = runCampaign({ config, seeds: STANDARD_CORPUS });
 * console.log(formatStats(campaign.stats));
 * for (const failure of campaign.failures) console.log(formatOutcome(failure.minimal));
 * ```
 *
 * ## What is here
 *
 * | Module | Owns |
 * |---|---|
 * | `generate.ts` | randomized building configs, through the real schema |
 * | `properties.ts` | the six predicates, each re-derived from the trace and the record |
 * | `run.ts` | one case to one verdict, through the shipped `runSimulation` |
 * | `shrink.ts` | a 40-floor counterexample reduced to one somebody can read |
 * | `campaign.ts` | many cases, the always-on corpus, and what it cost |
 * | `faults.ts` | the deliberate breakages that prove each property can fail |
 * | `stageSession.ts` | a campaign stage read from its plain fields, and one replication of it (§ D1590) |
 * | `verbs.ts` | the adversarial persona's generator: a seeded verb log over the seven intervention kinds |
 * | `play.ts` | P-PLAY-1 to P-PLAY-3 over a finished session, beside the six above |
 * | `playShrink.ts` | a verb log reduced to the smallest one that still breaks, printed whole |
 * | `playCampaign.ts` | the persona's corpora, its pinned regressions, and the P-DESIGN-1 ranking |
 *
 * `releaseDirection.test.ts` is a gate rather than a module: the shipped-run measurements behind
 * § D1591 and § D1603, opt-in behind `ELEVATOR_SIM_FUZZ=deep` beside `deep.test.ts`.
 *
 * The gates are the `*.test.ts` files beside them and are not exported: `corpus.test.ts` (the
 * always-on 64), `deep.test.ts` (opt-in), `generate.test.ts` (the generator's contract *and* the
 * corpus's coverage claims), `faults.test.ts` (each property shown to fail), `shrink.test.ts`,
 * and `determinism.test.ts`, which re-establishes replay and common-random-numbers on generated
 * buildings rather than only on the five shipped ones.
 *
 * ## Environment
 *
 * `campaign.ts` reads `ELEVATOR_SIM_FUZZ` and `ELEVATOR_SIM_FUZZ_CASES` and is the only module
 * here that touches the environment; the rest are pure functions of their arguments. `run.ts`
 * needs a `LoadedConfig`, so it is as environment-bound as the rest of this package's gates.
 * Nothing here draws a random number outside an injected `StreamSet` (CLAUDE.md invariant 2) or
 * reads a wall clock (invariant 3).
 */

export {
  DEEP_HYBRID_SPACE,
  DEEP_SPACE,
  HYBRID_CORPUS,
  HYBRID_SPACE,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  deepCampaignRequested,
  deepCampaignSize,
  deepHybridSeeds,
  deepSeeds,
  formatStats,
  runCampaign,
} from './campaign.js';
export type { CampaignOptions, CampaignResult } from './campaign.js';

export {
  refusedAnswer,
  refusingToDispatch,
  stallingAfter,
  starvingFloorUntil,
  withLostPassenger,
  withMisdelivery,
  withNegativeWait,
  withOverfilledCar,
} from './faults.js';
export type { RefusalPredicate } from './faults.js';

export {
  MIN_DURATION_BY_TEMPLATE,
  caseFromSeed,
  drawLandingCallTypes,
  minDurationFor,
  reparse,
  resolveCase,
} from './generate.js';
export type { FuzzSpace, GenerateOptions, LandingDraw } from './generate.js';

export {
  PROPERTY_CHECKS,
  checkAll,
  checkCapacity,
  checkConservation,
  checkDestination,
  checkMonotonicTime,
  checkStarvation,
  checkTermination,
} from './properties.js';
export type { PropertyContext } from './properties.js';

export {
  CORPUS_DISPATCHER_PROFILE_IDS,
  CORPUS_TRAFFIC_PROFILE_IDS,
  evaluateCase,
  fuzzSimulationConfigFor,
  generateOptionsFrom,
  isFailure,
  withCallType,
} from './run.js';
export type { RunOptions } from './run.js';

export { formatFuzzCase, formatOutcome, shrinkCase } from './shrink.js';
export type { ShrinkOptions, ShrinkResult } from './shrink.js';

export { FUZZ_PROPERTIES, FUZZ_SKIP_REASONS, FUZZ_TOPOLOGIES, PROPERTY_BOUNDS } from './types.js';
export type {
  CampaignStats,
  FuzzCase,
  FuzzOutcome,
  FuzzProperty,
  FuzzSkipReason,
  FuzzTopology,
  PropertyBounds,
  Violation,
} from './types.js';

/*
 * The adversarial persona — the verb-sequence axis. A stage's building held fixed, the player's log of
 * the seven intervention kinds fuzzed. `cli/src/commands/fuzz.ts` is its named non-test caller, through
 * `elevator-sim fuzz --scenario <id>`.
 */
export {
  PLAY_REGRESSIONS,
  STANDARD_PLAY_CORPUS,
  canonicalVerbs,
  deepPlaySeeds,
  formatPlayStats,
  playCaseFromPinned,
  playRegressionsFor,
  rankVerbs,
  runPlayCampaign,
} from './playCampaign.js';
export type {
  PinnedPlayCase,
  PlayCampaignOptions,
  PlayCampaignResult,
  PlayCampaignStats,
  VerbRankingRow,
  VerbVerdict,
} from './playCampaign.js';

export {
  PLAY_PROPERTIES,
  PlaySessions,
  checkNoSoftlock,
  checkReachableGoal,
  checkReadableVerdict,
  isPlayFailure,
  refusalGroundsOf,
} from './play.js';
export type { PlayFaults, PlayOutcome, PlayProperty, PlayViolation } from './play.js';

export {
  describePlayEntry,
  formatPlayCase,
  formatPlayOutcome,
  playLogJson,
  shrinkPlayCase,
} from './playShrink.js';
export type { PlayShrinkResult } from './playShrink.js';

export {
  PlayStageError,
  playSeedSetOf,
  playStageIdsOf,
  playStageOf,
  stageSessionConfigFor,
} from './stageSession.js';
export type {
  PlaySeedSet,
  PlayStage,
  PlayStageSeedSet,
  StageSessionResources,
} from './stageSession.js';

export {
  DEEP_PLAY_SPACE,
  PLAY_SHAPES,
  STANDARD_PLAY_SPACE,
  playCaseFromSeed,
  playContextFor,
  playLogRefusal,
  playLogSpend,
} from './verbs.js';
export type {
  PlayCar,
  PlayCase,
  PlayContext,
  PlayContextInput,
  PlayKind,
  PlayPurchase,
  PlayRangeBank,
  PlayShape,
  PlaySpace,
} from './verbs.js';
