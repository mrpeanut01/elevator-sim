/**
 * The player's library survives a reload — **per entry**, which is the rule the week does not have.
 *
 * ## What this file has to prove that `persist.test.ts` does not
 *
 * `persist.test.ts` proves the week is restored whole or refused whole. Every property below is
 * about the other rule, and each one would be satisfied by a module that did nothing:
 *
 * - a saved building comes back **byte-identical**, which a module that re-serialised it through a
 *   schema would fail and a module that stored nothing would fail differently;
 * - an entry this build can no longer parse is **dropped and named**, and the other entries on the
 *   same shelf are **still there** — the second half is the one that separates this from the week's
 *   rule, and it is asserted every time;
 * - the byte budget **refuses** rather than throwing, and leaves the previous save alone;
 * - a **version-1** envelope still restores its week.
 *
 * ## The negative control, stated once and used everywhere
 *
 * Before this landed, the library was empty on every restore — `initialState()` opens with four
 * empty shelves and nothing wrote them. So *"the round trip returned an empty library"* is exactly
 * what the old behaviour looked like, and a round-trip assertion that did not first prove the
 * fixture non-empty would pass on the code this replaces. {@link libraryIsWorthTesting} is that
 * control and it runs before the round trips.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type BuildingConfig,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  classFromSpec,
  classesFromSpecs,
  specFromClass,
  type MachineClass,
} from '../authoring/machineSpec.js';
import { DEFAULT_PATTERN, PATTERN_ROWS } from '../authoring/patternSpec.js';
import type { BrowserResources } from '../dev/data.js';
import {
  initialState,
  type SavedBuilding,
  type SavedDispatcher,
  type SavedPattern,
  type ViewerState,
} from '../dev/state.js';
import { catalogueOf } from '../menu/catalogue.js';
import { initialMenuState } from '../menu/menu.js';
import type { FreePlaySelection, MenuState } from '../menu/types.js';
import { CONTRACTS } from '../shift/contracts.js';
import { openWeek } from '../shift/week.js';

import { libraryNoticeFor, saveNoticeFor } from './notice.js';
import { loadLibrary, loadSession, saveSession } from './session.js';
import {
  LIBRARY_BUDGET_CHARACTERS,
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  type LibraryContext,
  type SessionStore,
} from './types.js';
import { librarySize, restoreLibrary } from './validate.js';

/* -------------------------------------------------------------------------- *
 * Fixtures — the real data/, for the reason fixtures.test-helper.ts gives
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = ['garden-apartments', 'midtown-office', 'vertical-city'] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();

/**
 * The narrow port, satisfied by `BrowserResources` itself.
 *
 * The assignment is the assertion: if `LibraryContext` ever asked for something the shell does not
 * already hold, this line would stop compiling and `dev/main.ts` would need a new argument.
 */
const context: LibraryContext = resources;

const MIDTOWN = parseBuilding(read('buildings/midtown-office.json'), 'midtown-office.json');
const VERTICAL_CITY = parseBuilding(read('buildings/vertical-city.json'), 'vertical-city.json');

const SAVED_CLASS: MachineClass = classFromSpec(
  specFromClass(classesFromSpecs(resources.elevatorSpecs)[2]!),
  'cls-1',
);

const SAVED_BUILDING: SavedBuilding = { id: 'bld-1', config: MIDTOWN };

const SAVED_DISPATCHER: SavedDispatcher = {
  id: 'disp-1',
  profile: resources.dispatcherProfiles.profiles[1] ?? resources.dispatcherProfiles.profiles[0]!,
};

const SAVED_PATTERN: SavedPattern = {
  id: 'pat-1',
  spec: { ...DEFAULT_PATTERN, name: 'My lunch rush', order: 'two-way' as const, ratePctPop5min: 9 },
};

function viewerWith(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    ...initialState(resources, 20_260_805n),
    savedBuildings: [SAVED_BUILDING],
    savedDispatchers: [SAVED_DISPATCHER],
    savedPatterns: [SAVED_PATTERN],
    savedClasses: [SAVED_CLASS],
    ...overrides,
  };
}

function menuState(): MenuState {
  return initialMenuState(catalogueOf(resources));
}

interface Slots {
  readonly store: SessionStore;
  readonly written: Map<string, string>;
}

function memoryStore(): Slots {
  const written = new Map<string, string>();
  return {
    written,
    store: {
      read: (key) => written.get(key) ?? null,
      write: (key, value) => {
        written.set(key, value);
      },
      remove: (key) => {
        written.delete(key);
      },
    },
  };
}

