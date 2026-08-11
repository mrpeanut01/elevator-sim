/**
 * The Day report — the observation sheet, and the module where honesty costs the most.
 *
 * ## What this replaces
 *
 * The handoff's report sheet is a prototype's, and `docs/12-design-handoff.md` § 4.2 is the list of
 * what each of its figures becomes. Two are worth naming here because they are the reason this
 * module is careful rather than long:
 *
 * - Its **average wait** is `28 + (100 − pct) × 0.9`. That is not a rounded mean or a stale mean;
 *   it is a number computed from a different quantity to look plausible. It is replaced by
 *   `summary.meanWaitS` — and by the word **withheld** whenever the run's own `awtIsValid` is
 *   false or the run saturated.
 * - Its **where it went wrong** rows are hard-coded at `08:30` and `17:20`, on a run whose clock
 *   the design invented. They are replaced by two rows derived from the run: the instant the
 *   deepest queue stood, and the demand phase that instant fell in. **A clock time the run did not
 *   have is never printed** — and neither is a row that is not an event: the reporting window's
 *   scope note used to sit there, timestamped like an incident, and is now in the small print
 *   ({@link smallPrintFor}, issue #56).
 *
 * ## One judgement, and every sentence that states it
 *
 * The sheet says *how did today go?* in four places — the headline, the pass/fail banner, the
 * diagnosis heading and the streak line. All four are reached through {@link judgementOf}, keyed by
 * a single `verdict`, because two of them used to be computed independently and **disagreed on
 * shipped runs**: *"A day it could handle"* over *"Shift missed"*, issue #53. See
 * {@link ShiftJudgement} for the run that produced it and why this is a lookup rather than copy that
 * happens to line up.
 *
 * ## The suppression gate, stated once
 *
 * `AVERAGE WAIT` is the only figure on this sheet that a saturated run may not publish, and it is
 * gated on `summary.awtIsValid && !summary.saturated` — both, not either. `awtIsValid` has **five**
 * grounds (`core`'s `AWT_INVALID_GROUND_SPECS`: the trend test, an empty window, abandonment above
 * 2 %, censoring above the unserved limit, and a leg past the 900 s horizon) and `saturated` is
 * carried separately; requiring both is `docs/12` § 4.2's own wording and it is the conservative
 * direction. Everything else on the sheet is an **observation** — a count, or a ratio of counts —
 * and is therefore printed on a saturated day, which is the day a reader most needs it. That split
 * is `docs/10` R9: one gate, for exactly the figures the flag speaks for, widened to nothing.
 *
 * ## Energy: two figures, no colour, no total
 *
 * The handoff has no energy figure. `docs/12` § 4.2 adds one and § D106 says why dropping it to
 * match a handoff that had not heard the argument would be a regression — and, in the same breath,
 * what may be done with it. `workKJ` and `workPerServedLegKJ` are drawn **side by side**, always
 * both or neither, with {@link ReportFigure.tone} `unranked` and {@link ReportFigure.axisOnly}
 * `true`. Nothing on this sheet sums them with anything, ranks them against anything, or turns them
 * into a grade: measured across the full experiment matrix, `nearest-car` is on the Pareto front at
 * six of eight cells because it is best on energy and worst on wait, so a green energy figure would
 * congratulate the weakest shipped dispatcher. *A configuration that spends less by serving fewer
 * people has not saved anything*, which is exactly what the second figure is for. When
 * `energy.measured` is false both read **not recorded**, never `0 kJ`.
 *
 * ## What is inherited and what is derived
 *
 * Nothing here recomputes a statistic. Every figure is either copied from {@link VizSummary} (which
 * `record/recordRun.ts` copied from `RunSummary`, which `core` computed) or copied from the
 * {@link Observations} the live layer folded out of the recording. This module formats and
 * refuses; it does not measure. That is the same division `campaign/judge.ts` states for the
 * batch — *"nothing statistical is computed here"*.
 *
 * ## The sheet knows what it is a report **of** — and it is told, never guessed
 *
 * `docs/17` § 5 clause 1: the sheet named a scenario and printed *"1 of 2 clean shifts banked"* on a
 * Free Play run that banks nothing and belongs to no week. Every line was individually honest —
 * `contractLineFor` answers correctly when there is no contract — and the *sheet* was still the
 * wrong shape, because five of its statements (`streakLine`, `contractLine`, the cleared banner,
 * tomorrow's forecast, *What this taught* and *Open the doors on Wednesday*) are claims about a
 * **week**, and a single run has none.
 *
 * So {@link DayReportInput} carries a **named** {@link ReportSubject} and the result is a
 * discriminated union: {@link WeekDayReport} keeps types.ts's {@link DayReport} whole, and
 * {@link SingleRunReport} does not have those fields **at all**. Not blanked — absent. An empty
 * string in a slot the layout still reserves is `docs/10` R3's *blank where a number should be*,
 * one layer up: the reader sees a caption over a hole and cannot tell a missing statement from a
 * broken one.
 *
 * **Why a named subject rather than a derived one.** It *is* derivable today — `enterFreePlay`
 * opens on `openWeek()`, so a Free Play run is exactly *no contract, day 1, empty history, streak
 * zero* — and deriving it would have been wrong twice over. First, the inference is false on its
 * face: `openWeek(contractForBuilding(...)?.id)` means a Free Play run on `midtown-office` **has**
 * a contract id, which is how the defect reads *"Scenario 2 — The morning rush"* in the first
 * place. Second, and this is the general rule: `docs/16` S1 refuses an absence that is
 * indistinguishable from an oversight, and the defect being fixed here *is* an omission — a caller
 * that forgot to say what its run was. A required field cannot be forgotten by the next mode that
 * arrives; a default named `week-day` would let the same bug ship again in silence.
 *
 * **What replaces the week on a single run.** Two things, because a single run's whole value is
 * that somebody else can run it again and that this sheet may not settle anything on its own:
 * the selection — seed, building, dispatcher, template, rate, length — in the meta block beside the
 * seed that is already there; and {@link ReportNextStep}, which names **Compare**. `docs/17` § 3.4
 * records Compare as unreachable from the moment a player wants it, and `docs/12` § 2.3 makes it
 * the only surface in the product allowed to say one dispatcher beat another. The pointer is
 * **data on the report**, not a string in the panel, so the surface it names is a value a shell can
 * navigate on rather than prose a reader has to act on themselves.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizRecording, VizSummary } from '../contract/types.js';
import { fallbackLineOf, readbackOf, type RuleRow } from '../authoring/ruleSpec.js';
import { interventionLogOf } from '../live/interventions.js';

import { scheduledEventFor, type CalendarPeriod } from './calendar.js';
import { contractStatus } from './contracts.js';
import { readGoals, wasDisplayOf } from './goals.js';
import { growthFactor } from './growth.js';
import { ENDLESS_CONTRACT_ID, wasGraded } from './week.js';
import {
  DAY_START_S,
  WAKE_UP_ARRIVALS,
  weekdayOf,
  type DayReport,
  type FigureTone,
  type GoalReading,
  type Observations,
  type ReportDiagnosis,
  type ReportFigure,
  type ReportForecast,
  type ReportNextStep,
  type ReportLever,
  type ScenarioContract,
  type ShiftEvent,
  type ShiftGoal,
  type WeekState,
} from './types.js';

/**
 * The word the sheet prints instead of a mean it may not publish.
 *
 * A constant because three places have to agree on it: the figure, the honesty guard in
 * `report.test.ts`, and whatever renders it. The handoff already reserved this exact word for the
 * saturated case; the implementation widens it to every one of `awtIsValid`'s grounds.
 */
export const WITHHELD = 'withheld';

/** What an unmeasured quantity reads. Never `0`, never a dash. `docs/10` R3/R11. */
export const NOT_RECORDED = 'not recorded';

/**
 * What a single run was started from — everything the CLI would need to run it again, and nothing
 * the recording can already answer.
 *
 * The building, the dispatcher and the **seed** are not here: `VizRecording` carries all three, and
 * a second copy of a fact the recording already holds is a second source of truth about the run's
 * identity — the disagreement `docs/16` S5 exists to prevent. What is left is the three axes the
 * recording genuinely cannot answer.
 *
 * `arrivalRatePctPop5min` is `null` for *"whatever this building's own traffic profile says"*, which
 * is a different selection from any particular number and is printed as one. `durationS` is the
 * **selected** length rather than `endedAt − startedAt`: a run that stopped early still reproduces
 * from the length that was asked for, and the span it actually had is already on the line above.
 */
export interface SingleRunSelection {
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
}

/**
 * What this sheet is a report **of**. Named by the caller; never inferred from the week's shape.
 *
 * Two members, and a third would be a compile error at every exhaustive branch below — the split
 * `mode/types.ts` states and `docs/16` S4 requires of scope and mode: *the categories are named by
 * the criterion itself, the members of those sets are derived*. See the module docstring for why
 * this is a required field rather than a default.
 */
export type ReportSubject =
  | { readonly kind: 'week-day' }
  | { readonly kind: 'single-run'; readonly selection: SingleRunSelection };

/**
 * What the **day** was set to run — GitHub issue #126, and the field the trap in that issue is
 * about.
 *
 * ## Why this exists, and why it could not be derived
 *
 * {@link ReportBasis} could see the building, the shape of run and the demand, and it could not see
 * two things that make two days incomparable just as thoroughly: **how much of the day was run**,
 * and **which arrival pattern it was built from**. Two campaign days of one day number, one at 55
 * minutes and one at 25, compared as though they were the same question; so did two days either side
 * of a pattern edit.
 *
 * The obvious substitute is a trap, and it is worth stating rather than leaving to be rediscovered.
 * The recording's own span looks free: `VizRecording` already carries `startedAt` and `endedAt`, and
 * a basis keyed on the difference needs no new field anywhere. But `endedAt` is
 * `max(lastEventAt, demandEndedAt)` (`sim/simulation.ts`), so it moves with the **dispatcher** —
 * driven in the shipped shell on Midtown Office at seed 20 260 804, three dispatchers back to back
 * on one selection printed spans of `08:30–09:25`, `08:30–09:22` and `08:30–09:20`. A span-keyed
 * basis would have refused all three of those comparisons, which is the one comparison the delta
 * block exists to draw. **The cheap fix is worse than the gap**: it converts the common case into a
 * refusal while leaving the rare one uncaught.
 *
 * So this is a **required** field on {@link DayReportInput}, carrying what the *state* asked for
 * rather than what the *run* happened to produce. Required for {@link ReportSubject}'s reason: the
 * defect a required field closes is a caller that forgot to say, and a plan defaulted to *"whatever
 * the last one was"* would make two sheets compare as one question by omission.
 *
 * The repository had already written down why this matters, one layer away and unconnected to the
 * sheet: `scope/surface.ts` describes `viewer.shiftLengthS` as *"Comparability depends on it: every
 * published figure in this repository was measured over a stated window, and a run of a different
 * length is a different claim."* That sentence was true and the Day report could not act on it,
 * which is the gap rather than a restatement of it.
 *
 * ## Why the window start travels with the length
 *
 * § D286 split one control into two fields: a whole day travels as `durationS`, and a *part* of one
 * travels as `windowStartS`/`windowEndS`, because a `durationS` override refits the template's
 * geometry while a window selects from it as authored. Two parts of one day can therefore have the
 * same length and different starts — `menu/partsOfDay.ts` derives them from the template's own
 * phase boundaries, and nothing stops two of them being equally long. Carrying the length alone
 * would have closed the axis for the case a reader meets first and left it open for the case that is
 * harder to notice.
 */
export interface ShiftPlan {
  /** `ViewerState.shiftLengthS` — what was asked for, never `endedAt − startedAt`. */
  readonly shiftLengthS: number;
  /**
   * Where in the authored schedule the run started, or `null` for *from the top*.
   *
   * `ViewerState.windowStartS`. `null` is a distinct selection rather than a missing one — the same
   * rule {@link SingleRunSelection.arrivalRatePctPop5min} follows for *the building's own rate*.
   */
  readonly windowStartS: number | null;
  /**
   * Which arrival pattern the run was built from — `ViewerState.pattern`.
   *
   * `'building'` is the building's own `trafficProfile`, which is the comparable default and the
   * demand every published figure in this repository was measured under; anything else is a shipped
   * profile's id or the id of a pattern the reader saved. The id is enough, and that is a fact about
   * the shipped writer rather than an assumption: `dev/trafficEditor.ts#savePattern` mints a fresh id
   * through `nextSavedId` on every save and never edits a saved spec in place, so within a session a
   * pattern id names one set of numbers. A second writer that edited a spec under its own id would
   * make this field lie, which is why that property is named here rather than assumed.
   */
  readonly patternId: string;
}

