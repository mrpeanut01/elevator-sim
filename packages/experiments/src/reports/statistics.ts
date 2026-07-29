/**
 * The interval arithmetic the reports are built on: sample moments, Student-t and normal
 * quantiles, and the paired difference interval.
 *
 * ## Scope, and why this is internal
 *
 * Not exported from this module's barrel. `experiments/stats/` owns the package's public
 * statistical surface (sequential stopping, paired-t, saturation); what is here is the minimum a
 * *report* needs to be self-contained, so that a stored result set can be turned into a
 * defensible printed page without a second module in the loop. Keeping it unexported means the
 * two can be reconciled later without a breaking API change, and cannot collide in the meantime.
 *
 * ## One quantile, and why there is no longer a second one
 *
 * docs/03-traffic-and-statistics.md states the interval arithmetic in two places, and until
 * 2026-07 this module implemented both:
 *
 * - **§ Part 4, "Use a paired-t interval"** is the *published* interval. It
 *   states one formula with no `n` in the choice of family:
 *
 *   ```
 *   D̄ ± t[n-1, conf] * (s_D / sqrt(n))
 *   ```
 *
 *   That is {@link publishedIntervalQuantile}, and it is the only quantile {@link estimateMean}
 *   and {@link pairedDifferenceEstimate} reach.
 *
 * - **§ Part 3, "Sequential stopping rule"** is *loop control*. That section **used to** write it
 *   with a crossover — `t[n-1, conf]` at `n <= 25`, `z[conf]` above — on the argument that a
 *   stopping decision may be approximate because being 5% optimistic about when to stop costs
 *   replications rather than validity. **It no longer does**: since 2026-07-27 the doc's own
 *   four-line rule is three lines reading `# every n — no crossover`, and it names the textbook
 *   split as literature rather than as this repository's rule.
 *
 * **That argument does not survive the two rules sharing a target.** The runner's
 * `acceptableRange` is a half-width target, and the report's `ConvergenceReport` decides
 * `converged` from the *published* half-width. Give the loop control a narrower quantile than the
 * page and the two disagree about the same cell: the runner stops, and the page prints a
 * half-width above the target it stopped at. So this module no longer ships a second quantile.
 * `validation/harness.ts`'s `productionStoppingRule` injects {@link estimateMean} itself, the loop
 * stops exactly when the published interval meets its target, and the crossover — which had **no
 * non-test caller** after review finding #14 was fixed — is deleted rather than left exported
 * with a caller list nothing satisfies (docs/05-roadmap.md § *Standing requirement*, and
 * DECISIONS.md § D7). The instruction this paragraph used to carry — *"§ Part 3 needs correcting to
 * `t[n-1]` at every `n`; that doc is not this module's to edit"* — is **discharged**: the doc was
 * corrected, and a docstring that still asks for it is a stale claim about a sibling artefact,
 * which is the shape § D60 measured seven instances of.
 *
 * Review finding #14 measured what the crossover cost when it *was* on the published path: at n=26
 * the published half-width used z=1.95996 where the doc prescribes t(25)=2.06390, so it was 4.83%
 * too narrow and a nominal 95% interval had **93.876%** actual coverage — a 6.12% false-positive
 * rate against a declared 5%. At the project's documented 50-200 replication budget that applied to
 * *every* comparison the repository published, under a CLI line reading "the paired-t interval".
 * Three of 148 real paired comparisons in the review's sweep flipped verdict.
 *
 * The guarantee is now structural rather than advisory: there is exactly one quantile function,
 * its return type is narrowed to `'t'` and cannot say `'z'`, and no exported symbol in this
 * package will choose a normal quantile by `n`. Re-introducing the bug means writing a new
 * function to do it.
 *
 * § "AWT is lognormal, but approximate it as normal" is the licence for using a normal-theory
 * interval on a quantity that cannot be negative: Peters & Abbi tested Cox's lognormal interval
 * and rejected it — at 1000 runs it put a 5 s mean between 0.7 s and 36.1 s. The normal
 * approximation *for the mean* is the standard and defensible answer, and the paired difference
 * this module actually reports on is better behaved still, being a difference of two averages
 * over the same traces.
 *
 * ## Numerics
 *
 * The t quantile is computed rather than looked up in a table, because a report has to be able to
 * state any confidence level a caller asks for and an interpolated table is a silent source of
 * wrong half-widths. `studentTQuantile` inverts the exact t CDF — expressed through the
 * regularized incomplete beta function, evaluated by the Lentz continued fraction — by bisection.
 * Checked against published tables in `statistics.test.ts` to seven significant figures.
 *
 * Everything here is a pure function of its arguments: no RNG (CLAUDE.md invariant 2), no clock
 * (invariant 3), no mutation of any input.
 */

import { ReportsError, type MeanEstimate } from './types.js';

