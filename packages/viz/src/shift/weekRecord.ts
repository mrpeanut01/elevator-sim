/**
 * **What a closed week leaves behind, and the crowds a new week is dealt** — wave AL, lane AL-F,
 * swarm DN's Q2.5 and Q2.6 ([§ D1229](../../../../DECISIONS.md), [§ D1230](../../../../DECISIONS.md)).
 *
 * ## What was wrong
 *
 * § D1177's roll empties a closed week's history and keeps the streak and the best day, so a week
 * that met its target left nothing a player could point at, and nothing said how many weeks had
 * been played on a tower. And a crowd was the date's digits (§ D729) whatever else had been played
 * that date: the post-AK panel's seat D closed a week in one sitting and was dealt it again, the
 * same crowd for every day of both weeks, with last week's call rows already known.
 *
 * ## The record carries forward, and it buys nothing
 *
 * {@link WeekRecord} is one line per tower: weeks closed, weeks whose target was met, and the most
 * clean counted days in one closed week. It opens nothing, prices nothing and decays never; there
 * is no streak in it (`docs/38` § 2.4, swarm DN's refusal). It is kept on this device beside the
 * rest of Everyday's progress (`everyday/profile.ts#EverydayProgress.weekRecords`), because the
 * session's week is a value whose roll empties it and the record is what outlives the roll.
 *
 * ## A new week is new
 *
 * {@link dealtCrowdOf} is the crowd a scored day is dealt. The first scored day this device files
 * on a tower on a date meets the date's crowd, which is everyone's and posts to the date's board.
 * Once the device has filed the date's crowd on that tower, every further day dealt on that date is
 * dealt a crowd **derived from the date, the day of the week and the weeks closed on the tower**
 * ({@link derivedCrowdOf}): the date's digits, then the day, then the weeks closed. It is the same
 * for everyone who reaches that day of that week on that date, it posts to no daily board (the
 * server places a crowd that is not the date's on the personal log), and it can be checked by the
 * player who reads it, which is § D729's standard for a crowd. Wrinkle orders are unchanged.
 *
 * The date's crowd a tower has had is known two ways: the week's own history, and
 * {@link WeekRecord.dateCrowd}, the last date crowd a scored day on the tower was filed on, which
 * survives the roll. The weeks-closed term is what keeps a second week on one date from meeting the
 * first week's derived crowds.
 *
 * ## What this cannot see
 *
 * A week closed in the Engineer shell is not counted into the record, because the record is written
 * by the Everyday close (`everyday/host.ts#closeDay`). A second week closed there on the same date
 * would meet the derived crowds of the one before it. The Everyday shell is where Scenario weeks
 * are played, and the gap is stated rather than guessed at.
 */

import { contractById } from './contracts.js';
import type { WeekState } from './types.js';

/** One tower's record of closed weeks — see the module docstring. */
export interface WeekRecord {
  readonly contractId: string;
  /** Weeks closed on this tower. */
  readonly closed: number;
  /** Of those, weeks whose clean counted days reached the target. */
  readonly met: number;
  /** The most clean counted days in one closed week. */
  readonly best: number;
  /** The last date crowd a scored day on this tower was filed on, as decimal digits. */
  readonly dateCrowd?: string;
}

/** The record for a tower that has none: nothing closed. */
export function weekRecordFor(records: readonly WeekRecord[], contractId: string): WeekRecord {
  return records.find((entry) => entry.contractId === contractId) ?? { contractId, closed: 0, met: 0, best: 0 };
}

function withRecord(records: readonly WeekRecord[], next: WeekRecord): readonly WeekRecord[] {
  return [...records.filter((entry) => entry.contractId !== next.contractId), next];
}

/**
 * The records after a week on `contractId` closed with `clean` clean counted days against a target
 * of `target`. A week with no target counts as closed and never as met.
 */
export function recordsWithClosedWeek(
  records: readonly WeekRecord[],
  contractId: string,
  clean: number,
  target: number,
): readonly WeekRecord[] {
  const record = weekRecordFor(records, contractId);
  return withRecord(records, {
    ...record,
    closed: record.closed + 1,
    met: record.met + (target > 0 && clean >= target ? 1 : 0),
    best: Math.max(record.best, clean),
  });
}

/** The records after a scored day on `contractId` was filed on the date crowd `seedText`. */
export function recordsWithDateCrowd(
  records: readonly WeekRecord[],
  contractId: string,
  seedText: string,
): readonly WeekRecord[] {
  const record = weekRecordFor(records, contractId);
  return record.dateCrowd === seedText ? records : withRecord(records, { ...record, dateCrowd: seedText });
}

/**
 * The crowd derived from the date, the day of the week and the weeks closed — the date's digits,
 * then the day, then the weeks closed. Always longer than a date's eight digits, so it is never any
 * date's crowd.
 */
export function derivedCrowdOf(dateSeed: bigint, day: number, weeksClosed: number): bigint {
  return BigInt(`${dateSeed.toString()}${String(day)}${String(weeksClosed)}`);
}

/**
 * Whether `seed` is a crowd {@link derivedCrowdOf} deals on the date whose crowd is `dateSeed` —
 * the seed line's fourth arm reads this, so it can say where the number came from.
 */
export function isDerivedCrowdOn(seed: bigint, dateSeed: bigint): boolean {
  const text = seed.toString();
  const date = dateSeed.toString();
  return text.length > date.length && text.startsWith(date);
}

/**
 * **The crowd today's scored day is dealt** — see the module docstring.
 *
 * On a week on no scenario it is the date's crowd, as it always was. On a day the week has already
 * closed it is the crowd that day was filed on, so a practice run of it meets the same passengers.
 * Otherwise it is the date's crowd until this device has filed that crowd on this tower, and the
 * derived crowd after.
 */
export function dealtCrowdOf(
  week: Pick<WeekState, 'contractId' | 'day' | 'closedDay' | 'history'>,
  record: WeekRecord,
  dateSeed: bigint,
): bigint {
  if (contractById(week.contractId) === undefined) return dateSeed;
  if (week.closedDay === week.day) {
    const filedOn = week.history.find((entry) => entry.day === week.day)?.record?.seed;
    if (filedOn !== undefined && /^\d+$/u.test(filedOn)) return BigInt(filedOn);
  }
  const date = dateSeed.toString();
  const filed = record.dateCrowd === date || week.history.some((entry) => entry.record?.seed === date);
  return filed ? derivedCrowdOf(dateSeed, week.day, record.closed) : dateSeed;
}

/**
 * **The record, as one line**, or `undefined` before a week on the tower has closed. Counts only;
 * nothing it says is a reward, because nothing it counts buys anything.
 */
export function weekRecordLineOf(record: WeekRecord): string | undefined {
  if (record.closed === 0) return undefined;
  const weeks = record.closed === 1 ? '1 week closed' : `${String(record.closed)} weeks closed`;
  return (
    `Your record on this tower: ${weeks}, ${String(record.met)} with the target met, and the most ` +
    `clean counted days in one week is ${String(record.best)}.`
  );
}