/**
 * What two sheets must agree about before the difference between them is a difference **in**
 * anything — GitHub issues #117 and #102.
 *
 * ## What was reported
 *
 * *What moved since the run before this one* differenced whatever sheet happened to be filed before
 * this one, whatever it was a sheet **of**. A player finished a Free Play run on Midtown Office and
 * opened a scenario day on Garden Apartments, and read `CARRIED was 726 → 48` as though 678 people
 * had stopped being carried; another switched building mid-session and read `was 48 → 5961`. Both
 * are true statements about two counts and neither is a statement about anything the player did.
 * The count follows the building.
 *
 * ## Why this is data on the sheet rather than a string comparison in the panel
 *
 * The panel already *labels* a building change — `BUILDING & DISPATCHER was … → …` is one of the
 * identity rows — and labelling it was not enough, because the figure rows underneath went on being
 * drawn and a labelled misleading diff is still a misleading diff. What the panel could not do is
 * **tell a building change from a dispatcher change**, because both live in one printed line
 * (`metaLinesFor`'s first entry is `${buildingName} · ${dispatcherName}`) and a dispatcher change is
 * exactly the comparison the block exists for. So the sheet publishes the axes themselves.
 *
 * ## The five axes, and why the dispatcher is deliberately not one of them
 *
 * A dispatcher swap on one building, one day and one seed is the retry loop the whole block was
 * built for (issue #38): it is the *only* thing this product lets a player change and re-run against
 * the same passengers, and refusing it would leave the block with nothing to say. The five that are
 * here are the ones that change **what was asked**, not **how it was answered**:
 *
 * - {@link buildingId} — a different tower has a different population, a different core and a
 *   different number of cars, so every count on the sheet moves for reasons the reader did not
 *   cause.
 * - {@link subject} — a Free Play run and a day of a week are not the same question even on one
 *   building: the campaign grows the tenants 11 % a day (`growth.ts`) and books an event over the
 *   demand, and Free Play does neither.
 * - {@link demand} — what the passengers were generated from. On a single run that is the player's
 *   own selection line, template, rate and the **length of the demand schedule** together (see
 *   {@link SingleRunSelection.durationS}, which is minutes *of demand* rather than minutes of run).
 *   On a day of a week it is the day number and the day's event, which are the two things that move
 *   a campaign day's demand.
 * - {@link extent} — how much of the day was run, and which part of it. A 55-minute day and a
 *   25-minute day are different questions for reasons that have nothing to do with the dispatcher.
 * - {@link patternId} — which arrival pattern the day was built from. The pattern can be edited
 *   between days, and a sheet that could not tell would difference two days of different traffic.
 *
 * The last two arrived with GitHub issue #126 and are {@link ShiftPlan}'s, threaded from the state
 * that already knows both. **Neither is derived from the recording**, and that is the whole of the
 * issue rather than an implementation note — see {@link ShiftPlan} for the span that looks free and
 * is not.
 *
 * ## The gap this used to name is closed, and the shape of it is worth keeping
 *
 * It read: *the basis cannot see the event an authored calendar writes over a day*. {@link demand}'s
 * week-day arm names the day's `event.id`, and it named the one the **sheet** was handed —
 * `dev/main.ts#closeShift` derived it as `eventFor(week.day, week.dayIdx)`, the ordinary schedule,
 * while `dev/state.ts#shiftRunConfigOf` built the run from the calendar's override. Where a period
 * overruled, the two disagreed and two days that ran under *different* events paired as one
 * question.
 *
 * **The basis was never the defect**, and that is the part worth keeping: two ordinary days under
 * two different events have always been refused, and `reportPanel.test.ts` has always asserted it.
 * The gap was one expression wide and it was the shell's. GitHub issue #135 closed it by giving
 * that question exactly one answer — `shift/calendar.ts#scheduledEventFor`, which `closeShift` and
 * four other callers now go through, with `eventSeam.test.ts` deriving from disk that there is no
 * sixth. A limitation described only in prose is a limitation that goes stale (§ D227), so this
 * paragraph is pinned by that test rather than by its own confidence.
 */
export interface ReportBasis {
  /** `VizRecording.buildingId` — the tower, not its display name. */
  readonly buildingId: string;
  /** Which shape of run this was. {@link ReportSubject}'s own discriminator. */
  readonly subject: ReportSubject['kind'];
  /**
   * What the passengers were generated from, as one string.
   *
   * A string rather than a record because the two shapes of sheet answer it with different fields
   * and nothing compares the parts — the only question ever asked of it is *are these two the
   * same?*. Composed from the sheet's own published words on a single run, so a reader who is shown
   * the refusal can find the difference on the identity rows above it.
   */
  readonly demand: string;
  /**
   * How much of the day was run, and which part of it — {@link ShiftPlan}'s two halves, as one
   * string.
   *
   * One string for {@link demand}'s reason, and it is the same reason twice: the only question ever
   * asked of a basis field is *are these two the same?*, and a record would invite a caller to
   * compare the parts and report *"a different length"* about two runs that differ only in where in
   * the schedule they started. {@link extentLineOf} composes it, once, so the refusal and the axis
   * cannot disagree about what a stretch of the day is.
   */
  readonly extent: string;
  /** {@link ShiftPlan.patternId}, unaltered — the pattern the day's demand was built from. */
  readonly patternId: string;
}

/**
 * The half of the sheet that is true of **any** run — derived from {@link DayReport} by removing
 * the week-shaped fields rather than restated, so a field added to `DayReport` cannot silently miss
 * the single-run sheet.
 *
 * {@link ReportCore.diagnosisHeading} is added here rather than on `types.ts`'s `DayReport` because
 * `shift/types.ts` is not this lane's file. It is on the *shaped* sheet, which is what every caller
 * in the tree already holds — `ViewerState.report` is a `ShapedDayReport` — so nothing reads a sheet
 * that lacks it.
 */
export type ReportCore = Omit<DayReport, WeekShapedField> & ShapedOnlyFields;

/**
 * What a *shaped* sheet carries that `types.ts`'s {@link DayReport} does not.
 *
 * Declared once and mixed into both shapes, so the two cannot drift — the same discipline
 * {@link ReportCore} applies in the other direction by deriving from `DayReport` rather than
 * restating it. It lives here rather than on `DayReport` because `shift/types.ts` is not this lane's
 * file; nothing is lost by that, because every consumer in the tree holds a {@link ShapedDayReport}
 * (`ViewerState.report` is one) and no caller reads a bare `DayReport` off this module.
 */
interface ShapedOnlyFields {
  /**
   * The heading the diagnosis list hangs under — **a third string out of the one judgement**.
   *
   * *Where it went wrong* fired on a shift where nothing did (issue #56): the section is authored in
   * `index.html` as a fixed `<h3>`, so a player who had just met every goal was told, immediately
   * under a green **Shift cleared**, where their day had gone wrong. A heading that is true of every
   * run is a heading a reader learns to skip, and it is the day it *isn't* true that they needed it.
   *
   * It comes out of {@link judgementOf} beside {@link DayReport.verdict} and
   * {@link DayReport.verdictLine} for the reason the lede does: three sentences about one day,
   * looked up under one key, cannot say three different things about it.
   */
  readonly diagnosisHeading: string;
  /**
   * What this sheet is comparable **with** — issues #117 and #102. See {@link ReportBasis}.
   *
   * Here rather than on `types.ts`'s `DayReport` for {@link diagnosisHeading}'s reason, and carried
   * on **both** shapes because the mode is one of the three axes: a sheet that did not publish its
   * own basis could not be told apart from a sheet of a different question, which is the defect.
   */
  readonly basis: ReportBasis;
}

/**
 * The five statements that need a week to be true — and `taught` is the one worth arguing.
 *
 * Its branches are *"Cleared: `<reward>`"* and *"Bank N more clean shifts and the next assignment
 * opens"*; even the no-contract branch — *"nothing banks here"* — answers *what did today bank?*.
 * That question is not asked of a run that belongs to no week, and answering an unasked question in
 * a card captioned **What this taught** is how a sheet ends up shaped like something it is not.
 */
type WeekShapedField = 'streakLine' | 'contractLine' | 'cleared' | 'forecast' | 'taught' | 'nextDayName';

/** A day of a week: types.ts's {@link DayReport} exactly, plus the discriminator. */
export interface WeekDayReport extends DayReport, ShapedOnlyFields {
  readonly of: 'week-day';
}

/**
 * One run, belonging to no week — the same figures, the same diagnosis, the same levers and the
 * same small print, with the week's five statements **absent** and two single-run ones in their
 * place. See the module docstring.
 */
export interface SingleRunReport extends ReportCore {
  readonly of: 'single-run';
}

export type { ReportNextStep };

/** A filed sheet, of either shape. Narrow on {@link WeekDayReport.of}. */
export type ShapedDayReport = WeekDayReport | SingleRunReport;