/* -------------------------------------------------------------------------- *
 * Constants
 * -------------------------------------------------------------------------- */

/**
 * Default two-sided confidence level.
 *
 * 95%, the level Peters & Abbi report against and the one CLAUDE.md's discipline section is
 * written in terms of. The doc's sequential-stopping example uses 90%; that is a property of a
 * *stopping rule*, not of a published interval, and both are settable.
 */
export const DEFAULT_CONFIDENCE = 0.95;

/**
 * The one quantile family this package publishes — as a value, so the compiler holds it.
 *
 * Every interval produced here is Student-t at `n - 1`, at every `n` (§ "One quantile" above,
 * DECISIONS.md § D14). This constant is that guarantee where an interval is *computed*;
 * `compare.ts` imports the same constant for where a report is *assembled*, which is a different
 * place to get it wrong. It is deliberately **one** constant rather than one per module: two copies
 * of a convention that can disagree is the standing hazard § D114 measured the cost of.
 */
export const PUBLISHED_INTERVAL_FAMILY = 't' as const;

/**
 * A {@link MeanEstimate} whose family label is pinned to {@link PUBLISHED_INTERVAL_FAMILY}.
 *
 * `MeanEstimate.method` is typed `IntervalMethod`, the two-member union, because a *stored* run set
 * predating 2026-07 carries `'z'` and must still parse (`types.ts` § IntervalMethod). That width is
 * right for the **stored** shape and wrong for a freshly computed one, and the distinction is the
 * whole of open item `C33`: the `n < 2` branch of {@link estimateMean} used to widen a correct
 * literal back to the union with `'t' as IntervalMethod`, on an interval whose `halfWidth`, `lower`
 * and `upper` are all `NaN`. Narrowing the **construction sites** — the only ones in this package —
 * makes that assertion a compile error rather than a convention nothing checks.
 *
 * This is the same shape as `compare.ts`'s `PublishedConvergenceReport`, on purpose (§ D117).
 */
export type PublishedMeanEstimate = MeanEstimate & {
  readonly method: typeof PUBLISHED_INTERVAL_FAMILY;
};

/* -------------------------------------------------------------------------- *
 * Sample moments
 * -------------------------------------------------------------------------- */

/** Arithmetic mean. `NaN` for an empty sample — never `0`, which reads as a measurement. */
export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Sample standard deviation, `n - 1` denominator.
 *
 * `NaN` for fewer than two values. Zero would read as "perfectly reproducible", and one
 * replication of a lift peak is the specific thing docs/03-traffic-and-statistics.md § Part 3
 * warns about: individual-run AWT spanned 4.1–7.4 s on a configuration whose converged mean was
 * 5.0 s.
 */
export function sampleStdDevOf(values: readonly number[], mean = meanOf(values)): number {
  if (values.length < 2) return Number.NaN;
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - mean) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

/* -------------------------------------------------------------------------- *
 * Quantiles
 * -------------------------------------------------------------------------- */

