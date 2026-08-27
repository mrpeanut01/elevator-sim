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
 *
 * ## R6 again, and why the label was not enough — issue #109
 *
 * A *preview* is a fair description of a reading that will settle as the playhead advances. **Four
 * of these five drivers are not previews.** `record/recordRun.ts` is *"the only place in the package
 * that runs a simulation"* and it simulates the whole day up front — boot runs one on a cold load
 * with zero clicks — so `summary.saturated`, `summary.serviceLevel`, `summary.delivered` and
 * `summary.handlingCapacity` carry the **finished day** into the very first frame. A card drawn at
 * 00:00 was not previewing the shift; it was reporting the end of it beside a clock reading the
 * start. Only `standing` re-folds at the playhead.
 *
 * So each driver now declares {@link MoodDriver.basis}, and a renderer gates on it rather than
 * merely italicising the lot: `dev/leftRail.ts#moodDriverPanelOf` draws the `'now'` driver and
 * withholds the `'whole-run'` ones until the shift is over — the rule `dev/reportPanel.ts`'s
 * watching sheet already keeps (§ D223), copied rather than reinvented. {@link
 * BuildingMood.retraction} is the words that go in their place, because the rail draws `drivers`
 * and `provisional` and has never drawn `headline`.
 */

import type { FloorQueue, WaitBand } from '../frame/overlay.js';
import type { VizSummary } from '../contract/types.js';
import type { WaitBandBasis } from '../live/types.js';
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
 *
 * `reportWindow` **is** here too, and it grades nothing — GitHub issue #288's fourth criterion. It
 * is a window descriptor rather than a figure, and it is in the `Pick` for the reason a figure
 * would not be: `serviceLevel` is folded over that window's arrivals and the counts printed beside
 * this card are folded over the whole shift, so the driver that reads one of them has to be able to
 * say which. Measured on the breadth fixture, the gap is not hypothetical — Secure Tower's
 * `serviceLevel` is over **102** arrivals while the same run holds **211** legs. Naming the window
 * makes no claim the source does not; it says which cohort the source's claim is about.
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
  | 'reportWindow'
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
      reportWindow: s.reportWindow,
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
  /**
   * **What window this driver's number is folded over** — and the field a renderer needs in order
   * to keep R6 rather than merely announce it.
   *
   * `'now'` means the sentence is re-derived at the playhead and is true of the instant on screen.
   * `'whole-run'` means it is folded over the entire shift and does not move with the playhead at
   * all: `recordRun` simulates the whole day up front, so `summary.saturated`,
   * `summary.serviceLevel`, `summary.delivered` and `summary.handlingCapacity` already carry the
   * end of the day at the first frame of it.
   *
   * That is why {@link BuildingMood.provisional} was not enough on its own. A flag says *this may
   * change*; four of these five sentences cannot change, because they were never about the instant
   * they are drawn beside. What a reader needs is for them **not to be drawn** until the playhead
   * has earned them, which is a decision only a renderer holding both the driver and the playhead
   * can take — so the classification lives here, on the driver that knows it, rather than as a list
   * of ids in whichever file happens to be doing the drawing.
   *
   * `WaitBandBasis` itself, rather than a private union spelling the same two words. The rail's
   * mood card, its honesty card and now its driver rows all answer *over what window?*, and three
   * copies of one two-valued vocabulary is how they would come to answer it differently. The import
   * is type-only and adds no runtime edge; `live/types.ts` imports nothing from `render/`, so there
   * is no cycle to acquire.
   */
  readonly basis: WaitBandBasis;
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
  /**
   * **The retraction, in words** — non-empty exactly when {@link provisional}, and empty once the
   * playhead has reached the end.
   *
   * `mood.test.ts` has asserted since this unit was written that *"a flag no renderer is obliged to
   * read is not a retraction — the words carry it too"*, and pinned that claim on
   * {@link headline}'s *So far*. The claim was true of the canvas, which draws `headline` under the
   * building name, and false of the left rail, which draws `drivers`, `caveat` and `provisional`
   * and **never `headline`** — the rail's own headline comes from `live/bands.ts`'s `moodOf`. So on
   * the surface where the drivers are actually read, the whole of R6 was
   * `.mood-provisional { font-style: italic; }`: a typographic signal with no text, on a card whose
   * own docstring is a KB-15 table promising every signal a second channel.
   *
   * This field is that second channel, and it is a separate string from {@link headline} rather
   * than a re-use of it because the two say different things. `headline` retracts a *verdict the
   * card is still showing*; this retracts the readings the card has **stopped** showing, and names
   * them, so a reader who saw four rows a moment ago knows where they went and what brings them
   * back.
   *
   * The driver labels in it are derived from {@link drivers}, not written down: a sixth driver, or
   * a driver whose basis changes, moves this sentence without anybody remembering to.
   */
  readonly retraction: string;
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
    // `summary.saturated` is the trend test over the whole run. It reads the same at 00:00 as at
    // the last frame, because `recordRun` had already finished the day before the first paint.
    basis: 'whole-run',
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
    /*
     * `summary.serviceLevel` is folded before the first paint, including over arrivals the playhead
     * has not reached, so this reading is settled rather than accruing: *the longest wait* is the
     * longest wait of the day, not of the day so far. That is what {@link MoodDriver.basis} gates
     * on and `'whole-run'` is right for it.
     *
     * **The word is about the clock and not about the cohort**, and the comment that stood here
     * said *"folds every arrival in the run"*, which is false: `diagnoseServiceLevel` folds the
     * arrivals inside `summary.reportWindow`, and on Secure Tower's breadth run that is 102 of 211.
     * A `basis` of `'whole-run'` beside a figure over a five-minute window is the reader's problem
     * unless the sentence says so, which is why the text below names the window — issue #288.
     */
    basis: 'whole-run',
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
    /*
     * **The window is in the sentence** — GitHub issue #288's fourth criterion.
     *
     * `summary.serviceLevel` is folded over the run's **reporting window**; every count printed
     * beside this card — the rail's stat rows, the Day report's CARRIED and TOOK THE STAIRS — is
     * folded over the **whole shift**. Both are right and they are over different people, and the
     * issue's sheet is what that costs: *"Nobody waited past the 900 s abandonment horizon"* three
     * rows from a stairs cell reading `11`, with nothing on either to say they are two populations.
     *
     * It is not a rare configuration. `observations.test.ts` measured **zero** spanning windows
     * across all eight shipped buildings on the breadth fixture, and on Secure Tower the split is
     * 102 arrivals against 211 legs. It closes only on a run whose window is the whole day, which
     * `office-day` produces and the thirty-minute slice does not — so the clause is generated from
     * `reportWindow.id` rather than written out, exactly as `shift/report.ts#worstWaitFigure`
     * generates its own. A sheet where the two coincide will say `report-window` on both and a
     * reader can see that they do.
     *
     * The **verdict is untouched**: `level` and both branches are what they were, and the driver's
     * `overHorizonCount` reading was already correct — it is the sentence's silence about *whose*
     * horizon crossings it counted that was the defect, not its arithmetic.
     */
    text: lead(
      'Past a fixed wait, this run stops counting somebody as waiting at all and treats them as ' +
        'having given up.',
      overHorizon > 0
        ? `${String(overHorizon)} of ${String(level.arrivalCount)} people in the ` +
          `${summary.reportWindow.id} window waited past the ${level.horizonS.toFixed(0)} s point ` +
          'at which this run stops counting a wait at all.'
        : `Nobody in the ${summary.reportWindow.id} window waited past the ` +
          `${level.horizonS.toFixed(0)} s abandonment horizon; the longest wait there was ` +
          `${level.longestWaitS === null ? 'not measured — nobody arrived in the reporting window' : `${level.longestWaitS.toFixed(0)} s${level.longestWaitIsCensored ? ' and counting, because that person never boarded' : ''}`}.`,
    ),
  });

  drivers.push({
    id: DRIVER_IDS.stranded,
    label: 'delivered',
    // Three run-level counts. None of them moves with the playhead.
    basis: 'whole-run',
    level: summary.undelivered > 0 ? 'frustrated' : 'calm',
    /*
     * **`All N` was asserted over the wrong complement, and it is gone.**
     *
     * The identity `core` actually holds (`sim/types.ts`) is
     * `generated === delivered + undelivered + abandoned + accessRefused`, and an `accessRefused`
     * rider is in **neither** of the two buckets this driver could see: not delivered, not
     * undelivered, turned away at the door by a credential their floor does not carry (§ D265).
     * Seven of the eight shipped buildings declare `accessZones`, so `undelivered === 0` was never
     * the same question as *did everybody get where they were going*, and on those buildings this
     * card printed **All 34 people got where they were going** over riders who never boarded.
     *
     * `${delivered} of ${generated}` is true under every one of the four outcomes, because it
     * claims only what it counts: this many of the people who turned up arrived. It is deliberately
     * printed **unconditionally** — the branch is now only about whether there is a second sentence
     * to add — so there is no arm left in which a total can be re-derived as a complement of one
     * bucket.
     *
     * **What it still does not say, stated rather than left to be discovered.** When
     * `undelivered === 0` and `delivered < generated`, the remainder is `accessRefused` plus
     * `abandoned` and this sentence names neither: `MoodSummary` cannot see them. Naming them means
     * widening `VizSummary` and the recording schema with it, which is a schema-version change and
     * belongs in its own lane. The sentence is silent about the remainder; it does not claim there
     * is none.
     *
     * The **level** is untouched and still reads `undelivered > 0`. Moving it would be a change to
     * what the gauge judges rather than to what it says, and the two are not the same repair.
     */
    text:
      `${String(summary.delivered)} of ${String(summary.generated)} people got where they were ` +
      'going.' +
      (summary.undelivered > 0
        ? ` ${String(summary.undelivered)} were still in the building when the run ended.`
        : ''),
  });

  const band = worstStandingBand(queues);
  const standingTotal = queues.reduce((sum, queue) => sum + queue.total, 0);
  const boardedNow = queues.reduce((sum, queue) => sum + queue.recentlyBoarded, 0);
  const oldest = queues.reduce((best, queue) => Math.max(best, queue.oldestWaitS), 0);
  drivers.push({
    id: DRIVER_IDS.standing,
    label: 'standing right now',
    // The one driver built from `queues`, which `queueAt` re-folds at the playhead. Its sentence is
    // true of the instant on screen and of no other, which is what keeps it drawable mid-run.
    basis: 'now',
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
    // Two run-level rates out of `summary.handlingCapacity`, both folded over the whole shift.
    basis: 'whole-run',
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
    retraction: provisional ? retractionFor(ordered) : '',
    caveat:
      'This describes what happened in this one run, at this one seed. It is not a verdict on the ' +
      'dispatcher: one replication cannot support that, and the same configuration on Secure ' +
      'Tower returned a quotable average on 6 of 20 consecutive seeds.',
  };
}

