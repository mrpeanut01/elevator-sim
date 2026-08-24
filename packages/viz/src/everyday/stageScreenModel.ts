/**
 * **The § 7 stage's pure half** — every word it says, every figure it publishes, the transport's
 * one speed table, and the cutaway's arithmetic. No document, no canvas, no clock.
 *
 * `everyday/stageScreen.ts` is the DOM half and owns exactly three things this file cannot: the
 * elements, the `requestAnimationFrame` loop, and the canvas sizing. Everything a reader *reads*
 * is decided here, which is what lets the honesty sweep drive the screen without a browser — the
 * same split `fixitScreenModel.ts` and `settingsView.ts` keep.
 *
 * ## The one rule this file is built around: no whole-run figure at a part-way playhead
 *
 * § D293, and § D307's temporal axis which found two surfaces breaking it. Every figure below is
 * folded at the playhead by `live/observations.ts#observationsAt` — a count of things that had
 * happened by `t`, or the age of somebody standing there right now — and **nothing here reads
 * `summary.meanWaitS`, `summary.wait95S`, `summary.meanTimeToDestinationS` or
 * `summary.serviceLevel.longestWaitS`.** Not because they are suppressed on this run (they may not
 * be), but because they are statements about the *whole* run and the stage is drawn at an instant
 * short of it. The stage banner § D307 caught read *127 undelivered at 00:00*; this screen cannot
 * produce that sentence because it has no field to produce it from.
 *
 * The one figure that is an estimate rather than a count — *away inside a minute* — carries its
 * own denominator (R13) and refuses outright before anybody has boarded, because
 * {@link LiveObservations.servedUnderThresholdPct} is `undefined` there rather than `100`.
 *
 * ## The wait ramp is `live/bands.ts`', and the boundaries are a stated deviation from § 7.2
 *
 * § 7.2 writes the ramp as *green under 30 s, amber to 75 s, terracotta to 150 s, grey once they
 * have taken the stairs*. {@link WAIT_BANDS} — the simulator's own banding, § D251's single source
 * for every wait-age claim on every surface — puts the boundaries at **30 / 60 / 120**. This screen
 * follows `WAIT_BANDS`, and the reason is the standing rule rather than a preference: the handoff
 * wins what the screen *looks like* and the simulator wins what a number *means*, and a boundary is
 * a number. The band members also carry fixed prose elsewhere (*checking watch* is a claim about a
 * minute), so 75 s under that label would be the caption-stops-describing-the-picture defect
 * `live/bands.ts` exists to prevent. A second ramp authored here would be an eleventh copy of a
 * palette; what is authored here is the **mapping** from band id to § 19's paper-mode ink, because
 * `WAIT_BANDS.color` is a CSS custom property name and *"nothing here may be handed to a canvas"*.
 *
 * ## § 7.3's *"paused, at 06:00"* is the fallback hour, not the stage's hour
 *
 * Measured rather than transcribed. The clock is `live/timeline.ts#clockAt(simTimeS, dayStartS)` and
 * `dayStartS` is **the run's own**, from the demand template the day was built from; `DAY_START_S`
 * (06:00) is what `clockAt` falls back to for a template that declares no hour. `garden-apartments`
 * declares 08:30 and the stage opens there — `stageScreen.browser.test.ts` found that by asserting
 * the guide's literal against the product and failing.
 *
 * The guide's literal is the deviation and the product is right, on the standing rule: the handoff
 * wins what the screen *looks like* and the simulator wins what a number *means*. Forcing 06:00 over
 * a building that opens at 08:30 would label one building with another's morning — the defect
 * {@link LiveObservations.longWaitThresholdS} exists to prevent one row up. `stageScreenModel.test.ts`
 * pins the fallback; the browser case pins the shape and the property that matters, which is that the
 * playhead is at the start of the day and time only ever moves forward from it.
 *
 * ## What the stage does not have, and why the absences are named rather than mimed
 *
 * {@link STAGE_ABSENCES}. Two are structural — the § 7.4 ghost lane needs a second recording the
 * data host does not offer, and § 7.5's campaign dock needs a `ctx` no route in this build can
 * produce — and one is a control that exists behind a screen nobody has built. Each is a sentence a
 * player reads under the stage, on the shell's own precedent for `EVERYDAY_SHELL_ABSENCES`: a
 * register nothing renders is read by nobody.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import type { VizFloor, VizRecording, VizShaft } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';
import { interventionStampOf, PARK_CARS_LOBBY_LABEL } from '../live/interventions.js';
import { clockAt, phaseAt } from '../live/timeline.js';
import type { LiveObservations, WaitBandId } from '../live/types.js';
import { actionBarFor } from './actionBar.js';
import type { ActionBarModel } from './actionBar.js';
import { EVERYDAY_COLORS as C } from './tokens.js';
import type { EverydayScreen, EverydayState, RunContext } from './types.js';

/* -------------------------------------------------------------------------- *
 * § 4.6 — the transport
 * -------------------------------------------------------------------------- */