export interface DayReportInput {
  readonly recording: VizRecording;
  /** From `packages/viz/src/live/`. See `types.ts` — this layer never folds a recording itself. */
  readonly observations: Observations;
  /** Today's goals. Read here, against the same observations, so the sheet cannot disagree with the rail. */
  readonly goals: readonly ShiftGoal[];
  /** The week **after** `closeDay` — it carries the streak, the banked count and the award. */
  readonly week: WeekState;
  /** `undefined` for a building the reader built, which is graded but belongs to no scenario. */
  readonly contract: ScenarioContract | undefined;
  /**
   * What was booked against **today**, as the run had it — `dev/main.ts#closeShift` derives it
   * through `shift/calendar.ts#scheduledEventFor`, which is the same expression the run itself is
   * built from.
   *
   * Read by {@link bookedLine}, and for a long time by nothing at all: see that function for what
   * the sheet was missing while this field sat unread.
   *
   * **Tomorrow's is not this field and is not derived from it** — see {@link calendar}.
   */
  readonly event: ShiftEvent;
  /**
   * The calendar period the week is under, or `null` for an ordinary week. **Required** — GitHub
   * issue #135.
   *
   * ## What it is for, which is one card and one card only
   *
   * {@link forecastFor}. The *Tomorrow* card names the event tomorrow will be under, and tomorrow
   * is a day this sheet has to work out for itself — {@link event} is today's. Until this field the
   * card called `eventFor(day + 1, nextIdx)`, the **ordinary schedule**, while the run it was
   * predicting would be built by `dev/state.ts#shiftRunConfigOf` from the calendar's override. On a
   * `moving-week` the two disagree on five of seven days: the card said *Fire drill* for a day the
   * cars spent moving furniture.
   *
   * ## Why the period and not the resolved event
   *
   * A `tomorrowEvent: ShiftEvent` would have been smaller and it would have put `(week.dayIdx + 1)
   * % 7` at the caller — a third site holding the arithmetic that decides which day *tomorrow* is,
   * next to the two that already do. The period is the input the derivation is missing; the day is
   * this module's own and stays here.
   *
   * ## Required, and `null` written out
   *
   * {@link subject}'s rule and {@link plan}'s, for the third time: the defect each of those fields
   * closed was a caller that forgot to say. An optional field defaulting to `null` would read
   * exactly the same at every call site that has a calendar and does not pass it, which is the
   * defect rather than a guard against it.
   *
   * **Not derivable from {@link recording}**, and that is the trap both #135 and #126 record rather
   * than an implementation note. A recording knows what happened; a period is what was *scheduled*,
   * and a card that reported tomorrow from today's events would be a different claim in the same
   * words.
   */
  readonly calendar: CalendarPeriod | null;
  /**
   * Whether this run is a day of a week or a run on its own. **Required** — see the module
   * docstring: the defect this field closes was a caller that forgot to say.
   */
  readonly subject: ReportSubject;
  /**
   * What the day was set to run — length, part, and arrival pattern. **Required**, GitHub issue
   * #126, and {@link ShiftPlan} carries the argument for both halves of that word.
   *
   * The short version: it is required for {@link subject}'s reason, and it may not be derived from
   * {@link recording} because the recording's own span moves with the dispatcher.
   */
  readonly plan: ShiftPlan;
  /** The dispatcher's display name. Defaults to the recording's profile id. */
  readonly dispatcherName?: string | undefined;
  /** The simulated second the shift clock calls 06:00. See {@link DAY_START_S}. */
  readonly dayStartS?: SimTime | undefined;
  /**
   * Whether to draw the energy pair — `Settings.showEnergyAxis`, arriving where it can be seen.
   *
   * ## The defect this closes, which was a control with no pixel
   *
   * GitHub issue #70, and § D250 is the measurement. `render/runSummary.ts#summaryFigureIds`
   * honoured the setting; its only shipped caller was `mode/disclosure.ts#disclosureItems`, whose
   * only shipped caller was `dev/main.ts#drawParity`, which turned the item list into
   * `parityRefusal` — **empty whenever parity holds**, which is the shipped state. Measured with a
   * run on screen: the whole shell's rendered text was **byte-identical** with the switch on and
   * off. The two energy cells a player actually reads are {@link energyFigures}', and this input had
   * no field for the preference, so the Day report *could not* honour it. § D250's own words: *"the
   * fix is one required field and one caller"*. This is the field.
   *
   * ## Why it is optional here and required nowhere
   *
   * `undefined` is **show it**, which is what every caller that has no player gets — the acceptance
   * suites, the honesty sweep, `scenario/`. That is `DEFAULT_RUN_SUMMARY_OPTIONS`' rule and its
   * argument transfers verbatim: `DEFAULT_SETTINGS.showEnergyAxis` is `false` and this default is
   * *show*, because a run description that silently dropped an axis because a menu somewhere
   * defaults it off would be the honesty search measuring a surface the product does not show.
   *
   * ## What it may not become
   *
   * A **suppression**. § D106: energy is an axis, never a score, and it is drawn *beside* AWT and
   * WT95 rather than folded into a grade. Withholding it takes the whole pair or neither — never
   * one of the two, and never the ratio without the raw figure — because `workPerServedLegKJ`
   * without `workKJ` is a per-leg efficiency with nothing to read it against, which is precisely
   * the score this project refuses. {@link energyFigures} emits the pair; this decides whether the
   * pair is emitted.
   */
  readonly showEnergyAxis?: boolean | undefined;
  /**
   * The player's mid-run interventions, in press order — the run record's third member
   * (`run = { seed, config, interventions[] }`), reaching the sheet at last (`docs/19` defect 10).
   *
   * ## The defect this closes
   *
   * The stamp (`09:14 · parked the cars in the lobby`) lived only on the stage, so the filed sheet
   * of an intervened day was indistinguishable from an untouched one and the player's question —
   * *did my park matter?* — had no answer on the surface built to answer questions about the day.
   * {@link metaLinesFor} now prints one line per intervention, in time order, through
   * `live/interventions.ts#interventionLogOf` — the same verbs and the same clock the stage stamp
   * uses, so the sheet and the stage cannot disagree about what a press was called.
   *
   * ## Why it is optional where `subject`, `plan` and `calendar` are required
   *
   * Those three are required because a caller that forgot to say would produce a sheet of the wrong
   * *shape* in silence. An absent log has one meaning, and `core` pins it: a run built with no
   * `interventions` key is byte-identical to one built before the field existed
   * (`sim/interventions.test.ts`, cited by `dev/state.ts#ViewerState.interventions`). So `undefined`
   * here *is* the empty log rather than a guess at one, and the callers that pass nothing — the
   * acceptance suites, the honesty fixtures that drive an untouched day — are describing runs whose
   * record genuinely holds no entry. The one caller with a player (`dev/main.ts#closeShift`) passes
   * `state.interventions`, which is the log the run on screen was re-simulated under.
   */
  readonly interventions?: readonly RunInterventionConfig[] | undefined;
  /**
   * The Everyday rules the run's dispatcher was driven by, in first-match order — `docs/20`
   * defect 2, and {@link DayReportInput.interventions}' exact shape one mechanism over.
   *
   * ## The defect this closes
   *
   * A player wrote `when the lobby queue passes 30 people, hold a car at the lobby`, watched the
   * stage header name it live for forty minutes of simulated time, filed the day — and the sheet
   * said *"Midtown Office · Conventional collective"*. The word **rule** appeared on it zero times.
   * That is `docs/19` defect 10 exactly, on the mechanism that landed after it was fixed: the
   * surface built to answer *what happened today* did not name the thing that decided it.
   *
   * ## Why they sit with identity rather than with the interventions
   *
   * Because they are config and the interventions are not. `authoring/ruleSpec.ts` says it
   * outright — *"a run is `{ seed, config, interventions[] }` and rules are config"*, which is also
   * why a rule edit is next-run and never mid-run. So the lines go with the things that were
   * **asked for** — the dispatcher, the seed, the selection, the booking — and above the log of
   * what the player did to the day once it was running.
   *
   * ## Why the readback rather than a count
   *
   * `readbackOf` is the rules editor's own sentence — *"Reads as: when the lobby queue passes 30
   * people, hold a car at the lobby"* — and a sheet quoting a different wording for the same row
   * would be the second account of one decision this file spends most of its docstrings avoiding.
   * *"2 rules"* would say a rule was in force without saying which, which is the shape of caption
   * `docs/10` R3 refuses.
   *
   * Optional, and `undefined` **is** the empty list rather than a guess at one, for
   * {@link DayReportInput.interventions}' stated reason: `profileWithRules` returns the driving
   * profile by object identity for an empty list, so a run built with no rows is the run the
   * dispatcher id already implies. Every caller that passes nothing is describing exactly that.
   */
  readonly ruleRows?: readonly RuleRow[] | undefined;
}

/**
 * *Attempt 3* — said, once there has been more than one.
 *
 * ## Why the sheet has to say this
 *
 * The simulator runs a whole day and plays it back, so moving any control does not steer the day —
 * it discards it and simulates a different one (`docs/16` § 1). The retry is the product's
 * most-used verb, and a sheet that read identically on the first attempt and the fourth would be
 * quietly answering *"how did you do?"* with *"how many times did you ask?"*.
 *
 * ## Published beside, never folded in
 *
 * The attempt count changes no figure and enters no verdict. It sits in the meta block on exactly
 * the footing abandonment sits beside AWT and `workPerServedLegKJ` beside raw energy (§ D106): a
 * day cleared on the fourth attempt **is cleared**, and a reader is told which attempt it was.
 *
 * Absent on the first, because *"attempt 1"* on every sheet is noise that trains a reader to stop
 * reading the line — and the line only means anything by contrast.
 */
function attemptLine(subject: ReportSubject, attempt: number): readonly string[] {
  if (attempt <= 1) return [];
  // *at this day* is a week's phrasing. A single run re-rolls a selection, not a Tuesday.
  const what = subject.kind === 'week-day' ? 'at this day' : 'at this selection';
  return [`attempt ${String(attempt)} ${what}`];
}

/**
 * The identity block — and the two lines a single run adds to it.
 *
 * The seed is already here, which is half of *somebody else can run this again*; the other half is
 * the three axes the recording does not carry, so they go on the line under it rather than into a
 * block of their own. The second added line says the run is not part of a week, because a reader
 * who knows the campaign sheet will otherwise read the missing streak as a missing **number**
 * rather than as a missing **question** — which is the same R3 confusion the absent lines avoid.
 */
function metaLinesFor(input: DayReportInput, dispatcherName: string, dayStartS: SimTime): readonly string[] {
  const { recording, subject, week } = input;
  return [
    `${recording.buildingName} · ${dispatcherName}`,
    `seed ${recording.seed} · ${clockRange(recording.startedAt, recording.endedAt, dayStartS)} · one replication`,
    ...(subject.kind === 'single-run' ? selectionLines(subject.selection) : []),
    ...bookedLine(input.event, subject),
    /*
     * The rules in force, before the attempt count and well before the intervention log —
     * `docs/20` defect 2. Config, so it belongs with what was asked for; see
     * {@link DayReportInput.ruleRows} for why that placement is a decision rather than a habit.
     * An empty list prints nothing, exactly as an untouched day prints no intervention lines.
     */
    ...ruleLines(input.ruleRows ?? [], dispatcherName),
    ...attemptLine(subject, week.attempt),
    /*
     * The intervention log, last — `docs/19` defect 10, and it is identity rather than a reading:
     * the run record is `{ seed, config, interventions[] }`, and a sheet that reproduces without
     * the log describes a different day. One line per press, in time order, in the stage stamp's
     * own words (`interventionLogOf` shares `STAMP_VERBS` and the clock with `interventionStampOf`),
     * on both shapes of sheet — a Free Play day can be intervened in exactly as a campaign day can.
     * Last rather than beside the seed, because the lines above are what was *asked for* and these
     * are what the player *did to it* mid-run; an untouched day prints nothing here, which is how
     * every one of its sheets has always read.
     */
    ...interventionLogOf(input.interventions ?? [], dayStartS),
  ];
}

/**
 * The rules the run was driven by, one line each, in the words the editor read them back in.
 *
 * `docs/20` defect 2. Each line is `readbackOf`'s sentence with its ordinal, so the sheet, the
 * editor's readback and the stage header's live pill are three renderings of one string producer
 * rather than three authors — `interventionLogOf`'s arrangement, and its reason: two accounts of
 * what a control was called is how they come to disagree.
 *
 * The fallback is stated **once, under the list**, and only when there is a list. It is
 * `fallbackLineOf`'s own sentence, and it is the answer to the question this sheet's identity line
 * otherwise raises by itself: a reader who sees *Conventional collective* on the first line and a
 * rule on the third is owed the relationship between them, which is that the dispatcher decides
 * every call no rule matched. Without a rule there is nothing to qualify and the line would be a
 * caption over nothing — `docs/10` R3, and `interventionLogOf`'s empty arm.
 */
function ruleLines(rows: readonly RuleRow[], dispatcherName: string): readonly string[] {
  if (rows.length === 0) return [];
  return [
    ...rows.map((row, index) => `rule ${String(index + 1)} · ${readbackOf(row)}`),
    fallbackLineOf(dispatcherName),
  ];
}

/**
 * What was booked against today — {@link DayReportInput.event}'s first reader.
 *
 * ## The finding this closes
 *
 * The field was destructured and read by **nothing**. The forecast card names *tomorrow's* event,
 * derived independently through `forecastFor`, and the sheet named today's nowhere — so a
 * player who had just run a move-in day, with a car derated to two thirds for the whole shift, read
 * a sheet that described the day's figures and never mentioned the thing that shaped them. Every
 * line was individually true and the account was missing its subject.
 *
 * `GAPS.md` filed it as *a dead input*, which is the smaller half: an input with no reader is one
 * edit away from acquiring a wrong one, and this repository has shipped that eleven times. The
 * larger half is that the sheet was an account of a day with the day's own event left out.
 *
 * ## Why it is a meta line and not a card
 *
 * It sits beside the building, the dispatcher and the seed because it is **identity** — part of
 * *what this is a run of* — rather than a reading. The forecast card is a different thing: it is a
 * claim about tomorrow, and it belongs where a reader looks for what to do next.
 *
 * Absent on a single run, because there is no week to book anything against. That is not tidiness:
 * a single-run sheet that named an event would be claiming the run had one, and `enterFreePlay`
 * resets the week precisely so it does not.
 */
function bookedLine(event: ShiftEvent, subject: ReportSubject): readonly string[] {
  if (subject.kind !== 'week-day') return [];
  // Printed on an ordinary day too. *"Nothing booked"* is an answer to the question, and a line that
  // appeared only on eventful days would make its absence mean two things at once — no event, or a
  // sheet built before this line existed.
  return [`${event.name} — ${event.note}`];
}

/**
 * What a single run's demand was asked to be, in one line — the meta block's third entry, and
 * {@link ReportBasis.demand}'s single-run arm.
 *
 * One function rather than two, because the line a reader is shown and the string two sheets are
 * compared on have to be the same string. A basis composed separately would be a second answer to
 * *what traffic was this?*, and the first thing it could do is disagree with the line printed two
 * rows above the refusal that quotes it.
 */
function demandLineOf(selection: SingleRunSelection): string {
  const rate =
    selection.arrivalRatePctPop5min === null
      ? 'the building’s own rate'
      : `${selection.arrivalRatePctPop5min.toFixed(1)} %pop/5min`;
  // *"min of demand"* rather than *"min selected"* — issue #80. The number is the demand
  // schedule and never the run: the clock range on the line above is the run, drain included, and
  // the two used to be read as one because nothing said which was which.
  return `${selection.demandTemplateId} · ${rate} · ${String(Math.round(selection.durationS / 60))} min of demand`;
}

