/**
 * Trace identity that survives a change of machine — the oracle `mixIdentity.test.ts` and
 * `transportIdentity.test.ts` compare against.
 *
 * ## Why the digest these replace could not stay
 *
 * Both files pinned `SHA-256(JSON.stringify(trace))` and compared it with `toBe`. That asserts
 * **bit-identical traces on every machine**, which is a far stronger claim than this project needs
 * and one it cannot keep: `JSON.stringify` emits doubles at full precision, so a single-ULP
 * difference anywhere in the trace changes the whole hash. Measured on CI, x64 and arm64 disagree
 * — the arithmetic behind `random/rng.ts`'s Box–Muller and exponential draws can contract a
 * multiply-add into one rounding on one architecture and not the other — and the same 26 pins
 * therefore passed on one platform and failed on the other, in both directions, depending only on
 * which machine last regenerated them ([§ D196](../../../../DECISIONS.md),
 * [§ D201](../../../../DECISIONS.md)).
 *
 * A hash has no notion of *how far apart*: one ULP and a rewritten generator are indistinguishable
 * in its output. So the pins could say **that** something moved and never **how much**, which is
 * exactly the distinction the project's own acceptance rule turns on.
 *
 * ## The split this module makes instead
 *
 * The requirement is not that two machines produce identical bits. It is that they produce the same
 * *simulation* — the same people, going the same places, by the same routes — and that the
 * continuous quantities agree to far better than any effect the project reports.
 *
 * So identity is asserted in two halves, and they fail for different reasons:
 *
 * | half | covers | compared |
 * |---|---|---|
 * | {@link structuralDigestOf} | every **decision**: which floors, which routes, which legs, which credential, which batch, which source | exactly, with `toBe` |
 * | {@link continuousSummaryOf} | every **magnitude**: arrival instants, body masses, traversal times | within a relative tolerance |
 *
 * The structural half keeps all the regression power the old digest had over the thing those tests
 * actually describe — § D170's escalator change is *"26 journeys routed over different floors"*,
 * and that moves this digest. Floor indices, leg ordering and credential groups are discrete
 * outcomes of comparisons, not sums of them, so they are expected to be identical everywhere; CI's
 * two-OS matrix is what proves that rather than assuming it.
 *
 * The continuous half is where platform noise lives, and {@link RELATIVE_TOLERANCE} is set far
 * below any behavioural change and far above float drift — see its own note.
 *
 * Everything here is a pure function of its argument: no RNG (CLAUDE.md invariant 2), no clock
 * (invariant 3), no mutation.
 */

import { createHash } from 'node:crypto';

import { percentileOfSorted } from '../metrics/distributions.js';

import type { PassengerTrace } from './types.js';

/**
 * The band inside which two machines' continuous values are the same measurement.
 *
 * `1e-9` relative. The two bounds it sits between are far apart, which is what makes the choice
 * uncontentious rather than tuned:
 *
 * - **Below**, float drift. The only cross-platform divergence this repository has measured on a
 *   *reported* quantity is `forecast-causality`'s partial correlation at ~3e-4 relative — and that
 *   is a correlation, which amplifies; the direct summaries here (a mean of arrival instants, a
 *   mean body mass) accumulate nothing like it and sit near 1e-15.
 * - **Above**, anything real. A change to the generator moves these by percents. The smallest
 *   effect the project reports at all is a 1.9 s resolution limit on a ~30 s statistic — about
 *   6e-2 relative, seven orders of magnitude above this band.
 *
 * A tolerance has to be justified in both directions or it is a knob. This one is.
 */
export const RELATIVE_TOLERANCE = 1e-9;

/**
 * Every discrete decision in a trace, hashed — and nothing continuous.
 *
 * Deliberately field-by-field rather than `JSON.stringify` minus a deny-list: a field added to
 * `GeneratedPassenger` should have to be classified as decision or magnitude by whoever adds it,
 * and an allow-list is what forces that. A deny-list would silently pull a new float into the hash
 * and re-create the defect this module exists to remove.
 */
