/**
 * *Is this parsed JSON actually a session?* — asked field by field, against tables the compiler
 * keeps total.
 *
 * ## Why a version number is not enough on its own
 *
 * {@link SESSION_SCHEMA_VERSION} answers *"was this written by a build with my envelope shape?"*
 * and nothing else. It cannot answer *"is this JSON the shape it claims"*, because the bytes in a
 * browser's storage are not under this program's control: a half-written value from a tab that was
 * closed mid-write, a payload edited by hand in devtools, or a key that another script on the
 * origin happened to use all arrive with the right version number and the wrong contents. So the
 * shape is checked, and the check is a refusal rather than a repair — `restoreDefaults`-style
 * patching would hand back a week that is part save and part default, which is precisely the
 * partially-applied state `SessionRestore` has no arm for.
 *
 * ## The key sets are the compiler's, not a list
 *
 * Every table below is declared `Readonly<Record<keyof T, FieldCheck>>`. That annotation is the
 * derivation: adding a field to `WeekState` and not to `WEEK_CHECKS` is a **compile error**, and so
 * is naming a field the type no longer has. It is `scope/surface.ts`'s both-directions rule bought
 * at compile time instead of at test time, and it is available here for a reason that does not hold
 * there — the types in question are `interface`s with fixed key sets, so `keyof` is total, whereas
 * a writable *surface* spans four unrelated states and has to be derived from values.
 *
 * `persist.test.ts` then asserts the same thing a second way, against real values from `openWeek()`,
 * `DEFAULT_SETTINGS` and `initialMenuState()`, because a `Record<keyof T, …>` proves the table
 * matches the **type** and this module's job is to match the **value** — and `JSON.stringify` drops
 * a key whose value is `undefined`, which is how the two come apart.
 *
 * ## Both directions at run time too, and the second one is the surprising half
 *
 * A parsed object is refused for a **missing** key and equally for an **unknown extra** one. The
 * second looks paranoid and is not: an extra key means the bytes were written by something that
 * knew a field this build does not, which the version number was supposed to have caught — so
 * either the version was not bumped when a field landed, or these bytes are not ours. Accepting
 * them silently discards whatever that field meant, and a session is exactly the thing where
 * silently discarding half of it is worse than starting fresh.
 *
 * ## What is deliberately *not* refused here
 *
 * A `FreePlaySelection` naming a building, dispatcher or template that is not loaded. That is a
 * real problem and `menu/menu.ts#freePlayIssues` already reports it **in words a player can act
 * on** — *"No building 'x' is loaded. It may have been renamed or removed."* Refusing the whole
 * session for it would replace an explainable message with a silent reset, and would throw away the
 * player's week because a demand template was renamed. So the selection is checked for *shape* and
 * left to the menu for *existence*.
 *
 * The week's contract id is the one exception, and {@link unknownContractsIn} is where it is
 * argued.
 *
 * ## Its non-test caller
 *
 * `./session.ts`.
 */

import { PLAYBACK_SPEEDS, type FreePlaySelection, type Settings } from '../menu/types.js';
import { contractById } from '../shift/contracts.js';
import {
  GOAL_OBSERVATION_IDS,
  SHIFT_EVENT_IDS,
  WEEKDAYS,
  type ClearedAward,
  type DayOutcome,
  type GoalComparison,
  type GoalReading,
  type GoalState,
  type ShiftGoal,
  type WeekState,
} from '../shift/types.js';
import { HISTORY_DAYS } from '../shift/week.js';

import type { SessionSnapshot } from './types.js';

/* -------------------------------------------------------------------------- *
 * The vocabulary
 * -------------------------------------------------------------------------- */

/** Where the shape went wrong, and what was wrong with it. */
export interface ShapeIssue {
  /** A path into the payload — `week.history[0].readings[2].goal.bar`. */
  readonly field: string;
  /** The clause after the path: *"is not a whole number"*. The caller builds the sentence. */
  readonly message: string;
}

/** A value, its path, and a verdict. `undefined` means *this one is fine*. */
type FieldCheck = (value: unknown, path: string) => ShapeIssue | undefined;

const at = (field: string, message: string): ShapeIssue => ({ field, message });

