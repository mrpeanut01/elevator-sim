/**
 * **Where and when a run came apart** — the located half of `docs/10`'s R4, which makes the fail
 * state this product's teaching instrument.
 *
 * ## The finding this module answers
 *
 * R4's instrument reports *after* the lesson. [§ D512](../../../../DECISIONS.md)'s legibility
 * measure — a landing holding somebody in the third wait band for two contiguous minutes — and
 * [§ D515](../../../../DECISIONS.md)'s hold line — forty people standing over two minutes at once —
 * are both read out of the recording once the run has finished (`docs/38` § 2.3). So a player is
 * told *that* it broke and shown the end of the recording, which is not the same screen as the
 * landing that broke it. Mini Motorways piles its pins **at the destination that caused them** and
 * not in a status bar; this module is the arithmetic that would let this product do the same.
 *
 * It matters more than it reads: `data/scenario-survivors.json` measures **seven of ten** campaign
 * stages with zero clearing configurations at every budget rung, so a player is going to fail a
 * great deal, and failing currently hands them nothing to act on.
 *
 * ## What this module is, and the one thing it is not
 *
 * It is a **locator**, not a judge. It invents no fail definition and holds no threshold of its
 * own. Every moment it returns comes from an instrument already in force, and the module's whole
 * job is to say **which landing** and **which simulated second** that instrument is pointing at:
 *
 * | source | the instrument in force | what it already gave | what this adds |
 * |---|---|---|---|
 * | `held-landing` | § D512, {@link legibilityOf} | the landing **and** the second | the counts standing there |
 * | `hold` | § D515, `core`'s `rushHoldAtLegs` | the second, and **no landing at all** | the landings, and the count on each |
 * | `deepest-queue` | the day's queue-depth bar, `observationsAt().peakQueue` | the landing and the second | the bar it is read against |
 * | `worst-wait` | the day's worst-wait ceiling, `observationsAt().worstWaitSoFarS` | the duration, and **no landing** | the landing and the second it began |
 *
 * **Nothing here re-decides a question another module owns.** Who is standing at an instant is
 * `frame/overlay.ts#isWaitingAt`, the module that decides it. Which band a wait falls in is
 * `live/bands.ts#bandIndexOf`. The hold moment is `core`'s own sweep and the legible landings are
 * `legibility.ts`'s own union. `trouble.test.ts` pins the two that could drift — the hold moment
 * against `rushHoldAtLegs` and the worst wait against `observationsAt` — on real runs over shipped
 * buildings, because agreement asserted by a run is worth more than agreement asserted here.
 *
 * ## Which band vocabulary, and why the question is not rhetorical
 *
 * There are **two** in this package and they are not interchangeable. `live/bands.ts#WAIT_BANDS`
 * is the design's fixed ladder (0 / 30 / 60 / 120 s) with the player-facing mood names, and
 * `frame/overlay.ts#WaitBand` is a *run-derived* ladder off `summary.longWaitThresholdS` and
 * `serviceLevel.horizonS`. Both § D512 and § D515 are specified against the **fixed** one — the
 * legibility band is `WAIT_BANDS[2].fromS` and the hold line's `overS` is `WAIT_BANDS[3].fromS`,
 * which `rushScreenModel.test.ts` already pins — so every band this module reports is the fixed
 * one, and a reader who mixes the two gets a landing banded by a ruler the instrument never used.
 *
 * ## The honesty shape, stated as rules rather than left to a reviewer
 *
 * 1. **No mean, anywhere, of anything.** Not a field, not a line. R3's `suppressed-mean` class —
 *    which `CLAUDE.md` records this repository finding twice, once as a coincidence and once as a
 *    product defect — is structurally unreachable through this module, because there is nothing
 *    here for a refused mean to sit next to. Every value is a count of people, a count of legs, or
 *    one measured duration.
 * 2. **Every figure carries the cohort it is over** ({@link LocatedFigure.of}), so R13's
 *    *estimate without n* has nothing to catch. The type makes it structural rather than a habit:
 *    there is no way to build a figure without one.
 * 3. **No score and no severity ranking.** Charter non-goal 1. Moments come back ordered by
 *    `(atS, floorId, source)` — a run fact and two tie-breaks — and never by how bad they are.
 * 4. **Where and when, never why.** Charter non-goal 4. Nothing here says a queue built up
 *    *because* the cars were elsewhere, because nothing in the product measures that. A plausible
 *    sentence in place of a measurement is the defect [§ D256](../../../../DECISIONS.md) refuses.
 * 5. **A censored duration says so** ({@link LocatedFigure.censored}). A worst wait that belongs to
 *    somebody still standing when the run ended is a lower bound the recording cannot even promise
 *    is one, which is the gate `goals.ts#readGoal` already applies and this module carries rather
 *    than launders.
 *
 * ## Pure, and no clock
 *
 * A pure function of the recording and its options. No wall clock, no cursor, no memo — the same
 * recording returns the same moments in the same order, which is what lets a marker survive a
 * scrubber moving backwards and a replay test sampling twice.
 *
 * ## The callers, and the three surfaces that are still owed one
 *
 * The non-test caller is `everyday/rush.ts#holdPlacesOf`, which reaches this module for the `hold`
 * source and turns it into the result screen's fourth beat — *where* the forty were standing,
 * beside the *when* § D515 already gave. That is one source of four with a reader.
 *
 * **The other three are located and drawn nowhere**, which is said here rather than filed
 * somewhere a reader would have to go looking. `CLAUDE.md`'s standing requirement is why: a
 * behaviour that is configurable, unit-tested in isolation and called from nothing passes every
 * other check this repository runs, and has shipped **eleven** times in code. The three surfaces
 * that would read them — the stage's playhead (a marker at `atS`, which is the cheapest of the
 * three and the one the genre points at), the day report, and `render/describeFrame.ts`, which is
 * the non-visual register and owes a reader the same landing and clock — were each owned by
 * another lane in the wave this landed, and no owner was reachable to agree a seam.
 *
 * **This module deliberately ships no words.** It had a `troubleLinesOf` and it was deleted before
 * landing, because a renderer with no renderer to call it is the same defect one layer up. The
 * honesty rules above are the wiring's brief; the vocabulary is the surface's to choose, and
 * `rush.ts#RUSH_RESULT_COPY.beatWhere` is the worked example of what one looks like.
 */

