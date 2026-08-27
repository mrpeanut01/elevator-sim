/**
 * **The Endless rush setup screen** — GAMEPLAY § 9.1, the DOM half.
 *
 * Every word and every figure is `rushScreenModel.ts`'s, which is where the ramp arithmetic, the
 * § 20.5 hold line, the register of absences and the § 3.3 refinement live and are argued. This
 * file draws that model with `tokens.ts`'s § 19 values, in the prototype's two-column geometry: the
 * paper column carries the title, the three facts and the five bands; the ink column carries the
 * hold rule, the standings under the marker that says what they are, and who would drive.
 *
 * It wires **no control**. § 3.3 gives the screen one primary (`Start the rush`) and the shell owns
 * it; the model marks it inert because the climbing stream is not built, and the prototype's
 * dispatcher select is not drawn for the reason `rushDrivingLine`'s docstring gives. So this mount
 * has nothing to listen to and nothing to redraw — which is why it takes no host subscription.
 *
 * **The refusal about that inert primary is not on this screen**, and since GitHub issue #262 it is
 * not drawn here at all: `rushScreenModel.ts#rushBarModel` substitutes it into the § 3.3 bar, which
 * is the element § 3.1 pins. See the comment where the paragraph used to be, halfway down `mount`,
 * for the measurement that moved it and for why nothing replaced it.
 */

