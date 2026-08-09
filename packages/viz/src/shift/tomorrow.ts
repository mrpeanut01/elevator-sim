/**
 * The between-day beat — GitHub issue #91, *"the inter-day loop is invisible"*.
 *
 * A decision number is **owed** for this module; the argument is here rather than in
 * `DECISIONS.md`, and the two halves that matter to a reviewer are *what already existed* and
 * *what this may not say*.
 *
 * ## Issue #91 is half refuted, and the refuted half is the useful half
 *
 * #91 asks for a *Tomorrow* screen, a growth reveal and a week arc, and says none of the three
 * exists. Traced at HEAD before a line was written:
 *
 * | #91 asks for | what shipped already |
 * |---|---|
 * | *"no Tomorrow screen"* | `dev/reportPanel.ts`'s **Tomorrow card** — `ForecastView`, `#report-forecast-*` — plus `Open the doors on <weekday>`, which advances the day and runs it |
 * | *"a week-view strip, one column per day"* | `dev/leftRail.ts#historyBarsOf` — the seven-day sparkline, `WeekState.history`, drawn on every render since the rail landed |
 * | *"11 % more tenants arrive"* | `shift/growth.ts#grownBuilding`, a **real edit to a real `BuildingConfig`** put back through `parseBuilding`/`resolveBuilding`; `shift/report.ts#forecastFor` already prints the true per-day figure rather than the design's flat 11 % |
 * | *"a between-day configuration window"* | `viewer.calendar` and `viewer.commissioning` are **`between-games`** in `scope/surface.ts`, and `viewer.week` is **`between-days`** — the window is a declared scope with a probe on it |
 *
 * So the loop is **invisible rather than absent**, which is the shape this repository keeps
 * finding. What was genuinely missing is one thing: the card names *tomorrow's event* and a
 * *percentage*, and says nothing at all about **what changed overnight**. A player reads
 * `+8.3% more tenants than today` over a header that goes `4 887 tenants` → `5 424 tenants`
 * between two runs, with nothing joining the two.
 *
 * This module is that join, and it is deliberately **not** a second growth model, a second
 * sparkline or a second verdict.
 *
 * ## Every number here is a fact somebody else measured
 *
 * There is no `growthFactor` call in this file and there must not be. The population figures are
 * the **`ResolvedBuilding.totalPopulation` of the two buildings the two runs actually resolve
 * to** — today's from the run just filed, tomorrow's from `dev/state.ts#tomorrowFactsOf`, which
 * builds tomorrow through `shiftRunConfigOf` itself. That is the difference between a reveal and
 * a caption: `growth.ts`'s own docstring names *"a growth factor that only reached the tenant
 * count in the header"* as a lying seam, and a beat that multiplied today's header by 1.11 would
 * be exactly that seam with a nicer layout.
 *
 * It also makes the reveal true when growth is **not** the only thing moving. A calendar period
 * scales the same floors (`shift/calendar.ts`), and a commissioned bank changes the fabric under
 * both — so the delta this module prints is *what actually changed*, not *what growth would have
 * changed on its own*. A `1 + 0.11 × (day − 1)` in this file would silently disagree with the run
 * on any vacation week.
 *
 * ## What it may not say, and why each refusal is here rather than in a reviewer's head
 *
 * 1. **No mean, no percentile, no time-to-destination.** Not one figure on this beat comes from
 *    `VizSummary`. Every quantity is either a count folded at `endedAt` ({@link DayOutcome}) or a
 *    population read off a `BuildingConfig`. So there is no figure here that `awtIsValid` could
 *    have suppressed, and therefore no path by which this surface can publish a mean the same run
 *    refuses (CLAUDE.md § *Statistical discipline*, `docs/10` R9).
 * 2. **No conservation claim.** {@link DayOutcome} carries `arrived` and `carried` and **not**
 *    `abandoned` or `accessRefused` — `record/recordRun.ts#describeSummary` copies three of five
 *    conservation fields, so the viz layer structurally cannot see the other two (ledger finding
 *    N-2). A progression line saying *"you served fewer people"* would therefore be folding an
 *    abandonment it cannot see into a wait it is not reporting, which is the defect
 *    [§ D266](../../../../DECISIONS.md) and [§ D106](../../../../DECISIONS.md) both exist to
 *    prevent. So the day's counts are printed as *what they are* — legs offered and legs
 *    carried — and the difference between them is **never named as an outcome**.
 * 3. **The streak is the one the week holds.** {@link TomorrowInput.week} is the week *after*
 *    `closeDay` has run, so `week.streak` is already the arithmetic `week.ts` did, including
 *    § D234's rule that an ungraded day costs nothing. Nothing is recomputed here; the row states
 *    the number and names which of the three things happened to it, keyed off the same
 *    `allMet`/`wasGraded` pair `closeDay` branched on.
 * 4. **No whole-run figure at a playhead short of `endedAt`.** The beat is built by `closeShift`,
 *    which folds observations at `recording.endedAt`, and every value it holds is fixed at that
 *    instant — nothing here reads a playhead, so there is no playhead at which it could be
 *    early ([§ D307](../../../../DECISIONS.md)'s seventh property, R6 / § D223).
 *
 * ## § D299: this is Casual's beat and it may not make Engineer say less
 *
 * It adds rows and removes none: the verdict, the figure grid, the goals, the diagnosis, the
 * levers and the small print are untouched, and the two population figures are **absolute counts
 * with their basis on them** rather than a grade. *Put the basis on the figure* is § D299's own
 * example of an in-scope Engineer change.
 */