/** One speed setting: what the button says, and what the clock does. */
export interface StageSpeed {
  /** § 4.6's label row, verbatim. */
  readonly label: string;
  /** § 4.6's `sim s / real` row — simulated seconds per real second. */
  readonly simPerRealS: number;
}

/**
 * § 4.6's table, **one array indexed twice**.
 *
 * The contract says so outright (*"The label array and the multiplier array must be the same array
 * indexed twice, never two lists (§20.12)"*), and the failure it is guarding against is specific:
 * two parallel arrays let `12×` be drawn over a multiplier of 600, and nothing on screen would say
 * so — the day would simply run at two and a half times what the button claimed. A reader would
 * blame the simulator.
 *
 * Frozen and exported so the screen, its tests and any sweep read the same five rows; the index
 * into it is the whole of the transport's state.
 */
export const STAGE_SPEEDS: readonly StageSpeed[] = Object.freeze([
  Object.freeze({ label: '½×', simPerRealS: 8 }),
  Object.freeze({ label: '1×', simPerRealS: 30 }),
  Object.freeze({ label: '4×', simPerRealS: 90 }),
  Object.freeze({ label: '12×', simPerRealS: 240 }),
  Object.freeze({ label: '30×', simPerRealS: 600 }),
]);

/**
 * Where every run opens — § 4.6 and § 7.3: *"speed is not inherited: it resets to the player's
 * `Default speed` setting at the start of each run"*.
 *
 * **There is no `Default speed` setting in this build**, so this constant stands in for it and says
 * so rather than pretending to read one: `everyday/settingsView.ts` ships one Motion switch and six
 * refused rows, and a stage that read a preference nothing writes would be the inert-control defect
 * with the polarity reversed. The rule the contract actually cares about is met either way — *a day
 * must never vanish in three seconds because the previous one ended at 30×* — because the reset
 * happens on every new recording regardless of where the value comes from. The lane that builds the
 * setting replaces this constant with a host read and changes nothing else.
 */
export const DEFAULT_STAGE_SPEED_INDEX = 1;

/** The § 4.6 speed at an index, clamped — a stored index out of range opens at the default. */
export function stageSpeedAt(index: number): StageSpeed {
  return STAGE_SPEEDS[index] ?? STAGE_SPEEDS[DEFAULT_STAGE_SPEED_INDEX] ?? {
    label: '1×',
    simPerRealS: 30,
  };
}

/* -------------------------------------------------------------------------- *
 * § 7.2 — the wait ramp, and the legend under the stage
 * -------------------------------------------------------------------------- */

/**
 * § 19's ink for each wait band — the *mapping*, never a second set of boundaries.
 *
 * Keyed by {@link WaitBandId} rather than by index, so a band added to {@link WAIT_BANDS} fails to
 * type here instead of quietly inheriting the last colour. § 7.2 names the four in plain words —
 * green, amber, terracotta, grey — and these are § 19's own tokens for exactly those four.
 */
export const STAGE_BAND_INK: Readonly<Record<WaitBandId, string>> = Object.freeze({
  breezy: C.moss,
  'tapping-foot': C.sun,
  'checking-watch': C.terracotta,
  'taking-the-stairs': C.warmGrey,
});

/** One legend rung under the stage: the colour, and how long it means in plain words. */
export interface StageLegendRung {
  readonly id: WaitBandId;
  readonly label: string;
  readonly color: string;
}

