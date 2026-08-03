/**
 * **Phase 6c's re-measurement on `lunch-two-way` — the § D162 protocol, executed.**
 *
 * `DECISIONS.md` § D162 asked whether a mix-varying operating point may accept Phase 6c at all,
 * stated the objection at full strength — a template authored knowing what a selector exploits is,
 * on its face, constructing the test so the arm passes — and answered **conditionally yes**, under
 * five conditions that must all hold. Conditions 1–3 are discharged by shipped artefacts
 * (`data/traffic-profiles.json`'s cited 45/45/10 mix, `arms.ts`'s `MIDTOWN_LUNCH_TWO_WAY` shipped
 * for the building's own reasons, and § D169's commit ordering); this module is conditions 4 and 5:
 * the gate is § D139 as raised by § D140 and § D151 §§ 2–3, **unchanged**, and the flat-mix
 * negative control at equal total demand is measured **in the same run**. The execution protocol is
 * [`docs/13-phase-6c-handover.md`](../../../../docs/13-phase-6c-handover.md).
 *
 * ## The two cells, and what may and may not be corrected together
 *
 * The treatment is {@link LUNCH_TREATMENT_CELL} and the control is {@link LUNCH_FLAT_CONTROL_CELL},
 * identical in every field except `demand.mixAmplitude: 0` — which is **not** "no mix": at
 * amplitude 0 the phases still carry the mix, every knot equal to the period mean, so the control
 * runs flat at 45/45/10 at identical total demand (§ D169; `core/src/traffic/mixIdentity.test.ts`).
 *
 * **The Holm family is declared here, before any ΔTTD, and it is the treatment cell alone**
 * ({@link LUNCH_HOLM_FAMILY}). It is a **new** family: § D151 § 3 forbids pooling it with the
 * sweep's PRIMARY or SECONDARY families, and neither frozen array moves. The flat control is a
 * member of no family, deliberately — it is a *negative control*, never a candidate for
 * acceptance, and its role under § D162 condition 5 is to **refuse**: if the learned arm's
 * advantage survives on the control, the advantage is not about mix variation and the result is a
 * bug report. Correcting the control's p-value would only make that refusal harder to trigger,
 * which is the anti-conservative direction; it is judged uncorrected.
 *
 * ## Step 0 — the census, and the budget derived from it (2026-07-30, before any selector arm)
 *
 * `censusSelectionPoint` at the tuning seed 20260726, 200 replications, all twelve shipped
 * profiles, on **both** cells:
 *
 * - **All twelve arms are quotable on both cells** — no arm loses its AWT anywhere in 200, so the
 *   reference-arm ceiling and the all-arm ceiling are both `none`, and the budget is a choice
 *   rather than a limit.
 * - **The reference arm is `auction-multi-round` on both the treatment and the control** — the
 *   same profile on both sides, so the § D162 comparison is not reference-arm-dependent. (§ D145's
 *   census at the same building and rate under `interfloor-mix` returned `collective`; the lunch
 *   traffic reorders the table.)
 * - **The budget follows `matrix.ts`'s variance-derived worked example** (`budgetFor`, target
 *   half-width 1 s, z at 95 %), computed on the **gate metric** (TTD — this study's gate admits no
 *   other) rather than matrix's AWT: binding arm `nearest-car` — the largest paired s_D among the
 *   twelve census-clean arms — at s_D 19.414 s (treatment) and 14.725 s (control), unclamped
 *   n = 1448 and 833, **clamped to the band's ceiling of 200**. {@link LUNCH_REPLICATIONS} is
 *   therefore 200, the top of `CLAUDE.md`'s 50–200 band, fixed before any selector existed and not
 *   adjusted afterwards. H1's by-hand check: 200 ≥ 50, so the point is quotable at its budget.
 * - `noOpWeightSets` is **empty at this reference**: no shipped pattern weight set carries
 *   `auction-multi-round`'s vector, so — unlike the `eta`/`collective`-referenced cells H3 warns
 *   about — a bit-identical replication here has no by-construction excuse and G11 applies at full
 *   strength.
 *
 * The study re-derives all of this on every run ({@link LunchTwoWaySelectionStudy.budget}) and
 * reports any disagreement with the pre-registered record rather than substituting it.
 *
 * ## The result (2026-07-30; tuning seed 20260726, holdout seed 20261537, n = 200 under CRN)
 *
 * **NOT ACCEPTED — the third refusal, and the first on traffic whose directional mix moves.**
 * Four clauses fail independently:
 *
 * | cell | arm | ΔTTD vs `auction-multi-round` | verdict |
 * |---|---|---|---|
 * | treatment (mix swings 90/0/10 → 0/90/10) | learned | −0.170 [−0.405, +0.064] | INDISTINGUISHABLE — p = 0.1538 against the family's α = 0.05, and an eighth of the cell's own 0.412 s structural limit |
 * | treatment | fuzzy | +0.186 [−0.026, +0.399] | INDISTINGUISHABLE (Phase 7's bullet, not this gate) |
 * | flat control (mix pinned at 45/45/10) | learned | −0.576 [−0.833, −0.319] | BETTER, above the control's own 0.461 s limit — **§ D162 condition 5's trigger; investigated below** |
 * | flat control | fuzzy | −0.049 [−0.274, +0.176] | INDISTINGUISHABLE |
 *
 * The treatment's winner generalizes in sign (−0.205 s tuning → −0.170 s holdout) and is still
 * unresolvable; a generalizing effect that cannot be resolved is still an effect that cannot be
 * resolved (§ D145's sentence, still true here). Costs sit beside the gate, never folded in: the
 * treatment's learned arm is WORSE on AWT +0.263 [+0.124, +0.403], WT95 +0.809 [+0.343, +1.274]
 * and energy +4.444 kJ per served leg beside the raw +415.899 kJ — the honest direction for a
 * selector that switches into heavier vectors, and § D106 keeps it an axis, never a score.
 *
 * **The regime screen saw the mix, so this refusal is a fact about the selector under the
 * condition § D156 found missing — not about a detector that never engaged.** On the shipped
 * detector at its authored gains: the treatment prefers **three** regimes — `two-way` on 66.1 % of
 * post-warm-up observations (it *was* the incumbent, docs/13 § 7 step 1's mechanism check),
 * `down-peak` 22.8 %, `up-peak` 8.9 % — with 21 preference changes, and its trace-level split
 * drift is **+10.38 σ** (χ² 56.4 on 10 df, 276 passengers) against the control's +3.97 σ
 * (χ² 27.8): read those two comparatively — batch-correlated arrivals inflate both against a
 * multinomial null, and the calibrated traffic statement stays § D169's deterministic table
 * (χ² 383.4 against the control's 4.8). What the fitted policy actually held on the treatment is
 * `interfloor` (= `eta`'s vector) 51.0 % and `two-way` 32.0 % with 8 changes a run; on the control
 * it pinned `two-way` (`predictive-balanced`'s vector) for **90.9 %** of decisions.
 *
 * **The control's BETTER is § D162 condition 5 doing exactly what it was built for, and the
 * mechanism is named rather than filed** (probe recorded in this measurement's decision entry): pinning
 * `predictive-balanced`'s vector on the reference profile for the **whole run** — no selector, no
 * switching — beats the reference by −0.720 s on the flat control and −0.667 s on the treatment
 * at the verdict seed, **more than the learned arm achieves on either cell**. So the advantage is
 * a *static weight-vector hybrid* — `auction-multi-round`'s dispatch stages carrying a
 * better-for-TTD vector at this operating point — present at equal strength where the mix cannot
 * vary, and the switching itself gives value back rather than adding any (−0.170 learned against
 * −0.667 constant on the mix-varying cell). It is not mix exploitation, and it accepts nothing.
 *
 * The deadband known-answer ran in the same session and returned 1.691 s (inside [1, 3], ΔAWT
 * −2.189 s), so the refusal is a fact about the policy, not the search machinery.
 *
 * **H2, in the same paragraph as the one interval above that excludes zero on the better side:**
 * the shipped arc is the *widest* amplitude consistent with its citation — endpoints at exactly
 * 0 % — and a wider arc is the one a selector finds easiest to exploit, so every figure here is
 * measured under conditions *more* favourable to the selector than a real building's smoother
 * arc. That discount cuts against the control's −0.576 BETTER and against any future positive
 * reading of the treatment's negative point estimate.
 *
 * **This measurement also found and closed a wiring bug, reported rather than smoothed over:** the
 * first full run's regime screens came back **byte-identical** on the treatment and the control
 * (both flat, χ² 6.0) because `screenRegimes`, `splitDriftOf`, `traceLearnedRegimes` and the
 * liveness half's `trajectoryOf`/`tracePatterns` called `runSimulation` without the operating
 * point's `demandTemplate` — the gate experiments run through `runner/experiment.ts`, which
 * passes it, so no ΔTTD, census, limit or verdict figure moved when the five call sites were
 * fixed; only the screen, the learned-regime traces and the liveness diagnostics did. G11's rule
 * — a bit-identical result is a wiring bug until proven otherwise — is what caught it.
 *
 * § D145 (one cell) and § D156 (eight cells, refused at all five PRIMARY under Holm) stand
 * unchanged beside this result; neither is superseded and neither is weaker than stated there.
 */

