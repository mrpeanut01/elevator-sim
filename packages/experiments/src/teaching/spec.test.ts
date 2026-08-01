/**
 * **Every clause of docs/14 § 4.2 is a refusal, and this file is where each one is watched.**
 *
 * A teaching spec that is wrong in any of these ways runs perfectly well and trains a policy
 * nobody declared — which is why each clause throws by name rather than warning. The four rules
 * § 4.2 states are checked here in the order it states them, and the fifth block is the one the
 * document does not state but § 4.3 requires: the surface must be unable to *ask* for a verdict on
 * the traffic the policy trained on.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SELECTOR_INPUTS } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { searchSpace } from '../tuning/space/collect.js';

import {
  ACTION_PARAMETER_PREFIX,
  MAX_VERDICT_REPLICATIONS,
  MIN_VERDICT_REPLICATIONS,
  OBSERVATION_CAUSALITIES,
  TeachingError,
  parseTeachingSpec,
  teachingSeedSets,
  type TeachingSpec,
} from './spec.js';

const SPACE = searchSpace();

const POINT = Object.freeze({
  id: 'interfloor-mix-1.5pct',
  durationS: 1800,
  reportWindow: 'full-run' as const,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    entranceWeights: Object.freeze({ G: 1 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

function baseSpec(): TeachingSpec {
  return {
    id: 'teach-midtown',
    building: 'midtown-office',
    traffic: [POINT],
    observations: SELECTOR_INPUTS.map((id) => ({ id, causality: 'trailing-window' as const })),
    action: {
      kind: 'weight-set-selection',
      parameterIds: [
        'selection.lobbyArrivalRateGain',
        'selection.interfloorRateGain',
        'selection.downPeakRateGain',
        'selection.switchMargin',
      ],
    },
    objective: {
      gate: 'ttdMeanS',
      direction: 'lower-is-better',
      costs: ['awtS', 'wt95S', 'energyKJ', 'energyPerServedLegKJ'],
      referenceArm: 'census',
    },
    budget: {
      censusReplications: 200,
      searchCandidates: 64,
      searchReplications: 40,
      resolutionReplications: 200,
      verdictReplications: 200,
    },
    seeds: { runSeed: 20260726, trainingTrafficSeed: 900_001, holdoutTrafficSeed: 900_002 },
  };
}

const parse = (patch: Partial<TeachingSpec>): TeachingSpec =>
  parseTeachingSpec({ ...baseSpec(), ...patch }, SPACE);

describe('the shipped shape parses', () => {
  it('accepts the spec every clause below is a mutation of', () => {
    expect(parse({}).id).toBe('teach-midtown');
  });
});

describe('rule 2 — the observation set is declared, and its causality asserted', () => {
  it('refuses a feature no observation supplies, naming the ones that do', () => {
    expect(() =>
      parse({ observations: [{ id: 'timeOfDay' as never, causality: 'trailing-window' }] }),
    ).toThrow(/timeOfDay.*Implemented: lobbyArrivalRate, interfloorRate, downPeakRate/s);
  });

  it('refuses a causality outside the declared vocabulary', () => {
    expect(() =>
      parse({ observations: [{ id: 'lobbyArrivalRate', causality: 'oracle' as never }] }),
    ).toThrow(/oracle/);
    /* The vocabulary has one member today, and the message names it rather than saying "invalid",
       so a future second value is a value here and a message that already reads correctly. */
    expect(OBSERVATION_CAUSALITIES).toEqual(['trailing-window']);
  });

  it('refuses an empty set and a duplicated feature', () => {
    expect(() => parse({ observations: [] })).toThrow(TeachingError);
    expect(() =>
      parse({
        observations: [
          { id: 'lobbyArrivalRate', causality: 'trailing-window' },
          { id: 'lobbyArrivalRate', causality: 'trailing-window' },
        ],
      }),
    ).toThrow(/twice/);
  });
});