/**
 * § 7.2's legend — *"A legend sits under the stage naming the four colours in plain words."*
 *
 * Derived from {@link WAIT_BANDS} in its own order, and it uses `legendLabel` rather than `label`
 * because that field exists for exactly this row (*"under the stage the legend says how long, beside
 * the mood card it says how it feels"*).
 */
export function stageLegend(): readonly StageLegendRung[] {
  return WAIT_BANDS.map((band) => ({
    id: band.id,
    label: band.legendLabel,
    color: STAGE_BAND_INK[band.id],
  }));
}

/** The band a wait of `waitedS` falls in — {@link WAIT_BANDS}' boundaries, read, never restated. */
export function stageBandOf(waitedS: number): WaitBandId {
  let found: WaitBandId = WAIT_BANDS[0]?.id ?? 'breezy';
  for (const band of WAIT_BANDS) {
    if (waitedS >= band.fromS) found = band.id;
  }
  return found;
}

/** The § 19 ink for a wait, in one call — what the cutaway colours a capsule by. */
export function stageInkFor(waitedS: number): string {
  return STAGE_BAND_INK[stageBandOf(waitedS)];
}

/* -------------------------------------------------------------------------- *
 * § 7.1 — the header
 * -------------------------------------------------------------------------- */

/**
 * One header figure.
 *
 * `value` is what the box draws; `count` is the denominator an estimate must carry (R13 — *an
 * estimate without its `n` may not be drawn*), and it is `undefined` on a figure that is a count
 * rather than a ratio, because a count is its own `n`. `refusal` replaces the value when the run
 * cannot answer yet; a figure never draws a placeholder number.
 */
export interface StageFigure {
  readonly label: string;
  readonly value: string;
  readonly count?: string | undefined;
  readonly refusal?: string | undefined;
}

/** § 7.1's header row, resolved at one playhead. */
export interface StageHeaderView {
  /** `hh:mm` at the playhead — § 7.1's clock. */
  readonly clock: string;
  /** The phase pill: the run's own demand segment at `t`, or the honest absence. */
  readonly phase: string;
  /** `DRIVING`'s eyebrow and the dispatcher's name. */
  readonly drivingLabel: string;
  readonly driverName: string;
  /** § 7.1's three live figures, in the guide's order. */
  readonly figures: readonly StageFigure[];
}

/** What {@link stageHeaderOf} needs. Plain data — the caller has already folded it. */
export interface StageHeaderInput {
  readonly simTimeS: number;
  readonly recording: VizRecording;
  readonly observations: LiveObservations;
  /** The run's own start hour; `undefined` falls back to `live/timeline.ts`'s `DAY_START_S`. */
  readonly dayStartS?: number | undefined;
  /** What the dispatcher is called. The id is a poor name and the screen never shows one. */
  readonly driverName: string;
}

/**
 * The phase pill when the recording carries no schedule.
 *
 * `VizRecording.demandPhases` is legally empty — a run recorded before contract version 7, or one
 * whose template could not be resolved — and `phaseAt` then answers with a single unlabelled band.
 * Saying *the day has no named phases* is a fact about the record; inventing `Morning rush` from
 * the clock would be a claim about demand nobody measured.
 */
export const STAGE_NO_PHASE = 'no named phase';

/**
 * § 7.1's header at a playhead.
 *
 * Every figure is `observations`', which is folded at `t` — see the module docstring for why that
 * is the whole design of this function rather than a detail of it.
 */
export function stageHeaderOf(input: StageHeaderInput): StageHeaderView {
  const { observations: o } = input;
  const segment = phaseAt(input.recording, input.simTimeS, {
    ...(input.dayStartS === undefined ? {} : { dayStartS: input.dayStartS }),
  });
  const phaseLabel = segment?.label.trim();
  return {
    clock: clockAt(input.simTimeS, input.dayStartS),
    phase: phaseLabel === undefined || phaseLabel === '' ? STAGE_NO_PHASE : phaseLabel,
    drivingLabel: 'DRIVING',
    driverName: input.driverName,
    figures: [awayInsideOf(o), standingNowOf(o), longestSoFarOf(o)],
  };
}

