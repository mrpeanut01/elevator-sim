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
 * **These are ages, not outcomes.** `taking-the-stairs` — drawn as *eyeing the stairs* since
 * `docs/20` defect 4, and see `live/bands.ts` for why the id kept the older spelling — is the
 * fourth *band*: somebody who is standing at a landing right now and has been for at least two
 * minutes. It is **not** the count of people who gave up: that is
 * {@link LiveObservations.abandoned}, the Day report's *TOOK THE STAIRS*, a different quantity
 * over a different population (legs whose wait passed the run's own abandonment horizon, whether
 * or not anybody is still standing). The design keeps both, in two places, and **gave them the
 * same words**, which let the rail report 534 people "taking the stairs" beside a sheet reporting
 * 288 — the collision the rename closes.
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

/**
 * What a banding is *of* — and the reason the mood card needs two answers rather than one.
 *
 * `'now'` bands **the people standing at `atS`**. It is the live instrument: it moves with the
 * playhead, it is what the design specifies, and while a shift is running it is right.
 *
 * `'whole-run'` bands **every rider who called by `atS`, by the worst wait each of them realised**.
 * It exists because the live reading inverts at exactly one instant and always in the flattering
 * direction: a run that *completes* runs until the last passenger is delivered, so its final frame
 * has an empty lobby **by construction**, and a card keyed on the queue then reports the calmest
 * band about the worst possible day. Measured, not argued — `midtown-office` under `collective`
 * over an hour of demand ends `saturated`, with 781 of 1 392 riders past the 900 s horizon and
 * 18.0 % served inside a minute, and the live banding at `endedAt` is four zeroes. See
 * [`DECISIONS.md` § D239](../../../../DECISIONS.md).
 *
 * Neither is derived from the other and neither replaces the other. The rail draws `'now'` while
 * the playhead is inside the run and `'whole-run'` once it has reached the end, and the copy
 * `bands.ts` chooses says which it is, because two bandings that read identically are one banding
 * with a bug.
 */
export type WaitBandBasis = 'now' | 'whole-run';

/** One band's share — of the people standing at `atS`, or of the whole run. See {@link WaitBandBasis}. */
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

/** The stacked bar and its legend — at one instant, or over the run. See {@link WaitBandBasis}. */
export interface WaitBands {
  readonly atS: SimTime;
  /** Which question this banding answers. Never inferred by a reader — the copy states it. */
  readonly basis: WaitBandBasis;
  /**
   * How many people this banding is over.
   *
   * On `'now'`: people standing at a landing right now, and it equals
   * `frameAt(recording, t).totalWaiting` by construction. On `'whole-run'`: everybody whose call
   * had been registered by `atS`, whether they are still standing or long since carried.
   */
  readonly total: number;
  /** One entry per band, in {@link WAIT_BANDS} order. Always four, including the empty ones. */
  readonly counts: readonly WaitBandCount[];
  /** The worst band with anybody in it, or the first band when the banding is empty. */
  readonly worst: WaitBandDefinition;
  /** Index of {@link worst} in {@link WAIT_BANDS}. The design indexes its copy arrays by it. */
  readonly worstIndex: number;
  /**
   * The longest wait this banding knows about, seconds. `undefined` when it is over nobody.
   *
   * On `'now'` that is the worst wait currently on the board; on `'whole-run'` it is the longest
   * wait anybody realised, which is the figure that does not go away when the lobby empties.
   */
  readonly longestCurrentWaitS: number | undefined;
  /**
   * Whether {@link longestCurrentWaitS} belongs to a leg whose wait had **not ended** by
   * {@link atS} — so the figure is not a wait anybody realised, and this layer cannot say what it
   * is instead. See below: it is emphatically **not** a lower bound.
   *
   * `shift/goals.ts` will not grade a censored maximum at all, in either direction, and
   * `LiveObservations.worstWaitIsCensored` carries the same distinction for the fold the goals
   * read. This is that distinction reaching the mood card, which had been printing the figure as a
   * fact — GitHub issue #288's second mechanism, and the one that is *not* fixed by getting the
   * ending rule right, because a rider still standing when the shift ended really has no wait yet.
   *
   * **It is not a lower bound and the copy may not call it one.** `VizLeg` carries no
   * `abandonedAt`, so an unresolved leg is either somebody still standing or somebody who ran out
   * of patience and left long ago — and for the second, `t - arrivedAt` *overstates*. That is the
   * whole reason `goals.ts` refuses rather than qualifies. `moodOf` therefore says *that wait had
   * not ended, and nothing here says when it did* — true under both readings — and leaves *at
   * least* to `shift/report.ts#worstWaitFigure`, which reads `core`'s flag and may.
   *
   * ## It is only ever `true` on the retrospective basis, and that is a claim rather than a gap
   *
   * On `'now'` the quantity is *how long the people standing there have been standing*, and
   * `t - arrivedAt` answers that **exactly** — every rider in the banding is unresolved by
   * construction, so a flag that read `true` for all of them would qualify a number that needs no
   * qualification and would say nothing a reader could act on. On `'whole-run'` the quantity is
   * *the longest wait anybody realised across the shift*, and for a rider whose wait never ended
   * there is no such number to report. Two bases, two questions — the module docstring's own
   * framing — and the censoring belongs to the second.
   *
   * `false` when the banding is over nobody, matching `longestCurrentWaitS`'s `undefined`.
   */
  readonly longestWaitIsCensored: boolean;
}

