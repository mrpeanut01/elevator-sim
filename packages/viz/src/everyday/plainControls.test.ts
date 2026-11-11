/**
 * `plainControls.ts` — every setting the workshop draws at *Detailed* has a name that does not
 * look like code, and the name says nothing the declared id does not.
 */

import { DISPATCH_PARAMETERS } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { familySpace } from '../authoring/dispatcherSpec.js';

import { plainControlWordsOf, spelledOutNameOf } from './plainControls.js';

describe('a field name, spelled out', () => {
  it.each([
    ['dispatch.batchWindowS', 'Batch window, seconds'],
    ['dispatch.maxReassignmentsPerCall', 'Maximum reassignments per call'],
    ['normalization.distanceM', 'Distance, metres'],
    ['answer.allowBypassIfSoleEligibleCar', 'Allow bypass if sole eligible car'],
    ['rounds', 'Rounds'],
    // A single letter is a word, not a unit, when it is the whole name.
    ['S', 'S'],
  ])('%s reads %s', (id, name) => {
    expect(spelledOutNameOf(id)).toBe(name);
  });
});

describe('every setting the Detailed depth can draw', () => {
  const ids = [...familySpace().byId.keys()];

  it('draws at least the declared dispatch settings', () => {
    expect(ids.length).toBeGreaterThan(20);
  });

  it('has a name with no dotted path and no camel hump in it', () => {
    for (const id of ids) {
      const { name } = plainControlWordsOf(id);
      expect(name, id).not.toMatch(/[a-z][A-Z]/u);
      expect(name, id).not.toContain('.');
      expect(name.length, id).toBeGreaterThan(1);
      expect(name.charAt(0), id).toBe(name.charAt(0).toUpperCase());
    }
  });

  it('uses core’s own player words wherever the schema row carries them, effect included', () => {
    const authored = DISPATCH_PARAMETERS.filter((parameter) => parameter.player !== undefined);
    expect(authored.length).toBeGreaterThan(0);
    for (const parameter of authored) {
      const words = plainControlWordsOf(parameter.id);
      expect(words.name.toLowerCase(), parameter.id).toBe(parameter.player?.name.toLowerCase());
      expect(words.effect, parameter.id).toBe(parameter.player?.effect);
    }
  });

  it('claims no effect of its own for a setting core has no player words for', () => {
    const bare = DISPATCH_PARAMETERS.find((parameter) => parameter.player === undefined);
    if (bare === undefined) throw new Error('every parameter has player words; drop this case');
    expect(plainControlWordsOf(bare.id).effect).toBeUndefined();
  });
});