/**
 * *Away inside a minute* — the one header figure that is a ratio, so the one that carries an `n`.
 *
 * The caption is generated from `longWaitThresholdS` rather than written out, for
 * `LiveObservations.longWaitThresholdS`'s own stated reason: 60 s is what every shipped building
 * reports and the threshold is nonetheless the *run's*, so a building that counted a long wait at
 * 45 s would otherwise be labelled with somebody else's number.
 */
function awayInsideOf(o: LiveObservations): StageFigure {
  const label = `away inside ${secondsWord(o.longWaitThresholdS)}`;
  if (o.servedUnderThresholdPct === undefined) {
    return {
      label,
      value: '—',
      refusal: 'nobody has boarded yet — a share of nothing is not 100 %',
    };
  }
  return {
    label,
    value: `${String(Math.round(o.servedUnderThresholdPct))}%`,
    count: `of ${String(o.servedCount)} away`,
  };
}

/** *Standing right now* — a head count, so it is its own `n`. */
function standingNowOf(o: LiveObservations): StageFigure {
  return { label: 'standing right now', value: String(o.waitingNow) };
}

/**
 * *The longest anybody has stood* — the playhead's own maximum, censoring stated.
 *
 * `worstWaitSoFarS` is folded over the legs arrived by `t` and is explicitly *not*
 * `summary.serviceLevel.longestWaitS`, which is a statement about the whole run. When the maximum
 * belongs to somebody still standing it is a **lower bound**, and the figure says `134 s and counting`
 * rather than `134 s`: a bound drawn as a realised wait is the same class of false statement as a
 * whole-run figure at a part-way playhead.
 */
function longestSoFarOf(o: LiveObservations): StageFigure {
  if (o.worstWaitSoFarS === undefined) {
    return { label: 'longest so far', value: '—', refusal: 'nobody has called a lift yet' };
  }
  const seconds = `${String(Math.round(o.worstWaitSoFarS))} s`;
  return {
    label: 'longest so far',
    value: o.worstWaitIsCensored ? `${seconds} and counting` : seconds,
  };
}

/** `60 s` as *a minute* and anything else as its own figure — § 13's plain-words rule, narrowly. */
function secondsWord(seconds: number): string {
  return seconds === 60 ? 'a minute' : `${String(Math.round(seconds))} s`;
}

/* -------------------------------------------------------------------------- *
 * § 7.2 — the alarm strip
 * -------------------------------------------------------------------------- */

/** § 7.2's threshold: *"more than forty people are standing"*. */
export const STAGE_ALARM_STANDING = 40;

/**
 * § 7.2's alarm strip, or `undefined` when the building is coping.
 *
 * The design's example is *47 people waiting in the lobby*; `deepestQueueFloorId` is the floor the
 * stack is actually on, so the sentence names it rather than assuming the entrance. The figure is
 * `waitingNow` — a head count at `t`, not a run total.
 */
export function stageAlarmOf(o: LiveObservations, floorLabelOf: (id: string) => string): string | undefined {
  if (o.waitingNow <= STAGE_ALARM_STANDING) return undefined;
  const where = o.deepestQueueFloorId;
  const people = `${String(o.waitingNow)} ${o.waitingNow === 1 ? 'person' : 'people'} waiting`;
  return where === undefined ? people : `${people}, deepest at ${floorLabelOf(where)}`;
}

/* -------------------------------------------------------------------------- *
 * § 7.6 — interventions
 * -------------------------------------------------------------------------- */

/**
 * One arm of § 7.6's control.
 *
 * **Which arms exist, stated because the guide lists three and this build ships one.** § 7.6's
 * build order is (1) park the cars in the lobby, (2) switch who is driving, (3) answer a campaign
 * incident. All three are `RunInterventionConfig['change']` kinds in `core` now, and the table is
 * still one row — because the constraint is not the kind union, it is **what this screen can
 * construct**. A row carries the whole `change`, so an arm is buildable here exactly when the
 * screen holds everything that change needs:
 *
 * - (1) needs nothing beyond the kind, so it is the row.
 * - (2) needs the profile being handed to, and choosing one is § 11's workshop surface, not this
 *   screen's — the Engineer strip carries the arm today against its own resolved target.
 * - (3) needs an answered incident's option and its service events, which come from § 7.5's dock;
 *   no route in this build produces the `ctx === 'campaign'` that dock lives on.
 *
 * That is why the row type is a `change` and not a kind. A kind-keyed table would compile for (1)
 * and be a lie the moment a kind carried data — which it now does, twice. See
 * {@link STAGE_ABSENCES}, which names both absences for a player rather than leaving them here.
 */