import type { LoadedConfig } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import { replicationSeed } from '../runner/crn.js';
import type { ExperimentResources } from '../runner/types.js';
import {
  comparePaired,
  loadResources,
  runGateExperiment,
  samplesOf,
} from '../validation/harness.js';

import { MIDTOWN_LUNCH_FLAT_CONTROL, MIDTOWN_LUNCH_TWO_WAY } from './arms.js';
import { TARGET_HALF_WIDTH_S, budgetFor } from './matrix.js';
import {
  SWEEP_HOLDOUT_SEED,
  SWEEP_TUNING_SEED,
  holmDecisions,
  pairedPValue,
  probeCellResolution,
  screenRegimes,
  traceLearnedRegimes,
  type CellResolution,
  type HolmDecision,
  type LearnedRegimeTrace,
  type RegimeScreen,
} from './selectionSweep.js';
import {
  CENSUS_REPLICATIONS,
  SEARCH_CANDIDATES,
  SEARCH_REPLICATIONS,
  SELECTION_GATE,
  censusSelectionPoint,
  runDeadbandKnownAnswer,
  runWeightSetSelectionStudy,
  toResources,
  weightSetLibrary,
  type DeadbandKnownAnswer,
  type SelectionCell,
  type SelectionCensus,
  type SelectionStudy,
} from './weightSetSelection.js';

