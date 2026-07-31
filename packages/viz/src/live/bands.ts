/**
 * The mood card: how long the people standing there right now have been standing.
 *
 * ## Why a second banding, when `frame/overlay.ts` already has one
 *
 * `overlay.ts`'s {@link WaitBand} is the **run's** banding: three of its four boundaries are
 * `summary.longWaitThresholdS` and `summary.serviceLevel.horizonS`, so a building that counts a
 * long wait at 45 s bands its riders at 45 s. That is the right instrument for a marker over a
 * landing, and it is deliberately named for the *fact* — `long` means *past the threshold this
 * run counts a long wait at*.
 *
 * The mood card is a different instrument and the design fixes its boundaries at 30 s, 60 s and
 * 120 s (`design.html:1365–1370`). It has to: the four legend labels are **fixed prose** —
 * *breezy*, *tapping foot*, *checking watch*, *taking the stairs* — and *checking watch* is a
 * claim about a minute, not about whatever this run's long-wait threshold happens to be. Sliding
 * the boundary under a fixed sentence is how a caption stops describing the picture, which is the
 * defect the honesty card exists to prevent.
 *
 * So there are two bandings, they answer two questions, and neither is derived from the other.
 * What is *not* duplicated is who counts as waiting: membership comes from `queueAt`, so
 * {@link waitBandsAt}'s total equals `frameAt(recording, t).totalWaiting` by construction and
 * `bands.test.ts` asserts it on every shipped building rather than trusting the reading.
 *
 * ## Bands are ages; abandonment is an outcome
 *
 * The fourth band is called *taking the stairs* and it counts **people still standing** who have
 * been standing at least two minutes. It is not the count of people who gave up — that is
 * `observationsAt(…).abandoned`, over a different population (legs whose wait passed the run's
 * own 900 s horizon) on a different clock. The design carries both, in two places, and the two
 * move independently: a building can hold four riders past two minutes with nobody having
 * abandoned anything, and can have abandoned a dozen with an empty lobby.
 *
 * Nothing here is an estimate and nothing here is suppressible. Every figure is a head count.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { queueAt } from '../frame/overlay.js';

import type { Mood, WaitBandCount, WaitBandDefinition, WaitBands } from './types.js';

/**
 * The four bands, in ascending severity — design `:1365–1371` for the boundaries and the colours,
 * `:72–76` for the mood-card labels, `:230–233` for the stage strip's, `:2281` for the faces.
 *
 * Frozen, and the single source of all four: the palette (requirement S7), the boundaries, both
 * label sets and the face glyphs. Three copies of a palette is the defect class this repository
 * has closed ten times.
 */
export const WAIT_BANDS: readonly WaitBandDefinition[] = Object.freeze([
  Object.freeze({
    id: 'breezy' as const,
    fromS: 0,
    toS: 30,
    label: 'breezy',
    legendLabel: 'under 30 s',
    color: '#3fb27f',
    face: '◡',
  }),
  Object.freeze({
    id: 'tapping-foot' as const,
    fromS: 30,
    toS: 60,
    label: 'tapping foot',
    legendLabel: 'a minute',
    color: '#e0b040',
    face: '◠',
  }),
  Object.freeze({
    id: 'checking-watch' as const,
    fromS: 60,
    toS: 120,
    label: 'checking watch',
    legendLabel: 'two minutes',
    color: '#e0773a',
    face: '⌄',
  }),
  Object.freeze({
    id: 'taking-the-stairs' as const,
    fromS: 120,
    toS: undefined,
    label: 'taking the stairs',
    legendLabel: 'gave up',
    color: '#e0473a',
    face: '×',
  }),
]);

/** The palette on its own, derived rather than written twice. Requirement S7. */
export const BAND_COLORS: readonly string[] = Object.freeze(WAIT_BANDS.map((band) => band.color));

/**
 * The face's tinted disc, one per band — design `:2302`.
 *
 * Written out rather than computed from {@link WAIT_BANDS}: the design's fourth tint is `.16`
 * alpha where the other three are `.14`, and deriving them would quietly correct a value the
 * designer chose.
 */
const MOOD_BG: readonly string[] = Object.freeze([
  'rgba(63,178,127,.14)',
  'rgba(224,176,64,.14)',
  'rgba(224,119,58,.14)',
  'rgba(224,71,58,.16)',
]);

/** The headline for each band — design `:2288–2293`, verbatim. */
const MOOD_HEADLINES: readonly string[] = Object.freeze([
  'Everyone is getting on with their day.',
  'A few people are checking their phones.',
  'The lobby is starting to notice.',
  'The stairwell door is getting a workout.',
]);

/**
 * Which band a wait of `waitedS` falls in — the design's `bandOf`, `:1365–1370`.
 *
 * Tested ascending against each band's own `toS`, so the classification cannot disagree with the
 * boundaries {@link WAIT_BANDS} publishes. A negative wait cannot happen — `queueAt` only reports
 * riders whose `arrivedAt <= t` — but clamps into the first band rather than falling off the end.
 */
