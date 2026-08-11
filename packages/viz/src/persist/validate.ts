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
 * ## The library is checked by the same machinery and refused by a different rule
 *
 * {@link restoreLibrary} is in this file because *"is this parsed JSON the shape this build
 * reads?"* is one question and this is where it is answered. It is not a second validator: the
 * entry tables below are the same `Readonly<Record<keyof T, FieldCheck>>` device the week uses, and
 * **legality is not decided here at all** — a building goes to `editor/editorValidate.ts`, a
 * dispatcher and a machine class go back into their own `data/` file and through `core`'s parser.
 * `editorValidate.ts` argues the reason in the other direction: *"a second opinion about legality
 * is how an editor comes to accept a document the loader will reject"*. Restoring is the same seam
 * from the other side — a library check stricter than the loader would drop a building that runs
 * perfectly, and a looser one would restore a building that cannot.
 *
 * What differs is the **verdict**, not the machinery. A bad field anywhere in the week refuses the
 * whole session; a bad entry in the library drops that entry and nothing else. `types.ts`'s
 * {@link SavedLibrary} is where that distinction is argued, and it is the reason this can be done
 * at all.
 *
 * ## Its non-test caller
 *
 * `./session.ts`.
 */

import {
  ConfigError,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';

import { specsWithClass, type MachineClass } from '../authoring/machineSpec.js';
import { PATTERN_ROWS, PEAK_ORDERS, type PatternSpec } from '../authoring/patternSpec.js';
import type { SavedBuilding, SavedDispatcher, SavedPattern } from '../dev/state.js';
import { validateBuilding } from '../editor/editorValidate.js';
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
import {
  ENDLESS_CONTRACT_ID,
  FREE_PLAY_CONTRACT_ID,
  HISTORY_DAYS,
  PARKED_WEEKS_MAX,
  SANDBOX_CONTRACT_ID,
} from '../shift/week.js';

import {
  EMPTY_LIBRARY,
  type DroppedEntry,
  type LibraryContext,
  type LibraryRestore,
  type LibraryShelf,
  type SavedLibrary,
  type SessionSnapshot,
} from './types.js';

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

/**
 * An array, with nothing said about what is in it.
 *
 * The library's shelves, and only those: a shelf's *contents* are checked one at a time by
 * {@link restoreLibrary} because a bad entry drops an entry, while a shelf that is not an array at
 * all is a frame this build did not write. See {@link libraryFrameIssue}.
 */
function isArray(what: string): FieldCheck {
  return (value, path) =>
    Array.isArray(value) ? undefined : at(path, `is ${typeName(value)}, not a list of ${what}`);
}

/**
 * A plain object, and deliberately nothing more — the document inside a library entry.
 *
 * `core`'s own schema is what decides whether a `BuildingConfig` or a `DispatcherProfile` is
 * legal. This says only *there is something here shaped like a document to hand it*, which is what
 * stops `parseBuilding` being handed a number and reporting it in the loader's vocabulary.
 */
function isDocument(what: string): FieldCheck {
  return (value, path) =>
    isPlainObject(value) ? undefined : at(path, `is ${typeName(value)}, not ${what}`);
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

// ` s` joined with the worst-wait goal (slice 5): a restored reading may carry `187 s`. The other
// two are unchanged, and a version-4 build meeting ` s` refuses by version rather than by shape —
// see `SESSION_SCHEMA_VERSION`'s version-5 paragraph.
const GOAL_UNITS: Readonly<Record<ShiftGoal['unit'], true>> = Object.freeze({
  '%': true,
  ' s': true,
  '': true,
});

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
   * A positive finite number, and deliberately **not** membership of what the menu offers.
   * `freePlayIssues` already refuses an unoffered part in a sentence a player can act on. Checking
   * the offered list here would refuse the whole session — week and settings included — for a field
   * the menu is about to explain, and it would do it whenever `data/` changed a period's length.
   */
  durationS: isNumberWithin(1, 86_400),
  /*
   * Where in the day the run starts, or `null` for the whole period — § D286.
   *
   * `null` is a selection rather than a missing value, exactly as `arrivalRatePctPop5min`'s is, so
   * it is admitted here rather than normalised to `0`: a `0` would be *"a window that starts at the
   * beginning"*, which is a different stored fact from *"no window"* and would reach `core` as one.
   *
   * Bounded by a day rather than by any template's period, for `durationS`'s reason one line up: a
   * saved session that named a part `data/` has since moved is a menu refusal, not a corrupt file.
   */
  windowStartS: nullOr(isNumberWithin(0, 86_400)),
  seed: isSeedString,
});

