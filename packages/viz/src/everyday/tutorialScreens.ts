/**
 * **The two-screen tutorial, drawn** — [§ D529](../../../../DECISIONS.md), GitHub issue **#380**.
 *
 * Two registered screens and one shared component:
 *
 * | key | § D529 clause 1 | what it draws |
 * |---|---|---|
 * | `tutorial` | screen one | the walkthrough, over a real run of the tutorial's building |
 * | `collapse` | screen two, `PM-DOOR` | the letter, the symptom, and the worked answer |
 *
 * Every word comes from `tutorialModel.ts` and `workedAnswer.ts`; this file is the mount and the
 * run seam, which is the split `everyday/` keeps so the words are sweepable without a document.
 *
 * ## Both screens are real runs on the real engine — § D529's own obligation
 *
 * *"Both screens are **real runs on the real engine** (`docs/10` § 5.5, § D525 clause 4), not
 * scripted mocks."* So nothing here authors a figure. {@link session} holds two recordings and both
 * are made by the shipped `recordRun`, on a worker, from configs the shipped
 * `fixit/run.ts#fixitRunPlanOf` built out of the shipped `data/` — the identical chain
 * `everyday/fixitScreen.ts` runs a fix case on, called rather than restated for `fixit/run.ts`'s
 * own stated reason (*a test that assembled its own `SimulationConfig` would vouch for a
 * reimplementation of the call site*, and a screen that did it would be worse).
 *
 * Screen one asks for one run — the building as it stands — and quotes
 * `fixit/run.ts#figureValuesOf` over it. Screen two asks for the pair, which
 * `tutorialModel.ts#workedAnswerFactsOf` reads through `fixit/run.ts#measuredOf`. **Neither draws
 * a figure before its runs land**: screen one's model says the day is being simulated instead of
 * showing an empty grid, and the worked answer draws `WORKED_ANSWER_COPY.pending` — the honest
 * thing to have on screen at the one moment a stand-in figure would be most tempting and least
 * noticed.
 *
 * ## `mountWorkedAnswer` is the component § D529 clause 2 forbids building twice
 *
 * It takes the **entry point** rather than a flag — `tutorialWorkedAnswerOf` from screen two here,
 * `rushTutorialWorkedAnswerOf` from `rushScreen.ts` — so the two uses are one function called with
 * two framings rather than two branches that can drift. `boundaries.test.ts` holds the allowlist of
 * modules allowed to import it, in the shape that file already uses for `menu/client.js`: a module
 * outside the tutorial that gains this component fails the build.
 *
 * ## Leaving, and why both ways out do the same thing
 *
 * § D476's playability condition — *skipping must advance the derived state* — is
 * {@link leave}, and it is that condition's one implementation. Skip and Finish
 * both file the tutorial's day, so a player who skips and reloads does not meet the screen they
 * dismissed. The day is a real one: `EverydayHost.startRun` runs it and `EverydayHost.closeDay`
 * files it, both of which hold all of `closeShift`'s ordinary gates.
 */

import { actionBarFor, type ActionBarModel } from './actionBar.js';
import type { VizRecording } from '../contract/types.js';
import { loadBrowserResources, loadFixitCases, type BrowserResources } from '../dev/data.js';
import { createOffThreadRunner } from '../dev/offThreadRuns.js';
import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { FIXIT_RUN_SWITCHES, figureValuesOf, fixitRunPlanOf } from '../fixit/run.js';
import type { FixitCase, FixitCases } from '../fixit/types.js';
import type { PriceSchedule } from '../pricing/types.js';
import { el, EYEBROW, CARD } from './screenDom.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';
import {
  TUTORIAL_CASE_ID,
  TUTORIAL_COPY,
  tutorialCollapseViewOf,
  tutorialWalkthroughViewOf,
  tutorialWorkedAnswerOf,
  workedAnswerFactsOf,
  type TutorialFigure,
} from './tutorialModel.js';
import { WORKED_ANSWER_COPY, type WorkedAnswerFacts, type WorkedAnswerView } from './workedAnswer.js';

/* -------------------------------------------------------------------------- *
 * The run seam — module-scope, so the worker stays warm across both screens
 * -------------------------------------------------------------------------- */

