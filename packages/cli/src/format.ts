/**
 * Number and metric rendering.
 *
 * Two rules, both from CLAUDE.md § Statistical discipline rather than from taste:
 *
 * 1. **An absent measurement never renders as a number.** `NaN` is how `metrics/` says "nobody
 *    was served in this window" and `Infinity` is how it says "no denominator"; both print as a
 *    dash with the reason beside them, never as `0.0 s`.
 * 2. **A number that must not be quoted is not printed.** A saturated run's AWT and an
 *    `unmeasurable` achieved interval each have their own rendering that contains no digits, so
 *    there is nothing for a reader to copy into a slide.
 *
 * And one rule from taste: `16.4499999999` is a bug in the report, not in the simulator.
 */

import type { IntervalStatistics, RunSummary } from '@elevator-sim/core';

/** What a dash means, when a measurement is absent. */
export const ABSENT = '—';

/** A finite number at fixed precision, or {@link ABSENT}. Never scientific notation. */
export function num(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return ABSENT;
  const fixed = value.toFixed(digits);
  // `-0.0` is a rounding artefact, not a measurement.
  return fixed === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : fixed;
}

/** Seconds with their unit. */
export function secs(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${num(value, digits)} s` : ABSENT;
}

/** A percentage already on a 0–100 scale. */
export function pct(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${num(value, digits)} %` : ABSENT;
}

/** A fraction on a 0–1 scale, rendered as a percentage. */
export function fractionAsPct(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${num(value * 100, digits)} %` : ABSENT;
}

/** Whole numbers with thin separators, so a six-figure passenger count is readable. */
export function count(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Simulated seconds as a clock, `m:ss` under an hour and `h:mm:ss` above it.
 *
 * Simulated time starts at zero, so this is an elapsed clock rather than a time of day.
 */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return ABSENT;
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A duration in words, for a demand horizon. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return ABSENT;
  if (seconds < 120) return `${num(seconds, 0)} s`;
  return `${num(seconds / 60, seconds % 60 === 0 ? 0 : 1)} min`;
}

/** `n thing` / `n things`. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count(n)} ${n === 1 ? singular : pluralForm}`;
}

/* -------------------------------------------------------------------------- *
 * The two metrics that are allowed to refuse to be numbers
 * -------------------------------------------------------------------------- */

export interface RenderedMetric {
  /** What to print. Contains no digits when {@link quotable} is `false`. */
  readonly text: string;
  /** Whether the value may be repeated as a result. */
  readonly quotable: boolean;
  /** Why not, when it may not. */
  readonly reason?: string | undefined;
}

/**
 * The achieved interval, or an explicit statement that this building has none.
 *
 * `departureGapBasis: 'unmeasurable'` is a verdict about the building — both mixed-use towers
 * return it, because the longest door reopen is at least the shortest round trip, so a reopen
 * and a departure cannot be told apart in the boarding times. Printing `FALLBACK_DEPARTURE_GAP_S`
 * there would be printing a constant and calling it a measurement.
 */
export function renderAchievedInterval(stats: IntervalStatistics): RenderedMetric {
  if (stats.departureGapBasis === 'unmeasurable') {
    return {
      text: 'unmeasurable',
      quotable: false,
      reason:
        'no departure-gap threshold is valid for this building — a door reopen and a departure are indistinguishable in the boarding times',
    };
  }
  if (!Number.isFinite(stats.meanS)) {
    return {
      text: ABSENT,
      quotable: false,
      reason:
        stats.departureCount < 2
          ? `only ${count(stats.departureCount)} terminal departure(s) in the window — too few gaps to measure an interval`
          : 'no interval could be computed over this window',
    };
  }
  const cov = Number.isFinite(stats.coefficientOfVariation)
    ? `, CoV ${num(stats.coefficientOfVariation, 2)}`
    : '';
  return {
    text: `${secs(stats.meanS)} (${count(stats.departureCount)} departures${cov}, threshold ${stats.departureGapBasis})`,
    quotable: true,
  };
}

/**
 * AWT, or an explicit refusal.
 *
 * `RunSummary.awtIsValid` is `false` on saturation, on censoring, or on an empty window, and
 * docs/03-traffic-and-statistics.md is explicit that a mean must not be reported for a system
 * whose queues grow without bound. So the suppressed rendering carries no digits at all.
 */
export function renderAwt(summary: RunSummary): RenderedMetric {
  if (!summary.awtIsValid) {
    return {
      text: 'SUPPRESSED',
      quotable: false,
      reason: summary.awtInvalidReason ?? 'this run’s average waiting time is not reportable',
    };
  }
  if (!Number.isFinite(summary.waiting.meanS)) {
    return { text: ABSENT, quotable: false, reason: 'nobody was served inside the report window' };
  }
  return { text: secs(summary.waiting.meanS, 2), quotable: true };
}

