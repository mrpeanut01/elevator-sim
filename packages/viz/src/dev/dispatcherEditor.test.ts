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

import { baseState, legsOf } from '../scope/probes.test-helper.js';

import {
  dwellChipsOf,
  dwellHintOf,
  flagRowsOf,
  humanTermName,
  leverRowsOf,
  nextSavedId,
  renameStateOf,
  renamedDispatchers,
  runThisDispatcherStateOf,
  saveNameRefusalOf,
  unauthorableBlocksOf,
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

/* -------------------------------------------------------------------------- *
 * "Now use this" — issue #65
 * -------------------------------------------------------------------------- */

/**
 * The verb the panel did not have, and § D177's rule pointed at it.
 *
 * The complaint was that after tuning thirteen weight sliders the only offers are **Close** and
 * **Save as a new dispatcher** — so a reader has to know that filing also selects, and has to go
 * back to the right-hand rail to run anything they did not file. The last test here is the one that
 * makes the new control more than a label: selecting a different dispatcher and running has to move
 * the legs, or the button is decoration with a confident tooltip.
 */
describe('the editor can run what it is showing — issue #65', () => {
  const profileOf = (id: string): DispatcherProfile => {
    const found = LIBRARY.profiles.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`no profile ${id}`);
    return found;
  };
  const COLLECTIVE = profileOf('collective');
  const CLEAN: DispatcherSpec = specFromProfile(COLLECTIVE, COLLECTIVE.name);

  it('offers to save first when the weights differ from the profile they came from', () => {
    const edited: DispatcherSpec = { ...CLEAN, weights: { ...CLEAN.weights, waitTime: 91 } };
    expect(runThisDispatcherStateOf(edited, COLLECTIVE, 'collective', 'collective')).toBe(
      'saveFirst',
    );
  });

  it('goes off, rather than pretending, when it is already the one driving', () => {
    // An enabled control whose press changes nothing is the defect this repository counts. The
    // reader is looking at exactly what the shift is running, so the button says that.
    expect(runThisDispatcherStateOf(CLEAN, COLLECTIVE, 'collective', 'collective')).toBe(
      'alreadyDriving',
    );
  });

  it('offers a plain selection when an unedited other profile is open', () => {
    expect(runThisDispatcherStateOf(CLEAN, COLLECTIVE, 'nearest-car', 'collective')).toBe('select');
  });

  it('treats a profile that no longer exists as something to save rather than to select', () => {
    // The reader deleted the saved dispatcher they were editing. There is nothing to point the run
    // at, so the honest offer is to file it again.
    expect(runThisDispatcherStateOf(CLEAN, undefined, 'collective', 'gone-1')).toBe('saveFirst');
  });

  it('and the press really moves the run — § D177, compared on the legs', () => {
    /*
     * The `savesFirst: false` arm end to end: what the button does in that arm is write
     * `dispatcherId` and re-run, so that is what is measured. Same building, same seed, same
     * traffic, same shift length — the dispatcher is the only thing that moved, and neither arm may
     * be empty.
     */
    const before = { ...baseState(), dispatcherId: 'collective' };
    const after = { ...before, dispatcherId: 'nearest-car' };
    expect(runThisDispatcherStateOf(CLEAN, COLLECTIVE, before.dispatcherId, 'nearest-car')).toBe(
      'select',
    );
    const control = legsOf(before);
    const moved = legsOf(after);
    expect(JSON.parse(control)).not.toHaveLength(0);
    expect(JSON.parse(moved)).not.toHaveLength(0);
    expect(moved).not.toBe(control);
  });
});

/* -------------------------------------------------------------------------- *
 * Naming a dispatcher — GitHub issue #113 § 3
 * -------------------------------------------------------------------------- */

