/**
 * `engagement/` — the three fun proxies the playtest director computes from a run's own series
 * (§ D1595).
 *
 * | Module | Owns |
 * |---|---|
 * | `bands.ts` | `data/engagement-bands.json`, parsed with validation that refuses an unknown key or metric |
 * | `counts.ts` | `k of n` with its Wilson interval, the one paired comparison, and AWT and WT95 beside |
 * | `tension.ts` | proxy 2: queue swing and direction per replication, classified against the band |
 * | `choice.ts` | proxy 1: each choice against the log without it, and the rate as counts |
 * | `mastery.ts` | proxy 3: the slope of the game's own pass verdicts over attempt index |
 * | `runs.ts` | the stage's own baseline arm on its tuning and its holdout seed set |
 *
 * **Every proxy is an unmeasured premise about people** until a human ground-truth set calibrates it,
 * and nothing here is marked `Measured`. They are axes: none is weighted, summed into a fun index, or
 * graded, and each is printed beside AWT and WT95. Any comparison of two arms is a paired-t interval
 * that excludes zero, on common random numbers; any single-arm rate is `k of n` with its interval.
 *
 * The named non-test caller is `elevator-sim fuzz --scenario <id> --engagement`
 * (`packages/cli/src/commands/fuzzEngagement.ts`), which reads `data/` itself so that everything here
 * stays a function of its arguments. `bands.ts` and `mastery.ts` have a second caller through the
 * environment-free barrel: the viewer's mastery harness (`campaign/masteryHarness.ts`, § D1601),
 * whose own consumer is a gated deriver rather than a shipped path.
 */

export {
  EngagementBandsError,
  MAX_ENGAGEMENT_REPLICATIONS,
  SWING_METRICS,
  parseEngagementBands,
  tensionBandFor,
} from './bands.js';
export type {
  EngagementBands,
  MasterySlopeBands,
  MeaningfulChoiceBands,
  ResolvedTensionBand,
  SwingMetric,
  TensionBand,
  TensionBandEdges,
} from './bands.js';

export { formatKOfN, pairedComparison, waitFiguresOf } from './counts.js';
export type { KOfN, PairedComparison, PairedVerdict, WaitFigures } from './counts.js';

export {
  TENSION_CLASSES,
  pairedTension,
  tallyTension,
  tensionMismatches,
  tensionOf,
  tensionSeriesOf,
} from './tension.js';
export type {
  FeltRun,
  FeltTension,
  TensionClass,
  TensionMismatches,
  TensionReading,
  TensionRecord,
  TensionSeries,
  TensionSummary,
  TensionTally,
} from './tension.js';

export {
  beliefDisagreements,
  engineBaselineChoices,
  judgeChoice,
  meaningfulChoiceRate,
  measureChoices,
  notYetReplayable,
} from './choice.js';
export type {
  BeliefDisagreements,
  ChoiceArms,
  ChoiceBelief,
  ChoiceRate,
  ChoiceStatus,
  ChoiceVerdict,
} from './choice.js';

export { masterySlopeOf, pairedMasterySlope } from './mastery.js';
export type { MasteryAttempt, MasterySlope, MasteryVerdict, PairedMasterySlope } from './mastery.js';

export { stageBaselineRuns } from './runs.js';
