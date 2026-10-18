/**
 * **GAMEPLAY § 8's three campaign screens** — the DOM half of a pure/DOM split whose every word,
 * figure and refusal is decided in `everyday/campaignModel.ts` over `campaign/economy.ts`.
 *
 * ## One file, three registry rows
 *
 * `towers`, `building` and `contract` are one flow: the triage list opens a desk, the desk opens a
 * contract sheet, and all three redraw from the same career the moment any of them writes it. They
 * share the section chrome, the § 19 token styles, the select control and the redraw wiring, so
 * they are one module with three {@link EverydayScreenModule} exports rather than three files
 * duplicating a hundred lines of geometry. It also keeps this lane's edit to `boundaries.test.ts`
 * and `honesty/derive.test.ts` to one line each, which matters while four screen lanes are open on
 * the same two files.
 *
 * ## Nothing here decides anything
 *
 * Every string this file draws arrives from `campaignModel.ts`; every press hands an action to
 * `host.campaignAct` and redraws. The one exception is geometry, which is what a DOM half is for.
 * A control this file draws is enabled exactly when the model says the underlying state is
 * pressable — § 16 rule 6's *visible, dimmed and inert*, and the reducer refuses the same press a
 * second time behind it.
 *
 * ## The standing order reaches the run, and that is the point of the lane
 *
 * The two selects on the triage row and the one on the desk write the tower's `dispatcherId`, and
 * {@link EverydayHost.runCampaignDay} builds the next run from **that** id and that tower's
 * building. So moving the select changes the legs of the day, not a label — which is the standing
 * requirement this repository keeps paying to relearn, applied to the control rather than after it.
 */

import { actionBarFor, type ActionBarModel } from './actionBar.js';
import type { EverydayHost } from './host.js';
import {
  buildingView,
  CONTRACT_COPY,
  contractView,
  towersView,
  type BuildingFacts,
  type BuildingView,
  type CampaignInput,
  type CampaignTestRow,
  type ContractView,
  type DispatcherChoice,
  type StandingOrderView,
  type TowersView,
} from './campaignModel.js';
import type { EverydayScreenContext, EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';
import {
  contractLostSentenceOf,
  needOf,
  openTowerOf,
  type BuildId,
  type CampaignTower,
} from '../campaign/career.js';
import { parseBuilding, resolveBuilding } from '@elevator-sim/core/browser';
import { worksHeldCarRefsOf } from '../campaign/works.js';
import { drawElevation } from './elevation.js';
import type { DifficultyId, ShopCategoryId } from '../campaign/economy.js';
import { observationsAt } from '../live/observations.js';
import type { WaitBandBasis } from '../live/types.js';
import { shiftIsOver } from '../dev/leftRail.js';
import type { GoalObservations } from '../shift/types.js';
import { queueAt } from '../frame/overlay.js';
import { systemClock } from '../playback/clock.js';
import { drawCutaway, sizeCanvas } from './cutaway.js';
import { stageGeometryOf } from './stageScreenModel.js';
import { towerLoopOf, type TowerLoop } from './towerLoop.js';
import {
  DAY_CENSUS_CONTRACT_IDS,
  DAY_CENSUS_COPY,
  dayCensusAllClear,
  censusVerdictOf,
  type CareerDayCensus,
  type CareerIntroView,
  type CensusVerdict,
  type FiledDayRecord,
  type TowerCardView,
} from './campaignModel.js';
import { createOffThreadRunner } from '../dev/offThreadRuns.js';

/* -------------------------------------------------------------------------- *
 * Module store — the two facts a `bar()` needs and a mount cannot pass it
 * -------------------------------------------------------------------------- */

/**
 * The host the mounted campaign screen is reading, and the option the desk has picked.
 *
 * Module-level for `fixitScreen.ts`'s reason: `EverydayScreenModule.bar` is handed the shell's
 * state and nothing else, so a refinement that needs the screen's own state has to find it here.
 * Both are cleared on unmount, so a bar drawn after the screen has gone falls back to the table's
 * own row rather than to a stale one.
 */
let liveHost: EverydayHost | undefined;
let pickedOption: string | undefined;

/* -------------------------------------------------------------------------- *
 * Chrome
 * -------------------------------------------------------------------------- */

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
const MONO = `font:500 12px ${TYPE.mono}`;
const CARD = `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card}`;

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

function eyebrow(doc: Document, text: string, margin = '26px 0 10px'): HTMLElement {
  const node = el(doc, 'div', undefined, text);
  node.style.cssText = `${EYEBROW};margin:${margin}`;
  return node;
}

function note(doc: Document, text: string, className?: string): HTMLElement {
  const node = el(doc, 'p', className, text);
  node.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:6px 0 0;max-width:74ch;text-wrap:pretty`;
  return node;
}

/**
 * A `<select>` over labelled options, with the current value selected.
 *
 * `name` is the control's accessible name and is required rather than optional — WCAG SC 4.1.2,
 * axe's `select-name` rule, found by `accessibilitySweep.browser.test.ts`. Both call sites draw
 * their heading as a sibling `<div>` in the wrapper above, which names nothing: a non-visual reader
 * met two anonymous combo boxes on the Career and building screens, on the pair of controls
 * § D427 makes reach the run. Making the parameter required is the half that stops the next
 * `select` arriving without one.
 */
function select(
  doc: Document,
  className: string,
  name: string,
  options: readonly { readonly value: string; readonly label: string }[],
  value: string,
  onPick: (next: string) => void,
): HTMLSelectElement {
  const node = el(doc, 'select', className);
  node.setAttribute('aria-label', name);
  node.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    `background:${C.paper}`,
    `color:${C.ink}`,
    'padding:5px 7px',
    `font-family:${TYPE.body}`,
    'font-size:12.5px',
    'max-width:100%',
  ].join(';');
  for (const option of options) {
    const item = el(doc, 'option', undefined, option.label);
    item.value = option.value;
    node.append(item);
  }
  node.value = value;
  node.addEventListener('change', () => {
    onPick(node.value);
  });
  return node;
}

function button(
  doc: Document,
  className: string,
  label: string,
  enabled: boolean,
  onPress: () => void,
): HTMLButtonElement {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.disabled = !enabled;
  node.style.cssText = [
    `border:1px solid ${enabled ? C.ink : C.rule}`,
    `border-radius:${String(R.control)}px`,
    `background:${enabled ? C.card : C.cardSunk}`,
    `color:${enabled ? C.ink : C.faint}`,
    'padding:6px 12px',
    `font-family:${TYPE.body}`,
    'font-size:12.5px',
    'font-weight:600',
    `cursor:${enabled ? 'pointer' : 'not-allowed'}`,
  ].join(';');
  if (enabled) node.addEventListener('click', onPress);
  return node;
}

/* -------------------------------------------------------------------------- *
 * The input every screen is drawn from
 * -------------------------------------------------------------------------- */

/**
 * Gather the one record the three screens read — § 16 rule 14, assembled in exactly one place.
 *
 * The observations are today's at the playhead, taken the same way `host.goalsToday` takes them, so
 * the campaign's four tests and the Engineer rail's four goals are two readings of one fold rather
 * than two folds.
 */
export function campaignInputOf(host: EverydayHost): CampaignInput {
  const buildings = new Map<string, BuildingFacts>();
  const career = host.campaign();
  for (const id of host.buildingIds()) {
    const config = host.buildingById(id);
    if (config === undefined) continue;
    /*
     * § D1377: a building the career holds is described on the day its tower stands at, grown and
     * fitted as the day's run builds it; any other building as its contract hands it over.
     */
    const held = career.towers.find((tower) => tower.buildingId === id);
    buildings.set(id, {
      name: config.name,
      spec: (held === undefined ? undefined : host.careerTowerSpecLine?.(held.id)) ?? host.buildingSpecLine(id),
      startTimeFloors: host.buildingStartTimeFloors(id),
      shafts: host.buildingShafts(id),
      shape: host.buildingShape?.(id),
    });
  }
  const run = host.runState();
  /*
   * **Only a career day's run is graded here** — GitHub issue #594. The desk folded whatever
   * recording stood on the host, so a rush the player had just left read *1 of 4 holding* on a
   * tower with no career day run, with ✓ and × marks against a stream no contract asked for. The
   * readings are the latched career day's, for the tower the desk is drawing, once its own run
   * has landed; anything else is *nothing run yet today*, which is true.
   */
  const careerDay = host.campaignDay();
  const graded =
    run.hasRun && careerDay !== undefined && careerDay.tower.id === career.openTowerId && !host.runPending();
  return {
    career,
    schedule: host.priceSchedule(),
    careerNotice: host.careerNotice(),
    buildings,
    dispatchers: host.dispatchers().map(
      (profile): DispatcherChoice => ({
        id: profile.id,
        name: profile.name,
        /*
         * § 8.2 asks for *"the style's one-line trade printed beneath the picker"*, and **no such
         * field ships**: `DispatcherProfile` carries an id, a name and a weight vector, and
         * `data/dispatcher-profiles.json`'s `role` is an engine word (`baseline`) that § 16 rule 11
         * forbids on a Casual surface outright. So the trade is `undefined` here and
         * `campaignModel.ts` says so in the picker's own note rather than printing a weight vector
         * or inventing a sentence about what a dispatcher does.
         */
        note: undefined,
        saved: host.savedDispatchers().some((entry) => entry.id === profile.id),
      }),
    ),
    observations: graded ? observationsOfHost(host) : undefined,
    /*
     * **The playhead the fold above was taken at, classified** — [§ D557](../../../../DECISIONS.md).
     *
     * This desk is a mid-run surface: `observationsOfHost` folds at `runState().playheadS`, so
     * before the day ends the abandoned cohort's fate is not decided and
     * `shift/goals.ts#gaveUpBesideOf` may not state it. `shiftIsOver` is the one home for the
     * comparison — `dev/leftRail.ts` exports it so a second surface cannot compute `t >= endedAt`
     * its own way — and with no recording there is no shift to be over.
     */
    observationsBasis: observationsBasisOf(host),
    /*
     * The career's own days — GitHub issue #594. `week()` is the Scenario week, and its Monday was
     * standing in as *yesterday* on a career contract.
     */
    history:
      career.openTowerId === undefined
        ? []
        : (host.campaignHistory?.(career.openTowerId) ?? host.week().history),
    /* The tower cards' filed days — GitHub issue #536, § D1301. Read only; nothing here writes. */
    filedDays: host.campaignFiledDays?.(),
    /* The desk's census of the day's own crowd — GitHub issue #571, § D1301. */
    dayCensus: dayCensusOf(host),
  };
}

/* -------------------------------------------------------------------------- *
 * The desk's census of the day's own crowd — GitHub issue #571, § D1301
 * -------------------------------------------------------------------------- */

/**
 * The census runner — module scope so its worker stays warm across visits, and lazy so importing
 * this module starts nothing. `everyday/landingScreen.ts`'s pattern: the shell hands a screen no
 * worker, and thirteen runs of a day do not belong on the thread that paints.
 */
const censusRunner = createOffThreadRunner({
  spawn: () => new Worker(new URL('../dev/shiftWorker.ts', import.meta.url), { type: 'module' }),
});
/** The last census that landed, under the key of the day it was taken on. */
let censusLanded: { readonly key: string; readonly census: CareerDayCensus } | undefined;
/** The key last asked for, so a redraw does not ask twice for the same day. */
let censusAsked: string | undefined;