describe('a save is refused before it can mint a second identical card', () => {
  /*
   * The report: *"an empty save is named `My dispatcher` with no dedupe; saving three times yields
   * three identically-titled cards"* — and since every list in the product keys on the id and
   * *displays* the name, three identical names is three indistinguishable rows over three different
   * weight vectors. Reverting `saveNameRefusalOf` and the `save()` guard that calls it fails every
   * case here by not compiling; the behaviour it removes is a save that always succeeds.
   */
  it('refuses an empty name, and one that is only spaces', () => {
    expect(saveNameRefusalOf('', [])).toBe('empty');
    expect(saveNameRefusalOf('   ', [])).toBe('empty');
  });

  it('refuses a name already on the list the reader will read it off', () => {
    // The shipped profiles count, not only the reader's own: a saved `collective` sits in the same
    // picker as the shipped one.
    expect(saveNameRefusalOf('collective', LIBRARY.profiles.map((entry) => entry.name))).toBeUndefined();
    expect(saveNameRefusalOf('Collective', ['Collective'])).toBe('taken');
  });

  it('folds case and surrounding space, because the reader cannot see either on a list', () => {
    expect(saveNameRefusalOf('  MiNe ', ['mine'])).toBe('taken');
  });

  it('admits a name nobody has, which is the case that must keep working', () => {
    expect(saveNameRefusalOf('Mine, but quicker', ['mine'])).toBeUndefined();
  });
});

describe('rename is offered, and only where it is honest', () => {
  const mine = (id: string, name: string): { readonly id: string; readonly profile: DispatcherProfile } => ({
    id,
    profile: { ...profile('collective'), id, name },
  });

  it('is offered for one of the reader’s own under a free name', () => {
    expect(renameStateOf('Quicker', 'yours-1', [mine('yours-1', 'Mine')])).toBe('ready');
  });

  it('is refused for a shipped profile, whose name every published figure was measured under', () => {
    expect(renameStateOf('Anything', 'collective', [mine('yours-1', 'Mine')])).toBe('notYours');
  });

  it('is off when the name has not moved, and off when the new name is taken', () => {
    const saved = [mine('yours-1', 'Mine'), mine('yours-2', 'Theirs')];
    expect(renameStateOf('Mine', 'yours-1', saved)).toBe('unchanged');
    expect(renameStateOf('  Mine  ', 'yours-1', saved)).toBe('unchanged');
    expect(renameStateOf('Theirs', 'yours-1', saved)).toBe('refused');
    expect(renameStateOf('', 'yours-1', saved)).toBe('refused');
  });

  it('renames in place, keeping the id every other surface holds', () => {
    /*
     * The whole reason rename is not delete-and-re-save. `state.dispatcherId`, a recording's
     * provenance line and the challenge screen's dispatcher select all hold the **id**; a rename
     * that minted a new one would orphan every reference to it.
     */
    const saved = [mine('yours-1', 'Mine'), mine('yours-2', 'Theirs')];
    const after = renamedDispatchers(saved, 'yours-1', '  Quicker  ');
    expect(after.map((entry) => entry.id)).toEqual(['yours-1', 'yours-2']);
    expect(after[0]?.profile.name).toBe('Quicker');
    // Nothing else moved: the weights are the object they were.
    expect(after[0]?.profile.weights).toEqual(saved[0]?.profile.weights);
    expect(after[1]).toBe(saved[1]);
  });
});

/* -------------------------------------------------------------------------- *
 * What this editor cannot write — GitHub issue #113 § 5
 * -------------------------------------------------------------------------- */

describe('a profile carrying what the editor cannot author says so', () => {
  /*
   * *"Five families are advertised and only two are authorable."* The editor's document is thirteen
   * weights plus three flags, and `profileFromSpec` spreads its `base` — so editing a multi-round
   * auction's weights and saving gives back a multi-round auction, with nothing on screen having
   * mentioned the auction. § D227: a control that cannot write something must say so.
   */
  it('names the auction on a profile that has one', () => {
    expect(unauthorableBlocksOf(profile('auction-multi-round'))).toContain('auction');
  });

  it('names the destination panel wiring, which no control here reaches', () => {
    expect(unauthorableBlocksOf(profile('destination-panel'))).toContain('panel');
    // And not on the Level-0 destination, which authors no `passengerAssignment` at all.
    expect(unauthorableBlocksOf(profile('destination-eta'))).not.toContain('panel');
  });

  it('names the zone’s split threshold, which the zone flag turns on and cannot size', () => {
    expect(unauthorableBlocksOf(profile('zoned-uppeak'))).toContain('zoning');
  });

  it('names a hard constraint, and says nothing about a plain weight vector', () => {
    expect(unauthorableBlocksOf(profile('collective'))).toEqual(['constraints']);
    // The negative control, and the case that must stay silent: two of the shipped profiles are
    // weights and nothing else, and a warning on those would be noise on every screen.
    expect(unauthorableBlocksOf(profile('eta'))).toEqual([]);
    expect(unauthorableBlocksOf(profile('nearest-car'))).toEqual([]);
    expect(unauthorableBlocksOf(undefined)).toEqual([]);
  });

  it('is derived from the profile rather than from its role, which three of thirteen do not declare', () => {
    // `role` is free-form and optional. `collective-enroute` carries an eligibility rule and
    // declares no role at all, so a role-keyed note would miss it.
    expect(profile('collective-enroute').role).toBeUndefined();
    expect(unauthorableBlocksOf(profile('collective-enroute'))).toContain('constraints');
  });
});

