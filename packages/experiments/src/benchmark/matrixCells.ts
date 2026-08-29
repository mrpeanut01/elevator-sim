/**
 * **The experiment matrix's eight operating points, in a module a browser bundle may contain.**
 *
 * ## Why this file exists — the suite's first decision, made here (a decision number is owed)
 *
 * Everyday Mode's suite (docs/18 § Slice 7) runs one comparison over multiple fixed cells, and its
 * fixture list must be **imported from `MATRIX_CELLS`, never retyped**: docs/18 records that a
 * builder who assumes "the eight buildings" produces a list that disagrees with the matrix — the
 * matrix's eight are building × traffic-pattern cells over *five* buildings, `data/buildings/`
 * separately holds eight buildings, and a hand copy of either would be a second source of truth
 * about which operating points this project measures.
 *
 * The preferred route was to export the cells through `src/browser.ts`, whose seam is already
 * open (`dev/campaignPanel.ts` imports from it). **Measured before deciding, not assumed**: the
 * cells themselves are pure frozen data whose only import is `type TrafficArmSpec` from
 * `runner/types.js` — already on the browser graph — but the module they lived in is not
 * browser-safe: `matrix.ts` imports `validation/harness.js` (→ `node:url`) and `tuning/report/*`
 * (→ the runner), so re-exporting `MATRIX_CELLS` *from `matrix.ts`* onto the browser barrel would
 * put a `node:` edge into every bundle and turn `browser.test.ts` red. The blocker was module
 * placement, not the data's shape — so the cells move to their own module and `matrix.ts`
 * re-exports them, byte-identical, for every existing consumer.
 *
 * The fallback docs/18 names — moving the cells to `data/` — is deliberately not taken: the cells
 * embed per-cell derived budget bases and the rationale prose that argues them, which are
 * code-adjacent measurement records rather than reference data, and a JSON copy would need a
 * schema, a loader and a validation pass that nothing else wants. The split below is the smallest
 * change that makes the single source browser-reachable.
 *
 * Everything in this file is **data plus one lookup**. The machinery that runs a cell — budgets
 * from the census, the Pareto front, the pins — stays in `matrix.ts`, which documents the whole
 * study and remains the module a Node reader should start at.
 */

import type { TrafficArmSpec } from '../runner/types.js';

/** How a cell's replication budget was arrived at. Data, so a reader can argue with it. */
export interface BudgetBasis {
  /**
   * The arm whose paired spread bound the budget — the largest `sd` among the arms with **zero**
   * invalid replications in the 200-replication census.
   *
   * Restricted to the clean arms deliberately, and the restriction is what makes the rule
   * non-circular: including an arm that saturates at some `n` inside the band makes the budget a
   * function of itself (a smaller `n` keeps the arm quotable, which raises the required `n`, which
   * makes it unquotable). The arms excluded here are not thereby hidden — they appear in
   * {@link MatrixCell.armCeilings} with the replication index at which they lost their AWT.
   */
  readonly bindingArmId: string;
  /** That arm's paired-difference `sd` against the baseline on AWT, at n = 200. */
  readonly sdOfDifference: number;
  /** `budgetFor(sdOfDifference)` before clamping, for a reader checking the clamp. */
  readonly unclampedReplications: number;
  /** Which end of the band bit, if either. */
  readonly clamped: 'floor' | 'ceiling' | 'none';
}

/** One (building, traffic pattern) the whole arm list is measured at. */
export interface MatrixCell {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  /** Which of the four patterns this is. Reported, never branched on. */
  readonly pattern: 'up-peak' | 'down-peak' | 'interfloor-mix' | 'residential-mixed';
  readonly traffic: TrafficArmSpec;
  readonly replications: number;
  readonly budgetBasis: BudgetBasis;
  /**
   * The **baseline's** first invalid replication index in the 200-replication census, or
   * `undefined` when it had none.
   *
   * This is the ceiling that binds the whole cell, because a baseline with no quotable AWT leaves
   * no cell in the table with an interval. `undefined` on all eight is why every budget below is a
   * choice rather than a limit — which is itself the result of choosing `collective`.
   */
  readonly admissibleReplications: number | undefined;
  /**
   * Per-arm first-invalid replication index, for the arms that lost their AWT within 200.
   *
   * An arm absent from this map was clean across the whole census. An arm present with an index
   * **below** {@link replications} is reported `UNQUOTABLE` at this cell's budget, and the index is
   * the evidence for why — the distinction between *excluded by its ceiling* and *excluded by its
   * answer* that `saturationCensus.test.ts` exists to keep visible.
   */
  readonly armCeilings: Readonly<Record<string, number>>;
  readonly rationale: string;
}

