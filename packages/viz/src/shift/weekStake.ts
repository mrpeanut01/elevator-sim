/**
 * **A week with a stake and an ending** — swarm DL's Q2 ruling, [§ D1176](../../../../DECISIONS.md)
 * (only contested days count, and the target is derived), [§ D1177](../../../../DECISIONS.md) (the
 * week closes on a sheet beside the house, and rolls) and [§ D1178](../../../../DECISIONS.md) (a
 * newcomer's first week is on a tower whose week this admits).
 *
 * ## What was wrong
 *
 * The post-AJ panel's seat A played Midtown Office's week and met its target, *two clean shifts*,
 * by Wednesday. The swarm then measured why: `contract.needClean` is authored rather than measured,
 * and Saturday and Sunday clear 20 of 20 held-out crowds with nothing touched, so a player who
 * pressed nothing met it on 14 of 14 weeks (S2's W1). The week had no ending either:
 * `week.ts#nextDay` rolled `dayIdx` modulo seven forever and nothing anywhere closed a week.
 *
 * ## The rule, read off the census rather than restated
 *
 * A day of a tower's week **counts** when `docs/33` DC-10's census (`shift/weekWay.ts`) measured
 * that day **as it is dealt** (the same day, the same wrinkle, at the slope the tower grows at now)
 * and found both halves of *contested*:
 *
 * 1. a way through: DC-10's own admission, the queue gate and the chosen play's lower bound;
 * 2. a reason to decide: the standing order, left alone, misses on at least
 *    `protocol.standingMissAtLeast` of the held-out crowds. **A declared breather does not buy this
 *    half here**, which is the one place this rule is stricter than admission: a breather is
 *    admitted so that the week may have a quiet day, and a quiet day is exactly a day no play
 *    decides, so it is dealt and played and does not count (the ruling's *"days no play decides do
 *    not count either"*).
 *
 * The **target** is the counted days dealt, minus one, and at least one: S3's rule, which gives
 * S2's *2 of 3* and S1's *k of 3* on a three-day week and *4 of 5* on Midtown's week, which since
 * [§ D1180](../../../../DECISIONS.md) moved its Tuesday and Friday wrinkles off the lunch peak is
 * its week as dealt as well as unwrinkled. A tower whose week has no counted day has no target,
 * and says so; it is not given one, and its scenario's clear is held with the reason
 * ({@link weekOfferOf}, [§ D1179](../../../../DECISIONS.md)).
 *
 * ## Where the census does not speak, nothing changes
 *
 * {@link weekDealOf} answers `undefined` for a contract the census has not measured at all (every
 * slice tower, and every whole-day tower in `data/week-way.json`'s `unmeasured` block). Those weeks
 * keep `contract.needClean` and count every clean day, exactly as before: the ruling moves a target
 * the census can derive, and inventing one for a tower it has not measured would be the authored
 * figure this module exists to retire, under a new name.
 *
 * ## Derived, never stored
 *
 * Nothing here is persisted. The deal is a function of the contract and the census, the counted
 * clean days are a function of the week's history, and the sheet is a function of both and of the
 * house's verdicts, which the shell measures when the week closes (`dev/main.ts`). A census that
 * moves moves every one of them on the same commit.
 */

import { scheduledEventFor } from './calendar.js';
import { dc10Of, WEEK_WAY, weekWayRowFor, type WeekWay, type WeekWayRow } from './weekWay.js';
import { weekdayOf, type DayOutcome, type ScenarioContract, type WeekState } from './types.js';
import type { WatchRecord } from '../watch/types.js';

/** A week's days. The census measures days 1 to 7, and a week that the census speaks for ends on 7. */
export const WEEK_LENGTH = 7;

/** Why a dealt day counts or does not. */
export type DayStakeReason =
  /** Both halves hold: the day counts. */
  | 'contested'
  /** A way through, and the standing order left alone clears it too often: no play decides it. */
  | 'untouched'
  /** DC-10's first half fails: nothing measured clears it often enough. */
  | 'no-way-through'
  /** The queue gate fails: no measured play met the day's queue bar on any crowd. */
  | 'queue'
  /** The census measured the tower and not this day as it is dealt. */
  | 'unmeasured';

