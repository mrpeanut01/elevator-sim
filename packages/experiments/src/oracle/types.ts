/**
 * Vocabulary for reconciling a simulated up-peak against the closed-form Barney/CIBSE round
 * trip — the arithmetic behind the Phase 2 acceptance gate, lifted out of the test that first
 * needed it so Phase 3's replication runner can reuse it.
 *
 * ## Why this lives in `experiments/` and imports nothing
 *
 * `analytical/` is the oracle and is deliberately import-free, so it cannot share a bug with
 * the simulator it checks. `core/` must not gain a dependency on this package. What is left is
 * a third place for the *comparison*, and that is here.
 *
 * Every type below is **structural**: it describes the shape of a value the caller already has
 * (a `RoundTripResult` from `analytical/`, a `RunSummary` from `metrics/`) without importing
 * it. That keeps this module compilable against any Phase of `core` and makes it testable with
 * plain object literals. The cost is that a field rename in `core` will not break the build
 * here — accepted deliberately, because the alternative is a package dependency that pins this
 * module to whatever `@elevator-sim/core`'s barrel happens to re-export.
 *
 * ## What the reconciliation is for
 *
 * A simulated up-peak round trip is **longer** than the textbook closed form, always, and the
 * amount is not noise. `CLOSED_FORM_ASSUMPTIONS` in `core/analytical` enumerates the reasons
 * in advance; two of them dominate and both are `bias: 'under'`:
 *
 * - **acceleration** — the closed form charges `tv = df/v` per floor, ignoring that a
 *   jerk-limited car spends `v/a + a/j` seconds getting to and from rated speed on every
 *   single flight, and never reaches it at all when `v²/a` exceeds the interfloor rise;
 * - **minimum dwell** — the closed form charges `2·P·tp` of transfer and nothing else, while a
 *   real controller holds the doors for `max(policy dwell, transfer)` at every stop.
 *
 * {@link reconcileRoundTrip} charges both and reports what is left. A residual inside a few
 * percent means the divergence is understood; a residual outside it is a defect, and the
 * per-term breakdown says which term to look at.
 *
 * Pure throughout: no RNG, no wall clock, no mutation, no I/O.
 */

/** A signed relative difference, as a fraction. `0.05` is "5 % high". */
export type RelativeDivergence = number;

/**
 * Mean and dispersion of a quantity measured across independent replications.
 *
 * `docs/03-traffic-and-statistics.md` § Part 3: a single replication of a lift peak is nearly
 * useless — Peters & Abbi measured individual-run AWT spanning 4.1–7.4 s on one configuration.
 * Every headline in a validation report is therefore a {@link ReplicationStatistic} and never
 * a scalar, so that a reader can see whether a divergence is larger than the noise it sits in.
 */
export interface ReplicationStatistic {
  /** Replications the mean is over. */
  readonly count: number;
  readonly mean: number;
  /** Sample standard deviation across replications, `NaN` for a single replication. */
  readonly stdDev: number;
  /** `stdDev / sqrt(count)` — the precision of {@link mean}, not the spread of the runs. */
  readonly standardError: number;
  readonly min: number;
  readonly max: number;
}

/**
 * The closed form's output, as much of it as a reconciliation needs.
 *
 * Structurally satisfied by `RoundTripResult` from `@elevator-sim/core`'s `analytical/`, whose
 * fields carry these names, so a caller normally passes `analysis.result` directly.
 */
export interface ClosedFormRoundTrip {
  /** `RTT`, seconds. */
  readonly roundTripTimeS: number;
  /** `2·(H·tv + tx)` — seconds moving, up and back. */
  readonly travelTimeS: number;
  /** `(S+1)·ts` — seconds lost stopping. */
  readonly stopTimeS: number;
  /** `2·P·tp` — seconds transferring. */
  readonly transferTimeS: number;
  /** `S`. */
  readonly expectedStops: number;
  /** `INT = RTT / L`, seconds. */
  readonly intervalS: number;
  /** `%POP`. */
  readonly percentPopulation5Min: number;
}

