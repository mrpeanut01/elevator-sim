import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDispatcherProfiles } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { DISPATCHER_FAMILIES, parseDispatcherFamilies } from './dispatcherFamilies.js';

const PROFILES = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/dispatcher-profiles.json', import.meta.url)),
      'utf8',
    ),
  ),
).profiles;

describe('the shipped shelves', () => {
  it('put every shipped dispatcher on exactly one shelf, and shelve nothing else', () => {
    // Adding a profile to `data/` without shelving it fails here, by name.
    expect(DISPATCHER_FAMILIES.flatMap((family) => family.profileIds).sort()).toEqual(
      PROFILES.map((profile) => profile.id).sort(),
    );
  });

  it('carry a heading and a line a player can read', () => {
    for (const family of DISPATCHER_FAMILIES) {
      expect(family.name.trim()).not.toBe('');
      expect(family.line.length).toBeGreaterThan(0);
      expect(family.line.length).toBeLessThanOrEqual(160);
    }
  });
});

describe('a hand-edited document is refused by name', () => {
  const family = { id: 'a', name: 'A', line: 'A line.', profileIds: ['eta'] };

  it.each([
    ['not an object', 'nonsense', /not an object/],
    ['no list', {}, /not a list/],
    ['a repeated id', { families: [family, family] }, /share the id/],
    ['an empty heading', { families: [{ ...family, name: ' ' }] }, /name is empty/],
    ['an over-long line', { families: [{ ...family, line: 'x'.repeat(161) }] }, /1 to 160/],
    ['an empty shelf', { families: [{ ...family, profileIds: [] }] }, /shelves nothing/],
    [
      'a design on two shelves',
      { families: [family, { ...family, id: 'b' }] },
      /on two shelves/,
    ],
  ])('%s', (_what, raw, message) => {
    expect(() => parseDispatcherFamilies(raw)).toThrow(message);
  });

  it('reads a well-formed one', () => {
    expect(parseDispatcherFamilies({ families: [family] })).toEqual([family]);
  });
});