/**
 * The runner both screens cross on.
 *
 * Module-scope for `fixitScreen.ts`'s measured reason: every spawn re-imports `recordRun` and the
 * whole of `core`, and the tutorial is entered, left for the second screen, and entered again by
 * the § 3.3 bar. One runner at module scope starts no worker at import time.
 */
const runner = createOffThreadRunner({
  spawn: () => new Worker(new URL('../dev/shiftWorker.ts', import.meta.url), { type: 'module' }),
});

interface TutorialSession {
  asBuilt?: VizRecording;
  asRepaired?: VizRecording;
}

/** One session for the whole tutorial: screen two reuses the run screen one already paid for. */
const session: TutorialSession = {};

interface LoadedTutorial {
  /**
   * `BrowserResources` **is** a `FixitResources` — same five fields, structurally — so this is the
   * loader's own answer rather than a repacking of it. A second shape here would be a second
   * statement of what a run is built from, which `fixit/run.ts` exists to prevent.
   */
  readonly resources: BrowserResources;
  readonly entry: FixitCase;
  /** The schedule the cases were priced with — GitHub issue #366. */
  readonly schedule: PriceSchedule;
}

let loaded: LoadedTutorial | undefined;
let loadFailure: string | undefined;
let loadPromise: Promise<void> | undefined;
/** What the runner is doing, as `'one'` or `'pair'` — or `undefined`. */
let ask: 'one' | 'pair' | undefined;
let runFailure: string | undefined;

function entryOf(cases: FixitCases): FixitCase {
  const entry = cases.cases.find((candidate) => candidate.id === TUTORIAL_CASE_ID);
  if (entry === undefined) {
    // Honest lookup, never a substitution: a tutorial built on whichever case happened to be first
    // would be a false statement about the thing this module names. `dev/main.ts`'s own rule.
    throw new Error(`the tutorial names case "${TUTORIAL_CASE_ID}", which this build does not ship`);
  }
  return entry;
}

function ensureLoaded(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const browser = await loadBrowserResources();
      const cases = await loadFixitCases(browser);
      loaded = { resources: browser, entry: entryOf(cases), schedule: cases.schedule };
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : String(error);
    }
  })();
  return loadPromise;
}

/**
 * The diagnosed repair selected — the worked answer, as a `FixitState`.
 *
 * Read off the case rather than named here, so the answer this tutorial shows is the answer the
 * shipped file authors and `fixit/cases.test.ts` validates against a real run. A tutorial holding
 * its own copy of the repair id would be the second authored copy this module exists to avoid.
 */
function diagnosedState(entry: FixitCase, schedule: PriceSchedule) {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed === undefined) {
    throw new Error(`the tutorial's case "${entry.id}" has no diagnosed repair to show`);
  }
  return {
    state: toggleRepair(entry, emptyFixitState(), diagnosed.id, schedule),
    repair: diagnosed,
  };
}

/**
 * Ask for the runs a screen needs, unless they are in hand or already coming.
 *
 * A `'one'` ask never supersedes a `'pair'` ask: the pair produces the as-built run anyway, and
 * stealing the runner from it would abandon screen two's measurement mid-flight. That is
 * `fixitScreen.ts#measureAsBuilt`'s guard, for its reason.
 */
function request(want: 'one' | 'pair', redraw: () => void): void {
  if (loaded === undefined) return;
  if (want === 'one' && session.asBuilt !== undefined) return;
  if (want === 'pair' && session.asRepaired !== undefined) return;
  if (ask === want || ask === 'pair') return;
  const { entry, resources, schedule } = loaded;
  ask = want;
  runFailure = undefined;
  const asBuiltPlan = fixitRunPlanOf(entry, emptyFixitState(), resources);
  if (want === 'one') {
    runner.start({
      runs: [{ config: asBuiltPlan.asBuilt, ...FIXIT_RUN_SWITCHES }],
      onDone: ([asBuilt]) => {
        ask = undefined;
        if (asBuilt !== undefined) session.asBuilt = asBuilt;
        redraw();
      },
      onFailed: (message) => {
        ask = undefined;
        runFailure = message;
        redraw();
      },
    });
    return;
  }
  const repaired = fixitRunPlanOf(entry, diagnosedState(entry, schedule).state, resources);
  runner.start({
    runs: [
      { config: asBuiltPlan.asBuilt, ...FIXIT_RUN_SWITCHES },
      { config: repaired.asRepaired, ...FIXIT_RUN_SWITCHES },
    ],
    onDone: ([before, after]) => {
      ask = undefined;
      if (before !== undefined) session.asBuilt = before;
      if (after !== undefined) session.asRepaired = after;
      redraw();
    },
    onFailed: (message) => {
      ask = undefined;
      runFailure = message;
      redraw();
    },
  });
}