/** The open tower, when its contract takes a census at all — {@link DAY_CENSUS_CONTRACT_IDS}. */
function censusTowerOf(host: EverydayHost): CampaignTower | undefined {
  const tower = openTowerOf(host.campaign());
  if (tower === undefined || !DAY_CENSUS_CONTRACT_IDS.includes(tower.id)) return undefined;
  return tower;
}

/** The landed census, only while it is still of the day the desk is on. */
function dayCensusOf(host: EverydayHost): CareerDayCensus | undefined {
  const tower = censusTowerOf(host);
  if (tower === undefined || censusLanded === undefined) return undefined;
  const plan = host.careerDayCensusRuns?.(tower.id);
  return plan !== undefined && plan.key === censusLanded.key ? censusLanded.census : undefined;
}

/**
 * **Whether the career day on the stage is one the desk's census marks quiet** — wave AS, lane
 * AS-4, GitHub issue #637 item 6, [§ D1572](../../../../DECISIONS.md). The same landed census and
 * the same reading ({@link dayCensusAllClear}) the desk's *Watch a day here* uses, for the tower the
 * stage latched; `false` with no career day, no census yet, or a census of another day, which is
 * the honest default: nothing measured, nothing offered. Its one non-test caller is
 * `everyday/stageScreen.ts#syncTransport`, for the paused start's *Skip to the end*.
 */
export function quietCareerDayOf(host: EverydayHost): boolean {
  const careerDay = host.campaignDay();
  if (careerDay === undefined) return false;
  return dayCensusAllClear(
    dayCensusOf(host),
    careerDay.tower,
    host.dispatchers().map((profile) => profile.id),
  );
}

/**
 * Take the census of the open tower's next day, once per day it could be, off the main thread.
 * A run that fails draws no line, which is the honest default: nothing measured, nothing said.
 */
function askForCensus(host: EverydayHost, redraw: () => void): void {
  const tower = censusTowerOf(host);
  if (tower === undefined) return;
  const plan = host.careerDayCensusRuns?.(tower.id);
  if (plan === undefined || plan.key === censusLanded?.key || plan.key === censusAsked) return;
  censusAsked = plan.key;
  const runs = plan.runs();
  const [first, ...rest] = runs.map((run) => ({
    config: run.config,
    outOfServiceCarIds: run.outOfServiceCarIds,
    recordDecisions: false,
  }));
  if (first === undefined) return;
  censusRunner.start({
    runs: [first, ...rest],
    onDone: (recordings) => {
      const verdicts = new Map<string, CensusVerdict>();
      runs.forEach((run, index) => {
        const recording = recordings[index];
        if (recording !== undefined) verdicts.set(run.dispatcherId, censusVerdictOf(tower, recording));
      });
      censusLanded = { key: plan.key, census: { towerId: tower.id, towerDay: plan.towerDay, verdicts } };
      redraw();
    },
    onFailed: () => {
      /* Nothing measured, so nothing said; the next day asks again. */
    },
  });
}

/** {@link campaignInputOf}'s basis, through the rail's own `shiftIsOver` rather than a second `>=`. */
function observationsBasisOf(host: EverydayHost): WaitBandBasis {
  const recording = host.recording();
  if (recording === undefined) return 'now';
  return shiftIsOver(recording, host.runState().playheadS) ? 'whole-run' : 'now';
}

/**
 * Today's fold at the playhead, or `undefined` when the recording cannot be read.
 *
 * Kept beside {@link campaignInputOf} rather than on the host: the host already exposes
 * `goalsToday()` for the daily loop's own four goals, and the campaign needs the **inputs** rather
 * than those readings, because its bars are the difficulty's rather than the day's.
 */
function observationsOfHost(host: EverydayHost): CampaignInput['observations'] {
  const readings = host.goalsToday();
  /*
   * `goalsToday` folds the recording and grades it; what is needed here is the fold. Rather than
   * a second seam on the host, the readings' own observed values are re-assembled — every field a
   * campaign test reads is one of them, and a reading that is `pending` contributes `null`, which
   * is what keeps the wake-up gate's answer intact rather than replacing it with a zero.
   */
  const valueOf = (reads: string): number | null =>
    readings.find((reading) => reading.goal.reads === reads)?.observed ?? null;
  const minutePct = valueOf('minutePct');
  const peakQueue = valueOf('peakQueue');
  const worstWaitS = valueOf('worstWaitS');
  if (minutePct === null || peakQueue === null || worstWaitS === null) return undefined;
  return {
    carryPct: valueOf('carryPct') ?? 0,
    minutePct,
    peakQueue,
    worstWaitS,
    worstWaitIsCensored: false,
    ...gaveUpOfHost(host),
    ...tripsOfHost(host),
  };
}

/**
 * The arrival count and the three abandonment facts, from the **fold** rather than from a reading —
 * GitHub issue #456.
 *
 * ## Why they cannot come from the reassembly above
 *
 * The reassembly recovers each field from the daily loop's own readings, and **no goal in
 * `shift/goals.ts#goalsForDay` reads `abandoned`** — the odd-day horizon goal that once did was
 * retired when the worst-wait ceiling subsumed it. So `valueOf('abandoned')` was `null` on every
 * day of every run, and its `?? 0` handed the campaign desk a **fabricated zero**: four tests
 * graded on a screen that reported nobody had been left standing, whatever the day did. That is
 * the shape this file already refuses one field over — see {@link tripsOfHost}'s last paragraph —
 * arriving through a fallback rather than through a type.
 *
 * `abandonedCarried` and `horizonS` are here for the same reason and one more: they are not
 * gradeable at all, so no reading could ever carry them, and § D417 binds every surface that
 * publishes `abandoned` to publish both beside it.
 *
 * The playhead is the host's own, the instant `goalsToday()` was folded at, so the rows on a desk
 * stay four facts about one moment. **And that is why this desk needs a basis** —
 * [§ D557](../../../../DECISIONS.md), GitHub issue #537: `abandonedCarried` folded at a playhead
 * counts only the riders a car has reached so far, so before the day ends `gaveUpBesideOf`
 * withholds the caption rather than stating a fate nothing has decided. `CampaignInput`'s
 * `observationsBasis` carries the answer.
 */
function gaveUpOfHost(
  host: EverydayHost,
): Pick<GoalObservations, 'arrived' | 'abandoned' | 'abandonedCarried' | 'horizonS'> {
  const facts = host.goalFactsAt(host.runState().playheadS);
  return {
    /*
     * **And `arrived`, which retires a sentinel** — this field read
     * `Number.POSITIVE_INFINITY` until #456. That was a stand-in for a number the reassembly could
     * not recover (no goal reads the arrival count; it is the wake-up **gate**, not a bar), chosen
     * so `readGoal` would grade the four campaign tests rather than refuse them. It worked for as
     * long as nothing *printed* the field — and `gaveUpBesideOf` prints it, because R13 says a
     * count travels with the population it was taken over, so the desk would have read
     * `34 of Infinity waited past the horizon`.
     *
     * **Replacing it changes no verdict, and the early return four lines up is why.** That guard
     * refuses unless the daily loop's `minutePct` and `peakQueue` readings both carry a value, and
     * those two are `pending` under exactly one condition — `arrived < WAKE_UP_ARRIVALS`. So on
     * every path that reaches here the gate has already been passed by the same fold, and the true
     * count answers it the same way the sentinel did. What the sentinel bought was a number nobody
     * had; the fold has one.
     */
    arrived: facts.arrived,
    abandoned: facts.abandoned,
    abandonedCarried: facts.abandonedCarried,
    horizonS: facts.horizonS,
  };
}

/**
 * The day's loaded car departures at the playhead, for § 8.6's fourth test.
 *
 * **Read from the recording rather than from a reading**, because there is no reading to read: the
 * reassembly above recovers each field from the daily loop's own four goals, and no goal in
 * `shift/goals.ts#goalsForDay` reads `loadedDepartures` — the trip budget is the campaign's bar and
 * the daily loop does not ask it. So this is the one field that has to come from the fold directly.
 *
 * The playhead is the host's own (`runState().playheadS`), which is the instant `goalsToday()` was
 * folded at, so the four rows on a desk are four facts about one moment.
 *
 * Spread as a fragment rather than assigned, so the absent case travels as *absent*: a recording
 * carrying no travel record must leave the field off and let `readGoal` refuse, and writing
 * `loadedDepartures: undefined` under `exactOptionalPropertyTypes` is a different thing from not
 * writing it.
 */
function tripsOfHost(host: EverydayHost): { readonly loadedDepartures?: number } {
  const recording = host.recording();
  if (recording === undefined) return {};
  const live = observationsAt(recording, host.runState().playheadS);
  return live.loadedDepartures === undefined ? {} : { loadedDepartures: live.loadedDepartures };
}

/* -------------------------------------------------------------------------- *
 * Shared pieces
 * -------------------------------------------------------------------------- */

/** The two standing-order selects and the picked style's one-line trade. */
function standingOrderControls(
  doc: Document,
  host: EverydayHost,
  towerId: string,
  view: StandingOrderView,
  redraw: () => void,
): HTMLElement {
  const wrap = el(doc, 'div', 'everyday-campaign-order');
  wrap.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.tight)}px`;
  const dispatcher = select(
    doc,
    'everyday-campaign-dispatcher',
    'Standing order: dispatcher',
    view.dispatchers.map((entry) => ({
      value: entry.id,
      label: entry.saved ? `${entry.name} — yours` : entry.name,
    })),
    view.dispatcherId,
    (next) => {
      host.campaignAct({ kind: 'set-dispatcher', towerId, dispatcherId: next });
      redraw();
    },
  );
  const build = select(
    doc,
    'everyday-campaign-build',
    'Standing order: what to buy',
    view.builds.map((entry) => ({ value: entry.id, label: entry.label })),
    view.buildId,
    (next) => {
      host.campaignAct({ kind: 'set-build', towerId, buildId: next as BuildId });
      redraw();
    },
  );
  /*
   * The refusal rides under the build select and not under the pair — GitHub issue #313. Both
   * controls sit in this wrapper and only one of them is inert on the day, so a note under the group
   * would read as *neither of these does anything*, which is the opposite defect.
   */
  const buildNote = el(doc, 'div', 'everyday-campaign-build-note', view.buildNote);
  buildNote.style.cssText = `font-size:12px;color:${C.label};max-width:74ch`;
  wrap.append(dispatcher, build, buildNote);
  return wrap;
}

/** The four daily tests, § 7's *was* column beside each. */
function testRows(doc: Document, rows: readonly CampaignTestRow[]): HTMLElement {
  const list = el(doc, 'div', 'everyday-campaign-tests');
  list.style.cssText = `display:grid;gap:${String(GAP.row)}px`;
  for (const row of rows) {
    const item = el(doc, 'div', 'everyday-campaign-test');
    item.style.cssText = `${CARD};padding:11px 14px;background:${C.cardSunk}`;
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap';
    const glyph = el(doc, 'span', undefined, row.reading?.glyph ?? '·');
    glyph.style.cssText = `${MONO};color:${
      row.reading?.state === 'met' ? C.moss : row.reading?.state === 'missed' ? C.alarm : C.faint
    }`;
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:13.5px;font-weight:600;flex:1 1 auto';
    const target = el(doc, 'span', undefined, row.target);
    target.style.cssText = `${MONO};color:${C.ink}`;
    const was = el(doc, 'span', 'everyday-campaign-was', `was ${row.was}`);
    was.style.cssText = `${MONO};color:${C.label}`;
    head.append(glyph, label, target, was);
    /*
     * The riders who were left standing — § D106 at the renderer, GitHub issue #456.
     *
     * Above the tension rather than inside the head row, in the label ink the tension uses, because
     * it is an observation about the day and the head row is the verdict. Two of these four tests
     * carry one and two never will; `campaignModel.ts#campaignTestRows` decides which and this only
     * draws what it is handed.
     */
    /*
     * No refusal arm any more — GitHub issue #169. The fourth row used to carry a sentence saying
     * nothing measured it, drawn here in terracotta under the tension; it grades now, so the
     * sentence is gone rather than reworded (`campaignModel.ts#campaignTestGoals`). A row that
     * cannot be graded on some particular day says so through `row.reading`, which is what the
     * glyph and the `—` above already draw.
     */
    item.append(head);
    if (row.beside !== '') item.append(note(doc, row.beside, 'everyday-campaign-beside'));
    item.append(note(doc, row.tension));
    list.append(item);
  }
  return list;
}

