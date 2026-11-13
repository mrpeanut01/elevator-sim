/**
 * **Who is about to arrive** — the stage's look-ahead at the day's crowd.
 *
 * The stage drew everybody who was already standing and nobody who was about to be. A player
 * watching an empty lobby at 08:20 could not tell a quiet day from the minute before the rush, so
 * the only way to learn a day's shape was to lose to it once. This module reads the crowd that is
 * still on its way and says how many, how soon, and where they will turn up.
 *
 * ## Why this is not a forecast, and may be drawn exactly
 *
 * `record/recordRun.ts` simulates a day whole and the stage plays it back, so every arrival is
 * already in the recording. The arrivals are the **traffic generator's**, not the dispatcher's: a
 * first leg's journey start is decided before any car moves, and `record/crowd.ts` holds two runs
 * of one day to the same crowd whatever the player changed. So the counts here are the day's own
 * list read ahead of the playhead, not a prediction, and no switch of dispatcher moves them.
 *
 * **Only first legs count.** A transfer leg's `arrivedAt` is when the previous car dropped its
 * rider (`contract/types.ts#VizLeg.legIndex`), which belongs to the dispatcher; counting it would
 * be publishing the run's future rather than the crowd's.
 *
 * ## Where this sits against `docs/28` § 4
 *
 * § 4.3 draws the line this module stands on: *configuration may be drawn in full at t = 0, outcome
 * may not be drawn before t reaches it.* An arrival is not an outcome of the run. It is decided
 * before the first car moves and no press changes it, which is the property § 4.3 names. § 4.4's
 * *foreshadowing* is about outcomes (a floor about to fail, a car about to saturate), and none of
 * that is read here: no wait, no boarding, no queue, no summary.
 *
 * Three things are still held back, because each would publish a whole-run figure by another
 * route (§ 4.2):
 *
 * - **Nothing is read past the look-ahead.** No sentence says when the crowd ends or how
 *   many are still to come today, which would be `summary.generated` less `arrived`.
 * - **The approach's scale is the tallest slot up to the look-ahead's far edge**, never the day's. A
 *   scale whose endpoint is the day's peak publishes the peak.
 * - **The whole-day shape is the schedule**, `VizRecording.demandPhases`, which § 4.3 licenses at
 *   t = 0. It is what the day was built to do, and it is drawn in intensity, not in people.
 *
 * Pure: no document, no clock. `arrivalsStrip.ts` paints what this decides, and `stageScreen.ts`
 * is the non-test caller of both.
 */

import type { VizFloor, VizLeg, VizRecording } from '../contract/types.js';

/** How far ahead of the playhead the approach looks, in simulated seconds. */
export const ARRIVALS_AHEAD_S = 600;

/** One column of the approach, in simulated seconds. Slots sit on absolute boundaries, so a column keeps its people as it nears the door. */
export const ARRIVALS_SLOT_S = 30;

/** How many columns the whole-day shape is drawn in. */
export const ARRIVALS_DAY_COLUMNS = 60;

/** The part of a recording this module reads. */
export type ArrivalsSource = Pick<VizRecording, 'legs' | 'floors' | 'startedAt' | 'endedAt' | 'demandPhases'>;

/** One column of the whole-day shape: the schedule's intensity over that stretch, `0..1`. */
export interface ArrivalsDayColumn {
  readonly fromS: number;
  readonly toS: number;
  readonly intensity: number;
}

/** The crowd's arrivals, sorted once per recording so a frame's read is two binary searches. */
export interface StageArrivalsIndex {
  readonly startS: number;
  readonly endS: number;
  /** Journey start of every first leg, ascending. */
  readonly times: readonly number[];
  /** Beside {@link times}: whether that person walks in at an entrance floor. */
  readonly atDoors: readonly boolean[];
  /** The schedule, column by column. Empty when the recording carries no phases, and then no shape is drawn. */
  readonly day: readonly ArrivalsDayColumn[];
  /** The first {@link ARRIVALS_SLOT_S} slot anybody arrives in. */
  readonly firstSlot: number;
  /** `slotPeakThrough[i]` is the most people in any one slot from {@link firstSlot} to `firstSlot + i`. */
  readonly slotPeakThrough: readonly number[];
}

/** One column of the approach. */
export interface ArrivalsSlot {
  /** Seconds from the playhead to the slot's start; negative for the slot the playhead is inside. */
  readonly startsInS: number;
  /** Seconds from the playhead to the slot's end. */
  readonly endsInS: number;
  /** Still to come in this slot, at an entrance floor. */
  readonly doors: number;
  /** Still to come in this slot, on any other floor. */
  readonly floors: number;
}