/* -------------------------------------------------------------------------- *
 * The cells — shipped operating points, not authored here
 * -------------------------------------------------------------------------- */

/**
 * The treatment: `midtown-office` under the `lunch-two-way` template at the shipped operating
 * point (`arms.ts`). § D162 condition 1: **nothing about the template may be re-authored here** —
 * this module holds a reference to the shipped point and constructs no traffic of its own.
 */
export const LUNCH_TREATMENT_CELL: SelectionCell = Object.freeze({
  id: 'midtown-lunch-two-way-1.5pct',
  building: 'midtown-office',
  point: MIDTOWN_LUNCH_TWO_WAY,
});

/**
 * The flat-mix negative control, § D162 condition 5. Ships as `MIDTOWN_LUNCH_FLAT_CONTROL` —
 * identical to the treatment in every field except `mixAmplitude: 0` — precisely so the measuring
 * lane cannot build its own control and let it drift from the treatment (§ D169).
 */
export const LUNCH_FLAT_CONTROL_CELL: SelectionCell = Object.freeze({
  id: 'midtown-lunch-two-way-1.5pct-flat',
  building: 'midtown-office',
  point: MIDTOWN_LUNCH_FLAT_CONTROL,
});

/** § D156's seed pair, reused: tune at one seed, judge at a disjoint one, both printed. */
export const LUNCH_TUNING_SEED = SWEEP_TUNING_SEED;
export const LUNCH_HOLDOUT_SEED = SWEEP_HOLDOUT_SEED;

/**
 * **The declared Holm family: the treatment cell, alone.** Declared before any ΔTTD existed
 * (docs/13 § 4 G9), and a new family — never pooled with § D151's PRIMARY or SECONDARY families,
 * whose frozen arrays this module does not touch. The flat control is deliberately not a member:
 * it can only refuse (§ D162 condition 5), never accept, and correcting a control's p-value
 * upward would make the refusal it exists to deliver *harder* to trigger.
 */
export const LUNCH_HOLM_FAMILY: readonly string[] = Object.freeze([LUNCH_TREATMENT_CELL.id]);

/* -------------------------------------------------------------------------- *
 * Step 0 — the pre-registered budget, and its re-derivation
 * -------------------------------------------------------------------------- */

/** How one cell's budget was derived — `matrix.ts`'s `BudgetBasis`, on the gate metric. */
export interface LunchBudgetBasis {
  readonly cellId: string;
  /** Largest paired s_D vs the reference among arms with zero invalid census replications. */
  readonly bindingArmId: string;
  /** That arm's paired-difference s_D against the reference on `ttdMeanS`, at the census n. */
  readonly sdOfDifferenceS: number;
  /** `budgetFor(sd)` before clamping. */
  readonly unclampedReplications: number;
  readonly clamped: 'floor' | 'ceiling' | 'none';
  readonly replications: number;
}

/**
 * **The pre-registered budget: 200 replications, on both cells.**
 *
 * Derived 2026-07-30 from the step-0 census at the tuning seed, before any selector arm existed,
 * following `matrix.ts`'s variance-derived worked example (`budgetFor`, h = 1 s) on the gate
 * metric: binding arm `nearest-car` on both cells (s_D 19.414 s / 14.725 s → unclamped 1448 /
 * 833), clamped to the top of `CLAUDE.md`'s 50–200 band. The census returned **no ceiling on
 * either cell** — all twelve arms quotable across 200 — so nothing clamps it further, and H1's
 * by-hand floor check passes (200 ≥ 50). Fixed here so it cannot be adjusted after a ΔTTD is
 * seen; {@link runLunchTwoWaySelectionStudy} re-derives the basis on every run and reports any
 * disagreement instead of substituting a new number.
 */
export const LUNCH_REPLICATIONS = 200;

/**
 * Step 0's reference arm, on both cells, recorded so the study can report a census that later
 * disagrees (the § D156 § 5 `referenceMatchesPreRegistration` device) rather than silently
 * following it.
 */
export const LUNCH_PREREGISTERED_REFERENCE = 'auction-multi-round';

/**
 * Re-derive one cell's budget basis from a fresh census experiment at the tuning seed.
 *
 * The arithmetic is `matrix.ts`'s (`budgetFor` over the largest clean-arm paired s_D), restricted
 * to arms whose census row has **zero** invalid replications — the restriction that makes the rule
 * non-circular — and computed on {@link SELECTION_GATE}, because this study's gate is TTD and only
 * TTD, so a budget sized on AWT would be sized on a metric the criterion forbids it to read.
 */