/* -------------------------------------------------------------------------- *
 * The worked answer, drawn — the component Rush reuses
 * -------------------------------------------------------------------------- */

/** How a caller words the answer. The two shipped ones are the tutorial's and the rush's. */
export type WorkedAnswerEntry = (facts: WorkedAnswerFacts) => WorkedAnswerView;

/** What a mounted worked answer hands back: a redraw, since its runs land late. */
export interface MountedWorkedAnswer {
  /** Re-render against whatever the session now holds. */
  redraw(): void;
}

/**
 * Draw the worked answer into `host`, running the pair if it is not already in hand.
 *
 * **This is § D529 clause 2's component and its only implementation.** Its two callers are screen
 * two below and `rushScreen.ts`; `boundaries.test.ts` fails the build on a third.
 */
export function mountWorkedAnswer(
  host: HTMLElement,
  entryPoint: WorkedAnswerEntry,
): MountedWorkedAnswer {
  const doc = host.ownerDocument;
  const root = el(doc, 'div', 'everyday-worked-answer');
  root.style.cssText = `${CARD};margin:22px 0 0;max-width:62ch;display:grid;gap:10px`;
  host.append(root);

  function render(): void {
    root.replaceChildren();
    const entry = loaded?.entry;
    const before = session.asBuilt;
    const after = session.asRepaired;
    if (entry === undefined || before === undefined || after === undefined) {
      const why = loadFailure ?? runFailure ?? WORKED_ANSWER_COPY.pending;
      const pending = el(doc, 'p', 'everyday-worked-answer-pending', why);
      pending.style.cssText = `margin:0;font-size:14px;line-height:1.5;color:${C.inkSoft}`;
      root.append(pending);
      return;
    }
    const view = entryPoint(workedAnswerFactsOf(entry, before, after));

    const heading = el(doc, 'div', 'everyday-worked-answer-heading', view.heading);
    heading.style.cssText = EYEBROW;
    const why = el(doc, 'p', 'everyday-worked-answer-why', view.why);
    why.style.cssText = `margin:0;font-size:14px;line-height:1.5;color:${C.inkSoft};text-wrap:pretty`;
    const diagnosis = el(doc, 'p', 'everyday-worked-answer-diagnosis', view.diagnosis);
    diagnosis.style.cssText = `margin:0;font-family:${TYPE.heading};font-size:19px;line-height:1.3;font-weight:650;letter-spacing:-.02em;color:${C.ink};text-wrap:pretty`;
    const reasoning = el(doc, 'p', 'everyday-worked-answer-reasoning', view.reasoning);
    reasoning.style.cssText = `margin:0;font-size:14px;line-height:1.55;color:${C.inkSoft};text-wrap:pretty`;

    const changeHeading = el(doc, 'div', 'everyday-worked-answer-change-heading', view.changeHeading);
    changeHeading.style.cssText = `${EYEBROW};margin:6px 0 0`;
    const change = el(doc, 'div', 'everyday-worked-answer-change', view.change);
    change.style.cssText = `font-size:16px;font-weight:650;color:${C.ink}`;
    const effect = el(doc, 'p', 'everyday-worked-answer-effect', view.effect);
    effect.style.cssText = `margin:0;font-size:14px;line-height:1.5;color:${C.inkSoft};text-wrap:pretty`;

    const counts = el(doc, 'div', 'everyday-worked-answer-counts');
    counts.style.cssText = `display:grid;gap:4px;margin:6px 0 0;padding:12px 14px;border:1px solid ${C.rule};border-radius:${String(R.card)}px`;
    const beforeRow = el(doc, 'div', 'everyday-worked-answer-before', view.before);
    const afterRow = el(doc, 'div', 'everyday-worked-answer-after', view.after);
    const movement = el(doc, 'div', 'everyday-worked-answer-movement', view.movement);
    for (const row of [beforeRow, afterRow]) {
      row.style.cssText = `font:500 13px ${TYPE.mono};color:${C.ink}`;
    }
    movement.style.cssText = `font-size:14px;line-height:1.5;color:${C.ink};margin:4px 0 0`;
    counts.append(beforeRow, afterRow, movement);

    const basis = el(doc, 'p', 'everyday-worked-answer-basis', view.basis);
    const boundary = el(doc, 'p', 'everyday-worked-answer-boundary', view.boundary);
    for (const note of [basis, boundary]) {
      note.style.cssText = `margin:0;font-size:12.5px;line-height:1.5;color:${C.label};text-wrap:pretty`;
    }

    root.append(
      heading,
      why,
      diagnosis,
      reasoning,
      changeHeading,
      change,
      effect,
      counts,
      basis,
      boundary,
    );
  }

  render();
  void ensureLoaded().then(() => {
    request('pair', render);
    render();
  });
  return { redraw: render };
}