import {
  weekdayOf,
  type DayOutcome,
  type ScenarioContract,
  type WeekState,
} from './types.js';

/**
 * One row of the beat: an eyebrow, a value, and the line that says what the value is *of*.
 *
 * `note` is not optional, for {@link ReportFigure}'s reason one layer up — every value on this
 * surface is a claim, and a claim with no basis under it is the thing this repository has now
 * corrected in seven places at once.
 */
export interface TomorrowRow {
  readonly id: string;
  /** The eyebrow, upper case where the sheet draws it. */
  readonly label: string;
  /** The figure or the phrase. Never empty, and never a stand-in `0`. */
  readonly value: string;
  /** What it is a figure of — the basis, the denominator, or the refusal. Never empty. */
  readonly note: string;
}

/** Which of the three questions a group answers. Exhaustive; a fourth is a compile error. */
export type TomorrowGroupId = 'closed' | 'changed' | 'next';

/**
 * One of the three questions, with its answer.
 *
 * The caption is **here rather than in the panel**, with every other word this beat says, so that
 * one adapter in `honesty/surfaces.ts` sweeps the whole surface. A caption authored in the mount
 * would be a player-facing string in a module the search reaches only through the view it returns,
 * which is how issue #127's block escaped the corpus.
 */
export interface TomorrowGroup {
  readonly id: TomorrowGroupId;
  /** The question, as a reader would ask it — *What just happened*. */
  readonly caption: string;
  /** Never empty: a group with nothing to say is omitted rather than drawn over a hole. */
  readonly rows: readonly TomorrowRow[];
}

/**
 * The three questions the beat answers, kept apart so a surface cannot silently merge them.
 *
 * Three groups rather than one list because they have three different warrants: `closed` is an
 * account of a run that has ended, `changed` is a difference between two building documents, and
 * `next` is a schedule. A single flat list would let a renderer put a fact about a day that has not
 * happened beside a count from one that has.
 */
export interface TomorrowBriefing {
  /** `Monday is banked. Tuesday opens.` — names both days and claims nothing about either. */
  readonly headline: string;
  /** The questions that have an answer, in the order a reader asks them. Empty groups are dropped. */
  readonly groups: readonly TomorrowGroup[];
  /**
   * Anything tomorrow's configuration refused, verbatim from `shiftRunConfigOf`.
   *
   * Carried rather than swallowed, on `ShiftRunConfig.withheld`'s own footing: a period whose
   * template the shift is too short for is a fact about tomorrow, and a beat that promised the
   * period and dropped the refusal would be promising a day the run will not deliver.
   */
  readonly withheld: readonly string[];
}

