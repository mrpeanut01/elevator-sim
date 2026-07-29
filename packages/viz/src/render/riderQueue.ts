/**
 * The rider queue, as a drawable plan — `docs/10-experience-layer-contract.md` § 6.2, and D4's
 * mood treatment painted on the same substrate.
 *
 * ## The scaling problem this file exists to answer
 *
 * § 3.2 states it as a finding rather than a preference: **SimTower** was built around an elevator
 * simulation and its retrospectives converge on elevator micromanagement becoming unwieldy at
 * scale; **Project Highrise** dodged the problem by abstracting elevators away and becoming a
 * building-management game. This project cannot take the second exit, because the elevators *are*
 * the subject. So the scaling problem is solved by **aggregation, not removal**, and this module is
 * where the aggregation is decided.
 *
 * The measured pressure is **M5**: the deepest single landing queue reaches **175** waiting on
 * Midtown Office at 900 s and **379** on Vertical City at 1800 s, and Vertical City has 100 floors
 * sharing the canvas height. One glyph per rider is not a design at those depths and is a perfectly
 * good design at six.
 *
 * | Riders at a landing | Drawn as | § 6.2 |
 * |---|---|---|
 * | 1–{@link MAX_INDIVIDUAL_GLYPHS} | individual glyphs, oldest first | *"each glyph's fill carrying its wait age band"* |
 * | up to {@link MAX_GLYPHS_WITH_COUNT} | glyphs to the row width, then `+N` | *"Glyphs to the row width, then `+N`"* |
 * | beyond that, or a floor pitch below the glyph height | a bar proportional to `log(1 + n)`, with the count and the oldest wait | *"a **bar** proportional to `log(1 + n)`"* |
 *
 * Both thresholds are the design's, not this file's invention, and neither is a *schema*
 * quantity — WAVE8's *"no surface hard-codes a dimension count, section list or parameter list"*
 * is about things derived from a discovered schema, and a glyph budget is not one of those. The
 * capacity of a row **is** derived, from the pixels the layout actually gives it.
 *
 * ## Shape, not colour — and this is a hard constraint rather than a preference
 *
 * `UX.md` KB-15 forbids colour as the only signal, and § 3.1 restates it for exactly this feature
 * because Mini Metro's own players report *losing to a station they never saw fill*: legibility of
 * a fail state is a separate problem from the fail state being good. So {@link BAND_GLYPH} is
 * **injective** — four bands, four distinct shapes — and `riderQueue.test.ts` proves the encoding
 * survives colour removal by planning a row under a theme whose four band colours are the *same
 * string* and showing the bands are still distinguishable.
 *
 * ## Mood is a reading of the bands, not a second measurement
 *
 * {@link riderMoodOf} is a total function from {@link WaitBand}, and that is the whole of the
 * rider-mood treatment. It cannot consult a mean, because it is not given one: the band came from
 * `t - arrivedAt` against the run's own thresholds, both of which are observations (R1). The
 * vocabulary has three rungs and the bands have four, so `long` and `abandoned` share
 * `distressed` — stated here rather than papered over, and the fourth band keeps its own **shape**
 * and its own **word** in `describeFrame`, so nothing is lost that a reader could have used.
 */

import type { FloorQueue, QueueGroup, QueuedRider, WaitBand } from '../frame/overlay.js';

/* -------------------------------------------------------------------------- *
 * Bands → shapes, and bands → mood
 * -------------------------------------------------------------------------- */

/**
 * One shape per band. **Injective, and asserted to be.**
 *
 * Chosen so the four are distinguishable at 12 px and in greyscale: an empty ring, a half-filled
 * ring, a solid disc, and a cross that is not a ring at all. The progression reads as *filling up*,
 * which is the direction the wait is going.
 *
 * `✖` and not `✗`: `render/canvas.ts` already draws `✗` for *a call no car answers in this run*
 * (`D10`), which is a claim about the dispatcher, and this is a claim about one person's clock.
 * Two different facts do not get one glyph — the same argument that separated `✗` from `⊘`.
 */
export const BAND_GLYPH: Readonly<Record<WaitBand, string>> = Object.freeze({
  settling: '○',
  waiting: '◑',
  long: '●',
  abandoned: '✖',
});

/** The glyph for a boarding that just happened — the relief transition. */
export const RELIEF_GLYPH = '✓';

/** Words for a band, for the text alternative and for a caption. Never a colour name. */
export const BAND_WORDS: Readonly<Record<WaitBand, string>> = Object.freeze({
  settling: 'just arrived',
  waiting: 'waiting a while',
  long: 'over the long-wait threshold',
  abandoned: 'past the abandonment horizon',
});

/**
 * How a rider is doing — D4's ladder, plus the transition that is not a band.
 *
 * `relieved` is deliberately not reachable from {@link riderMoodOf}: it is not a state a *waiting*
 * rider can be in. It belongs to `FloorQueue.recentlyBoarded`, which counts people who have
 * stopped waiting, and it exists because a boarding is otherwise invisible — the queue simply
 * gets shorter between two frames, and the one moment where the dispatcher visibly did its job
 * looks exactly like nobody having been there.
 */