const G_ONLY = Object.freeze({ G: 1, P1: 0 });

const upPeak = (
  id: string,
  ratePctPop5min: number,
  entranceWeights?: Readonly<Record<string, number>>,
): TrafficArmSpec =>
  Object.freeze({
    id,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      ...(entranceWeights === undefined ? {} : { entranceWeights }),
      arrivalRatePctPop5min: ratePctPop5min,
      peakWindowS: 300,
    }),
  });

/**
 * **The eight cells: five buildings, four traffic patterns.**
 *
 * Every shipped building appears. Every pattern a building admits a paired comparison at appears.
 * The rationale on each says what was censused and what bound the number.
 */
export const MATRIX_CELLS: readonly MatrixCell[] = Object.freeze([
  Object.freeze({
    id: 'midtown-up-peak',
    label: 'Midtown Office, up-peak 1 %',
    building: 'midtown-office',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-1pct', 1, G_ONLY),
    replications: 81,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.5766,
      unclampedReplications: 81,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 174 }),
    rationale:
      'The roadmap\'s own up-peak building at the rate arms.ts justified. Censused fresh: nearest-car first loses its AWT at replication 174 here, not the 287 arms.ts records at its own seed — the same building, a different ceiling, which is why no ceiling is inherited. 174 is above this budget, so nearest-car is quotable at this cell.',
  }),
  Object.freeze({
    id: 'midtown-down-peak',
    label: 'Midtown Office, down-peak 1 %',
    building: 'midtown-office',
    pattern: 'down-peak' as const,
    traffic: Object.freeze({
      id: 'down-peak-1pct',
      durationS: 900,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
        entranceWeights: G_ONLY,
        arrivalRatePctPop5min: 1,
        peakWindowS: 300,
      }),
    }),
    replications: 78,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.4899,
      unclampedReplications: 78,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 12 }),
    rationale:
      'CLAUDE.md § Tuning discipline: "the optimum for up-peak is not the optimum for down-peak", and this is the cell that measures the sentence. It is also where the baseline choice earns itself: nearest-car loses its AWT at replication 12, so a nearest-car-baselined table here would have no quotable cell at any budget in the band.',
  }),
  Object.freeze({
    id: 'midtown-interfloor',
    label: 'Midtown Office, interfloor-mix 1.5 %, full run',
    building: 'midtown-office',
    pattern: 'interfloor-mix' as const,
    traffic: Object.freeze({
      id: 'interfloor-mix-1.5pct',
      durationS: 1800,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
        entranceWeights: G_ONLY,
        arrivalRatePctPop5min: 1.5,
        peakWindowS: 300,
      }),
    }),
    replications: 200,
    budgetBasis: Object.freeze({
      bindingArmId: 'nearest-car',
      sdOfDifference: 9.4048,
      unclampedReplications: 340,
      clamped: 'ceiling' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'The only shipped configuration where destination information exists to be used (arms.ts § Phase 6a), and the one cell where every one of the twelve arms is clean across the whole 200-replication census — nothing saturates, so the budget is a choice throughout. It is also the only cell where the band ceiling bites: nearest-car spreads widely enough that a 1.0 s half-width would want 340 replications, and 200 buys 1.30 s instead. Declared rather than silently accepted; the effect it has to resolve is 16.3 s, so the shortfall changes no verdict.',
  }),
  Object.freeze({
    id: 'garden-residential',
    label: 'Garden Apartments, residential 2 %, full run',
    building: 'garden-apartments',
    pattern: 'residential-mixed' as const,
    traffic: Object.freeze({
      id: 'residential-2pct-fullrun',
      durationS: 3600,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({ arrivalRatePctPop5min: 2, peakWindowS: 300 }),
    }),
    replications: 65,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.0834,
      unclampedReplications: 65,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'The building the pre-positioning criterion names, at the operating point and window arms.ts justified — full-run rather than peak-5min because at this rate the peak window is empty often enough to invalidate the cell. Nothing saturates in 200 replications.',
  }),
  Object.freeze({
    id: 'garden-down-peak',
    label: 'Garden Apartments, down-peak 2 %, full run',
    building: 'garden-apartments',
    pattern: 'down-peak' as const,
    traffic: Object.freeze({
      id: 'down-peak-2pct-fullrun',
      durationS: 3600,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
        arrivalRatePctPop5min: 2,
        peakWindowS: 300,
      }),
    }),
    replications: 51,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 3.6148,
      unclampedReplications: 51,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'Garden\'s second pattern, and the highest-correlation cell in the matrix: eight of the eleven arms pair against the baseline at rho above 0.99, which is the near-neighbour regime docs/07 § 4 prices at 324x. The budget is still derived from the structurally different arm, because that is the pair that binds.',
  }),
  Object.freeze({
    id: 'secure-up-peak',
    label: 'Secure Tower, up-peak 2 %',
    building: 'secure-tower',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-2pct', 2),
    replications: 119,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 5.5574,
      unclampedReplications: 119,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 126 }),
    rationale:
      'The access-control building, where the eligibility filter intersects service and access zoning on every call. nearest-car first loses its AWT at 126 — above this budget, so it stays quotable, and again not the 190 arms.ts records at its own seed.',
  }),
  Object.freeze({
    id: 'mixed-use-up-peak',
    label: 'Mixed-Use High-Rise, up-peak 4 %',
    building: 'mixed-use-high-rise',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-4pct', 4),
    replications: 50,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 3.0616,
      unclampedReplications: 36,
      clamped: 'floor' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({
      'nearest-car': 24,
      'predictive-balanced': 81,
      'destination-panel': 171,
    }),
    rationale:
      'The incoming-only regime DECISIONS.md § D100 established as the one comparable point on this building — its own mixed 40/30/30 scenario admits no paired comparison at all, and that refusal is structural rather than load-driven. Three arms saturate inside the band and one of them below this budget, so nearest-car is UNQUOTABLE here with its ceiling printed. destination-panel read 33 until GitHub issue #306: DECISIONS.md § D333 bounded the landing panel\'s promise, the arm that was the only one able to suffer that defect stopped saturating here, and its ceiling is 171 — measured on the fix and on the commit before it rather than inferred (§ D396). The band floor binds the budget: the spread would buy a 1.0 s half-width at 36, and CLAUDE.md does not permit 36.',
  }),
  Object.freeze({
    id: 'vertical-city-up-peak',
    label: 'Vertical City, up-peak 1 %',
    building: 'vertical-city',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-1pct', 1),
    replications: 50,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 2.9722,
      unclampedReplications: 34,
      clamped: 'floor' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 109 }),
    rationale:
      'The fifth building, at 1 % rather than 2 %: censused at 2 % the BASELINE loses its AWT at replication 46, below the 50-replication floor, so that point cannot carry an admissible budget at all and 1 % is the rate at which it can. Every run of this building carries the standing double-deck disclaimer — its eight shuttle cars are configured double-deck and simulated single-deck — so every figure in this row is for a machine nobody ordered, and that is a property of the building rather than of this matrix.',
  }),
]);