describe('rule 4 — the action space is schema-declared, and it is the selection stage', () => {
  it('refuses a parameter outside the selection section, however well declared it is', () => {
    /* `idle.repositionThresholdS` is a real, schema-declared, searchable dimension — the one whose
       answer is known. It is refused here anyway: teaching outputs a choice among authored weight
       vectors, and a parameter outside the stage changes the dispatcher rather than choosing one. */
    expect(SPACE.ids).toContain('idle.repositionThresholdS');
    expect(() =>
      parse({ action: { kind: 'weight-set-selection', parameterIds: ['idle.repositionThresholdS'] } }),
    ).toThrow(new RegExp(`outside the "${ACTION_PARAMETER_PREFIX}" section`));
  });

  it('refuses a parameter the declared search space does not carry', () => {
    expect(() =>
      parse({ action: { kind: 'weight-set-selection', parameterIds: ['selection.invented'] } }),
    ).toThrow(/declared search space does not contain/);
  });

  it('refuses an empty action space and a duplicated parameter', () => {
    expect(() => parse({ action: { kind: 'weight-set-selection', parameterIds: [] } })).toThrow(
      /nothing to learn/,
    );
    expect(() =>
      parse({
        action: {
          kind: 'weight-set-selection',
          parameterIds: ['selection.switchMargin', 'selection.switchMargin'],
        },
      }),
    ).toThrow(/twice/);
  });
});

describe('the objective keeps the gate and the costs apart', () => {
  it('refuses a cost that is also the gate', () => {
    expect(() =>
      parse({
        objective: { ...baseSpec().objective, costs: ['ttdMeanS', 'awtS'] },
      }),
    ).toThrow(/scalarization wearing two names/);
  });

  it('refuses a reference arm that is not the point’s own census', () => {
    expect(() =>
      parse({ objective: { ...baseSpec().objective, referenceArm: 'nearest-car' as never } }),
    ).toThrow(/only admissible value is "census"/);
  });

  it('refuses a gate that is not a replication metric', () => {
    expect(() => parse({ objective: { ...baseSpec().objective, gate: 'vibes' as never } })).toThrow(
      TeachingError,
    );
  });
});

describe('rule 3 — the acceptance bar, including the floor the study clamp does not have', () => {
  it.each([
    ['below the floor', MIN_VERDICT_REPLICATIONS - 1],
    ['above the ceiling', MAX_VERDICT_REPLICATIONS + 1],
  ])('refuses a verdict budget %s', (_label, verdictReplications) => {
    expect(() => parse({ budget: { ...baseSpec().budget, verdictReplications } })).toThrow(
      /outside CLAUDE\.md's 50–200 band/,
    );
  });

  it('accepts both ends of the band, which is what makes the refusal a band and not a preference', () => {
    for (const verdictReplications of [MIN_VERDICT_REPLICATIONS, MAX_VERDICT_REPLICATIONS]) {
      expect(parse({ budget: { ...baseSpec().budget, verdictReplications } }).budget.verdictReplications).toBe(
        verdictReplications,
      );
    }
  });

  it('refuses a non-positive budget anywhere', () => {
    expect(() => parse({ budget: { ...baseSpec().budget, searchCandidates: 0 } })).toThrow(
      /searchCandidates/,
    );
  });
});