/* -------------------------------------------------------------------------- *
 * The career's front page — GitHub issue #536's permitted half, § D1301
 * -------------------------------------------------------------------------- */

/** The fresh career's intro, every word `campaignModel.ts#CAREER_INTRO_COPY`'s. */
function introBlock(doc: Document, intro: CareerIntroView): HTMLElement {
  const block = el(doc, 'section', 'everyday-towers-intro');
  block.style.cssText = `${CARD};padding:16px 18px;margin-top:18px;max-width:80ch;background:${C.cardSunk}`;
  block.append(eyebrow(doc, intro.heading, '0 0 8px'));
  for (const text of intro.paragraphs) {
    const para = el(doc, 'p', 'everyday-towers-intro-para', text);
    para.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:0 0 8px;text-wrap:pretty`;
    block.append(para);
  }
  block.append(eyebrow(doc, intro.chimesHeading, '12px 0 8px'));
  for (const text of intro.chimes) {
    const para = el(doc, 'p', 'everyday-towers-intro-chimes', text);
    para.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:0 0 8px;text-wrap:pretty`;
    block.append(para);
  }
  return block;
}

/**
 * One tower card. The colour is a `var(--band-N)` token from `live/bands.ts#WAIT_BANDS`, written
 * into CSS only — `render/tokens.ts` is what a canvas reads — and the status sentence beside it says
 * the same thing in words, so colour is never the only signal.
 */