export interface StageInterventionRow {
  /** The whole entry this arm appends — not a kind, per the docstring above. */
  readonly change: RunInterventionConfig['change'];
  /** The button's own words — imperative, because it is a button (`live/interventions.ts`). */
  readonly label: string;
  /** What pressing it will do, for the control's title. § 7.6's mechanism in one sentence. */
  readonly explains: string;
}

/** The arms this build ships — see the interface docstring for why it is one and not three. */
export const STAGE_INTERVENTIONS: readonly StageInterventionRow[] = Object.freeze([
  Object.freeze({
    change: Object.freeze({ kind: 'park-cars-lobby' as const }),
    label: PARK_CARS_LOBBY_LABEL,
    explains:
      'appends to today’s record at the playhead and re-simulates the day from the start — ' +
      'everything before this moment is unchanged, and playback resumes here',
  }),
]);

/** The intervention control, resolved for a run and a playhead. */
export interface StageInterventionView {
  readonly rows: readonly StageInterventionRow[];
  /** § 7.6: the most recent intervention *as of the playhead*, stamped. `''` when none has landed. */
  readonly stamp: string;
  /**
   * Why the control cannot act, or `undefined` when it can.
   *
   * A control that cannot take effect now must say so (§ 7.6's fourth rule) — so this is a sentence
   * and never a bare disabled button.
   */
  readonly refusal?: string | undefined;
}

/** What {@link stageInterventionsOf} needs. */
export interface StageInterventionInput {
  readonly interventions: readonly RunInterventionConfig[];
  readonly simTimeS: number;
  readonly dayStartS?: number | undefined;
  /** Whether a run is on the stage at all. */
  readonly hasRun: boolean;
  /** Whether the day has been filed. A filed day's record is closed. */
  readonly dayClosed: boolean;
  /** Whether a re-simulation is in flight — § 7.6's `recomputing` beat. */
  readonly recomputing: boolean;
}

/** § 7.6's `recomputing` beat, so a re-simulation is a state rather than a freeze. */
export const STAGE_RECOMPUTING = 'recomputing the day from the start…';

export function stageInterventionsOf(input: StageInterventionInput): StageInterventionView {
  const stamp = interventionStampOf(input.interventions, input.simTimeS, input.dayStartS);
  const refusal = !input.hasRun
    ? 'no day is running — nothing to change yet'
    : input.dayClosed
      ? 'the day is filed — its record is closed, and tomorrow starts a new one'
      : input.recomputing
        ? STAGE_RECOMPUTING
        : undefined;
  return {
    rows: STAGE_INTERVENTIONS,
    stamp,
    ...(refusal === undefined ? {} : { refusal }),
  };
}

/* -------------------------------------------------------------------------- *
 * § 7.4 — the race strip's one-line arm
 * -------------------------------------------------------------------------- */

/**
 * Why the strip has one lane per row rather than two.
 *
 * § 7.4's ghost is *a second recording of the same crowd*, and the data host offers no way to reach
 * one: `EverydayHost` hands back the run on the stage and nothing else, and `dev/ghostRun.ts` — the
 * module that builds a rival — is inside the Engineer shell's closure, on the far side of the façade
 * this screen may not reach through. So the strip draws `raceStripViewOf`'s **nobody** arm, which is
 * a shipped state rather than a degradation (*"The strip never invents a rival"*), and this sentence
 * is drawn beside it.
 *
 * The alternative — running a second simulation from here — is the one thing that would make the
 * strip a lie the moment it worked: a rival raced on a different crowd is not § 7.4's ghost, and
 * *"same crowd both runs"* is the note that would then be false.
 */
