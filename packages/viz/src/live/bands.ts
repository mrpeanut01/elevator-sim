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
 *
 * ## Two bases, because one of them inverts at the terminal instant
 *
 * {@link waitBandsAt} answers *who is standing at `t`*, which is the design's card and is right for
 * every `t` inside a run. It is wrong at exactly one `t`, and always in the flattering direction: a
 * run that **completes** runs on until the last passenger is delivered, so its final frame has an
 * empty lobby *by construction*, and a card keyed on the queue there reports the calmest band about
 * the worst possible day. That is not a stale playhead — the reading tracks the playhead correctly,
 * and the playhead is at a moment whose answer is structurally zero.
 *
 * Measured rather than argued: `midtown-office` under `collective` over an hour of demand ends
 * `saturated`, 1 392 of 1 392 carried, **781 past the 900 s horizon**, 18.0 % served inside a
 * minute, peak queue 392 at the ground floor — and `waitBandsAt(recording, endedAt)` is
 * `[0, 0, 0, 0]`, so the card read *"Everyone is getting on with their day"* over it.
 *
 * So `basis: 'whole-run'` bands the same people by **the worst wait each of them realised** by `t`,
 * which is non-decreasing in `t` and does not empty when the lobby does. It is a second question,
 * not a correction: the rail asks the live one while the playhead is inside the run and the
 * retrospective one once it has reached the end, and {@link moodOf} writes different sentences for
 * the two so a reader is never left to guess which they are looking at.
 * See [`DECISIONS.md` § D239](../../../../DECISIONS.md).
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { queueAt } from '../frame/overlay.js';

import type {
  Mood,
  WaitBandBasis,
  WaitBandCount,
  WaitBandDefinition,
  WaitBands,
} from './types.js';

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

/** The headline for each band — design `:2288–2293`, verbatim. Present tense, and it is live. */
const MOOD_HEADLINES: readonly string[] = Object.freeze([
  'Everyone is getting on with their day.',
  'A few people are checking their phones.',
  'The lobby is starting to notice.',
  'The stairwell door is getting a workout.',
]);

/**
 * The headline for each band once the shift is over — the design has none, because its card only
 * ever ran live.
 *
 * **Past tense, deliberately, and it is the second signal rather than decoration.** The live copy
 * and the retrospective copy have to be distinguishable by a reader who is looking at one of them
 * and not both, and a tense is a distinction that survives a screenshot, a greyscale rendering and
 * a screen reader — which the tint on the face does not (KB-15).
 *
 * The first entry is the one that had to be written most carefully. *"Everyone is getting on with
 * their day"* over a drained lobby was the whole defect; its replacement is a claim about **wait
 * ages over the whole shift** and nothing else, so it may not read as a verdict on the run. Nobody
 * having waited thirty seconds is genuinely all this card measured, and the honesty card beside it
 * and the mood drivers under it are what speak for the rest.
 */
