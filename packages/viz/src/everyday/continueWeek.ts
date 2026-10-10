/**
 * **Continue your week** — the mode picker's entry back into a week under way. Wave AL, lane AL-F,
 * swarm DN's Q2.4 ([§ D1228](../../../../DECISIONS.md)).
 *
 * The post-AK panel's seat A: a returning player met four tiles and no sign that a week was
 * standing, and reached it through *Scenario*, then the hub, then *Today's scenario*. This is one
 * entry above the tiles, drawn exactly while a Scenario week is under way, and derived on every
 * draw from the week the session restored, so nothing is stored for it (§ 3.5). It is not an entry
 * screen: the page still opens on the picker, and the entry is one press on it.
 *
 * It says what it knows and nothing it does not: the tower, the day the week stands on, and the
 * clean counted days so far against the target where the week census speaks. A week whose last
 * day is closed and not yet rolled opens its sheet, which is where that week is standing.
 */

import { contractById } from '../shift/contracts.js';
import { countedCleanOf, daysWerePlayedOn, weekDealOf, weekHasClosed, weekOrdinalOf } from '../shift/weekStake.js';
import { weekdayOf, type WeekState } from '../shift/types.js';

/** The entry, as words and a destination. */
export interface ContinueWeekEntry {
  /** `Continue your week`. */
  readonly title: string;
  /** `Midtown Office, Wednesday · 2 of the 4 clean counted days the target asks for, so far`. */
  readonly line: string;
  /** The front door for a day to play; the week's sheet for a week that has closed. */
  readonly goes: 'door' | 'week';
}

export const CONTINUE_WEEK_TITLE = 'Continue your week';

/**
 * The entry, or `undefined` where there is no week under way: a week on no scenario, or a first
 * week with no day filed yet (its first day is what *Scenario* already opens).
 *
 * **A first week is under way once its first day is begun** — wave AO, lane AO-2,
 * [§ D1369](../../../../DECISIONS.md), the post-AN panel's seat D (D4). A fresh player who started
 * the pinned Monday and reloaded found no entry until a day was filed, because the guard below read
 * the week's history and an attempt files nothing until it closes; so the way back to a day they had
 * begun was *Scenario*, *Play today's scenario*, *Set up today* and *Resume*. `dayBegun` is
 * `host.dayAttempt() !== undefined`, and with it the week is offered and the line says the day is
 * under way.
 *
 * **A later week is under way from its first morning** — wave AN, lane AN-7, carried from the
 * post-AL panel and found again by the post-AM panel's seats B and D. *Start next week* rolls the
 * week (§ D1177's roll empties its history), so the week a returning player had just begun drew no
 * entry until a day of it was filed, and the picker showed only the mode tiles. A week numbered past
 * the first is one the player chose to carry on, so it is offered with nothing filed.
 */
export function continueWeekEntryOf(
  week: WeekState,
  towerName: string,
  dayBegun = false,
): ContinueWeekEntry | undefined {
  if (contractById(week.contractId) === undefined) return undefined;
  /*
   * **And a week dealt again is under way from its first morning too** — wave AN, lane DQ-2
   * ([§ D1344](../../../../DECISIONS.md)): a week that was not held rolls to its own order again,
   * keeping its number, so a week 1 played again has nothing filed and is still one the player chose
   * to carry on. `daysWerePlayedOn` is the roll's own mark (the streak or the best day it keeps).
   */
  if (!dayBegun && week.history.length === 0 && week.week <= 1 && !daysWerePlayedOn(week)) return undefined;
  /* `Midtown Office, week 2` where the week has a number (§ D1252), the tower alone where it does not. */
  const ordinal = weekOrdinalOf(week);
  const tower = ordinal === undefined ? towerName : `${towerName}, ${ordinal}`;
  if (weekHasClosed(week)) {
    return {
      title: CONTINUE_WEEK_TITLE,
      line: `${tower}: the week has closed, and its sheet beside the house is standing`,
      goes: 'week',
    };
  }
  const deal = weekDealOf(week);
  const tally =
    deal === undefined || deal.target === 0
      ? ''
      : ` · ${String(countedCleanOf(week))} of the ${String(deal.target)} clean counted days the target asks for, so far`;
  /* A day closed and not yet advanced from: the week stands on it, and the next is what waits. */
  const standing =
    week.closedDay === week.day
      ? `${weekdayOf(week.dayIdx)} filed, ${weekdayOf(week.dayIdx + 1)} next`
      : dayBegun
        ? `${weekdayOf(week.dayIdx)} under way`
        : weekdayOf(week.dayIdx);
  return {
    title: CONTINUE_WEEK_TITLE,
    line: `${tower}, ${standing}${tally}`,
    goes: 'door',
  };
}
