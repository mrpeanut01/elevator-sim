/**
 * **Every schema version this product has ever written still opens, and the state it opens into is
 * one the current build will take back** — GitHub issue **#243** AC3, and the mechanised half of
 * [`docs/41-launch-checklist.md`](../../../../docs/41-launch-checklist.md) § 3.
 *
 * ## The row set is derived, not transcribed, and that is the whole point of the file
 *
 * A hand-written list of *versions in the wild* is exactly the constant this repository has been
 * caught by repeatedly — `campaign/careerPersist.ts:84` already warns about "discovering that the
 * set was a literal", and `CLAUDE.md`'s standing requirement is that a guard which cannot see what
 * it is guarding passes forever. So no version number is written down here. The rows come from
 * {@link SESSION_SCHEMA_VERSION} itself — the number the **writer** stamps — counted down to 1:
 *
 * ```ts
 * versionsUpTo(SESSION_SCHEMA_VERSION)   //  [1, 2, … , SESSION_SCHEMA_VERSION]
 * ```
 *
 * **Why that set is the right one, stated precisely rather than assumed.** The versions that have
 * been *deployed* are a subset of the versions that have ever been *written*, and for a counter
 * incremented one at a time the second set is exactly `1 … current`. Testing the superset cannot
 * under-test the question the acceptance criterion asks; it can only do more work than the criterion
 * strictly needs, on versions that may never have reached a browser. That is the honest trade and it
 * is deliberately in this direction, because the alternative — deriving the deployed set from
 * `git log -S` bounded at the arming date — cannot run here: `actions/checkout@v4` clones to depth 1
 * by default (`.github/workflows/ci.yml:190` sets no `fetch-depth`), so a git-history derivation
 * would be green locally and vacuous in CI, which is worse than a superset.
 *
 * **What makes it unable to go stale.** Bumping `SESSION_SCHEMA_VERSION` adds a row to this matrix
 * on the same commit, and that row is **red** until somebody writes the step-down for it and the
 * migration that reads it. There is no list to forget to update. The same shape drives
 * `PROFILE_SCHEMA_VERSION` and `CAREER_SCHEMA_VERSION` below.
 *
 * ## The three assertions each row makes, and why "it parses" is not one of them
 *
 * 1. **It migrates.** `loadSession` returns `ok` on an envelope shaped as that version wrote it.
 * 2. **The migration fills the value the absence determined, rather than any value.** Each version's
 *    entry names what an older envelope could not carry and what the completion must therefore
 *    produce — `windowStartS: null`, `parkedWeeks: []`, `record: null`, `ruleRows: []` and a
 *    record `version` of 2. A migration that filled a *different* value would still parse.
 * 3. **The current build takes the result back.** The restored snapshot is put into a real
 *    {@link ViewerState} and {@link MenuState} through the same constructors `dev/main.ts` uses, the
 *    real `saveSession` writes it, and the bytes are read again. The re-written envelope must stamp
 *    the **current** version, and the week must still be playable — `nextDay` then `closeDay` — and
 *    still save. A state that parses and then cannot be written back is a player whose next autosave
 *    fails, which is the failure this criterion exists to find before a launch rather than after.
 *
 * ## Non-vacuity, because a step-down that did nothing would pass every row
 *
 * The trap is obvious once stated: if `stepDownFrom(6)` returned its input, version 5's row would be
 * a version-9 payload wearing a `5`, and the reader would accept it for the wrong reason. So every
 * step is asserted to **change** the envelope, and the field it removes is asserted absent. The
 * positive controls in `docs/41` § 3.4 are the other half of that: deleting a migration arm, or
 * deleting a step-down's body, must redden this file.
 *
 * ## What this file does not claim
 *
 * It does not claim any of these versions was ever loaded from a real browser's `localStorage`. It
 * drives the injected {@link SessionStore} port, which is what every other test in this directory
 * does and what makes the module testable at all. `docs/41` § 3.6 carries that gap in
 * `docs/16-static-site-deployment.md` § 9's voice.
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
  CAREER_SCHEMA_VERSION,
  CAREER_SCHEMA_VERSIONS_READ,
  decodeCareer,
  encodeCareer,
} from '../campaign/careerPersist.js';
import { openingCareer } from '../campaign/career.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, type ViewerState } from '../dev/state.js';
import {
  PROFILE_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSIONS_READ,
  DEFAULT_EVERYDAY_PROFILE,
  EMPTY_EVERYDAY_PROGRESS,
  loadDefaultSpeed,
  loadProfile,
  loadProgress,
  loadSound,
  loadUnits,
  saveEveryday,
} from '../everyday/profile.js';
import { catalogueOf } from '../menu/catalogue.js';
import { initialMenuState, updateFreePlay, updateSettings } from '../menu/menu.js';
import type { MenuState } from '../menu/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { eventFor } from '../shift/events.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { WeekState } from '../shift/types.js';
import { closeDay, nextDay, openWeek, outcomeOf } from '../shift/week.js';

import { loadSession, saveSession } from './session.js';
import {
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSIONS_READ,
  type SessionStore,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The derivation — the only place a version number is produced in this file
 * -------------------------------------------------------------------------- */

