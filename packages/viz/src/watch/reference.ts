/**
 * **The shipped reference runs — `data/reference-runs.json`, read and refused.**
 *
 * GAMEPLAY § 20.11 and § 14.1. A decision number is owed; the argument is here.
 *
 * ## Why there are any at all, and why there are two
 *
 * Watching needs something to watch. The player's own filed days supply that eventually and supply
 * **nothing on a first visit** — a fresh session has closed no day, so the picker would open empty
 * and the feature would be unreachable until the player had already played a week. Two shipped
 * records make the surface reachable from a cold load, which is the same argument
 * `dev/main.ts`'s boot run makes for the stage not being blank.
 *
 * Two rather than one, and rather than five. One would make *reference run* look like a property of
 * that particular row; two on different buildings show it is a category. More than two is a
 * catalogue nobody authored a reason for, and every one of them is a figure this repository has to
 * keep pinned — see below.
 *
 * ## § 20.11's rule, and where it is kept
 *
 * > World figures must never be presented as players when they are reference runs.
 *
 * The file carries a {@link FIXTURE_MARKER} it must state verbatim, and a run's `source` is
 * `'reference'` **by construction** — this module sets it, the file cannot say otherwise, and
 * `watch/view.ts` renders `reference run · not a player` from that field. So a fixture cannot ship
 * without its disclaimer by being authored without one: there is nowhere to author it.
 *
 * The labels are deliberately not names. A reference run is called *the house baseline*, not
 * *Sam* — a name is what makes a reader assume a person, and § 20.11's whole subject is readers
 * assuming that.
 *
 * ## The figures are pinned to the run that produced them
 *
 * `posted` is four numbers, and CLAUDE.md's rule is that *a published number goes stale the same
 * way*: **if you publish a number, pin it to the run that produced it.** They are pinned twice
 * over, and the second pin is the interesting one:
 *
 * 1. `reference.test.ts` re-simulates each record and asserts the four figures reproduce exactly.
 *    That is the ordinary pin, and it fails the day `core` or `data/` moves under the file.
 * 2. The **product itself** performs the same check before offering the row — that is the
 *    reproduction gate, § 1.5. So a fixture that has gone stale in a shipped build does not lie to
 *    a player; it loses its affordance and says which figure moved.
 *
 * The second is why the numbers may be shipped in a file at all. A figure whose staleness is caught
 * only by a test is a figure that is wrong in production between two commits; this one is caught by
 * the surface that would otherwise publish it.
 */

import type { PostedResult, WatchRecord, WatchableRun } from './types.js';
import { WATCH_RECORD_VERSION } from './types.js';
import { firstPersonWordsIn } from './view.js';

/**
 * The sentence `data/reference-runs.json` must carry, verbatim — § 20.11's *"explicit `FIXTURE`
 * marker so nobody ships them as truth"*.
 *
 * Asserted rather than merely expected: {@link parseReferenceRuns} refuses a file whose marker
 * differs by a character. A marker that could be edited or dropped in the file it marks is not a
 * marker, and the one thing this file must never become is a set of numbers somebody reads as a
 * leaderboard.
 */
export const FIXTURE_MARKER =
  'FIXTURE — these are reference runs this repository simulated, not people. They are labelled ' +
  'as reference runs everywhere they appear and are never presented as players.';

/** Raised when the file cannot be read as reference runs at all. */
export class ReferenceRunsError extends Error {}

/**
 * Read the file, or throw with the reason.
 *
 * Throws rather than returning a partial list, on `record/document.ts`'s footing: a fixture file is
 * one authored document and half of one is a claim nobody wrote. The caller — `dev/data.ts` — turns
 * the throw into a picker that says the fixtures could not be read, which is a different row from a
 * fixture that will not reproduce and reads differently.
 */
export function parseReferenceRuns(
  raw: unknown,
  buildingNameOf: (buildingId: string) => string,
): readonly WatchableRun[] {
  const file = asRecord(raw, 'the reference-runs file');
  if (file['fixture'] !== FIXTURE_MARKER) {
    throw new ReferenceRunsError(
      'data/reference-runs.json must carry the FIXTURE marker verbatim — see ' +
        'watch/reference.ts#FIXTURE_MARKER. A fixture file without its own disclaimer is the ' +
        'thing GAMEPLAY § 20.11 forbids.',
    );
  }
  const runs = file['runs'];
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new ReferenceRunsError('data/reference-runs.json declares no runs.');
  }
  return Object.freeze(runs.map((entry, index) => runOf(entry, index, buildingNameOf)));
}

function runOf(
  raw: unknown,
  index: number,
  buildingNameOf: (buildingId: string) => string,
): WatchableRun {
  const where = `reference run ${String(index)}`;
  const entry = asRecord(raw, where);
  const record = recordOf(entry['record'], `${where}.record`);
  return {
    id: asString(entry['id'], `${where}.id`),
    /*
     * `'reference'`, written here and unreadable from the file. See the module docstring: a fixture
     * that could declare itself a player is a fixture that eventually will.
     */
    source: 'reference',
    label: authoredCopy(entry['label'], `${where}.label`),
    /*
     * Resolved from the record's own id, never authored in the file. A name written beside an id
     * is a second answer to *what is this building called*, and it is the copy that goes stale —
     * `dev/state.ts#buildingNameOf` is the one the rest of the shell reads.
     */
    buildingName: buildingNameOf(record.buildingId),
    subtitle: authoredCopy(entry['subtitle'], `${where}.subtitle`),
    record,
    posted: postedOf(entry['posted'], `${where}.posted`),
    /*
     * `null` — the file cannot ship a blocked row. Blocking is a **finding**, produced by
     * re-simulating against the gate, and a fixture that shipped its own refusal would be asserting
     * the outcome of a check that had not run.
     */
    blocked: null,
  };
}