import { RUSH_HOLD_LINE, rushHoldAtLegs, type SimTime } from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import { WAIT_BANDS, bandIndexOf } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import type { WaitBandDefinition } from '../live/types.js';

import { legibilityBandFromS, legibilityOf } from './legibility.js';

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

/**
 * Which instrument in force a moment comes from.
 *
 * A closed union, and the two `Record`s over it below are total, so a fifth instrument cannot be
 * located without somebody deciding what it is called and how it is worded — which is the only way
 * the vocabulary stays one somebody chose.
 */
export const TROUBLE_SOURCES = ['held-landing', 'hold', 'deepest-queue', 'worst-wait'] as const;

export type TroubleSource = (typeof TROUBLE_SOURCES)[number];

/** Every figure a located moment may publish. */
export const LOCATED_FIGURE_IDS = [
  /** People standing at this landing at the moment, of everybody standing anywhere then. */
  'standing-here',
  /** Of those standing here, how many are at or past the band's floor. */
  'past-band-here',
  /** People at or past the band's floor **anywhere** at the moment, of everybody standing then. */
  'past-band-everywhere',
  /** How long the landing had been holding somebody past the band, in seconds. */
  'held-for',
  /** One rider's wait, in seconds — a maximum over the legs, never a mean over them. */
  'waited',
] as const;

export type LocatedFigureId = (typeof LOCATED_FIGURE_IDS)[number];