/* -------------------------------------------------------------------------- *
 * Leaving — § D476's condition, one implementation for both ways out
 * -------------------------------------------------------------------------- */

/**
 * File the tutorial's day and go to the main menu.
 *
 * The same call on *Skip the tutorial* and on *Start playing*, which is what makes § D476's
 * condition hold: the week has a filed day by the time anything could reload, so
 * `tutorialModel.ts#tutorialIsDue` answers `false` on the next load whichever way the player left.
 *
 * ## Why this is three steps rather than two, and each one is a gate somebody else wrote
 *
 * The obvious form — `startRun(); closeDay();` — **files nothing**, and the reason is on
 * `EverydayHost.startRun`'s own contract: it *"returns before the run lands (the simulation is on
 * a worker); the landing arrives as a subscribe notification."* `closeDay` then meets
 * `closeShift`'s first gate — *a run nobody started files nothing* — and the derived state does not
 * move, which is § D476's condition failing silently in exactly the way it warns about.
 *
 * So the close waits for the landing, and it waits on **recording identity** rather than on
 * presence: `EverydayHost.recording`'s docstring says the object is replaced wholesale on every
 * run and that *"a screen that keeps the last reference knows a fresh recording has arrived by
 * `!==` and nothing else"*. Presence alone would have closed the run that was already on the
 * stage — on a cold load that is § D232's boot demo, which is the other run nobody started — and
 * `closeShift` would have refused that too.
 *
 * A day already closed needs none of this and is left alone, which is `closeShift`'s third gate
 * read from the caller's side rather than relied on from inside it.
 */
function leave(context: EverydayScreenShellContext): void {
  const host = context.host;
  if (!host.runState().dayClosed) {
    const standing = host.recording();
    let stop: (() => void) | undefined;
    const settle = (): void => {
      const landed = host.recording();
      if (landed === undefined || landed === standing) return;
      host.closeDay();
      stop?.();
      stop = undefined;
    };
    stop = host.subscribe(settle);
    host.startRun();
    // In case the landing beat the subscription — a no-op on the worker path, and cheap.
    settle();
  }
  context.go('menu');
}

/* -------------------------------------------------------------------------- *
 * Screen one — the walkthrough
 * -------------------------------------------------------------------------- */

function figuresFor(): readonly TutorialFigure[] {
  const entry = loaded?.entry;
  const asBuilt = session.asBuilt;
  if (entry === undefined || asBuilt === undefined) return [];
  return figureValuesOf(entry, asBuilt).map((figure, index) => ({
    id: `figure-${String(index)}`,
    label: figure.label,
    value: figure.text,
    note: entry.complaint.measure.label,
  }));
}

