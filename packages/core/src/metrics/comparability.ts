/**
 * **Which numbers survive a change of passenger model, and which stop meaning the same thing.**
 *
 * ```ts
 * const result = runSimulation({ ...cfg, dispatcherProfile: destinationDispatchProfile });
 * result.comparability.passengerModel;        // 'destination-dispatch'
 * result.comparability.notComparableMetrics;  // ['awtS', 'wt95S', … ] — nine of them
 * ```
 *
 * ## Why this is code and not a paragraph in a document
 *
 * Destination *dispatch* does not make a run worse or better at reporting AWT. It makes AWT a
 * **different quantity**: the number still has a definition and still computes, but the wait it
 * measures now contains the walk to a named car and excludes the option of boarding whichever car
 * arrives first, so a Level-0-versus-Level-1 difference on it is not interpretable as an
 * improvement. Nine of the nineteen replication metrics are like that
 * (docs/09-destination-dispatch-contract.md § 1.6). Ten are not, and `ttdMeanS` — the same
 * `journeyStartedAt → alightedAt` under both models, with the walk honestly inside it — is the
 * one the phase is gated on (DECISIONS.md § D27).
 *
 * A study that pairs one of the nine across the two models has reported a number that cannot be
 * read. That failure is silent by construction — the arithmetic is fine, the interval is narrow,
 * the sign is whatever it is — so the list is carried **as data on the run itself**, with the
 * reason attached to each entry, rather than as a sentence in a document that the code cannot
 * check and a reader can skip. `Simulation` reads it on every run: it stamps
 * {@link RunRecord.passengerModel} into the stored record so a persisted result carries its own
 * model, and raises a disclaimer naming these metrics whenever the model is not the conventional
 * one, in the same place and by the same mechanism as the double-deck disclaimer (DECISIONS.md
 * § D11, § D22).
 *
 * ## The list is asserted in both directions
 *
 * `comparability.test.ts` checks that every id here names a statistic `summarizeRun` actually
 * produces, and that the ten it does **not** name are exactly the rest. An entry for a metric
 * that no longer exists, or a metric that quietly appears and is neither listed nor excluded, is
 * a red test — which is the difference between this and a list that goes stale the way three
 * published figures in this repository did.
 */

import type { CallType, PassengerAssignmentMode } from '../config/types.js';

/**
 * The two passenger models this simulator can run.
 *
 * `conventional` covers both the up/down button and destination *disclosure*: the destination
 * reaches the cost request earlier, and the passenger still walks to whichever car opens. Only
 * `dispatch.passengerAssignment: 'panel'` changes what a passenger *is*.
 */
export const PASSENGER_MODELS = ['conventional', 'destination-dispatch'] as const;

export type PassengerModel = (typeof PASSENGER_MODELS)[number];

/** The passenger model a resolved dispatch stage produces. */
export function passengerModelOf(stage: {
  readonly callType: CallType;
  readonly passengerAssignment: PassengerAssignmentMode;
}): PassengerModel {
  return stage.passengerAssignment === 'panel' ? 'destination-dispatch' : 'conventional';
}

/** One metric that changes construct under destination dispatch, and why it does. */
export interface ModelSensitiveMetric {
  /** The metric id, matching `experiments`' `REPLICATION_METRICS` and this package's summary. */
  readonly id: string;
  /** Dotted path into {@link RunSummary}, so the claim is checkable against the real shape. */
  readonly summaryPath: string;
  /** Why the number stops measuring the same thing. Quoted verbatim into the run's warnings. */
  readonly reason: string;
}

/**
 * **The nine.** Metrics whose *construct* changes when the landing panel names a car.
 *
 * Not "metrics that get worse" — five of these are expected to get worse and that is a result
 * (DECISIONS.md § D27 requires AWT and WT95 to be reported with explicit verdicts rather than
 * hidden). These are the metrics for which "worse" cannot be told from "different question".
 */
export const MODEL_SENSITIVE_METRICS: readonly ModelSensitiveMetric[] = Object.freeze([
  Object.freeze({
    id: 'awtS',
    summaryPath: 'waiting.meanS',
    reason:
      'wait is arrivedAt → boardedAt, and under a panel that span contains the walk to a named car and excludes the option of boarding whichever car arrives first — two different penalties inside one number',
  }),
  Object.freeze({
    id: 'wt95S',
    summaryPath: 'waiting.p95S',
    reason:
      'the same span, and the tail is exactly where "I was sent to the slow car and had to wait for it" lands',
  }),
  Object.freeze({
    id: 'wt99S',
    summaryPath: 'waiting.p99S',
    reason:
      'the same span, further into the same tail, where a promise kept late is indistinguishable from a long queue',
  }),
  Object.freeze({
    id: 'maxWaitS',
    summaryPath: 'waiting.maxS',
    reason: 'the same span, at its extreme, which is a promise kept late rather than a queue',
  }),
  Object.freeze({
    id: 'pctOverLongWait',
    summaryPath: 'waiting.pctOverLongWait',
    reason:
      'the same span, against a 60 s threshold calibrated on a conventional wait that had no walk in it',
  }),
  Object.freeze({
    id: 'intervalS',
    summaryPath: 'achievedInterval.meanS',
    reason:
      'a destination-grouped bank leaves the terminal in destination sectors rather than round-robin, so the departure gap stops being the quantity the Barney/CIBSE interval names',
  }),
  Object.freeze({
    id: 'intervalCoV',
    summaryPath: 'achievedInterval.coefficientOfVariation',
    reason: 'bunching of a sectored departure pattern is not bunching of a round-robin one',
  }),
  Object.freeze({
    id: 'meanQueueLength',
    summaryPath: 'saturation.meanQueueLength',
    reason:
      'the landing queue is partitioned by assigned car and includes people walking, so "persons waiting at the landing" is a different set',
  }),
  Object.freeze({
    id: 'maxQueueLength',
    summaryPath: 'saturation.maxQueueLength',
    reason:
      'the same set, at its extreme — the peak of a queue partitioned by promised car, which is not the peak of a landing queue',
  }),
]);