/** One day of a tower's week, as dealt. */
export interface DealtDay {
  /** `WeekState.day`, 1 to 7. */
  readonly day: number;
  readonly dayIdx: number;
  /** The wrinkle the day draws — `calendar.ts#scheduledEventFor`, with no calendar over it. */
  readonly eventId: string;
  readonly counts: boolean;
  readonly reason: DayStakeReason;
  /** The census row that decided it, or `undefined` for an unmeasured day. */
  readonly row: WeekWayRow | undefined;
  /** One sentence, no advice: whether the day counts toward the week and why. */
  readonly sentence: string;
}

/** A tower's week as the census reads it. */
export interface WeekDeal {
  readonly contractId: string;
  readonly days: readonly DealtDay[];
  /** How many dealt days count. */
  readonly counted: number;
  /** Counted days minus one, at least one; `0` when no day counts, which is *no target*. */
  readonly target: number;
}

/** {@link DealtDay.sentence} for a day that counts. */
export const DAY_COUNTS_SENTENCE = 'This day counts toward the week.';

/** {@link DealtDay.sentence} for a day the census did not measure as it is dealt. */
export const DAY_UNMEASURED_SENTENCE =
  'This day does not count toward the week: it has not been measured as it is dealt.';

/** The sentence for a day, from its reason and the census row behind it. Digits are counts with their `n`. */
function sentenceFor(reason: DayStakeReason, row: WeekWayRow | undefined, census: WeekWay): string {
  if (reason === 'contested') return DAY_COUNTS_SENTENCE;
  if (row === undefined || reason === 'unmeasured') return DAY_UNMEASURED_SENTENCE;
  const reading = dc10Of(row, census.protocol);
  const n = String(reading.n);
  const lead = 'This day does not count toward the week: ';
  if (reason === 'queue') {
    return (
      `${lead}no standing order or press we measured kept every landing to ` +
      `${String(reading.queueBar)} people or fewer on it.`
    );
  }
  if (reason === 'no-way-through') {
    return reading.chosenClears === 0
      ? `${lead}no standing order or press we measured cleared it on any of ${n} crowds.`
      : `${lead}the best standing order or press we found cleared it on ${String(reading.chosenClears)} of ${n} crowds.`;
  }
  const standingClears = reading.n - reading.standingMisses;
  return (
    `${lead}the tower’s standing order, left alone, cleared it on ${String(standingClears)} of ` +
    `${n} crowds we measured.`
  );
}

/** Whether a row's standing order misses often enough — DC-10's second half, with no breather exemption. */
function standingMissesEnough(row: WeekWayRow, census: WeekWay): boolean {
  const n = row.standingVerdicts.length;
  if (n === 0) return false;
  return dc10Of(row, census.protocol).standingMisses / n >= census.protocol.standingMissAtLeast;
}

/**
 * Which wrinkle a day of the week is dealt: the shipped draw, with no calendar over it. A test may
 * pass another dealing — the unwrinkled week S3 measured 4 of 5 on — and nothing shipped does.
 */
export type WeekDealing = (day: number, dayIdx: number, census: WeekWay) => string;

/** The shipped dealing — `calendar.ts#scheduledEventFor`, the expression every run is built from. */
const DEALT: WeekDealing = (day, dayIdx, census) =>
  scheduledEventFor(null, day, dayIdx, census.protocol.horizon).id;

function dealtDayOf(contractId: string, day: number, census: WeekWay, dealing: WeekDealing): DealtDay {
  const dayIdx = (day - 1) % 7;
  const horizon = census.protocol.horizon;
  const eventId = dealing(day, dayIdx, census);
  const found = weekWayRowFor(contractId, day, eventId, horizon, census);
  /* The day as it is dealt: a row measured without today's wrinkle describes a different day. */
  const row = found?.eventId === eventId ? found : undefined;
  let reason: DayStakeReason;
  if (row === undefined) reason = 'unmeasured';
  else {
    const reading = dc10Of(row, census.protocol);
    if (!reading.queueFeasible) reason = 'queue';
    else if (!reading.wayThrough) reason = 'no-way-through';
    else reason = standingMissesEnough(row, census) ? 'contested' : 'untouched';
  }
  return {
    day,
    dayIdx,
    eventId,
    counts: reason === 'contested',
    reason,
    row,
    sentence: sentenceFor(reason, row, census),
  };
}