export function structuralDigestOf(trace: PassengerTrace): string {
  const hash = createHash('sha256');

  /* Trace-level discrete facts. `durationS` is authored, not drawn, so it belongs here. */
  hash.update(
    `${trace.buildingId}|${trace.seed}|${trace.template.id}|${String(trace.durationS)}|${String(trace.passengerCount)}|${String(trace.passengersInReportWindow)}\n`,
  );

  for (const passenger of trace.passengers) {
    hash.update(
      [
        passenger.id,
        passenger.journeyId,
        passenger.batchId,
        String(passenger.originFloorIndex),
        String(passenger.finalDestinationFloorIndex),
        passenger.credentialGroup ?? '-',
        passenger.category,
        passenger.demandFloorId,
        passenger.profileId,
        // The window flag is a comparison of a drawn instant against an authored bound, so it is
        // the one derived-from-continuous field that is still a decision. It is in on purpose: a
        // passenger crossing the window boundary changes what is reported, and that must fail.
        passenger.inReportWindow ? '1' : '0',
      ].join('|'),
    );
    for (const leg of passenger.legs) {
      hash.update(`;L${String(leg.legIndex)}:${String(leg.originFloorIndex)}>${String(leg.destinationFloorIndex)}`);
    }
    for (const hop of passenger.transportHops ?? []) {
      hash.update(
        `;H${String(hop.beforeLegIndex)}:${hop.modeId}:${String(hop.originFloorIndex)}>${String(hop.destinationFloorIndex)}`,
      );
    }
    hash.update('\n');
  }

  /* Batch composition: which floor, how many together — not when. */
  for (const arrival of trace.arrivals) {
    hash.update(`${arrival.id}|${arrival.originFloorId}\n`);
  }

  for (const warning of trace.warnings) hash.update(`W:${warning}\n`);

  return hash.digest('hex');
}

/** The continuous quantities of a trace, reduced to comparable summaries. */
export interface ContinuousSummary {
  readonly meanArrivalS: number;
  readonly p95ArrivalS: number;
  readonly meanMassKg: number;
  /** Total time spent on declared non-lift connections. `0` where a building declares none. */
  readonly totalTraversalS: number;
  readonly peakPassengersPerSecond: number;
  readonly expectedPassengers: number;
}

/**
 * Location and spread of everything a trace draws from a distribution.
 *
 * Means and a p95 rather than every value: the question these answer is *"is this the same
 * traffic?"*, and two traces whose arrival means agree to 1e-9 over thousands of passengers are the
 * same traffic by any reading. Per-passenger comparison would re-import the sensitivity that made
 * the old digest unusable, one assertion at a time.
 */
