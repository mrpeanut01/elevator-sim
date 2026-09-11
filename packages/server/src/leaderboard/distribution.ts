/**
 * **A board's distribution, as a quantile ladder per axis** — GitHub issue #327, § D484 (the ruling,
 * dated before this code) and § D506 (what landed).
 *
 * The board served ranked entries only, and two viewer surfaces wanted something ranking cannot
 * give: how one run sits among everybody's (world figures), and a real run at the middle of one
 * axis (a ghost). § D484 settled what may be published before any SQL was written, and this module
 * is that ruling as arithmetic:
 *
 * 1. **A quantile ladder per axis, independently**, at p10 / p25 / p50 / p75 / p90. Not a
 *    histogram: bin edges are an opinion baked into a wire format. Not a scalar: *do not scalarize
 *    too early* is a standing rule, and a board's distribution is exactly where a "world score"
 *    would get manufactured.
 * 2. **No typical run.** The median AWT, the median WT95 and the median TTD come from three
 *    different submissions; presented together they describe a run nobody played. So a consumer
 *    that wants a run gets {@link AxisLadder.medianEntryId}: a real entry at the median of one named
 *    axis, returned by id, with the surface saying which axis chose it.
 * 3. **No confidence interval, and the reason is in this docstring rather than a caveat on the
 *    wire.** The submissions are self-selected, so there is no population they sample; a client
 *    holding its own run's interval and the board's would compare them and conclude from overlap,
 *    which `CLAUDE.md` forbids by name. The distribution is descriptive of who submitted and never
 *    inferential about anybody else.
 * 4. **Every figure carries its count, and the ladder is withheld below {@link MIN_LADDER_N}.** At
 *    n = 20 each outer rung has two observations beyond it, so p90 is an interpolation between two
 *    real runs; below about ten, p90 *is* the maximum, and the endpoint would be publishing one
 *    player's run as a world figure. Below the floor the count is published and no ladder is — an
 *    honest refusal, not an empty ladder, because an empty ladder reads as a distribution with
 *    nothing in it. Twenty is an assumption with its reasoning attached, on the footing
 *    `data/traffic-profiles.json`'s badge share sits on.
 * 5. **Energy is not here, and it is said rather than implied.** A submission's claim is the four
 *    ranked figures (`ClaimedMetrics`); no energy figure reaches the store, so no energy ladder can
 *    be computed from it. § D106's rule — energy beside wait, never ordered against it — has nothing
 *    to bind until an energy claim travels, and {@link BoardDistribution.absent} names that so a
 *    client draws a stated absence rather than a blank column.
 *
 * ## Who contributes
 *
 * One row per player, their best on the axis in question — the same `DISTINCT ON (user_id)` the
 * ranked board uses, so a player who posted twenty times is one observation and not twenty. Only
 * `awtIsValid: true` runs are in `entries` at all (`verifySubmission` refuses the others on entry,
 * checked against the server's own replay), so the suppression rule is inherited rather than
 * re-derived here, which is the structural half of the issue's second criterion.
 *
 * ## The quantile
 *
 * Linear interpolation between order statistics (Hyndman and Fan's type 7, the default of R and
 * NumPy), on the sorted values: `h = (n − 1)·p`, then `x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋])`.
 * Chosen because it is the one every reader's tooling agrees on, and because it never publishes a
 * value no run produced except as a weighted pair of two that did.
 */

import type { BoardMetric } from '../store/store.js';

/** Below this many contributing players no ladder is published. See the module note, point 4. */
export const MIN_LADDER_N = 20;

/** The rungs, as probabilities. Fixed rather than parameterised, so the wire carries no opinion. */
export const LADDER_RUNGS: readonly number[] = Object.freeze([0.1, 0.25, 0.5, 0.75, 0.9]);

/** One contributing row: a player's best on one axis, with the entry it came from. */
export interface AxisObservation {
  readonly entryId: string;
  readonly value: number;
}

export interface AxisLadder {
  /** The four ranked figures share a name space with the board's metrics. */
  readonly axis: BoardMetric;
  /** How many players contributed — one row each. Published even when the ladder is withheld. */
  readonly n: number;
  /** `p10`, `p25`, `p50`, `p75`, `p90`, or `undefined` below {@link MIN_LADDER_N}. */
  readonly rungs: Readonly<Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number>> | undefined;
  /**
   * A real entry at the median of **this** axis — the ghost's source (GitHub issue #226). The lower
   * median on an even count, so it is always a run somebody played. `undefined` with the ladder.
   */
  readonly medianEntryId: string | undefined;
}

export interface BoardDistribution {
  readonly boardKey: string;
  /** Players contributing, which is the `n` under every figure below. */
  readonly n: number;
  readonly ladders: readonly AxisLadder[];
  /** Why the ladders are absent when they are, in the server's words. `undefined` when published. */
  readonly withheld: string | undefined;
  /** Axes a reader might expect and this wire cannot carry, each with the reason. Point 5. */
  readonly absent: readonly { readonly axis: string; readonly reason: string }[];
  /** The three rules a client may not undo, said on the wire. */
  readonly note: string;
}