export function bandIndexOf(waitedS: number): number {
  for (const [index, band] of WAIT_BANDS.entries()) {
    if (band.toS === undefined || waitedS < band.toS) return index;
  }
  return WAIT_BANDS.length - 1;
}

/** {@link bandIndexOf}, by id, for a caller that does not want to hold an index. */
export function bandOf(waitedS: number): WaitBandDefinition {
  return requireBand(bandIndexOf(waitedS));
}

/**
 * Everybody standing at `t`, banded by how long they have stood.
 *
 * Membership and wait ages come from `queueAt`, which is the module that already decides who is
 * waiting (`arrivedAt <= t` and not yet boarded, right-continuous at both ends). Re-deciding it
 * here would be a second answer to a question `frame/overlay.ts` has already answered — the
 * failure this project has a rule about — and would let the stacked bar disagree with the queue
 * glyphs drawn under it on the same frame.
 *
 * Pure, and deliberately uncached: the playhead scrubs backwards, and a cache keyed on "the last
 * `t` we saw" returns the wrong frame the instant the reader drags left.
 */
export function waitBandsAt(recording: VizRecording, simTimeS: SimTime): WaitBands {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const tally = WAIT_BANDS.map(() => 0);
  let total = 0;
  let longestCurrentWaitS: number | undefined;

  for (const queue of queueAt(recording, t)) {
    for (const rider of queue.riders) {
      const index = bandIndexOf(rider.waitedS);
      tally[index] = (tally[index] ?? 0) + 1;
      total += 1;
      if (longestCurrentWaitS === undefined || rider.waitedS > longestCurrentWaitS) {
        longestCurrentWaitS = rider.waitedS;
      }
    }
  }

  // The design's own denominator: `st.bands.reduce(...) || 1`, so an empty lobby reports four
  // zeroes rather than four `NaN`s. Written as a guard rather than as `|| 1` because a zero total
  // is a real state — nobody is waiting — and not a division to be papered over.
  const counts: WaitBandCount[] = WAIT_BANDS.map((band, index) => {
    const count = tally[index] ?? 0;
    return { band, count, pct: total === 0 ? 0 : Math.round((count / total) * 100) };
  });

  let worstIndex = 0;
  for (let index = WAIT_BANDS.length - 1; index >= 0; index -= 1) {
    if ((tally[index] ?? 0) > 0) {
      worstIndex = index;
      break;
    }
  }

  return {
    atS: t,
    total,
    counts,
    worst: requireBand(worstIndex),
    worstIndex,
    longestCurrentWaitS,
  };
}

/**
 * The mood card's face, headline and sub-line — design `:2287–2299`, verbatim.
 *
 * The strings are the design's and are reproduced exactly, including the fourth's *"past two
 * minutes"*, which names the fourth band's own lower bound. `bands.test.ts` pins
 * `WAIT_BANDS[3].fromS === 120` so the sentence and the boundary cannot drift apart silently —
 * the sentence would otherwise keep claiming two minutes about a band somebody had moved.
 *
 * The sub-line for a band with nobody in it is never reached: {@link waitBandsAt} only ever
 * reports a worst band that is occupied, or the first band when the lobby is empty, and the first
 * band's sub-line (*nobody has waited a minute*) is true of an empty lobby too.
 */
export function moodAt(recording: VizRecording, simTimeS: SimTime): Mood {
  const bands = waitBandsAt(recording, simTimeS);
  return moodOf(bands);
}

/**
 * {@link moodAt} from an already-computed banding.
 *
 * Exposed so the rail can draw the bar and the face from **one** scan rather than two. Calling
 * `waitBandsAt` twice on the same frame would be correct and would double the work; a caller that
 * has the bands passes them here.
 */
export function moodOf(bands: WaitBands): Mood {
  const index = bands.worstIndex;
  const band = requireBand(index);
  const longest = Math.round(Math.max(bands.longestCurrentWaitS ?? 0, 0));
  const fumingCount = bands.counts[WAIT_BANDS.length - 1]?.count ?? 0;
  const subs: readonly string[] = [
    'nobody has waited a minute',
    `longest wait ${String(longest)} s`,
    `longest wait ${String(longest)} s · queues building`,
    `${String(fumingCount)} riders past two minutes`,
  ];
  return {
    bandId: band.id,
    index,
    face: band.face,
    headline: MOOD_HEADLINES[index] ?? MOOD_HEADLINES[0] ?? '',
    sub: subs[index] ?? subs[0] ?? '',
    edge: band.color,
    bg: MOOD_BG[index] ?? MOOD_BG[0] ?? 'transparent',
  };
}

/**
 * Index into {@link WAIT_BANDS}, with the absence turned into a throw rather than a `?? bands[0]`.
 *
 * `noUncheckedIndexedAccess` makes every one of these lookups `| undefined`, and the cheap way out
 * is a default that silently reports the calmest band when an index goes out of range. That is a
 * mood card that says *breezy* about a building on fire, which is the one failure mode this card
 * must not have.
 */
function requireBand(index: number): WaitBandDefinition {
  const band = WAIT_BANDS[index];
  if (band === undefined) {
    throw new Error(`live/bands: band index ${String(index)} is out of range.`);
  }
  return band;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