/** Save a real session and hand back the store, so tampering starts from real bytes. */
function saved(viewer: ViewerState = viewerWith()): Slots {
  const slots = memoryStore();
  const result = saveSession(slots.store, viewer, menuState());
  expect(result.ok, 'the fixture itself must save').toBe(true);
  return slots;
}

/** Re-write the stored envelope after `edit` has had its way with the parsed form. */
function tamper(slots: Slots, edit: (envelope: Record<string, unknown>) => void): void {
  const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
  edit(envelope);
  slots.written.set(SESSION_KEY, JSON.stringify(envelope));
}

const shelvesOf = (slots: Slots): Record<string, unknown[]> =>
  (JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>)[
    'library'
  ] as Record<string, unknown[]>;

/* -------------------------------------------------------------------------- *
 * The negative control, first
 * -------------------------------------------------------------------------- */

const libraryIsWorthTesting = (): void => {
  const fresh = initialState(resources, 1n);
  expect(fresh.savedBuildings, 'the old behaviour: four empty shelves').toEqual([]);
  expect(fresh.savedDispatchers).toEqual([]);
  expect(fresh.savedPatterns).toEqual([]);
  expect(fresh.savedClasses).toEqual([]);

  const viewer = viewerWith();
  expect(viewer.savedBuildings.length, 'the fixture must not be empty').toBeGreaterThan(0);
  expect(viewer.savedDispatchers.length).toBeGreaterThan(0);
  expect(viewer.savedPatterns.length).toBeGreaterThan(0);
  expect(viewer.savedClasses.length).toBeGreaterThan(0);
};

describe('the negative control every round trip below depends on', () => {
  it('the library was empty on restore before this landed, and the fixture is not', () => {
    // Without this, `restored.buildings.length === 0` and `restored.buildings.length === 1` are
    // both consistent with a module that stores nothing — one of them by accident.
    libraryIsWorthTesting();
  });
});

/* -------------------------------------------------------------------------- *
 * The round trip
 * -------------------------------------------------------------------------- */

