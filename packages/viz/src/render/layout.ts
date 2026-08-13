/**
 * Where things go: a pure function from a viewport and a building to pixel geometry.
 *
 * Separate from the drawing for the usual reason and one specific one. The usual reason is that
 * geometry is arithmetic and arithmetic is testable. The specific one is
 * {@link Layout.yForHeight}: a car's vertical position must be a *continuous* function of its
 * height in metres, not a lookup of the floor it is nearest, or the S-curve the frame producer
 * went to the trouble of evaluating would be quantised back into a jump at the last moment.
 *
 * Heights map linearly over `[lowest floor, highest floor]`, which is deliberate: a building
 * with an 8 m lobby and 3 m upper floors should *look* like one. Floor rows are placed by the
 * same function, so a car standing at a floor is exactly on that floor's line by construction
 * rather than by two calculations agreeing.
 */

import type { VizFloor } from '../contract/types.js';

/**
 * The part of a shaft that geometry needs: an identity and the floors it serves.
 *
 * Narrower than {@link VizShaft} on purpose. A layout has nothing to say about motions, door
 * marks, occupancy or capacity, and taking the whole `VizShaft` meant that laying a building out
 * required a *finished run* — which is precisely what UX.md's ED-01/ED-02 (change a floor
 * height, add a car, see the picture update, no run needed) cannot have. `VizShaft` satisfies
 * this structurally, so every existing caller is unchanged and the editor's preview becomes
 * expressible without widening anything later.
 */