/** Everything the beat needs. Every field is measured by somebody else and copied here. */
export interface TomorrowInput {
  /**
   * The day that just closed, or `null` when no day has been.
   *
   * This is `WeekState.history`'s last entry — the same {@link DayOutcome} `closeDay` banked, not
   * a re-reading of the recording. *Carried from the report rather than recomputed* is the
   * requirement, and `outcomeOf` is where the day became a value.
   */
  readonly closed: DayOutcome | null;
  /** The week **after** `closeDay`, so `streak` and `cleanRun` are the ones it produced. */
  readonly week: WeekState;
  /** The contract the week is on, or `undefined` on the sandbox and the endless week. */
  readonly contract: ScenarioContract | undefined;
  /**
   * The verdict `shift/report.ts` filed for the closed day.
   *
   * Passed in rather than derived from {@link closed}, and that is the whole of *carried from the
   * Day report*: `dayReportOf` computes one verdict and `docs/17` § 5 clause 1's finding is that
   * a second computation of the same judgement disagrees with the first on shipped runs (issue
   * #53 — *"A day it could handle"* over *"Shift missed"*). Deriving it here from `allMet` would
   * be a third.
   *
   * `null` when no day has closed, which is the same case {@link closed} is `null` in.
   */
  readonly verdict: 'cleared' | 'missed' | 'ungraded' | null;
  /**
   * People in the building the run just filed actually used — `ResolvedBuilding.totalPopulation`.
   *
   * Not `BuildingConfig.totalPopulation`: `core` uses the **floor sum** and warns when a declared
   * total disagrees with it, so the resolved figure is the one the kernel counted arrivals
   * against.
   */
  readonly populationToday: number;
  /** The same figure for the building tomorrow's run will resolve to. See the module docstring. */
  readonly populationTomorrow: number;
  /** `shiftRunConfigOf`'s own caption for tomorrow, or `''` when the week is under no period. */
  readonly calendarLineTomorrow: string;
  /** `shiftRunConfigOf`'s refusals for tomorrow. */
  readonly withheldTomorrow: readonly string[];
}

/**
 * The beat, as one value.
 *
 * Pure: no clock, no RNG, no simulation, and no arithmetic on anything but the two counts it was
 * handed. `main.ts#closeShift` is its non-test caller — the same function that files the sheet,
 * so the beat and the sheet are built from one closing of one day.
 */
export function tomorrowBriefingOf(input: TomorrowInput): TomorrowBriefing {
  const { closed, week, verdict } = input;
  const groups: TomorrowGroup[] = [
    { id: 'closed', caption: 'What just happened', rows: closedRowsOf(closed, verdict, week) },
    { id: 'changed', caption: 'What changed overnight', rows: changedRowsOf(input) },
    { id: 'next', caption: 'What tomorrow is under', rows: nextRowsOf(input) },
  ];
  return {
    headline: headlineOf(closed, week),
    // A question with no answer is dropped rather than drawn empty — `docs/10` R3 at the layout's
    // scale, and `dev/reportPanel.ts`'s own *a slot with nothing to say is hidden, not emptied*.
    groups: groups.filter((group) => group.rows.length > 0),
    withheld: input.withheldTomorrow,
  };
}

/**
 * `Monday is banked. Tuesday opens.`
 *
 * It names the two days and asserts nothing about either — *banked* is `closeDay`'s own word for
 * what happened to the day regardless of how it went, and the design is explicit that the banked
 * count survives a missed day (`week.ts` rule 1). A headline reading *"Monday cleared"* would be
 * a fourth site stating the verdict, which is exactly what {@link TomorrowInput.verdict} exists
 * to stop.
 */
function headlineOf(closed: DayOutcome | null, week: WeekState): string {
  if (closed === null) return 'No day has closed yet — nothing has changed overnight.';
  return `${closed.weekday} is banked. ${weekdayAfter(week)} opens.`;
}

/**
 * The weekday the *next* day falls on.
 *
 * `week` is the week **after** `closeDay` and **before** `nextDay`, so `dayIdx` still names the day
 * that closed and tomorrow is `+1`. Through `types.ts#weekdayOf` rather than an array of names
 * spelled here: `weekdayOf` already owns the wrap, and a second list of seven strings is a second
 * spelling of *Wednesday* waiting to disagree with the sheet's title.
 */
function weekdayAfter(week: WeekState): string {
  return weekdayOf(week.dayIdx + 1);
}

