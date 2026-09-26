/**
 * **A campaign stage in the fix-it editor's shell — the mount** — [§ D1129](../../../../DECISIONS.md),
 * the swarm's Q3 ruling, clauses 2 to 4.
 *
 * The Scenario hub's stage row calls {@link openStageInFixit} and goes to the `fixit` screen, and
 * `fixitScreen.ts#FIXIT_SCREEN` mounts this instead of a case while a stage is open. That is how a
 * stage is played *in the fix-it editor* without an eighteenth screen key and without a second copy
 * of the fix-it screen: the screen, its rail row, its § 3.3 bar row and its leave label are the
 * fix-it screen's, and this file draws the stage's body into it.
 *
 * ## What this file decides: nothing
 *
 * `fixitScreen.ts`'s rule, kept: every decision is somebody else's. What a move costs and whether
 * it may run is `campaign/stagePress.ts#admitStageMove`'s; the verdict is
 * `campaign/stagePress.ts#pressStage`'s (the stage's own judge on its tuning and holdout seeds);
 * every word is `everyday/stagePlay.ts`'s, where the honesty sweep drives it; whether the stage is
 * offered is `scenario/ladder.ts#scenarioLadderOf`'s, with the one check's refusals. This draws them
 * and forwards presses. Its own literal is the load-failure line's detail.
 *
 * ## The run is on a worker
 *
 * Each batch goes to `dev/batchWorker.ts`, the worker the Engineer Lab plays stages on, so a press
 * does not hold the painting thread. The controls stay live while it runs, and a verdict that lands
 * after the settings moved is drawn stale with the press given back (§ D1011's rule on the fix-it
 * screen, and the Q2 ruling's *"an edit makes the pending verdict stale"*).
 *
 * ## A clear pays once, through the existing earn route
 *
 * `context.host.bankScenarioClear(stage.id)` is the same call a fixed fix case makes: the device
 * ledger's `withTurn` records it first time only, and the server's earn route pays
 * `data/chime-ledger.json`'s `scenario-cleared` award once per account per scenario. Whether this
 * clear was the first is read off the device record **before** banking, so the page's pay line says
 * which of the two happened. Nothing is unlocked, because nothing on the path is locked.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { loadBrowserResources, loadCampaign, type BrowserResources, type LoadedCampaign } from '../dev/data.js';
import type { BatchRequest, BatchResult, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import { pressStage, routeRefusalsOf, stageUnitsAt, type StageAdmissionContext } from '../campaign/stagePress.js';
import type { StageSeedSet } from '../campaign/stageRun.js';
import type { CampaignStage } from '../campaign/types.js';
import type { EditorParkingStrategy } from '../fixit/types.js';
import { scenarioLadderOf } from '../scenario/ladder.js';
import { actionBarFor, type ActionBarModel } from './actionBar.js';
import { everydayDeviceChimeStore } from './chimeStore.js';
import { CHIME_AWARDS } from './deviceChimes.js';
import { scenarioOpen } from './scenarioOpenPort.js';
import { el } from './screenDom.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  STAGE_PLAY_COPY as COPY,
  namedStageMoveOf,
  stageFactsOf,
  stageMoveOf,
  stagePlayViewOf,
  verdictFactsOf,
  type StagePlayChoice,
  type StagePlayPhase,
  type StagePlayView,
} from './stagePlay.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';
import type { EverydayState } from './types.js';

/* ------------------------------------------------------------------------- *
 * Which stage is open
 * ------------------------------------------------------------------------- */

let openStageId: string | undefined;

/**
 * Open a stage in the fix-it editor. `everyday/scenarioScreen.ts`'s stage row is the one caller,
 * immediately before it goes to the `fixit` screen.
 */
export function openStageInFixit(stageId: string): void {
  openStageId = stageId;
  /*
   * A press from the hub is a fresh visit: the settings the player last chose are kept, and the
   * verdict they last read is not, so the primary offers a run rather than the way back. A run still
   * in flight keeps its phase, because it will land on this page.
   */
  const session = sessions.get(stageId);
  if (session !== undefined && session.phase.kind !== 'running') {
    session.phase = { kind: 'idle' };
    session.pressed = undefined;
  }
}

