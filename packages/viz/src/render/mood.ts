/**
 * The building's mood — D4's gauge, and the one feature in this wave that **R1 makes possible**.
 *
 * ## Why this is the valuable property, stated before the code
 *
 * `docs/10-experience-layer-contract.md` R1: *only observations may be scored.* **M1** is why that
 * is not merely defensive — at the viewer's own defaults, only **14 of 60** building × dispatcher
 * combinations produce a quotable mean waiting time. A mood derived from a mean would therefore be
 * blank on **46 of 60** shipped configurations, which is to say blank on the interesting ones,
 * because the reason a mean is refused is usually that the queues diverged and that is precisely
 * the run whose mood is worth showing.
 *
 * Everything below is computed from: how long people have been standing (`t - arrivedAt`), how many
 * arrived, how many were delivered, how many never were, how many waited past the run's own
 * horizon, and how the offered demand compares with the demand answered. Every one of those is an
 * observation. None of them is routed through `awtIsValid`, and the type makes that structural
 * rather than conventional.
 *
 * ## R5, in the type rather than in a comment
 *
 * R5's operative form — as corrected in the design's own review — is that the scorer takes a
 * **narrowed** type and *"`VizSummary` itself is not that type and must not be passed whole"*.
 * {@link MoodSummary} is that narrowing. It is a `Pick`, so it tracks `VizSummary`'s field types
 * automatically, and it omits `meanWaitS`, `wait95S` and `meanTimeToDestinationS` — the three
 * figures `awtIsValid` speaks for — so {@link buildingMood} cannot reach them by construction.
 *
 * It also omits **`awtIsValid` and `awtInvalidReason`**, which R5's example `Pick` would have
 * allowed. That is deliberate and it is stronger: a scorer that cannot see the suppression flag
 * cannot be *made* to branch on it later, and `mood.test.ts` proves the omission has teeth by
 * flipping all five omitted fields on a real recording and requiring the mood to be byte-identical.
 * **`awtInvalidGround`** — the gate's machine-readable half, added at schema version 8 (`the root
 * DECISIONS.md` § D185) — is omitted with them, by the same `Pick` and the same copy list; it
 * postdates the five-field tamper fixture and is named here (2026-07-30) so the omission is
 * documented rather than accidental.
 *
 * ## R2 and R6, which are about what the words may claim
 *
 * R2: *a score is a property of a run, never of a dispatcher.* **M7** is the evidence — Secure
 * Tower under `collective` over 20 consecutive seeds returns a quotable AWT **6 times of 20** and
 * is diagnosed saturated **4 times of 20**, on the same configuration. So {@link BuildingMood}
 * carries {@link BuildingMood.caveat}, every headline is phrased in the past tense about *this
 * run*, and no string this module can produce contains a dispatcher id or a comparative.
 *
 * R6: an outcome evaluated before the playhead reaches `endedAt` is a **preview**. The design says
 * so in as many words — *"A goal evaluated at frame time from `overlayAt` is a preview, and must be
 * labelled provisional until the playhead reaches `endedAt`"* — and {@link BuildingMood.provisional}
 * is that label. A mood shown at 4:12 of a 15:00 run is not a verdict on the run and says so, which
 * is the retraction-in-place behaviour applied to the only quantity this unit displays.
 */

import type { FloorQueue, WaitBand } from '../frame/overlay.js';
import type { VizSummary } from '../contract/types.js';
import type { ViewMode } from '../mode/types.js';
import { BAND_WORDS } from './riderQueue.js';

/* -------------------------------------------------------------------------- *
 * The narrowed input — R1 / R5
 * -------------------------------------------------------------------------- */

/**
 * The observation fields of {@link VizSummary}, and nothing else.
 *
 * A `Pick` rather than a hand-written interface so that a field which changes type in `core`
 * changes type here too. What is **not** in it is the point:
 *
 * | Omitted | Why |
 * |---|---|
 * | `meanWaitS`, `wait95S`, `meanTimeToDestinationS` | the three estimates `awtIsValid` speaks for — R1 forbids scoring them |
 * | `awtIsValid`, `awtInvalidReason`, `awtInvalidGround` | the gate itself — the flag, its sentence, and (schema version 8) its machine-readable ground. A scorer that cannot see it cannot come to depend on it |
 * | `achievedInterval`, `energy` | estimates and an axis. R11: energy is never aggregated into a grade, and the cheapest way to keep that true is not to hand it to the thing that grades |
 *
 * `saturated` **is** here, and it is not an estimate: R4 makes *Overwhelmed* (`summary.saturated`)
 * the first-preference fail state, and R5's own corrected example `Pick` names it.
 */