/** Type-7 quantile of an ascending list. The list must be non-empty. */
export function quantileOf(ascending: readonly number[], p: number): number {
  const n = ascending.length;
  if (n === 0) throw new Error('quantileOf: no observations');
  const h = (n - 1) * p;
  const lower = Math.floor(h);
  const upper = Math.min(n - 1, lower + 1);
  const a = ascending[lower] ?? 0;
  const b = ascending[upper] ?? a;
  return a + (h - lower) * (b - a);
}

export const DISTRIBUTION_NOTE =
  'Each axis is its own ladder over the players who posted, one best run each. The rungs are not ' +
  'one run; the median entry is. No interval is published, because the players who posted are ' +
  'not a sample of anybody else.';

export const ENERGY_ABSENT_REASON =
  'A posted run claims its four ranked figures and no energy figure, so no energy ladder can be ' +
  'computed from what the board holds.';

/** One axis's ladder from its observations. Order is not required; ids travel with values. */
export function axisLadderOf(axis: BoardMetric, observations: readonly AxisObservation[]): AxisLadder {
  const sorted = [...observations].sort((a, b) => a.value - b.value || a.entryId.localeCompare(b.entryId));
  const n = sorted.length;
  if (n < MIN_LADDER_N) return { axis, n, rungs: undefined, medianEntryId: undefined };
  const values = sorted.map((row) => row.value);
  const [p10, p25, p50, p75, p90] = LADDER_RUNGS.map((p) => quantileOf(values, p)) as [number, number, number, number, number];
  const median = sorted[Math.floor((n - 1) / 2)];
  return {
    axis,
    n,
    rungs: { p10, p25, p50, p75, p90 },
    medianEntryId: median?.entryId,
  };
}

/**
 * The whole answer for one board. `byAxis` carries each axis's observations — one per player,
 * their best on that axis — which is the store's question to answer, not this module's.
 */
export function boardDistributionOf(
  boardKey: string,
  byAxis: ReadonlyMap<BoardMetric, readonly AxisObservation[]>,
): BoardDistribution {
  const ladders = [...byAxis.entries()].map(([axis, observations]) => axisLadderOf(axis, observations));
  const n = Math.max(0, ...ladders.map((ladder) => ladder.n));
  const withheld = withheldFor(n);
  return {
    boardKey,
    n,
    ladders,
    withheld,
    absent: [{ axis: 'energy', reason: ENERGY_ABSENT_REASON }],
    note: DISTRIBUTION_NOTE,
  };
}

/** Why a board's ladder is withheld, or `undefined` when it is published — one sentence for every board. */
function withheldFor(n: number): string | undefined {
  return n < MIN_LADDER_N
    ? `${String(n)} ${n === 1 ? 'player has' : 'players have'} posted to this board. A ladder needs ${String(MIN_LADDER_N)}: below that its outer rungs are one player's run, and a world figure that is one person is not a world figure.`
    : undefined;
}

/**
 * The rush board's ladder — how long each player's best sitting held — GitHub issue **#372**, § D543.
 *
 * **One axis, on every rule the four above keep.** The same type-7 rungs at the same five points, the
 * same real sitting at the lower median, the same count published beside a ladder withheld below
 * {@link MIN_LADDER_N} (§ D506's floor, inherited rather than restated), and no interval, for the
 * reason the module note gives. It is its own function rather than a fifth {@link AxisLadder} because
 * a rush has none of the four ranked waits — its mean is not quotable by design — and held seconds is
 * not a `BoardMetric`; widening that type would let the daily board rank on a figure no daily run has.
 *
 * Longer is better on this axis and shorter on the other four. The rungs do not care: a quantile is
 * the same value read from either end, and the ladder publishes values rather than an order.
 */
export interface HeldLadder {
  readonly boardKey: string;
  /** Players contributing, one best sitting each. Published even when the ladder is withheld. */
  readonly n: number;
  readonly rungs: Readonly<Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number>> | undefined;
  /** A real sitting at the lower median, or `undefined` with the ladder. */
  readonly medianEntryId: string | undefined;
  readonly withheld: string | undefined;
  readonly note: string;
}

export function heldLadderOf(boardKey: string, observations: readonly AxisObservation[]): HeldLadder {
  const sorted = [...observations].sort((a, b) => a.value - b.value || a.entryId.localeCompare(b.entryId));
  const n = sorted.length;
  const withheld = withheldFor(n);
  if (withheld !== undefined) {
    return { boardKey, n, rungs: undefined, medianEntryId: undefined, withheld, note: DISTRIBUTION_NOTE };
  }
  const values = sorted.map((row) => row.value);
  const [p10, p25, p50, p75, p90] = LADDER_RUNGS.map((p) => quantileOf(values, p)) as [number, number, number, number, number];
  return {
    boardKey,
    n,
    rungs: { p10, p25, p50, p75, p90 },
    medianEntryId: sorted[Math.floor((n - 1) / 2)]?.entryId,
    withheld: undefined,
    note: DISTRIBUTION_NOTE,
  };
}