/** What to call a value in a message, without printing a stranger's data back at them. */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/** A value `JSON.parse` could have produced as an object — not an array, not `null`. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/* -------------------------------------------------------------------------- *
 * Combinators
 * -------------------------------------------------------------------------- */

const isBoolean: FieldCheck = (value, path) =>
  typeof value === 'boolean' ? undefined : at(path, `is ${typeName(value)}, not a boolean`);

const isString: FieldCheck = (value, path) =>
  typeof value === 'string' ? undefined : at(path, `is ${typeName(value)}, not a string`);

const isNonEmptyString: FieldCheck = (value, path) =>
  typeof value === 'string' && value.length > 0
    ? undefined
    : at(path, `is ${typeName(value)}, not a non-empty string`);

const isFiniteNumber: FieldCheck = (value, path) =>
  typeof value === 'number' && Number.isFinite(value)
    ? undefined
    : at(path, `is ${typeName(value)}, not a finite number`);

function isNumberWithin(low: number, high: number): FieldCheck {
  return (value, path) => {
    const issue = isFiniteNumber(value, path);
    if (issue !== undefined) return issue;
    const found = value as number;
    return found >= low && found <= high
      ? undefined
      : at(path, `is ${String(found)}, outside ${String(low)}–${String(high)}`);
  };
}

function isIntegerAtLeast(low: number): FieldCheck {
  return (value, path) =>
    typeof value === 'number' && Number.isInteger(value) && value >= low
      ? undefined
      : at(path, `is ${typeName(value)}, not a whole number of at least ${String(low)}`);
}

function isIntegerWithin(low: number, high: number): FieldCheck {
  return (value, path) =>
    typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high
      ? undefined
      : at(
          path,
          `is ${typeName(value)}, not a whole number in ${String(low)}–${String(high)}`,
        );
}

/** `null`, or whatever `check` accepts. The two are genuinely different states everywhere here. */
function nullOr(check: FieldCheck): FieldCheck {
  return (value, path) => (value === null ? undefined : check(value, path));
}

/**
 * One of a set the **compiler** proved total.
 *
 * The table is declared `Readonly<Record<SomeUnion, true>>`, so a literal missing a member of the
 * union will not compile and a literal naming a non-member will not either. That is the only way to
 * get a run-time list out of a TypeScript string union, which is erased — and it is why the themes,
 * goal states and comparisons below are objects rather than arrays somebody has to remember to
 * widen.
 */
function isKeyOf(table: Readonly<Record<string, true>>): FieldCheck {
  const allowed = Object.keys(table).sort();
  return (value, path) =>
    typeof value === 'string' && value in table
      ? undefined
      : at(path, `is ${typeName(value)}, not one of ${allowed.join(', ')}`);
}

/** One of a set some shipped module already declares — `WEEKDAYS`, `SHIFT_EVENT_IDS`. */
function isOneOf(allowed: readonly unknown[], what: string): FieldCheck {
  return (value, path) =>
    allowed.includes(value) ? undefined : at(path, `is not one of the ${what} this build offers`);
}

/**
 * An object with exactly the keys `checks` names, each passing its own check.
 *
 * Both directions, and the extra-key arm is argued in the module docstring.
 */
function isObjectOf(checks: Readonly<Record<string, FieldCheck>>, what: string): FieldCheck {
  const expected = Object.keys(checks).sort();
  return (value, path) => {
    if (!isPlainObject(value)) return at(path, `is ${typeName(value)}, not ${what}`);
    const missing = expected.filter((key) => !(key in value));
    if (missing.length > 0) return at(path, `is missing ${missing.join(', ')}`);
    const extra = Object.keys(value).filter((key) => !expected.includes(key));
    if (extra.length > 0) {
      return at(
        path,
        `carries ${extra.join(', ')}, which this build does not know — the envelope version ` +
          'should have changed when that field landed',
      );
    }
    for (const key of expected) {
      const check = checks[key];
      const issue = check?.(value[key], `${path}.${key}`);
      if (issue !== undefined) return issue;
    }
    return undefined;
  };
}