/**
 * Standard normal quantile, `Φ⁻¹(p)`.
 *
 * Acklam's rational approximation with one Halley refinement against `erfc`; absolute error below
 * 1e-15 across the range this module uses. Reproduces the doc's z table exactly at the printed
 * precision: 1.04, 1.28, 1.65, 1.96, 2.58 for 70/80/90/95/99% two-sided.
 *
 * **This function has no production caller, and that is a claim rather than an oversight**
 * (docs/05-roadmap.md § *Standing requirement*). Deleting `halfWidthQuantile` — see the module
 * docstring and DECISIONS.md § D7 — removed the last one, because no interval this package
 * publishes or stops on is a normal-theory interval any more. It is kept for two reasons, both
 * checkable:
 *
 * 1. It is the **reference the t quantile is validated against.** `studentTQuantile(p, 1e6)` must
 *    converge on it, and `estimateMean`'s interval must stay strictly wider than it past n = 25 —
 *    the two assertions in `statistics.test.ts` that would catch a t implementation drifting onto
 *    the wrong family. A hard-coded table cannot do that at arbitrary confidence.
 * 2. It **pins the one `z` this repository still uses.** `benchmark/verdict.ts` states its
 *    replication-planning arithmetic `n >= (z · s_D / |d|)²` in `z` deliberately (a planning figure
 *    in the hundreds, where t and z agree to under a percent, and where using t would need the
 *    answer to know its own degrees of freedom) and hard-codes `Z_95 = 1.959963984540054`.
 *    `statistics.test.ts` asserts `normalQuantile(0.975)` against that same literal, so the two
 *    cannot drift apart silently.
 *
 * If either reason lapses, delete this rather than widening the justification.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    throw new ReportsError(`normalQuantile: p must lie strictly inside (0, 1); received ${p}`);
  }

  /* Coefficients: Peter Acklam's algorithm, central and tail regions. */
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ] as const;
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ] as const;
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ] as const;
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ] as const;

  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  /* One Halley step, which takes the approximation to machine precision. */
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/**
 * Two-sided Student-t quantile `t[df, p]` such that `P(T <= t) = p`.
 *
 * Exact CDF, inverted by bisection: the t CDF is monotone, so 200 halvings of `[0, 1e4]` pin the
 * root to well under 1e-12 and there is no convergence case to get wrong. Slower than a rational
 * approximation and irrelevantly so — a report computes a handful of quantiles, not a million.
 */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) {
    throw new ReportsError(`studentTQuantile: p must lie strictly inside (0, 1); received ${p}`);
  }
  if (!Number.isFinite(df) || df <= 0) {
    throw new ReportsError(`studentTQuantile: df must be a positive number; received ${df}`);
  }
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTQuantile(1 - p, df);

  let low = 0;
  let high = 1e4;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, df) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** `P(T <= t)` for `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - tail : tail;
}

/**
 * **The only interval quantile this package has:** Student-t at `n - 1` degrees of freedom, at
 * every `n`.
 *
 * Module-private on purpose. It is not part of the package's surface — `estimateMean` is — and the
 * package barrel is owned elsewhere; keeping it internal also means there is exactly one caller and
 * therefore exactly one place an interval's family is decided.
 *
 * docs/03-traffic-and-statistics.md § Part 4, "Use a paired-t interval", states one formula and
 * puts no `n` in the choice of family:
 *
 * ```
 * D̄ ± t[n-1, conf] * (s_D / sqrt(n))
 * ```
 *
 * The return type is narrowed to `'t'` on purpose. A published estimate cannot report `'z'`,
 * so nothing downstream — `formatMeanEstimate`'s family label, the CLI's "the paired-t interval
 * excludes zero" line, the convergence report's `method` — can describe a normal-approximation
 * half-width as a paired-t one. That mislabelling was half of review finding #14.
 *
 * There is no efficiency argument on the other side: t(n−1) *converges to* z as n grows (2.0595 at
 * n=26, 1.9720 at n=200), so using t everywhere costs a fraction of a percent of half-width at
 * large n and is exactly right at small n. The normal approximation is the one that needs an excuse.
 *
 * Precondition: `n >= 2`. {@link estimateMean} is the only caller and returns a `NaN` interval
 * below that before it ever gets here — one replication has no measurable spread, which is a
 * different statement from "the quantile is undefined".
 */
function publishedIntervalQuantile(
  n: number,
  confidence: number,
): { readonly quantile: number; readonly method: typeof PUBLISHED_INTERVAL_FAMILY } {
  assertConfidence(confidence);
  const p = 1 - (1 - confidence) / 2;
  return { quantile: studentTQuantile(p, n - 1), method: PUBLISHED_INTERVAL_FAMILY };
}

/* -------------------------------------------------------------------------- *
 * Interval estimates
 * -------------------------------------------------------------------------- */

export interface EstimateOptions {
  /** Two-sided confidence level as a fraction. Default {@link DEFAULT_CONFIDENCE}. */
  readonly confidence?: number | undefined;
}

/**
 * Mean, spread and confidence interval over one value per replication.
 *
 * The interval is **Student-t at `n - 1`, at every `n`** ({@link publishedIntervalQuantile}), so
 * `method` is always `'t'` and `degreesOfFreedom` is always `n - 1` on a returned interval. There
 * is no `n > 25` normal approximation anywhere in this package any more, on the published path or
 * on the stopping rule's — see the module docstring's "One quantile".
 *
 * This is also the estimator `validation/harness.ts` injects into `halfWidthStoppingRule`, so a
 * sequentially-stopped experiment stops exactly when the interval it will print meets its target.
 *
 * @throws ReportsError on an empty sample, or on any non-finite value. A `NaN` that reaches a
 *   mean produces a `NaN` interval, which prints as an interval and is not one; the caller's job
 *   is to decide what an absent measurement means (see `candidateMetric`) rather than to let it
 *   propagate.
 *
 * `n = 1` is allowed and yields `NaN` for the spread and both bounds. That is deliberate: the
 * mean of one replication is a real number and the interval around it is genuinely unknown, and
 * the report suppresses it rather than printing a mean with no interval.
 */
export function estimateMean(
  values: readonly number[],
  options: EstimateOptions = {},
): PublishedMeanEstimate {
  if (values.length === 0) {
    throw new ReportsError('estimateMean: at least one replication is required');
  }
  for (const [index, value] of values.entries()) {
    if (!Number.isFinite(value)) {
      throw new ReportsError(
        `estimateMean: replication ${index} contributed ${String(value)}; every value must be finite. An absent measurement must be excluded deliberately, not averaged`,
      );
    }
  }

  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;
  assertConfidence(confidence);

  const n = values.length;
  const mean = meanOf(values);
  const stdDev = sampleStdDevOf(values, mean);
  const standardError = stdDev / Math.sqrt(n);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (n < 2) {
    return Object.freeze({
      n,
      mean,
      stdDev: Number.NaN,
      standardError: Number.NaN,
      confidence,
      /*
       * The family the interval *would* have had, on an interval that does not exist: `halfWidth`,
       * `lower` and `upper` are all `NaN` below n = 2. It used to read `'t' as IntervalMethod` —
       * an assertion widening a correct literal back to the union for no reason, and the last place
       * in `reports/` where the family lost its narrow type. Open item `C33`; the return type is
       * now what keeps it narrow, rather than this line being careful.
       */
      method: PUBLISHED_INTERVAL_FAMILY,
      degreesOfFreedom: Number.NaN,
      halfWidth: Number.NaN,
      lower: Number.NaN,
      upper: Number.NaN,
      min,
      max,
    });
  }

  /* Student-t at n - 1, at every n — the one quantile this module has. Choosing a normal
     quantile by `n` here is review finding #14. See the module docstring. */
  const { quantile, method } = publishedIntervalQuantile(n, confidence);
  const halfWidth = quantile * standardError;
  return Object.freeze({
    n,
    mean,
    stdDev,
    standardError,
    confidence,
    method,
    degreesOfFreedom: n - 1,
    halfWidth,
    lower: mean - halfWidth,
    upper: mean + halfWidth,
    min,
    max,
  });
}

/**
 * The paired-t interval on `candidate - baseline`, replication by replication.
 *
 * The method docs/03-traffic-and-statistics.md § Part 4 requires, and the *only* method CLAUDE.md
 * permits for declaring one alternative better than another:
 *
 * ```
 * Dᵢ = AWT_A(i) − AWT_B(i)
 * D̄ ± t[n-1, conf] * (s_D / sqrt(n))
 * ```
 *
 * `t[n-1]` with no `n`-dependent switch, which is what the doc says and — since 2026-07 — what this
 * function does. It previously delegated to {@link estimateMean} while `estimateMean` reached for
 * the stopping rule's quantile past n=25; see the module docstring and review finding #14.
 *
 * The point is variance, not formality. `Var(A − B) = Var(A) + Var(B) − 2·Cov(A, B)`; common
 * random numbers make the covariance strongly positive, so the variance of the difference
 * collapses — published reductions reach ~94%, worth 5–20× in replications. Taking two separate
 * intervals and comparing them throws all of that away *and* invites the overlap fallacy.
 *
 * @throws ReportsError if the two series are of different lengths. Unequal series means the pairs
 *   are not pairs, and a "paired" interval over mismatched runs is a confident wrong answer.
 */
export function pairedDifferenceEstimate(
  candidate: readonly number[],
  baseline: readonly number[],
  options: EstimateOptions = {},
): PublishedMeanEstimate {
  if (candidate.length !== baseline.length) {
    throw new ReportsError(
      `pairedDifferenceEstimate: ${candidate.length} candidate values against ${baseline.length} baseline values. A paired interval requires one pair per replication`,
    );
  }
  const differences = candidate.map((value, index) => value - (baseline[index] as number));
  return estimateMean(differences, options);
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function assertConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new ReportsError(
      `confidence must be a fraction strictly inside (0, 1) — 0.95, not 95; received ${confidence}`,
    );
  }
}

/**
 * `I_x(a, b)`, the regularized incomplete beta function.
 *
 * Lentz's modified continued fraction, with the standard symmetry reflection so the expansion is
 * only ever evaluated where it converges quickly.
 */
function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Symmetric under (a, b, x) → (b, a, 1 − x), which is what makes the reflection below exact.
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const epsilon = 3e-16;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;

    /* Even step. */
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    /* Odd step. */
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < epsilon) break;
  }
  return h;
}

/** Lanczos approximation of `ln Γ(z)`, for `z > 0`. */
function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ] as const;
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const x = z - 1;
  let series = 0.99999999999980993;
  for (const [index, coefficient] of coefficients.entries()) {
    series += coefficient / (x + index + 1);
  }
  const t = x + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(series);
}

/** `erfc(x)`, to about 1e-16 — the refinement step of {@link normalQuantile} needs it. */
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;

  /* Chebyshev coefficients for erfc(x)·exp(x²)·(2+x), Numerical Recipes 3rd ed. */
  const coefficients = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
    -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
    -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
  ] as const;

  let d = 0;
  let dd = 0;
  for (let index = coefficients.length - 1; index > 0; index -= 1) {
    const tmp = d;
    d = ty * d - dd + (coefficients[index] as number);
    dd = tmp;
  }
  return t * Math.exp(-z * z + 0.5 * ((coefficients[0] as number) + ty * d) - dd);
}
