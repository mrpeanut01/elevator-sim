/**
 * `formulaSpec.ts` — the workshop's model for a priority of the player's own.
 *
 * Held here: every list the editor's controls can produce is one `core` will run; the working copy
 * carries formulas into the profile and back; and — the standing requirement, on the legs — a
 * formula written in this editor changes the run the profile makes.
 */

import {
  FORMULA_OPS,
  MAX_FORMULAS,
  resolveDispatchConfig,
  type DispatcherProfile,
  type DispatcherProfiles,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import profilesJson from '../../../../data/dispatcher-profiles.json' with { type: 'json' };

import { profileFromSpec, specFromProfile, specIsDirty } from './dispatcherSpec.js';
import {
  FORMULA_MAX_TERMS,
  FORMULA_OP_ORDER,
  FORMULA_OP_WORDS,
  canAddFormula,
  expressionOf,
  formulaIssueOf,
  formulaReadbackOf,
  formulaTermNameOf,
  formulaTermOptions,
  simpleFormulaOf,
  withFormulaAt,
  withNewFormula,
  withoutFormulaAt,
  type FormulaSpec,
} from './formulaSpec.js';

const FILE = profilesJson as unknown as DispatcherProfiles;
const SHIPPED = FILE.profiles.find((profile) => profile.id === 'collective') as DispatcherProfile;

describe('the words', () => {
  it('has words for every operation core declares, and offers each once', () => {
    expect([...FORMULA_OP_ORDER].sort()).toEqual([...FORMULA_OPS].sort());
    expect(Object.keys(FORMULA_OP_WORDS).sort()).toEqual([...FORMULA_OPS].sort());
  });

  it('names a term the way the weight row above it does, and reads a formula as a sentence', () => {
    expect(formulaTermNameOf('loadFactor')).toBe('load factor');
    const formula: FormulaSpec = {
      id: 'mine-1',
      name: 'Mine',
      weight: 0.5,
      expression: expressionOf({ op: 'max', termIds: ['waitTime', 'loadFactor'] }),
    };
    expect(formulaReadbackOf(formula)).toBe(
      `Reads as: whichever is worse of ${formulaTermNameOf('waitTime')} or load factor.`,
    );
  });

  it('reads a nested, hand-written tree too, and says the editor cannot draw it', () => {
    const nested: FormulaSpec = {
      id: 'hand',
      name: 'Hand',
      weight: 1,
      expression: {
        op: 'multiply',
        of: [{ term: 'waitTime' }, { op: 'add', of: [{ term: 'loadFactor' }, { value: 1 }] }],
      },
    };
    expect(simpleFormulaOf(nested.expression)).toBeUndefined();
    expect(formulaReadbackOf(nested)).toBe(
      `Reads as: how bad these are together: ${formulaTermNameOf('waitTime')} times (the sum of load factor plus 1).`,
    );
    expect(formulaIssueOf([nested])).toBeUndefined();
  });
});

describe('everything the controls can produce is something core runs', () => {
  it('a new formula counts, resolves, and is one the editor can draw', () => {
    const [made] = withNewFormula([]);
    expect(made?.weight).toBeGreaterThan(0);
    expect(simpleFormulaOf(made!.expression)?.termIds).toHaveLength(2);
    expect(formulaIssueOf([made!])).toBeUndefined();
  });

  it('adds up to core’s bound, with ids that never collide, and then stops', () => {
    let formulas: readonly FormulaSpec[] = [];
    for (let index = 0; index < MAX_FORMULAS; index += 1) formulas = withNewFormula(formulas);
    expect(new Set(formulas.map((formula) => formula.id)).size).toBe(MAX_FORMULAS);
    expect(canAddFormula(formulas)).toBe(false);
    expect(withNewFormula(formulas)).toBe(formulas);
    expect(formulaIssueOf(formulas)).toBeUndefined();
    // Removing one frees its id for the next, without repeating a held one.
    const fewer = withoutFormulaAt(formulas, 0);
    expect(new Set(withNewFormula(fewer).map((formula) => formula.id)).size).toBe(MAX_FORMULAS);
  });

  it('every operation over every count of terms the editor allows resolves', () => {
    const terms = formulaTermOptions().map((option) => option.id);
    for (const op of FORMULA_OP_ORDER) {
      for (let count = 2; count <= FORMULA_MAX_TERMS; count += 1) {
        const formulas = withFormulaAt(withNewFormula([]), 0, {
          expression: expressionOf({ op, termIds: terms.slice(0, count) }),
        });
        expect(formulaIssueOf(formulas), `${op} over ${String(count)}`).toBeUndefined();
        expect(simpleFormulaOf(formulas[0]!.expression)).toEqual({ op, termIds: terms.slice(0, count) });
      }
    }
  });

  it('says a damaged formula would stop a run, in its own words and not the engine’s', () => {
    const damaged = [{ id: 'x', name: 'X', weight: 1, expression: { term: 'no-such-term' } }];
    const issue = formulaIssueOf(damaged);
    expect(issue).toContain('would be refused');
    expect(issue).not.toContain('no-such-term');
  });
});

describe('the working copy carries formulas to the profile and back', () => {
  const formulas = withNewFormula([]);

  it('a profile without formulas reads to a spec without the key, and writes back without it', () => {
    const spec = specFromProfile(SHIPPED, SHIPPED.name);
    expect(Object.hasOwn(spec, 'formulas')).toBe(false);
    expect(Object.hasOwn(profileFromSpec(spec, { id: 'p', base: SHIPPED }), 'formulas')).toBe(false);
  });

  it('writes them, reads them back, and counts them as a change', () => {
    const spec = { ...specFromProfile(SHIPPED, SHIPPED.name), formulas };
    expect(specIsDirty(spec, SHIPPED)).toBe(true);
    const profile = profileFromSpec(spec, { id: 'p', base: SHIPPED });
    expect(profile.formulas).toEqual(formulas);
    expect(specFromProfile(profile, profile.name).formulas).toEqual(formulas);
    expect(specIsDirty(specFromProfile(profile, profile.name), profile)).toBe(false);
    expect(resolveDispatchConfig(profile).formulas).toHaveLength(1);
  });

  it('absent keeps the base’s, and an empty list removes them', () => {
    const withSome = profileFromSpec({ ...specFromProfile(SHIPPED, SHIPPED.name), formulas }, { id: 'p', base: SHIPPED });
    const untouched = { ...specFromProfile(withSome, withSome.name) };
    delete (untouched as { formulas?: unknown }).formulas;
    expect(profileFromSpec(untouched, { id: 'p', base: withSome }).formulas).toEqual(formulas);
    const cleared = { ...specFromProfile(withSome, withSome.name), formulas: [] };
    expect(specIsDirty(cleared, withSome)).toBe(true);
    expect(Object.hasOwn(profileFromSpec(cleared, { id: 'p', base: withSome }), 'formulas')).toBe(false);
  });
});
