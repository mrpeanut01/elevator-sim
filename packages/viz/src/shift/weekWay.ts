/**
 * **Whether a day of the week can be won, as a measured claim** — `docs/33` DC-10,
 * [§ D1067](../../../../DECISIONS.md).
 *
 * ## What this module is for
 *
 * Three independent measurements of the whole-day week (wave AJ's decision records) found days 3–5
 * of Midtown Office unwinnable as built: 0 clears in 390 runs across thirteen standing orders, and
 * one rescue in 72 presses. Their shared cause was the week's population growth rather than the
 * bars, so [§ D1066](../../../../DECISIONS.md) moved the growth slope into data per tower. What
 * keeps that re-derivation honest is a rule a day has to pass, and this module holds that rule's
 * reading of the census `shift/weekWay.sweep.test.ts` writes to `data/week-way.json`.
 *
 * ## DC-10, in the form the code checks
 *
 * A (tower, day) is **admitted** when, on **held-out** crowds:
 *
 * 1. **a way through** — the one configuration chosen on separate **tuning** crowds (a standing
 *    order, with or without one parking press at a stated fraction of the day) clears the day with
 *    a two-sided 95 % Clopper–Pearson lower bound at or above {@link WeekWayProtocol.clearLowerBoundAtLeast};
 * 2. **a reason to decide** — the tower's standing order, left alone, misses on at least
 *    {@link WeekWayProtocol.standingMissAtLeast} of the same crowds. A declared breather day skips
 *    this half, one a week at most.
 *
 * Chosen on tuning crowds and measured on held-out ones because a best-of-65 per crowd overstates
 * what a player can do: the configuration a player picks has to be picked before the crowd is seen,
 * and `CLAUDE.md`'s tuning discipline says the same about seeds. Every configuration in a round
 * meets the same crowd (common random numbers).
 *
 * ## Derived, never stored
 *
 * A row stores its counts and the per-crowd verdicts behind them; whether it is admitted is
 * {@link dc10Of}'s arithmetic over those, so a row cannot say *admitted* over counts that do not
 * support it. {@link weekWayIssues} refuses a row whose counts and verdict strings disagree, whose
 * growth is not the slope the ladder now grows that tower at, or whose crowds overlap.
 */

import weekWayDocument from '../../../../data/week-way.json' with { type: 'json' };

import { goalsForDay } from './goals.js';
import { CONTRACT_LADDER, growthPerDayOf, ladderRowFor, type ContractLadder } from './ladder.js';
import type { RunHorizon } from './types.js';

/** The census's fixed settings — what every row was measured under. */
export interface WeekWayProtocol {
  /** The horizon every row is measured on. A row describes no run on the other one. */
  readonly horizon: RunHorizon;
  /** The first tuning crowd's date, and how many consecutive dates the tuning set holds. */
  readonly tuningFrom: string;
  readonly tuningCount: number;
  /** Crowds every configuration meets before the field is cut to {@link finalists}. */
  readonly screenCount: number;
  /** How many configurations go on to the rest of the tuning crowds. */
  readonly finalists: number;
  /** The first held-out crowd's date, and how many consecutive dates the held-out set holds. */
  readonly heldOutFrom: string;
  readonly heldOutCount: number;
  /** The parking presses a configuration may carry, and the fractions of the day they fall at. */
  readonly pressKinds: readonly string[];
  readonly pressAtFractions: readonly number[];
  /** The tower's standing order — the dispatcher a player who changes nothing drives with. */
  readonly standingOrder: string;
  readonly confidence: number;
  readonly clearLowerBoundAtLeast: number;
  readonly standingMissAtLeast: number;
  readonly breathersPerWeek: number;
}

/** One configuration: a dispatcher, and at most one press. */
export interface WeekWayConfig {
  readonly dispatcherId: string;
  /** `''` for no press. */
  readonly press: string;
  /** `0` for no press. */
  readonly atFraction: number;
}

/** A per-crowd verdict string: one `C` (cleared) or `m` (missed) per crowd, in crowd order. */
export type VerdictString = string;