function mountTutorial(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const root = el(doc, 'div', 'everyday-tutorial');
  root.style.cssText = `padding:30px 32px 34px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 65%,${C.paperDeeper});min-width:0`;
  host.append(root);

  function render(): void {
    root.replaceChildren();
    const view = tutorialWalkthroughViewOf({ figures: figuresFor() });

    const eyebrow = el(doc, 'div', 'everyday-tutorial-eyebrow', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const title = el(doc, 'h1', 'everyday-tutorial-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:20ch`;
    const lede = el(doc, 'p', 'everyday-tutorial-lede', view.lede);
    lede.style.cssText = `font-size:17px;line-height:1.55;color:${C.inkSoft};margin:13px 0 0;max-width:56ch;text-wrap:pretty`;
    root.append(eyebrow, title, lede);

    const steps = el(doc, 'ol', 'everyday-tutorial-steps');
    steps.style.cssText =
      'list-style:none;margin:24px 0 0;padding:0;display:grid;gap:12px;max-width:62ch';
    for (const step of view.steps) {
      const row = el(doc, 'li', 'everyday-tutorial-step');
      row.dataset['step'] = step.id;
      row.style.cssText = `${CARD};min-width:0`;
      const control = el(doc, 'div', 'everyday-tutorial-step-control', step.control);
      control.style.cssText = EYEBROW;
      const stepTitle = el(doc, 'div', 'everyday-tutorial-step-title', step.title);
      stepTitle.style.cssText = `font-family:${TYPE.heading};font-size:18px;font-weight:650;letter-spacing:-.02em;color:${C.ink};margin:6px 0 0`;
      const body = el(doc, 'p', 'everyday-tutorial-step-body', step.body);
      body.style.cssText = `margin:6px 0 0;font-size:14px;line-height:1.5;color:${C.inkSoft};text-wrap:pretty`;
      row.append(control, stepTitle, body);
      steps.append(row);
    }
    root.append(steps);

    const figuresHeading = el(doc, 'div', 'everyday-tutorial-figures-heading', view.figuresHeading);
    figuresHeading.style.cssText = `${EYEBROW};margin:26px 0 0`;
    root.append(figuresHeading);

    if (view.figures.length > 0) {
      const grid = el(doc, 'div', 'everyday-tutorial-figures');
      grid.style.cssText =
        'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:10px 0 0;max-width:760px';
      for (const figure of view.figures) {
        const cell = el(doc, 'div', 'everyday-tutorial-figure');
        cell.dataset['figure'] = figure.id;
        cell.style.cssText = `${CARD};min-width:0`;
        const label = el(doc, 'div', 'everyday-tutorial-figure-label', figure.label);
        label.style.cssText = EYEBROW;
        const value = el(doc, 'div', 'everyday-tutorial-figure-value', figure.value);
        value.style.cssText = `font:500 20px ${TYPE.mono};color:${C.ink};margin:7px 0 0`;
        const note = el(doc, 'div', 'everyday-tutorial-figure-note', figure.note);
        note.style.cssText = `font-size:12.5px;line-height:1.45;color:${C.label};margin:6px 0 0`;
        cell.append(label, value, note);
        grid.append(cell);
      }
      root.append(grid);
    }

    const figuresNote = el(doc, 'p', 'everyday-tutorial-figures-note', view.figuresNote);
    figuresNote.style.cssText = `margin:10px 0 0;font-size:13px;line-height:1.5;color:${C.label};max-width:60ch;text-wrap:pretty`;
    root.append(figuresNote);

    const skip = el(doc, 'button', 'everyday-tutorial-skip', view.skip);
    skip.type = 'button';
    skip.style.cssText = `margin:22px 0 0;padding:10px 16px;border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.paper};color:${C.inkSoft};cursor:pointer;font-size:14px`;
    skip.addEventListener('click', () => {
      leave(context);
    });
    const skipNote = el(doc, 'p', 'everyday-tutorial-skip-note', view.skipNote);
    skipNote.style.cssText = `margin:8px 0 0;font-size:12.5px;line-height:1.5;color:${C.label};max-width:60ch;text-wrap:pretty`;
    root.append(skip, skipNote);
  }

  render();
  void ensureLoaded().then(() => {
    request('one', render);
    render();
  });

  return { primary: () => context.go('collapse') };
}

/* -------------------------------------------------------------------------- *
 * Screen two — PM-DOOR
 * -------------------------------------------------------------------------- */

function mountCollapse(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const root = el(doc, 'div', 'everyday-collapse');
  root.style.cssText = `padding:30px 32px 34px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 65%,${C.paperDeeper});min-width:0`;
  host.append(root);

  /*
   * Two regions rather than one, and the split is not cosmetic: the letter is redrawn when the case
   * file arrives, and the worked answer owns its own runs and its own redraws. One region would
   * mean re-mounting the component — and therefore re-asking for a pair of runs — every time the
   * header moved.
   */
  const header = el(doc, 'div', 'everyday-collapse-header');
  const answerHost = el(doc, 'div', 'everyday-collapse-answer');
  const footer = el(doc, 'div', 'everyday-collapse-footer');
  root.append(header, answerHost, footer);

  function render(): void {
    header.replaceChildren();
    footer.replaceChildren();
    const entry = loaded?.entry;
    const view = tutorialCollapseViewOf({
      complaint: entry?.complaint.text,
      complainer: entry?.complaint.complainer,
      symptom: entry?.symptom,
    });

    const eyebrow = el(doc, 'div', 'everyday-collapse-eyebrow', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const title = el(doc, 'h1', 'everyday-collapse-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:20ch`;
    const lede = el(doc, 'p', 'everyday-collapse-lede', view.lede);
    lede.style.cssText = `font-size:17px;line-height:1.55;color:${C.inkSoft};margin:13px 0 0;max-width:56ch;text-wrap:pretty`;
    header.append(eyebrow, title, lede);

    if (view.symptom !== undefined) {
      const symptomHeading = el(doc, 'div', 'everyday-collapse-symptom-heading', view.symptomHeading);
      symptomHeading.style.cssText = `${EYEBROW};margin:24px 0 0`;
      const symptom = el(doc, 'p', 'everyday-collapse-symptom', view.symptom);
      symptom.style.cssText = `margin:8px 0 0;font-size:16px;line-height:1.5;color:${C.ink};max-width:60ch;text-wrap:pretty`;
      header.append(symptomHeading, symptom);
    }

    if (view.complaint !== undefined) {
      const complaintHeading = el(doc, 'div', 'everyday-collapse-complaint-heading', view.complaintHeading);
      complaintHeading.style.cssText = `${EYEBROW};margin:22px 0 0`;
      const complaint = el(doc, 'blockquote', 'everyday-collapse-complaint', view.complaint);
      complaint.style.cssText = `margin:8px 0 0;padding:0 0 0 14px;border-left:2px solid ${C.rule};font-size:16px;line-height:1.55;color:${C.ink};max-width:60ch;text-wrap:pretty`;
      header.append(complaintHeading, complaint);
      if (view.complainer !== undefined) {
        const who = el(doc, 'div', 'everyday-collapse-complainer', view.complainer);
        who.style.cssText = `margin:6px 0 0 16px;font-size:13px;color:${C.label}`;
        header.append(who);
      }
    }

    const finishNote = el(doc, 'p', 'everyday-collapse-finish-note', view.finishNote);
    finishNote.style.cssText = `margin:18px 0 0;font-size:12.5px;line-height:1.5;color:${C.label};max-width:60ch;text-wrap:pretty`;
    footer.append(finishNote);
  }

  render();
  /*
   * The component, not a copy of it. Screen two and the rush setup screen call the same function
   * with their own entry point, which is § D529 clause 2's *building it twice* prevented in the one
   * place a build can prevent it — and it is mounted once, outside `render`, because it owns the
   * pair of runs it draws.
   */
  const worked = mountWorkedAnswer(answerHost, tutorialWorkedAnswerOf);
  void ensureLoaded().then(() => {
    render();
    worked.redraw();
  });

  return { primary: () => leave(context) };
}

/* -------------------------------------------------------------------------- *
 * The registry rows
 * -------------------------------------------------------------------------- */

export const TUTORIAL_SCREEN: EverydayScreenModule = {
  key: 'tutorial',
  mount: mountTutorial,
};

export const COLLAPSE_SCREEN: EverydayScreenModule = {
  key: 'collapse',
  /*
   * The § 3.3 row's primary reads *Start playing* and files the day. No refinement is needed for
   * the table's own row; this one exists only so the note follows the pending state, which the
   * table cannot know.
   */
  bar(state): ActionBarModel {
    const base = actionBarFor(state);
    return session.asRepaired === undefined
      ? { ...base, note: TUTORIAL_COPY.collapsePending }
      : base;
  },
  mount: mountCollapse,
};
