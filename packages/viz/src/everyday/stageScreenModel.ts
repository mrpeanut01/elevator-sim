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
 * ## Three of the cutaway's five `fillText` sites arrived here late — § D347
 *
 * The split above was a claim about this file before it was a fact about it. The cutaway draws five
 * `fillText` sites and until GitHub issue **#212** three were composed in the mount: the
 * out-of-service caption, the `▲`/`▼` glyph, and the car's `riders/capacity` readout — **a live
 * figure on the vertical slice's centrepiece, read by no honesty property at all**, because the
 * mount needs a document and is excluded from the corpus for that reason. {@link stageCarReadoutOf}
 * and {@link STAGE_OUT_OF_SERVICE} are that gap closed, and {@link stageCarPaintOf} is the same
 * move for the geometry beside them: the door-fill inversion #212 reports was arithmetic nothing
 * could check without a canvas, and it is three assertable rules now.
 *
 * ## What the stage does not have, and why the absences are named rather than mimed
 *
 * {@link STAGE_ABSENCES}. Two are structural — the § 7.4 ghost lane needs a second recording the
 * data host does not offer, and § 7.5's campaign dock needs a `ctx` no route in this build can
 * produce — and one is a control that exists behind a screen nobody has built. Each is a sentence a
 * player reads on the build-information panel (`everyday/buildNotes.ts`), which is the shell
 * register's own precedent applied one screen down: a register nothing renders is read by nobody.
 */

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';

import type { VizFloor, VizRecording, VizShaft } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';
import {
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  switchChangesNothing,
  switchDispatcherLabelOf,
  SWITCH_PINS_NOTE,
} from '../live/interventions.js';
import { clockAt, phaseAt, timelineOf } from '../live/timeline.js';
import type { LiveObservations, WaitBandId } from '../live/types.js';
// AD-S17's length rule, shared with the Engineer stage. The *derivation* — what counts as standing
// still, and why the word is not *parked* — is that module's docstring and is deliberately one home.
import { REST_BAR_THICKNESS_PX, restBarWidthPx } from '../render/carRest.js';
import { actionBarFor } from './actionBar.js';
import type { ActionBarModel } from './actionBar.js';
import { EVERYDAY_COLORS as C } from './tokens.js';
import type { EverydayScreen, EverydayState, RunContext } from './types.js';

/* -------------------------------------------------------------------------- *
 * § 4.6 — the transport
 * -------------------------------------------------------------------------- */

/** One speed setting: what the button says, and what the clock does. */
export interface StageSpeed {
  /**
   * What the button says — and it is a **claim about {@link simPerRealS}**, not a decoration.
   *
   * `N×` means the day runs at `N` simulated seconds per real second, so the label and the
   * multiplier are one fact written twice. `stageScreenModel.test.ts` parses the number back out of
   * this string and requires it to equal the multiplier beside it, which is the only reason the
   * pair below can be trusted after the next hand edits it.
   */
  readonly label: string;
  /** § 4.6's `sim s / real` row — simulated seconds per real second. */
  readonly simPerRealS: number;
}

/**
 * § 4.6's table, **one array indexed twice** — and every label now equal to the ratio it names.
 *
 * The contract says the first half outright (*"The label array and the multiplier array must be the
 * same array indexed twice, never two lists (§20.12)"*), and the failure it is guarding against is
 * specific: two parallel arrays let `12×` be drawn over a multiplier of 600, and nothing on screen
 * would say so — the day would simply run at two and a half times what the button claimed. A reader
 * would blame the simulator.
 *
 * ## The table this replaced was that exact failure, arriving through the contract rather than past it
 *
 * GitHub issue **#257**, ruled on by [§ D344](../../../../DECISIONS.md). Until it, this array was
 * `ENGINE_CONTRACT.md` § 4.6 transcribed faithfully:
 *
 * | label shown | `simPerRealS` | what it was |
 * |---|---|---|
 * | `½×` | 8 | **8× real time** |
 * | `1×` | 30 | **30× real time** |
 * | `4×` | 90 | 90× |
 * | `12×` | 240 | 240× |
 * | `30×` | 600 | 600× |
 *
 * **There was no 1:1 rung at all**, and a player who slowed the stage all the way down was still
 * watching an eight-times-compressed building. **Neither reading of those labels rescues them**, and
 * that is worth stating because the charitable one is the reading a reviewer reaches for first. Read
 * as *absolute* — sim-seconds per real second, which is what the column beside them holds — all five
 * are wrong. Read as *relative to the `1×` rung*, they are `8/30 = 0.27` under a label saying `½×`,
 * `90/30 = 3` under `4×`, `240/30 = 8` under `12×` and `600/30 = 20` under `30×`; only the `1×` row
 * survives, and it survives trivially, because every relative scale calls its own datum one.
 *
 * ## This is a stated deviation from the handoff, and it is the same one § 7.2's ramp already is
 *
 * The table above is the vendored contract's own, so replacing it is a disagreement with the
 * handoff rather than a repair of a transcription slip. The standing rule decides it the way it
 * decides the wait ramp fifteen lines down: **the handoff wins what the screen looks like and the
 * simulator wins what a number means.** A multiplier is a number, and a label reading `N×` is a
 * claim about that number — so the ladder is the simulator's to fix, exactly as `WAIT_BANDS`'
 * 30/60/120 beat § 7.2's 30/75/150. What the handoff still wins is untouched: a row of speed chips
 * in mono, in the same place in the header, with the same reset rule.
 *
 * ## What moved, stated as a diff rather than as a new table
 *
 * **No rung is removed.** All five multipliers above still ship — 8, 30, 90, 240 and 600 — so no
 * pacing a player had is gone and no measurement taken at one of them is about a speed that no
 * longer exists. Five are **renamed** to the ratio they always were, and **two are added**:
 *
 * - **`1×` at 1** is the rung [§ D344](../../../../DECISIONS.md) needs and the one #257 is filed
 *   about. Its determination is a single number — *discrete cues need `S ≤ 39` sim-seconds per real
 *   second*, from a 9.8 s hall-call door cycle against a 250 ms floor on an identifiable cue — and
 *   the old ladder had two rungs under that bound, neither of which carried its own name.
 * - **`4×` at 4** because the discrete tier needs somewhere to stand *between* those two. Without
 *   it, `1 → 8` is an **eight-fold** step on a ladder where no other step exceeds four, and it is
 *   the step a player takes when they want to watch a car rather than a day.
 *
 * So four rungs — 1, 4, 8 and 30 — sit inside § D344's discrete-cue budget and three — 90, 240 and
 * 600 — sit outside it, which is the speed tiering that ruling describes rather than a coincidence
 * this table happens to permit. **Both the ladder and the default below are § D354** — *the stage
 * speed ladder is honest, and the default is a decision rather than a constant* — which rules the
 * seven rungs, the equal-to-multiplier labels and the opening 30 outright. This docstring is the
 * local reading of that decision, under § D405, and takes none of its own.
 *
 * Frozen and exported so the screen, its tests and any sweep read the same seven rows; the index
 * into it is the whole of the transport's state. It is typed as a **non-empty tuple** so that
 * {@link stageSpeedAt} needs no hand-written fallback row — the one it used to carry was a sixth
 * speed, `1×` over a multiplier of 30, unreachable by construction and read by no test, which is
 * this defect a second time in the code that was meant to survive it.
 */