/**
 * `[1, 2, … , current]`, from the constant the writer stamps.
 *
 * This is the mechanism the module docstring argues for: a bump adds a row here without anybody
 * editing this file, and the added row fails until its step-down and its migration exist.
 *
 * ## The vacuity guard is not decoration — it caught this file on its first run
 *
 * `PROFILE_SCHEMA_VERSION` and `PROFILE_SCHEMA_VERSIONS_READ` were module-private in
 * `everyday/profile.ts` when this file was written. `Array.from({ length: undefined })` is `[]`, so
 * the profile matrix produced **no rows at all**, the both-directions check compared two empty
 * lists, and the whole block passed while testing nothing. That is precisely the failure the row
 * derivation exists to prevent, reappearing one level up in the derivation itself. The constants are
 * exported now; this guard is what makes the next such import red instead of silent.
 */
function versionsUpTo(current: number): readonly number[] {
  expect(
    Number.isInteger(current) && current >= 1,
    `a schema version constant read as ${String(current)} — an unexported or renamed constant makes this matrix empty rather than red`,
  ).toBe(true);
  return Array.from({ length: current }, (_, index) => index + 1);
}

/* -------------------------------------------------------------------------- *
 * Fixtures — the shipped constructors, never a literal week
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = ['garden-apartments', 'midtown-office'] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    priceSchedule: shippedPriceSchedule(),
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

const FIRST_CONTRACT = CONTRACTS[0]?.id ?? 'c1';

/**
 * Every bar met, so a closed day banks rather than leaving the week at its defaults.
 *
 * `abandonedCarried` and `horizonS` are the two gate-shaped fields GitHub issue #456 moved onto
 * `GoalObservations`, and they are set here rather than omitted because the type requires them: a
 * nobody-left day has an overlap of zero, and 900 s is the horizon every other fixture in this
 * package draws at. Neither is in `GOAL_OBSERVATION_IDS`, so no goal reads them and no row below
 * turns on their value — they exist so the fixture is the shape the shipped constructors take.
 */
const PERFECT = Object.freeze({
  arrived: 500,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 0,
  abandoned: 0,
  abandonedCarried: 0,
  horizonS: 900,
  worstWaitS: 30,
  worstWaitIsCensored: false,
  workPerServedLegKJ: 34.7,
});

/**
 * A week that has been played, built by the shipped constructors — `persist.test.ts`'s rule, for its
 * reason: a fixture that hand-writes what a constructor produces cannot catch a constructor that
 * changed, and GitHub issue #159 is the wave where exactly that happened to `eventId`.
 */
function playedWeek(): WeekState {
  const day1 = outcomeOf({
    record: null,
    recordRefusal: null,
    day: 1,
    dayIdx: 0,
    eventId: eventFor(1, 0).id,
    arrived: 500,
    carried: 498,
    minutePct: 91.5,
    readings: readGoals(goalsForDay(1), PERFECT),
  });
  const day2 = outcomeOf({
    record: null,
    recordRefusal: null,
    day: 2,
    dayIdx: 1,
    eventId: eventFor(2, 1).id,
    arrived: 540,
    carried: 500,
    minutePct: 74.25,
    readings: readGoals(goalsForDay(2), { ...PERFECT, minutePct: 20 }),
  });
  return closeDay(nextDay(closeDay(openWeek(FIRST_CONTRACT), day1)), day2);
}

/** A second week the player has stepped away from — the thing version 4 added. */
function parkedWeek(): WeekState {
  const day1 = outcomeOf({
    record: null,
    recordRefusal: null,
    day: 1,
    dayIdx: 0,
    eventId: eventFor(1, 0).id,
    arrived: 700,
    carried: 690,
    minutePct: 88,
    readings: readGoals(goalsForDay(1), PERFECT),
  });
  return nextDay(closeDay(openWeek('c2'), day1));
}

