/**
 * The renderer: one {@link Frame} onto one 2D context.
 *
 * Minimal on purpose. Phase 4's foundation wave delivers the *contract*, and a renderer exists
 * here to prove the contract carries everything a picture needs — a shaft, a car at its
 * analytic height, doors that open and shut, landing calls, a saturation warning — not to be
 * the finished viewer. Wave 2 replaces the drawing without touching anything above it.
 *
 * ## Why it draws against a structural interface
 *
 * {@link Canvas2DLike} is the subset of `CanvasRenderingContext2D` this file uses, written out
 * rather than imported from the DOM lib. Two payoffs, and the second is the one that matters:
 *
 * 1. The module has no DOM dependency, so it type-checks and runs under Node.
 * 2. A test can pass a recording stub and assert *what was drawn* — that a car appears at the
 *    y its height maps to, that a shut door is drawn shut. Rendering is the part of a viewer
 *    that normally escapes testing altogether; here it does not, and the seam is a real one
 *    because `src/dev/main.ts` passes the browser's own context through it.
 *
 * `drawScene` is a pure function of `(frame, recording, layout, theme)` in the sense that
 * matters: given equal inputs it issues an equal sequence of calls. That is asserted directly
 * in `canvas.test.ts`, and it is why "a stored run replays visually identically" follows from
 * the frame sequences matching.
 */

import type { LockedOutLanding } from '../access/lockedOut.js';
import { describeLockedOut } from '../access/lockedOut.js';
import { describePinnedQueues, pinnedQueuesAt } from '../frame/pinnedQueue.js';
import { STATE_GLYPHS } from '../access/zoning.js';
import type { FloorQueue, LandingAssignment, OverlayMetrics, WaitBand } from '../frame/overlay.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import type { DoorPhase, Frame, VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import type { Layout, ShaftColumn } from './layout.js';
import { LOAD_ALARM, drawOverlay, loadColour } from './overlay.js';
import { windowClause } from './runSummary.js';
import type { BuildingMood } from './mood.js';
import {
  BAND_GLYPH,
  MAX_INDIVIDUAL_GLYPHS,
  planQueueRow,
  type QueueRowPlan,
} from './riderQueue.js';
import { DAY_START_S, drawSky, isNight, type SkyBand, type SkyRamp } from './sky.js';
import { drawAlarmRule, drawRiderLane, figureClearancePx } from './riderFigures.js';
import { fillRoundedRect } from './shapes.js';
import * as tokens from './tokens.js';

/**
 * The subset of a 2D canvas context this renderer uses.
 *
 * ## What may be added to it, and what may not
 *
 * Every member here is one a recording stub can implement in a line and a test can read back.
 * The four added for the design handoff's stage — `quadraticCurveTo`, `closePath`, `fill` and
 * `arc` — pass that test: each records its own numbers, so a rounded car and a rider's head are
 * as legible in a transcript as a `fillRect` ever was.
 *
 * What is deliberately **absent** is anything that hands back an opaque handle. `measureText`
 * would oblige every stub to implement font metrics (see {@link CHAR_ADVANCE_PX});
 * `createLinearGradient` would make the sky a `[object Object]` in every transcript, which is
 * why `render/sky.ts` paints a ramp as strips instead. Both refusals are the same rule: **a call
 * this interface admits must say what it drew.**
 */
export interface Canvas2DLike {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: 'center' | 'end' | 'left' | 'right' | 'start';
  textBaseline: 'alphabetic' | 'bottom' | 'hanging' | 'ideographic' | 'middle' | 'top';
  globalAlpha: number;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
}

/**
 * Every colour the stage can draw, in one place — and **derived from `render/tokens.ts`, never
 * spelled here.**
 *
 * `docs/12` § 2.2 counted three hand-maintained copies of this project's palette and named the
 * defect class: *"one source, derived everywhere."* Two of the three are now the same file; the
 * stylesheet lane imports the same names. A hex literal appearing below is a regression.
 *
 * There are now **two** modes behind this one interface, and the interface is deliberately
 * unchanged by that: a `Theme` is what the renderer draws with, and which palette it was projected
 * from — {@link DARK_PALETTE} or `tokens.LIGHT_PALETTE`, through {@link themeFromPalette} — is the
 * resolver's business and never a branch inside a drawing function. `drawScene` has no idea which
 * mode it is in, which is the property that keeps *"equal frames draw equal call sequences"* true
 * of both.
 *
 * ## The rule this type has kept since wave 2
 *
 * **Two different claims never share a colour**, because the tests in this directory identify a
 * mark by its fill and a shared string silently merges two counts into one. Where the design's
 * own palette would merge two, the narrower claim moves and the wait-age band does not — the
 * divergences are named at `render/tokens.ts`'s `WAITING_UP` and `FLOOR_LABEL`.
 *
 * That rule is not a substitute for KB-15. Colour separates two claims *for a test*; a **glyph**
 * or a **word** separates them for a reader, and every claim on this canvas has one.
 */
export interface Theme {
  readonly background: string;
  /** A progress or load-bar track. Not the shaft recess — see {@link Theme.shaftRecess}. */
  readonly shaft: string;
  readonly shaftEdge: string;
  readonly floorLine: string;
  readonly text: string;
  readonly textDim: string;
  readonly car: string;
  readonly carLight: string;
  /** A car at or over the 80 % fill rule. Not the overload alarm — see {@link Theme.carOverload}. */
  readonly carHeavy: string;
  /** A car at or over the 1.1 overload alarm. Always accompanied by the `!` glyph — `KB-15b`. */
  readonly carOverload: string;
  readonly doorSeam: string;
  readonly waitingUp: string;
  readonly waitingDown: string;
  readonly warning: string;
  /** The metrics panel's ground. */
  readonly panel: string;
  /** A landing or shaft the pointer/keyboard has selected — `RV-T3`. */
  readonly highlight: string;
  /** An entrance or transfer floor's badge — `RV-07`. */
  readonly badge: string;
  /** A landing no car may serve — `RV-08`. */
  readonly restricted: string;
  /**
   * One colour per wait-age band — `docs/10` § 6.2, and **never the only signal**.
   *
   * Every band also has a distinct *shape* (`render/riderQueue.ts`'s `BAND_GLYPH`), because
   * `UX.md` KB-15 forbids colour as the sole carrier and § 3.1 restates it for this feature: Mini
   * Metro's players report losing to a station they never saw fill, and legibility of the fail
   * state is a separate problem from the fail state being good. These four exist so a sighted
   * reader gets the band *twice*; deleting them would cost nothing but contrast, which is what
   * `riderQueue.test.ts`'s colour-removal test asserts by planning a row under a theme whose four
   * are the same string.
   */
  readonly queueBands: Readonly<Record<WaitBand, string>>;
  /** A boarding that just happened — the relief transition. */
  readonly queueRelief: string;

  /* ---------------- the stage, `docs/12` § 1.3 M3 ---------------- */

  /** The four sky ramps. See `render/sky.ts` for which hour picks which. */
  readonly sky: Readonly<Record<SkyBand, SkyRamp>>;
  /** The translucent mass of the building, behind the plot. */
  readonly mass: string;
  /** One floor's slab. A wash 2–6 px deep, which is the floor line the stage draws instead. */
  readonly floorSlab: string;
  /** The dark recess a shaft is cut into. */
  readonly shaftRecess: string;
  /** The hairline around that recess. Lighter than {@link Theme.shaftEdge}, which is a border. */
  readonly shaftHairline: string;
  /** The travelling cable above a car. */
  readonly cable: string;
  /** A window with somebody behind it, after dark. */
  readonly windowNight: string;
  /** The same in daylight. */
  readonly windowDay: string;
  /** A floor with nothing special about it. Not {@link Theme.textDim} — see `render/tokens.ts`. */
  readonly floorLabel: string;
  /** A transfer floor's label and its `⇄`. The entrance's is {@link Theme.badge}. */
  readonly badgeTransfer: string;
  /** The line the entrance floor stands on. */
  readonly ground: string;
  /** Text printed inside a car. Dark, because the car it sits on is not. */
  readonly carLabel: string;
  /** A car held out of service — the filled pill under its shaft. */
  readonly outOfServiceOn: string;
  /** Text on that pill. */
  readonly outOfServiceOnText: string;
  /** A car in service — the unfilled pill. */
  readonly outOfServiceOff: string;
  /** Text on that pill. */
  readonly outOfServiceOffText: string;
  /**
   * A landing that has stacked past the alarm depth, and the `+N` on a truncated crowd.
   *
   * Shares its value with `queueBands.abandoned` and `carOverload`, which is the design's own
   * intent — one red, meaning *this is the thing that is wrong* — and is safe because all three
   * are separated from each other by shape and by the row they are drawn on.
   */
  readonly alarm: string;
}

/**
 * The dark mode's colours, as a {@link tokens.Palette} — assembled from `render/tokens.ts`'s own
 * exports, one field per constant, **no literal of its own**.
 *
 * ## Why the assembly is here and the light one is there
 *
 * `render/tokens.ts` declares both modes' colours; this file names the *claims* and projects a
 * palette onto them. The dark record is assembled here rather than beside `LIGHT_PALETTE` for a
 * mechanical reason worth stating, because it looks asymmetric and is not arbitrary:
 * `deadCode.test.ts`'s *"carries the palette on the namespace rule"* pin reads `tokens.PAGE` in
 * **this file**, and the fifty-seven constants stay live under the fifth audit because this file
 * namespace-imports them and reads every one by name. Assembling the dark record inside
 * `tokens.ts` would move them onto the weaker self-use rule and quietly make that pin false.
 *
 * `theme.test.ts` asserts this record against `tokens.ts`'s exports in both directions, so a
 * constant added there and forgotten here is red, and so is a field here naming nothing there.
 */
export const DARK_PALETTE: tokens.Palette = Object.freeze({
  page: tokens.PAGE,
  rail: tokens.RAIL,
  card: tokens.CARD,
  cardRaised: tokens.CARD_RAISED,
  raised: tokens.RAISED,
  edge: tokens.EDGE,
  edgeMid: tokens.EDGE_MID,
  edgeStrong: tokens.EDGE_STRONG,
  hairline: tokens.HAIRLINE,
  hintUnderline: tokens.HINT_UNDERLINE,
  text: tokens.TEXT,
  textDim: tokens.TEXT_DIM,
  textMuted: tokens.TEXT_MUTED,
  fainter: tokens.TEXT_FAINTER,
  accent: tokens.ACCENT,
  accentSoft: tokens.ACCENT_SOFT,
  accentInk: tokens.ACCENT_INK,
  over: tokens.OVER,
  measured: tokens.MEASURED,

  bandSettling: tokens.BAND_SETTLING,
  bandWaiting: tokens.BAND_WAITING,
  bandLong: tokens.BAND_LONG,
  bandAbandoned: tokens.BAND_ABANDONED,

  skyDawn: tokens.SKY_DAWN,
  skyDay: tokens.SKY_DAY,
  skyDusk: tokens.SKY_DUSK,
  skyNight: tokens.SKY_NIGHT,
  stageMass: tokens.STAGE_MASS,
  stageSlab: tokens.STAGE_SLAB,
  stageShaftRecess: tokens.STAGE_SHAFT_RECESS,
  stageShaftHairline: tokens.STAGE_SHAFT_HAIRLINE,
  stageCable: tokens.STAGE_CABLE,
  stageGround: tokens.STAGE_GROUND,
  stageWindowNight: tokens.STAGE_WINDOW_NIGHT,
  stageWindowDay: tokens.STAGE_WINDOW_DAY,
  doorGap: tokens.DOOR_GAP,

  floorLabel: tokens.FLOOR_LABEL,
  floorLabelEntrance: tokens.FLOOR_LABEL_ENTRANCE,
  floorLabelTransfer: tokens.FLOOR_LABEL_TRANSFER,
  floorLabelRestricted: tokens.FLOOR_LABEL_RESTRICTED,

  carLight: tokens.CAR_LIGHT,
  carMid: tokens.CAR_MID,
  carHeavy: tokens.CAR_HEAVY,
  carOverload: tokens.CAR_OVERLOAD,
  carDown: tokens.CAR_DOWN,
  carOccupantText: tokens.CAR_OCCUPANT_TEXT,
  waitingUp: tokens.WAITING_UP,
  waitingDown: tokens.WAITING_DOWN,

  oosOn: tokens.OOS_ON,
  oosOnText: tokens.OOS_ON_TEXT,
  oosOff: tokens.OOS_OFF,
  oosOffText: tokens.OOS_OFF_TEXT,

  alarm: tokens.ALARM,
  relief: tokens.RELIEF,
  highlight: tokens.HIGHLIGHT,
  warning: tokens.WARNING,
  previewFloorLine: tokens.PREVIEW_FLOOR_LINE,
});