/** The mood card's face, headline and sub-line — design `:57–64`, `:2281–2299`. */
export interface Mood {
  /** The banding this mood was read off. The headline and sub-line are written per basis. */
  readonly basis: WaitBandBasis;
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
   *
   * **A wait that ended in a refusal is not in it** — GitHub issue #288. A rider turned away at a
   * credential check never boards, and until the ending rule named one they were handed
   * `arrivedAt + horizonS` and counted here: 72 of 72 stairs-takers on Secure Tower's own authored
   * day were riders who had waited **zero seconds**, under a caption reading *waited past the
   * 15-minute horizon and were never carried*. They are {@link turnedAway} instead. See
   * `observations.ts#crossesHorizonAt` for the ending rule and for the run.
   */
  readonly abandoned: number;
  /**
   * Of {@link abandoned}, the legs that had nonetheless **alighted** by `t` — the overlap between
   * *took the stairs* and *carried*, counted so a sheet can say it (`docs/19` defect 3).
   *
   * The overlap is real and it is the common case on a saturated no-patience run: `abandoned`
   * counts a wait that crossed the horizon whether or not a car eventually came, and on a building
   * that declares no patience nobody actually leaves, so every one of those legs can still board,
   * alight, and be inside `carried`. A sheet that printed `CARRIED 768 of 768` beside
   * `TOOK THE STAIRS 348` with no stated overlap was asking the reader to total 1 116 people out
   * of 768 — the two cells overlap rather than add, and this field is the size of the overlap,
   * folded from the same legs in the same pass so the three counts cannot disagree.
   */
  readonly abandonedCarried: number;
  /**
   * Legs the building **turned away for want of a credential** by `t` — § D265's fourth outcome,
   * counted rather than absorbed.
   *
   * Neither delivered, nor waiting, nor abandoned. `core`'s conservation identity is
   * `generated === delivered + undelivered + abandoned + accessRefused` and this is a leg-level
   * fold of that last term, taken in the same pass as {@link arrived} and {@link abandoned} so the
   * four counts on one sheet cannot come from four walks of the legs.
   *
   * **It exists because {@link abandoned} stopped counting them** (issue #288), and a repair that
   * only removed a figure would have made the sheet quieter rather than truer — the exact trade
   * `CLAUDE.md` refuses for abandonment and stairs uptake, and `DECISIONS.md` § D266 refuses for
   * this outcome specifically: it is published **beside** the wait figures on the footing
   * `workPerServedLegKJ` sits beside raw energy. A day that improves its wait by turning people
   * away at the door has not improved anything.
   *
   * **Not derivable from `VizSummary`**, which carries no `accessRefused` — `render/mood.ts`'s
   * delivered driver says so where it explains why it cannot name the remainder. `VizLeg.refusedAt`
   * is on the contract already, so this needs no schema change and no new recording version.
   *
   * `0` on every run of a building that declares no `accessZones`, and on every run of a zoned
   * building whose riders are all correctly badged.
   */
  readonly turnedAway: number;
  /**
   * The longest wait any leg arrived by `t` had realised **or accrued** by `t`, seconds.
   * `undefined` when nobody has arrived.
   *
   * **This is the playhead's own maximum, never `summary.serviceLevel.longestWaitS`.** The
   * summary's figure is a statement about the whole run's reporting window, and a surface drawn
   * at a part-way playhead that printed it would be publishing a figure that can only be true of
   * the whole run — the exact violation class the honesty sweep's temporal axis exists to find
   * (§ D307: a stage banner reading *127 undelivered at 00:00*). So this is folded from the legs
   * like every other field here: a resolved leg (boarded or refused by `t`) contributes its
   * exact wait, an unresolved one contributes `t - arrivedAt`, marked censored. The ending rules
   * are `core`'s own — `metrics/summarize.ts#diagnoseServiceLevel` ends a wait at
   * `boardedAt ?? abandonedAt ?? refusedAt ?? censoredAtS`, and this fold is that computation
   * with `censoredAtS` set to the playhead, over **every** leg arrived by `t`.
   *
   * That last clause is a measured difference from the summary, not an approximation of it:
   * `serviceLevel.longestWaitS` is taken over the reporting window's arrivals, and **every
   * shipped template narrows its window** — measured by `observations.test.ts`, whose
   * non-vacuity guard found zero spanning windows across all eight buildings — so this maximum
   * at `endedAt` is an upper bound on the summary's figure (asserted per building, no patience
   * declared) and equals it only on the unshipped spanning-window case. The two are two stated
   * cohorts; `shift/report.ts`'s small print says which figure is which.
   *
   * Non-decreasing in `t`: a resolved wait never shrinks, and an unresolved one only grows.
   */
  readonly worstWaitSoFarS: number | undefined;
  /**
   * Whether {@link worstWaitSoFarS} belongs to a leg still unresolved at `t`, and is therefore a
   * **lower bound** rather than a wait anybody realised. `false` when nobody has arrived.
   *
   * The same distinction `VizServiceLevel.longestWaitIsCensored` carries for the whole run,
   * applied at the playhead. `shift/goals.ts` reads it as a gate: a censored maximum is never
   * graded at all, in either direction, and the reason it may not even be graded `missed` is a
   * fact about the recording rather than generosity. `VizLeg` carries no `abandonedAt` — a rider
   * who ran out of patience and left is indistinguishable here from one still standing — so a
   * "lower bound" over an unresolved leg can overstate a walked-out rider's wait by every second
   * since they departed, which is exactly the mis-crediting `diagnoseServiceLevel`'s own
   * docstring refuses in `core`. A bound that might overstate can prove nothing, so the goal
   * refuses (`pending`) rather than guesses.
   */
  readonly worstWaitIsCensored: boolean;
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
  /**
   * Which question the **casual** card answered: *is it coping* (`'now'`) or *did it cope*
   * (`'whole-run'`). The engineer card reads a verdict about the whole run on either.
   */
  readonly basis: WaitBandBasis;
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
  /**
   * The live observation *is the building falling behind at `atS`*, always reported.
   *
   * It is what the casual copy is keyed on **while `basis` is `'now'`** and it is not what a
   * closed shift's copy is keyed on — a drained lobby makes it false whatever the shift was like.
   * See `honesty.ts`.
   */
  readonly fallingBehind: boolean;
}
