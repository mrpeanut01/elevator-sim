/**
 * `formula.ts` — a profile's own priorities, as expression trees over the term library.
 *
 * Four things are held here: what `resolveFormulas` refuses, what a tree evaluates to, that the
 * scorer charges it once at its weight under the same refusals as a library term, and — on the
 * legs, § D177 — that a weighted formula changes a run and an unweighted one does not.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { dispatcherProfileSchema } from '../config/schema.js';
import type { LoadedConfig } from '../config/types.js';
import { load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';
import type { SimulationResult } from '../sim/types.js';

import {
  MAX_FORMULAS,
  MAX_FORMULA_DEPTH,
  MAX_FORMULA_NODES,
  NO_FORMULAS,
  evaluateFormula,
  resolveFormulas,
  type FormulaNode,
  type FormulaSource,
} from './formula.js';
import { resolveNormalization, normalizeTerm } from './normalize.js';
import { resolveDispatchConfig } from './policy.js';
import { scoreCar } from './scoringEngine.js';
import { COST_TERMS_BY_ID } from './terms/index.js';
import { call, contextFor, makeCar, tamperProof } from './terms/fixtures.test-helper.js';

const WORST_OF: FormulaNode = { op: 'max', of: [{ term: 'waitTime' }, { term: 'distanceTravelled' }] };

const formula = (patch: Partial<FormulaSource> = {}): FormulaSource => ({
  id: 'worst-of',
  name: 'Whichever is worse',
  weight: 1,
  expression: WORST_OF,
  ...patch,
});

describe('resolveFormulas refuses what it cannot evaluate honestly', () => {
  it('hands back the one empty list for a profile with none, so nothing is allocated', () => {
    expect(resolveFormulas(undefined, 'p')).toBe(NO_FORMULAS);
    expect(resolveFormulas([], 'p')).toBe(NO_FORMULAS);
  });

  it('keeps a good formula, with the terms it reads listed once each', () => {
    const [resolved] = resolveFormulas(
      [formula({ expression: { op: 'add', of: [WORST_OF, { term: 'waitTime' }, { value: 0.5 }] } })],
      'p',
    );
    expect(resolved?.termIds).toEqual(['waitTime', 'distanceTravelled']);
    expect(resolved?.name).toBe('Whichever is worse');
  });

  it.each([
    ['a misspelled term', { term: 'waitTiem' }, /does not declare/],
    ['a negative constant', { op: 'add', of: [{ term: 'waitTime' }, { value: -1 }] }, /finite number from 0/],
    ['a non-finite constant', { op: 'add', of: [{ term: 'waitTime' }, { value: Number.NaN }] }, /finite number from 0/],
    ['subtraction', { op: 'subtract', of: [{ term: 'waitTime' }, { value: 1 }] }, /Subtraction and division are absent/],
    ['an operation on one thing', { op: 'max', of: [{ term: 'waitTime' }] }, /fewer than two/],
    ['a node of two shapes', { term: 'waitTime', value: 1 }, /exactly one of/],
    ['a node of no shape', {}, /exactly one of/],
    ['something that is not a node', 7, /not a term, a value or an operation/],
    ['a formula that reads no term', { op: 'add', of: [{ value: 1 }, { value: 2 }] }, /reads no term/],
  ])('refuses %s', (_label, expression, message) => {
    expect(() => resolveFormulas([formula({ expression: expression as FormulaNode })], 'p')).toThrow(message);
  });

  it('refuses a tree too deep or too large, by the bounds it declares', () => {
    let deep: FormulaNode = { term: 'waitTime' };
    for (let level = 0; level < MAX_FORMULA_DEPTH; level += 1) deep = { op: 'add', of: [deep, { value: 1 }] };
    expect(() => resolveFormulas([formula({ expression: deep })], 'p')).toThrow(/nests deeper/);

    const wide: FormulaNode = {
      op: 'add',
      of: Array.from({ length: MAX_FORMULA_NODES }, () => ({ term: 'waitTime' })),
    };
    expect(() => resolveFormulas([formula({ expression: wide })], 'p')).toThrow(/at most 15/);
  });

  it('refuses a bad weight, a repeated id, an id that is a library term, and too many formulas', () => {
    expect(() => resolveFormulas([formula({ weight: -0.1 })], 'p')).toThrow(/weight -0.1/);
    expect(() => resolveFormulas([formula({ weight: Number.POSITIVE_INFINITY })], 'p')).toThrow(/weight Infinity/);
    expect(() => resolveFormulas([formula(), formula()], 'p')).toThrow(/repeats the id/);
    expect(() => resolveFormulas([formula({ id: 'waitTime' })], 'p')).toThrow(/library term's id/);
    const many = Array.from({ length: MAX_FORMULAS + 1 }, (_, index) => formula({ id: `f${String(index)}` }));
    expect(() => resolveFormulas(many, 'p')).toThrow(/at most 4/);
  });

  it('is what resolveDispatchConfig runs, so a profile with a bad formula does not build a policy', () => {
    const profile = { id: 'p', name: 'P', weights: { waitTime: 1 } };
    expect(resolveDispatchConfig(profile).formulas).toBe(NO_FORMULAS);
    expect(resolveDispatchConfig({ ...profile, formulas: [formula()] }).formulas).toHaveLength(1);
    expect(() =>
      resolveDispatchConfig({ ...profile, formulas: [formula({ expression: { term: 'waitTiem' } })] }),
    ).toThrow(/does not declare/);
  });

  it('round-trips through the profile schema, which refuses the shapes it can see', () => {
    const authored = { id: 'p', name: 'P', weights: { waitTime: 1 }, formulas: [formula()] };
    expect(dispatcherProfileSchema.parse(authored)).toEqual(authored);
    const withExpression = (expression: unknown): unknown => ({ ...authored, formulas: [{ ...formula(), expression }] });
    expect(dispatcherProfileSchema.safeParse(withExpression({ op: 'divide', of: [{ value: 1 }, { value: 2 }] })).success).toBe(false);
    expect(dispatcherProfileSchema.safeParse(withExpression({ term: 'waitTime', extra: 1 })).success).toBe(false);
    expect(dispatcherProfileSchema.safeParse({ ...authored, formulas: [] }).success).toBe(false);
  });
});

describe('evaluateFormula is arithmetic over the values it is handed', () => {
  const values: Readonly<Record<string, number>> = { waitTime: 0.6, distanceTravelled: 0.2, loadFactor: 0.5 };
  const valueOf = (termId: string): number => values[termId] ?? 0;
  const leaf = (term: string): FormulaNode => ({ term });

  it.each([
    ['add', 0.6 + 0.2 + 0.5],
    ['multiply', 0.6 * 0.2 * 0.5],
    ['max', 0.6],
    ['min', 0.2],
  ] as const)('%s folds left over every argument', (op, expected) => {
    const node: FormulaNode = { op, of: [leaf('waitTime'), leaf('distanceTravelled'), leaf('loadFactor')] };
    expect(evaluateFormula(node, valueOf)).toBeCloseTo(expected, 12);
  });

  it('nests, and reads a constant as itself', () => {
    const node: FormulaNode = {
      op: 'add',
      of: [{ op: 'multiply', of: [leaf('waitTime'), leaf('loadFactor')] }, { value: 0.25 }],
    };
    expect(evaluateFormula(node, valueOf)).toBeCloseTo(0.6 * 0.5 + 0.25, 12);
  });
});

describe('the scorer charges a formula once, at its weight, under a term’s own refusals', () => {
  const normalization = resolveNormalization({});
  const context = (): ReturnType<typeof contextFor> => contextFor(makeCar('A', '0').snapshot(), call('8', 'up'));
  const normalizedOf = (termId: string): number => {
    const term = COST_TERMS_BY_ID.get(termId);
    if (term === undefined) throw new Error(`no term ${termId}`);
    return normalizeTerm(term, term.evaluate(context()), normalization);
  };

  it('adds weight × value after the library terms, and names its row', () => {
    const formulas = resolveFormulas([formula({ weight: 2 })], 'p');
    const weights = new Map([['waitTime', 1]]);
    const plain = scoreCar(context(), weights, normalization);
    const scored = scoreCar(context(), weights, normalization, undefined, formulas);
    const expected = Math.max(normalizedOf('waitTime'), normalizedOf('distanceTravelled'));
    expect(expected).toBeGreaterThan(0);
    expect(scored.cost).toBeCloseTo(plain.cost + 2 * expected, 12);
    expect(scored.terms.at(-1)).toEqual({
      termId: 'worst-of',
      name: 'Whichever is worse',
      weight: 2,
      raw: expected,
      normalized: expected,
      contribution: 2 * expected,
    });
  });

  it('a formula of one term at weight w is weighting that term by w', () => {
    const single = resolveFormulas([formula({ weight: 0.7, expression: { op: 'max', of: [{ term: 'waitTime' }, { value: 0 }] } })], 'p');
    const byFormula = scoreCar(context(), new Map(), normalization, undefined, single);
    const byWeight = scoreCar(context(), new Map([['waitTime', 0.7]]), normalization);
    expect(byFormula.cost).toBeCloseTo(byWeight.cost, 12);
  });

  it('skips a formula at weight zero, and without formulas scores exactly as it always did', () => {
    const weights = new Map([['waitTime', 1]]);
    const plain = scoreCar(context(), weights, normalization);
    expect(scoreCar(context(), weights, normalization, undefined, resolveFormulas([formula({ weight: 0 })], 'p'))).toEqual(plain);
    expect(scoreCar(context(), weights, normalization, undefined, NO_FORMULAS)).toEqual(plain);
  });

  it('is pure: a tamper-proofed car scores the same, twice, and nothing it holds is written', () => {
    const formulas = resolveFormulas([formula()], 'p');
    const frozen = contextFor(tamperProof(makeCar('A', '0').snapshot()), call('8', 'up'));
    const first = scoreCar(frozen, new Map(), normalization, undefined, formulas);
    const second = scoreCar(frozen, new Map(), normalization, undefined, formulas);
    expect(second).toEqual(first);
  });
});

describe('a formula on the legs (§ D177)', () => {
  const SEED = 20260726;
  let loaded: LoadedConfig;
  beforeAll(async () => {
    loaded = await load();
  });

  const legsOf = (result: SimulationResult): string =>
    JSON.stringify(result.record.passengers.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]));

  const run = (formulas: readonly FormulaSource[] | undefined): string => {
    const building = loaded.buildingsById.get('midtown-office');
    const base = loaded.dispatcherProfilesById.get('nearest-car');
    if (building === undefined || base === undefined) throw new Error('fixture missing');
    return legsOf(
      runSimulation({
        building,
        dispatcherProfile: { ...base, ...(formulas === undefined ? {} : { formulas }) } as typeof base,
        trafficProfiles: loaded.trafficProfiles,
        elevatorSpecs: loaded.elevatorSpecs,
        seed: SEED,
        demandTemplate: 'lunch-two-way',
        onTimeout: 'report',
      }),
    );
  };

  it('a weighted formula moves the run, an unweighted one does not, and the run replays', () => {
    const base = run(undefined);
    const product: FormulaSource = {
      id: 'late-and-full',
      name: 'Late and full',
      weight: 5,
      expression: { op: 'multiply', of: [{ term: 'waitTime' }, { op: 'add', of: [{ term: 'loadFactor' }, { value: 1 }] }] },
    };
    const moved = run([product]);
    expect(moved).not.toBe(base);
    expect(run([product])).toBe(moved);
    expect(run([{ ...product, weight: 0 }])).toBe(base);
  }, 600_000);
});