/**
 * A palette, projected onto the claims this renderer makes — the **one** place that projection
 * happens, for either mode.
 *
 * Where a name here and a name in `render/tokens.ts` differ, the token is the design's word for
 * the colour and this is the renderer's word for the claim; the indirection is the point, because
 * a claim can be re-pointed at a different token without the design's vocabulary moving. It is
 * also what makes a second mode a palette rather than a second renderer: `render/theme.ts` resolves
 * `system`/`dark`/`light` to a `Palette` and hands the result through here, so the stage repaints
 * with the shell instead of staying dark under a light page.
 *
 * The comments below are the divergences and the collisions — every one of them a property of the
 * *claims*, so every one of them true of both modes, which is why they live here and not in either
 * palette.
 */
export function themeFromPalette(palette: tokens.Palette): Theme {
  return Object.freeze({
    background: palette.page,
    shaft: palette.rail,
    shaftEdge: palette.edge,
    floorLine: palette.previewFloorLine,
    text: palette.text,
    textDim: palette.textDim,
    car: palette.carMid,
    carLight: palette.carLight,
    carHeavy: palette.carHeavy,
    carOverload: palette.carOverload,
    // Distinct from `background` on purpose, and the reason is unchanged by the repalette: they
    // would look the same on screen, but a test that identifies the door seam by its fill would
    // then also match the background wash, and it did. The design's own door gap
    // (`rgba(5,8,13,.92)`) happens to keep the two apart, which is luck rather than design, so the
    // property is asserted in `stageRender.test.ts` rather than left to it.
    doorSeam: palette.doorGap,
    // The design paints *up* and *the freshest wait band* the same green. They are two claims on
    // one row and `canvas.test.ts` counts one of them by its fill, so the direction pair moves and
    // the band palette keeps § S7's value. See `render/tokens.ts`'s `WAITING_UP`.
    waitingUp: palette.waitingUp,
    waitingDown: palette.waitingDown,
    warning: palette.warning,
    panel: palette.card,
    highlight: palette.highlight,
    badge: palette.floorLabelEntrance,
    restricted: palette.floorLabelRestricted,
    queueBands: Object.freeze({
      // § S7's four, verbatim. The note this comment replaced said `settling` had to avoid
      // `textDim`'s grey because a test identifying a settling rider by its fill also matched every
      // floor label; that collision is closed from the other side now — the floor label has its own
      // token (`FLOOR_LABEL`) and the band is the design's green. The *rule* has not changed, only
      // which of the two claims moved to satisfy it.
      settling: palette.bandSettling,
      waiting: palette.bandWaiting,
      long: palette.bandLong,
      abandoned: palette.bandAbandoned,
    }),
    // Distinct from `waitingUp` and `carLight`, which are the other two greens. They would read the
    // same on screen, and a test that identified the relief mark by its fill would then also match
    // every up-call badge and every lightly-loaded car — which it did.
    queueRelief: palette.relief,

    sky: Object.freeze({
      dawn: palette.skyDawn,
      day: palette.skyDay,
      dusk: palette.skyDusk,
      night: palette.skyNight,
    }),
    mass: palette.stageMass,
    floorSlab: palette.stageSlab,
    shaftRecess: palette.stageShaftRecess,
    shaftHairline: palette.stageShaftHairline,
    cable: palette.stageCable,
    windowNight: palette.stageWindowNight,
    windowDay: palette.stageWindowDay,
    floorLabel: palette.floorLabel,
    badgeTransfer: palette.floorLabelTransfer,
    ground: palette.stageGround,
    carLabel: palette.carOccupantText,
    outOfServiceOn: palette.oosOn,
    outOfServiceOnText: palette.oosOnText,
    outOfServiceOff: palette.oosOff,
    outOfServiceOffText: palette.oosOffText,
    alarm: palette.alarm,
  });
}

/**
 * Readable on a projector and in a screenshot, which is the whole specification — the dark mode,
 * and the theme every caller that names no other one still gets.
 *
 * It is now *derived* rather than spelled: `themeFromPalette(DARK_PALETTE)`. Nothing about its
 * values moved, and `drawScene`'s `input.theme ?? DEFAULT_THEME` is unchanged, so a caller that
 * hands no theme is exactly where it was. A caller that has resolved a player's `theme` setting —
 * `dev/main.ts`, through `render/theme.ts#themeFor` — hands `resolved.stage` instead, and the
 * stage repaints with the shell rather than staying dark under a light page.
 */
export const DEFAULT_THEME: Theme = themeFromPalette(DARK_PALETTE);

export interface SceneInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly layout: Layout;
  readonly theme?: Theme;
  /**
   * The live metrics panel's data. Omitted, no panel is drawn.
   *
   * Passed in rather than computed here because `drawScene` must stay a pure function of its
   * inputs — the property `canvas.test.ts` asserts and the one that turns "the frame sequences
   * match" into "the pictures match".
   */
  readonly overlay?: OverlayMetrics | undefined;
  /** The landing the reader has selected, and the car the record says answers it — `RV-T3`. */
  readonly selection?: SceneSelection | undefined;
  /**
   * Floor ids that no shaft in this building serves — `RV-08`.
   *
   * Derived by the caller from the recording's own `servedFloorIds`, so that "unassignable" is a
   * statement about the geometry rather than about how long somebody has been waiting.
   */
  readonly unservedFloorIds?: readonly string[] | undefined;
  /**
   * Floors with somebody standing at a call **no car answers in this run** — `D10`, `RV-08`.
   *
   * Distinct from {@link SceneInput.unservedFloorIds}, which is geometry: a floor no shaft
   * reaches. This is an *outcome* — a call the run left unanswered — and until now its only
   * surface anywhere in the viewer was the caption `drawSelection` draws for a landing the reader
   * had picked out of the landing `<select>`. That selector is `wide-only` (dropped below 1280 px)
   * and the Phase 9 design sends it to Advanced mode, while the same design lists a locked-out
   * call among the facts Basic mode may never hide. A fact with one optional surface is a fact
   * that is usually not shown, so it is drawn on the landing itself and named in the banner.
   *
   * Derived by the caller from `landingAssignmentsAt`, for the reason `SceneInput.overlay` is:
   * `drawScene` stays a pure function of its inputs, and the renderer never reaches for a
   * recording-wide scan of its own.
   */
  readonly unansweredCallFloorIds?: readonly string[] | undefined;
  /**
   * Landings whose calls **no car may legally answer** — `docs/10` § 10.4, `U8`.
   *
   * The third member of a family whose two existing members it must not be confused with, and
   * the reason all three are separate inputs rather than one *"unavailable"* list:
   *
   * | input | the fact | the fix |
   * |---|---|---|
   * | {@link SceneInput.unservedFloorIds} | **service** zoning: no shaft reaches this floor | build a bank that serves it |
   * | {@link SceneInput.unansweredCallFloorIds} | an **outcome**: a car could have taken this call and none did | more cars, a better policy |
   * | this | **access** zoning: the call carries no credential the cars will accept | a dispatcher that reads credentials, or a credential for the rider |
   *
   * `CLAUDE.md` forbids collapsing the three kinds of zoning, and a renderer that drew a floor no
   * shaft reaches the same way as a floor no credential opens would do exactly that in the one
   * place a reader actually looks.
   *
   * Derived by the caller from `access/lockedOut.ts`, for the reason {@link SceneInput.overlay}
   * and {@link SceneInput.unansweredCallFloorIds} are: which floors are access-controlled is a
   * fact about the *building*, and `drawScene` stays a pure function of what it is handed.
   */
  readonly lockedOutLandings?: readonly LockedOutLanding[] | undefined;
  /**
   * Per-floor rider queues at this instant — `docs/10` § 6, U4.
   *
   * Omitted, the landings draw exactly what they drew before: the `▲n ▼n` direction counts. Given,
   * the counts stay *and* every waiting person is drawn — individually while there are few enough
   * of them, then with a `+N`, then as a log-scaled bar (§ 6.2). The counts are not replaced,
   * because they are the only thing on the row that says which way people want to go.
   *
   * Passed in rather than computed here for the reason {@link SceneInput.overlay} is: `drawScene`
   * stays a pure function of its inputs, so `canvas.test.ts` can assert what was drawn without
   * running a simulation.
   */
  readonly queues?: readonly FloorQueue[] | undefined;
  /**
   * The building's mood, from observations alone — D4, and R1's payoff.
   *
   * On the canvas because the canvas is what **Export PNG** writes to a file: a mood that lived
   * only in the DOM would be absent from the one artefact that leaves the building. The gauge's
   * reasons stay in the DOM, where they can be read and copied.
   */
  readonly mood?: BuildingMood | undefined;
  /**
   * Simulated seconds from midnight to `simTimeS === 0` — `docs/12` § 4.1.
   *
   * The stage's sky and its lit windows are keyed on the hour, and the hour is
   * `dayStartS + frame.simTimeS`. Defaults to `06:00`, which is where the handoff's day begins.
   *
   * **To be re-sourced.** `packages/viz/src/live/timeline.ts` is being written in a parallel lane
   * and will own `DAY_START_S` and the `hh:mm` formatter for the whole viewer; `render/` may not
   * import from `src/live/` in this wave, so the default lives in `render/sky.ts` and this option
   * lets the caller override it in the meantime. When that module lands, this default should come
   * from it and `render/sky.ts`'s copy should be deleted rather than kept in step by hand.
   */
  readonly dayStartS?: number | undefined;
  /**
   * The bank the caller narrowed `layout` to, when it narrowed it at all — `SG-15`, `RS-05`.
   *
   * The layout arrives already filtered — `buildLayout` takes the shafts it is given — so this
   * field carries the *claim*, not the geometry: `RS-05` forbids silent truncation, and a stage
   * showing two of twelve shafts must say so. `drawNotices` counts the whole building from
   * {@link SceneInput.recording} and the shown set from the layout, so the caption cannot drift
   * from either. `undefined` means the layout holds the whole building and no caption is owed.
   */
  readonly filteredBankId?: string | undefined;
}