/** An array of things, with a declared ceiling on how many. */
function isArrayOf(check: FieldCheck, max: number, what: string): FieldCheck {
  return (value, path) => {
    if (!Array.isArray(value)) return at(path, `is ${typeName(value)}, not an array of ${what}`);
    if (value.length > max) {
      return at(path, `holds ${String(value.length)} ${what}, and this build keeps at most ${String(max)}`);
    }
    for (const [index, entry] of value.entries()) {
      const issue = check(entry, `${path}[${String(index)}]`);
      if (issue !== undefined) return issue;
    }
    return undefined;
  };
}

/* -------------------------------------------------------------------------- *
 * The unions, made total by the compiler
 * -------------------------------------------------------------------------- */

const GOAL_STATES: Readonly<Record<GoalState, true>> = Object.freeze({
  met: true,
  missed: true,
  pending: true,
});

const GOAL_COMPARISONS: Readonly<Record<GoalComparison, true>> = Object.freeze({
  'at-least': true,
  'at-most': true,
});

const GOAL_UNITS: Readonly<Record<ShiftGoal['unit'], true>> = Object.freeze({ '%': true, '': true });

const THEMES: Readonly<Record<Settings['theme'], true>> = Object.freeze({
  system: true,
  dark: true,
  light: true,
});

/* -------------------------------------------------------------------------- *
 * The week
 * -------------------------------------------------------------------------- */

const GOAL_CHECKS: Readonly<Record<keyof ShiftGoal, FieldCheck>> = Object.freeze({
  id: isNonEmptyString,
  label: isString,
  unit: isKeyOf(GOAL_UNITS),
  bar: isFiniteNumber,
  compare: isKeyOf(GOAL_COMPARISONS),
  // The one field whose legal values another module already publishes as data. `GoalObservations`
  // is the type that makes a suppressible figure ungradeable, and `reads` is the key into it —
  // a restored goal reading a name that type does not have would be graded against `undefined`.
  reads: isOneOf(GOAL_OBSERVATION_IDS, 'goal observations'),
});

const READING_CHECKS: Readonly<Record<keyof GoalReading, FieldCheck>> = Object.freeze({
  goal: isObjectOf(GOAL_CHECKS, 'a goal'),
  state: isKeyOf(GOAL_STATES),
  // `null` while pending, and never a stand-in zero — `shift/types.ts` is explicit about that, so
  // the check keeps the two apart rather than accepting a number and losing the distinction.
  observed: nullOr(isFiniteNumber),
  display: isString,
  progressPct: isNumberWithin(0, 100),
  glyph: isString,
});

const OUTCOME_CHECKS: Readonly<Record<keyof DayOutcome, FieldCheck>> = Object.freeze({
  day: isIntegerAtLeast(1),
  dayIdx: isIntegerWithin(0, WEEKDAYS.length - 1),
  weekday: isOneOf(WEEKDAYS, 'weekdays'),
  eventId: isOneOf(SHIFT_EVENT_IDS, 'shift events'),
  arrived: isIntegerAtLeast(0),
  carried: isIntegerAtLeast(0),
  minutePct: isNumberWithin(0, 100),
  readings: isArrayOf(isObjectOf(READING_CHECKS, 'a goal reading'), 32, 'goal readings'),
  allMet: isBoolean,
});

const AWARD_CHECKS: Readonly<Record<keyof ClearedAward, FieldCheck>> = Object.freeze({
  contractId: isNonEmptyString,
  reward: isString,
  // `null` at the end of the declared list, which is a state and not a missing value.
  nextContractId: nullOr(isNonEmptyString),
  nextTitle: isString,
});

const BANKED_CHECKS: Readonly<Record<keyof NonNullable<WeekState['banked']>, FieldCheck>> =
  Object.freeze({
    streak: isIntegerAtLeast(0),
    cleanRun: isIntegerAtLeast(0),
    completed: isArrayOf(isNonEmptyString, 64, 'contract ids'),
  });