/**
 * {@link BuildingMood.retraction} — what a card drawn short of the end is withholding, and why.
 *
 * **The labels are read off the drivers, never written down here.** A sixth driver, or one whose
 * `basis` is corrected, changes this sentence on the same commit that changes the card; a
 * hand-typed list would go stale the way `CLAUDE.md`'s § D227 records a *refusal* going stale —
 * which is the worse half, because a sentence that names the wrong readings tells a reader the card
 * is hiding something it is in fact showing them.
 *
 * **No numeral appears in it, and that is a choice.** Every number this module prints is an
 * observation with a window behind it; a count of withheld rows would be a number about the
 * *interface*, sitting in the one sentence whose whole job is to say that the numbers are not
 * ready. Naming the rows says more and counts nothing.
 *
 * The two remedies it offers both exist: `dev/main.ts`'s `scrubTo` seeks on a timeline click, and
 * the transport plays through. `dev/reportPanel.ts`'s watching sheet — § D223, the precedent this
 * whole change copies — names the same two, and *two answers to one question* is that decision's
 * own phrase, kept verbatim so the rail and the Day report refuse in one voice.
 */
function retractionFor(drivers: readonly MoodDriver[]): string {
  const withheld = drivers.filter((driver) => driver.basis === 'whole-run').map((d) => d.label);
  return (
    `The run has not finished, so the readings that fold the whole shift — ${andList(withheld)} — ` +
    'are withheld until the playhead reaches the end: a whole-day reading beside a clock this ' +
    'early would be two answers to one question. Play the shift through, or click the far end of ' +
    'the timeline, and they are here.'
  );
}

/** `a, b and c`. Empty and single-item cases included because a driver set may shrink. */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? 'none of them';
  return `${items.slice(0, -1).join(', ')} and ${String(items[items.length - 1])}`;
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
