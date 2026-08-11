/**
 * The session survives a reload, and every way it could fail to is a value rather than a throw.
 *
 * ## What a round-trip test is worth, and what makes this one worth something
 *
 * *Save it, load it, compare* passes on a module that persists `{}` and hands back a default. So
 * every round trip below is paired with a **negative control**: the restored week is asserted
 * *different* from `openWeek()`, the restored settings *different* from `DEFAULT_SETTINGS`, and the
 * empty store asserted to refuse. A suite that only proved equality would be proving that two
 * defaults are equal.
 *
 * The same rule applied to the refusals: each one is driven by tampering with a **real** payload —
 * saved by the real `saveSession` from a real `ViewerState` — one field at a time, so a refusal
 * cannot pass because the whole fixture was nonsense.
 *
 * ## The ledger is derived from the states, not written down
 *
 * `scope/surface.test.ts`'s idiom, and its reason: *"a table maintained by hand is the thing this
 * repository has been caught by five times in one branch (§ D213), and twice the hand-maintained
 * list was a guard that could no longer see what it was guarding."* So the key set of `ViewerState`
 * and `MenuState` comes from `Object.keys` of `initialState()` and `initialMenuState()`, and every
 * key is asserted to be either **persisted** — which is checked against the bytes that were
 * actually written — or to carry a stated reason in {@link NOT_PERSISTED}. Both directions: a new
 * field with no entry is red, and an entry for a field that no longer exists is red.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  classFromSpec,
  classesFromSpecs,
  specFromClass,
  type MachineClass,
} from '../authoring/machineSpec.js';
import { DEFAULT_PATTERN } from '../authoring/patternSpec.js';
import type { BrowserResources } from '../dev/data.js';
import {
  initialState,
  type SavedBuilding,
  type SavedDispatcher,
  type SavedPattern,
  type ViewerState,
} from '../dev/state.js';
import { catalogueOf } from '../menu/catalogue.js';
import { initialMenuState, updateFreePlay, updateSettings } from '../menu/menu.js';
import { VIZ_SCHEMA_VERSION } from '../contract/types.js';
import { DEFAULT_SETTINGS, PLAYBACK_SPEEDS, type MenuState } from '../menu/types.js';
import { CONTRACTS } from '../shift/contracts.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { WeekState } from '../shift/types.js';
import {
  ENDLESS_CONTRACT_ID,
  HISTORY_DAYS,
  SANDBOX_CONTRACT_ID,
  closeDay,
  nextDay,
  openWeek,
  outcomeOf,
} from '../shift/week.js';

import { jsonRoundTripIssue } from './jsonSafety.js';
import {
  LIBRARY_STATE_KEYS,
  clearSession,
  loadLibrary,
  loadSession,
  patchTouchesLibrary,
  saveSession,
} from './session.js';
import {
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSIONS_READ,
  type SavedLibrary,
  type SessionStore,
} from './types.js';
import { snapshotIssue, unknownContractsIn } from './validate.js';

/* -------------------------------------------------------------------------- *
 * Fixtures — the real data/, for the reason fixtures.test-helper.ts gives
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
] as const;

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
 * A seed unlike any other number in the fixture, so *"the bytes do not contain the seed"* is a
 * claim about the seed rather than a coincidence — and a `bigint` large enough that nothing could
 * quietly write it as a `number`.
 */
const VIEWER_SEED = 918_273_645_546_372_819n;

const FIRST_CONTRACT = CONTRACTS[0]?.id ?? 'c1';

/** Everything met, so `closeDay` banks a clean shift whatever the day's bars have hardened to. */
const PERFECT = Object.freeze({
  arrived: 500,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 0,
  abandoned: 0,
  worstWaitS: 30,
  worstWaitIsCensored: false,
});

/**
 * A week that has actually been played — history, a streak, a banked count and a cleared award.
 *
 * `openWeek()` would round-trip through a module that persisted nothing, because every field is
 * already at its default. This one is the fixture every restore assertion below is compared
 * against, and `is not a fresh week` is asserted before it is used.
 */
function playedWeek(): WeekState {
  const day1 = outcomeOf({
    day: 1,
    dayIdx: 0,
    eventId: 'ordinary',
    arrived: 500,
    carried: 498,
    minutePct: 91.5,
    readings: readGoals(goalsForDay(1), PERFECT),
  });
  const day2 = outcomeOf({
    day: 2,
    dayIdx: 1,
    eventId: 'move-in',
    arrived: 540,
    carried: 500,
    minutePct: 74.25,
    readings: readGoals(goalsForDay(2), { ...PERFECT, minutePct: 20 }),
  });
  return closeDay(nextDay(closeDay(openWeek(FIRST_CONTRACT), day1)), day2);
}

/**
 * One of each thing a player can author, so *"the library survived"* is a claim about four shelves.
 *
 * The building is a **real** one straight out of `data/` rather than something assembled here: the
 * byte-identity assertion below is only worth having against a document that is as complicated as
 * the ones players actually save, and `midtown-office` carries banks, floor ranges and a traffic
 * profile reference. `initialState` opens with all four shelves empty, which is what makes this
 * fixture the negative control the round trip needs — see the *was empty before* assertion.
 */
const SAVED_BUILDING: SavedBuilding = Object.freeze({
  id: 'bld-1',
  config: parseBuilding(read('buildings/midtown-office.json'), 'midtown-office.json'),
});

const SAVED_DISPATCHER: SavedDispatcher = Object.freeze({
  id: 'disp-1',
  // A shipped profile, saved under the player's own id. Every weight in it names a cost term the
  // library declares, which is the cross-reference the restore check exists to make.
  profile: resources.dispatcherProfiles.profiles[1] ?? resources.dispatcherProfiles.profiles[0]!,
});

const SAVED_PATTERN: SavedPattern = Object.freeze({
  id: 'pat-1',
  spec: { ...DEFAULT_PATTERN, name: 'My lunch rush', order: 'two-way' as const, ratePctPop5min: 9 },
});

const SAVED_CLASS: MachineClass = Object.freeze(
  classFromSpec(specFromClass(classesFromSpecs(resources.elevatorSpecs)[2]!), 'cls-1'),
);

const library = (): SavedLibrary => ({
  buildings: [SAVED_BUILDING],
  dispatchers: [SAVED_DISPATCHER],
  patterns: [SAVED_PATTERN],
  classes: [SAVED_CLASS],
});

/**
 * A second scenario the player has stepped away from — GitHub issue #107.
 *
 * Deliberately **not** a fresh week: `openWeek('c2')` round-trips through a module that persists
 * nothing, exactly as `playedWeek`'s docstring says one floor up. This one has a day, a streak and
 * a closed day in it, so *"the parked week survived"* is a claim about something that could be
 * lost.
 */
