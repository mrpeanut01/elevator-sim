/**
 * **A fix case's runs, played** — one block, one transport, one or two canvases.
 *
 * This file was `asBuiltStage.ts` and mounted exactly one recording: the as-built run, played
 * before the four figures (GitHub issue #348, `docs/35` PM-FB1). It is renamed and widened by
 * [§ D644](../../../../DECISIONS.md) because the mode has a **second** run worth watching and it
 * was being thrown away — `fixitScreen.ts#primary` bound `onDone: ([before, after])`, kept `before`
 * on the session and let `after` go out of scope after `measuredOf` had read it. A player watched
 * the building fail and was handed a table when their own change worked. Widening this block rather
 * than writing a second one is `cutaway.ts`'s own rule one layer up: **two consumers of one painter
 * rather than two painters**, so a car that reads as a car on § 7's stage reads as the same car in
 * both of this mode's blocks.
 *
 * ## What it is, and what it deliberately is not
 *
 * Canvases painted by `cutaway.ts#drawCutaway` — the painter § 7's stage uses — driven by a single
 * `Playback` at the player's own default speed, opening **playing**, because the point is that the
 * run arrives as a sight. A *skip* press, and the run's own end, both call
 * {@link CaseStageInput.onDone}; nothing else on this block is a control. No speed chips, no pause,
 * no interventions: those are the stage's, and [§ D623](../../../../DECISIONS.md) clause 3 ruled
 * that a fix case keeps its no-pause design, because a stage that let a case's run be pressed would
 * be a second place to change a building this mode measures twice on purpose. That ruling was
 * written about the opening run and it binds the pair for the same reason and more strongly: the
 * pair **is** the two runs the verdict is measured from, so a press on it would edit the thing being
 * judged.
 *
 * ## One playhead over two recordings, and why that is honest rather than a trick
 *
 * With two panes the transport is built over the **longer** recording and both panes are painted at
 * its `simTimeS`. `frameAt` and `queueAt` clamp into their own recording's span, so a shorter pane
 * holds on its last frame rather than extrapolating a run that had ended.
 *
 * Nothing here asserts the two runs are comparable — that is
 * `fixit/run.ts#assertPairMatchesRepairs`'s job and it runs on the legs at the press site, before
 * this block is built. What this block adds is that the two are shown **at the same minute**, which
 * is the only reading under which *the same crowd, before and after* is something a player can see
 * rather than a sentence they are asked to take.
 *
 * **That is common random numbers made visible, and it is why this mode's watching is not a replay.**
 * `CLAUDE.md`'s statistical discipline requires every alternative under comparison to be fed *the
 * same passenger traces*; `fixit/run.ts#fixitRunPlanOf` obeys it by building both configs off one
 * case's seed, horizon and demand and differing only in the patches. Until this block existed, that
 * discipline was something the product asserted in a basis line under a table. Side by side at one
 * playhead it is the thing on screen: the same person, at the same landing, at the same minute of
 * the same morning, in two buildings that differ only by what the player bought. A replay shows you
 * a run again; this shows you the one variable you moved.
 *
 * ## Why the block, not the screen, owns the loop
 *
 * `fixitScreen.ts` rebuilds its main column on every redraw, and a canvas rebuilt on every redraw is
 * a run that restarts every time a repair is toggled. So a block is built **once per case** (the
 * as-built pane) or **once per run** (the pair) and re-appended, its loop keyed on the first canvas
 * still being in a document: a detached block stops asking for frames, and a block the screen has
 * finished with is disposed by name.
 */

import type { VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt } from '../frame/overlay.js';
import { waitBandsAt } from '../live/bands.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { drawCutaway, sizeCanvas } from './cutaway.js';
import {
  stageCarReadoutFits,
  stageGeometryOf,
  stageReadoutRoomOf,
  type StageCameraWindow,
} from './stageScreenModel.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

/** The words this block draws — authored on the model side (`fixitScreenModel.ts`), passed in. */
export interface CaseStageCopy {
  readonly eyebrow: string;
  readonly note: string;
  readonly skip: string;
  /**
   * The bank view's label — see {@link CaseStageInput.banks}. Required exactly when banks are
   * passed, so a caller that offers the view also says what it is.
   */
  readonly bankView?: string | undefined;
  /** The bank view's first option, the picture the block always drew. */
  readonly bankViewWhole?: string | undefined;
}

/** One bank the block may show on its own: its id in the recordings and its name in the building. */
export interface CaseStageBank {
  readonly id: string;
  readonly name: string;
}

/**
 * One run on screen.
 *
 * `caption` is `undefined` on a single-pane block, where a caption would be a label on the only
 * thing there. On a pair both panes carry one, because two unlabelled canvases side by side are a
 * puzzle rather than a comparison.
 */
