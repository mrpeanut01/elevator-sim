/**
 * Recomputing headline statistics from stored per-passenger records, without re-simulating.
 *
 * ```ts
 * const set = await readRunSetFile('out/up-peak.ndjson');
 *
 * reanalyzeStoredRun(set[0]);                            // the original summary, exactly
 * reanalyzeStoredRun(set[0], { longWaitThresholdS: 90 }); // a different question, same data
 * observationsOf(set);                                    // one row per replication
 * ```
 *
 * ## Why this is the point of storing records at all
 *
 * docs/03-traffic-and-statistics.md § Part 5 asks for per-run records "so any run can be replayed
 * exactly **and results re-analyzed without re-simulating**". The second half is the economics of
 * the whole project. A 20 000-run sweep is hours of CPU; the questions that arrive afterwards —
 * what is the 99th percentile rather than the 95th, what if "long wait" means 90 s, what does the
 * whole run look like rather than the peak five minutes, was the terminal inferred correctly —
 * are all pure functions of data already on disk. Re-simulating to answer them would make each one
 * cost another sweep, which in practice means they do not get asked.
 *
 * `core` makes that cheap by construction: a `RunSummary` is a pure function of
 * `(RunRecord, SummarizeOptions)` and nothing else. This module supplies the second argument from
 * what was stored, so the *default* re-analysis reproduces the original numbers exactly and any
 * departure from them is something the caller asked for explicitly.
 *
 * ## Reproducing, versus re-asking
 *
 * Those are different operations and the API keeps them apart:
 *
 * - {@link reanalyzeStoredRun} with no overrides **reproduces**. It is checked, not asserted:
 *   {@link verifySummaryFingerprint} compares the freshly derived summary against the digest stored
 *   with the record, so a change in a metrics default anywhere in `core` surfaces as a mismatch
 *   rather than as a quietly different number.
 * - {@link reanalyzeStoredRun} with overrides **re-asks**, and the result is no longer comparable
 *   to the stored fingerprint. That is fine and expected; what would not be fine is being unable to
 *   tell the two apart afterwards.
 */

import {
  summarizeRun,
  type RunSummary,
  type SummarizeOptions,
  type WindowSelection,
} from '@elevator-sim/core';