/** The target for a count of counted days: minus one, at least one, and none for none. */
export function weekTargetFor(counted: number): number {
  return counted <= 0 ? 0 : Math.max(1, counted - 1);
}

const DEALS = new WeakMap<WeekWay, Map<string, WeekDeal | undefined>>();

/**
 * A contract's week as the census deals it, or `undefined` where the census has not measured the
 * tower at all — see the module docstring on what stays unchanged there.
 *
 * Measured means the census holds a current day-1 row for the tower: `weekWay.test.ts` requires
 * every measured tower to carry days 1 to 5 unwrinkled, so day 1 is the one row every measured
 * tower has.
 */
export function weekDealOf(
  contractId: string,
  census: WeekWay = WEEK_WAY,
  dealing: WeekDealing = DEALT,
): WeekDeal | undefined {
  if (dealing !== DEALT) return dealOf(contractId, census, dealing);
  let cache = DEALS.get(census);
  if (cache === undefined) {
    cache = new Map();
    DEALS.set(census, cache);
  }
  if (cache.has(contractId)) return cache.get(contractId);
  const deal = dealOf(contractId, census, dealing);
  cache.set(contractId, deal);
  return deal;
}

function dealOf(contractId: string, census: WeekWay, dealing: WeekDealing): WeekDeal | undefined {
  const measured =
    weekWayRowFor(contractId, 1, 'ordinary', census.protocol.horizon, census) !== undefined;
  let deal: WeekDeal | undefined;
  if (measured) {
    const days = Object.freeze(
      Array.from({ length: WEEK_LENGTH }, (_, index) => dealtDayOf(contractId, index + 1, census, dealing)),
    );
    const counted = days.filter((entry) => entry.counts).length;
    deal = Object.freeze({ contractId, days, counted, target: weekTargetFor(counted) });
  }
  return deal;
}

/**
 * What a week on this tower needs to clear its scenario: the census's derived target where the
 * census speaks, and the authored `needClean` everywhere else.
 */
export function weekNeedOf(contract: ScenarioContract, census: WeekWay = WEEK_WAY): number {
  return weekDealOf(contract.id, census)?.target ?? contract.needClean;
}

/**
 * Whether a closed day counts toward its week. Every clean day counts where the census does not
 * speak (as before); where it does, only a counted day **as it was dealt** — a day that drew some
 * other wrinkle (a calendar period over it, say) is not the day the census measured.
 */
export function dayCountsToward(
  contractId: string,
  outcome: Pick<DayOutcome, 'day' | 'eventId'>,
  census: WeekWay = WEEK_WAY,
): boolean {
  const deal = weekDealOf(contractId, census);
  if (deal === undefined) return true;
  const dealt = deal.days[outcome.day - 1];
  return dealt !== undefined && dealt.counts && dealt.eventId === outcome.eventId;
}

/**
 * **Whether the day about to run counts, in one sentence** — the brief's and the week strip's, or
 * `undefined` where the census does not speak or the week stands past its last day. A day that
 * drew some other wrinkle than the one it is dealt is not the day the census measured.
 */
export function dayStakeSentenceOf(
  contractId: string,
  day: number,
  eventId: string,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  const dealt = weekDealOf(contractId, census)?.days[day - 1];
  if (dealt === undefined) return undefined;
  return dealt.eventId === eventId ? dealt.sentence : DAY_UNMEASURED_SENTENCE;
}

/** Clean counted days in the week's history. */
export function countedCleanOf(week: Pick<WeekState, 'contractId' | 'history'>, census: WeekWay = WEEK_WAY): number {
  return week.history.filter((entry) => entry.allMet && dayCountsToward(week.contractId, entry, census)).length;
}

