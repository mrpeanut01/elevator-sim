/**
 * Wall-clock and memory instrumentation for the Phase 8 scale track.
 *
 * ## Why it lives in `validation/` and not in a `perf/` directory
 *
 * Not arbitrary. `core/src/sim/moduleTree.test.ts` requires every source directory under
 * `packages/<pkg>/src` to appear in `docs/01-architecture.md`'s module tree, **in both
 * directions** — a directory on disk and absent from the map is a failure, and so is a directory
 * on the map and absent from disk. So a new source directory is a documentation change as well
 * as a code change, and `docs/` has a different owner. `validation/` is this package's
 * acceptance-gate directory, is already on the map, and is where a Phase 8 gate belongs anyway.
 * The alternative — a `perf/` directory plus a requested edit to `docs/01` — would have left the
 * suite red until somebody else acted on the request.
 *
 * ## Why this file exists at all, and why it is here rather than in `core`
 *
 * `CLAUDE.md` invariant 3: **no wall-clock time in `core/`.** No `Date.now()`, no
 * `performance.now()`, no timers. That is not a style rule — a simulator that could read a clock
 * could produce a different answer on a busy machine, and every determinism guarantee in this
 * repository rests on it not being able to. So the clock lives out here, in the package that is
 * *allowed* one, and `core` is measured from the outside exactly as any other opaque function
 * would be. Nothing in this module is imported by `core`, and nothing in it can be: `core` does
 * not depend on `experiments`.
 *
 * ## What a performance number is worth, and what it is not
 *
 * A single number — "the 100-floor building runs in 812 ms" — is a fact about one machine on one
 * afternoon and is worth almost nothing to a reader on a different one. What transfers is the
 * **shape**: whether doubling the floors doubles the time or quadruples it, and which of floors,
 * cars and demand dominates. {@link fitPowerLaw} is therefore the primary instrument here and the
 * stopwatch is secondary, and the suites assert exponents rather than milliseconds.
 *
 * Exponents are also what a threshold can honestly be set on. A CI box two times slower fails an
 * absolute-millisecond assertion and passes a "cost grows no worse than quadratically in cars"
 * one, and only the second was ever a statement about the code.
 */

/* -------------------------------------------------------------------------- *
 * Timing
 * -------------------------------------------------------------------------- */

/** One timed measurement. Nanoseconds, because `Date.now()` cannot resolve a fast run. */
export interface Timing<T> {
  readonly value: T;
  readonly nanoseconds: number;
  readonly seconds: number;
}

/** Run `work` once and time it with the monotonic clock. */
export function timed<T>(work: () => T): Timing<T> {
  const start = process.hrtime.bigint();
  const value = work();
  const nanoseconds = Number(process.hrtime.bigint() - start);
  return { value, nanoseconds, seconds: nanoseconds / 1e9 };
}

/**
 * Run `work` `repeats` times and report the **median** elapsed time.
 *
 * Median rather than mean, and rather than minimum. The mean is dragged by a single garbage
 * collection or a scheduler preemption; the minimum reports a best case a real sweep never sees.
 * The median is the number that predicts how long 20 000 of these will take, which is the only
 * question the scale track is actually asking.
 *
 * A warm-up iteration is run and discarded, because the first call through a JIT-compiled path is
 * measuring the compiler.
 */
export function medianSeconds(work: () => unknown, repeats = 3): number {
  work();
  const samples: number[] = [];
  for (let index = 0; index < repeats; index += 1) samples.push(timed(work).seconds);
  samples.sort((a, b) => a - b);
  const middle = Math.floor(samples.length / 2);
  return samples.length % 2 === 1
    ? (samples[middle] as number)
    : ((samples[middle - 1] as number) + (samples[middle] as number)) / 2;
}

/* -------------------------------------------------------------------------- *
 * Curve fitting
 * -------------------------------------------------------------------------- */

