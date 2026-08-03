/**
 * **The driver for the five studies that publish counts instead of intervals.**
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/livenessSuite.js
 * ```
 *
 * `published.ts` § `STUDY_ENTRY_POINTS` splits `benchmark/` in two. Everything mapped to a
 * `PublishedStudyId` publishes a confidence interval, and every one of those has a non-test caller:
 * `regeneratePins.ts` runs them all, because a pin table has to be regenerable from the code that
 * produced it. Everything mapped to `'no-intervals'` publishes counts — evaluations, cross-car
 * spread, refusals by reason, allocation divergences, a sign on a difference — and until this
 * module existed **not one of the five had any caller outside its own test**.
 *
 * That is the defect this repository has shipped nine times, in the half of the directory written
 * to prevent it. `measureEnergyLiveness` was the ninth: its only importers were two barrels, a
 * string key in `published.ts` and `energyLiveness.test.ts`, so the repository's own scanner
 * reported `measureEnergyLiveness -> []`. A barrel re-export is reachability and a `{@link}` tag is
 * neither; the rule is *name the non-test caller* (docs/05-roadmap.md § Standing requirement), and
 * for the categorical half of `benchmark/` there was no name to give.
 *
 * So the fix is symmetric rather than special-cased. The interval half has a driver; the
 * categorical half now has one too, and `src/index.test.ts` asserts — over the **derived** entry
 * point set, not a hand-written list — that every study in either half has one. A sixth categorical
 * study added tomorrow fails that assertion until it is wired in here.
 *
 * ## What this module is not
 *
 * It is **not** a test and it asserts nothing. Each of the five already has a suite that asserts
 * its own claim, at its own budget, and duplicating those thresholds here would create a second
 * place for them to drift. This prints what the five measured, in one pass, so a reader can
 * reproduce the counts the docs quote — the same relationship `regeneratePins.ts` has to the pins.
 *
 * ## Cost
 *
 * The five run four full `Simulation`s (destination liveness runs seven cases plus references),
 * two 24-replication experiments and a 1200-state ensemble. That is minutes, not seconds, which is
 * why this is a command rather than something the always-on tier calls.
 */

import { measureAuctionAggregation, measureMultiRoundReachability } from './auctionAggregation.js';
import { measureDestinationLiveness } from './destinationLiveness.js';
import { measureDiversionAt, measureShippedAt } from './enRouteDiversion.js';
import { measureEnergyLiveness } from './energyLiveness.js';
import { formatLunchTwoWayMix, measureLunchTwoWayMix } from './lunchTwoWay.js';
import { measurePredictorLag } from './predictorLag.js';
import {
  measureWeightSetSelectionLiveness,
  runDeadbandKnownAnswer,
} from './weightSetSelection.js';

import type { AuctionEnsembleResult, MultiRoundReachability } from './auctionAggregation.js';
import type { DestinationLiveness } from './destinationLiveness.js';
import type { DiversionCell } from './enRouteDiversion.js';
import type { EnergyLivenessStudy } from './energyLiveness.js';
import type { LunchTwoWayMixStudy } from './lunchTwoWay.js';
import type { PredictorLagStudy } from './predictorLag.js';
import type {
  DeadbandKnownAnswer,
  WeightSetLivenessResult,
} from './weightSetSelection.js';