export async function deriveLunchBudget(input: {
  readonly cell: SelectionCell;
  readonly census: SelectionCensus;
  readonly resources: ExperimentResources;
  readonly seed: number;
}): Promise<LunchBudgetBasis> {
  const { cell, census } = input;
  const experiment = await runGateExperiment({
    id: `phase6c/lunch-budget/${cell.id}`,
    seed: input.seed,
    building: cell.building,
    dispatchers: [...input.resources.dispatcherProfilesById.keys()],
    traffic: cell.point,
    replications: census.replications,
    resources: input.resources,
  });
  const reference = samplesOf(experiment, census.referenceProfileId, SELECTION_GATE);
  let bindingArmId = census.referenceProfileId;
  let sdOfDifferenceS = 0;
  for (const row of census.rows) {
    if (row.firstInvalidReplication !== undefined) continue;
    if (row.profileId === census.referenceProfileId) continue;
    const sd = Math.sqrt(
      comparePaired(SELECTION_GATE, samplesOf(experiment, row.profileId, SELECTION_GATE), reference)
        .varianceOfDifference,
    );
    if (sd > sdOfDifferenceS) {
      sdOfDifferenceS = sd;
      bindingArmId = row.profileId;
    }
  }
  const unclamped = Math.ceil(((1.959_963_984_540_054 * sdOfDifferenceS) / TARGET_HALF_WIDTH_S) ** 2);
  const replications = budgetFor(sdOfDifferenceS);
  return Object.freeze({
    cellId: cell.id,
    bindingArmId,
    sdOfDifferenceS,
    unclampedReplications: unclamped,
    clamped:
      replications === unclamped ? ('none' as const) : replications > unclamped ? ('floor' as const) : ('ceiling' as const),
    replications,
  });
}

/* -------------------------------------------------------------------------- *
 * H3's arithmetic — weight sets that are the reference's own vector
 * -------------------------------------------------------------------------- */

/**
 * Which of the selector's adoptable weight sets carry a vector byte-identical to the reference's.
 *
 * `selectionSweep.ts` computes this inside `runSelectionSweep`; the arithmetic is restated here
 * (same definition, § D151 § 4) because this study is not a sweep cell. At this measurement's
 * reference (`auction-multi-round`, weights `{ waitTime: 1.0, existingCallDelay: 0.4,
 * loadFactor: 0.3 }`) the set is **empty** — no shipped pattern weight set matches — so a
 * bit-identical replication here is a live G11 wiring question with no by-construction excuse.
 */