/** A rectangle the caller can hit-test a pointer against. Canvas coordinates, CSS pixels. */
export interface SceneHitRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One shaft's service badge, and where it was drawn — `docs/12` § 1.5 B7.
 *
 * The renderer draws the badge and reports its rectangle; **it does not handle the click.** A
 * pointer belongs to the DOM and `boundaries.test.ts` rule 3 keeps the DOM in `src/dev/`, so the
 * seam is a rectangle and a car id. `src/dev/` turns one into a `recordRun` re-run with the car
 * in {@link VizRecording.outOfServiceCarIds}; nothing here knows that happens.
 *
 * Reported rather than recomputed by the caller for the reason the whole of this directory
 * exists: a hit box computed in `dev/main.ts` from the same arithmetic is a second copy of the
 * layout, and the two would drift the first time a badge moved.
 */
export interface CarBadgeHit {
  readonly carId: string;
  /** The short label drawn above the shaft, so a caller can name the car in a tooltip. */
  readonly label: string;
  /** What the badge currently says. `true` draws `OOS`, `false` draws `⏻`. */
  readonly outOfService: boolean;
  /**
   * The hit rectangle, **larger than the drawn pill** — the artefact's own three pixels of slop
   * on each side (`:2110`). A 26 × 15 target is below every pointer guideline there is; the slop
   * does not fix that and it does make the badge forgiving at the corners.
   */
  readonly rect: SceneHitRect;
}

/** The landing the stage's alarm chip should name — `docs/12` § 1.3 M3. */
export interface StageAlarm {
  readonly floorId: string;
  readonly label: string;
  readonly waiting: number;
}

/**
 * What the draw produced that a caller outside the canvas needs.
 *
 * `drawScene` returned `void` until the stage acquired a control. It now returns the two things
 * that cannot be recovered from the inputs without re-deriving the layout: where the badges
 * landed, and which landing raised the alarm. Both are *reports of what was drawn*, so the chip
 * above the stage and the rule across the floor can never disagree about which floor is in
 * trouble — which is the same argument `SceneInput.overlay` makes in the other direction.
 */
export interface SceneHits {
  readonly carBadges: readonly CarBadgeHit[];
  /**
   * The deepest landing past the alarm depth, or `undefined`. One rather than a list, because the
   * chip is one chip; the *rules* are drawn on every landing that crossed.
   */
  readonly alarm: StageAlarm | undefined;
}

/**
 * What the reader has picked out, and what the record says about it.
 *
 * The three destination fields are absent under the conventional model and present under
 * `destination-dispatch`, where the thing selected is a *destination call* rather than a
 * direction button. See {@link LandingAssignment}.
 */
export interface SceneSelection {
  readonly floorId: string;
  readonly answeredByCarId?: string | undefined;
  readonly answeredInS?: number | undefined;
  readonly waiting?: number | undefined;
  readonly oldestWaitS?: number | undefined;
  /** Where this call is going, under `destination-dispatch`. */
  readonly destinationFloorId?: string | undefined;
  /** The car the landing panel named, under `destination-dispatch`. */
  readonly promisedCarId?: string | undefined;
}

const FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_BOLD = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * One frame, onto one context — the whole stage, back to front.
 *
 * The order is the design's (`:1998–2162`) and it is load-bearing rather than incidental: the sky
 * is behind the mass, the mass is behind the slabs, the slabs are behind the shafts, the people
 * stand in front of all of it, and the ground line is drawn last so it is not washed out by the
 * mass. The four things that are **not** the design's — the header band, the landing gutter, the
 * notices row and the metrics panel — are drawn where they always were, because each of them is a
 * claim the handoff's prototype had no way to make and this viewer is not allowed to stop making.
 */
export function drawScene(ctx: Canvas2DLike, input: SceneInput): SceneHits {
  const { recording, frame, layout } = input;
  const theme = input.theme ?? DEFAULT_THEME;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  /*
   * The sky, and the hour it was painted for.
   *
   * The hour is returned rather than recomputed by the two other functions that need it —
   * the lit windows and nothing else, today — so a scene can never be lit for a different time of
   * day than the one it is painted under. `render/sky.ts` for why the hour cannot come from a
   * clock and why the ramp is strips rather than a `CanvasGradient`.
   */
  const hour = drawSky(ctx, {
    width: layout.width,
    height: layout.height,
    simTimeS: frame.simTimeS,
    dayStartS: input.dayStartS ?? DAY_START_S,
    palette: theme.sky,
  });

  drawBuildingMass(ctx, layout, theme);
  drawHeader(ctx, input, theme);
  drawFloors(ctx, input, theme, hour);
  drawShafts(ctx, input, theme);
  drawCars(ctx, input, theme);
  const carBadges = drawServiceBadges(ctx, input, theme);
  const alarm = drawRiderLanes(ctx, input, theme);
  drawGroundLine(ctx, input, theme);
  drawLandings(ctx, input, theme);
  drawSelection(ctx, input, theme);
  drawNotices(ctx, input, theme);
  drawFooter(ctx, recording, frame, layout, theme);
  if (input.overlay !== undefined) {
    drawOverlay(ctx, { recording, frame, layout, theme, metrics: input.overlay });
  }
  ctx.restore();
  return { carBadges, alarm };
}

/**
 * The mass of the building, behind everything the plot holds — design `:2018–2020`.
 *
 * Eight pixels of bleed above and below, so the top and bottom slabs sit *inside* the mass rather
 * than on its edge. Without it the building has no roof and no basement and the shafts appear to
 * float on the sky.
 */
function drawBuildingMass(ctx: Canvas2DLike, layout: Layout, theme: Theme): void {
  ctx.fillStyle = theme.mass;
  ctx.fillRect(layout.plot.x, layout.plot.y - 8, layout.plot.width, layout.plot.height + 16);
}

/**
 * The line the entrance floor stands on — design `:2159–2162`.
 *
 * Drawn last, and it starts ten pixels into the label gutter so it reads as the ground the whole
 * building is on rather than as one more floor slab. A building with no entrance floor — which
 * the schema permits and no shipped building is — simply gets no ground line, rather than one
 * drawn at an arbitrary floor.
 */
function drawGroundLine(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout } = input;
  const entrance = layout.rows.find((row) => row.isEntrance);
  if (entrance === undefined) return;
  ctx.strokeStyle = theme.ground;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.plot.x - 10, entrance.y + slabHeightPx(layout) + 0.5);
  ctx.lineTo(layout.plot.x + layout.plot.width, entrance.y + slabHeightPx(layout) + 0.5);
  ctx.stroke();
}

/**
 * A floor slab's depth — design `:2016`, `max(2, min(6, pitch × 0.18))`.
 *
 * The stage draws a slab where the viewer used to draw a hairline. It is the same claim — *there
 * is a floor here* — at a weight that reads as structure, and it is clamped at both ends so a
 * 101-storey building gets 2 px rather than a smear and a four-storey one gets 6 px rather than a
 * plinth. One function because three callers need the same number: the slab itself, the ground
 * line that sits under one, and the alarm rule that sits under another.
 */
function slabHeightPx(layout: Layout): number {
  return Math.max(2, Math.min(6, layout.pitchPx * 0.18));
}

/**
 * A glyph per door phase, so door state is never carried by geometry alone — `KB-15a`.
 *
 * `D18` split `KB-15` because the row claimed three redundant signals and shipped one. The gap
 * width is a real signal and stays; this is the second one, and it is a *glyph* rather than a
 * colour precisely because the complaint was that colour was doing the work.
 *
 * The pair of half-blocks reads as leaves: `◂▸` are moving apart, `▸◂` are coming together.
 */
export function doorGlyph(phase: DoorPhase): string {
  switch (phase) {
    case 'closed':
      return '▮';
    case 'opening':
      return '◂▸';
    case 'open':
      return '▯';
    case 'closing':
      return '▸◂';
  }
}

/**
 * Has the playhead reached the run's last instant? — the stage's copy of `shiftIsOver`.
 *
 * `dev/leftRail.ts#shiftIsOver` is the same comparison and says why it is `>=` rather than `===`.
 * It is **not imported**: `render/` may not depend on `dev/`, and `dev/leftRail.ts` already imports
 * `render/mood.js`, so the arrow points this way or it points into a cycle. The duplication is held
 * shut by a test rather than by an argument — `leftRail.test.ts` pins this function equal to the
 * rail's at five playheads of a real recording, which is the pattern that file already uses for
 * `moodDriverRowsOf` against `mood.provisional`. It is pinned *there* because the dependency runs
 * that way round.
 *
 * `recording.status` is deliberately not consulted, for `shiftIsOver`'s stated reason: a
 * `timed-out` run is finished too, and it is the one whose terminal frame matters most.
 */
export function playheadHasReachedEnd(recording: VizRecording, frame: Frame): boolean {
  return frame.simTimeS >= recording.endedAt;
}

/** How many people the run has not got where they were going, and whose window that is. */
export interface UndeliveredReading {
  /**
   * `true` once the playhead has reached `endedAt`, when {@link count} is `summary.undelivered` —
   * the run's own figure, which is only true of the finished run.
   */
  readonly wholeRun: boolean;
  /**
   * The count a surface may print **at this playhead**.
   *
   * Before the end it is `arrived - carried` off {@link observationsAt}: everybody whose call had
   * been registered and who had not yet reached their destination. Not a synonym for *undelivered*
   * and never worded as one — it includes the riders who gave up on the lift and the riders the
   * door turned away (§ D265, § D266), which is the honest reading of *still in the building and
   * not where they were going*, and it is exactly the quantity `honesty/properties.ts`'s R6 reads
   * back, so the product and the oracle cannot hold two definitions of it.
   */
  readonly count: number;
}

/**
 * RV-16's lead clause, **dated** — the fix for the temporal finding property R6 opened with.
 *
 * ## What was wrong, and why nothing had asked *at what playhead*
 *
 * `summary.undelivered` is *how many people were still in the building when the run ended*.
 * `record/recordRun.ts` simulates the whole day up front, so it exists before the first paint, and
 * both the stage banner and `describeFrame`'s status sentence printed it at **every** playhead. On
 * `honesty-9100032` (Vertical City, 2 817 s) that is `TIMED-OUT — 127 undelivered` at 00:00, when
 * nobody is undelivered yet, and the same `127` at 704 s, when the live figure is **376**. Not
 * merely early: wrong by a factor of three, in the one clause `UX.md`'s RV-16 makes lead the banner
 * because *"it is the fact that decides how much of the rest means anything"* — and the rest it
 * qualifies is the picture at that instant, which a whole-run fold cannot qualify.
 *
 * ## Why a live figure, and not § D293's gate or § D294's scoping
 *
 * Both precedents were available and both were tried on paper first.
 *
 * - **§ D293's gate** — withhold the whole-run reading and retract in words, as
 *   `dev/leftRail.ts#moodDriverPanelOf` does — is right for a card the reader can come back to.
 *   Here it would take RV-16's lead off the bitmap for the whole of the run it is about, and
 *   § D294 already refused that trade **on this same canvas**: gating the footer would have
 *   stripped § 7.4's window clause off every PNG exported mid-run, *one honesty rule spending
 *   another*, because a bitmap has no later.
 * - **§ D294's scoping** — `127 undelivered when the run ended` — keeps the clause on the bitmap
 *   and is honest. It is what the footer does, and it is not enough here: the reader is watching
 *   376 people stack up on the same image, and a correctly-scoped 127 beside them is still two
 *   answers to one question. Scoping rescues a figure a surface has no live counterpart for. The
 *   banner has one.
 *
 * So the banner publishes a **true number at the playhead** and the run's own figure once the
 * playhead has earned it, and the two are worded differently — *still in the building* against
 * *undelivered* — because they are different quantities and a shared noun would invite the reader
 * to watch one turn into the other. `recording.status` is still printed verbatim at every playhead,
 * which is § D294's ruling on this same header and is left standing: `timed-out` is the status a
 * friendlier vocabulary would round off, and a mid-run export that dropped it would be RV-16's
 * defect back again.
 *
 * ## Cost
 *
 * `observationsAt` is one pass over `recording.legs` plus a queue sweep, and `drawScene` runs per
 * painted frame. It is called only on the branch that needs it — a run whose status is not
 * `completed`, at a playhead short of the end — so a completed run pays nothing and the rail, which
 * calls it every frame regardless, remains the surface that sets the budget.
 */
