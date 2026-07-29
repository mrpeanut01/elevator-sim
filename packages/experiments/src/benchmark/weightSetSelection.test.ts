/**
 * **Phase 6c and Phase 7's fuzzy detector, asserted.**
 *
 * Two things are checked here and they are different in kind, which is why the file is split:
 *
 * 1. **The mechanism is live** — the selector changes *car trajectories*, and two configurations
 *    differing only in `weightSetsByPattern` produce different ones. Asserted on the sequence of
 *    car moves rather than on a mean, because `core/src/sim/seam.test.ts` records why: a mean is
 *    precisely the statistic that hides a structural difference.
 * 2. **The verdict is what the run says it is** — the gate, the costs beside it, the resolution
 *    regime, and Phase 6c's acceptance verdict, which § D126 explicitly permits to be
 *    *implemented, measured, and not accepted*. Nothing here asserts that the selector is *good*;
 *    it asserts that the study reports what it measured.
 *
 * The study runs once and every assertion reads it. Roughly a minute: a 200-replication census
 * over twelve profiles, a 64-candidate search at 40 replications, and a 200-replication verdict.
 */

import { describe, expect, it } from 'vitest';

import { checkPinned, describeMismatches, weightSetSelectionFigures } from './published.js';
import {
  CENSUS_REPLICATIONS,
  LEARNED_PARAMETER_IDS,
  SEARCH_CANDIDATES,
  SELECTION_BUILDING,
  SELECTION_COSTS,
  SELECTION_GATE,
  STRUCTURAL_RESOLUTION_S,
  VERDICT_REPLICATIONS,
  learnedSubspace,
  measureWeightSetSelectionLiveness,
  runDeadbandKnownAnswer,
  runWeightSetSelectionStudy,
  weightSetLibrary,
  type SelectionStudy,
  type WeightSetLivenessResult,
} from './weightSetSelection.js';
import { loadResources } from '../validation/harness.js';

const TIMEOUT_MS = 600_000;

let cachedStudy: Promise<SelectionStudy> | undefined;
const study = async (): Promise<SelectionStudy> => {
  cachedStudy ??= runWeightSetSelectionStudy();
  return await cachedStudy;
};

let cachedLiveness: Promise<WeightSetLivenessResult> | undefined;
const liveness = async (): Promise<WeightSetLivenessResult> => {
  cachedLiveness ??= measureWeightSetSelectionLiveness();
  return await cachedLiveness;
};

/* -------------------------------------------------------------------------- *
 * The mechanism is live
 * -------------------------------------------------------------------------- */