/** What the stage draws about the next {@link ARRIVALS_AHEAD_S} seconds. */
export interface StageArrivalsAhead {
  readonly slots: readonly ArrivalsSlot[];
  readonly doors: number;
  readonly floors: number;
  readonly total: number;
  /**
   * The approach's scale, in people: the tallest slot from the start of the day to the look-ahead's far
   * edge, and never less than {@link ARRIVALS_SCALE_FLOOR}. It only ever grows, so a column keeps
   * its height as it nears the door.
   */
  readonly scalePeople: number;
  /** How the next five minutes compare with the five just gone. */
  readonly trend: ArrivalsTrend;
  /** Where the playhead sits in the day, `0..1`, for the whole-day shape's marker. */
  readonly dayFraction: number;
  /** Where the look-ahead ends in the day, `0..1`. */
  readonly aheadFraction: number;
  /** The figure, as a sentence. */
  readonly headline: string;
  /** Where they turn up. Empty when nobody is due. */
  readonly split: string;
  /**
   * The two halves of {@link split}, which the card writes beside the key's two swatches so the key
   * and the count are one line. With nobody due they are the bare key labels.
   */
  readonly doorsLine: string;
  readonly floorsLine: string;
  /** What the crowd is doing next. */
  readonly outlook: string;
}

export type ArrivalsTrend = 'building' | 'steady' | 'easing' | 'quiet';

/** The fewest people the approach's full height stands for, so one early arrival is not drawn as a wall. */
export const ARRIVALS_SCALE_FLOOR = 8;

/** The card's eyebrow. */
export const ARRIVALS_TITLE = 'Arriving next';

/** The approach's two ends. */
export const ARRIVALS_NOW_LABEL = 'now';
export const ARRIVALS_FAR_LABEL = `in ${String(ARRIVALS_AHEAD_S / 60)} min`;

/** The whole-day shape's caption. */
export const ARRIVALS_DAY_LABEL = "The day's schedule";

/** The key under the approach. A shape as well as an ink, so neither is a colour-only signal. */
export const ARRIVALS_KEY_DOORS = 'walking in at the doors';
export const ARRIVALS_KEY_FLOORS = 'calling from the floors';

/**
 * Why the count can be trusted, in the player's words. It is the day's own list, and saying so is
 * what separates this from a prediction the player would be right to doubt.
 */
export const ARRIVALS_NOTE =
  "read from today's crowd list, which is the same people whatever you change";

function journeyStartOf(leg: VizLeg): number {
  return leg.journeyStartedAt ?? leg.arrivedAt;
}

function journeyOriginOf(leg: VizLeg): string {
  return leg.journeyOriginFloorId ?? leg.originFloorId;
}

/** Sort the day's arrivals once. Call when the recording changes, never per frame. */
export function stageArrivalsIndexOf(recording: ArrivalsSource): StageArrivalsIndex {
  const entrances = new Set(
    recording.floors.filter((floor: VizFloor) => floor.isEntrance).map((floor) => floor.id),
  );
  const arrivals = recording.legs
    .filter((leg) => (leg.legIndex ?? 0) === 0)
    .map((leg) => ({ atS: journeyStartOf(leg), atDoors: entrances.has(journeyOriginOf(leg)), id: leg.passengerId }))
    .sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const startS = recording.startedAt;
  const endS = Math.max(recording.endedAt, startS);
  const span = endS - startS;
  const day: ArrivalsDayColumn[] = [];
  const phases = recording.demandPhases.filter((phase) => phase.endS > phase.startS);
  if (span > 0 && phases.length > 0) {
    const width = span / ARRIVALS_DAY_COLUMNS;
    for (let i = 0; i < ARRIVALS_DAY_COLUMNS; i += 1) {
      const fromS = startS + i * width;
      const midS = fromS + width / 2;
      const phase = phases.find((candidate) => midS >= candidate.startS && midS < candidate.endS);
      const along = phase === undefined ? 0 : (midS - phase.startS) / (phase.endS - phase.startS);
      const intensity =
        phase === undefined ? 0 : phase.startIntensity + (phase.endIntensity - phase.startIntensity) * along;
      day.push({ fromS, toS: fromS + width, intensity: Math.min(1, Math.max(0, intensity)) });
    }
  }
  const firstSlot = Math.floor((arrivals[0]?.atS ?? startS) / ARRIVALS_SLOT_S);
  const perSlot: number[] = [];
  for (const arrival of arrivals) {
    const slot = Math.floor(arrival.atS / ARRIVALS_SLOT_S) - firstSlot;
    while (perSlot.length <= slot) perSlot.push(0);
    perSlot[slot] = (perSlot[slot] ?? 0) + 1;
  }
  let peak = 0;
  const slotPeakThrough = perSlot.map((count) => {
    peak = Math.max(peak, count);
    return peak;
  });
  return {
    startS,
    endS,
    times: arrivals.map((arrival) => arrival.atS),
    atDoors: arrivals.map((arrival) => arrival.atDoors),
    day,
    firstSlot,
    slotPeakThrough,
  };
}