export const STAGE_SPEEDS: readonly [StageSpeed, ...StageSpeed[]] = Object.freeze([
  Object.freeze({ label: '1×', simPerRealS: 1 }),
  Object.freeze({ label: '4×', simPerRealS: 4 }),
  Object.freeze({ label: '8×', simPerRealS: 8 }),
  Object.freeze({ label: '30×', simPerRealS: 30 }),
  Object.freeze({ label: '90×', simPerRealS: 90 }),
  Object.freeze({ label: '240×', simPerRealS: 240 }),
  Object.freeze({ label: '600×', simPerRealS: 600 }),
]);

/**
 * **The speed every run opens at: 30 simulated seconds per real second.** A decision, argued below,
 * rather than a constant standing in for one.
 *
 * § 4.6 and § 7.3 say *"speed is not inherited: it resets to the player's `Default speed` setting at
 * the start of each run"*. **There is still no `Default speed` setting in this build** —
 * `everyday/settingsView.ts` ships one Motion switch and six refused rows — and this file will not
 * pretend to read one, because a stage consulting a preference nothing writes is the inert-control
 * defect with its polarity reversed. What changed with GitHub issue **#257** is that the value is no
 * longer a stand-in: it is chosen, for three reasons, and the lane that builds the setting replaces
 * {@link DEFAULT_STAGE_SIM_PER_REAL_S} with a host read and changes nothing else.
 *
 * **1. It cannot be the honest `1×`, and that is the reason the default needed deciding at all.**
 * At 1:1 the shipped default day — `rise-and-fall`, thirty simulated minutes — is thirty real
 * minutes, and `office-day` is **ten real hours**. The contract's own rule is that *a day must never
 * vanish in three seconds because the previous one ended at 30×*; a day that never ends is the same
 * rule seen from the other side, and a ladder that added a true 1:1 rung and opened on it would have
 * fixed a lying label by shipping an unwatchable product.
 *
 * **2. It is the fastest rung inside [§ D344](../../../../DECISIONS.md)'s `S ≤ 39` budget.** That
 * ruling ships discrete 1:1 cues below the bound and a continuous bed above it. A default above 39
 * would mean every player meets the bed first and reaches the discrete tier only by going to look
 * for it — the top tier of an audio design nobody hears by default. 30 is the largest rung that
 * clears the bound, so it buys the most day per minute while staying inside it.
 *
 * **3. It moves no picture.** 30 is the multiplier this build has always opened at; only its name
 * changed. Every screenshot, every row of `docs/28-art-direction.md` § 6's table and every browser
 * case taken at the opening speed is still about the same pacing, so the label repair costs nothing
 * that would have to be re-measured — which is the whole reason the default was not moved to a rung
 * that reads more nicely.
 *
 * The index is **derived from the declared multiplier rather than written down beside it**, so a
 * rung inserted below the default cannot silently move it. That is #257's own defect class one level
 * up: a number and a name kept in two places drift, and the second place is always the one nobody
 * re-reads.
 */
const DEFAULT_STAGE_SIM_PER_REAL_S = 30;

/** Where every run opens — the index of {@link DEFAULT_STAGE_SIM_PER_REAL_S} on the ladder. */
export const DEFAULT_STAGE_SPEED_INDEX = STAGE_SPEEDS.findIndex(
  (speed) => speed.simPerRealS === DEFAULT_STAGE_SIM_PER_REAL_S,
);

/**
 * The § 4.6 speed at an index, clamped — a stored index out of range opens at the default.
 *
 * The second fallback is {@link STAGE_SPEEDS}' first rung and exists only to satisfy the type: the
 * tuple is non-empty, and `DEFAULT_STAGE_SPEED_INDEX` is asserted to name a real row. It is a rung
 * of this ladder rather than a hand-written pair, so it cannot be a speed whose label lies.
 */
