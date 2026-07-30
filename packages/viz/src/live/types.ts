/**
 * The shapes the left rail and the transport read at the playhead. Pure data, no DOM.
 *
 * ## The one rule this directory is built around
 *
 * Everything here is derived from **observations** — counts of things that happened, and the age
 * of somebody who is standing there right now. Nothing here is derived from
 * {@link VizSummary.meanWaitS}, {@link VizSummary.wait95S} or
 * {@link VizSummary.meanTimeToDestinationS}, which are the three figures `awtIsValid` speaks for
 * (`docs/10-experience-layer-contract.md` R9, and `frame/overlay.ts`'s `meansAreSuppressed`).
 *
 * That is not a convention kept by care. `render/mood.ts` already measured what care would cost:
 * at the viewer's own defaults only **14 of 60** building × dispatcher combinations produce a
 * quotable mean, so a rail that leaned on one would be blank on the 46 runs whose mood is worth
 * showing — which are precisely the runs where the queues diverged. So the rail is built from
 * counts, and `live/noMeans.test.ts` asserts mechanically that no module in this directory even
 * *names* the three suppressible fields.
 *
 * Where a figure genuinely **is** an estimate it is typed `| undefined` and is `undefined` when
 * `meansAreSuppressed(recording)`. Today exactly one such figure exists in this directory and it
 * is not a mean at all — see {@link LiveObservations.servedUnderThresholdPct}, whose `undefined`
 * is R13's *an estimate without its `n` may not be drawn* rather than a suppression.
 *
 * ## Time
 *
 * Every `…S` here is **simulated seconds** from the kernel, exactly as everywhere else. The only
 * other clock in this directory is the *time of day*, which is `DAY_START_S + simTimeS` and is a
 * presentation offset rather than a wall clock — see `timeline.ts`, which is the single place the
 * two meet.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizDecision, VizPhase } from '../contract/types.js';

/* -------------------------------------------------------------------------- *
 * Wait-age bands — the mood card (design L1, L2) and the stage legend (M4)
 * -------------------------------------------------------------------------- */

/**
 * The four wait-age bands, by the names the design gives the mood card's legend.
 *
 * **These are ages, not outcomes.** `taking-the-stairs` is the fourth *band* — somebody who is
 * standing at a landing right now and has been for at least two minutes. It is **not** the count
 * of people who gave up: that is {@link LiveObservations.abandoned}, which is a different
 * quantity over a different population (legs whose wait passed the run's own abandonment
 * horizon, whether or not anybody is still standing). The design keeps both, in two places, and
 * conflating them would let a rail report four people "taking the stairs" while nobody had
 * abandoned anything.
 */
export type WaitBandId = 'breezy' | 'tapping-foot' | 'checking-watch' | 'taking-the-stairs';

/** One band: its boundary, its two names, its colour and its face. */
export interface WaitBandDefinition {
  readonly id: WaitBandId;
  /** Inclusive lower bound of the band, simulated seconds. */
  readonly fromS: number;
  /** Exclusive upper bound, or `undefined` for the open top band. */
  readonly toS: number | undefined;
  /** The mood card's 2×2 legend label — design `:72–76`. */
  readonly label: string;
  /**
   * The stage strip's label — design `:230–233`, requirement M4.
   *
   * Deliberately a *second* string rather than a reuse of {@link label}: under the stage the
   * legend says how long, beside the mood card it says how it feels, and the design writes both.
   */
  readonly legendLabel: string;
  /** The band palette, requirement S7. Every wait-age claim on every surface uses these. */
  readonly color: string;
  /** The 46 px face glyph the mood card tints — design `:2281`. */
  readonly face: string;
}

/** One band's share of the people standing right now. */
export interface WaitBandCount {
  readonly band: WaitBandDefinition;
  /** People in this band at the playhead. An observation. */
  readonly count: number;
  /**
   * `count / total`, as a whole percentage, exactly as the design rounds it.
   *
   * Rounded shares need not sum to 100. The design draws them as flex widths of one bar, where
   * that does not matter; a caller that needs an exact partition uses {@link count}.
   */
  readonly pct: number;
}

