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
import { countedCleanOf, weekDealOf, weekHasClosed } from '../shift/weekStake.js';
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
 * The entry, or `undefined` where there is no week under way: a week on no scenario, or one with no
 * day filed yet (its first day is what *Scenario* already opens).
 */
export function continueWeekEntryOf(week: WeekState, towerName: string): ContinueWeekEntry | undefined {
  if (contractById(week.contractId) === undefined) return undefined;
  if (week.history.length === 0) return undefined;
  if (weekHasClosed(week)) {
    return {
      title: CONTINUE_WEEK_TITLE,
      line: `${towerName}: the week has closed, and its sheet beside the house is standing`,
      goes: 'week',
    };
  }
  const deal = weekDealOf(week.contractId);
  const tally =
    deal === undefined || deal.target === 0
      ? ''
      : ` · ${String(countedCleanOf(week))} of the ${String(deal.target)} clean counted days the target asks for, so far`;
  /* A day closed and not yet advanced from: the week stands on it, and the next is what waits. */
  const standing =
    week.closedDay === week.day
      ? `${weekdayOf(week.dayIdx)} filed, ${weekdayOf(week.dayIdx + 1)} next`
      : weekdayOf(week.dayIdx);
  return {
    title: CONTINUE_WEEK_TITLE,
    line: `${towerName}, ${standing}${tally}`,
    goes: 'door',
  };
}