function towerCard(
  doc: Document,
  card: TowerCardView,
  onOpen: () => void,
): { readonly node: HTMLElement; readonly canvas: HTMLCanvasElement | undefined } {
  const node = el(doc, 'div', 'everyday-towers-card');
  node.dataset['tower'] = card.towerId;
  node.dataset['band'] = card.bandIndex === undefined ? 'none' : String(card.bandIndex);
  node.style.cssText = [
    `${CARD}`,
    'padding:12px 14px',
    'display:flex',
    'flex-direction:column',
    'gap:6px',
    'min-width:0',
    `border-left:6px solid ${card.color ?? C.rule}`,
  ].join(';');
  const head = el(doc, 'div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap';
  const name = el(doc, 'span', 'everyday-towers-card-name', card.name);
  name.style.cssText = 'font-size:14.5px;font-weight:600;flex:1 1 auto';
  const day = el(doc, 'span', 'everyday-towers-card-day', card.day);
  day.style.cssText = `${MONO};color:${C.label}`;
  head.append(name, day);
  node.append(head);
  if (card.filed !== undefined) {
    const filed = el(doc, 'div', 'everyday-towers-card-filed', card.filed);
    filed.style.cssText = `${MONO};color:${C.ink}`;
    node.append(filed);
  }
  let canvas: HTMLCanvasElement | undefined;
  if (card.playable) {
    canvas = el(doc, 'canvas', 'everyday-towers-card-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${card.name}, ${card.filed ?? ''}: ${card.status}`);
    canvas.style.cssText = `display:block;width:100%;height:150px;border-radius:${String(R.tile)}px;background:${C.cardSunk}`;
    node.append(canvas);
  }
  const status = el(doc, 'div', 'everyday-towers-card-status', card.status);
  status.style.cssText = `font-size:12px;line-height:1.45;color:${C.warmGrey}`;
  const open = button(doc, 'everyday-towers-card-open', card.cta, true, onOpen);
  open.style.alignSelf = 'flex-start';
  open.setAttribute('aria-label', `${card.cta} ${card.name}`);
  node.append(status, open);
  return { node, canvas };
}

/** Paint one loop's current frame onto its canvas with the stage's own painter. */
function paintLoop(canvas: HTMLCanvasElement, loop: TowerLoop): void {
  if (!canvas.isConnected) return;
  const ctx = sizeCanvas(canvas);
  if (ctx === undefined) return;
  const rect = canvas.getBoundingClientRect();
  const played = loop.recording;
  const frame = loop.frame();
  drawCutaway(ctx, {
    recording: played,
    frame,
    queues: queueAt(played, frame.simTimeS),
    geometry: stageGeometryOf({
      width: rect.width,
      height: rect.height,
      floors: played.floors,
      shafts: played.shafts,
      outOfServiceCarIds: played.outOfServiceCarIds,
    }),
    floorLabelOf: (id) => played.floors.find((floor) => floor.id === id)?.label ?? id,
  });
}

/* -------------------------------------------------------------------------- *
 * `towers` — All buildings (§ 8.1)
 * -------------------------------------------------------------------------- */

function mountTowers(hostEl: HTMLElement, context: EverydayScreenContext): MountedEverydayScreen {
  const doc = hostEl.ownerDocument;
  const host = context.host;
  liveHost = host;
  const shell = context as EverydayScreenShellContext;

  const root = el(doc, 'div', 'everyday-towers');
  root.style.cssText = 'max-width:1180px';
  hostEl.append(root);

  /*
   * **The tower cards' loops** — GitHub issue #536, § D1301. One transport per card, kept across
   * redraws while the filed day under it is the same record, so a redraw on any career write does
   * not send every picture back to the start of its day. One frame callback paints all of them.
   * Each loop is built from `host` through `towerLoop.ts#TowerLoopSource`, which can only read.
   */
  const loops = new Map<string, { readonly filed: FiledDayRecord; readonly loop: TowerLoop }>();
  let painted: { readonly canvas: HTMLCanvasElement; readonly loop: TowerLoop }[] = [];
  let paintHandle: number | undefined;
  const paint = (): void => {
    paintHandle = undefined;
    for (const entry of painted) paintLoop(entry.canvas, entry.loop);
    if (painted.length > 0) paintHandle = doc.defaultView?.requestAnimationFrame(paint);
  };
  const loopFor = (towerId: string): TowerLoop | undefined => {
    const filed = host.campaignFiledDays?.().get(towerId);
    if (filed === undefined) return undefined;
    const kept = loops.get(towerId);
    if (kept !== undefined && kept.filed === filed) return kept.loop;
    kept?.loop.stop();
    const loop = towerLoopOf(host, towerId, systemClock());
    if (loop === undefined) return undefined;
    loops.set(towerId, { filed, loop });
    return loop;
  };

  const draw = (): void => {
    const view: TowersView = towersView(campaignInputOf(host));
    root.replaceChildren();
    painted = [];

    /* ---- header ---- */
    const header = el(doc, 'div');
    header.style.cssText = 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap';
    const title = el(doc, 'h1', undefined, view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0`;
    const meta = el(doc, 'span', 'everyday-towers-meta', view.meta);
    meta.style.cssText = `${MONO};color:${C.label}`;
    const pill = el(doc, 'span', 'everyday-towers-stage', view.stagePill);
    pill.style.cssText = `${MONO};border:1px solid ${C.amberEdge};background:${C.amberWash};border-radius:${String(R.pill)}px;padding:3px 10px;color:${C.terracotta}`;
    header.append(title, meta, pill);
    const lede = el(doc, 'p', undefined, view.lede);
    lede.style.cssText = `font-size:16.5px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:74ch;text-wrap:pretty`;
    root.append(header, lede);

    /*
     * The career-load refusal, drawn where the career is — GitHub issue #375. Present only when the
     * last load actually refused: a first-ever load has nothing to apologise for, and a notice
     * there would read as a fault.
     */
    if (view.careerNotice !== undefined) {
      const notice = el(doc, 'p', 'everyday-towers-career-notice', view.careerNotice);
      notice.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:14px 0 0;padding:12px 14px;border:1px solid ${C.amberEdge};background:${C.amberWash};border-radius:${String(R.card)}px;max-width:74ch;text-wrap:pretty`;
      root.append(notice);
    }

    /* ---- the fresh career's intro, then the tower cards — #536, § D1301 ---- */
    if (view.intro !== undefined) root.append(introBlock(doc, view.intro));
    root.append(eyebrow(doc, view.cards.heading), note(doc, view.cards.sub));
    const cards = el(doc, 'div', 'everyday-towers-cards');
    cards.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:${String(GAP.row)}px;margin-top:10px`;
    for (const card of view.cards.rows) {
      const drawn = towerCard(doc, card, () => {
        host.campaignAct({ kind: 'open-tower', towerId: card.towerId });
        context.go('building');
      });
      const loop = drawn.canvas === undefined ? undefined : loopFor(card.towerId);
      if (drawn.canvas !== undefined && loop !== undefined) painted.push({ canvas: drawn.canvas, loop });
      cards.append(drawn.node);
    }
    root.append(cards);
    if (painted.length > 0 && paintHandle === undefined) {
      paintHandle = doc.defaultView?.requestAnimationFrame(paint);
    }

    /* ---- standing and the slots ---- */
    root.append(eyebrow(doc, view.standing.heading));
    const standingCard = el(doc, 'div', 'everyday-towers-standing');
    standingCard.style.cssText = `${CARD};padding:16px 18px`;
    const standingValue = el(doc, 'div', 'everyday-towers-standing-value', view.standing.value);
    standingValue.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700`;
    const bar = el(doc, 'div');
    bar.style.cssText = `height:6px;border-radius:3px;background:${C.cardSunkDeep};margin:8px 0 0;overflow:hidden`;
    const fill = el(doc, 'div');
    fill.style.cssText = `height:100%;width:${String(view.standing.pct)}%;background:${C.sun}`;
    bar.append(fill);
    standingCard.append(standingValue, bar, note(doc, view.standing.note));
    const slots = el(doc, 'div');
    slots.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:${String(GAP.row)}px;margin-top:14px`;
    for (const slot of view.standing.slots) {
      const card = el(doc, 'div', 'everyday-towers-slot');
      card.style.cssText = `border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${C.cardSunk};padding:9px 11px`;
      const heading = el(doc, 'div', undefined, slot.heading);
      heading.style.cssText = `${EYEBROW}`;
      const tag = el(doc, 'div', undefined, slot.tag);
      tag.style.cssText = `${MONO};color:${slot.inHand ? C.moss : C.warmGrey};margin-top:3px`;
      const body = el(doc, 'div', undefined, slot.note);
      body.style.cssText = `font-size:11.5px;color:${C.warmGrey};line-height:1.4;margin-top:4px`;
      card.append(heading, tag, body);
      slots.append(card);
    }
    standingCard.append(slots);
    root.append(standingCard);

    /* ---- the five career figures ---- */
    const stats = el(doc, 'div', 'everyday-towers-stats');
    stats.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:${String(GAP.row)}px;margin-top:${String(GAP.section)}px`;
    for (const stat of view.stats) {
      const card = el(doc, 'div', 'everyday-towers-stat');
      card.style.cssText = `${CARD};padding:12px 14px`;
      const value = el(doc, 'div', undefined, stat.value);
      value.style.cssText = `font-family:${TYPE.heading};font-size:21px;font-weight:700`;
      const label = el(doc, 'div', undefined, stat.label);
      label.style.cssText = `font-size:12.5px;font-weight:600;color:${C.inkSoft};margin-top:2px`;
      const body = el(doc, 'div', undefined, stat.note);
      body.style.cssText = `font-size:11.5px;color:${C.warmGrey};line-height:1.4;margin-top:4px`;
      card.append(value, label, body);
      stats.append(card);
    }
    root.append(stats);

    /* ---- the rolling calendar ---- */
    root.append(eyebrow(doc, view.calendar.heading), note(doc, view.calendar.note));
    const grid = el(doc, 'div', 'everyday-towers-calendar');
    /*
     * § 8.7: *"Emit the column count from the same value as the cells or they drift."* The template
     * below counts `view.calendar.columns`, and every row's cells come from that same array through
     * `campaign/economy.ts#calendarRow`. There is no `30` in this file.
     */
    const columns = view.calendar.columns.length;
    grid.style.cssText = `display:grid;grid-template-columns:132px repeat(${String(columns)},minmax(0,1fr));gap:2px;margin-top:8px;overflow-x:auto`;
    const corner = el(doc, 'div');
    grid.append(corner);
    for (const day of view.calendar.columns) {
      const head = el(doc, 'div', 'everyday-towers-calendar-col', String(day));
      head.style.cssText = `font:500 9px ${TYPE.mono};color:${C.fainter};text-align:center`;
      grid.append(head);
    }
    for (const row of view.calendar.rows) {
      const name = el(doc, 'div', 'everyday-towers-calendar-row', row.name);
      name.style.cssText = `font-size:11.5px;color:${C.inkSoft};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
      grid.append(name);
      for (const cell of row.cells) {
        const box = el(doc, 'div', `everyday-towers-cell everyday-towers-cell-${cell.mark}`, cell.glyph);
        box.title = cell.tip;
        box.style.cssText = [
          `font:500 10px ${TYPE.mono}`,
          'text-align:center',
          'padding:2px 0',
          `border-radius:${String(R.tight)}px`,
          `background:${
            cell.mark === 'blank'
              ? 'transparent'
              : cell.mark === 'today'
                ? C.amberWash
                : cell.mark === 'missed'
                  ? '#F6DED6'
                  : cell.mark === 'cleared'
                    ? '#E2EFE3'
                    : C.cardSunk
          }`,
          `color:${cell.mark === 'missed' ? C.alarm : cell.mark === 'cleared' ? C.moss : C.warmGrey}`,
        ].join(';');
        grid.append(box);
      }
    }
    root.append(grid);
    const legend = el(doc, 'div', 'everyday-towers-legend');
    legend.style.cssText = `display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:11px;color:${C.warmGrey}`;
    for (const entry of view.calendar.legend) {
      legend.append(
        el(doc, 'span', undefined, entry.glyph === '' ? entry.label : `${entry.glyph} ${entry.label}`),
      );
    }
    root.append(legend);

    /* ---- the triage list ---- */
    const table = el(doc, 'div', 'everyday-towers-table');
    table.style.cssText = `margin-top:${String(GAP.section)}px;display:grid;gap:${String(GAP.row)}px`;
    const headRow = el(doc, 'div');
    headRow.style.cssText = `display:grid;grid-template-columns:minmax(0,1.6fr) 96px minmax(0,1.1fr) minmax(0,1.2fr) 104px;gap:12px;${EYEBROW};margin:0 0 2px;padding:0 14px`;
    for (const heading of view.headings) headRow.append(el(doc, 'div', undefined, heading));
    table.append(headRow);

    for (const row of view.rows) {
      const card = el(doc, 'div', 'everyday-towers-row');
      card.style.cssText = [
        'display:grid',
        'grid-template-columns:minmax(0,1.6fr) 96px minmax(0,1.1fr) minmax(0,1.2fr) 104px',
        'gap:12px',
        'align-items:start',
        'padding:13px 14px',
        `border:1px solid ${row.needsDecision ? C.amberEdge : C.rule}`,
        `border-radius:${String(R.card)}px`,
        `background:${row.needsDecision ? C.amberWash : C.card}`,
      ].join(';');

      const identity = el(doc, 'div');
      identity.style.cssText = 'min-width:0';
      const name = el(doc, 'div', 'everyday-towers-name', row.name);
      name.style.cssText = `font-size:14.5px;font-weight:600;color:${row.needsDecision ? C.terracotta : C.ink}`;
      const spec = el(doc, 'div', 'everyday-towers-spec', row.spec);
      spec.style.cssText = `${MONO};color:${C.label};margin-top:2px`;
      const quirk = el(doc, 'div', 'everyday-towers-quirk', row.quirk);
      quirk.style.cssText = 'font-size:12px;color:#8D6A2F;margin-top:4px;line-height:1.4';
      const terms = el(doc, 'div', 'everyday-towers-terms', row.terms);
      terms.style.cssText = `${MONO};color:${C.warmGrey};margin-top:4px`;
      identity.append(name, spec, quirk, terms);

      const month = el(doc, 'div');
      month.style.cssText = 'min-width:0';
      const day = el(doc, 'div', 'everyday-towers-day', row.day);
      day.style.cssText = `${MONO};color:${C.ink}`;
      const record = el(doc, 'div', 'everyday-towers-record', row.record);
      record.style.cssText = `font-size:11.5px;color:${C.warmGrey};margin-top:3px`;
      const wear = el(doc, 'div', 'everyday-towers-wear', row.wear);
      wear.style.cssText = `font-size:11.5px;color:${row.wearIsDue ? C.terracotta : C.label};margin-top:3px`;
      month.append(day, record, wear);

      const order = standingOrderControls(doc, host, row.towerId, row.order, draw);
      const orderNote = note(doc, row.order.note);
      orderNote.style.cssText += ';font-size:11.5px';
      const orderWrap = el(doc, 'div');
      orderWrap.style.cssText = 'min-width:0';
      orderWrap.append(order, orderNote);

      const wants = el(doc, 'div');
      wants.style.cssText = 'min-width:0';
      const status = el(doc, 'div', 'everyday-towers-status', row.status);
      status.style.cssText = `font-size:12.5px;font-weight:600;color:${row.needsDecision ? C.terracotta : C.moss}`;
      const statusSub = el(doc, 'div', 'everyday-towers-status-sub', row.statusSub);
      statusSub.style.cssText = `font-size:11.5px;color:${C.warmGrey};margin-top:3px;line-height:1.4`;
      wants.append(status, statusSub);

      const cta = button(doc, 'everyday-towers-open', row.cta, true, () => {
        host.campaignAct({ kind: 'open-tower', towerId: row.towerId });
        context.go('building');
      });

      card.append(identity, month, orderWrap, wants, cta);
      table.append(card);
    }
    root.append(table);

    const footer = el(doc, 'div', 'everyday-towers-footer', view.footer);
    footer.style.cssText = `${MONO};color:${C.warmGrey};margin-top:12px`;
    root.append(footer);

    /* ---- the two panels this build refuses, and the register ---- */
    const panels = el(doc, 'div');
    panels.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:${String(GAP.row)}px;margin-top:${String(GAP.section)}px`;
    /* § 8.8's offers — GitHub issue #169 item 3, § D510. Every word is `campaignModel.ts#offersView`'s. */
    {
      const card = el(doc, 'div', 'everyday-towers-offers');
      card.style.cssText = `${CARD};padding:14px 16px;background:${C.cardSunk}`;
      card.append(eyebrow(doc, `${view.offers.heading} · ${view.offers.caption}`, '0 0 6px'));
      if (view.offers.empty !== undefined) {
        const none = el(doc, 'div', 'everyday-towers-offers-empty', view.offers.empty);
        none.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.5`;
        card.append(none);
      }
      for (const offer of view.offers.rows) {
        const row = el(doc, 'div', 'everyday-towers-offer');
        row.dataset['contract'] = offer.contractId;
        row.style.cssText = `display:flex;flex-direction:column;gap:3px;padding:8px 0;border-top:1px solid ${C.ruleLight}`;
        const name = el(doc, 'div', 'everyday-towers-offer-name', offer.name);
        name.style.cssText = `font-size:13px;font-weight:600;color:${C.ink}`;
        const terms = el(doc, 'div', 'everyday-towers-offer-terms', offer.terms);
        terms.style.cssText = `${MONO};color:${C.warmGrey}`;
        const quirk = el(doc, 'div', 'everyday-towers-offer-quirk', offer.quirk);
        quirk.style.cssText = 'font-size:12px;color:#8D6A2F;line-height:1.4';
        const take = button(doc, 'everyday-towers-offer-take', offer.cta, offer.takeable, () => {
          host.campaignAct({ kind: 'take-offer', contractId: offer.contractId });
          context.go('building');
        });
        row.append(name, terms, quirk, take);
        if (offer.refusal !== undefined) {
          const why = el(doc, 'div', 'everyday-towers-offer-refusal', offer.refusal);
          why.style.cssText = `font-size:12px;color:${C.terracotta};line-height:1.5`;
          /* A dead control says why on the control (GitHub issue #262): the refusal is the button's description. */
          why.id = `everyday-towers-offer-refusal-${offer.contractId}`;
          take.setAttribute('aria-describedby', why.id);
          row.append(why);
        }
        card.append(row);
      }
      const offersNote = el(doc, 'div', 'everyday-towers-offers-note', view.offers.note);
      offersNote.style.cssText = `font-size:11.5px;color:${C.faint};margin-top:6px;line-height:1.4`;
      card.append(offersNote);
      panels.append(card);
    }
    for (const [heading, sub, refusal, className] of [
      [view.lately.heading, view.lately.sub, view.lately.refusal, 'everyday-towers-lately'],
    ] as const) {
      const card = el(doc, 'div', className);
      card.style.cssText = `${CARD};padding:14px 16px;background:${C.cardSunk}`;
      card.append(eyebrow(doc, heading, '0 0 6px'));
      if (sub !== undefined) {
        const subLine = el(doc, 'div', undefined, sub);
        subLine.style.cssText = `font-size:11.5px;color:${C.faint};margin-bottom:6px`;
        card.append(subLine);
      }
      const why = el(doc, 'div', undefined, refusal);
      why.style.cssText = `font-size:12px;color:${C.terracotta};line-height:1.5`;
      card.append(why);
      panels.append(card);
    }
    root.append(panels);
    root.append(note(doc, view.oddsFootnote));

    /*
     * **The campaign's register of absences is on the settings screen now**, with the other five
     * (`everyday/buildNotes.ts`, GitHub issue #207). `CAMPAIGN_ABSENCES` is unchanged — it was
     * already three sentences of plain English with no notation in them, which is the
     * counter-example that showed the fix was a rewrite of the other five rather than a change to
     * the mechanism. What a player still meets here is the per-control refusal above: the offers
     * panel says on its own face why it has no offers.
     */

    shell.refreshBar?.();
  };

  draw();
  const stop = host.subscribe(draw);

  return {
    unmount: () => {
      stop();
      liveHost = undefined;
      painted = [];
      if (paintHandle !== undefined) doc.defaultView?.cancelAnimationFrame(paintHandle);
      paintHandle = undefined;
      for (const entry of loops.values()) entry.loop.stop();
      loops.clear();
    },
    primary: () => {
      const tower = openTowerOf(host.campaign()) ?? host.campaign().towers[0];
      if (tower === undefined) return;
      host.campaignAct({ kind: 'open-tower', towerId: tower.id });
      context.go('building');
    },
  };
}

/**
 * § 3.3's `towers` row: the primary is `Open ⟨building⟩` and the note counts what wants a decision.
 * Both cells are the guide's placeholders, substituted from the record rather than restated.
 */
/**
 * § 3.3's cells with no campaign behind them — the fallback both campaign bars need.
 *
 * `actionBar.ts` carries the guide's state-dependent cells verbatim inside `⟨…⟩` on the rule that
 * **the frame never draws one**, and both bars below substitute them from the live career. When
 * there is no career to read — the shell asking for a row before the screen has mounted, which
 * `screens.test.ts`'s placeholder guard does deliberately — returning the table row unchanged put
 * `Open ⟨building⟩` and `⟨N⟩ buildings want a decision.` in front of a reader.
 *
 * So the no-campaign arm says something smaller and true rather than a typesetting mark. It is the
 * same correction the brief needed, found by the same guard in the same run.
 */
function withoutPlaceholders(base: ActionBarModel): ActionBarModel {
  const strip = (cell: string, plain: string): string => (cell.includes('⟨') ? plain : cell);
  return {
    ...base,
    primary: {
      ...base.primary,
      label: strip(base.primary.label, 'Open a building'),
      inert: NO_CAMPAIGN,
    },
    note: base.note === undefined ? undefined : strip(base.note, NO_CAMPAIGN),
  };
}

function towersBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  if (liveHost === undefined) return withoutPlaceholders(base);
  const view = towersView(campaignInputOf(liveHost));
  const open = openTowerOf(liveHost.campaign()) ?? liveHost.campaign().towers[0];
  const wanting = view.rows.filter((row) => row.needsDecision).length;
  return {
    ...base,
    primary: {
      ...base.primary,
      label: open === undefined ? 'Open a building' : `Open ${view.rows.find((row) => row.towerId === open.id)?.name ?? 'a building'}`,
      ...(open === undefined ? { inert: NO_TOWER } : {}),
    },
    note: `${String(wanting)} of ${String(view.rows.length)} buildings want a decision.`,
  };
}

/* -------------------------------------------------------------------------- *
 * `building` — the desk (§ 8.2)
 * -------------------------------------------------------------------------- */

function mountBuilding(hostEl: HTMLElement, context: EverydayScreenContext): MountedEverydayScreen {
  const doc = hostEl.ownerDocument;
  const host = context.host;
  liveHost = host;
  const shell = context as EverydayScreenShellContext;

  const root = el(doc, 'div', 'everyday-building');
  root.style.cssText = 'max-width:1080px';
  hostEl.append(root);

  const draw = (): void => {
    const view: BuildingView | undefined = buildingView(campaignInputOf(host));
    root.replaceChildren();
    if (view === undefined) {
      const empty = el(doc, 'p', 'everyday-building-empty', NO_TOWER);
      empty.style.cssText = `font-size:13px;color:${C.inkSoft};max-width:60ch;line-height:1.5`;
      root.append(empty);
      shell.refreshBar?.();
      return;
    }

    const header = el(doc, 'div');
    header.style.cssText = 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap';
    const title = el(doc, 'h1', 'everyday-building-name', view.name);
    title.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0`;
    const spec = el(doc, 'span', 'everyday-building-spec', view.spec);
    spec.style.cssText = `${MONO};color:${C.label}`;
    const pill = el(doc, 'span', 'everyday-building-state', view.statePill);
    pill.style.cssText = `${MONO};border:1px solid ${C.rule};border-radius:${String(R.pill)}px;padding:3px 10px;color:${C.warmGrey}`;
    header.append(title, spec, pill);
    root.append(header);

    /*
     * **Two columns that stack below about 700 px** — wave AR, lane AR-4, GitHub issue #633. A fixed
     * `1fr 340px` grid left the main column 38 px wide at 390 px, with the *Running itself* card
     * behind the standing order. The sidebar pattern: the main column takes the spare width, and once
     * the two bases no longer fit side by side the right column wraps under it at full width.
     */
    const columns = el(doc, 'div', 'everyday-building-columns');
    columns.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.wide)}px;margin-top:${String(GAP.section)}px;align-items:flex-start`;
    const left = el(doc, 'div', 'everyday-building-main');
    left.style.cssText = 'flex:999 1 320px;min-width:0';
    const right = el(doc, 'div', 'everyday-building-side');
    right.style.cssText = 'flex:1 1 340px;min-width:0';
    columns.append(left, right);
    root.append(columns);

    /*
     * **The day opens on the building, with today's hole in it** — GitHub issue #353, `docs/35`
     * PM-CA1 and PM-CA3. The elevation is drawn first, above every word, and the dashed well is
     * the car today's works hold — `campaign/works.ts`'s answer, which is the one `runCampaignDay`
     * writes into the run, so what the player sees before the press is what the day then does.
     * Today's event, when the day has one, holds its car through the run's own schedule and appears
     * on the stage the moment the run lands; the works are what this screen can know before it.
     */
    const openTower = openTowerOf(host.campaign());
    const towerConfig = openTower === undefined ? undefined : host.buildingById(openTower.buildingId);
    /*
     * Resolved rather than read raw: a shipped building may author `floorRanges` and no `floors`
     * list, and an elevation drawn off the literal array would understate it — GitHub issue #324
     * makes the same point about counting storeys. The specs are the host's, as `dev/state.ts`
     * resolves them.
     */
    const towerBuilding =
      towerConfig === undefined ? undefined : resolveBuilding(parseBuilding(towerConfig as unknown), host.elevatorSpecs());
    const frame = el(doc, 'div', 'everyday-building-elevation');
    frame.style.cssText = `border:1px solid ${C.ruleLight};border-radius:${String(R.well)}px;background:${C.paperDeep};overflow:hidden;margin-bottom:${String(GAP.block)}px`;
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:220px;display:block';
    frame.append(canvas);
    left.append(frame);
    if (view.worksToday !== undefined) {
      const strip = el(doc, 'div', 'everyday-building-works');
      strip.style.cssText = `display:flex;align-items:center;gap:${String(GAP.row)}px;margin:-${String(GAP.block - 6)}px 0 ${String(GAP.block)}px;padding:9px 12px;border:1px solid ${C.amberEdge};border-radius:${String(R.row)}px;background:${C.amberWash}`;
      const badge = el(doc, 'span', 'everyday-building-works-badge', view.worksToday.badge);
      badge.style.cssText = `flex:none;padding:2px 8px;border-radius:${String(R.tight)}px;background:${C.terracotta};color:${C.paper};font:500 12px ${TYPE.mono}`;
      const sentence = el(doc, 'span', undefined, view.worksToday.sentence);
      sentence.style.cssText = `font-size:12.5px;line-height:1.45;color:${C.inkSoft}`;
      strip.append(badge, sentence);
      left.append(strip);
    }
    const heldToday =
      openTower === undefined || towerBuilding === undefined
        ? []
        : worksHeldCarRefsOf(openTower, towerBuilding).map((ref) => ref.carId);
    const paint = (): void => {
      drawElevation(canvas, towerBuilding, heldToday);
    };
    doc.defaultView?.requestAnimationFrame(paint);

    /* ---- the decision, or the quiet building ---- */
    if (view.need !== undefined) {
      const card = el(doc, 'div', 'everyday-building-incident');
      card.style.cssText = `border:1px solid ${C.amberEdge};border-radius:${String(R.card)}px;background:${C.amberWash};padding:16px 18px`;
      card.append(eyebrow(doc, view.need.eyebrow, '0 0 8px'));
      const meta = el(doc, 'div');
      meta.style.cssText = `${MONO};color:${C.warmGrey};display:flex;gap:12px;flex-wrap:wrap`;
      meta.append(
        el(doc, 'span', 'everyday-building-allowance', view.need.allowance),
        el(doc, 'span', 'everyday-building-due', view.need.due),
      );
      const heading = el(doc, 'h2', 'everyday-building-incident-title', view.need.title);
      heading.style.cssText = `font-family:${TYPE.heading};font-size:22px;font-weight:700;margin:8px 0 0;color:${C.terracotta}`;
      const brief = el(doc, 'p', undefined, view.need.brief);
      brief.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:8px 0 0;max-width:70ch;text-wrap:pretty`;
      card.append(meta, heading, brief);
      if (view.need.offer !== undefined) {
        const offer = el(doc, 'div', 'everyday-building-offer');
        offer.style.cssText = `margin-top:12px;padding-top:12px;border-top:1px solid ${C.amberEdge}`;
        const rate = el(doc, 'span', 'everyday-building-offer-rate', view.need.offer.rate);
        rate.style.cssText = `font-family:${TYPE.heading};font-size:24px;font-weight:700`;
        const head = el(doc, 'span', undefined, ` ${view.need.offer.head}`);
        head.style.cssText = `font-size:12.5px;color:${C.warmGrey}`;
        const why = el(doc, 'div', 'everyday-building-offer-why', view.need.offer.why);
        why.style.cssText = `font-size:12.5px;color:${C.inkSoft};margin-top:6px;line-height:1.5;max-width:70ch`;
        offer.append(rate, head, why);
        card.append(offer);
      }
      left.append(card);
    } else if (view.quiet !== undefined) {
      const card = el(doc, 'div', 'everyday-building-quiet');
      card.style.cssText = `${CARD};padding:16px 18px`;
      const heading = el(doc, 'h2', undefined, view.quiet.heading);
      heading.style.cssText = `font-family:${TYPE.heading};font-size:20px;font-weight:700;margin:0;color:${C.moss}`;
      const body = el(doc, 'p', undefined, view.quiet.body);
      body.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:8px 0 0;max-width:70ch`;
      const next = el(doc, 'div', 'everyday-building-next', view.quiet.next);
      next.style.cssText = `${MONO};color:${C.warmGrey};margin-top:10px`;
      card.append(heading, body, next);
      left.append(card);
    }

    /* ---- the options ---- */
    if (view.options !== undefined) {
      left.append(eyebrow(doc, view.options.eyebrow));
      const optionsNote = el(doc, 'div');
      optionsNote.style.cssText = `display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12.5px;color:${C.warmGrey}`;
      optionsNote.append(
        el(doc, 'span', undefined, view.options.note),
        el(doc, 'span', 'everyday-building-purse-line', view.options.purse),
      );
      left.append(optionsNote);
      const list = el(doc, 'div', 'everyday-building-options');
      list.style.cssText = `display:grid;gap:${String(GAP.row)}px;margin-top:8px`;
      for (const option of view.options.rows) {
        const row = el(doc, 'button', 'everyday-building-option');
        row.type = 'button';
        row.disabled = !option.affordable;
        const selected = pickedOption === option.id;
        row.style.cssText = [
          'text-align:left',
          'display:block',
          'width:100%',
          `border:1.5px solid ${selected ? C.sun : C.rule}`,
          `border-radius:${String(R.row)}px`,
          `background:${selected ? C.amberWash : C.card}`,
          'padding:11px 14px',
          `font-family:${TYPE.body}`,
          `color:${C.ink}`,
          `opacity:${option.affordable ? '1' : '.55'}`,
          `cursor:${option.affordable ? 'pointer' : 'not-allowed'}`,
        ].join(';');
        const head = el(doc, 'div');
        head.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap';
        const label = el(doc, 'span', undefined, option.label);
        label.style.cssText = 'font-size:13.5px;font-weight:600;flex:1 1 auto';
        const cost = el(doc, 'span', 'everyday-building-option-cost', option.cost);
        cost.style.cssText = `${MONO};color:${option.affordable ? C.ink : C.terracotta}`;
        const when = el(doc, 'span', undefined, option.when);
        when.style.cssText = `${MONO};color:${C.label}`;
        head.append(label, cost, when);
        const effect = el(doc, 'div', undefined, option.effect);
        effect.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:4px;line-height:1.45;max-width:70ch`;
        row.append(head, effect);
        if (option.affordable) {
          row.addEventListener('click', () => {
            pickedOption = option.id;
            draw();
          });
        }
        list.append(row);
      }
      left.append(list);
    }

    /* ---- the four tests ---- */
    /*
     * The eyebrow now names the **contract** and the line under it says what these four decide and
     * what the other set decides — GitHub issue #567. `campaignModel.ts#CONTRACT_ASKS_HEADING`
     * carries the argument; this is the placement, immediately under the heading and above the
     * rows, because a reader who cannot tell which bars these are has that question before they
     * have any other.
     */
    left.append(eyebrow(doc, view.tests.eyebrow));
    left.append(note(doc, view.tests.decides, 'everyday-building-tests-decides'));
    const testsMeta = el(doc, 'div');
    testsMeta.style.cssText = `display:flex;justify-content:space-between;gap:12px;${MONO};color:${C.warmGrey};margin-bottom:8px`;
    testsMeta.append(
      el(doc, 'span', undefined, view.tests.note),
      el(doc, 'span', 'everyday-building-tests-held', view.tests.held),
    );
    left.append(testsMeta, testRows(doc, view.tests.rows));

    /* ---- the right rail ---- */
    const railCard = (heading: string, className: string): HTMLElement => {
      const card = el(doc, 'div', className);
      card.style.cssText = `${CARD};padding:14px 16px;margin-bottom:${String(GAP.row)}px`;
      card.append(eyebrow(doc, heading, '0 0 8px'));
      return card;
    };

    const orderCard = railCard(view.order.heading, 'everyday-building-order');
    orderCard.append(note(doc, view.order.sub));
    orderCard.append(eyebrow(doc, view.order.drives, '12px 0 6px'));
    const tower = openTowerOf(host.campaign());
    if (tower !== undefined) {
      orderCard.append(standingOrderControls(doc, host, tower.id, view.order.view, draw));
      orderCard.append(note(doc, view.order.view.note));
      /* GitHub issue #571's Career brief line, § D1301 — drawn only where the census says it. */
      if (view.order.census !== undefined) {
        const census = note(doc, view.order.census, 'everyday-building-census');
        census.style.cssText += `;color:${C.inkSoft};font-weight:600`;
        orderCard.append(census);
      }
    }
    right.append(orderCard);

    const fittedCard = railCard(view.fitted.heading, 'everyday-building-fitted');
    for (const row of view.fitted.rows) {
      const line = el(doc, 'div', 'everyday-building-fitted-row');
      line.style.cssText = `display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid ${C.ruleLight};font-size:12.5px`;
      const label = el(doc, 'span', undefined, row.label);
      const level = el(doc, 'span', undefined, row.level);
      level.style.cssText = `${MONO};color:${row.state === 'live' ? C.moss : row.state === 'booked' ? '#8D6A2F' : C.faint}`;
      line.append(label, level);
      fittedCard.append(line);
    }
    right.append(fittedCard);

    const purseCard = railCard(view.purse.heading, 'everyday-building-purse');
    const onHand = el(doc, 'div', 'everyday-building-on-hand', view.purse.onHand);
    onHand.style.cssText = `font-family:${TYPE.heading};font-size:22px;font-weight:700`;
    purseCard.append(onHand, note(doc, view.purse.note));
    purseCard.append(
      button(doc, 'everyday-building-to-contract', view.purse.link, true, () => {
        context.go('contract');
      }),
    );
    right.append(purseCard);

    const quirkCard = railCard(view.quirk.heading, 'everyday-building-quirk');
    const quirkText = el(doc, 'div', undefined, view.quirk.text);
    quirkText.style.cssText = 'font-size:13.5px;color:#8D6A2F;line-height:1.5';
    quirkCard.append(quirkText, note(doc, view.quirk.sub));
    right.append(quirkCard);

    const conditionCard = railCard(view.condition.heading, 'everyday-building-condition');
    const head = el(doc, 'div', 'everyday-building-wear-head', view.condition.head);
    head.style.cssText = `font-size:14px;font-weight:600;color:${
      view.condition.headId === 'due' ? C.terracotta : view.condition.headId === 'wearing' ? '#8D6A2F' : C.moss
    }`;
    const trips = el(doc, 'div', 'everyday-building-trips', view.condition.trips);
    trips.style.cssText = `${MONO};color:${C.warmGrey};margin-top:4px`;
    const wearBar = el(doc, 'div');
    wearBar.style.cssText = `height:6px;border-radius:3px;background:${C.cardSunkDeep};margin-top:8px;overflow:hidden`;
    const wearFill = el(doc, 'div');
    wearFill.style.cssText = `height:100%;width:${String(Math.min(100, view.condition.wearPct))}%;background:${
      view.condition.headId === 'due' ? C.alarm : C.sun
    }`;
    wearBar.append(wearFill);
    conditionCard.append(head, trips, wearBar, note(doc, view.condition.note));
    conditionCard.append(eyebrow(doc, view.odds.heading, '14px 0 4px'));
    const oddsNow = el(doc, 'div', 'everyday-building-failure-rate', view.odds.now);
    oddsNow.style.cssText = `font-family:${TYPE.heading};font-size:20px;font-weight:700`;
    conditionCard.append(oddsNow, note(doc, view.odds.note));
    right.append(conditionCard);

    const temporaryCard = railCard(view.temporary.heading, 'everyday-building-temporary');
    temporaryCard.append(note(doc, view.temporary.body));
    right.append(temporaryCard);

    const monthCard = railCard(view.month.heading, 'everyday-building-month');
    const figures = el(doc, 'div');
    figures.style.cssText = 'display:flex;gap:18px';
    for (const [value, label] of [
      [view.month.day, 'of twenty'],
      [view.month.cleared, 'cleared'],
      [view.month.missed, 'missed'],
    ] as const) {
      const cell = el(doc, 'div');
      const figure = el(doc, 'div', undefined, value);
      figure.style.cssText = `font-family:${TYPE.heading};font-size:19px;font-weight:700`;
      const caption = el(doc, 'div', undefined, label);
      caption.style.cssText = `font-size:11px;color:${C.warmGrey};margin-top:2px`;
      cell.append(figure, caption);
      figures.append(cell);
    }
    monthCard.append(figures);
    right.append(monthCard);

    shell.refreshBar?.();
  };

  draw();
  askForCensus(host, draw);
  const stop = host.subscribe(() => {
    draw();
    askForCensus(host, draw);
  });

  return {
    unmount: () => {
      stop();
      pickedOption = undefined;
      liveHost = undefined;
    },
    primary: () => {
      const career = host.campaign();
      const tower = openTowerOf(career);
      if (tower === undefined) return;
      const view = buildingView(campaignInputOf(host));
      if (view?.need !== undefined) {
        if (pickedOption === undefined) return;
        host.campaignAct({ kind: 'answer-need', towerId: tower.id, optionId: pickedOption });
        pickedOption = undefined;
        return;
      }
      host.runCampaignDay(tower.id);
      context.go('stage');
    },
  };
}

/**
 * Why the campaign bar's primary is dead before a career has been read — `BarPrimary.inert`'s
 * sentence for {@link withoutPlaceholders}.
 *
 * It is the same state the note already described; it is repeated into `inert` rather than left to
 * the note because `shell.ts#drawBar` reads the reason off the control, and a bar whose reason
 * lives only in a cell nothing binds to the button is GitHub issue #262's defect.
 */
const NO_CAMPAIGN = 'No career is open.';

/** Why *Send your answer* is dead until one of the desk's options is picked (§ 8.2). */
const NO_ANSWER_PICKED =
  'the options above are the answer — pick one, and this sends it';

/** Drawn when the career holds no open tower — a sentence, never a blank region. */
const NO_TOWER =
  'no building is open — pick one on All buildings, and this desk is about that one until you pick another';

/**
 * § 3.3's `building` row. The guide gives five primary variants and two notes; which one is live is
 * the desk's own state, so it is substituted here **by index into the row's own variants** rather
 * than by a restated string — a reworded § 3.3 cell then moves on the same commit.
 */
function buildingBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  if (liveHost === undefined) return base;
  const [decideLabel, withThatLabel, sendLabel, chooseLabel, watchLabel] = base.primary.variants;
  const view = buildingView(campaignInputOf(liveHost));
  if (view === undefined) {
    return { ...base, primary: { ...base.primary, inert: NO_TOWER }, note: NO_TOWER };
  }
  const [, travelNote] = base.noteVariants ?? [];
  if (view.need !== undefined) {
    const picked = view.options?.rows.find((row) => row.id === pickedOption);
    return {
      ...base,
      primary: {
        ...base.primary,
        label: (picked === undefined ? chooseLabel : sendLabel) ?? base.primary.label,
        ...(picked === undefined ? { inert: NO_ANSWER_PICKED } : {}),
      },
      /*
       * The picked option's effect, or the press's own reason while nothing is picked —
       * [§ D1357](../../../../DECISIONS.md). This fell back to the § 3.3 cell itself,
       * `⟨the picked option's effect⟩`, which is a placeholder and is never drawn, and the cell after
       * it (*you can answer while the day plays*) is not true of a desk whose press runs no day until
       * it is answered. The renewal reached this arm on every month's end once days 19 and 20 played.
       */
      note: picked?.effect ?? NO_ANSWER_PICKED,
    };
  }
  /*
   * **A day the census says every driver clears is a day to watch, and it says the short way** — wave
   * AR, lane AR-4, GitHub issue #633, [§ D1543](../../../../DECISIONS.md). The guide's *Watch a day
   * here when quiet* variant, on the one measured quiet the desk has; *decide as it goes* promised
   * decisions the day never asked for.
   */
  if (view.order.census !== undefined) {
    return {
      ...base,
      primary: { ...base.primary, label: watchLabel ?? base.primary.label },
      note: DAY_CENSUS_COPY.shortPath,
    };
  }
  return {
    ...base,
    primary: { ...base.primary, label: decideLabel ?? withThatLabel ?? watchLabel ?? base.primary.label },
    note: travelNote,
  };
}

