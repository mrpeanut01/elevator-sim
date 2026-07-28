/**
 * The comparability declaration, checked in both directions against the shape it describes.
 *
 * `metrics/comparability.ts` claims that nine of the nineteen scalars a replication reports stop
 * measuring the same thing under destination dispatch, and that the other ten do not. A list like
 * that is exactly the kind of claim this repository has watched go stale — three published figures
 * did not reproduce from the code that was supposed to produce them, and nothing noticed, because
 * nothing re-derived them. So both halves are executed here:
 *
 * - **every listed metric names a statistic that exists**, resolved by walking its declared dotted
 *   path into a real `RunSummary` produced by a real run;
 * - **the two lists partition the nineteen**, disjointly and exhaustively, so a twentieth metric
 *   cannot appear and be neither listed nor excluded.
 *
 * The nineteen are named here rather than imported, because `REPLICATION_METRICS` lives in
 * `packages/experiments` and `core` may not depend on it — a test that reached across would invert
 * the package graph to check a property of `core`. The duplication is the price of the direction of
 * the dependency, and it is guarded: `experiments`' own suite asserts its list, and any divergence
 * between the two shows up here as a partition that no longer covers.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';
import type { RunSummary } from './types.js';

import {
  COMPARABLE_METRIC_IDS,
  MODEL_SENSITIVE_METRICS,
  MODEL_SENSITIVE_METRIC_IDS,
  PASSENGER_MODELS,
  comparabilityDisclaimer,
  comparabilityOf,
  passengerModelOf,
} from './comparability.js';

/**
 * The nineteen scalars `experiments/src/runner/metrics.ts` projects from a summary.
 *
 * Written out so the partition below is a claim about a fixed set rather than about whatever the
 * two lists happen to contain.
 */
const REPLICATION_METRICS = [
  'awtS',
  'wt95S',
  'wt99S',
  'maxWaitS',
  'pctOverLongWait',
  'ttdMeanS',
  'ttdP95S',
  'rideMeanS',
  'intervalS',
  'intervalCoV',
  'personsPer5Min',
  'pctPopulationPer5Min',
  'offeredPer5Min',
  'meanLoadFactor',
  'fractionAtDesignLoad',
  'meanQueueLength',
  'maxQueueLength',
  'queueSlopePersonsPerMinute',
  'unservedFraction',
] as const;

let summary: RunSummary;

beforeAll(async () => {
  const config: LoadedConfig = await load();
  const building = config.buildingsById.get('midtown-office');
  const profile = config.dispatcherProfilesById.get('eta');
  if (building === undefined || profile === undefined) throw new Error('missing fixture');
  summary = runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20_260_726,
    onTimeout: 'report',
  }).summary;
});

/** Walk a dotted path into a real summary, so a stale path cannot pass as a string. */
function at(path: string): unknown {
  let value: unknown = summary;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Readonly<Record<string, unknown>>)[key];
  }
  return value;
}

describe('the nine metrics destination dispatch makes uncomparable', () => {
  it('names nine of them, each with a reason', () => {
    expect(MODEL_SENSITIVE_METRICS).toHaveLength(9);
    for (const metric of MODEL_SENSITIVE_METRICS) {
      expect(metric.reason.length, `${metric.id} has no reason`).toBeGreaterThan(30);
    }
    expect(MODEL_SENSITIVE_METRIC_IDS).toEqual(MODEL_SENSITIVE_METRICS.map((m) => m.id));
  });

  it('resolves every declared summaryPath against a real run', () => {
    // The half that catches a renamed statistic. `waiting.pctOverThreshold` was the first draft of
    // one of these paths and there is no such field; walking the path into a summary a real run
    // produced is what says so.
    for (const metric of MODEL_SENSITIVE_METRICS) {
      const value = at(metric.summaryPath);
      expect(typeof value, `${metric.id} → ${metric.summaryPath} is not a number`).toBe('number');
    }
  });

  it('partitions the nineteen replication metrics, disjointly and exhaustively', () => {
    const sensitive = new Set(MODEL_SENSITIVE_METRIC_IDS);
    const comparable = new Set(COMPARABLE_METRIC_IDS);
    const overlap = [...sensitive].filter((id) => comparable.has(id));
    expect(overlap, 'a metric claimed both comparable and not').toEqual([]);

    const covered = new Set([...sensitive, ...comparable]);
    const uncovered = REPLICATION_METRICS.filter((id) => !covered.has(id));
    expect(
      uncovered,
      'these metrics are neither listed as changing construct nor as surviving. A metric nobody ' +
        'classified is one a study will pair across two passenger models without noticing',
    ).toEqual([]);

    const invented = [...covered].filter(
      (id) => !(REPLICATION_METRICS as readonly string[]).includes(id),
    );
    expect(invented, 'these are classified but are not replication metrics at all').toEqual([]);
    expect(covered.size).toBe(REPLICATION_METRICS.length);
  });
});

describe('the passenger model a stage produces', () => {
  it('is conventional for both non-panel call types and for disclosure', () => {
    expect(PASSENGER_MODELS).toEqual(['conventional', 'destination-dispatch']);
    for (const callType of ['up-down-buttons', 'destination-entry', 'mobile-credential'] as const) {
      expect(passengerModelOf({ callType, passengerAssignment: 'none' })).toBe('conventional');
    }
    // Destination *disclosure* is not a passenger-model change and must not be reported as one:
    // Phase 6a's intervals are quotable on all nineteen metrics precisely because of this row.
    expect(
      passengerModelOf({ callType: 'mobile-credential', passengerAssignment: 'panel' }),
    ).toBe('destination-dispatch');
  });

  it('reports an empty not-comparable list for the conventional model and the nine for the other', () => {
    expect(comparabilityOf('conventional').notComparableMetrics).toEqual([]);
    expect(comparabilityOf('destination-dispatch').notComparableMetrics).toEqual(
      MODEL_SENSITIVE_METRIC_IDS,
    );
    // The other half a caller actually filters on: under the conventional model every one of the
    // nineteen is comparable, and under destination dispatch exactly the ten survive.
    expect([...comparabilityOf('conventional').comparableMetrics].sort()).toEqual(
      [...REPLICATION_METRICS].sort(),
    );
    expect(comparabilityOf('destination-dispatch').comparableMetrics).toEqual(
      COMPARABLE_METRIC_IDS,
    );
    expect(comparabilityOf('destination-dispatch').comparableMetrics).toContain('ttdMeanS');
  });

  it('raises a disclaimer only for the model that needs one, naming every metric and the gate', () => {
    expect(comparabilityDisclaimer('conventional')).toBeUndefined();
    const disclaimer = comparabilityDisclaimer('destination-dispatch');
    expect(disclaimer).toBeDefined();
    for (const metric of MODEL_SENSITIVE_METRICS) {
      expect(disclaimer, `${metric.id} is not named in the disclaimer`).toContain(metric.id);
      expect(disclaimer).toContain(metric.reason);
    }
    // And the gate the phase is judged on, so a reader of a warnings block is told what to do
    // rather than only what not to (DECISIONS.md § D27).
    expect(disclaimer).toContain('ttdMeanS');
    expect(disclaimer).toContain('D27');
  });
});