const VIEWER_SEED = 918_273_645_546_372_819n;

function viewerState(): ViewerState {
  return { ...initialState(resources, VIEWER_SEED), week: playedWeek(), parkedWeeks: [parkedWeek()] };
}

function menuState(): MenuState {
  const opened = initialMenuState(catalogueOf(resources));
  return updateFreePlay(
    updateSettings(opened, { reduceMotion: true, playbackSpeed: 4, theme: 'dark' }),
    { durationS: 3600, arrivalRatePctPop5min: 6, seed: '1234567890' },
  );
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

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The envelope the current build writes, as a mutable tree this file may take apart. */
function currentEnvelope(): Record_ {
  const slots = memoryStore();
  const saved = saveSession(slots.store, viewerState(), menuState());
  expect(saved.ok, 'the fixture itself must save, or every row below is about nothing').toBe(true);
  const text = slots.written.get(SESSION_KEY);
  expect(text, 'the save must have written the one slot this module owns').toBeTypeOf('string');
  return JSON.parse(text ?? '{}') as Record_;
}

/* -------------------------------------------------------------------------- *
 * The step-downs — one per version, each undoing exactly what that version added
 * -------------------------------------------------------------------------- */

/**
 * What one version added, undone — so applying steps `current … v+1` yields the envelope version `v`
 * wrote.
 *
 * Each entry is a **historical fixture** and is allowed to be true forever rather than tracked
 * against today's code, which is `store/migrations.test.ts`'s stated rule for `SCHEMA_BEFORE_LEGS`:
 * *"what it has to be is a database this code did not create"*. What is **not** allowed to go stale
 * is the *set of keys*, and that is checked against {@link SESSION_SCHEMA_VERSION} rather than read
 * off this object.
 *
 * `removes` names the field the step takes away, in words, so a failure says which version's shape
 * is wrong rather than only that a comparison failed.
 */
interface StepDown {
  /** What this version introduced, undone. Must change the envelope — asserted, never assumed. */
  readonly undo: (envelope: Record_) => Record_;
  /** What the version below could not carry. Printed in failures. */
  readonly removes: string;
}

const everyWeek = (envelope: Record_): Record_[] => {
  const session = envelope['session'];
  if (!isRecord(session)) return [];
  const weeks: Record_[] = [];
  if (isRecord(session['week'])) weeks.push(session['week']);
  const parked = session['parkedWeeks'];
  if (Array.isArray(parked)) for (const week of parked) if (isRecord(week)) weeks.push(week);
  return weeks;
};

const everyDay = (envelope: Record_): Record_[] => {
  const days: Record_[] = [];
  for (const week of everyWeek(envelope)) {
    const history = week['history'];
    if (Array.isArray(history)) for (const day of history) if (isRecord(day)) days.push(day);
  }
  return days;
};

/** Drop the readings of one goal from every day, which is how a value-widening version is undone. */
function withoutGoal(envelope: Record_, reads: string): Record_ {
  for (const day of everyDay(envelope)) {
    const readings = day['readings'];
    if (!Array.isArray(readings)) continue;
    day['readings'] = readings.filter((reading) => {
      const goal = isRecord(reading) ? reading['goal'] : undefined;
      return !(isRecord(goal) && goal['reads'] === reads);
    });
  }
  return envelope;
}

const STEP_DOWN: Readonly<Record<number, StepDown>> = Object.freeze({
  2: {
    removes: 'the sibling library',
    undo: (envelope) => {
      delete envelope['library'];
      return envelope;
    },
  },
  3: {
    removes: 'session.freePlay.windowStartS',
    undo: (envelope) => {
      const session = envelope['session'];
      if (isRecord(session) && isRecord(session['freePlay'])) delete session['freePlay']['windowStartS'];
      return envelope;
    },
  },
  4: {
    removes: 'session.parkedWeeks',
    undo: (envelope) => {
      const session = envelope['session'];
      if (isRecord(session)) delete session['parkedWeeks'];
      return envelope;
    },
  },
  5: {
    // A value widening rather than a key: the worst-wait goal joined the day's readings.
    removes: 'the worst-wait reading',
    undo: (envelope) => withoutGoal(envelope, 'worstWaitS'),
  },
  6: {
    removes: 'DayOutcome.record',
    undo: (envelope) => {
      for (const day of everyDay(envelope)) delete day['record'];
      return envelope;
    },
  },
  7: {
    removes: 'DayOutcome.recordRefusal and WatchRecord.ruleRows',
    undo: (envelope) => {
      for (const day of everyDay(envelope)) {
        delete day['recordRefusal'];
        const stored = day['record'];
        if (isRecord(stored)) {
          delete stored['ruleRows'];
          stored['version'] = 1;
        }
      }
      return envelope;
    },
  },
  8: {
    // The energy bar — the fifth goal, § D468 and GitHub issue #275.
    removes: 'the work-per-leg reading',
    undo: (envelope) => withoutGoal(envelope, 'workPerServedLegKJ'),
  },
  9: {
    // § 17's wrinkle library made `eventId` a drawn id; version 8 had only the closed seven, and
    // `ordinary` is the one every rota still draws.
    removes: 'the drawn wrinkle id',
    undo: (envelope) => {
      for (const day of everyDay(envelope)) day['eventId'] = 'ordinary';
      return envelope;
    },
  },
});

/**
 * The envelope as version `target` wrote it — built by undoing every version above it, in order.
 *
 * Each step is required to **change** something. That is the non-vacuity guard the module docstring
 * names: a step whose body was deleted would otherwise hand a current payload to a row that claims
 * to be testing an old one, and the row would pass for the wrong reason.
 */
function envelopeAsWrittenBy(target: number): Record_ {
  let envelope = currentEnvelope();
  for (let version = SESSION_SCHEMA_VERSION; version > target; version -= 1) {
    const step = STEP_DOWN[version];
    expect(step, `version ${String(version)} has no step-down`).toBeDefined();
    if (step === undefined) continue;
    const before = JSON.stringify(envelope);
    envelope = step.undo(envelope);
    expect(
      JSON.stringify(envelope),
      `undoing version ${String(version)} (${step.removes}) changed nothing, so every row below it is a current payload wearing an old number`,
    ).not.toBe(before);
  }
  envelope['schemaVersion'] = target;
  return envelope;
}

/* -------------------------------------------------------------------------- *
 * The session slot
 * -------------------------------------------------------------------------- */

describe('the session slot — every version this build has ever written', () => {
  it('derives its rows from the writer’s own constant, and the read set agrees in both directions', () => {
    const written = versionsUpTo(SESSION_SCHEMA_VERSION);

    // Every version this product has written must still be readable. A bump that forgot to widen
    // the read set lands here rather than on a player.
    expect(
      written.filter((version) => !SESSION_SCHEMA_VERSIONS_READ.includes(version)),
      'a version this build once wrote is no longer in SESSION_SCHEMA_VERSIONS_READ',
    ).toEqual([]);

    // And the other direction: a number in the read set that was never written is either a typo or
    // a version from another product, and either way nothing can produce bytes for it.
    expect(
      SESSION_SCHEMA_VERSIONS_READ.filter((version) => !written.includes(version)),
      'SESSION_SCHEMA_VERSIONS_READ names a version outside 1…SESSION_SCHEMA_VERSION',
    ).toEqual([]);
  });

  it('has a step-down for every version above the first, and none for a version that does not exist', () => {
    const declared = Object.keys(STEP_DOWN)
      .map(Number)
      .sort((a, b) => a - b);
    // Version 1 is the base and needs no step-down; every other written version needs one, or
    // `envelopeAsWrittenBy` cannot build a payload for the row below it.
    expect(declared, 'the step-down table and SESSION_SCHEMA_VERSION disagree').toEqual(
      versionsUpTo(SESSION_SCHEMA_VERSION).filter((version) => version > 1),
    );
  });

  for (const version of versionsUpTo(SESSION_SCHEMA_VERSION)) {
    it(`restores a version-${String(version)} envelope, and the current build takes the result back`, () => {
      const slots = memoryStore();
      slots.store.write(SESSION_KEY, JSON.stringify(envelopeAsWrittenBy(version)));

      const restored = loadSession(slots.store);
      expect(
        restored.ok ? '' : `${restored.failure.kind}: ${restored.failure.message}`,
        `a version-${String(version)} envelope must migrate, not be refused`,
      ).toBe('');
      if (!restored.ok) return;

      const snapshot = restored.snapshot;

      /* ---- the completion filled the value the absence determined ---- */

      if (version < 3) {
        expect(
          snapshot.freePlay.windowStartS,
          'a build with no window concept ran the whole period, so the completion is null',
        ).toBeNull();
      }
      if (version < 4) {
        expect(
          snapshot.parkedWeeks,
          'those builds had one week slot, so an empty list is the measured state',
        ).toEqual([]);
      }
      const days = [snapshot.week, ...snapshot.parkedWeeks].flatMap((week) => week.history);
      expect(days.length, 'the fixture week must have closed days, or the day assertions are empty')
        .toBeGreaterThan(0);
      if (version < 6) {
        for (const day of days) {
          expect(day.record, 'no seed was stored, so the day genuinely cannot be re-asked').toBeNull();
        }
      }
      if (version < 7) {
        for (const day of days) {
          expect(day.recordRefusal, 'those builds kept no reason, so none may be invented').toBeNull();
          if (day.record !== null) {
            expect(day.record.ruleRows, 'shape 1 refused every rules run, so the list is []').toEqual([]);
            expect(day.record.version, 'the completed record is a shape-2 record').toBe(2);
          }
        }
      }

      /* ---- the current build takes it back: re-save, re-read, keep playing ---- */

      const again = memoryStore();
      const reSaved = saveSession(
        again.store,
        { ...viewerState(), week: snapshot.week, parkedWeeks: snapshot.parkedWeeks },
        updateFreePlay(
          updateSettings(initialMenuState(catalogueOf(resources)), snapshot.settings),
          snapshot.freePlay,
        ),
      );
      expect(
        reSaved.ok ? '' : reSaved.failure.message,
        'a migrated state the current build cannot write back is a player whose next autosave fails',
      ).toBe('');

      const rewritten = JSON.parse(again.written.get(SESSION_KEY) ?? '{}') as Record_;
      expect(
        rewritten['schemaVersion'],
        'the rewrite must stamp the current version, or the migration has not happened',
      ).toBe(SESSION_SCHEMA_VERSION);

      const reRead = loadSession(again.store);
      expect(
        reRead.ok ? '' : `${reRead.failure.kind}: ${reRead.failure.message}`,
        'the migrated state must survive a second round trip',
      ).toBe('');

      // Still playable. `closeDay` on the restored week is the very next thing a returning player
      // does, and a week that parses but cannot be advanced is not a restored week.
      const advanced = nextDay(snapshot.week);
      const closed = closeDay(
        advanced,
        outcomeOf({
          record: null,
          recordRefusal: null,
          day: advanced.day,
          dayIdx: advanced.dayIdx,
          eventId: eventFor(advanced.day, advanced.dayIdx).id,
          arrived: 480,
          carried: 470,
          minutePct: 80,
          readings: readGoals(goalsForDay(advanced.day), PERFECT),
        }),
      );
      const third = memoryStore();
      const afterPlay = saveSession(
        third.store,
        { ...viewerState(), week: closed, parkedWeeks: snapshot.parkedWeeks },
        menuState(),
      );
      expect(
        afterPlay.ok ? '' : afterPlay.failure.message,
        'a day played on top of a migrated week must save',
      ).toBe('');
      expect(
        loadSession(third.store).ok,
        'and it must read back',
      ).toBe(true);
    });
  }

  it('still refuses an envelope newer than this build, and one older than anything it reads', () => {
    // `careerPersist.ts:94` documents the newer case for its own slot; this is the same property on
    // the slot with nine versions in it, checked rather than assumed.
    const older = Math.min(...SESSION_SCHEMA_VERSIONS_READ) - 1;
    for (const version of [SESSION_SCHEMA_VERSION + 1, older]) {
      const slots = memoryStore();
      const envelope = currentEnvelope();
      envelope['schemaVersion'] = version;
      slots.store.write(SESSION_KEY, JSON.stringify(envelope));

      const restored = loadSession(slots.store);
      expect(restored.ok, `version ${String(version)} must be refused`).toBe(false);
      if (restored.ok) return;
      expect(restored.failure.kind, `version ${String(version)} must be refused as a version`).toBe(
        'version',
      );
      if (restored.failure.kind !== 'version') return;
      expect(restored.failure.found).toBe(version);
      expect(restored.failure.supported).toBe(SESSION_SCHEMA_VERSION);
      expect(restored.failure.message).toContain(
        version > SESSION_SCHEMA_VERSION ? 'newer' : 'older',
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The profile slot — the same derivation, a second product surface
 * -------------------------------------------------------------------------- */

/** What each profile version could not carry, undone. Keyed and checked exactly as the session is. */
const PROFILE_STEP_DOWN: Readonly<Record<number, StepDown>> = Object.freeze({
  2: {
    removes: 'the sibling progress',
    undo: (envelope) => {
      delete envelope['progress'];
      return envelope;
    },
  },
  3: {
    removes: 'the units preference',
    undo: (envelope) => {
      delete envelope['units'];
      return envelope;
    },
  },
  4: {
    removes: 'the default speed',
    undo: (envelope) => {
      delete envelope['defaultSpeedSimPerRealS'];
      return envelope;
    },
  },
  5: {
    removes: 'the sound preference',
    undo: (envelope) => {
      delete envelope['soundOn'];
      return envelope;
    },
  },
});

/**
 * The profile slot's own key, **discovered from a save rather than transcribed**.
 *
 * `PROFILE_KEY` is module-private in `everyday/profile.ts` and stays that way: a test that named it
 * would be a second copy of the string, which is the class of constant this whole file exists to
 * avoid. `persist.test.ts#slotKey` does the same for the session slot and for the same reason.
 */
function profileSlotKey(slots: Slots): string {
  const keys = [...slots.written.keys()];
  expect(keys, 'saveEveryday must write exactly one slot').toHaveLength(1);
  return keys[0] ?? '';
}

/** A real profile save, so tampering starts from real bytes. */
function savedProfile(): Slots {
  const slots = memoryStore();
  const written = saveEveryday(
    slots.store,
    { ...DEFAULT_EVERYDAY_PROFILE, name: 'Ada' },
    EMPTY_EVERYDAY_PROGRESS,
    'imperial',
    2,
    false,
  );
  expect(written.ok, 'the profile fixture itself must save').toBe(true);
  return slots;
}

function profileEnvelopeAsWrittenBy(target: number): Record_ {
  const slots = savedProfile();
  let envelope = JSON.parse(slots.written.get(profileSlotKey(slots)) ?? '{}') as Record_;
  for (let version = PROFILE_SCHEMA_VERSION; version > target; version -= 1) {
    const step = PROFILE_STEP_DOWN[version];
    expect(step, `profile version ${String(version)} has no step-down`).toBeDefined();
    if (step === undefined) continue;
    const before = JSON.stringify(envelope);
    envelope = step.undo(envelope);
    expect(
      JSON.stringify(envelope),
      `undoing profile version ${String(version)} (${step.removes}) changed nothing`,
    ).not.toBe(before);
  }
  envelope['schemaVersion'] = target;
  return envelope;
}

describe('the profile slot — every version this build has ever written', () => {
  it('derives its rows from the writer’s own constant, and the read set agrees in both directions', () => {
    const written = versionsUpTo(PROFILE_SCHEMA_VERSION);
    expect(
      written.filter((version) => !PROFILE_SCHEMA_VERSIONS_READ.includes(version)),
      'a profile version this build once wrote is no longer readable',
    ).toEqual([]);
    expect(
      PROFILE_SCHEMA_VERSIONS_READ.filter((version) => !written.includes(version)),
      'PROFILE_SCHEMA_VERSIONS_READ names a version outside 1…PROFILE_SCHEMA_VERSION',
    ).toEqual([]);
    expect(
      Object.keys(PROFILE_STEP_DOWN)
        .map(Number)
        .sort((a, b) => a - b),
      'the profile step-down table and PROFILE_SCHEMA_VERSION disagree',
    ).toEqual(written.filter((version) => version > 1));
  });

  for (const version of versionsUpTo(PROFILE_SCHEMA_VERSION)) {
    it(`restores a version-${String(version)} profile, and rewrites it at the current version`, () => {
      const slots = memoryStore();
      const key = profileSlotKey(savedProfile());
      slots.store.write(key, JSON.stringify(profileEnvelopeAsWrittenBy(version)));

      const profile = loadProfile(slots.store);
      expect(profile, `a version-${String(version)} profile must be read, not refused`).toBeDefined();
      expect(profile?.name, 'the identity is what this slot is for and must survive').toBe('Ada');

      // The four siblings, each read through its own accessor, because each has its own default and
      // a version that predates it must land on that default rather than on `undefined`.
      expect(loadProgress(slots.store).progress).toBeDefined();
      expect(typeof loadUnits(slots.store)).toBe('string');
      expect(Number.isFinite(loadDefaultSpeed(slots.store))).toBe(true);
      expect(typeof loadSound(slots.store)).toBe('boolean');

      // The current build takes it back: re-save what was read, and require the current stamp.
      const again = memoryStore();
      const reSaved = saveEveryday(
        again.store,
        profile ?? DEFAULT_EVERYDAY_PROFILE,
        loadProgress(slots.store).progress,
        loadUnits(slots.store),
        loadDefaultSpeed(slots.store),
        loadSound(slots.store),
      );
      expect(reSaved.ok, 'a migrated profile the current build cannot write back is a lost name').toBe(
        true,
      );
      const rewritten = JSON.parse(again.written.get(key) ?? '{}') as Record_;
      expect(rewritten['schemaVersion']).toBe(PROFILE_SCHEMA_VERSION);
      expect(loadProfile(again.store)?.name).toBe('Ada');
    });
  }

  it('still refuses a profile envelope newer than this build', () => {
    const slots = memoryStore();
    const envelope = profileEnvelopeAsWrittenBy(PROFILE_SCHEMA_VERSION);
    envelope['schemaVersion'] = PROFILE_SCHEMA_VERSION + 1;
    slots.store.write(profileSlotKey(savedProfile()), JSON.stringify(envelope));
    expect(
      loadProfile(slots.store),
      'a newer envelope carries fields this build cannot vouch for',
    ).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The career slot — one version today, and the derivation says so rather than a literal
 * -------------------------------------------------------------------------- */

/** A shipped dispatcher id, off `data/` rather than a literal — the career opens against one. */
const CAREER_DISPATCHER =
  resources.dispatcherProfiles.profiles[0]?.id ?? 'collective';

describe('the career slot — every version this build has ever written', () => {
  it('derives its rows from the writer’s own constant, and the read set agrees in both directions', () => {
    const written = versionsUpTo(CAREER_SCHEMA_VERSION);
    expect(
      written.filter((version) => !CAREER_SCHEMA_VERSIONS_READ.includes(version)),
      'a career version this build once wrote is no longer readable',
    ).toEqual([]);
    expect(
      CAREER_SCHEMA_VERSIONS_READ.filter((version) => !written.includes(version)),
      'CAREER_SCHEMA_VERSIONS_READ names a version outside 1…CAREER_SCHEMA_VERSION',
    ).toEqual([]);
  });

  for (const version of versionsUpTo(CAREER_SCHEMA_VERSION)) {
    it(`restores a version-${String(version)} career, and re-encodes it at the current version`, () => {
      const envelope = JSON.parse(encodeCareer(openingCareer(CAREER_DISPATCHER))) as Record_;
      envelope['version'] = version;
      const loaded = decodeCareer(JSON.stringify(envelope));
      expect(
        loaded.refusal ?? '',
        `a version-${String(version)} career must be read, not refused`,
      ).toBe('');
      expect(loaded.career, 'and it must actually produce a career').toBeDefined();
      if (loaded.career === undefined) return;
      const again = JSON.parse(encodeCareer(loaded.career)) as Record_;
      expect(again['version'], 'the re-encode must stamp the current version').toBe(
        CAREER_SCHEMA_VERSION,
      );
    });
  }

  it('still refuses a career envelope newer than this build, without clearing anything', () => {
    // `careerPersist.ts:94` states this; it is checked here rather than trusted.
    const envelope = JSON.parse(encodeCareer(openingCareer(CAREER_DISPATCHER))) as Record_;
    envelope['version'] = CAREER_SCHEMA_VERSION + 1;
    const loaded = decodeCareer(JSON.stringify(envelope));
    expect(loaded.refusal, 'a newer career envelope is refused by version').toBe('version');
    expect(loaded.career, 'and no career is invented in its place').toBeUndefined();
    expect(loaded.notice ?? '', 'the player is owed the reason').not.toBe('');
  });

  it('refuses a corrupted envelope rather than accepting a partial career', () => {
    for (const [name, bytes] of [
      ['truncated JSON', '{"version":1,"career":{'],
      ['not an object', '[1,2,3]'],
      ['no version at all', '{"career":{}}'],
    ] as const) {
      const loaded = decodeCareer(bytes);
      expect(loaded.career, `${name} must produce no career`).toBeUndefined();
      expect(loaded.refusal, `${name} must carry a refusal`).toBeDefined();
    }
  });
});