export const STAGE_NO_GHOST =
  'no rival lane — a ghost is a second run of the same crowd, and this screen cannot ask for one yet';

/* -------------------------------------------------------------------------- *
 * The screen's own register of absences
 * -------------------------------------------------------------------------- */

/**
 * What this stage does not do, drawn under the strip.
 *
 * Beside `shell.ts`'s {@link EVERYDAY_SHELL_ABSENCES} rather than inside it, and the split is by
 * owner: the shell's register is about the *shell* — screens it does not route to, a bar it does
 * not draw — and this one is about § 7's stage specifically. A reader on the stage sees this one;
 * a reader on the menu sees that one.
 */
export const STAGE_ABSENCES: readonly string[] = Object.freeze([
  STAGE_NO_GHOST,
  '§ 7.5’s campaign dock — a campaign day reaches this stage, and the money-and-incident dock beside it is not drawn',
  '§ 7.3’s camera — the cutaway draws the whole building at once and there is nothing to pan',
  '§ 7.6’s second and third arms — the run record carries a handover and an answered incident, and this screen offers neither: a handover needs a dispatcher chosen somewhere, and an incident needs the dock above',
]);

/* -------------------------------------------------------------------------- *
 * § 3.3's row, refined for the stage's own states
 * -------------------------------------------------------------------------- */

/** What the § 3.3 refinement needs to know about the run. */
export interface StageBarInput {
  /** The open campaign tower's name, for § 3.3's `⟨building⟩` back cell. */
  readonly buildingName?: string | undefined;
  readonly hasRun: boolean;
  readonly dayClosed: boolean;
  readonly recomputing: boolean;
}

/**
 * § 3.3's stage row, refined.
 *
 * The table's cell is *Close the day* with the note *Stops the clock and writes the report*, and it
 * is right for a running day. Three states the table cannot know: no run yet, a day already filed,
 * and a re-simulation in flight. Each resolves the primary **inert** with the note saying why — the
 * shell draws an inert primary disabled, so the button never looks pressable while doing nothing
 * (`BarPrimary.inert`'s own contract).
 */
export function stageBarModelOf(state: EverydayState, input: StageBarInput): ActionBarModel {
  const table = actionBarFor(state);
  /*
   * § 3.3's campaign stage row names its parent `⟨building⟩` — the guide's own state-dependent cell,
   * carried verbatim by `actionBar.ts` on the rule that a `⟨…⟩` is never *drawn*. This is the
   * substitution that rule requires, and it is here rather than in the shell because `back` is a
   * cell a `bar()` owns.
   *
   * Found by `screens.test.ts`'s registry-wide placeholder guard rather than by a reader — and the
   * first draft of this comment said the cell was unreachable, which was already false when it was
   * written: `shell.ts` sets `ctx` from the tile the player commits to, so the Campaign tile puts
   * this stage in a campaign and draws this very cell. The fallback names no building because with
   * no open tower there is nothing true to put there.
   */
  const base =
    table.back?.label.includes('⟨') === true
      ? { ...table, back: { ...table.back, label: input.buildingName ?? 'the building' } }
      : table;
  const refusal = !input.hasRun
    ? 'the day has not started yet — there is nothing to file'
    : input.recomputing
      ? STAGE_RECOMPUTING
      : input.dayClosed
        ? 'the day is filed — its report is written'
        : undefined;
  if (refusal === undefined) return base;
  return {
    ...base,
    primary: { ...base.primary, inert: true },
    note: refusal,
  };
}

/** What the press actually did, read back off the host after the call — never predicted. */
export interface StageFilingOutcome {
  /** `EverydayHost.runState().dayClosed` — the run on the stage is filed. */
  readonly dayClosed: boolean;
  /** `EverydayHost.lastReport() !== undefined` — § 6.4 step 5 wrote a sheet. */
  readonly hasReport: boolean;
}