/**
 * What just happened — two rows, and neither of them is a mean.
 *
 * The counts row prints **legs offered** and **legs carried** with the words on them, because
 * those are the two quantities {@link DayOutcome} genuinely holds. It does not subtract them and
 * it does not name the difference: `abandoned` and `accessRefused` are invisible to this layer
 * (finding N-2), so *"12 people did not get a lift"* would be a claim assembled out of a number
 * this module cannot see. § D266's four outcomes stay four by not being counted here at all.
 */
function closedRowsOf(
  closed: DayOutcome | null,
  verdict: 'cleared' | 'missed' | 'ungraded' | null,
  week: WeekState,
): readonly TomorrowRow[] {
  if (closed === null || verdict === null) return [];
  return [
    {
      id: 'carried',
      label: 'YESTERDAY',
      value: `${count(closed.carried)} of ${count(closed.arrived)} carried`,
      note:
        `${closed.weekday}, day ${String(closed.day)} — legs offered and legs carried over the ` +
        'whole shift. Waiting, abandoned and turned away are four different outcomes and this ' +
        'line counts none of them; the sheet above is where the day is judged.',
    },
    {
      id: 'streak',
      label: 'STREAK',
      value: streakValueOf(week.streak),
      note: streakNoteOf(verdict, closed, week),
    },
  ];
}

/** `4 days` / `1 day` / `none`. Never `0 days`, which reads as a quantity somebody lost. */
function streakValueOf(streak: number): string {
  if (streak === 0) return 'none';
  return streak === 1 ? '1 clean day' : `${count(streak)} clean days`;
}

/**
 * Which of the three things happened to the streak, in `closeDay`'s own three arms.
 *
 * Keyed on the verdict rather than on `allMet`, so the sentence and the arithmetic cannot come
 * apart: `closeDay` adds one when `allMet`, resets to zero when the day was graded and missed,
 * and **leaves it alone** when nothing was graded (§ D234). The third arm is the one worth the
 * words — a play-tester who carried 18 of 18 was told *"Streak reset"* about a day nobody looked
 * at, and a beat that said the same would re-ship the sentence that finding removed.
 */
function streakNoteOf(
  verdict: 'cleared' | 'missed' | 'ungraded',
  closed: DayOutcome,
  week: WeekState,
): string {
  switch (verdict) {
    case 'cleared':
      return `${closed.weekday} met every goal, so it counted.`;
    case 'missed':
      return `${closed.weekday} missed a goal, so the streak went back to none. What is banked stays banked: ${bankedPhrase(week)}.`;
    case 'ungraded':
      return (
        `${closed.weekday} was never graded — too few arrivals to read a goal against — so the ` +
        'streak is where it was. Unjudged is not passed, and it is not failed either.'
      );
  }
}

/** `2 clean shifts banked` — the count `closeDay` wrote, unclamped and uninterpreted. */
function bankedPhrase(week: WeekState): string {
  return week.cleanRun === 1 ? '1 clean shift' : `${count(week.cleanRun)} clean shifts`;
}

/**
 * The reveal — what is different about the building when the doors open.
 *
 * The percentage is computed from the **two measured counts** and nowhere else. It is not
 * `growthFactor`'s, and the difference is load-bearing on any week the calendar is open on: a
 * vacation scales the same floors, so the figure a player is shown has to be the one their run
 * will have, not the one growth would have produced alone.
 *
 * When the two counts are equal the row still appears and says so. An absent row would be
 * indistinguishable from a surface that failed to compute one — `docs/10` R3, and `week.ts`'s own
 * *"an empty string is what a broken restore looks like"*.
 */
function changedRowsOf(input: TomorrowInput): readonly TomorrowRow[] {
  const { populationToday: today, populationTomorrow: tomorrow, closed } = input;
  if (closed === null) return [];
  const delta = tomorrow - today;
  return [
    {
      id: 'tenants',
      label: 'TENANTS',
      value: `${count(today)} → ${count(tomorrow)}`,
      note: tenantsNoteOf(today, delta),
    },
  ];
}

/**
 * The line under the two counts, and the one place a percentage is allowed on this surface.
 *
 * `toFixed(1)` on `delta / today`, guarded against a building with nobody in it — a plant deck or
 * a shipped fixture can be zero, and a percentage of zero is the confident nonsense this project
 * is built to avoid. In that case the count is stated and no share is offered.
 */
