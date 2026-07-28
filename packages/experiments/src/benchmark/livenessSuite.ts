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
import { measureEnergyLiveness } from './energyLiveness.js';
import { measurePredictorLag } from './predictorLag.js';

import type { AuctionEnsembleResult, MultiRoundReachability } from './auctionAggregation.js';
import type { DestinationLiveness } from './destinationLiveness.js';
import type { EnergyLivenessStudy } from './energyLiveness.js';
import type { PredictorLagStudy } from './predictorLag.js';

/** Everything the categorical half of `benchmark/` measured, in one pass. */
export interface LivenessSuiteResult {
  readonly predictorLag: PredictorLagStudy;
  readonly auctionAggregation: AuctionEnsembleResult;
  readonly multiRoundReachability: MultiRoundReachability;
  readonly destination: readonly DestinationLiveness[];
  readonly energy: EnergyLivenessStudy;
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

  return Object.freeze({
    predictorLag,
    auctionAggregation,
    multiRoundReachability,
    destination,
    energy,
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

  return lines.join('\n');
}

/* c8 ignore start -- the command shell; `formatLivenessSuite` is what the suite exercises. */
if (process.argv[1]?.endsWith('livenessSuite.js') === true) {
  const fastOnly = process.argv.includes('--fast');
  process.stdout.write(`${formatLivenessSuite(await runLivenessSuite({ fastOnly }))}\n`);
}
/* c8 ignore stop */
