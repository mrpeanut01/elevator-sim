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

import { BAND_COLORS, WAIT_BANDS, bandOf, waitBandsAt } from '../live/bands.js';
import * as tokens from '../render/tokens.js';
import type { VizRecording } from '../contract/types.js';
import { buildLayout, type ShaftGeometry } from '../render/layout.js';
import type { VizFloor } from '../contract/types.js';

import type { BrowserResources } from './data.js';
import { recordRun } from '../record/recordRun.js';

import { disclosureItems } from '../mode/disclosure.js';
import type { DisclosureItem } from '../mode/types.js';

import { FREE_PLAY_RATES, isSeedText, SEED_MAX_DIGITS } from '../menu/menu.js';

import {
  deepLinkDefaultsOf,
  deepLinkSearchOf,
  deepLinkStateOf,
  provenanceLineOf,
  shareLinkOf,
  seedEntryOf,
  seekActionForKey,
  shaftsForBank,
  stageLayoutFor,
  transportStatusOf,
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

/* -------------------------------------------------------------------------- *
 * The transport strip reads the disclosure layer — GitHub issue #71
 * -------------------------------------------------------------------------- */

describe('the status strip is worded by the reader’s mode', () => {
  /**
   * A real run's disclosure items, built the way `dev/main.ts` builds them.
   *
   * `midtown-office` for `recordingOf`'s measured reason a few hundred lines down: Garden
   * Apartments at the viewer's defaults is six floors of almost nobody, and a run with no queue in
   * it is a run whose figures cannot tell two modes apart.
   */
  function itemsOf(): readonly DisclosureItem[] {
    const state: ViewerState = { ...initialState(resources, 424242n), buildingId: 'midtown-office' };
    const recording = recordRun(shiftRunConfigOf(resources, state).config, {
      recordDecisions: false,
    }).recording;
    return disclosureItems({
      recording,
      dispatcherName: recording.dispatcherProfileId,
      /*
       * Empty, and it is the honest value here rather than a shortcut. `dev/main.ts`'s own
       * `lockedOutAt` is a shell closure that needs the loaded building document and the running
       * profile; what it feeds is the `locked-out` item, which neither figure below reads. An empty
       * set means *this caller does not know*, which `lockedOut.ts` is explicit is a different
       * claim from *this building restricts nothing* — and neither claim touches `awt` or `wt95`.
       */
      lockedOut: [],
    });
  }

  it('says something different in each mode — § D230', () => {
    /*
     * **Move the control and require the rendering to change** — the standing requirement's form
     * for a disclosure control. § D240 § 2 measured the old state: `AWT · WT95` was byte-identical
     * in both modes, one of six strings that made Casual *less* informative than Engineer for the
     * audience it names — because this line was built from `recording.summary` directly while the
     * per-mode renderings were computed on every recording and dropped with `void itemsIn;`.
     */
    const items = itemsOf();
    const advanced = transportStatusOf(items, 'advanced');
    const basic = transportStatusOf(items, 'basic');
    expect(advanced, 'the strip says nothing at all about a run that happened').toBeDefined();
    expect(basic, 'Casual is drawing no status line').toBeDefined();
    expect(basic, 'the disclosure selector was moved and the strip did not change').not.toBe(
      advanced,
    );
  }, 300_000);

  it('carries each figure’s n, which is R13 clause one', () => {
    /*
     * The honesty search found this on the **shipped** strip, the moment the line entered the
     * corpus: `AWT 13.1 s · WT95 27.4 s` is an estimate with no count beside it, and *"`n = 5` is
     * not a caveat on `11.3 s`; it is part of what `11.3 s` means"*. Six generated cases failed in
     * both modes. The count was on the `Rendering` all along and the strip was not reading it.
     */
    const line = transportStatusOf(itemsOf(), 'advanced') ?? '';
    expect(line, `the strip publishes a figure with no sample: ${line}`).toContain('n =');
  }, 300_000);

  it('says nothing at all when there is no run', () => {
    // `undefined`, never `''`. The strip's transient messages share this element — the copied
    // provenance line, the batch progress — and blanking one of them would take a sentence off
    // the screen at the moment a reader is being told something.
    expect(transportStatusOf([], 'advanced')).toBeUndefined();
  });

  it('carries a refused mean’s reason, and carries it once', () => {
    /*
     * Two regressions this routing had on the way, both found by printing what the function
     * returns rather than by reasoning about it, and both worse than the line being replaced.
     *
     * The first draft dropped the reason entirely — `average wait suppressed (n = 201 rides)` and
     * nothing about why, where the old strip read `AWT suppressed — <the run's own reason>`. That
     * is R3 with the refusal deleted, on the surface a reader glances at without opening a panel.
     *
     * The second appended it per figure and printed a 300-character sentence **twice**, because
     * `awt` and `wt95` are refused by one `awtIsValid` call and carry the same words.
     *
     * `midtown-office` at the viewer's defaults is a run whose mean really is refused, which is
     * what makes this case reachable at all — asserted below rather than assumed.
     */
    const items = itemsOf();
    const line = transportStatusOf(items, 'advanced') ?? '';
    expect(line, 'this fixture no longer refuses its mean, so the case is vacuous').toContain(
      'suppressed',
    );
    const reason = items.find((item) => item.id === 'awt')?.advanced.note ?? '';
    expect(reason, 'the refused figure carries no reason to route').not.toBe('');
    expect(line, 'the strip refuses a figure and does not say why').toContain(reason);
    expect(
      line.split(reason).length - 1,
      'the same refusal is printed once per figure — twice, for one gate',
    ).toBe(1);
  }, 300_000);

  it('withholds the whole-run line while the playhead is short of the end — docs/19 defect 4', () => {
    /*
     * The audit watched this line carry the finished day's figures — `average wait suppressed
     * (n = 236 rides) … the queues never settled during this run`, past tense — from the first
     * second of playback. The figures are folds of the whole recording, so short of `endedAt` the
     * line speaks the *so far* register: it names what is withheld and when it files, and prints
     * no figure, no count and no past-tense verdict. At the end, the whole-run line, unchanged.
     */
    const items = itemsOf();
    for (const mode of ['advanced', 'basic'] as const) {
      const whole = transportStatusOf(items, mode) ?? '';
      const early = transportStatusOf(items, mode, { atS: 60, endedAt: 1800 }) ?? '';
      expect(early, 'the mid-run register is missing').not.toBe('');
      expect(early, 'the whole-run line leaked past the playhead').not.toBe(whole);
      expect(early).toContain('file when the playhead reaches the end');
      // No figure and no sample — the only digits allowed are a label's own ("95th-percentile").
      expect(early, 'the so-far register may carry no figure').not.toMatch(/\d+(\.\d+)?\s*s\b/);
      expect(early, 'the so-far register may carry no sample').not.toContain('n =');
      expect(early, 'the whole-run refusal leaked into the so-far register').not.toContain(
        'suppressed',
      );
      // At the end, and for a caller with no playhead at all, the line is the whole-run one.
      expect(transportStatusOf(items, mode, { atS: 1800, endedAt: 1800 })).toBe(whole);
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * The scenery yields to the building — GitHub issue #41
 * -------------------------------------------------------------------------- */

describe('the stage asks for less gutter when the shafts do not fit', () => {
  /**
   * Vertical City's thirty-five shafts, on a canvas the size the stage gets at a 1920 px viewport.
   *
   * The width is the **canvas box**, not the window: the shell puts two rails beside the stage, so
   * 1920 of screen is about 1200 of plot. 1232 is the figure `MIN_PLOT_SHARE`'s own note measures
   * against, so it is the one used here rather than a new one invented for this case.
   */
  const CANVAS = { width: 1232, height: 720 };

  const FLOOR_IDS = Array.from({ length: 10 }, (_ignored, index) => `L${String(index)}`);

  const shaftsOf = (count: number): readonly ShaftGeometry[] =>
    Array.from({ length: count }, (_ignored, index) => ({
      carId: `car-${String(index)}`,
      bankId: 'main',
      label: `C${String(index)}`,
      servedFloorIds: FLOOR_IDS,
    }));

  const floors: readonly VizFloor[] = FLOOR_IDS.map((id, index) => ({
    id,
    name: id,
    index,
    heightM: index * 3.5,
    population: 40,
    isEntrance: index === 0,
    isTransferFloor: false,
  }));

  it('draws every shaft of the tallest shipped building at a desktop canvas — issue #41', () => {
    /*
     * Measured before the change: **Vertical City shows 27 of 35 at 1920**. `RS-05`'s *"showing 27
     * of 35"* notice was doing its job and saying so, and eight shafts of a building whose whole
     * subject is its shafts were off the picture on the largest screen anybody has — because
     * `QUEUE_GUTTER_PX` and `OVERLAY_WIDTH_PX` were handed over unchanged whatever was being drawn.
     */
    const layout = stageLayoutFor({ ...CANVAS, floors, shafts: shaftsOf(35), wantsOverlay: true });
    expect(layout.hiddenShaftCount, 'shafts are still being dropped at a desktop canvas').toBe(0);
    expect(layout.columns).toHaveLength(35);
  });

  it('is inert for a building that already fitted', () => {
    /*
     * The other direction, and the one that would be expensive to get wrong: a ladder that yielded
     * scenery it did not need to would take the live-metrics panel off a six-shaft building for no
     * reason. The first rung is the request that shipped, so a picture that was right does not move.
     */
    const roomy = stageLayoutFor({ ...CANVAS, floors, shafts: shaftsOf(6), wantsOverlay: true });
    const asShipped = buildLayout({
      ...CANVAS,
      floors,
      shafts: shaftsOf(6),
      gutterRightPx: 280,
      overlayWidthPx: 250,
    });
    expect(roomy.overlay, 'a building that fits lost its metrics panel').toBeDefined();
    expect(roomy.plot).toEqual(asShipped.plot);
  });

  it('never re-enables an overlay RS-03 has dropped', () => {
    // `wantsOverlay` answers a different question — the canvas is too narrow for the panel at all —
    // and a rung that turned it back on would be this function overruling that rule.
    const narrow = stageLayoutFor({
      width: 600,
      height: 720,
      floors,
      shafts: shaftsOf(35),
      wantsOverlay: false,
    });
    expect(narrow.overlay).toBeUndefined();
  });

  it('still draws a picture when nothing on the ladder fits them all', () => {
    // A stage that refused to draw would turn *some shafts do not fit* into *no picture at all*,
    // which is § D234's own defect. `RS-05`'s notice is what covers this case, and it needs columns.
    const phone = stageLayoutFor({
      width: 360,
      height: 640,
      floors,
      shafts: shaftsOf(35),
      wantsOverlay: false,
    });
    expect(phone.columns.length).toBeGreaterThan(0);
    expect(phone.hiddenShaftCount).toBeGreaterThan(0);
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
      pattern: opening.pattern,
      windowStartS: opening.windowStartS,
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

  it('ignores one past the bound too — the third way a seed gets in, issue #111(c)', () => {
    // A link is the third door, after the transport field and the menu's. A rule that held on two
    // of three is the drift the shared predicate exists to stop: an address carrying twenty-one
    // digits would have run something no field in this product would have accepted.
    const overlong = `?seed=${'1'.repeat(SEED_MAX_DIGITS + 1)}`;
    expect(deepLinkStateOf(base(), resources, new URLSearchParams(overlong)).seed).toBe(5n);

    const longest = '1'.repeat(SEED_MAX_DIGITS);
    expect(
      deepLinkStateOf(base(), resources, new URLSearchParams(`?seed=${longest}`)).seed,
      'the bound refuses a seed that is exactly as long as the rule allows',
    ).toBe(BigInt(longest));
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

  it('takes the bound the menu takes, and names the count when it refuses — issue #111(c)', () => {
    /*
     * **The two seed fields had different contracts, the other way round from the report.**
     *
     * Issue #111(c) names this field as the strict one, citing a `maxlength="20"` that exists
     * nowhere in `packages/viz` — its DevTools reading of `maxlength=-1` is an *absent* attribute.
     * The real difference ran the other way: this took `/^\d+$/`, unbounded, while `menu/menu.ts`
     * bounds a seed at twenty digits so it survives JSON and a database byte for byte (§ D214 § 3).
     *
     * This side moved because the asymmetry is not symmetric: a run started here can be posted to a
     * board, so an over-long seed was accepted by the field, run, drawn into the footer, and then
     * refused at post time by a rule nothing on this screen had mentioned. Both now ask
     * `isSeedText`, which is the single predicate.
     */
    const longest = '1'.repeat(SEED_MAX_DIGITS);
    expect(seedEntryOf(longest)).toStrictEqual({ kind: 'run', seed: BigInt(longest) });

    const overlong = '1'.repeat(SEED_MAX_DIGITS + 1);
    const refused = seedEntryOf(overlong);
    expect(refused.kind).toBe('refuse');
    // Named by count, because "that is not a whole number" is unhelpful about a string of digits —
    // a reader has to be told what to cut, not that they were wrong.
    if (refused.kind === 'refuse') {
      expect(refused.message).toContain(String(overlong.length));
      expect(refused.message).toContain(String(SEED_MAX_DIGITS));
    }
  });

  it('is the same rule the menu applies, rather than a second one that agrees today', () => {
    /*
     * The guard that makes the sentence above true tomorrow. Two regexes that happen to match are
     * exactly the shape this repository keeps finding stale, so the claim asserted is not *these
     * two agree on some examples* but *this field consults the menu's own predicate*.
     */
    for (const raw of ['0', '7', '20260804', '1'.repeat(20), 'abc', '1.5', '-1', '', '1'.repeat(21)]) {
      const entry = seedEntryOf(raw);
      // The blank is the one honest divergence, and it is a divergence about *nothing*, not about
      // what a seed is: this field is always showing the seed that is running, so an empty box asks
      // for a draw. The menu's field is naming a run that does not exist yet and refuses a blank.
      if (raw.trim() === '') {
        expect(entry.kind).toBe('draw');
        continue;
      }
      expect(entry.kind === 'run', raw).toBe(isSeedText(raw.trim()));
    }
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

/* -------------------------------------------------------------------------- *
 * The two share artefacts — GitHub issue #118 § 2
 * -------------------------------------------------------------------------- */

/** A state carrying the two axes Free Play asks for and the pattern select cannot express. */
function freePlayState(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    ...initialState(resources, 555n),
    playMode: 'free-play',
    buildingId: 'garden-apartments',
    shiftLengthS: 900,
    freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 9 },
    ...overrides,
  };
}

describe('the CLI line names the command — issue #118', () => {
  it('starts with the binary `packages/cli` actually installs, and its subcommand', async () => {
    /*
     * The issue's first complaint about this artefact: *"flags with no command name, for someone
     * who has the repository checked out"*. The name is asserted against the manifest rather than
     * against itself, because `viz` cannot import `cli` — so a rename of the binary would otherwise
     * leave a clipboard line naming a command that no longer exists, with nothing red.
     */
    const manifest = JSON.parse(
      await readFile(fileURLToPath(new URL('../../../cli/package.json', import.meta.url)), 'utf8'),
    ) as { readonly bin: Readonly<Record<string, string>> };
    const [binary] = Object.keys(manifest.bin);
    expect(binary).toBeDefined();

    const provenance = provenanceLineOf(initialState(resources, 9n), resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    expect(provenance.line.startsWith(`${String(binary)} run --building `)).toBe(true);
  });
});

describe('the CLI line names Free Play’s own axes — issue #118', () => {
  it('emits --rate for a rate the player chose, and none for the building’s own profile', () => {
    const chosen = provenanceLineOf(freePlayState(), resources);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(flagsOf(chosen.line).get('--rate')).toBe('9');

    /*
     * `null` is *the building's own profile* — a selection rather than a missing one — and the CLI
     * expresses it by having no `--rate` at all. Emitting `--rate 0` would be a run nobody asked
     * for; emitting the profile's number would pin a figure `data/` may move.
     */
    const own = provenanceLineOf(
      freePlayState({ freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: null } }),
      resources,
    );
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(own.line).not.toContain('--rate');
  });

  it('emits Free Play’s template, and lets it win over the pattern’s', () => {
    /*
     * `shiftRunConfigOf` applies `freePlay.demandTemplateId` **over** the pattern's, last, for its
     * own stated reason. A line that named the pattern's template would spell a run the viewer is
     * not running — which is the defect this whole function exists to have closed once.
     */
    const state = freePlayState({
      pattern: 'hotel',
      freePlay: { demandTemplateId: 'office-down-peak', arrivalRatePctPop5min: null },
    });
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    const flags = flagsOf(provenance.line);
    expect(flags.get('--traffic')).toBe('hotel');
    // `hotel` alone would have emitted `lunch-two-way`; Free Play's choice is the later word.
    expect(flags.get('--template')).toBe('office-down-peak');
  });

  it('names the part of the day as a clock range, from the template’s own hour', () => {
    /*
     * `office-day` starts at 08:00 (`startOfDayMin` 480) and its morning rush is the 1 800 s at
     * 1 800 s in. The CLI's `dayWindowOf` computes `windowStartS = (fromMin − startOfDayMin) × 60`;
     * this is that arithmetic run backwards, so the flag's value is a fact about the same record
     * rather than a second opinion about where the day begins.
     */
    const state = freePlayState({
      shiftLengthS: 1800,
      windowStartS: 1800,
      freePlay: { demandTemplateId: 'office-day', arrivalRatePctPop5min: null },
    });
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    expect(flagsOf(provenance.line).get('--part')).toBe('08:30-09:00');
    /*
     * …and **no `--duration` beside it**, because the CLI refuses the pair. `office-day`'s phases
     * are authored, so `templateOverrides.durationS` is rejected outright (§ D285) and a line
     * carrying both is one the CLI answers with an error rather than a run. Driven, not argued:
     * `--template office-day --part 08:30-09:00 --duration 1800` fails at the command line and the
     * same line without `--duration` runs.
     */
    expect(provenance.line).not.toContain('--duration');
  });

  it('rebuilds the windowed run leg for leg, which is the only thing that makes it provenance', () => {
    /*
     * The pin. A `--part` that parsed and named a different half-hour would satisfy every
     * assertion above and reproduce nothing, so the flags are turned back into a `SimulationConfig`
     * the way `planRun`'s `dayWindowOf` does — `windowStartS = (fromMin − startOfDayMin) × 60` —
     * and the legs must match the viewer's bit for bit.
     */
    const state = freePlayState({
      buildingId: 'garden-apartments',
      shiftLengthS: 1800,
      windowStartS: 1800,
      freePlay: { demandTemplateId: 'office-day', arrivalRatePctPop5min: null },
    });
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    const flags = flagsOf(provenance.line);

    const range = String(flags.get('--part')).split('-');
    const minutesOf = (clock: string): number => {
      const [hours, minutes] = clock.split(':').map(Number);
      return Number(hours) * 60 + Number(minutes);
    };
    const record = resources.trafficProfiles.demandTemplates.find(
      (entry) => entry.id === flags.get('--template'),
    );
    const startOfDayMin = record?.startOfDayMin ?? 0;
    const cliConfig: SimulationConfig = {
      building: resources.buildings.find((entry) => entry.id === state.buildingId) as never,
      dispatcherProfile: profileById(resources, [], String(flags.get('--dispatcher'))),
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      dispatcherProfiles: resources.dispatcherProfiles,
      seed: BigInt(String(flags.get('--seed'))),
      onTimeout: 'report',
      demandTemplate: String(flags.get('--template')) as SimulationConfig['demandTemplate'],
      windowStartS: (minutesOf(String(range[0])) - startOfDayMin) * 60,
      windowEndS: (minutesOf(String(range[1])) - startOfDayMin) * 60,
    };

    const viewerRun = recordRun(shiftRunConfigOf(resources, state).config, {
      recordDecisions: false,
    });
    const cliRun = recordRun(cliConfig, { recordDecisions: false });
    expect(viewerRun.recording.legs.length).toBeGreaterThan(0);
    expect(cliRun.recording.legs).toStrictEqual(viewerRun.recording.legs);
  }, 120_000);

  it('refuses a windowed run on a template with no hour, rather than running the whole period', () => {
    /*
     * `constant-iso` declares no `startOfDayMin` (§ D244), so there is no clock for `--part` to
     * name. A line without it would be honoured by the CLI and turn into the whole two hours —
     * a different run wearing this one's provenance, which is the one thing this control may not
     * produce.
     */
    const state = freePlayState({
      shiftLengthS: 7200,
      windowStartS: 1800,
      freePlay: { demandTemplateId: 'constant-iso', arrivalRatePctPop5min: null },
    });
    const provenance = provenanceLineOf(state, resources);
    expect(provenance.ok).toBe(false);
    if (provenance.ok) return;
    expect(provenance.reasons.join(' ')).toContain('constant-iso');
    expect(provenance.reasons.join(' ')).toContain('declares no hour');
  });
});

describe('copy run copies a link — issue #118 § 2', () => {
  it('is the page’s own address with the run on it', () => {
    const link = shareLinkOf(
      freePlayState({ buildingId: 'secure-tower' }),
      resources,
      defaults,
      'https://elevator.example/play',
    );
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(link.line.startsWith('https://elevator.example/play?')).toBe(true);
    const params = new URLSearchParams(link.line.slice(link.line.indexOf('?')));
    expect(params.get('seed')).toBe('555');
    expect(params.get('building')).toBe('secure-tower');
    expect(params.get('duration')).toBe('900');
    expect(params.get('template')).toBe('rise-and-fall');
    expect(params.get('rate')).toBe('9');
  });

  it('omits the building when it is the page’s own — the address stays readable', () => {
    // `garden-apartments` is `initialState`'s opening building, so a link from it says nothing
    // about the building and the recipient's page opens on the same one. The omit-defaults rule,
    // and the reason `deepLinkDefaultsOf` derives from `initialState` rather than restating it.
    const link = shareLinkOf(freePlayState(), resources, defaults, 'https://elevator.example/play');
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(new URLSearchParams(link.line.slice(link.line.indexOf('?'))).get('building')).toBeNull();
    const arrived = deepLinkStateOf(
      initialState(resources, 1n),
      resources,
      new URLSearchParams(link.line.slice(link.line.indexOf('?'))),
    );
    expect(arrived.buildingId).toBe('garden-apartments');
  });

  it('refuses through the same predicate the CLI line refuses through', () => {
    /*
     * One answer to *can this run be reproduced elsewhere from its own selection?* — `docs/16` S5.
     * A link is where a second, looser answer would cost the most: it would send somebody a page
     * that runs a different building under this run's name, and neither of them would know.
     */
    const mine = freePlayState({ buildingId: 'my-tower' });
    const link = shareLinkOf(mine, resources, defaults, 'https://elevator.example/play');
    expect(link.ok).toBe(false);
    if (link.ok) return;
    expect(link.reasons.join(' ')).toContain('my-tower');
    expect(link.reasons).toStrictEqual(
      provenanceLineOf(mine, resources).ok ? [] : (provenanceLineOf(mine, resources) as { reasons: readonly string[] }).reasons,
    );
  });
});

describe('the four new params round-trip, and they reach the run', () => {
  it('reproduces the pattern, the window and both Free Play axes', () => {
    const state = freePlayState({
      pattern: 'hotel',
      windowStartS: 1800,
      shiftLengthS: 1800,
      freePlay: { demandTemplateId: 'office-day', arrivalRatePctPop5min: 4 },
    });
    const arrived = deepLinkStateOf(
      initialState(resources, 111111n),
      resources,
      new URLSearchParams(deepLinkSearchOf(state, defaults)),
    );
    expect(arrived.pattern).toBe('hotel');
    expect(arrived.windowStartS).toBe(1800);
    expect(arrived.freePlay).toStrictEqual({
      demandTemplateId: 'office-day',
      arrivalRatePctPop5min: 4,
    });
    expect(arrived.buildingId).toBe(state.buildingId);
    expect(arrived.seed).toBe(state.seed);
  });

  it('carries “the building’s own profile” as a rate rather than as a missing param', () => {
    // `null` is a selection, not an absence — `scope/surface.ts` says so of the field, and a link
    // that dropped the template with it would arrive on a page running a different shape.
    const state = freePlayState({
      freePlay: { demandTemplateId: 'lunch-two-way', arrivalRatePctPop5min: null },
    });
    const search = deepLinkSearchOf(state, defaults);
    expect(new URLSearchParams(search).get('rate')).toBeNull();
    const arrived = deepLinkStateOf(initialState(resources, 1n), resources, new URLSearchParams(search));
    expect(arrived.freePlay).toStrictEqual({
      demandTemplateId: 'lunch-two-way',
      arrivalRatePctPop5min: null,
    });
  });

  it('ignores a template and a traffic profile the data does not ship', () => {
    const arrived = deepLinkStateOf(
      initialState(resources, 5n),
      resources,
      new URLSearchParams('?template=jetpack&traffic=teleport&rate=4'),
    );
    // Not coerced into the nearest thing that parses, and not a `freePlay` carrying a rate with no
    // template — the same refusal shape the other seven params take.
    expect(arrived.freePlay).toBeUndefined();
    expect(arrived.pattern).toBe('building');
  });

  /**
   * **The rate a link may ask for is bounded** — the UI readiness audit's B3, second axis.
   *
   * `rate` was parsed by `/^\d+(\.\d+)?$/` and honoured whatever it said, and Free Play's own
   * validator only requires `rate > 0`. A shared address could therefore ask a stranger's browser
   * for arbitrarily much demand, on a run that was already synchronous: measured on
   * `midtown-office`/`nearest-car`/1 800 s, rate 200 is 6 588 ms against rate 12's 447 ms, and the
   * cell the audit measured the freeze on is four times longer on a building three times bigger.
   *
   * The bound is `menu/menu.ts#FREE_PLAY_RATES`' top rung, **read rather than restated**, so the
   * ladder stays the single authority. The precedent is `seed`'s, four params up: *"an address
   * carrying twenty-one digits would run something no field in this product would have accepted"*
   * (issue #111(c)). This is that rule at the axis that had none.
   */
  it('clamps a rate no control in this product offers, and leaves the ones it does alone', () => {
    const rateOf = (search: string): number | null | undefined =>
      deepLinkStateOf(initialState(resources, 7n), resources, new URLSearchParams(search)).freePlay
        ?.arrivalRatePctPop5min;
    const highest = FREE_PLAY_RATES.reduce<number>(
      (top, rate) => (rate === null ? top : Math.max(top, rate)),
      0,
    );

    // The measured case: 200 %/5 min is 6 588 ms of somebody else's browser on the *small*
    // building, and nothing anywhere refused it.
    expect(rateOf('?template=rise-and-fall&rate=200')).toBe(highest);
    expect(rateOf('?template=rise-and-fall&rate=1000000')).toBe(highest);
    // Every rung the menu offers arrives unchanged, which is what makes this a bound rather than a
    // second opinion about what a reasonable rate is.
    for (const rate of FREE_PLAY_RATES) {
      if (rate === null) continue;
      expect(rateOf(`?template=rise-and-fall&rate=${String(rate)}`)).toBe(rate);
    }
    // Zero is not a rate. It arrives as `null` — *the building's own profile* — which is the value
    // an absent or unparseable `rate` already produced, so an honest link is unaffected.
    expect(rateOf('?template=rise-and-fall&rate=0')).toBeNull();
    expect(rateOf('?template=rise-and-fall')).toBeNull();
  });

  it('and the link moves the run — the legs differ when the rate does', () => {
    /*
     * The standing requirement (`docs/05-roadmap.md`), pointed at a URL parameter, and compared on
     * the **legs**: a param that parses, round-trips and moves no passenger is the dead seam this
     * repository has shipped eleven times, wearing a share button.
     *
     * Everything but `rate` is held equal — same building, same seed, same dispatcher, same length,
     * same template — so the rate is the only thing that moved. Neither arm may be empty: a
     * fingerprint of zero legs equals any other fingerprint of zero legs.
     */
    const legsFor = (search: string): string => {
      const arrived = deepLinkStateOf(
        initialState(resources, 4242n),
        resources,
        new URLSearchParams(search),
      );
      return JSON.stringify(
        recordRun(shiftRunConfigOf(resources, arrived).config, {
          recordDecisions: false,
        }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
      );
    };
    const base = '?building=garden-apartments&seed=4242&duration=900&template=rise-and-fall';
    const quiet = legsFor(`${base}&rate=3`);
    const busy = legsFor(`${base}&rate=12`);
    expect(quiet).not.toBe('[]');
    expect(busy).not.toBe('[]');
    expect(quiet).not.toBe(busy);
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
    /*
     * **Read where the colour now lives — § D251.** `WaitBandDefinition.color` was `#3fb27f` and
     * is `var(--band-0)`, because the four hexes here were a second copy of the palette that no
     * `:root[data-theme]` block could repaint — nineteen light-mode AA failures' worth. The claim
     * this case makes is unchanged and the chain that carries it is three links long, each pinned
     * by its own test: `WAIT_BANDS` names `--band-0…3` (`live/palette.test.ts`), `index.html`
     * declares them at `render/tokens.ts`'s values in both modes (`dev/tokens.test.ts`), and the
     * dark values are the handoff's — which is what this asserts.
     */
    const design = (await handoff()).toLowerCase();
    expect(BAND_COLORS).toEqual([
      'var(--band-0)',
      'var(--band-1)',
      'var(--band-2)',
      'var(--band-3)',
    ]);
    const values = [
      tokens.BAND_SETTLING,
      tokens.BAND_WAITING,
      tokens.BAND_LONG,
      tokens.BAND_ABANDONED,
    ];
    expect(values).toHaveLength(WAIT_BANDS.length);
    for (const value of values) {
      expect(design, `the handoff does not use ${value}`).toContain(value.toLowerCase());
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

/* -------------------------------------------------------------------------- *
 * The cold-start wait — § D247 § 6
 * -------------------------------------------------------------------------- */

/**
 * The wait ladder grades the **player's** wait in the mood bar's own words, and the grading is
 * checked against the mood bar.
 *
 * The joke only works if it is true. `WAIT_LADDER` is deliberately not derived from `WAIT_BANDS` —
 * it is chrome about a person staring at a browser, not a statistic about a run, and routing it
 * through the run-figure machinery would make it one. What it must not do is **misname a band**: a
 * screen that called twenty seconds *tapping foot* would be teaching a reader this product's own
 * vocabulary wrongly, on the one surface where they are paying attention to it.
 *
 * This is the pin. Two rules, and the first is the one that catches a draft: a rung may only name a
 * band the elapsed time has actually reached, and a rung that names any band must name the one the
 * reader is in. The drafted ladder failed both — it put *tapping foot* at 20 s (the band starts at
 * 30 s) and *taking the stairs* at 45 s (it starts at 120 s), which is wrong by a factor of nearly
 * three.
 *
 * The ladder lives inside `main()`, which no Node test can call, so it is read as text. That is
 * this file's own established method — `bodyOf` above does the same for the legend wiring.
 */
describe('the cold-start ladder names the band the player is actually in', () => {
  /** `WAIT_LADDER`'s rungs, out of `main.ts`'s source, with the comments between them removed. */
  async function rungs(): Promise<readonly { readonly afterMs: number; readonly text: string }[]> {
    const source = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    const declared = source.indexOf('const WAIT_LADDER');
    expect(declared, 'main.ts has no WAIT_LADDER').toBeGreaterThan(-1);
    // From the opening bracket, not from the name: the type annotation in between spells `afterMs`
    // too, and splitting on it produced a phantom first rung with no sentence in it.
    const start = source.indexOf('Object.freeze([', declared);
    expect(start).toBeGreaterThan(declared);
    const end = source.indexOf('\n  ]);', start);
    expect(end).toBeGreaterThan(start);
    const block = source
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');
    return block
      .split(/afterMs:\s*/u)
      .slice(1)
      .map((part) => ({
        afterMs: Number((/^([\d_]+)/u.exec(part)?.[1] ?? '0').replace(/_/gu, '')),
        // Concatenated, because a rung's sentence is written as several adjoined literals and a
        // band word can fall across the join.
        text: [...part.matchAll(/'([^']*)'/gu)].map((match) => match[1]).join(''),
      }));
  }

  it('never names a band the wait has not reached', async () => {
    for (const rung of await rungs()) {
      for (const band of WAIT_BANDS) {
        if (!rung.text.includes(band.label)) continue;
        expect(
          rung.afterMs / 1000,
          `"${band.label}" is claimed at ${String(rung.afterMs / 1000)} s and starts at ${String(band.fromS)} s`,
        ).toBeGreaterThanOrEqual(band.fromS);
      }
    }
  });

  it('names the band the reader is in, whenever it names one at all', async () => {
    for (const rung of await rungs()) {
      const named = WAIT_BANDS.filter((band) => rung.text.includes(band.label));
      if (named.length === 0) continue;
      const here = bandOf(rung.afterMs / 1000);
      expect(
        named.map((band) => band.label),
        `the rung at ${String(rung.afterMs / 1000)} s does not name ${here.label}`,
      ).toContain(here.label);
    }
  });

  it('is a ladder that climbs, and reaches the measured cold start', async () => {
    const ladder = await rungs();
    expect(ladder.length).toBeGreaterThanOrEqual(4);
    for (const [index, rung] of ladder.entries()) {
      expect(rung.text.length, `rung ${String(index)} has no sentence`).toBeGreaterThan(20);
      if (index > 0) expect(rung.afterMs).toBeGreaterThan(ladder[index - 1]?.afterMs ?? 0);
    }
    // The first rung has to arrive before a player concludes the button did nothing, and the last
    // has to be past 32.2 s — the measured cold start — or the ladder stops exactly where the
    // waiting stops being explainable.
    expect(ladder[0]?.afterMs).toBeLessThanOrEqual(5_000);
    expect(ladder[ladder.length - 1]?.afterMs).toBeGreaterThan(32_200);
  });

  it('promises no progress it cannot measure', async () => {
    // There is no progress to report — a container is starting and will not say how far — and a bar
    // or a percentage here is the same defect as a figure a run does not support.
    for (const rung of await rungs()) {
      expect(rung.text).not.toMatch(/%|per cent|percent|almost there|nearly done/iu);
    }
  });
});

describe('which freePlay a finished run is described by — § D318', () => {
  /*
   * A source assertion, on `main.test.ts`'s own precedent: the `#legend` test above asserts that
   * `index.html` carries **no second copy** of something derived, because a second copy typechecks,
   * looks identical today, and drifts by the afternoon. This is the same shape with the sources
   * swapped — two expressions for *what did this run use*, one of them right.
   *
   * ## Why this is a source assertion and not a driven one
   *
   * The honest reason: `shiftSubmittedSelection`'s own unit tests **cannot fail against the bug**,
   * because the function did not exist while the bug did. They prove the derivation is right and say
   * nothing about whether `main.ts` calls it — which is precisely this repository's standing defect,
   * arriving in a fix for a different one. Driving `submitScore` needs a mounted shell, a server
   * double and a recorded run; that is worth building and is not this change.
   *
   * So the call sites are pinned by the one property that separates right from wrong here: the
   * submission and the Day report's subject may not mention `menuState.freePlay` at all. This test
   * fails against the defect — three occurrences before, one after.
   *
   * ## The reads that are correct, and the rule that admits them
   *
   * `enterFreePlay(state, resources, menuState.freePlay, …)` reads the menu **on purpose**: that
   * call is the moment the menu's selection *becomes* the run's, and it is the only moment the arrow
   * points that way. Everything after it describes a run that already exists, and a run knows what
   * it ran.
   *
   * So the rule is not a count — it is a **boundary**: every read of `menuState.freePlay` must be an
   * argument to `enterFreePlay`. This started as `toHaveLength(1)` and was widened, deliberately and
   * exactly as this docstring instructed, when § D3xx's *run this row's configuration* added a
   * second legitimate caller: it writes the row into `menuState.freePlay` through the reducer and
   * then enters Free Play with it, which is the same boundary reached by a different door.
   *
   * Widening it to *"an argument to `enterFreePlay`"* rather than to *"two occurrences"* is the
   * difference between a rule and a tally. A tally would have admitted the next wrong read as
   * readily as the next right one.
   */
  it('reads the menu only where the menu becomes the run', async () => {
    const source = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    const reads = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => line.includes('menuState.freePlay') && !line.startsWith('//'))
      .filter(({ line }) => !line.startsWith('*'));

    const outsideTheBoundary = reads.filter(({ line }) => !line.includes('enterFreePlay('));

    expect(
      outsideTheBoundary.map(({ line, number }) => `${String(number)}: ${line}`),
      'A finished run is described from `state`, never from what the menu currently has selected. ' +
        'The leaderboard submission is the expensive half: the server replays the submitted ids, ' +
        'fails to reproduce, and answers 422 — this product\'s one accusation, aimed at a player ' +
        'who only moved a select. See `shiftSubmittedSelection`.',
    ).toEqual([]);
    expect(reads.length, 'the derivation stopped matching anything').toBeGreaterThan(0);
  });
});

describe('the submit path asks the predicate its own docstring names — GitHub issue #129', () => {
  /*
   * A source assertion, for the reason the block above states in full and this one inherits:
   * *"driving `submitScore` needs a mounted shell, a server double and a recorded run; that is
   * worth building and is not this change."* Still true. What is asserted here is the one property
   * that separates the fixed shape from the broken one, and it fails against the defect — the
   * matched call count was **zero** before this test was written.
   *
   * ## What the defect was, and why an affordance is not a gate
   *
   * `submitScore`'s docstring has always said *"what it must not do is send a run the server cannot
   * reproduce. `runIdentityIssues` is that predicate"*. The handler did not ask it. The only place
   * the question was asked was `menuHost.runState`, which `menu/screens.ts` turns into a disabled
   * row and a `rankingRefusal` sentence beside it — the right home for the *affordance*, and issue
   * #21's own argument says so while also saying what has to sit underneath: *"this is the backstop
   * for every route that reaches the handler anyway"*. Three of the four refusals had that backstop
   * and the load-bearing one did not.
   *
   * It is load-bearing now in a way it was not. Issue #129 moved a commissioned fabric and a
   * calendar period from *posted in silence and refused as a forgery* to *refused here by name*, so
   * this call is what stands between two shipped features and the one accusation this product
   * makes. A refusal that lives only in a disabled button is one keyboard route from not existing.
   *
   * ## Why the order is asserted and not just the presence
   *
   * A `runIdentityIssues` call **after** `client.submit` would satisfy a presence check and refuse
   * nothing — the request is already gone. The ordering is the property; the presence is a
   * precondition for stating it.
   */
  it('calls runIdentityIssues before it posts, not beside it', async () => {
    const source = await readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
    const start = source.indexOf('async function submitScore()');
    const end = source.indexOf('const menuHost: MenuPanelHost', start);
    expect(start, 'submitScore is not declared the way this test reads it').toBeGreaterThan(0);
    expect(end, 'the end anchor moved').toBeGreaterThan(start);

    const body = source.slice(start, end);
    const asked = body.indexOf('runIdentityIssues(');
    const posted = body.indexOf('client.submit(');

    expect(
      asked,
      'submitScore must ask runIdentityIssues itself. `menuHost.runState` disables the button, ' +
        'which is an affordance and not a gate — issue #21\'s own words about the refusals beside ' +
        'this one: "this is the backstop for every route that reaches the handler anyway".',
    ).toBeGreaterThan(-1);
    expect(posted, 'submitScore no longer posts').toBeGreaterThan(-1);
    expect(
      asked,
      'the predicate is asked after the request has already gone, which refuses nothing',
    ).toBeLessThan(posted);
  });
});

describe('an intervention re-simulation is not a new attempt — docs/20 defect 17', () => {
  /*
   * The decision itself is `shift/week.ts#closeDay`'s `recordGrew` parameter and is driven in
   * `week.test.ts`; what only this file can pin is the wiring, which lives inside `boot()` where
   * no Node test can call it. Two sites, each read at the source in `reportPanel.test.ts`'s
   * binding-site idiom: the intervention button is the one caller allowed to start a run as
   * `'intervention'`, and `closeShift` is the one reader that turns the latch into the flag
   * `closedWeekOf` gates the attempt count on. A latch written by nobody, or written and never
   * read, would leave `week.test.ts` green while the sheet counts a parked car as a retry.
   */
  async function mainSource(): Promise<string> {
    return readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
  }

  it('exactly one run start says intervention, and it is the intervention button’s', async () => {
    const source = await mainSource();
    // The callback-closing shape of the one legitimate site, `}, 'intervention')` — a second
    // caller passing the cause would count here and go red by name.
    const starts = source.match(/\}, 'intervention'\)/g) ?? [];
    expect(starts.length, 'one runShift call carries the cause').toBe(1);
  });

  it('closeShift hands the latch to closedWeekOf, where it gates the attempt', async () => {
    const source = await mainSource();
    expect(source).toContain("closedWeekOf(state, outcome, runCause === 'intervention')");
  });
});