export interface ShaftGeometry {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Floor ids this shaft physically serves — service zoning, not access and not operational. */
  readonly servedFloorIds: readonly string[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShaftColumn {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Left edge of the shaft, pixels. */
  readonly x: number;
  readonly width: number;
  /** Centre line, pixels. */
  readonly centreX: number;
}

export interface FloorRow {
  readonly floorId: string;
  readonly label: string;
  readonly heightM: number;
  /** Pixel y of the floor line. */
  readonly y: number;
  /**
   * Whether this row's label is legible at the current pitch — `UX.md` `RV-09`/`RS-04`.
   *
   * **Every floor still has a row.** On a 60-storey building at 700 px the pitch is under 12 px
   * and drawing every id produces an unreadable smear that also hides the two labels that
   * matter. Thinning is by *label*, never by row: the line, the shaft and the car are all still
   * drawn at every floor, and {@link FloorRow.label} is still carried so a text alternative or a
   * hover can read it out.
   *
   * Entrance and transfer floors are never thinned out — they are the two the reader is
   * orienting by.
   */
  readonly labelled: boolean;
  readonly isEntrance: boolean;
  readonly isTransferFloor: boolean;
}

/**
 * The text rows stacked above the plot — **one arithmetic place for the whole header band.**
 *
 * ## Why this exists rather than six literals in the renderer
 *
 * It shipped as six literals in two files, and they collided. The mood headline `render/canvas.ts`
 * draws at `y = 48` with `textBaseline: 'top'` occupies `[48, 60]`; the bank label `drawShafts`
 * writes at `plot.y − 18` with `textBaseline: 'bottom'` occupies `[46, 58]`. **Ten pixels of
 * overprint on every building with more than one bank**, confirmed arithmetically and on screen.
 * The hidden-shaft notice (`plot.y − 20`, so `[44, 56]`) overprinted *both*, and the selected
 * landing's caption is drawn at the same `y` as the hidden-shaft notice, so those two overprinted
 * each other as well. Four claims, three rows of space, no owner.
 *
 * The two literals were each locally correct and were written by different lanes months apart.
 * That is the shape of the defect: **a header row is a shared resource and nothing owned it.** So
 * the band is computed here, once, from the rows it must hold, and `headerPx`'s default is
 * *derived* from that stack rather than being a number somebody picked.
 *
 * ## The bank row is reserved even when there is one bank
 *
 * `render/canvas.ts` draws a bank label only when the building has more than one bank (`RV-06`) —
 * repeating `main` over every column of a single-bank building is noise. The **row** is reserved
 * either way, because `dev/main.ts` filters the shafts by bank and a building drawn through that
 * filter has exactly one bank: a band that shrank would make the whole picture jump 14 px when the
 * reader picked a bank out of a `<select>`. Fourteen pixels of stable geometry is worth more than
 * fourteen pixels of plot that appear and disappear.
 */
export interface HeaderBand {
  /** Top y of the title and the warning banner. Drawn with `textBaseline: 'top'`. */
  readonly titleY: number;
  /** Top y of the run-meta line and the right-aligned counters. `textBaseline: 'top'`. */
  readonly metaY: number;
  /** Top y of the building-mood line — `docs/10` § 6, D4. `textBaseline: 'top'`. */
  readonly moodY: number;
  /**
   * Baseline y of the notices row — the hidden-shaft count and the selected landing's caption.
   *
   * One row for both, because both are left-aligned at {@link Rect.x} and drawing them at the same
   * `y` is what the two of them did. Drawn with `textBaseline: 'bottom'`, like everything else
   * anchored upward from the plot.
   */
  readonly noticeY: number;
  /** Baseline y of the bank-label row — `RV-06`. Reserved on every building; see above. */
  readonly bankY: number;
  /** Baseline y of the per-shaft label row. */
  readonly shaftY: number;
  /**
   * Height of one text row in this band, pixels — the box a 12 px line occupies.
   *
   * Carried so a test can rebuild every row's rectangle from the layout rather than from a
   * transcribed constant, which is what `render/headerBand.test.ts` does.
   */
  readonly linePx: number;
  /** The same, for the bold 14 px face the title uses. */
  readonly titleLinePx: number;
}

/**
 * The rows stacked **below** the plot — the same arithmetic ownership {@link HeaderBand} has.
 *
 * ## Why the footer needed one too
 *
 * The header band exists because six literals in two files collided over three rows of space and
 * nobody owned any of them. The footer had two tenants and 28 px, which was exactly enough and
 * therefore never went wrong. The design handoff adds a third — an out-of-service badge at the
 * foot of every shaft (`docs/12` § 1.5 B7, design `:2094`) — and a badge 15 px tall hung off the
 * plot's bottom edge lands on top of the run-status caption at every viewport size. Measured
 * before it was written, from the two functions' own arithmetic: the badge occupied
 * `[h − 35, h − 20]` and the caption `[h − 24, h − 12]`.
 *
 * So the same answer, for the same reason, before rather than after: the rows are computed here
 * once, and {@link MIN_FOOTER_PX} is *derived* from the stack rather than being a number somebody
 * picked. `render/stageRender.test.ts` asserts the three are pairwise disjoint at five viewports,
 * which is `render/headerBand.test.ts`'s rule applied to the other end of the canvas.
 */
export interface FootBand {
  /** Top y of the out-of-service badge row — one badge per shaft column. */
  readonly badgeY: number;
  /** Height of one badge. Carried so a test can rebuild the rectangle rather than transcribe it. */
  readonly badgeHeightPx: number;
  /** Baseline y of the run-status caption. Drawn with `textBaseline: 'middle'`. */
  readonly statusY: number;
  /** Top y of the playback progress bar. */
  readonly progressY: number;
  readonly progressHeightPx: number;
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  /**
   * The margin around everything, pixels — the resolved {@link LayoutOptions.paddingPx}.
   *
   * Carried for the reason {@link pitchPx} is: a renderer that needed it was re-deriving it from
   * a literal. `render/canvas.ts#drawNotices` is the caller — the notices row sits *above* the
   * plot, where nothing else is drawn, so it is measured against the canvas rather than against
   * the plot's own narrower width. Bounding it by the plot is what truncated *"showing 1 of 6
   * shafts"* to a single `…` on a phone: the row that explains a squeezed picture was being given
   * the squeezed picture's budget.
   */
  readonly paddingPx: number;
  /** The shaft area: everything between the label gutters and below the header. */
  readonly plot: Rect;
  /**
   * Where each row of text above the plot goes — see {@link HeaderBand}.
   *
   * Every renderer that writes above {@link Layout.plot} reads it from here. Nothing in `render/`
   * may compute a header y of its own; that is the defect this field closes.
   */
  readonly header: HeaderBand;
  /** Where each row below the plot goes — see {@link FootBand}. Same rule, same reason. */
  readonly foot: FootBand;
  readonly columns: readonly ShaftColumn[];
  readonly rows: readonly FloorRow[];
  /**
   * Shafts that did not fit — `UX.md` `RS-05`.
   *
   * The columns that *are* here are laid out at a legible width; the ones that are not are
   * counted so the renderer can say "showing 6 of 12" rather than truncating in silence, which
   * is what the CLI's `watch` already does and what `RS-05` requires of the viewer too.
   */
  readonly hiddenShaftCount: number;
  /** Pixel height of a drawn car. Shrinks with the floor pitch so cars never overlap. */
  readonly carHeightPx: number;
  /**
   * Pixel distance between two adjacent floor lines.
   *
   * Carried rather than left to be re-derived, because `docs/10` § 6.2 makes it a *decision*
   * input: a rider queue degrades to a bar when *"the floor pitch is below the glyph height"*, and
   * a renderer that recovered the pitch by inverting {@link carHeightPx} would get it wrong at both
   * ends, where that value is clamped. One floor has no pitch; it gets the plot height, matching
   * {@link yForHeight}'s single-floor case.
   */
  readonly pitchPx: number;
  /**
   * The strip inside the plot where waiting people are drawn — `docs/12` § 1.3 M3.
   *
   * `undefined` when the shafts leave no room for one, which is a real case rather than a
   * theoretical one: Mixed-Use High-Rise's sixteen cars fill the plot on any window narrow enough
   * to be worth the phrase. The stage then draws no figures, and the landing row in the right
   * gutter carries the whole claim — the same *aggregate, never remove* degradation `docs/10`
   * § 6.2 uses for the queue itself.
   *
   * Its existence is what decides whether the shaft bank is left-aligned or centred; see
   * {@link BANK_INSET_PX}.
   */
  readonly riderLane: Rect | undefined;
  /** Pixel y for a height above datum, in metres. Continuous, and clamped to the plot. */
  yForHeight(heightM: number): number;
  /** Height above datum for a pixel y. Inverse of {@link yForHeight}, for click-to-seek. */
  heightForY(y: number): number;
  /** The floor row nearest a pixel y, for hover and click. `undefined` when there are no rows. */
  rowNearestY(y: number): FloorRow | undefined;
}

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
  /** Room for floor ids and heights. */
  readonly gutterLeftPx?: number;
  /** Room for the waiting-passenger counts. */
  readonly gutterRightPx?: number;
  /**
   * Room for the title, the counters, the mood line and the labels above the plot.
   *
   * Defaults to {@link MIN_HEADER_PX}, which is *derived* from {@link HeaderBand}'s row stack
   * rather than chosen. A smaller value is clamped up to it: a caller asking for a header too
   * short to hold its own rows is asking for the overprint this band exists to prevent, and
   * silently drawing two labels on top of each other is the worse of the two failures.
   */
  readonly headerPx?: number;
  readonly footerPx?: number;
  readonly paddingPx?: number;
}

/* -------------------------------------------------------------------------- *
 * The header band's row stack
 * -------------------------------------------------------------------------- */

/** Line box of the 12 px monospace face `render/` draws body text in. */
const HEADER_LINE_PX = 14;
/** Line box of the bold 14 px face the title uses. */
const HEADER_TITLE_LINE_PX = 16;
/** Where the title sits. Two pixels above the padding line, which is where it has always been. */
const HEADER_TOP_PX = 10;
/** Air between the last header row and the first row anchored upward from the plot. */
const HEADER_GAP_PX = 2;
/** Air between the shaft label and the plot's top edge. */
const SHAFT_LABEL_GAP_PX = 4;

/** Rows anchored upward from the plot: notices, bank labels, shaft labels. */
const PLOT_LABEL_ROWS = 3;

const DEFAULT_PADDING_PX = 12;

/**
 * The smallest header that holds its own rows, for a given padding — computed, not chosen.
 *
 * `HEADER_TOP_PX − paddingPx` is the distance the title sits above the padding line; the rest is
 * {@link HeaderBand}'s six rows plus the air between the two groups and above the plot.
 */
export function minHeaderPx(paddingPx: number = DEFAULT_PADDING_PX): number {
  return (
    HEADER_TOP_PX -
    paddingPx +
    HEADER_TITLE_LINE_PX +
    2 * HEADER_LINE_PX +
    HEADER_GAP_PX +
    PLOT_LABEL_ROWS * HEADER_LINE_PX +
    SHAFT_LABEL_GAP_PX
  );
}

/**
 * The shipped minimum: **90 px**, against the 64 px it was before.
 *
 * 64 px was never enough for six rows, which is exactly why four of them overlapped. The 26 px
 * this costs the plot is paid back, and then some, by the panel strip in `index.html` — the run
 * summary and the mood gauge now share a row instead of stacking, which is worth ~126 px at
 * 900 px of viewport. Measured before and after; see the delivery report.
 */
export const MIN_HEADER_PX = minHeaderPx(DEFAULT_PADDING_PX);

/* -------------------------------------------------------------------------- *
 * The foot band's row stack — see {@link FootBand}
 * -------------------------------------------------------------------------- */

/** Air above the badge row, and again between it and the caption. */
const FOOT_GAP_PX = 5;
/** One out-of-service badge — design `:2095`, `bh = 15`. */
const OOS_BADGE_HEIGHT_PX = 15;
/** Line box of the caption, at the same 12 px face the header rows use. */
const FOOT_LINE_PX = 14;
/** Air between the caption and the progress bar. */
const FOOT_BAR_GAP_PX = 4;
const PROGRESS_HEIGHT_PX = 6;
/** Air under the progress bar, so it is not flush with the canvas edge. */
const FOOT_BOTTOM_PX = 2;

/**
 * The smallest footer that holds its own rows — computed, not chosen, exactly as
 * {@link minHeaderPx} is.
 *
 * **This is 51 px against the 28 px it was**, and the 23 px comes out of the plot. That is the
 * price of the out-of-service badge being a *control* rather than a decoration: it has to be big
 * enough to hit with a mouse and it has to sit somewhere nothing else is drawn.
 */
export const MIN_FOOTER_PX =
  FOOT_GAP_PX +
  OOS_BADGE_HEIGHT_PX +
  FOOT_GAP_PX +
  FOOT_LINE_PX +
  FOOT_BAR_GAP_PX +
  PROGRESS_HEIGHT_PX +
  FOOT_BOTTOM_PX;

const DEFAULTS = {
  gutterLeftPx: 72,
  gutterRightPx: 76,
  footerPx: MIN_FOOTER_PX,
  paddingPx: DEFAULT_PADDING_PX,
} as const;

/**
 * The default footer, exported so a test that needs to hit an exact floor pitch can subtract the
 * real one rather than a transcription of it.
 *
 * `canvas.test.ts` builds a viewport whose pitch has to land in a two-pixel window between the
 * glyph threshold and the label threshold. It did that with the literal `28`, which stopped being
 * the footer height the moment the badge row was added — the test would have gone on passing
 * while measuring a pitch two pixels away from the one it names.
 */
export const DEFAULT_FOOTER_PX = DEFAULTS.footerPx;

/** Largest shaft width that still looks like a shaft, and the smallest that is still legible. */
const MAX_SHAFT_WIDTH_PX = 96;
const MIN_SHAFT_WIDTH_PX = 18;
const SHAFT_GAP_PX = 10;

/**
 * The gap a bank falls back to when the roomy one cannot hold the building — § D236.
 *
 * At `MIN_SHAFT_WIDTH_PX` the roomy gap is **36 %** of the pitch, so a third of the plot's width
 * is being spent on air at exactly the moment there is not enough of it. Tightening to 4 px is
 * worth five shafts on Vertical City at 1920 × 1080 and three at 1440 — measured, not estimated:
 * 22 → 27 and 14 → 17.
 *
 * It is a **fallback**, not the gap: a bank that fits at 10 px keeps 10 px, so no picture that was
 * legible becomes tighter. And it does not go below 4: the recess, its hairline and the
 * travelling cable are all drawn at the shaft's edges, and shafts that touch stop reading as
 * separate machines. Below this the answer is one bank, not thinner air.
 */
const TIGHT_SHAFT_GAP_PX = 4;

/* -------------------------------------------------------------------------- *
 * The plot's share — § D236, and the reason a phone drew one shaft of six
 * -------------------------------------------------------------------------- */

/**
 * The smallest share of the canvas the shafts are allowed to be squeezed to.
 *
 * ## The failure this closes
 *
 * `dev/main.ts` asks for `gutterRightPx: 280` — the rider-queue gutter — on **every** canvas
 * width, and asked for a 250 px metrics panel above 900 as well until `docs/21` § 3.4 moved that
 * panel to the DOM. At a 360 px canvas (the floor `drawStage`
 * clamps to, which is what a 375 px phone gets) that is `360 − 24 − 72 − 280 = −16`, and
 * `Math.max(1, …)` below turned it into a **one-pixel plot**. `capacity` is `max(1, …)` as well,
 * so the stage drew **exactly one shaft** of every building on every phone — one of Garden
 * Apartments' two, one of Chancery House's six, one of Vertical City's thirty-five — with
 * three-quarters of the canvas blank beside it, and the notice that would have said so truncated
 * by the same one-pixel budget to a single `…`.
 *
 * Two `Math.max(1, …)` guards, each locally correct, turning a caller's over-request into a
 * picture that was wrong without being empty.
 *
 * ## Why the clamp belongs here rather than at the caller
 *
 * The same argument {@link LayoutOptions.headerPx} already makes and this file already acts on:
 * *"a caller asking for a header too short to hold its own rows is asking for the overprint this
 * band exists to prevent"*. A caller asking for gutters wider than the canvas is asking for a plot
 * with nothing in it, and the layout is the one place that can see both numbers. The gutters are
 * *scenery around the subject*; the subject does not yield to them.
 *
 * The share is 45 %. On every desktop width this is inert — at a 1232 px canvas the requested
 * gutters already leave the plot 49 % — so no existing picture moves.
 */
const MIN_PLOT_SHARE = 0.45;

/** Narrowest left gutter that still holds a floor id at the 12 px monospace face. */
const MIN_GUTTER_LEFT_PX = 40;
/** Narrowest right gutter that still holds a landing's `▲12` at the same face. */
const MIN_GUTTER_RIGHT_PX = 44;

/*
 * `MIN_OVERLAY_WIDTH_PX` used to live here — 210 px, GitHub issue #115 § 6, the narrowest panel
 * that held its own longest mandatory line. It is gone with the panel: `docs/21` § 3.4 moved the
 * live metrics out of the bitmap and into a DOM card, so the question *is this room wide enough
 * for its own words* is now the browser's rather than this file's arithmetic, and it is asked as a
 * measured `scrollWidth <= clientWidth` over all eight shipped buildings in both registers
 * (`dev/liveMetrics.browser.test.ts`) instead of against an assumed character advance.
 *
 * That is the trade § D316's carrier was allowed to move on: the replacement check is **stronger**
 * than the one it replaces — it measures the real face at the real width rather than 7.2 px per
 * character — and it is the check issue #115 § 6 said no DOM tier could make.
 */

/**
 * Shrink the two gutters until the plot has {@link MIN_PLOT_SHARE} of the canvas.
 *
 * In request order of what yields first, which is the order of how much each *degrades* rather
 * than how much it is asking for. The right gutter goes first: its landing rows aggregate, and
 * `render/canvas.ts#drawQueueRow` already draws a shortened bar rather than dropping a count, so
 * a narrower one says the same thing in less room. Then the left gutter. Each stops at its own
 * floor rather than at zero, because a gutter that cannot hold a floor id is not a smaller gutter,
 * it is a missing label.
 *
 * ## There was a third claimant, and it went first
 *
 * The live metrics panel was laid out here, and issue #115 § 6 is what that cost: at the viewer's
 * own 910 × 547 canvas the requested 250 px panel was cut to **135.3 px** against content up to
 * 230 px wide, and four strings overhung its border where no DOM check could see them. § D316 gave
 * it a floor; `docs/21` § 3.4 took it off the bitmap altogether. **The room it was holding is the
 * plot's now**, which is what § D316 named as the beneficiary — the crowd lane and the landing
 * rows get the width back at every viewport, and `hiddenShaftCount` can only fall.
 */
function fitGutters(
  inner: number,
  requested: { readonly left: number; readonly right: number },
): { readonly left: number; readonly right: number } {
  const want = Math.max(0, inner * MIN_PLOT_SHARE);
  let { left, right } = requested;
  const shortfall = (): number => want - (inner - left - right);
  if (shortfall() <= 0) return { left, right };

  right = Math.max(MIN_GUTTER_RIGHT_PX, right - shortfall());
  if (shortfall() <= 0) return { left, right };

  left = Math.max(MIN_GUTTER_LEFT_PX, left - shortfall());
  return { left, right };
}

/* -------------------------------------------------------------------------- *
 * The rider lane — see {@link Layout.riderLane}
 * -------------------------------------------------------------------------- */

/**
 * How far the shaft bank is inset from the plot's left edge **when there is a rider lane**.
 *
 * The artefact's `bankX = plot.x + 18` (`:2011`). Without a lane the bank stays centred, which is
 * what it has always done and what looks right when the shafts are the only thing in the plot.
 * With a lane, centring would leave a strip of people on each side of the bank and a bank in the
 * middle of a crowd; the design's reading is *building on the left, lobby on the right*.
 */
const BANK_INSET_PX = 18;

/** Air between the last shaft and the first person — the artefact's `+ 30` (`:2015`). */
const RIDER_LANE_GAP_PX = 30;

/**
 * The narrowest lane worth having: four figures at 11 px plus the 70 px the `+N` is held back.
 *
 * Below this the lane would hold fewer people than the landing row's glyph budget already draws,
 * so it would cost the plot 114 px to say less than the gutter already says. Kept in step with
 * `render/riderFigures.ts`'s own minimum by `stageRender.test.ts`, which asserts the lane the
 * layout hands over always has capacity for at least that many.
 */
const MIN_RIDER_LANE_PX = 4 * 11 + 70;

/**
 * The widest. A lane of 220 px holds thirteen figures, and past that the crowd is being drawn at
 * the expense of the shafts, which are the subject.
 */
const MAX_RIDER_LANE_PX = 220;

/**
 * Smallest row pitch at which a 12 px monospace floor id is readable rather than a smear.
 *
 * 12 px is the font size and 14 px is one line box; below that, consecutive labels touch. This
 * is the threshold {@link FloorRow.labelled} thins at.
 */
const MIN_LABEL_PITCH_PX = 14;

export function buildLayout(options: LayoutOptions): Layout {
  const footer = options.footerPx ?? DEFAULTS.footerPx;
  const padding = options.paddingPx ?? DEFAULTS.paddingPx;
  // Clamped, not trusted: a header shorter than its own rows draws two labels on top of each
  // other, which is the defect this band exists to close. See {@link LayoutOptions.headerPx}.
  const header = Math.max(minHeaderPx(padding), options.headerPx ?? minHeaderPx(padding));

  // Clamped for the same reason, one axis over — see {@link MIN_PLOT_SHARE}. Inert wherever the
  // caller's request already leaves the plot its share, which is every desktop width.
  const { left: gutterLeft, right: gutterRight } = fitGutters(
    Math.max(0, options.width - 2 * padding),
    {
      left: options.gutterLeftPx ?? DEFAULTS.gutterLeftPx,
      right: options.gutterRightPx ?? DEFAULTS.gutterRightPx,
    },
  );

  const plot: Rect = {
    x: padding + gutterLeft,
    y: padding + header,
    width: Math.max(1, options.width - 2 * padding - gutterLeft - gutterRight),
    height: Math.max(1, options.height - 2 * padding - header - footer),
  };

  // Two anchors, meeting in the middle: the three text rows hang from the top of the canvas, and
  // the three label rows stand on the plot. `header` is clamped above so the two never meet.
  const shaftY = plot.y - SHAFT_LABEL_GAP_PX;
  const headerBand: HeaderBand = {
    titleY: HEADER_TOP_PX,
    metaY: HEADER_TOP_PX + HEADER_TITLE_LINE_PX,
    moodY: HEADER_TOP_PX + HEADER_TITLE_LINE_PX + HEADER_LINE_PX,
    noticeY: shaftY - 2 * HEADER_LINE_PX,
    bankY: shaftY - HEADER_LINE_PX,
    shaftY,
    linePx: HEADER_LINE_PX,
    titleLinePx: HEADER_TITLE_LINE_PX,
  };

  // The foot band, anchored from the canvas's bottom edge upward for the progress bar and the
  // caption — which is where those two have always been drawn — and from the plot's bottom edge
  // downward for the badge row, which has to touch the shafts it belongs to. `footer` is not
  // clamped the way `header` is: a caller who asks for a short footer gets a badge row that hangs
  // into the caption's space, and `footerPx` has one caller. See {@link FootBand}.
  const progressY = options.height - FOOT_BOTTOM_PX - PROGRESS_HEIGHT_PX;
  const foot: FootBand = {
    badgeY: plot.y + plot.height + FOOT_GAP_PX,
    badgeHeightPx: OOS_BADGE_HEIGHT_PX,
    statusY: progressY - FOOT_BAR_GAP_PX - FOOT_LINE_PX / 2,
    progressY,
    progressHeightPx: PROGRESS_HEIGHT_PX,
  };

  const heights = options.floors.map((floor) => floor.heightM);
  const lowest = heights.length > 0 ? Math.min(...heights) : 0;
  const highest = heights.length > 0 ? Math.max(...heights) : 0;
  const span = highest - lowest;

  // A single-floor building has no span to map over; put its one row in the middle rather than
  // dividing by zero.
  const yForHeight = (heightM: number): number => {
    if (span <= 0) return plot.y + plot.height / 2;
    const fraction = (heightM - lowest) / span;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    return plot.y + plot.height * (1 - clamped);
  };
  const heightForY = (y: number): number => {
    if (span <= 0) return lowest;
    const fraction = 1 - (y - plot.y) / plot.height;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    return lowest + span * clamped;
  };

  const total = options.shafts.length;
  const available = plot.width;
  // How many shafts fit at the minimum legible width. Beyond that they are *not* laid out at
  // all: squeezing a thirteenth shaft into 4 px is the silent truncation RS-05 forbids, and the
  // count of the ones left out is reported instead.
  const capacityAt = (gap: number): number =>
    Math.max(1, Math.floor((available + gap) / (MIN_SHAFT_WIDTH_PX + gap)));
  // The air between shafts yields before the shafts do — see {@link TIGHT_SHAFT_GAP_PX}. Only
  // when the roomy gap cannot hold the whole building, so a bank that already fits is untouched.
  const shaftGap = capacityAt(SHAFT_GAP_PX) >= total ? SHAFT_GAP_PX : TIGHT_SHAFT_GAP_PX;
  const capacity = capacityAt(shaftGap);
  const count = Math.min(total, capacity);
  const shown = options.shafts.slice(0, count);
  const gapsWidth = Math.max(0, count - 1) * shaftGap;
  const widthIn = (room: number): number =>
    count === 0
      ? 0
      : Math.max(MIN_SHAFT_WIDTH_PX, Math.min(MAX_SHAFT_WIDTH_PX, (room - gapsWidth) / count));

  /*
   * Where the bank sits, and whether there is a lobby beside it.
   *
   * One decision rather than two, because they are one decision: the lane is whatever is left
   * after the bank has been pushed to the left, so asking for a lane and asking where the bank
   * goes are the same question. When the answer is *no lane*, the bank goes back to being centred
   * and the whole of this is inert — which is the case every existing test in this package runs
   * through, and why none of their column coordinates move.
   *
   * ## The lane is *reserved*, not left over — GitHub issue #115 § 2
   *
   * It used to be left over, and that made the crowd unreachable on almost every building the
   * project ships. `shaftWidth` spreads the shafts across the whole plot up to
   * {@link MAX_SHAFT_WIDTH_PX}, so `available − totalWidth` is ~0 for any bank of three shafts or
   * more, and the lane was therefore `undefined` on **7 of the 8 shipped buildings** at the
   * viewer's own 910 × 547 canvas. The one that had a lane was Garden Apartments — two cars, the
   * only bank narrow enough to leave 114 px behind — and Garden Apartments is the building whose
   * landings are empty at every instant a reader is likely to look at. So `riderFigures.ts` was
   * configured correctly, wired correctly, tested correctly and drew a person on **no shipped
   * configuration that had a person to draw**. That is the shape `CLAUDE.md`'s standing
   * requirement is about, arriving through geometry rather than through a missing call.
   *
   * The fix is an ordering, not a new number: ask for the bank at its natural width first, and
   * only if that leaves no lane, ask again inside a plot that has already had
   * {@link MIN_RIDER_LANE_PX} taken out of it.
   *
   * **The lane never costs a shaft, and never takes one below {@link MIN_SHAFT_WIDTH_PX}.** `count`
   * is decided above, against the *whole* plot, and is not revisited here; the second attempt is
   * accepted only when the same `count` shafts still stand at a legible width inside the smaller
   * room. Mixed-Use High-Rise (16 shafts at 21 px) and Vertical City (35) fail that test and keep
   * the picture they have — the shafts are the subject and the crowd is not allowed to hide one.
   */
  const naturalWidth = widthIn(available);
  const naturalTotal = count * naturalWidth + gapsWidth;
  const laneOverheadPx = BANK_INSET_PX + RIDER_LANE_GAP_PX;
  const naturalSlack = available - naturalTotal - laneOverheadPx;

  let shaftWidth = naturalWidth;
  let totalWidth = naturalTotal;
  let laneWidth = naturalSlack >= MIN_RIDER_LANE_PX ? Math.min(MAX_RIDER_LANE_PX, naturalSlack) : 0;
  if (laneWidth === 0 && count > 0) {
    const funded = widthIn(available - laneOverheadPx - MIN_RIDER_LANE_PX);
    const fundedTotal = count * funded + gapsWidth;
    const fundedSlack = available - fundedTotal - laneOverheadPx;
    // `widthIn` clamps up to `MIN_SHAFT_WIDTH_PX`, so a bank that does not fit comes back *wider*
    // than its room and `fundedSlack` goes short. Testing the slack rather than the width is what
    // makes the two conditions one condition.
    if (fundedSlack >= MIN_RIDER_LANE_PX) {
      shaftWidth = funded;
      totalWidth = fundedTotal;
      laneWidth = Math.min(MAX_RIDER_LANE_PX, fundedSlack);
    }
  }
  const originX =
    laneWidth > 0 ? plot.x + BANK_INSET_PX : plot.x + Math.max(0, (available - totalWidth) / 2);
  const riderLane: Rect | undefined =
    laneWidth > 0
      ? {
          x: originX + totalWidth + RIDER_LANE_GAP_PX,
          y: plot.y,
          width: laneWidth,
          height: plot.height,
        }
      : undefined;

  const columns: ShaftColumn[] = shown.map((shaft, index) => {
    const x = originX + index * (shaftWidth + shaftGap);
    return {
      carId: shaft.carId,
      bankId: shaft.bankId,
      label: shaft.label,
      x,
      width: shaftWidth,
      centreX: x + shaftWidth / 2,
    };
  });

  const pitchPx = options.floors.length > 1 ? plot.height / (options.floors.length - 1) : plot.height;
  // Thin by a whole-number stride so the surviving labels stay evenly spaced. `stride` 1 labels
  // everything; 3 labels every third floor.
  const stride = Math.max(1, Math.ceil(MIN_LABEL_PITCH_PX / Math.max(pitchPx, 0.001)));

  /**
   * Reference floors, which are never thinned: the entrance, every sky lobby, and the two ends.
   *
   * They are what a reader orients by on a 60-storey building, so they win the space. That means
   * a *strided* label may have to give way to one, which is the second half of the rule below —
   * the first draft only added the references back and produced exactly the collision `RV-09`
   * forbids, on `vertical-city`, where several transfer floors sit next to strided ones.
   */
  const floorCount = options.floors.length;
  const forced = options.floors.map(
    (floor, index) =>
      floor.isEntrance || floor.isTransferFloor || index === 0 || index === floorCount - 1,
  );
  const ys = options.floors.map((floor) => yForHeight(floor.heightM));
  const nextForcedY: number[] = new Array<number>(floorCount).fill(Number.POSITIVE_INFINITY);
  let upcoming = Number.POSITIVE_INFINITY;
  for (let index = floorCount - 1; index >= 0; index -= 1) {
    nextForcedY[index] = upcoming;
    if (forced[index] === true) upcoming = ys[index] ?? upcoming;
  }

  let lastLabelledY = Number.NEGATIVE_INFINITY;
  const rows: FloorRow[] = options.floors.map((floor, index) => {
    const y = ys[index] ?? 0;
    const isForced = forced[index] === true;
    const roomBehind = Math.abs(y - lastLabelledY) >= MIN_LABEL_PITCH_PX;
    const roomAhead = Math.abs(y - (nextForcedY[index] ?? Number.POSITIVE_INFINITY)) >= MIN_LABEL_PITCH_PX;
    /*
     * `roomBehind` binds a **forced** row too — GitHub issue #115 § 4.
     *
     * It did not, and the omission put two labels through each other on the flagship building.
     * Vertical City's paired lobbies are forced twice over — `isTransferFloor`, and one of them
     * `isEntrance` — and a lower/upper deck pair sits **4.4 px apart** at the viewer's own
     * 910 × 547 canvas. Four such pairs, so `Ground lobby lower level (street entrance, lower deck
     * boarding)` and `Ground lobby upper level (upper deck boarding)` were drawn on top of each
     * other, and so were sky lobbies A, B and C. Measured, not inferred: the layout reported 23
     * labelled rows of 100 and four of the gaps between consecutive ones were 4.4 px against a
     * 14 px line box.
     *
     * A forced row still wins against a *strided* one — that is `roomAhead`, above, and it is
     * untouched. What is added is that it cannot win against a row already drawn, because
     * overstriking is not a way of showing two labels. The one that yields keeps its row, its
     * line, its shaft and its car, and keeps {@link FloorRow.label} for the text alternative and
     * the hover — the degradation this field's own docstring already promises, applied to the one
     * case that was skipping it.
     */
    const labelled =
      stride === 1 || (roomBehind && (isForced || (index % stride === 0 && roomAhead)));
    if (labelled) lastLabelledY = y;
    return {
      floorId: floor.id,
      label: floor.label ?? floor.id,
      heightM: floor.heightM,
      y,
      labelled,
      isEntrance: floor.isEntrance,
      isTransferFloor: floor.isTransferFloor,
    };
  });

  const carHeightPx = Math.max(6, Math.min(28, pitchPx * 0.7));

  const rowNearestY = (y: number): FloorRow | undefined => {
    let best: FloorRow | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(row.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = row;
      }
    }
    return best;
  };

  return {
    width: options.width,
    height: options.height,
    paddingPx: padding,
    plot,
    header: headerBand,
    foot,
    columns,
    rows,
    hiddenShaftCount: total - count,
    carHeightPx,
    pitchPx,
    riderLane,
    yForHeight,
    heightForY,
    rowNearestY,
  };
}