/** One (building, traffic) that was censused and is deliberately not a matrix cell. */
export interface ExcludedCell {
  readonly id: string;
  readonly building: string;
  /** The measurement that excludes it. Never a tolerance, never a preference. */
  readonly mechanism: string;
}

/**
 * Points censused at n = 200 and excluded, each by a measured mechanism.
 *
 * Recorded because an operating point dropped without one is indistinguishable from an operating
 * point dropped because it gave an inconvenient answer — and because two of the four are
 * *reproductions* of findings this project already had, which is how a survey checks its own
 * apparatus against the studies it is meant to generalize.
 */
export const EXCLUDED_CELLS: readonly ExcludedCell[] = Object.freeze([
  Object.freeze({
    id: 'secure-interfloor-mix',
    building: 'secure-tower',
    mechanism:
      'WITHDRAWN AND REPLACED, and the ground has changed from structural to deferred — DECISIONS.md § D254, § D256 (withdrawal item 3) and § D261. This read: "Every conventional arm is structurally unquotable … An access-restricted pickup carries no credential under up-down buttons, so the call is permanently unassignable and lowering the rate does not rescue it." That was a defect in estimateCost, not a property of the building: a credential governs where you may go, not where you may be collected, and the pickup check is deleted. Re-censused at this cell over 300 replications at BENCHMARK_SEED, ONE arm now loses its AWT — destination-entry-bare, at index 0 — and nearest-car, collective and every credentialled arm are clean across the whole census. So the cell is no longer excluded because conventional dispatch cannot serve it; it is EXCLUDED PENDING A CRITERION. Admitting it would add a matrix row and a published pin group, which is a re-design of the experiment matrix and § D256 requires that to be specified before any number is looked at. What would settle it is a decision about the bare-kiosk arm, which is the only thing still unquotable here and is unquotable for the genuine reason: it discloses a destination and no credential, so an access-restricted destination is refused by every car.',
  }),
  Object.freeze({
    id: 'garden-up-peak',
    building: 'garden-apartments',
    mechanism:
      'At 2 % the peak-5min window is invalid on 57 of 200 replications for every one of the twelve arms simultaneously, and at 4 % the invalidity is worse; the paired difference cannot even be formed because both sides carry NaN at the same replication indices. This reproduces arms.ts § 2: a two-car six-floor shaft at a sparse residential rate has a handful of arrivals in any 300 s window. Garden is represented by two full-run cells instead.',
  }),
  Object.freeze({
    id: 'vertical-city-up-peak-2pct',
    building: 'vertical-city',
    mechanism:
      'The BASELINE loses its AWT at replication 46, below CLAUDE.md\'s 50-replication floor, so there is no admissible budget at this point — not an under-budgeted cell but an inadmissible one. destination-panel is worse still, first invalid at replication 3 with 39 of 200 saturated. The building appears at 1 % instead, where every arm but nearest-car is clean across the census.',
  }),
  Object.freeze({
    id: 'mixed-use-mixed-40-30-30',
    building: 'mixed-use-high-rise',
    mechanism:
      'WITHDRAWN AND REPLACED, and the ground has changed from structural to deferred — DECISIONS.md § D254, § D256 (withdrawal item 3) and § D261. This read: "DECISIONS.md § D100 established that this building\'s own mixed scenario admits no paired comparison: every role: \'baseline\' profile is 0/30 quotable and the unserved fraction RISES as the load falls, which is a structural refusal rather than overload." Both halves were the pickup access check, not the building. Re-measured at n = 30 on the three rates § 1 sweeps — 1.5 %, 0.75 % and 0.2 % — EVERY arm including nearest-car now has a quotable AWT at every rate, undelivered is 0.0 per run and the unserved fraction is 0.00 % at all three, so there is no rise to be structural about. The falling-load signature is gone because its cause is gone. The cell is therefore EXCLUDED PENDING A CRITERION rather than excluded by a measurement: admitting it adds a matrix row and a pin group, and § D256 requires the re-design to be specified before the numbers are read. The incoming-only up-peak cell remains in the matrix and is unaffected — every zoned matrix cell is up-peak, where the pickup is the ground lobby and outside every zone, which is why not one published interval moved.',
  }),
]);

/** The cell of this id. @throws Error when there is none. */
export function matrixCell(id: string): MatrixCell {
  const found = MATRIX_CELLS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(
      `No matrix cell "${id}". Known: ${MATRIX_CELLS.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return found;
}
