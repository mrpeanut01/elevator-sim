/**
 * Drawing the interval — GitHub issue #119, and the one thing this product never showed.
 *
 * ## Why a picture, on a surface that has refused decoration everywhere else
 *
 * *"This is a product whose central claim is a confidence interval that excludes zero, and it never
 * draws one."* Compare emitted around seven hundred words of prose per verdict and not one axis. The
 * fact a reader has to extract from that prose — **does the interval cross zero** — is a single
 * spatial relation, and prose is the worst medium there is for a single spatial relation. Every
 * sentence stays; what this module adds is the one glance that tells a reader which sentence they
 * are about to read.
 *
 * ## What it may and may not encode
 *
 * The plot is a **projection of {@link BatchComparisonRow}**, not a second opinion about it.
 * {@link IntervalPlot.ranks} is copied from the row's verdict and never re-derived from the
 * geometry, so a plot cannot say *ordered* about a row that said *shown* or *under-budget*: R11's
 * energy axis and § D171's under-budget interval both draw a bar that clears zero and both refuse
 * to name an arm, and a picture that inferred a winner from `upper < 0` would be exactly the second
 * place deciding *better* that `BatchComparisonRow.favours` exists to prevent.
 *
 * `excludesZero` is the one geometric fact and it *is* geometric — it is `zeroAt` outside
 * `[lowerAt, upperAt]`, computed here, and `intervalPlot.test.ts` asserts it agrees with the
 * shipped `intervalContainsZero` on every row the report can produce. Two answers to *does this
 * cross zero* is the shape this repository keeps finding stale, so they are checked against each
 * other rather than trusted to agree.
 *
 * ## Geometry here, words next door
 *
 * Not one sentence is authored in this file, and that is deliberate rather than incidental. The
 * caption a plot is drawn with — *contains zero*, *excludes zero*, *an axis, so no arm is named
 * ahead* — is player-facing prose, and player-facing prose in this package answers to
 * `honesty/`: a module that authors it is either in a surface adapter or in an exclusion with a
 * reason, and *"an unchecked surface is red, not skipped"*. `dev/batchPanel.ts` is where this
 * panel's wording already lives and is already accounted for, so the wording went there and the
 * arithmetic stayed here. The split is also the better one on its own merits: this module can be
 * asserted against `intervalContainsZero` without a document, and the words can be reviewed
 * without reading any arithmetic.
 *
 * ## Per-row scales, said out loud
 *
 * Each row is scaled to its own interval, because average wait in seconds and unserved fraction as
 * a ratio share no axis. That makes bar *lengths* incomparable between rows, which is a real way to
 * mislead — so {@link IntervalPlot.domainLow} and {@link IntervalPlot.domainHigh} are on the object
 * and the mount draws them as end labels. A bar with its own numbers under it cannot be read as a
 * bar on somebody else's scale.
 */

import type { BatchComparisonRow } from './report.js';
import { BATCH_METRIC_PRESENTATION } from './types.js';

/**
 * One row's interval, reduced to what a renderer needs and nothing it could misuse.
 *
 * Positions are fractions of the plot's width in `[0, 1]`, so the mount picks the pixels and this
 * module owns the arithmetic. Nothing here is in pixels, and nothing here is a colour.
 */
export interface IntervalPlot {
  readonly metric: string;
  /** The reader's name for the quantity, from the shipped presentation table. */
  readonly label: string;
  /** Rendered after a number, leading space included, or `''`. */
  readonly unit: string;
  readonly places: number;
  /** Fraction of the width at which the zero line sits. Always inside `[0, 1]`. */
  readonly zeroAt: number;
  readonly lowerAt: number;
  readonly meanAt: number;
  readonly upperAt: number;
  /** Domain ends in the metric's own units — drawn, so a per-row scale cannot be read as shared. */
  readonly domainLow: number;
  readonly domainHigh: number;
  /** Geometric: `zeroAt` is outside `[lowerAt, upperAt]`. Checked against `intervalContainsZero`. */
  readonly excludesZero: boolean;
  /**
   * Whether this row is one the project permits an ordering on — **copied from the verdict**.
   *
   * `true` only on `resolved`. An axis row and an under-budget row may both draw a bar clear of
   * zero and neither names an arm, so this is never inferred from the geometry above.
   */
  readonly ranks: boolean;
  /** `lower`, `mean`, `upper` unchanged, so the mount formats the numbers once and here never. */
  readonly lower: number;
  readonly mean: number;
  readonly upper: number;
}

/**
 * How much of the plot is padding on each side, as a fraction of the drawn span.
 *
 * Not zero: an interval one of whose bounds is exactly zero — `unservedFraction` reaches this on
 * several shipped buildings — would otherwise put an endpoint on the zero line and on the frame at
 * once, and a reader could not tell *touching* from *clipped*.
 */
const PAD = 0.12;

/**
 * The plot for a row, or `null` when the row has no interval to draw.
 *
 * `null` on `suppressed` and `unmeasured` — which carry `estimate: null` by construction — and on
 * the non-finite interval `compareMetric` routes to `unresolved` with an estimate whose bounds are
 * not numbers. A refusal is drawn as a refusal by the mount; inventing a bar for one would be the
 * opposite of what this surface is for.
 */
export function intervalPlotFor(row: BatchComparisonRow): IntervalPlot | null {
  const estimate = row.estimate;
  if (estimate === null) return null;
  const { lower, upper, mean } = estimate;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(mean)) return null;

  const presentation = BATCH_METRIC_PRESENTATION[row.metric];
  const low = Math.min(lower, 0);
  const high = Math.max(upper, 0);
  /*
   * A degenerate interval is still drawn, and the domain it gets is symmetric about zero.
   *
   * `unservedFraction` comes back as exactly `[0, 0]` on four of the eight shipped buildings — a
   * measurement, not an absence — and a span of zero would divide by zero and put every mark at
   * `NaN`. One unit of domain either side puts the dot on the zero line, which is what the run
   * says: no pair differed at all.
   */
  const span = high - low;
  const pad = span === 0 ? 1 : span * PAD;
  const domainLow = low - pad;
  const domainHigh = high + pad;
  const at = (value: number): number => (value - domainLow) / (domainHigh - domainLow);

  const excludesZero = upper < 0 || lower > 0;
  const ranks = row.verdict === 'resolved';

  return {
    metric: row.metric,
    label: presentation.label,
    unit: presentation.unit,
    places: presentation.places,
    zeroAt: at(0),
    lowerAt: at(lower),
    meanAt: at(mean),
    upperAt: at(upper),
    domainLow,
    domainHigh,
    excludesZero,
    ranks,
    lower,
    mean,
    upper,
  };
}