export type MoodSummary = Pick<
  VizSummary,
  | 'saturated'
  | 'generated'
  | 'delivered'
  | 'undelivered'
  | 'unservedCount'
  | 'pctOverLongWait'
  | 'longWaitThresholdS'
  | 'waitCount'
  | 'handlingCapacity'
  | 'serviceLevel'
>;

/**
 * Everything the gauge is allowed to look at.
 *
 * The run-level half is {@link MoodSummary}; the instant-level half is the queue this wave already
 * computes, which costs nothing extra (§ 2.5, and re-measured with the rendering in place — see the
 * delivery report).
 */
export interface MoodObservations {
  readonly summary: MoodSummary;
  /** The queues at {@link atS}, from `queueAt`. */
  readonly queues: readonly FloorQueue[];
  /** Playhead position, simulated seconds. */
  readonly atS: number;
  /** The run's last instant. {@link atS} short of it makes the mood a preview — R6. */
  readonly endedAt: number;
}

/**
 * Build the narrowed input from a whole recording.
 *
 * **This function is the only place the narrowing happens**, and it is written as an explicit
 * field-by-field copy rather than a spread with deletions, because a spread would carry every
 * future `VizSummary` field into the scorer automatically — including the next estimate somebody
 * adds. The compiler cannot catch that; a copy list can, because a new field simply does not
 * arrive until somebody writes it here and justifies it.
 */
export function moodObservationsOf(
  recording: {
    readonly summary: VizSummary;
    readonly endedAt: number;
  },
  queues: readonly FloorQueue[],
  atS: number,
): MoodObservations {
  const s = recording.summary;
  return {
    summary: {
      saturated: s.saturated,
      generated: s.generated,
      delivered: s.delivered,
      undelivered: s.undelivered,
      unservedCount: s.unservedCount,
      pctOverLongWait: s.pctOverLongWait,
      longWaitThresholdS: s.longWaitThresholdS,
      waitCount: s.waitCount,
      handlingCapacity: s.handlingCapacity,
      serviceLevel: s.serviceLevel,
    },
    queues,
    atS,
    endedAt: recording.endedAt,
  };
}

/* -------------------------------------------------------------------------- *
 * The gauge
 * -------------------------------------------------------------------------- */

/**
 * The ladder, shared with {@link riderMoodOf} so a building and the people in it are graded in one
 * vocabulary. Ordered, and {@link MOOD_ORDER} is the only place that ordering lives.
 */
export type MoodLevel = 'calm' | 'frustrated' | 'distressed';

const MOOD_ORDER: readonly MoodLevel[] = ['calm', 'frustrated', 'distressed'];

/**
 * A shape per level — KB-15 again, at the building scale.
 *
 * The gauge is a word, a shape and a set of reasons. It is deliberately **not** a coloured dial
 * with a good end and a red end: that is the shape of a score, and R11's argument against an eco
 * score applies to a mood dial for the same reason — a single needle invites the reader to
 * optimise it, and the thing they would be optimising is one replication of one seed.
 */
export const MOOD_GLYPH: Readonly<Record<MoodLevel, string>> = Object.freeze({
  calm: '○',
  frustrated: '◑',
  distressed: '●',
});

/** One observation the gauge looked at, with what it found. Always all of them — see below. */
export interface MoodDriver {
  /** Stable id, for the mount and the tests. Never used to special-case a style. */
  readonly id: string;
  readonly label: string;
  readonly level: MoodLevel;
  /** What this observation actually said, with its number. Never a bare adjective — R10. */
  readonly text: string;
}

export interface BuildingMood {
  readonly level: MoodLevel;
  /** {@link MOOD_GLYPH}, so the level survives a greyscale screenshot. */
  readonly glyph: string;
  /** One sentence, in the past tense, about this run. */
  readonly headline: string;
  /** Every observation consulted, in a fixed order, including the ones that found nothing wrong. */
  readonly drivers: readonly MoodDriver[];
  /** True until the playhead reaches `endedAt` — R6. */
  readonly provisional: boolean;
  /** R2, in the component. Names what this is not. */
  readonly caveat: string;
}

const DRIVER_IDS = {
  overwhelmed: 'overwhelmed',
  abandoned: 'abandoned',
  stranded: 'stranded',
  standing: 'standing',
  demand: 'demand',
} as const;

