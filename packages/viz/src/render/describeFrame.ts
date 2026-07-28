/**
 * The canvas's text alternative — `UX.md` `KB-13`.
 *
 * A `<canvas>` is opaque to a screen reader: it has no accessible children, so everything the
 * renderer draws is, to a non-sighted reader, a blank rectangle. The remedy the platform
 * provides is fallback content plus a live region, and both need a *sentence*. This module is
 * where that sentence is produced.
 *
 * It is here, in `render/`, rather than in the dev entry point, for the two reasons everything
 * else in this directory is:
 *
 * 1. It runs under Node, so it is tested rather than screenshotted.
 * 2. It is a pure function of `(recording, frame, …)`, which means the description and the
 *    picture cannot drift — they read the same frame. A description assembled from the DOM would
 *    be a second source of truth about what is on screen, and this repository has a rule about
 *    those.
 *
 * The two signals `D18` found to be carried by colour alone — door state and overload — are both
 * spelled out here in words, which is the strongest form of "colour is never the only signal".
 */

import type { Frame, VizRecording } from '../contract/types.js';
import type { OverlayMetrics } from '../frame/overlay.js';
import { LOAD_ALARM, LOAD_FULL } from './overlay.js';
import { formatClock } from './canvas.js';

export interface DescribeFrameInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly metrics?: OverlayMetrics | undefined;
  /** Cap on the number of cars named individually, so a 24-car tower is still a paragraph. */
  readonly maxCars?: number;
}

/** Words for a load factor. The `!` glyph's spoken equivalent. */
function loadWords(loadFactor: number): string {
  if (loadFactor >= LOAD_ALARM) return 'OVERLOADED';
  if (loadFactor >= LOAD_FULL) return 'full';
  return 'loaded';
}

function directionWords(direction: number): string {
  return direction === 1 ? 'moving up' : direction === -1 ? 'moving down' : 'standing';
}

/**
 * One paragraph describing the frame on screen.
 *
 * Deterministic and ordered exactly as the recording is, so two identical frames produce
 * identical text — the same property the picture has, extended to the words.
 */
export function describeFrame(input: DescribeFrameInput): string {
  const { recording, frame } = input;
  const maxCars = input.maxCars ?? 8;
  const parts: string[] = [];

  parts.push(
    `${recording.buildingName}, dispatcher ${recording.dispatcherProfileId}, seed ${recording.seed}, ` +
      `at ${formatClock(frame.simTimeS)} of ${formatClock(recording.endedAt)}.`,
  );

  if (recording.status !== 'completed') {
    parts.push(
      `Run status ${recording.status}, with ${String(recording.summary.undelivered)} passengers undelivered.`,
    );
  }
  if (recording.summary.saturated || !recording.summary.awtIsValid) {
    parts.push(
      `Mean waiting time is suppressed: ${recording.summary.awtInvalidReason ?? 'the run saturated.'}`,
    );
  }

  parts.push(
    `${String(frame.totalWaiting)} legs waiting, ${String(frame.boardedLegs)} boarded so far.`,
  );

  const metrics = input.metrics;
  if (metrics !== undefined) {
    parts.push(
      metrics.rollingMeanWaitS === undefined
        ? `Rolling mean wait over the last ${String(metrics.windowS)} seconds is not reported.`
        : `Rolling mean wait over the last ${String(metrics.windowS)} seconds is ${metrics.rollingMeanWaitS.toFixed(1)} seconds.`,
    );
  }

  const cars = frame.cars.slice(0, maxCars);
  for (const car of cars) {
    parts.push(
      `Car ${car.label} at floor ${car.floorId}, ${directionWords(car.direction)}, doors ${car.doorPhase}, ` +
        `${String(car.occupants)} aboard, ${loadWords(car.loadFactor)} at ${car.loadFactor.toFixed(2)} of rated load.`,
    );
  }
  if (frame.cars.length > cars.length) {
    parts.push(`${String(frame.cars.length - cars.length)} further cars not described.`);
  }

  return parts.join(' ');
}
