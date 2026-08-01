/**
 * **Teach a policy, then judge it on traffic it has never seen** — docs/14 § 4.2 and § 4.3.
 *
 * The order below is the criterion's, and nothing in it is chosen after a result is seen:
 *
 * ```
 * census (training traffic)  →  resolution limit (training traffic)  →  search (training traffic)
 *                                                                          ↓
 *                              verdict (HELD-OUT traffic, run seed unchanged)
 * ```
 *
 * ## What is different from the three refusals, said plainly
 *
 * [§ D145](../../../../DECISIONS.md), § D156 and § D200 each fitted a policy at **one seed** and
 * validated at **another seed** — which moves the crowd *and* the machine at once. This round holds
 * the run seed and moves only docs/14 § 1.1's traffic seed, so *"it did not generalize"* has one
 * candidate explanation instead of two, and a spec may declare **several operating points** whose
 * training deltas are averaged before a winner is picked, rather than one.
 *
 * **That is a difference in apparatus, not a reason to expect a different answer.** § D200 closed
 * the mix-varying question in the refusing direction and said what would move Phase 6c now is *a
 * different selector, not a different measurement*. This is a different measurement. A fourth
 * refusal is the outcome to expect, it is permitted by docs/14 § 5 criterion 5, and it is
 * published exactly like the first three.
 *
 * ## § 4.3 — how the dishonest comparison is made awkward
 *
 * *A learned dispatcher that beats the baseline on the traffic it trained on is not a result; it is
 * the definition of overfitting.* So:
 *
 * - **Every interval in this module is measured on the holdout traffic seed.** There is no option,
 *   no flag and no field that produces one on the training seed; `runTeachingRound` does not take
 *   a parameter that could ask for it.
 * - **The training-side number is a bare mean.** {@link TeachingCellResult.trainingMeanDeltaS} has
 *   no confidence interval, no verdict and no p-value, because those are exactly the shapes a
 *   reader quotes. It exists to compute {@link TeachingCellResult.generalizes} and to be printed
 *   beside the number that counts.
 * - **A spec whose two traffic seeds are equal never runs.** `parseTeachingSpec` refuses it, so the
 *   cheapest way to produce a training-set win — reuse the seed — is a refusal rather than a
 *   result.
 *
 * ## The pieces this module does not reimplement
 *
 * The census, the resolution probe, the paired-t cell and Holm–Bonferroni are `benchmark/`'s, and
 * are called rather than copied. A second copy of *"which arm is the reference"* or of *"what is
 * the smallest detectable effect here"* is how two answers to one question get into a tree; § D151
 * § 2's `firstInvalidOf` defect is the instance this repository already paid for.
 */

import { resolveDispatchConfig } from '@elevator-sim/core';
import type { LoadedConfig, SelectionStageConfig, WeightSetSource } from '@elevator-sim/core';

import {
  SELECTION_METRICS,
  censusSelectionPoint,
  selectorArm,
  weightSetLibrary,
  type SelectionCell,
  type SelectionCensus,
} from '../benchmark/weightSetSelection.js';
import {
  holmDecisions,
  pairedPValue,
  probeCellResolution,
  type CellResolution,
  type HolmDecision,
} from '../benchmark/selectionSweep.js';
import { compareCell, type CellComparison } from '../benchmark/verdict.js';
import type { DispatcherArmSpec, ExperimentResources } from '../runner/types.js';
import { policyNoiseStream, sampleCandidate } from '../tuning/space/sample.js';
import { searchSpace, subspace } from '../tuning/space/collect.js';
import type { Candidate } from '../tuning/space/types.js';
import { cellOf, digestsOf, runGateExperiment, samplesOf } from '../validation/harness.js';

import {
  TeachingError,
  parseTeachingSpec,
  teachingSeedSets,
  type ObservationFeature,
  type TeachingSeedSets,
  type TeachingSpec,
} from './spec.js';

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

/** One point in the declared action space, and what it scored while being taught. */
export interface TaughtCandidate {
  readonly index: number;
  readonly selection: SelectionStageConfig;
  /**
   * Mean paired ΔTTD against the reference arm, **averaged over every declared point**, on the
   * training traffic. Negative is better. Not a result; the input to an argmin.
   */
  readonly trainingMeanDeltaS: number;
}