export function stageSpeedAt(index: number): StageSpeed {
  return STAGE_SPEEDS[index] ?? STAGE_SPEEDS[DEFAULT_STAGE_SPEED_INDEX] ?? STAGE_SPEEDS[0];
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
  /**
   * What the demand schedule does **next**, and when — `FILLING from 08:32`.
   *
   * `undefined` once the playhead is inside the last segment, and on a record that carries no
   * schedule at all: there is then nothing after this to name, and inventing one would be the
   * defect {@link STAGE_NO_PHASE} exists to prevent, one segment along.
   *
   * See {@link stageNextStretchOf} for why naming a *future* segment is not an R6 violation.
   */
  readonly next: string | undefined;
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
 * The next stretch of the demand schedule, named from the **schedule** and never from the outcome —
 * `docs/28-art-direction.md` AD-S4, and the half of GitHub issue **#212** that survived its own
 * rewrite.
 *
 * ## What the issue asked for, and why the obvious fix is refused
 *
 * #212's second defect was filed as *"the stage opens paused at 06:00, on an empty building"*, and
 * both halves of that turned out to be wrong. The hour is the **run's own**: six of the seven
 * shipped demand templates declare one and the shipped default opens at 08:30, so 06:00 is
 * `live/timeline.ts`'s fallback rather than the stage's hour. And the shipped default's intensity
 * ramps from its first second, so there is no quiet head on the most common run at all; the measured
 * quiet belongs to one template and lasts about a minute of real time.
 *
 * So the playhead does **not** move. AD-S4's grounds for that are worth carrying here because they
 * are the ones a later lane will be tempted to reverse: choosing a livelier opening frame is the
 * camera answering *name the run this came from* with *the one that looked best*, and captioning
 * that frame — *opening at the morning peak* — is a statement about the whole run at a playhead
 * short of its end, which is exactly R6. An **un**captioned jump is worse, because the player is
 * shown a moment and not told which.
 *
 * ## Why this is not that
 *
 * `VizRecording.demandPhases` is the resolved template's own schedule — an **input** to the run, on
 * the record before a single passenger was generated. Saying *the schedule fills from 08:32* claims
 * nothing about what the building did; it is the same fact the transport's own segmented bar draws
 * in full. R6 forbids publishing an outcome early. It does not forbid reading the timetable.
 *
 * The segment's own label is used rather than a second vocabulary, for `STAGE_BAND_INK`'s reason one
 * screen over: the pill beside this one already draws `FILLING` and `PEAK`, and a plain-words
 * paraphrase here would be a second name for one thing, drawn a centimetre away from the first.
 */
export function stageNextStretchOf(
  recording: VizRecording,
  simTimeS: number,
  dayStartS?: number | undefined,
): string | undefined {
  const options = dayStartS === undefined ? {} : { dayStartS };
  const upcoming = timelineOf(recording, options).find((segment) => segment.startS > simTimeS);
  if (upcoming === undefined) return undefined;
  const label = upcoming.label.trim();
  const clock = clockAt(upcoming.startS, dayStartS);
  return label === '' ? `the next stretch starts at ${clock}` : `${label} from ${clock}`;
}

/**
 * § 7.1's eyebrow over the dispatcher's name.
 *
 * A constant rather than a literal in two places: the mount draws it before the first recording
 * lands, {@link stageHeaderOf} republishes it on every draw, and the corpus sweeps the second. One
 * word with two sources is one word with one of them checked.
 */
export const STAGE_DRIVING_LABEL = 'DRIVING';

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
    next: stageNextStretchOf(input.recording, input.simTimeS, input.dayStartS),
    drivingLabel: STAGE_DRIVING_LABEL,
    driverName: input.driverName,
    figures: [awayInsideOf(o), standingNowOf(o), longestSoFarOf(o)],
  };
}

/**
 * What the overlay says while the day is still being simulated.
 *
 * Mount-authored until [§ D347](../../../../DECISIONS.md), which is the whole of why it is here:
 * a sentence composed in `everyday/stageScreen.ts` reached the static prose sweep and no honesty
 * property at all.
 */
export const STAGE_AWAITING_RUN = 'simulating today’s day — the stage draws the moment it lands';

/**
 * The sentence under § 7.3's single centred `Start` — `docs/28-art-direction.md` AD-S5.
 *
 * *"The centred `Start` is the moment to say the day's shape once, because it is the last moment the
 * player is not watching anything."* It used to read *"Paused at the start of the day. Nothing has
 * happened yet."* — true, and the whole of what an empty opening frame told a player. What it now
 * adds is the **schedule's** next move, through {@link stageNextStretchOf}, so the difference is
 * between an empty screen and an empty screen that says it is early.
 *
 * The clock is the run's own hour rather than a constant: the stale claim this screen carried was
 * that it opens at 06:00, and six of the seven shipped templates declare otherwise.
 *
 * Its one non-test caller is `everyday/stageScreen.ts`'s `syncTransport`.
 */