import { summaryFingerprint } from './persistence.js';
import {
  ReportsError,
  type ReplicationObservation,
  type StoredRunRecord,
  type StoredSummarizeOptions,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Options
 * -------------------------------------------------------------------------- */

/**
 * The summary options a stored run was derived with, ready to hand back to `summarizeRun`.
 *
 * Falls back to the record's own `reportWindow` when the envelope carries no summary options — an
 * envelope written by something other than `createStoredRun`, or one whose run was summarized with
 * defaults. That fallback is what `summarizeRun` would have done anyway, so it reproduces rather
 * than guesses.
 */
export function summarizeOptionsFor(
  stored: StoredRunRecord,
  overrides: ReanalyzeOverrides = {},
): SummarizeOptions {
  const base: StoredSummarizeOptions = stored.config.summarize ?? {};
  const window: WindowSelection | undefined =
    overrides.window ?? base.window ?? stored.record.reportWindow;

  return Object.freeze({
    ...base,
    ...stripUndefined(overrides),
    ...(window === undefined ? {} : { window }),
  });
}

/**
 * What a caller may change when re-asking a question of stored data.
 *
 * The whole of `SummarizeOptions`, because the whole of it is a *question* rather than a fact about
 * the run: which window, which percentile method, what counts as a long wait, how much censoring is
 * tolerable, which floor is the terminal. None of it can change the data.
 */
export type ReanalyzeOverrides = SummarizeOptions;

/* -------------------------------------------------------------------------- *
 * Re-analysis
 * -------------------------------------------------------------------------- */

/**
 * Recompute a stored run's summary from its per-passenger records.
 *
 * With no overrides this reproduces the summary the run originally reported, bit for bit — that is
 * the property `reanalyze.test.ts` asserts against a live simulation, and the reason the stored
 * envelope carries the summary options at all.
 */
export function reanalyzeStoredRun(
  stored: StoredRunRecord,
  overrides: ReanalyzeOverrides = {},
): RunSummary {
  return summarizeRun(stored.record, summarizeOptionsFor(stored, overrides));
}

/** Recompute every run in a set. Order is preserved; nothing is grouped or filtered. */
export function reanalyzeRunSet(
  records: readonly StoredRunRecord[],
  overrides: ReanalyzeOverrides = {},
): readonly RunSummary[] {
  return Object.freeze(records.map((stored) => reanalyzeStoredRun(stored, overrides)));
}

/**
 * Whether re-analysis still derives the summary that was stored with this record.
 *
 * `undefined` when the record carries no fingerprint — an older or hand-written envelope — which is
 * reported as "unknown" rather than as "fine". Only meaningful without overrides: a re-asked
 * question is *supposed* to produce a different summary, and comparing it to the original digest
 * would report drift where there is none.
 */
export function verifySummaryFingerprint(stored: StoredRunRecord): boolean | undefined {
  if (stored.summaryFingerprint === undefined) return undefined;
  return summaryFingerprint(reanalyzeStoredRun(stored)) === stored.summaryFingerprint;
}

/**
 * Re-analyse, and refuse to hand back a summary that no longer matches the stored digest.
 *
 * The strict entry point for a pipeline that is about to publish numbers. A mismatch means the
 * dataset is intact but the derivation has changed underneath it, so the stored results and freshly
 * computed ones are on different footings — which is exactly the situation in which a comparison
 * silently stops meaning anything.
 *
 * @throws ReportsError on a mismatch.
 */
export function reanalyzeVerified(stored: StoredRunRecord): RunSummary {
  const summary = reanalyzeStoredRun(stored);
  if (
    stored.summaryFingerprint !== undefined &&
    summaryFingerprint(summary) !== stored.summaryFingerprint
  ) {
    throw new ReportsError(
      `Re-analysis of run "${stored.record.runId}" derives a different summary from the one stored with it (stored digest ${stored.summaryFingerprint}, recomputed ${summaryFingerprint(summary)}). The per-passenger data is unchanged, so a metrics default, percentile method or saturation threshold has moved. Re-derive the whole experiment before comparing anything across the change.`,
    );
  }
  return summary;
}

/* -------------------------------------------------------------------------- *
 * Observations
 * -------------------------------------------------------------------------- */

/**
 * Flatten one summary into the row a comparison consumes.
 *
 * `NaN` is passed through untouched — "nobody was served in the window, so there is no mean" — and
 * {@link ReplicationObservation.awtIsValid} carries `core`'s verdict on whether the wait numbers
 * may be used. Neither is repaired here: repairing an absent measurement is how it stops being
 * visible.
 */
export function observationOf(summary: RunSummary): ReplicationObservation {
  return Object.freeze({
    runId: summary.runId,
    seed: summary.seed,
    ...(summary.buildingId === undefined ? {} : { buildingId: summary.buildingId }),
    ...(summary.dispatcherProfileId === undefined
      ? {}
      : { dispatcherProfileId: summary.dispatcherProfileId }),
    windowSeconds: summary.windowSeconds,
    arrivals: summary.counts.arrivals,
    served: summary.waiting.count,
    unserved: summary.counts.unserved,
    awtS: summary.waiting.meanS,
    wt95S: summary.waiting.p95S,
    pctOverLongWait: summary.waiting.pctOverLongWait,
    ttdS: summary.timeToDestination.meanS,
    achievedIntervalS: summary.achievedInterval.meanS,
    personsPer5Min: summary.handlingCapacity.personsPer5Min,
    saturated: summary.saturation.saturated,
    awtIsValid: summary.awtIsValid,
    ...(summary.awtInvalidReason === undefined
      ? {}
      : { awtInvalidReason: summary.awtInvalidReason }),
  });
}

/**
 * One observation per stored replication, re-derived from the per-passenger data.
 *
 * The bridge from a result set on disk to a comparison: 20 000 records become 20 000 rows of a
 * dozen numbers, which fit in memory when the records do not.
 *
 * `replication` comes from the envelope rather than the summary, because the envelope always has
 * it — see the note in `replay.ts` on why the record's copy is optional.
 */
export function observationsOf(
  records: readonly StoredRunRecord[],
  overrides: ReanalyzeOverrides = {},
): readonly ReplicationObservation[] {
  return Object.freeze(
    records.map((stored) =>
      Object.freeze({
        ...observationOf(reanalyzeStoredRun(stored, overrides)),
        replication: stored.replication,
      }),
    ),
  );
}

/**
 * Group a result set by candidate, preserving first-seen order.
 *
 * Insertion-ordered rather than sorted, and never sorted by result: a report that orders its
 * candidates by how well they did has already made the claim the statistics are supposed to decide.
 */
export function groupByCandidate(
  records: readonly StoredRunRecord[],
): ReadonlyMap<string, readonly StoredRunRecord[]> {
  const groups = new Map<string, StoredRunRecord[]>();
  for (const stored of records) {
    const bucket = groups.get(stored.candidateId);
    if (bucket === undefined) groups.set(stored.candidateId, [stored]);
    else bucket.push(stored);
  }
  return new Map([...groups].map(([id, bucket]) => [id, Object.freeze(bucket)]));
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * Drop keys whose value is `undefined`.
 *
 * `{ ...base, ...overrides }` would otherwise let an override object that mentions a key with an
 * explicit `undefined` erase the stored value — which is how a re-analysis quietly stops
 * reproducing while looking like it should.
 */
function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}
