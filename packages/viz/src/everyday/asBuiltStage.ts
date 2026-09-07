/**
 * **The as-built run, played before the four figures** — GitHub issue #348, `docs/35` PM-FB1.
 *
 * The fix-case screen used to show a player four figures about a building they had never seen
 * running. The recording those figures are measured from already existed on the screen —
 * `fixitScreen.ts#measureAsBuilt` runs the as-built configuration when a case opens, and
 * `fixit/run.ts#figureValuesOf` reads the four figures off its legs — so this is a renderer mount
 * and a transport over that recording, never a second simulation: **the stage and the figures are
 * two readings of one run**, which is PM-FB1's second criterion and the reason a second run would
 * have been two answers to one question.
 *
 * ## What it is, and what it deliberately is not
 *
 * One canvas painted by `cutaway.ts#drawCutaway` — the same painter § 7's stage uses, so a car that
 * reads as a car there reads as the same car here — driven by a `Playback` at the player's own
 * default speed, opening **playing** because the point is that the problem arrives as a sight. A
 * *Skip to the figures* press, and the run's own end, both land the player on the figures; nothing
 * else on this block is a control. No speed chips, no pause, no interventions: those are the
 * stage's, and a stage that offered a press on a case's opening run would be a second place to
 * change a building this mode measures twice on purpose.
 *
 * ## Why the block, not the screen, owns the loop
 *
 * `fixitScreen.ts` rebuilds its main column on every redraw, and a canvas rebuilt on every redraw
 * is a run that restarts every time a repair is toggled. So the block is built **once per case**
 * and re-appended, its loop keyed on the canvas still being in a document: a detached block stops
 * asking for frames, and a block the screen has finished with is disposed by name.
 */

import type { VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt } from '../frame/overlay.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { drawCutaway, sizeCanvas } from './cutaway.js';
import { stageGeometryOf } from './stageScreenModel.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

/** The words this block draws — authored on the model side (`fixitScreenModel.ts`), passed in. */
export interface AsBuiltStageCopy {
  readonly eyebrow: string;
  readonly note: string;
  readonly skip: string;
}

export interface AsBuiltStageInput {
  readonly recording: VizRecording;
  /** Simulated seconds per real second — the player's own default, read by the caller. */
  readonly speedSimPerRealS: number;
  readonly copy: AsBuiltStageCopy;
  /** Called once, on the skip press or the run's end, whichever comes first. */
  readonly onDone: () => void;
}

export interface AsBuiltStage {
  readonly root: HTMLElement;
  /** Stop the loop and the transport. Idempotent. */
  dispose(): void;
}

export function mountAsBuiltStage(doc: Document, input: AsBuiltStageInput): AsBuiltStage {
  const { recording } = input;
  const root = doc.createElement('section');
  root.className = 'everyday-fixit-stage';
  root.style.cssText = [
    'margin-top:14px',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:14px 17px',
    'max-width:80ch',
  ].join(';');

  const head = doc.createElement('div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap';
  const eyebrow = doc.createElement('div');
  eyebrow.textContent = input.copy.eyebrow;
  eyebrow.style.cssText = `font:500 9.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.className = 'everyday-fixit-skip';
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
  note.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:6px 0 10px`;

  const canvas = doc.createElement('canvas');
  canvas.className = 'everyday-fixit-stage-canvas';
  canvas.style.cssText = `display:block;width:100%;height:42vh;border-radius:${String(R.tile)}px;background:${C.cardSunk}`;
  root.append(head, note, canvas);

  const playback = new Playback(recording, systemClock(), {
    speed: input.speedSimPerRealS,
    autoplay: true,
  });
  const labelOf = (id: string): string => recording.floors.find((floor) => floor.id === id)?.label ?? id;

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

  const paint = (): void => {
    frameHandle = undefined;
    if (done || !canvas.isConnected) {
      if (!done && !canvas.isConnected) {
        // Detached rather than finished: ask again once the screen has re-appended the block.
        frameHandle = doc.defaultView?.requestAnimationFrame(paint);
      }
      return;
    }
    const ctx = sizeCanvas(canvas);
    if (ctx !== undefined) {
      const rect = canvas.getBoundingClientRect();
      const simTimeS = playback.simTimeS;
      drawCutaway(ctx, {
        recording,
        frame: frameAt(recording, simTimeS),
        queues: queueAt(recording, simTimeS),
        geometry: stageGeometryOf({
          width: rect.width,
          height: rect.height,
          floors: recording.floors,
          shafts: recording.shafts,
          outOfServiceCarIds: recording.outOfServiceCarIds,
        }),
        floorLabelOf: labelOf,
      });
    }
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
