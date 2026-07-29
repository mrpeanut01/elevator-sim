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

import type { LockedOutLanding } from '../access/lockedOut.js';
import { describeLockedOut } from '../access/lockedOut.js';
import type { Frame, VizRecording } from '../contract/types.js';
import type { FloorQueue, OverlayMetrics } from '../frame/overlay.js';
import { LOAD_ALARM, LOAD_FULL } from './overlay.js';
import { formatClock } from './canvas.js';
import { describeQueue } from './riderQueue.js';
import type { BuildingMood } from './mood.js';

export interface DescribeFrameInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly metrics?: OverlayMetrics | undefined;
  /**
   * Floors with a waiting call no car answers in this run — `D10`, and the same list the canvas
   * marks with `✗`.
   *
   * Said in words for the reason the door phase and the overload are: the glyph is the sighted
   * half of a signal, and a fact this repository calls never-hideable cannot live only in a
   * `<select>` that is dropped below 1280 px.
   */
  readonly unansweredCallFloorIds?: readonly string[] | undefined;
  /**
   * Landings no car may legally answer — the same list the canvas marks with `▩`.
   *
   * Said in words for the reason everything else here is, and with one extra: the glyph cannot
   * carry *which* credential is going unread, and that is the entire content of `docs/10`
   * § 10.4's *"why"*. A non-sighted reader gets the credential named; a sighted one gets it from
   * the banner, which is produced by the same function so the two cannot word it differently.
   */
  readonly lockedOutLandings?: readonly LockedOutLanding[] | undefined;
  /** Cap on the number of cars named individually, so a 24-car tower is still a paragraph. */
  readonly maxCars?: number;
  /**
   * Per-floor rider queues — `docs/10` § 6.3, and *"not optional"* in the design's own words.
   *
   * *"This is how the individual-glyph information reaches a reader who cannot see it."* The
   * canvas draws four shapes; this says the same four facts in words, per floor with anybody on
   * it, busiest first.
   */
  readonly queues?: readonly FloorQueue[] | undefined;
  /**
   * Cap on the number of floors described individually.
   *
   * `KB-13` asks for a description, not a manifest, and Vertical City has 100 floors. The floors
   * left out are **counted and their people are counted**, so the sentence never understates the
   * queue — it only stops naming where it is.
   */
  readonly maxQueueFloors?: number;
  /** The building's mood, said in words — D4, and observation-only, so it survives suppression. */
  readonly mood?: BuildingMood | undefined;
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

  /*
   * The passenger model, said out loud, and only when it is the one that changes what a landing
   * queue *is*.
   *
   * Under a panel the sentence "6 legs waiting at floor 10" means six people who have each
   * already been told which car to walk to, and possibly six different cars — not one hall call
   * with six people behind it. A reader who cannot see the shaft highlight has no other way to
   * learn that, and version 3 gave the two models the same paragraph. Not said under
   * `conventional`, because naming the default in every sentence is noise: `KB-13` asks for a
   * description, not a manifest.
   */
  if (recording.passengerModel === 'destination-dispatch') {
    parts.push(
      'Destination dispatch: each waiting passenger has already been assigned a car at the ' +
        'landing panel, so a landing is one call per destination rather than one up or down call.',
    );
  }

  parts.push(
    `${String(frame.totalWaiting)} legs waiting, ${String(frame.boardedLegs)} boarded so far.`,
  );

  const unanswered = input.unansweredCallFloorIds ?? [];
  if (unanswered.length > 0) {
    parts.push(
      `${String(unanswered.length)} landing${unanswered.length === 1 ? '' : 's'} with a call no car ` +
        `answers in this run: ${unanswered.join(', ')}.`,
    );
  }

  /*
   * `docs/10` § 10.4, and **before** the per-floor clauses below for the reason the banner puts
   * it second: a call nobody may legally answer is a different kind of statement from a queue
   * being long, and a reader hearing the floors described one by one should already know which
   * of them could never have been served. Unabridged here — this is the surface with no width.
   */
  const lockedOut = describeLockedOut(input.lockedOutLandings ?? []);
  if (lockedOut !== '') parts.push(`${lockedOut}.`);

  /*
   * § 6.3 — the per-floor clause, which lands *with* the renderer rather than after it.
   *
   * Busiest first, not building order, because the reader is being told where the trouble is and a
   * paragraph that walks the building bottom to top makes them count. The tail is summarised
   * rather than dropped: "and 14 more floors with 62 people between them" is still true when the
   * cap bites, which "and 14 more floors" would not be.
   */
  const queues = (input.queues ?? []).filter((queue) => queue.total > 0 || queue.recentlyBoarded > 0);
  if (queues.length > 0) {
    const maxFloors = input.maxQueueFloors ?? 6;
    const ranked = [...queues].sort(
      (a, b) => b.total - a.total || b.oldestWaitS - a.oldestWaitS || a.floorId.localeCompare(b.floorId),
    );
    for (const queue of ranked.slice(0, maxFloors)) parts.push(describeQueue(queue));
    const rest = ranked.slice(maxFloors);
    if (rest.length > 0) {
      const people = rest.reduce((sum, queue) => sum + queue.total, 0);
      parts.push(
        `${String(rest.length)} further floors with ${String(people)} people between them are not described.`,
      );
    }
  }

  const mood = input.mood;
  if (mood !== undefined) {
    // Every driver, not only the level: the level is a maximum over these, and a reader who is
    // told only the maximum cannot tell which observation produced it.
    parts.push(
      `${mood.headline} ${mood.drivers.map((driver) => driver.text).join(' ')} ${mood.caveat}`,
    );
  }

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