export function undeliveredAt(recording: VizRecording, frame: Frame): UndeliveredReading {
  if (playheadHasReachedEnd(recording, frame)) {
    return { wholeRun: true, count: recording.summary.undelivered };
  }
  const live = observationsAt(recording, frame.simTimeS);
  return { wholeRun: false, count: live.arrived - live.carried };
}

function drawHeader(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { recording, frame, layout } = input;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = FONT_BOLD;
  ctx.fillStyle = theme.text;
  ctx.fillText(recording.buildingName, 12, layout.header.titleY);

  ctx.font = FONT;
  ctx.fillStyle = theme.textDim;
  const meta = `${recording.dispatcherProfileId} · seed ${recording.seed} · ${formatClock(frame.simTimeS)} / ${formatClock(recording.endedAt)}`;
  ctx.fillText(meta, 12, layout.header.metaY);

  ctx.textAlign = 'right';
  ctx.fillStyle = theme.text;
  /*
   * Clipped against the meta line, for the reason the banner is clipped against the title.
   *
   * The two share a row and nothing stopped them meeting: on a narrow canvas the counters were
   * drawn straight through the seed, and `R7` makes the seed the one thing on that line that may
   * never be lost. So the counters yield — they are also the line that repeats what the run
   * summary panel says at length, and the seed is not.
   */
  const metaPx = 12 + meta.length * CHAR_ADVANCE_PX + 16;
  ctx.fillText(
    fitLabel(
      `waiting ${String(frame.totalWaiting)}   boarded ${String(frame.boardedLegs)} legs   ${meanClause(
        recording,
        frame,
      )}`,
      layout.width - 12 - metaPx,
    ),
    layout.width - 12,
    layout.header.metaY,
  );

  // The one statistic a viewer must never quietly average. `awtIsValid` is copied from the
  // summary, not recomputed, so the picture and the report suppress on the same grounds.
  //
  // A run that did not deliver everybody leads the banner (`RV-16`): it is the fact that decides
  // how much of the rest means anything, and until wave 2 it lived only in the DOM status line.
  //
  // The count beside it is read **at the playhead** — see {@link undeliveredAt}. Until R6 measured
  // it, this was `summary.undelivered` on every frame: the run's ending drawn over its middle.
  const banner: string[] = [];
  if (recording.status !== 'completed') {
    const undelivered = undeliveredAt(recording, frame);
    banner.push(
      `${recording.status.toUpperCase()} — ${String(undelivered.count)} ${
        undelivered.wholeRun ? 'undelivered' : 'still in the building'
      }`,
    );
  }
  /*
   * `docs/10` § 10.4, **second** — before saturation and before the unanswered count, and after
   * the status for `RV-16`'s reason.
   *
   * Order is priority here, because the line is clipped from the right when it does not fit
   * (below). A structural refusal — these calls could never have been answered by anybody —
   * outranks both a statistic being suppressed and a count of calls that merely went unanswered,
   * and it is the one of the four a reader can act on. It does **not** replace the unanswered
   * clause: the two are different claims about different calls, and a reader needs both counts.
   *
   * The `short` form: the floors are already marked `▩` on their own rows, and this is one line.
   */
  const lockedOut = describeLockedOut(input.lockedOutLandings ?? [], { short: true });
  if (lockedOut !== '') banner.push(lockedOut);
  /*
   * A landing every rider on it was promised one full car — § D29's cost, made visible.
   *
   * Above the saturation clause deliberately, and the ordering is by *cause* exactly as
   * `docs/03`'s abandonment-above-censoring ordering is. A reader looking at a crowd standing
   * still beside cars that are not taking them is looking for the reason; "SATURATED — AWT
   * suppressed" is true and sends them after a statistic, and it is the second thing they need.
   *
   * Derived here rather than taken as a new `SceneInput` field, because everything it needs is
   * already handed in: the queues carry the promise, the shafts carry the capacity. A conventional
   * run has no promises and this contributes nothing to the banner.
   */
  const pinned = describePinnedQueues(
    pinnedQueuesAt(input.queues ?? [], recording.shafts, recording.passengerModel),
    { short: true },
  );
  if (pinned !== '') banner.push(pinned);
  if (recording.summary.saturated) banner.push('SATURATED — AWT suppressed');
  else if (!recording.summary.awtIsValid) banner.push('AWT suppressed');
  // `D10` — a call no car answered is never left to the landing selector alone. See
  // {@link SceneInput.unansweredCallFloorIds}.
  const unanswered = input.unansweredCallFloorIds ?? [];
  if (unanswered.length > 0) {
    banner.push(
      `${String(unanswered.length)} landing${unanswered.length === 1 ? '' : 's'} unanswered — ${
        unanswered.length === 1 ? 'no car answers' : 'no car answers those calls'
      } in this run`,
    );
  }
  if (banner.length > 0) {
    ctx.fillStyle = theme.warning;
    /*
     * Clipped so it cannot overprint the building name.
     *
     * The banner is right-aligned on the **same line** as the title, which is drawn at `x = 12`
     * in the bold face. Nothing stopped the two meeting in the middle, and on Secure Tower at
     * 800 px they did — *"⊘Secure Tower"* with the banner's tail written through it, which was
     * already true of the four-clause banner before § 10.4 added a fifth. Found by driving it.
     *
     * The full sentence is never lost: `describeFrame` writes it into the canvas's `aria-label`
     * unabbreviated, which is the surface with no width limit.
     */
    const titlePx = 12 + recording.buildingName.length * BOLD_CHAR_ADVANCE_PX + 16;
    ctx.fillText(
      fitLabel(banner.join('   ·   '), layout.width - 12 - titlePx),
      layout.width - 12,
      layout.header.titleY,
    );
  }

  /*
   * The mood, on the bitmap — D4.
   *
   * The **glyph first**, then the word, then (when it is one) the provisional marker. All three are
   * text, so a greyscale export carries the whole claim: KB-15's rule is not satisfied by drawing
   * the same fact in two colours.
   *
   * Nothing here is suppressible, which is the point of R1 — this line is drawn on the 46 of 60
   * shipped configurations (**M1**) where the header two lines up says `mean wait suppressed`.
   *
   * `layout.header.moodY` and not `48`: the literal `48` put this line straight through the bank
   * labels on every multi-bank building, because `drawShafts` writes those at `plot.y − 18` and the
   * 64 px header left the two rows ten pixels apart. Both numbers were locally correct and neither
   * owned the row. See {@link HeaderBand}.
   */
  const mood = input.mood;
  if (mood !== undefined) {
    ctx.textAlign = 'left';
    ctx.fillStyle = mood.level === 'calm' ? theme.textDim : theme.warning;
    ctx.fillText(
      fitLabel(`${mood.glyph} ${mood.headline}`, layout.width - 24),
      12,
      layout.header.moodY,
    );
  }
}

/**
 * The header's third field: the live running mean, or the fact that it is suppressed.
 *
 * ## Why a suppressed run gets no number here, and why that is not a display preference
 *
 * The header used to draw `mean wait so far 87.7 s` unconditionally, on the line immediately
 * below the `SATURATED — AWT suppressed` banner *the same function draws*. Worse than two
 * surfaces disagreeing: it is **one** `<canvas role="img">`, whose `aria-label` — written by
 * `describeFrame` from the same summary — reads *"Mean waiting time is suppressed… Rolling mean
 * wait over the last 300 seconds is not reported."* The sighted reader saw a number the
 * non-sighted reader was told did not exist, and **Export PNG** baked it into a shareable file,
 * because the canvas is the export source.
 *
 * It leaked on **both** grounds, not only saturation: Secure Tower at seed
 * `16757712606996968457` reports `TIMED-OUT — 20 undelivered · AWT suppressed` beside
 * `mean wait so far 21.0 s`.
 *
 * `Frame.runningMeanWaitS` being a *running* figure rather than the reported AWT does not rescue
 * it. `UX.md` § A.3 forbids **a mean waiting time** on a saturated run and **an AWT when
 * `awtIsValid` is false** on a successful one, and the running mean is a mean waiting time over a
 * run whose queues the statistics module refused to stand behind. `frame/overlay.ts` already
 * suppresses the rolling window mean and the per-bank means on exactly these grounds; this is the
 * one place that did not.
 *
 * The word rather than an em dash, because `—` already means *nobody has been served yet* — a
 * different fact, and one the reader can act on.
 */
function meanClause(recording: VizRecording, frame: Frame): string {
  if (meansAreSuppressed(recording)) return 'mean wait suppressed';
  const mean = frame.runningMeanWaitS;
  return `mean wait so far ${mean === undefined ? '—' : `${mean.toFixed(1)} s`}`;
}

/**
 * Slabs, lit windows and labels — design `:2023–2045`.
 *
 * ## The three floor badges, and the one that was not adopted
 *
 * The artefact draws four states in the label gutter: `⌂` entrance, `⇄` transfer, `⚿` secure, and
 * plain. Three of those are taken; **`⚿` is not**, and refusing it is the point rather than an
 * omission.
 *
 * A `VizFloor` has no *secure* flag, and giving it one would be the third kind of zoning
 * collapsed into the first — `CLAUDE.md` forbids exactly that, because service zoning (no shaft
 * reaches this floor), access zoning (no credential opens this call) and operational zoning (the
 * dispatcher's own strategy) are different facts with different fixes. Access control in this
 * simulator is a property of a **call's credential**, not of a storey: the same floor is open to
 * one rider and shut to the next. It already has a mark — `▩`, on the landing row, drawn by
 * `drawLandings` and named in the banner — and `access/zoning.ts`'s docstring is explicit that a
 * reader who learned `▩` must not have to learn a second spelling of it.
 *
 * So the gutter's third badge stays `⊘`, which is the fact the gutter actually knows: **no shaft
 * in this building reaches this floor**. It keeps the design's `#c9a56a`, because that is the
 * slot the artefact painted that colour.
 *
 * ## The label stride is the layout's, not a second one
 *
 * The artefact recomputes a stride in `draw()` (`:2038`). `FloorRow.labelled` already is that
 * decision, made once, with two rules this renderer would otherwise have to reinvent: reference
 * floors are never thinned, and a strided label yields to a reference one. A second stride here
 * would disagree with it on `vertical-city` and nowhere else, which is the worst place to find
 * out.
 */