export interface WeekWayRow {
  readonly contractId: string;
  /** `WeekState.day`, 1–7. */
  readonly day: number;
  /** The wrinkle the day was measured under — `'ordinary'` for the unwrinkled day. */
  readonly eventId: string;
  /** The slope the tower was grown at when this row was measured. */
  readonly growthPerDay: number;
  /** A declared breather: DC-10's second half does not apply. */
  readonly breather: boolean;
  readonly chosen: WeekWayConfig;
  /** The chosen configuration's clears on the tuning crowds, and how many it met. */
  readonly tuningClears: number;
  readonly tuningN: number;
  /** Held-out verdicts: the chosen configuration's, then the standing order's with no press. */
  readonly chosenVerdicts: VerdictString;
  readonly standingVerdicts: VerdictString;
  /** Held-out crowds the chosen configuration missed on the queue goal and on nothing else. */
  readonly queueOnlyMisses: number;
  /**
   * The lowest whole-day peak landing queue any configuration reached on the tuning screen — every
   * configuration on every screen crowd. The queue gate reads it against the day's bar.
   */
  readonly lowestPeakQueue: number;
  /** How many runs the screen was: configurations × screen crowds. */
  readonly screenRuns: number;
}

export interface WeekWay {
  readonly version: number;
  readonly protocol: WeekWayProtocol;
  readonly rows: readonly WeekWayRow[];
  /** Whole-day contracts the census has not measured, each with the reason. */
  readonly unmeasured: readonly { readonly contractId: string; readonly reason: string }[];
}

/* -------------------------------------------------------------------------- *
 * Crowds
 * -------------------------------------------------------------------------- */

