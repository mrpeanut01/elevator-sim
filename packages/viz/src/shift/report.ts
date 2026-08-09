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

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording, VizSummary } from '../contract/types.js';

import { eventFor } from './events.js';
import { readGoals } from './goals.js';
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
 * ## What this still cannot see, said here rather than left to be discovered
 *
 * The **event an authored calendar writes over a day**. {@link demand}'s week-day arm names the
 * day's `event.id`, and it names the one the *sheet* was handed: `dev/main.ts#closeShift` derives it
 * as `eventFor(week.day, week.dayIdx)`, the ordinary schedule. `dev/state.ts#shiftRunConfigOf`
 * derives the event the **run** was under differently — it consults `calendarDayFor(state.calendar,
 * …)` first, because a period may name today's event (`moving-week` is *`move-in` every day*). Where
 * a calendar overrides, the two disagree, and two days that ran under different events pair as one
 * question.
 *
 * Two ordinary days under two different events **are** refused, which is the half that works and is
 * asserted in `reportPanel.test.ts`. The gap is one file wide and it is the shell's: `closeShift`
 * would have to be handed the event the run actually used. Named here and pinned by a case rather
 * than claimed shut — § D227, a limitation described only in prose is a limitation that goes stale.
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
   * What was booked against **today** — not tomorrow, which the forecast card derives itself.
   *
   * Read by {@link bookedLine}, and for a long time by nothing at all: see that function for what
   * the sheet was missing while this field sat unread.
   */
  readonly event: ShiftEvent;
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
    ...attemptLine(subject, week.attempt),
  ];
}

/**
 * What was booked against today — {@link DayReportInput.event}'s first reader.
 *
 * ## The finding this closes
 *
 * The field was destructured and read by **nothing**. The forecast card names *tomorrow's* event,
 * derived independently through `eventFor(day + 1, …)`, and the sheet named today's nowhere — so a
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
    goals: readings,
    diagnosis: diagnosisFor(recording, observations, dayStartS, judgement.verdict),
    levers: leversFor(recording, observations, summary, readings),
    smallPrint: smallPrintFor(dispatcherName, summary, dayStartS),
  };

  if (subject.kind === 'single-run') {
    return { ...core, of: 'single-run' };
  }

  const nextIdx = (week.dayIdx + 1) % 7;
  return {
    ...core,
    of: 'week-day',
    streakLine: streakLineFor(judgement.verdict, week.streak),
    contractLine: contractLineFor(contract, week),
    cleared: week.cleared,
    forecast: forecastFor(week.day, nextIdx),
    taught: taughtFor(contract, week),
    nextDayName: weekdayOf(nextIdx),
  };
}

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
      note: `an observation, never suppressed — over ${String(observations.servedLegs)} served legs`,
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
      note: 'waited past the 15-minute horizon',
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
    note: `over ${String(summary.waitCount)} legs in the ${summary.reportWindow.id} window`,
    tone: 'plain',
    axisOnly: false,
  };
}

/**
 * The longest wait in the window, and the word that keeps it honest.
 *
 * `longestWaitIsCensored` means the leg never boarded, so the number is a **lower bound** and the
 * sentence has to say *at least*. Drawing the censored and uncensored cases identically would put
 * the understatement precisely where the service is worst — `VizServiceLevel`'s own argument.
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
  return {
    id: 'worst-wait',
    label: 'WORST WAIT',
    value: `${longestWaitIsCensored ? 'at least ' : ''}${longestWaitS.toFixed(0)} s`,
    note: longestWaitIsCensored
      ? 'a rider who never boarded — this is a lower bound, not their wait'
      : 'one rider, and they remember it',
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
      note: `over ${String(energy.deliveredLegCount)} delivered legs — a day that spends less by carrying fewer people has saved nothing`,
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
            'the normal case, not the unlucky one — people travel in groups.',
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
            'fewer stops per trip rather than a quicker one.',
          tone: phaseTone,
        };

  return [queueRow, phaseRow];
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
  if (summary.unservedCount > 0) {
    outrun.push(`${String(summary.unservedCount)} legs never boarded at all`);
  }
  if (observations.abandoned > 0) {
    outrun.push(`${String(observations.abandoned)} riders gave up and took the stairs`);
  }
  if (outrun.length > 0) pointers.set('add-a-car', listOf(outrun));

  /*
   * Zone the tower — the pile-up sat on one landing rather than spreading over the tower. The bar is
   * **today's own** queue goal where the day set one (even days do; odd days grade abandonment
   * instead), so this is the run measured against what the run was asked for rather than against a
   * number invented here. Where there is no queue goal, the sheet's own DEEPEST QUEUE tone bar
   * stands in — the same threshold the cell above is already coloured by.
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
 */
function forecastFor(day: number, nextIdx: number): ReportForecast {
  const event = eventFor(day + 1, nextIdx);
  const increase = (growthFactor(day + 1) / growthFactor(day) - 1) * 100;
  return {
    name: event.name,
    note: event.note,
    demand: `+${increase.toFixed(1)}% more tenants than today`,
  };
}

/** *What this taught* — the design's two branches (`design.html` :3506). */
function taughtFor(contract: ScenarioContract | undefined, week: WeekState): string {
  if (week.cleared !== null) return `Cleared: ${week.cleared.reward}.`;
  if (contract === undefined) {
    return 'A building you drew yourself. Nothing banks here — the sheet is the whole reward.';
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
    'seconds on average” is false without “during the busiest five minutes”. The counts — carried, ' +
    'took the stairs, the deepest queue — are over the whole shift; the means and the longest wait ' +
    'are over that window and nothing else. ' +
    'The levers above are ordered by what today showed, never by what any of them is worth: which ' +
    'one helps this building is the question that needs the paired runs, not the one day.'
  );
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
