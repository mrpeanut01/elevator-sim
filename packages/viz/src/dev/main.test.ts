/**
 * The wait-age legend — § 1.3 M4.
 *
 * The legend was the plainest instance of this repository's standing defect: `live/bands.ts`
 * authored four `legendLabel` strings and four colours, `bands.test.ts` pinned them, and **no
 * non-test caller ever put them on a page**. `index.html` rendered the legend's title with nothing
 * under it, so the stage drew riders in four colours and the row that says what those colours mean
 * was empty. Configured, unit-tested in isolation, never called — the shape the roadmap's standing
 * requirement is written about.
 *
 * The fix has two halves and this file asserts both:
 *
 * 1. **The entries are derived.** `waitLegendEntries()` is `WAIT_BANDS` and nothing else, so a band
 *    whose colour or wording moves takes the legend with it. A hand-written copy in `main.ts` would
 *    typecheck, look identical today, and be a fifth copy of a palette whose whole purpose is that
 *    the rail, the canvas and the report cannot disagree about what amber means.
 * 2. **The markup carries no second copy.** `index.html`'s `#legend` holds its title and no
 *    entries. If somebody types the four dots back into the page, the derivation above becomes
 *    decorative and the two copies start drifting the same afternoon.
 *
 * The third assertion goes the other way — the four strings and the four hexes are checked against
 * the **vendored handoff**, which is canonical for what the screen says (`DECISIONS.md` § D174).
 * Deriving from `WAIT_BANDS` is only right if `WAIT_BANDS` is the handoff's, and nothing else in
 * the suite reads the prototype to say so.
 *
 * There is no jsdom here (`vitest.config.ts` is `environment: 'node'` for every project), so the
 * decision is the pure export and the DOM writing is decision-free — `dom.ts`'s pattern.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type SimulationConfig,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { WAIT_BANDS, waitBandsAt } from '../live/bands.js';
import type { VizRecording } from '../contract/types.js';
import { buildLayout, type ShaftGeometry } from '../render/layout.js';
import type { VizFloor } from '../contract/types.js';

import type { BrowserResources } from './data.js';
import { recordRun } from '../record/recordRun.js';

import {
  deepLinkDefaultsOf,
  deepLinkSearchOf,
  deepLinkStateOf,
  provenanceLineOf,
  seedEntryOf,
  seekActionForKey,
  shaftsForBank,
  waitLegendEntries,
} from './main.js';
import { initialState, profileById, shiftRunConfigOf, type ViewerState } from './state.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** The vendored design handoff. Read as text, never edited — `docs/12-design-handoff.md`. */
async function handoff(): Promise<string> {
  return readFile(
    fileURLToPath(new URL('../../../../docs/design/elevator-sim-reimagined.dc.html', import.meta.url)),
    'utf8',
  );
}

/** The `#legend` element's own markup, from its opening tag to the first `</div>` after it. */
async function legendMarkup(): Promise<string> {
  const html = await indexHtml();
  const start = html.indexOf('id="legend"');
  expect(start, 'index.html has no #legend').toBeGreaterThan(-1);
  const end = html.indexOf('</div>', start);
  expect(end, '#legend is never closed').toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('the legend is the wait bands, not a copy of them', () => {
  it('takes every label and every colour from WAIT_BANDS, in the bands’ own order', () => {
    const entries = waitLegendEntries();
    expect(entries.map((entry) => entry.label)).toEqual(
      WAIT_BANDS.map((band) => band.legendLabel),
    );
    expect(entries.map((entry) => entry.color)).toEqual(WAIT_BANDS.map((band) => band.color));
  });

  it('states each band’s own boundary, derived from its two numbers and nothing else', () => {
    // The fourth entry is the one that needs it: `gave up` is the handoff's word for a band that
    // counts people **still standing** past two minutes, and `bands.ts` says so at length. A bare
    // label could carry that; a label with a head count on it is a figure.
    const entries = waitLegendEntries();
    expect(entries.map((entry) => entry.rangeLabel)).toEqual(['0–30 s', '30–60 s', '60–120 s', '120 s+']);
    // …and the same claim the other way round, so a band whose boundary moves takes the words with
    // it rather than leaving four hand-typed ranges describing the old ones.
    for (const [index, band] of WAIT_BANDS.entries()) {
      const entry = entries[index];
      expect(entry?.rangeLabel).toContain(String(band.fromS));
      if (band.toS !== undefined) expect(entry?.rangeLabel).toContain(String(band.toS));
    }
  });

  it('has one entry per band and four distinct colours', () => {
    // Four keys and three colours would be a legend that cannot key anything, and the stage draws
    // all four. The distinctness is the property; the count 4 is `WAIT_BANDS`' to decide.
    const entries = waitLegendEntries();
    expect(entries).toHaveLength(WAIT_BANDS.length);
    expect(new Set(entries.map((entry) => entry.color)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.label)).size).toBe(entries.length);
  });

  it('says nothing WAIT_BANDS does not say — no label is invented here', () => {
    const known = new Set(WAIT_BANDS.map((band) => `${band.legendLabel}·${band.color}`));
    for (const entry of waitLegendEntries()) {
      expect(known.has(`${entry.label}·${entry.color}`), entry.label).toBe(true);
    }
  });
});