function tenantsNoteOf(today: number, delta: number): string {
  const measured =
    'Measured on the two buildings the two runs resolve to, not on a multiplier applied to this ' +
    'caption — the people are in tomorrow’s floors before they are in this sentence.';
  if (delta === 0) return `Nobody moves in overnight. ${measured}`;
  const direction = delta > 0 ? 'move in' : 'move out';
  const people = Math.abs(delta);
  const share =
    today > 0 ? ` — ${(Math.abs(delta / today) * 100).toFixed(1)} % of today` : '';
  return `${count(people)} ${people === 1 ? 'person' : 'people'} ${direction} overnight${share}. ${measured}`;
}

/**
 * What tomorrow is under.
 *
 * ## Tomorrow's **event** is deliberately not here, and the reason has changed underneath it
 *
 * The Day report's own *Tomorrow* card already names it — `shift/report.ts#forecastFor`, the card
 * `docs/design/elevator-sim-reimagined.dc.html` :360 draws — so a second name on the same screen
 * would be two answers to one question, which is the failure § D223 and issue #53 both closed.
 *
 * **That was one of two reasons and the weaker one has gone.** When this beat was written the
 * card's name was `eventFor(day + 1, nextIdx)`, the unpatched schedule, while
 * `dev/state.ts#shiftRunConfigOf` overrode it from the calendar — so under `moving-week` the card
 * named an event the run would not have, and restating a wrong name would have doubled it. GitHub
 * issue #135 closed that: `forecastFor` takes the period and goes through
 * `shift/calendar.ts#scheduledEventFor`, so the card is now correct on every period.
 *
 * **Restating it here is therefore a design change and not a bug fix, and it is not taken.** The
 * § D223 argument never depended on the card being wrong: one screen, one answer, and the card is
 * where a reader looks for what tomorrow is. Adding a second copy would buy nothing and would leave
 * two places for a later edit to correct one of.
 *
 * What is left is the period itself, which the card cannot say at all. It is present only when the
 * week is in one — the single case on this surface where absence is right, because *no period* is
 * the ordinary week rather than a fact a reader is missing.
 */
function nextRowsOf(input: TomorrowInput): readonly TomorrowRow[] {
  // Nothing has closed, so there is no tomorrow to be under: the beat is empty whole rather than a
  // *still to bank* line standing on its own under a headline that says no day has closed yet.
  if (input.closed === null) return [];
  const rows: TomorrowRow[] = [];
  if (input.calendarLineTomorrow !== '') {
    rows.push({
      id: 'calendar',
      label: 'THE WEEK',
      value: input.calendarLineTomorrow,
      note:
        'The calendar period the week is under. It changes demand and building fabric and nothing ' +
        'else — no figure is scaled on its way to a caption.',
    });
  }
  if (input.contract !== undefined) {
    rows.push({
      id: 'contract',
      label: 'STILL TO BANK',
      value: bankedTowardOf(input.week, input.contract),
      note: input.contract.reward,
    });
  }
  return rows;
}

/**
 * `1 of 2 clean shifts banked`, clamped for display exactly as the sheet clamps it.
 *
 * `cleanRun` keeps counting past `needClean` on a contract already cleared, so the raw figure can
 * read *2 of 1* (SC-05/DR-09, § D198). The clamp is on the display only and the data keeps its
 * truth — the same sentence `shift/report.ts#contractLineFor` carries, and the same clamp, because
 * two surfaces printing one figure two ways is how the sheet and the rail came to disagree once
 * already.
 */
function bankedTowardOf(week: WeekState, contract: ScenarioContract): string {
  const banked = Math.min(week.cleanRun, contract.needClean);
  return `${count(banked)} of ${count(contract.needClean)} clean shifts banked`;
}

/**
 * A count with thin spaces between thousands, in the locale the header already uses.
 *
 * `en-GB` rather than the reader's, for the reason `main.ts` picked it: the figures on this screen
 * are compared against `data/` and against a CLI line, and a separator that changed with a browser
 * setting would make two players' screenshots disagree about the same building.
 */
function count(value: number): string {
  return value.toLocaleString('en-GB');
}