function drawFloors(ctx: Canvas2DLike, input: SceneInput, theme: Theme, hour: number): void {
  const { layout } = input;
  const unserved = new Set(input.unservedFloorIds ?? []);
  const populationById = new Map(
    input.recording.floors.map((floor) => [floor.id, floor.population]),
  );
  const slab = slabHeightPx(layout);
  const windows = windowBand(layout);
  const night = isNight(hour);
  // How much of the band is lit: most of it after dark, a little more than half in office hours,
  // and almost nothing in the hour either side. The artefact's own three rungs (`:2029`).
  const litFraction = night ? 0.42 : hour > 8 && hour < 18 ? 0.5 : 0.22;

  for (const [rowIndex, row] of layout.rows.entries()) {
    // Every floor gets a slab, on every building, at every pitch. Only the *label* thins.
    ctx.fillStyle = theme.floorSlab;
    ctx.fillRect(layout.plot.x, row.y, layout.plot.width, slab);

    /*
     * The window band, lit by who is home.
     *
     * Deterministic and not random: `(index × 7 + cell × 13) mod 11` is a fixed pattern per
     * (floor, cell) pair, so the same building lights the same windows every time it is drawn. A
     * `Math.random()` here — which is what the artefact does — would be a global RNG draw inside
     * the renderer (`CLAUDE.md` invariant 2) *and* would make the picture depend on how many
     * times it had been painted, which is the property `replay/replay.test.ts` rests on.
     *
     * A floor with nobody living on it is dimmed rather than dark: a lobby at midnight has its
     * lights on and nobody in it, which is true of every building this project ships.
     */
    if (windows !== undefined) {
      const population = populationById.get(row.floorId) ?? 0;
      ctx.fillStyle = night ? theme.windowNight : theme.windowDay;
      for (let cell = 0; cell < windows.cells; cell += 1) {
        const on =
          ((rowIndex * 7 + cell * 13) % 11) / 11 < litFraction * (population > 0 ? 1 : 0.3);
        if (!on) continue;
        ctx.fillRect(
          windows.rightX - cell * WINDOW_PITCH_PX,
          row.y - Math.min(8, layout.pitchPx * 0.44),
          WINDOW_WIDTH_PX,
          Math.min(6, layout.pitchPx * 0.3),
        );
      }
    }

    if (!row.labelled) continue;
    ctx.font = FLOOR_LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    // Entrance and sky-lobby floors get a glyph as well as a colour: `⌂` for the entrance and
    // `⇄` for a transfer floor (RV-07). A reader must be able to find the sky lobby in a
    // greyscale screenshot.
    const badge = row.isTransferFloor ? '⇄ ' : row.isEntrance ? '⌂ ' : '';
    const restricted = unserved.has(row.floorId) ? ' ⊘' : '';
    ctx.fillStyle =
      restricted !== ''
        ? theme.restricted
        : row.isTransferFloor
          ? theme.badgeTransfer
          : row.isEntrance
            ? theme.badge
            : theme.floorLabel;
    // The gutter is everything left of the plot, less the 8 px the text is inset by. A label
    // longer than that is clipped here rather than drawn off the left edge of the canvas.
    const budget = layout.plot.x - 8 - (badge.length + restricted.length) * 8;
    ctx.fillText(
      `${badge}${fitLabel(row.label, budget)}${restricted}`,
      layout.plot.x - 8,
      row.y,
    );
  }
  ctx.font = FONT;
}

/** Cell pitch and width of the window band — design `:2030`, `c * 14` and a 6 px pane. */
const WINDOW_PITCH_PX = 14;
const WINDOW_WIDTH_PX = 6;
/** The most panes a floor gets. Six is the artefact's; past that the band reads as a barcode. */
const MAX_WINDOW_CELLS = 6;

/**
 * Where the windows go, if anywhere.
 *
 * The right-hand end of the plot, clear of the shaft bank and of the rider lane — a lit window
 * behind a queue of people is a window nobody can see, and one behind a shaft is a hole in the
 * building. `undefined` when there is no such strip, which is a real case on a sixteen-car
 * building at a narrow viewport and which costs nothing: the windows are scenery and every fact
 * on the canvas survives their absence.
 */
function windowBand(layout: Layout): { readonly rightX: number; readonly cells: number } | undefined {
  const occupiedTo =
    layout.riderLane !== undefined
      ? layout.riderLane.x + layout.riderLane.width
      : layout.columns.reduce((right, column) => Math.max(right, column.x + column.width), layout.plot.x);
  const rightX = layout.plot.x + layout.plot.width - 16;
  const cells = Math.min(
    MAX_WINDOW_CELLS,
    Math.floor((rightX - (occupiedTo + 8)) / WINDOW_PITCH_PX),
  );
  return cells > 0 ? { rightX, cells } : undefined;
}

/** The label gutter's face — design `:2039`. Smaller and heavier than the body face. */
const FLOOR_LABEL_FONT = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';

function drawShafts(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { recording, layout } = input;
  const servedById = new Map(recording.shafts.map((shaft) => [shaft.carId, new Set(shaft.servedFloorIds)]));
  const bankCount = new Set(recording.shafts.map((shaft) => shaft.bankId)).size;
  for (const column of layout.columns) {
    const served = servedById.get(column.carId);
    // A shaft is drawn only over the floors it physically serves — service zoning made visible,
    // and distinct from access and operational zoning, which are not geometry.
    const rows = layout.rows.filter((row) => served === undefined || served.has(row.floorId));
    const top = rows.reduce((min, row) => Math.min(min, row.y), layout.plot.y + layout.plot.height);
    const bottom = rows.reduce((max, row) => Math.max(max, row.y), layout.plot.y);
    // A recess rather than a panel: the shaft is a hole cut into the mass, which is what makes
    // the mass read as a building rather than as a backdrop. Design `:2054–2057`.
    ctx.fillStyle = theme.shaftRecess;
    ctx.fillRect(column.x, top, column.width, Math.max(1, bottom - top));
    ctx.strokeStyle = theme.shaftHairline;
    ctx.lineWidth = 1;
    // Half-pixel inset so the hairline lands on a pixel rather than across two of them, which is
    // the difference between a 1 px line and a 2 px grey smudge on a real context.
    ctx.strokeRect(column.x + 0.5, top + 0.5, Math.max(1, column.width - 1), Math.max(1, bottom - top - 1));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = theme.textDim;
    ctx.font = FONT;
    // Clipped to the column, like the floor labels: a 16-shaft building gives each column about
    // 30 px, and `shuttle`/`office-low` run into their neighbours long before that. Found by
    // running the viewer on Mixed-Use High-Rise.
    ctx.fillText(fitLabel(column.label, column.width), column.centreX, layout.header.shaftY);
    // RV-06: banks are grouped and *labelled*. Only when there is more than one — repeating
    // "main" over every column of a single-bank building is noise, and the shipped buildings
    // that have several banks are exactly the ones where the grouping is the point. The *row* is
    // reserved either way, so a bank filter does not move the picture — see {@link HeaderBand}.
    if (bankCount > 1) {
      ctx.fillStyle = theme.badge;
      ctx.fillText(fitLabel(column.bankId, column.width), column.centreX, layout.header.bankY);
    }
  }
}

/**
 * The cars, their cables and their doors — design `:2058–2093`.
 *
 * ## Why the body is a path and not a `fillRect`
 *
 * The design's car has rounded corners, and at the 11–28 px this renderer draws them at, 5 px of
 * radius is the difference between a lift car and a progress bar. The path also records more than
 * the rectangle did: `canvas.test.ts` locates the car by the `moveTo` that opens it, which
 * carries the top edge *and* the radius, and asserts the top edge against `layout.yForHeight`.
 * That single assertion is what stops a renderer quietly drawing the nearest floor and throwing
 * away the S-curve the frame producer evaluated.
 */