export function stageOpeningLineOf(input: {
  readonly recording: VizRecording;
  readonly simTimeS: number;
  readonly dayStartS?: number | undefined;
}): string {
  const clock = clockAt(input.simTimeS, input.dayStartS);
  const next = stageNextStretchOf(input.recording, input.simTimeS, input.dayStartS);
  const opening = `Paused at ${clock}, the start of the day. Nothing has happened yet`;
  return next === undefined ? `${opening}.` : `${opening} — ${next}.`;
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
 * **A row is one *change the screen can construct*, not one kind**, and the distinction is the whole
 * reason this carries a whole `change` rather than a kind. § 7.6's build order is (1) park the cars
 * in the lobby, (2) switch who is driving, (3) answer a campaign incident; all three are
 * `RunInterventionConfig['change']` arms in `core`, and an arm is buildable here exactly when this
 * screen holds everything that change needs.
 *
 * - (1) needs nothing beyond the kind, so it is a constant — {@link STAGE_INTERVENTIONS}.
 * - (2) needs the profile being handed to, which is why it is **not** in that constant and is built
 *   per call by {@link stageInterventionsOf} from {@link StageInterventionInput.switchTo}. GitHub
 *   issue **#171**; it was unbuildable while the screen held no dispatcher to name.
 * - (3) needs an answered incident's option and its service events, which come from § 7.5's dock.
 *   Still absent, and {@link STAGE_ABSENCES} says so where a player reads it.
 *
 * A kind-keyed table would have compiled for (1) and been a lie the moment a kind carried data —
 * which it now does, twice, and one of those two is drawn.
 */
export interface StageInterventionRow {
  /** The whole entry this arm appends — not a kind, per the docstring above. */
  readonly change: RunInterventionConfig['change'];
  /** The button's own words — imperative, because it is a button (`live/interventions.ts`). */
  readonly label: string;
  /** What pressing it will do, for the control's title. § 7.6's mechanism in one sentence. */
  readonly explains: string;
  /**
   * Why **this arm** cannot act, or `undefined` when it can — § 7.6's fourth rule at row scope.
   *
   * Beside {@link StageInterventionView.refusal} rather than instead of it, because the two answer
   * different questions. That one is about the *run* — no day is running, the day is filed, a
   * re-simulation is in flight — and is true of every arm at once. This one is about the *arm*: a
   * handover to the vector already driving is a control that moves nothing, which § D177 ranks below
   * no control at all, and it says so while the arm beside it is still pressable.
   */
  readonly refusal?: string | undefined;
}

/**
 * The arms that need nothing from the run to construct.
 *
 * One entry, and that is now a statement about **arity of data** rather than about what this build
 * ships: parking is the only change whose whole content is its kind. The handover arm is real and is
 * assembled per call, because its content is a profile this constant cannot know. Read
 * {@link stageInterventionsOf} for the rows a player actually meets.
 */
export const STAGE_INTERVENTIONS: readonly StageInterventionRow[] = Object.freeze([
  Object.freeze({
    change: Object.freeze({ kind: 'park-cars-lobby' as const }),
    label: PARK_CARS_LOBBY_LABEL,
    explains:
      'appends to today’s record at the playhead and re-simulates the day from the start — ' +
      'everything before this moment is unchanged, and playback resumes here',
  }),
]);

/**
 * The handover arm's title — the park arm's own sentence, with what a switch does to the player's
 * choosers instead of what it does to the picture.
 *
 * `SWITCH_PINS_NOTE` rather than a second phrasing of it: the Engineer strip's control has carried
 * that exact sentence since review finding 3, and two wordings of one mechanism is how a refusal
 * goes stale (§ D227).
 */
export const STAGE_SWITCH_EXPLAINS =
  'appends to today’s record at the playhead and re-simulates the day from the start — ' +
  SWITCH_PINS_NOTE;

/**
 * Why the handover arm cannot act — it would hand the day to the vector already driving.
 *
 * A sentence rather than a bare disabled button (§ 7.6's fourth rule), and it names the *reason*
 * rather than the comparison: what the player has selected is what the building is already obeying,
 * so the record would grow an entry that changed no decision. `live/interventions.ts` decides when
 * this is true, and it is emphatically not an id comparison — a player who has moved the plain
 * levers is driving a different vector under the same name, and handing the day to that name is a
 * real change.
 */
export const STAGE_SWITCH_NO_CHANGE =
  'that is what the building is already running — handing the day over would change nothing';

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
  /**
   * The dispatcher § 7.6's second arm would hand the day to, or `undefined` when the screen is
   * offering none — which is every caller that draws no picker.
   */
  readonly switchTo?: StageSwitchTarget | undefined;
}

/**
 * What the handover arm needs: who the day would go to, and what it is on now.
 *
 * `driving` is a **thunk**, and the reason is `live/interventions.ts#switchChangesNothing`'s: a run
 * that already carries a handover is answered without consulting a vector at all, and deriving the
 * driving profile walks the whole spec chain on a function the stage calls once per frame.
 */
export interface StageSwitchTarget {
  /** The profile the control hands the day to, whole — the shape the record carries. */
  readonly target: DispatcherProfile;
  /** The vector **actually driving**, derived. See the interface docstring for the thunk. */
  readonly driving: () => DispatcherProfile;
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
    rows: rowsOf(input),
    stamp,
    ...(refusal === undefined ? {} : { refusal }),
  };
}

/**
 * The arms this call can offer: the constant ones, plus the handover when a target was supplied.
 *
 * The handover row is built here rather than held in a constant because its `change` carries the
 * whole profile — see {@link StageInterventionRow}. Its own refusal is decided here too, so a
 * screen never has to know what makes a handover a no-op; that rule lives in one place and both
 * shells read it.
 */