/* -------------------------------------------------------------------------- *
 * `contract` — Contract & works (§ 8.3, § 8.4)
 * -------------------------------------------------------------------------- */

function mountContract(hostEl: HTMLElement, context: EverydayScreenContext): MountedEverydayScreen {
  const doc = hostEl.ownerDocument;
  const host = context.host;
  liveHost = host;
  const shell = context as EverydayScreenShellContext;

  const root = el(doc, 'div', 'everyday-contract');
  root.style.cssText = 'max-width:1180px';
  hostEl.append(root);

  const draw = (): void => {
    const view: ContractView | undefined = contractView(campaignInputOf(host));
    root.replaceChildren();
    if (view === undefined) {
      const empty = el(doc, 'p', 'everyday-contract-empty', NO_TOWER);
      empty.style.cssText = `font-size:13px;color:${C.inkSoft};max-width:60ch;line-height:1.5`;
      root.append(empty);
      shell.refreshBar?.();
      return;
    }
    const tower = openTowerOf(host.campaign()) as CampaignTower;

    const title = el(doc, 'h1', 'everyday-contract-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0`;
    const meta = el(doc, 'div', 'everyday-contract-meta', view.meta);
    meta.style.cssText = `${MONO};color:${C.label};margin-top:6px`;
    const lede = el(doc, 'p', undefined, view.lede);
    lede.style.cssText = `font-size:16.5px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:76ch;text-wrap:pretty`;
    root.append(title, meta, lede);

    /* ---- difficulty ---- */
    root.append(eyebrow(doc, view.difficulty.eyebrow));
    const difficulty = el(doc, 'div', 'everyday-contract-difficulty');
    difficulty.style.cssText = `display:flex;gap:${String(GAP.tight)}px;flex-wrap:wrap`;
    for (const entry of view.difficulty.buttons) {
      const picked = entry.id === view.difficulty.picked;
      const node = el(doc, 'button', `everyday-contract-difficulty-${entry.id}`, entry.label);
      node.type = 'button';
      node.style.cssText = [
        `border:1.5px solid ${picked ? C.sun : C.rule}`,
        `background:${picked ? C.sun : C.card}`,
        `color:${C.ink}`,
        `border-radius:${String(R.pill)}px`,
        'padding:6px 14px',
        `font-family:${TYPE.body}`,
        'font-size:12.5px',
        'font-weight:600',
        'cursor:pointer',
      ].join(';');
      node.addEventListener('click', () => {
        host.campaignAct({
          kind: 'set-difficulty',
          towerId: tower.id,
          difficultyId: entry.id as DifficultyId,
        });
        draw();
      });
      difficulty.append(node);
    }
    root.append(difficulty, note(doc, view.difficulty.note), note(doc, view.difficulty.footer));

    /* ---- the month and the purse ---- */
    const pair = el(doc, 'div');
    pair.style.cssText = `display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:${String(GAP.wide)}px;margin-top:${String(GAP.section)}px;align-items:start`;

    const monthCard = el(doc, 'div', 'everyday-contract-month');
    monthCard.style.cssText = `${CARD};padding:16px 18px`;
    monthCard.append(eyebrow(doc, view.month.heading, '0 0 6px'), note(doc, view.month.note));
    if (view.month.prompt !== undefined) {
      const prompt = el(doc, 'div', 'everyday-contract-prompt');
      prompt.style.cssText = `border:1px solid ${C.amberEdge};background:${C.amberWash};border-radius:${String(R.row)}px;padding:10px 12px;margin-top:10px;font-size:12.5px;line-height:1.5;color:${C.ink}`;
      prompt.append(el(doc, 'span', undefined, view.month.prompt), doc.createTextNode(' '));
      prompt.append(
        button(doc, 'everyday-contract-cancel', view.month.cancel, true, () => {
          host.campaignAct({ kind: 'cancel-booking' });
          draw();
        }),
      );
      monthCard.append(prompt);
    }
    const gridWrap = el(doc, 'div');
    gridWrap.style.cssText = 'margin-top:10px;display:grid;gap:4px';
    const heads = el(doc, 'div');
    heads.style.cssText = `display:grid;grid-template-columns:28px repeat(${String(view.month.heads.length)},minmax(0,1fr));gap:4px`;
    heads.append(el(doc, 'div'));
    for (const head of view.month.heads) {
      const cell = el(doc, 'div', undefined, head);
      cell.style.cssText = `${EYEBROW};text-align:center`;
      heads.append(cell);
    }
    gridWrap.append(heads);
    for (const week of view.month.weeks) {
      const row = el(doc, 'div');
      row.style.cssText = `display:grid;grid-template-columns:28px repeat(${String(view.month.heads.length)},minmax(0,1fr));gap:4px`;
      const label = el(doc, 'div', undefined, week.label);
      label.style.cssText = `${EYEBROW};align-self:center`;
      row.append(label);
      for (const cell of week.cells) {
        const box = el(doc, 'button', `everyday-contract-day everyday-contract-day-${cell.state}`, cell.mark);
        box.type = 'button';
        box.title = cell.tip;
        box.dataset['day'] = String(cell.dayIdx);
        const bookable = cell.state === 'bookable';
        box.disabled = !bookable;
        box.style.cssText = [
          `border:1px solid ${cell.state === 'today' ? C.terracotta : C.ruleLight}`,
          `border-radius:${String(R.tight)}px`,
          `background:${
            cell.state === 'cleared'
              ? '#E2EFE3'
              : cell.state === 'missed'
                ? '#F6DED6'
                : cell.state === 'works'
                  ? C.cardSunkDeep
                  : cell.state === 'bookable'
                    ? C.amberWash
                    : C.cardSunk
          }`,
          'padding:8px 0',
          `font:500 11px ${TYPE.mono}`,
          `color:${cell.state === 'missed' ? C.alarm : cell.state === 'cleared' ? C.moss : C.warmGrey}`,
          `cursor:${bookable ? 'pointer' : 'default'}`,
        ].join(';');
        if (bookable) {
          box.addEventListener('click', () => {
            host.campaignAct({ kind: 'pick-start', startIdx: cell.dayIdx });
            draw();
          });
        }
        row.append(box);
      }
      gridWrap.append(row);
    }
    monthCard.append(gridWrap);
    if (view.month.booked.length > 0) {
      monthCard.append(eyebrow(doc, 'NIGHTS BOOKED', '14px 0 6px'));
      for (const entry of view.month.booked) {
        const line = el(doc, 'div', 'everyday-contract-booked');
        line.style.cssText = `display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0;border-top:1px solid ${C.ruleLight}`;
        const when = el(doc, 'span', undefined, entry.when);
        when.style.cssText = `${MONO};color:${C.warmGrey}`;
        line.append(el(doc, 'span', undefined, entry.name), when);
        monthCard.append(line);
      }
    }
    if (view.month.worksCost !== undefined) monthCard.append(note(doc, view.month.worksCost));
    const legend = el(doc, 'div', 'everyday-contract-legend');
    legend.style.cssText = `display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:${C.warmGrey}`;
    for (const entry of view.month.legend) legend.append(el(doc, 'span', undefined, `■ ${entry}`));
    monthCard.append(legend);

    const purseCard = el(doc, 'div', 'everyday-contract-purse');
    purseCard.style.cssText = `${CARD};padding:16px 18px`;
    purseCard.append(eyebrow(doc, view.purse.heading, '0 0 6px'));
    const onHand = el(doc, 'div', 'everyday-contract-on-hand', view.purse.onHand);
    onHand.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700`;
    purseCard.append(onHand, note(doc, view.purse.note));
    const ledger = el(doc, 'div');
    ledger.style.cssText = `display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:${String(GAP.tight)}px;margin-top:12px`;
    for (const week of view.purse.weeks) {
      const card = el(doc, 'div', 'everyday-contract-week');
      card.style.cssText = `border:1px solid ${week.current ? C.amberEdge : C.ruleLight};border-radius:${String(R.row)}px;background:${week.current ? C.amberWash : C.cardSunk};padding:8px 9px`;
      const label = el(doc, 'div', undefined, week.label);
      label.style.cssText = `${EYEBROW}`;
      const value = el(doc, 'div', undefined, week.value);
      value.style.cssText = `${MONO};color:${week.current ? C.terracotta : C.ink};margin-top:3px`;
      const caption = el(doc, 'div', undefined, week.note);
      caption.style.cssText = `font-size:10.5px;color:${C.warmGrey};margin-top:2px`;
      card.append(label, value, caption);
      ledger.append(card);
    }
    purseCard.append(ledger);
    purseCard.append(eyebrow(doc, view.purse.oddsHeading, '14px 0 4px'));
    const oddsLine = el(doc, 'div');
    oddsLine.style.cssText = `${MONO};display:flex;gap:8px;align-items:baseline`;
    const now = el(doc, 'span', 'everyday-contract-failure-rate-now', view.purse.oddsNow);
    now.style.cssText = `font-size:15px;color:${C.ink}`;
    const after = el(doc, 'span', 'everyday-contract-failure-rate-after', view.purse.oddsAfter);
    after.style.cssText = `font-size:15px;color:${C.moss}`;
    oddsLine.append(now, el(doc, 'span', undefined, '→'), after);
    purseCard.append(oddsLine, note(doc, view.purse.oddsNote));
    purseCard.append(
      note(doc, view.purse.totalNote),
      note(doc, view.purse.carryNote),
      note(doc, view.purse.kitNote),
    );

    pair.append(monthCard, purseCard);
    root.append(pair);

    /* ---- the four tests and the conflict ---- */
    /* GitHub issue #567, as on the desk — the same sentence, because it is the same two sets. */
    root.append(eyebrow(doc, view.tests.eyebrow));
    root.append(note(doc, view.tests.decides, 'everyday-contract-tests-decides'));
    const testsMeta = el(doc, 'div');
    testsMeta.style.cssText = `display:flex;justify-content:space-between;gap:12px;${MONO};color:${C.warmGrey};margin-bottom:8px`;
    testsMeta.append(
      el(doc, 'span', undefined, view.tests.note),
      el(doc, 'span', 'everyday-contract-tests-held', view.tests.held),
    );
    root.append(testsMeta, testRows(doc, view.tests.rows));
    const conflict = el(doc, 'p', 'everyday-contract-conflict', view.tests.conflict);
    conflict.style.cssText = `font-size:13px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:80ch;padding:12px 14px;border-left:3px solid ${C.sun};background:${C.cardSunk}`;
    root.append(conflict);

    /* ---- the shop ---- */
    root.append(eyebrow(doc, view.shop.eyebrow), note(doc, view.shop.sub));
    const shop = el(doc, 'div', 'everyday-contract-shop');
    shop.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:${String(GAP.block)}px;margin-top:10px`;
    for (const category of view.shop.categories) {
      const card = el(doc, 'div', `everyday-contract-category everyday-contract-category-${category.id}`);
      card.style.cssText = `${CARD};padding:14px 16px`;
      const head = el(doc, 'div');
      head.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap';
      const name = el(doc, 'span', undefined, category.name);
      name.style.cssText = `font-family:${TYPE.heading};font-size:16px;font-weight:600;flex:1 1 auto`;
      const owned = el(doc, 'span', 'everyday-contract-owned', category.owned);
      owned.style.cssText = `${MONO};color:${
        category.owned.includes('fitted') ? C.moss : category.owned.includes('booked') ? '#8D6A2F' : C.faint
      }`;
      head.append(name, owned);
      const sub = el(doc, 'div', undefined, category.sub);
      sub.style.cssText = `font-size:11.5px;color:${C.warmGrey};margin-top:2px`;
      card.append(head, sub);
      for (const row of category.rows) {
        const tier = el(doc, 'button', `everyday-contract-tier everyday-contract-tier-${row.stateId}`);
        tier.type = 'button';
        tier.disabled = !row.pressable;
        tier.dataset['category'] = row.categoryId;
        tier.dataset['level'] = String(row.level);
        tier.style.cssText = [
          'display:block',
          'width:100%',
          'text-align:left',
          'margin-top:8px',
          `border:1px solid ${C.ruleLight}`,
          `border-radius:${String(R.row)}px`,
          `background:${C.cardSunk}`,
          'padding:9px 11px',
          `font-family:${TYPE.body}`,
          `color:${C.ink}`,
          `opacity:${row.pressable ? '1' : '.6'}`,
          `cursor:${row.pressable ? 'pointer' : 'not-allowed'}`,
        ].join(';');
        const tierHead = el(doc, 'div');
        tierHead.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap';
        const level = el(doc, 'span', undefined, row.levelLabel);
        level.style.cssText = `${MONO};color:${C.faint}`;
        const tierName = el(doc, 'span', undefined, row.name);
        tierName.style.cssText = 'font-size:13px;font-weight:600;flex:1 1 auto';
        const cost = el(doc, 'span', undefined, row.cost);
        cost.style.cssText = `${MONO};color:${C.ink}`;
        tierHead.append(level, tierName, cost);
        const effect = el(doc, 'div', undefined, row.effect);
        effect.style.cssText = `font-size:11.5px;color:${C.warmGrey};margin-top:3px;line-height:1.4`;
        const state = el(doc, 'div', 'everyday-contract-tier-state', row.state);
        state.style.cssText = `${MONO};margin-top:4px;color:${
          row.stateId === 'fitted'
            ? C.moss
            : row.stateId === 'past-contract'
              ? C.alarm
              : row.stateId === 'needs-below'
                ? C.faint
                : row.stateId === 'buyable'
                  ? C.moss
                  : '#8D6A2F'
        }`;
        tier.append(tierHead, effect, state);
        if (row.pressable) {
          tier.addEventListener('click', () => {
            host.campaignAct({
              kind: 'press-tier',
              towerId: tower.id,
              categoryId: row.categoryId as ShopCategoryId,
              level: row.level,
            });
            draw();
          });
        }
        card.append(tier);
      }
      shop.append(card);
    }
    root.append(shop);

    /* ---- terms and the shaft ---- */
    const bottom = el(doc, 'div');
    bottom.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:${String(GAP.block)}px;margin-top:${String(GAP.section)}px`;
    /*
     * **The contract, set out as a document** — GitHub issue #536, § D1301. Numbered clauses on a
     * paper sheet, the service levels as a list with where their bars come from said beneath them,
     * and the month's standing as the document's schedule. Every word is
     * `campaignModel.ts#contractDocumentOf`'s; the class is kept so the journey test's read of the
     * terms still finds them.
     */
    const termsCard = el(doc, 'div', 'everyday-contract-terms everyday-contract-document');
    termsCard.style.cssText = [
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.paper}`,
      'padding:20px 22px',
      'grid-column:1 / -1',
      'max-width:78ch',
    ].join(';');
    /* Read through a local: `pageTitle.test.ts` refuses the global's title spelled anywhere in the viewer. */
    const contractDoc = view.document;
    const docTitle = el(doc, 'h2', 'everyday-contract-document-title', contractDoc.title);
    docTitle.style.cssText = `font:600 13px ${TYPE.mono};letter-spacing:.2em;text-align:center;margin:0;color:${C.ink}`;
    const parties = el(doc, 'p', 'everyday-contract-document-parties', contractDoc.parties);
    parties.style.cssText = `font-size:13px;text-align:center;color:${C.warmGrey};margin:6px 0 14px;padding-bottom:12px;border-bottom:1px solid ${C.ruleLight}`;
    termsCard.append(docTitle, parties);
    for (const clause of contractDoc.clauses) {
      const block = el(doc, 'div', 'everyday-contract-clause');
      block.style.cssText = 'display:grid;grid-template-columns:2.2em minmax(0,1fr);gap:4px 8px;margin:0 0 12px';
      const number = el(doc, 'div', undefined, `${clause.number}.`);
      number.style.cssText = `${MONO};color:${C.label}`;
      const body = el(doc, 'div');
      const heading = el(doc, 'div', 'everyday-contract-clause-heading', clause.heading);
      heading.style.cssText = 'font-size:13.5px;font-weight:600';
      const text = el(doc, 'p', 'everyday-contract-clause-body', clause.body);
      text.style.cssText = `font-size:13px;line-height:1.55;color:${C.inkSoft};margin:2px 0 0;text-wrap:pretty`;
      body.append(heading, text);
      if (clause.levels !== undefined) {
        const list = el(doc, 'ol', 'everyday-contract-levels');
        list.style.cssText = `margin:6px 0 0;padding-left:1.4em;font-size:13px;line-height:1.55;color:${C.ink}`;
        for (const level of clause.levels) list.append(el(doc, 'li', 'everyday-contract-level', level.text));
        body.append(list);
      }
      if (clause.basisNote !== undefined) {
        const basis = el(doc, 'p', 'everyday-contract-basis', clause.basisNote);
        basis.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin:6px 0 0;font-style:italic`;
        body.append(basis);
      }
      block.append(number, body);
      termsCard.append(block);
    }
    const termsHeading = el(doc, 'h3', undefined, view.terms.heading);
    termsHeading.style.cssText = `font-family:${TYPE.heading};font-size:14px;font-weight:600;margin:14px 0 6px;padding-top:12px;border-top:1px solid ${C.ruleLight}`;
    termsCard.append(termsHeading);
    for (const row of view.terms.rows) {
      const line = el(doc, 'div', 'everyday-contract-term');
      line.style.cssText = `display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 0;border-top:1px solid ${C.ruleLight}`;
      const got = el(doc, 'span', undefined, row.got);
      got.style.cssText = `${MONO};color:${C.warmGrey}`;
      line.append(el(doc, 'span', undefined, row.label), got);
      termsCard.append(line);
    }
    const shaftCard = el(doc, 'div', 'everyday-contract-shaft');
    shaftCard.style.cssText = `${CARD};padding:14px 16px;background:${C.cardSunk}`;
    const shaftHeading = el(doc, 'h2', undefined, view.shaft.heading);
    shaftHeading.style.cssText = `font-family:${TYPE.heading};font-size:16px;font-weight:600;margin:0`;
    shaftCard.append(shaftHeading, note(doc, view.shaft.body), note(doc, view.shaft.body2));
    bottom.append(termsCard, shaftCard);
    root.append(bottom);

    shell.refreshBar?.();
  };

  draw();
  const stop = host.subscribe(draw);

  return {
    unmount: () => {
      stop();
      liveHost = undefined;
    },
    primary: () => {
      const tower = openTowerOf(host.campaign());
      if (tower === undefined) return;
      /*
       * Guarded as well as inert, on `postRun.ts`'s ground (a keyboard route into a handler): a
       * standing renewal is the desk's to answer, and this press used to run the day past it —
       * § D1274, and `campaignModel.ts#CONTRACT_COPY.renewalFirst` for the sentence.
       */
      if (needOf(tower)?.kind === 'renewal') return;
      /*
       * **A lost contract's press starts the month again and runs nothing** — § 3.3's red
       * *Start the month again*, wave AO lane AO-5, § D1392. It used to run the day whatever the
       * label said, and on a standard month the label never changed at 4 of 3.
       */
      if (needOf(tower)?.kind === 'lost') {
        host.campaignAct({ kind: 'answer-need', towerId: tower.id, optionId: 'start-again' });
        return;
      }
      host.runCampaignDay(tower.id);
      context.go('stage');
    },
  };
}