function drawCars(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { frame, layout } = input;
  const byCar = new Map(frame.cars.map((car) => [car.carId, car]));
  const outOfService = new Set(input.recording.outOfServiceCarIds);
  for (const column of layout.columns) {
    const car = byCar.get(column.carId);
    if (car === undefined) continue;
    const centreY = layout.yForHeight(car.heightM);
    const h = layout.carHeightPx;
    const y = centreY - h / 2;
    const x = column.x + 2;
    const w = column.width - 4;

    /*
     * A car that is not in service is dimmed, and the dimming is **never** the only signal —
     * the badge at the foot of its shaft says `OOS` in three letters (`drawServiceBadges`).
     * `globalAlpha` is invisible to a recording stub, which is exactly why it may not carry a
     * claim on its own; KB-15 and `honesty/` would both be satisfied by a badge alone, and the
     * alpha is here so the shaft looks as dark as the badge says it is.
     */
    ctx.globalAlpha = outOfService.has(column.carId) ? 0.32 : 1;

    // The travelling cable, from the shaft head down to the car's roof. Scenery, and the one
    // piece of it that moves with the machine rather than with the clock.
    ctx.strokeStyle = theme.cable;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(column.centreX, layout.plot.y);
    ctx.lineTo(column.centreX, y);
    ctx.stroke();

    // Four bands, not three: the 80 % fill rule and the 1.1 overload alarm are different facts
    // about a car and used to share one colour that changed at 0.8 (D18, RV-14).
    ctx.fillStyle = loadColour(car.loadFactor, theme);
    fillRoundedRect(ctx, { x, y, width: w, height: h, radius: Math.min(5, h / 3) });

    // Doors: a shut car shows the seam at the centre, an open one shows it split to the sides.
    // Drawing the *gap* rather than the leaves means `doorFraction` reads directly as a width.
    // Inset by 1.5 px top and bottom so the gap sits *inside* the rounded body rather than
    // squaring off its corners — design `:2079`.
    const gap = w * DOOR_GAP_FRACTION * car.doorFraction;
    ctx.fillStyle = theme.doorSeam;
    ctx.fillRect(x + w / 2 - gap / 2, y + 1.5, Math.max(1, gap), Math.max(1, h - 3));

    if (h >= 12) {
      ctx.font = OCCUPANT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Dark on the tint, not light: the four load colours are all mid-lightness, and 12 px of
      // `#e8edf4` on `#3fb27f` is the one pairing on this canvas that fails a contrast check in
      // both directions. Design `:2082`.
      ctx.fillStyle = theme.carLabel;
      ctx.fillText(String(car.occupants), column.centreX, centreY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (car.direction !== 0) {
      ctx.fillStyle = car.direction === 1 ? theme.waitingUp : theme.waitingDown;
      ctx.fillText(car.direction === 1 ? '▲' : '▼', column.x + w + 6, centreY);
    }

    // KB-15b: the overload alarm carries a glyph, at every floor pitch, on every building. It is
    // a safety state, so it is never the thing that gets dropped when the rows get tight.
    if (car.loadFactor >= LOAD_ALARM) {
      ctx.font = FONT_BOLD;
      ctx.fillStyle = theme.carOverload;
      ctx.fillText('!', column.x - 6, centreY);
    }

    // KB-15a: the door phase carries a glyph as well as the gap width, wherever the pitch leaves
    // room for one. Below that it survives in the frame's text alternative (`describeFrame`),
    // which is what a screen reader gets and what `KB-13` requires.
    if (h >= 14) {
      ctx.font = FONT;
      ctx.fillStyle = theme.textDim;
      ctx.fillText(doorGlyph(car.doorPhase), column.centreX, y + h + 8);
    }
    ctx.globalAlpha = 1;
  }
}

/** How much of a car's width the doors open to — design `:2078`, `cw * 0.86`. */
const DOOR_GAP_FRACTION = 0.86;
/** The occupant count's face — design `:2083`. */
const OCCUPANT_FONT = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
/** The service badge's face — design `:2108`. */
const SERVICE_BADGE_FONT = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
/** Slop around the drawn pill, each side, so the corners are hittable — design `:2110`. */
const SERVICE_BADGE_SLOP_PX = 3;
/** The widest a pill gets. Narrower on a narrow shaft, so it never overhangs its neighbour. */
const SERVICE_BADGE_MAX_WIDTH_PX = 26;

/**
 * The out-of-service badge at the foot of every shaft — `docs/12` § 1.5 B7, design `:2094–2111`.
 *
 * ## Why it says a word and not only a colour
 *
 * `⏻` on a faint pill for *in service*, `OOS` on a red one for *not*. Two glyphs and one of them
 * is three letters, so the state survives greyscale, a screenshot and **Export PNG** — KB-15,
 * and the same rule that put `!` beside an overloaded car and `⇄` beside a sky lobby. The
 * shaft's dimmed alpha is a *second* carrier of the same fact and never the first.
 *
 * ## Why the click is not handled here
 *
 * `boundaries.test.ts` rule 3: `render/` has no DOM and therefore no pointer. The badge's
 * rectangle is returned to the caller, `src/dev/` hit-tests it, and turning a hit into a car held
 * out of service is `recordRun`'s `outOfServiceCarIds` (§ 3.1 BE5) — a real re-run through
 * `Car.setMode`, not a display state. The renderer's whole part in B7 is *here is the target and
 * here is what it currently says*.
 *
 * The row it is drawn on is `layout.foot.badgeY`, which the layout owns for the reason the header
 * band owns its six: hung off the plot's bottom edge by hand it lands on the run-status caption
 * at every viewport size.
 */
function drawServiceBadges(
  ctx: Canvas2DLike,
  input: SceneInput,
  theme: Theme,
): readonly CarBadgeHit[] {
  const { layout } = input;
  const outOfService = new Set(input.recording.outOfServiceCarIds);
  const hits: CarBadgeHit[] = [];
  const height = layout.foot.badgeHeightPx;
  const y = layout.foot.badgeY;
  for (const column of layout.columns) {
    const off = outOfService.has(column.carId);
    const width = Math.min(column.width, SERVICE_BADGE_MAX_WIDTH_PX);
    const x = column.x + (column.width - width) / 2;

    ctx.fillStyle = off ? theme.outOfServiceOn : theme.outOfServiceOff;
    fillRoundedRect(ctx, { x, y, width, height, radius: 4 });

    ctx.font = SERVICE_BADGE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = off ? theme.outOfServiceOnText : theme.outOfServiceOffText;
    ctx.fillText(off ? SERVICE_OFF_GLYPH : SERVICE_ON_GLYPH, x + width / 2, y + height / 2 + 0.5);

    hits.push({
      carId: column.carId,
      label: column.label,
      outOfService: off,
      rect: {
        x: x - SERVICE_BADGE_SLOP_PX,
        y: y - SERVICE_BADGE_SLOP_PX,
        width: width + 2 * SERVICE_BADGE_SLOP_PX,
        height: height + 2 * SERVICE_BADGE_SLOP_PX,
      },
    });
  }
  ctx.font = FONT;
  return hits;
}

/**
 * The two things a service badge can say — design `:2109`.
 *
 * Exported because they are marks, and every mark in this renderer that a reader has to tell
 * apart from another mark is read from the shipped value by a guard rather than transcribed into
 * one. They are drawn *below* the plot rather than on a landing row, so
 * `render/landingMarks.test.ts`'s family rule does not reach them — but they are the only two
 * marks in the foot band and they must stay distinguishable from each other, which
 * `stageRender.test.ts` asserts.
 */
export const SERVICE_ON_GLYPH = '⏻';
export const SERVICE_OFF_GLYPH = 'OOS';

/**
 * The people, on the floors they are standing on — `docs/12` § 1.3 M3, design `:2114–2157`.
 *
 * Returns the deepest landing past the alarm depth, for the chip above the stage.
 *
 * ## Three things this function is careful about
 *
 * **It draws nothing without a lane.** `Layout.riderLane` is `undefined` when the shafts fill the
 * plot, and the landing row in the right gutter carries the whole claim then. See
 * `render/riderFigures.ts` for why the figures are an addition to that row and never a
 * replacement for it.
 *
 * **The crowd is clamped into the plot.** A queue on the top floor would otherwise be drawn a
 * figure-height *above* `plot.y`, straight through the shaft labels and the bank labels — the
 * header band's own defect, arriving from underneath. `render/headerBand.test.ts` would catch it
 * only on a scene that supplied queues, and its scene does not, so the clamp is here rather than
 * left to a guard that cannot see it.
 *
 * **The alarm is reported, not just drawn.** One landing, the deepest, so the chip names the
 * floor a reader should walk to; the *rules* are drawn on every landing that crossed, because
 * more than one floor can be in trouble and a chip can only name one.
 */
function drawRiderLanes(
  ctx: Canvas2DLike,
  input: SceneInput,
  theme: Theme,
): StageAlarm | undefined {
  const { layout, frame } = input;
  const lane = layout.riderLane;
  const queues = input.queues ?? [];
  if (lane === undefined || queues.length === 0) return undefined;

  const rowById = new Map(layout.rows.map((row) => [row.floorId, row]));
  const slab = slabHeightPx(layout);
  // Body, head and the highest the bob can lift it — `figureClearancePx`, not a local sum, so the
  // clamp and the guard that checks it cannot disagree about how tall a person is.
  const clearance = figureClearancePx(layout.pitchPx);
  let alarm: StageAlarm | undefined;

  for (const queue of queues) {
    const row = rowById.get(queue.floorId);
    if (row === undefined) continue;
    // Clamped, so the top floor's crowd stands inside the building rather than in the header.
    const feetY = Math.max(row.y, layout.plot.y + clearance);
    const result = drawRiderLane(ctx, theme, {
      riders: queue.riders,
      total: queue.total,
      x: lane.x,
      widthPx: lane.width,
      feetY,
      pitchPx: layout.pitchPx,
      simTimeS: frame.simTimeS,
    });
    if (!result.alarm) continue;
    drawAlarmRule(ctx, theme, {
      x: layout.plot.x,
      y: row.y + slab + 1.5,
      widthPx: layout.plot.width,
      simTimeS: frame.simTimeS,
    });
    if (alarm === undefined || queue.total > alarm.waiting) {
      alarm = { floorId: row.floorId, label: row.label, waiting: queue.total };
    }
  }
  ctx.font = FONT;
  return alarm;
}

/**
 * The notices row: the bank-filter caption, the shaft-count warning and the selected landing's
 * caption, on **one** row.
 *
 * The last two were drawn by two different functions at the same `y` (`plot.y − 20`), left-aligned
 * at the same `x`, so a reader who selected a landing on a window too narrow for every shaft got
 * the two sentences written through each other. They are drawn here in one place, in order, with
 * the cursor carried between them — which is the only way left-aligned strings share a row. The
 * bank filter's caption (`SG-15`) joined them for the same reason, first in the row because it
 * changes what every count after it is counting.
 *
 * Each keeps its own colour: `RS-05`'s warning is a warning, and the filter caption and `RV-T3`'s
 * caption are selections.
 */
function drawNotices(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout, selection } = input;
  const selected =
    selection === undefined
      ? undefined
      : layout.rows.find((candidate) => candidate.floorId === selection.floorId);

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  let cursor = layout.plot.x;
  /*
   * The whole canvas, not the plot — § D236.
   *
   * This row sits above `layout.plot.y`, and `layout.overlay` starts *at* `plot.y`, so nothing is
   * drawn to the right of here on this line. Budgeting it by the plot meant the sentence that
   * explains a squeezed picture inherited the squeeze: at a 360 px canvas the plot was one pixel
   * wide and `fitLabel` returned `…` — the app showed one lift of six and the only thing saying
   * so was three dots. The gutters are not exempt from being written across when the alternative
   * is silence.
   */
  const rightEdge = layout.width - layout.paddingPx;

  if (input.filteredBankId !== undefined) {
    /*
     * RS-05's no-silent-truncation clause, applied to a *chosen* narrowing: the filter is the
     * reader's own move, and the caption is what keeps the picture from being mistaken for the
     * whole building — an exported PNG carries the canvas and nothing else, so the claim has to
     * be on the canvas. Shown counts the *filtered set*, not the columns, so the two notices
     * stay consistent when the filtered bank itself overflows the window's capacity.
     */
    ctx.fillStyle = theme.highlight;
    const shown = layout.columns.length + layout.hiddenShaftCount;
    const text = fitLabel(
      `bank ${input.filteredBankId} — showing ${String(shown)} of ${String(input.recording.shafts.length)} shafts`,
      rightEdge - cursor,
    );
    ctx.fillText(text, cursor, layout.header.noticeY);
    cursor += CHAR_ADVANCE_PX * (text.length + 2);
  }

  if (layout.hiddenShaftCount > 0) {
    // RS-05: never silently truncated. The CLI's `watch` says "showing N of M" and so does this.
    //
    // § D236 — the advice names the remedy the reader **has**. It read *"widen the window"*, and
    // on the building the whole campaign builds to that is false at every desktop size: Vertical
    // City needs a 2 560 px viewport before the caption clears, so on a maximised 1080p monitor
    // the app cropped its flagship scenario and told the player to widen a window with nowhere
    // left to go. The `bank` select under the stage gives a clean, legible view of one bank in
    // one click, and the caption never mentioned it. Named first, because it is the one that
    // works; `RS-05` permits horizontal scroll **or** a bank filter, and this is the filter.
    ctx.fillStyle = theme.warning;
    const shown = String(layout.columns.length);
    const all = String(layout.columns.length + layout.hiddenShaftCount);
    /*
     * Longest form that fits, rather than one form truncated — and the order matters. On a phone
     * the budget takes the sentence's *tail*, and the tail is `widen the window`, which is the
     * half a phone reader cannot act on at all. So the short form drops that clause and keeps the
     * bank, and the fallback below keeps the count, which is the one thing that must survive:
     * `RS-05` is about never truncating in silence, and a count is not silence.
     */
    const text =
      [
        `showing ${shown} of ${all} shafts — pick one bank below, or widen the window`,
        `showing ${shown} of ${all} shafts — pick a bank below`,
        `${shown} of ${all} shafts — pick a bank`,
      ].find((candidate) => candidate.length * CHAR_ADVANCE_PX <= rightEdge - cursor) ??
      fitLabel(`${shown} of ${all} shafts`, rightEdge - cursor);
    ctx.fillText(text, cursor, layout.header.noticeY);
    cursor += CHAR_ADVANCE_PX * (text.length + 2);
  }

  if (selection !== undefined && selected !== undefined) {
    ctx.fillStyle = theme.highlight;
    ctx.fillText(
      fitLabel(describeSelection(selection), rightEdge - cursor),
      cursor,
      layout.header.noticeY,
    );
  }
}

/**
 * The selected landing, and the assignment the record made for it — `RV-T3`.
 *
 * Drawn as a marker on the floor line plus a caption naming the car, because "highlight the
 * assigned car" is not readable unless the reader can also see *which* car was named.
 */
function drawSelection(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout, selection } = input;
  if (selection === undefined) return;
  const row = layout.rows.find((candidate) => candidate.floorId === selection.floorId);
  if (row === undefined) return;

  ctx.strokeStyle = theme.highlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.plot.x, row.y);
  ctx.lineTo(layout.plot.x + layout.plot.width, row.y);
  ctx.stroke();

  // Under a panel the reader has been *told* which car to walk to, so that is the shaft to box —
  // and it is known even for a call nobody ever answered, which `answeredByCarId` is not.
  const highlighted = selection.promisedCarId ?? selection.answeredByCarId;
  const column = layout.columns.find((candidate) => candidate.carId === highlighted);
  if (column !== undefined) {
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 2;
    ctx.strokeRect(column.x, layout.plot.y, column.width, layout.plot.height);
  }
  // The caption is drawn by `drawNotices`, which owns the row it shares with `RS-05`'s warning.
}