/** The first index whose time is strictly after `atS`. */
function firstAfter(times: readonly number[], atS: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((times[mid] ?? Number.POSITIVE_INFINITY) <= atS) low = mid + 1;
    else high = mid;
  }
  return low;
}

function people(count: number): string {
  return count === 1 ? '1 person' : `${String(count)} people`;
}

function minutes(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds / 60));
  return whole === 1 ? 'a minute' : `${String(whole)} minutes`;
}

/**
 * How the five minutes ahead compare with the five behind. A quarter either way is *steady*: the
 * generator issues arrivals in batches, so a smaller difference is one batch landing on one side
 * of the playhead rather than the crowd changing.
 */
function trendOf(behind: number, ahead: number): ArrivalsTrend {
  if (ahead === 0) return 'quiet';
  if (ahead > behind * 1.25 && ahead - behind >= 3) return 'building';
  if (ahead < behind * 0.75 && behind - ahead >= 3) return 'easing';
  return 'steady';
}

/** The look-ahead at one instant. Cheap enough to ask every frame. */
export function stageArrivalsAheadAt(index: StageArrivalsIndex, nowS: number): StageArrivalsAhead {
  const horizonS = nowS + ARRIVALS_AHEAD_S;
  const from = firstAfter(index.times, nowS);
  const to = firstAfter(index.times, horizonS);

  const firstSlot = Math.floor(nowS / ARRIVALS_SLOT_S);
  const lastSlot = Math.ceil(horizonS / ARRIVALS_SLOT_S) - 1;
  const slots: { startsInS: number; endsInS: number; doors: number; floors: number }[] = [];
  for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
    slots.push({
      startsInS: slot * ARRIVALS_SLOT_S - nowS,
      endsInS: (slot + 1) * ARRIVALS_SLOT_S - nowS,
      doors: 0,
      floors: 0,
    });
  }
  let doors = 0;
  let floors = 0;
  for (let i = from; i < to; i += 1) {
    const atS = index.times[i];
    if (atS === undefined) continue;
    const slot = slots[Math.floor(atS / ARRIVALS_SLOT_S) - firstSlot];
    const atDoors = index.atDoors[i] === true;
    if (atDoors) doors += 1;
    else floors += 1;
    if (slot === undefined) continue;
    if (atDoors) slot.doors += 1;
    else slot.floors += 1;
  }
  const total = doors + floors;

  const half = ARRIVALS_AHEAD_S / 2;
  const behind = from - firstAfter(index.times, nowS - half);
  const ahead = firstAfter(index.times, nowS + half) - from;
  const trend = trendOf(behind, ahead);
  const through = Math.min(index.slotPeakThrough.length - 1, lastSlot - index.firstSlot);
  const scalePeople = Math.max(ARRIVALS_SCALE_FLOOR, through < 0 ? 0 : (index.slotPeakThrough[through] ?? 0));

  const span = index.endS - index.startS;
  const fractionOf = (atS: number): number =>
    span > 0 ? Math.min(1, Math.max(0, (atS - index.startS) / span)) : 0;

  const span10 = minutes(ARRIVALS_AHEAD_S);
  let headline: string;
  let outlook: string;
  if (total === 0) {
    headline = `Nobody is due in the next ${span10}`;
    outlook = behind === 0 ? 'the doors are quiet' : 'the crowd has stopped for now';
  } else {
    headline = `${people(total)} in the next ${span10}`;
    outlook =
      trend === 'building'
        ? 'the crowd is building'
        : trend === 'easing'
          ? 'the crowd is easing'
          : trend === 'quiet'
            ? `nobody for ${minutes(half)}, then they start`
            : 'about the same as the last few minutes';
  }
  const doorsLine = total === 0 ? ARRIVALS_KEY_DOORS : `${String(doors)} ${ARRIVALS_KEY_DOORS}`;
  const floorsLine = total === 0 ? ARRIVALS_KEY_FLOORS : `${String(floors)} ${ARRIVALS_KEY_FLOORS}`;
  const split = total === 0 ? '' : `${doorsLine} · ${floorsLine}`;

  return {
    slots,
    doors,
    floors,
    total,
    scalePeople,
    trend,
    dayFraction: fractionOf(nowS),
    aheadFraction: fractionOf(horizonS),
    headline,
    split,
    doorsLine,
    floorsLine,
    outlook,
  };
}

/** The canvas's accessible name: the three sentences a sighted player reads off the card. */
export function stageArrivalsDescriptionOf(ahead: StageArrivalsAhead): string {
  return [ahead.headline, ahead.split, ahead.outlook].filter((part) => part !== '').join('. ');
}
