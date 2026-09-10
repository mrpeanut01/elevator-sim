/**
 * **The landing page, drawn — and the one block on it that is not words** — GitHub issue #244.
 *
 * Every word on this screen comes from `landingView.ts`; this file is the mount, which is the split
 * `everyday/` keeps so the copy is sweepable without a document. What it authors of its own is a
 * **run**, and a run is not a string the honesty search can read.
 *
 * ## The block that shows the game in motion, and why it is a real simulation
 *
 * The issue's second criterion is *"it shows the game in motion rather than describing it"*. There
 * were three ways to do that and only one of them is available to this repository.
 *
 * A **video or an animated image** was refused on two grounds, and the second is the one that
 * decides it: it would cost more compressed bytes than the whole shipped bundle currently weighs,
 * and it would be a picture of a run rather than a run. A landing page whose motion is a recording
 * of a good day is the exact thing this project spends its engineering effort refusing — the first
 * screen a stranger meets would be the one place in the product where the pictures are curated.
 *
 * A **decorative animation** — cars sliding up and down a drawn shaft, driven by nothing — is the
 * same objection with less bandwidth.
 *
 * So the block runs the simulator. One short morning, on a building that ships, at a pinned seed,
 * simulated **in a worker** and played back on the same painter the stage uses. Nothing about it is
 * chosen to flatter: the seed is fixed, so it is the same morning every visit and cannot be
 * re-rolled until it looks good, and the caption names the tower it is running rather than
 * asserting one.
 *
 * ## What it costs, and why it is off the main thread
 *
 * `dev/mainThreadSimulation.test.ts` is the register of modules that simulate on the thread that
 * paints, and this file deliberately does not join it: the run crosses `dev/offThreadRuns.ts` on a
 * worker, exactly as the fix-a-building screen's does, so the page paints its words immediately and
 * the canvas fills in when the morning arrives. The runner is module-scope so the worker stays warm
 * across visits, and it spawns lazily so importing this module starts nothing.
 *
 * The recording is cached at module scope for the same reason: leaving the landing page and coming
 * back re-uses the morning it already has rather than paying for it twice.
 *
 * ## The three arms, and the one that matters most
 *
 * `pending`, `playing` and `unavailable` are all drawn, all captioned, and all swept. The third is
 * the one worth naming: a page that showed a still frame and said nothing when its run had failed
 * would be describing a thing it was failing to show, which is the defect this whole block exists
 * to avoid. It says so instead, and everything else on the page is unaffected.
 */