/** The rest of what it takes to run this again, and the statement that it stands alone. */
function selectionLines(selection: SingleRunSelection): readonly string[] {
  return [demandLineOf(selection), 'one run, not part of a week — nothing is banked'];
}

/**
 * How much of the day was run, and which part of it — {@link ReportBasis.extent}'s one composer.
 *
 * Minutes rather than seconds because the two things a reader can move are both authored in minutes
 * (`menu/partsOfDay.ts` derives its parts from a template's `startOfDayMin` and `durationMin`), and
 * because a basis that distinguished 1 800 s from 1 801 s would refuse a comparison over a rounding
 * nobody chose. Nothing rounds *into* equality here that a reader could have chosen apart: the
 * shipped controls write whole minutes.
 *
 * `null` prints nothing rather than `from 0 min in`, because *the whole day* and *the first part of
 * the day* are different selections — § D286 — and a string that spelled the first as the second
 * would make them compare equal.
 */
function extentLineOf(plan: ShiftPlan): string {
  const minutes = `${String(Math.round(plan.shiftLengthS / 60))} min`;
  return plan.windowStartS === null
    ? minutes
    : `${minutes} from ${String(Math.round(plan.windowStartS / 60))} min in`;
}

/**
 * What this sheet may be differenced against — issues #117 and #102, and see {@link ReportBasis}.
 *
 * Exhaustive over the subject, so a third shape of run is a compile error here rather than a sheet
 * that silently compares as though it were a week's.
 *
 * The week-day arm names the **day** and the **event** because those are the two things that move a
 * campaign day's demand: `growth.ts` adds 11 % of tenants per day, and `shiftRunPatch` writes the
 * event over the pattern. It does not name the dispatcher, the seed or the attempt — a retry with a
 * different dispatcher on one day is the comparison this block exists to draw.
 *
 * **The last two axes come off {@link DayReportInput.plan} and nothing else** — issue #126. Reading
 * them off `recording.endedAt − recording.startedAt` would have been free and would have refused the
 * dispatcher swap; see {@link ShiftPlan} for the three spans that measure it.
 */
function basisOf(input: DayReportInput): ReportBasis {
  const { recording, subject, week, event, plan } = input;
  return {
    buildingId: recording.buildingId,
    subject: subject.kind,
    demand:
      subject.kind === 'single-run'
        ? demandLineOf(subject.selection)
        : `day ${String(week.day)} · ${event.id}`,
    extent: extentLineOf(plan),
    patternId: plan.patternId,
  };
}

/**
 * Where to take the question this sheet may not answer.
 *
 * Frozen and shared: it is a fact about the product's surfaces, not a reading of this run, and a
 * per-run copy would invite somebody to make it one. The wording answers the small print's own
 * *"it cannot tell you that X is better than anything"* with the surface that can — `docs/12`
 * § 2.3 — including the answer it gives when the interval contains zero, so a reader is not sent
 * off expecting a winner.
 */
const COMPARE_NEXT_STEP: ReportNextStep = Object.freeze({
  surface: 'compare',
  label: 'Take it to Compare',
  why:
    'One run cannot tell you a dispatcher is better. Compare runs the alternatives against the ' +
    'same passengers, fifty or more times each, and reports the paired interval — it is the only ' +
    'surface here allowed to say one beat the other, and it answers “indistinguishable” when the ' +
    'interval contains zero.',
});

/**
 * Build the observation sheet — of a day of a week, or of one run.
 *
 * Pure: no clock, no RNG, no simulation. The run already happened and the observations were already
 * folded; this arranges them and refuses what may not be said.
 *
 * The shared half is built once, as {@link ReportCore}, and the branch adds one framing or the
 * other. Written that way so the figure grid, the diagnosis, the levers and the small print are
 * *the same values* on both sheets rather than two lists that agree today: the finding this
 * function answers is about the sheet's shape, and nothing about which figures it publishes or
 * which of them may be refused changes with the subject.
 */
export function dayReportOf(input: DayReportInput): ShapedDayReport {
  const { recording, observations, week, contract, subject } = input;
  const { summary } = recording;
  const dayStartS = input.dayStartS ?? DAY_START_S;
  const dispatcherName = input.dispatcherName ?? recording.dispatcherProfileId;
  const readings = readGoals(input.goals, observations);
  const judgement = judgementOf(readings, summary, observations);

  const core: ReportCore = {
    /*
     * On both sheets. `docs/17` § 5 clause 7 is *the report never points at Compare*, and pointing
     * only from the Free Play sheet answered it for the mode that provokes the question least: a
     * player finishing a campaign day has just read a levers card saying *try a different
     * dispatcher — a smarter one is free*, which is the question in as many words.
     */
    nextStep: COMPARE_NEXT_STEP,
    /*
     * *Tuesday — day 2* is a week's title: it names a weekday the run does not have and a position
     * in a sequence it is not in. A single run is titled by what it is a run of.
     */
    title:
      subject.kind === 'week-day'
        ? `${weekdayOf(week.dayIdx)} — day ${String(week.day)}`
        : `One run — ${recording.buildingName}`,
    metaLines: metaLinesFor(input, dispatcherName, dayStartS),
    /*
     * What this sheet may be differenced against — issues #117 and #102.
     *
     * On the sheet rather than worked out by the panel, for {@link ReportBasis}' reason: the panel
     * has the printed lines and cannot tell a building change from a dispatcher change inside one
     * of them, and a dispatcher change is the one comparison the block is for.
     */
    basis: basisOf(input),
    lede: judgement.lede,
    figures: figuresFor(summary, observations, dayStartS, input.showEnergyAxis ?? true),
    verdict: judgement.verdict,
    verdictLine: judgement.verdictLine,
    diagnosisHeading: judgement.diagnosisHeading,
    /*
     * Each reading with last night's figure beside it — the handoff's "was" column (§ 8.6),
     * derived from the week's history by the same function the rail's rows call, so the two
     * surfaces cannot show two different yesterdays. On a single-run sheet the week is a
     * scaffold with no history, so every `was` is the em dash — which is the honest answer:
     * one run has no previous day.
     */
    goals: readings.map((reading) => ({
      reading,
      was: wasDisplayOf(week.history, week.day, reading.goal),
    })),
    diagnosis: diagnosisFor(recording, observations, dayStartS, judgement.verdict),
    levers: leversFor(recording, observations, summary, readings),
    smallPrint: smallPrintFor(dispatcherName, summary, dayStartS),
  };

  if (subject.kind === 'single-run') {
    /*
     * **The banner is the contract's answer, and no contract asked** — `docs/19` defect 13.
     *
     * The judgement above still runs whole: the lede, the diagnosis heading and the goal readings
     * are observations about the day and stay (`contractLineFor`'s own precedent — on a week with
     * no contract *"the goals are still read from what happened"*). What may not survive the
     * reshaping is the **claim**: `Shift cleared` answers *did this run clear the shift it was
     * asked for?*, and a Free Play run was asked for nothing — the audit's own question, *"Cleared
     * what?"*. So the line is replaced here, in the layer that decides every claim, rather than in
     * a renderer: `dev/reportPanel.ts` and `render/reportCard.ts` both draw `verdictLine`, and a
     * fix in one would be the two-renderers defect issue #137 just closed, reopened with words.
     *
     * {@link SingleRunReport.verdict} keeps the judgement's own value — the lede and heading were
     * chosen through it (§ D237's one-key rule), and rewriting it would make them strings that
     * reached the sheet through a key the sheet no longer carries. What the verdict may not do on
     * this shape is colour or word a banner, and both renderers now key their neutral treatment on
     * `of === 'single-run'` rather than on the verdict.
     */
    return { ...core, of: 'single-run', verdictLine: SINGLE_RUN_VERDICT_LINE };
  }

  const nextIdx = (week.dayIdx + 1) % 7;
  return {
    ...core,
    of: 'week-day',
    streakLine: streakLineFor(judgement.verdict, week.streak),
    contractLine: contractLineFor(contract, week),
    cleared: week.cleared,
    forecast: forecastFor(input.calendar, week.day, nextIdx),
    taught: taughtFor(contract, week),
    nextDayName: weekdayOf(nextIdx),
  };
}

/**
 * What a single run's sheet says where a week's says **Shift cleared** — a refusal to grade,
 * spoken rather than blanked (`docs/19` defect 13).
 *
 * Lowercase and claim-free on purpose: it sits in the banner slot, and a sentence styled like a
 * verdict would be the thing it replaces with softer wording. It names *why* there is no grade —
 * no scenario asked — because the empty string was the other candidate and an empty banner beside
 * a heading reading *The shift asked for* is `docs/10` R3's blank where an answer should be. The
 * four goal rows under it are neutralised by the renderer on the same discriminator
 * (`dev/reportPanel.ts#reportViewOf`), so the block reads as *what a scenario would ask*, read and
 * not graded, top to bottom.
 *
 * Module-private on purpose: the sheet is the product, so the suites and the honesty sweep read
 * the sentence off {@link dayReportOf}'s own output rather than importing a constant beside it —
 * an export whose only shipped reader is its own module is the shape `deadCode.test.ts` exists to
 * refuse.
 */
const SINGLE_RUN_VERDICT_LINE = 'read, not graded — no scenario asked for this run';

/* -------------------------------------------------------------------------- *
 * The judgement — one verdict, and every sentence that states it
 * -------------------------------------------------------------------------- */

/** `types.ts`'s own verdict, named so the lookup below can be keyed exhaustively on it. */
type ShiftVerdict = DayReport['verdict'];

/**
 * What this day was, and the three sentences that say so.
 *
 * ## The defect this type exists to make unconstructible — issue #53
 *
 * The sheet drew a headline and a banner from **two independent tests**. `verdict` was
 * *every goal met*; the lede branched on `summary.saturated` alone. Those disagree on any run that
 * misses a goal without saturating, which is not an exotic state — Chancery House at 22 %pop/5min
 * for thirty minutes files `awtIsValid: true`, `saturated: false`, a landing that stacked 43 deep
 * against a bar of 26, and therefore:
 *
 * > **A day it could handle.** 440 journeys of 440 offered, and 80% of riders away inside a minute.
 * >
 * > THE SHIFT ASKED FOR — **Shift missed**
 *
 * One screen, two answers to *how did today go?* — the same failure § D223 closed in numbers, in
 * words. A player who reads only the headline learns the opposite of the truth; a player who reads
 * the sheet learns it contradicts itself, and the feedback loop breaks exactly on the runs where
 * feedback matters most.
 *
 * ## Why this is a lookup and not two functions that agree
 *
 * The fix is **not** copy that happens to line up. {@link VERDICT_VOICE} is keyed by the verdict, so
 * the headline, the banner and the diagnosis heading are all reached *through* it: there is no
 * expression anywhere in this module that produces the cleared headline without first having
 * decided the day cleared. A future edit cannot reintroduce the disagreement without deleting the
 * key it would have to go through.
 *
 * Saturation did not stop mattering — it moved **inside** each arm, where it is a clause rather than
 * a verdict. A saturated day that met every goal is still cleared, and its headline says both.
 */
interface ShiftJudgement {
  readonly verdict: ShiftVerdict;
  readonly verdictLine: string;
  readonly lede: string;
  readonly diagnosisHeading: string;
}

/**
 * The one place a verdict becomes words.
 *
 * `Record<ShiftVerdict, …>` rather than an `if`, so a third verdict is a compile error at this table
 * rather than a silently un-worded sheet — and so the three strings for one verdict sit on one line
 * of source, where a reader can see that they agree.
 *
 * **That compile error has now fired once, which is the point of it.** § D234 made *ungraded* a
 * verdict of its own (issue #27), and adding the member to `DayReport['verdict']` broke this table
 * until the key existed. The alternative — an `if (!graded)` branch outside the lookup — is exactly
 * the defect § D237 closed, arriving through a new door: a day could then reach a cleared or missed
 * headline without having been decided cleared or missed.
 *
 * **The three sentence sets are disjoint by construction.** No arm of {@link missedLede} says *too
 * quiet to grade* any more — it cannot be reached on an ungraded day at all — and
 * {@link ungradedLede} names no goal and makes no claim about how the day went.
 */
const VERDICT_VOICE: Readonly<
  Record<
    ShiftVerdict,
    {
      readonly line: string;
      /** `index.html` heads the diagnosis list; this is what that heading says. Issue #56. */
      readonly heading: string;
      readonly lede: (
        summary: VizSummary,
        observations: Observations,
        readings: readonly GoalReading[],
      ) => string;
    }
  >