/**
 * Close it, so the `fixit` screen shows its cases again. Called by the hub's *Fix a building* entry,
 * by this mount's own way back, and when the mount is torn down — a stage is opened by pressing its
 * row, never by arriving on the screen some other way.
 */
export function closeStageInFixit(): void {
  openStageId = undefined;
}

/** The stage open in the fix-it editor, or `undefined` while it shows its cases. */
export function stageOpenInFixit(): string | undefined {
  return openStageId;
}

/* ------------------------------------------------------------------------- *
 * Data, once per tab
 * ------------------------------------------------------------------------- */

interface Loaded {
  readonly resources: BrowserResources;
  readonly campaign: LoadedCampaign;
}

let loaded: Loaded | undefined;
let loadFailure: string | undefined;
let loadPromise: Promise<void> | undefined;

function ensureLoaded(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const resources = await loadBrowserResources();
      loaded = { resources, campaign: await loadCampaign(resources) };
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : String(error);
    }
  })();
  return loadPromise;
}

/* ------------------------------------------------------------------------- *
 * Per-stage session: what is chosen, and where the press is
 * ------------------------------------------------------------------------- */

interface Session {
  choice: StagePlayChoice;
  phase: StagePlayPhase;
  /** The choice the phase's verdict or run was made on; a verdict is stale once `choice` leaves it. */
  pressed: StagePlayChoice | undefined;
}

const sessions = new Map<string, Session>();
let worker: Worker | undefined;
let runToken = 0;
/** The mount a landed run redraws — `fixitScreen.ts`'s `live`, for the same reason. */
let live: { readonly redraw: () => void; readonly refreshBar: () => void } | undefined;

function sessionOf(stage: CampaignStage): Session {
  let session = sessions.get(stage.id);
  if (session === undefined) {
    session = {
      choice: { profileId: stage.dispatcher.startingProfileId, parking: null },
      phase: { kind: 'idle' },
      pressed: undefined,
    };
    sessions.set(stage.id, session);
  }
  return session;
}

function sameChoice(a: StagePlayChoice | undefined, b: StagePlayChoice): boolean {
  return a !== undefined && a.profileId === b.profileId && a.parking === b.parking;
}

/** Everything one stage's facts are derived from, or `undefined` while it cannot be read. */
function stageContextOf(data: Loaded, stageId: string):
  | {
      readonly stage: CampaignStage;
      readonly position: number;
      readonly total: number;
      readonly context: StageAdmissionContext;
      readonly held: string | undefined;
    }
  | undefined {
  const stages = data.campaign.campaign.stages;
  const position = stages.findIndex((stage) => stage.id === stageId);
  const stage = stages[position];
  if (stage === undefined) return undefined;
  const profiles = data.resources.dispatcherProfiles.profiles;
  const baseline = profiles.find((profile) => profile.id === stage.dispatcher.startingProfileId);
  const building = data.resources.buildings.find((entry) => entry.id === stage.building);
  if (baseline === undefined || building === undefined) return undefined;
  const route = {
    space: data.campaign.space,
    schedule: data.resources.priceSchedule,
    profiles,
    buildings: data.resources.buildings,
    elevatorSpecs: data.resources.elevatorSpecs,
    /* § D1183: a way through the census found on this page is published under the page's own name. */
    moveNamed: (name: string) => namedStageMoveOf(name, profiles, data.campaign.space),
  };
  /* The hub's own derivation, so this page holds a stage exactly when the hub's row does. */
  const rung = scenarioLadderOf({
    stages,
    survivors: data.campaign.survivors,
    refusalOf: routeRefusalsOf(stages, route),
  }).find((entry) => entry.id === stage.id);
  return {
    stage,
    position: position + 1,
    total: stages.length,
    context: {
      space: data.campaign.space,
      schedule: data.resources.priceSchedule,
      baseline,
      building,
      elevatorSpecs: data.resources.elevatorSpecs,
    },
    held: rung === undefined ? COPY.notFound : rung.offer === 'held' ? rung.heldReason : undefined,
  };
}