function recordOf(raw: unknown, where: string): WatchRecord {
  const entry = asRecord(raw, where);
  const version = asNumber(entry['version'], `${where}.version`);
  if (version !== WATCH_RECORD_VERSION) {
    throw new ReferenceRunsError(
      `${where}.version is ${String(version)} and this build writes shape ` +
        `${String(WATCH_RECORD_VERSION)} — regenerate the file rather than reading it as if the ` +
        'shapes agreed.',
    );
  }
  return {
    version,
    seed: asString(entry['seed'], `${where}.seed`),
    buildingId: asString(entry['buildingId'], `${where}.buildingId`),
    dispatcherId: asString(entry['dispatcherId'], `${where}.dispatcherId`),
    pattern: asString(entry['pattern'], `${where}.pattern`),
    demandTemplateId: asNullableString(entry['demandTemplateId'], `${where}.demandTemplateId`),
    arrivalRatePctPop5min: asNullableNumber(
      entry['arrivalRatePctPop5min'],
      `${where}.arrivalRatePctPop5min`,
    ),
    shiftLengthS: asNumber(entry['shiftLengthS'], `${where}.shiftLengthS`),
    windowStartS: asNullableNumber(entry['windowStartS'], `${where}.windowStartS`),
    day: asNumber(entry['day'], `${where}.day`),
    dayIdx: asNumber(entry['dayIdx'], `${where}.dayIdx`),
    outOfServiceCarIds: asStrings(entry['outOfServiceCarIds'], `${where}.outOfServiceCarIds`),
    /*
     * Passed through as data. `core` owns what an `InterventionChange` may be and refuses what it
     * does not recognise — a second copy of that union here is the second answer this repository
     * keeps paying for. `persist/validate.ts` makes the identical call for the stored copy.
     */
    interventions: asInterventions(entry['interventions'], `${where}.interventions`),
  };
}

function postedOf(raw: unknown, where: string): PostedResult {
  const entry = asRecord(raw, where);
  return {
    arrived: asNumber(entry['arrived'], `${where}.arrived`),
    carried: asNumber(entry['carried'], `${where}.carried`),
    minutePct: asNumber(entry['minutePct'], `${where}.minutePct`),
    worstWaitS: asNumber(entry['worstWaitS'], `${where}.worstWaitS`),
  };
}

/**
 * A string that will land on a watching surface — refused at load time if it is first-person.
 *
 * § 14.1's rule is *"no first-person copy anywhere in the mode"*, and `view.test.ts` holds every
 * string the **view** composes to it. The fixture file's `label` and `subtitle` are neither
 * composed nor derived: they are authored, and they are printed verbatim on the header, the pill,
 * the eyebrow and the rail subline. A rule enforced over everything except the words a human types
 * is a rule enforced in the one place a human can break it.
 *
 * So it is checked here, at the same moment and for the same reason `fixit/parse.ts` refuses R10
 * words and engine ids in authored case copy: a load-time refusal reaches the person authoring the
 * file, where a test reaches whoever runs the suite next.
 */
function authoredCopy(value: unknown, where: string): string {
  const text = asString(value, where);
  const found = firstPersonWordsIn(text);
  if (found.length > 0) {
    throw new ReferenceRunsError(
      `${where} says “${found.join('”, “')}” — GAMEPLAY § 14.1 forbids first-person copy on a ` +
        'watched run, and this string is printed verbatim on the spectator header.',
    );
  }
  return text;
}

/* --- the small readers ---------------------------------------------------- */

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ReferenceRunsError(`${where} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReferenceRunsError(`${where} is not a non-empty string.`);
  }
  return value;
}

function asNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ReferenceRunsError(`${where} is not a finite number.`);
  }
  return value;
}

function asNullableString(value: unknown, where: string): string | null {
  return value === null ? null : asString(value, where);
}

function asNullableNumber(value: unknown, where: string): number | null {
  return value === null ? null : asNumber(value, where);
}

function asStrings(value: unknown, where: string): readonly string[] {
  if (!Array.isArray(value)) throw new ReferenceRunsError(`${where} is not a list.`);
  return Object.freeze(value.map((entry, index) => asString(entry, `${where}[${String(index)}]`)));
}

function asInterventions(value: unknown, where: string): WatchRecord['interventions'] {
  if (!Array.isArray(value)) throw new ReferenceRunsError(`${where} is not a list.`);
  return Object.freeze(
    value.map((entry, index) => {
      const at = `${where}[${String(index)}]`;
      const record = asRecord(entry, at);
      return {
        atS: asNumber(record['atS'], `${at}.atS`),
        change: asRecord(record['change'], `${at}.change`) as WatchRecord['interventions'][number]['change'],
      };
    }),
  );
}