> = Object.freeze({
  cleared: Object.freeze({
    line: 'Shift cleared',
    // Not *where it went wrong*: on a day that met every bar, the deepest queue is the closest it
    // came, and calling it a fault teaches a reader that the heading means nothing.
    heading: 'The tightest moment',
    lede: clearedLede,
  }),
  missed: Object.freeze({
    line: 'Shift missed',
    heading: 'Where it went wrong',
    lede: missedLede,
  }),
  ungraded: Object.freeze({
    line: 'Too quiet to grade',
    /*
     * Neither of the other two headings, and for the reason that made this a third verdict at all.
     * *Where it went wrong* asserts something went wrong; *the tightest moment* implies a bar was
     * approached. Nothing was read, so the rows underneath are observations about a morning rather
     * than evidence for or against anything — which is what this heading says instead.
     */
    heading: 'What the morning did',
    lede: ungradedLede,
  }),
});

/**
 * Read the day: the verdict, and every sentence that states it.
 *
 * The verdict itself is unchanged — *every goal met*, read from {@link readGoals} against the same
 * observations the left rail reads, so the sheet and the rail cannot disagree either. What changed
 * is that nothing else on the sheet decides the same question a second time.
 *
 * **Three answers rather than two, since § D234.** *Missed* used to mean two different days: one
 * that was asked for 87 % and carried 61 %, and one whose building never woke up. A play-tester
 * carried 18 of 18 people with 100 % away inside a minute and a 36 s worst wait, and read
 * *"Shift missed. Streak reset."* across the top of it — twice, on the tutorial, which is where a
 * new player decides whether the feedback on this screen is worth believing.
 *
 * `wasGraded` is `week.ts`'s predicate and not a second copy of it: this verdict and `closeDay`'s
 * streak arithmetic have to turn on the same test, or the sheet says *the streak is untouched*
 * about a week that lost one. *Unjudged is not passed* is untouched — an ungraded day is still not
 * clean, banks nothing and clears nothing. What it no longer does is **cost** anything.
 */
function judgementOf(
  readings: readonly GoalReading[],
  summary: VizSummary,
  observations: Observations,
): ShiftJudgement {
  /*
   * `wasGraded` is asked first, and that ordering is load-bearing rather than tidy. It already
   * requires a non-empty list, so a day with **no goals** cannot reach `cleared` through `every`'s
   * vacuous truth — it lands on `ungraded`, which is what a day nobody set a bar for is. The old
   * two-way expression guarded that with its own `readings.length > 0`; the guard now lives in the
   * predicate the week reads, where there is one of it.
   */
  const verdict: ShiftVerdict = !wasGraded(readings)
    ? 'ungraded'
    : readings.every((reading) => reading.state === 'met')
      ? 'cleared'
      : 'missed';
  const voice = VERDICT_VOICE[verdict];
  return {
    verdict,
    verdictLine: voice.line,
    diagnosisHeading: voice.heading,
    lede: voice.lede(summary, observations, readings),
  };
}

/** `440 journeys of 440 offered, and 80% of riders away inside a minute` — three counts, no estimate. */
function countsClause(observations: Observations): string {
  return (
    `${String(observations.carried)} journeys of ${String(observations.arrived)} offered, and ` +
    `${String(observations.minutePct)}% of riders away inside a minute`
  );
}

/**
 * The design's healthy branch, with its third clause removed rather than reworded.
 *
 * The design ends *"and the queue no deeper at close than at mid-morning"*. That is a claim about
 * two instants the recording does not summarise, and printing it unverified would be the
 * caption-that-does-not-describe-the-picture failure this whole handoff keeps naming.
 *
 * The saturated arm is not a contradiction of the verdict and is not allowed to read like one: the
 * goals were met, and the queues still never settled, so the sheet says both and points at the cell
 * that refused. No word from `ESTIMATE_CUES` appears near a number here — *the wait figure above*
 * rather than *the mean* — because the honesty search reads this string on a run whose mean is
 * refused (`honesty/properties.ts#checkSuppressedMean`).
 */
function clearedLede(summary: VizSummary, observations: Observations): string {
  if (summary.saturated) {
    return (
      `Every goal met, on a day the queues never settled. ${countsClause(observations)}. The ` +
      'backlog was still growing when the window closed, so the wait figure above is withheld ' +
      'rather than published, and the cell says on which ground.'
    );
  }
  return `A day it could handle. ${countsClause(observations)}.`;
}

/**
 * The day nobody looked at — § D234, issue #27.
 *
 * ## Why this is a voice of its own and not a branch inside {@link missedLede}
 *
 * It was one, and it had the words right and the verdict wrong: the sheet said *too quiet to grade*
 * under a banner reading **Shift missed**, and `closeDay` reset the streak underneath. So the
 * sentence and the banner disagreed about the same day — § D237's own defect, surviving inside the
 * one arm that had already noticed the problem.
 *
 * ## What it may say, and what it deliberately may not
 *
 * **Two counts and a remedy, and no goal.** The arrivals and the threshold are both observations
 * this sheet already carries, so neither is a new claim; naming a goal would be false, because none
 * was read. The remedy is on it because the rule *"nothing is graded before the building wakes up"*
 * lived on the **Simulation tab**, in a coach hint the reader left two clicks ago — and the control
 * that fixes it is offered as a convenience about how long you want to sit and watch, when it is in
 * fact the entry condition.
 *
 * *"The streak is untouched"* is a statement about what `closeDay` did rather than a consolation:
 * `wasGraded` is the predicate on both sides, so the sentence is true exactly when the arithmetic
 * is.
 *
 * The two unread parameters are in the signature because {@link VERDICT_VOICE} types all three
 * ledes alike, and that uniformity is what keeps the table a lookup instead of three special cases
 * — which is the property § D237 bought and this arm must not spend.
 */
function ungradedLede(
  _summary: VizSummary,
  observations: Observations,
  _readings: readonly GoalReading[],
): string {
  return (
    `Too quiet to grade. ${String(observations.arrived)} people called and the goals need ` +
    `${String(WAKE_UP_ARRIVALS)}, so nothing on this sheet was judged — the day is not a miss, ` +
    'and the streak is untouched. Run a longer shift and the same building will have something ' +
    'to be graded on.'
  );
}

/**
 * The two ways a **judged** day fails to clear, and neither of them opens with praise.
 *
 * The ungraded case is no longer here and can no longer arrive: since § D234 a day carrying a
 * `pending` reading is `ungraded`, so this function only ever sees a day where every goal was read
 * and at least one was not met. `unmet` is therefore never empty. The guard below is a total
 * function's belt rather than a reachable branch, and it **drops the clause instead of inventing a
 * sentence** — so the missed arm can never print the ungraded voice, which is the disjointness
 * § D237 asks of this table.
 */
function missedLede(
  summary: VizSummary,
  observations: Observations,
  readings: readonly GoalReading[],
): string {
  if (summary.saturated) {
    return (
      `It did not cope. ${String(observations.arrived)} people asked for a lift and ` +
      `${String(observations.carried)} got one, with ${String(summary.unservedCount)} still ` +
      'standing when the window closed. That is a building being outrun, not a dispatcher having ' +
      'a bad day — and it is fixable with the levers below.'
    );
  }
  const unmet = readings.filter((reading) => reading.state === 'missed');
  /*
   * The empty case **drops the clause** rather than taking a branch of its own — § D234.
   *
   * It used to be an `if` returning *"Too quiet to grade …"*, and that was this arm answering a
   * question it does not own: an ungraded day now has its own verdict, its own banner and its own
   * lede, and a second copy of the sentence here would let the missed banner sit over the ungraded
   * words again. `judgementOf` cannot route an ungraded day here at all, so this is unreachable;
   * what it must never do is become *reachable and wrong*, and a dropped clause is the only shape
   * with no sentence to be wrong with.
   */
  const clause = unmet.length === 0 ? '' : ` — and ${listOf(unmet.map((reading) => `“${reading.goal.label}”`))} still went unmet`;
  return (
    `Short of what the shift asked for. ${countsClause(observations)}${clause}. The banner below ` +
    'is counting the same thing this sentence is.'
  );
}

/** `a`, `a and b`, `a, b and c`. An Oxford-comma-free join, so a two-item list is not `a, b`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/**
 * `1 leg`, `5 legs` — one denominator, correctly numbered — `docs/19` defect 8's *"over 1 legs"*.
 *
 * A count of one is a state a real run reaches (Garden Apartments quotes a valid AWT over five
 * legs at one seed; a thinner window reaches one), and R13 makes the count part of what the mean
 * means, so its grammar is not cosmetic: *"over 1 legs"* reads as a typo in the one clause a
 * reader is being asked to trust. `noun` is the singular form; module-private because every
 * caller is a note in this file.
 */