export interface TaughtPolicy {
  readonly trainingTrafficSeed: number;
  readonly dimensions: readonly string[];
  readonly candidates: readonly TaughtCandidate[];
  readonly winner: TaughtCandidate;
  readonly replicationsPerPoint: number;
}

/**
 * Turn a sampled point in the declared space into the `selection` stage a policy is built from.
 *
 * Reads only the ids the spec declared, so a candidate carrying more is not silently used, and a
 * spec that declared fewer than four leaves the rest at their defaults — at which the contextual
 * policy is arithmetically identical to the fuzzy one, by construction.
 */
function selectionFrom(candidate: Candidate, parameterIds: readonly string[]): SelectionStageConfig {
  const stage: Record<string, number | string> = { policy: 'contextual' };
  for (const id of parameterIds) {
    const value = candidate.get(id);
    if (typeof value !== 'number') {
      throw new TeachingError(`The sampled candidate has no numeric value for the declared action parameter "${id}".`);
    }
    stage[id.slice('selection.'.length)] = value;
  }
  return Object.freeze(stage) as unknown as SelectionStageConfig;
}

/* -------------------------------------------------------------------------- *
 * The result
 * -------------------------------------------------------------------------- */

export interface TeachingCellResult {
  readonly cellId: string;
  readonly building: string;
  readonly point: string;
  readonly census: SelectionCensus;
  readonly referenceProfileId: string;
  readonly resolution: CellResolution;
  /** The gate, on **held-out** traffic. The only interval that can accept or refuse. */
  readonly gate: CellComparison;
  /** Beside the gate and never folded into it. */
  readonly costs: readonly CellComparison[];
  /** Phase 7's authored detector, measured beside. **Not the gate** — § D145's standing warning. */
  readonly fuzzyGate: CellComparison;
  readonly identicalReplications: number;
  readonly regime: 'near-neighbour' | 'structural';
  readonly resolutionLimitS: number;
  readonly belowResolutionLimit: boolean;
  readonly replications: number;
  readonly quotable: boolean;
  readonly crnAligned: boolean;
  /** A bare mean on the training traffic. No interval, no verdict, deliberately. */
  readonly trainingMeanDeltaS: number;
  /** Do the training and holdout signs agree? Measured, not assumed. */
  readonly generalizes: boolean;
  readonly accepted: boolean;
  readonly reason: string;
}

export interface TeachingRound {
  readonly spec: TeachingSpec;
  readonly seedSets: TeachingSeedSets;
  /**
   * Do the declared observations match what the detector will actually read?
   *
   * Rule 2 is *"declared, not implicit"*, and a declaration that is not checked against the
   * mechanism is exactly as implicit as no declaration at all. Measured against the resolved
   * `patternSwitching` block, so a spec naming two inputs while the detector reads three is a
   * refusal rather than a footnote.
   */
  readonly observationsMatchDetector: boolean;
  readonly declaredObservations: readonly ObservationFeature[];
  readonly detectorInputs: readonly string[];
  readonly observationWindowS: number;
  readonly policy: TaughtPolicy;
  readonly cells: readonly TeachingCellResult[];
  /** The Holm family: exactly the declared points, named before any ΔTTD was seen. */
  readonly holm: readonly HolmDecision[];
  readonly verdict: 'ACCEPTED' | 'NOT ACCEPTED';
  readonly verdictReason: string;
  /** Stated on the object, because a verdict whose traffic is not named is not this verdict. */
  readonly measuredOn: 'held-out traffic';
}

export interface TeachingRoundInput {
  readonly spec: TeachingSpec;
  readonly config: LoadedConfig;
  readonly resources: ExperimentResources;
}

/* -------------------------------------------------------------------------- *
 * The round
 * -------------------------------------------------------------------------- */

/**
 * Run one teaching round and return its verdict, which may be `NOT ACCEPTED`.
 *
 * @throws TeachingError when the spec is refused, when the declared observation set disagrees with
 *   the detector the run will actually use, or when the two realized traffic-seed sets are not
 *   disjoint. All three are refusals before any policy is fitted, because each of them would
 *   produce a plausible-looking result about a configuration nobody declared.
 */