/**
 * One figure, with the cohort it is over.
 *
 * {@link of} is R13's `n` and it is **not optional**, which is the enforcement: a figure that
 * could be built without its count is a figure somebody will eventually build without its count.
 * For a figure counted in people, `of` is how many people it was drawn from and `0 <= value <= of`
 * holds by construction (`trouble.test.ts` asserts it on every moment of every sampled run). For a
 * figure counted in seconds, `of` is how many legs the measurement was taken over, and the two are
 * deliberately in different units — a duration is not a share of anything.
 */
export interface LocatedFigure {
  readonly id: LocatedFigureId;
  readonly value: number;
  readonly unit: 'people' | 'seconds';
  /** How many the value was taken over. Never absent — see the type's docstring. */
  readonly of: number;
  /**
   * `true` when {@link value} is a **lower bound** rather than a fact: a wait still running when
   * the run ended, whose leg may have gone up the stairs rather than still be standing. The gate
   * `goals.ts#readGoal` applies, carried rather than dropped.
   */
  readonly censored: boolean;
}

/** A bar a moment is read against, when the instrument in force has one. */
export interface LocatedBar {
  readonly value: number;
  readonly unit: 'people' | 'seconds';
  /** `at-most` is a ceiling the run went over; `at-least` is a line the run reached. */
  readonly sense: 'at-most' | 'at-least';
}

/**
 * One located moment: a landing, a simulated second, the band the instrument reads at, and the
 * figures that say so.
 */
export interface LocatedMoment {
  readonly source: TroubleSource;
  /** The landing, as an engine id. A caller labels it — this module takes no view of display. */
  readonly floorId: string;
  /** The simulated second, from the kernel. Never a wall clock. */
  readonly atS: SimTime;
  /**
   * The second the moment's figures become true of, when the moment is a **span** rather than an
   * instant. `undefined` on the three sources whose figures are true at {@link atS}.
   *
   * It exists because one source's figure is otherwise drawn early, and drawing a figure at a
   * playhead it cannot yet be true of is the defect `honesty/properties.ts`' temporal property
   * catches — the one that found the stage banner reading *127 undelivered at 00:00*. A worst wait
   * is located at the second it **began**, which is where a player would have watched it build;
   * the duration is only true once it has ended, so the moment carries both and a surface words
   * the pair as a span. The instrument's own probe caught this on Vertical City, where the longest
   * wait began at 1 057 s and the line said *waited 173 s* about an instant at which it had waited
   * none of them.
   */
  readonly untilS: SimTime | undefined;
  /** The fixed band this instrument reads at — see the module docstring on the two vocabularies. */
  readonly band: WaitBandDefinition;
  /** {@link band}'s index in `live/bands.ts#WAIT_BANDS`. */
  readonly bandIndex: number;
  readonly figures: readonly LocatedFigure[];
  /** The bar this moment was read against, or `undefined` where the instrument holds none. */
  readonly bar: LocatedBar | undefined;
}

/**
 * The day's bars, as a caller holds them.
 *
 * Both are optional and **both default to off**, which is the conservative half of this module's
 * contract: the deepest queue and the worst wait are somewhere on *every* run, so without a bar
 * there is nothing that says the run came apart and emitting a moment would be this module
 * inventing a verdict. A caller that has `shift/goals.ts`' bars for the day passes them; one that
 * does not gets only the instruments that carry their own line.
 */
export interface TroubleBars {
  /** `GOAL_BARS`' queue-depth cap for this day, in people. */
  readonly queueAtMost?: number | undefined;
  /** `GOAL_BARS`' worst-wait ceiling for this day, in seconds. */
  readonly worstWaitAtMostS?: number | undefined;
}

export interface TroubleOptions {
  readonly bars?: TroubleBars | undefined;
  /**
   * Whether to locate § D515's rush hold line.
   *
   * **Off by default, deliberately.** The line is *the rush's* fail state and is the same for every
   * tower by design (§ 9.2). Reading it on a career day would import the rush's threshold to a day
   * that is not graded against it, and a surface that then worded the moment as an ending would be
   * announcing a fail state the day does not have. A rush passes `true`; nobody else should.
   */
  readonly includeHoldLine?: boolean | undefined;
}