function legCount(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/* -------------------------------------------------------------------------- *
 * The figure grid
 * -------------------------------------------------------------------------- */

function figuresFor(
  summary: VizSummary,
  observations: Observations,
  dayStartS: SimTime,
  showEnergyAxis: boolean,
): readonly ReportFigure[] {
  return [
    {
      id: 'carried',
      label: 'CARRIED',
      value: String(observations.carried),
      note: `of ${String(observations.arrived)} who turned up`,
      tone: 'plain',
      axisOnly: false,
    },
    {
      id: 'minute',
      label: 'AWAY INSIDE A MINUTE',
      value: `${String(observations.minutePct)}%`,
      // R13: the share never travels without the count it was taken over.
      note: `an observation, never suppressed — over ${legCount(observations.servedLegs, 'served leg')}`,
      tone: observations.minutePct >= 75 ? 'good' : observations.minutePct >= 50 ? 'caution' : 'bad',
      axisOnly: false,
    },
    averageWaitFigure(summary),
    worstWaitFigure(summary),
    {
      id: 'deepest-queue',
      label: 'DEEPEST QUEUE',
      value: String(observations.peakQueue),
      note: deepestQueueNote(observations, dayStartS),
      tone: observations.peakQueue > DEEP_QUEUE ? 'hot' : 'plain',
      axisOnly: false,
    },
    {
      id: 'stairs',
      label: 'TOOK THE STAIRS',
      value: String(observations.abandoned),
      note: stairsNote(observations),
      tone: observations.abandoned > 0 ? 'bad' : 'good',
      axisOnly: false,
    },
    /*
     * The pair, or neither — issue #70, and § D106 is why it cannot be one of the two. A reader who
     * has `workPerServedLegKJ` and not `workKJ` has a per-leg efficiency with nothing to read it
     * against, which is the score this project refuses; a reader who has neither has one fewer axis
     * and no false claim.
     */
    ...(showEnergyAxis ? energyFigures(summary) : []),
  ];
}

/**
 * The one figure on this sheet that may be refused — **and the whole of the refusal**.
 *
 * Exported because `report.test.ts` asserts both branches directly and because the honesty guard
 * wants a handle on it. The value is `summary.meanWaitS` formatted and **nothing else**: there is
 * no fallback arithmetic, no interpolation from the away-inside-a-minute share, and no rounding to
 * a friendlier number. The mockup's `28 + (100 − pct) × 0.9` is asserted absent.
 *
 * ## The `n` is published twice, from one place, and the second copy is not decoration
 *
 * `summary.waitCount` is the denominator this mean was taken over. It goes into the note, where the
 * grid draws it under the value, **and** into {@link ReportFigure.count}, where a consumer that
 * carries the cell somewhere else can still find it — the run-to-run delta block being the consumer
 * that could not, and GitHub issue #137 being what that cost. Both come off the same `summary` in
 * the same branch of the same function, so there is no second derivation to go stale: if the mean
 * moves, the count moves with it or neither does.
 *
 * The refusal above carries **no** count, and that is the rule rather than an omission. There is no
 * mean on that branch, so there is no sample a mean was taken over, and `n = 1 204` printed beside
 * the word `withheld` reads as a figure with a caveat rather than as a refusal. See
 * {@link ReportFigure.count}.
 */
export function averageWaitFigure(summary: VizSummary): ReportFigure {
  const publishable = summary.awtIsValid && !summary.saturated;
  if (!publishable) {
    return {
      id: 'average-wait',
      label: 'AVERAGE WAIT',
      value: WITHHELD,
      note:
        summary.awtInvalidReason ??
        'the queues never settled, so there is no cohort to take a mean over — see the small print',
      tone: 'withheld',
      axisOnly: false,
      /*
       * Read off the summary, never re-derived from the prose above it. `undefined` on a recording
       * older than schema 8, and on a run refused by `saturated` alone where `core` wrote no code:
       * the consumer's fallback is a ground-free sentence, which is what every consumer had before
       * codes existed. See {@link ReportFigure.suppressionGround}.
       */
      suppressionGround: summary.awtInvalidGround,
    };
  }
  return {
    id: 'average-wait',
    label: 'AVERAGE WAIT',
    value: `${summary.meanWaitS.toFixed(1)} s`,
    // R13 and § 7.4: a mean is not a figure without its window and its `n`.
    note: `over ${legCount(summary.waitCount, 'leg')} in the ${summary.reportWindow.id} window`,
    // The same denominator, structured, so it survives being carried off this grid. See above.
    count: summary.waitCount,
    tone: 'plain',
    axisOnly: false,
  };
}

/**
 * The count the sheet calls *took the stairs*, with its true cohort in the caption —
 * `docs/19` defect 3.
 *
 * ## The cohort, and the overlap the old caption hid
 *
 * `Observations.abandoned` counts **waits that crossed the abandonment horizon**, whether or not
 * a car eventually came — the handoff's *took the stairs* is a name for the attribute, not a
 * fourth disjoint outcome. On a saturated no-patience run nobody actually leaves, so every one of
 * those legs can still board and land inside CARRIED, and the sheet printed
 * `CARRIED 768 of 768 who turned up` beside `TOOK THE STAIRS 348` with nothing connecting them:
 * a reader trying to total the people gets 1 116 out of 768. The counts were both right and the
 * captions treated overlapping cells as adding ones.
 *
 * So the note states the overlap, from {@link Observations.abandonedCarried} — folded in the same
 * pass as both counts, so the three cannot disagree — and names the run's **own** horizon
 * ({@link Observations.horizonS}) rather than a hard-coded fifteen minutes. The three branches are
 * the three shapes the overlap takes; none of them re-states the cell's value, and the sentence
 * *overlap, not an addition* is the whole point of the cell carrying a note at all.
 *
 * A decision number is owed for the cohort captions (this note, the lever clause, the Casual lead
 * in `mode/casualDay.ts`, and the goal label's window); this docstring is the argument.
 */
function stairsNote(observations: Observations): string {
  const horizon = horizonLabelOf(observations.horizonS);
  const { abandoned, abandonedCarried } = observations;
  if (abandoned === 0) return `no wait crossed the ${horizon} give-up horizon`;
  if (abandonedCarried === abandoned) {
    return (
      `waited past the ${horizon} horizon before a car came — every one of them is inside ` +
      'CARRIED too, so these two cells overlap rather than add'
    );
  }
  if (abandonedCarried === 0) {
    return (
      `waited past the ${horizon} horizon and were never carried — they sit inside CARRIED’s ` +
      'denominator and not its count'
    );
  }
  return (
    `waited past the ${horizon} horizon — ${String(abandonedCarried)} of them were still carried ` +
    'and are inside CARRIED too; the rest were not'
  );
}

/** `15-minute` for a whole-minute horizon, `900 s` for anything else. The run's own number. */
function horizonLabelOf(horizonS: number): string {
  const minutes = horizonS / 60;
  return Number.isInteger(minutes) ? `${String(minutes)}-minute` : `${horizonS.toFixed(0)} s`;
}

/**
 * The longest wait in the window, and the word that keeps it honest.
 *
 * `longestWaitIsCensored` means the leg never boarded, so the number is a **lower bound** and the
 * sentence has to say *at least*. Drawing the censored and uncensored cases identically would put
 * the understatement precisely where the service is worst — `VizServiceLevel`'s own argument.
 *
 * ## The window is named in the cell, not only in the small print — `docs/19` defect 3
 *
 * This figure is `summary.serviceLevel.longestWaitS`, taken over the **reporting window**; the
 * goal row three blocks up grades `Observations.worstWaitS`, the **whole shift's** maximum. Every
 * shipped template narrows its window, so the two legitimately differ on the same sheet — 1 488 s
 * against 1 725 s on the audit's Midtown day — and the only reconciliation was the small print. A
 * reader who meets two “worst waits” four inches apart needs each labelled where it stands, so
 * the note carries the cell's own window inline and says which surface reads the whole shift.
 */
function worstWaitFigure(summary: VizSummary): ReportFigure {
  const { longestWaitS, longestWaitIsCensored } = summary.serviceLevel;
  if (longestWaitS === null) {
    return {
      id: 'worst-wait',
      label: 'WORST WAIT',
      value: NOT_RECORDED,
      note: 'the reporting window held no arrivals',
      tone: 'plain',
      axisOnly: false,
    };
  }
  const windowClause = `the ${summary.reportWindow.id} window’s worst — the goal row reads the whole shift`;
  return {
    id: 'worst-wait',
    label: 'WORST WAIT',
    value: `${longestWaitIsCensored ? 'at least ' : ''}${longestWaitS.toFixed(0)} s`,
    note: longestWaitIsCensored
      ? `a rider who never boarded — a lower bound, not their wait; ${windowClause}`
      : `one rider, and they remember it; ${windowClause}`,
    tone: longestWaitS > LONG_WORST_WAIT_S ? 'bad' : 'plain',
    axisOnly: false,
  };
}

/**
 * The wait, in seconds, above which this sheet already calls the longest one out of line.
 *
 * Named because it is now read twice — here, and by the *Weight fairness up* lever, which points at
 * a day whose worst wait is far out of line with its own away-inside-a-minute share. Two bare `120`s
 * would be two thresholds that agree today, which is the shape of defect this module keeps closing.
 * It is a **display** threshold and grades nothing: WORST WAIT is a maximum, not an estimate, and is
 * printed on every run whatever this constant says.
 */
const LONG_WORST_WAIT_S = 120;

/** *floor 12 at 08:37*, or the honest absence of one. Never a clock time the run did not have. */
function deepestQueueNote(observations: Observations, dayStartS: SimTime): string {
  if (observations.peakQueueFloorId === null || observations.peakQueueAtS === null) {
    return 'never more than a handful';
  }
  return `floor ${observations.peakQueueFloorId} at ${clockOf(observations.peakQueueAtS, dayStartS)}`;
}

/**
 * The pair. Both or neither, never ranked, never summed. See the module docstring and § D106.
 *
 * `deliveredLegCount` rides in the per-leg figure's note because it is that ratio's denominator and
 * R13 says an estimate over four legs is not the same claim as one over four hundred.
 */
function energyFigures(summary: VizSummary): readonly ReportFigure[] {
  const { energy } = summary;
  const measured = energy.measured;
  return [
    {
      id: 'energy-work',
      label: 'WORK DONE',
      value: measured && energy.workKJ !== null ? `${energy.workKJ.toFixed(0)} kJ` : NOT_RECORDED,
      note: 'out-of-balance mechanical work — an axis beside the waits, never a score',
      tone: 'unranked',
      axisOnly: true,
    },
    {
      id: 'energy-per-leg',
      label: 'WORK PER DELIVERED LEG',
      value:
        measured && energy.workPerServedLegKJ !== null
          ? `${energy.workPerServedLegKJ.toFixed(1)} kJ`
          : NOT_RECORDED,
      note: `over ${legCount(energy.deliveredLegCount, 'delivered leg')} — a day that spends less by carrying fewer people has saved nothing`,
      tone: 'unranked',
      axisOnly: true,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Where it went wrong — two rows, both of them events
 * -------------------------------------------------------------------------- */

/**
 * The two moments this run actually had, and nothing else.
 *
 * The mockup's `08:30` and `17:20` are gone. What replaces them is the instant the deepest queue
 * actually stood and the demand phase that instant actually fell in — and where the run does not
 * have one of those, the row says so rather than borrowing a plausible time from an office day this
 * simulator never ran (§ 4.1).
 *
 * ## The third row was never an event — issue #56
 *
 * A `report-window` row sat here, timestamped and styled exactly like the two above it, saying
 * *"Every cohort figure above is the peak-5min window"*. It is a **methodology footnote**: it is
 * word-for-word identical on a flawless day and a collapsed one, only the timestamps move, and
 * nothing happened at the clock time it carried. Somebody skimming read it as a third thing that
 * went wrong at 06:12; somebody reading carefully had to work out that it was not. It is genuinely
 * load-bearing information, so it was moved rather than dropped — {@link smallPrintFor} now carries
 * it, beside the other caveat about what one day can be read to mean.
 *
 * ## The tones follow the verdict, because a colour is a claim
 *
 * `diagnosisRowsOf` in `dev/reportPanel.ts` says it: *a row with nothing to flag gets the ordinary
 * edge, not a colour that implies a verdict*. The queue row was unconditionally `bad`, so a nine-deep
 * landing on a day that met every bar was drawn in the same red as an 892-deep one that did not.
 * The verdict is the same value the heading and the headline come from, so the section cannot flag
 * a fault on a sheet whose banner says there was none.
 */
function diagnosisFor(
  recording: VizRecording,
  observations: Observations,
  dayStartS: SimTime,
  verdict: ShiftVerdict,
): readonly ReportDiagnosis[] {
  const at = observations.peakQueueAtS;
  const floorId = observations.peakQueueFloorId;
  const phase = at === null ? undefined : recording.demandPhases.find((p) => at >= p.startS && at < p.endS);
  const missed = verdict === 'missed';
  const queueTone: FigureTone = missed ? 'bad' : 'plain';
  const phaseTone: FigureTone = missed ? 'caution' : 'plain';
  /*
   * Built once and appended to both populated rows, because both are readings of the **same
   * instant** — see {@link windowRelationClause}. `''` when there is no such instant, which is
   * exactly the branch on which neither row is drawn with one.
   */
  const windowRelation =
    at === null ? '' : ` ${windowRelationClause(at, recording.summary.reportWindow)}`;

  const queueRow: ReportDiagnosis =
    at === null || floorId === null
      ? {
          id: 'peak-queue',
          when: '—',
          what: 'No pile-up worth naming',
          why: 'Demand stayed under what the group could clear, all day.',
          tone: 'plain',
        }
      : {
          id: 'peak-queue',
          when: clockOf(at, dayStartS),
          what: `Floor ${floorId} stacked ${String(observations.peakQueue)} deep`,
          why:
            'Every car was committed elsewhere when the calls landed together. Batch arrivals are ' +
            'the normal case, not the unlucky one — people travel in groups.' +
            windowRelation,
          tone: queueTone,
        };

  const phaseRow: ReportDiagnosis =
    phase === undefined
      ? {
          id: 'peak-phase',
          when: '—',
          what:
            recording.demandPhases.length === 0
              ? 'This recording carries no demand schedule'
              : 'The worst moment fell outside every demand phase',
          why:
            'The timeline’s segments are the resolved demand template’s own phases, so a run ' +
            'recorded before that field existed has none to name. No phase is invented to fill ' +
            'the gap — a label that does not describe the demand under it is the thing this sheet ' +
            'exists to avoid.',
          tone: 'plain',
        }
      : {
          id: 'peak-phase',
          when: clockRange(phase.startS, phase.endS, dayStartS),
          what: `The worst of it landed in ${phase.label}${rateClause(phase.ratePctPop5min)}`,
          why:
            'Round-trip time is what limits you inside a peak, not car speed. A stop costs about ' +
            '10 s of door and transfer time however fast the motor is, so the way out of a peak is ' +
            'fewer stops per trip rather than a quicker one.' +
            /*
             * The **same instant** the row above names, deliberately: this row's phase is the phase
             * that instant fell in, not a span of its own, so relating the phase's own bounds to the
             * window would answer a question the row does not ask (a phase and a window can overlap
             * three different ways, and none of the three is what *the worst of it* refers to).
             */
            windowRelation,
          tone: phaseTone,
        };

  return [queueRow, phaseRow];
}

/**
 * Where the worst moment sits relative to the window the means are read over — `docs/20` defect 6.
 *
 * ## The two windows this reconciles
 *
 * The sheet publishes both and, until this clause, said so only in the small print. *The tightest
 * moment* / *Where it went wrong* is the **whole shift's** deepest queue and the demand phase that
 * instant fell in; the figure grid four inches up quotes means over `summary.reportWindow`. On the
 * audit's Chancery day those were **08:50** and **08:42–08:47** — a reader is shown a heading
 * calling one span *the worst of it* and a mean taken from another, with nothing on either saying
 * they are different spans.
 *
 * `worstWaitFigure` is the precedent and it is exact: two *worst wait* numbers four inches apart
 * were reconciled by putting each cell's own window in its own note, inline, rather than by a
 * footnote a reader has to go and find. This is that treatment applied to the rows.
 *
 * ## Why it is measured rather than boilerplate
 *
 * The clause states which of the two cases this run is in, from the run's own numbers. A fixed
 * sentence — *"this row reads the whole shift"* — would be true and would still leave a reader
 * doing the arithmetic on every sheet, including the many sheets where the two agree and there is
 * nothing to reconcile. Saying *inside* when it is inside is what makes *outside* worth reading.
 *
 * The window is named by its **id**, not by its clock span, for {@link windowQualifierOf}'s reason:
 * these rows sit under a heading a reader arrives at from the figure grid, and a clock time dropped
 * into an explanatory sentence beside the words *mean* and *average* is the numeral-in-a-caption
 * shape the honesty search has already caught on this sheet once. The span is printed in the small
 * print, in full, where nothing else on the line is an estimate cue.
 */
function windowRelationClause(atS: SimTime, reportWindow: VizSummary['reportWindow']): string {
  const inside = atS >= reportWindow.startS && atS < reportWindow.endS;
  return inside
    ? `That instant is inside the ${reportWindow.id} window the means above are read over.`
    : `That instant is outside the ${reportWindow.id} window the means above are read over — the ` +
      'worst moment of the day and the waits quoted up there are two different parts of it, and ' +
      'both are true.';
}

/** ` at 12.4 %pop/5min`, or nothing when the record carried no population to divide by. */
function rateClause(ratePctPop5min: number | null): string {
  return ratePctPop5min === null ? '' : `, at ${ratePctPop5min.toFixed(1)} %pop/5min`;
}

/* -------------------------------------------------------------------------- *
 * The rest of the sheet
 * -------------------------------------------------------------------------- */

/**
 * The four levers, verbatim from `design.html` :332–340 — the **glossary**, before this run is read.
 *
 * Kept word for word because every one of them is *true of this simulator*: a car is a `CarConfig`,
 * zoning is a bank's `servesFloors`, fairness is a weight in `data/dispatcher-profiles.json`, and
 * destination dispatch is Phase 6's `passengerAssignment: 'panel'`. The one sentence that would
 * have needed re-sourcing — a claim that destination dispatch does better *because* authorization
 * and optimization happen in one step — is not among them; see CLAUDE.md on the seven places that
 * claim was corrected.
 *
 * {@link leversFor} is what a reader is shown. This array is its input, and the order here is the
 * order a run that points nowhere gets.
 */
const LEVERS: readonly ReportLever[] = Object.freeze([
  Object.freeze({
    id: 'add-a-car',
    title: 'Add a car',
    body: 'The blunt instrument. Costs a shaft, works immediately, and the Building tab will let you feel how much it buys.',
  }),
  Object.freeze({
    id: 'zone-the-tower',
    title: 'Zone the tower',
    body: 'Split the floors between cars during the peak only. Superb while the peak holds, wasteful the moment it eases.',
  }),
  Object.freeze({
    id: 'weight-fairness',
    title: 'Weight fairness up',
    body: 'Rescue the forgotten floor rather than shaving seconds off the easy calls. Your worst wait falls; your average may not.',
  }),
  Object.freeze({
    id: 'ask-destination',
    title: 'Ask where they’re going',
    body: 'Destination dispatch pools riders by destination in the lobby, which cuts stops per trip — the thing that actually costs time.',
  }),
]);

/**
 * The levers this run points at, first — and the one it does not have, absent.
 *
 * ## What was wrong — issue #55
 *
 * All four cards were a frozen constant, byte-identical on a flawless day and a collapsed one. The
 * section is captioned as advice for *this* day and sits directly under a diagnosis that
 * interpolates real values, so it reads as a diagnosis and is a glossary: a player acts on it the
 * first time, notices on the second run that it never moved, and stops trusting the section.
 *
 * ## What this does, and the line it does not cross
 *
 * Each card is matched against an **observation** — a count, or a count against the bar today's own
 * goals set. A card the run points at leads, and its body opens with the observation that pointed
 * there. A card the run does not point at keeps the handoff's sentence exactly and moves below.
 *
 * The clause says *what this day showed*, never *what the lever will buy*. That distinction is the
 * whole of CLAUDE.md's statistical discipline on this surface: ordering four pieces of advice by
 * which observation fired is not a performance claim, and one replication cannot support one.
 * {@link smallPrintFor} says so in the reader's own words, under the cards.
 *
 * ## A lever you have already pulled is not a lever you have
 *
 * *Ask where they're going* is dropped outright when `recording.passengerModel` is already
 * `destination-dispatch`. `core` computes that field from the resolved dispatch stage and the
 * viewer never re-derives it (`VizRecording.passengerModel` — *"the one field a renderer branches
 * on"*), so this is the run's own answer rather than a guess from the profile id.
 */
function leversFor(
  recording: VizRecording,
  observations: Observations,
  summary: VizSummary,
  readings: readonly GoalReading[],
): readonly ReportLever[] {
  const pointers = leverPointersFor(recording, observations, summary, readings);
  const available = LEVERS.filter(
    (lever) =>
      !(lever.id === 'ask-destination' && recording.passengerModel === 'destination-dispatch'),
  );
  // Stable within each half, so a run that points at nothing gets the handoff's own order back.
  const pointed = available.filter((lever) => pointers.has(lever.id));
  const rest = available.filter((lever) => !pointers.has(lever.id));
  return [...pointed, ...rest].map((lever) => {
    const because = pointers.get(lever.id);
    return because === undefined
      ? lever
      : { ...lever, body: `Today points here: ${because}. ${lever.body}` };
  });
}

/**
 * Which levers this run points at, and the observation that points there.
 *
 * Every entry is a **count** or a count read against a bar the day itself stated. Nothing here reads
 * `meanWaitS`, `wait95S` or `meanTimeToDestinationS`: those are the three quantities `awtIsValid`
 * speaks for, and a card that appeared or disappeared on a suppressed figure would be that figure
 * published through the back door (`docs/10` R9).
 *
 * The map is built in the order the cards are declared in, so ties keep the handoff's ordering.
 */
function leverPointersFor(
  recording: VizRecording,
  observations: Observations,
  summary: VizSummary,
  readings: readonly GoalReading[],
): ReadonlyMap<string, string> {
  const pointers = new Map<string, string>();
  const missedGoal = (reads: ShiftGoal['reads']): boolean =>
    readings.some((reading) => reading.goal.reads === reads && reading.state === 'missed');

  /*
   * Add a car — the group ran out of capacity. Three counts, any of which is that fact: a backlog
   * still growing at the horizon, legs that never boarded, and riders who left. None is an estimate.
   */
  const outrun: string[] = [];
  if (summary.saturated) outrun.push('the backlog was still growing when the window closed');
  /*
   * Both clauses pluralise, and the singular is the case that was wrong — issue #134. They read
   * `1 legs never boarded at all` and `1 riders gave up and took the stairs`, which is the count a
   * *good* day produces and therefore the day this sheet most needs to be believed on.
   *
   * It matters more than a typo because of what these two clauses are about. A leg that never
   * boarded and a rider who gave up are **two of the four outcomes this product refuses to fold
   * together** (§ D266) — they are not "served fewer people", and they are printed here precisely so
   * a reader cannot mistake one for the other. A sentence that reads as an unfilled template teaches
   * the reader that this line is boilerplate, at the moment it is carrying a real and unusual fact.
   *
   * The `${n === 1 ? '' : 's'}` form is this file's own, used by the clean-shift line below rather
   * than imported: `mode/disclosure.ts`'s `plural` is module-private, and exporting it to spend two
   * words here would add a `shift/` → `mode/` edge for nothing.
   */
  if (summary.unservedCount > 0) {
    const legs = summary.unservedCount;
    outrun.push(`${String(legs)} leg${legs === 1 ? '' : 's'} never boarded at all`);
  }
  if (observations.abandoned > 0) {
    /*
     * *Waited past the horizon*, not *gave up and took the stairs* — `docs/19` defect 3. The count
     * is an attribute of a wait, and on a no-patience run every one of these riders was still
     * carried; a clause that said they left, beside a CARRIED cell that counts them, was the sheet
     * contradicting itself. The stairs figure's own note states the overlap; this clause only has
     * to stop claiming the opposite.
     */
    const gaveUp = observations.abandoned;
    outrun.push(
      `${String(gaveUp)} rider${gaveUp === 1 ? '' : 's'} waited past the give-up horizon`,
    );
  }
  if (outrun.length > 0) pointers.set('add-a-car', listOf(outrun));

  /*
   * Zone the tower — the pile-up sat on one landing rather than spreading over the tower. The bar is
   * **today's own** queue goal where the day set one (every shipped day does, since `goalsForDay`
   * retired the odd-day alternation), so this is the run measured against what the run was asked
   * for rather than against a number invented here. Where there is no queue goal — a sheet built
   * over a custom goal list — the sheet's own DEEPEST QUEUE tone bar stands in, the same
   * threshold the cell above is already coloured by.
   */
  const floorId = observations.peakQueueFloorId;
  const deep = missedGoal('peakQueue') || observations.peakQueue > DEEP_QUEUE;
  if (floorId !== null && deep) {
    pointers.set(
      'zone-the-tower',
      `floor ${floorId} stood ${String(observations.peakQueue)} deep at its worst`,
    );
  }

  /*
   * Weight fairness up — the forgotten-floor shape, and it is a shape rather than a level: most
   * riders away quickly *and* somebody left standing far longer than the rest. The card's own
   * sentence is that trade in as many words (*your worst wait falls; your average may not*), so it
   * is the card a day of that shape points at. A day where nobody was away quickly is an
   * out-of-capacity day, and the first card above already has it.
   */
  const { longestWaitS, longestWaitIsCensored } = summary.serviceLevel;
  if (
    longestWaitS !== null &&
    longestWaitS > LONG_WORST_WAIT_S &&
    !missedGoal('minutePct') &&
    observations.servedLegs > 0
  ) {
    const bound = longestWaitIsCensored ? 'at least ' : '';
    pointers.set(
      'weight-fairness',
      `${String(observations.minutePct)}% of riders were away inside a minute and one still ` +
        `waited ${bound}${longestWaitS.toFixed(0)} s`,
    );
  }

  /*
   * Ask where they're going — the card's own sentence says destination dispatch pools riders *in
   * the lobby*, so the observation that points at it is a pile-up that stood on an entrance floor.
   * `VizFloor.isEntrance` is the building's own answer; nothing here infers a lobby from a floor id.
   *
   * Deliberately **not** keyed on stops per trip, which is what the card actually claims to cut: no
   * figure on this recording reports it, and pointing at the card with an observation that does not
   * measure the thing named would be the caption-that-does-not-describe-the-picture failure again.
   */
  const entrance =
    floorId === null
      ? undefined
      : recording.floors.find((floor) => floor.id === floorId && floor.isEntrance);
  if (entrance !== undefined && deep) {
    pointers.set(
      'ask-destination',
      `the deepest queue of the day stood at ${entrance.label ?? entrance.id}, an entrance floor`,
    );
  }

  return pointers;
}

/** The queue depth above which DEEPEST QUEUE is already drawn hot. Read twice; see {@link LONG_WORST_WAIT_S}. */
const DEEP_QUEUE = 24;

/**
 * The design's streak sentences (`design.html` :3499), with a third for the day nobody judged.
 *
 * Takes the {@link ShiftJudgement}'s verdict rather than a second `allMet` boolean, so the streak
 * cannot reset on a day the banner above it calls cleared — § D237 — and, since § D234, so the
 * ungraded arm is reached through the **same** value the banner is. A `graded` boolean beside the
 * verdict would have been a second answer to a question the verdict already contains, which is the
 * shape both decisions exist to refuse.
 *
 * The ungraded sentence is § D234's, and it is a statement about the week rather than a kindness:
 * *"Streak reset"* names something taken away, and the play-tester had nothing to take — two
 * perfect-but-ungraded days, each announced as a loss. `closeDay` now leaves the streak alone on
 * an ungraded day, keyed on the same `wasGraded` this verdict is, so the sheet and the arithmetic
 * move together or neither does.
 *
 * Exhaustive over the verdict rather than an `if` chain with a fallthrough: a fourth verdict must be
 * a compile error here, for {@link VERDICT_VOICE}'s reason.
 */
function streakLineFor(verdict: ShiftVerdict, streak: number): string {
  switch (verdict) {
    case 'missed':
      return 'Streak reset. The building keeps growing either way — nothing here is a game over.';
    case 'ungraded':
      return streak > 0
        ? `Nothing was graded, so your streak of ${String(streak)} stands. The building keeps growing either way.`
        : 'Nothing was graded, so nothing was lost. The building keeps growing either way — nothing here is a game over.';
    case 'cleared':
      return streak === 1
        ? 'First clean day. Streak started.'
        : `${String(streak)} clean days in a row.`;
  }
}

function contractLineFor(contract: ScenarioContract | undefined, week: WeekState): string {
  if (contract === undefined) {
    /*
     * Two ways to have no contract, and they are not the same sentence.
     *
     * *No contract* has meant one thing since the shift layer landed — a building no scenario runs,
     * which a reader drew or restored — and the endless week deliberately reuses that path
     * (`shift/week.ts`'s `ENDLESS_CONTRACT_ID`, a sentinel rather than a type change). Reusing the
     * path is right; reusing the *wording* would tell a player who pressed **Keep going** on Midtown
     * Office that they are on their own building, which is false in the one way a reader would act
     * on: they would go looking for the scenario they think they lost.
     */
    if (week.contractId === ENDLESS_CONTRACT_ID) {
      return 'Endless — no assignment, so nothing is banked and nothing clears. The building grows anyway.';
    }
    return 'Your own building — nothing is being banked, and the goals are still read from what happened.';
  }
  // SC-05/DR-09 (§ D198): `cleanRun` keeps counting on a contract already cleared, so the raw
  // figure can read "2 of 1". The clamp is on the display only — the data keeps its truth.
  const banked = Math.min(week.cleanRun, contract.needClean);
  return (
    `${contract.label} — ${contract.title} · ${String(banked)} of ` +
    `${String(contract.needClean)} clean shifts banked`
  );
}

/**
 * Tomorrow's card.
 *
 * The design prints a flat *"+11% more tenants than today"*. It is 11 % of **day one**, not of
 * today, because growth is linear (`1 + 0.11 × (day − 1)`) — so on day 5 tomorrow is 7.6 % busier
 * than today, not 11 %. The true figure is computed rather than the constant repeated: a number on
 * a forecast card is a claim, and this one is checkable against `growthFactor`.
 *
 * ## The name is a claim too, and it was the wrong one — GitHub issue #135
 *
 * This was `eventFor(day + 1, nextIdx)`, the ordinary schedule, on a card whose whole job is to say
 * what tomorrow will be. The run tomorrow gets is built by `dev/state.ts#shiftRunConfigOf`, which
 * lets the calendar overrule that schedule, so under `moving-week` the card named an event the
 * player would not meet. It goes through `shift/calendar.ts#scheduledEventFor` now — the same
 * expression the run is built from, rather than a second one that agrees on ordinary weeks.
 *
 * The percentage was already measured through the shipped chain and the name now is too, which is
 * the property worth stating in one place: **every claim on this card is derived the way the thing
 * it predicts is derived.**
 */
function forecastFor(
  calendar: CalendarPeriod | null,
  day: number,
  nextIdx: number,
): ReportForecast {
  const event = scheduledEventFor(calendar, day + 1, nextIdx);
  const increase = (growthFactor(day + 1) / growthFactor(day) - 1) * 100;
  return {
    name: event.name,
    note: event.note,
    demand: `+${increase.toFixed(1)}% more tenants than today`,
  };
}

/**
 * *What this taught* — the design's two branches (`design.html` :3506), plus the one the design
 * could not reach.
 *
 * ## The already-cleared branch — `docs/19` defect 9
 *
 * The *Bank N more…* arm kept printing after the scenario was done: `week.cleared` is the banner
 * of the **day that earned it** and `nextDay` clears it on purpose, so every later day on a
 * cleared scenario fell through to `Bank 0 more clean shifts on this building and the next
 * assignment opens` — a count of nothing, promising a door already open. The branch's condition is
 * `contractStatus`, which is the **same expression** the scenario card reads
 * (`week.completed.includes(id)`) and the negation of the guard `closeDay` clears on
 * (`!base.completed.includes(contract.id)`) — derived, not restated, so this line and the card
 * cannot disagree about whether the assignment stands cleared.
 */
function taughtFor(contract: ScenarioContract | undefined, week: WeekState): string {
  if (week.cleared !== null) return `Cleared: ${week.cleared.reward}.`;
  if (contract === undefined) {
    return 'A building you drew yourself. Nothing banks here — the sheet is the whole reward.';
  }
  if (contractStatus(week, contract.id) === 'cleared') {
    return (
      `${contract.label} is already cleared, and its reward is open: ${contract.reward}. ` +
      'Nothing more banks against it — days here keep the streak, and the sheet is the reward now.'
    );
  }
  const left = Math.max(0, contract.needClean - week.cleanRun);
  return (
    `Bank ${String(left)} more clean shift${left === 1 ? '' : 's'} on this building and the next ` +
    `assignment opens: ${contract.reward}.`
  );
}

/**
 * The small print, verbatim from `design.html` :3484 — and the best sentence in the handoff.
 *
 * It is this project's thesis in a reader's own words: CLAUDE.md's *"never declare one dispatcher
 * better than another without a paired-t confidence interval that excludes zero"* and its 50–200
 * replication budget, said to somebody who has just watched one day and wants to conclude something
 * from it. Not paraphrased, not shortened, and not made conditional on the day having gone badly.
 *
 * ## Two clauses were added under it, and both were homeless before
 *
 * **The reporting window.** It used to be the third row of *Where it went wrong*, timestamped and
 * styled like an incident, which it never was (issue #56). It belongs with the other statement about
 * what a reader may conclude, so it is here — and the numeral stays a **word**, for the reason
 * `diagnosisFor` used to carry: the honesty search found the sentence printing `25` three rows under
 * a cell reading `AVERAGE WAIT: withheld`, on a run whose own refused `meanWaitS` rounds to 25, and
 * a carve-out for *numerals inside quotation marks* would be a rule with a hiding place in it.
 *
 * **The levers.** {@link leversFor} now orders the cards by which observation this run fired, which
 * is a statement about the day and would be read as a statement about the levers if nothing said
 * otherwise. This is what says otherwise, in the same breath as the refusal it belongs to.
 *
 * ## The window clause stopped calling itself the busiest five minutes — `docs/20` defect 5
 *
 * The illustration was fixed prose: *"“Riders waited twenty-five seconds on average” is false
 * without **“during the busiest five minutes”**"*. On Garden Apartments day 1 the sheet printed
 * that under two withheld figures, about a window that held **none of the day's forty arrivals** —
 * so the one thing it claimed about the window was the one thing that could not be true of it.
 *
 * It is not rescued by the window's id, and that is the part worth reading. `summary.reportWindow`
 * is labelled `peak-5min` whenever it is 300 s long, and there are two entirely different windows
 * that get that label: the one `core` finds by **searching the arrivals** for their busiest five
 * minutes (`resolveWindow`'s `'peak-5min'` selection), and the one the **demand template declares**
 * at a fixed position in its schedule (`simulation.ts#traceReportWindow`). The shift path has only
 * ever produced the second, and the second is *busiest* only by coincidence. A caption cannot ask
 * the id which it is looking at.
 *
 * So the sentence says what the window **is** — its clock span, which it already prints — instead
 * of how it was chosen. {@link windowQualifierOf} words it, and the whole-shift arm gets its own
 * phrase because *between 06:00 and 07:00* is a silly way to say *all day*.
 */
function smallPrintFor(
  dispatcherName: string,
  summary: VizSummary,
  dayStartS: SimTime,
): string {
  const { reportWindow } = summary;
  return (
    'This is one replication of one day on one seed. It cannot tell you that ' +
    `${dispatcherName.toLowerCase()} is better than anything — that needs 50 or more paired runs ` +
    'against the same passengers, and a confidence interval that excludes zero. What it can tell ' +
    'you is what happened today, and today is where the queue was. ' +
    `Every cohort figure above is the ${reportWindow.id} window, ` +
    `${clockRange(reportWindow.startS, reportWindow.endS, dayStartS)}: “Riders waited twenty-five ` +
    `seconds on average” is false without “${windowQualifierOf(reportWindow)}”. ` +
    'The counts — carried, ' +
    'took the stairs, the deepest queue, and every goal reading above, the worst-wait bar ' +
    'included — are over the whole shift; the means and the WORST WAIT figure are over that ' +
    'window and nothing else. ' +
    /*
     * `docs/20` defect 6, and the sentence the two windows needed. *The tightest moment* and *the
     * worst of it* are the whole shift's deepest queue and the demand phase it fell in — 08:50 and
     * 08:47–09:00 on the audit's Chancery day — while the means directly above them were taken over
     * 08:42–08:47. A reader who meets a heading calling one span *the worst of it* and a figure
     * grid quoting waits from another has been handed two windows and told about neither.
     *
     * Said here **as well as** on the rows themselves ({@link diagnosisFor} labels each inline,
     * `worstWaitFigure`'s precedent) because this is the paragraph a reader goes to when the two
     * disagree, and a reconciliation that lives only on the thing being reconciled is not one.
     */
    'The two rows under the heading above read the whole shift too: the deepest queue is the ' +
    'deepest of the day and the phase named beside it is the phase that instant fell in, so the ' +
    'worst moment on this sheet need not be inside the window the means came from. Where it is ' +
    'not, both are true and neither is a correction of the other. ' +
    'The levers above are ordered by what today showed, never by what any of them is worth: which ' +
    'one helps this building is the question that needs the paired runs, not the one day.'
  );
}

/**
 * How a reader must qualify a wait quoted from this window — the clause inside the small print's
 * illustration, and the one `docs/20` defect 5 found asserting a peak nobody had measured.
 *
 * A **reference**, never a superlative. See {@link smallPrintFor}'s closing section for why the
 * window's id cannot license *the busiest five minutes*: two entirely different windows carry the
 * label `peak-5min` and only one of them was chosen by counting arrivals.
 *
 * ## Why *that window* and not the clock span
 *
 * The span is the obvious replacement and it is the wrong one **here**, for the reason this
 * function's caller documents at length: the illustration is a sentence with the word *average* in
 * it, and this clause sits four words away inside quotation marks. The honesty search has already
 * found this exact paragraph printing `25` under a cell reading `AVERAGE WAIT: withheld` on a run
 * whose refused mean rounded to 25, and the fix was that the numeral became a **word**. Putting a
 * clock time back inside the same quotation marks would be re-opening the hiding place a carve-out
 * for *numerals inside quotes* was refused for.
 *
 * It costs nothing, because the span is stated **immediately before the colon** by the caller, in
 * the same breath — *"Every cohort figure above is the peak-5min window, 08:42–08:47:"*. *That
 * window* has an antecedent eight words back.
 *
 * The whole-shift arm is worded rather than referred, because a sheet whose window is the whole day
 * has no narrowing for a reader to remember, and *over the whole shift* is also the phrase
 * `honesty/properties.ts#NAMES_ITS_OWN_WINDOW` recognises — which is not a coincidence: a figure
 * that names its own window in those words is the shape that rule exists to permit.
 */
function windowQualifierOf(reportWindow: VizSummary['reportWindow']): string {
  return reportWindow.id === 'full-run' ? 'over the whole shift' : 'during that window';
}

/* -------------------------------------------------------------------------- *
 * The shift clock
 * -------------------------------------------------------------------------- */

/**
 * `dayStartS + simTimeS`, as `HH:MM`.
 *
 * The whole of the shift clock, and it adds no information: `simTimeS` is the kernel's, so
 * CLAUDE.md invariant 3 is untouched — nothing here reads a wall clock, it renames one the
 * simulation already produced. Wrapped modulo 24 hours so a long run cannot print `26:10`.
 *
 * Exported because the header band and the transport's o'clock ticks need the same mapping, and two
 * implementations of *what time is it in this building* would disagree about the same instant.
 */
export function clockOf(simTimeS: SimTime, dayStartS: SimTime = DAY_START_S): string {
  const total = Math.floor(dayStartS + simTimeS);
  const wrapped = ((total % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `06:00–06:30`. An en dash, matching the design's own ranges. */
export function clockRange(startS: SimTime, endS: SimTime, dayStartS: SimTime = DAY_START_S): string {
  return `${clockOf(startS, dayStartS)}–${clockOf(endS, dayStartS)}`;
}