const WEEK_CHECKS: Readonly<Record<keyof WeekState, FieldCheck>> = Object.freeze({
  contractId: isNonEmptyString,
  day: isIntegerAtLeast(1),
  dayIdx: isIntegerWithin(0, WEEKDAYS.length - 1),
  streak: isIntegerAtLeast(0),
  bestMinutePct: isNumberWithin(0, 100),
  cleanRun: isIntegerAtLeast(0),
  attempt: isIntegerAtLeast(0),
  // `null` before any day has been closed — `closedDay` and `banked` are a pair, and `nextDay`
  // clears both, so a save taken between two days legitimately carries two nulls.
  closedDay: nullOr(isIntegerAtLeast(1)),
  banked: nullOr(isObjectOf(BANKED_CHECKS, 'a banked snapshot')),
  completed: isArrayOf(isNonEmptyString, 64, 'contract ids'),
  // `HISTORY_DAYS` rather than a literal seven: `week.ts` owns how long the sparkline is, and a
  // ceiling written here would be the second answer to that question.
  history: isArrayOf(isObjectOf(OUTCOME_CHECKS, 'a day outcome'), HISTORY_DAYS, 'closed days'),
  cleared: nullOr(isObjectOf(AWARD_CHECKS, 'a cleared award')),
});

/* -------------------------------------------------------------------------- *
 * Settings and the Free Play selection
 * -------------------------------------------------------------------------- */

const SETTINGS_CHECKS: Readonly<Record<keyof Settings, FieldCheck>> = Object.freeze({
  reduceMotion: isBoolean,
  showEnergyAxis: isBoolean,
  /*
   * Membership of the shipped ladder, not merely a positive number.
   *
   * `PLAYBACK_SPEEDS` exists so *"the panel and the validator agree"* — its own words — and the
   * panel draws a fixed set of options. A restored 3× would leave that control with nothing
   * selected and no way for a player to get back to it, which is the inert-control shape § D177
   * exists to catch, arriving through storage instead of through wiring.
   */
  playbackSpeed: isOneOf(PLAYBACK_SPEEDS, 'playback speeds'),
  theme: isKeyOf(THEMES),
});

/**
 * The seed, as the thing that has to survive contact with `BigInt`.
 *
 * `FreePlaySelection.seed` is *"decimal digits. A string because a seed is an identity, not a
 * quantity to do arithmetic on"*, and `menu/enterFreePlay.ts` turns it back with a bare
 * `BigInt(selection.seed)`.
 *
 * ## `BigInt` does not throw on the two inputs that matter, and that is why this check exists
 *
 * A first draft of this docstring said `BigInt` *"throws a `SyntaxError` on anything that is not a
 * decimal literal"*, and the test written from it asserted so. It is false, and its own positive
 * control caught it:
 *
 * | input | `BigInt(input)` |
 * |---|---|
 * | `''` | **`0n`** — no throw |
 * | `'-1'` | **`-1n`** — no throw |
 * | `'1e3'`, `'1.0'`, `'forty-two'` | `SyntaxError` |
 *
 * So the dangerous corruptions are precisely the ones that do **not** announce themselves. An empty
 * seed in storage silently becomes **seed 0** and the run proceeds — which is `UX.md` `TP-08`
 * exactly, the seed field that quietly yielded seed 0 and was filed as *"a provenance control that
 * quietly changes the run"*. A negative one becomes a negative `bigint` and reaches the kernel.
 *
 * A check that only caught the throwing cases would therefore catch the harmless ones and miss both
 * hazards. This one is a positive pattern rather than a `try`/`catch`, for that reason.
 *
 * The digit ceiling is a bound on work, not on seeds: `BigInt` accepts an arbitrarily long literal
 * and will happily spend a second on a megabyte of digits that arrived from a slot anybody with
 * devtools can write to. Forty digits is far past any seed this product mints.
 */
const isSeedString: FieldCheck = (value, path) =>
  typeof value === 'string' && /^\d{1,40}$/u.test(value)
    ? undefined
    : at(path, 'is not a run of decimal digits, so it would not survive the trip back to a bigint');

