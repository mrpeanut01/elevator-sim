/**
 * **Whether a day's problem could be seen** — `docs/35-problem-per-mode.md` row 13, rule `PM-TT2`;
 * GitHub issue #354; and `docs/33` § 6's legibility arm, which is also #208's per-building
 * eligibility instrument (§ D475), built once.
 *
 * `docs/33` DC-4 is a statement about the **verdict**: a contract's day 1 must miss a goal on a
 * third to two thirds of seeds. It is silent about whether the player could ever have *seen* the
 * problem. A day can miss *worst wait inside 230 s* on one rider at minute 41 and be invisible for
 * the other fifty-nine minutes; it satisfies DC-4 and presents no problem to solve, which is #208's
 * defect arriving through the instrument meant to prevent it.
 *
 * ## The measurement
 *
 * A landing is **legible** at an instant when somebody standing on it has waited into the stage's
 * third wait band — `live/bands.ts#WAIT_BANDS`' *checking watch*, sixty seconds, the band the
 * cutaway colours a figure amber. A day is legible when some landing stays legible for
 * {@link LEGIBILITY_WINDOW_S} contiguous simulated seconds: long enough for a player watching at
 * the stage's default speed to notice a crowd, ask why, and act.
 *
 * Exact interval union over the legs rather than sampling, `docs/35` § 9.3's method: each leg
 * standing on a landing contributes `[arrivedAt + bandFromS, leftAt)` when it waited that long,
 * where `leftAt` is when it boarded, was turned away (§ D266: a refused rider is not waiting), or
 * the run ended. The union's longest interval on any landing is the day's legible stretch.
 *
 * ## The window is an assumption, and here is the reasoning
 *
 * `docs/35` § 11 item 5 lists *whether 120 contiguous seconds is the right legibility window* as
 * open and a design choice rather than a fact. It stays a declared assumption: at the stage's
 * default speed (`stageScreenModel.ts#DEFAULT_STAGE_SPEED_INDEX`) two simulated minutes are on the
 * order of ten real seconds, which is the time a reader spends on one screen before their eye
 * moves, and a shorter window would count a crowd the cutaway drew for one frame. It is uncited
 * by construction; a playtest is what would move it, and the constant is here so a playtest has
 * one thing to move.
 *
 * ## The sweep, and the run it pins to
 *
 * `legibility.sweep.test.ts` runs every contract's day 1 under the shipped default dispatcher at
 * its own shift length, seeds `20 260 824 + 7 919 n`, `n = 0…49` — `docs/33` § 4.6's cell exactly,
 * so the energy bar and this arm are measured on the same four hundred days — and publishes the
 * fraction of seeds with a legible landing per contract. That table lives beside
 * {@link LEGIBILITY_WINDOW_S} below, `shift/goals.ts`'s pattern, and `legibility.test.ts` pins a
 * ten-seed slice of it so a change to the crowd, the bands or the union is red before the table is
 * stale. It is a proportion with its `n`, never a mean of a mean, and there are no arms to compare
 * so there is no interval (`docs/33` § 6.5).
 */

import type { VizLeg, VizRecording } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';
import { isWaitingAt } from '../frame/overlay.js';

/**
 * The contiguous stretch a landing must stay in the third band for the day to count as legible.
 *
 * ## The table, and the run it pins to — GitHub issue #354, § D512
 *
 * Measured 2026-09-06 on the integrated tree by `legibility.sweep.test.ts`: each contract's day 1
 * under `collective` at its own shift length, ordinary day, seeds `20 260 824 + 7 919 n`,
 * `n = 0…49`, folded through {@link legibilityOf} at the shipped band and window. **Eight contracts
 * × 50 seeds = 400 runs**, `docs/33` § 4.6's cell exactly.
 *
 * | contract | building | legible seeds of 50 | median longest stretch (s) |
 * |---|---|---|---|
 * | c1 | garden-apartments | **0** | 0 |
 * | c2 | midtown-office | **50** | 2 504 |
 * | c3 | secure-tower | 20 | 108 |
 * | c4 | mixed-use-high-rise | 32 | 136 |
 * | c5 | vertical-city | 45 | 191 |
 * | c6 | chancery-house | **2** | 28 |
 * | c7 | crown-hotel | 40 | 161 |
 * | c8 | st-jude-hospital | **1** | 38 |
 *
 * Two readings, both of them what #208 and § D475 needed measured rather than argued. Garden
 * Apartments never once holds a landing in the third band for two minutes — nobody on it waits
 * sixty seconds, so *"the first session presents no problem to solve"* is the instrument's own
 * finding at 0 of 50, and the building is **not eligible** as a first session under § D475 until
 * something about its day changes. Chancery House and St Jude's are legible on 2 and 1 seeds, which
 * is *rarely* rather than *never* and is the same verdict for a first session. Midtown Office is
 * legible on every seed with a stretch longer than the shift, which is a building whose problem a
 * player cannot miss. The five that are legible on more than a third of seeds — c2, c4, c5, c7 and
 * c3 at two fifths — are the eligible set this table hands § D475's draw.
 *
 * The proportion carries its `n`, the stretch is a median, and there is no interval: no arms are
 * compared (`docs/33` § 6.5). `legibility.test.ts` pins the first ten seeds of every contract so
 * a change to the crowd, the bands or the union is red before this table is stale.
 */
export const LEGIBILITY_WINDOW_S = 120;