describe('rule 1 — held-out traffic is disjoint by construction', () => {
  it('refuses the same traffic seed for training and for holdout', () => {
    expect(() =>
      parse({ seeds: { runSeed: 20260726, trainingTrafficSeed: 7, holdoutTrafficSeed: 7 } }),
    ).toThrow(/holdout" would be the training set under a second name/);
  });

  it('realizes both sets through the runner’s own derivation and measures their disjointness', () => {
    const sets = teachingSeedSets(baseSpec());
    expect(sets.training).toHaveLength(200);
    expect(sets.holdout).toHaveLength(200);
    expect(sets.disjoint).toBe(true);
    expect(sets.runSeedHeld).toBe(true);
    /* Measured over the realized values, not inferred from the two declared integers: the claim a
       reader cares about is that no crowd the policy was fitted on reappears in the judging set. */
    const training = new Set(sets.training.map(String));
    expect(sets.holdout.filter((seed) => training.has(seed.toString()))).toEqual([]);
  });
});

describe('the traffic templates trained against', () => {
  it('refuses a spec with no traffic, naming what § D156 measured', () => {
    expect(() => parse({ traffic: [] })).toThrow(/nothing to discriminate on/);
  });

  it('refuses a duplicated point, because a Holm family cannot tell two of one id apart', () => {
    expect(() => parse({ traffic: [POINT, POINT] })).toThrow(/twice/);
  });
});

describe('the pre-registered Phase 6c spec is still the spec that was pre-registered', () => {
  /**
   * `phase6c-midtown.teaching.json` is a **pre-registration**, and this suite is its guard in the
   * sense § D151's frozen `PRIMARY_CELLS` array is guarded: the point of the file is that it was
   * fixed before any ΔTTD from it existed, so what has to be asserted is that the numbers a verdict
   * was measured under have not since been edited to suit it.
   *
   * A test is not a caller and this file makes no claim that it is. A pre-registration is not a
   * behaviour that needs a shipped path — its consumer is a reader, and `elevator-sim tune
   * --teaching <this file>` is how it is re-run.
   */
  const preRegistered = JSON.parse(
    readFileSync(fileURLToPath(new URL('./phase6c-midtown.teaching.json', import.meta.url)), 'utf8'),
  ) as TeachingSpec;

  it('parses under the same rules every other spec does', () => {
    expect(parseTeachingSpec(preRegistered, SPACE).id).toBe('phase6c-midtown-teaching');
  });

  it('still declares the budget, the family and the two seeds it was registered with', () => {
    expect(preRegistered.budget.verdictReplications).toBe(200);
    expect(preRegistered.budget.censusReplications).toBe(200);
    expect(preRegistered.budget.searchCandidates).toBe(64);
    /* The declared Holm family: exactly these two cells, in this order, and never pooled with
       § D151's PRIMARY or SECONDARY arrays — § D151 § 3 forbids enlarging either. */
    expect(preRegistered.traffic.map((point) => point.id)).toEqual([
      'interfloor-mix-1.5pct',
      'lunch-two-way-1.5pct',
    ]);
    expect(preRegistered.seeds).toEqual({
      runSeed: 20260726,
      trainingTrafficSeed: 20260726,
      holdoutTrafficSeed: 20261537,
    });
  });

  it('declares the day-to-day demand variation that is the reason to teach now', () => {
    /* § D156's diagnosis: the policy learned a busy/idle schedule because the shipped template
       varied the level and never the split. Both cells now vary the level between runs; the second
       varies the mix within a run as well. Asserted so a later edit that quietly drops it is a red
       test rather than a verdict about a condition that was not present. */
    for (const point of preRegistered.traffic) {
      expect(point.demand?.dayVariation).toEqual({ minDemandFactor: 0.85, maxDemandFactor: 1.15 });
    }
    expect(preRegistered.traffic[1]?.demandTemplate).toBe('lunch-two-way');
  });
});

describe('§ 4.3 — the surface cannot ask for a verdict on the traffic it trained on', () => {
  it('carries no field that names a training-set interval, verdict or p-value', () => {
    const spec = parse({});
    const keys = [
      ...Object.keys(spec),
      ...Object.keys(spec.objective),
      ...Object.keys(spec.budget),
      ...Object.keys(spec.seeds),
    ];
    for (const key of keys) {
      expect(key).not.toMatch(/training.*(interval|verdict|pValue|significance|accept)/i);
    }
    /* And the only budget that names a paired `n` is the verdict one, which the round spends on
       the holdout traffic. `searchReplications` is what a candidate is *ranked* on and never what
       an interval is taken over. */
    expect(Object.keys(spec.budget).filter((key) => /verdict/i.test(key))).toEqual([
      'verdictReplications',
    ]);
  });
});