function viewOf(data: Loaded, stageId: string): { readonly view: StagePlayView; readonly admitted: boolean; readonly held: boolean } | undefined {
  const found = stageContextOf(data, stageId);
  if (found === undefined) return undefined;
  const session = sessionOf(found.stage);
  const building = found.context.building;
  if (building === undefined) return undefined;
  const facts = stageFactsOf({
    stage: found.stage,
    position: found.position,
    total: found.total,
    building,
    context: found.context,
    profiles: data.resources.dispatcherProfiles.profiles,
    schedule: data.resources.priceSchedule,
    held: found.held,
    award: CHIME_AWARDS.awards['scenario-cleared'] ?? 0,
    choice: session.choice,
  });
  const phase: StagePlayPhase =
    session.phase.kind === 'judged'
      ? { ...session.phase, stale: !sameChoice(session.pressed, session.choice) }
      : session.phase;
  return { view: stagePlayViewOf(facts, phase), admitted: facts.admission.admitted, held: found.held !== undefined };
}

/* ------------------------------------------------------------------------- *
 * One batch on the worker
 * ------------------------------------------------------------------------- */

function stopWorker(): void {
  worker?.terminate();
  worker = undefined;
}

function runOneBatch(
  request: BatchRequest,
  onProgress: (completed: number, total: number) => void,
): Promise<BatchResult> {
  return new Promise<BatchResult>((resolve, reject) => {
    stopWorker();
    const next = new Worker(new URL('../dev/batchWorker.ts', import.meta.url), { type: 'module' });
    worker = next;
    next.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as BatchWorkerMessage;
      if (message.kind === 'progress') {
        onProgress(message.progress.completed, message.progress.total);
        return;
      }
      stopWorker();
      if (message.kind === 'failed') reject(new Error(message.message));
      else resolve(message.result);
    });
    next.addEventListener('error', (event: ErrorEvent) => {
      stopWorker();
      reject(new Error(event.message));
    });
    next.postMessage({ kind: 'run', request, savedProfiles: [] } satisfies BatchWorkerRequest);
  });
}

/** Press the stage: the one check, then its own judge on both seed sets. */
function press(data: Loaded, stageId: string, context: EverydayScreenShellContext): void {
  const found = stageContextOf(data, stageId);
  if (found === undefined || found.held !== undefined) return;
  const session = sessionOf(found.stage);
  if (session.phase.kind === 'running') return;
  const published = data.campaign.published.scenarios.find((entry) => entry.id === found.stage.id);
  const profiles: readonly DispatcherProfile[] = data.resources.dispatcherProfiles.profiles;
  const move = stageMoveOf(session.choice, profiles, found.context);
  if (published === undefined || move === undefined) return;
  const pressedChoice = session.choice;
  const token = ++runToken;
  const host = context.host;
  session.pressed = pressedChoice;
  session.phase = { kind: 'running', seedSet: 'tuning', completed: 0, total: 0 };
  live?.redraw();
  live?.refreshBar();

  void pressStage({
    stage: found.stage,
    published,
    context: found.context,
    move,
    /* The base rung: nothing on this screen sells a wider one, and the census counts it first. */
    budgetUnits: stageUnitsAt(found.stage, null),
    run: (request: BatchRequest, seedSet: StageSeedSet) =>
      runOneBatch(request, (completed, total) => {
        if (token !== runToken) return;
        session.phase = { kind: 'running', seedSet, completed, total };
        live?.redraw();
      }),
  }).then(
    (result) => {
      if (token !== runToken) return;
      if (result.kind === 'refused') {
        session.phase = { kind: 'idle' };
      } else {
        const report = result.outcome.verdict;
        let paid: 'first' | 'again' | undefined;
        if (report.cleared) {
          const before = everydayDeviceChimeStore()
            .record()
            .turns.some((turn) => turn.completion === 'scenario-cleared' && turn.key === found.stage.id);
          host.bankScenarioClear(found.stage.id);
          paid = before ? 'again' : 'first';
        }
        session.phase = { kind: 'judged', verdict: verdictFactsOf(report, paid), stale: false };
      }
      live?.redraw();
      live?.refreshBar();
    },
    () => {
      if (token !== runToken) return;
      session.phase = { kind: 'failed' };
      live?.redraw();
      live?.refreshBar();
    },
  );
}