/** Days in a Gregorian month; no `Date`, because this package reads no calendar outside `deviceDate.ts`. */
function daysIn(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * `count` consecutive UTC dates from `from` (`YYYY-MM-DD`), as `YYYY-MM-DD` strings.
 *
 * A crowd is a date — [§ D729](../../../../DECISIONS.md): `dailySeedFor(date)` is the seed a player
 * on that date is dealt — so the held-out set is *the next crowds the product will deal* rather than
 * a sequence nobody meets.
 */
export function crowdDates(from: string, count: number): readonly string[] {
  const [y0 = 0, m0 = 0, d0 = 0] = from.split('-').map(Number);
  let year = y0;
  let month = m0;
  let day = d0;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    day += 1;
    if (day > daysIn(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return Object.freeze(out);
}


/* -------------------------------------------------------------------------- *
 * The interval
 * -------------------------------------------------------------------------- */

/** P(X ≥ k) for X ~ Binomial(n, p), summed in log space so n in the hundreds stays finite. */
function upperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let logChoose = 0;
  let sum = 0;
  for (let i = 0; i <= n; i += 1) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) sum += Math.exp(logChoose + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return sum;
}

/**
 * The two-sided Clopper–Pearson lower bound on a proportion, at `confidence`.
 *
 * Exact rather than a normal approximation, because the cells are small (tens of crowds) and the
 * interesting ones sit near 0 and near 1, where the approximation is worst. Solved by bisection on
 * the binomial tail rather than through a Beta quantile, which this package has no library for.
 * `0` at `k = 0`, by definition.
 */
export function clopperPearsonLower(k: number, n: number, confidence: number): number {
  if (k <= 0 || n <= 0) return 0;
  const alpha = (1 - confidence) / 2;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (upperTail(k, n, mid) < alpha) lo = mid;
    else hi = mid;
  }
  return lo;
}

/* -------------------------------------------------------------------------- *
 * DC-10
 * -------------------------------------------------------------------------- */

/** `C`s in a verdict string. */
export function clearsIn(verdicts: VerdictString): number {
  return [...verdicts].filter((mark) => mark === 'C').length;
}

/** What DC-10 says about one row. Every field is arithmetic over the row and the protocol. */
export interface Dc10Reading {
  readonly n: number;
  readonly chosenClears: number;
  readonly lowerBound: number;
  readonly standingMisses: number;
  /** Half 1: the chosen configuration's lower bound reaches the protocol's floor. */
  readonly wayThrough: boolean;
  /** Half 2: the standing order misses often enough, or the day is a declared breather. */
  readonly asksSomething: boolean;
  /** The day's queue bar, `goalsForDay(day, horizon)`'s own. */
  readonly queueBar: number;
  /**
   * **The queue gate** — the queue-bar swarm's clause 4, [§ D1067](../../../../DECISIONS.md): some
   * configuration the screen ran kept every landing at or under the day's queue bar on some crowd.
   * A day no reachable play can meet the queue goal on is not admitted however its other figures
   * read, and its brief says which goal is out of reach.
   */
  readonly queueFeasible: boolean;
  readonly admitted: boolean;
}

export function dc10Of(row: WeekWayRow, protocol: WeekWayProtocol): Dc10Reading {
  const n = row.chosenVerdicts.length;
  const chosenClears = clearsIn(row.chosenVerdicts);
  const standingMisses = row.standingVerdicts.length - clearsIn(row.standingVerdicts);
  const lowerBound = clopperPearsonLower(chosenClears, n, protocol.confidence);
  const wayThrough = n > 0 && lowerBound >= protocol.clearLowerBoundAtLeast;
  const asksSomething =
    row.breather ||
    (row.standingVerdicts.length > 0 &&
      standingMisses / row.standingVerdicts.length >= protocol.standingMissAtLeast);
  const queueBar =
    goalsForDay(row.day, protocol.horizon).find((goal) => goal.id === 'queue')?.bar ?? Number.NaN;
  const queueFeasible = row.lowestPeakQueue <= queueBar;
  return {
    n,
    chosenClears,
    lowerBound,
    standingMisses,
    wayThrough,
    asksSomething,
    queueBar,
    queueFeasible,
    admitted: queueFeasible && wayThrough && asksSomething,
  };
}

/* -------------------------------------------------------------------------- *
 * Parsing and the shipped census
 * -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}
function asStrings(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.map(asString) : []);
}
function asNumbers(value: unknown): readonly number[] {
  return Object.freeze(Array.isArray(value) ? value.map(asNumber) : []);
}

/** Structure only; {@link weekWayIssues} is where a malformed field is named. */
export function parseWeekWay(input: unknown): WeekWay {
  const record = asRecord(input);
  const protocol = asRecord(record['protocol']);
  const rows = Array.isArray(record['rows']) ? (record['rows'] as unknown[]) : [];
  const unmeasured = Array.isArray(record['unmeasured']) ? (record['unmeasured'] as unknown[]) : [];
  return Object.freeze({
    version: asNumber(record['version']),
    protocol: Object.freeze({
      horizon: asString(protocol['horizon']) as RunHorizon,
      tuningFrom: asString(protocol['tuningFrom']),
      tuningCount: asNumber(protocol['tuningCount']),
      screenCount: asNumber(protocol['screenCount']),
      finalists: asNumber(protocol['finalists']),
      heldOutFrom: asString(protocol['heldOutFrom']),
      heldOutCount: asNumber(protocol['heldOutCount']),
      pressKinds: asStrings(protocol['pressKinds']),
      pressAtFractions: asNumbers(protocol['pressAtFractions']),
      standingOrder: asString(protocol['standingOrder']),
      confidence: asNumber(protocol['confidence']),
      clearLowerBoundAtLeast: asNumber(protocol['clearLowerBoundAtLeast']),
      standingMissAtLeast: asNumber(protocol['standingMissAtLeast']),
      breathersPerWeek: asNumber(protocol['breathersPerWeek']),
    }),
    rows: Object.freeze(
      rows.map((value) => {
        const row = asRecord(value);
        const chosen = asRecord(row['chosen']);
        return Object.freeze({
          contractId: asString(row['contractId']),
          day: asNumber(row['day']),
          eventId: asString(row['eventId']),
          growthPerDay: asNumber(row['growthPerDay']),
          breather: row['breather'] === true,
          chosen: Object.freeze({
            dispatcherId: asString(chosen['dispatcherId']),
            press: asString(chosen['press']),
            atFraction: asNumber(chosen['atFraction']),
          }),
          tuningClears: asNumber(row['tuningClears']),
          tuningN: asNumber(row['tuningN']),
          chosenVerdicts: asString(row['chosenVerdicts']),
          standingVerdicts: asString(row['standingVerdicts']),
          queueOnlyMisses: asNumber(row['queueOnlyMisses']),
          lowestPeakQueue: asNumber(row['lowestPeakQueue']),
          screenRuns: asNumber(row['screenRuns']),
        });
      }),
    ),
    unmeasured: Object.freeze(
      unmeasured.map((value) => {
        const entry = asRecord(value);
        return Object.freeze({ contractId: asString(entry['contractId']), reason: asString(entry['reason']) });
      }),
    ),
  });
}

/** The shipped census. */
export const WEEK_WAY: WeekWay = parseWeekWay(weekWayDocument);

/**
 * Whether a row describes the tower as it grows now. Day 1 is the building as handed at every
 * slope (`growthFactor(1, g)` is exactly 1), so a day-1 row is current whatever slope it was taken
 * under; every later day is current only at the slope it was measured at.
 */
function measuredAtSlope(row: WeekWayRow, slope: number): boolean {
  return row.day === 1 || row.growthPerDay === slope;
}

/**
 * Every way the census can be wrong or stale, collected.
 *
 * Stale is the one worth reading twice: a row measured at a growth slope the ladder no longer grows
 * its tower at describes a building nobody is handed, so it is refused by name here and drawn by
 * nothing ({@link weekWayRowFor} returns `undefined` for it). That is § D973's horizon lesson on the
 * axis this census adds.
 */
export function weekWayIssues(
  census: WeekWay,
  ladder: ContractLadder = CONTRACT_LADDER,
): readonly string[] {
  const issues: string[] = [];
  const p = census.protocol;
  if (p.horizon !== 'whole-day' && p.horizon !== 'period') issues.push(`protocol horizon ${p.horizon}`);
  for (const [name, value] of [
    ['tuningCount', p.tuningCount],
    ['screenCount', p.screenCount],
    ['finalists', p.finalists],
    ['heldOutCount', p.heldOutCount],
  ] as const) {
    if (!(Number.isInteger(value) && value > 0)) issues.push(`protocol ${name} is ${String(value)}`);
  }
  if (p.screenCount > p.tuningCount) issues.push('protocol screens on more crowds than it tunes on');
  const tuning = new Set(crowdDates(p.tuningFrom, p.tuningCount));
  for (const date of crowdDates(p.heldOutFrom, p.heldOutCount)) {
    if (tuning.has(date)) issues.push(`held-out crowd ${date} is also a tuning crowd`);
  }
  if (!(p.confidence > 0 && p.confidence < 1)) issues.push(`protocol confidence ${String(p.confidence)}`);
  const breathers = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of census.rows) {
    const key = `${row.contractId}/${String(row.day)}/${row.eventId}`;
    if (seen.has(key)) issues.push(`row ${key} is measured twice`);
    seen.add(key);
    const rung = ladderRowFor(row.contractId);
    if (rung === undefined) {
      issues.push(`row ${key} names no ladder row`);
      continue;
    }
    if (!(Number.isInteger(row.day) && row.day >= 1 && row.day <= 7)) issues.push(`row ${key} names day ${String(row.day)}`);
    const slope = growthPerDayOf(rung, ladder);
    if (!measuredAtSlope(row, slope)) {
      issues.push(
        `row ${key} was measured at growth ${String(row.growthPerDay)} and the ladder grows ` +
          `${row.contractId} at ${String(slope)}; re-run the census`,
      );
    }
    for (const [name, verdicts] of [
      ['chosenVerdicts', row.chosenVerdicts],
      ['standingVerdicts', row.standingVerdicts],
    ] as const) {
      if (verdicts.length !== p.heldOutCount || !/^[Cm]*$/.test(verdicts)) {
        issues.push(`row ${key} ${name} is not ${String(p.heldOutCount)} marks of C or m`);
      }
    }
    if (!(row.tuningN > 0 && row.tuningClears >= 0 && row.tuningClears <= row.tuningN)) {
      issues.push(`row ${key} tuning clears ${String(row.tuningClears)} of ${String(row.tuningN)}`);
    }
    const misses = row.chosenVerdicts.length - clearsIn(row.chosenVerdicts);
    if (!(row.queueOnlyMisses >= 0 && row.queueOnlyMisses <= misses)) {
      issues.push(`row ${key} names ${String(row.queueOnlyMisses)} queue-only misses of ${String(misses)}`);
    }
    if (!(row.lowestPeakQueue >= 0) || !(Number.isInteger(row.screenRuns) && row.screenRuns > 0)) {
      issues.push(`row ${key} carries no screen reading (lowestPeakQueue, screenRuns)`);
    }
    if (row.chosen.press !== '' && !p.pressKinds.includes(row.chosen.press)) {
      issues.push(`row ${key} chose press ${row.chosen.press}, which the protocol does not offer`);
    }
    if (row.breather) breathers.set(row.contractId, (breathers.get(row.contractId) ?? 0) + 1);
  }
  for (const [contractId, count] of breathers) {
    if (count > p.breathersPerWeek) {
      issues.push(`${contractId} declares ${String(count)} breather days; DC-10 allows ${String(p.breathersPerWeek)}`);
    }
  }
  return issues;
}