describe('the weight-set selector is live in a real run, measured on trajectories', () => {
  it('produces different car trajectories from a map that differs in nothing else', async () => {
    // Review finding #5's prescription, and the whole reason this lane exists: before it,
    // `patternSwitching` was authored, schema-validated, typed on the core barrel, cross-checked
    // for dangling names — and read by nothing, so editing `weightSetsByPattern` produced a clean
    // `loadConfig` and zero behavioural change.
    const result = await liveness();
    expect(result.weightSetContrast.identical).toBe(false);
    expect(result.weightSetContrast.firstDivergence).toBeTypeOf('number');
    // And the two maps really are a permutation of one another: the same set of shipped weight
    // vectors, differently assigned. A contrast against an arbitrary map would confound "the
    // selector reads the map" with "one of these arms is a different dispatcher".
    expect([...Object.values(result.permutedMap)].sort()).toStrictEqual(
      [...Object.values(result.shippedMap)].sort(),
    );
    expect(result.permutedMap).not.toStrictEqual(result.shippedMap);
  }, TIMEOUT_MS);

  it('enters more than one pattern and switches more than once', async () => {
    // A detector that never leaves its first regime is a constant with a fuzzy membership
    // function in front of it.
    const result = await liveness();
    expect(new Set(result.patternsVisited).size).toBeGreaterThan(1);
    expect(result.switches).toBeGreaterThan(1);
  }, TIMEOUT_MS);

  it('is byte-identical to the profile run without it when it is switched off', async () => {
    // `selection.policy: 'off'` is the default and every shipped profile's state, so this is the
    // property that keeps every published figure in the repository valid. Structural rather than
    // tolerant: the policy hands the scorer `config.weights`, the same frozen Map object, and
    // never constructs an arrival window at all.
    const result = await liveness();
    expect(result.offIsIdentical).toBe(true);
  }, TIMEOUT_MS);

  it('names energy-aware for the idle regime, and no pattern selects an unauthored profile', async () => {
    // The dangling name, resolved. `weightSetsByPattern.idle` named `energy-saver`, which was
    // never authored; `resolveWeightSets` now throws on a dangling name, so a shipped file that
    // still carried one could not build a selector at all — which is what this assertion is
    // really checking, one level below the string.
    const library = weightSetLibrary(await loadResources());
    for (const [pattern, profileId] of Object.entries(
      library.patternSwitching.weightSetsByPattern,
    )) {
      expect(library.weightsByProfileId.has(profileId), `${pattern} → ${profileId}`).toBe(true);
    }
    expect(library.patternSwitching.weightSetsByPattern['idle']).toBe('energy-aware');
  });

  it('declares only inputs an observation can supply — timeOfDay is gone, not faked', async () => {
    // `core/` has no wall clock (invariant 3) and the kernel's time is seconds since the run
    // started, so a `timeOfDay` derived from it is a constant near zero wearing a feature's name.
    const library = weightSetLibrary(await loadResources());
    expect([...library.patternSwitching.patternDetector.inputs]).toStrictEqual([
      'lobbyArrivalRate',
      'interfloorRate',
      'downPeakRate',
    ]);
  });

  it('authors a membership clause for every declared pattern', async () => {
    const library = weightSetLibrary(await loadResources());
    const membership = library.patternSwitching.patternDetector.membership ?? {};
    for (const pattern of library.patternSwitching.patternDetector.patterns) {
      expect(Object.keys(membership[pattern] ?? {}).length, pattern).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Invariant 8 — the learned policy is a declarable tunable
 * -------------------------------------------------------------------------- */

describe('the learned policy is four declared dimensions, not a tensor', () => {
  it('finds all four in the space the generic optimizer collects', () => {
    // § D28's second objection to Phase 6c was that *a 400-parameter policy vector is not
    // obviously a declarable tunable*. This is the answer, and it is mechanical: the dimensions
    // come out of `collectSearchSpace()`, which derives the space from `core`'s own `_PARAMETERS`
    // exports and admits a dimension only if a dispatcher profile can hold it.
    const space = learnedSubspace();
    expect([...space.ids]).toStrictEqual([...LEARNED_PARAMETER_IDS]);
    expect(space.ids.length).toBe(4);
    for (const id of space.ids) {
      const parameter = space.byId.get(id);
      expect(parameter?.type, id).toBe('continuous');
      // Every one is gated, so a search that has not turned the selector on does not spend a
      // replication budget on a dimension that cannot move the objective.
      expect(parameter?.activeWhen?.['selection.policy'], id).toStrictEqual(['contextual']);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The known answer
 * -------------------------------------------------------------------------- */

describe('the 2 s deadband — the known answer the policy cannot see', () => {
  it('rediscovers the interior optimum from the shipped 8 s, blind', async () => {
    // `docs/07` § 5: the shipped profile carries **8 s**, the interior optimum is **2 s**, and the
    // wrong value is left shipped on purpose. § D126: *one that returns 8 s has failed, not
    // agreed*. This runs the same search that fitted Phase 6c's policy, on a different dimension,
    // a different building and a different metric, and nothing in it knows what a deadband is.
    const answer = await runDeadbandKnownAnswer();
    expect(answer.winnerThresholdS).toBeLessThan(answer.shippedThresholdS);
    expect(answer.rediscovered, `winner ${answer.winnerThresholdS} s`).toBe(true);
    expect(answer.winnerMeanDeltaAwtS).toBeLessThan(0);
  }, TIMEOUT_MS);

  it('reports an under-sampled search as under-sampled rather than as agreement', async () => {
    // At 32 draws over the declared `[0, 60]` only about three land below the shipped 8 s and the
    // search returns ~4.9 s. That is **not** the failure § D126 names — it is not 8 s, and the
    // sub-8 draws reproduce the published sweep's direction — but it is not the known answer
    // either, and it is what calibrated `SEARCH_CANDIDATES` to 64. Asserted so the calibration
    // cannot quietly stop being true.
    const thin = await runDeadbandKnownAnswer({ candidates: 32 });
    expect(thin.rediscovered).toBe(false);
    expect(thin.winnerThresholdS).toBeLessThan(thin.shippedThresholdS);
    expect(SEARCH_CANDIDATES).toBeGreaterThanOrEqual(64);
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * The verdict
 * -------------------------------------------------------------------------- */

describe('Phase 6c, measured against the criterion written before it', () => {
  it('gates on TTD and publishes AWT, WT95 and the energy proxy beside it', async () => {
    const result = await study();
    expect(result.gateMetric).toBe(SELECTION_GATE);
    for (const arm of result.arms) {
      expect(arm.gate.metric).toBe('ttdMeanS');
      expect(arm.costs.map((cost) => cost.metric)).toStrictEqual([...SELECTION_COSTS]);
    }
  }, TIMEOUT_MS);

  it('takes its reference arm from this cell’s own census, and it is not nearest-car', async () => {
    // `docs/07` § 4: `nearest-car` is the only profile that saturates and a poor reference arm.
    // Here it is not merely poor, it is 41 s of TTD behind — which is why beating it is not a
    // result and why the census picks the best rather than the named one.
    const result = await study();
    expect(result.census.referenceProfileId).not.toBe('nearest-car');
    expect(result.census.replications).toBe(CENSUS_REPLICATIONS);
    const reference = result.census.rows.find(
      (row) => row.profileId === result.census.referenceProfileId,
    );
    for (const row of result.census.rows) {
      if (!row.quotable) continue;
      expect(row.meanTtdS, row.profileId).toBeGreaterThanOrEqual(reference?.meanTtdS ?? 0);
    }
  }, TIMEOUT_MS);

  it('budgets inside the 50–200 band and never above its own census ceiling', async () => {
    const result = await study();
    expect(result.replications).toBeLessThanOrEqual(VERDICT_REPLICATIONS);
    expect(result.replications).toBeGreaterThanOrEqual(50);
    if (result.census.ceiling !== undefined) {
      expect(result.replications).toBeLessThanOrEqual(result.census.ceiling);
    }
  }, TIMEOUT_MS);

  it('measures the verdict on seeds the search never saw, and prints both', async () => {
    const result = await study();
    expect(result.seedsDisjoint).toBe(true);
    expect(result.holdoutSeed).not.toBe(result.seed);
    expect(result.learned.tuningSeed).toBe(result.seed);
  }, TIMEOUT_MS);

  it('pairs every arm against the same passenger traces', async () => {
    const result = await study();
    expect(result.crnAligned).toBe(true);
    expect(result.quotable).toBe(true);
    expect(result.unquotableArms).toStrictEqual([]);
  }, TIMEOUT_MS);

  it('does not report a bit-identical arm as a small effect', async () => {
    // § D126: an interval of exactly `[0, 0]` with ρ = 1 is a wiring bug until proven otherwise.
    // Both arms differ from the reference on most replications, so neither is in that state — and
    // the count is published either way so a reader does not have to take the interval's word.
    const result = await study();
    for (const arm of result.arms) {
      expect(arm.identicalReplications, arm.armId).toBeLessThan(result.replications);
      expect(arm.gate.verdict, arm.armId).not.toBe('IDENTICAL');
    }
  }, TIMEOUT_MS);

  it('states which resolution regime each pair is in, and reports below-limit as below-limit', async () => {
    const result = await study();
    for (const arm of result.arms) {
      // Both arms switched weight sets on most replications, so both are structurally different
      // dispatchers for part of the run and the coarser of `docs/07` § 4's two limits applies.
      expect(arm.regime, arm.armId).toBe('structural');
      expect(arm.resolutionLimitS).toBe(STRUCTURAL_RESOLUTION_S);
      expect(arm.belowResolutionLimit).toBe(Math.abs(arm.gate.estimate.mean) < STRUCTURAL_RESOLUTION_S);
    }
  }, TIMEOUT_MS);

  it('reports the verdict the measurement produces, whichever way it goes', async () => {
    // **The result, and this assertion is deliberately the shape it is.** § D126 permits
    // *implemented, measured, and not accepted*, and that is what the run says: the learned
    // selector's ΔTTD interval contains zero, and the effect is an order of magnitude below the
    // point's structural resolution limit. Written as a biconditional against the arm's own cells
    // rather than as a hard-coded verdict string, so a future run that *does* clear the gate turns
    // this green rather than red — a test that asserted `NOT ACCEPTED` would have to be edited to
    // let the phase pass, which is the wrong way round.
    const result = await study();
    const learned = result.arms.find((arm) => arm.armId === 'learned');
    expect(learned).toBeDefined();
    const shouldAccept =
      learned?.gate.verdict === 'BETTER' && learned.belowResolutionLimit === false;
    expect(result.verdict).toBe(shouldAccept ? 'ACCEPTED' : 'NOT ACCEPTED');
    expect(result.verdictReason.length).toBeGreaterThan(40);
  }, TIMEOUT_MS);

  it('runs on the building and at the point its docstring names', async () => {
    const result = await study();
    expect(result.building).toBe(SELECTION_BUILDING);
    expect(result.learned.dimensions.length).toBe(4);
    expect(result.learned.candidates.length).toBe(SEARCH_CANDIDATES);
  }, TIMEOUT_MS);

  it('still reproduces its published figures', async () => {
    const mismatches = checkPinned('weight-set-selection', weightSetSelectionFigures(await study()));
    expect(mismatches.length, describeMismatches('weight-set-selection', mismatches)).toBe(0);
  }, TIMEOUT_MS);
});