/* ------------------------------------------------------------------------- *
 * The mount
 * ------------------------------------------------------------------------- */

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

function selectOf(
  doc: Document,
  className: string,
  label: string,
  options: readonly { readonly value: string; readonly label: string; readonly disabled?: boolean; readonly selected: boolean }[],
): HTMLSelectElement {
  const select = el(doc, 'select', className);
  select.setAttribute('aria-label', label);
  select.style.cssText = `font:500 13.5px ${TYPE.body};padding:7px 9px;border:1px solid ${C.rule};border-radius:${R.card};background:${C.card};color:${C.ink};max-width:100%`;
  for (const option of options) {
    const node = el(doc, 'option', undefined, option.label);
    node.value = option.value;
    node.disabled = option.disabled === true;
    node.selected = option.selected;
    select.append(node);
  }
  return select;
}

function para(doc: Document, className: string, text: string, css: string): HTMLElement {
  const node = el(doc, 'p', className, text);
  node.style.cssText = `margin:0;max-width:64ch;text-wrap:pretty;${css}`;
  return node;
}

export function mountStagePlay(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;
  const root = el(doc, 'div', 'everyday-stage-play');
  root.style.cssText = `display:grid;gap:14px;padding:26px 30px 34px;min-width:0;background:${C.paper}`;
  host.append(root);
  live = { redraw: () => render(), refreshBar: () => context.refreshBar() };

  function render(): void {
    if (!alive) return;
    root.replaceChildren();
    const stageId = openStageId;
    if (loadFailure !== undefined) {
      root.append(para(doc, 'everyday-stage-play-failure', `${COPY.loadFailed} (${loadFailure})`, `color:${C.alarm};font-size:13px`));
      return;
    }
    if (loaded === undefined || stageId === undefined) {
      root.append(para(doc, 'everyday-stage-play-loading', COPY.loading, `color:${C.warmGrey};font-size:13px`));
      return;
    }
    const drawn = viewOf(loaded, stageId);
    if (drawn === undefined) {
      root.append(para(doc, 'everyday-stage-play-missing', COPY.notFound, `color:${C.inkSoft};font-size:14px`));
      return;
    }
    const { view } = drawn;
    const data = loaded;
    const stage = stageContextOf(data, stageId)?.stage;
    if (stage === undefined) return;
    const session = sessionOf(stage);

    const head = el(doc, 'header', 'everyday-stage-play-head');
    head.style.cssText = 'display:grid;gap:6px;min-width:0';
    const eyebrow = el(doc, 'div', 'everyday-stage-play-eyebrow', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const title = el(doc, 'h1', 'everyday-stage-play-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:34px;line-height:1.05;font-weight:700;letter-spacing:-.02em;margin:0;color:${C.ink}`;
    const building = el(doc, 'div', 'everyday-stage-play-building', view.buildingLine);
    building.style.cssText = `font:500 12px ${TYPE.mono};letter-spacing:.03em;color:${C.warmGrey}`;
    const teaches = para(doc, 'everyday-stage-play-teaches', view.teaches, `font-size:15px;line-height:1.5;color:${C.inkSoft}`);
    head.append(eyebrow, title, building, teaches);
    root.append(head);

    const letter = el(doc, 'section', 'everyday-stage-play-letter');
    letter.style.cssText = `display:grid;gap:8px;padding:16px 18px;border:1px solid ${C.rule};border-radius:${R.card};background:${C.card};min-width:0`;
    for (const line of view.letter) {
      letter.append(para(doc, 'everyday-stage-play-letter-line', line, `font-size:14px;line-height:1.55;color:${C.ink}`));
    }
    root.append(letter);

    if (view.held !== undefined) {
      root.append(para(doc, 'everyday-stage-play-held', view.held, `font-size:14px;line-height:1.55;color:${C.inkSoft}`));
    } else {
      const controls = el(doc, 'section', 'everyday-stage-play-controls');
      controls.style.cssText = 'display:grid;gap:10px;min-width:0';
      controls.append(para(doc, 'everyday-stage-play-budget', view.budgetLine, `font:500 13px ${TYPE.mono};color:${C.ink}`));

      const setting = el(doc, 'label', 'everyday-stage-play-setting');
      setting.style.cssText = 'display:grid;gap:4px;min-width:0';
      const settingName = el(doc, 'span', undefined, view.settingLabel);
      settingName.style.cssText = 'font-size:13px;font-weight:600';
      const settingSelect = selectOf(doc, 'everyday-stage-play-setting-select', view.settingLabel, view.settingOptions);
      settingSelect.addEventListener('change', () => {
        session.choice = { ...session.choice, profileId: settingSelect.value };
        render();
        context.refreshBar();
      });
      setting.append(settingName, settingSelect);

      const parking = el(doc, 'label', 'everyday-stage-play-parking');
      parking.style.cssText = 'display:grid;gap:4px;min-width:0';
      const parkingName = el(doc, 'span', undefined, `${view.parking.label} · ${view.parking.priced}`);
      parkingName.style.cssText = 'font-size:13px;font-weight:600';
      const parkingSelect = selectOf(
        doc,
        'everyday-stage-play-parking-select',
        view.parking.label,
        view.parking.options.map((option) => ({ value: option.value ?? '', label: option.label, selected: option.selected })),
      );
      parkingSelect.addEventListener('change', () => {
        session.choice = {
          ...session.choice,
          parking: parkingSelect.value === '' ? null : (parkingSelect.value as EditorParkingStrategy),
        };
        render();
        context.refreshBar();
      });
      parking.append(parkingName, parkingSelect);
      controls.append(setting, parking);

      if (view.refusal !== undefined) {
        controls.append(para(doc, 'everyday-stage-play-refusal', view.refusal, `font-size:13.5px;line-height:1.5;color:${C.alarm}`));
      }
      controls.append(para(doc, 'everyday-stage-play-run-note', view.runNote, `font-size:13px;line-height:1.5;color:${C.warmGrey}`));
      if (view.status !== undefined) {
        const status = para(doc, 'everyday-stage-play-status', view.status, `font:500 12.5px ${TYPE.mono};color:${C.inkSoft}`);
        status.setAttribute('role', 'status');
        controls.append(status);
      }
      root.append(controls);
    }

    if (view.verdict !== undefined) {
      const verdict = el(doc, 'section', 'everyday-stage-play-verdict');
      verdict.dataset.cleared = view.verdict.head === COPY.clearedHead ? 'yes' : 'no';
      verdict.style.cssText = `display:grid;gap:8px;padding:16px 18px;border:1px solid ${C.rule};border-radius:${R.card};background:${C.cardSunk};min-width:0`;
      const verdictHead = el(doc, 'h2', 'everyday-stage-play-verdict-head', view.verdict.head);
      verdictHead.style.cssText = `font-family:${TYPE.heading};font-size:22px;font-weight:650;margin:0;color:${C.ink}`;
      verdict.append(verdictHead);
      if (view.verdict.stale !== undefined) {
        verdict.append(para(doc, 'everyday-stage-play-stale', view.verdict.stale, `font-size:13px;color:${C.alarm}`));
      }
      verdict.append(para(doc, 'everyday-stage-play-headline', view.verdict.headline, `font-size:14px;line-height:1.5;color:${C.inkSoft}`));
      const goals = el(doc, 'ul', 'everyday-stage-play-goals');
      goals.style.cssText = 'list-style:none;margin:0;padding:0;display:grid;gap:6px';
      for (const goal of view.verdict.goals) {
        const item = el(doc, 'li', 'everyday-stage-play-goal', `${goal.label} · ${goal.mark}. ${goal.sentence}`);
        item.style.cssText = `font-size:13.5px;line-height:1.5;color:${C.ink}`;
        goals.append(item);
      }
      verdict.append(goals);
      verdict.append(para(doc, 'everyday-stage-play-holdout', view.verdict.holdout, `font-size:13px;line-height:1.5;color:${C.inkSoft}`));
      if (view.verdict.pay !== undefined) {
        verdict.append(para(doc, 'everyday-stage-play-pay', view.verdict.pay, `font-size:14px;font-weight:600;color:${C.ink}`));
      }
      if (view.verdict.unlock !== undefined) {
        verdict.append(para(doc, 'everyday-stage-play-unlock', view.verdict.unlock, `font-size:13px;color:${C.inkSoft}`));
      }
      root.append(verdict);
    }

    const lab = el(doc, 'div', 'everyday-stage-play-lab');
    lab.style.cssText = 'display:grid;gap:4px;min-width:0';
    const labButton = el(doc, 'button', 'everyday-stage-play-lab-link', view.labLink);
    labButton.type = 'button';
    labButton.style.cssText = `justify-self:start;font:500 13px ${TYPE.body};padding:0;border:none;background:transparent;color:${C.terracotta};text-decoration:underline;cursor:pointer`;
    labButton.addEventListener('click', () => {
      /* § D787's order: the swap first, then the stage, in one turn. */
      context.enterEngineer();
      scenarioOpen()?.openStage(stage.id);
    });
    lab.append(labButton, para(doc, 'everyday-stage-play-lab-note', view.labNote, `font-size:12.5px;color:${C.warmGrey}`));
    root.append(lab);
  }

  if (loaded === undefined && loadFailure === undefined) {
    render();
    void ensureLoaded().then(() => {
      if (!alive) return;
      render();
      context.refreshBar();
    });
  } else {
    render();
    context.refreshBar();
  }

  return {
    unmount: () => {
      alive = false;
      live = undefined;
      /* A stage is opened by pressing its row; leaving the screen closes it. The run in flight is its own. */
      closeStageInFixit();
    },
    primary: () => {
      const stageId = openStageId;
      if (loaded === undefined || stageId === undefined) return;
      const stage = stageContextOf(loaded, stageId)?.stage;
      if (stage === undefined) return;
      if (stageSettled(stage)) {
        closeStageInFixit();
        context.go('scenario');
        return;
      }
      press(loaded, stageId, context);
    },
  };
}

/** Cleared, and the settings on screen are the ones the clear was measured on. */
function stageSettled(stage: CampaignStage): boolean {
  const session = sessions.get(stage.id);
  return (
    session !== undefined &&
    session.phase.kind === 'judged' &&
    session.phase.verdict.cleared &&
    sameChoice(session.pressed, session.choice)
  );
}

/**
 * The § 3.3 row while a stage is open — the fix-it row, refined with the stage's own words. The
 * variants are replaced rather than picked from, because *Run the day* and *Next building* would
 * each be false of a stage.
 */
export function stagePlayBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  const variants = [COPY.runLabel, COPY.runAgainLabel, COPY.backLabel];
  const primaryWith = (label: string, inert?: string): ActionBarModel['primary'] => ({
    ...base.primary,
    label,
    variants,
    ...(inert === undefined ? {} : { inert }),
  });
  const stageId = openStageId;
  if (loaded === undefined || stageId === undefined) {
    return { ...base, primary: primaryWith(COPY.runLabel, COPY.loadingWhy), note: COPY.noteReady };
  }
  const found = stageContextOf(loaded, stageId);
  const drawn = viewOf(loaded, stageId);
  if (found === undefined || drawn === undefined || drawn.held) {
    return { ...base, primary: primaryWith(COPY.runLabel, COPY.heldWhy), note: COPY.noteReady };
  }
  const session = sessionOf(found.stage);
  if (session.phase.kind === 'running') {
    return { ...base, primary: primaryWith(COPY.runningLabel, COPY.runningWhy), note: COPY.noteReady };
  }
  if (stageSettled(found.stage)) {
    return { ...base, primary: primaryWith(COPY.backLabel), note: COPY.noteSolved, inverted: true };
  }
  if (!drawn.admitted) {
    return { ...base, primary: primaryWith(COPY.runLabel, COPY.refusedWhy), note: COPY.noteReady };
  }
  const ran = session.phase.kind === 'judged';
  return { ...base, primary: primaryWith(ran ? COPY.runAgainLabel : COPY.runLabel), note: COPY.noteReady };
}
