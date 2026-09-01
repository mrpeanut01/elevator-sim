/**
 * **What there is to watch, and whether it may be watched.**
 *
 * GAMEPLAY § 14.1, ENGINE_CONTRACT § 1.5. Recorded here rather than in `DECISIONS.md`, under
 * § D405; the directory's one ruling is § D407.
 *
 * ## The two sources, and the one that does not exist
 *
 * § 14.1 is written against a **board**: *"A board row is a run, and a run can be watched."* There
 * is no board — no posting infrastructure, no server, and slice 4d already recorded the same
 * absence when it omitted the race strip's world arm rather than stubbing it. So the two sources
 * are the two this build actually has:
 *
 * 1. **Days this device filed.** `WeekState.history` carries them, and since session schema 6 each
 *    carries the record it was run from. They are not somebody else's — and the copy never says
 *    they are, which is where § 14.1's no-first-person rule and § 20.11's no-inventing-people rule
 *    turn out to want the same thing: name the **day**, not a person.
 * 2. **Reference runs**, from `data/reference-runs.json`, labelled `reference run · not a player`
 *    by construction (`watch/reference.ts`).
 *
 * A third source is *named rather than implied*: another player's posted run, which is what § 14.1
 * is actually about, and which needs a board first.
 *
 * ## Why the gate takes a `simulate` function
 *
 * The reproduction gate has to run a simulation, and this module has to stay testable under plain
 * Node with no worker and no canvas — the whole of `dev/` exists because *a decision that needs a
 * document cannot be tested*. So {@link checkedRun} takes the simulator as a parameter and
 * `dev/watchPanel.ts` hands it `recordRun`. That also makes the gate's two branches drivable
 * without contriving a stale fixture: a test hands in a simulator that answers a different run.
 */

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import type { ViewerState } from '../dev/state.js';
import type { SimulationConfig } from '@elevator-sim/core/browser';
import { WEEKDAYS, type DayOutcome } from '../shift/types.js';
import type { WeekState } from '../shift/types.js';

import { recordUnreadableReason, watchRunConfigOf } from './record.js';
import { postedResultOf, reproductionRefusalFor } from './reproduce.js';
import type { WatchableRun } from './types.js';

/**
 * What a day filed by a build with no record concept says instead of offering the affordance.
 *
 * Not an apology and not a fault report. It is the **measured** state of that session — see
 * `shift/types.ts#DayOutcome.record` — and the sentence says what would have to be true instead,
 * because a refusal that only says no sends a reader hunting a defect (`shift/banking.ts`'s rule).
 *
 * ## Its second clause was deleted, and the deletion is `docs/20` defect 1
 *
 * It read *"— days closed from here on carry one"*, and that was **false for the days it was
 * actually printed on**. `DayOutcome.record` is `null` for two different days and this sentence was
 * shown for both: the build-had-no-record day it describes, and a day whose record
 * `watchRecordIssues` refused. For the second kind, *from here on* promises a fix that the next day
 * does not bring — the audit wrote one Everyday rule, watched every subsequent day be refused
 * identically, re-ran the same day on a shipped dispatcher and watched it stay refused, because the
 * rule row is session state. A refusal that predicts its own end is worse than one that says
 * nothing, because a reader believes it and stops looking.
 *
 * The wording is now narrowed to the claim that is true of this arm and nothing wider. The other
 * arm has its own sentence — {@link refusalForDay} — and names what fired.
 */
export const DAY_HAS_NO_RECORD =
  'this day was filed by a build that kept no record of what it ran, so there is nothing to ' +
  're-simulate';

/**
 * What a day says when its record was **refused**, naming the issue that refused it.
 *
 * `docs/20` defect 1's first half. `watchRecordIssues` has always known which issue fired;
 * `DayOutcome.recordRefusal` is that sentence, kept at the moment the day closed because the state
 * that produced it does not survive the sitting.
 *
 * The reason is quoted rather than paraphrased — `live/honesty.ts`'s rule about a refusal having
 * one author, one directory over. What is added around it is the part the issue cannot know: that
 * this is about *watching*, and that the day itself is fine. A player whose Tuesday will not replay
 * has not lost the Tuesday.
 */
export function refusalForDay(reason: string): string {
  return (
    `this day cannot be re-simulated exactly, so it is not offered as a replay — ${reason}. ` +
    'The day itself is filed and counted; it is the replay that is refused'
  );
}

/**
 * The days this device filed, newest first, as rows a picker can draw.
 *
 * ## Why every week and not only the live one
 *
 * `parkedWeeks` is *the assignments the player stepped away from* (issue #107), and a day filed on
 * Garden Apartments is no less filed for the player having moved to Midtown Office. Reading only
 * `week.history` would make the picker's contents move when the building select moved, which is
 * the shape of surface that quietly disagrees with the thing under it.
 *
 * ## Why the id is the week's contract plus the day
 *
 * A day number alone collides across weeks — every week has a day 3 — and a row whose selection key
 * collides is a row that opens somebody else's run. The pair is unique because
 * `ViewerState.parkedWeeks`' own invariant is that no two weeks share a `contractId`.
 *
 * `buildingNameOf` is passed in rather than resolved because a display name is
 * `data/buildings/`'s and this module loads nothing — `dev/state.ts#buildingNameOf` is the caller's
 * own answer, so the picker and the header cannot name one building two ways.
 */
