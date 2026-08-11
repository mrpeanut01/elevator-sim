/**
 * The Day report as a shareable picture — GitHub issue #118 § 1.
 *
 * ## What this replaces, and why it is a defect rather than a missing feature
 *
 * **Export PNG** wrote `ui.stage.canvas` to a file: the stage, at whatever playhead the reader
 * happened to be on. Pressed after a completed day it produced *"two grey rectangles, two green
 * lobby boxes, a `LIVE METRICS / waiting now 0 / nothing served yet` panel clipped off at the right
 * edge, and roughly half the frame empty pale blue"* — a picture of a building doing nothing,
 * carrying no figure, no verdict and no way back to the run. A share control that produces an
 * artefact which does not depict what the player did is a surface making a false implicit claim,
 * which puts it in this repository's own category rather than in the backlog's.
 *
 * The sheet the product already draws — the Day report — is the honest subject: it is the thing the
 * player just read, every figure on it came through `shift/report.ts`'s one suppression gate, and
 * `docs/12` § 4.2 is the argument for each. So this module draws **that**, at 1 200 × 630, which is
 * the size Slack, Discord and the open-graph readers unfurl without recropping.
 *
 * ## It formats and refuses; it does not measure
 *
 * Every string on the card is copied from a {@link ShapedDayReport} the shell already filed. There
 * is no arithmetic here and there must not be: `report.ts`'s module docstring makes the same
 * promise one layer up (*"this module formats and refuses; it does not measure"*), and a card that
 * recomputed a mean would be a second answer to the one question the sheet is most careful about.
 *
 * A **withheld** figure is drawn withheld, in the sheet's own word and colour. That is the clause
 * worth stating: the tempting version of this card drops the suppressed tile so the picture looks
 * clean, and a share artefact that quietly omits the refusal is how a run that could not publish a
 * mean gets shared as though it had.
 *
 * ## Why a `Canvas2DLike` and not DOM
 *
 * `boundaries.test.ts` confines `document` to `src/dev/`, and the Day report panel is DOM. A second
 * DOM tree rendered off-screen and rasterised would need a document, a stylesheet and a font load
 * before it could be tested at all. This takes the same structural context `render/canvas.ts`
 * takes, so `reportCard.test.ts` drives it under plain Node against a recording stub, and the shell
 * supplies a real off-screen canvas.
 *
 * ## The footer is the reproduction recipe, and it may say it has none
 *
 * The bottom strip carries the seed and the share line — the URL that opens this run, or the CLI
 * flags. A run that cannot be reproduced from its own selection carries the **reason** instead
 * (`scope/runIdentity.ts`'s words, through `dev/main.ts#shareLinkOf`), because a recipe that
 * rebuilds a different run is worse than none. That is `provenanceLineOf`'s rule, drawn.
 */

import type { ShapedDayReport } from '../shift/report.js';
import type { FigureTone } from '../shift/types.js';

import type { Canvas2DLike, Theme } from './canvas.js';

/* -------------------------------------------------------------------------- *
 * The frame
 * -------------------------------------------------------------------------- */

/**
 * The open-graph card size, and the reason the number is not a taste.
 *
 * 1 200 × 630 is the ratio Slack, Discord, Twitter/X, LinkedIn and Facebook all crop *to* rather
 * than *from*, so a card authored at it is the one thing in a share preview that is not guessed at.
 * A stage screenshot is 912 × 549 and gets letterboxed or cropped through the middle by every one
 * of them.
 */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const PAD = 56;
/** Five tiles across the card's inner width, with a gutter between them. */
const TILE_COUNT = 5;
const TILE_GAP = 16;