export type RiderMood = 'calm' | 'frustrated' | 'distressed' | 'relieved';

/**
 * Band → mood. Total, monotone, and derived from an observation by construction.
 *
 * `long` and `abandoned` both map to `distressed` because the ladder has three rungs and the bands
 * have four. That is a real loss of resolution *in the mood vocabulary* and it is repaid in the two
 * places a reader actually reads: the glyph (four shapes) and the sentence `describeFrame` speaks
 * (four phrasings, {@link BAND_WORDS}).
 */
export function riderMoodOf(band: WaitBand): Exclude<RiderMood, 'relieved'> {
  switch (band) {
    case 'settling':
      return 'calm';
    case 'waiting':
      return 'frustrated';
    case 'long':
    case 'abandoned':
      return 'distressed';
  }
}

/* -------------------------------------------------------------------------- *
 * The plan
 * -------------------------------------------------------------------------- */

/** § 6.2's first threshold: at or below this, every rider gets a glyph and there is no count. */
export const MAX_INDIVIDUAL_GLYPHS = 12;
/** § 6.2's second threshold: above this, the row is a bar however much width it has. */
export const MAX_GLYPHS_WITH_COUNT = 40;

export type QueueRowMode = 'glyphs' | 'glyphs-and-count' | 'bar';

/** One rider's glyph, with the band that chose it kept beside it. */
export interface QueueGlyph {
  readonly passengerId: string;
  readonly band: WaitBand;
  readonly glyph: string;
  readonly mood: Exclude<RiderMood, 'relieved'>;
}

/**
 * A run of glyphs under one label.
 *
 * Conventionally there is one segment and {@link label} is `undefined`. Under
 * `destination-dispatch` there is one per promised car and the label is the car — § 6.2: *"the
 * renderer must therefore group the glyphs by promised car and label the group, or it will draw a
 * Level-1 building as a Level-0 one"*.
 */
export interface QueueSegment {
  readonly label: string | undefined;
  readonly glyphs: readonly QueueGlyph[];
  /** Riders in this group that the row had no width for. Summed into the row's `+N`. */
  readonly hidden: number;
}

/** One landing's row, ready to draw. Pure data — no pixels, no colours. */
export interface QueueRowPlan {
  readonly floorId: string;
  readonly mode: QueueRowMode;
  readonly segments: readonly QueueSegment[];
  /** Riders here that no glyph stands for. `0` in `glyphs` mode, by definition. */
  readonly overflow: number;
  /** `log(1 + n) / log(1 + scale)`, clamped to `[0, 1]`. `0` unless {@link mode} is `bar`. */
  readonly barFraction: number;
  /**
   * The count, in words, or `''` in `glyphs` mode where every rider is on screen.
   *
   * A bar is **never** the only carrier of its value — the same rule `SummaryBar` keeps one level
   * up. A reader who cannot judge a log-scaled length (nobody can) reads the number instead.
   */
  readonly text: string;
  /** `✓N` when somebody just boarded here, else `undefined`. */
  readonly reliefText: string | undefined;
  readonly worstBand: WaitBand;
  readonly total: number;
  readonly oldestWaitS: number;
}

export interface QueueRowInput {
  readonly queue: FloorQueue;
  /**
   * How many glyph cells the row's width allows — **derived from the layout, never a constant**.
   *
   * This is the *"to the row width"* half of § 6.2's middle band, and it is why the degradation is
   * a property of the viewport rather than of the building. A label costs cells too: a segment
   * labelled `main-B` under a panel spends seven of them before its first rider.
   */
  readonly capacityCells: number;
  /** Whether the floor pitch leaves room for a glyph at all. § 6.2's second bar trigger. */
  readonly pitchFits: boolean;
  /**
   * The deepest queue anywhere at this instant, for the bar's log scale.
   *
   * A bar needs a full-scale reference and this project has no fixed one: the deepest landing
   * measured is 175 on one building and 379 on another (**M5**), and pinning either would make the
   * other's bars unreadable. Taken from the frame so the bars are comparable *with each other*,
   * which is the comparison a reader actually makes, and the count is printed beside every bar so
   * the moving scale can never be the only thing they have.
   */
  readonly scaleTotal: number;
}

/**
 * One landing's queue, planned.
 *
 * Pure and total: no queue, no width and no pitch are all representable and none of them throws.
 * The order of the tests below is the order § 6.2 states them in, and the two "or" clauses are
 * genuinely or-ed — a floor pitch too small for a glyph produces a bar at *any* depth, which is
 * what makes Vertical City's 100 floors drawable at all.
 */