function rowsOf(input: StageInterventionInput): readonly StageInterventionRow[] {
  const { switchTo } = input;
  if (switchTo === undefined) return STAGE_INTERVENTIONS;
  const changesNothing = switchChangesNothing({
    interventions: input.interventions,
    target: switchTo.target,
    driving: switchTo.driving,
  });
  return Object.freeze([
    ...STAGE_INTERVENTIONS,
    Object.freeze({
      change: Object.freeze({ kind: 'switch-dispatcher' as const, profile: switchTo.target }),
      label: switchDispatcherLabelOf(switchTo.target.name),
      explains: STAGE_SWITCH_EXPLAINS,
      ...(changesNothing ? { refusal: STAGE_SWITCH_NO_CHANGE } : {}),
    }),
  ]);
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
 * What this stage does not do.
 *
 * Declared beside the stage and **drawn on the build-information panel** with the other five
 * registers (`everyday/buildNotes.ts`, GitHub issue #207). The split from
 * `EVERYDAY_SHELL_ABSENCES` is by *owner* and is unchanged: the shell's register is about the
 * shell — screens it does not route to, a bar it does not draw — and this one is about § 7's stage
 * specifically. What changed is that a reader meets both in one place instead of meeting each on
 * the screen it is about.
 *
 * `STAGE_NO_GHOST` is the exception and the reason the exception is a rule: it is a **control's**
 * refusal, drawn on the ghost lane's own card as well as being in this register, because a control
 * that cannot act says so where the control is.
 *
 * ## One entry was **deleted** here rather than reworded, and the distinction is § D227's
 *
 * It read *"no decisions during a run — a day can carry a handover to another dispatcher and an
 * answered incident, and this screen offers neither"*, and half of it stopped being true on the
 * commit that put § 7.6's handover on this stage (GitHub issue **#171**). A refusal that has stopped
 * being true is worse than a missing one: it tells a reader not to look for a control that is there.
 * So the sentence went with the arm it described, and what stands in its place is a **narrower**
 * claim about the arm that is still absent — not the same sentence with a clause trimmed off it.
 *
 * That remaining entry is pinned by a run and not by another sentence: `stageScreenModel.test.ts`
 * asserts that no row this model can build carries an answer, so the day an answer arm lands the
 * check goes red and the sentence comes out with it.
 */
export const STAGE_ABSENCES: readonly string[] = Object.freeze([
  STAGE_NO_GHOST,
  'no campaign dock — a campaign day reaches this stage, and the money-and-incident panel that belongs beside it is not drawn',
  'no camera — the cutaway draws the whole building at once, so there is nothing to pan and nothing to follow',
  'no answer to a live incident — a day can carry one, stamped with the moment it was given, and this screen offers none: answering needs the money-and-incident panel above, and that panel is what is missing',
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
  /**
   * Whether the transport **the player is holding** has reached the end of the day — GitHub issue
   * **#287**, its fourth acceptance criterion.
   *
   * Optional, and the default is the state every existing caller was already in: a day still
   * running. It is the one fact on this input that is not about the *host* — the other three are
   * `runState()` reads — and that asymmetry is the point rather than an oversight. The playhead is
   * § 7's stage's own (`everyday/host.ts` refuses a transport method for the reason its docstring
   * gives), so nothing the host can be asked knows this; the screen holding the transport is the
   * only thing that does, and it writes it through `everyday/stageScreen.ts`'s `barFacts`.
   */
  readonly dayEnded?: boolean | undefined;
}

/**
 * What § 3.3's row says once the day has run out and nobody has filed it — issue **#287**.
 *
 * ## Why this sentence exists at all
 *
 * The issue's last section: at the top of § 7's speed ladder the stage's own playback finishes in a
 * few seconds, and from that instant the screen is **bit-for-bit identical** — the only delta on the
 * whole page being the transport button flipping `⏸ Pause` to `▶ Play`. Readers reported believing
 * the product had crashed. It looked temporary only because a second, covered transport was
 * running behind it and eventually filed the day; with that removed the stillness is permanent,
 * which is worse rather than better, and this is the half of the fix that owes the player a
 * sentence.
 *
 * ## Why it is a note and not a refusal
 *
 * The three sentences above it all resolve § 3.3's primary **inert**, because in each of those
 * states pressing it would do nothing. This one is the opposite state: the primary is exactly what
 * the player should press, and the row's job is to say so. So the note is replaced and the button
 * is left alone — a state where there is more to do, not less.
 *
 * ## Why it describes and does not instruct, which is a correction rather than a preference
 *
 * The first draft read *"the day has run out — **close it** and its report is written"*, and that
 * sentence is a lie on two of the four run contexts this one screen serves. § 3.3 gives the stage
 * primary a different verb in each: *Close the day* on `daily` and `campaign`, *End the rush* on
 * `rush`, and *Play this crowd yourself* on `watch` — where § 14.1 forbids closing the day at all,
 * because it is somebody else's. A note telling a spectator to close a day they may not close is
 * the inert-control defect wearing a caveat's clothes.
 *
 * The fix is not a list of the contexts where the instruction holds. It is to notice that the
 * instruction was never this cell's to give: the **primary sits immediately beside the note and
 * already says the verb**, correctly, in all four. So the note does the one job the button cannot —
 * it explains why the picture stopped — and says nothing about what to press. The three sentences
 * above it keep the same discipline, which is why they survive every context unchanged.
 *
 * Recorded as § D384, whose argument this docstring is.
 */
export const STAGE_DAY_OVER = 'the day has run out — the stage will not move again on its own';

/**
 * § 3.3's stage row, refined.
 *
 * The table's cell is *Close the day* with the note *Stops the clock and writes the report*, and it
 * is right for a running day. **Four** states the table cannot know: no run yet, a day already
 * filed, a re-simulation in flight, and a day that has run out and not been filed.
 *
 * The first three resolve the primary **inert** with the note saying why — the shell draws an inert
 * primary disabled, so the button never looks pressable while doing nothing (`BarPrimary.inert`'s
 * own contract). **The fourth is the one that does not**, and the asymmetry is the whole of it: a
 * day that has run out is the state in which the primary is most worth pressing, so the row
 * explains and does not refuse. {@link STAGE_DAY_OVER} carries the argument, including why it
 * describes rather than instructs.
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
  if (refusal === undefined) {
    /*
     * The fourth state, and it is the only one that leaves the primary alone — {@link STAGE_DAY_OVER}
     * carries why. **Below the three refusals rather than beside them**, which is an ordering by
     * cause and not by taste: a filed day's transport is also sitting at the end of the run, so a
     * day that has both run out and been filed must say *filed* — the newer fact would otherwise
     * shout over the older one and tell a player to press a button that is already inert.
     */
    return input.dayEnded === true ? { ...base, note: STAGE_DAY_OVER } : base;
  }
  return {
    ...base,
    primary: { ...base.primary, inert: refusal },
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

/* -------------------------------------------------------------------------- *
 * § 7.2 — the car: a body, a doorway, and marks that stay countable
 * -------------------------------------------------------------------------- */

/**
 * What a well says when its car is held out of service for the whole run.
 *
 * § 7.2's dashed, empty, labelled shaft. **Authored here rather than in the mount**, which is where
 * it was until [§ D347](../../../../DECISIONS.md): the cutaway draws five `fillText` sites and three
 * of them were composed in `everyday/stageScreen.ts`, so no honesty property could read them — not
 * the charter's M2 gate, not R6's temporal axis. The pure/DOM split this directory keeps exists so
 * that the words are drivable without a document, and a word the mount authors is a word outside it.
 */
export const STAGE_OUT_OF_SERVICE = 'OUT OF SERVICE';

/** The two things a car says about itself: how full it is, and which way it is going. */
export interface StageCarReadout {
  /**
   * `4/10` — the head count over the shaft's rated persons.
   *
   * The bare head count when the record carries no capacity for that shaft, because `4/` with
   * nothing after it is a ratio with half a denominator. Both are counts **at the playhead**, folded
   * by `frame/frameAt.ts`; neither is a whole-run figure, which is the rule this screen is built
   * around (see the module docstring).
   */
  readonly occupancy: string;
  /** `▲` or `▼` while the car is travelling, `undefined` while it stands. */
  readonly direction: string | undefined;
}

/** What {@link stageCarReadoutOf} needs — one car, at one instant. */
export interface StageCarReadoutInput {
  readonly occupants: number;
  /** `VizShaft.capacityPersons`, or `undefined` for a record that does not carry one. */
  readonly capacityPersons?: number | undefined;
  /** `Frame.direction`: `+1` up, `-1` down, `0` standing. */
  readonly direction: number;
}

/** The occupancy readout and the direction arrow a car draws over itself. */
export function stageCarReadoutOf(input: StageCarReadoutInput): StageCarReadout {
  const occupants = Math.max(0, Math.round(input.occupants));
  const capacity = input.capacityPersons;
  return {
    occupancy:
      capacity === undefined ? String(occupants) : `${String(occupants)}/${String(capacity)}`,
    direction: input.direction === 0 ? undefined : input.direction > 0 ? '▲' : '▼',
  };
}

/**
 * One rectangle of a car's paint, in the **body's own** coordinates — `(0, 0)` is its top-left.
 *
 * Body-relative rather than canvas-relative so the arithmetic is checkable without a canvas, which
 * is `docs/28-art-direction.md` § 5.2's stated acceptance for this function.
 */
export type StageCarRect = StageRect;

/** Everything painted inside one car, decided before anything is drawn. */
export interface StageCarPaint {
  /** The car's own box. `(0, 0, bodyWidth, carHeight)`, restated so an area rule has a divisor. */
  readonly body: StageCarRect;
  /**
   * The opening the leaves slide across, or `undefined` on a car too narrow to carry one.
   *
   * Never painted itself — it is the region the leaves live in, and the ink under it is the car's
   * interior showing through as they retract.
   */
  readonly doorway: StageCarRect | undefined;
  /** The amber leaves, left then right. Empty once the doors are open, or on a hairline car. */
  readonly leaves: readonly StageCarRect[];
  /** The occupancy marks, capped at {@link MAX_CAR_RIDERS} — § 14. */
  readonly marks: readonly StageCarRect[];
  /** The narrowest ink margin between the amber and the outside world. AD-S1 asks for at least 1. */
  readonly inkMarginPx: number;
  /** How much of the car is amber. AD-S2's *seam, not wash* is a claim about this over `body`. */
  readonly amberAreaPx: number;
}

/** What {@link stageCarPaintOf} needs. Four numbers; no canvas, no recording, no clock. */
export interface StageCarPaintInput {
  /** The ink body's width in device-independent pixels — the column's width less its inset. */
  readonly bodyWidth: number;
  readonly carHeight: number;
  /** `Frame.doorFraction`: `0` shut, `1` wide open. Exact between events. */
  readonly doorFraction: number;
  /** How many people are aboard. Capped here, not by the caller. */
  readonly occupants: number;
}

/** The mark grid is three across; nine marks is § 14's cap, so three down. */
const MARK_COLUMNS = 3;
/** One mark, square, in device-independent pixels. */
const MARK_PX = 2;
/** The gap between two marks when the car is wide enough to give them one. */
const MARK_GAP_PX = 1;
/** The amber seam a hairline car draws instead of a doorway. */
const SEAM_PX = 1;
/**
 * The narrowest body that can carry a doorway — `docs/28` § 5.2's *"a pitch under roughly 8 px"*.
 *
 * Below it the doorway would be under 5 px wide and its two leaves under 2 px each, which is not a
 * door anybody can see opening; the seam branch draws the only signal that survives at that size.
 */
const MIN_DOORWAY_BODY_PX = 8;
/**
 * The narrowest body that can carry even the seam.
 *
 * A 1 px seam needs 1 px of ink on **both** sides for AD-S1 to hold, so a body under 3 px draws no
 * amber at all. `vertical-city` reaches that regime on a narrow viewport — 35 cars across seven
 * banks put a car at roughly 2.4 px there — and an amber wash on a 2.4 px car is the defect this
 * function exists to remove, at the one size where nothing can be drawn instead.
 */
const MIN_SEAM_BODY_PX = 3;
/** The doorway's share of the body's width — `docs/28` § 5.2's conforming geometry. */
const DOORWAY_WIDTH_SHARE = 0.62;
/** The doorway's share of the car's inner height. The rest is the marks' band, above it. */
const DOORWAY_HEIGHT_SHARE = 0.45;

/**
 * **The car's paint plan** — `docs/28-art-direction.md` § 5.2, and GitHub issue **#212**'s first
 * defect.
 *
 * ## The defect this replaces
 *
 * The mount drew `leaf = ((width − 3) / 2) × (1 − doorFraction)` twice, from the body's two outer
 * edges. At `doorFraction = 0` each leaf was **half the body**, the two abutted on the centre line,
 * and together they covered the car completely. A shut car was a solid amber block, and a car is
 * shut for most of a run. The polarity was backwards from the read § 7.2 asks for — *"cars as dark
 * boxes with amber doors that split as they open"* — because the car's identity colour was the rare
 * state and the accent was the default.
 *
 * It had a measured second consequence, which is what decides the geometry rather than taste: the
 * nine occupancy marks are drawn **after** the leaves, in `paper`. On an open car that is `paper` on
 * `ink` at **14.54:1**; on a shut one it was `paper` on `sun` at **1.83:1**, the ratio
 * [§ D336](../../../../DECISIONS.md) measured and refused for text on this palette. *The occupancy
 * of a car was least legible in the state the car is in most of the time.*
 *
 * ## The three rules, and where each one is met
 *
 * - **AD-S1 — the car's identity is its body, never its door.** The doorway is inset on all four
 *   sides, so {@link StageCarPaint.inkMarginPx} is at least 1 at every `doorFraction`. Amber is a
 *   doorway, never a face.
 * - **AD-S2 — shut is a seam; open is a gap.** The two leaves are anchored at the doorway's *outer*
 *   edges and retract toward them as the fraction rises, so what changes is the **shape** of the ink
 *   channel between them: {@link SEAM_PX} wide when shut, the whole doorway when open. An area-only
 *   difference would be invisible on `vertical-city`, which draws a car roughly nine times narrower
 *   than `midtown-office` does.
 * - **AD-S3 — nothing that must be counted sits on amber.** The marks are laid out in the band
 *   **above** the doorway rather than over the whole body, so the two cannot intersect at any
 *   `doorFraction`. That is the rule met by construction rather than by a clamp, which is why the
 *   test can assert it as a property over the whole range.
 *
 * ## The two degenerate branches, one of which shipped buildings reach
 *
 * Under {@link MIN_DOORWAY_BODY_PX} there is no doorway: the amber is a 1 px seam in the same lower
 * band, drawn while the doors are more shut than open and omitted while they are more open than
 * shut. `vertical-city` — 35 cars across seven banks — is there on any viewport under about 900 px.
 *
 * Under {@link MIN_SEAM_BODY_PX}, or where the car is too short to hold a band of ink above the
 * amber, there is no amber at all. A seam with no ink beside it is the wash again at a smaller
 * scale, so AD-S1 is answered by drawing nothing rather than by shaving the margin.
 *
 * Pure, and exported so all three rules are checkable without a canvas — § 5.2's own acceptance.
 * Its one non-test caller is `everyday/stageScreen.ts#drawCutaway`, which paints the plan and
 * decides nothing about it.
 */
export function stageCarPaintOf(input: StageCarPaintInput): StageCarPaint {
  const bodyWidth = Math.max(0, input.bodyWidth);
  const carHeight = Math.max(0, input.carHeight);
  const fraction = Math.min(1, Math.max(0, input.doorFraction));
  const body: StageCarRect = { x: 0, y: 0, width: bodyWidth, height: carHeight };
  /* The ink frame: 1 px is AD-S1's floor, 2 px is as much as a 20 px car can spare. */
  const frame = Math.max(1, Math.min(2, carHeight * 0.12));
  const innerHeight = carHeight - 2 * frame;
  /*
   * The split every branch shares, and the whole of how AD-S3 is met: the amber lives in
   * the car's lower band and the marks in the band above it, so no mark can sit on amber at any
   * `doorFraction` and no clamp has to keep them apart.
   */
  const doorwayHeight = Math.max(1, innerHeight * DOORWAY_HEIGHT_SHARE);
  const doorwayY = carHeight - frame - doorwayHeight;
  const bandHeight = doorwayY - frame;
  const marks = markGrid(bodyWidth, frame, frame, bandHeight, input.occupants);

  /* No room for a band of ink above the amber is no room for amber. AD-S1 before anything else. */
  if (bandHeight < 1 || bodyWidth < MIN_SEAM_BODY_PX) {
    return { body, doorway: undefined, leaves: [], marks, inkMarginPx: bodyWidth / 2, amberAreaPx: 0 };
  }

  if (bodyWidth < MIN_DOORWAY_BODY_PX) {
    /* `docs/28` § 5.2's hairline branch: the seam is the only door signal that survives here. */
    const shut = fraction < 0.5;
    const leaves: readonly StageCarRect[] = shut
      ? [{ x: (bodyWidth - SEAM_PX) / 2, y: doorwayY, width: SEAM_PX, height: doorwayHeight }]
      : [];
    return {
      body,
      doorway: undefined,
      leaves,
      marks,
      inkMarginPx: shut ? Math.min((bodyWidth - SEAM_PX) / 2, frame, bandHeight) : bodyWidth / 2,
      amberAreaPx: shut ? SEAM_PX * doorwayHeight : 0,
    };
  }

  const doorwayWidth = bodyWidth * DOORWAY_WIDTH_SHARE;
  const doorwayX = (bodyWidth - doorwayWidth) / 2;
  const doorway: StageCarRect = {
    x: doorwayX,
    y: doorwayY,
    width: doorwayWidth,
    height: doorwayHeight,
  };
  /*
   * Anchored at the doorway's outer edges, retracting toward them. `SEAM_PX` is taken out of the
   * pair rather than off one side, so the ink channel is centred on the car and the two leaves stay
   * equal — a lift door read in elevation, which is what § 7.2 asks the picture to say.
   */
  const leafWidth = Math.max(0, ((doorwayWidth - SEAM_PX) / 2) * (1 - fraction));
  const leaves: readonly StageCarRect[] =
    leafWidth <= 0
      ? []
      : [
          { x: doorwayX, y: doorwayY, width: leafWidth, height: doorwayHeight },
          {
            x: doorwayX + doorwayWidth - leafWidth,
            y: doorwayY,
            width: leafWidth,
            height: doorwayHeight,
          },
        ];
  return {
    body,
    doorway,
    leaves,
    marks,
    /* Left and right of the doorway, the frame under it, and the marks' band over it — all ink. */
    inkMarginPx: Math.min(doorwayX, frame, bandHeight),
    amberAreaPx: leaves.reduce((total, leaf) => total + leaf.width * leaf.height, 0),
  };
}

/**
 * The occupancy marks, laid out inside one band of the car's interior.
 *
 * A **cluster** rather than three marks spread to the corners: at 222 px — `garden-apartments`' two
 * cars on a wide viewport — a grid stretched across the body reads as three unrelated dots, and what
 * § 7.2 asks for is *people inside the car*. The pitch collapses toward zero on a narrow car, which
 * is the same degradation the old layout had and is stated rather than clamped away: at that size a
 * reader counts nothing and the cluster is a smudge that says *somebody is aboard*.
 *
 * The band it is given is the caller's, and it is always the band **above** the doorway, which is
 * the whole of how AD-S3 is met — see {@link stageCarPaintOf}. Nothing here needs to know that,
 * which is the point: a layout that had to avoid the amber would be one clamp away from not.
 */
function markGrid(
  bodyWidth: number,
  frame: number,
  bandTop: number,
  bandHeight: number,
  occupants: number,
): readonly StageCarRect[] {
  const aboard = Math.min(Math.max(0, Math.round(occupants)), MAX_CAR_RIDERS);
  const acrossRoom = Math.max(0, bodyWidth - 2 * frame);
  /* A mark never leaves the body: on a hairline car it shrinks, and then it stops being drawn. */
  const size = Math.min(MARK_PX, acrossRoom, Math.max(0, bandHeight));
  if (aboard === 0 || size <= 0) return [];
  const rows = Math.ceil(MAX_CAR_RIDERS / MARK_COLUMNS);
  const acrossPitch = Math.min(size + MARK_GAP_PX, (acrossRoom - size) / Math.max(1, MARK_COLUMNS - 1));
  const downPitch = Math.min(size + MARK_GAP_PX, Math.max(0, bandHeight - size) / Math.max(1, rows - 1));
  /* Centred over the doorway below it rather than pushed into a corner: on a 222 px car — the two
     `garden-apartments` cars on a wide viewport — a cluster at the left edge reads as a smudge
     beside the lift rather than as the people in it. On a narrow car this is `frame` again. */
  const left = Math.max(frame, (bodyWidth - ((MARK_COLUMNS - 1) * acrossPitch + size)) / 2);
  const marks: StageCarRect[] = [];
  for (let index = 0; index < aboard; index += 1) {
    marks.push({
      x: left + (index % MARK_COLUMNS) * acrossPitch,
      y: bandTop + Math.floor(index / MARK_COLUMNS) * downPitch,
      width: size,
      height: size,
    });
  }
  return marks;
}

/* -------------------------------------------------------------------------- *
 * `docs/28` § 5.7 — the rest bar: what a car that is doing nothing looks like
 * -------------------------------------------------------------------------- */

/** What {@link stageCarRestBarOf} needs. Two numbers; no canvas, no recording, no clock. */
export interface StageCarRestBarInput {
  /** The ink body's width — the bar's slot, and the widest it may ever be. */
  readonly bodyWidth: number;
  /** `CarRest.fill`: `0` at 30 s of standing still, `1` at two minutes and after. */
  readonly fill: number;
}

/**
 * How far above the car's roof the bar's underside sits.
 *
 * The direction glyph's own baseline, which the mount draws at `y − 10`. The `riders/capacity`
 * readout sits between the two at `y − 1.5`, so the bar clears it: a mark that overlapped a live
 * figure would make the figure the thing that got harder to read, which is the trade AD-S3 refuses
 * one layer down.
 */
const REST_BAR_SLOT_ABOVE_PX = 10;

/**
 * **AD-S17 — the rest bar, on this stage** (`docs/28-art-direction.md` § 5.7).
 *
 * The cutaway draws `▲` or `▼` over a travelling car and, until now, **nothing at all** over one
 * that is standing — which `docs/35-problem-per-mode.md` § 3.2 lists as the highest-value absent
 * symptom in the product, because campaign stage 1 teaches parking and a parked car had no mark.
 * This is the third state of that one slot: up, down, and neither.
 *
 * ## Why the geometry is here and not in the mount
 *
 * The same reason {@link stageCarPaintOf} is — GitHub issue **#212**. The door-fill inversion was
 * arithmetic nothing could check without a canvas, and it shipped for a wave. A bar whose *length*
 * carries the whole magnitude channel is exactly that shape of claim: a mount that computed it
 * would be one sign error away from a mark that is longest when the car has just stopped, and no
 * node test could see it. The length rule itself is `render/carRest.ts#restBarWidthPx`, shared with
 * the Engineer stage so the two renderers cannot disagree about what the mark means.
 *
 * ## Where it sits
 *
 * In the direction glyph's own slot — centred on the car, on the glyph's baseline — returned in
 * the **body's** coordinates like every other rectangle this module plans, so `(0, 0)` is the car's
 * top-left and a negative `y` is above its roof. That is deliberate rather than sloppy: the mark
 * belongs to the car, and a caller that had to add the offset itself could put it over a different
 * one.
 */
export function stageCarRestBarOf(input: StageCarRestBarInput): StageCarRect {
  const width = restBarWidthPx(input.fill, input.bodyWidth);
  return {
    x: (input.bodyWidth - width) / 2,
    y: -REST_BAR_SLOT_ABOVE_PX - REST_BAR_THICKNESS_PX,
    width,
    height: REST_BAR_THICKNESS_PX,
  };
}
