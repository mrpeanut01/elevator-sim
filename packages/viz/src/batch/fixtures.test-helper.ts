/**
 * Hand-built {@link BatchResult}s, for the report assertions that must not depend on a building.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`.
 *
 * The end-to-end suites in `runBatch.test.ts` run the real `data/` directory, because the claim
 * *"a partly suppressed batch is the common case"* is a claim about the buildings this project
 * ships. What these fixtures are for is the opposite claim — that the **report** behaves the same
 * way whatever produced the numbers, including on the shapes real data does not conveniently
 * offer (an exact tie, a single replication, a broken CRN audit).
 */

import {
  BATCH_METRICS,
  type BatchArmResult,
  type BatchMetric,
  type BatchReplication,
  type BatchResult,
} from './types.js';

export interface FakeReplicationOptions {
  readonly awtIsValid?: boolean;
  readonly awtInvalidReason?: string | null;
  readonly saturated?: boolean;
  readonly status?: BatchReplication['status'];
  readonly serviceLevelVerdict?: BatchReplication['serviceLevelVerdict'];
  readonly offeredPer5Min?: number | null;
  /** Overrides for individual metrics. Everything unnamed takes {@link baseValue}. */
  readonly metrics?: Partial<Record<BatchMetric, number | null>>;
}

/** One replication whose every metric is `baseValue` unless overridden. */
export function fakeReplication(
  replication: number,
  baseValue: number,
  options: FakeReplicationOptions = {},
): BatchReplication {
  const metrics: Partial<Record<BatchMetric, number | null>> = {};
  for (const metric of BATCH_METRICS) metrics[metric] = baseValue;
  Object.assign(metrics, options.metrics ?? {});
  const valid = options.awtIsValid ?? true;
  return {
    replication,
    seed: String(1000 + replication),
    awtIsValid: valid,
    awtInvalidReason:
      options.awtInvalidReason ?? (valid ? null : 'the queues never stopped growing.'),
    saturated: options.saturated ?? !valid,
    status: options.status ?? 'completed',
    serviceLevelVerdict: options.serviceLevelVerdict ?? 'served',
    /*
     * `in` rather than `??`: the override a caller most wants here is **`null`** — *"this run
     * measured no offered demand"* — and `null ?? baseValue` silently discards it. Watched
     * happening: `goals.test.ts`'s unmeasured case reported `pass` against a fixture that had
     * quietly kept the default.
     */
    offeredPer5Min: 'offeredPer5Min' in options ? (options.offeredPer5Min ?? null) : baseValue,
    metrics: metrics as Record<BatchMetric, number | null>,
  };
}

/**
 * One arm, with a display name that is **not** its id.
 *
 * Deliberately different from the slug: the report names an arm by
 * {@link BatchArmResult.dispatcherProfileName}, and a fixture whose name equalled its id would let
 * a regression back to slugs pass every assertion in `report.test.ts`.
 */
export function fakeArm(
  armId: string,
  dispatcherProfileId: string,
  replications: readonly BatchReplication[],
  dispatcherProfileName = `Fixture ${dispatcherProfileId}`,
): BatchArmResult {
  return { armId, dispatcherProfileId, dispatcherProfileName, replications };
}

/**
 * A two-arm result whose every metric differs by exactly `delta`, with a little spread.
 *
 * The spread is deterministic and deliberately tiny relative to `delta` when `delta` is non-zero,
 * so a `resolved` verdict is arithmetic rather than luck; at `delta === 0` the two arms are
 * identical and the interval is `[0, 0]`, which is the tie the report has to survive.
 */
export function fakeResult(
  options: {
    readonly replications?: number;
    readonly delta?: number;
    readonly invalidOn?: readonly number[];
    readonly nullMetricOn?: readonly number[];
    readonly nullMetric?: BatchMetric;
    readonly aligned?: boolean;
    /**
     * Extra per-replication wobble applied to the **candidate arm only**.
     *
     * Zero by default, which makes every paired difference exactly `delta` and the interval
     * `[delta, delta]` — the degenerate case, and the one the *"a profile against itself"* test
     * needs at `delta = 0`. A test that cares about the *width* of an interval sets this, because a
     * zero-width interval cannot distinguish a lower bound from an upper one.
     */
    readonly spread?: number;
  } = {},
): BatchResult {
  const n = options.replications ?? 50;
  const delta = options.delta ?? 0;
  const spread = options.spread ?? 0;
  const invalid = new Set(options.invalidOn ?? []);
  const nulls = new Set(options.nullMetricOn ?? []);
  const nullMetric = options.nullMetric ?? 'energyKJ';
  const aligned = options.aligned ?? true;

  const build = (offset: number, extra: number): BatchReplication[] =>
    Array.from({ length: n }, (_, index) => {
      /* A fixed, seedless wobble: reproducible, and never larger than a tenth of a second. */
      const wobble = ((index * 37) % 11) / 100 + (extra * (((index * 23) % 7) - 3)) / 3;
      const overrides = nulls.has(index) ? { [nullMetric]: null } : {};
      return fakeReplication(index, 10 + offset + wobble, {
        awtIsValid: !invalid.has(index),
        metrics: overrides,
      });
    });

  return {
    buildingId: 'fixture-building',
    buildingName: 'Fixture Building',
    seed: '20260729',
    durationS: 900,
    arrivalRatePctPop5min: null,
    arms: [
      /*
       * The shipped display names for these two ids, so the assertions below are about the name
       * the product actually prints. Neither contains its own slug, which is what makes a
       * regression to `eta`/`collective` visible rather than accidentally passing.
       */
      fakeArm('baseline', 'collective', build(0, 0), 'Conventional collective'),
      fakeArm('candidate', 'eta', build(delta, spread), 'Minimum estimated wait'),
    ],
    crn: aligned
      ? { traceKey: 'k', checkedComparisons: n, mismatches: [], aligned: true }
      : {
          traceKey: 'k',
          checkedComparisons: n,
          mismatches: [
            {
              replication: 3,
              armId: 'candidate',
              baselineArmId: 'baseline',
              detail: 'passengers[7] "p0007": arrivalTimeS 12 vs 19',
            },
          ],
          aligned: false,
        },
    elapsedMs: 1234,
  };
}