export function continuousSummaryOf(trace: PassengerTrace): ContinuousSummary {
  const arrivals = trace.passengers.map((p) => p.arrivalTimeS);
  const masses = trace.passengers.map((p) => p.massKg);
  const sortedArrivals = [...arrivals].sort((a, b) => a - b);

  let totalTraversalS = 0;
  for (const passenger of trace.passengers) {
    for (const hop of passenger.transportHops ?? []) totalTraversalS += hop.traversalTimeS;
  }

  const mean = (xs: readonly number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((total, x) => total + x, 0) / xs.length;

  return {
    meanArrivalS: mean(arrivals),
    p95ArrivalS: sortedArrivals.length === 0 ? 0 : percentileOfSorted(sortedArrivals, 95),
    meanMassKg: mean(masses),
    totalTraversalS,
    peakPassengersPerSecond: trace.peakPassengersPerSecond,
    expectedPassengers: trace.expectedPassengers,
  };
}

/**
 * `true` when two values agree to {@link RELATIVE_TOLERANCE}, relative where that means anything
 * and absolute at zero.
 */
export function agreesWithin(
  actual: number,
  expected: number,
  tolerance = RELATIVE_TOLERANCE,
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  return scale === 0 ? actual === expected : Math.abs(actual - expected) <= tolerance * scale;
}

/**
 * The fields of two summaries that disagree, each with the relative gap — empty when they agree.
 *
 * Returned rather than asserted so the caller's failure message can name the building and template,
 * and so a split matrix reports *how far apart* the two platforms are. That number is the whole
 * point: it is the evidence that a divergence is noise rather than a regression.
 */
export function summaryDisagreements(
  actual: ContinuousSummary,
  expected: ContinuousSummary,
  tolerance = RELATIVE_TOLERANCE,
): readonly string[] {
  const out: string[] = [];
  for (const key of Object.keys(expected) as (keyof ContinuousSummary)[]) {
    const a = actual[key];
    const e = expected[key];
    if (agreesWithin(a, e, tolerance)) continue;
    const scale = Math.max(Math.abs(e), Math.abs(a));
    const relative = scale === 0 ? Number.POSITIVE_INFINITY : Math.abs(a - e) / scale;
    out.push(`${key}: expected ${String(e)}, measured ${String(a)} (relative ${relative.toExponential(2)})`);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * The same split, over an arbitrary result object
 * -------------------------------------------------------------------------- */

/**
 * The structural digest of a whole result — every key, every string, every boolean, and every
 * **integer** — with non-integer numbers elided to a placeholder.
 *
 * `transportIdentity.test.ts` hashes a `runSimulation` result rather than a trace, and a result has
 * no small field list to allow-list the way {@link structuralDigestOf} does. The general rule that
 * replaces one: **counts are decisions and reals are magnitudes.** A served-leg count, a stop
 * count, a transport-hop count, an `awtIsValid` flag and a suppression code are integers, booleans
 * or strings and stay in the hash, so a change in what the simulator *did* still fails exactly as
 * before. An AWT mean, a percentile and an energy figure are reals, so they leave the hash and are
 * compared by {@link continuousFieldsOf} within tolerance instead.
 *
 * The placeholder is written into the hash rather than dropped, so a real that becomes `null`, an
 * absent key, or a re-ordered object still changes the digest. Only the value's *magnitude* is
 * elided — never its presence or its position.
 */
export function structuralDigestOfResult(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'number' && Number.isFinite(inner) && !Number.isInteger(inner)
      ? '~real'
      : inner,
  );
  return createHash('sha256')
    .update(canonical ?? 'undefined')
    .digest('hex');
}

/**
 * Every non-integer number in a result, keyed by its path — the half
 * {@link structuralDigestOfResult} elides.
 *
 * Paths rather than a fixed field list, for the same reason the digest is general: a summary gains
 * fields, and a comparison that had to be told about each one would silently stop covering the new
 * ones. A path in one map and not the other is reported by {@link fieldDisagreements} as a
 * disagreement, so an added or removed real is a failure rather than a skipped check.
 */
export function continuousFieldsOf(value: unknown): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'number') {
      if (Number.isFinite(node) && !Number.isInteger(node)) out.set(path, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}[${String(index)}]`);
      });
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        walk(item, path === '' ? key : `${path}.${key}`);
      }
    }
  };
  walk(value, '');
  return out;
}

/**
 * The paths at which two field maps disagree beyond `tolerance`, each with the relative gap.
 *
 * Empty when they agree. A path present in one map and absent from the other is always a
 * disagreement — that is a structural change wearing a numeric one, and it must not pass quietly.
 */
export function fieldDisagreements(
  actual: ReadonlyMap<string, number>,
  expected: ReadonlyMap<string, number>,
  tolerance = RELATIVE_TOLERANCE,
): readonly string[] {
  const out: string[] = [];
  for (const [path, expectedValue] of expected) {
    const measured = actual.get(path);
    if (measured === undefined) {
      out.push(`${path}: expected ${String(expectedValue)}, absent from the measured result`);
      continue;
    }
    if (agreesWithin(measured, expectedValue, tolerance)) continue;
    const scale = Math.max(Math.abs(expectedValue), Math.abs(measured));
    const relative =
      scale === 0 ? Number.POSITIVE_INFINITY : Math.abs(measured - expectedValue) / scale;
    out.push(
      `${path}: expected ${String(expectedValue)}, measured ${String(measured)} (relative ${relative.toExponential(2)})`,
    );
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) out.push(`${path}: present in the measured result, absent from the pin`);
  }
  return out;
}
