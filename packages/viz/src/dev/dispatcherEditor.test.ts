/**
 * The dispatcher editor's decisions, against the shipped profile library.
 *
 * There is no jsdom in this repository (`vitest.config.ts` sets `environment: 'node'` for every
 * project), so what is asserted here is everything the mount *decides* — which rows there are, what
 * each says, which dwell chip is lit — and the mount itself is the dumb instantiator. The two
 * assertions that matter most are the two the design brief calls requirements rather than polish:
 * the inert-term notice appears exactly when the model says a term is inert, and **no dwell chip is
 * pressed** when nobody has chosen one and the running profile matches none.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseDispatcherProfiles, type DispatcherProfile } from '@elevator-sim/core/browser';

import {
  DEFAULT_LEVERS,
  DWELL_SETTINGS,
  inertTerms,
  specFromProfile,
  type DispatcherSpec,
} from '../authoring/dispatcherSpec.js';

import {
  dwellChipsOf,
  dwellHintOf,
  flagRowsOf,
  humanTermName,
  leverRowsOf,
  nextSavedId,
  shortTermNameOf,
  termRowsOf,
  vectorLineOf,
} from './dispatcherEditor.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const LIBRARY = parseDispatcherProfiles(read('dispatcher-profiles.json'));
const TERMS = LIBRARY.terms;
const TERM_IDS = TERMS.map((term) => term.id);

const profile = (id: string): DispatcherProfile => {
  const found = LIBRARY.profiles.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return found;
};

const specOf = (id: string): DispatcherSpec => specFromProfile(profile(id), profile(id).name);

describe('the twelve term rows', () => {
  it('draws one row per declared term, in the file’s own order', () => {
    const rows = termRowsOf(TERMS, specOf('collective'), []);
    expect(rows.map((row) => row.termId)).toStrictEqual(TERM_IDS);
  });

  it('carries the term’s own measures as the tooltip and its serves as the sub-line', () => {
    const rows = termRowsOf(TERMS, specOf('collective'), []);
    for (const [index, row] of rows.entries()) {
      const term = TERMS[index];
      expect(term).toBeDefined();
      expect(row.help).toBe(term?.measures);
      expect(row.serves).toBe(`serves ${String(term?.serves)}`);
    }
  });

  it('reads the position off the spec, and marks which terms are weighted', () => {
    const spec = specOf('collective');
    const rows = termRowsOf(TERMS, spec, []);
    const wait = rows.find((row) => row.termId === 'waitTime');
    expect(wait?.value).toBe(100);
    expect(wait?.weighted).toBe(true);
    expect(rows.find((row) => row.termId === 'crowding')?.weighted).toBe(false);
  });

  it('shows the inert notice exactly when inertTerms names the term — § D112', () => {
    const base = specOf('eta');
    const weighted: DispatcherSpec = {
      ...base,
      weights: { ...base.weights, rideTime: 50 },
      flags: { ...base.flags, pool: false },
    };
    const inert = inertTerms(weighted);
    expect(inert).toHaveLength(1);

    const drawn = termRowsOf(TERMS, weighted, inert);
    const withNotice = drawn.filter((row) => row.inertWhy !== undefined);
    expect(withNotice.map((row) => row.termId)).toStrictEqual(['rideTime']);
    expect(withNotice[0]?.inertWhy).toContain('destination');

    // And the notice disappears the moment the flag makes the term live again — the refusal is a
    // fact about the *pair*, not a permanent label on rideTime.
    const pooled: DispatcherSpec = { ...weighted, flags: { ...weighted.flags, pool: true } };
    const relit = termRowsOf(TERMS, pooled, inertTerms(pooled));
    expect(relit.every((row) => row.inertWhy === undefined)).toBe(true);
  });

  it('never marks a term inert that the model did not name', () => {
    for (const entry of LIBRARY.profiles) {
      const spec = specFromProfile(entry, entry.name);
      const rows = termRowsOf(TERMS, spec, inertTerms(spec));
      const named = new Set(inertTerms(spec).map((row) => row.termId));
      for (const row of rows) {
        expect(row.inertWhy !== undefined).toBe(named.has(row.termId));
      }
    }
  });
});

describe('term names', () => {
  it('turns an id into a phrase without a lookup table', () => {
    expect(humanTermName('waitTime')).toBe('wait time');
    expect(humanTermName('existingCallDelay')).toBe('existing call delay');
    expect(humanTermName('crowding')).toBe('crowding');
  });

  it('gives every shipped term a short name of its own', () => {
    const shorts = TERM_IDS.map((id) => shortTermNameOf(id, TERM_IDS));
    expect(new Set(shorts).size).toBe(TERM_IDS.length);
  });

  it('falls back to the whole phrase when two terms would share a short name', () => {
    const clashing = ['waitTime', 'waitVariance'];
    expect(shortTermNameOf('waitTime', clashing)).toBe('wait time');
    expect(shortTermNameOf('waitTime', ['waitTime', 'stopCount'])).toBe('wait');
  });

  it('writes a vector line naming every weighted term of a shipped profile', () => {
    const line = vectorLineOf(profile('energy-aware'), TERM_IDS);
    for (const [term, weight] of Object.entries(profile('energy-aware').weights ?? {})) {
      if (weight > 0) expect(line).toContain(shortTermNameOf(term, TERM_IDS));
    }
  });
});

describe('the three flags and the two levers', () => {
  it('reads each flag off the spec and names the field it writes', () => {
    const spec = specOf('destination-panel');
    const rows = flagRowsOf(spec);
    expect(rows.map((row) => row.key)).toStrictEqual(['pool', 'zone', 'bypass']);
    expect(rows.find((row) => row.key === 'pool')?.on).toBe(spec.flags.pool);
    expect(rows.find((row) => row.key === 'pool')?.help).toContain('dispatch.callType');
    expect(rows.find((row) => row.key === 'bypass')?.help).toContain('bypassLoadThreshold');
  });

  it('reads the levers off the group, not off the dispatcher', () => {
    const rows = leverRowsOf({ ...DEFAULT_LEVERS, express: true });
    expect(rows.find((row) => row.key === 'express')?.on).toBe(true);
    expect(rows.find((row) => row.key === 'parking')?.on).toBe(false);
  });
});

describe('the dwell chips have four states', () => {
  it('presses nothing when nobody chose and the profile matches no chip', () => {
    /*
     * `energy-aware` authors an adaptive dwell with a 0.2 gain and a 10 s ceiling, which none of
     * the three settings can express. A chip lit here would be the page claiming an override
     * nobody asked for — the defect `authoring.test.ts`'s run-identity test caught.
     */
    const chips = dwellChipsOf(DEFAULT_LEVERS, profile('energy-aware'));
    expect(chips).toHaveLength(3);
    expect(chips.filter((chip) => chip.pressed)).toStrictEqual([]);
    expect(dwellHintOf(DEFAULT_LEVERS, profile('energy-aware'))).toContain('No override');
  });

  it('presses nothing for a profile that authors no dwell at all', () => {
    const plain = profile('collective');
    expect(plain.answer?.dwellPolicy).toBeUndefined();
    expect(dwellChipsOf(DEFAULT_LEVERS, plain).filter((chip) => chip.pressed)).toStrictEqual([]);
  });

  it('lights the chip the reader chose, and says so is an override', () => {
    const chips = dwellChipsOf({ ...DEFAULT_LEVERS, dwell: 'patient' }, profile('collective'));
    const pressed = chips.filter((chip) => chip.pressed);
    expect(pressed.map((chip) => chip.choice)).toStrictEqual(['patient']);
    expect(pressed[0]?.inherited).toBe(false);
    expect(dwellHintOf({ ...DEFAULT_LEVERS, dwell: 'patient' }, profile('collective'))).not.toContain(
      'No override',
    );
  });

  it('lights an inherited chip as inherited, so it is not read as an override', () => {
    /*
     * A synthetic profile whose authored dwell *is* one of the three. The chip lights and reports
     * that nothing was overridden: `levers.dwell` is still undefined, so `profileFromSpec` writes
     * no dwell fields and the run is the one named in the rail.
     */
    const patient = DWELL_SETTINGS.patient;
    const authored = {
      ...profile('collective'),
      answer: { dwellPolicy: patient.dwellPolicy, maxDwellS: patient.maxDwellS },
    } as unknown as DispatcherProfile;
    const chips = dwellChipsOf(DEFAULT_LEVERS, authored);
    const pressed = chips.filter((chip) => chip.pressed);
    expect(pressed.map((chip) => chip.choice)).toStrictEqual(['patient']);
    expect(pressed[0]?.inherited).toBe(true);
  });
});

describe('saved ids', () => {
  it('skips an id already in use rather than counting the list', () => {
    expect(nextSavedId('yours', [])).toBe('yours-1');
    expect(nextSavedId('yours', ['yours-1', 'yours-3'])).toBe('yours-2');
    // Deleting the middle of three and saving again must not reuse a live id.
    expect(nextSavedId('yours', ['yours-1', 'yours-2'])).toBe('yours-3');
  });
});