/** What {@link troubleOf} returns. */
export interface RunTrouble {
  /** Ordered by `(atS, floorId, source)`. Never by severity — charter non-goal 1. */
  readonly moments: readonly LocatedMoment[];
  /**
   * Which instruments were asked at all, in the order of {@link TROUBLE_SOURCES}.
   *
   * Published so a surface can tell *nothing was found* from *nothing was asked*, which are
   * different sentences and only one of them is about the run. A caller that passes no bars and no
   * hold line asked one instrument, and a screen saying "nothing went wrong" on that basis would be
   * claiming a verdict from a question nobody put.
   */
  readonly asked: readonly TroubleSource[];
  /** `moments.length > 0`. */
  readonly located: boolean;
}

/* -------------------------------------------------------------------------- *
 * The arithmetic
 * -------------------------------------------------------------------------- */

/** The band a wait of `waitedS` falls in, on the fixed ladder. Never the run-derived one. */
function bandAt(waitedS: number): { band: WaitBandDefinition; bandIndex: number } {
  const bandIndex = bandIndexOf(waitedS);
  const band = WAIT_BANDS[bandIndex];
  /* `bandIndexOf` returns an index into `WAIT_BANDS`, so this is unreachable — and it is a throw
   * rather than a fallback because a silent band 0 would report a crowd as breezy. */
  if (band === undefined) throw new Error(`no band at index ${String(bandIndex)}`);
  return { band, bandIndex };
}

/** Everybody standing anywhere at `t`, by `isWaitingAt` — the module that decides it. */
function standingAt(legs: readonly VizLeg[], t: SimTime): readonly VizLeg[] {
  const standing: VizLeg[] = [];
  for (const leg of legs) {
    /* Legs are sorted by `(arrivedAt, passengerId)`, the same shortcut `overlayAt` relies on. */
    if (leg.arrivedAt > t) break;
    if (isWaitingAt(leg, t)) standing.push(leg);
  }
  return standing;
}

/** The figures every landing-at-an-instant moment publishes, in one place so they cannot drift. */
function crowdFigures(
  standing: readonly VizLeg[],
  floorId: string,
  t: SimTime,
  bandFromS: number,
): readonly LocatedFigure[] {
  const here = standing.filter((leg) => leg.originFloorId === floorId);
  const pastHere = here.filter((leg) => t - leg.arrivedAt >= bandFromS).length;
  const pastAnywhere = standing.filter((leg) => t - leg.arrivedAt >= bandFromS).length;
  return [
    { id: 'standing-here', value: here.length, unit: 'people', of: standing.length, censored: false },
    { id: 'past-band-here', value: pastHere, unit: 'people', of: here.length, censored: false },
    {
      id: 'past-band-everywhere',
      value: pastAnywhere,
      unit: 'people',
      of: standing.length,
      censored: false,
    },
  ];
}

/**
 * § D512's landings, located — `legibility.ts`'s own union, one moment per landing that reached the
 * window, at the second it reached it.
 *
 * The instrument already gives the landing *and* the second, which is why this is the cheapest of
 * the four and why nothing about it is re-derived: {@link legibilityOf} is called, and what is
 * added is the count standing there when the window closed.
 */
function heldLandings(
  recording: Pick<VizRecording, 'legs' | 'endedAt'>,
  standingAtS: (t: SimTime) => readonly VizLeg[],
): readonly LocatedMoment[] {
  const day = legibilityOf(recording);
  const moments: LocatedMoment[] = [];
  for (const landing of day.landings) {
    const atS = landing.legibleAtS;
    if (atS === undefined) continue;
    const standing = standingAtS(atS);
    moments.push({
      source: 'held-landing',
      floorId: landing.floorId,
      atS,
      untilS: undefined,
      ...bandAt(day.bandFromS),
      figures: [
        ...crowdFigures(standing, landing.floorId, atS, day.bandFromS),
        {
          id: 'held-for',
          value: day.windowS,
          unit: 'seconds',
          of: standing.filter((leg) => leg.originFloorId === landing.floorId).length,
          censored: false,
        },
      ],
      bar: { value: day.windowS, unit: 'seconds', sense: 'at-least' },
    });
  }
  return moments;
}