/** The stacked bar and its legend, at one instant. */
export interface WaitBands {
  readonly atS: SimTime;
  /** People standing at a landing right now. Equals `frameAt(recording, t).totalWaiting`. */
  readonly total: number;
  /** One entry per band, in {@link WAIT_BANDS} order. Always four, including the empty ones. */
  readonly counts: readonly WaitBandCount[];
  /** The worst band with anybody in it, or the first band when nobody is waiting. */
  readonly worst: WaitBandDefinition;
  /** Index of {@link worst} in {@link WAIT_BANDS}. The design indexes its copy arrays by it. */
  readonly worstIndex: number;
  /** The longest wait currently on the board, seconds. `undefined` when nobody is waiting. */
  readonly longestCurrentWaitS: number | undefined;
}

/** The mood card's face, headline and sub-line — design `:57–64`, `:2281–2299`. */
export interface Mood {
  readonly bandId: WaitBandId;
  readonly index: number;
  /** `◡ ◠ ⌄ ×`. A shape per level, so the card survives a greyscale screenshot (KB-15). */
  readonly face: string;
  readonly headline: string;
  readonly sub: string;
  /** The band colour, used for the face's border. */
  readonly edge: string;
  /** The face's tinted disc. */
  readonly bg: string;
}

/* -------------------------------------------------------------------------- *
 * Observations — the four stat rows and the goal inputs (design L3)
 * -------------------------------------------------------------------------- */

/**
 * The deepest a single floor's queue ever got, up to the playhead.
 *
 * A *floor*, summing both direction landings, rather than a `(floor, direction)` landing: the
 * alarm chip the design draws over the stage says *"9 people stacked up at Level 12"* and the
 * report's `DEEPEST QUEUE` names a floor. Splitting the two buttons would report half a stack.
 */
export interface PeakQueue {
  /** The largest simultaneous queue at any one floor in `[startedAt, t]`. Non-decreasing in `t`. */
  readonly count: number;
  /** Where it happened. `undefined` when nobody has arrived yet. */
  readonly floorId: string | undefined;
  /** The **earliest** instant that depth was reached. `undefined` when nobody has arrived yet. */
  readonly atS: SimTime | undefined;
}

/** Everything the four stat rows and the shift layer's goals read. Every field is a count. */
export interface LiveObservations {
  readonly atS: SimTime;
  /** People standing at a landing right now — design *standing right now*. From `overlayAt`. */
  readonly waitingNow: number;
  /** The worst wait currently on the board. `undefined` when nobody is waiting. */
  readonly longestCurrentWaitS: number | undefined;
  /** Legs whose call had been registered by `t`. The goal denominator, and B3's wake-up gate. */
  readonly arrived: number;
  /** Legs that had boarded by `t`. */
  readonly boarded: number;
  /**
   * Legs that had **alighted** by `t` — design *carried today*, and BE2's whole reason to exist.
   *
   * Boarding is not delivery. Before `VizLeg.alightedAt` the recording could only offer
   * `boardedLegs`, and a rail that called that "carried" would over-report by everyone currently
   * in transit — largest at exactly the moment a reader is watching, the peak.
   */
  readonly carried: number;
  /** Legs that boarded by `t` having waited under {@link longWaitThresholdS}. The numerator. */
  readonly servedUnderThresholdCount: number;
  /** Legs that boarded by `t`. The denominator, carried beside the ratio — R13. */
  readonly servedCount: number;
  /**
   * {@link servedUnderThresholdCount} over {@link servedCount}, `0`–`100`.
   *
   * `undefined` when nothing has boarded. Not `100`: the design's prototype returns 100 % on an
   * empty denominator, which reads as *everybody was served promptly* about a building where
   * nobody has been served at all. R13's rule, one type down.
   */
  readonly servedUnderThresholdPct: number | undefined;
  /**
   * The boundary the ratio above is drawn at — `summary.longWaitThresholdS`, never assumed.
   *
   * The design's row is captioned *served under 60 s* and 60 s is what every shipped building
   * reports, but the threshold is the **run's**, so the caption is generated from this field
   * rather than written out. A building that counted a long wait at 45 s would otherwise be
   * labelled with somebody else's number.
   */
  readonly longWaitThresholdS: number;
  readonly peakQueue: PeakQueue;
  /** The deepest queue standing at any one floor **right now** — the alarm chip's figure. */
  readonly deepestQueueNow: number;
  /** Which floor that is, in building order on a tie. `undefined` when nobody is waiting. */
  readonly deepestQueueFloorId: string | undefined;
  /**
   * Legs whose wait had passed {@link horizonS} by `t` — design *took the stairs*.
   *
   * **Derived, because the recording has no such field.** A leg is counted from the instant
   * `arrivedAt + horizonS`, whether it eventually boarded or not, which is what makes the count
   * non-decreasing in `t` and independent of what happens after the playhead.
   */
  readonly abandoned: number;
  /** The abandonment horizon applied — `summary.serviceLevel.horizonS`. Copied, never assumed. */
  readonly horizonS: number;
}