export function planQueueRow(input: QueueRowInput): QueueRowPlan {
  const { queue, capacityCells, pitchFits, scaleTotal } = input;
  const relief =
    queue.recentlyBoarded > 0 ? `${RELIEF_GLYPH}${String(queue.recentlyBoarded)}` : undefined;
  const base = {
    floorId: queue.floorId,
    worstBand: queue.worstBand,
    total: queue.total,
    oldestWaitS: queue.oldestWaitS,
    reliefText: relief,
  } as const;

  if (queue.total === 0) {
    return { ...base, mode: 'glyphs', segments: [], overflow: 0, barFraction: 0, text: '' };
  }

  if (!pitchFits || queue.total > MAX_GLYPHS_WITH_COUNT || capacityCells < 1) {
    return {
      ...base,
      mode: 'bar',
      segments: [],
      overflow: queue.total,
      barFraction: logFraction(queue.total, scaleTotal),
      text: `${String(queue.total)} waiting · longest ${queue.oldestWaitS.toFixed(0)} s`,
    };
  }

  const { segments, drawn } = fillSegments(queue.groups, capacityCells);
  const overflow = queue.total - drawn;
  if (overflow === 0 && queue.total <= MAX_INDIVIDUAL_GLYPHS) {
    return { ...base, mode: 'glyphs', segments, overflow: 0, barFraction: 0, text: '' };
  }
  return {
    ...base,
    mode: 'glyphs-and-count',
    segments,
    overflow,
    barFraction: 0,
    // Above the individual-glyph budget the number is stated whether or not anything was hidden:
    // a reader counting thirteen dots is a reader the row has failed.
    text: overflow > 0 ? `+${String(overflow)}` : `${String(queue.total)} waiting`,
  };
}

/**
 * Spend the row's cells across the promise groups, in order, labels first.
 *
 * Greedy and in group order rather than proportional, because the groups are already sorted by
 * promised car and a proportional split would give a group of one rider a fractional glyph. A
 * group that gets no cells at all still contributes its riders to the row's `+N`, so the count is
 * never smaller than the truth.
 */
function fillSegments(
  groups: readonly QueueGroup[],
  capacityCells: number,
): { readonly segments: readonly QueueSegment[]; readonly drawn: number } {
  const segments: QueueSegment[] = [];
  let left = capacityCells;
  let drawn = 0;
  for (const group of groups) {
    // A label costs its own characters plus the space after it. Charged before the group's riders
    // so a labelled group that cannot fit its label is not drawn as an unlabelled one — which
    // would be the Level-1-as-Level-0 defect, in miniature.
    const labelCells = group.promisedCarId === undefined ? 0 : group.promisedCarId.length + 1;
    if (left - labelCells < 1) {
      segments.push({ label: group.promisedCarId, glyphs: [], hidden: group.total });
      continue;
    }
    left -= labelCells;
    const take = Math.min(group.total, left, MAX_GLYPHS_WITH_COUNT);
    left -= take;
    drawn += take;
    segments.push({
      label: group.promisedCarId,
      glyphs: group.riders.slice(0, take).map(glyphOf),
      hidden: group.total - take,
    });
  }
  return { segments, drawn };
}

function glyphOf(rider: QueuedRider): QueueGlyph {
  return {
    passengerId: rider.passengerId,
    band: rider.band,
    glyph: BAND_GLYPH[rider.band],
    mood: riderMoodOf(rider.band),
  };
}

/**
 * `log(1 + n) / log(1 + scale)`, clamped.
 *
 * `log1p` rather than `log(1 + n)` spelled out: the two agree here and the former is what the
 * design's formula means for small `n`, where a queue of one must not be a bar of zero.
 */
function logFraction(total: number, scaleTotal: number): number {
  const scale = Math.max(scaleTotal, total, 1);
  const fraction = Math.log1p(total) / Math.log1p(scale);
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}

/**
 * The § 6.3 clause, per floor: *"Floor 7: 6 people waiting, the longest for 41 seconds."*
 *
 * A description and not a manifest (`KB-13`): the individuals are counted and banded, never
 * enumerated. The band is said in **words**, which is the strongest form of *colour is never the
 * only signal* — the sighted reader has four shapes and the non-sighted reader has four phrasings
 * of the same four facts.
 */
export function describeQueue(queue: FloorQueue): string {
  if (queue.total === 0) {
    return queue.recentlyBoarded === 0
      ? `Floor ${queue.floorId}: nobody waiting.`
      : `Floor ${queue.floorId}: nobody waiting, ${String(queue.recentlyBoarded)} just boarded.`;
  }
  const people = queue.total === 1 ? 'person' : 'people';
  const promise =
    queue.groups.length > 1 && queue.groups.every((group) => group.promisedCarId !== undefined)
      ? ` across ${String(queue.groups.length)} promised cars`
      : '';
  const relief =
    queue.recentlyBoarded === 0 ? '' : `, ${String(queue.recentlyBoarded)} just boarded`;
  return (
    `Floor ${queue.floorId}: ${String(queue.total)} ${people} waiting${promise}, the longest for ` +
    `${queue.oldestWaitS.toFixed(0)} seconds — ${BAND_WORDS[queue.worstBand]}${relief}.`
  );
}