function parkedWeek(): WeekState {
  const day1 = outcomeOf({
    day: 1,
    dayIdx: 0,
    eventId: 'ordinary',
    arrived: 700,
    carried: 690,
    minutePct: 88,
    readings: readGoals(goalsForDay(1), PERFECT),
  });
  return nextDay(closeDay(openWeek('c2'), day1));
}

function viewerState(): ViewerState {
  return {
    ...initialState(resources, VIEWER_SEED),
    week: playedWeek(),
    parkedWeeks: [parkedWeek()],
    savedBuildings: library().buildings,
    savedDispatchers: library().dispatchers,
    savedPatterns: library().patterns,
    savedClasses: library().classes,
  };
}

/** Settings and a selection that are all off their defaults, for the same reason. */
function menuState(): MenuState {
  const opened = initialMenuState(catalogueOf(resources));
  return updateFreePlay(
    updateSettings(opened, {
      reduceMotion: true,
      showEnergyAxis: true,
      playbackSpeed: 4,
      theme: 'dark',
    }),
    { durationS: 3600, arrivalRatePctPop5min: 6, seed: '1234567890' },
  );
}

/* -------------------------------------------------------------------------- *
 * The store doubles — the whole point of the injected port
 * -------------------------------------------------------------------------- */

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

/** A browser with site data blocked, or an origin at its quota. Unreachable without the port. */
function throwingStore(message: string): SessionStore {
  return {
    read: () => {
      throw new Error(message);
    },
    write: () => {
      throw new Error(message);
    },
    remove: () => {
      throw new Error(message);
    },
  };
}

/** Save a real session and hand back the store, so tampering starts from real bytes. */
function saved(): Slots {
  const slots = memoryStore();
  const result = saveSession(slots.store, viewerState(), menuState());
  expect(result.ok, 'the fixture itself must save').toBe(true);
  return slots;
}

/** The one key this module writes, discovered from a save rather than assumed. */
function slotKey(slots: Slots): string {
  const keys = [...slots.written.keys()];
  expect(keys.length, 'a session is one slot, never several').toBe(1);
  return keys[0] ?? '';
}

/** Re-write the stored envelope after `edit` has had its way with the parsed form. */
function tamper(slots: Slots, edit: (envelope: Record<string, unknown>) => void): void {
  const key = slotKey(slots);
  const envelope = JSON.parse(slots.written.get(key) ?? '') as Record<string, unknown>;
  edit(envelope);
  slots.written.set(key, JSON.stringify(envelope));
}

const sessionOf = (envelope: Record<string, unknown>): Record<string, unknown> =>
  envelope['session'] as Record<string, unknown>;

const weekOf = (envelope: Record<string, unknown>): Record<string, unknown> =>
  sessionOf(envelope)['week'] as Record<string, unknown>;

const libraryOf = (envelope: Record<string, unknown>): Record<string, unknown> =>
  envelope['library'] as Record<string, unknown>;

/* -------------------------------------------------------------------------- *
 * The ledger — every field of both states is persisted or has a reason
 * -------------------------------------------------------------------------- */

/**
 * Which section of the snapshot comes from which state. Checked against the written bytes below,
 * so this is a claim about what is stored and not a second list of intentions.
 */
const PERSISTED_FROM: Readonly<Record<string, 'viewer' | 'menu'>> = Object.freeze({
  week: 'viewer',
  parkedWeeks: 'viewer',
  settings: 'menu',
  freePlay: 'menu',
});

/**
 * The library's four shelves, and which `ViewerState` field each is.
 *
 * A second table rather than four more rows in {@link PERSISTED_FROM} because the library is a
 * **sibling** of the session in the envelope and not a section of it — the rename is the whole
 * point of the placement, so a ledger that flattened the two would be describing a shape the bytes
 * do not have. `Record<keyof SavedLibrary, keyof ViewerState>` keeps both ends compiler-checked.
 */
const LIBRARY_FROM: Readonly<Record<keyof SavedLibrary, keyof ViewerState>> = Object.freeze({
  buildings: 'savedBuildings',
  dispatchers: 'savedDispatchers',
  patterns: 'savedPatterns',
  classes: 'savedClasses',
});

/**
 * Every player-visible field that is **not** persisted, and why.
 *
 * The four the module docstring argues at length — the recording, the report, the account token and
 * the editors' working copies — are here in their short form; the reasoning is in `types.ts` where
 * it can be read once rather than thirty times.
 */