const FREE_PLAY_CHECKS: Readonly<Record<keyof FreePlaySelection, FieldCheck>> = Object.freeze({
  /*
   * A string, and the empty one is legal. `initialMenuState` writes `catalogue.buildings[0]?.id ??
   * ''` — an empty id is what a broken install looks like, and `freePlayIssues` says so in words
   * (*"No building is selected, and none is loaded to select"*). Refusing it here would swallow
   * that message and blame the save instead.
   */
  buildingId: isString,
  dispatcherProfileId: isString,
  demandTemplateId: isString,
  // `null` is *"whatever this building's own traffic profile says"* — a selection in its own right,
  // which is why it may not be normalised to a number on the way through.
  arrivalRatePctPop5min: nullOr(isFiniteNumber),
  /*
   * A positive finite number, and deliberately **not** membership of `FREE_PLAY_DURATIONS_S`.
   * `freePlayIssues` already refuses an unoffered length in a sentence a player can act on, and
   * `constant-iso`'s cross-field rule lives there too. Duplicating the ladder here would refuse the
   * whole session — week and settings included — for a field the menu is about to explain.
   */
  durationS: isNumberWithin(1, 86_400),
  seed: isSeedString,
});

/* -------------------------------------------------------------------------- *
 * The whole of it
 * -------------------------------------------------------------------------- */

const SESSION_CHECKS: Readonly<Record<keyof SessionSnapshot, FieldCheck>> = Object.freeze({
  week: isObjectOf(WEEK_CHECKS, 'a week'),
  settings: isObjectOf(SETTINGS_CHECKS, 'a settings block'),
  freePlay: isObjectOf(FREE_PLAY_CHECKS, 'a free-play selection'),
});

const checkSession = isObjectOf(SESSION_CHECKS, 'a session');

/**
 * The first thing wrong with a parsed session, or `undefined`.
 *
 * First-wrong rather than all-wrong, unlike `freePlayIssues` and for the opposite reason: a player
 * fixes selection problems one at a time and needs to know how many there are, but nobody fixes a
 * corrupt payload — the outcome is a fresh session either way, and the path is for whoever has to
 * work out why.
 */
export function snapshotIssue(value: unknown): ShapeIssue | undefined {
  return checkSession(value, 'the session');
}

/**
 * Contract ids this week names that `shift/contracts.ts` no longer ships.
 *
 * ## Why this is refused when a missing *building* is not
 *
 * A `FreePlaySelection` naming a vanished building is reported to the player in words by
 * `freePlayIssues`, so the honest move is to restore it and let the menu speak. A `WeekState`
 * naming a vanished contract has no such voice: `contractById` returns `undefined`, `leftRail.ts`
 * and `reportPanel.ts` quietly draw the progress figure without it, and the player is left looking
 * at a streak, a banked count and a seven-day history that are progress **toward an assignment the
 * build cannot name**. That is not a message, it is an absence — and the banked count is the number
 * the whole week is played for.
 *
 * ## The tension with `closeDay`, stated rather than smoothed
 *
 * `week.ts#closeDay` is explicitly total on this case: *"a `contractId` that names no contract
 * (restored state from an older build, a scenario since renamed) banks the day and clears nothing,
 * rather than losing the day to an exception."* That is the right rule **there** and it is not
 * weakened here. Its subject is a day already in progress, where the alternative to tolerance is
 * throwing away a run the player just watched. This module's subject is the instant before anything
 * is in progress, where the alternative is a fresh week — the cheapest moment in the whole product
 * to be strict, and the only one where being strict costs a player nothing they have seen.
 *
 * ## The cost, named
 *
 * Because a restore is all-or-nothing, a renamed scenario also costs the player their settings. The
 * alternative — restoring each section independently — was rejected: three sections restored
 * separately is three states that can disagree about what game is being played, and it hands the
 * caller eight combinations to write words for. A renamed scenario is a deploy-time event; a
 * partially restored session would be a permanent class of bug.
 */
export function unknownContractsIn(week: WeekState): readonly string[] {
  /*
   * Every place a week holds a contract id. Four sites, and they are named rather than derived
   * because nothing in the value distinguishes a contract id from any other string — `completed`
   * and `banked.completed` are arrays of them, `cleared` holds two, and a fifth site appearing
   * without an entry here is what `persist.test.ts`'s per-site refusals are for.
   */
  const award = week.cleared;
  const named = [
    week.contractId,
    ...week.completed,
    ...(week.banked?.completed ?? []),
    ...(award === null ? [] : [award.contractId]),
    ...(award === null || award.nextContractId === null ? [] : [award.nextContractId]),
  ];
  return Object.freeze(
    [...new Set(named.filter((id) => contractById(id) === undefined))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
}