/**
 * The same round trip re-costed with the two omissions charged, however the caller obtained it
 * — a Monte Carlo over the closed form's own population model with real kinematics is the
 * method the Phase 2 gate uses, but an analytic estimate works the same way here.
 *
 * The three time terms must partition the round trip, and {@link reconcileRoundTrip} checks
 * that they do rather than trusting it: a breakdown that does not add up to its own total is
 * the most likely way a reconciliation lies.
 */
export interface CompletedRoundTrip {
  /** Seconds in flight over the whole trip. Counterpart of {@link ClosedFormRoundTrip.travelTimeS}. */
  readonly flightS: number;
  /** Seconds with doors dwelling. Counterpart of {@link ClosedFormRoundTrip.transferTimeS}. */
  readonly dwellS: number;
  /**
   * Seconds of `open + close + motor start + levelling`, charged once per stop.
   * Counterpart of {@link ClosedFormRoundTrip.stopTimeS}, and the term that should agree
   * already — both sides charge the same `(S+1)·ts`.
   */
  readonly fixedS: number;
  /** Mean distinct destinations. Must reproduce the closed form's `S`, or the models differ. */
  readonly stops: number;
}

/** What the simulation actually did, measured off a run record. */
export interface MeasuredRoundTrip {
  /** Mean seconds between one terminal departure of a car and its next, across replications. */
  readonly roundTripS: ReplicationStatistic;
  /** Mean passengers boarding per terminal departure. The `P` the comparison must be made at. */
  readonly passengersPerTrip: ReplicationStatistic;
  /** Mean distinct destinations per terminal departure. The measured `S`. */
  readonly stopsPerTrip: ReplicationStatistic;
  /** Achieved interval, seconds. */
  readonly intervalS: ReplicationStatistic;
  /** Achieved handling capacity as a percentage of served population per 5 minutes. */
  readonly percentPopulation5Min: ReplicationStatistic;
}

/** One line of the reconciliation: what was charged, and how much of the gap it explains. */
export interface ReconciliationTerm {
  /**
   * The `CLOSED_FORM_ASSUMPTIONS` id this term charges for, so a report cites the enumerated
   * simplification rather than inventing a name for it.
   */
  readonly assumptionIds: readonly string[];
  /** Seconds added to the closed form's round trip. Non-negative for a `bias: 'under'` term. */
  readonly secondsS: number;
  /** {@link secondsS} as a fraction of the closed form's round trip. */
  readonly fractionOfClosedForm: number;
}

/**
 * The verdict of a reconciliation.
 *
 * `explained` is not "the simulator is right"; it is "the disagreement is one the closed form
 * documents in advance, at the size the documentation implies". A `false` here names a
 * divergence nobody has accounted for, which is what the acceptance gate exists to surface.
 */
export interface RoundTripReconciliation {
  /** `(simulated − closed form) / closed form`, before any correction. The raw headline. */
  readonly rawDivergence: RelativeDivergence;
  /** The closed form with the omissions charged, seconds. */
  readonly correctedRoundTripS: number;
  /** `(simulated − corrected) / corrected`. What no documented simplification explains. */
  readonly residual: RelativeDivergence;
  /** The corrections, largest first. */
  readonly terms: readonly ReconciliationTerm[];
  /** `|residual| <= tolerance`. */
  readonly explained: boolean;
  /** The tolerance the verdict was taken at. */
  readonly tolerance: number;
  /**
   * `(measured S − closed-form S) / closed-form S`.
   *
   * The precondition on everything else: if the simulator is not making the number of stops
   * the formula prices, the two are not describing the same trip and no amount of timing
   * correction will make them agree for the right reason.
   */
  readonly stopDivergence: RelativeDivergence;
  /**
   * Non-fatal observations. Populated when the completed breakdown does not partition its own
   * total, when a correction comes out negative (a `bias: 'under'` term cannot), or when the
   * stop counts disagree.
   */
  readonly warnings: readonly string[];
}