import { actionBarFor } from './actionBar.js';
import type { EverydayScreenContext, EverydayScreenHandle, EverydayScreenModule } from './screens.js';
import {
  rushBandViews,
  rushBarModel,
  rushDrivingLine,
  rushFactViews,
  rushGeneratedRangeLine,
  rushHoldLineFigure,
  rushOpeningLine,
  RUSH_BESTS,
  RUSH_BESTS_FIXTURE_NOTE,
  RUSH_SCREEN_COPY as COPY,
} from './rushScreenModel.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_RAIL_SURFACES as RAIL_SURFACE,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/** The prototype's ink-column hairline, between the standings and the driving block. */
const INK_RULE = '#3A342C';

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mount(host: HTMLElement, context: EverydayScreenContext): EverydayScreenHandle {
  const doc = host.ownerDocument;

  const root = el(doc, 'div', 'everyday-rush');
  root.style.cssText =
    'display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:0;align-items:stretch';

  /* ---------------------------------------------------------------- paper */
  const paper = el(doc, 'div', 'everyday-rush-setup');
  paper.style.cssText = `padding:30px 32px 34px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 65%,${C.paperDeeper});min-width:0`;

  const eyebrow = el(doc, 'div', undefined, COPY.eyebrow);
  eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
  const title = el(doc, 'h1', undefined, COPY.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:20ch`;
  const lede = el(doc, 'p', undefined, COPY.lede);
  lede.style.cssText = `font-size:17px;line-height:1.55;color:${C.inkSoft};margin:13px 0 0;max-width:56ch;text-wrap:pretty`;
  paper.append(eyebrow, title, lede);

  /* the three facts */
  const facts = el(doc, 'div', 'everyday-rush-facts');
  facts.style.cssText = `display:flex;gap:26px;margin:24px 0 0;padding:18px 0;border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule};max-width:620px;flex-wrap:wrap`;
  for (const fact of rushFactViews()) {
    const cell = el(doc, 'div');
    cell.style.cssText = 'min-width:0';
    const value = el(doc, 'div', 'everyday-rush-fact-value', fact.value);
    value.style.cssText = `font:500 21px ${TYPE.mono};letter-spacing:-.02em;color:${fact.withheld ? C.warmGrey : C.terracotta}`;
    const label = el(doc, 'div', undefined, fact.label);
    label.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.35;margin-top:4px;max-width:26ch`;
    cell.append(value, label);
    facts.append(cell);
  }
  paper.append(facts);

  /* § 9.1's bands, each a label on the ramp with its proportional bar */
  const bandsBlock = el(doc, 'div');
  bandsBlock.style.cssText = 'margin-top:22px';
  const bandsEyebrow = el(doc, 'div', undefined, COPY.bandsEyebrow);
  bandsEyebrow.style.cssText = `${EYEBROW};margin-bottom:10px`;
  const bandsList = el(doc, 'div', 'everyday-rush-bands');
  bandsList.style.cssText = 'display:grid;gap:6px;max-width:660px';
  const views = rushBandViews();
  for (const [index, band] of views.entries()) {
    const heavy = index > 2;
    const row = el(doc, 'div', 'everyday-rush-band');
    row.style.cssText = `display:flex;align-items:center;gap:12px;padding:9px 13px;border-radius:${String(R.well)}px;background:${heavy ? C.amberWash : C.card};border:1px solid ${heavy ? C.amberEdge : C.ruleLight};flex-wrap:wrap`;
    const waves = el(doc, 'span', undefined, band.waves);
    waves.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.label};flex:none;width:74px`;
    const rate = el(doc, 'span', undefined, band.rate);
    rate.style.cssText = `flex:none;font:500 12.5px ${TYPE.mono};color:${C.ink};width:94px`;
    const figure = el(doc, 'span', 'everyday-rush-band-rate', `${band.perMinute} · ${band.against}`);
    figure.style.cssText = `flex:none;font:500 11.5px ${TYPE.mono};color:${C.warmGrey};width:150px`;
    const note = el(doc, 'span', undefined, band.note);
    note.style.cssText = `font-size:13px;color:${C.inkSoft};min-width:0;flex:1 1 200px`;
    const track = el(doc, 'span');
    track.style.cssText = `margin-left:auto;height:7px;border-radius:4px;background:${C.paperDeep};width:120px;overflow:hidden;flex:none`;
    const fill = el(doc, 'span');
    fill.style.cssText = `display:block;height:100%;width:${String(band.barPct)}%;background:${index > 3 ? C.alarm : heavy ? C.sun : C.moss}`;
    track.append(fill);
    row.append(waves, rate, figure, note, track);
    bandsList.append(row);
  }
  const opening = el(doc, 'p', 'everyday-rush-opening', rushOpeningLine());
  opening.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:9px 0 0;max-width:660px`;
  bandsBlock.append(bandsEyebrow, bandsList, opening);
  paper.append(bandsBlock);

  /*
   * **The refusal is not drawn here any more, and the block that used to be is why** — GitHub
   * issue #262.
   *
   * A `.everyday-rush-refusal` paragraph sat at the foot of this column, and the comment above it
   * claimed *"the reason is on the control ... and it is not repeated anywhere else on this
   * screen"*. The second half was true. The first half was a claim about a paragraph 905 px down a
   * 720 px viewport, at the bottom of a column the player has to scroll — and 3 443 px down the
   * 667 px viewport `docs/31-support-matrix.md`'s shortest supported row names. The control it was
   * supposedly on had no `title`, no `aria-label` and no `aria-describedby`.
   *
   * `rushScreenModel.ts#rushBarModel` puts it in the § 3.3 bar instead, which is the element § 3.1
   * pins and the only one that cannot go below a fold. The *"not repeated anywhere else"* rule is
   * unchanged and is the reason nothing replaced this paragraph: one constant, one place on
   * screen. Do not draw a second copy here to make the column end on something — that is the
   * drift the rule exists to prevent, and the sentence would be the one a player has already read
   * in the bar.
   */

  /* ------------------------------------------------------------------ ink */
  const ink = el(doc, 'div', 'everyday-rush-aside');
  ink.style.cssText = `background:${C.ink};color:${C.paper};padding:30px 26px;display:flex;flex-direction:column;min-width:0`;

  const holdEyebrow = el(doc, 'div', undefined, COPY.holdEyebrow);
  holdEyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label}`;
  const holdLine = el(doc, 'p', 'everyday-rush-hold', COPY.holdLine);
  holdLine.style.cssText = `font-size:14px;line-height:1.55;color:${C.fainter};margin:9px 0 0`;
  const holdFigure = el(doc, 'div', 'everyday-rush-hold-figure', rushHoldLineFigure());
  holdFigure.style.cssText = `font:500 12px ${TYPE.mono};color:${C.sun};margin-top:7px`;
  const generated = el(doc, 'p', 'everyday-rush-generated', rushGeneratedRangeLine());
  generated.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.label};margin:10px 0 0`;
  ink.append(holdEyebrow, holdLine, holdFigure, generated);

  const bestsBlock = el(doc, 'div');
  bestsBlock.style.cssText = 'margin-top:22px';
  const bestsEyebrow = el(doc, 'div', undefined, COPY.bestsEyebrow);
  bestsEyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};margin-bottom:11px`;
  /*
   * **The fixture marker, above the rows rather than under them** — GAMEPLAY § 20.11, GitHub issue
   * #293. The five standings are authored fixtures carrying two handles that read as accounts, and
   * § 20.11 gives a fixture two ways to ship: a real source, or a marker so nobody takes it for
   * truth. The engine that would be the real source is #220's, so the marker is what there is.
   *
   * It goes *before* the list for the reason `dev/menuPanel.ts#exampleBoard` puts its own
   * disclaimer before its two example rows: a reader who has already read five names and two held
   * times has formed the belief the note exists to prevent. The note is not part of the list, so it
   * sits outside `bestsList` and no row's geometry moves.
   *
   * It is drawn here and nowhere else, and `rushScreenModel.test.ts` requires that this module and
   * the module drawing `RUSH_BESTS` stay the same module. That is the § D227 relation rather than a
   * pinned string: the licence and the thing it licenses cannot be separated without a red test.
   */
  const bestsNote = el(doc, 'p', 'everyday-rush-bests-note', RUSH_BESTS_FIXTURE_NOTE);
  bestsNote.style.cssText = `font-size:11.5px;line-height:1.5;color:${C.label};margin:0 0 11px;text-wrap:pretty`;
  const bestsList = el(doc, 'div', 'everyday-rush-bests');
  bestsList.style.cssText = 'display:grid;gap:7px';
  for (const best of RUSH_BESTS) {
    const row = el(doc, 'div', 'everyday-rush-best');
    row.style.cssText = `display:flex;align-items:baseline;gap:10px;padding:9px 11px;border-radius:${String(R.row)}px;background:${best.reference ? '#2A2620' : RAIL_SURFACE.card}`;
    const left = el(doc, 'span');
    left.style.cssText = 'min-width:0';
    const name = el(doc, 'span', undefined, best.name);
    name.style.cssText = 'display:block;font-size:13px;font-weight:600';
    const who = el(doc, 'span', undefined, best.who);
    who.style.cssText = `display:block;font-size:11.5px;color:${C.label};margin-top:1px`;
    left.append(name, who);
    const right = el(doc, 'span');
    right.style.cssText = 'margin-left:auto;text-align:right;flex:none';
    const wave = el(doc, 'span', undefined, best.wave);
    wave.style.cssText = `display:block;font:500 13px ${TYPE.mono};color:${best.wave === COPY.noRun ? C.label : C.sun}`;
    const held = el(doc, 'span', undefined, best.held);
    held.style.cssText = `display:block;font:500 11px ${TYPE.mono};color:${C.label};margin-top:1px`;
    right.append(wave, held);
    row.append(left, right);
    bestsList.append(row);
  }
  bestsBlock.append(bestsEyebrow, bestsNote, bestsList);
  ink.append(bestsBlock);

  const drivingBlock = el(doc, 'div');
  drivingBlock.style.cssText = `margin-top:auto;border-top:1px solid ${INK_RULE};padding-top:18px`;
  const drivingEyebrow = el(doc, 'div', undefined, COPY.drivingEyebrow);
  drivingEyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};margin-bottom:8px`;
  /*
   * The standing dispatcher, named through the host's honest lookup: an id this build does not know
   * is printed as the id rather than substituted for the first shipped profile, which is
   * `dispatcherById`'s own rule one level down.
   */
  const selection = context.host.selection();
  const driver = context.host.dispatcherById(selection.dispatcherId);
  const driving = el(
    doc,
    'div',
    'everyday-rush-driving',
    rushDrivingLine(driver?.name ?? selection.dispatcherId),
  );
  driving.style.cssText = 'font-size:13.5px;font-weight:600;line-height:1.5';
  const drivingNote = el(doc, 'p', undefined, COPY.drivingNote);
  drivingNote.style.cssText = `font-size:12px;line-height:1.5;color:${C.label};margin:9px 0 0`;
  drivingBlock.append(drivingEyebrow, driving, drivingNote);
  ink.append(drivingBlock);

  root.append(paper, ink);
  host.append(root);
  return {};
}

/**
 * The registry row. Registering the setup screen retires `UNBUILT_REASONS.rush` — the sentence that
 * said *the rush needs held time and a setup screen, and neither exists* — and the half of it that
 * is still true moves onto the primary's own row in the bar, which is where a refusal about a
 * missing engine belongs once the screen in front of it is real. It took GitHub issue #262 to make
 * that sentence describe a place a player can read rather than one they would have to scroll to.
 */
export const RUSH_SCREEN: EverydayScreenModule = {
  key: 'rush',
  mount,
  /* Start from the table's own row and edit its inert cells — `screens.ts`'s rule for a `bar()`. */
  bar: (state) => rushBarModel(actionBarFor(state)),
};