/**
 * The census row for a contract's day, or `undefined` — measured, current, and on the horizon the
 * day will run on. `eventId` picks the row measured under that wrinkle when there is one, and the
 * unwrinkled (`'ordinary'`) row otherwise; the caller says which it got, because a sentence about
 * the ordinary day drawn over a wrinkled one has to name the difference.
 */
export function weekWayRowFor(
  contractId: string,
  day: number,
  eventId: string,
  horizon: RunHorizon | undefined,
  census: WeekWay = WEEK_WAY,
): WeekWayRow | undefined {
  if (horizon !== census.protocol.horizon) return undefined;
  const rung = ladderRowFor(contractId);
  if (rung === undefined) return undefined;
  const slope = growthPerDayOf(rung);
  const current = census.rows.filter(
    (row) => row.contractId === contractId && row.day === day && measuredAtSlope(row, slope),
  );
  return current.find((row) => row.eventId === eventId) ?? current.find((row) => row.eventId === 'ordinary');
}

/* -------------------------------------------------------------------------- *
 * The brief's sentence
 * -------------------------------------------------------------------------- */

/** What the brief needs to know about the day about to run. */
export interface WayThroughInput {
  readonly contractId: string;
  readonly day: number;
  /** `shift/calendar.ts#scheduledEventFor(...).id` — the wrinkle the day draws. */
  readonly eventId: string;
  /** A calendar period makes it a different day from the one measured. */
  readonly hasCalendar: boolean;
  /** `dayLength.ts#scenarioHorizonFor` — the horizon the press will run. */
  readonly horizon: RunHorizon | undefined;
}