/** The caption for a selected landing. Exported so a text alternative can reuse the wording. */
export function describeSelection(selection: SceneSelection): string {
  const where =
    selection.destinationFloorId === undefined
      ? `floor ${selection.floorId}`
      : `floor ${selection.floorId} → ${selection.destinationFloorId}`;
  const waiting =
    selection.waiting === undefined ? '' : ` · ${String(selection.waiting)} waiting`;
  const oldest =
    selection.oldestWaitS === undefined ? '' : ` · longest ${selection.oldestWaitS.toFixed(0)} s`;
  // Three different situations, and the first draft collapsed the first two. Scrubbing to the end
  // of a completed run and reading "unassigned — no car answered this call" about a landing that
  // simply has nobody standing at it is a claim about the dispatcher that is not true.
  if (selection.waiting === 0) return `${where} · nobody is waiting here at this instant`;
  const when =
    selection.answeredInS === undefined ? '' : ` in ${selection.answeredInS.toFixed(0)} s`;

  /*
   * The panel case, and the sentence version 4 exists to make sayable.
   *
   * A promised passenger still standing at the horizon has `answeredByCarId === undefined`, and
   * the branch below would have called that "unassigned — no car answered this call". Under a
   * landing panel that is false: the panel named a car at the instant they arrived, and a
   * viewer saying otherwise reports a dispatcher failure that did not happen. Measured
   * reachable — Vertical City at 20 % pop/5 min, seed 20260727, 25 such legs.
   */
  if (selection.promisedCarId !== undefined) {
    const boarding =
      selection.answeredByCarId === undefined
        ? ' · still waiting when the run ended'
        : `${when === '' ? '' : ` · boards${when}`}`;
    return `${where}${waiting}${oldest} · panel promised car ${selection.promisedCarId}${boarding}`;
  }
  if (selection.answeredByCarId === undefined) {
    return `${where}${waiting}${oldest} · unassigned — no car answered this call in this run`;
  }
  return `${where}${waiting}${oldest} · answered by car ${selection.answeredByCarId}${when}`;
}

/**
 * One line for the landing selector — the same three facts as {@link describeSelection}, short.
 *
 * Here in `render/` rather than in `dev/main.ts` for the reason the whole of this directory is:
 * a label built inside the DOM entry point is a rendered value no test can reach, and this
 * package has already shipped a frame seven of whose eight fields could be replaced by constants
 * with the suite still green. `canvas.test.ts` mutation-tests every field this reads.
 */
export function landingOptionLabel(assignment: LandingAssignment): string {
  const where =
    assignment.destinationFloorId === undefined
      ? `${assignment.floorId} ${assignment.direction}`
      : `${assignment.floorId} → ${assignment.destinationFloorId}`;
  const head = `${where} — ${String(assignment.waiting)} waiting`;
  // The promise first, because under a panel it is what the passenger was actually told, and it
  // is known for a call no car ever reached. Only then the outcome.
  if (assignment.promisedCarId !== undefined) return `${head} → ${assignment.promisedCarId}`;
  if (assignment.answeredByCarId === undefined) return `${head} (unassigned)`;
  return `${head} → ${assignment.answeredByCarId}`;
}

/**
 * The glyph for a landing whose call no car answers — `D10`.
 *
 * `✗` and not `⊘`: `⊘` already means *this floor is served by no shaft* on the label gutter, and
 * the two are different claims — one about the building's geometry, one about what the dispatcher
 * did with a call it could legally have taken. Colour is not the only signal either way.
 *
 * Exported so the shape guard in `render/landingMarks.test.ts` reads the shipped value rather than
 * a transcription of it. It kept its spelling through that guard's first red run; the band glyph
 * it collided with is the one that moved (`render/riderQueue.ts`), because `D10` had `✗` first and
 * because `✗` is named in `UX.md` RV-08, `access/lockedOut.ts` and `docs/10` § 10.4, while the
 * band's spelling has exactly one definition and every reader goes through it.
 */
export const UNANSWERED_GLYPH = '✗';

/**
 * The glyph for a landing whose call no car **may** answer — `docs/10` § 10.4.
 *
 * The **same** glyph the credential lens uses for `not-permitted` (`access/zoning.ts`), on
 * purpose: the editor's lens and the run viewer are two views of one fact, and a reader who
 * learned `▩` on the preview must not have to learn a second spelling of it here. It is neither
 * `⊘` (no shaft reaches this floor) nor `✗` (a car could have come and none did), which is the
 * whole point — three barriers, three glyphs, none of them a recolouring of another.
 *
 * Both lockout causes draw it. The glyph names the **barrier**, which is access zoning either
 * way; the banner and the screen-reader sentence name the **cause**, because *"the dispatcher
 * cannot read this credential"* and *"this rider has no credential"* have different fixes and a
 * 12 px mark cannot carry that.
 */
const LOCKED_OUT_GLYPH = STATE_GLYPHS['not-permitted'];

/**
 * The direction a landing call was registered in, and the mark for a landing with nobody at it.
 *
 * Named rather than inlined for one reason: they are marks on the **same row** as `✗`, `▩`, the
 * relief `✓` and the four wait bands, and `render/landingMarks.test.ts` checks that no two claims
 * on that row share a silhouette. A guard that read a transcribed copy of these three would keep
 * passing after somebody edited the renderer, which is the false negative that family of guards
 * exists to avoid.
 */
export const WAITING_UP_GLYPH = '▲';
export const WAITING_DOWN_GLYPH = '▼';
export const EMPTY_LANDING_GLYPH = '·';

/**
 * Smallest floor pitch at which a rider glyph is a glyph rather than a smear — § 6.2's second bar
 * trigger, *"or the floor pitch is below the glyph height"*.
 *
 * 12 px is the font size this renderer draws at, so a row shorter than that cannot hold one
 * without touching its neighbours. Vertical City's 100 floors at 700 px are under 8 px, which is
 * exactly the case the bar exists for.
 */
const MIN_GLYPH_PITCH_PX = 12;

/** Height of the bar a degraded row draws, pixels. Shorter than the pitch, always. */
const QUEUE_BAR_HEIGHT_PX = 5;
/** Shortest track a bar is scaled against, so a narrow gutter shortens it rather than erasing it. */
const MIN_BAR_TRACK_PX = 24;
/** Longest, so the count and the oldest wait always have room after it. Driven, not guessed. */
const MAX_BAR_TRACK_PX = 56;

function drawLandings(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { frame, layout } = input;
  const rowById = new Map(layout.rows.map((row) => [row.floorId, row]));
  const unanswered = new Set(input.unansweredCallFloorIds ?? []);
  const lockedOut = new Set((input.lockedOutLandings ?? []).map((landing) => landing.floorId));
  const queueByFloor = new Map((input.queues ?? []).map((queue) => [queue.floorId, queue]));
  // The deepest queue anywhere at this instant, for the bar's log scale. Taken from the frame
  // rather than pinned, because the measured extremes differ by a factor of two between buildings
  // (M5: 175 on Midtown Office, 379 on Vertical City) and either pin makes the other unreadable.
  const scaleTotal = (input.queues ?? []).reduce((max, queue) => Math.max(max, queue.total), 0);
  const x = layout.plot.x + layout.plot.width + 10;
  // Everything right of the landings, up to the metrics panel if there is one. This is the *"row
  // width"* § 6.2 degrades against, and it is a property of the viewport rather than of the
  // building — which is why the same building degrades differently on a narrow window.
  const rightEdge = (layout.overlay?.x ?? layout.width) - 12;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const landing of frame.landings) {
    const row = rowById.get(landing.floorId);
    if (row === undefined) continue;
    const queue = queueByFloor.get(landing.floorId);
    // The empty-landing dot, and the two reasons a landing is not empty even when the direction
    // counts are zero: somebody is in the queue (U4), or the caller has told us this landing is
    // locked out (U8). A row the caller named must draw its mark — a guard that dropped it would
    // be the picture disagreeing with the banner about the same landing.
    if (
      landing.waitingUp === 0 &&
      landing.waitingDown === 0 &&
      queue === undefined &&
      !lockedOut.has(landing.floorId)
    ) {
      ctx.fillStyle = theme.textDim;
      ctx.fillText(EMPTY_LANDING_GLYPH, x, row.y);
      continue;
    }
    let cursor = x;
    if (landing.waitingUp > 0) {
      ctx.fillStyle = theme.waitingUp;
      const text = `${WAITING_UP_GLYPH}${String(landing.waitingUp)}`;
      ctx.fillText(text, cursor, row.y);
      cursor += 8 * (text.length + 1);
    }
    if (landing.waitingDown > 0) {
      ctx.fillStyle = theme.waitingDown;
      const text = `${WAITING_DOWN_GLYPH}${String(landing.waitingDown)}`;
      ctx.fillText(text, cursor, row.y);
      cursor += 8 * (text.length + 1);
    }
    let marked = false;
    if (unanswered.has(landing.floorId)) {
      ctx.fillStyle = theme.warning;
      ctx.fillText(UNANSWERED_GLYPH, cursor, row.y);
      cursor += 8 * 2;
      marked = true;
    }
    if (lockedOut.has(landing.floorId)) {
      ctx.fillStyle = theme.restricted;
      ctx.fillText(LOCKED_OUT_GLYPH, cursor, row.y);
      cursor += 8 * 2;
      marked = true;
    }
    /*
     * A cell of air between the **call** marks and the **rider** glyphs — added at the merge of
     * W6/U4 and W7b/U8, because that is where the two first shared a row.
     *
     * They are different subjects: `✗`/`▩` say something about the *call* at this landing, and
     * `●◑○◆` say something about the *people* standing at it. Run together they read as one
     * string, and the gap stops the two groups being read as one word.
     *
     * The gap was all this row had when the abandoned band was `✖` (U+2716), one codepoint and no
     * distance at all from the unanswered `✗` (U+2717). That is a *shape* problem and a cell of
     * air does not touch it, so the band moved to `◆` — see `render/riderQueue.ts`'s `BAND_GLYPH`
     * and the family rule in `render/landingMarks.test.ts`. The gap stays, because separating the
     * two groups and separating the two marks are two different jobs.
     */
    if (marked) cursor += 8;
    if (queue === undefined) continue;
    cursor = drawQueueRow(ctx, theme, queue, {
      x: cursor,
      y: row.y,
      widthPx: rightEdge - cursor,
      pitchPx: layout.pitchPx,
      scaleTotal,
      // The layout has already decided which rows are far enough apart to carry 12 px of text —
      // `FloorRow.labelled`, at `MIN_LABEL_PITCH_PX`. Reused rather than re-derived, because a
      // queue caption drawn on a row whose own floor label was thinned away is text nothing
      // identifies, on top of its neighbour. Driven on Midtown Office at 21 floors in a short
      // canvas, where two adjacent captions overlapped and neither was readable.
      labelled: row.labelled,
    });
  }
}

