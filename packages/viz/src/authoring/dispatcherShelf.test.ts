import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDispatcherProfiles } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { builtProfileOf, sameProfile, versionedNameOf } from './dispatcherShelf.js';
import { DEFAULT_LEVERS, specFromProfile } from './dispatcherSpec.js';
import { defaultRuleRow, rulesFromProfile } from './ruleSpec.js';
import { selectorContextFrom, specFromProfile as selectorFromProfile } from './selectorSpec.js';

const FILE = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/dispatcher-profiles.json', import.meta.url)),
      'utf8',
    ),
  ),
);
const CONTEXT = selectorContextFrom(FILE, 900);

/** Everything the workshop holds after reading a profile back in, with no lever pulled. */
const reopened = (profile: (typeof FILE.profiles)[number]) => ({
  spec: specFromProfile(profile, profile.name),
  levers: DEFAULT_LEVERS,
  selector: selectorFromProfile(profile, CONTEXT),
  rows: rulesFromProfile(profile),
});

describe('a save is a fixed point', () => {
  /*
   * The workshop's *unsaved changes* line asks whether a save would write a different document
   * from the one on the shelf. That is only an honest question if saving twice writes the same
   * thing: otherwise a dispatcher nobody has touched reads as unsaved for ever.
   */
  it.each(FILE.profiles.map((profile) => [profile.id, profile] as const))(
    'saving %s, reopening it and saving again writes the same document',
    (_id, shipped) => {
      const first = builtProfileOf(reopened(shipped), 'yours-1', shipped, CONTEXT);
      const second = builtProfileOf(reopened(first), 'yours-1', first, CONTEXT);
      expect(sameProfile(second, first)).toBe(true);
    },
  );

  it('sees a moved weight, a pulled lever and an added rule as a different document', () => {
    const shipped = FILE.profiles.find((profile) => profile.id === 'collective');
    if (shipped === undefined) throw new Error('data/ lost collective');
    const saved = builtProfileOf(reopened(shipped), 'yours-1', shipped, CONTEXT);
    const held = reopened(saved);

    const weighted = { ...held, spec: { ...held.spec, weights: { ...held.spec.weights, starvation: 80 } } };
    expect(sameProfile(builtProfileOf(weighted, 'yours-1', saved, CONTEXT), saved)).toBe(false);

    const parked = { ...held, levers: { ...held.levers, parking: true } };
    expect(sameProfile(builtProfileOf(parked, 'yours-1', saved, CONTEXT), saved)).toBe(false);

    const ruled = { ...held, rows: [defaultRuleRow()] };
    const withRule = builtProfileOf(ruled, 'yours-1', saved, CONTEXT);
    expect(sameProfile(withRule, saved)).toBe(false);
    // The rule is in the saved document, which is the difference from the Engineer editor's save.
    expect(rulesFromProfile(withRule)).toHaveLength(1);
  });

  it('carries the dispatcher’s own pattern-to-priorities choices, and only where they differ from the file', () => {
    const shipped = FILE.profiles.find((profile) => profile.id === 'collective');
    const pattern = FILE.patternSwitching?.patternDetector.patterns[0];
    if (shipped === undefined || pattern === undefined) throw new Error('data/ lost collective or its patterns');
    const held = reopened(shipped);
    // Untouched, a save writes no map: the file's own is the dispatcher's.
    expect(builtProfileOf(held, 'yours-1', shipped, CONTEXT).patternWeightSets).toBeUndefined();

    const other = FILE.profiles.find((profile) => profile.id !== held.selector.weightSetsByPattern[pattern]);
    if (other === undefined) throw new Error('data/ ships one profile');
    const chosen = {
      ...held,
      selector: {
        ...held.selector,
        weightSetsByPattern: { ...held.selector.weightSetsByPattern, [pattern]: other.id },
      },
    };
    const saved = builtProfileOf(chosen, 'yours-1', shipped, CONTEXT);
    expect(saved.patternWeightSets).toEqual({ [pattern]: other.id });
    // And it comes back out on reopening, so the save is still a fixed point.
    expect(reopened(saved).selector.weightSetsByPattern[pattern]).toBe(other.id);
    expect(sameProfile(builtProfileOf(reopened(saved), 'yours-1', saved, CONTEXT), saved)).toBe(true);
  });

  it('ignores key order, which a spread does not promise', () => {
    const shipped = FILE.profiles[0];
    if (shipped === undefined) throw new Error('data/ ships no dispatcher');
    const reversed = Object.fromEntries(Object.entries(shipped).reverse()) as typeof shipped;
    expect(sameProfile(reversed, shipped)).toBe(true);
  });
});

describe('versioned names — § 11.1', () => {
  it('keeps a free name, and counts on from a taken one', () => {
    expect(versionedNameOf('Patience', ['Fairness first'])).toBe('Patience');
    expect(versionedNameOf('Patience', ['patience'])).toBe('Patience v2');
    expect(versionedNameOf('Patience', ['Patience', 'Patience v2'])).toBe('Patience v3');
  });

  it('counts from the stem, so a copy of a copy is not “v2 v2”', () => {
    expect(versionedNameOf('Patience v2', ['Patience', 'Patience v2'])).toBe('Patience v3');
  });

  it('names an unnamed dispatcher rather than filing a blank', () => {
    expect(versionedNameOf('  ', [])).toBe('My dispatcher');
  });
});