/**
 * § 3.3's `contract` row: `Lock it in and run day ⟨N⟩`, or the danger variant once the month is
 * over, and a note that counts the nights of works ahead.
 */
function contractBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  if (liveHost === undefined) return withoutPlaceholders(base);
  const career = liveHost.campaign();
  const tower = openTowerOf(career);
  const view = contractView(campaignInputOf(liveHost));
  if (tower === undefined || view === undefined) {
    // The label still carries § 3.3's `⟨N⟩`, and no day exists to put in it — see
    // {@link withoutPlaceholders}.
    return { ...withoutPlaceholders(base), note: NO_TOWER };
  }
  const [lockLabel, restartLabel] = base.primary.variants;
  const [nightsNote] = base.noteVariants ?? [];
  const nights = view.month.booked.reduce(
    (total, entry) => total + (entry.when.includes('–') ? 2 : 1),
    0,
  );
  /*
   * **The month is over exactly when the contract is lost** — `career.ts#contractLostSentenceOf`,
   * which asks `economy.ts#contractIsLost`, wave AO lane AO-5, § D1392. This read the terms row's
   * words (`startsWith('none')`), which only an impossible month prints, so a standard month at 4 of
   * 3 offered *Lock it in and run day N* and ran it. The press starts the month again; the note says
   * why, then what the press does.
   */
  const lostSentence = contractLostSentenceOf(tower);
  if (lostSentence !== undefined) {
    return {
      ...base,
      primary: { ...base.primary, label: restartLabel ?? base.primary.label },
      note: `${lostSentence} This starts the month again from day 1 and counts the loss.`,
    };
  }
  /*
   * § D1274: the renewal is the desk's, so this sheet runs no day over it and says why on the press.
   * Since § D1357 it stands once day 20 has closed, so the day the press would run is the next
   * month's first, and the label names that day rather than a twenty-first.
   */
  if (needOf(tower)?.kind === 'renewal') {
    return {
      ...base,
      primary: {
        ...base.primary,
        label: (lockLabel ?? '').replace('⟨N⟩', '1'),
        inert: CONTRACT_COPY.renewalFirst,
      },
      note: CONTRACT_COPY.renewalFirst,
    };
  }
  return {
    ...base,
    primary: {
      ...base.primary,
      label: (lockLabel ?? '').replace('⟨N⟩', String(tower.day)),
    },
    note:
      nights === 0
        ? 'Nothing under works. Run it as the building stands.'
        : (nightsNote ?? `${String(nights)} nights of works ahead, and those days still have to clear.`),
  };
}

/* -------------------------------------------------------------------------- *
 * The three registry rows
 * -------------------------------------------------------------------------- */

/** § 8.1's triage list. */
export const TOWERS_SCREEN: EverydayScreenModule = {
  key: 'towers',
  mount: mountTowers,
  bar: towersBar,
};

/** § 8.2's building desk. */
export const BUILDING_SCREEN: EverydayScreenModule = {
  key: 'building',
  mount: mountBuilding,
  bar: buildingBar,
};

/** § 8.3's contract sheet and § 8.4's shop. */
export const CONTRACT_SCREEN: EverydayScreenModule = {
  key: 'contract',
  mount: mountContract,
  bar: contractBar,
};
