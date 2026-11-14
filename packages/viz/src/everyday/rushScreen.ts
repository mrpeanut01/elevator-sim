/**
 * **The Endless rush setup screen** — GAMEPLAY § 9.1, the DOM half.
 *
 * Every word and every figure is `rushScreenModel.ts`'s, which is where the ramp arithmetic, the
 * § 20.5 hold line, the register of absences and the § 3.3 refinement live and are argued. This
 * file draws that model with `tokens.ts`'s § 19 values, in the prototype's two-column geometry: the
 * paper column carries the title, the three facts, who drives (the dispatcher choice), the five
 * bands and the end rule in one line; the ink column carries the house’s standings under the note
 * that says what they are. The long accounts (how rush works, what the house runs are, the rebuild) sit behind links.
 *
 * It wires **one control**, and this paragraph said *no control* until GitHub issue **#565**
 * (§ D857). § 3.3 still gives the screen one primary (`Start the rush`) and the shell still owns
 * it; what has been added is the prototype's own dispatcher select, in the driving block, refused
 * here for as long as `rushDrivingLine`'s docstring argued it could only reach another mode's run.
 * It reaches this one — `everyday/rush.ts#RUSH_FIELD_ROLES` records `dispatcherId` as the
 * dispatcher a rush brings — and without it `data/rush-house-runs.json`'s top row was a figure
 * advertised on a path no screen in this mode offered.
 *
 * So this mount now has exactly one thing to listen to and exactly one thing to redraw
 * ({@link syncDriver}), and it still takes **no host subscription**: the only writer of
 * `dispatcherId` reachable while this screen holds the page is that select. What it reads can still
 * move under it, because the Engineer surface writes the player's settings while this screen stands
 * covered, so the shell draws it again on the way back (`shell.ts#returnToEveryday`, GitHub PR
 * #530's review, finding 1).
 *
 * **This paragraph also said the model *"marks it inert because the climbing stream is not built"*,
 * and it had been false since GitHub issue #220** (§ D515). `rushScreenModel.ts#rushBarModel` is
 * `return base` — the primary is live and the mount answers the press with `EverydayHost.startRush`.
 * The refusal it substituted was deleted on the commit that built the engine, § D227's rule, and
 * this sentence a file away was not. GitHub issue #423.
 *
 * **The refusal about that inert primary is not on this screen**, and since GitHub issue #262 it is
 * not drawn here at all: `rushScreenModel.ts#rushBarModel` substitutes it into the § 3.3 bar, which
 * is the element § 3.1 pins. See the comment where the paragraph used to be, halfway down `mount`,
 * for the measurement that moved it and for why nothing replaced it.
 */

import { specIsDirty } from '../authoring/selectorSpec.js';

import { actionBarFor } from './actionBar.js';
import { explainer, sideBySide } from './screenDom.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  rushBandViews,
  rushBarModel,
  rushDrivingLine,
  rushFactViews,
  rushGeneratedRangeLine,
  rushLeftBehindLine,
  rushOpeningLine,
  rushRebuildLineOf,
  rushFittedLineOf,
  RUSH_SCREEN_COPY as COPY,
  type RushFurthestStanding,
} from './rushScreenModel.js';
import { RUSH_HOUSE_COPY, rushHouseToBeatLineOf, rushStandingsOf, type RushPostedStandings, type RushYoursRowView } from './rushHouse.js';
import type { RushDeviceStanding } from './rushDeviceBest.js';
import { RUSH_PURSE } from './rushRebuild.js';
import { deviceNowMs } from '../shift/deviceDate.js';
import { RUSH_CARD_COPY, rushCardViewOf, rushDayNumberOf, rushPlayIsHouseCard, rushModelChoicesOf, rushNextMorningOf, rushTodayCardOf } from './rushCardView.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_RAIL_SURFACES as RAIL_SURFACE,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/** The hosts whose card this screen has set to the day's, so a player's own pick is not overwritten on the way back. */
const CARD_SET = new WeakSet<object>();

/** The ink column's width beside the paper — the grid's old upper track. */
const RUSH_ASIDE_PX = 340;
/** Below this the paper has stopped being a column, so the two stack: about 700 px with the aside. */
const RUSH_PAPER_MIN_PX = 360;