describe('index.html holds no second copy of the legend', () => {
  it('carries the title and no entries of its own', async () => {
    const markup = await legendMarkup();
    expect(markup).toContain('legend-title');
    // The handoff draws each key as a `●` in the band's colour. One in the markup means somebody
    // wrote the palette into the page beside the module that already owns it.
    expect(markup, '#legend must not hard-code a band key').not.toContain('●');
    for (const band of WAIT_BANDS) {
      expect(markup, `#legend must not spell "${band.legendLabel}"`).not.toContain(
        band.legendLabel,
      );
      expect(markup, `#legend must not spell ${band.color}`).not.toContain(band.color);
    }
  });

  it('gives the title a manifest id, so the fill re-appends it rather than restating it', async () => {
    // The four entries are derived; the title is design copy and stays in the markup. The shell
    // needs a handle to keep it, and `elementMap.ts` is where a handle is declared.
    const markup = await legendMarkup();
    expect(markup).toContain('id="legend-title"');
  });
});

describe('keyboard seeking — KX-10', () => {
  it('maps the arrows to ∓5 s, and to ∓60 s with Shift', () => {
    expect(seekActionForKey('ArrowLeft', false)).toStrictEqual({ kind: 'by', deltaS: -5 });
    expect(seekActionForKey('ArrowRight', false)).toStrictEqual({ kind: 'by', deltaS: 5 });
    expect(seekActionForKey('ArrowLeft', true)).toStrictEqual({ kind: 'by', deltaS: -60 });
    expect(seekActionForKey('ArrowRight', true)).toStrictEqual({ kind: 'by', deltaS: 60 });
  });

  it('sends Home and End to the run’s own ends', () => {
    expect(seekActionForKey('Home', false)).toStrictEqual({ kind: 'toStart' });
    expect(seekActionForKey('End', false)).toStrictEqual({ kind: 'toEnd' });
    // Shift changes the arrows' distance and nothing about the ends — there is only one start.
    expect(seekActionForKey('Home', true)).toStrictEqual({ kind: 'toStart' });
    expect(seekActionForKey('End', true)).toStrictEqual({ kind: 'toEnd' });
  });

  it('answers nothing for every key it does not own', () => {
    // The transport's other keys keep their own handlers; a seek answered for Space or Escape
    // would swallow play/pause and the drawer's dismissal.
    for (const key of [' ', ',', '.', '[', ']', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'a']) {
      expect(seekActionForKey(key, false)).toBeUndefined();
      expect(seekActionForKey(key, true)).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The bank filter narrows the picture — SG-15, § D177
 * -------------------------------------------------------------------------- */

/** A two-bank building: two `express` shafts, two `local` ones. */
const BANKED_SHAFTS: readonly ShaftGeometry[] = [
  { carId: 'express-A', bankId: 'express', label: 'A', servedFloorIds: ['G', '10'] },
  { carId: 'express-B', bankId: 'express', label: 'B', servedFloorIds: ['G', '10'] },
  { carId: 'local-A', bankId: 'local', label: 'A', servedFloorIds: ['G', '2', '10'] },
  { carId: 'local-B', bankId: 'local', label: 'B', servedFloorIds: ['G', '2', '10'] },
];

const FILTER_FLOORS: readonly VizFloor[] = [
  { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
  { id: '2', index: 1, heightM: 4, isEntrance: false, isTransferFloor: false, population: 40 },
  { id: '10', index: 2, heightM: 30, isEntrance: false, isTransferFloor: true, population: 40 },
];

function layoutOf(shafts: readonly ShaftGeometry[]): ReturnType<typeof buildLayout> {
  return buildLayout({ width: 900, height: 640, floors: FILTER_FLOORS, shafts });
}

describe('the bank filter narrows what is laid out — SG-15', () => {
  it('moving the filter changes the picture: the laid-out shaft set is the chosen bank’s', () => {
    /*
     * § D177's rule, on structure rather than a bitmap: the filter's whole job is that the layout
     * a filtered stage draws holds different columns from the unfiltered one. This is the claim
     * that was false of the shipped viewer — `drawStage` handed `recording.shafts` whole to
     * `buildLayout` and a canvas hash was byte-identical across every option (`UX.md` SG-15).
     */
    const all = layoutOf(shaftsForBank(BANKED_SHAFTS, '').shafts);
    const local = layoutOf(shaftsForBank(BANKED_SHAFTS, 'local').shafts);
    expect(all.columns.map((column) => column.carId)).toStrictEqual([
      'express-A',
      'express-B',
      'local-A',
      'local-B',
    ]);
    expect(local.columns.map((column) => column.carId)).toStrictEqual(['local-A', 'local-B']);
    expect(local.columns.map((column) => column.carId)).not.toStrictEqual(
      all.columns.map((column) => column.carId),
    );
  });

  it('returning to “all” restores exactly the unfiltered default, untouched', () => {
    // The '' arm hands the same array through, not a copy — the unfiltered path is unchanged
    // from before the filter was wired, by identity rather than by resemblance.
    const result = shaftsForBank(BANKED_SHAFTS, '');
    expect(result.shafts).toBe(BANKED_SHAFTS);
    expect(result.filtered).toBe(false);
  });

  it('reports filtered only when the set actually narrowed', () => {
    expect(shaftsForBank(BANKED_SHAFTS, 'express').filtered).toBe(true);
    expect(shaftsForBank(BANKED_SHAFTS, 'express').shafts.map((shaft) => shaft.carId)).toStrictEqual(
      ['express-A', 'express-B'],
    );
    // A single-bank building filtered to its only bank narrows nothing.
    const single = BANKED_SHAFTS.filter((shaft) => shaft.bankId === 'local');
    expect(shaftsForBank(single, 'local')).toStrictEqual({ shafts: single, filtered: false });
  });

  it('falls back to the whole building when the filter names a bank the run does not have', () => {
    // A remembered selection can outlive the recording it was made against; an empty stage would
    // claim the building has no shafts, so the fallback is all of them, with no caption owed.
    expect(shaftsForBank(BANKED_SHAFTS, 'zeppelin')).toStrictEqual({
      shafts: BANKED_SHAFTS,
      filtered: false,
    });
  });
});

/* -------------------------------------------------------------------------- *
 * The URL follows the run — SH-09
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const readData = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/** The shipped data, exactly as `state.test.ts` builds it — the reader validates ids against it. */
function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(readData('elevator-specs.json'));
  const entries = [
    'garden-apartments',
    'midtown-office',
    'secure-tower',
    'mixed-use-high-rise',
    'vertical-city',
  ].map((id) => {
    const config = parseBuilding(readData(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(readData('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(readData('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();
const defaults = deepLinkDefaultsOf(resources);

/** The seven facts a deep link carries, read off a state for comparison. */
function linkedFieldsOf(state: ViewerState): Record<string, unknown> {
  return {
    buildingId: state.buildingId,
    dispatcherId: state.dispatcherId,
    seed: state.seed,
    shiftLengthS: state.shiftLengthS,
    tab: state.tab,
    railSegment: state.railSegment,
    mode: state.mode,
  };
}

describe('the URL round-trips — SH-09', () => {
  const scenarios: readonly { readonly name: string; readonly state: ViewerState }[] = [
    {
      name: 'everything moved',
      state: {
        ...initialState(resources, 987654321n),
        buildingId: 'vertical-city',
        dispatcherId: 'eta',
        shiftLengthS: 3600,
        tab: 'compare',
        railSegment: 'traffic',
        mode: 'advanced',
      },
    },
    {
      name: 'only the seed moved',
      state: { ...initialState(resources, 42n) },
    },
    {
      name: 'a building and a tab',
      state: { ...initialState(resources, 7n), buildingId: 'secure-tower', tab: 'scenarios' },
    },
  ];

  it('reproduces every linked field when the produced link is applied to a fresh state', () => {
    for (const scenario of scenarios) {
      const search = deepLinkSearchOf(scenario.state, defaults);
      const arrived = deepLinkStateOf(
        initialState(resources, 111111n), // a different session: different random seed
        resources,
        new URLSearchParams(search),
      );
      expect(linkedFieldsOf(arrived), scenario.name).toStrictEqual(linkedFieldsOf(scenario.state));
    }
  });

  it('omits defaults, so the first write after an untouched boot carries only the seed', () => {
    const untouched = initialState(resources, 42n);
    expect(deepLinkSearchOf(untouched, defaults)).toBe('?seed=42');
  });

  it('always carries the seed — the one param without which the link is a different run', () => {
    for (const scenario of scenarios) {
      const params = new URLSearchParams(deepLinkSearchOf(scenario.state, defaults));
      expect(params.get('seed'), scenario.name).toBe(scenario.state.seed.toString());
    }
  });

  it('writes the boot state to the address bar the moment boot completes — the SH-09 residual', async () => {
    /*
     * Driven red 2026-07-30 (§ D198): the boot URL stayed bare until the first interaction,
     * because `urlWritable` flips true only after boot's `runShift()` has already passed
     * `renderAll`/`syncUrl` — so a link copied before touching anything was a different run
     * wearing the same address, the exact hazard § D189's "the seed is always written" clause
     * exists for. § D189's third clause is *nothing writes before boot completes*, not *nothing
     * writes at boot*: the fix is one `syncUrl()` immediately after the flip, and with the
     * serializer's own omit-defaults rule an untouched boot writes exactly `?seed=…` (asserted
     * above). There is no DOM here, so the ordering is pinned at the source: the flip and the
     * write, adjacent, in that order.
     */
    const shell = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    // The flip, then the write, with nothing but whitespace and comments between them.
    expect(shell).toMatch(/urlWritable = true;(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)*syncUrl\(\);/);
  });

  it('declares every boot-scope binding above the boot sequence — the TDZ guard', async () => {
    /*
     * **The fourth occurrence of one mistake, and the first mechanised check for it.**
     *
     * `boot()` ends with `restoreSession(); applyTheme(); renderAll(); runShift();`. Function
     * declarations hoist, so those four resolve wherever they are written — but a `let` in the same
     * body does not, and `applyTheme` **assigns** `stageTheme`. Declared below the sequence, it
     * threw `Cannot access 'stageTheme' before initialization` on boot's second statement, and the
     * last-resort handler reported *The viewer did not start.* over a blank shell. `baseSpeed` sat
     * one statement behind it.
     *
     * `tsc` permits use-before-declaration through a closure, and this suite imports the module for
     * its pure exports only — the module guard means `main()` never runs under vitest — so the whole
     * suite stayed green with the page dead.
     *
     * This has now happened four times in this package: `started` in `bootstrap.ts`, `carBadgeHits`
     * here, and `stageTheme` and `baseSpeed` together. Two of them are written up in prose inside
     * this very file. **Prose that has been ignored twice is not a control**, so the ordering is
     * pinned at the source, in the idiom the assertion above already uses.
     *
     * The body is bounded at the first column-0 `}` so a `let` inside a later module-level function
     * is not mistaken for one of boot's — which is a real case: `provenanceLineOf` has one.
     */
    const shell = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    const start = shell.indexOf('function boot(');
    expect(start, 'boot() has been renamed — this guard is now watching nothing').toBeGreaterThan(0);
    const body = shell.slice(start, shell.indexOf('\n}\n', start));

    const sequence = body.indexOf('\n  restoreSession();');
    expect(sequence, 'boot’s sequence no longer starts with restoreSession()').toBeGreaterThan(0);

    const late = [...body.matchAll(/^ {2}let (\w+)/gmu)]
      .filter((match) => (match.index ?? 0) > sequence)
      .map((match) => match[1]);
    expect(
      late,
      'these boot-scope bindings are declared after boot’s own sequence runs, so any of the four ' +
        'calls that touches one throws before the first frame — see the TDZ note beside carBadgeHits',
    ).toEqual([]);
  });

  it('is not a vacuous guard — boot really does declare bindings and really does run a sequence', async () => {
    // Without this, the assertion above would pass on a `boot()` that had been renamed away, or on
    // a regex that had stopped matching anything.
    const shell = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    const body = shell.slice(shell.indexOf('function boot('), shell.indexOf('\n}\n', shell.indexOf('function boot(')));
    expect([...body.matchAll(/^ {2}let (\w+)/gmu)].length).toBeGreaterThan(10);
  });

  it('keeps the browser tier registered — it may be absent, it may not be deleted', async () => {
    /*
     * `boot.browser.test.ts` skips itself on a machine with no Chromium, which is right: a missing
     * browser is not a defect in this repository. But a tier that can skip is a tier that can be
     * quietly removed and never noticed, and § D220 § 4 names that failure beside flake.
     *
     * So the *registration* is asserted from a test that always runs. If somebody deletes the
     * project, this goes red and names what went with it.
     */
    const config = await readFile(fileURLToPath(new URL('../../../../vitest.config.ts', import.meta.url)), 'utf8');
    expect(config, 'the viz-browser project is gone from vitest.config.ts').toContain("name: 'viz-browser'");
    expect(config).toContain('*.browser.test.ts');
  });

  it('derives the defaults from initialState rather than restating them', () => {
    const opening = initialState(resources, 0n);
    expect(defaults).toStrictEqual({
      buildingId: opening.buildingId,
      dispatcherId: opening.dispatcherId,
      shiftLengthS: opening.shiftLengthS,
      tab: opening.tab,
      railSegment: opening.railSegment,
      mode: opening.mode,
    });
  });
});

describe('the deep-link reader refuses what the page cannot honour', () => {
  const base = (): ViewerState => initialState(resources, 5n);

  it('ignores a building the data does not ship', () => {
    const arrived = deepLinkStateOf(base(), resources, new URLSearchParams('?building=atlantis'));
    expect(arrived.buildingId).toBe(base().buildingId);
  });

  it('ignores a dispatcher the profiles file does not declare', () => {
    const arrived = deepLinkStateOf(base(), resources, new URLSearchParams('?dispatcher=psychic'));
    expect(arrived.dispatcherId).toBe(base().dispatcherId);
  });

  it('ignores a seed that is not a whole number, keeping the session’s own', () => {
    const arrived = deepLinkStateOf(base(), resources, new URLSearchParams('?seed=-3'));
    expect(arrived.seed).toBe(5n);
  });

  it('clamps the duration into the run lengths the page offers', () => {
    const short = deepLinkStateOf(base(), resources, new URLSearchParams('?duration=10'));
    const long = deepLinkStateOf(base(), resources, new URLSearchParams('?duration=999999'));
    expect(short.shiftLengthS).toBe(60);
    expect(long.shiftLengthS).toBe(7200);
  });

  it('refuses a tab and a rail segment this page does not have', () => {
    const arrived = deepLinkStateOf(
      base(),
      resources,
      new URLSearchParams('?tab=settings&rail=plumbing'),
    );
    expect(arrived.tab).toBe(base().tab);
    expect(arrived.railSegment).toBe(base().railSegment);
  });
});

/* -------------------------------------------------------------------------- *
 * The seed field refuses what it cannot show — TP-08
 * -------------------------------------------------------------------------- */

describe('the seed field — TP-08', () => {
  /*
   * Driven red 2026-07-30 (§ D198): typing `banana` silently re-ran at **seed 0** — the shipped
   * parse was `BigInt(raw.replace(/\D/g, '') || '0')`, so the field read `banana` while the footer
   * read *seed 0*. The parse is now `seedEntryOf`, and a non-numeric entry is a refusal, the same
   * stance the deep-link reader takes on `?seed=-3`.
   */
  it('refuses a non-numeric entry by name, and coerces nothing', () => {
    for (const raw of ['banana', '12a4', '-3', '1.5', '0x10', '1e6', ' 4 2 ']) {
      const entry = seedEntryOf(raw);
      expect(entry.kind, raw).toBe('refuse');
      if (entry.kind === 'refuse') expect(entry.message).toContain(raw.trim());
    }
  });

  it('never yields seed 0 for an entry that is not the digit 0', () => {
    // The exact shipped failure: the stripped-and-defaulted parse turned every wordish entry into
    // 0n. Only a literal zero may run seed 0.
    const entry = seedEntryOf('banana');
    expect(entry).toStrictEqual({ kind: 'refuse', message: expect.stringContaining('banana') as string });
    expect(seedEntryOf('0')).toStrictEqual({ kind: 'run', seed: 0n });
  });

  it('runs a whole number as itself, trimmed', () => {
    expect(seedEntryOf('987654321')).toStrictEqual({ kind: 'run', seed: 987654321n });
    expect(seedEntryOf('  42  ')).toStrictEqual({ kind: 'run', seed: 42n });
  });

  it('asks for a fresh draw on a blank field — the row’s own contract', () => {
    expect(seedEntryOf('')).toStrictEqual({ kind: 'draw' });
    expect(seedEntryOf('   ')).toStrictEqual({ kind: 'draw' });
  });
});

/* -------------------------------------------------------------------------- *
 * copy run names the traffic — TP-13
 * -------------------------------------------------------------------------- */

/** `--flag value` pairs of an emitted line, for asserting what it names. */
function flagsOf(line: string): ReadonlyMap<string, string> {
  const tokens = line.split(' ');
  const map = new Map<string, string>();
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    map.set(String(tokens[index]), String(tokens[index + 1]));
  }
  return map;
}

describe('copy run names the same run — TP-13', () => {
  it('names building, dispatcher, seed, duration and the non-default pattern, CLI-flag for flag', () => {
    const state: ViewerState = {
      ...initialState(resources, 123n),
      buildingId: 'garden-apartments',
      pattern: 'hotel',
      shiftLengthS: 900,
    };
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    const flags = flagsOf(provenance.line);
    expect(flags.get('--building')).toBe(state.buildingId);
    expect(flags.get('--dispatcher')).toBe(state.dispatcherId);
    expect(flags.get('--seed')).toBe(state.seed.toString());
    expect(flags.get('--duration')).toBe(String(state.shiftLengthS));
    expect(flags.get('--traffic')).toBe('hotel');
    // hotel is governed two-way, and the two-way cells diverge without the template flag —
    // measured, not assumed. See provenanceLineOf's docstring.
    expect(flags.get('--template')).toBe('lunch-two-way');
  });

  it('emits no --template when the pattern runs the CLI’s own default template', () => {
    const state: ViewerState = { ...initialState(resources, 9n), pattern: 'office-standard' };
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    expect(flagsOf(provenance.line).get('--traffic')).toBe('office-standard');
    expect(provenance.line).not.toContain('--template');
  });

  it('emits no traffic flags at all for the building’s own demand', () => {
    const provenance = provenanceLineOf(initialState(resources, 9n), resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    expect(provenance.line).not.toContain('--traffic');
    expect(provenance.line).not.toContain('--template');
  });

  it('the emitted flags rebuild the same run, leg for leg', () => {
    /*
     * The pin behind the whole task: the line is only provenance if the CLI, honouring it,
     * produces *this* run. The CLI side is built the way `planRun` builds it — the building's
     * trafficProfile swapped to the --traffic id, the shipped dispatcher profile object, the
     * --template value applied — and the legs must match bit for bit. The shipped line failed
     * exactly this on every non-default pattern (GAPS.md, TP-13).
     */
    const state: ViewerState = {
      ...initialState(resources, 123n),
      buildingId: 'garden-apartments',
      pattern: 'hotel',
      shiftLengthS: 900,
    };
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    const flags = flagsOf(provenance.line);

    const viewerRun = recordRun(shiftRunConfigOf(resources, state).config, {
      recordDecisions: false,
    });

    const raw = readData(`buildings/${String(flags.get('--building'))}.json`) as Record<
      string,
      unknown
    >;
    const swapped = parseBuilding({ ...raw, trafficProfile: flags.get('--traffic') });
    const template = flags.get('--template');
    const cliConfig: SimulationConfig = {
      building: resolveBuilding(swapped, resources.elevatorSpecs),
      dispatcherProfile: profileById(resources, [], String(flags.get('--dispatcher'))),
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      dispatcherProfiles: resources.dispatcherProfiles,
      seed: BigInt(String(flags.get('--seed'))),
      durationS: Number(flags.get('--duration')),
      onTimeout: 'report',
      ...(template === undefined
        ? {}
        : { demandTemplate: template as SimulationConfig['demandTemplate'] }),
    };
    const cliRun = recordRun(cliConfig, { recordDecisions: false });

    expect(viewerRun.recording.legs.length).toBeGreaterThan(0);
    expect(cliRun.recording.legs).toStrictEqual(viewerRun.recording.legs);
    expect(cliRun.recording.progress.boardedLegs).toStrictEqual(
      viewerRun.recording.progress.boardedLegs,
    );
  }, 120_000);

  it('refuses a saved pattern, naming it — no CLI flag loads one', () => {
    const state: ViewerState = { ...initialState(resources, 9n), pattern: 'my-lunch-rush' };
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(false);
    if (provenance.ok) return;
    expect(provenance.reasons.join(' ')).toContain('my-lunch-rush');
  });

  it('refuses any day but the first — growth and the day’s event have no flags', () => {
    const opening = initialState(resources, 9n);
    const state: ViewerState = { ...opening, week: { ...opening.week, day: 3 } };
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(false);
    if (provenance.ok) return;
    expect(provenance.reasons.join(' ')).toContain('day 3');
  });

  it('refuses a run with cars held out of service', () => {
    const state: ViewerState = { ...initialState(resources, 9n), outOfServiceCarIds: ['main-A'] };
    expect(provenanceLineOf(state, resources).ok).toBe(false);
  });

  it('refuses moved group levers', () => {
    const opening = initialState(resources, 9n);
    const state: ViewerState = { ...opening, levers: { ...opening.levers, express: true } };
    expect(provenanceLineOf(state, resources).ok).toBe(false);
  });
});

describe('the words and the colours are the handoff’s', () => {
  it('finds all four legend labels in the vendored prototype', async () => {
    // `:230–233`. The handoff wins every disagreement about what the screen says, so a label that
    // is not in it is one somebody wrote here.
    const design = await handoff();
    for (const band of WAIT_BANDS) {
      expect(design, `the handoff does not say "${band.legendLabel}"`).toContain(band.legendLabel);
    }
  });

  it('finds all four band colours in the vendored prototype', async () => {
    const design = await handoff();
    for (const band of WAIT_BANDS) {
      expect(design.toLowerCase(), `the handoff does not use ${band.color}`).toContain(
        band.color.toLowerCase(),
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The legend is a reading, not only a key — play-test issue #19
 * -------------------------------------------------------------------------- */

/**
 * The stage legend named the four colours and never said how many people were in any of them, so
 * the one surface that keys the stage could not tell a reader one person from thirty. The counts
 * come from `live/bands.ts`'s own tally at the playhead — the same scan the stage draws from — so
 * this is a restatement of a figure rather than a second one, and the assertions below are written
 * against `waitBandsAt` rather than against a remembered number.
 *
 * The left rail's mood bar (L2) already carried its counts and is deliberately untouched: it is a
 * different instrument on a different card, and `leftRail.ts` documents its KB-15 compliance.
 */
describe('every legend key carries its live head count', () => {
  /**
   * A run with queues in it.
   *
   * `midtown-office` rather than the opening building: Garden Apartments at the viewer's defaults
   * is six floors of almost nobody, and eleven samples of it found no instant with a single person
   * standing — which the vacuity guard below caught rather than passing quietly.
   */
  const recordingOf = (): VizRecording => {
    const state: ViewerState = { ...initialState(resources, 424242n), buildingId: 'midtown-office' };
    return recordRun(shiftRunConfigOf(resources, state).config, { recordDecisions: false })
      .recording;
  };

  it('reports no count at all before there is a run, rather than reporting zero', () => {
    // `—` and `0` are two different states: *nothing has happened* and *nobody is waiting*. The
    // second is a result, and a legend that printed `0` for the first would be claiming it.
    for (const entry of waitLegendEntries()) expect(entry.count).toBeUndefined();
    for (const entry of waitLegendEntries(undefined)) expect(entry.count).toBeUndefined();
  });

  it('takes every count from waitBandsAt, at the playhead, and never recomputes one', () => {
    const recording = recordingOf();
    const span = recording.endedAt - recording.startedAt;
    let sawSomebody = false;
    for (let step = 0; step <= 10; step += 1) {
      const at = recording.startedAt + (span * step) / 10;
      const bands = waitBandsAt(recording, at);
      const entries = waitLegendEntries(bands);
      expect(entries.map((entry) => entry.count)).toEqual(bands.counts.map((count) => count.count));
      // The row is a partition of the people standing right now, so it has to sum to the number
      // standing. `bands.ts` guarantees that against `frameAt(...).totalWaiting` by construction.
      const total = entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
      expect(total).toBe(bands.total);
      if (bands.total > 0) sawSomebody = true;
    }
    // A run in which nobody ever waits would make every assertion above vacuously true.
    expect(sawSomebody, 'no sampled instant had anybody standing — the test proves nothing').toBe(
      true,
    );
  });

  it('moves when the playhead moves — the counts are not a boot-time snapshot', () => {
    /*
     * The defect this guards is the one the wiring below fixes: `drawLegend` used to run only from
     * `renderAll`, which fires when the *state* changes. Counts drawn there would freeze at
     * whichever frame last changed the state while the playhead ran on underneath them.
     */
    const recording = recordingOf();
    const span = recording.endedAt - recording.startedAt;
    const readings = new Set<string>();
    for (let step = 0; step <= 20; step += 1) {
      const at = recording.startedAt + (span * step) / 20;
      readings.add(
        waitLegendEntries(waitBandsAt(recording, at))
          .map((entry) => String(entry.count))
          .join('·'),
      );
    }
    expect(readings.size).toBeGreaterThan(1);
  });
});

describe('the legend’s counts are wired to the 60 Hz path', () => {
  /** `main.ts` as text. The wiring is inside `boot()`, which no Node test can call. */
  async function mainSource(): Promise<string> {
    return readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
  }

  /** One nested function's body, from its declaration to the first close at its own indent. */
  async function bodyOf(name: string): Promise<string> {
    const source = await mainSource();
    const start = source.indexOf(`function ${name}(`);
    expect(start, `main.ts has no ${name}`).toBeGreaterThan(-1);
    const end = source.indexOf('\n  }', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('redraws the legend from renderLive, which is what the playhead runs', async () => {
    expect(
      await bodyOf('renderLive'),
      'renderLive does not call drawLegend, so the counts would state whichever frame last ' +
        'changed the state rather than the frame on screen',
    ).toContain('drawLegend(view)');
  });

  it('still redraws it from renderAll, so a state change is not the only trigger either', async () => {
    expect(await bodyOf('renderAll')).toContain('drawLegend(view)');
  });

  it('keys the row on the bands and not on the counts, so 60 Hz does not rebuild it', async () => {
    /*
     * `keyedFill` rebuilds whenever its key changes. A key carrying the counts would therefore
     * replace four entries sixty times a second, churning the accessibility tree and dropping a
     * hover mid-read — the exact cost `fillLegend`'s own docstring exists to avoid.
     */
    const body = await bodyOf('drawLegend');
    const key = /fillLegend\(\s*(.+?),\s*\(\) =>/s.exec(body)?.[1] ?? '';
    expect(key, 'drawLegend no longer calls fillLegend with a key').not.toBe('');
    expect(key).toContain('entry.label');
    expect(key).toContain('entry.color');
    expect(key, 'the fill key carries a figure that moves every frame').not.toContain('count');
  });
});

describe('index.html styles the count without restating a band', () => {
  it('declares .legend-count once, and still spells no band word or colour', async () => {
    const html = await indexHtml();
    expect(html.split('.legend-count {')).toHaveLength(2);
    const markup = await legendMarkup();
    for (const band of WAIT_BANDS) {
      expect(markup).not.toContain(band.legendLabel);
      expect(markup).not.toContain(band.color);
    }
  });
});