/** One row of the sweep {@link LEGIBILITY_WINDOW_S}'s docstring tabulates. */
export interface LegibilitySweepRow {
  readonly contractId: string;
  readonly buildingId: string;
  /** Seeds of the fifty on which day 1 is legible. */
  readonly legibleOf50: number;
  /** The median, over the fifty seeds, of the longest third-band stretch on any landing. */
  readonly medianStretchS: number;
}

/**
 * The sweep's table, as data — the same figures as the docstring above, so `shift/firstSession.ts`
 * can derive § D475's eligible set from the measurement rather than from a list somebody typed, and
 * `legibility.sweep.test.ts` can refuse this constant the day a fresh sweep disagrees with it.
 */
export const LEGIBILITY_SWEEP: readonly LegibilitySweepRow[] = Object.freeze([
  { contractId: 'c1', buildingId: 'garden-apartments', legibleOf50: 0, medianStretchS: 0 },
  { contractId: 'c2', buildingId: 'midtown-office', legibleOf50: 50, medianStretchS: 2504 },
  { contractId: 'c3', buildingId: 'secure-tower', legibleOf50: 20, medianStretchS: 108 },
  { contractId: 'c4', buildingId: 'mixed-use-high-rise', legibleOf50: 32, medianStretchS: 136 },
  { contractId: 'c5', buildingId: 'vertical-city', legibleOf50: 45, medianStretchS: 191 },
  { contractId: 'c6', buildingId: 'chancery-house', legibleOf50: 2, medianStretchS: 28 },
  { contractId: 'c7', buildingId: 'crown-hotel', legibleOf50: 40, medianStretchS: 161 },
  { contractId: 'c8', buildingId: 'st-jude-hospital', legibleOf50: 1, medianStretchS: 38 },
]);

/** The third band's floor — `WAIT_BANDS[2].fromS`, read rather than retyped. */
export function legibilityBandFromS(): number {
  const third = WAIT_BANDS[2];
  if (third === undefined) throw new Error('WAIT_BANDS has fewer than three bands');
  return third.fromS;
}

export interface LandingLegibility {
  readonly floorId: string;
  /** The longest contiguous stretch, in simulated seconds, with somebody in the third band. */
  readonly longestS: number;
  /** Total simulated seconds with somebody in the third band, as a union. */
  readonly totalS: number;
  /**
   * The simulated second at which this landing's first stretch of `windowS` completes — when the
   * day became legible here — or `undefined` while no stretch reaches the window.
   */
  readonly legibleAtS: number | undefined;
}

export interface DayLegibility {
  readonly bandFromS: number;
  readonly windowS: number;
  readonly landings: readonly LandingLegibility[];
  /** The longest stretch on any landing. */
  readonly longestS: number;
  /** `longestS >= windowS`. */
  readonly legible: boolean;
  /**
   * The earliest {@link LandingLegibility.legibleAtS} over the landings — when a player watching the
   * stage from the start could first have seen the problem — or `undefined` on a day that is not
   * legible. GitHub issue #208's first criterion asks for it in seconds from the day's start.
   */
  readonly legibleAtS: number | undefined;
}

/** When a leg stopped standing on its landing: boarded, turned away, or the run's end. */
function leftAt(leg: VizLeg, endedAt: number): number {
  if (leg.refusedAt !== undefined) return leg.refusedAt;
  if (leg.boardedAt !== undefined) return leg.boardedAt;
  return endedAt;
}

/** The union of half-open intervals, merged and sorted. */
function unionOf(intervals: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * The day's legibility, from its legs. Pure; the recording is read and never simulated.
 *
 * `bandFromS` and `windowS` are parameters so a test can move them and see the answer move,
 * and default to the shipped band and window so every non-test caller asks the same question.
 */
export function legibilityOf(
  recording: Pick<VizRecording, 'legs' | 'endedAt'>,
  options: { readonly bandFromS?: number; readonly windowS?: number } = {},
): DayLegibility {
  const bandFromS = options.bandFromS ?? legibilityBandFromS();
  const windowS = options.windowS ?? LEGIBILITY_WINDOW_S;
  const byFloor = new Map<string, (readonly [number, number])[]>();
  for (const leg of recording.legs) {
    const left = leftAt(leg, recording.endedAt);
    const from = leg.arrivedAt + bandFromS;
    if (left <= from) continue;
    /* A refused rider never waited in the band: § D266's rule, the same one `isWaitingAt` applies. */
    if (!isWaitingAt(leg, from)) continue;
    const list = byFloor.get(leg.originFloorId) ?? [];
    list.push([from, left]);
    byFloor.set(leg.originFloorId, list);
  }
  const landings: LandingLegibility[] = [...byFloor.entries()]
    .map(([floorId, intervals]) => {
      const merged = unionOf(intervals);
      const longestS = merged.reduce((best, [a, b]) => Math.max(best, b - a), 0);
      const totalS = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
      const first = merged.find(([a, b]) => b - a >= windowS);
      const legibleAtS = first === undefined ? undefined : first[0] + windowS;
      return { floorId, longestS, totalS, legibleAtS };
    })
    .sort((a, b) => b.longestS - a.longestS || a.floorId.localeCompare(b.floorId));
  const longestS = landings[0]?.longestS ?? 0;
  const moments = landings.flatMap((landing) => (landing.legibleAtS === undefined ? [] : [landing.legibleAtS]));
  const legibleAtS = moments.length === 0 ? undefined : Math.min(...moments);
  return { bandFromS, windowS, landings, longestS, legible: longestS >= windowS, legibleAtS };
}