describe('a saved library survives a reload', () => {
  it('brings back all four shelves', () => {
    libraryIsWorthTesting();
    const restored = loadLibrary(saved().store, context);
    expect(restored.dropped).toEqual([]);
    expect(restored.library.buildings).toEqual([SAVED_BUILDING]);
    expect(restored.library.dispatchers).toEqual([SAVED_DISPATCHER]);
    expect(restored.library.patterns).toEqual([SAVED_PATTERN]);
    expect(restored.library.classes).toEqual([SAVED_CLASS]);
  });

  it('returns a real saved building byte-identical', () => {
    /*
     * The property that rules out the plausible wrong implementation: a restore that re-parsed the
     * document through `buildingConfigSchema` and handed back zod's output would pass a `toEqual`
     * and could still differ in key order, in a dropped `$comment`, or in a field the schema
     * defaults. What a player saved is what comes back.
     */
    const restored = loadLibrary(saved().store, context);
    expect(JSON.stringify(restored.library.buildings[0])).toBe(JSON.stringify(SAVED_BUILDING));
  });

  it('hands back a frozen library, because everything else restored here is a value', () => {
    const restored = loadLibrary(saved().store, context);
    expect(Object.isFrozen(restored.library)).toBe(true);
    expect(Object.isFrozen(restored.library.buildings)).toBe(true);
    expect(Object.isFrozen(restored.library.buildings[0])).toBe(true);
  });

  it('restores the week and the library from the same bytes', () => {
    // Two readers of one slot. If they ever disagree about which envelope they read, this is where
    // it shows: the same store yields a week *and* a library, from one save.
    const week = openWeek(CONTRACTS[0]?.id);
    const slots = saved(viewerWith({ week }));
    const session = loadSession(slots.store);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.snapshot.week).toEqual(week);
    expect(librarySize(loadLibrary(slots.store, context).library)).toBe(4);
  });

  it('reads nothing from an empty store, and calls it no drops rather than a loss', () => {
    // A first visit. An empty library and an empty drop list are the same value here as on a
    // successful restore of an empty library, which is correct: nothing was lost either time.
    const restored = loadLibrary(memoryStore().store, context);
    expect(librarySize(restored.library)).toBe(0);
    expect(restored.dropped).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The rule the week does not have
 * -------------------------------------------------------------------------- */

describe('an entry this build cannot parse is dropped, and only that entry', () => {
  /**
   * One row per way an entry can stop being readable, each tampering with **one** entry of a
   * two-entry shelf so that *"the other one survived"* is asserted every time. The second entry is
   * the whole difference between this rule and the week's.
   */
  const CASES: readonly {
    readonly what: string;
    readonly shelf: 'buildings' | 'dispatchers' | 'patterns' | 'classes';
    readonly break: (entry: Record<string, unknown>) => void;
    readonly label: string;
  }[] = [
    {
      what: 'a building whose schema this build would reject',
      shelf: 'buildings',
      break: (entry) => {
        delete (entry['config'] as Record<string, unknown>)['banks'];
      },
      label: MIDTOWN.name,
    },
    {
      what: 'a building naming a machine class that is not loaded',
      shelf: 'buildings',
      break: (entry) => {
        const config = entry['config'] as Record<string, unknown>;
        const banks = config['banks'] as Record<string, unknown>[];
        const cars = banks[0]?.['cars'] as Record<string, unknown>[];
        (cars[0] as Record<string, unknown>)['spec'] = 'withdrawn-class';
      },
      label: MIDTOWN.name,
    },
    {
      what: 'a dispatcher weighting a cost term this build no longer declares',
      shelf: 'dispatchers',
      break: (entry) => {
        const profile = entry['profile'] as Record<string, unknown>;
        profile['weights'] = { ...(profile['weights'] as object), longAbandonedTerm: 1 };
      },
      label: SAVED_DISPATCHER.profile.name,
    },
    {
      what: 'a machine class whose speed is not a number',
      shelf: 'classes',
      break: (entry) => {
        entry['speedTypicalMps'] = 'fast';
      },
      label: SAVED_CLASS.name,
    },
    {
      what: 'a machine class missing the field that says whose it is',
      shelf: 'classes',
      break: (entry) => {
        delete entry['yours'];
      },
      label: SAVED_CLASS.name,
    },
    {
      what: 'a pattern past the range its own slider offers',
      shelf: 'patterns',
      break: (entry) => {
        (entry['spec'] as Record<string, unknown>)['ratePctPop5min'] = 4000;
      },
      label: SAVED_PATTERN.spec.name,
    },
    {
      what: 'a pattern whose peak order this build does not have',
      shelf: 'patterns',
      break: (entry) => {
        (entry['spec'] as Record<string, unknown>)['order'] = 'sideways';
      },
      label: SAVED_PATTERN.spec.name,
    },
    {
      what: 'an entry that is not an object at all',
      shelf: 'buildings',
      break: () => undefined,
      label: '2nd building you saved',
    },
  ];

  for (const row of CASES) {
    it(`drops ${row.what}, keeps the rest, and names it`, () => {
      const slots = saved();
      tamper(slots, (envelope) => {
        const shelves = envelope['library'] as Record<string, unknown[]>;
        const good = shelves[row.shelf]?.[0];
        // Two entries, the second a copy of the first, so a shelf survivor is not the same object
        // as the casualty — a drop that took the whole shelf would fail on the count alone.
        const broken = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
        row.break(broken);
        shelves[row.shelf] = [good, row.what.includes('not an object') ? 7 : broken];
      });

      const restored = loadLibrary(slots.store, context);
      expect(restored.dropped.length, 'exactly one entry went').toBe(1);
      const dropped = restored.dropped[0];
      expect(dropped?.index, 'the second one').toBe(1);
      expect(dropped?.label, 'named by what the player calls it').toContain(row.label);
      expect(dropped?.reason.length, 'the developer half is not empty').toBeGreaterThan(4);

      // The half that makes this a different rule from the week's.
      const shelf = restored.library[
        row.shelf as keyof typeof restored.library
      ] as readonly unknown[];
      expect(shelf.length, 'the good entry is untouched').toBe(1);
      // One entry was added to one shelf and that one was dropped, so the library that comes back
      // is the fixture's four — the survivor on the tampered shelf plus the three shelves that were
      // never touched. A drop that took a shelf, or a session, would land here.
      expect(librarySize(restored.library), 'and so are the other three shelves').toBe(4);
    });
  }

  it('leaves the week alone when an entry goes — the whole reason this can be done', () => {
    // The week is restored by a different function under a different rule, and a dropped building
    // must not touch it. Without this row, dropping an entry could be refusing the session and the
    // suite above would not notice.
    const week = openWeek(CONTRACTS[0]?.id);
    const slots = saved(viewerWith({ week }));
    tamper(slots, (envelope) => {
      const shelves = envelope['library'] as Record<string, unknown[]>;
      shelves['buildings'] = ['not a building at all'];
    });
    const session = loadSession(slots.store);
    expect(session.ok, 'a dropped entry is not a refused session').toBe(true);
    if (!session.ok) return;
    expect(session.snapshot.week).toEqual(week);
    expect(loadLibrary(slots.store, context).dropped.length).toBe(1);
  });

  it('names an entry by its id when the name is gone, and by its place when both are', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      const shelves = envelope['library'] as Record<string, unknown[]>;
      shelves['dispatchers'] = [
        // No `name` on the profile, so the id is the best label available…
        { id: 'disp-9', profile: { weights: {} } },
        // …and nothing readable at all, so its position is.
        42,
      ];
    });
    const dropped = loadLibrary(slots.store, context).dropped;
    expect(dropped.map((entry) => entry.label)).toEqual(['disp-9', '2nd dispatcher you saved']);
  });

  it('drops every entry when every entry is bad, and still restores the week', () => {
    // The extreme of the per-entry rule. A library that loses everything is still not a failed
    // session — the point is that the two verdicts are independent, not that one is milder.
    const slots = saved();
    tamper(slots, (envelope) => {
      const shelves = envelope['library'] as Record<string, unknown[]>;
      for (const shelf of Object.keys(shelves)) shelves[shelf] = [null];
    });
    const restored = loadLibrary(slots.store, context);
    expect(restored.dropped.length).toBe(4);
    expect(librarySize(restored.library)).toBe(0);
    expect(loadSession(slots.store).ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The interaction the "independent documents" premise does not cover
 * -------------------------------------------------------------------------- */

describe('a building drawn around a machine class the player also saved', () => {
  /** The saved class, used by a building that is otherwise `midtown-office`. */
  const mineOf = (specClass: string): BuildingConfig =>
    ({
      ...MIDTOWN,
      id: 'my-tower',
      name: 'My Tower',
      banks: MIDTOWN.banks.map((bank) => ({
        ...bank,
        cars: bank.cars.map((car) => ({
          ...car,
          spec: specClass,
          ratedSpeedMps: SAVED_CLASS.speedTypicalMps,
          ratedLoadLb: SAVED_CLASS.loadMinLb,
        })),
      })),
    }) as BuildingConfig;

  it('survives, because the classes are restored first and widen the specs', () => {
    // The one place the *independent documents* premise is not quite true, handled by ordering
    // rather than by pretending. Validating this building against the shipped specs alone would
    // drop it for naming a class sitting three lines above it in the same library.
    const viewer = viewerWith({
      savedBuildings: [{ id: 'bld-2', config: mineOf(SAVED_CLASS.id) }],
      savedClasses: [SAVED_CLASS],
    });
    const restored = loadLibrary(saved(viewer).store, context);
    expect(restored.dropped).toEqual([]);
    expect(restored.library.buildings.length).toBe(1);
  });

  it('positive control: the same building without the class is dropped', () => {
    // Without this, the row above would pass on a check that never looked at `spec` at all.
    const viewer = viewerWith({
      savedBuildings: [{ id: 'bld-2', config: mineOf(SAVED_CLASS.id) }],
      savedClasses: [],
    });
    const restored = loadLibrary(saved(viewer).store, context);
    expect(restored.dropped.length).toBe(1);
    expect(restored.dropped[0]?.label).toBe('My Tower');
  });

  it('takes the building with it when the class itself is dropped', () => {
    // The only cascade in here, and it is the correct one: a class this build cannot read is not
    // available to widen anything, so a building that depends on it cannot resolve either.
    const viewer = viewerWith({
      savedBuildings: [{ id: 'bld-2', config: mineOf(SAVED_CLASS.id) }],
      savedClasses: [SAVED_CLASS],
    });
    const slots = saved(viewer);
    tamper(slots, (envelope) => {
      const shelves = envelope['library'] as Record<string, unknown[]>;
      (shelves['classes']?.[0] as Record<string, unknown>)['maxRiseM'] = 'tall';
    });
    const restored = loadLibrary(slots.store, context);
    expect(restored.dropped.map((entry) => entry.shelf).sort()).toEqual(['building', 'class']);
  });
});

/* -------------------------------------------------------------------------- *
 * The frame, which is envelope structure and therefore all-or-nothing
 * -------------------------------------------------------------------------- */

describe('a library frame this build did not write', () => {
  it('refuses the whole session, unlike a bad entry inside it', () => {
    // The line, asserted: contents are documents and the frame is structure. A shelf that is not an
    // array cannot have been written by this program, and the week beside it in the same object is
    // then as suspect as the shelf.
    const slots = saved();
    tamper(slots, (envelope) => {
      (envelope['library'] as Record<string, unknown>)['buildings'] = 7;
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('buildings');
  });

  it('refuses a library that is not an object', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      envelope['library'] = [];
    });
    expect(loadSession(slots.store).ok).toBe(false);
  });

  it('refuses a shelf this build does not have, in the other direction', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      (envelope['library'] as Record<string, unknown>)['savedSelectors'] = [];
    });
    expect(loadSession(slots.store).ok).toBe(false);
  });

  it('reports the frame once, from the function whose job it is', () => {
    // `loadLibrary` returns empty and no drops on a bad frame. That looks like swallowing and is
    // not: `loadSession` has already refused it, and two sentences about one set of bytes would
    // imply a library survived when nothing did.
    const slots = saved();
    tamper(slots, (envelope) => {
      envelope['library'] = 'nonsense';
    });
    expect(loadSession(slots.store).ok).toBe(false);
    expect(loadLibrary(slots.store, context)).toEqual({
      library: { buildings: [], dispatchers: [], patterns: [], classes: [] },
      dropped: [],
    });
  });
});

/* -------------------------------------------------------------------------- *
 * Version 1 — a week that must not be lost to a feature it never had
 * -------------------------------------------------------------------------- */

/**
 * A `freePlay` as an older build wrote it: no `windowStartS`, because the field did not exist.
 *
 * Built by **removing** the key from the current selection rather than by writing a literal, so the
 * fixture stays a real version-1/2 selection as the rest of the shape moves. A literal would be a
 * second copy of `FreePlaySelection` that nothing keeps in step, and the first thing it would fail
 * to notice is the next field added the way `windowStartS` was.
 */
function withoutWindowStart(
  freePlay: Readonly<FreePlaySelection>,
): Omit<FreePlaySelection, 'windowStartS'> {
  const { windowStartS: _dropped, ...rest } = freePlay;
  return rest;
}

describe('a version-1 envelope', () => {
  /** Exactly what version 1 wrote: two keys, no library anywhere, and no `windowStartS`. */
  const v1 = (): Slots => {
    const slots = memoryStore();
    const menu = menuState();
    const week = openWeek(CONTRACTS[1]?.id ?? CONTRACTS[0]?.id);
    slots.written.set(
      SESSION_KEY,
      JSON.stringify({
        schemaVersion: 1,
        session: {
          week,
          settings: menu.settings,
          freePlay: withoutWindowStart(menu.freePlay),
        },
      }),
    );
    return slots;
  };

  it('is a version this build no longer writes — the control for the rest', () => {
    expect(SESSION_SCHEMA_VERSION).toBe(3);
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    expect(envelope['schemaVersion']).toBe(3);
  });

  it('is a fixture that really lacks the key, or every assertion below is vacuous', () => {
    // The fixture is derived from the live selection, so this is what stops it silently becoming a
    // version-3 session wearing a version-1 number the day `withoutWindowStart` stops matching.
    const slots = v1();
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    const session = envelope['session'] as Record<string, unknown>;
    const freePlay = session['freePlay'] as Record<string, unknown>;
    expect('windowStartS' in freePlay).toBe(false);
    // And the current build really does write it, so the two versions genuinely differ.
    expect('windowStartS' in menuState().freePlay).toBe(true);
  });

  it('still restores its week, settings and selection', () => {
    // The decision, asserted rather than argued: a player who reloads into a new build does not
    // lose their week to a feature they never used.
    const slots = v1();
    const result = loadSession(slots.store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.week.contractId).toBe(CONTRACTS[1]?.id ?? CONTRACTS[0]?.id);
    expect(result.snapshot.settings).toEqual(menuState().settings);
    expect(result.snapshot.freePlay).toEqual(menuState().freePlay);
  });

  it('reads the absent window as “the whole period”, which is what that build ran', () => {
    // `null` is not a default filling a hole. It means *no window* (§ D286), and a build with no
    // window concept ran the whole period on every run it ever did — so the absence determines the
    // value rather than leaving it open. That is the test `types.ts` sets for reading an older
    // envelope at all, and it is why version 3 does not refuse one.
    const result = loadSession(v1().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.freePlay.windowStartS).toBeNull();
  });

  it('restores an empty library and calls nothing dropped', () => {
    // Empty is not a default standing in for something unknown. The build that wrote these bytes
    // did not persist a library, so an empty one is the state the player was in.
    expect(loadLibrary(v1().store, context)).toEqual({
      library: { buildings: [], dispatchers: [], patterns: [], classes: [] },
      dropped: [],
    });
  });

  it('is refused if it carries a key version 1 never had', () => {
    // The both-directions rule, per version. A version-1 envelope with a `library` was not written
    // by version 1, and the version number is what was supposed to vouch for that.
    const slots = v1();
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    envelope['library'] = { buildings: [], dispatchers: [], patterns: [], classes: [] };
    slots.written.set(SESSION_KEY, JSON.stringify(envelope));
    expect(loadSession(slots.store).ok).toBe(false);
  });

  it('is upgraded on the next save, not left where it was', () => {
    const slots = v1();
    expect(saveSession(slots.store, viewerWith(), menuState()).ok).toBe(true);
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    expect(envelope['schemaVersion']).toBe(SESSION_SCHEMA_VERSION);
    expect(librarySize(loadLibrary(slots.store, context).library)).toBe(4);
  });
});

/**
 * The version that actually shipped broken, and the reason this block exists at all.
 *
 * `windowStartS` was added to `session.freePlay` **without** `SESSION_SCHEMA_VERSION` moving, so
 * the envelope still said 2 and a real version-2 session — well-formed, correct version, one key
 * short — was refused as `shape`. The player was told their saved week was *damaged*, which is
 * false, and every player who had a week was told it. Version 3 is that bump, made after the fact.
 */
describe('a version-2 envelope — the one the missing bump broke', () => {
  /** What version 2 wrote: a library beside the session, and no `windowStartS` inside it. */
  const v2 = (): Slots => {
    const slots = memoryStore();
    const menu = menuState();
    const week = openWeek(CONTRACTS[1]?.id ?? CONTRACTS[0]?.id);
    slots.written.set(
      SESSION_KEY,
      JSON.stringify({
        schemaVersion: 2,
        session: {
          week,
          settings: menu.settings,
          freePlay: withoutWindowStart(menu.freePlay),
        },
        library: { buildings: [], dispatchers: [], patterns: [], classes: [] },
      }),
    );
    return slots;
  };

  it('is restored rather than refused, and the week comes back whole', () => {
    // The regression, stated as the outcome a player sees. Before the bump this was
    // `ok: false` with `kind: 'shape'` and a notice saying the week was damaged.
    const result = loadSession(v2().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.week.contractId).toBe(CONTRACTS[1]?.id ?? CONTRACTS[0]?.id);
    expect(result.snapshot.settings).toEqual(menuState().settings);
  });

  it('differs from a current session in exactly one key, and that key reads null', () => {
    // The strong form of "nothing is invented": every other field is compared to the live
    // selection, so a reading that quietly rebuilt the selection would fail here rather than pass
    // on the one field it was asked about.
    const result = loadSession(v2().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.freePlay.windowStartS).toBeNull();
    expect(withoutWindowStart(result.snapshot.freePlay)).toEqual(
      withoutWindowStart(menuState().freePlay),
    );
  });

  it('is upgraded to 3 on the next save', () => {
    const slots = v2();
    expect(saveSession(slots.store, viewerWith(), menuState()).ok).toBe(true);
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    expect(envelope['schemaVersion']).toBe(3);
  });

  it('still refuses a version-2 envelope that is genuinely malformed', () => {
    // The bump must not have turned the shape check off. A version-2 session missing `week` is
    // not an older shape, it is a broken one, and it must still be refused by name — otherwise
    // this change would have traded a false "damaged" for a silent partial restore, which is the
    // one outcome `SessionRestore` exists to prevent.
    const slots = v2();
    const envelope = JSON.parse(slots.written.get(SESSION_KEY) ?? '') as Record<string, unknown>;
    delete (envelope['session'] as Record<string, unknown>)['week'];
    slots.written.set(SESSION_KEY, JSON.stringify(envelope));
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('week');
  });
});

/* -------------------------------------------------------------------------- *
 * The byte budget
 * -------------------------------------------------------------------------- */

describe('a library too large for the slot', () => {
  /** Twenty-five copies of the largest building this project ships. ~600 000 characters. */
  const oversized = (): ViewerState =>
    viewerWith({
      savedBuildings: Array.from({ length: 25 }, (_unused, index) => ({
        id: `bld-${String(index)}`,
        config: VERTICAL_CITY,
      })),
    });

  it('is genuinely over the budget — the control for the two rows below', () => {
    const characters = JSON.stringify({
      buildings: oversized().savedBuildings,
      dispatchers: [SAVED_DISPATCHER],
      patterns: [SAVED_PATTERN],
      classes: [SAVED_CLASS],
    }).length;
    expect(characters).toBeGreaterThan(LIBRARY_BUDGET_CHARACTERS);
  });

  it('refuses the save with the size in the sentence, rather than throwing', () => {
    const slots = memoryStore();
    let result: ReturnType<typeof saveSession> | undefined;
    expect(() => {
      result = saveSession(slots.store, oversized(), menuState());
    }, 'a refusal is a value; a throw would take a click handler with it').not.toThrow();
    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) return;
    if (result.failure.kind !== 'library-too-large') {
      expect.unreachable('an oversized library is refused as one');
      return;
    }
    expect(result.failure.characters).toBeGreaterThan(LIBRARY_BUDGET_CHARACTERS);
    expect(result.failure.limit).toBe(LIBRARY_BUDGET_CHARACTERS);
    expect(result.failure.entries).toBe(25 + 3);
    // Named, not implied — the message carries both numbers.
    expect(result.failure.message).toContain(String(result.failure.characters));
    expect(result.failure.message).toContain(String(LIBRARY_BUDGET_CHARACTERS));
  });

  it('writes nothing, so the previous save keeps its week *and* its library', () => {
    /*
     * The reason the whole save is refused rather than the library alone. There is one slot and
     * `write` replaces it whole, so a save that dropped the oversized library would be deleting the
     * copy already in storage. This asserts the opposite: nothing moved.
     */
    const slots = saved();
    const before = slots.written.get(SESSION_KEY);
    expect(saveSession(slots.store, oversized(), menuState()).ok).toBe(false);
    expect(slots.written.get(SESSION_KEY)).toBe(before);
    expect(librarySize(loadLibrary(slots.store, context).library)).toBe(4);
    expect(loadSession(slots.store).ok).toBe(true);
  });

  it('accepts a library just under the budget — the positive control', () => {
    // Without this, a budget of zero would pass every row above.
    const slots = memoryStore();
    const result = saveSession(slots.store, viewerWith(), menuState());
    expect(result.ok).toBe(true);
    expect(JSON.stringify(shelvesOf(slots)).length).toBeLessThan(LIBRARY_BUDGET_CHARACTERS);
  });

  it('is budgeted on the library alone, not on the week beside it', () => {
    // Stated in `types.ts` and asserted here: the number that refuses a player's twentieth building
    // must not depend on how many days they have played.
    const characters = JSON.stringify({
      buildings: oversized().savedBuildings,
      dispatchers: [],
      patterns: [],
      classes: [],
    }).length;
    const result = saveSession(memoryStore().store, oversized(), menuState());
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'library-too-large') return;
    expect(result.failure.characters).toBeGreaterThan(characters - 1);
    expect(result.failure.characters).toBeLessThan(characters + 2_000);
  });
});