/**
 * The longest wait in the window — **always shown, never suppressed.**
 *
 * The mean is an estimate and the suppression rules are about estimates; the longest wait is an
 * *observation*, and it is the observation that a suppressed AWT is usually hiding. Printing
 * `SUPPRESSED` here — which this report used to do, off `waiting.maxS` — removed the evidence at
 * exactly the moment it mattered, and did so twice over: `waiting.maxS` is computed over the legs
 * that **boarded**, so on a run whose worst passenger never boarded at all it reported the longest
 * wait among the people who were eventually collected. `RunSummary.serviceLevel` counts the
 * unserved at their lower bound, and this says so when it is one.
 *
 * `undefined` when the window held no arrivals, so there is no wait to report.
 */
export function renderLongestWait(summary: RunSummary): RenderedMetric | undefined {
  const level = summary.serviceLevel;
  switch (level.verdict) {
    case 'no-arrivals':
      return undefined;
    case 'served':
    case 'starved': {
      const who =
        level.longestWaitLegId === undefined
          ? ''
          : ` (leg ${level.longestWaitLegId}, ${String(level.longestWaitOriginFloorId)} to ${String(level.longestWaitDestinationFloorId)})`;
      const bound = level.longestWaitIsCensored ? 'at least ' : '';
      const text = `${bound}${secs(level.longestWaitS, 1)}${who}`;
      if (level.verdict === 'served') return { text, quotable: true };
      return {
        text,
        quotable: false,
        reason:
          `past the ${num(level.horizonS, 0)} s abandonment horizon, and so are ` +
          `${count(level.overHorizonCount)} of ${count(level.arrivalCount)} arrivals in the window.`,
      };
    }
  }
}

/** A one-line saturation verdict, or `undefined` when the queue did not diverge. */
export function renderSaturation(summary: RunSummary): string | undefined {
  const saturation = summary.saturation;
  if (!saturation.saturated) return undefined;
  return `queue length grew by ${num(saturation.slopePersonsPerMinute, 2)} persons/min over the fitted window (${count(saturation.sampleCount)} samples, R² ${num(saturation.rSquared, 2)}), peaking at ${count(saturation.maxQueueLength)} waiting`;
}

/**
 * A confidence interval, always as `mean [lower, upper]`.
 *
 * There is no code path here that renders a bare mean. That is the point: CLAUDE.md forbids
 * declaring a difference without an interval, and the cheapest way to keep that true is to make
 * the interval part of the same string.
 */
export function renderEstimate(
  mean: number,
  lower: number,
  upper: number,
  options: { readonly digits?: number; readonly unit?: string } = {},
): string {
  const digits = options.digits ?? 2;
  const unit = options.unit === undefined ? '' : ` ${options.unit}`;
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return `${num(mean, digits)}${unit}  [interval unavailable: fewer than two replications]`;
  }
  return `${num(mean, digits)}${unit}  [${num(lower, digits)}, ${num(upper, digits)}]`;
}

/**
 * A signed difference, so the direction of an effect is legible at a glance.
 *
 * A non-zero value that rounds to zero keeps its sign — `-0.00` rather than `0.00`. An interval
 * of `[-2.33, -0.00]` beside the word BETTER is coherent; `[-2.33, 0.00]` beside it looks like a
 * contradiction, and the reader is right to distrust it.
 */
export function signed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return ABSENT;
  if (value === 0) return num(0, digits);
  const magnitude = Math.abs(value).toFixed(digits);
  return value < 0 ? `-${magnitude}` : `+${magnitude}`;
}

/** A signed confidence interval on a difference. */
export function renderSignedEstimate(
  mean: number,
  lower: number,
  upper: number,
  options: { readonly digits?: number; readonly unit?: string } = {},
): string {
  const digits = options.digits ?? 2;
  const unit = options.unit === undefined ? '' : ` ${options.unit}`;
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return `${signed(mean, digits)}${unit}  [interval unavailable: fewer than two replications]`;
  }
  return `${signed(mean, digits)}${unit}  [${signed(lower, digits)}, ${signed(upper, digits)}]`;
}

/** A horizontal bar, for load factors and weight vectors. Pure ASCII-safe block glyphs. */
export function bar(fraction: number, width: number): string {
  if (!Number.isFinite(fraction)) return ' '.repeat(width);
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '·'.repeat(Math.max(0, width - filled));
}