/* -------------------------------------------------------------------------- *
 * The whole of it
 * -------------------------------------------------------------------------- */

const SESSION_CHECKS: Readonly<Record<keyof SessionSnapshot, FieldCheck>> = Object.freeze({
  week: isObjectOf(WEEK_CHECKS, 'a week'),
  /*
   * The same table as the live week, and the same verdict — a bad field in a parked week refuses the
   * whole session rather than dropping that week.
   *
   * That is the opposite of what the library does one key over, and the difference is the one
   * `types.ts` argues: the library's entries are independent documents, and a parked week is a view
   * of the same campaign as the week beside it. Dropping one silently would hand back a campaign
   * with a scenario's progress missing and nothing on screen to say so, which is exactly what issue
   * #107 was.
   *
   * `PARKED_WEEKS_MAX` rather than a literal, for `HISTORY_DAYS`' reason two tables up: `week.ts`
   * owns how many weeks are kept and a ceiling written here would be the second answer to that
   * question.
   */
  parkedWeeks: isArrayOf(isObjectOf(WEEK_CHECKS, 'a week'), PARKED_WEEKS_MAX, 'parked weeks'),
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
 *
 * ## The ids that resolve to nothing **on purpose**, and the session this was refusing
 *
 * There were two when this was written and there are three since GitHub issue #125 — see
 * {@link namesSomething}, which is where the set is kept and where the third is argued for.
 *
 * Found while building issue #107's parked weeks, and it is a defect of its own rather than a
 * consequence of that work: this test was `contractById(id) === undefined`, and `week.ts` ships two
 * ids that answer to no contract *by design* — `endless`, which a player reaches by pressing **Keep
 * going**, and `sandbox`, which they reach by drawing a building. Both were reported as assignments
 * *"this build no longer has"*, so **every endless and every sandbox week was refused on reload**,
 * the slot was then cleared by `dev/main.ts#restoreSession`, and the player was told their week was
 * banked toward something that had gone. It had not gone; it never existed, which is the whole point
 * of a sentinel.
 *
 * The exemption is not a relaxation of the rule the section above states. That rule is about a
 * player *"left looking at a streak, a banked count and a seven-day history that are progress toward
 * an assignment the build cannot name"* — and these two weeks make no such claim: `contractStatus`
 * returns `open` for every scenario, `closeDay` banks nothing, and `coachWeekLines` prints
 * **Endless** and **Sandbox** precisely so the state is named on screen. What is refused is an id
 * that was *meant* to name a contract and no longer does, which is still every other case.
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
    [...new Set(named.filter((id) => !namesSomething(id)))].sort((a, b) => a.localeCompare(b)),
  );
}

/**
 * Whether an id names a state this build has — a contract, or one of the three deliberate sentinels.
 *
 * Named rather than derived, and the set is closed: `week.ts` exports exactly three ids that resolve
 * to no contract on purpose, and a fourth would have to be added here to be readable — which is the
 * right amount of friction for a value that decides whether a player keeps their week.
 *
 * **The third arrived, and the friction did its job** — GitHub issue #125 gave Free Play a week of
 * its own, {@link FREE_PLAY_CONTRACT_ID}. It reaches a saved session in one situation and it is not
 * a rare one: `dev/state.ts#weeksForSession` holds the stored pair back for every mode that does not
 * advance a week, but on a **first visit** there is no stored pair to hold back, so the free-play
 * week is what gets written. Without this line that session would come back reported as an
 * assignment *"this build no longer has"* and be cleared — which is the exact defect the section
 * above records for `endless` and `sandbox`, arriving a third time.
 */