const EYEBROW_FONT = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
const TITLE_FONT = 'bold 44px ui-monospace, SFMono-Regular, Menlo, monospace';
const VERDICT_FONT = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
const LEDE_FONT = '20px ui-monospace, SFMono-Regular, Menlo, monospace';
const TILE_LABEL_FONT = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
const TILE_VALUE_FONT = 'bold 30px ui-monospace, SFMono-Regular, Menlo, monospace';
const TILE_NOTE_FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
const SECTION_FONT = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
const ROW_FONT = '16px ui-monospace, SFMono-Regular, Menlo, monospace';
const FOOTER_FONT = '14px ui-monospace, SFMono-Regular, Menlo, monospace';

/* -------------------------------------------------------------------------- *
 * The input
 * -------------------------------------------------------------------------- */

/** How this run may be reproduced elsewhere, or why it may not. Mirrors `dev/main.ts`'s `Provenance`. */
export type CardRecipe =
  | { readonly ok: true; readonly line: string }
  | { readonly ok: false; readonly reasons: readonly string[] };

export interface ReportCardInput {
  /** The sheet the shell filed. Never recomputed here — see the module docstring. */
  readonly report: ShapedDayReport;
  /** `Chancery House`, as the header names it. The report's own `metaLines` name the dispatcher. */
  readonly buildingName: string;
  readonly seed: string;
  /** The link that opens this run, or the reasons no artefact reproduces it. */
  readonly recipe: CardRecipe;
}

/**
 * Why there is no card, when there is none — as a value the shell puts on the status line.
 *
 * `undefined` would be an absence indistinguishable from an oversight, which `docs/16` S1 refuses.
 * The one reason this returns is the one state the control can be pressed in and produce nothing:
 * no day has been filed yet, so there is no sheet to draw. Exporting the stage instead is what the
 * control used to do and is the defect.
 */
export const NO_SHEET_YET =
  'no day has been filed yet — run a shift to the end, and Export report PNG draws its report card';

/* -------------------------------------------------------------------------- *
 * Layout — pure, and the half a test can read
 * -------------------------------------------------------------------------- */

/** One stat tile, already worded and toned. */
export interface CardTile {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone: FigureTone;
}

/** Everything the card says, positioned by nothing — the half `reportCard.test.ts` asserts on. */
export interface ReportCard {
  readonly eyebrow: string;
  readonly title: string;
  readonly verdictLine: string;
  readonly verdict: ShapedDayReport['verdict'];
  readonly lede: readonly string[];
  readonly tiles: readonly CardTile[];
  readonly sectionHeading: string;
  readonly rows: readonly string[];
  readonly footer: readonly string[];
}

/**
 * What the card says, derived from the filed sheet.
 *
 * Five tiles because the sheet's own grid is five wide and because `docs/12` § 4.2 orders the
 * figures — so *the first five* is the sheet's order, not a ranking invented here. The energy pair
 * is **not** promoted into that five by any rule of this module: it is where `report.figures` puts
 * it, which is after the wait figures, because energy is an axis and never a score (§ D106). If it
 * lands in the five it is drawn `unranked` and uncoloured, exactly as the sheet draws it.
 */
export function reportCardOf(input: ReportCardInput): ReportCard {
  const { report } = input;
  const tiles = report.figures.slice(0, TILE_COUNT).map((figure) => ({
    label: figure.label,
    value: figure.value,
    note: figure.note,
    tone: figure.tone,
  }));
  /*
   * The first diagnosis row and no more, with its own explanation under it.
   *
   * The sheet lists every row; a card has room for the one the heading names — *the tightest
   * moment* is singular — and a truncated list read as a complete one is the failure mode a picture
   * has that a scrollable panel does not. The `why` comes with it rather than being dropped for
   * space: it is the sentence that stops a number on a shared card being read as a verdict, and
   * space is the one thing this layout has.
   */
  const first = report.diagnosis[0];
  const rows =
    first === undefined
      ? []
      : [`${first.when}  ${first.what}`, ...wrap(first.why, CARD_WIDTH - PAD * 2, 8.4)];
  return {
    eyebrow: `${input.buildingName.toUpperCase()} · DAILY OBSERVATION SHEET`,
    title: report.title,
    verdictLine: report.verdictLine,
    /*
     * A single run's banner is a refusal to grade, never a verdict — `docs/19` defect 13.
     * `shift/report.ts` already replaced its words; what this card adds is the ink, and inking
     * *read, not graded* in the cleared green or the missed amber would be the grade back as a
     * colour. `ungraded` is the existing neutral key, chosen for the same reason
     * `dev/reportPanel.ts#reportViewOf` draws the same line in `var(--dim)` — the two renderers of
     * this string key their neutrality on the same discriminator, `of === 'single-run'`.
     */
    verdict: report.of === 'single-run' ? 'ungraded' : report.verdict,
    lede: wrap(report.lede, CARD_WIDTH - PAD * 2, 11.6),
    tiles,
    sectionHeading: report.diagnosisHeading.toUpperCase(),
    rows,
    footer: footerLinesOf(input),
  };
}

