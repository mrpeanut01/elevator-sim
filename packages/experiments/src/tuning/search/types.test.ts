/**
 * CLAUDE.md invariant 8, applied to the search's *own* knobs.
 *
 * `SEARCH_PARAMETERS` is the schema a generic optimizer would read to tune the optimizer, and it
 * was a hand-written list with no consumer and no check — three references in the whole repository:
 * the definition, the barrel re-export, and nothing else. A hand-maintained parallel list goes
 * stale silently, and it had: `search.confidence` was declared, exported, given a range and a
 * description, and read by **nobody**, because this module deliberately reports paired differences
 * and leaves every interval to `tuning/report`. A tunable that changes no behaviour is worse than a
 * missing one — an optimizer will spend a dimension of its budget on it and get no signal back.
 *
 * So the two lists are held to being one thing written twice. The test below fails if a key is
 * added to `SEARCH_DEFAULTS` without a row, if a row is added without a key, if a default drifts
 * from the value the code actually uses, or if a `range` no longer contains its own default.
 */

import { describe, expect, it } from 'vitest';

import {
  SEARCH_DEFAULTS,
  SEARCH_METHODS,
  SEARCH_METHOD_GATE,
  SEARCH_PARAMETERS,
  SEED_POLICIES,
  type SearchParameterSpec,
} from './types.js';

const byId = new Map<string, SearchParameterSpec>(SEARCH_PARAMETERS.map((spec) => [spec.id, spec]));

describe('SEARCH_PARAMETERS is SEARCH_DEFAULTS, declared', () => {
  it('declares exactly one row per default, and no row without one', () => {
    const expected = Object.keys(SEARCH_DEFAULTS)
      .map((key) => `search.${key}`)
      .sort();
    expect([...byId.keys()].sort()).toEqual(expected);
  });

  it('has no duplicate ids', () => {
    expect(byId.size).toBe(SEARCH_PARAMETERS.length);
  });

  it('carries the value the code actually defaults to, not a copy of it', () => {
    for (const [key, value] of Object.entries(SEARCH_DEFAULTS)) {
      expect(byId.get(`search.${key}`)?.default).toBe(value);
    }
  });

  it('gives every numeric row a range that contains its own default', () => {
    for (const spec of SEARCH_PARAMETERS) {
      if (spec.type !== 'continuous' && spec.type !== 'integer') continue;
      expect(spec.range, `${spec.id} declares no range`).toBeDefined();
      const [min, max] = spec.range ?? [0, 0];
      expect(min).toBeLessThan(max);
      expect(typeof spec.default).toBe('number');
      expect(spec.default as number).toBeGreaterThanOrEqual(min);
      expect(spec.default as number).toBeLessThanOrEqual(max);
      if (spec.type === 'integer') expect(Number.isSafeInteger(spec.default as number)).toBe(true);
    }
  });

  it('gives every categorical row a value list containing its default', () => {
    for (const spec of SEARCH_PARAMETERS) {
      if (spec.type !== 'categorical') continue;
      expect(spec.values, `${spec.id} declares no values`).toBeDefined();
      expect(spec.values).toContain(spec.default);
    }
    /* The one categorical today, pinned against its own vocabulary rather than a literal. */
    expect(byId.get('search.seedPolicy')?.values).toEqual([...SEED_POLICIES]);
  });

  it('gives every row a description a search could act on', () => {
    for (const spec of SEARCH_PARAMETERS) {
      expect(spec.description.length, `${spec.id} has no description`).toBeGreaterThan(20);
    }
  });

  /**
   * docs/06 § `activeWhen`: *a gate that cannot be read — absent, or the wrong runtime type — is
   * **not** satisfied.* An `activeWhen` naming a knob or a method that does not exist therefore
   * does not merely fail to gate: it switches the dimension off permanently, and an optimizer
   * reading the schema never searches it. Nothing type-checks the strings, so they are checked
   * here.
   */
  it('gates only on ids that exist, and on method names that exist', () => {
    for (const spec of SEARCH_PARAMETERS) {
      for (const [gate, values] of Object.entries(spec.activeWhen ?? {})) {
        expect(
          gate === SEARCH_METHOD_GATE || byId.has(gate),
          `${spec.id} gates on "${gate}", which is neither a declared parameter nor the method selector`,
        ).toBe(true);
        expect(values.length, `${spec.id} gates on "${gate}" with an empty value list`).toBeGreaterThan(0);
        if (gate !== SEARCH_METHOD_GATE) continue;
        for (const value of values) {
          expect(SEARCH_METHODS as readonly string[]).toContain(value);
        }
      }
    }
  });

  /**
   * The method selector is deliberately not a row and deliberately has no default: choosing a
   * method is choosing which of three exported functions to call. It is asserted rather than only
   * commented, so that "why is there no `search.method`?" has an answer in the suite.
   */
  it('keeps the method selector out of both lists on purpose', () => {
    expect(SEARCH_METHOD_GATE).toBe('search.method');
    expect(byId.has(SEARCH_METHOD_GATE)).toBe(false);
    expect(Object.keys(SEARCH_DEFAULTS)).not.toContain('method');
  });

  /** The knob that was declared, exported and read by nothing. It is gone, and stays gone. */
  it('no longer declares a confidence level this module never applies', () => {
    expect(Object.keys(SEARCH_DEFAULTS)).not.toContain('confidence');
    expect(byId.has('search.confidence')).toBe(false);
  });

  /** And the constant that used to be a literal in `sepCmaEs`'s body is data now. */
  it('declares the generation count rather than leaving it in a function body', () => {
    expect(SEARCH_DEFAULTS.generations).toBe(20);
    expect(byId.get('search.generations')?.type).toBe('integer');
  });
});