/**
 * The order the drivers are reported in — R4's fail-state preference order, then the two that are
 * about the run rather than about a failure.
 *
 * R4 ranks the fail states *Overwhelmed*, *Abandoned*, *Stranded*, *Locked out*; the fourth is
 * W7b's and is not computable from this recording today (§ 10.4), so it is absent rather than
 * faked. `standing` and `demand` follow because they are the two that explain the first three.
 */
const DRIVER_ORDER: readonly string[] = [
  DRIVER_IDS.overwhelmed,
  DRIVER_IDS.abandoned,
  DRIVER_IDS.stranded,
  DRIVER_IDS.standing,
  DRIVER_IDS.demand,
];

function worst(levels: readonly MoodLevel[]): MoodLevel {
  return levels.reduce<MoodLevel>(
    (found, level) => (MOOD_ORDER.indexOf(level) > MOOD_ORDER.indexOf(found) ? level : found),
    'calm',
  );
}

/** The worst band anybody is standing in right now, across every floor. */
function worstStandingBand(queues: readonly FloorQueue[]): WaitBand | undefined {
  let found: WaitBand | undefined;
  for (const queue of queues) {
    if (queue.total === 0) continue;
    if (found === undefined) {
      found = queue.worstBand;
      continue;
    }
    if (BAND_RANK[queue.worstBand] > BAND_RANK[found]) found = queue.worstBand;
  }
  return found;
}

const BAND_RANK: Readonly<Record<WaitBand, number>> = Object.freeze({
  settling: 0,
  waiting: 1,
  long: 2,
  abandoned: 3,
});

const BAND_LEVEL: Readonly<Record<WaitBand, MoodLevel>> = Object.freeze({
  settling: 'calm',
  waiting: 'frustrated',
  long: 'distressed',
  abandoned: 'distressed',
});

/**
 * The gauge, from observations alone.
 *
 * ## Why every driver is always reported, including the calm ones
 *
 * A gauge that lists only what went wrong cannot be told apart from a gauge that looked at only one
 * thing. Reporting all five, each with its own number, means a reader can see *what was consulted*
 * — and means a mutation that freezes any one of the five inputs turns exactly one driver's text
 * into a constant, which is what makes the liveness evidence per-field rather than per-feature.
 *
 * ## Why the level is a maximum and not a weighted sum
 *
 * A weighted sum is a score, and the weights would be invented here. A maximum says *the worst
 * thing that happened to somebody in this run*, which is a sentence about the run that survives R2:
 * it names no dispatcher, ranks no alternative, and does not move when a different arm is chosen
 * except by moving the observation underneath it.
 */