export async function runTeachingRound(input: TeachingRoundInput): Promise<TeachingRound> {
  const spec = parseTeachingSpec(input.spec);
  const seedSets = teachingSeedSets(spec);
  if (!seedSets.disjoint) {
    throw new TeachingError(
      `Teaching spec "${spec.id}": the realized training and holdout traffic-seed sets intersect. The two declared seeds differ, so this is a defect in the derivation rather than in the spec — and a holdout containing a crowd the policy was fitted on is not a holdout.`,
    );
  }

  const library = weightSetLibrary(input.config);
  const { detectorInputs, observationWindowS, matches } = auditObservations(spec, input, library);
  if (!matches) {
    throw new TeachingError(
      `Teaching spec "${spec.id}" declares the observations [${spec.observations.map((feature) => feature.id).join(', ')}], and the detector this run would use reads [${detectorInputs.join(', ')}]. A declared observation set that is not the one the mechanism reads is exactly as implicit as no declaration at all (docs/14 § 4.2 rule 2).`,
    );
  }

  const space = subspace(searchSpace(), spec.action.parameterIds);
  const missing = spec.action.parameterIds.filter((id) => !space.ids.includes(id));
  if (missing.length > 0) {
    throw new TeachingError(
      `Teaching spec "${spec.id}" declares action parameters the narrowed space does not carry: ${missing.join(', ')}. A search over a silently smaller space reports a winner that is only optimal at whatever the missing dimension happened to be.`,
    );
  }

  /* Step 1 — the census and the resolution limit, per point, on the **training** traffic and
     before any policy exists. The reference arm and the limit are therefore not functions of the
     data they grade (§ D139, § D151 § 3). */
  const cells: SelectionCell[] = spec.traffic.map((point) => ({
    id: `${spec.id}/${point.id}`,
    building: spec.building,
    point,
  }));
  const censuses: SelectionCensus[] = [];
  const resolutions: CellResolution[] = [];
  for (const cell of cells) {
    const census = await censusSelectionPoint({
      seed: spec.seeds.runSeed,
      trafficSeed: spec.seeds.trainingTrafficSeed,
      replications: spec.budget.censusReplications,
      resources: input.resources,
      cell,
    });
    censuses.push(census);
    resolutions.push(
      await probeCellResolution({
        cell,
        census,
        resources: input.resources,
        config: input.config,
        seed: spec.seeds.runSeed,
        trafficSeed: spec.seeds.trainingTrafficSeed,
        replications: spec.budget.resolutionReplications,
      }),
    );
  }

  /* Step 2 — the search, on the training traffic. A candidate is scored by its mean paired ΔTTD
     averaged over every declared point, so a policy that helps at one point and hurts at another
     does not win on the strength of the first. */
  const base: Candidate = new Map([['selection.policy', 'contextual']]);
  const sampled: SelectionStageConfig[] = [];
  for (let index = 0; index < spec.budget.searchCandidates; index += 1) {
    sampled.push(
      selectionFrom(
        sampleCandidate(space, policyNoiseStream(BigInt(spec.seeds.trainingTrafficSeed) + BigInt(index) * 1_000_003n), {
          base,
        }),
        spec.action.parameterIds,
      ),
    );
  }

  const trainingSums = new Array<number>(sampled.length).fill(0);
  for (const [index, cell] of cells.entries()) {
    const census = censuses[index] as SelectionCensus;
    const arms: DispatcherArmSpec[] = [
      Object.freeze({ id: 'reference', profile: census.referenceProfileId }),
      ...sampled.map((selection, candidate) =>
        selectorArm(`candidate-${String(candidate)}`, census.referenceProfileId, selection, library),
      ),
    ];
    const experiment = await runGateExperiment({
      id: `teaching/train/${cell.id}`,
      seed: spec.seeds.runSeed,
      trafficSeed: spec.seeds.trainingTrafficSeed,
      building: cell.building,
      dispatchers: arms,
      traffic: cell.point,
      replications: spec.budget.searchReplications,
      resources: input.resources,
    });
    const reference = samplesOf(experiment, 'reference', spec.objective.gate);
    sampled.forEach((_, candidate) => {
      const values = samplesOf(experiment, `candidate-${String(candidate)}`, spec.objective.gate);
      let sum = 0;
      for (let i = 0; i < values.length; i += 1) sum += (values[i] as number) - (reference[i] as number);
      trainingSums[candidate] =
        (trainingSums[candidate] as number) + (values.length === 0 ? Number.NaN : sum / values.length);
    });
  }

  const candidates: TaughtCandidate[] = sampled.map((selection, index) =>
    Object.freeze({
      index,
      selection,
      trainingMeanDeltaS: (trainingSums[index] as number) / cells.length,
    }),
  );
  // Lowest mean wins; ties break by index, so the winner is a function of the seeds and the schema
  // and of nothing else (invariant 4).
  let winner = candidates[0] as TaughtCandidate;
  for (const candidate of candidates) {
    if (candidate.trainingMeanDeltaS < winner.trainingMeanDeltaS) winner = candidate;
  }
  const policy: TaughtPolicy = Object.freeze({
    trainingTrafficSeed: spec.seeds.trainingTrafficSeed,
    dimensions: space.ids,
    candidates: Object.freeze(candidates),
    winner,
    replicationsPerPoint: spec.budget.searchReplications,
  });

  /* Step 3 — the verdict, on the **held-out** traffic, with the run seed unchanged. */
  const results: TeachingCellResult[] = [];
  for (const [index, cell] of cells.entries()) {
    const census = censuses[index] as SelectionCensus;
    const resolution = resolutions[index] as CellResolution;
    const armSpecs: DispatcherArmSpec[] = [
      Object.freeze({ id: 'reference', profile: census.referenceProfileId }),
      selectorArm('fuzzy', census.referenceProfileId, { policy: 'fuzzy' }, library),
      selectorArm('taught', census.referenceProfileId, winner.selection, library),
    ];
    const experiment = await runGateExperiment({
      id: `teaching/verdict/${cell.id}`,
      seed: spec.seeds.runSeed,
      trafficSeed: spec.seeds.holdoutTrafficSeed,
      building: cell.building,
      dispatchers: armSpecs,
      traffic: cell.point,
      replications: spec.budget.verdictReplications,
      resources: input.resources,
    });

    const armIds = armSpecs.map((arm) => arm.id as string);
    const unquotable = armIds.filter((armId) => !cellOf(experiment, armId).aggregate.awtIsValid);
    const quotable = unquotable.length === 0;
    const referenceDigests = digestsOf(experiment, 'reference');
    const crnAligned = armIds.every((armId) => {
      const digests = digestsOf(experiment, armId);
      return digests.length === referenceDigests.length && digests.every((d, i) => d === referenceDigests[i]);
    });

    const comparisonOf = (armId: string, metric: typeof spec.objective.gate): CellComparison =>
      compareCell({
        metric,
        armId,
        baselineId: 'reference',
        candidate: samplesOf(experiment, armId, metric),
        baseline: samplesOf(experiment, 'reference', metric),
        quotable,
        ...(census.ceiling === undefined ? {} : { admissibleReplications: census.ceiling }),
      });

    const gate = comparisonOf('taught', spec.objective.gate);
    const costs = spec.objective.costs.map((metric) => comparisonOf('taught', metric));

    let identical = 0;
    for (let replication = 0; replication < spec.budget.verdictReplications; replication += 1) {
      const same = SELECTION_METRICS.every((metric) => {
        const a = samplesOf(experiment, 'taught', metric)[replication];
        const b = samplesOf(experiment, 'reference', metric)[replication];
        return a !== undefined && b !== undefined && a === b;
      });
      if (same) identical += 1;
    }

    // A policy that never left the reference's own weights *is* the reference arm, and the pair is
    // a near-neighbour pair. One that switched is a structurally different dispatcher for part of
    // the run. Derived from the measurement, never assumed from the configuration.
    const structural = identical < spec.budget.verdictReplications;
    const limit = structural ? resolution.structuralS : resolution.nearNeighbourS;
    const belowResolutionLimit = Math.abs(gate.estimate.mean) < limit;
    const generalizes = winner.trainingMeanDeltaS < 0 && gate.estimate.mean < 0;

    results.push(
      Object.freeze({
        cellId: cell.id,
        building: cell.building,
        point: cell.point.id,
        census,
        referenceProfileId: census.referenceProfileId,
        resolution,
        gate,
        costs: Object.freeze(costs),
        fuzzyGate: comparisonOf('fuzzy', spec.objective.gate),
        identicalReplications: identical,
        regime: structural ? ('structural' as const) : ('near-neighbour' as const),
        resolutionLimitS: limit,
        belowResolutionLimit,
        replications: spec.budget.verdictReplications,
        quotable,
        crnAligned,
        trainingMeanDeltaS: winner.trainingMeanDeltaS,
        generalizes,
        accepted: false,
        reason: '',
      }),
    );
  }

  /* Step 4 — Holm across the declared family, which is exactly the declared points. */
  const holm = holmDecisions(
    results.map((cell) => ({
      key: cell.cellId,
      pValue: pairedPValue(
        cell.gate.estimate.mean,
        cell.gate.estimate.standardError,
        cell.gate.estimate.n,
      ),
    })),
  );
  const holmByKey = new Map(holm.map((decision) => [decision.key, decision]));

  const decided: TeachingCellResult[] = results.map((cell) => {
    const decision = holmByKey.get(cell.cellId);
    const better = cell.gate.verdict === 'BETTER';
    const rejected = decision?.rejected === true;
    const accepted = better && rejected && !cell.belowResolutionLimit && cell.generalizes;
    const reason = accepted
      ? `ΔTTD ${formatInterval(cell.gate)} against "${cell.referenceProfileId}" on held-out traffic seed ${String(spec.seeds.holdoutTrafficSeed)}, n = ${String(cell.replications)}, above this cell's own ${cell.regime} limit of ${cell.resolutionLimitS.toFixed(3)} s.`
      : cell.gate.verdict === 'IDENTICAL'
        ? `the taught arm was bit-identical to the reference on ${String(cell.identicalReplications)} of ${String(cell.replications)} replications. A bit-identical result is a wiring bug until proven otherwise, never a small effect.`
        : [
            `ΔTTD ${formatInterval(cell.gate)}`,
            better ? undefined : 'the interval does not exclude zero on the better side',
            rejected ? undefined : `Holm retains it at α = ${(decision?.alpha ?? Number.NaN).toFixed(5)} (adjusted p ${(decision?.adjustedP ?? Number.NaN).toFixed(4)})`,
            cell.belowResolutionLimit
              ? `the effect is below this cell's own ${cell.regime} resolution limit of ${cell.resolutionLimitS.toFixed(3)} s, measured on ${spec.objective.gate} at the training traffic`
              : undefined,
            cell.generalizes ? undefined : 'the training and holdout signs disagree',
          ]
            .filter((clause) => clause !== undefined)
            .join('; ') + '.';
    return Object.freeze({ ...cell, accepted, reason });
  });

  const verdict = decided.length > 0 && decided.every((cell) => cell.accepted) ? 'ACCEPTED' : 'NOT ACCEPTED';
  const verdictReason =
    verdict === 'ACCEPTED'
      ? `every declared point cleared on held-out traffic seed ${String(spec.seeds.holdoutTrafficSeed)}: ${decided.map((cell) => `${cell.point} ${formatInterval(cell.gate)}`).join('; ')}.`
      : `refused at ${String(decided.filter((cell) => !cell.accepted).length)} of ${String(decided.length)} declared points on held-out traffic seed ${String(spec.seeds.holdoutTrafficSeed)}. ${decided
          .filter((cell) => !cell.accepted)
          .map((cell) => `${cell.point}: ${cell.reason}`)
          .join(' ')}`;

  return Object.freeze({
    spec,
    seedSets,
    observationsMatchDetector: matches,
    declaredObservations: spec.observations,
    detectorInputs,
    observationWindowS,
    policy,
    cells: Object.freeze(decided),
    holm,
    verdict,
    verdictReason,
    measuredOn: 'held-out traffic' as const,
  });
}

