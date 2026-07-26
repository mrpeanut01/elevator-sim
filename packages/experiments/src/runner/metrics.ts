/**
 * The scalar projection of a run: `RunSummary` → one number per named metric.
 *
 * A sequential stopping rule needs a *scalar* per replication, and so does a paired-t interval.
 * This module is the single place that says which scalar, so that "the AWT" means the same field
 * to the stopping rule, to the aggregate and to whatever compares two cells later. The
 * alternative — each consumer reaching into `summary.waiting.meanS` for itself — is how two
 * reports of the same experiment end up quoting different numbers under the same name.
 *
 * ## Why `NaN` is passed through
 *
 * Every metric here can legitimately be `NaN`, and core is emphatic about why: "Empty statistics
 * report `NaN`, never `0`. 'No passengers waited' and 'passengers waited zero seconds' are
 * different facts, and a downstream confidence interval must not be able to confuse them"
 * (`core/metrics/types.ts`). So nothing is coalesced. The runner filters non-finite values out
 * of a sample before handing it to a stopping rule and **counts them** in
 * `MetricAggregate.nonFiniteCount`, which keeps the hole visible instead of papering over it.
 *
 * Pure, total, and free of runtime imports — which is also what makes it safe for the
 * worker-thread entry to reach, though at present only the parent needs it.
 */

import type { RunSummary } from '@elevator-sim/core';

/**
 * Every per-replication scalar the runner knows how to watch.
 *
 * The first five are docs/03-traffic-and-statistics.md § Part 5's "what to record" list: AWT,
 * WT95, % > 60 s, TTD, and achieved handling capacity. The rest exist because a stopping rule or
 * a Pareto front may legitimately want them — § Part 5 again: "Percentile confidence intervals
 * require substantially more replications than mean CIs. If WT95 is a headline metric, factor
 * that into the stopping rule."
 */
export const REPLICATION_METRICS = [
  /** **AWT** — average waiting time over the report window, seconds. The headline. */
  'awtS',
  /** **WT95** — 95th-percentile wait. What people experience as "bad"; means hide tails. */
  'wt95S',
  /** 99th-percentile wait, seconds. */
  'wt99S',
  /** Longest wait in the window, seconds. */
  'maxWaitS',
  /** **% > 60 s** — percentage of served legs over the long-wait threshold, `0`–`100`. */
  'pctOverLongWait',
  /** **TTD** — mean time to destination per journey, spanning every leg and transfer. */
  'ttdMeanS',
  /** 95th-percentile time to destination, seconds. */
  'ttdP95S',
  /** Mean in-car time per leg, seconds. */
  'rideMeanS',
  /** **INT** — achieved interval between terminal departures, seconds. */
  'intervalS',
  /** Bunching: `stdDev / mean` of the departure gaps. `0` is a perfectly regular group. */
  'intervalCoV',
  /** **HC5** — persons handled per 5 minutes. */
  'personsPer5Min',
  /** **%POP** — handling capacity as a percentage of population per 5 minutes. */
  'pctPopulationPer5Min',
  /** Demand offered per 5 minutes, in persons. The denominator of a service-level claim. */
  'offeredPer5Min',
  /** Time-weighted mean car load factor, `0`–`1`. Validates the capacity model. */
  'meanLoadFactor',
  /** Fraction of car-seconds at or above the design load factor (0.8, never 1.0). */
  'fractionAtDesignLoad',
  /** Mean building-wide queue length over the window, persons. */
  'meanQueueLength',
  'maxQueueLength',
  /** Fitted queue growth, persons per minute. The quantity saturation is decided on. */
  'queueSlopePersonsPerMinute',
  /** Legs that arrived in the window and never boarded, as a fraction of arrivals. */
  'unservedFraction',
] as const;

export type ReplicationMetric = (typeof REPLICATION_METRICS)[number];

const METRIC_SET: ReadonlySet<string> = new Set<string>(REPLICATION_METRICS);

/** Whether a string names a metric this module can project. */
export function isReplicationMetric(value: string): value is ReplicationMetric {
  return METRIC_SET.has(value);
}

/**
 * Project one summary onto one metric.
 *
 * Total: returns `NaN` for a metric the summary has nothing to say about, never `undefined` and
 * never `0`. `pctPopulationPer5Min` is the interesting case — core makes it optional because
 * `%POP` needs a population and a record may not carry one, and an absent denominator becomes
 * `NaN` here rather than a silently plausible zero.
 */
export function metricOf(summary: RunSummary, metric: ReplicationMetric): number {
  switch (metric) {
    case 'awtS':
      return summary.waiting.meanS;
    case 'wt95S':
      return summary.waiting.p95S;
    case 'wt99S':
      return summary.waiting.p99S;
    case 'maxWaitS':
      return summary.waiting.maxS;
    case 'pctOverLongWait':
      return summary.waiting.pctOverLongWait;
    case 'ttdMeanS':
      return summary.timeToDestination.meanS;
    case 'ttdP95S':
      return summary.timeToDestination.p95S;
    case 'rideMeanS':
      return summary.rideTime.meanS;
    case 'intervalS':
      return summary.achievedInterval.meanS;
    case 'intervalCoV':
      return summary.achievedInterval.coefficientOfVariation;
    case 'personsPer5Min':
      return summary.handlingCapacity.personsPer5Min;
    case 'pctPopulationPer5Min':
      return summary.handlingCapacity.pctPopulationPer5Min ?? Number.NaN;
    case 'offeredPer5Min':
      return summary.handlingCapacity.offeredPer5Min;
    case 'meanLoadFactor':
      return summary.loadFactor.meanLoadFactor;
    case 'fractionAtDesignLoad':
      return summary.loadFactor.fractionOfTimeAtOrAboveDesignLoad;
    case 'meanQueueLength':
      return summary.saturation.meanQueueLength;
    case 'maxQueueLength':
      return summary.saturation.maxQueueLength;
    case 'queueSlopePersonsPerMinute':
      return summary.saturation.slopePersonsPerMinute;
    case 'unservedFraction':
      return summary.counts.arrivals === 0
        ? Number.NaN
        : summary.counts.unserved / summary.counts.arrivals;
  }
}

/** Project one summary onto every metric. */
export function metricsOf(summary: RunSummary): Readonly<Record<ReplicationMetric, number>> {
  const out: Partial<Record<ReplicationMetric, number>> = {};
  for (const metric of REPLICATION_METRICS) out[metric] = metricOf(summary, metric);
  return Object.freeze(out as Record<ReplicationMetric, number>);
}