/**
 * Where § 3.3's stage primary leaves the player once it has pressed — GitHub issue **#206**.
 *
 * `Close the day` *stops the clock and writes the report*, and until this function existed it wrote
 * the report and left the player standing on the stage with no route to it: the daily timeline's
 * fourth stop is drawn from the row's own step, so on a stage at step 3 it evaluated `4 <= 3` and
 * was faint and listener-less in every state. The loop did not close. The auto-open is the
 * handoff's own behaviour — `dev/main.ts` has done it into `ViewerState.tab` since the Engineer
 * shell was the only reader — so this is the Everyday shell acquiring the half it never had.
 *
 * ## Two questions, and the order matters
 *
 * **The outcome, not the press.** `closeShift` has three silent early returns — a run nobody
 * started (§ D232's `playerHasChosen` gate), a run this shell did not simulate
 * (`shift/banking.ts#bankingRefusalFor`), and an already-filed one — and every one of them files
 * nothing while returning normally. Navigating on the press would turn each into a player sent to
 * an empty sheet by a button that promised a written one. So both facts are read **back off the
 * host after the call**: a day that is closed, and a report that exists.
 *
 * **The flow, not the screen.** The stage is one component with four run contexts, and the primary
 * is one function for all four. A `rush` day's primary is *End the rush* and § 3.3 gives its report
 * no timeline; a `watch` day is somebody else's and cannot be closed at all. Only the two flows
 * whose report is a numbered step land there — and *which those are* is asked of § 3.3's own table
 * (does this context's report row carry a timeline?) rather than of a pair of context names kept
 * here. A fifth run context answers by being in the table; it cannot answer by omission.
 *
 * `undefined` means *stay where you are*, which is what a refused close must look like.
 *
 * Non-test caller: `everyday/stageScreen.ts`'s `primary` handle, the § 3.3 press itself.
 */
export function stageFilingLandsOn(
  ctx: RunContext,
  outcome: StageFilingOutcome,
): EverydayScreen | undefined {
  if (!outcome.dayClosed || !outcome.hasReport) return undefined;
  return actionBarFor({ screen: 'report', ctx }).timeline === undefined ? undefined : 'report';
}

/* -------------------------------------------------------------------------- *
 * The cutaway's arithmetic
 * -------------------------------------------------------------------------- */

/** § 14: *"Landings draw at most 26 figures, then `+N`"*. */
export const MAX_LANDING_FIGURES = 26;

/** § 14: *"cars draw at most 9 riders"*. */
export const MAX_CAR_RIDERS = 9;

export interface StageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One floor's slab, in pixels. */
export interface StageFloorRow {
  readonly floorId: string;
  readonly label: string;
  readonly heightM: number;
  /** Pixel y of the floor's own line — the slab's top. */
  readonly y: number;
  readonly isEntrance: boolean;
  /** Whether this row's label is legible at the current pitch. Every row is still drawn. */
  readonly labelled: boolean;
}

/** One shaft's well, in pixels. */
export interface StageShaftColumn {
  readonly carId: string;
  readonly label: string;
  readonly servedFloorIds: readonly string[];
  readonly x: number;
  readonly width: number;
  readonly centreX: number;
  /** Held out of service for the whole run — § 7.2's dashed, empty, labelled well. */
  readonly outOfService: boolean;
}

/** Everything the cutaway needs to place a pixel. Pure arithmetic over a box and a building. */
export interface StageGeometry {
  readonly width: number;
  readonly height: number;
  /** The drawing area inside the padding. */
  readonly plot: StageRect;
  /** The left gutter carrying floor numbers and tenant names. */
  readonly gutterWidth: number;
  /** Where the waiting capsules stand — between the gutter and the first well. */
  readonly landing: StageRect;
  readonly rows: readonly StageFloorRow[];
  readonly columns: readonly StageShaftColumn[];
  /** Distance between two adjacent floor lines at the *average* floor height, pixels. */
  readonly rowPitch: number;
  /** Pixel y for a height above datum. Continuous, so an S-curve is drawn as an S-curve. */
  yForHeight(heightM: number): number;
}

export interface StageGeometryInput {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly VizShaft[];
  readonly outOfServiceCarIds?: readonly string[] | undefined;
}

const PAD = 14;
const GUTTER = 74;
const MIN_LABEL_PITCH_PX = 13;