export function noOpWeightSetsOf(
  config: LoadedConfig,
  referenceProfileId: string,
): readonly string[] {
  const library = weightSetLibrary(config);
  const reference = library.weightsByProfileId.get(referenceProfileId);
  if (reference === undefined) return Object.freeze([]);
  const equal = (other: ReadonlyMap<string, number>): boolean =>
    other.size === reference.size &&
    [...reference].every(([term, weight]) => other.get(term) === weight);
  return Object.freeze(
    [...new Set(Object.values(library.patternSwitching.weightSetsByPattern))].filter((id) => {
      const weights = library.weightsByProfileId.get(id);
      return weights !== undefined && equal(weights);
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/** One cell's whole outcome: the screen, the limit, the study, and the diagnostics beside it. */
export interface LunchCellOutcome {
  readonly cell: SelectionCell;
  readonly role: 'treatment' | 'flat-control';
  /** The step-0 census, re-run: reference arm and ceilings, fixed before any selector exists. */
  readonly census: SelectionCensus;
  /** The budget basis, re-derived from the census on every run. */
  readonly budget: LunchBudgetBasis;
  /** Whether the census still returns {@link LUNCH_PREREGISTERED_REFERENCE}. Reported, not fixed. */
  readonly referenceMatchesPreRegistration: boolean;
  /** § D151 § 5's screen, on the shipped detector at its authored gains, before any ΔTTD. */
  readonly screen: RegimeScreen;
  /** The cell's own TTD resolution limits, measured at the tuning seed (§ D151 § 3). */
  readonly resolution: CellResolution;
  readonly study: SelectionStudy;
  /** The learned arm's uncorrected two-sided paired-t p-value on the gate. */
  readonly pValue: number;
  /** H3's arithmetic at this cell's reference. Empty here — see {@link noOpWeightSetsOf}. */
  readonly noOpWeightSets: readonly string[];
  /** What the fitted policy actually held on the holdout traffic. */
  readonly learnedRegimes: LearnedRegimeTrace;
  /** Did the shipped detector ever prefer `two-way` here? docs/13 § 7 step 1's mechanism check. */
  readonly twoWayPreferredShare: number;
}

export interface LunchTwoWaySelectionStudy {
  readonly tuningSeed: number;
  readonly holdoutSeed: number;
  readonly gateMetric: ReplicationMetric;
  /** The pre-registered budget both cells ran at. */
  readonly replications: number;
  readonly treatment: LunchCellOutcome;
  readonly control: LunchCellOutcome;
  /** `true` when both censuses picked the same reference arm — say it loudly either way. */
  readonly referenceMatchesAcrossCells: boolean;
  /** Holm over {@link LUNCH_HOLM_FAMILY} — a family of one, so α = 0.05 and no correction bites. */
  readonly holm: HolmDecision;
  /** The known answer the policy cannot see, run in the same session. */
  readonly deadband: DeadbandKnownAnswer;
  /**
   * § D162 condition 5's trigger: the learned arm's interval excludes zero on the better side
   * **on the flat control**. When `true` the treatment result — whatever it says — is a bug
   * report, not an acceptance, and the mechanism must be investigated rather than filed.
   */
  readonly controlShowsAdvantage: boolean;
  /** § D151 § 5 / G12: significant at a cell the screen calls one-regime is a bug report. */
  readonly significantAtOneRegimeCell: boolean;
  /** The § D162 verdict. `NOT ACCEPTED` is an explicitly permitted outcome. */
  readonly verdict: 'ACCEPTED' | 'NOT ACCEPTED';
  readonly verdictReason: string;
}

export interface LunchTwoWaySelectionOptions {
  readonly config?: LoadedConfig | undefined;
  readonly tuningSeed?: number | undefined;
  readonly holdoutSeed?: number | undefined;
  readonly censusReplications?: number | undefined;
  readonly replications?: number | undefined;
  readonly searchCandidates?: number | undefined;
  readonly searchReplications?: number | undefined;
  readonly screenSeeds?: readonly number[] | undefined;
}

/** One cell, in the criterion's order: census → budget → screen → limit → learning → verdict. */
async function measureCell(input: {
  readonly cell: SelectionCell;
  readonly role: 'treatment' | 'flat-control';
  readonly config: LoadedConfig;
  readonly resources: ExperimentResources;
  readonly tuningSeed: number;
  readonly holdoutSeed: number;
  readonly censusReplications: number;
  readonly replications: number;
  readonly searchCandidates: number;
  readonly searchReplications: number;
  readonly screenSeeds: readonly number[] | undefined;
}): Promise<LunchCellOutcome> {
  const { cell, config, resources } = input;

  /* Census first, so the reference arm exists before anything is screened or graded against it. */
  const census = await censusSelectionPoint({
    seed: input.tuningSeed,
    replications: input.censusReplications,
    resources,
    cell,
  });
  const budget = await deriveLunchBudget({
    cell,
    census,
    resources,
    seed: input.tuningSeed,
  });

  /* The screen, before any ΔTTD: what the shipped detector at its authored gains makes of the
     traffic, on the census's reference profile. A moderator for interpretation, never a filter. */
  const screen = await screenRegimes({
    cell,
    config,
    resources,
    profileId: census.referenceProfileId,
    ...(input.screenSeeds === undefined ? {} : { seeds: input.screenSeeds }),
  });

  /* The study. Its internal order is the criterion's (census → limit → learning → verdict); the
     resolution probe closes over `config`, which `SelectionStudyOptions.resolutionProbe` does not
     pass, exactly as `runSelectionSweep` does. */
  let resolution: CellResolution | undefined;
  const study = await runWeightSetSelectionStudy({
    seed: input.tuningSeed,
    holdoutSeed: input.holdoutSeed,
    config,
    resources,
    cell,
    replications: input.replications,
    censusReplications: input.censusReplications,
    searchCandidates: input.searchCandidates,
    searchReplications: input.searchReplications,
    resolutionProbe: async (probe) => {
      resolution = await probeCellResolution({
        cell,
        census: probe.census,
        resources: probe.resources,
        config,
        seed: probe.seed,
        replications: probe.replications,
      });
      return resolution;
    },
  });
  if (resolution === undefined) throw new Error('unreachable: the resolution probe did not run');

  const learned = study.arms.find((arm) => arm.armId === 'learned');
  if (learned === undefined) throw new Error(`No learned arm at "${cell.id}".`);

  const learnedRegimes = traceLearnedRegimes({
    cell,
    config,
    resources,
    referenceProfileId: study.census.referenceProfileId,
    selection: study.learned.winner.selection,
    seeds: [
      replicationSeed(input.holdoutSeed, 0),
      replicationSeed(input.holdoutSeed, 1),
      replicationSeed(input.holdoutSeed, 2),
    ],
  });

  return Object.freeze({
    cell,
    role: input.role,
    census,
    budget,
    referenceMatchesPreRegistration:
      census.referenceProfileId === LUNCH_PREREGISTERED_REFERENCE,
    screen,
    resolution,
    study,
    pValue: pairedPValue(
      learned.gate.estimate.mean,
      learned.gate.estimate.standardError,
      learned.gate.estimate.n,
    ),
    noOpWeightSets: noOpWeightSetsOf(config, study.census.referenceProfileId),
    learnedRegimes,
    twoWayPreferredShare: screen.patternShares['two-way'] ?? 0,
  });
}

const learnedArmOf = (study: SelectionStudy) => {
  const arm = study.arms.find((candidate) => candidate.armId === 'learned');
  if (arm === undefined) throw new Error('The study carries no learned arm.');
  return arm;
};

/**
 * **The § D162 measurement: treatment and flat control, same seeds, same budget, one session.**
 *
 * Order: per cell, census → budget re-derivation → regime screen → resolution limit at the tuning
 * seed → search on the tuning seed → verdict on the disjoint holdout seed; then Holm within the
 * declared family of one; then the deadband known-answer; then the verdict conjunction. Nothing is
 * chosen after a result is seen — the budget is {@link LUNCH_REPLICATIONS}, pre-registered from
 * step 0's census, and the options exist for cheap tests rather than for tuning the measurement.
 */
export async function runLunchTwoWaySelectionStudy(
  options: LunchTwoWaySelectionOptions = {},
): Promise<LunchTwoWaySelectionStudy> {
  const config = options.config ?? (await loadResources());
  const resources = toResources(config);
  const tuningSeed = options.tuningSeed ?? LUNCH_TUNING_SEED;
  const holdoutSeed = options.holdoutSeed ?? LUNCH_HOLDOUT_SEED;
  const shared = {
    config,
    resources,
    tuningSeed,
    holdoutSeed,
    censusReplications: options.censusReplications ?? CENSUS_REPLICATIONS,
    replications: options.replications ?? LUNCH_REPLICATIONS,
    searchCandidates: options.searchCandidates ?? SEARCH_CANDIDATES,
    searchReplications: options.searchReplications ?? SEARCH_REPLICATIONS,
    screenSeeds: options.screenSeeds,
  };

  /* § D162 condition 5: the control is measured in the same run, at the same seeds, at the same
     budget — a control on different traffic seeds or a different total demand is not a control. */
  const treatment = await measureCell({ cell: LUNCH_TREATMENT_CELL, role: 'treatment', ...shared });
  const control = await measureCell({
    cell: LUNCH_FLAT_CONTROL_CELL,
    role: 'flat-control',
    ...shared,
  });

  /* Holm within the declared family — the treatment alone. Stated rather than skipped, so the
     "no correction was needed" sentence is arithmetic and not an assertion. */
  const holmAll = holmDecisions(
    LUNCH_HOLM_FAMILY.map((key) => {
      if (key !== treatment.cell.id) throw new Error(`Undeclared family member "${key}".`);
      return { key, pValue: treatment.pValue };
    }),
  );
  const holm = holmAll[0];
  if (holm === undefined) throw new Error('The declared Holm family is empty.');

  /* The known answer the policy cannot see, in the same session (docs/13 § 7 step 5). */
  const deadband = await runDeadbandKnownAnswer({
    seed: tuningSeed,
    candidates: shared.searchCandidates,
    replications: shared.searchReplications,
    resources,
  });

  const treatmentGate = learnedArmOf(treatment.study);
  const controlGate = learnedArmOf(control.study);
  const better = treatmentGate.gate.verdict === 'BETTER' && treatmentGate.gate.estimate.mean < 0;
  const generalizes = treatment.study.holdoutVerdict === 'GENERALIZES';
  const controlShowsAdvantage =
    controlGate.gate.verdict === 'BETTER' && controlGate.gate.estimate.mean < 0;
  const significantAtOneRegimeCell = better && holm.rejected && treatment.screen.regimeCount <= 1;

  const accepted =
    better &&
    holm.rejected &&
    !treatmentGate.belowResolutionLimit &&
    generalizes &&
    deadband.rediscovered &&
    !controlShowsAdvantage &&
    !significantAtOneRegimeCell;

  const reasons: string[] = [];
  if (!better) {
    reasons.push(
      `the treatment interval does not exclude zero on the better side (${treatmentGate.gate.verdict})`,
    );
  }
  if (!holm.rejected) {
    reasons.push(
      `Holm retains it in the declared family of ${String(LUNCH_HOLM_FAMILY.length)} (p = ${holm.pValue.toFixed(4)} against alpha ${holm.alpha.toFixed(5)})`,
    );
  }
  if (treatmentGate.belowResolutionLimit) {
    reasons.push(
      `the effect is below this cell's own TTD-measured ${treatmentGate.regime} resolution limit of ${treatmentGate.resolutionLimitS.toFixed(3)} s`,
    );
  }
  if (!generalizes) reasons.push('the winner does not generalize to the disjoint seed');
  if (!deadband.rediscovered) {
    reasons.push(
      `the deadband known-answer FAILED (winner ${deadband.winnerThresholdS.toFixed(3)} s outside [1, 3]) — every ΔTTD above is a fact about the search, not the policy, and must not be published as a Phase 6c verdict`,
    );
  }
  if (controlShowsAdvantage) {
    reasons.push(
      '§ D162 condition 5: the advantage survives on the flat-mix control, so it is not about mix variation — a bug report, not an acceptance',
    );
  }
  if (significantAtOneRegimeCell) {
    reasons.push('§ D151 § 5: significant at a cell the screen calls one-regime — a bug report');
  }

  return Object.freeze({
    tuningSeed,
    holdoutSeed,
    gateMetric: SELECTION_GATE,
    replications: shared.replications,
    treatment,
    control,
    referenceMatchesAcrossCells:
      treatment.census.referenceProfileId === control.census.referenceProfileId,
    holm,
    deadband,
    controlShowsAdvantage,
    significantAtOneRegimeCell,
    verdict: accepted ? ('ACCEPTED' as const) : ('NOT ACCEPTED' as const),
    verdictReason: accepted
      ? `ΔTTD ${treatmentGate.gate.estimate.mean.toFixed(3)} [${treatmentGate.gate.estimate.lower.toFixed(3)}, ${treatmentGate.gate.estimate.upper.toFixed(3)}] on the treatment, excluding zero at the declared family's level, at or above the cell's own TTD resolution limit, generalizing, with the flat control showing no advantage.`
      : reasons.join('; '),
  });
}

/* -------------------------------------------------------------------------- *
 * The count pins — § D149's pattern, for the headline figures that are not intervals
 * -------------------------------------------------------------------------- */

/**
 * **Every headline count this measurement publishes, pinned.** § D149: a pin table that holds only
 * intervals reads "no standard error" as a licence to hold nothing, and a stale count that still
 * supports its own sentence is the only kind nobody re-checks. Compared against
 * {@link derivedLunchCounts} in **both** directions by `lunchTwoWaySelection.test.ts`.
 */
export const PINNED_LUNCH_COUNTS: Readonly<Record<string, number | string | boolean>> =
  Object.freeze({
    'treatment/reference': 'auction-multi-round',
    // 12 → 13 when `collective-enroute` shipped (`DECISIONS.md` § D205). The count is of arms the
    // census **measures**, and the census still measures every shipped profile; what § D205
    // restricted is which of them may be *elected* reference. That both `reference` pins below are
    // unchanged at `auction-multi-round`, and the verdict with them, is the evidence that the
    // restriction did its job: a profile that beats the baseline is now visible in the census
    // without silently becoming it.
    'treatment/quotable-census-arms': 13,
    'treatment/regime-count': 3,
    'treatment/preference-changes': 21,
    'treatment/learned-identical-replications': 2,
    'treatment/learned-distinct-weight-sets': 5,
    'treatment/learned-pattern-changes': 8,
    'treatment/no-op-weight-sets': 0,
    'control/reference': 'auction-multi-round',
    'control/quotable-census-arms': 13,
    'control/regime-count': 3,
    'control/preference-changes': 30,
    'control/learned-identical-replications': 0,
    'control/learned-distinct-weight-sets': 4,
    'control/learned-pattern-changes': 13,
    'control/no-op-weight-sets': 0,
    'budget/replications': 200,
    'deadband/rediscovered': true,
    verdict: 'NOT ACCEPTED',
    'control-shows-advantage': true,
  });

/** The same keys, derived from a run, so the pin table above can be asserted both ways. */
export function derivedLunchCounts(
  study: LunchTwoWaySelectionStudy,
): Readonly<Record<string, number | string | boolean>> {
  const per = (outcome: LunchCellOutcome, prefix: string) => ({
    [`${prefix}/reference`]: outcome.census.referenceProfileId,
    [`${prefix}/quotable-census-arms`]: outcome.census.rows.filter((row) => row.quotable).length,
    [`${prefix}/regime-count`]: outcome.screen.regimeCount,
    [`${prefix}/preference-changes`]: outcome.screen.preferenceChanges,
    [`${prefix}/learned-identical-replications`]: learnedArmOf(outcome.study)
      .identicalReplications,
    [`${prefix}/learned-distinct-weight-sets`]: outcome.learnedRegimes.distinctWeightSets,
    [`${prefix}/learned-pattern-changes`]: outcome.learnedRegimes.patternChanges,
    [`${prefix}/no-op-weight-sets`]: outcome.noOpWeightSets.length,
  });
  return Object.freeze({
    ...per(study.treatment, 'treatment'),
    ...per(study.control, 'control'),
    'budget/replications': study.replications,
    'deadband/rediscovered': study.deadband.rediscovered,
    verdict: study.verdict,
    'control-shows-advantage': study.controlShowsAdvantage,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function signed(value: number, places = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(places)}`;
}

function interval(estimate: { mean: number; lower: number; upper: number }): string {
  return `${signed(estimate.mean)} [${signed(estimate.lower)}, ${signed(estimate.upper)}]`;
}

/**
 * The whole measurement as a report, in the order docs/13 § 7 runs it. H2's discount sentence is
 * emitted **in the same paragraph** as any ΔTTD reported BETTER, not in a limitations section.
 */
export function formatLunchTwoWaySelection(study: LunchTwoWaySelectionStudy): string {
  const lines: string[] = [
    'Phase 6c on lunch-two-way — measured against DECISIONS.md § D162 (gate: § D139 as raised)',
    '',
    `gate            ${study.gateMetric} (and only ${study.gateMetric})`,
    `tuning seed     ${String(study.tuningSeed)}`,
    `holdout seed    ${String(study.holdoutSeed)}  DISJOINT`,
    `budget          n = ${String(study.replications)} (pre-registered from the step-0 census; matrix.ts's variance-derived rule on the gate metric)`,
    `Holm family     [${LUNCH_HOLM_FAMILY.join(', ')}] — a declared family of one; the flat control is a negative control and no correction was needed`,
    `references      treatment ${study.treatment.census.referenceProfileId} / control ${study.control.census.referenceProfileId} — ${study.referenceMatchesAcrossCells ? 'SAME on both cells' : 'DIFFERENT: the comparison is reference-arm-dependent and the control is weaker evidence than it looks'}`,
    '',
  ];

  for (const outcome of [study.treatment, study.control]) {
    const learned = learnedArmOf(outcome.study);
    const fuzzy = outcome.study.arms.find((arm) => arm.armId === 'fuzzy');
    lines.push(`=== ${outcome.role.toUpperCase()} — ${outcome.cell.id} ===`);
    lines.push(
      `  census        reference ${outcome.census.referenceProfileId}${outcome.referenceMatchesPreRegistration ? ' (as step 0 recorded)' : ` — step 0 recorded "${LUNCH_PREREGISTERED_REFERENCE}"; REPORTED, NOT SUBSTITUTED`}, ` +
        `${String(outcome.census.rows.filter((row) => row.quotable).length)}/${String(outcome.census.rows.length)} arms quotable, ` +
        `reference-arm ceiling ${outcome.census.ceiling === undefined ? 'none' : String(outcome.census.ceiling)}, all-arm ceiling ${outcome.census.allArmCeiling === undefined ? 'none' : String(outcome.census.allArmCeiling)}`,
    );
    for (const row of [...outcome.census.rows].sort((a, b) => a.meanTtdS - b.meanTtdS)) {
      lines.push(
        `    ${row.profileId === outcome.census.referenceProfileId ? '*' : ' '} ${row.profileId.padEnd(22)} TTD ${row.meanTtdS.toFixed(3)} s  quotable=${String(row.quotable)}` +
          (row.firstInvalidReplication === undefined
            ? ''
            : `  firstInvalid=${String(row.firstInvalidReplication)}`),
      );
    }
    lines.push(
      `  budget basis  binding arm ${outcome.budget.bindingArmId}, s_D ${outcome.budget.sdOfDifferenceS.toFixed(3)} s, unclamped n ${String(outcome.budget.unclampedReplications)}, clamped ${outcome.budget.clamped} → ${String(outcome.budget.replications)}`,
    );
    const s = outcome.screen;
    lines.push(
      `  screen        regimes ${String(s.regimeCount)} (distinct ${String(s.distinctPatternsPreferred)}, changes ${String(s.preferenceChanges)}), two-way preferred on ${(outcome.twoWayPreferredShare * 100).toFixed(1)}% of post-warm-up observations`,
    );
    lines.push(
      `                pattern shares: ${Object.entries(s.patternShares)
        .sort((a, b) => b[1] - a[1])
        .map(([pattern, share]) => `${pattern} ${(share * 100).toFixed(1)}%`)
        .join(', ')}`,
    );
    lines.push(
      `                median window arrivals ${s.medianWindowArrivals.toFixed(1)} (the counting-noise column), split drift ${s.splitDrift.standardizedDeviation.toFixed(2)} sd (X2 ${s.splitDrift.chiSquare.toFixed(1)} on ${String(s.splitDrift.degreesOfFreedom)} df, ${String(s.splitDrift.passengers)} passengers)`,
    );
    lines.push(
      `  resolution    near-neighbour ${outcome.resolution.nearNeighbourS.toFixed(3)} s (s_D ${outcome.resolution.nearNeighbourSdS.toFixed(3)}), structural ${outcome.resolution.structuralS.toFixed(3)} s (median s_D ${outcome.resolution.structuralSdS.toFixed(3)}) — ${outcome.resolution.provenance}`,
    );
    lines.push(
      `  ΔTTD learned  ${interval(learned.gate.estimate)} ${learned.gate.verdict}` +
        (outcome.role === 'treatment'
          ? `  p = ${outcome.pValue.toFixed(5)} (Holm alpha ${study.holm.alpha.toFixed(5)} → ${study.holm.rejected ? 'REJECT H0' : 'RETAIN H0'})`
          : `  p = ${outcome.pValue.toFixed(5)} (uncorrected — a negative control refuses, it never accepts)`) +
        (learned.gate.verdict === 'BETTER'
          ? ' — and the shipped arc is the WIDEST amplitude consistent with its citation (§ D169): a real building\'s smoother arc is harder for a selector to exploit, so this figure is an upper bound on the mechanism, not its typical size'
          : ''),
    );
    if (fuzzy !== undefined) {
      lines.push(`  ΔTTD fuzzy    ${interval(fuzzy.gate.estimate)} ${fuzzy.gate.verdict} (Phase 7's bullet, not this gate)`);
    }
    lines.push(
      `  limit         ${learned.regime} ${learned.resolutionLimitS.toFixed(3)} s  belowResolutionLimit=${String(learned.belowResolutionLimit)}  identical ${String(learned.identicalReplications)}/${String(outcome.study.replications)}  no-op sets: ${outcome.noOpWeightSets.length === 0 ? 'none (G11 applies at full strength)' : outcome.noOpWeightSets.join(', ')}`,
    );
    for (const cost of learned.costs) {
      lines.push(`  ${cost.metric.padEnd(21)} ${interval(cost.estimate)} ${cost.verdict}  (beside the gate, never folded in)`);
    }
    lines.push(
      `  learned arm   held ${String(outcome.learnedRegimes.distinctWeightSets)} weight set(s) over ${String(outcome.learnedRegimes.decisions)} decisions, ${String(outcome.learnedRegimes.patternChanges)} changes — ` +
        Object.entries(outcome.learnedRegimes.weightSetShares)
          .sort((a, b) => b[1] - a[1])
          .map(([pattern, share]) => `${pattern} ${(share * 100).toFixed(1)}%`)
          .join(', '),
    );
    lines.push(
      `  holdout       ${signed(outcome.study.holdoutMeanDeltaTtdS)} s on the disjoint seed (tuning winner ${signed(outcome.study.learned.winner.meanDeltaTtdS)} s) — ${outcome.study.holdoutVerdict}`,
    );
    lines.push('');
  }

  lines.push(
    `deadband known-answer — shipped ${String(study.deadband.shippedThresholdS)} s, the same search returned ${study.deadband.winnerThresholdS.toFixed(3)} s at ΔAWT ${signed(study.deadband.winnerMeanDeltaAwtS)} s — rediscovered=${String(study.deadband.rediscovered)}`,
    `control shows advantage: ${String(study.controlShowsAdvantage)}${study.controlShowsAdvantage ? ' — § D162 condition 5: whatever the treatment says, this is a bug report to investigate, not an acceptance' : ''}`,
    `significant at one-regime cell: ${String(study.significantAtOneRegimeCell)}`,
    '',
    `PHASE 6c ON lunch-two-way: ${study.verdict}`,
    `  ${study.verdictReason}`,
  );
  return lines.join('\n');
}

/* c8 ignore start -- the command shell. */
if (process.argv[1]?.endsWith('lunchTwoWaySelection.js') === true) {
  process.stdout.write(`${formatLunchTwoWaySelection(await runLunchTwoWaySelectionStudy())}\n`);
}
/* c8 ignore stop */