export function buildingMood(
  observations: MoodObservations,
  mode: ViewMode = 'advanced',
): BuildingMood {
  const { summary, queues, atS, endedAt } = observations;
  const lead = (casual: string, sentence: string): string =>
    mode === 'basic' ? `${casual} ${sentence}` : sentence;
  const drivers: MoodDriver[] = [];

  drivers.push({
    id: DRIVER_IDS.overwhelmed,
    label: 'queues',
    level: summary.saturated ? 'distressed' : 'calm',
    text: summary.saturated
      ? 'The queues never stopped growing — the building could not keep up with the people arriving.'
      : 'The queues stayed under control: they grew and drained rather than running away.',
  });

  const level = summary.serviceLevel;
  const overHorizon = level.overHorizonCount;
  drivers.push({
    id: DRIVER_IDS.abandoned,
    label: 'the unluckiest rider',
    level: level.verdict === 'starved' || overHorizon > 0 ? 'distressed' : 'calm',
    /*
     * The **abandonment horizon** is the phrase issue #71 measured surviving into Casual unchanged,
     * on a card whose whole job is to explain a run to somebody who does not have the vocabulary.
     * `mode/disclosure.ts` holds the vocabulary for the *figures*; this driver is prose and holds
     * its own, under that module's three rules: the lead **restates no figure**, it **makes no
     * claim the source does not**, and the source sentence follows **verbatim**.
     */
    /*
     * *"After a **certain** wait"* was the first draft, and R10's static sweep refused it: `certain`
     * is a probability word, and this repository does not let one stand in a player-facing sentence
     * even where it plainly means *particular*. The rule is right to be blunt here — the sentence
     * sits beside a count of people who gave up.
     */
    text: lead(
      'Past a fixed wait, this run stops counting somebody as waiting at all and treats them as ' +
        'having given up.',
      overHorizon > 0
        ? `${String(overHorizon)} of ${String(level.arrivalCount)} people waited past the ` +
          `${level.horizonS.toFixed(0)} s point at which this run stops counting a wait at all.`
        : `Nobody waited past the ${level.horizonS.toFixed(0)} s abandonment horizon; the longest ` +
          `wait was ${level.longestWaitS === null ? 'not measured — nobody arrived in the reporting window' : `${level.longestWaitS.toFixed(0)} s${level.longestWaitIsCensored ? ' and counting, because that person never boarded' : ''}`}.`,
    ),
  });

  drivers.push({
    id: DRIVER_IDS.stranded,
    label: 'delivered',
    level: summary.undelivered > 0 ? 'frustrated' : 'calm',
    text:
      summary.undelivered > 0
        ? `${String(summary.delivered)} of ${String(summary.generated)} people got where they were ` +
          `going. ${String(summary.undelivered)} were still in the building when the run ended.`
        : `All ${String(summary.delivered)} people got where they were going.`,
  });

  const band = worstStandingBand(queues);
  const standingTotal = queues.reduce((sum, queue) => sum + queue.total, 0);
  const boardedNow = queues.reduce((sum, queue) => sum + queue.recentlyBoarded, 0);
  const oldest = queues.reduce((best, queue) => Math.max(best, queue.oldestWaitS), 0);
  drivers.push({
    id: DRIVER_IDS.standing,
    label: 'standing right now',
    level: band === undefined ? 'calm' : BAND_LEVEL[band],
    text:
      band === undefined
        ? boardedNow > 0
          ? `Nobody is waiting at this instant; ${String(boardedNow)} just boarded.`
          : 'Nobody is waiting at this instant.'
        : `${String(standingTotal)} standing at ${String(queues.filter((q) => q.total > 0).length)} ` +
          `floors, the longest for ${oldest.toFixed(0)} s — ${BAND_WORDS[band]}` +
          `${boardedNow > 0 ? `, and ${String(boardedNow)} just boarded` : ''}.`,
  });

  const { offeredPer5Min, personsPer5Min } = summary.handlingCapacity;
  drivers.push({
    id: DRIVER_IDS.demand,
    label: 'demand answered',
    level: personsPer5Min < offeredPer5Min ? 'frustrated' : 'calm',
    /*
     * The other half of #71's measured diff on this card: *per 5 minutes* is a rate, and a rate
     * given as two bare decimals is the shape a reader out of their depth reads as two scores. The
     * lead says **what is being compared**, and stops — naming a winner would be the ranking rule 2
     * forbids, and it would be a ranking of a building against itself.
     */
    text: lead(
      'Two rates, over the same five minutes: how fast people turned up, against how fast the lifts ' +
        'moved them.',
      `${offeredPer5Min.toFixed(1)} people arrived every 5 minutes and the lifts carried ` +
        `${personsPer5Min.toFixed(1)}.` +
        (personsPer5Min < offeredPer5Min
          ? ' More were arriving than leaving, which is what a queue is.'
          : ' The lifts kept up with the door.'),
    ),
  });

  const ordered = DRIVER_ORDER.map((id) => {
    const driver = drivers.find((candidate) => candidate.id === id);
    if (driver === undefined) {
      throw new Error(`buildingMood: DRIVER_ORDER names "${id}" and nothing produced it.`);
    }
    return driver;
  });
  if (ordered.length !== drivers.length) {
    throw new Error('buildingMood: a driver is missing from DRIVER_ORDER and would not be drawn.');
  }

  const overall = worst(ordered.map((driver) => driver.level));
  const provisional = atS < endedAt;
  return {
    level: overall,
    glyph: MOOD_GLYPH[overall],
    headline: headlineFor(overall, provisional),
    drivers: ordered,
    provisional,
    caveat:
      'This describes what happened in this one run, at this one seed. It is not a verdict on the ' +
      'dispatcher: one replication cannot support that, and the same configuration on Secure ' +
      'Tower returned a quotable average on 6 of 20 consecutive seeds.',
  };
}

/**
 * The headline, in the past tense and about the building.
 *
 * *"The building"*, never *"you"* and never a dispatcher id: R2 forbids the sentence that would
 * make a rider's bad day the consequence of a specific choice, and the surest way to keep a
 * sentence from implying causation is for it to have no room for an agent.
 */
function headlineFor(level: MoodLevel, provisional: boolean): string {
  const body =
    level === 'calm'
      ? 'The building is coping.'
      : level === 'frustrated'
        ? 'The building is falling behind.'
        : 'The building is in trouble.';
  return provisional
    ? `${body} So far — the run has not finished, so this can still change.`
    : body;
}