const NOT_PERSISTED: Readonly<Record<string, string>> = Object.freeze({
  /* --- already persisted, elsewhere ------------------------------------- */
  'viewer.mode':
    'dev/main.ts has held this under its own key, elevator-sim.viewMode, since before this module existed, and it gives a ?mode= deep link precedence over the remembered value — a precedence rule a directory that cannot read a query string may not re-litigate',

  /* --- which game is being played ---------------------------------------- */
  'viewer.playMode':
    'a reload re-enters shift-week, which is the one mode that permits every change scope — so nothing restored can be out of scope in it (docs/16 S6). Restoring free-play without the run configuration that a selection means would put that label over a run nobody selected, and enterFreePlay is the only function allowed to enter that mode',

  /* --- where the reader was looking, not what they were playing ---------- */
  'viewer.tab':
    'which panel was open is not progress; restoring a reader into the pattern editor describes a session they have not started yet',
  'viewer.revealedTabs':
    'the contextual tabs the rail has opened, and a ReadonlySet — the JSON trap sitting one spread away from the snapshot, which is why jsonSafety.ts refuses a Set by name',
  'viewer.railSegment': 'which segment of the left rail was showing; a scroll position, not a state',
  'viewer.drawerOpen': 'whether a drawer was open, which is the shape of the window and not of the game',
  'viewer.showMaths':
    'opens true so an engineer’s first view matches the design’s own screenshot; remembering a dismissal would hide the maths from a reader who never chose to',

  /* --- the run configuration, which a selection already describes -------- */
  'viewer.buildingId':
    'derivable rather than stored: the restored week names a contract and a contract names its building, so persisting both is how two sources of truth come to disagree about which building a sheet is headed with',
  'viewer.dispatcherId':
    'part of the live run rather than the saved game; menu.freePlay carries the dispatcher a selection means, and enterFreePlay is the one function allowed to turn one into a running state',
  'viewer.pattern':
    'same: a saved pattern is this browser’s alone (runIdentity.ts refuses a run carrying one), so restoring it would restore an unreproducible run',
  'viewer.shiftLengthS': 'the live run’s length; menu.freePlay.durationS is the persisted selection',
  'viewer.windowStartS':
    'the live run’s part of the day; menu.freePlay.windowStartS is the persisted selection, and the two travel together because they are one choice — a restored length without its window would run the right amount of demand out of the wrong hour (§ D286)',
  'viewer.freePlay':
    'the two override axes the live run is carrying, derived by enterFreePlay from the selection that is persisted — storing the derivation as well would let it drift from its source',
  'viewer.seed':
    'a bigint, and the trap this module is built around: JSON.stringify throws on one. The seed a session means is menu.freePlay.seed, which is decimal digits because a seed is an identity rather than a quantity',
  'viewer.outOfServiceCarIds':
    'a car held out of service is a within-day attempt, not a saved game, and nothing in a selection holds one — enterFreePlay clears it for exactly that reason',
  'viewer.interventions':
    'the run record’s mid-run intervention log, a within-day attempt on outOfServiceCarIds’ exact ground: it is stamped against one day’s run, the day boundary clears it (reportPanel’s next-day patch), and a restored log would replay yesterday’s change of mind onto a day that never carried it',
  'viewer.levers':
    'the group levers are the same case: moved off their defaults they make a run unreproducible elsewhere, and a reload is not the moment to inherit that silently',
  'viewer.selectorSpec':
    'the weight-set selector is a group lever by another name — applied on top of whoever is driving — and off its seeded value it writes a selection block and an arm map no shipped profile carries, so a restored one would be a run nobody selected wearing the shipped dispatcher’s name',
  'viewer.ruleRows':
    'the Everyday rules are the selector spec’s case one surface over: written rows put the driving profile under selection.policy rules, which no shipped profile carries and nothing in a selection or submission expresses (runIdentity.ts refuses a written list by name) — a restored list would silently run yesterday’s rules under the shipped dispatcher’s name, and the empty list is the identity by object',
  'viewer.patience':
    'the Parameters tab’s one applied schema, and the field it is written from is a mount that redraws at its declared defaults on every load — so persisting it would restore a run in which riders abandon while the four controls that say so read “none”, which is the screen and the run disagreeing rather than a session being remembered. It is also unreproducible elsewhere (runIdentity.ts refuses it by name) and abandonment moves the mean it would be judged on',

  /* --- the four editors’ working copies ---------------------------------- */
  'viewer.dispatcherSpec':
    'a working copy is a diff against something in data/, and data/ is free to change between the save and the load — a restored draft of a different profile is worse than no draft',
  'viewer.editingDispatcherId': 'names which profile that working copy is a diff against; it goes with it',
  'viewer.patternSpec': 'a working copy, excluded on the ground the dispatcher spec is',
  'viewer.editingPatternId': 'names what the pattern working copy is a diff against; it goes with it',
  'viewer.machineSpec': 'a working copy, excluded on the ground the dispatcher spec is',
  'viewer.editingClassId': 'names what the machine working copy is a diff against; it goes with it',
  'viewer.buildingSpec':
    'a working copy, and the one withBuilding re-seeds only while it is pristine — restoring it would restore a dirty flag whose subject may have changed',
  'viewer.editingBuildingId': 'names what the building working copy is a diff against; it goes with it',

  /* --- what the run produced --------------------------------------------- */
  'viewer.recording':
    'megabytes of step series, and a pure function of the seed and the configuration — replay.test.ts asserts a seed reproduces it bit for bit, so a stored copy is the one that can drift',
  'viewer.report':
    'a DayReport is a function of the week that is restored and the recording that is not, so a stored one would describe a run no longer loaded',
  'viewer.calendar':
    'the calendar period the week is under. Not persisted **yet**, and this is the row most likely to move: it is between-games, it is small, and it is exactly the kind of thing a player would expect a reload to keep. It is out because a period is a placement over specific day numbers, and restoring one beside a week whose day it no longer covers would show a period that is on and doing nothing — a caption about a run underneath it that is not there',
  'viewer.commissioning':
    'the fabric the reader commissioned. Same shape of decision as the saved library and a stronger case for persisting than the calendar — but it is a set of choices *against a specific building*, and `viewer.buildingId` is deliberately derived rather than stored, so restoring it would mean restoring the pair or restoring a mismatch. It is out until the library work above decides how a building-bound draft travels',
  'viewer.commissioningConstraintId':
    'which capital constraint the commissioning screen judges against. Presentation — it decides what that screen offers and refuses, and moves no leg — so it belongs with the settings rather than with the game, and the settings that *are* persisted are the four `menu.settings` carries. Out for the same reason `viewer.railSegment` is: it is where the reader was looking, not what they were playing',
  'viewer.withheld':
    'what the last run refused to configure; it belongs to that run and printing it beside a different one would be a caption about a run underneath it that is not there',
  'viewer.tomorrow':
    'the between-day beat (issue #91). Out for `viewer.report`’s reason and one of its own. It is a function of the week that is restored, the run that is not, and **tomorrow’s resolved building** — so a stored copy would announce an overnight against a run nobody has. The one of its own is that it is cheap to rebuild and expensive to have wrong: it is rebuilt by the next `closeShift`, which resolves tomorrow’s document rather than trusting a number from a previous session, and a session restored across a change to `data/` would otherwise show a growth reveal measured on a building that no longer ships',

  /* --- the menu’s own navigation ------------------------------------------ */
  'menu.screen':
    'which screen was showing, which is navigation rather than progress — restoring a player onto the leaderboard is not where they left the game',
  'menu.history':
    'the back stack, which only means anything relative to the screen that is not restored either; a stack pointing at screens nobody visited is worse than an empty one',
  'menu.challenge':
    'the dispatcher a challenge is being attempted with and the metric its board is ordered on. Not persisted, and the dispatcher is the interesting half: a challenge rotates weekly, so a restored choice would be a choice about a challenge that has since closed — and the runs it was made for are not persisted either (they are recordings, and rule 1 above). Restoring the axis without the runs would show a set half-attempted that this browser cannot post',
});

const derivedKeys = (): readonly string[] =>
  [
    ...Object.keys(viewerState()).map((key) => `viewer.${key}`),
    ...Object.keys(menuState()).map((key) => `menu.${key}`),
  ].sort((a, b) => a.localeCompare(b));

const ledgerKeys = (): readonly string[] =>
  [
    ...Object.entries(PERSISTED_FROM).map(([key, source]) => `${source}.${key}`),
    ...Object.values(LIBRARY_FROM).map((key) => `viewer.${key}`),
    ...Object.keys(NOT_PERSISTED),
  ].sort((a, b) => a.localeCompare(b));