export interface PowerLawFit {
  /** The exponent `b` in `y ≈ a·x^b`. The whole point of the exercise. */
  readonly exponent: number;
  readonly coefficient: number;
  /** `R²` of the fit in log-log space. Low means the model is wrong, not that the code is fast. */
  readonly rSquared: number;
  readonly points: readonly (readonly [number, number])[];
}

/**
 * Least squares on `log y` against `log x` — the exponent of a power law.
 *
 * Reported with `R²` and never without it. A fitted exponent from a relationship that is not a
 * power law is a number with no meaning, and the honest failure mode of this whole track is
 * quoting one anyway. A suite that asserts an exponent must also assert the fit is good enough to
 * have one, which is why `rSquared` is not optional.
 *
 * @throws Error on fewer than three points, or on a non-positive coordinate. Two points always
 *   fit a line exactly, which would make `R² = 1` a statement about arithmetic rather than data.
 */
export function fitPowerLaw(points: readonly (readonly [number, number])[]): PowerLawFit {
  if (points.length < 3) {
    throw new Error(
      `fitPowerLaw needs at least three points to be a fit rather than an interpolation; received ${String(points.length)}.`,
    );
  }
  for (const [x, y] of points) {
    if (!(x > 0) || !(y > 0)) {
      throw new Error(`fitPowerLaw is over log-log space and needs positive coordinates; received (${String(x)}, ${String(y)}).`);
    }
  }

  const xs = points.map(([x]) => Math.log(x));
  const ys = points.map(([, y]) => Math.log(y));
  const n = xs.length;
  const meanX = xs.reduce((total, value) => total + value, 0) / n;
  const meanY = ys.reduce((total, value) => total + value, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (const [index, x] of xs.entries()) {
    sxy += (x - meanX) * ((ys[index] as number) - meanY);
    sxx += (x - meanX) ** 2;
  }
  const exponent = sxy / sxx;
  const intercept = meanY - exponent * meanX;

  let residual = 0;
  let total = 0;
  for (const [index, x] of xs.entries()) {
    const predicted = intercept + exponent * x;
    residual += ((ys[index] as number) - predicted) ** 2;
    total += ((ys[index] as number) - meanY) ** 2;
  }

  return {
    exponent,
    coefficient: Math.exp(intercept),
    rSquared: total === 0 ? Number.NaN : 1 - residual / total,
    points: points.map(([x, y]) => [x, y] as const),
  };
}

/** `x^1.87 (R² 0.998)` — an exponent nobody can quote without its fit quality. */
export function formatFit(label: string, fit: PowerLawFit): string {
  return `${label}: cost ∝ x^${fit.exponent.toFixed(2)} (R² ${fit.rSquared.toFixed(3)}, ${String(fit.points.length)} points)`;
}

/* -------------------------------------------------------------------------- *
 * Memory
 * -------------------------------------------------------------------------- */

export interface HeapDelta {
  readonly beforeMb: number;
  readonly afterMb: number;
  readonly deltaMb: number;
}

/**
 * Heap used before and after `work`, in MiB.
 *
 * **Indicative, never assertable to a threshold.** `heapUsed` moves with garbage collection, and
 * this process cannot force one without `--expose-gc`, which the repository's `vitest` invocation
 * does not pass. So a delta measured here can be negative, and a suite that asserted "under 50 MB"
 * would be asserting the collector's mood. Where the scale track needs a memory number it can
 * stand behind, it uses the **serialized size of a record**, which is a deterministic function of
 * the run. This is reported alongside as context.
 */
export function heapAround<T>(work: () => T): { readonly value: T; readonly heap: HeapDelta } {
  const beforeMb = process.memoryUsage().heapUsed / 1024 / 1024;
  const value = work();
  const afterMb = process.memoryUsage().heapUsed / 1024 / 1024;
  return { value, heap: { beforeMb, afterMb, deltaMb: afterMb - beforeMb } };
}
