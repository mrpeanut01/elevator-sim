/**
 * The scope table is total, in both directions — S1.
 *
 * A table maintained by hand is the thing this repository has been caught by five times in one
 * branch (§ D213), and twice the hand-maintained list was a **guard that could no longer see what it
 * was guarding**. So the key set is never written down: it is `Object.keys` of the state's own
 * opening values, and this file asserts the table matches it going both ways.
 *
 * Both directions matter and they fail differently. A field with no entry is a control nobody
 * scoped — the state `docs/16` was written to end. An entry for a field that no longer exists is a
 * ghost, and `honesty/derive.test.ts` gives the reason it is worth a test of its own: *a list of
 * ghosts is how a list stops being read.*
 */

import { describe, expect, it } from 'vitest';

import { initialState } from '../dev/state.js';
import { catalogueOf } from '../menu/catalogue.js';
import { initialMenuState } from '../menu/menu.js';
import { DEFAULT_SETTINGS } from '../menu/types.js';

import { PROBES, RESOURCES, SINK_IS_A_MOUNT, SINK_MISSING } from './probes.test-helper.js';
import { SCOPE_OF } from './surface.js';
import { CHANGE_SCOPES, type SurfaceKey } from './types.js';

/**
 * The keys the table must cover, derived from values rather than from types.
 *
 * From values because TypeScript's types are erased: `keyof ViewerState` does not exist at run time,
 * so a derivation over the type would be a derivation this test could not perform. `initialState` is
 * the opening value and therefore carries every key by construction.
 */
function derivedKeys(): readonly SurfaceKey[] {
  const menu = initialMenuState(catalogueOf(RESOURCES));
  const keys = [
    ...Object.keys(initialState(RESOURCES, 1n)).map((key) => `viewer.${key}` as SurfaceKey),
    ...Object.keys(DEFAULT_SETTINGS).map((key) => `settings.${key}` as SurfaceKey),
    ...Object.keys(menu.freePlay).map((key) => `free-play.${key}` as SurfaceKey),
    ...Object.keys(menu).map((key) => `menu.${key}` as SurfaceKey),
  ];
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

const tableKeys = (): readonly SurfaceKey[] =>
  (Object.keys(SCOPE_OF) as SurfaceKey[]).sort((a, b) => a.localeCompare(b));

describe('the writable surface is derived, not listed', () => {
  it('covers every field the state actually has', () => {
    const missing = derivedKeys().filter((key) => !(key in SCOPE_OF));
    expect(missing, 'fields with no declared change scope').toEqual([]);
  });

  it('names no field the state no longer has', () => {
    const derived = new Set(derivedKeys());
    const ghosts = tableKeys().filter((key) => !derived.has(key));
    expect(ghosts, 'scope rows for fields that no longer exist').toEqual([]);
  });

  it('is the same set both ways, which is the assertion the two above are halves of', () => {
    expect(tableKeys()).toEqual(derivedKeys());
  });

  it('covers a surface worth having a rule about', () => {
    // A guard that passed over an empty table would be a description, not a gate — § D163.
    expect(derivedKeys().length).toBeGreaterThanOrEqual(40);
  });

  it('does not accept an invented key', () => {
    // The negative control. Without it, a table that somehow contained every string would pass.
    expect('viewer.zeppelin' in SCOPE_OF).toBe(false);
  });
});

describe('every row is a decision somebody made', () => {
  it('gives every entry a reason long enough to be one', () => {
    // 60 rather than 80: `derive.test.ts` uses 80 for an exclusion from a property search, which is
    // a heavier claim. This bound is set where a one-clause sentence fits and a shrug does not.
    for (const [key, entry] of Object.entries(SCOPE_OF)) {
      expect(entry.why.length, `${key} — “${entry.why}”`).toBeGreaterThanOrEqual(60);
    }
  });

  it('declares a scope this file knows about', () => {
    for (const [key, entry] of Object.entries(SCOPE_OF)) {
      if (entry.kind !== 'control') continue;
      expect(CHANGE_SCOPES, key).toContain(entry.scope);
    }
  });

  it('points every latent row at a field the table itself declares', () => {
    // A latent row's whole claim is *"this becomes a run through that field"*. A `realisedBy` naming
    // nothing would make the claim unfalsifiable, which is the shape this directory exists to refuse.
    for (const [key, entry] of Object.entries(SCOPE_OF)) {
      if (entry.kind !== 'latent') continue;
      expect(SCOPE_OF[entry.realisedBy], `${key} → ${entry.realisedBy}`).toBeDefined();
    }
  });

  it('has at least one row of each kind', () => {
    const kinds = new Set(Object.values(SCOPE_OF).map((entry) => entry.kind));
    expect([...kinds].sort()).toEqual(['control', 'latent', 'output']);
  });
});

describe('every control has an instrument', () => {
  it('probes exactly the control rows, both directions', () => {
    const controls = (Object.entries(SCOPE_OF) as [SurfaceKey, (typeof SCOPE_OF)[SurfaceKey]][])
      .filter(([, entry]) => entry.kind === 'control')
      .map(([key]) => key)
      .sort((a, b) => a.localeCompare(b));
    const probed = (Object.keys(PROBES) as SurfaceKey[]).sort((a, b) => a.localeCompare(b));
    expect(probed, 'a control with no probe is a scope nothing checks').toEqual(controls);
  });
});

describe('the two sink registers', () => {
  it('names only presentation controls', () => {
    for (const key of [...Object.keys(SINK_IS_A_MOUNT), ...Object.keys(SINK_MISSING)]) {
      const entry = SCOPE_OF[key as SurfaceKey];
      expect(entry, key).toBeDefined();
      expect(entry?.kind, key).toBe('control');
      if (entry?.kind === 'control') expect(entry.scope, key).toBe('presentation');
    }
  });

  it('keeps the two apart, because only one of them is a defect', () => {
    // `SINK_IS_A_MOUNT` is an evidence-tier statement (S9). `SINK_MISSING` is a finding. An entry in
    // both would let a real defect be read as a limitation.
    const both = Object.keys(SINK_MISSING).filter((key) => key in SINK_IS_A_MOUNT);
    expect(both).toEqual([]);
  });

  it('gives every registered entry a reason', () => {
    for (const [key, why] of [...Object.entries(SINK_IS_A_MOUNT), ...Object.entries(SINK_MISSING)]) {
      expect(why.length, key).toBeGreaterThanOrEqual(40);
    }
  });
});
