/**
 * Term normalization — the step that makes weights mean something.
 *
 * CLAUDE.md is explicit about why this file exists: *"Raw `waitTime` (0–120 s) and
 * `stopCount` (0–20) on the same scale produce uninterpretable weights and an unsearchable
 * space."* Without normalization a weight vector is not a preference, it is an accident of
 * units — halving the floor pitch would silently retune every dispatcher in the file, and a
 * Phase 7 optimizer searching `[0, 5]` on each weight would spend its budget discovering
 * unit conversions.
 *
 * ## The scheme
 *
 * Every term declares one of two maps onto the shared `[0, 1]` scale.
 *
 * ### `saturating` — for a raw value with no upper bound
 *
 * ```
 * normalize(x) = x / (reference + x)          x ≥ 0
 * ```
 *
 * | property | why it matters |
 * |---|---|
 * | bounded in `[0, 1)` | every term is on the same scale, so `waitTime: 0.6, stopCount: 0.3` is a ratio of preferences rather than of units |
 * | **strictly increasing** everywhere | ordering survives at any magnitude. A hard clamp would rank a 200 s wait and a 400 s wait identically, and a nearest-car dispatcher that clamps stops distinguishing cars once every candidate is far away — exactly when the choice matters most |
 * | linear near zero (`x/(1+x) ≈ x` for `x ≪ 1`) | small differences, which is most of them, behave the way an author expects |
 * | `normalize(reference) = 0.5` | the reference has an operational meaning: it is the **half-cost point** |
 * | scale-free in the ranking | a single-term profile is *invariant* to its reference, because the map is monotonic. `normalize.test.ts` asserts it: nearest-car picks the same car for any `distanceM` |
 *
 * The reference is a genuine tunable: it changes the curvature of the map, not merely its
 * gain, so it is not recoverable by rescaling the weight.
 *
 * ### `bounded` — for a raw value with a known finite maximum
 *
 * ```
 * normalize(x) = clamp(x / fullScale, 0, 1)
 * ```
 *
 * `fullScale` is a **constant on the term definition, never a tunable**. For a linear map the
 * scale is exactly a gain, `w · (x/s) = (w/s) · x`, so exposing it would hand a Phase 7
 * optimizer a perfectly degenerate direction — two knobs that only ever move the product —
 * and it would spend evaluations discovering that. `directionReversal` is the Phase 2
 * example: a car makes 0, 1 or 2 direction changes on account of a call, and 2 is the
 * maximum by construction.
 *
 * ## Choosing a reference
 *
 * The defaults are quantities the project already reports against, not round numbers:
 *
 * - `waitTimeS = 60` — the threshold behind the **% > 60 s** metric
 *   (docs/03-traffic-and-statistics.md). A 60-second wait costing half of the theoretical
 *   maximum is a statement an engineer can argue with, which is the test of a good reference.
 * - `distanceM = 30` — roughly nine floor-to-floor heights at 3.4 m, so a call nine floors
 *   away costs half. The same order as the reference buildings' rise per bank.
 *
 * Both are declared in `DISPATCH_PARAMETERS` with ranges, so Phase 7 tunes them like anything
 * else rather than inheriting these two numbers as folklore.
 *
 * Everything here is pure: no clock, no RNG, no state.
 */

import { DispatchError, type CostTermDefinition, type ResolvedNormalization } from './types.js';

/* -------------------------------------------------------------------------- *
 * Defaults
 * -------------------------------------------------------------------------- */

/**
 * The reference scales used when a profile declares none.
 *
 * This object is the single source of truth: `DISPATCH_PARAMETERS` quotes it rather than
 * repeating the numbers, so the declared schema and the resolver can never disagree.
 */
export const NORMALIZATION_DEFAULTS: ResolvedNormalization = Object.freeze({
  /** Seconds. The `% > 60 s` threshold; a 60 s wait normalizes to 0.5. */
  waitTimeS: 60,
  /** Metres. About nine floor-to-floor heights; 30 m of added travel normalizes to 0.5. */
  distanceM: 30,
});

/* -------------------------------------------------------------------------- *
 * The maps
 * -------------------------------------------------------------------------- */

/**
 * `x / (reference + x)`, clamped into `[0, 1]`.
 *
 * `Infinity` maps to 1 rather than to `NaN`. An infeasible car is filtered out at stage 2 and
 * should never reach a term, but a term that receives one must still rank it last instead of
 * poisoning the whole weighted sum with a `NaN` that compares false against everything.
 *
 * @throws DispatchError if `reference` is not finite and positive — a zero reference makes
 *   every non-zero raw value normalize to exactly 1 and silently deletes the term.
 */
export function saturatingNormalize(raw: number, reference: number): number {
  if (!Number.isFinite(reference) || reference <= 0) {
    throw new DispatchError(
      `A saturating reference scale must be a finite positive number; received ${reference}. At zero every non-zero value normalizes to 1 and the term stops discriminating.`,
    );
  }
  if (Number.isNaN(raw)) {
    throw new DispatchError('A cost term returned NaN. Terms must return a finite, non-negative number.');
  }
  if (raw === Number.POSITIVE_INFINITY) return 1;
  const x = Math.max(0, raw);
  return x / (reference + x);
}

/**
 * `clamp(x / fullScale, 0, 1)`.
 *
 * @throws DispatchError if `fullScale` is not finite and positive.
 */
export function boundedNormalize(raw: number, fullScale: number): number {
  if (!Number.isFinite(fullScale) || fullScale <= 0) {
    throw new DispatchError(
      `A bounded full-scale value must be a finite positive number; received ${fullScale}.`,
    );
  }
  if (Number.isNaN(raw)) {
    throw new DispatchError('A cost term returned NaN. Terms must return a finite, non-negative number.');
  }
  return Math.min(1, Math.max(0, raw / fullScale));
}

/**
 * Apply a term's declared normalization to a raw value.
 *
 * The single entry point the engine uses, so a term can never be scored on a scale other than
 * the one it declares.
 *
 * @returns a number in `[0, 1]`.
 */
export function normalizeTerm(
  term: CostTermDefinition,
  raw: number,
  scales: ResolvedNormalization,
): number {
  if (term.normalization.mode === 'bounded') {
    return boundedNormalize(raw, term.normalization.fullScale);
  }
  return saturatingNormalize(raw, scales[term.normalization.scale]);
}

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

/**
 * Merge declared reference scales over the defaults.
 *
 * Pure. Validates eagerly, because a non-positive reference produces a term that silently
 * stops discriminating rather than an error, and a dispatcher with a dead term looks like a
 * dispatcher with a bad weight vector.
 *
 * @throws DispatchError if any scale is not a finite positive number.
 */
export function resolveNormalization(
  overrides?: Partial<ResolvedNormalization> | undefined,
): ResolvedNormalization {
  const waitTimeS = overrides?.waitTimeS ?? NORMALIZATION_DEFAULTS.waitTimeS;
  const distanceM = overrides?.distanceM ?? NORMALIZATION_DEFAULTS.distanceM;
  requirePositive(waitTimeS, 'normalization.waitTimeS');
  requirePositive(distanceM, 'normalization.distanceM');
  return Object.freeze({ waitTimeS, distanceM });
}

function requirePositive(value: number, id: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DispatchError(`${id} must be a finite positive number; received ${value}.`);
  }
}