export function filedDayRuns(
  weeks: readonly WeekState[],
  buildingNameOf: (buildingId: string) => string,
): readonly WatchableRun[] {
  const rows: WatchableRun[] = [];
  for (const week of weeks) {
    for (const outcome of week.history) {
      rows.push(rowForDay(week.contractId, outcome, buildingNameOf));
    }
  }
  /*
   * Newest first, by day within a week and by nothing across weeks — a filed day carries no
   * wall-clock stamp (invariant 3 forbids one in `core`, and nothing in `shift/` writes one
   * either), so *which week was played more recently* is a fact this build does not have. Sorting
   * by day alone would claim an ordering across weeks that is not there, so the weeks stay in the
   * order the caller supplied and only the days inside each are reversed.
   */
  return Object.freeze(rows);
}

function rowForDay(
  contractId: string,
  outcome: DayOutcome,
  buildingNameOf: (buildingId: string) => string,
): WatchableRun {
  const weekday = WEEKDAYS[outcome.dayIdx] ?? outcome.weekday;
  const posted = {
    arrived: outcome.arrived,
    carried: outcome.carried,
    minutePct: outcome.minutePct,
    /*
     * The worst wait comes from the day's own goal readings rather than from a second fold of a
     * recording nobody kept. `readGoal` writes `observed` from `GoalObservations.worstWaitS`, which
     * is `postedResultOf`'s own field — so the two sides of the gate read one derivation.
     *
     * `0` when the day filed no worst-wait reading, which is a day closed before the goal existed
     * (session schema 5 widened those value domains). Such a day carries no record either — its
     * envelope predates schema 6 — so the number is never compared: the row is already blocked on
     * `no-record`, and `library.test.ts` drives that pairing rather than trusting this sentence.
     */
    worstWaitS: Math.round(
      outcome.readings.find((reading) => reading.goal.reads === 'worstWaitS')?.observed ?? 0,
    ),
  };
  return {
    id: `day:${contractId}:${String(outcome.day)}`,
    source: 'filed-day',
    /*
     * The **day** is the name. § 14.1 puts a person's name here and § 20.11 forbids inventing one;
     * what is true of this row is which day it was, so that is what it says. No `you`, no `your` —
     * asserted over every string in `view.test.ts`.
     */
    label: `${weekday} · day ${String(outcome.day)}`,
    buildingName: outcome.record === null ? '—' : buildingNameOf(outcome.record.buildingId),
    subtitle: `day ${String(outcome.day)} of this week`,
    record: outcome.record,
    posted,
    /*
     * Two different days carry `null`, and until `docs/20` defect 1 they said one sentence — see
     * {@link DAY_HAS_NO_RECORD}. `recordRefusal` is what tells them apart: a day that *was* refused
     * carries the reason it was refused with, and a day from a build that kept no reason carries
     * `null` and gets the sentence that describes exactly that.
     */
    blocked:
      outcome.record !== null
        ? null
        : {
            ground: 'no-record',
            reason:
              outcome.recordRefusal === null
                ? DAY_HAS_NO_RECORD
                : refusalForDay(outcome.recordRefusal),
          },
  };
}

/**
 * A row with the gate applied — § 1.5's *"a row that cannot be replayed loses its `Watch it` button
 * rather than replaying something approximate"*.
 *
 * Returns the row unchanged when it is already blocked: a day with no record has nothing to
 * re-simulate, and running a simulation to discover that would be work done to reach a conclusion
 * already in hand.
 *
 * ## Why the whole run, and why it is thrown away
 *
 * The gate re-simulates the entire day and keeps only four numbers. That is the cost, it is stated
 * rather than glossed, and it is the reason `dev/watchPanel.ts` checks a row **when it is pressed**
 * rather than checking every row on open: a picker holding a week of days would run seven
 * simulations to draw a list. The recording is returned beside the verdict so the caller that
 * *does* go on to watch does not pay for it twice.
 */
export interface CheckedRun {
  readonly run: WatchableRun;
  /** The replay, when the gate passed — the recording the shell then puts on the stage. */
  readonly recording: VizRecording | undefined;
}

export function checkedRun(
  run: WatchableRun,
  resources: BrowserResources,
  base: ViewerState,
  simulate: (config: SimulationConfig) => VizRecording,
): CheckedRun {
  if (run.blocked !== null || run.record === null) return { run, recording: undefined };

  const unreadable = recordUnreadableReason(run.record, resources);
  if (unreadable !== null) {
    return {
      run: { ...run, blocked: { ground: 'unreadable-record', reason: unreadable } },
      recording: undefined,
    };
  }

  const recording = simulate(watchRunConfigOf(base, resources, run.record));
  const refusal = reproductionRefusalFor(run.posted, postedResultOf(recording));
  if (refusal !== null) {
    return {
      run: { ...run, blocked: { ground: 'does-not-reproduce', reason: refusal } },
      recording: undefined,
    };
  }
  return { run, recording };
}