/* -------------------------------------------------------------------------- *
 * Rule 2, checked against the mechanism rather than against the vocabulary
 * -------------------------------------------------------------------------- */

function auditObservations(
  spec: TeachingSpec,
  input: TeachingRoundInput,
  library: WeightSetSource,
): { detectorInputs: readonly string[]; observationWindowS: number; matches: boolean } {
  const detectorInputs = Object.freeze([...library.patternSwitching.patternDetector.inputs].sort());
  const declared = spec.observations.map((feature) => feature.id).sort();
  /* Any shipped profile resolves the window: `selection.observationWindowS` is a declared default
     of the stage, and the search space does not carry it, so no arm in this round can move it. It
     is read rather than assumed so that the printed trailing window is the run's own number. */
  const profileId = [...input.resources.dispatcherProfilesById.keys()][0];
  const profile = profileId === undefined ? undefined : input.resources.dispatcherProfilesById.get(profileId);
  if (profile === undefined) {
    throw new TeachingError('No dispatcher profiles are loaded, so no detector can be resolved.');
  }
  const resolved = resolveDispatchConfig(profile, {
    selection: { policy: 'contextual' },
    weightSets: library,
  });
  return {
    detectorInputs,
    observationWindowS: resolved.selection.observationWindowS,
    matches:
      declared.length === detectorInputs.length &&
      declared.every((id, index) => id === detectorInputs[index]),
  };
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function formatInterval(cell: CellComparison): string {
  const sign = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  const { mean, lower, upper } = cell.estimate;
  return `${sign(mean)} [${sign(lower)}, ${sign(upper)}] ${cell.verdict}`;
}

/** The whole round as a table, for a reader reproducing a quoted figure. */
export function formatTeachingRound(round: TeachingRound): string {
  const { spec } = round;
  const lines: string[] = [
    `Teaching round "${spec.id}" — docs/14 § 4.2, judged on ${round.measuredOn}`,
    '',
    `building         ${spec.building}`,
    `points           ${spec.traffic.map((point) => point.id).join(', ')}`,
    `observations     ${round.declaredObservations.map((feature) => `${feature.id} (${feature.causality})`).join(', ')}`,
    `                 detector reads ${round.detectorInputs.join(', ')} over a ${round.observationWindowS.toFixed(0)} s trailing window — declared set matches: ${String(round.observationsMatchDetector)}`,
    `action space     ${round.policy.dimensions.join(', ')}`,
    `objective        gate ${spec.objective.gate} (${spec.objective.direction}); costs beside, never folded in: ${spec.objective.costs.join(', ')}`,
    `run seed         ${String(spec.seeds.runSeed)} — held across training and holdout, so only the crowd moves`,
    `traffic seeds    training ${String(spec.seeds.trainingTrafficSeed)}, holdout ${String(spec.seeds.holdoutTrafficSeed)} — realized sets disjoint: ${String(round.seedSets.disjoint)}`,
    `budget           census ${String(spec.budget.censusReplications)}, resolution ${String(spec.budget.resolutionReplications)}, search ${String(spec.budget.searchCandidates)} × ${String(spec.budget.searchReplications)}, verdict ${String(spec.budget.verdictReplications)}`,
    '',
  ];
  for (const cell of round.cells) {
    lines.push(`${cell.point} — reference "${cell.referenceProfileId}" (census of ${String(cell.census.rows.length)} shipped profiles, before any policy existed)`);
    lines.push(`  resolution   near-neighbour ${cell.resolution.nearNeighbourS.toFixed(3)} s, structural ${cell.resolution.structuralS.toFixed(3)} s — ${cell.resolution.provenance}`);
    lines.push(`  training     ΔTTD ${cell.trainingMeanDeltaS >= 0 ? '+' : ''}${cell.trainingMeanDeltaS.toFixed(3)} s — a bare mean, no interval, not a result`);
    lines.push(`  HELD-OUT     ΔTTD ${formatInterval(cell.gate)}   regime ${cell.regime} (limit ${cell.resolutionLimitS.toFixed(3)} s), below limit: ${String(cell.belowResolutionLimit)}`);
    for (const cost of cell.costs) lines.push(`    ${cost.metric.padEnd(22)} ${formatInterval(cost)}`);
    lines.push(`  fuzzy arm    ΔTTD ${formatInterval(cell.fuzzyGate)} — Phase 7's authored detector, measured beside and NOT the gate`);
    lines.push(`  identical ${String(cell.identicalReplications)}/${String(cell.replications)}  CRN aligned ${String(cell.crnAligned)}  quotable ${String(cell.quotable)}  generalizes ${String(cell.generalizes)}`);
    lines.push(`  ${cell.accepted ? 'ACCEPTED' : 'NOT ACCEPTED'}: ${cell.reason}`);
    lines.push('');
  }
  lines.push('Holm–Bonferroni over the declared family (exactly the declared points):');
  for (const decision of round.holm) {
    lines.push(
      `  ${decision.key.padEnd(40)} p ${decision.pValue.toFixed(5)}  α ${decision.alpha.toFixed(5)}  adj-p ${decision.adjustedP.toFixed(4)}  ${decision.rejected ? 'REJECT' : 'retain'}`,
    );
  }
  lines.push('', `VERDICT: ${round.verdict}`, `  ${round.verdictReason}`);
  return lines.join('\n');
}