export interface CaseStagePane {
  readonly recording: VizRecording;
  readonly caption?: string;
}

/**
 * Which DOM classes this block wears.
 *
 * Passed rather than derived, because the two blocks this module mounts must be addressable apart:
 * the browser tier asserts the as-built block is **gone** once skipped, and a pair block wearing the
 * same class would make that assertion pass for the wrong reason.
 */
export interface CaseStageClasses {
  readonly root: string;
  readonly canvas: string;
  readonly skip: string;
}

export interface CaseStageInput {
  /** One pane, or two drawn side by side at one playhead. Empty is a programming error. */
  readonly panes: readonly CaseStagePane[];
  /** Simulated seconds per real second — the player's own default, read by the caller. */
  readonly speedSimPerRealS: number;
  readonly copy: CaseStageCopy;
  readonly classes: CaseStageClasses;
  /** Called once, on the skip press or the run's end, whichever comes first. */
  readonly onDone: () => void;
  /**
   * **The transport's speed at a frame**, from the present frame's longest wait over every pane —
   * GitHub issue #598, [§ D992](../../../../DECISIONS.md). Absent on the fix-it screen, which plays
   * at one rung as it always has; the tutorial passes `tutorialModel.ts#tutorialPaceOf`, so its
   * quiet minutes are crossed fast and its trouble plays at the player's speed. Speed only — the
   * playhead is never moved, and a pane's picture is the same frame at any speed.
   */
  readonly pace?: ((longestStandingS: number | undefined) => number) | undefined;
  /**
   * A clock and a line saying why the transport is at its speed, drawn above the canvases and
   * rewritten on change. Absent draws neither — GitHub issue #598's *no clock*, opt-in so the fix-it
   * screen is untouched by this lane.
   */
  readonly clockOf?:
    | ((simTimeS: number, simPerRealS: number) => { readonly clock: string; readonly pace: string })
    | undefined;
  /**
   * **The bank view** — the post-AI playability panel's Vertical City finding, where thirty-five
   * cars drawn in a half-width pane put six pixels between two shafts and every car's readout over
   * its neighbours'. The painter now drops a readout that cannot read (`stageCarReadoutFits`), which
   * stops the smear and leaves thirty-five unlabelled bars; this is the legible alternative.
   *
   * When the whole tower's readouts do not fit a pane and the panes hold two or more of these banks,
   * a select above the canvases shows one bank at a time: **every pane** draws only that bank's
   * shafts, over the band of floors those shafts serve in **either** run, so the two pictures keep
   * one scale and one set of floors and stay a before and an after. Offered only where it changes
   * what can be read — the stage camera's rule (§ D505), and the reason the select is absent rather
   * than inert on a tower that draws legibly whole. A view over the recordings, like the camera: it
   * writes nothing to either run.
   *
   * A bank a run has rezoned a car out of is still that bank; the car appears under the bank it
   * runs in, which is what the player changed.
   */
  readonly banks?: readonly CaseStageBank[] | undefined;
  /**
   * Take the column's whole width rather than a line of prose's — the fix-it screen's blocks, where
   * a pair in 80ch left each pane about 270 px at 1440 × 900, and a tower's shafts are what that
   * width is for. The note keeps its measure either way. Absent keeps the tutorial's layout, which
   * sets its own width around this block.
   */
  readonly wide?: boolean | undefined;
  /** Told on each frame what the canvas shows now, so a screen can latch what has been seen. */
  readonly onFrame?:
    | ((frame: { readonly simTimeS: number; readonly longestStandingS: number | undefined }) => void)
    | undefined;
}

export interface CaseStage {
  readonly root: HTMLElement;
  /** Stop the loop and the transport. Idempotent. */
  dispose(): void;
}