/**
 * **The ten that survive**, declared beside the nine rather than left as "everything else".
 *
 * Carried explicitly so the partition is checkable: `comparability.test.ts` asserts the two lists
 * are disjoint and that together they are exactly the nineteen scalars a replication reports.
 * Without this half, a twentieth metric could appear and be neither listed nor excluded — which
 * is the shape of every stale claim this repository has had to correct.
 *
 * `personsPer5Min` and `pctPopulationPer5Min` are comparable **as values between two simulated
 * arms** and are *not* comparable against the Barney/CIBSE closed form under this model — see
 * the oracle pin, which is a separate obligation from this one.
 */
export const COMPARABLE_METRIC_IDS: readonly string[] = Object.freeze([
  'ttdMeanS',
  'ttdP95S',
  'rideMeanS',
  'personsPer5Min',
  'pctPopulationPer5Min',
  'offeredPer5Min',
  'meanLoadFactor',
  'fractionAtDesignLoad',
  'queueSlopePersonsPerMinute',
  'unservedFraction',
]);

/** The nine ids alone, for a consumer that only needs to filter. */
export const MODEL_SENSITIVE_METRIC_IDS: readonly string[] = Object.freeze(
  MODEL_SENSITIVE_METRICS.map((metric) => metric.id),
);

/**
 * What a caller pairing two runs needs to know, computed once and carried on the result.
 *
 * `notComparableMetrics` is empty under the conventional model — including under destination
 * *disclosure*, where all nineteen metrics stay comparable and Phase 6a's intervals are quotable
 * on every one of them.
 */
export interface RunComparability {
  readonly passengerModel: PassengerModel;
  /** Metric ids that may not be paired against a run of the other model. */
  readonly notComparableMetrics: readonly string[];
  /**
   * Metric ids that may be paired against a run of **either** model.
   *
   * Carried beside the exclusion rather than left to be derived, because a caller filtering by
   * subtraction has to know the full metric list to subtract from — which is the thing
   * `packages/experiments` owns and `core` cannot see. All nineteen under the conventional model;
   * the ten of § 1.6 under destination dispatch, with `ttdMeanS` first among them.
   */
  readonly comparableMetrics: readonly string[];
}

export function comparabilityOf(model: PassengerModel): RunComparability {
  const conventional = model === 'conventional';
  return Object.freeze({
    passengerModel: model,
    notComparableMetrics: conventional ? Object.freeze([]) : MODEL_SENSITIVE_METRIC_IDS,
    comparableMetrics: conventional
      ? Object.freeze([...MODEL_SENSITIVE_METRIC_IDS, ...COMPARABLE_METRIC_IDS])
      : COMPARABLE_METRIC_IDS,
  });
}

/**
 * The disclaimer a destination-dispatch run carries in `result.warnings`, or `undefined`.
 *
 * Phrased as a *disclaimer* rather than an advisory, and ordered with the double-deck one, for
 * the reason `Simulation.#disclaimers` gives: an advisory qualifies a result, a disclaimer says
 * the model is not the configuration a reader will assume. A wait under a panel is not the wait
 * a reader of "AWT" assumes.
 */
export function comparabilityDisclaimer(model: PassengerModel): string | undefined {
  if (model === 'conventional') return undefined;
  const listed = MODEL_SENSITIVE_METRICS.map(
    (metric) => `${metric.id} (${metric.reason})`,
  ).join('; ');
  return (
    `this run uses the destination-dispatch passenger model (dispatch.passengerAssignment: "panel"): ` +
    `each passenger was told which car to walk to at the landing and boarded only that car. ` +
    `${String(MODEL_SENSITIVE_METRICS.length)} of the recorded metrics change construct under that model and must not be ` +
    `paired against a conventional or disclosure-only run — ${listed}. ` +
    `Time to destination (ttdMeanS, ttdP95S), ride time, load factor, unserved fraction and the ` +
    `queue-growth slope keep their definitions and are the comparable set (DECISIONS.md § D27: ` +
    `gate on TTD, and report AWT and WT95 with explicit verdicts rather than omitting them).`
  );
}