/** The prototype's ink-column hairline, around the tags on the house's rows. */
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

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;

  /*
   * **Two columns that stack on a phone** — wave AR, lane AR-1 (GitHub issue #633), on
   * `screenDom.ts#sideBySide`, the brief screen's seat. This was a grid of `minmax(0,1fr)
   * minmax(280px,340px)` with no breakpoint, and at 390 px the ink column took the screen and left
   * the title, the furthest round and the dispatcher choice a 22 px column. It wraps below about
   * 700 px (340 + 360), the ink column under the paper and as wide as it. Recorded under
   * [§ D405](../../../../DECISIONS.md).
   */
  const root = el(doc, 'div', 'everyday-rush');

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
  /* Wave AQ lane AQ-3: a round the last page closed on, said once, as a status a reader is told about. */
  const unfinishedLine = context.host.rushUnfinished();
  if (unfinishedLine !== undefined) {
    const unfinished = el(doc, 'p', 'everyday-rush-unfinished', unfinishedLine);
    unfinished.setAttribute('role', 'status');
    unfinished.style.cssText = `font-size:14px;line-height:1.5;color:${C.ink};margin:14px 0 0;max-width:56ch;padding:10px 12px;border:1px solid ${C.amberEdge};background:${C.amberWash};border-radius:${String(R.well)}px`;
    paper.append(unfinished);
  }

  /* the three facts */
  const facts = el(doc, 'div', 'everyday-rush-facts');
  facts.style.cssText = `display:flex;gap:26px;margin:24px 0 0;padding:18px 0;border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule};max-width:620px;flex-wrap:wrap`;
  /*
   * § D1515: the first two facts are this device's furthest round on the standing tower, replayed off
   * this thread and drawn again when the replay lands; until then they say they are checking.
   */
  let furthest: RushFurthestStanding = { kind: 'pending' };
  function drawFacts(): void {
    facts.replaceChildren();
    for (const fact of rushFactViews(context.host.rushBest(), furthest)) {
      const cell = el(doc, 'div');
      cell.style.cssText = 'min-width:0';
      const value = el(doc, 'div', 'everyday-rush-fact-value', fact.value);
      value.style.cssText = `font:500 21px ${TYPE.mono};letter-spacing:-.02em;color:${fact.withheld ? C.warmGrey : C.terracotta}`;
      const label = el(doc, 'div', 'everyday-rush-fact-label', fact.label);
      label.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.35;margin-top:4px;max-width:26ch`;
      cell.append(value, label);
      facts.append(cell);
    }
  }
  drawFacts();

  /*
   * **Who drives, in the paper column under the facts** — the product owner's ruling of 2026-11-13.
   * The block sat at the foot of the ink column, under the house's runs. It is the screen's one
   * choice, so it is drawn before the waves table and the house's runs at every width, on the light
   * ground, with the default link colour.
   */
  const drivingBlock = el(doc, 'div');
  drivingBlock.style.cssText = 'margin-top:22px;max-width:660px';
  const drivingEyebrow = el(doc, 'div', undefined, COPY.drivingEyebrow);
  drivingEyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};margin-bottom:8px`;
  /*
   * The standing dispatcher, named through the host's honest lookup: an id this build does not know
   * is printed as the id rather than substituted for the first shipped profile, which is
   * `dispatcherById`'s own rule one level down.
   */
  const driving = el(doc, 'div', 'everyday-rush-driving');
  driving.style.cssText = `font-size:15px;font-weight:600;line-height:1.5;color:${C.ink}`;
  drivingBlock.append(drivingEyebrow, driving);

  /*
   * **The pick, before the run rather than during it** — GitHub issue #565's second defect,
   * § D857, and the end of *"it wires no control"* one paragraph up in this file's own docstring.
   *
   * It is the brief's control (`everyday/briefScreen.ts:360`), deliberately: the same
   * `EverydayHost.setDispatcher`, the same `dev/state.ts#withDispatcher` behind it, and the same
   * `change` listener — a select that writes standing state on `change` costs a state write and is
   * reversible, which is exactly why § 7's stage picker is the *other* shape and says so on its own
   * face (`stageScreenModel.ts#STAGE_SWITCH_PICKER_NOTE`). Two selects, two behaviours, and each
   * one states which it is.
   *
   * It is what makes `data/rush-house-runs.json`'s figures reachable: the table's own
   * `provenance.path` opens `withBuilding → withDispatcher → rushPatchOf`, and until this listener
   * existed no screen inside the rush took that route. What a mid-run handover reaches instead is
   * measured in `rushHandover.test.ts` and said on the board's note.
   */
  const pickRow = el(doc, 'div');
  pickRow.style.cssText = `display:flex;align-items:center;gap:10px;margin-top:11px;flex-wrap:wrap`;
  const pickLabel = el(doc, 'label', undefined, COPY.driverPickLabel);
  pickLabel.htmlFor = 'everyday-rush-dispatcher';
  pickLabel.style.cssText = `font-size:12.5px;color:${C.inkSoft}`;
  const pickSelect = el(doc, 'select', 'everyday-rush-picker');
  pickSelect.id = 'everyday-rush-dispatcher';
  pickSelect.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    `background:${C.card}`,
    `color:${C.ink}`,
    'padding:6px 9px',
    `font-family:${TYPE.body}`,
    'font-size:12.5px',
    'max-width:100%',
  ].join(';');
  for (const profile of context.host.dispatchers()) {
    const option = doc.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    pickSelect.append(option);
  }
  pickRow.append(pickLabel, pickSelect);
  const pickNote = el(doc, 'p', 'everyday-rush-pick-note', COPY.driverPickNote);
  pickNote.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.inkSoft};margin:8px 0 0`;
  pickSelect.setAttribute('aria-describedby', 'everyday-rush-pick-note');
  pickNote.id = 'everyday-rush-pick-note';
  /*
   * § D1636: the two ways to bring something of your own. A rush runs the standing dispatcher and the
   * standing tower, saved ones included, so the workshop and the design floor are where a player
   * changes what this screen starts; each is one press from here and the Rush floor is one press back.
   */
  const ownRow = el(doc, 'div', 'everyday-rush-own');
  ownRow.style.cssText = 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap';
  const linkButton = (className: string, label: string, to: 'workshop' | 'designer'): HTMLButtonElement => {
    const button = el(doc, 'button', className, label);
    button.type = 'button';
    button.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.control)}px;background:${C.card};color:${C.ink};padding:8px 13px;font:600 13px ${TYPE.body};cursor:pointer;min-height:36px`;
    button.addEventListener('click', () => {
      context.go(to);
    });
    return button;
  };
  ownRow.append(
    linkButton('everyday-rush-tune', COPY.tuneLabel, 'workshop'),
    linkButton('everyday-rush-design', COPY.designLabel, 'designer'),
  );
  drivingBlock.append(pickRow, pickNote, ownRow);

  /*
   * What a rush does not run of the player's settings, under the driver it names — GitHub issue #523,
   * item 3. This screen is drawn with no rush standing (every way onto it leaves one, `shell.ts#go`),
   * so the levers, the selector, patience and the pattern read here are the player's own. The last two
   * are GitHub PR #530's review, finding 2: a rush runs a fresh session's, which `dev/state.ts#initialState`
   * seeds as no patience and the building's own pattern.
   *
   * Built once and **put into the page only when it has something to say**, because
   * {@link syncDriver} has to be able to take it away again and bring it back: one of the four
   * things it names — a dirty weight-set selector — is a fact about *which* dispatcher is standing,
   * so picking another can make an absent line appear or an present one go. Absent rather than
   * empty, because an empty paragraph is a line a reader's cursor can land on and a screen reader
   * announces as nothing at all.
   */
  /*
   * **The line to beat** — wave AS, lane AS-1, [§ D1545](../../../../DECISIONS.md) (GitHub issue #636,
   * ruling R5). The house's run on this crowd for the dispatcher standing, stated as a fact under the
   * driving line and above the choice, so the player knows the mark before the round. Absent when the
   * house has no such run, for {@link leftBehind}'s reason; redrawn by {@link syncDriver}, since it
   * names whichever dispatcher is standing.
   */
  const toBeat = el(doc, 'p', 'everyday-rush-to-beat');
  toBeat.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:9px 0 0`;
  const leftBehind = el(doc, 'p', 'everyday-rush-left-behind');
  leftBehind.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.inkSoft};margin:9px 0 0`;
  /*
   * § D672: a sitting the account has bought a fitted start for says so before it starts, and says
   * where it will be posted. Absent otherwise — there is no control here and no price, because the
   * tally in Settings is what sells it and a pitch on a mode's own screen would be a store.
   */
  /* Wave AP lane AP-D2: a device purchase is never posted, so its line says so (§ D1418). */
  const fittedLine = rushFittedLineOf(context.host);
  if (fittedLine !== undefined) {
    const fitted = el(doc, 'p', 'everyday-rush-fitted', fittedLine);
    fitted.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.inkSoft};margin:12px 0 0`;
    drivingBlock.append(fitted);
  }
  /*
   * The rebuild between rounds, said before the first round — GitHub issue #372, § D1295. Always
   * drawn, because every sitting earns a purse; the opening figure is the host's, from what the
   * account owns, and the per-wave figure is `data/rush-purse.json`'s.
   */
  const rebuildLine = el(
    doc,
    'p',
    'everyday-rush-rebuild-line',
    rushRebuildLineOf(RUSH_PURSE.unitsPerWaveOutlasted, context.host.rushOpeningPurse()),
  );
  rebuildLine.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:0 0 10px`;
  /* Behind a link: read once, and the result screen's own menu says it again where it is spent. */
  const rebuildHow = explainer(doc, { link: COPY.rebuildLink, title: COPY.rebuildLink, body: [rebuildLine] });
  const rebuildRow = el(doc, 'div');
  rebuildRow.style.cssText = 'margin:12px 0 0';
  rebuildRow.append(rebuildHow.root);
  drivingBlock.append(rebuildRow);
  /* § D478: a stream this far outside the building's band says so before it starts. */
  const disclosureLine = context.host.rushDisclosure();
  if (disclosureLine !== undefined) {
    const disclosure = el(doc, 'p', 'everyday-rush-disclosure', disclosureLine);
    disclosure.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.inkSoft};margin:12px 0 0`;
    drivingBlock.append(disclosure);
  }

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
  /*
   * The end rule in one line under the waves, with the long account one press away: how the waves
   * climb, why the rule is where it is, what a sitting is and what a further run means.
   */
  const holdLine = el(doc, 'div', 'everyday-rush-hold');
  holdLine.style.cssText = `font-size:14px;line-height:1.5;color:${C.inkSoft};margin:12px 0 0;max-width:660px`;
  const howLink = explainer(doc, {
      link: COPY.howLink,
      title: COPY.howLink,
      body: [
        COPY.howWaves,
        bandsEyebrow,
        bandsList,
        rushOpeningLine(),
        COPY.howIncidents,
        rushGeneratedRangeLine(),
        COPY.howSitting,
        COPY.howFurthest,
        COPY.drivingNote,
      ],
    }).root;
  bandsBlock.append(holdLine);

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
  /*
   * **The card** — § D1636. The wave models as buttons, the morning under them, and the end rule on
   * the card chosen. The day's card is set once a page, the first time this screen mounts with the
   * classic card standing and no sitting; after that the host keeps what the player picked.
   */
  const today = rushTodayCardOf(rushDayNumberOf(deviceNowMs()));
  if (context.host.rush() === undefined && !CARD_SET.has(context.host)) {
    CARD_SET.add(context.host);
    context.host.setRushCard(today);
  }
  const cardBlock = el(doc, 'div', 'everyday-rush-card');
  cardBlock.style.cssText = 'margin-top:24px;max-width:660px';
  const cardEyebrow = el(doc, 'div', undefined, RUSH_CARD_COPY.eyebrow);
  cardEyebrow.style.cssText = `${EYEBROW};margin-bottom:9px`;
  const modelRow = el(doc, 'div', 'everyday-rush-models');
  modelRow.setAttribute('role', 'group');
  modelRow.setAttribute('aria-label', RUSH_CARD_COPY.eyebrow);
  modelRow.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px';
  const cardName = el(doc, 'div', 'everyday-rush-card-name');
  cardName.style.cssText = `font:600 15px ${TYPE.body};color:${C.ink};margin-top:14px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap`;
  const morningRow = el(doc, 'div');
  morningRow.style.cssText = 'display:flex;gap:10px;margin-top:9px;flex-wrap:wrap';
  const morningButton = (className: string, label: string): HTMLButtonElement => {
    const button = el(doc, 'button', className, label);
    button.type = 'button';
    button.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.control)}px;background:${C.card};color:${C.ink};padding:7px 12px;font:600 12.5px ${TYPE.body};cursor:pointer;min-height:34px`;
    return button;
  };
  const todayButton = morningButton('everyday-rush-today', RUSH_CARD_COPY.today);
  const anotherButton = morningButton('everyday-rush-another', RUSH_CARD_COPY.another);
  morningRow.append(todayButton, anotherButton);
  cardBlock.append(cardEyebrow, modelRow, cardName, morningRow);
  /*
   * The owner's order of 2026-11-13 holds: your best, then who drives. § D1636 puts the crowd's card
   * after the driver and the five wave bands behind *How rush works*.
   */
  paper.append(facts, drivingBlock, cardBlock, bandsBlock);
  function syncCard(): void {
    const play = context.host.rushPlay();
    const card = context.host.rushCard();
    modelRow.replaceChildren();
    for (const choice of rushModelChoicesOf(card)) {
      const button = el(doc, 'button', 'everyday-rush-model');
      button.type = 'button';
      button.dataset['model'] = choice.id;
      button.setAttribute('aria-pressed', choice.selected ? 'true' : 'false');
      button.style.cssText = `text-align:left;border:${choice.selected ? `2px solid ${C.terracotta}` : `1px solid ${C.rule}`};border-radius:${String(R.well)}px;background:${choice.selected ? C.amberWash : C.card};color:${C.ink};padding:${choice.selected ? '9px 11px' : '10px 12px'};cursor:pointer;min-width:0`;
      const name = el(doc, 'span', undefined, choice.name);
      name.style.cssText = `display:block;font:600 14px ${TYPE.body}`;
      const blurb = el(doc, 'span', undefined, choice.blurb);
      blurb.style.cssText = `display:block;font-size:12.5px;line-height:1.4;color:${C.inkSoft};margin-top:3px`;
      button.append(name, blurb);
      button.addEventListener('click', () => {
        context.host.setRushCard({ model: choice.id, roll: choice.id === 'climb' ? 0 : Math.max(1, context.host.rushCard().roll || today.roll) });
        syncCard();
        syncDriver();
        modelRow.querySelector<HTMLButtonElement>(`[data-model="${choice.id}"]`)?.focus();
      });
      modelRow.append(button);
    }
    cardName.replaceChildren();
    holdLine.replaceChildren();
    if (play === undefined) return;
    const view = rushCardViewOf(play, today);
    const tag = el(doc, 'span', 'everyday-rush-card-tag', view.tag);
    tag.style.cssText = `font:500 11px ${TYPE.mono};color:${C.warmGrey}`;
    cardName.append(el(doc, 'span', undefined, view.name), tag);
    /* The climb is one morning by definition: it is the card the house rows were measured on. */
    anotherButton.disabled = !play.model.incidents;
    anotherButton.style.opacity = play.model.incidents ? '1' : '.5';
    for (const line of view.lines) {
      const row = el(doc, 'div', 'everyday-rush-card-line', line);
      holdLine.append(row);
    }
    holdLine.append(howLink);
  }
  todayButton.addEventListener('click', () => {
    context.host.setRushCard(today);
    syncCard();
    syncDriver();
  });
  anotherButton.addEventListener('click', () => {
    context.host.setRushCard(rushNextMorningOf(context.host.rushCard()));
    syncCard();
    syncDriver();
  });

  const ink = el(doc, 'div', 'everyday-rush-aside');
  ink.style.cssText = `background:${C.ink};color:${C.paper};padding:30px 26px;display:flex;flex-direction:column;min-width:0`;

  const bestsBlock = el(doc, 'div');
  const bestsEyebrow = el(doc, 'div', undefined, COPY.bestsEyebrow);
  bestsEyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};margin-bottom:11px`;
  bestsBlock.append(bestsEyebrow);
  /*
   * **The house's runs on the building the player is standing on** — GitHub issue #418, § D547.
   *
   * These rows were the handoff's five fixtures under a marker saying so (#293, § D376). They are now
   * `everyday/rushHouse.ts#rushStandingsOf`: one measured run per shipped dispatcher on this building,
   * on the rush's one seed, each tagged `house`. The note goes above the rows for § D376's reason,
   * which survives the change of subject: a reader who has already read the names has formed the
   * belief the note is there to correct. Note and rows come out of one view, so this module cannot
   * draw either without the other.
   *
   * A building the house never ran — anything drawn in the designer — and a table measured on a
   * different climb both draw the view's refusal in the rows' place, never another tower's rows.
   *
   * **The body is rebuilt by {@link syncDriver} rather than drawn once** — GitHub issue #565, § D858.
   * One row carries {@link RushHouseRowView.standingTag}, and which row that is moves when the
   * picker below moves, so a table drawn once would tag the dispatcher the player arrived with for
   * the rest of the sitting. It is the only thing on this screen a control changes.
   */
  const standingsBody = el(doc, 'div');
  bestsBlock.append(standingsBody);
  ink.append(bestsBlock);
  /*
   * **The player's own best posted sitting, among the house's rows** — swarm DQ's Q3 supporting
   * payoff, [§ D1359](../../../../DECISIONS.md). Asked of the server once per mount, for the building
   * standing at the mount, and drawn by {@link syncDriver} when it answers; until then, and on a build
   * with no server, nothing is said. `alive` is the mount's own, so an answer landing after the
   * player has left draws nothing.
   */
  let posted: RushPostedStandings = { kind: 'silent' };
  /*
   * § D1420: on a build with no server, this device's kept sitting, replayed off this thread once per
   * mount and drawn by {@link syncDriver} when the replay lands. Nothing is said until it does.
   */
  let device: RushDeviceStanding = { kind: 'silent' };
  let alive = true;
  const askedFor = context.host.selection().buildingId;


  /**
   * Everything on this screen that depends on **who is standing**, re-read from the host.
   *
   * Called once at mount and again after each press, so nothing here composes state: the picker
   * writes through `setDispatcher` and this reads the answer back, which is the arrangement that
   * keeps the drawn name a fact about the state rather than about the last press. This mount takes
   * no host subscription (see the file docstring) and does not need one — the only writer of
   * `dispatcherId` reachable while this screen holds the page is the select two blocks up, and the
   * shell redraws the screen on the way back from the Engineer world.
   */
  function syncDriver(): void {
    const selection = context.host.selection();
    const driver = context.host.dispatcherById(selection.dispatcherId);
    driving.textContent = rushDrivingLine(driver?.name ?? selection.dispatcherId);
    pickSelect.value = selection.dispatcherId;
    const toBeatLine = rushHouseToBeatLineOf({
      buildingId: selection.buildingId,
      dispatcherId: selection.dispatcherId,
      dispatcherName: driver?.name ?? selection.dispatcherId,
    });
    const play = context.host.rushPlay();
    const onHouseCard = play === undefined || rushPlayIsHouseCard(play);
    if (toBeatLine === undefined || !onHouseCard) {
      toBeat.remove();
    } else {
      toBeat.textContent = toBeatLine;
      drivingBlock.insertBefore(toBeat, pickRow);
    }
    const leftBehindLine = rushLeftBehindLine(context.host.groupLevers(), {
      switching:
        driver !== undefined && specIsDirty(context.host.selectorSpec(), driver, context.host.selectorContext()),
      patience: context.host.patience() !== null,
      pattern: selection.pattern !== 'building',
    });
    if (leftBehindLine === undefined) {
      leftBehind.remove();
    } else {
      leftBehind.textContent = leftBehindLine;
      pickNote.after(leftBehind);
    }

    const standings = rushStandingsOf(
      selection.buildingId,
      (id) => context.host.dispatcherById(id)?.name,
      undefined,
      selection.dispatcherId,
      selection.buildingId === askedFor ? posted : { kind: 'silent' },
      selection.buildingId === askedFor ? device : { kind: 'silent' },
    );
    standingsBody.replaceChildren();
    if (standings.kind === 'withheld') {
      const refusal = el(doc, 'p', 'everyday-rush-house-refusal', standings.refusal);
      refusal.style.cssText = `font-size:11.5px;line-height:1.5;color:${C.label};margin:0;text-wrap:pretty`;
      standingsBody.append(refusal);
      return;
    }
    /* The caption above the rows, and the long account of what they are behind its link. */
    /* § D1636: off the house's card the caption is the line that says so, and the note's own claim about *the same waves* is not drawn. */
    const houseNote = el(doc, 'div', 'everyday-rush-house-note', `${onHouseCard || play === undefined ? standings.note : RUSH_CARD_COPY.houseElsewhere(play.model.name)} `);
    houseNote.style.cssText = `font-size:11.5px;line-height:1.5;color:${C.label};margin:0 0 11px;text-wrap:pretty`;
    const houseAbout = explainer(doc, {
      link: RUSH_HOUSE_COPY.aboutLink,
      title: RUSH_HOUSE_COPY.aboutLink,
      body: [RUSH_HOUSE_COPY.aboutRuns, RUSH_HOUSE_COPY.aboutOrder, RUSH_HOUSE_COPY.aboutStart, RUSH_HOUSE_COPY.aboutHandover],
    });
    houseAbout.link.style.color = C.sun;
    houseNote.append(houseAbout.root);
    const bestsList = el(doc, 'div', 'everyday-rush-bests');
    bestsList.style.cssText = 'display:grid;gap:5px';
    const yoursBefore = (index: number): void => {
      for (const yours of standings.yours.filter((row) => row.before === index)) bestsList.append(yoursRow(yours));
    };
    for (const [index, standing] of standings.rows.entries()) {
      yoursBefore(index);
      const row = el(doc, 'div', 'everyday-rush-best');
      row.style.cssText = `display:flex;align-items:baseline;gap:10px;padding:6px 11px;border-radius:${String(R.row)}px;background:${standing.heldThrough ? '#2A2620' : RAIL_SURFACE.card}`;
      const left = el(doc, 'span');
      left.style.cssText = 'min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap';
      const name = el(doc, 'span', undefined, standing.name);
      name.style.cssText = 'font-size:12.5px;font-weight:600;min-width:0';
      const tag = el(doc, 'span', 'everyday-rush-best-house', standing.tag);
      tag.style.cssText = `flex:none;font:600 9.5px ${TYPE.mono};letter-spacing:.12em;text-transform:uppercase;color:${C.label};border:1px solid ${INK_RULE};border-radius:${String(R.row)}px;padding:0 5px`;
      left.append(name, tag);
      if (standing.standingTag !== undefined) {
        const mine = el(doc, 'span', 'everyday-rush-best-standing', standing.standingTag);
        mine.style.cssText = `flex:none;font:600 9.5px ${TYPE.mono};letter-spacing:.12em;text-transform:uppercase;color:${C.sun};border:1px solid ${C.sun};border-radius:${String(R.row)}px;padding:0 5px`;
        left.append(mine);
      }
      const right = el(doc, 'span');
      right.style.cssText = 'margin-left:auto;text-align:right;flex:none';
      const wave = el(doc, 'span', undefined, standing.wave);
      wave.style.cssText = `display:block;font:500 12.5px ${TYPE.mono};color:${C.sun}`;
      const held = el(doc, 'span', undefined, standing.held);
      held.style.cssText = `display:block;font:500 11px ${TYPE.mono};color:${C.label};margin-top:1px`;
      right.append(wave, held);
      row.append(left, right);
      bestsList.append(row);
    }
    yoursBefore(standings.rows.length);
    standingsBody.append(houseNote, bestsList);
    if (standings.yoursLine !== undefined) {
      const line = el(doc, 'p', 'everyday-rush-yours-note', standings.yoursLine);
      line.style.cssText = `font-size:11.5px;line-height:1.5;color:${C.label};margin:11px 0 0;text-wrap:pretty`;
      standingsBody.append(line);
    }
  }

  /** One of the player's own rows, in the house rows' columns, tagged in words rather than colour alone. */
  function yoursRow(yours: RushYoursRowView): HTMLElement {
    const row = el(doc, 'div', 'everyday-rush-best everyday-rush-best-yours');
    row.style.cssText = `display:flex;align-items:baseline;gap:10px;padding:6px 11px;border-radius:${String(R.row)}px;background:${RAIL_SURFACE.card};border:1px solid ${C.sun}`;
    const left = el(doc, 'span');
    left.style.cssText = 'min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap';
    const name = el(doc, 'span', undefined, yours.name);
    name.style.cssText = 'font-size:12.5px;font-weight:600;min-width:0';
    const tag = el(doc, 'span', 'everyday-rush-best-yours-tag', yours.tag);
    tag.style.cssText = `flex:none;font:600 9.5px ${TYPE.mono};letter-spacing:.12em;text-transform:uppercase;color:${C.sun};border:1px solid ${C.sun};border-radius:${String(R.row)}px;padding:0 5px`;
    const detail = el(doc, 'span', 'everyday-rush-best-yours-detail', yours.detail);
    detail.style.cssText = `font-size:11px;color:${C.label};min-width:0`;
    left.append(name, tag, detail);
    const right = el(doc, 'span');
    right.style.cssText = 'margin-left:auto;text-align:right;flex:none';
    const wave = el(doc, 'span', undefined, yours.wave);
    wave.style.cssText = `display:block;font:500 12.5px ${TYPE.mono};color:${C.sun}`;
    const held = el(doc, 'span', undefined, yours.held);
    held.style.cssText = `display:block;font:500 11px ${TYPE.mono};color:${C.label};margin-top:1px`;
    right.append(wave, held);
    row.append(left, right);
    return row;
  }

  pickSelect.addEventListener('change', () => {
    context.host.setDispatcher(pickSelect.value);
    syncDriver();
  });
  syncDriver();
  syncCard();
  void context.host.rushPosted(askedFor).then(
    (answer) => {
      if (!alive) return;
      posted = answer;
      syncDriver();
    },
    () => {
      if (!alive) return;
      posted = { kind: 'unreachable' };
      syncDriver();
    },
  );
  /* § D1515: the device's furthest round on this tower, replayed off this thread. */
  void context.host.rushFurthest(context.host.selection().buildingId).then(
    (answer) => {
      if (!alive) return;
      furthest = answer;
      drawFacts();
    },
    () => {
      if (!alive) return;
      furthest = { kind: 'none' };
      drawFacts();
    },
  );
  /* § D1420: the device's kept sitting, replayed off this thread; `silent` on a build with a board. */
  void context.host.rushDeviceBest(askedFor).then((answer) => {
    if (!alive) return;
    device = answer;
    syncDriver();
  });

  root.append(paper, ink);
  sideBySide(root, { fixed: ink, fluid: paper, fixedPx: RUSH_ASIDE_PX, gapPx: 0, fluidMinPx: RUSH_PAPER_MIN_PX });
  /* The ink column runs the paper's full height beside it, and the screen's full width under it. */
  root.style.alignItems = 'stretch';
  ink.style.flexGrow = '1';

  host.append(root);

  /*
   * **The worked answer is not mounted here any more** — § D1636, the owner's direction of 2026-11-13:
   * this screen showed a fix and offered no way to make it. § D529 clause 2's reuse is withdrawn, and
   * the tutorial keeps the component.
   */

  return {
    unmount: () => {
      alive = false;
    },
    /*
     * § 9.1's *Start the rush* — GitHub issue #220. The run first, the context second, the brief's
     * own order: a stage entered before a run was asked for would be a stage with nothing to play.
     */
    primary: () => {
      if (context.host.startRush() === undefined) context.enterRush();
    },
  };
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
