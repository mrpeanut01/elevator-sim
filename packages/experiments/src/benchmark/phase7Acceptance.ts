/**
 * **Phase 7's acceptance interval, at the replication budget the criterion names.**
 *
 * docs/05-roadmap.md § Phase 7 records its criterion as *"MET as a measurement, NOT as a gate"* and
 * says why in one sentence: the interval was produced at n = 60, *"and producing that number at
 * 50–200 replications is Phase 8's job"*. This module is that job.
 *
 * ```ts
 * const study = await runPhase7Acceptance();
 * study.clears;                       // does the holdout interval exclude zero at this budget?
 * study.holdout.get('c-deadband-2');  // the interval, at full precision
 * ```
 *
 * ## What the criterion actually requires, and what would have made passing it meaningless
 *
 * *A tuned weight vector beats hand-authored `predictive-balanced` on **held-out** seeds with a
 * paired-t interval excluding zero.* Four things have to be true at once, and three of them are
 * about the apparatus rather than the answer:
 *
 * 1. **The seed sets are disjoint.** `runHoldoutRound` refuses equal seeds before anything runs and
 *    `buildTuningReport` re-checks the *realized* seeds afterwards, which is the check that survives
 *    a change to the seed derivation. A "holdout" run at the tuning seed is the tuning set under a
 *    second name, with every paired difference identical and every verdict vacuous.
 * 2. **The tuned value is not hand-edited into `data/`.** `data/dispatcher-profiles.json` ships
 *    `idle.repositionThresholdS: 8` against a measured optimum near 2, deliberately, as Phase 7's
 *    known-answer test. The candidates here are **in-memory derived profiles**, which is what a
 *    tuner produces; the shipped file is untouched. An optimizer that returns 8 here has failed,
 *    not agreed.
 * 3. **The budget is in CLAUDE.md's band.** 50–200. n = 150 sits where docs/03's corrected
 *    Student-t table prices a ±0.5 s interval at 143.
 * 4. **The cost is reported beside the gain.** This is new, and it is the reason the number means
 *    more now than it did at n = 60: the third Pareto axis was empty when Phase 7 was accepted, so
 *    the tuned arm's *energy* was not merely unreported — it was unmeasurable. It is measured here.
 *
 * ## Three arms, and why 2.582 is one of them
 *
 * The reference is the profile **as shipped**. The candidates are the deadband at 2 s (the interior
 * optimum of Phase 5's sweep), at **2.582 s** — the value `elevator-sim tune` rediscovered blind
 * from the shipped 8, which is the whole of the known-answer test and deserves its own interval
 * rather than being represented by the value it was supposed to find — and at 5 s, which is the
 * negative control: a step that leaves most replications bit-identical and should therefore come
 * back INDISTINGUISHABLE on wait however large the budget.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import { runHoldoutRound, type HoldoutRound } from '../tuning/report/holdoutRound.js';
import type { ExperimentResources } from '../runner/types.js';
import type { MeanEstimate } from '../reports/types.js';
import { derivedProfile, loadResources, withProfiles } from '../validation/harness.js';

import { benchmarkCase } from './arms.js';

/**
 * The operating point, taken from `arms.ts` rather than re-declared.
 *
 * Garden Apartments at 2 % of population per 5 minutes over a full hour, reported over the whole
 * run — the building the pre-positioning criterion names and the one whose deadband sweep is the
 * phase's known answer. Taking it from `benchmarkCase` is what stops this study quietly acquiring an
 * operating point of its own on which the answer might differ.
 */
export const PHASE7_CASE_ID = 'garden-residential';

/** The profile the criterion names as the incumbent. Never modified on disk. */
export const PHASE7_REFERENCE_PROFILE = 'predictive-balanced';

/** The experiment seed a search would have optimized against. */
export const PHASE7_TUNING_SEED = '20260726';

/** A different experiment seed, and therefore different traffic. The guard. */
export const PHASE7_HOLDOUT_SEED = '981234567';

/**
 * The budget. In CLAUDE.md's 50–200 band, at the rung docs/03 prices a ±0.5 s interval at.
 *
 * Not chosen to make the answer come out: the same three arms were measured at 60 by
 * `holdoutRound.test.ts` before this module existed, with the same sign on every one.
 */
export const PHASE7_REPLICATIONS = 150;

/** The deadbands measured against the shipped 8 s. See the module docstring for why 2.582. */
export const PHASE7_DEADBANDS_S: readonly number[] = Object.freeze([2, 2.582, 5]);

/** Arm id for a candidate at one deadband. */
export function deadbandArmId(thresholdS: number): string {
  return `c-deadband-${String(thresholdS)}`;
}

/** `predictive-balanced` with `idle.repositionThresholdS` moved and nothing else touched. */
export function atDeadband(base: DispatcherProfile, thresholdS: number): DispatcherProfile {
  return derivedProfile(base, `pb-deadband-${String(thresholdS)}`, {
    name: `${base.name} (deadband ${String(thresholdS)} s)`,
    idle: { ...base.idle, repositionThresholdS: thresholdS },
  });
}