/**
 * The bottom strip: the seed, then the recipe or the reasons there is none.
 *
 * The seed is on its own line and is always there, because it is the one fact that makes the
 * picture a *reproduction* rather than a screenshot — CLAUDE.md invariant 5's claim, on the surface
 * that leaves the building. The line under it is `shareLinkOf`'s, and its refusal arm is quoted
 * rather than summarised: those sentences are the reader's only account of why the run they are
 * looking at cannot be handed to somebody else.
 */
function footerLinesOf(input: ReportCardInput): readonly string[] {
  const seedLine = `seed ${input.seed}`;
  if (input.recipe.ok) return [seedLine, input.recipe.line];
  return [
    seedLine,
    ...wrap(`this run does not reproduce elsewhere — ${input.recipe.reasons.join('; ')}`, CARD_WIDTH - PAD * 2, 8.4),
  ];
}

/**
 * Greedy word wrap at an approximate monospace advance — `render/overlay.ts`'s, and the same
 * reason it is approximate there.
 *
 * `Canvas2DLike` has no `measureText` on purpose: it is the subset the renderer uses, and adding a
 * measurement method would make every test stub implement font metrics. The advances are passed in
 * per call site because this card mixes three sizes, where the overlay has one.
 */
function wrap(text: string, widthPx: number, advancePx: number): readonly string[] {
  const perLine = Math.max(8, Math.floor(widthPx / advancePx));
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/u)) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= perLine) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

/* -------------------------------------------------------------------------- *
 * Drawing
 * -------------------------------------------------------------------------- */

/**
 * A tone's ink, from the theme rather than from a hex triple.
 *
 * `dev/reportPanel.ts#toneColourOf` answers the same question for the DOM sheet in CSS custom
 * properties, and the two agree because both resolve to the four band tokens — `--ok` is
 * `--band-0`, `--warn` is `--band-1`, `--bad` is `--band-3` (`index.html` :136–138). A fifth hand
 * of the palette would be `docs/12` § 2.2's defect again.
 *
 * `unranked` returns the plain ink and that is the decision, not an omission: it is the energy
 * pair's tone, and a coloured energy figure would rank the quantity § D106 forbids ranking.
 */
function toneInk(tone: FigureTone, theme: Theme): string {
  switch (tone) {
    case 'good':
      return theme.queueBands.settling;
    case 'caution':
    case 'withheld':
      return theme.queueBands.waiting;
    case 'hot':
      return theme.queueBands.long;
    case 'bad':
      return theme.queueBands.abandoned;
    case 'plain':
    case 'unranked':
      return theme.text;
  }
}

/** The verdict's ink — `dev/reportPanel.ts#VERDICT_COLOUR`'s three, resolved the same way. */
function verdictInk(verdict: ShapedDayReport['verdict'], theme: Theme): string {
  switch (verdict) {
    case 'cleared':
      return theme.queueBands.settling;
    case 'missed':
      return theme.queueBands.waiting;
    case 'ungraded':
      // Neutral, and deliberately the dim ink rather than amber: a day nobody judged is not a day
      // that went wrong, and amber is this palette's word for *went wrong*. § D234.
      return theme.textDim;
  }
}