/* -------------------------------------------------------------------------- *
 * The transport (design M5, S3)
 * -------------------------------------------------------------------------- */

/** One band of the phase-segmented timeline. */
export interface TimelineSegment {
  /** `VizPhase.id`, or `whole-run` for the unlabelled fallback band. */
  readonly id: string;
  /** `undefined` on the fallback band, where no schedule is known. */
  readonly kind: VizPhase['kind'] | undefined;
  /** The short chip label — `PEAK`, `FILLING`. Empty string on the fallback band. */
  readonly label: string;
  readonly startS: SimTime;
  readonly endS: SimTime;
  /** `endS - startS`. The design binds this straight to `flex`. */
  readonly span: number;
  /** Left edge as a percentage of the run, for an absolutely positioned caller. */
  readonly startPct: number;
  readonly widthPct: number;
  readonly bg: string;
  readonly fg: string;
  /** The hover title — `PEAK · 07:12 · 11.4 %pop/5 min`. */
  readonly title: string;
  /** `null` when the run's record carries no population to divide by — never `0`. */
  readonly ratePctPop5min: number | null;
  /** Whether this segment lies inside the reporting window, the only quotable part of the run. */
  readonly inReportWindow: boolean;
}

/** One o'clock tick under the timeline. */
export interface TickLabel {
  /** Simulated seconds. */
  readonly atS: SimTime;
  /** Time of day, seconds since midnight. */
  readonly todS: number;
  /** `hh:mm`. */
  readonly label: string;
  /** Position along the run, `0`–`100`. */
  readonly pct: number;
}

/* -------------------------------------------------------------------------- *
 * WHY IT DID THAT (design L7)
 * -------------------------------------------------------------------------- */

/** One row of the decision log. The design's row shape, plus a title for the tooltip. */
export interface DecisionRow {
  /** Stable within one recording: `${at}-${callId}`. For a keyed list. */
  readonly key: string;
  /** Time of day, `hh:mm`. */
  readonly t: string;
  /** `A → Level 12`, or something honest when nobody took it. */
  readonly head: string;
  /** One line, built from the recorded term breakdown. Never a guess. */
  readonly why: string;
  /** The longer form, for a `title` attribute: what the dominant term measures and what it serves. */
  readonly title: string;
  readonly color: string;
  /** Carried so a caller can style or filter without re-parsing {@link head}. */
  readonly outcome: VizDecision['outcome'] | 'empty';
}

/* -------------------------------------------------------------------------- *
 * The honesty card (design L6)
 * -------------------------------------------------------------------------- */

/** Casual gets a lever, not a lecture; engineer gets the refusal and its rule — B1. */
export type DisclosureMode = 'casual' | 'engineer';

export interface HonestyCard {
  /** `⚠` or `✓`. */
  readonly glyph: string;
  readonly title: string;
  readonly plain: string;
  /** Whether the *show me the maths* disclosure exists at all. Engineer mode only. */
  readonly hasMaths: boolean;
  /** The actual suppression rule, from the summary's own fields. `undefined` in casual mode. */
  readonly maths: string | undefined;
  readonly bg: string;
  readonly edge: string;
  /** What the card is warning about, if anything — drives {@link glyph}, {@link bg}, {@link edge}. */
  readonly warning: boolean;
  /** `meansAreSuppressed(recording)`, copied so a caller need not ask twice. */
  readonly suppressed: boolean;
  /** The observation the casual copy is keyed on. See `honesty.ts`. */
  readonly fallingBehind: boolean;
}