/* -------------------------------------------------------------------------- *
 * What a player is told
 * -------------------------------------------------------------------------- */

describe('the sentence a dropped entry produces', () => {
  const dropOf = (count: number): ReturnType<typeof loadLibrary>['dropped'] =>
    Array.from({ length: count }, (_unused, index) => ({
      shelf: 'building' as const,
      index,
      label: `Tower ${String(index)}`,
      reason: 'banks[0].cars[0].spec names a class this build does not have',
    }));

  it('says nothing when nothing was dropped — the ordinary case, on every load, forever', () => {
    expect(libraryNoticeFor([])).toBeUndefined();
  });

  it('names what went, whose fault it is not, and what is still there', () => {
    const notice = libraryNoticeFor(dropOf(1)) ?? '';
    expect(notice).toContain('Tower 0');
    expect(notice, 'not the player’s doing').toMatch(/rather than anything you did/u);
    expect(notice, 'what happens now').toMatch(/still here/u);
  });

  it('reads as prose for one, for three and for many', () => {
    expect(libraryNoticeFor(dropOf(1))).toContain('One thing you saved');
    const three = libraryNoticeFor(dropOf(3)) ?? '';
    expect(three).toContain('3 things you saved');
    expect(three).toContain(
      'the building “Tower 0”, the building “Tower 1” and the building “Tower 2”',
    );
    const many = libraryNoticeFor(dropOf(7)) ?? '';
    expect(many, 'stops listing and starts counting').toContain('and 4 more');
    expect(many).not.toContain('Tower 4');
  });

  it('puts no validator’s wording on a ribbon', () => {
    // The `reason` is a JSON path into a building config. It is in the value for whoever has to
    // work out why, and `notice.ts` argues at length why it is not in the sentence.
    const notice = libraryNoticeFor(dropOf(2)) ?? '';
    expect(notice).not.toContain('banks[0]');
    expect(notice).not.toContain('spec');
  });

  it('names every shelf with the noun a player would use', () => {
    for (const shelf of ['building', 'dispatcher', 'pattern', 'class'] as const) {
      const notice =
        libraryNoticeFor([{ shelf, index: 0, label: 'Mine', reason: 'because' }]) ?? '';
      expect(notice, shelf).toContain('“Mine”');
      expect(notice, shelf).not.toContain('savedBuildings');
    }
  });

  it('the real drop path produces one, end to end', () => {
    // The rows above drive `libraryNoticeFor` on hand-built values. This one drives it on a drop
    // that a real save, a real tamper and a real restore produced.
    const slots = saved();
    tamper(slots, (envelope) => {
      const shelves = envelope['library'] as Record<string, unknown[]>;
      delete ((shelves['buildings']?.[0] as Record<string, unknown>)['config'] as Record<
        string,
        unknown
      >)['banks'];
    });
    const notice = libraryNoticeFor(loadLibrary(slots.store, context).dropped) ?? '';
    expect(notice).toContain(MIDTOWN.name);
  });
});