function namesSomething(id: string): boolean {
  return (
    contractById(id) !== undefined ||
    id === ENDLESS_CONTRACT_ID ||
    id === SANDBOX_CONTRACT_ID ||
    id === FREE_PLAY_CONTRACT_ID
  );
}

/* -------------------------------------------------------------------------- *
 * The library — entry by entry
 * -------------------------------------------------------------------------- */

/**
 * The library's *frame*: four keys, each an array. Nothing about what is in them.
 *
 * The frame is envelope structure and is therefore all-or-nothing, while the entries inside it are
 * documents and are not. The line is drawn there deliberately, and the counter-argument is worth
 * stating because it is not weak: refusing a session whose `library.buildings` is the number `7`
 * costs the player their week for something that is not the week's fault, which is the outcome this
 * whole lane exists to prevent.
 *
 * It is drawn there anyway. A shelf that is not an array is not a damaged document — it is bytes
 * that cannot have been written by this program at all, and the schema version was supposed to be
 * what vouched for that. Once the frame is in doubt, so is the week sitting beside it in the same
 * object, and restoring one out of an envelope that is provably not ours is the guess this module
 * refuses everywhere else. An entry, by contrast, is a document whose *contents* this build no
 * longer understands, which is an ordinary consequence of shipping.
 */
const LIBRARY_SHELF_CHECKS: Readonly<Record<keyof SavedLibrary, FieldCheck>> = Object.freeze({
  buildings: isArray('saved buildings'),
  dispatchers: isArray('saved dispatchers'),
  patterns: isArray('saved patterns'),
  classes: isArray('saved machine classes'),
});

const checkLibraryFrame = isObjectOf(LIBRARY_SHELF_CHECKS, 'a saved library');

/**
 * The first thing wrong with the library's frame, or `undefined`.
 *
 * Deliberately not a ceiling on how many entries a shelf holds, which is where {@link isArrayOf}
 * would have put one: the bound on a library is a **byte** budget
 * (`types.ts#LIBRARY_BUDGET_CHARACTERS`), enforced on the save path where the thing being bounded —
 * the quota — actually lives. A count would be the second answer to that question and the one that
 * cannot see a single twenty-thousand-character building.
 */
export function libraryFrameIssue(value: unknown): ShapeIssue | undefined {
  return checkLibraryFrame(value, 'the library');
}

/* --- the entry shapes ------------------------------------------------------ */

/**
 * A `PatternSpec`'s numeric bounds, **taken from the editor's own row table**.
 *
 * `PATTERN_ROWS` is what the sliders are drawn from, so a widened slider widens this check with no
 * edit here — and a restored pattern can never be one the editor could not have produced. The three
 * fields with no row are the three that are not sliders: the name, the peak order (a chip row, and
 * `PEAK_ORDERS` is its published set) and the group-travel toggle, whose row exists but describes a
 * checkbox as `0..1`.
 *
 * The `Readonly<Record<keyof PatternSpec, FieldCheck>>` annotation is what keeps the derivation
 * honest in the other direction: a field added to `PatternSpec` with no row and no line here is a
 * compile error.
 */
/**
 * The range the editor's own slider allows for a field — or, if that slider is gone, any finite
 * number.
 *
 * The fallback is the honest answer rather than a convenience. A `PatternSpec` field with no row
 * has no control in this build and therefore nothing that declares a range for it; making one up
 * here would be exactly the second opinion this module refuses to have. `persist.test.ts` asserts
 * the fallback is not currently in use, so it cannot quietly become the check for a field whose row
 * somebody deleted.
 */
function rowBound(key: keyof PatternSpec & string): FieldCheck {
  const row = PATTERN_ROWS.find((entry) => entry.key === key);
  return row === undefined ? isFiniteNumber : isNumberWithin(row.min, row.max);
}