/**
 * Paint the card. The shell owns the canvas; this owns every pixel on it.
 *
 * Deliberately opaque from the first call — `fillRect` over the whole frame rather than
 * `clearRect` — because a PNG with an alpha channel is a picture that reads as a hole on any
 * surface that composites it, which is every one of the places this file is going.
 */
export function drawReportCard(ctx: Canvas2DLike, card: ReportCard, theme: Theme): void {
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let y = PAD;
  ctx.font = EYEBROW_FONT;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(card.eyebrow, PAD, y);
  y += 30;

  ctx.font = TITLE_FONT;
  ctx.fillStyle = theme.text;
  ctx.fillText(card.title, PAD, y);
  y += 56;

  ctx.font = VERDICT_FONT;
  ctx.fillStyle = verdictInk(card.verdict, theme);
  ctx.fillText(card.verdictLine, PAD, y);
  y += 36;

  ctx.font = LEDE_FONT;
  ctx.fillStyle = theme.text;
  for (const line of card.lede) {
    ctx.fillText(line, PAD, y);
    y += 26;
  }

  y += 18;
  const tileWidth = (CARD_WIDTH - PAD * 2 - TILE_GAP * (TILE_COUNT - 1)) / TILE_COUNT;
  const tileTop = y;
  const tileHeight = 132;
  card.tiles.forEach((tile, index) => {
    const x = PAD + index * (tileWidth + TILE_GAP);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(x, tileTop, tileWidth, tileHeight);
    ctx.font = TILE_LABEL_FONT;
    ctx.fillStyle = theme.textDim;
    ctx.fillText(tile.label, x + 14, tileTop + 14);
    ctx.font = TILE_VALUE_FONT;
    ctx.fillStyle = toneInk(tile.tone, theme);
    ctx.fillText(tile.value, x + 14, tileTop + 40);
    ctx.font = TILE_NOTE_FONT;
    ctx.fillStyle = theme.textDim;
    /*
     * Two lines of note and then it stops, with no ellipsis. An ellipsis on a card is a promise of
     * a *more* that a picture cannot offer; the full note is on the sheet, which is where the
     * reader who wants it is standing.
     */
    for (const [line, offset] of wrap(tile.note, tileWidth - 28, 6.6)
      .slice(0, 2)
      .map((line, position) => [line, position] as const)) {
      ctx.fillText(line, x + 14, tileTop + 82 + offset * 15);
    }
  });
  y = tileTop + tileHeight + 30;

  ctx.font = SECTION_FONT;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(card.sectionHeading, PAD, y);
  y += 24;
  card.rows.forEach((row, index) => {
    // The first row is the moment; the rest are its explanation, a step quieter so the eye reads
    // the incident first and the reason second, which is the order the sheet puts them in.
    ctx.font = index === 0 ? ROW_FONT : TILE_NOTE_FONT;
    ctx.fillStyle = index === 0 ? theme.text : theme.textDim;
    ctx.fillText(row, PAD, y);
    y += index === 0 ? 26 : 17;
  });

  const footerTop = CARD_HEIGHT - PAD - (card.footer.length - 1) * 20;
  // A hairline over the footer, so the recipe reads as a footer rather than as a dropped sentence.
  ctx.fillStyle = theme.shaftEdge;
  ctx.fillRect(PAD, footerTop - 30, CARD_WIDTH - PAD * 2, 1);
  ctx.font = FOOTER_FONT;
  ctx.fillStyle = theme.textDim;
  card.footer.forEach((line, index) => {
    ctx.fillText(line, PAD, footerTop + index * 20 - 14);
  });

  ctx.restore();
}