describe('the sentence a refused save produces', () => {
  it('tells a player over budget what to delete, and in a unit they can read', () => {
    const notice = saveNoticeFor({
      kind: 'library-too-large',
      message: 'developer wording',
      characters: 640_000,
      limit: LIBRARY_BUDGET_CHARACTERS,
      entries: 28,
    });
    expect(notice).toContain('28');
    expect(notice, 'kB rather than characters').toContain('640 kB');
    expect(notice).toContain('512 kB');
    expect(notice).toMatch(/delete/u);
    expect(notice, 'nothing has been lost').toMatch(/last save is untouched/u);
    // The cost of refusing the whole save is named rather than hidden.
    expect(notice).toMatch(/including this week/u);
  });

  it('says something for every kind, and blames the player for none of them', () => {
    const failures = [
      { kind: 'store', message: 'QuotaExceededError' },
      { kind: 'unserialisable', message: 'x', path: 'the session.week.day' },
      {
        kind: 'library-too-large',
        message: 'x',
        characters: 9_000_000,
        limit: LIBRARY_BUDGET_CHARACTERS,
        entries: 4,
      },
    ] as const;
    for (const failure of failures) {
      const notice = saveNoticeFor(failure);
      expect(notice.length, failure.kind).toBeGreaterThan(40);
      expect(/you (broke|corrupted|deleted)/iu.test(notice), failure.kind).toBe(false);
      expect(/nothing has been lost/iu.test(notice), `${failure.kind} says what happens now`).toBe(
        true,
      );
    }
    expect(new Set(failures.map((failure) => failure.kind)).size, 'not vacuous').toBe(3);
  });

  it('quotes neither the exception nor the field path', () => {
    // `restoreNoticeFor` appends the precise reason on the arms a reader could act on. Neither of
    // these is one: a player can do nothing with `QuotaExceededError` or with a JSON path.
    expect(saveNoticeFor({ kind: 'store', message: 'QuotaExceededError: boom' })).not.toContain(
      'QuotaExceededError',
    );
    expect(
      saveNoticeFor({ kind: 'unserialisable', message: 'x', path: 'the session.week.day' }),
    ).not.toContain('week.day');
  });
});

