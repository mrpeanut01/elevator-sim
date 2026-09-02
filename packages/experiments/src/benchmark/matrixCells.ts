/**
 * **The experiment matrix's eight operating points, in a module a browser bundle may contain.**
 *
 * ## Why this file exists — the suite's first decision, and it is § D406
 *
 * Everyday Mode's suite (docs/18 § Slice 7) runs one comparison over multiple fixed cells, and its
 * fixture list must be **imported, never retyped**: docs/18 records that a builder who assumes "the
 * eight buildings" produces a list that disagrees with the matrix — the matrix's eight are building
 * × traffic-pattern cells over *five* buildings, `data/buildings/` separately holds eight buildings,
 * and a hand copy of either would be a second source of truth about which operating points this
 * project measures.
 *
 * **Which list it imports changed, and the file it moved to is the point.** This sentence read
 * *"imported from `MATRIX_CELLS`"* and named the wrong list for the wrong screen. There are two
 * suites: the **Engineer**'s (`viz/dev/suitePanel.ts`) plans over `MATRIX_CELLS` and always has,
 * and the **Everyday** bench (`viz/everyday/benchModel.ts`) planned over them until
 * [§ D445](../../../../DECISIONS.md) and now plans over `data/proof-cases.json`'s forty proof cases
 * — `ENGINE_CONTRACT.md` § 12.3's *one list, three readers*, of which the bench is the third. The
 * *"never retyped"* half is untouched and binds both: each surface imports its own list, and
 * neither holds a copy.
 *
 * Nothing in this module moved with it, and nothing could: the browser bench never read
 * {@link MatrixCell.replications}, {@link MatrixCell.budgetBasis}, {@link MatrixCell.armCeilings}
 * or {@link MatrixCell.admissibleReplications} — its budget is the player's control, and always
 * was. The eight cells, their derived budgets and every published pin over them are exactly as they
 * were, because a pin is produced by this package's own runner and no pin reads a browser.
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
 * Everything in this file is **data plus two lookups** — {@link matrixCell}, and
 * {@link reportWindowForBuilding}, which is a conclusion read off the cells rather than a second
 * rule about them (GitHub issue #315; its own docstring carries the argument). The machinery that
 * runs a cell — budgets from the census, the Pareto front, the pins — stays in `matrix.ts`, which
 * documents the whole study and remains the module a Node reader should start at.
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
      sdOfDifference: 3.1724,
      unclampedReplications: 39,
      clamped: 'floor' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 109, 'destination-panel': 73 }),
    rationale:
      'The fifth building, at 1 % rather than 2 %: at 2 % most of this table falls over early — see EXCLUDED_CELLS, whose stated mechanism for that point is re-measured and withdrawn by the same run that re-took these two numbers — and 1 % is the rate at which every arm but nearest-car and destination-panel is clean across the census. Every figure in this row is measured with the DECKS SIMULATED, and the sentence that stood here said the opposite: it carried the standing double-deck disclaimer, "configured double-deck and simulated single-deck, so every figure in this row is for a machine nobody ordered", which DECISIONS.md § D131 made false and § D132 retired for this building by name, since its shuttle declares its four servesFloorPairs. Both numbers above moved on the tree that made that sentence false and neither was re-taken until GitHub issue #306 (§ D396): destination-panel\'s ceiling of 73 is the decks, isolated by a control that drops the pairs on one tree; the spread went 2.9722 to 3.0370 there and then to 3.1724 at § D332. The budget is 50 at every one of those points, because the band floor bound it before and binds it now.',
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
      'WITHDRAWN AND REPLACED, and the ground has changed from inadmissible to deferred — GitHub issue #306, DECISIONS.md § D396. This read: "The BASELINE loses its AWT at replication 46, below CLAUDE.md\'s 50-replication floor, so there is no admissible budget at this point — not an under-budgeted cell but an inadmissible one. destination-panel is worse still, first invalid at replication 3 with 39 of 200 saturated." Re-censused at n = 200 at MATRIX_SEED on the tree carrying § D131\'s simulated decks, § D332 and § D333: the baseline first loses its AWT at replication 108, not 46, which is INSIDE CLAUDE.md\'s 50-200 band — so the stated mechanism no longer holds and this point is not inadmissible. destination-panel is first invalid at 2 rather than 3, nearest-car at 7, and seven further arms between 13 and 46, so most of the table would be UNQUOTABLE here; that is a result about those arms rather than about the cell, which is exactly how mixed-use-up-peak is handled in the matrix. The cell is therefore EXCLUDED PENDING A CRITERION rather than excluded by a measurement, on the same footing as the two entries above: admitting it adds a matrix row and a published pin group, and § D256 requires that re-design to be specified before the numbers are read. The building appears at 1 % instead, where every arm but nearest-car and destination-panel is clean across the census.',
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

/* -------------------------------------------------------------------------- *
 * The one derived answer the cells are read for outside this package
 * -------------------------------------------------------------------------- */