const PATTERN_SPEC_CHECKS: Readonly<Record<keyof PatternSpec, FieldCheck>> = Object.freeze({
  name: isString,
  order: isOneOf(PEAK_ORDERS, 'peak orders'),
  batchSharesDestination: isBoolean,
  ratePctPop5min: rowBound('ratePctPop5min'),
  peakWindowS: rowBound('peakWindowS'),
  baselineFraction: rowBound('baselineFraction'),
  interfloorShare: rowBound('interfloorShare'),
  batchMean: rowBound('batchMean'),
  mixAmplitude: rowBound('mixAmplitude'),
});

/**
 * A machine class, by **type** only — every range question is `parseElevatorSpecs`'.
 *
 * The split is the one this module keeps everywhere: the shape is checked here because a
 * `MachineClass` is `viz`'s own interface and no `data/` schema describes it, and the legality of
 * the numbers is checked by putting the class back into `elevator-specs.json` and re-parsing the
 * file. `yours` is the one field that survives neither trip — `specsWithClass` does not carry it —
 * so it is the one field this table is load-bearing for.
 */
const MACHINE_CLASS_CHECKS: Readonly<Record<keyof MachineClass, FieldCheck>> = Object.freeze({
  id: isNonEmptyString,
  name: isString,
  speedMinMps: isFiniteNumber,
  speedMaxMps: isFiniteNumber,
  speedTypicalMps: isFiniteNumber,
  maxRiseM: isFiniteNumber,
  maxFloors: isFiniteNumber,
  accelerationMps2: isFiniteNumber,
  jerkMps3: isFiniteNumber,
  loadMinLb: isFiniteNumber,
  loadMaxLb: isFiniteNumber,
  application: isString,
  yours: isBoolean,
});

/**
 * A saved building's wrapper. `config` is checked for *being an object* and no more.
 *
 * Writing a `BuildingConfig` field table here would be the second opinion about legality this
 * module refuses to have: `buildingConfigSchema` is four hundred lines of `core` and it is the one
 * the loader consults. So the wrapper is this module's and the document is `core`'s.
 */
const SAVED_BUILDING_CHECKS: Readonly<Record<keyof SavedBuilding, FieldCheck>> = Object.freeze({
  id: isNonEmptyString,
  config: isDocument('a building config'),
});

const SAVED_DISPATCHER_CHECKS: Readonly<Record<keyof SavedDispatcher, FieldCheck>> = Object.freeze({
  id: isNonEmptyString,
  profile: isDocument('a dispatcher profile'),
});

const SAVED_PATTERN_CHECKS: Readonly<Record<keyof SavedPattern, FieldCheck>> = Object.freeze({
  id: isNonEmptyString,
  spec: isObjectOf(PATTERN_SPEC_CHECKS, 'an arrival pattern'),
});

/* --- naming what was dropped ----------------------------------------------- */

/** The noun a player would use. Not the field name, and not the type name. */
const SHELF_NOUN: Readonly<Record<LibraryShelf, string>> = Object.freeze({
  building: 'building',
  dispatcher: 'dispatcher',
  pattern: 'arrival pattern',
  class: 'machine class',
});