describe('what is persisted is accounted for in both directions', () => {
  it('covers every field the two states actually have', () => {
    const ledger = new Set(ledgerKeys());
    expect(
      derivedKeys().filter((key) => !ledger.has(key)),
      'fields that are neither persisted nor carry a reason they are not',
    ).toEqual([]);
  });

  it('names no field the states no longer have', () => {
    const derived = new Set(derivedKeys());
    expect(
      ledgerKeys().filter((key) => !derived.has(key)),
      'ledger rows for fields that no longer exist — a list of ghosts is how a list stops being read',
    ).toEqual([]);
  });

  it('is the same set both ways, which is the assertion the two above are halves of', () => {
    expect(ledgerKeys()).toEqual(derivedKeys());
  });

  it('covers a surface worth having a rule about', () => {
    // A ledger that passed over an empty pair of states would be a description, not a gate.
    expect(derivedKeys().length).toBeGreaterThanOrEqual(30);
  });

  it('gives every exclusion a reason long enough to be one', () => {
    for (const [key, why] of Object.entries(NOT_PERSISTED)) {
      expect(why.length, `${key} — “${why}”`).toBeGreaterThanOrEqual(60);
    }
  });

  it('stores exactly the sections the ledger says it stores', () => {
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    expect(Object.keys(sessionOf(envelope)).sort()).toEqual(Object.keys(PERSISTED_FROM).sort());
  });

  it('keeps the library beside the session rather than inside it', () => {
    // The placement is the design's hinge — `session` is all-or-nothing and `library` is
    // entry-by-entry — so it is asserted against the bytes rather than left to a docstring. It is
    // also what makes a version-1 envelope readable: `session` is unchanged by version 2.
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(['library', 'schemaVersion', 'session']);
    expect(Object.keys(libraryOf(envelope)).sort()).toEqual(Object.keys(LIBRARY_FROM).sort());
  });

  it('stores each shelf from the viewer field the ledger names', () => {
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    const viewer = viewerState() as unknown as Record<string, unknown>;
    for (const [shelf, field] of Object.entries(LIBRARY_FROM)) {
      expect(libraryOf(envelope)[shelf], `library.${shelf} came from viewer.${field}`).toEqual(
        viewer[field],
      );
    }
  });

  it('stores the value the ledger says it came from, not a lookalike', () => {
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    const session = sessionOf(envelope);
    const viewer = viewerState() as unknown as Record<string, unknown>;
    const menu = menuState() as unknown as Record<string, unknown>;
    for (const [key, source] of Object.entries(PERSISTED_FROM)) {
      expect(session[key], `session.${key} came from ${source}.${key}`).toEqual(
        source === 'viewer' ? viewer[key] : menu[key],
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * A save is written when the library moves — GitHub issue #113 § 2
 * -------------------------------------------------------------------------- */

describe('a patch that moves the library is recognised as one', () => {
  /*
   * ## The defect this is the gate for
   *
   * `dev/main.ts#saveSessionNow` had exactly **two** call sites and neither was a save button: a
   * `set-setting` menu intent, and `closeDay()`. Issue #113 § 2 reports the consequence and gets the
   * cause wrong — *"four custom dispatchers, one survived a reload"*, from which the reporter infers
   * two storage paths, because their custom **building** survived. There is one writer
   * (`session.ts#libraryOf`) and one reader (`validate.ts#restoreShelf`); what differs is *when*.
   * A dispatcher filed through *Save it and run it* ran a shift, which closed a day, which wrote the
   * session. One filed through Save alone was never written at all.
   *
   * `dev/main.ts`'s `MountContext.update` is now the choke point, and {@link patchTouchesLibrary} is
   * what it asks. These cases fail on the unfixed source by not compiling — the export does not
   * exist there — which is the weakest way a test can fail and is stated rather than dressed up; the
   * assertion that carries weight is the derived cover below.
   */
  it('is true for each shelf, including one being emptied', () => {
    for (const field of Object.values(LIBRARY_FROM)) {
      expect(patchTouchesLibrary({ [field]: [] }), field).toBe(true);
    }
  });

  it('is false for the patches a drag produces, which is why no debounce is needed', () => {
    /*
     * The hot path. Every slider in every editor patches one of these on `input`, sixty times a
     * second, and a save on each would put a `JSON.stringify` of the whole library inside a drag.
     * The predicate is the debounce: the five patches that *do* move a shelf are button presses.
     */
    expect(patchTouchesLibrary({ dispatcherSpec: viewerState().dispatcherSpec })).toBe(false);
    expect(patchTouchesLibrary({ buildingSpec: viewerState().buildingSpec })).toBe(false);
    expect(patchTouchesLibrary({ levers: viewerState().levers })).toBe(false);
    expect(patchTouchesLibrary({ seed: 42n })).toBe(false);
    expect(patchTouchesLibrary({})).toBe(false);
  });

  it('is true for the patch the dispatcher editor’s Save actually sends', () => {
    // The shape from `dev/dispatcherEditor.ts#save`, which is the press that reported the loss.
    expect(
      patchTouchesLibrary({
        savedDispatchers: [],
        editingDispatcherId: 'yours-1',
        dispatcherSpec: viewerState().dispatcherSpec,
      }),
    ).toBe(true);
  });

  it('covers every shelf the envelope actually has, derived from the bytes', () => {
    /*
     * The assertion with teeth, and the one a fifth shelf cannot slip past. It does not read
     * `LIBRARY_STATE_KEYS`' four values and agree with them; it reads the shelf names **off a
     * written envelope** and requires the predicate to answer `true` for each one's viewer field.
     * A `SavedLibrary` grown a fifth member without a line in `LIBRARY_STATE_KEYS` would be
     * persisted by `saveSession` and never *trigger* a save, which is this defect with one more
     * shelf on it.
     */
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    const shelves = Object.keys(libraryOf(envelope));
    expect(shelves.length, 'the envelope carries no library at all').toBeGreaterThan(0);
    for (const shelf of shelves) {
      const field = LIBRARY_FROM[shelf as keyof SavedLibrary];
      expect(field, `library.${shelf} has no viewer field in the ledger`).toBeDefined();
      expect(patchTouchesLibrary({ [field]: [] }), `library.${shelf}`).toBe(true);
    }
    // And the table the shipped code decides through is the ledger's, not a second copy of it.
    expect(Object.entries(LIBRARY_STATE_KEYS).sort()).toEqual(Object.entries(LIBRARY_FROM).sort());
  });
});

/* -------------------------------------------------------------------------- *
 * The slot
 * -------------------------------------------------------------------------- */

describe('the slot', () => {
  it('is one key, and it is the one types.ts names', () => {
    expect(slotKey(saved())).toBe(SESSION_KEY);
  });

  it('is not the key dev/main.ts already owns', () => {
    // `elevator-sim.viewMode` holds the disclosure mode and is written by a different module. Two
    // modules writing one slot is a lost setting; asserting it here means a rename cannot collide
    // by accident.
    expect(SESSION_KEY).not.toBe('elevator-sim.viewMode');
  });

  it('reads nothing back from an empty store, and says which kind of nothing', () => {
    // The negative control every round-trip assertion below depends on: without this, a module
    // that returned a default snapshot would pass all of them.
    const result = loadSession(memoryStore().store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('absent');
  });
});

/* -------------------------------------------------------------------------- *
 * The round trip
 * -------------------------------------------------------------------------- */

describe('a played session survives a reload', () => {
  it('is not a fresh week to begin with — the control that gives the round trip meaning', () => {
    const week = playedWeek();
    expect(week).not.toEqual(openWeek(FIRST_CONTRACT));
    expect(week.history.length).toBe(2);
    expect(week.cleanRun).toBeGreaterThan(0);
    expect(week.completed.length).toBeGreaterThan(0);
    expect(menuState().settings).not.toEqual(DEFAULT_SETTINGS);
  });

  it('restores the week, the settings and the selection exactly', () => {
    const slots = saved();
    const result = loadSession(slots.store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.week).toEqual(playedWeek());
    expect(result.snapshot.settings).toEqual(menuState().settings);
    expect(result.snapshot.freePlay).toEqual(menuState().freePlay);
  });

  it('restores the weeks the player stepped away from — GitHub issue #107', () => {
    /*
     * The half a reload used to lose after the in-memory fix. `withBuilding` parks a week rather
     * than destroying it, and a parked week that was not written to the slot would make the loss
     * survive exactly one page load — which is the shape of the defect the reporter hit, moved a
     * step further away from where anybody would look for it.
     */
    const result = loadSession(saved().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.parkedWeeks).toEqual([parkedWeek()]);
  });

  it('is not a fresh parked week either — the control for the assertion above', () => {
    const parked = parkedWeek();
    expect(parked).not.toEqual(openWeek('c2'));
    expect(parked.day).toBeGreaterThan(1);
    expect(parked.history.length).toBe(1);
  });

  it('never parks the week that is being played, across the round trip', () => {
    /*
     * `ViewerState.parkedWeeks`' invariant, asserted on the restored value rather than on the one
     * that was written: a slot holding the same contract twice is a campaign that can say two
     * different things about what day it is, and the reader on the other side of a reload has no
     * way to tell which is true.
     */
    const result = loadSession(saved().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.snapshot.parkedWeeks.map((week) => week.contractId);
    expect(ids).not.toContain(result.snapshot.week.contractId);
    expect(new Set(ids).size, 'one parked week per assignment').toBe(ids.length);
  });

  it('restores something that is not the default — the same control, on the restored value', () => {
    const result = loadSession(saved().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.week).not.toEqual(openWeek(FIRST_CONTRACT));
    expect(result.snapshot.settings).not.toEqual(DEFAULT_SETTINGS);
  });

  it('brings back every preference by name, and moves every one first — GitHub issue #70', () => {
    /*
     * **This test is a refutation, kept because refutations go stale too.**
     *
     * Issue #70 reports that *"none of the four preferences survive a reload"*, with the evidence
     * that `localStorage` has no key for theme, reduced motion, energy axis or playback speed. It
     * does not: all four live inside `elevator-sim.session`, and they do come back. Driven in a
     * browser at 1280×720 on the current tip — tick Reduce motion, set Playback speed to 8× and
     * Theme to light, then reload — the slot holds
     * `{"reduceMotion":true,"showEnergyAxis":false,"playbackSpeed":8,"theme":"light"}` before and
     * after, the reloaded Settings screen shows the checkbox ticked, `8` and `light`, and the
     * document carries `data-theme="light"`. The reporter's own third step is the one that came
     * back true.
     *
     * The assertion above already covered this, whole-object. This one is **derived from
     * `Settings`' own key set** rather than resting on one `toEqual`, and it asserts both halves per
     * field: the value comes back, *and* the fixture moved it off its default first. The second half
     * is the one that matters for a fifth preference — a field added to `Settings` and left at its
     * default in {@link menuState} would round-trip trivially and prove nothing about whether the
     * snapshot carries it.
     */
    const wanted = menuState().settings;
    const result = loadSession(saved().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];
    expect(keys.length, 'Settings has no fields to check').toBeGreaterThan(3);
    for (const key of keys) {
      expect(
        wanted[key],
        `the fixture leaves ${key} at its default, so its round trip proves nothing`,
      ).not.toEqual(DEFAULT_SETTINGS[key]);
      expect(result.snapshot.settings[key], `${key} did not survive the reload`).toEqual(wanted[key]);
    }
  });

  it('hands back a frozen value, because a week is a value everywhere else', () => {
    const result = loadSession(saved().store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.snapshot.week)).toBe(true);
    expect(Object.isFrozen(result.snapshot.week.history)).toBe(true);
    expect(Object.isFrozen(result.snapshot.week.history[0])).toBe(true);
  });

  it('reports the bytes it wrote', () => {
    const slots = memoryStore();
    const result = saveSession(slots.store, viewerState(), menuState());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes).toBe(slots.written.get(SESSION_KEY)?.length);
  });
});

/* -------------------------------------------------------------------------- *
 * bigint — the trap, from both sides
 * -------------------------------------------------------------------------- */

describe('bigint', () => {
  it('saves a state whose seed is a bigint, because the seed is excluded rather than survived', () => {
    // `ViewerState.seed` is a bigint in the very object handed to `saveSession`. The save succeeds
    // only because `snapshotOf` never reaches it — so this asserts the exclusion is load-bearing
    // rather than incidental, and the next assertion proves the seed really is absent.
    const slots = memoryStore();
    expect(saveSession(slots.store, viewerState(), menuState()).ok).toBe(true);
    expect(slots.written.get(SESSION_KEY)).not.toContain(VIEWER_SEED.toString());
  });

  it('refuses a snapshot that smuggles one in, and names the path', () => {
    const slots = memoryStore();
    const viewer = viewerState();
    // A field widened to a bigint — the shape a future edit to `WeekState` would have. The cast is
    // the point: the types are erased by the time `saveSession` runs, so nothing but this walker
    // stands between the shell and a TypeError from inside a click handler.
    const smuggled: ViewerState = {
      ...viewer,
      week: { ...viewer.week, day: 3n as unknown as number },
    };
    const result = saveSession(slots.store, smuggled, menuState());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('unserialisable');
    if (result.failure.kind !== 'unserialisable') return;
    expect(result.failure.path).toBe('the session.session.week.day');
    expect(result.failure.message).toContain('bigint');
    // …and nothing was written, so a bad snapshot cannot displace a good save.
    expect(slots.written.size).toBe(0);
  });

  it('positive control: JSON.stringify really does throw on the smuggled value', () => {
    // Without this the walker could be refusing something harmless and the test above would still
    // be green. The claim is *"JSON.stringify throws"*, so the claim is run.
    expect(() => JSON.stringify({ day: 3n })).toThrow();
  });

  it('leaves a good save in place when a later bad one is refused', () => {
    const slots = saved();
    const before = slots.written.get(SESSION_KEY);
    const viewer = viewerState();
    saveSession(
      slots.store,
      { ...viewer, week: { ...viewer.week, streak: 1n as unknown as number } },
      menuState(),
    );
    expect(slots.written.get(SESSION_KEY)).toBe(before);
    expect(loadSession(slots.store).ok).toBe(true);
  });
});

describe('the round-trip walker', () => {
  it('passes the value that is actually saved', () => {
    // The positive control for every refusal below: a walker that rejected everything would make
    // the whole module a no-op with excellent error messages.
    expect(
      jsonRoundTripIssue({
        week: playedWeek(),
        settings: menuState().settings,
        freePlay: menuState().freePlay,
      }),
    ).toBeUndefined();
  });

  it('names each way a value fails to come back as itself', () => {
    const cases: readonly [unknown, string][] = [
      [{ a: 1n }, 'bigint'],
      [{ a: undefined }, 'undefined'],
      [{ a: () => 1 }, 'function'],
      [{ a: Symbol('a') }, 'symbol'],
      [{ a: Number.NaN }, 'NaN'],
      [{ a: Number.POSITIVE_INFINITY }, 'Infinity'],
      [{ a: new Date(0) }, 'Date'],
      [{ a: new Map() }, 'Map'],
      [{ a: new Set() }, 'Set'],
    ];
    for (const [value, expected] of cases) {
      const issue = jsonRoundTripIssue(value);
      expect(issue, expected).toBeDefined();
      expect(`${issue?.path ?? ''} ${issue?.reason ?? ''}`).toContain(expected);
      expect(issue?.path).toBe('the snapshot.a');
    }
  });

  it('catches a cycle rather than recursing into one', () => {
    const cycle: Record<string, unknown> = { name: 'week' };
    cycle['self'] = cycle;
    expect(jsonRoundTripIssue(cycle)?.reason).toContain('cycle');
  });

  it('positive control: the three quiet failures really are quiet', () => {
    // The `Date`/`Map`/`Set` arm is the one that matters most, because unlike the bigint the write
    // *succeeds* and the value silently changes type. Asserted, so the refusal is justified by
    // what JSON actually does rather than by caution.
    expect(JSON.parse(JSON.stringify({ a: new Date(0) }))).toEqual({ a: '1970-01-01T00:00:00.000Z' });
    expect(JSON.parse(JSON.stringify({ a: new Set([1, 2]) }))).toEqual({ a: {} });
    expect(JSON.parse(JSON.stringify({ a: undefined }))).toEqual({});
    expect(JSON.parse(JSON.stringify({ a: Number.NaN }))).toEqual({ a: null });
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals
 * -------------------------------------------------------------------------- */

describe('a payload this build cannot read is refused, with the reason', () => {
  it('refuses text that is not JSON', () => {
    const slots = saved();
    slots.written.set(SESSION_KEY, '{"schemaVersion":1,"session":{');
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'parse') {
      expect.unreachable('a truncated document is a parse failure');
      return;
    }
    expect(result.failure.message.length).toBeGreaterThan(20);
  });

  it('refuses a JSON value that is not an object', () => {
    const slots = saved();
    slots.written.set(SESSION_KEY, '[1,2,3]');
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
  });

  it('refuses a newer envelope and an older one, differently', () => {
    // Outside `SESSION_SCHEMA_VERSIONS_READ` in both directions. Version 1 is deliberately absent
    // from this list — it is *read*, and the block below is where that is asserted.
    const older = Math.min(...SESSION_SCHEMA_VERSIONS_READ) - 1;
    for (const version of [SESSION_SCHEMA_VERSION + 1, older]) {
      const slots = saved();
      tamper(slots, (envelope) => {
        envelope['schemaVersion'] = version;
      });
      const result = loadSession(slots.store);
      expect(result.ok, `version ${String(version)}`).toBe(false);
      if (result.ok || result.failure.kind !== 'version') {
        expect.unreachable(`version ${String(version)} must be refused as a version`);
        return;
      }
      expect(result.failure.found).toBe(version);
      expect(result.failure.supported).toBe(SESSION_SCHEMA_VERSION);
      expect(result.failure.message).toContain(version > SESSION_SCHEMA_VERSION ? 'newer' : 'older');
    }
  });

  it('refuses an envelope with no version at all', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      delete envelope['schemaVersion'];
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
  });

  it('refuses an envelope missing a key its own version has', () => {
    // The other half of the both-directions rule on the envelope. A version-2 envelope without a
    // `library` is as suspect as one with a `savedAt`: the version is what vouches for the key set.
    const slots = saved();
    tamper(slots, (envelope) => {
      delete envelope['library'];
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('library');
  });

  it('refuses an envelope carrying a key this build does not know', () => {
    // The version number is supposed to have caught this. An unknown sibling means either it was
    // not bumped when a field landed, or these bytes are not ours — and silently dropping whatever
    // it meant is how half a session gets restored.
    const slots = saved();
    tamper(slots, (envelope) => {
      envelope['savedAt'] = 1;
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('savedAt');
  });
});

/* -------------------------------------------------------------------------- *
 * Shape, derived from the real values rather than from a list
 * -------------------------------------------------------------------------- */

describe('the shape check matches the values, not only the types', () => {
  it('accepts what the shipped constructors actually produce', () => {
    // The ghost direction: a check table naming a field the value does not have would fail here.
    expect(
      snapshotIssue({
        week: playedWeek(),
        parkedWeeks: [openWeek('c2')],
        settings: DEFAULT_SETTINGS,
        freePlay: initialMenuState(catalogueOf(resources)).freePlay,
      }),
    ).toBeUndefined();
  });

  it('refuses a week missing any one of its own keys, and names it', () => {
    // Derived from `openWeek()` rather than listed, so a field added to `WeekState` is covered on
    // the day it lands. Every key, one at a time — the missing direction.
    for (const key of Object.keys(openWeek(FIRST_CONTRACT))) {
      const slots = saved();
      tamper(slots, (envelope) => {
        delete weekOf(envelope)[key];
      });
      const result = loadSession(slots.store);
      expect(result.ok, `week.${key} removed`).toBe(false);
      if (result.ok || result.failure.kind !== 'shape') {
        expect.unreachable(`a week without ${key} is a shape failure`);
        return;
      }
      expect(result.failure.message, `week.${key}`).toContain(key);
    }
  });

  it('refuses a settings block missing any one of its own keys', () => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const slots = saved();
      tamper(slots, (envelope) => {
        delete (sessionOf(envelope)['settings'] as Record<string, unknown>)[key];
      });
      const result = loadSession(slots.store);
      expect(result.ok, `settings.${key} removed`).toBe(false);
    }
  });

  it('refuses a selection missing any one of its own keys', () => {
    for (const key of Object.keys(initialMenuState(catalogueOf(resources)).freePlay)) {
      const slots = saved();
      tamper(slots, (envelope) => {
        delete (sessionOf(envelope)['freePlay'] as Record<string, unknown>)[key];
      });
      const result = loadSession(slots.store);
      expect(result.ok, `freePlay.${key} removed`).toBe(false);
    }
  });

  it('refuses a week carrying a key this build does not know', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      weekOf(envelope)['moraleBonus'] = 3;
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('moraleBonus');
  });

  it('refuses a field of the right name and the wrong type, deep in the history', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      const history = weekOf(envelope)['history'] as Record<string, unknown>[];
      const first = history[0] as Record<string, unknown>;
      const readings = first['readings'] as Record<string, unknown>[];
      (readings[0] as Record<string, unknown>)['progressPct'] = 'most of it';
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'shape') {
      expect.unreachable('a string where a percentage belongs is a shape failure');
      return;
    }
    expect(result.failure.field).toBe('the session.week.history[0].readings[0].progressPct');
  });

  it('refuses a history longer than the week keeps', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      const week = weekOf(envelope);
      const history = week['history'] as unknown[];
      week['history'] = Array.from({ length: HISTORY_DAYS + 1 }, () => history[0]);
    });
    expect(loadSession(slots.store).ok).toBe(false);
  });

  it('refuses a playback speed this build does not offer, and accepts every one it does', () => {
    for (const speed of [...PLAYBACK_SPEEDS, 3]) {
      const slots = saved();
      tamper(slots, (envelope) => {
        (sessionOf(envelope)['settings'] as Record<string, unknown>)['playbackSpeed'] = speed;
      });
      expect(loadSession(slots.store).ok, `playbackSpeed ${String(speed)}`).toBe(
        PLAYBACK_SPEEDS.includes(speed),
      );
    }
  });

  it('refuses a theme outside the union', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      (sessionOf(envelope)['settings'] as Record<string, unknown>)['theme'] = 'sepia';
    });
    expect(loadSession(slots.store).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The seed, where the JSON boundary and the identity type touch
 * -------------------------------------------------------------------------- */

describe('a restored seed is one BigInt() will accept', () => {
  const good = ['0', '42', '20260804', '918273645546372819'];
  const bad = ['', ' 42', '42 ', '-1', '1e3', '0x2a', 'forty-two', '4_2', '1.0'];

  it('accepts the ones enterFreePlay could use', () => {
    for (const seed of good) {
      const slots = saved();
      tamper(slots, (envelope) => {
        (sessionOf(envelope)['freePlay'] as Record<string, unknown>)['seed'] = seed;
      });
      expect(loadSession(slots.store).ok, seed).toBe(true);
    }
  });

  it('refuses the ones it could not', () => {
    for (const seed of bad) {
      const slots = saved();
      tamper(slots, (envelope) => {
        (sessionOf(envelope)['freePlay'] as Record<string, unknown>)['seed'] = seed;
      });
      expect(loadSession(slots.store).ok, `“${seed}”`).toBe(false);
    }
  });

  it('positive control: BigInt throws on the seeds this check exists to stop', () => {
    // Half the refusal is *"enterFreePlay would throw on this"*, and that half is run rather than
    // assumed. These four reach `BigInt(selection.seed)` inside the Start handler and take the
    // click with them.
    for (const seed of good) expect(() => BigInt(seed), seed).not.toThrow();
    for (const seed of ['1e3', 'forty-two', '4_2', '1.0']) {
      expect(() => BigInt(seed), seed).toThrow();
    }
  });

  it('is deliberately stricter than BigInt, because a seed is an identity', () => {
    /*
     * The other half, and the measured surprise: `BigInt` is far looser than the field's own
     * contract. It reads `''` as **0n**, trims surrounding whitespace, accepts a sign and parses
     * hex — so every one of these would *run*, and four of the five would run a **different**
     * selection from the one the string names.
     *
     * `FreePlaySelection.seed` is *"decimal digits. A string because a seed is an identity, not a
     * quantity to do arithmetic on"*, and § D214 § 4 hashes the selection into the board a score
     * belongs to. `' 42'` and `'42'` are then two identities for one run, `'0x2a'` is a third, and
     * `''` is the worst of them: a session with no seed at all comes back playing seed zero while
     * nothing on screen says so. Refusing is the only outcome that keeps the identity honest, so
     * the regex is narrower than the conversion on purpose and this is where that is recorded.
     */
    expect(BigInt('')).toBe(0n);
    expect(BigInt(' 42')).toBe(42n);
    expect(BigInt('42 ')).toBe(42n);
    expect(BigInt('-1')).toBe(-1n);
    expect(BigInt('0x2a')).toBe(42n);
    // …and all five are refused here, which the `bad` case above asserts through the load path.
    for (const seed of ['', ' 42', '42 ', '-1', '0x2a']) {
      expect(bad, seed).toContain(seed);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * A week banked toward an assignment that no longer exists
 * -------------------------------------------------------------------------- */

describe('a contract this build no longer ships', () => {
  const GHOST = 'c99';

  it('is not one of the shipped ids — the control for every row below', () => {
    expect(CONTRACTS.map((contract) => contract.id)).not.toContain(GHOST);
  });

  it('finds nothing wrong with a week naming only shipped contracts', () => {
    expect(unknownContractsIn(playedWeek())).toEqual([]);
  });

  it('is found at every site a week can name one', () => {
    // One row per place `unknownContractsIn` looks. A site dropped from that function turns exactly
    // one of these red, which is what stops the list inside it going stale unread.
    const sites: readonly [string, (week: WeekState) => WeekState][] = [
      ['contractId', (week) => ({ ...week, contractId: GHOST })],
      ['completed', (week) => ({ ...week, completed: [...week.completed, GHOST] })],
      [
        'banked.completed',
        (week) => ({
          ...week,
          banked: { streak: 0, cleanRun: 0, completed: [GHOST] },
        }),
      ],
      [
        'cleared.contractId',
        (week) => ({
          ...week,
          cleared: {
            contractId: GHOST,
            reward: 'a reward',
            nextContractId: null,
            nextTitle: 'the end',
          },
        }),
      ],
      [
        'cleared.nextContractId',
        (week) => ({
          ...week,
          cleared: {
            contractId: FIRST_CONTRACT,
            reward: 'a reward',
            nextContractId: GHOST,
            nextTitle: 'a title',
          },
        }),
      ],
    ];
    for (const [site, edit] of sites) {
      expect(unknownContractsIn(edit(playedWeek())), site).toEqual([GHOST]);
    }
  });

  it('refuses the whole session rather than restoring progress toward nothing', () => {
    const slots = saved();
    tamper(slots, (envelope) => {
      weekOf(envelope)['contractId'] = GHOST;
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'stale') {
      expect.unreachable('a vanished assignment is a stale session');
      return;
    }
    expect(result.failure.missing).toEqual([GHOST]);
    expect(result.failure.message).toContain(GHOST);
  });

  it('refuses it for a *parked* week too, at the instant nothing is in progress', () => {
    /*
     * Parked weeks name contracts for exactly the same reason the live one does — GitHub issue
     * #107. Checking only the live week would defer the refusal until the player picked that
     * building, which is the one moment this module's own argument says it must not happen: being
     * strict costs nothing before anything is in progress, and everything once a week is on screen.
     */
    const slots = saved();
    tamper(slots, (envelope) => {
      const parked = sessionOf(envelope)['parkedWeeks'] as Record<string, unknown>[];
      const first = parked[0];
      if (first === undefined) throw new Error('the fixture parks no week');
      first['contractId'] = GHOST;
    });
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'stale') {
      expect.unreachable('a parked week toward a vanished assignment is a stale session');
      return;
    }
    expect(result.failure.missing).toEqual([GHOST]);
  });

  /**
   * The two ids that answer to no contract **on purpose**, and the session they were refusing.
   *
   * Found while building issue #107's parked weeks. `unknownContractsIn` asked
   * `contractById(id) === undefined`, and `week.ts` ships two sentinels that are meant to answer to
   * nothing: `endless`, reached by pressing **Keep going**, and `sandbox`, reached by drawing a
   * building. Both were reported as assignments *"this build no longer has"*, so every endless and
   * every sandbox week was refused on reload and the slot was then cleared — the player lost the
   * week, the library's own notice said nothing about it, and the reason they were given named an
   * assignment that had never existed.
   *
   * Driven through the real `loadSession` rather than against `unknownContractsIn` alone, because
   * the outcome that matters is *the week came back*, not *the helper returned an empty array*.
   */
  it('reads the two deliberate sentinels rather than calling them vanished', () => {
    for (const contractId of [ENDLESS_CONTRACT_ID, SANDBOX_CONTRACT_ID]) {
      expect(unknownContractsIn(openWeek(contractId)), contractId).toEqual([]);
      const slots = saved();
      tamper(slots, (envelope) => {
        weekOf(envelope)['contractId'] = contractId;
      });
      const result = loadSession(slots.store);
      expect(result.ok, `a ${contractId} week is a week, not a stale session`).toBe(true);
      if (!result.ok) return;
      expect(result.snapshot.week.contractId).toBe(contractId);
      // The week itself is intact, not merely accepted: the streak and the banked days a player
      // pressed **Keep going** with are the whole of what the refusal was taking away.
      expect(result.snapshot.week.history).toEqual(playedWeek().history);
    }
  });

  it('still refuses an id that was meant to name a contract and no longer does', () => {
    // The negative control for the exemption above. Two sentinels are readable; a third id is not,
    // which is what stops the exemption becoming *"anything unrecognised is fine"*.
    expect(unknownContractsIn(openWeek(GHOST))).toEqual([GHOST]);
  });
});

/* -------------------------------------------------------------------------- *
 * A store that says no
 * -------------------------------------------------------------------------- */

describe('a browser that refuses storage', () => {
  it('turns a throwing read into a value', () => {
    const result = loadSession(throwingStore('SecurityError: access denied'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('unavailable');
    expect(result.failure.message).toContain('SecurityError');
  });

  it('turns a throwing write into a value, and says how much it tried to write', () => {
    const result = saveSession(throwingStore('QuotaExceededError'), viewerState(), menuState());
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'store') {
      expect.unreachable('a refused write is a store failure');
      return;
    }
    expect(result.failure.message).toContain('QuotaExceededError');
    expect(result.failure.message).toMatch(/\d+ characters/u);
  });

  it('turns a throwing remove into a false rather than an exception', () => {
    expect(clearSession(throwingStore('SecurityError'))).toBe(false);
  });
});

describe('forgetting', () => {
  it('empties the slot, and the next load says nothing is there', () => {
    const slots = saved();
    expect(clearSession(slots.store)).toBe(true);
    expect(slots.written.size).toBe(0);
    const result = loadSession(slots.store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('absent');
  });

  it('leaves a key it does not own alone', () => {
    // The reason the port is three narrow methods and not `Storage`: there is no `clear()` to call,
    // so `elevator-sim.viewMode` cannot be collateral damage.
    const slots = saved();
    slots.written.set('elevator-sim.viewMode', 'advanced');
    clearSession(slots.store);
    expect(slots.written.get('elevator-sim.viewMode')).toBe('advanced');
  });
});

/* -------------------------------------------------------------------------- *
 * The exclusions that are promises other modules made
 * -------------------------------------------------------------------------- */

describe('what the bytes must not contain', () => {
  it('carries no account token, because menu/account.ts says it never leaves memory', () => {
    // `account.ts`: *"`token` is held in memory only. It is deliberately not written to
    // localStorage."* A module whose job is to persist things is exactly where that promise gets
    // quietly reversed, so it is kept by a run rather than by a docstring.
    const slots = saved();
    const text = slots.written.get(SESSION_KEY) ?? '';
    expect(text).not.toContain('token');
    expect(text).not.toContain('password');
  });

  it('carries neither the recording nor the report', () => {
    const text = saved().written.get(SESSION_KEY) ?? '';
    // The literal is the *current* recording schema, derived rather than pinned: a pinned `8`
    // went stale the day slice 4b bumped the contract to 9, and a stale pin here checks that the
    // session does not embed a recording shape no build writes any more.
    expect(text).not.toContain(`schemaVersion":${String(VIZ_SCHEMA_VERSION)}`);
    expect(text).not.toContain('smallPrint');
    expect(text).not.toContain('diagnosis');
  });

  it('stays small enough that a quota is not the interesting failure', () => {
    /*
     * A full week of history, a cleared award and every setting off its default. If this ever
     * approaches a megabyte, something unbounded has been added to the snapshot.
     *
     * Measured on the **session** rather than on the whole envelope, and that narrowing is what
     * `types.ts#LIBRARY_BUDGET_CHARACTERS` cites: the library is unbounded by design and bounded by
     * a budget, so folding it in here would turn this assertion into a second, quieter budget that
     * fires at a different number. Everything outside the library is what this bounds.
     */
    const slots = saved();
    const envelope = JSON.parse(slots.written.get(slotKey(slots)) ?? '') as Record<string, unknown>;
    expect(JSON.stringify(sessionOf(envelope)).length).toBeLessThan(64_000);
  });
});
