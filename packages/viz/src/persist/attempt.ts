/**
 * **The attempts standing on this device's scored days, kept across a reload** — wave AL, lane
 * AL-E, [§ D1218](../../../../DECISIONS.md). The rule is `shift/attempt.ts`'s; this is where it is
 * written down so a reload finds it.
 *
 * ## Why a slot of its own rather than a field on the session's week
 *
 * An attempt lives from *Start the day* to the day's close, and it is rewritten at every press and
 * as the stage is watched, which is far more often than the week moves. The session envelope is
 * versioned and strict (`persist/validate.ts` refuses an unknown key, and a version bump carries a
 * migration), so a field there would make every press a write of the whole week and every build
 * that reads an older envelope a migration for a value that is gone by the evening. A slot of its
 * own is thrown away whole when it cannot be read, which costs at most the attempt: the day then
 * opens as a day nobody has started, exactly as it did before this ruling.
 *
 * One slot for every scenario, keyed by contract, because a player may leave a day part-played on
 * one tower, take another tower's day, and come back: each week keeps its own attempt.
 *
 * ## `NaN` and `Infinity`
 *
 * An attempt carries its calls' folded observations for the report's grader, and a fold may hold a
 * non-finite number, which `JSON.stringify` would write as `null`. They are written as a tagged
 * string and read back, so a resumed report grades the same numbers the unbroken one would have.
 *
 * Its non-test caller is `dev/main.ts`, which hands it the same {@link SessionStore} the session
 * uses.
 */

import type { DayAttempt } from '../shift/attempt.js';

import type { SessionStore } from './types.js';

/** The slot. Dotted and prefixed as `persist/types.ts#SESSION_KEY` is. */
export const ATTEMPT_KEY = 'elevator-sim.day-attempts';

/** The envelope version; a slot of another version is dropped rather than read. */
const ATTEMPT_VERSION = 1;

const NON_FINITE = '$non-finite:';

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return `${NON_FINITE}${String(value)}`;
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(NON_FINITE)) return Number(value.slice(NON_FINITE.length));
  return value;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Whether a stored value is an attempt this build can resume. Shallow where the value is re-checked
 * downstream (an intervention's change is `core`'s to accept when the run is re-simulated, a call
 * record is the report's to draw) and strict on everything the resume itself reads.
 */
function attemptIssue(value: unknown): string | undefined {
  if (!isObject(value)) return 'not an object';
  const text = ['contractId', 'seed', 'dispatcherId'] as const;
  for (const key of text) if (typeof value[key] !== 'string' || value[key] === '') return `${key} is not text`;
  if (!/^\d{1,40}$/u.test(value['seed'] as string)) return 'seed is not a crowd';
  if (!(typeof value['daySeed'] === 'string' && /^\d{1,40}$/u.test(value['daySeed']))) return 'daySeed is not a crowd';
  if (!Number.isInteger(value['day']) || (value['day'] as number) < 1) return 'day is not a day';
  if (!Number.isInteger(value['dayIdx']) || (value['dayIdx'] as number) < 0 || (value['dayIdx'] as number) > 6) {
    return 'dayIdx is not a weekday';
  }
  if (!isNumber(value['shownToS'])) return 'shownToS is not a time';
  for (const key of ['pinnedCallDone', 'pressCallSkipped'] as const) {
    if (typeof value[key] !== 'boolean') return `${key} is not a flag`;
  }
  const interventions = value['interventions'];
  if (!Array.isArray(interventions) || interventions.length > 64) return 'interventions is not a log';
  for (const entry of interventions as unknown[]) {
    if (!isObject(entry) || !isNumber(entry['atS']) || !isObject(entry['change'])) return 'an intervention is damaged';
    if (typeof entry['change']['kind'] !== 'string') return 'an intervention names no change';
  }
  if (value['record'] !== null && !isObject(value['record'])) return 'record is not a record';
  const calls = value['calls'];
  if (calls !== null) {
    if (!isObject(calls)) return 'calls is not a session';
    if (!Array.isArray(calls['records'])) return 'calls carries no records';
    for (const key of ['searchFromS', 'asked', 'refused'] as const) {
      if (!isNumber(calls[key])) return `calls.${key} is not a number`;
    }
    if (typeof calls['done'] !== 'boolean') return 'calls.done is not a flag';
    /* § D1205's memory, which a resumed session needs to raise what an unbroken one would. */
    const peaks = calls['raisedInPeak'];
    if (!Array.isArray(peaks) || !(peaks as unknown[]).every(isNumber)) return 'calls.raisedInPeak is not a list of times';
    const last = calls['lastRaisedAtS'];
    if (!isObject(last)) return 'calls.lastRaisedAtS is not a record';
    for (const key of ['placement', 'driver'] as const) {
      if (last[key] !== null && !isNumber(last[key])) return `calls.lastRaisedAtS.${key} is not a time`;
    }
    if (calls['keptInPeakS'] !== null && !isNumber(calls['keptInPeakS'])) return 'calls.keptInPeakS is not a time';
    const driving = calls['driving'];
    if (driving !== null && !(isObject(driving) && typeof driving['id'] === 'string' && typeof driving['name'] === 'string')) {
      return 'calls.driving is not a dispatcher';
    }
  }
  return undefined;
}

/**
 * The attempts on this device, by contract. An unreadable slot, or an entry in it, is dropped
 * rather than repaired: an attempt that cannot be resumed exactly is not one to resume.
 */
export function loadAttempts(store: SessionStore): ReadonlyMap<string, DayAttempt> {
  let raw: string | null;
  try {
    raw = store.read(ATTEMPT_KEY);
  } catch {
    return new Map();
  }
  if (raw === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, reviver);
  } catch {
    return new Map();
  }
  if (!isObject(parsed) || parsed['version'] !== ATTEMPT_VERSION || !isObject(parsed['attempts'])) return new Map();
  const attempts = new Map<string, DayAttempt>();
  for (const [contractId, attempt] of Object.entries(parsed['attempts'])) {
    if (attemptIssue(attempt) !== undefined) continue;
    if ((attempt as { contractId: string }).contractId !== contractId) continue;
    attempts.set(contractId, attempt as unknown as DayAttempt);
  }
  return attempts;
}

/**
 * Write every standing attempt, or clear the slot when none stands. `false` when the store refused;
 * the attempt still stands in memory, and only a reload would lose it.
 */
export function saveAttempts(store: SessionStore, attempts: ReadonlyMap<string, DayAttempt>): boolean {
  try {
    if (attempts.size === 0) {
      store.remove(ATTEMPT_KEY);
      return true;
    }
    store.write(ATTEMPT_KEY, JSON.stringify({ version: ATTEMPT_VERSION, attempts: Object.fromEntries(attempts) }, replacer));
    return true;
  } catch {
    return false;
  }
}
