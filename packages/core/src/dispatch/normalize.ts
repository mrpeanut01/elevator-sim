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
 * The two defaults are quantities the project already reports against, not round numbers:
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
 * ## All twelve terms, and what a weight of 1.0 buys on each
 *
 * This is the table CLAUDE.md's warning is about — *"a weight of 1.0 on `waitTime` and 1.0 on
 * `stopCount` mean wildly different things"* — and the reason it no longer does. Each row is
 * the raw value at which that term reaches **half** of its range, so two terms weighted equally
 * are two preferences of equal strength at their respective half-cost points.
 * {@link termReferenceScale} returns these rows programmatically and
 * {@link TERM_SCALE_NOTES} carries the justifications, so the table cannot rot into a comment.
 *
 * | term | raw unit | map | half cost at | full cost at |
 * |---|---|---|---|---|
 * | `waitTime` | s | saturating `waitTimeS` | 60 s | never |
 * | `rideTime` | s | saturating `waitTimeS` | 60 s | never |
 * | `detourPenalty` | passenger·s | saturating `waitTimeS` | 60 passenger·s | never |
 * | `existingCallDelay` | s | saturating `waitTimeS` | 60 s | never |
 * | `directionReversal` | — | bounded 2 | 1 reversal | 2 reversals |
 * | `loadFactor` | fraction | bounded 1 | 0.5 of rated | rated load |
 * | `stopCount` | — | bounded 2 | 1 stop | 2 stops |
 * | `distanceTravelled` | m | saturating `distanceM` | 30 m | never |
 * | `starvation` | s | saturating `waitTimeS` | 60 s of raw, i.e. a **60 s-old call** | never |
 * | `zoneAffinity` | m | saturating `distanceM` | 30 m outside the zone | never |
 * | `predictedDemand` | m | saturating `distanceM` | 30 m of mean misalignment | never |
 * | `crowding` | fraction | bounded 1 | half the landing left behind | the whole landing |
 *
 * Three things about that table are worth stating rather than leaving to be inferred.
 *
 * **The passenger-time family shares one reference.** `waitTime`, `rideTime`,
 * `existingCallDelay`, `detourPenalty` and `starvation` all normalize on `waitTimeS`, because
 * all five are seconds of passenger time and the project's own threshold for "too long" is one
 * number. The cost is that Phase 7 cannot move one of the five half-cost points without moving
 * all five; the benefit is that a second of ride time and a second of wait are the same second,
 * which is the honest default. Splitting them is a `NORMALIZATION_SCALE_IDS` change, and a
 * deliberate one — see the note in this module's tests.
 *
 * **`detourPenalty` reads its reference as a product.** 60 passenger-seconds is six people
 * delayed ten seconds each as readily as one person delayed sixty, and the term's claim is
 * exactly that those are equally bad.
 *
 * **`starvation` puts its non-linearity in the raw value, not here.** Both maps above are
 * concave or linear, and a tail-latency term has to *accelerate* with age. So its raw value is
 * `age² / 60`, which composes with the saturating map into a sigmoid in age whose half-cost
 * point lands at a 60-second-old call. See `terms/starvation.ts`.
 *
 * Everything here is pure: no clock, no RNG, no state.
 */

import {
  DispatchError,
  type CostTermDefinition,
  type NormalizationMode,
  type NormalizationScaleId,
  type ResolvedNormalization,
} from './types.js';

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
 * Reference scales, as data
 * -------------------------------------------------------------------------- */

/**
 * Why each term's reference scale is the one it is, keyed by term id.
 *
 * The justifications from this module's table, in a form a test can check for completeness and a
 * report can print. Every id in `COST_TERMS` must have a row and no row may name a term that
 * does not exist — `normalize.test.ts` asserts both, so a term landing without a documented
 * reference scale fails a test rather than inheriting a number as folklore.
 */
export const TERM_SCALE_NOTES: Readonly<Record<string, string>> = Object.freeze({
  waitTime:
    'Seconds of passenger wait. Half cost at normalization.waitTimeS, the 60 s threshold behind the % > 60 s metric.',
  rideTime:
    'Seconds aboard. Shares waitTimeS with the wait: a second of ride time and a second of wait are the same second, which is the honest default.',
  detourPenalty:
    'Passenger-seconds of delay to those already aboard. Reads waitTimeS as a product — 60 is six people delayed ten seconds each, and the term claims that equals one person delayed sixty.',
  existingCallDelay:
    'Seconds of added delay summed over the calls the car already holds. Same passenger-time reference as the wait it delays.',
  directionReversal:
    'A count with a hard maximum: a call forces 0, 1 or 2 direction changes, so full scale is a constant of the term rather than a tunable gain.',
  loadFactor:
    'Fraction of rated load. Bounded at 1.0 because stage 2 has already filtered any car projected above rated — extra resolution there would be resolution on cars that cannot be chosen.',
  stopCount:
    'A count with a hard maximum: one call adds at most a pickup and a destination. Bounded at 2, the same constant and the same argument as directionReversal.',
  distanceTravelled:
    'Metres of added travel. Half cost at normalization.distanceM, about nine floor-to-floor heights.',
  starvation:
    'age² / 60 seconds, so the escalation is in the raw value — both normalization maps decelerate and a tail term must accelerate. Composed with waitTimeS the half-cost point is a 60 s-old call.',
  zoneAffinity:
    'Metres outside the car’s operational zone. Shares distanceM with distanceTravelled because both are distances in the same shaft.',
  predictedDemand:
    'Demand-weighted mean metres between where the car ends up and where demand is forecast. A shaft distance, so distanceM.',
  crowding:
    'Share of the landing this car would leave behind. A fraction of a queue cannot exceed the queue, so bounded at 1.',
});

/** One term's place on the shared scale: which map, and the raw values that reach half and full. */
export interface TermReferenceScale {
  readonly termId: string;
  /** SI unit of the raw value, or `''` for a dimensionless count or fraction. */
  readonly unit: string;
  readonly mode: NormalizationMode;
  /** The tunable reference divided by, or `undefined` for a `bounded` term. */
  readonly scale: NormalizationScaleId | undefined;
  /** Raw value that normalizes to exactly 0.5. */
  readonly halfCostRaw: number;
  /** Raw value that normalizes to 1, or `Infinity` for a saturating term, which never reaches it. */
  readonly fullCostRaw: number;
  /** Why this reference. From {@link TERM_SCALE_NOTES}. */
  readonly note: string;
}

/**
 * Where a term sits on the shared `[0, 1]` scale, under the given reference scales.
 *
 * The programmatic form of this module's table. Used by `normalize.test.ts` to assert the
 * half-cost point of every term really is what the table claims, which is the only way a
 * documented scale stays true.
 */
export function termReferenceScale(
  term: CostTermDefinition,
  scales: ResolvedNormalization = NORMALIZATION_DEFAULTS,
): TermReferenceScale {
  const note = TERM_SCALE_NOTES[term.id] ?? '';
  if (term.normalization.mode === 'bounded') {
    return Object.freeze({
      termId: term.id,
      unit: term.unit,
      mode: 'bounded' as const,
      scale: undefined,
      halfCostRaw: term.normalization.fullScale / 2,
      fullCostRaw: term.normalization.fullScale,
      note,
    });
  }
  const scale = term.normalization.scale;
  return Object.freeze({
    termId: term.id,
    unit: term.unit,
    mode: 'saturating' as const,
    scale,
    halfCostRaw: scales[scale],
    fullCostRaw: Number.POSITIVE_INFINITY,
    note,
  });
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