/**
 * **The week's target, as *k of N***, or `undefined` where the census does not speak. One line for
 * the brief and for the week strip, with the clean counted days so far.
 *
 * A week with no counted day draws {@link weekHeldReasonOf}'s sentence instead, and a week with one
 * names the day, because *1 of 1* alone does not say that six days of the week decide nothing
 * (swarm DM's ruling (a), [§ D1179](../../../../DECISIONS.md)).
 */
export function weekStakeLineOf(
  week: Pick<WeekState, 'contractId' | 'history'>,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  const deal = weekDealOf(week.contractId, census);
  if (deal === undefined) return undefined;
  if (deal.counted === 0) return weekHeldReasonOf(deal);
  const clean = countedCleanOf(week, census);
  const only = deal.counted === 1 ? deal.days.find((day) => day.counts) : undefined;
  if (only !== undefined) {
    return (
      `This week’s target: 1 of 1 counted day clean, and the one day that counts is ` +
      `${weekdayOf(only.dayIdx)}. ${String(clean)} so far.`
    );
  }
  return (
    `This week’s target: ${String(deal.target)} of ${String(deal.counted)} counted days clean. ` +
    `${String(clean)} so far.`
  );
}

/** The same absence, short enough for a banked line on the sheet, the beat and the rail's card. */
export const WEEK_WITHOUT_COUNTED_DAYS_SHORT = 'no day of this week counts toward a target';

/* -------------------------------------------------------------------------- *
 * A week that counts no day: its scenario is held — § D1179
 * -------------------------------------------------------------------------- */