/** Everything the categorical half of `benchmark/` measured, in one pass. */
export interface LivenessSuiteResult {
  readonly predictorLag: PredictorLagStudy;
  readonly auctionAggregation: AuctionEnsembleResult;
  readonly multiRoundReachability: MultiRoundReachability;
  readonly destination: readonly DestinationLiveness[];
  readonly energy: EnergyLivenessStudy;
  /** Does the weight-set selector change **car trajectories**? Wave 6's addition. */
  readonly weightSets: WeightSetLivenessResult;
  /**
   * The 2 s deadband, rediscovered — or not — by the same search that fitted Phase 6c's policy.
   *
   * Categorical for the same reason the rest of this suite is: the answer is a threshold in
   * seconds against a published one, not an interval. It lives beside the liveness measurements
   * because it is the check that the *machinery* works, and a liveness proof of a fitted policy is
   * worth nothing if the fitting procedure cannot find a known optimum.
   */
  readonly deadband: DeadbandKnownAnswer;
  /**
   * Does the lunch two-way template's directional mix actually move? Wave 9's addition.
   *
   * Categorical for the same reason the rest is: a chi-square over a time-bin x direction table
   * and its worst standardized residual, against the same table shape `DECISIONS.md` § D156
   * measured the shipped templates flat over. It constructs no `Simulation` — § D162 condition 3
   * forbids a selector result in the commit that adds the template — so it costs seconds.
   */
  readonly lunchTwoWayMix: LunchTwoWayMixStudy;
  /**
   * What en-route diversion is worth, at the two rates whose AWT interval is quotable.
   *
   * The odd one out here, and deliberately so: it is the only member that *computes* confidence
   * intervals. It is categorical anyway because nothing in the repository asserts its values —
   * `enRouteDiversion.test.ts` asserts the apparatus (paired, live, quotable) and prints the
   * numbers. So there is no pin for `regeneratePins.ts` to regenerate, and the study belongs to
   * the half of `benchmark/` this module drives. `DECISIONS.md` § D205 records that adopting
   * `eligibility.enRouteDiversion` on a shipped profile is what would move it to the other half.
   */
  readonly enRouteDiversion: readonly DiversionCell[];
  /** The same cells, comparing the profile **as shipped** rather than the isolated mechanism. */
  readonly shippedDiversion: readonly DiversionCell[];
}

export interface LivenessSuiteOptions {
  /**
   * Narrow the two that dominate the wall clock — destination liveness (seven instrumented runs
   * plus two reference runs) and energy liveness (2 × 24 replications).
   *
   * **Off by default, and the default is the point.** A driver whose default skipped the expensive
   * half of what it drives would be the same shape of untruth this module exists to close: it would
   * name a caller that never calls. `--fast` exists so that a reader checking the cheap three does
   * not have to pay for the expensive two, and {@link LivenessSuiteResult.destination} is empty
   * rather than zero-filled when it is set, so a narrowed run cannot be mistaken for a full one.
   */
  readonly fastOnly?: boolean | undefined;
  readonly seed?: number | undefined;
}

/** Run all five categorical studies at their shipped defaults. */
export async function runLivenessSuite(
  options: LivenessSuiteOptions = {},
): Promise<LivenessSuiteResult> {
  const seedOption = options.seed === undefined ? {} : { seed: options.seed };

  const predictorLag = measurePredictorLag();
  const auctionAggregation = await measureAuctionAggregation(seedOption);
  const multiRoundReachability = await measureMultiRoundReachability(undefined, seedOption);

  // The expensive pair. `fastOnly` narrows the two multi-run studies to a single replication each
  // rather than dropping them, so every field below is still populated and a caller cannot mistake
  // a skipped study for one that measured zero.
  const destination = options.fastOnly === true ? [] : await measureDestinationLiveness(seedOption);
  const energy = await measureEnergyLiveness(
    options.fastOnly === true ? { ...seedOption, replications: 2 } : seedOption,
  );

  const weightSets = await measureWeightSetSelectionLiveness(seedOption);
  // `fastOnly` narrows the draw count rather than dropping the run, so `rediscovered` is still a
  // measured field — and at 32 draws it is measured **false**, which is the honest answer at that
  // budget and not a skipped study wearing a zero.
  const deadband = await runDeadbandKnownAnswer(
    options.fastOnly === true ? { ...seedOption, candidates: 32, replications: 12 } : seedOption,
  );

  // Trace generation only, so `fastOnly` narrows it rather than dropping it — and narrowing it
  // still leaves every field measured, which is this driver's own rule about skipped studies.
  const lunchTwoWayMix = await measureLunchTwoWayMix({
    ...seedOption,
    ...(options.fastOnly === true ? { replications: 8 } : {}),
  });

  // Two paired experiments at 50 replications each, so `fastOnly` narrows the budget rather than
  // dropping the cells — the same rule the rest of this driver follows. A narrowed run still
  // populates every field, and `live` is still measured rather than assumed.
  const enRouteDiversion: DiversionCell[] = [];
  for (const point of [
    { building: 'midtown-office', rate: 1 },
    { building: 'midtown-office', rate: 2 },
    { building: 'garden-apartments', rate: 10 },
    { building: 'garden-apartments', rate: 14 },
  ]) {
    enRouteDiversion.push(await measureDiversionAt(point, options.fastOnly === true ? 8 : 50));
  }
  // The deployment contrast beside the mechanism one. Both, because they gave different answers:
  // isolated, diversion is a trade; as shipped, with `detourPenalty` pricing it, it is not.
  const shippedDiversion: DiversionCell[] = [];
  for (const point of [
    { building: 'midtown-office', rate: 1 },
    { building: 'vertical-city', rate: 4, callType: 'mobile-credential' as const },
  ]) {
    shippedDiversion.push(await measureShippedAt(point, options.fastOnly === true ? 8 : 50));
  }

  return Object.freeze({
    predictorLag,
    auctionAggregation,
    multiRoundReachability,
    destination,
    energy,
    weightSets,
    deadband,
    lunchTwoWayMix,
    enRouteDiversion: Object.freeze(enRouteDiversion),
    shippedDiversion: Object.freeze(shippedDiversion),
  });
}