/** One arm's paired interval against the reference, on one seed set, on one objective. */
export interface Phase7Interval {
  readonly candidateId: string;
  readonly objectiveId: string;
  /** Absent when the comparison is not supportable — never defaulted to a zero interval. */
  readonly estimate: MeanEstimate | undefined;
  readonly verdict: string;
  /** Paired differences that were exactly zero. `=== pairs` is `IDENTICAL`. */
  readonly exactZeroPairs: number;
  readonly pairs: number;
}

export interface Phase7AcceptanceStudy {
  readonly round: HoldoutRound;
  /** `formatTuningReport(report)` — the page, byte-deterministic from the report value alone. */
  readonly page: string;
  readonly replications: number;
  /** Keyed `candidateId/objectiveId`, over the **tuning** seed set. */
  readonly tuning: ReadonlyMap<string, Phase7Interval>;
  /** Keyed `candidateId/objectiveId`, over the **held-out** seed set. The criterion's own set. */
  readonly holdout: ReadonlyMap<string, Phase7Interval>;
  /** Whether the realized seed sets share no seed. The criterion is void without it. */
  readonly disjoint: boolean;
  /**
   * **The criterion's verdict.** `true` when at least one tuned candidate beats the shipped
   * reference on AWT over the held-out set with a paired-t interval excluding zero.
   *
   * Computed rather than asserted, so a study that stops clearing reports that it stopped rather
   * than failing an assertion whose message says something else.
   */
  readonly clears: boolean;
  /** Candidate ids that clear it, in input order. */
  readonly clearingCandidates: readonly string[];
}

export interface Phase7AcceptanceOptions {
  readonly resources?: ExperimentResources | undefined;
  readonly replications?: number | undefined;
}

/**
 * Run the acceptance round and report the interval.
 *
 * The energy proxy is supplied, so the round's two Pareto fronts are decided over all three axes.
 * This is the parameter `holdoutRound.ts` declared as *"the whole of the wiring on this side"* and
 * documented as impossible to fill — *"`core`'s `RunSummary` records no energy, no metres travelled
 * and no stop count, so there is nothing honest to pass here yet"*. There is now.
 */
export async function runPhase7Acceptance(
  options: Phase7AcceptanceOptions = {},
): Promise<Phase7AcceptanceStudy> {
  const spec = benchmarkCase(PHASE7_CASE_ID);
  const config = await loadResources();
  const base = config.dispatcherProfilesById.get(PHASE7_REFERENCE_PROFILE);
  if (base === undefined) {
    throw new Error(`data/ has no profile "${PHASE7_REFERENCE_PROFILE}".`);
  }

  const candidates = PHASE7_DEADBANDS_S.map((thresholdS) => ({
    candidateId: deadbandArmId(thresholdS),
    profile: atDeadband(base, thresholdS),
    parameters: { 'idle.repositionThresholdS': thresholdS },
  }));
  const resources =
    options.resources ??
    withProfiles(
      config,
      candidates.map((candidate) => candidate.profile),
    );

  const round = await runHoldoutRound({
    resources,
    buildingId: spec.building,
    traffic: spec.traffic,
    reference: {
      candidateId: PHASE7_REFERENCE_PROFILE,
      profile: base,
      parameters: { 'idle.repositionThresholdS': 8 },
    },
    candidates,
    tuningSeed: PHASE7_TUNING_SEED,
    holdoutSeed: PHASE7_HOLDOUT_SEED,
    replications: options.replications ?? PHASE7_REPLICATIONS,
    experimentId: 'phase7-acceptance',
    energyProxyOf: (replication) => replication.summary.energy.workKJ,
  });

  const tuning = new Map<string, Phase7Interval>();
  const holdout = new Map<string, Phase7Interval>();
  for (const comparison of round.report.comparisons) {
    for (const [role, objectives] of [
      ['tuning', comparison.tuning],
      ['holdout', comparison.holdout ?? []],
    ] as const) {
      const target = role === 'holdout' ? holdout : tuning;
      for (const objective of objectives) {
        target.set(`${comparison.candidateId}/${objective.objectiveId}`, {
          candidateId: comparison.candidateId,
          objectiveId: objective.objectiveId,
          estimate: objective.estimate,
          verdict: objective.verdict,
          exactZeroPairs: objective.exactZeroPairs,
          pairs: objective.pairs,
        });
      }
    }
  }

  const clearingCandidates = candidates
    .map((candidate) => candidate.candidateId)
    .filter((candidateId) => {
      const found = holdout.get(`${candidateId}/awt`);
      return found !== undefined && found.verdict === 'BETTER';
    });

  return Object.freeze({
    round,
    page: round.page,
    replications: options.replications ?? PHASE7_REPLICATIONS,
    tuning,
    holdout,
    disjoint: round.report.seedSets.disjoint,
    clears: clearingCandidates.length > 0,
    clearingCandidates: Object.freeze(clearingCandidates),
  });
}