/**
 * § D515's hold moment, located — the landings the forty were standing on.
 *
 * `core`'s `rushHoldAtLegs` decides **when**, exactly as it does for the stage and for the server's
 * replay of a posted sitting, and is never re-implemented here: a second sweep would be a second
 * answer to the question a leaderboard ranks on. What this adds is **where**, which the core
 * function has no landing to give — it reads three fields of a leg and none of them is a floor.
 * One moment per landing holding anybody past the line at that bucket, so a hold spread over four
 * landings reads as four and not as one.
 */
function holdLandings(
  recording: Pick<VizRecording, 'legs' | 'startedAt' | 'endedAt'>,
  standingAtS: (t: SimTime) => readonly VizLeg[],
): readonly LocatedMoment[] {
  const atS = rushHoldAtLegs(recording.legs, recording.startedAt, recording.endedAt);
  if (atS === undefined) return [];
  const standing = standingAtS(atS);
  const over = standing.filter((leg) => atS - leg.arrivedAt >= RUSH_HOLD_LINE.overS);
  const floorIds = [...new Set(over.map((leg) => leg.originFloorId))].sort((a, b) => a.localeCompare(b));
  return floorIds.map((floorId) => ({
    source: 'hold' as const,
    floorId,
    atS,
    untilS: undefined,
    ...bandAt(RUSH_HOLD_LINE.overS),
    figures: crowdFigures(standing, floorId, atS, RUSH_HOLD_LINE.overS),
    bar: { value: RUSH_HOLD_LINE.people, unit: 'people' as const, sense: 'at-least' as const },
  }));
}

/**
 * The deepest a single landing stacked, against the day's cap — `observationsAt().peakQueue`, which
 * already carries the landing and the earliest instant that depth was reached.
 *
 * Emitted only when a cap was given and the peak went over it. The peak of a day that stayed inside
 * its cap is a fact about the run and not a moment it came apart, and reporting it as one would be
 * this module supplying a verdict nobody asked for.
 */
function deepestQueue(
  recording: VizRecording,
  queueAtMost: number,
  standingAtS: (t: SimTime) => readonly VizLeg[],
): readonly LocatedMoment[] {
  const { peakQueue } = observationsAt(recording, recording.endedAt);
  const { count, floorId, atS } = peakQueue;
  if (floorId === undefined || atS === undefined) return [];
  if (count <= queueAtMost) return [];
  const standing = standingAtS(atS);
  const here = standing.filter((leg) => leg.originFloorId === floorId);
  /* The band is the worst anybody standing there is in — read off the run, never asserted. */
  const worstWaitHereS = here.reduce((worst, leg) => Math.max(worst, atS - leg.arrivedAt), 0);
  const { band, bandIndex } = bandAt(worstWaitHereS);
  return [
    {
      source: 'deepest-queue',
      floorId,
      atS,
      untilS: undefined,
      band,
      bandIndex,
      figures: crowdFigures(standing, floorId, atS, band.fromS),
      bar: { value: queueAtMost, unit: 'people', sense: 'at-most' },
    },
  ];
}

/**
 * The longest anybody waited, against the day's ceiling — located to the landing they waited on and
 * the second their wait began.
 *
 * ## Why the leg is found rather than folded again
 *
 * `observationsAt` owns *what the worst wait is*; `LiveObservations` simply carries no floor beside
 * it. So the value is read from there and the **leg** is found by matching it under the identical
 * ending rule (`boardedAt ?? refusedAt`, else the playhead) and the identical tie rule (strict `>`,
 * so the maximum belongs to the first leg in record order to attain it). `find` returns exactly
 * that leg, so the two agree by construction — and `trouble.test.ts` pins the agreement on real
 * runs anyway, because construction is an argument and a run is a measurement.
 *
 * The moment is emitted only when a ceiling was given and the wait went over it. A censored
 * maximum is emitted **with its flag set** rather than suppressed: a run whose worst wait is
 * unresolved has still gone past the ceiling if the lower bound alone does, and dropping it would
 * hide the one landing a reader most needs.
 */