/**
 * **The measured sentence a day that fails DC-10 carries on its brief**, or `undefined` —
 * [§ D1067](../../../../DECISIONS.md) clause 4.
 *
 * Drawn only for a day the census measured, at the slope the tower grows at now, on the horizon
 * the press will run and with no calendar period over it; an admitted day draws nothing. The
 * sentence states a distribution over crowds the census names by count, never a claim about
 * today's crowd, and it gives **no advice**: nothing measured licenses *do this tomorrow*, and a
 * day with no way through has none to give.
 *
 * Where the census measured the day without the wrinkle today draws, the sentence says so first —
 * the measurement is of a different day, and the reader is owed the difference rather than a
 * figure borrowed across it.
 */
export function wayThroughSentenceOf(
  input: WayThroughInput,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  if (input.hasCalendar) return undefined;
  const row = weekWayRowFor(input.contractId, input.day, input.eventId, input.horizon, census);
  if (row === undefined) return undefined;
  const reading = dc10Of(row, census.protocol);
  if (reading.admitted) return undefined;
  const lead =
    row.eventId === input.eventId ? '' : 'Measured on this day of the week without today’s wrinkle: ';
  const n = String(reading.n);
  if (!reading.queueFeasible) {
    const body =
      `no standing order or press we measured kept every landing to ${String(reading.queueBar)} ` +
      `people or fewer on this day: the fewest any of ${String(row.screenRuns)} runs reached was ` +
      `${String(row.lowestPeakQueue)}.`;
    return lead === '' ? capitalise(body) : `${lead}${body}`;
  }
  if (!reading.wayThrough) {
    const body =
      reading.chosenClears === 0
        ? `no standing order or press we measured cleared this day on ${n} crowds.`
        : `the best standing order or press we found cleared this day on ${String(reading.chosenClears)} ` +
          `of ${n} crowds.`;
    return lead === '' ? capitalise(body) : `${lead}${body}`;
  }
  const standingClears = reading.n - reading.standingMisses;
  const body =
    `the tower’s standing order, left alone, cleared this day on ${String(standingClears)} of ${n} ` +
    'crowds we measured.';
  return lead === '' ? capitalise(body) : `${lead}${body}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