/**
 * **Which window a run on this building is reported over** — `'full-run'`, or `undefined` for
 * *the demand template's own band*.
 *
 * ## Why the rule is here rather than in either consumer
 *
 * It is a **conclusion about {@link MATRIX_CELLS}**, and this module is where the cells are. It
 * lived in `packages/viz/src/shift/reportWindow.ts` from `docs/20` defect 5 until GitHub issue
 * **#315**, where it stopped being a viewer question: `packages/server`'s leaderboard verifier
 * replays a submitted run on its own `data/` and compares the metrics, so **the two sides have to
 * choose the same window or an honest run does not reproduce**. Measured on that issue's own case —
 * `garden-apartments` / `collective` / `rise-and-fall` / 3 600 s / seed 20260901 — the server read
 * `awtS 18.233` where the client read `13.462`, and every Garden submission was refused as
 * unreproducible.
 *
 * They cannot share a `viz` module: § D215 § 3's *"`viz` may not depend on `server`"* runs in the
 * other direction too, and the server may not import a browser bundle. They may not each carry a
 * copy either, because the window is the divisor of every mean on the sheet and two copies that
 * drift refuse honest scores — which is the defect, re-armed.
 *
 * They also may not agree by putting the window **on the wire**. A submitted report window is a
 * player-settable parameter inside a board key (`ENGINE_CONTRACT.md` § 12.1) and a cheat lever with
 * it: a player who picks their own window picks their own average. So both sides *derive* it, from
 * this one function, keyed on the one thing a submission already carries — the building id.
 *
 * This module is the placement § D406 already argued for. The cells were moved out of `matrix.ts`
 * into a browser-safe module of their own precisely so a consumer outside this package could
 * **import them rather than retype them**; a rule read off them is that same decision one step on.
 * `packages/server` is allowed to depend on this package — § D214 § 3: *"`packages/server` depends
 * on `core`, which is allowed (invariant 6 forbids `core → viz`, nothing else)"* — and the shipped
 * image already carries it (`Dockerfile` copies `packages/experiments/dist`).
 *
 * ## The defect it closes, and why the answer is read rather than invented
 *
 * Garden Apartments day 1 is the first sheet a new player ever sees, and it **withheld both of its
 * headline numbers**: `AVERAGE WAIT withheld`, `WORST WAIT not recorded`, both under *"the reporting
 * window held no arrivals"* — beside a goal row reading a perfectly good `38 s`. Forty people rode
 * that day. None of them arrived in the five minutes the sheet was reading.
 *
 * The cause was an **absence**: the shift path set no `reportWindow`, so `core` fell back to the
 * demand template's own measurement band — `rise-and-fall`'s five-minute hold, at a fixed position
 * in the schedule. On a building whose whole day is forty arrivals over an hour, a fixed five-minute
 * band is empty about as often as not, and `awtIsValid`'s *empty window* ground fires on a run that
 * coped perfectly well.
 *
 * This project had already measured that exact question on that exact building. `arms.ts` § 2:
 *
 * > **Garden Apartments needs the full-run window, not peak-5min.** At the sparse rates where
 * > parking policy actually dominates … the peak-5-minute window contains **1 to 11 arrivals**, and
 * > a window with none has no AWT at all. Measured: at 1 % the peak-5min cell is invalid on **54
 * > replications in 100**, at 2 % on 20, at 4 % on 11, at 6 % on 1, and only at 8 % is it clean.
 *
 * and {@link EXCLUDED_CELLS} reproduces it independently at n = 200: `garden-up-peak` is excluded
 * because *"at 2 % the peak-5min window is invalid on 57 of 200 replications for every one of the
 * twelve arms simultaneously"*. So this function returns the **conclusion the cells already
 * encode** rather than a rule of its own. A second rule — an arrival-count threshold, a population
 * heuristic — would be a second answer to a question this repository has already answered with a
 * run, and the first thing that would happen is that the two would disagree.
 *
 * ## Why unanimity, and why that is not a hedge
 *
 * The predicate is *every* cell on this building declares `full-run`, not *any*. The distinction
 * decides Midtown Office, which has three cells: `midtown-interfloor` declares `full-run` and the
 * up-peak and down-peak cells do not. That cell is full-run because it is a 1 800 s interfloor
 * study, not because Midtown's peak band is ever empty — at 1 % of 1 710 people it never is. So
 * *any* would move a building whose window is fine, on the strength of a cell that says nothing
 * about emptiness.
 *
 * What unanimity actually reads is: **at every rate this project has measured this building at, the
 * narrow window was the wrong instrument.** That is a property of the building, which is what a
 * caller holding only a building id needs.
 *
 * ## `undefined`, and why it is not `'peak-5min'`
 *
 * `'peak-5min'` is a **selection** that makes `core` search the arrivals for their busiest five
 * minutes; `undefined` leaves the demand template's declared band in place. Those are different
 * windows on the same run, and every shipped sheet before `docs/20` defect 5 was read over the
 * second. Returning the first here would silently re-measure every building in the product to fix
 * one, which is a change nobody asked for wearing a bug fix's clothes. A building the matrix does
 * not measure at all — `chancery-house`, and anything a reader draws — keeps the template's band,
 * which is the honest default: this module knows nothing about it, and inventing an answer for a
 * building nobody censused is the thing the paragraph above refuses.
 *
 * ## What it costs, stated rather than glossed
 *
 * A day statistic instead of a peak statistic, on the buildings it moves — exactly the trade
 * `arms.ts` names and defends: *"That trades a peak statistic for a day statistic and says so; it
 * does not trade a valid interval for an invalid one."* The sheet says so too: every window-bearing
 * caption on the Day report prints `summary.reportWindow.id`, so a full-run sheet reads *over 40
 * legs in the full-run window* rather than claiming a peak it did not measure (`viz`'s
 * `shift/report.ts#smallPrintFor`).
 *
 * ## Non-test callers
 *
 * `packages/viz/src/shift/reportWindow.ts#shiftReportWindowFor` — the name viz's three producers
 * ask by (`dev/state.ts#shiftRunConfigOf`, `campaign/stageRun.ts` at both its call sites, and
 * `scenario/measure.ts`) — and `packages/server/src/leaderboard/verify.ts#configFor`, the replay
 * those producers have to agree with.
 *
 * @param buildingId the id a run is being configured on, **unresolved**: a building a reader
 *   authored has no matrix cell and correctly falls through to `undefined`.
 */
export function reportWindowForBuilding(buildingId: string): MatrixCell['traffic']['reportWindow'] {
  const cells = MATRIX_CELLS.filter((cell) => cell.building === buildingId);
  if (cells.length === 0) return undefined;
  // Unanimity — see the docstring. `every` over an empty list is vacuously true, which is why the
  // length is checked first rather than relied upon.
  return cells.every((cell) => cell.traffic.reportWindow === 'full-run') ? 'full-run' : undefined;
}