function worstWait(recording: VizRecording, worstWaitAtMostS: number): readonly LocatedMoment[] {
  const t = recording.endedAt;
  const { worstWaitSoFarS, worstWaitIsCensored } = observationsAt(recording, t);
  if (worstWaitSoFarS === undefined) return [];
  if (worstWaitSoFarS <= worstWaitAtMostS) return [];
  let arrivedLegs = 0;
  let found: VizLeg | undefined;
  let endedAt = t;
  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break;
    arrivedLegs += 1;
    if (found !== undefined) continue;
    const resolvedAt = leg.boardedAt ?? leg.refusedAt;
    const resolved = resolvedAt !== undefined && resolvedAt <= t;
    const waitS = Math.max(0, (resolved ? resolvedAt : t) - leg.arrivedAt);
    if (waitS === worstWaitSoFarS) {
      found = leg;
      endedAt = resolved ? resolvedAt : t;
    }
  }
  if (found === undefined) return [];
  return [
    {
      source: 'worst-wait',
      floorId: found.originFloorId,
      atS: found.arrivedAt,
      /* A span, not an instant: the wait is located where it began and is only true once it has
       * ended. See {@link LocatedMoment.untilS} for the defect this avoids. */
      untilS: endedAt,
      ...bandAt(worstWaitSoFarS),
      figures: [
        {
          id: 'waited',
          value: worstWaitSoFarS,
          unit: 'seconds',
          of: arrivedLegs,
          censored: worstWaitIsCensored,
        },
      ],
      bar: { value: worstWaitAtMostS, unit: 'seconds', sense: 'at-most' },
    },
  ];
}

/**
 * Where and when this run came apart, by the instruments already in force.
 *
 * Pure, deterministic, and it reads no clock. See the module docstring for what each source is and
 * for the five honesty rules the shape enforces.
 */
export function troubleOf(recording: VizRecording, options: TroubleOptions = {}): RunTrouble {
  /* One cache of `standingAt` per instant, because four sources ask about the same few seconds and
   * the sweep is linear in the legs. Keyed on the instant and never on "the last one we saw" —
   * a locator is called out of order by construction. */
  const cache = new Map<number, readonly VizLeg[]>();
  const standingAtS = (t: SimTime): readonly VizLeg[] => {
    const hit = cache.get(t);
    if (hit !== undefined) return hit;
    const computed = standingAt(recording.legs, t);
    cache.set(t, computed);
    return computed;
  };

  const asked: TroubleSource[] = ['held-landing'];
  const moments: LocatedMoment[] = [...heldLandings(recording, standingAtS)];

  if (options.includeHoldLine === true) {
    asked.push('hold');
    moments.push(...holdLandings(recording, standingAtS));
  }
  const queueAtMost = options.bars?.queueAtMost;
  if (queueAtMost !== undefined) {
    asked.push('deepest-queue');
    moments.push(...deepestQueue(recording, queueAtMost, standingAtS));
  }
  const worstWaitAtMostS = options.bars?.worstWaitAtMostS;
  if (worstWaitAtMostS !== undefined) {
    asked.push('worst-wait');
    moments.push(...worstWait(recording, worstWaitAtMostS));
  }

  /* `(atS, floorId, source)`. The first term is the run's own clock; the other two are tie-breaks
   * that make the order total. Severity is deliberately not a term — charter non-goal 1. */
  const order = (source: TroubleSource): number => TROUBLE_SOURCES.indexOf(source);
  const sorted = [...moments].sort(
    (a, b) => a.atS - b.atS || a.floorId.localeCompare(b.floorId) || order(a.source) - order(b.source),
  );
  return {
    moments: sorted,
    asked: TROUBLE_SOURCES.filter((source) => asked.includes(source)),
    located: sorted.length > 0,
  };
}