/* -------------------------------------------------------------------------- *
 * Saving does not select — GitHub issue #113 § 4
 * -------------------------------------------------------------------------- */

/**
 * `dispatcherEditor.ts` with its comments blanked.
 *
 * The mount is DOM-bound and no Node test can call it — `honesty/derive.test.ts` excludes it on
 * exactly that ground — so the two clauses below are read off the source, which is
 * `main.progression.test.ts`'s method and carries its caveat: weak evidence about behaviour, strong
 * evidence about a line having been put back.
 */
function editorCode(): string {
  return readFileSync(fileURLToPath(new URL('./dispatcherEditor.ts', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
    .replace(/\/\/[^\n]*/gu, (line) => ' '.repeat(line.length));
}

describe('the two editors no longer disagree about what Save does', () => {
  /*
   * ## The defect, and which editor moved
   *
   * The dispatcher editor's Save wrote `dispatcherId: id` and opened the run tab, so **every** press
   * silently changed who was driving. The building editor's Save writes only `editingBuildingId`, so
   * *"Save as a new building"* left the next run on the old building. Two editors, two answers.
   *
   * **The dispatcher editor is the one that moved.** The building editor routes selection through
   * `stateRunningSaved`, whose docstring documents a week-contract forgery that a bare `buildingId`
   * write reintroduces — a drawn tower banked against a real scenario assignment — so *that*
   * indirection is load-bearing and copying its polarity here would have meant reintroducing the
   * thing it exists to prevent. What is copyable is its shape: Save files it and says so, and a
   * second, named verb runs it.
   */
  it('does not select what it files unless the press was the one that says it will', () => {
    const code = editorCode();
    const start = code.indexOf('function save(options:');
    expect(start, 'the save no longer takes its options').toBeGreaterThan(-1);
    const body = code.slice(start, code.indexOf('\n  }', start));
    // Conditional, and on the caller's own request. An unconditional `dispatcherId: id` is exactly
    // what issue #113 § 3 reported as *repeatedly pressing Save silently changes who is driving*.
    expect(body).toContain('...(options.select ? { dispatcherId: id } : {})');
    expect(body).not.toMatch(/^\s*dispatcherId: id,/mu);
  });

  it('refuses the name before it mints an id, so a refused save leaves nothing behind', () => {
    const code = editorCode();
    const start = code.indexOf('function save(options:');
    const body = code.slice(start, code.indexOf('\n  }', start));
    expect(body.indexOf('saveNameRefusalOf')).toBeGreaterThan(-1);
    expect(body.indexOf('saveNameRefusalOf')).toBeLessThan(body.indexOf('nextSavedId'));
  });

  it('leaves the building editor’s selection going through stateRunningSaved', () => {
    /*
     * The negative control on the decision above. If a later edit "fixes" issue #113 § 4 by adding a
     * bare `buildingId` write to the building editor's Save, this goes red — which is the whole
     * reason the two editors were reconciled in this direction rather than the other.
     */
    const building = readFileSync(
      fileURLToPath(new URL('./buildingEditor.ts', import.meta.url)),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
      .replace(/\/\/[^\n]*/gu, (line) => ' '.repeat(line.length));
    expect(building).toContain('context.update(stateRunningSaved(');
    expect(building).not.toMatch(/context\.update\(\{[^}]*\bbuildingId:/su);
  });

  it('offers the verb that does select, and says both halves on its own label', () => {
    // The loop still closes; it closes on a press that names what it does. Issue #65 built this
    // control, and it now carries the whole of the selection rather than half of it.
    expect(runThisDispatcherStateOf(specOf('collective'), profile('collective'), 'eta', 'collective')).toBe(
      'select',
    );
    const code = editorCode();
    expect(code).toContain('if (!save({ select: true })) return;');
  });
});