/** Counts in words: the tower picker draws no digit, and a week has seven days. */
const COUNT_WORDS: readonly string[] = Object.freeze([
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
]);

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** `Monday`, `Monday and Friday`, `Monday, Tuesday and Friday`. */
function dayList(days: readonly DealtDay[]): string {
  const names = days.map((day) => weekdayOf(day.dayIdx));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * **Why a week that counts no day holds its scenario**, as one or two sentences — swarm DM's
 * ruling (a), [§ D1179](../../../../DECISIONS.md), S2's condition.
 *
 * It names the days the census **measured as dealt and refused** apart from the days it **has not
 * measured as dealt**, because the two are different claims: a refused day carries a count over
 * named crowds, and an unmeasured day carries nothing at all. So it never says *cannot*,
 * *unwinnable* or *found none* about a day nobody measured, and says *yet* wherever a day is still
 * unmeasured, since a census row that admits one lifts the hold ({@link weekOfferOf}). Where every
 * day was measured it says that, and says none counts, which is then a measurement.
 *
 * The per-day reason (why Monday does not count) is the day's own {@link DealtDay.sentence}; this
 * sentence is about the week and does not repeat seven of them.
 */
export function weekHeldReasonOf(deal: WeekDeal): string {
  const measured = deal.days.filter((day) => day.reason !== 'unmeasured');
  const unmeasured = deal.days.length - measured.length;
  const total = countWord(deal.days.length);
  if (unmeasured === 0) {
    return (
      'No day of this week counts toward a target, so its scenario is held back: all ' +
      `${total} days were measured as they are dealt, and none of them counts.`
    );
  }
  const lead = 'No day of this week counts toward a target yet, so its scenario is held back';
  if (measured.length === 0) {
    return `${lead}: none of its ${total} days has been measured as it is dealt.`;
  }
  const plural = measured.length > 1;
  const others = countWord(unmeasured);
  return (
    `${lead}. ${dayList(measured)} ${plural ? 'were' : 'was'} measured as ` +
    `${plural ? 'they are' : 'it is'} dealt and ${plural ? 'do' : 'does'} not count, and the other ` +
    `${others} ${unmeasured === 1 ? 'day has' : 'days have'} not been measured as ` +
    `${unmeasured === 1 ? 'it is' : 'they are'} dealt.`
  );
}

/** What a held scenario still is: nothing about the tower or its week is locked (§ D1129's footing). */
export const WEEK_HELD_NOTE =
  'Nothing is locked: the week is dealt and played, every day is graded, and the week closes on its ' +
  'sheet. The hold lifts when a day of it is measured as dealt and counts.';

/** What the hub draws for a census tower's scenario: offered, or held with its reason. */
export interface WeekOffer {
  readonly offer: 'offered' | 'held';
  /**
   * The line beside the scenario: the hold's reason and {@link WEEK_HELD_NOTE} where held; the one
   * day that counts where the week counts exactly one; `undefined` otherwise.
   */
  readonly line: string | undefined;
}

/**
 * **Whether a tower's scenario clear is offered, derived from its week** — swarm DM's ruling (a),
 * [§ D1179](../../../../DECISIONS.md), in the shape § D1129 holds a campaign stage: listed, with its
 * reason, and never called unwinnable.
 *
 * Held exactly when the census deals the week and counts no day of it; `undefined` where the census
 * does not speak for the tower (its week keeps `needClean`, and nothing about its offer changes).
 * Read on every call, so a census row that admits a day releases the hold on the commit that adds
 * it, with no edit here. **Only the offer to clear is held**: the tower stays pressable from the
 * picker and the Scenarios list, its week runs, and it closes on its sheet like any other.
 *
 * A week that counts one day stays offered at *1 of 1* (the ruling's clause 3, S2's no-clamp rule
 * recorded as the dissent) and its line says which day, because the target alone hides it.
 */
export function weekOfferOf(contractId: string, census: WeekWay = WEEK_WAY): WeekOffer | undefined {
  const deal = weekDealOf(contractId, census);
  if (deal === undefined) return undefined;
  if (deal.counted === 0) {
    return { offer: 'held', line: `${weekHeldReasonOf(deal)} ${WEEK_HELD_NOTE}` };
  }
  const only = deal.counted === 1 ? deal.days.find((day) => day.counts) : undefined;
  if (only === undefined) return { offer: 'offered', line: undefined };
  const name = weekdayOf(only.dayIdx);
  return {
    offer: 'offered',
    line: `One day of this week counts toward its target, ${name}, so the target is one clean ${name}.`,
  };
}

/**
 * Whether the week has closed: the census speaks for its tower and its last dealt day has been
 * filed. The sheet is drawn from here until the week rolls.
 */
export function weekHasClosed(
  week: Pick<WeekState, 'contractId' | 'day' | 'closedDay'>,
  census: WeekWay = WEEK_WAY,
): boolean {
  return weekDealOf(week.contractId, census) !== undefined && week.day >= WEEK_LENGTH && week.closedDay === week.day;
}

/**
 * Whether opening tomorrow rolls the week over: the census speaks for its tower and the week stands
 * on its last day or past it (a week saved by an older build may stand past day 7).
 */
export function weekRollsOver(week: Pick<WeekState, 'contractId' | 'day'>, census: WeekWay = WEEK_WAY): boolean {
  return weekDealOf(week.contractId, census) !== undefined && week.day >= WEEK_LENGTH;
}

/**
 * **Whether a week shows that days were played on it** — its history, or what a roll keeps.
 *
 * § D1177's roll empties the history (a week keyed by day number cannot hold two Mondays) and
 * keeps the streak and the best day. Every other path to an empty history (`openWeek`,
 * `takeContract`) zeroes both, and `closeDay` moves neither without appending a day, so a week with
 * no history and a best day or a streak above zero is a week that rolled over. The two first-visit
 * gates ask this rather than `history.length`, or the first Monday after a closed week would read
 * as a newcomer's first day and send a returning player to the landing page. One case it cannot
 * see: a closed week on which nobody was carried inside a minute on any day and the last day was
 * missed, which leaves both at zero; no whole day of a shipped tower has been measured there.
 */
export function daysWerePlayedOn(week: Pick<WeekState, 'history' | 'bestMinutePct' | 'streak'>): boolean {
  return week.history.length > 0 || week.bestMinutePct > 0 || week.streak > 0;
}

/* -------------------------------------------------------------------------- *
 * The house
 * -------------------------------------------------------------------------- */

/** How a counted day's house verdict is had. */
export type HouseNeed =
  /** The day ran the standing order untouched, so the day's own verdict is the house's, at no cost. */
  | 'own'
  /** One more run of the day's crowd under the standing order with nothing pressed. */
  | 'run'
  /** The day kept no record of its crowd, so the house cannot be run on it. */
  | 'unrecorded';

/** The standing order the census measured every tower's house against. */
export function houseStandingOrder(census: WeekWay = WEEK_WAY): string {
  return census.protocol.standingOrder;
}

/**
 * Whether a closed day's own run **is** the house's: the standing order, nothing pressed, no rule
 * rows, no car held out by the player. Anything else needs one more run on the same crowd.
 */
export function houseNeedOf(outcome: Pick<DayOutcome, 'record'>, census: WeekWay = WEEK_WAY): HouseNeed {
  const record = outcome.record;
  if (record === null) return 'unrecorded';
  return isHouseRecord(record, census) ? 'own' : 'run';
}

function isHouseRecord(record: WatchRecord, census: WeekWay): boolean {
  return (
    record.dispatcherId === houseStandingOrder(census) &&
    record.interventions.length === 0 &&
    record.ruleRows.length === 0 &&
    record.outOfServiceCarIds.length === 0
  );
}

/**
 * The record the house runs: the day's own crowd, building, day and window, under the standing
 * order with nothing pressed. Common random numbers by construction — the seed is the day's.
 */
export function houseRecordOf(record: WatchRecord, census: WeekWay = WEEK_WAY): WatchRecord {
  return {
    ...record,
    dispatcherId: houseStandingOrder(census),
    interventions: [],
    ruleRows: [],
    outOfServiceCarIds: [],
  };
}

/**
 * A house verdict on one counted day, as the sheet reads it. `'unrecorded'` is a day the house
 * could not be run on: no record of its crowd, a record this build cannot replay, or a run that
 * failed.
 */
export type HouseReading = 'cleared' | 'missed' | 'ungraded' | 'pending' | 'unrecorded';

/* -------------------------------------------------------------------------- *
 * The sheet
 * -------------------------------------------------------------------------- */

export type SheetVerdict = 'cleared' | 'missed' | 'ungraded' | 'not played';

export interface WeekSheetRow {
  /** `MON`. */
  readonly weekday: string;
  readonly day: number;
  readonly counts: boolean;
  readonly yours: SheetVerdict;
  /** `undefined` on a day that does not count: the house is asked only about counted days. */
  readonly house: HouseReading | undefined;
}

export interface WeekSheetView {
  readonly heading: string;
  /** *Your week: 2 of the 3 counted days clean.* */
  readonly yoursLine: string;
  /** *The tower's standing order, left alone on the same crowds, cleared 1.* */
  readonly houseLine: string;
  /** *Target 2: met.* */
  readonly targetLine: string;
  /** What the pair is and is not. */
  readonly note: string;
  /** What happens tomorrow. */
  readonly rollLine: string;
  readonly rows: readonly WeekSheetRow[];
  /** Your clean counted days, and the house's, as counts — the figures the two lines print. */
  readonly yours: number;
  readonly house: number;
  readonly counted: number;
  readonly target: number;
}

export const WEEK_SHEET_HEADING = 'THE WEEK, CLOSED';

/** § D1177's scope sentence: a tally over these crowds, never a ranking. */
export const WEEK_SHEET_NOTE =
  'A tally over the crowds you played this week, with the same passengers on both sides. It is not ' +
  'a ranking of dispatchers: one crowd a day says nothing about which drives better.';

/**
 * What the day report's *what this taught* says on the day a week closes — § D1177. The sheet is
 * the week screen's; the report says where it is rather than drawing it twice.
 */
export const WEEK_CLOSED_LINE =
  'This week has closed. Its sheet, with the tower’s standing order beside you on the same crowds, ' +
  'is on Your week, and tomorrow opens a new week on this tower.';

export const WEEK_SHEET_ROLL_LINE =
  'Tomorrow opens a new week on this tower, counted from zero. Nothing is locked, and a scenario ' +
  'you have cleared stays cleared.';

function verdictOfOutcome(outcome: DayOutcome): 'cleared' | 'missed' | 'ungraded' {
  const graded = outcome.readings.length > 0 && outcome.readings.every((reading) => reading.state !== 'pending');
  if (!graded) return 'ungraded';
  return outcome.allMet ? 'cleared' : 'missed';
}

/**
 * **The week's sheet at its close**, or `undefined` before the week has closed or where the census
 * does not speak. `houseOf` answers the house's reading on a counted day that needed a run; a day
 * whose own run was the house's is read off the day, at no cost.
 */
export function weekSheetOf(
  week: WeekState,
  houseOf: (day: number) => HouseReading | undefined,
  census: WeekWay = WEEK_WAY,
): WeekSheetView | undefined {
  const deal = weekDealOf(week.contractId, census);
  if (deal === undefined || !weekHasClosed(week, census)) return undefined;
  const byDay = new Map(week.history.map((entry) => [entry.day, entry]));
  const rows: WeekSheetRow[] = deal.days.map((dealt) => {
    const outcome = byDay.get(dealt.day);
    const counts = outcome === undefined ? dealt.counts : dayCountsToward(week.contractId, outcome, census);
    let house: HouseReading | undefined;
    if (counts) {
      if (outcome === undefined) house = undefined;
      else {
        const need = houseNeedOf(outcome, census);
        house =
          need === 'own'
            ? verdictOfOutcome(outcome)
            : need === 'unrecorded'
              ? 'unrecorded'
              : (houseOf(dealt.day) ?? 'pending');
      }
    }
    return {
      weekday: weekdayOf(dealt.dayIdx).slice(0, 3).toUpperCase(),
      day: dealt.day,
      counts,
      yours: outcome === undefined ? 'not played' : verdictOfOutcome(outcome),
      house,
    };
  });
  const countedRows = rows.filter((row) => row.counts);
  const yours = countedRows.filter((row) => row.yours === 'cleared').length;
  const house = countedRows.filter((row) => row.house === 'cleared').length;
  const pending = countedRows.filter((row) => row.house === 'pending').length;
  const unrecorded = countedRows.filter((row) => row.house === 'unrecorded' || row.house === undefined).length;
  const counted = countedRows.length;
  const houseLine =
    pending > 0
      ? 'The tower’s standing order, left alone on the same crowds: still being run.'
      : unrecorded > 0
        ? `The tower’s standing order, left alone on the same crowds, cleared ${String(house)} of the ` +
          `${String(counted - unrecorded)} it could be run on; ${String(unrecorded)} could not be run on ${unrecorded === 1 ? 'its' : 'their'} own crowd.`
        : `The tower’s standing order, left alone on the same crowds, cleared ${String(house)}.`;
  return {
    heading: WEEK_SHEET_HEADING,
    yoursLine:
      counted === 0
        ? 'Your week: no day of it counted toward a target.'
        : `Your week: ${String(yours)} of the ${String(counted)} counted days clean.`,
    houseLine,
    targetLine:
      deal.target === 0
        ? 'This week had no target.'
        : `Target ${String(deal.target)}: ${yours >= deal.target ? 'met' : 'not met'}.`,
    note: WEEK_SHEET_NOTE,
    rollLine: WEEK_SHEET_ROLL_LINE,
    rows: Object.freeze(rows),
    yours,
    house,
    counted,
    target: deal.target,
  };
}

/* -------------------------------------------------------------------------- *
 * A newcomer's first week
 * -------------------------------------------------------------------------- */

/**
 * **Whether a tower's week is one a newcomer may be dealt** — [§ D1178](../../../../DECISIONS.md).
 *
 * Its day 1 counts (the first day a newcomer plays is contested) and its week has room for one
 * miss (the target is below the counted days). Both are read off {@link weekDealOf}; nothing is
 * typed. On the shipped census that is Midtown Office alone: Harbour Point counts day 1 and nothing
 * else, so its target is one of one, and Secure Tower counts no day.
 */
export function weekAdmitsANewcomer(contractId: string, census: WeekWay = WEEK_WAY): boolean {
  const deal = weekDealOf(contractId, census);
  return deal !== undefined && deal.days[0]?.counts === true && deal.target < deal.counted;
}