/** `1st`, `2nd`, `3rd`, `4th` — for an entry too damaged to have a readable name. */
function ordinal(oneBased: number): string {
  const tens = oneBased % 100;
  if (tens >= 11 && tens <= 13) return `${String(oneBased)}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][oneBased % 10] ?? 'th';
  return `${String(oneBased)}${suffix}`;
}

/** A string field of an unknown value, when it is one and is not empty. */
function readName(value: unknown, ...path: readonly string[]): string | undefined {
  let at: unknown = value;
  for (const key of path) {
    if (typeof at !== 'object' || at === null) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return typeof at === 'string' && at.trim() !== '' ? at.trim() : undefined;
}

/**
 * What to call a dropped entry: the player's name for it, then its id, then where it sat.
 *
 * Three fallbacks because the input is by definition a value that failed validation, so the name is
 * exactly as likely to be missing as anything else — and *"one of the things you saved"* sends a
 * player looking through a library for something they cannot identify.
 */
function labelOf(shelf: LibraryShelf, index: number, value: unknown): string {
  const named =
    shelf === 'building'
      ? readName(value, 'config', 'name')
      : shelf === 'dispatcher'
        ? readName(value, 'profile', 'name')
        : shelf === 'pattern'
          ? readName(value, 'spec', 'name')
          : readName(value, 'name');
  return (
    named ??
    readName(value, 'id') ??
    `${ordinal(index + 1)} ${SHELF_NOUN[shelf]} you saved`
  );
}

/** A `ConfigError`'s first issue, or whatever else came out. Developer words; see `notice.ts`. */
function reasonOf(error: unknown): string {
  if (error instanceof ConfigError) {
    const first = error.issues[0];
    return first === undefined
      ? error.message
      : `${first.path} ${first.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/* --- the four checks, each deferring to something that already exists ------- */

/**
 * A machine class, through `core`'s own `elevator-specs.json` parser.
 *
 * `specsWithClass` is the function the *running* build already uses to widen the spec file with a
 * saved class, so re-parsing its output asks exactly the question that matters: *would this class
 * still resolve if the player ran a building against it?* Anything the loader tolerates is
 * tolerated here on purpose — a restore that were stricter than the run would drop a class that
 * works.
 */
function classIssue(entry: MachineClass, specs: ElevatorSpecs): string | undefined {
  try {
    parseElevatorSpecs(specsWithClass(specs, entry), `your machine class “${entry.id}”`);
    return undefined;
  } catch (error) {
    return reasonOf(error);
  }
}

/**
 * A dispatcher profile, through `core`'s own `dispatcher-profiles.json` parser.
 *
 * The profile is put back into the **shipped** file — its `terms`, its `normalization`, its
 * `patternSwitching` — with the profile list replaced by this one entry. That is what makes the
 * check worth having rather than a shape assertion: `dispatcherProfilesSchema`'s `superRefine`
 * cross-checks every weight against the declared cost-term library, so a profile the player tuned
 * against a term this build has since removed is caught here and nowhere else.
 */
function dispatcherIssue(entry: SavedDispatcher, context: LibraryContext): string | undefined {
  try {
    parseDispatcherProfiles(
      { ...context.dispatcherProfiles, profiles: [entry.profile] },
      `your dispatcher “${entry.id}”`,
    );
    return undefined;
  } catch (error) {
    return reasonOf(error);
  }
}

/**
 * A building, through the editor's own validator — schema, then cross-references.
 *
 * `validateBuilding` never throws and reports every issue of the furthest stage it reached, which
 * is more than is needed here (one sentence is enough to say why an entry went) and is used anyway
 * rather than reaching past it into `parseBuilding`: the editor is the thing that decides whether a
 * player's building is loadable, and two answers to that is one too many.
 *
 * `specs` is the file **as widened by the classes that were just accepted**, which is why the
 * classes are restored first. A building drawn against a machine class the player also saved would
 * otherwise be dropped for naming a spec that this build does have.
 */
function buildingIssue(
  entry: SavedBuilding,
  specs: ElevatorSpecs,
  trafficProfileIds: ReadonlySet<string>,
): string | undefined {
  const report = validateBuilding(entry.config, specs, {
    file: `your building “${entry.id}”`,
    trafficProfileIds,
  });
  if (report.valid) return undefined;
  const first = report.issues[0];
  return first === undefined
    ? 'is not a building this build can load'
    : `${first.path} ${first.message}`;
}

/* --- the restore itself ---------------------------------------------------- */

/** Walk one shelf, keeping what validates and naming what does not. */
function restoreShelf<T>(
  shelf: LibraryShelf,
  raw: unknown,
  shape: FieldCheck,
  legality: (entry: T) => string | undefined,
  dropped: DroppedEntry[],
): readonly T[] {
  // Narrowing, not a second check: {@link libraryFrameIssue} has already refused anything whose
  // shelves are not arrays, and it did so by refusing the whole envelope. This is what lets the
  // loop below read `raw` without a cast.
  if (!Array.isArray(raw)) return [];
  const kept: T[] = [];
  for (const [index, entry] of raw.entries()) {
    const drop = (reason: string): void => {
      dropped.push({ shelf, index, label: labelOf(shelf, index, entry), reason });
    };
    const issue = shape(entry, SHELF_NOUN[shelf]);
    if (issue !== undefined) {
      drop(`${issue.field} ${issue.message}`);
      continue;
    }
    const illegal = legality(entry as T);
    if (illegal !== undefined) {
      drop(illegal);
      continue;
    }
    kept.push(entry as T);
  }
  return kept;
}

/**
 * Restore the library entry by entry: what this build can still read, and what it could not.
 *
 * Total on `unknown` and never throws, like everything else on this path. A value whose *frame* is
 * wrong yields an empty library and **no drops** — not because that is nothing to report, but
 * because `session.ts` has already refused the whole envelope for it and reporting it twice would
 * put a *"some of your saved things were dropped"* sentence beside a *"your week could not be
 * read"* one, describing the same bytes.
 *
 * ## The order is load-bearing
 *
 * Classes first, then buildings against the specs those classes widened. A player who drew a
 * building around a machine class they invented has two entries that are only jointly meaningful,
 * and validating the building against the shipped specs alone would drop it for naming a spec that
 * is sitting three lines above it in the same library. It is the one place where the *"independent
 * documents"* premise is not quite true, and it is handled by ordering rather than by pretending.
 *
 * A class that is itself dropped takes any building that depended on it with it, which is correct
 * and is the only cascade in here.
 *
 * ## Its non-test caller
 *
 * `./session.ts#loadLibrary`.
 */
export function restoreLibrary(value: unknown, context: LibraryContext): LibraryRestore {
  if (libraryFrameIssue(value) !== undefined) return { library: EMPTY_LIBRARY, dropped: [] };
  const shelves = value as Record<keyof SavedLibrary, unknown>;
  const dropped: DroppedEntry[] = [];

  const classes = restoreShelf<MachineClass>(
    'class',
    shelves.classes,
    isObjectOf(MACHINE_CLASS_CHECKS, 'a machine class'),
    (entry) => classIssue(entry, context.elevatorSpecs),
    dropped,
  );

  let specs = context.elevatorSpecs;
  for (const machineClass of classes) specs = specsWithClass(specs, machineClass);

  const buildings = restoreShelf<SavedBuilding>(
    'building',
    shelves.buildings,
    isObjectOf(SAVED_BUILDING_CHECKS, 'a saved building'),
    (entry) => buildingIssue(entry, specs, context.trafficProfileIds),
    dropped,
  );

  const dispatchers = restoreShelf<SavedDispatcher>(
    'dispatcher',
    shelves.dispatchers,
    isObjectOf(SAVED_DISPATCHER_CHECKS, 'a saved dispatcher'),
    (entry) => dispatcherIssue(entry, context),
    dropped,
  );

  /*
   * The one shelf whose shape check *is* the whole check, so its legality step is empty rather than
   * duplicating it. A `PatternSpec` is not a `data/` document — it is the traffic editor's state,
   * and `demandFromSpec` turns it into `SimulationDemandOptions` at run time — so there is no
   * `core` parser to defer to. `PATTERN_SPEC_CHECKS` is derived from `PATTERN_ROWS` for exactly
   * that reason: the editor's own bounds, rather than a second set of them written here.
   */
  const patterns = restoreShelf<SavedPattern>(
    'pattern',
    shelves.patterns,
    isObjectOf(SAVED_PATTERN_CHECKS, 'a saved pattern'),
    () => undefined,
    dropped,
  );

  return {
    library: { buildings, dispatchers, patterns, classes },
    dropped: Object.freeze(dropped),
  };
}

/** How many things are in a library, for a sentence that has to say so. */
export function librarySize(library: SavedLibrary): number {
  return (
    library.buildings.length +
    library.dispatchers.length +
    library.patterns.length +
    library.classes.length
  );
}