interface QueueRowBox {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pitchPx: number;
  readonly scaleTotal: number;
  /**
   * Whether this row can carry text — `FloorRow.labelled`.
   *
   * **This is a stated limitation, not a silent one.** On a building whose rows are too close to
   * label — Vertical City's 100 floors, and Midtown Office in a short window — a queue is drawn as
   * a bar with **no count beside it**, which is the one place this feature does not keep the rule
   * that a bar never carries its value alone. The count is still reachable: `describeFrame` names
   * the busiest floors with their numbers, the landing selector lists them, and the header states
   * the building total. Drawing it anyway was tried and produced two captions on top of each other
   * at 7 px pitch, which carries less than nothing.
   */
  readonly labelled: boolean;
}

/**
 * One landing's queue, drawn — § 6.2's three modes, and D4's mood painted on the same glyphs.
 *
 * The plan is made by `render/riderQueue.ts` and this function only puts it on the context, which
 * is the split the whole of `render/` uses: what to draw is arithmetic and testable under Node,
 * where to draw it is pixels. Returns the cursor, so a caller could put something after the row.
 */
function drawQueueRow(
  ctx: Canvas2DLike,
  theme: Theme,
  queue: FloorQueue,
  box: QueueRowBox,
): number {
  /*
   * Cells the row must keep back for the text that follows the glyphs.
   *
   * Without this the glyphs fill the row to its last pixel and the `+N` is drawn under the metrics
   * panel — seen on Midtown Office at 5:05, seed 42, where the Garage row read `18 waiti` with the
   * rest behind the panel. A count that is clipped is worse than a count that was never promised,
   * because the reader cannot tell which digits are missing.
   *
   * Constants rather than a measurement, because the text's length depends on the mode and the
   * mode depends on the capacity: `+999` and `999 waiting` both fit in twelve cells, and the
   * relief mark is `✓` plus at most three digits.
   */
  const reserved =
    (queue.total > MAX_INDIVIDUAL_GLYPHS ? 12 : 0) + (queue.recentlyBoarded > 0 ? 5 : 0);
  const plan: QueueRowPlan = planQueueRow({
    queue,
    capacityCells: Math.floor(box.widthPx / CHAR_ADVANCE_PX) - reserved,
    // A row that cannot carry its own floor label cannot carry twelve glyphs and a `+N` either, so
    // it aggregates all the way to a bar. One rule, in the direction § 6.2 already goes.
    pitchFits: box.labelled && box.pitchPx >= MIN_GLYPH_PITCH_PX,
    scaleTotal: box.scaleTotal,
  });
  let cursor = box.x;

  if (plan.mode === 'bar') {
    // The bar carries the *shape* of its worst band too, as the colour of the track's own outline
    // would not survive greyscale: the glyph is drawn beside the bar, at every depth.
    ctx.fillStyle = theme.queueBands[plan.worstBand];
    // The track is a fraction of the row rather than *the row less the caption*, so that a narrow
    // gutter shortens the bar instead of collapsing it to nothing — which is what the first
    // version did, and a bar of one pixel says the same thing about 175 and 379. It is also
    // **capped**: at 45 % of the gutter and no ceiling, the caption ran off the end and Midtown
    // Office's Lobby read `● 55 waiting ·` with the wait behind the metrics panel. The count is
    // the thing that must survive, so the bar yields to it.
    const width = Math.max(
      1,
      plan.barFraction * Math.min(MAX_BAR_TRACK_PX, Math.max(MIN_BAR_TRACK_PX, box.widthPx * 0.45)),
    );
    ctx.fillRect(cursor, box.y - QUEUE_BAR_HEIGHT_PX / 2, width, QUEUE_BAR_HEIGHT_PX);
    cursor += width + 6;
    if (!box.labelled) return cursor;
    /*
     * The caption, shortened rather than clipped.
     *
     * Driven on Midtown Office at 5:45, seed 42: the Lobby's bar read
     * `● 50 waiting · longest 9` with the rest behind the metrics panel. A number cut off mid-digit
     * is worse than one that was never offered, because the reader cannot tell how much is missing.
     * So the row drops the *secondary* fact — the oldest wait — and keeps the count, which is the
     * one a bar must never carry alone. Both remain in `describeFrame`.
     */
    const room = Math.floor((box.x + box.widthPx - cursor) / CHAR_ADVANCE_PX);
    const full = `${BAND_GLYPH[plan.worstBand]} ${plan.text}`;
    const caption =
      full.length <= room ? full : `${BAND_GLYPH[plan.worstBand]} ${String(plan.total)} waiting`;
    ctx.fillStyle = theme.text;
    ctx.fillText(caption, cursor, box.y);
    cursor += CHAR_ADVANCE_PX * (caption.length + 1);
    if (plan.reliefText !== undefined) {
      ctx.fillStyle = theme.queueRelief;
      ctx.fillText(plan.reliefText, cursor, box.y);
      cursor += CHAR_ADVANCE_PX * (plan.reliefText.length + 1);
    }
    return cursor;
  }

  for (const segment of plan.segments) {
    if (segment.label !== undefined) {
      ctx.fillStyle = theme.badge;
      ctx.fillText(`${segment.label} `, cursor, box.y);
      cursor += CHAR_ADVANCE_PX * (segment.label.length + 1);
    }
    for (const glyph of segment.glyphs) {
      ctx.fillStyle = theme.queueBands[glyph.band];
      ctx.fillText(glyph.glyph, cursor, box.y);
      cursor += CHAR_ADVANCE_PX;
    }
  }
  if (plan.text !== '') {
    ctx.fillStyle = theme.text;
    ctx.fillText(plan.text, cursor, box.y);
    cursor += CHAR_ADVANCE_PX * (plan.text.length + 1);
  }
  if (plan.reliefText !== undefined) {
    ctx.fillStyle = theme.queueRelief;
    ctx.fillText(plan.reliefText, cursor, box.y);
    cursor += CHAR_ADVANCE_PX * (plan.reliefText.length + 1);
  }
  return cursor;
}

function drawFooter(
  ctx: Canvas2DLike,
  recording: VizRecording,
  frame: Frame,
  layout: Layout,
  theme: Theme,
): void {
  // The bar sits on the very bottom edge and the caption above it: overlapping the two put the
  // run status underneath the playhead, which is unreadable at exactly the moment it matters.
  // Both rows come from `Layout.foot` rather than from arithmetic here, for the reason the header
  // rows come from `Layout.header`: the badge row arrived between them and nothing owned the gap.
  const y = layout.foot.progressY;
  const barX = layout.plot.x;
  const barW = layout.plot.width;
  ctx.fillStyle = theme.shaft;
  ctx.fillRect(barX, y, barW, layout.foot.progressHeightPx);

  const span = recording.endedAt - recording.startedAt;
  const fraction = span <= 0 ? 0 : (frame.simTimeS - recording.startedAt) / span;
  ctx.fillStyle = theme.car;
  ctx.fillRect(
    barX,
    y,
    barW * Math.max(0, Math.min(1, fraction)),
    layout.foot.progressHeightPx,
  );

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.textDim;
  // `docs/10` § 7.4 and `UX.md` RV-T4: every figure carries its window, and this is the surface
  // that leaves the building. **Export PNG** writes the canvas to a file, so a bitmap whose
  // header quotes a mean without saying which 300 seconds it covers will be read as covering the
  // whole run. The clause is produced by `render/runSummary.ts` rather than formatted here, so
  // the panel and the picture cannot word the same window differently.
  ctx.fillText(footerStatusLine(recording), 12, layout.foot.statusY);
}

/**
 * The footer caption — issue #105, and the reason it is **scoped rather than gated**.
 *
 * ## The defect
 *
 * This line read `` `${recording.status} · ${generated} generated · ${windowClause(…)}` ``, and
 * `recording.status` is `result.status` off `record/recordRun.ts` — the outcome of the **whole-day
 * simulation**, which finishes before the first frame is painted. Directly above it sits the
 * playback progress bar. So a viewer four minutes into a fifteen-minute shift read **completed**
 * with the bar a quarter full: one word, one bar, two answers. `generated` has the same shape — it
 * is the day's whole arrival count, printed unchanged at every playhead.
 *
 * ## Why not the gate `dev/leftRail.ts#moodDriverPanelOf` uses
 *
 * Because the two surfaces are owed different things, and the difference is this file's own stated
 * reason for having a footer at all: **Export PNG** bakes this bitmap into a file that leaves the
 * building, and § 7.4 requires every figure on it to carry its window. Withholding the caption
 * until the playhead reaches the end would strip the window clause off every PNG exported mid-run —
 * a rule about honesty, spending the one sentence that keeps another rule about honesty. The rail
 * can withhold because the rail is on a screen the reader still has; a bitmap has no later.
 *
 * So every term is scoped to what it is actually true of. `simulation completed` cannot be read as
 * *playback finished* — it names the thing that finished. `arrivals generated over the whole day`
 * is #105's own suggestion, and it says which window the count covers, which is the sentence the
 * rest of this footer already exists to make. Nothing is hidden, no figure moves, and the exported
 * PNG keeps everything § 7.4 asks of it.
 *
 * `recording.status` is still printed verbatim rather than mapped through a word list: `timed-out`
 * is the status that matters most and is the one a friendlier vocabulary would round off. It is
 * also drawn a second time, larger, by `drawHeader`'s banner when it is not `completed`.
 */
function footerStatusLine(recording: VizRecording): string {
  return (
    `simulation ${recording.status} · ` +
    `${String(recording.summary.generated)} arrivals generated over the whole day · ` +
    windowClause(recording.summary)
  );
}

/**
 * Approximate advance of one character at the 12 px monospace face this renderer uses.
 *
 * {@link Canvas2DLike} has no `measureText`, deliberately — adding one would oblige every test
 * stub to implement font metrics, and the seam's value is that a stub is three lines. 7.2 px is
 * the measured advance of `ui-monospace` at 12 px and is close enough to decide how many
 * characters fit in a gutter.
 */
const CHAR_ADVANCE_PX = 7.2;

/**
 * The same measure for the **bold 14 px** face the two headings use.
 *
 * Only one caller needs it — `drawHeader`, to reserve the building name's own width before it
 * right-aligns the warning banner on the same line. Approximate for the same reason
 * {@link CHAR_ADVANCE_PX} is, and rounded **up** rather than down, because being generous here
 * clips a warning slightly early and being stingy overprints the title.
 */
const BOLD_CHAR_ADVANCE_PX = 8.5;

/**
 * Clip a label to a pixel budget, with an ellipsis — `RV-09` and `RS-04`.
 *
 * Thinning by pitch keeps labels from colliding *vertically*. It does nothing about a label that
 * is simply too long: `vertical-city` names floors things like `Zone 5 hotel`, which at 12 px is
 * 84 px against a 72 px gutter, so the left end of every such label ran off the canvas. Right
 * alignment made it the *start* of the word that vanished, which is the half that identifies it.
 */
export function fitLabel(text: string, budgetPx: number): string {
  const budget = Math.max(1, Math.floor(budgetPx / CHAR_ADVANCE_PX));
  if (text.length <= budget) return text;
  if (budget <= 1) return '…';
  return `${text.slice(0, budget - 1)}…`;
}

/** `m:ss` for a run, `h:mm:ss` once it is long enough to need it. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (value: number): string => (value < 10 ? `0${String(value)}` : String(value));
  return h > 0 ? `${String(h)}:${pad(m)}:${pad(s)}` : `${String(m)}:${pad(s)}`;
}