import type { ResolvedBuilding, SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { loadBrowserResources, type BrowserResources } from '../dev/data.js';
import { createOffThreadRunner } from '../dev/offThreadRuns.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt } from '../frame/overlay.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { drawCutaway, sizeCanvas } from './cutaway.js';
import { landingViewOf, type LandingMotionState, type LandingView } from './landingView.js';
import { everydayProfileStore } from './profileStore.js';
import { tutorialIsDue } from './tutorialModel.js';
import type { EverydayScreenModule } from './screens.js';
import { el } from './screenDom.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import { stageGeometryOf } from './stageScreenModel.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

/* -------------------------------------------------------------------------- *
 * The run the block plays
 * -------------------------------------------------------------------------- */

/**
 * **Which morning, and every part of it pinned.**
 *
 * The building is the primary validation tower — the one the closed-form check is run against — for
 * two reasons that happen to agree. It is busy enough at this arrival rate that a visitor sees
 * queues form and thin, which is the thing the owner's own statement of the game says is the fun;
 * and it is the building the fourth claim on this page is *about*, so the page is running the tower
 * whose numbers it cites.
 *
 * The seed is fixed rather than drawn from the clock. That is not determinism for its own sake: a
 * landing page that re-rolled its morning until it looked good would be curating, and a fixed seed
 * is the cheapest possible proof that it is not. Every visitor sees the same morning, and it is
 * whatever that morning happens to be.
 *
 * Five minutes of demand is short enough to loop without being a slideshow and cheap enough that
 * the worker answers well inside a visit — the same tower's eight-seed challenge press measures in
 * the low hundreds of milliseconds, and this is one seed of a shorter day.
 */
const LANDING_RUN = Object.freeze({
  buildingId: 'midtown-office',
  dispatcherId: 'collective',
  seed: 20_260_910n,
  durationS: 300,
  arrivalRatePctPop5min: 8,
  /** Simulated seconds per real second — a queue you can watch build rather than a time-lapse. */
  speedSimPerRealS: 12,
  /**
   * Where the loop starts, in simulated seconds — **measured, not chosen.**
   *
   * At this seed the first passenger arrives at 4.7 s, so a block that opened at the recording's
   * own start would spend its first seconds on an empty lobby and four parked cars. That is the
   * building this page is about, honestly drawn, and it is a bad first four seconds; a visitor who
   * looks away in them has seen nothing move.
   *
   * Thirty seconds in, the morning is under way. Rounded rather than pinned to the arrival, because
   * a window keyed to one passenger's second would move the day a seed changed and nobody would
   * know why.
   */
  loopFromS: 30,
});

/**
 * The runner every landing-page run crosses on — module-scope, so its worker stays warm and so the
 * expression is a bundler seam rather than something the shell has to inject.
 *
 * Written out here on `everyday/fixitScreen.ts`'s established ground: the shell hands a screen no
 * worker, and this file is DOM-bound and outside the honesty search's driven corpus either way.
 */
const runner = createOffThreadRunner({
  spawn: () => new Worker(new URL('../dev/shiftWorker.ts', import.meta.url), { type: 'module' }),
});

/** What the block has, once. Cached across mounts — a second visit re-uses the morning it has. */
let recording: VizRecording | undefined;
/** The tower's own name, for the caption. Held beside the recording so the two cannot disagree. */
let buildingName = '';
/** `true` once the run has been asked for, so a second mount does not ask again. */
let asked = false;
/** Set when the resources or the run refused. The block says so rather than showing a still frame. */
let unavailable = false;
/** The mounted screen a landed run should redraw — the live one, never the one that asked. */
let live: { redraw(): void } | undefined;

let resourcesPromise: Promise<BrowserResources | undefined> | undefined;

function resources(): Promise<BrowserResources | undefined> {
  resourcesPromise ??= loadBrowserResources().then(
    (loaded) => loaded,
    () => undefined,
  );
  return resourcesPromise;
}

/** The morning, as a configuration. Every field of it comes from {@link LANDING_RUN}. */
function configFor(loaded: BrowserResources, building: ResolvedBuilding): SimulationConfig {
  const dispatcherProfile = loaded.dispatcherProfiles.profiles.find(
    (profile) => profile.id === LANDING_RUN.dispatcherId,
  );
  if (dispatcherProfile === undefined) {
    throw new Error(`the landing page asked for a dispatcher the reference data does not carry.`);
  }
  return {
    building,
    dispatcherProfile,
    dispatcherProfiles: loaded.dispatcherProfiles,
    trafficProfiles: loaded.trafficProfiles,
    elevatorSpecs: loaded.elevatorSpecs,
    seed: LANDING_RUN.seed,
    durationS: LANDING_RUN.durationS,
    demand: { arrivalRatePctPop5min: LANDING_RUN.arrivalRatePctPop5min },
    /*
     * Report rather than throw, for `honesty/run.ts`'s reason one directory over: a run that died
     * on a timeout would take the landing page's whole block out over a condition the page has
     * nothing to say about.
     */
    onTimeout: 'report',
    runId: 'landing',
  };
}

/**
 * Ask for the morning, once per page load.
 *
 * Failure is a state rather than an exception: nothing here throws into the mount, because a
 * landing page whose copy disappeared when its canvas could not start would have lost the four
 * fifths of itself that never needed one.
 */
function askForTheMorning(): void {
  if (asked) return;
  asked = true;
  void (async () => {
    const loaded = await resources();
    const building = loaded?.buildings.find((one) => one.id === LANDING_RUN.buildingId);
    if (loaded === undefined || building === undefined) {
      unavailable = true;
      live?.redraw();
      return;
    }
    buildingName = building.name;
    runner.start({
      /*
       * No car out of service and no decision log: the block draws cars and queues and reads
       * neither. A recorded decision trace is the largest thing a recording can carry, and a page
       * that asked for one it never opens would be paying the transport for it on every load.
       */
      runs: [{ config: configFor(loaded, building), outOfServiceCarIds: [], recordDecisions: false }],
      onDone: ([landed]) => {
        if (landed === undefined) unavailable = true;
        else recording = landed;
        live?.redraw();
      },
      onFailed: () => {
        unavailable = true;
        live?.redraw();
      },
    });
  })();
}

function motionState(): LandingMotionState {
  if (recording !== undefined) return 'playing';
  return unavailable ? 'unavailable' : 'pending';
}

/* -------------------------------------------------------------------------- *
 * The canvas
 * -------------------------------------------------------------------------- */

/** Paint the recording, looping, until the canvas leaves the page. Returns the way to stop. */
function playInto(doc: Document, canvas: HTMLCanvasElement, played: VizRecording): () => void {
  const playback = new Playback(played, systemClock(), {
    speed: LANDING_RUN.speedSimPerRealS,
    autoplay: true,
    startAtS: LANDING_RUN.loopFromS,
  });
  /*
   * **The morning repeats, and the window is narrower than the run.** A landing page whose only
   * animation stopped after half a minute and sat on a still frame would be showing the game in
   * motion for exactly one visitor in however many arrive during it — so it loops. What it loops
   * is deliberately not the whole recording: the head is the empty lobby before anybody turns up
   * (see `loopFromS`) and the tail is the building draining after the demand horizon, with nobody
   * new arriving and cars parking one by one. Neither is a lie, and neither is what a visitor came
   * to look at.
   *
   * Clamped to the recording's own end rather than assumed: a run that timed out early would give
   * a window running past its own last frame, and a transport asked to loop over one of those is a
   * defect nobody would see until the day a run got slower.
   */
  playback.setLoop({
    fromS: LANDING_RUN.loopFromS,
    toS: Math.min(LANDING_RUN.durationS, played.endedAt),
  });
  const labelOf = (id: string): string =>
    played.floors.find((floor) => floor.id === id)?.label ?? id;

  let stopped = false;
  let handle: number | undefined;
  const paint = (): void => {
    handle = undefined;
    if (stopped) return;
    if (!canvas.isConnected) {
      /* Detached rather than finished — ask again once the shell has re-appended the screen. */
      handle = doc.defaultView?.requestAnimationFrame(paint);
      return;
    }
    const ctx = sizeCanvas(canvas);
    if (ctx !== undefined) {
      const rect = canvas.getBoundingClientRect();
      const simTimeS = playback.simTimeS;
      drawCutaway(ctx, {
        recording: played,
        frame: frameAt(played, simTimeS),
        queues: queueAt(played, simTimeS),
        geometry: stageGeometryOf({
          width: rect.width,
          height: rect.height,
          floors: played.floors,
          shafts: played.shafts,
          outOfServiceCarIds: played.outOfServiceCarIds,
        }),
        floorLabelOf: labelOf,
      });
    }
    handle = doc.defaultView?.requestAnimationFrame(paint);
  };
  handle = doc.defaultView?.requestAnimationFrame(paint);

  return () => {
    stopped = true;
    playback.pause();
    if (handle !== undefined) doc.defaultView?.cancelAnimationFrame(handle);
    handle = undefined;
  };
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;text-transform:uppercase;color:${C.label}`;

function motionBlock(
  doc: Document,
  view: LandingView,
  stop: { current: (() => void) | undefined },
): HTMLElement {
  const block = el(doc, 'section', 'everyday-landing-motion');
  block.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:14px 16px 15px',
    'margin:24px 0 0',
    'max-width:760px',
  ].join(';');

  const eyebrow = el(doc, 'div', 'everyday-landing-motion-eyebrow', view.motion.eyebrow);
  eyebrow.style.cssText = EYEBROW;
  const note = el(doc, 'p', 'everyday-landing-motion-note', view.motion.note);
  note.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:6px 0 10px;text-wrap:pretty`;
  block.append(eyebrow, note);

  if (recording !== undefined) {
    const canvas = el(doc, 'canvas', 'everyday-landing-canvas');
    /*
     * The canvas is decoration for a screen reader and is labelled as such rather than left
     * nameless: everything it shows is said in the note above it, and an unlabelled canvas is the
     * one finding the automated accessibility sweep cannot see (it reads the page, not the bitmap).
     */
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', view.motion.note);
    canvas.style.cssText = `display:block;width:100%;height:38vh;min-height:220px;border-radius:${String(R.tile)}px;background:${C.cardSunk}`;
    block.append(canvas);
    stop.current = playInto(doc, canvas, recording);
  }
  return block;
}

/**
 * Whether this visitor has played nothing at all — the walkthrough's own gate, asked here.
 *
 * Asked rather than answered: `tutorialModel.ts#tutorialIsDue` is the one derivation, so the page
 * and the walkthrough cannot disagree about who is new, and nothing is stored — the counts are
 * re-derived on every draw exactly as they are for the offer that put this screen up.
 */
function firstSessionFor(context: EverydayScreenShellContext): boolean {
  const progress = everydayProfileStore().progress();
  return tutorialIsDue({
    filedDays: context.host.week().history.length,
    solvedCases: progress.solvedCaseIds.length,
    ratings: progress.ratings.length,
  });
}

function viewFor(context: EverydayScreenShellContext): LandingView {
  return landingViewOf({
    motion: motionState(),
    buildingName,
    firstSession: firstSessionFor(context),
  });
}

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  askForTheMorning();

  const stop: { current: (() => void) | undefined } = { current: undefined };

  const render = (): void => {
    stop.current?.();
    stop.current = undefined;
    host.replaceChildren();

    const view = viewFor(context);

    const root = el(doc, 'div', 'everyday-landing');
    root.style.cssText = `padding:34px 32px 40px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 62%,${C.paperDeeper});min-width:0`;

    /* ---------------------------------------------------------------- hero */
    const eyebrow = el(doc, 'div', 'everyday-landing-eyebrow', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const headline = el(doc, 'h1', 'everyday-landing-headline', view.headline);
    headline.style.cssText = `font-family:${TYPE.heading};font-size:46px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:18ch`;
    const lede = el(doc, 'p', 'everyday-landing-lede', view.lede);
    lede.style.cssText = `font-size:18px;line-height:1.5;color:${C.inkSoft};margin:14px 0 0;max-width:52ch;text-wrap:pretty`;
    root.append(eyebrow, headline, lede);

    /* -------------------------------------------------------------- motion */
    root.append(motionBlock(doc, view, stop));

    /* ----------------------------------------------------------- the way in */
    const cta = el(doc, 'button', 'everyday-landing-cta', view.callToAction.label);
    cta.type = 'button';
    cta.dataset.screen = view.callToAction.screen;
    cta.style.cssText = [
      'display:inline-block',
      'margin:24px 0 0',
      'border:none',
      `border-radius:${String(R.pill)}px`,
      `background:${C.ink}`,
      `color:${C.paper}`,
      'padding:13px 26px',
      'font-size:15px',
      'font-weight:650',
      'cursor:pointer',
    ].join(';');
    cta.addEventListener('click', () => {
      context.go(view.callToAction.screen);
    });
    const ctaNote = el(doc, 'p', 'everyday-landing-cta-note', view.callToAction.note);
    ctaNote.style.cssText = `font-size:13.5px;line-height:1.5;color:${C.warmGrey};margin:9px 0 0;max-width:52ch`;
    root.append(cta, ctaNote);

    /* -------------------------------------------------------------- claims */
    const hook = el(doc, 'p', 'everyday-landing-hook', view.hook);
    hook.style.cssText = `font-size:16px;line-height:1.55;color:${C.ink};margin:34px 0 0;padding:18px 0 0;border-top:1px solid ${C.rule};max-width:62ch;text-wrap:pretty`;
    const claimsHeading = el(doc, 'h2', 'everyday-landing-claims-heading', view.claimsHeading);
    claimsHeading.style.cssText = `font-family:${TYPE.heading};font-size:24px;font-weight:650;letter-spacing:-.02em;margin:26px 0 0;max-width:28ch`;
    root.append(hook, claimsHeading);

    const claims = el(doc, 'ul', 'everyday-landing-claims');
    claims.style.cssText = 'list-style:none;margin:16px 0 0;padding:0;display:grid;gap:16px;max-width:62ch';
    for (const claim of view.claims) {
      const row = el(doc, 'li', 'everyday-landing-claim');
      row.dataset.claim = claim.id;
      row.style.cssText = 'min-width:0';
      const line = el(doc, 'div', 'everyday-landing-claim-line', claim.claim);
      line.style.cssText = `font-size:15.5px;font-weight:600;line-height:1.45;color:${C.ink}`;
      const because = el(doc, 'div', 'everyday-landing-claim-because', claim.because);
      because.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:5px 0 0;text-wrap:pretty`;
      row.append(line, because);
      claims.append(row);
    }
    root.append(claims);

    const closing = el(doc, 'p', 'everyday-landing-closing', view.closing);
    closing.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.warmGrey};margin:26px 0 0;max-width:62ch;text-wrap:pretty`;
    root.append(closing);

    host.append(root);
  };

  render();
  live = { redraw: render };

  return {
    primary: () => {
      context.go(viewFor(context).callToAction.screen);
    },
    unmount: () => {
      stop.current?.();
      stop.current = undefined;
      if (live?.redraw === render) live = undefined;
    },
  };
}

export const LANDING_SCREEN: EverydayScreenModule = {
  key: 'landing',
  mount,
};