/* -------------------------------------------------------------------------- *
 * The checks are the ones the rest of the product already uses
 * -------------------------------------------------------------------------- */

describe('validation defers rather than deciding', () => {
  it('accepts every building this project ships, unaltered', () => {
    // The positive control for the building check: a validator stricter than the loader would drop
    // a document that runs perfectly, and there is no better sample of those than `data/`.
    const entries = resources.entries.map((entry, index) => ({
      id: `bld-${String(index)}`,
      config: entry.config,
    }));
    const restored = restoreLibrary(
      { buildings: entries, dispatchers: [], patterns: [], classes: [] },
      context,
    );
    expect(restored.dropped).toEqual([]);
    expect(restored.library.buildings.length).toBe(entries.length);
  });

  it('accepts every dispatcher profile this project ships', () => {
    const entries = resources.dispatcherProfiles.profiles.map((profile) => ({
      id: profile.id,
      profile,
    }));
    const restored = restoreLibrary(
      { buildings: [], dispatchers: entries, patterns: [], classes: [] },
      context,
    );
    expect(restored.dropped).toEqual([]);
  });

  it('accepts every machine class this project ships', () => {
    const entries = classesFromSpecs(resources.elevatorSpecs).map((entry) => ({
      ...entry,
      yours: true,
    }));
    const restored = restoreLibrary(
      { buildings: [], dispatchers: [], patterns: [], classes: entries },
      context,
    );
    expect(restored.dropped).toEqual([]);
    expect(entries.length).toBeGreaterThan(3);
  });

  it('bounds a pattern by the editor’s own rows and not by a second set', () => {
    /*
     * `PATTERN_SPEC_CHECKS` derives every numeric bound from `PATTERN_ROWS`, with a fallback for a
     * field whose slider has been removed. This asserts the fallback is **not in use**: every
     * numeric field of a real spec has a row, so the check a restore applies is exactly the range
     * the editor offers. Without it the fallback could quietly become the check for a field
     * somebody deleted a row for.
     */
    const numeric = Object.entries(DEFAULT_PATTERN)
      .filter(([, value]) => typeof value === 'number')
      .map(([key]) => key);
    expect(numeric.length).toBeGreaterThan(4);
    const withRows = new Set<string>(PATTERN_ROWS.map((row) => row.key));
    expect(numeric.filter((key) => !withRows.has(key))).toEqual([]);
  });
});