/**
 * The cutaway's geometry.
 *
 * {@link StageGeometry.yForHeight} maps heights **linearly over the building's own span**, exactly
 * as `render/layout.ts` does and for the identical reason: a car's vertical position must be a
 * continuous function of its height in metres, or the jerk-limited S-curve `frameAt` evaluates gets
 * quantised back into a jump at the last moment and a short hop stops looking like a short hop. A
 * building with an 8 m lobby and 3 m upper floors therefore *looks* like one.
 *
 * Deliberately **not** `buildLayout`: that layout owns the Engineer schematic's header band, footer
 * band and label-thinning rules, and this is § D299 § 3's sanctioned second renderer — a warm
 * cutaway with doors and drawn people. Sharing the geometry would mean sharing the header stack the
 * Engineer surface needs and this screen does not have.
 */
export function stageGeometryOf(input: StageGeometryInput): StageGeometry {
  const width = Math.max(input.width, 2 * PAD + GUTTER + 40);
  const height = Math.max(input.height, 2 * PAD + 40);
  const plot: StageRect = {
    x: PAD,
    y: PAD,
    width: width - 2 * PAD,
    height: height - 2 * PAD,
  };

  const heights = input.floors.map((floor) => floor.heightM);
  const lowest = heights.length === 0 ? 0 : Math.min(...heights);
  const highest = heights.length === 0 ? 1 : Math.max(...heights);
  const span = highest - lowest;
  /* One floor is a legal building; a zero span would divide by nothing, so it draws mid-plot. */
  const inset = Math.min(22, plot.height / Math.max(2, input.floors.length + 1));
  const top = plot.y + inset;
  const bottom = plot.y + plot.height - inset;
  const yForHeight = (heightM: number): number =>
    span <= 0 ? (top + bottom) / 2 : bottom - ((heightM - lowest) / span) * (bottom - top);

  const rowPitch = input.floors.length < 2 ? bottom - top : (bottom - top) / (input.floors.length - 1);
  const labelled = rowPitch >= MIN_LABEL_PITCH_PX;

  const rows: readonly StageFloorRow[] = input.floors.map((floor) => ({
    floorId: floor.id,
    label: floor.label ?? floor.id,
    heightM: floor.heightM,
    y: yForHeight(floor.heightM),
    isEntrance: floor.isEntrance,
    /* Entrance floors are never thinned out — it is the row a reader orients by (`RV-09`). */
    labelled: labelled || floor.isEntrance,
  }));

  const outOfService = new Set(input.outOfServiceCarIds ?? []);
  const wellsX = plot.x + GUTTER;
  const wellsWidth = Math.max(plot.x + plot.width - wellsX, 30);
  /* The landing crowd stands in the left third of the well band, ahead of the first shaft. */
  const landingWidth = Math.min(Math.max(wellsWidth * 0.34, 60), wellsWidth - 24);
  const columnsX = wellsX + landingWidth;
  const columnsWidth = plot.x + plot.width - columnsX;
  const count = Math.max(input.shafts.length, 1);
  const pitch = columnsWidth / count;
  const columns: readonly StageShaftColumn[] = input.shafts.map((shaft, index) => {
    const x = columnsX + index * pitch + pitch * 0.12;
    const w = pitch * 0.76;
    return {
      carId: shaft.carId,
      label: shaft.label,
      servedFloorIds: shaft.servedFloorIds,
      x,
      width: w,
      centreX: x + w / 2,
      outOfService: outOfService.has(shaft.carId),
    };
  });

  return {
    width,
    height,
    plot,
    gutterWidth: GUTTER,
    landing: { x: wellsX, y: plot.y, width: landingWidth, height: plot.height },
    rows,
    columns,
    rowPitch,
    yForHeight,
  };
}

/**
 * How many capsules to draw, and what the overflow chip says — § 14's *at most 26, then `+N`*.
 *
 * Returned as a pair rather than enforced inside the renderer so it is arithmetic a test can check:
 * *a crowd of 400 must not cost a frame* is a claim about a number, and this is the number.
 */
export function stageCrowdCapOf(total: number, cap: number = MAX_LANDING_FIGURES): {
  readonly drawn: number;
  readonly overflow: string | undefined;
} {
  if (total <= cap) return { drawn: Math.max(0, total), overflow: undefined };
  return { drawn: cap, overflow: `+${String(total - cap)}` };
}