export function mountCaseStage(doc: Document, input: CaseStageInput): CaseStage {
  const panes = input.panes;
  const longestPane = panes[0];
  if (longestPane === undefined) {
    throw new Error('caseStage: a stage with no run to play is not a stage.');
  }

  const root = doc.createElement('section');
  root.className = input.classes.root;
  root.style.cssText = [
    'margin-top:14px',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:14px 17px',
    input.wide === true ? '' : 'max-width:80ch',
  ]
    .filter((rule) => rule !== '')
    .join(';');

  const head = doc.createElement('div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap';
  const eyebrow = doc.createElement('div');
  eyebrow.textContent = input.copy.eyebrow;
  eyebrow.style.cssText = `font:500 9.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.className = input.classes.skip;
  skip.textContent = input.copy.skip;
  skip.style.cssText = [
    'margin-left:auto',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    'background:transparent',
    `color:${C.ink}`,
    'padding:6px 12px',
    'font-size:12.5px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  head.append(eyebrow, skip);

  const note = doc.createElement('p');
  note.textContent = input.copy.note;
  note.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:6px 0 10px;max-width:80ch`;

  /*
   * `auto-fit`/`minmax` rather than a fixed two-column rule: a pair that will not fit side by side
   * stacks, and a stacked pair is still a before and an after in reading order. A single pane takes
   * the whole row under the same declaration, so there is one layout here rather than two.
   */
  const grid = doc.createElement('div');
  grid.style.cssText = [
    'display:grid',
    'grid-template-columns:repeat(auto-fit,minmax(260px,1fr))',
    'gap:10px',
  ].join(';');

  const canvases: HTMLCanvasElement[] = [];
  for (const pane of panes) {
    const cell = doc.createElement('div');
    cell.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:5px';
    if (pane.caption !== undefined) {
      const caption = doc.createElement('div');
      caption.textContent = pane.caption;
      caption.style.cssText = `font:500 9.5px ${TYPE.mono};letter-spacing:.12em;color:${C.label};text-transform:uppercase`;
      cell.append(caption);
    }
    const canvas = doc.createElement('canvas');
    canvas.className = input.classes.canvas;
    canvas.style.cssText = `display:block;width:100%;height:42vh;border-radius:${String(R.tile)}px;background:${C.cardSunk}`;
    cell.append(canvas);
    canvases.push(canvas);
    grid.append(cell);
  }
  /* The bank view — {@link CaseStageInput.banks}. Built only when two or more banks are in play. */
  const offeredBanks = (input.banks ?? []).filter((bank) =>
    panes.some((pane) => pane.recording.shafts.some((shaft) => shaft.bankId === bank.id)),
  );
  let shownBank: string | undefined;
  const bankRow = doc.createElement('label');
  bankRow.className = `${input.classes.root}-banks`;
  bankRow.hidden = true;
  bankRow.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;margin:0 0 8px;font-size:12.5px;color:${C.inkSoft}`;
  const bankPicker = doc.createElement('select');
  bankPicker.className = `${input.classes.root}-bank`;
  bankPicker.style.cssText = `max-width:100%;font-size:12.5px;padding:4px 6px;border:1px solid ${C.rule};border-radius:${String(R.control)}px;background:${C.card};color:${C.ink}`;
  if (offeredBanks.length >= 2) {
    const lead = doc.createElement('span');
    lead.textContent = input.copy.bankView ?? '';
    const whole = doc.createElement('option');
    whole.value = '';
    whole.textContent = input.copy.bankViewWhole ?? '';
    bankPicker.append(whole);
    for (const bank of offeredBanks) {
      const option = doc.createElement('option');
      option.value = bank.id;
      option.textContent = bank.name;
      bankPicker.append(option);
    }
    bankPicker.addEventListener('change', () => {
      shownBank = bankPicker.value === '' ? undefined : bankPicker.value;
    });
    bankRow.append(lead, bankPicker);
  }
  /** The widest readout any car in these runs can print — the one the legibility test must fit. */
  const widestReadout = ((): string => {
    let capacity = 0;
    for (const pane of panes) {
      for (const shaft of pane.recording.shafts) capacity = Math.max(capacity, shaft.capacityPersons);
    }
    return `${String(capacity)}/${String(capacity)}`;
  })();
  /** The floor band the shown bank serves in either run, or `undefined` for the whole tower. */
  const bankWindowOf = (bankId: string): StageCameraWindow | undefined => {
    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;
    for (const pane of panes) {
      const indexOf = new Map(pane.recording.floors.map((floor) => [floor.id, floor.index]));
      for (const shaft of pane.recording.shafts) {
        if (shaft.bankId !== bankId) continue;
        for (const floorId of shaft.servedFloorIds) {
          const index = indexOf.get(floorId);
          if (index === undefined) continue;
          from = Math.min(from, index);
          to = Math.max(to, index);
        }
      }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { fromIndex: from, toIndex: to } : undefined;
  };

  /* GitHub issue #598's clock — drawn only for a caller that asked for one. */
  const clockRow = doc.createElement('div');
  clockRow.className = `${input.classes.root}-clock`;
  clockRow.style.cssText = `display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;margin:0 0 8px;font:500 12px ${TYPE.mono};color:${C.ink}`;
  const clockText = doc.createElement('span');
  const paceText = doc.createElement('span');
  paceText.style.cssText = `color:${C.label}`;
  clockRow.append(clockText, paceText);
  if (input.clockOf === undefined) root.append(head, note, bankRow, grid);
  else root.append(head, note, clockRow, bankRow, grid);

  /*
   * The transport runs on the longest pane, so neither run is cut short by the other's horizon. The
   * fix-it pair shares one `durationS` by construction — `fixit/run.ts#configOf` reads it off the
   * case for both configs — so on the shipped cases this picks either. It is written for the run
   * that reports short rather than on the assumption that none can.
   */
  const longest = panes.reduce(
    (a, b) => (b.recording.endedAt > a.recording.endedAt ? b : a),
    longestPane,
  ).recording;
  const playback = new Playback(longest, systemClock(), {
    speed: input.speedSimPerRealS,
    autoplay: true,
  });
  const labelOf =
    (recording: VizRecording) =>
    (id: string): string =>
      recording.floors.find((floor) => floor.id === id)?.label ?? id;

  let done = false;
  let frameHandle: number | undefined;
  const finish = (): void => {
    if (done) return;
    done = true;
    playback.pause();
    if (frameHandle !== undefined) doc.defaultView?.cancelAnimationFrame(frameHandle);
    frameHandle = undefined;
    input.onDone();
  };
  skip.addEventListener('click', finish);

  const first = canvases[0];
  const paint = (): void => {
    frameHandle = undefined;
    if (done || first === undefined) return;
    if (!first.isConnected) {
      // Detached rather than finished: ask again once the screen has re-appended the block.
      frameHandle = doc.defaultView?.requestAnimationFrame(paint);
      return;
    }
    const simTimeS = playback.simTimeS;
    /*
     * GitHub issue #598, § D992 — the present frame's longest wait over every pane, only when a
     * caller asked for pace or for frames. `waitBandsAt` folds at `t` and reads nothing later.
     */
    if (input.pace !== undefined || input.onFrame !== undefined || input.clockOf !== undefined) {
      let longest: number | undefined;
      for (const pane of panes) {
        const here = waitBandsAt(pane.recording, simTimeS).longestCurrentWaitS;
        if (here !== undefined && (longest === undefined || here > longest)) longest = here;
      }
      if (input.pace !== undefined) {
        const speed = input.pace(longest);
        if (playback.speed !== speed) playback.setSpeed(speed);
      }
      input.onFrame?.({ simTimeS, longestStandingS: longest });
      if (input.clockOf !== undefined) {
        const line = input.clockOf(simTimeS, playback.speed);
        if (clockText.textContent !== line.clock) clockText.textContent = line.clock;
        if (paceText.textContent !== line.pace) paceText.textContent = line.pace;
      }
    }
    /*
     * The bank view's offer, asked of the first pane at its laid-out size: whether the whole tower's
     * widest readout fits between two shafts. Written only on a change, so a steady picture costs
     * no DOM write per frame; a bank shown on a tower that has become legible whole (a wider window)
     * goes back to the whole tower rather than hiding a choice the player can no longer see.
     */
    if (offeredBanks.length >= 2) {
      const box = first.getBoundingClientRect();
      const wholeFits = stageCarReadoutFits(
        widestReadout,
        stageReadoutRoomOf(
          stageGeometryOf({
            width: box.width,
            height: box.height,
            floors: longestPane.recording.floors,
            shafts: longestPane.recording.shafts,
          }),
        ),
      );
      if (bankRow.hidden !== wholeFits) {
        bankRow.hidden = wholeFits;
        if (wholeFits) {
          shownBank = undefined;
          bankPicker.value = '';
        }
      }
    }
    const bankWindow = shownBank === undefined ? undefined : bankWindowOf(shownBank);
    canvases.forEach((canvas, index) => {
      const pane = panes[index];
      if (pane === undefined) return;
      const ctx = sizeCanvas(canvas);
      if (ctx === undefined) return;
      const rect = canvas.getBoundingClientRect();
      const recording = pane.recording;
      const shafts =
        shownBank === undefined ? recording.shafts : recording.shafts.filter((shaft) => shaft.bankId === shownBank);
      drawCutaway(ctx, {
        recording,
        frame: frameAt(recording, simTimeS),
        queues: queueAt(recording, simTimeS),
        geometry: stageGeometryOf({
          width: rect.width,
          height: rect.height,
          floors: recording.floors,
          shafts,
          outOfServiceCarIds: recording.outOfServiceCarIds,
          window: bankWindow,
        }),
        floorLabelOf: labelOf(recording),
      });
    });
    if (playback.state === 'ended') {
      finish();
      return;
    }
    frameHandle = doc.defaultView?.requestAnimationFrame(paint);
  };
  frameHandle = doc.defaultView?.requestAnimationFrame(paint);

  return {
    root,
    dispose: () => {
      done = true;
      playback.pause();
      if (frameHandle !== undefined) doc.defaultView?.cancelAnimationFrame(frameHandle);
      frameHandle = undefined;
    },
  };
}