const RUN_OVER_HEADLINES: readonly string[] = Object.freeze([
  'Nobody stood for long today.',
  'A few people were kept waiting today.',
  'The lobby noticed, more than once.',
  'The stairwell door got a workout.',
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
 * The banding at `t`, on one of the two bases.
 *
 * On the default `'now'` basis: everybody **standing** at `t`, banded by how long they have stood.
 * Membership and wait ages come from `queueAt`, which is the module that already decides who is
 * waiting (`arrivedAt <= t` and not yet boarded, right-continuous at both ends). Re-deciding it
 * here would be a second answer to a question `frame/overlay.ts` has already answered — the
 * failure this project has a rule about — and would let the stacked bar disagree with the queue
 * glyphs drawn under it on the same frame. `bands.test.ts` asserts the total equals
 * `frameAt(recording, t).totalWaiting` on every shipped building, at both ends of the run.
 *
 * On `'whole-run'`: everybody whose call had been **registered** by `t`, banded by the worst wait
 * each of them realised by then. See the module docstring for why this basis exists.
 *
 * The parameter defaults so that every caller written before the second basis existed keeps the
 * reading it had, and so that the *choice* is made once, visibly, by the surface that knows whether
 * the shift is over. A caller that takes the default has chosen the live reading.
 *
 * Pure on both bases, and deliberately uncached: the playhead scrubs backwards, and a cache keyed
 * on "the last `t` we saw" returns the wrong frame the instant the reader drags left.
 */
export function waitBandsAt(
  recording: VizRecording,
  simTimeS: SimTime,
  basis: WaitBandBasis = 'now',
): WaitBands {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const tally = WAIT_BANDS.map(() => 0);
  let total = 0;
  let longestCurrentWaitS: number | undefined;

  for (const waitedS of basis === 'now' ? standingWaitsAt(recording, t) : realisedWaitsBy(recording, t)) {
    const index = bandIndexOf(waitedS);
    tally[index] = (tally[index] ?? 0) + 1;
    total += 1;
    if (longestCurrentWaitS === undefined || waitedS > longestCurrentWaitS) {
      longestCurrentWaitS = waitedS;
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
    basis,
    total,
    counts,
    worst: requireBand(worstIndex),
    worstIndex,
    longestCurrentWaitS,
  };
}

/** The wait age of everybody standing at `t` — `queueAt`'s answer, unaltered. */
function* standingWaitsAt(recording: VizRecording, t: SimTime): Generator<number> {
  for (const queue of queueAt(recording, t)) {
    for (const rider of queue.riders) yield rider.waitedS;
  }
}

/**
 * The **worst wait each rider had realised** by `t`, for everybody whose call was registered by
 * then.
 *
 * A rider who boarded contributes the wait they actually served; a rider still standing
 * contributes the wait they have stood so far, which is a lower bound and is banded as one. Both
 * are non-decreasing in `t`, so this banding never un-happens as the playhead advances — the same
 * property, and for the same reason, that `observations.ts` derives `abandoned` from a crossing
 * time rather than from `t - arrivedAt > horizonS`.
 *
 * Deliberately over `recording.legs` and not over the landing fold: the legs are what `queueAt`
 * walks too, so the two bases count one population and a rider cannot be in the whole-run banding
 * and absent from the live one.
 */
function* realisedWaitsBy(recording: VizRecording, t: SimTime): Generator<number> {
  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break; // sorted by `(arrivedAt, passengerId)` — see `VizLeg`
    const { boardedAt } = leg;
    const endedAt = boardedAt !== undefined && boardedAt <= t ? boardedAt : t;
    yield Math.max(0, endedAt - leg.arrivedAt);
  }
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
 * reports a worst band that is occupied, or the first band when the banding is over nobody, and
 * the first band's sub-line (*nobody has waited a minute*) is true of an empty lobby too.
 *
 * On `basis: 'whole-run'` the strings are **not** the design's, because the design has no card for
 * a finished shift. They are past tense and they name their own scope; see {@link moodOf}.
 */
export function moodAt(
  recording: VizRecording,
  simTimeS: SimTime,
  basis: WaitBandBasis = 'now',
): Mood {
  return moodOf(waitBandsAt(recording, simTimeS, basis));
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
  const live = bands.basis === 'now';

  /*
   * The live sub-lines are the design's. The retrospective ones are written against the same four
   * bands and say two things the live ones do not need to: that the figure is over the whole shift,
   * and — in the first band — that the claim is about **waiting** and not about the day.
   *
   * `nobody has waited a minute` was the sentence that sat directly above `served under 60 s 18%`
   * on the run that produced this fix, and it read as a summary because it *is* phrased as one. The
   * retrospective first line names its scope instead, so the two can be read together without one
   * of them being a lie.
   */
  const subs: readonly string[] = live
    ? [
        'nobody has waited a minute',
        `longest wait ${String(longest)} s`,
        `longest wait ${String(longest)} s · queues building`,
        `${String(fumingCount)} riders past two minutes`,
      ]
    : [
        'across the whole shift, nobody stood half a minute',
        `across the whole shift · longest wait ${String(longest)} s`,
        `across the whole shift · longest wait ${String(longest)} s`,
        `across the whole shift · ${String(fumingCount)} riders stood past two minutes, ` +
          `the longest ${String(longest)} s`,
      ];
  const headlines = live ? MOOD_HEADLINES : RUN_OVER_HEADLINES;
  return {
    basis: bands.basis,
    bandId: band.id,
    index,
    face: band.face,
    headline: headlines[index] ?? headlines[0] ?? '',
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
