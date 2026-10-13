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
 * clean counted days so far against the target where the week census speaks.
 *
 * **One press to the moment the player left** — wave AO, lane AO-4, the post-AN panel's seat B
 * (lost moments 7 and 8, defect 1), [§ D1384](../../../../DECISIONS.md). The entry used to open the
 * front door whatever the week was doing, so a day left at a call was three presses away (the door,
 * *Set up today*, *Resume*), and a day already closed opened on yesterday's door with *Open the doors
 * on Tuesday* as its primary. It now goes where the door's own primary would have taken the player:
 *
 * - **an attempt standing on the day** → the stage, resumed as the brief's *Resume ⟨day⟩* resumes it;
 * - **today closed and banked** → tomorrow's brief, by the door's own *Open the doors on ⟨day⟩* press;
 * - **a day not yet started** → today's brief, which is where *Set up today* goes;
 * - **a week whose last day is closed and not yet rolled** → its sheet, where that week is standing.
 *
 * The front door stays one rail press away from all four.
 */

import { contractById } from '../shift/contracts.js';
import { countedCleanOf, daysWerePlayedOn, weekDealOf, weekHasClosed, weekOrdinalOf } from '../shift/weekStake.js';
import { weekdayOf, type WeekState } from '../shift/types.js';

import { todayIsBanked } from './doorView.js';

/** The entry, as words and a destination. */
export interface ContinueWeekEntry {
  /** `Continue your week`. */
  readonly title: string;
  /** `Midtown Office, Wednesday · 2 of the 4 clean counted days the target asks for, so far`. */
  readonly line: string;
  /**
   * Where the press goes — [§ D1384](../../../../DECISIONS.md): the stage for a day left part-way,
   * tomorrow's brief for a day closed and banked, today's brief for a day not yet started, and the
   * week's sheet for a week that has closed.
   */
  readonly goes: ContinueWeekGoes;
}

/** {@link ContinueWeekEntry.goes}. */
export type ContinueWeekGoes = 'stage' | 'tomorrow' | 'brief' | 'week';

/**
 * The attempt standing on the week's day, as the entry needs it — `everyday/host.ts#dayAttempt`.
 * `clock` is the furthest instant the stage had shown of it, on the run's own clock, which is where
 * the stage reopens (`shift/attempt.ts#attemptResumeAtS`).
 */
export interface ContinueWeekAttempt {
  readonly clock: string;
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
  attempt?: ContinueWeekAttempt,
): ContinueWeekEntry | undefined {
  if (contractById(week.contractId) === undefined) return undefined;
  const deal = weekDealOf(week);
  const tally =
    deal === undefined || deal.target === 0
      ? ''
      : ` · ${String(countedCleanOf(week))} of the ${String(deal.target)} clean counted days the target asks for, so far`;
  /* `Midtown Office, week 2` where the week has a number (§ D1252), the tower alone where it does not. */
  const ordinal = weekOrdinalOf(week);
  const tower = ordinal === undefined ? towerName : `${towerName}, ${ordinal}`;
  /*
   * **An attempt standing on the day is under way, whatever the history holds** — § D1384. It is the
   * one run of that day the week can bank (§ D1218), so a player who left it, on the first day of a
   * week as on any other, is offered it back at the instant they left. Checked before the
   * nothing-filed rule below, which would otherwise hide a first day left part-way.
   */
  if (attempt !== undefined && !weekHasClosed(week)) {
    return {
      title: CONTINUE_WEEK_TITLE,
      line: `${tower}, ${weekdayOf(week.dayIdx)}, left at ${attempt.clock}${tally}`,
      goes: 'stage',
    };
  }
  /*
   * **And a week dealt again is under way from its first morning too** — wave AN, lane DQ-2
   * ([§ D1344](../../../../DECISIONS.md)): a week that was not held rolls to its own order again,
   * keeping its number, so a week 1 played again has nothing filed and is still one the player chose
   * to carry on. `daysWerePlayedOn` is the roll's own mark (the streak or the best day it keeps).
   */
  if (week.history.length === 0 && week.week <= 1 && !daysWerePlayedOn(week)) return undefined;
  if (weekHasClosed(week)) {
    return {
      title: CONTINUE_WEEK_TITLE,
      /* No house beside a week the census does not deal (§ D1394, wave AO), so the line does not claim one. */
      line:
        weekDealOf(week) === undefined
          ? `${tower}: the week has closed, and its sheet is standing`
          : `${tower}: the week has closed, and its sheet beside the house is standing`,
      goes: 'week',
    };
  }
  /*
   * A day closed and not yet advanced from: the week stands on it, and the next is what waits. Read
   * off the history, as the door's *Open the doors on ⟨day⟩* reads it (`doorView.ts#todayIsBanked`,
   * § D1142), so the entry goes on to tomorrow exactly where the door would.
   */
  const banked = todayIsBanked({ week });
  const standing = banked ? `${weekdayOf(week.dayIdx)} filed, ${weekdayOf(week.dayIdx + 1)} next` : weekdayOf(week.dayIdx);
  return {
    title: CONTINUE_WEEK_TITLE,
    line: `${tower}, ${standing}${tally}`,
    goes: banked ? 'tomorrow' : 'brief',
  };
}