const histogram = (counts: Readonly<Record<string | number, number>>): string => {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([key, n]) => `${key}=${n}`).join(' ');
};

const seconds = (value: number | undefined): string =>
  value === undefined ? 'never' : `${value.toFixed(1)} s`;

/** The whole suite as a table, for the command shell and for a reader reproducing a quoted count. */
export function formatLivenessSuite(result: LivenessSuiteResult): string {
  const lines: string[] = ['Categorical studies — counts, no intervals', ''];

  lines.push('predictor lag (predictorLag.ts)');
  lines.push(
    `  samples=${result.predictorLag.samples.length} bucket=${result.predictorLag.bucketWidthS} s ` +
      `shiftAt=${result.predictorLag.shiftAtS} s firstResponse=${seconds(result.predictorLag.firstResponseAtS)} ` +
      `crossover=${seconds(result.predictorLag.crossoverAtS)} lag=${seconds(result.predictorLag.lagS)} ` +
      `anticipatory=${result.predictorLag.anticipatorySamples.length} causal=${String(result.predictorLag.causal)}`,
  );

  lines.push('', 'auction aggregation (auctionAggregation.ts)');
  lines.push(
    `  states=${result.auctionAggregation.states} ` +
      `sealedEqualsArgmin=${String(result.auctionAggregation.sealedEqualsArgmin)} ` +
      `sealedDisagreements=${result.auctionAggregation.sealedDisagreements.length} ` +
      `costDisagreements=${result.auctionAggregation.costDisagreements.length} ` +
      `unallocatable=${result.auctionAggregation.unallocatableStates.length} ` +
      `multiRoundDivergences=${result.auctionAggregation.multiRoundDivergences.length} ` +
      `(rate ${result.auctionAggregation.divergenceRate.toFixed(4)}) waived=${result.auctionAggregation.waivedCount}`,
  );
  lines.push(`  withdrawals: ${histogram(result.auctionAggregation.withdrawalsByReason)}`);

  lines.push('', 'multi-round reachability (auctionAggregation.ts)');
  lines.push(
    `  profile=${result.multiRoundReachability.profileId} rounds=${result.multiRoundReachability.resolvedRounds} ` +
      `policy=${result.multiRoundReachability.policyClass} auctions=${result.multiRoundReachability.auctionsHeld} ` +
      `pastRoundOne=${result.multiRoundReachability.auctionsPastRoundOne} ` +
      `divergedFromArgmin=${result.multiRoundReachability.divergedFromArgmin}`,
  );
  lines.push(`  rounds: ${histogram(result.multiRoundReachability.roundHistogram)}`);
  lines.push(`  withdrawals: ${histogram(result.multiRoundReachability.withdrawalsByReason)}`);

  lines.push('', 'destination liveness (destinationLiveness.ts)');
  if (result.destination.length === 0) lines.push('  skipped (fastOnly)');
  for (const measurement of result.destination) {
    lines.push(`  ${measurement.label}`);
    lines.push(
      `    building=${measurement.building} callType=${measurement.callType} ` +
        `weights.rideTime=${measurement.weightsRideTime} decisions=${measurement.totalDecisions}`,
    );
    lines.push(
      `    rideTime: evaluations=${measurement.ridePricing.evaluations} ` +
        `nonZero=${measurement.ridePricing.nonZero} ` +
        `spread=${measurement.ridePricing.decisionsWithSpread}/${measurement.ridePricing.decisions}`,
    );
    lines.push(
      `    eligibility: verdicts=${measurement.eligibility.verdicts} ` +
        `accessRefusals=${measurement.eligibility.accessRefusals} ` +
        `mixed=${measurement.eligibility.decisionsWithMixedEligibility} ` +
        `whollyRefused=${measurement.eligibility.decisionsWhollyRefused}`,
    );
    lines.push(
      `    panel: model=${measurement.panel.passengerModel} legs=${measurement.panel.legs} ` +
        `promised=${measurement.panel.promisedLegs} wrongCar=${measurement.panel.wrongCarBoardings} ` +
        `brokenPromises=${measurement.panel.brokenPromises} ` +
        `differentCar=${measurement.panel.differentCarThanConventional}/${measurement.panel.comparedLegs}`,
    );
  }

  lines.push('', 'energy liveness (energyLiveness.ts)');
  lines.push(
    `  replications=${result.energy.replications} separates=${String(result.energy.separates)} ` +
      `lobby−stay work=${result.energy.workDifferenceKJ.toFixed(3)} kJ`,
  );
  for (const arm of result.energy.arms) {
    lines.push(
      `    ${arm.armId}: work=${arm.meanWorkKJ.toFixed(3)} kJ distance=${arm.meanDistanceM.toFixed(1)} m ` +
        `starts=${arm.meanStarts.toFixed(1)} unmeasured=${arm.unmeasuredReplications}`,
    );
  }

  lines.push('', 'weight-set selection (weightSetSelection.ts)');
  const weightSets = result.weightSets;
  lines.push(
    `  building=${weightSets.building} profile=${weightSets.profileId} ` +
      `patterns=${weightSets.patternsVisited.length === 0 ? 'none' : weightSets.patternsVisited.join('>')} ` +
      `switches=${weightSets.switches}`,
  );
  lines.push(
    `  shippedVsPermutedMap: identical=${String(weightSets.weightSetContrast.identical)} ` +
      `moves=${weightSets.weightSetContrast.movesA}/${weightSets.weightSetContrast.movesB} ` +
      `firstDivergence=${weightSets.weightSetContrast.firstDivergence ?? 'none'}`,
  );
  lines.push(
    `  selectorOnVsOff: identical=${String(weightSets.selectorContrast.identical)} ` +
      `offIsIdenticalToNoOptions=${String(weightSets.offIsIdentical)}`,
  );

  lines.push('', 'the 2 s deadband, known answer (weightSetSelection.ts)');
  lines.push(
    `  shipped=${result.deadband.shippedThresholdS} s knownOptimum=${result.deadband.knownOptimumS} s ` +
      `candidates=${result.deadband.candidates.length} ` +
      `winner=${result.deadband.winnerThresholdS.toFixed(3)} s ` +
      `ΔAWT=${result.deadband.winnerMeanDeltaAwtS.toFixed(4)} s ` +
      `rediscovered=${String(result.deadband.rediscovered)}`,
  );

  lines.push('', 'lunch two-way mix (lunchTwoWay.ts)');
  lines.push(...formatLunchTwoWayMix(result.lunchTwoWayMix));

  lines.push('', 'en-route diversion (enRouteDiversion.ts) — collective-enroute − collective, paired-t 95 %');
  for (const cell of [...result.enRouteDiversion, ...result.shippedDiversion]) {
    lines.push(
      `  ${cell.building} ${String(cell.rate)}% n=${String(cell.waiting.n)} ` +
        `ΔAWT=${cell.waiting.estimate.mean.toFixed(3)} ` +
        `[${cell.waiting.estimate.lower.toFixed(3)}, ${cell.waiting.estimate.upper.toFixed(3)}] ` +
        `excludesZero=${String(cell.waiting.significant)} ` +
        `live=${String(cell.live)} crn=${String(cell.commonRandomNumbers)} ` +
        `awtValid=${String(cell.awtIsValid)}`,
    );
  }

  return lines.join('\n');
}

/* c8 ignore start -- the command shell; `formatLivenessSuite` is what the suite exercises. */
if (process.argv[1]?.endsWith('livenessSuite.js') === true) {
  const fastOnly = process.argv.includes('--fast');
  process.stdout.write(`${formatLivenessSuite(await runLivenessSuite({ fastOnly }))}\n`);
}
/* c8 ignore stop */
