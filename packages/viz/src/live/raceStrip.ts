/**
 * The race strip — GAMEPLAY §7.4, Everyday Mode slice 4d. The pure half: everything the strip
 * says and every point it plots, derived from `(recording, ghost recording, playhead)` and
 * nothing else, so the whole surface is drivable in Node and the DOM half in `dev/main.ts` only
 * ever copies values onto elements.
 *
 * ## What the ghost is, and why §4.6 is satisfied by construction
 *
 * The ghost is a **second recording of the same crowd**: same building, same demand, same seed —
 * only the dispatcher differs (`dev/ghostRun.ts` builds the config by swapping exactly that
 * field). Both are finished recordings replayed at **one playhead**, so the engine contract's
 * §4.6 — both sims step together, and pausing pauses both — is satisfied trivially by
 * construction: there is no second clock to drift, because there is no second live simulation.
 * Speed and pause drive both lines for the same reason the scrubber does.
 *
 * ## The two lanes are §7.4's, and the top one is deliberately not the header figure
 *
 * Top — how long the people standing *right now* have been standing, on average, in seconds,
 * with a dashed sixty-second line so it reads without a legend. §7.4's own parenthesis is the
 * reason it is this and not cumulative away-in-a-minute: that duplicated the header figure, and
 * the strip must say something the header does not. Bottom — how many people are standing
 * anywhere in the building.
 *
 * The top lane's figure is an **observation about the picture at `t`**, not one of the five
 * suppressible run statistics (`live/noMeans.test.ts`'s grep and walk both hold): it is the same
 * per-rider `t - arrivedAt` the canvas colours every capsule by, summed and divided, and it is
 * exactly zero when nobody is standing — a queue that drained reads as a line on the floor, not
 * as a missing value. Who counts as standing is `frame/overlay.ts#isWaitingAt`'s answer, by
 * import — a second answer to that question is the failure this package has a rule about.
 *
 * ## The verdict, and what it may never say
 *
 * `level with` under three points, else `ahead by N points` / `behind by N points`, derived at
 * the playhead from each recording's own away-inside-a-minute-so-far
 * (`observationsAt(...).servedUnderThresholdPct` — the served-so-far share, playhead-honest by
 * construction). **No interval claim, ever**: one day each is an anecdote, the bench exists for
 * proof, and the footer says so permanently in §7.4's own words ({@link RACE_FOOTER}). The
 * wording carries no dispatcher id and no ordering verb, which is what keeps it a statement
 * about two observed percentages rather than a claim about a dispatcher (R2's line).
 *
 * ## The band note is the replay meaning, and that is a stated deviation
 *
 * §7.4 draws a band behind the ghost whose meaning changes with the pick — the world's middle
 * half, or how much a different morning could move it. Neither is drawable here without
 * inventing data: the world arm is not offered (no posting infrastructure), and a
 * different-morning band needs replications this strip does not have. What **is** true of every
 * ghost this build offers is §7.4's third meaning — same crowd both runs — so that sentence is
 * the strip's one note ({@link SAME_CROWD_NOTE}) and no band is drawn. A band would be a claim;
 * the note is a fact.
 *
 * ## With the ghost set to nobody
 *
 * No second request is ever issued (`dev/ghostRun.ts` returns `kind: 'none'` — *nobody* is free
 * by construction), so the view has one line per lane, no note, and the verdict slot carries the
 * plain figure instead. The strip never invents a rival; `raceStrip.test.ts` asserts all three.
 *
 * ## Two shells draw this now, which is why {@link raceSlotsOf} exists
 *
 * `dev/main.ts`'s strip was the only one until § 7's Everyday stage grew a picker of its own
 * (GitHub issue **#226**, [§ D482](../../../../DECISIONS.md)). {@link raceStripViewOf} is a fold of
 * two recordings and a playhead and cannot see what the *shell* knows — whether a pick was refused,
 * whether a rival is still in the worker, which option's label names the grey line. That order is a
 * claim rather than a formatting choice (a refusal outranks a state; a state outranks a figure), so
 * it is decided once here for both, over {@link RaceRival}, rather than as ternaries at each mount.
 *
 * The one thing {@link raceSlotsOf} says that the view does not is {@link SAME_RUN_NOTE}: a rival
 * that served the crowd exactly as you did draws a line under yours and reads *level with*, which
 * is a true comparison of one run with itself and is indistinguishable, on screen, from a picker
 * bound to nothing. Its docstring carries the measurement.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';

import { observationsAt } from './observations.js';

/* -------------------------------------------------------------------------- *
 * The picker's vocabulary
 * -------------------------------------------------------------------------- */

/**
 * Who the player races. Three honest options and no fourth: the handoff's *world's middle* and
 * *previous day* arms are **omitted, not stubbed** — there is no posting infrastructure to make
 * either true, and an option that ran nothing would be the inert control § D177 exists to catch.
 */
export type GhostPick = 'none' | 'plain-baseline' | 'latest-saved';

export interface GhostOption {
  readonly id: GhostPick;
  /** The `<option>`'s own text. */
  readonly label: string;
  /** One honest sentence under the pick, per §6.2's one-line note. */
  readonly note: string;
}

/**
 * The three offered picks, in menu order with the free one first.
 *
 * `latest-saved` says *latest*, not *best*, in its own copy: there is no rating yet, so recency
 * is what "your best" can honestly mean here, and the option says so rather than promising a
 * ranking nothing computes. `plain-baseline` names the shipped default in plain words — the
 * profile every shift opens on (§ D134's preference list, resolved in `dev/ghostRun.ts`).
 */
export const GHOST_OPTIONS: readonly GhostOption[] = Object.freeze([
  Object.freeze({
    id: 'none' as const,
    label: 'nobody',
    note: 'no second run, no rival line, no score — just your day.',
  }),
  Object.freeze({
    id: 'plain-baseline' as const,
    label: 'the plain baseline',
    note: 'the shipped everyday dispatcher — the one a fresh shift opens on.',
  }),
  Object.freeze({
    id: 'latest-saved' as const,
    label: 'your latest saved',
    note: 'the dispatcher you saved most recently. There is no rating yet, so latest is what best honestly means here.',
  }),
]);

/** §7.4's permanent footer, verbatim. Never conditional, never softened. */
export const RACE_FOOTER = 'One day each on the same crowd. That is a race, not proof.';

/** §7.4's replay-band meaning — the one that is true of a same-seed ghost. See the header. */
export const SAME_CROWD_NOTE = 'same crowd both runs — the gap is your change, not the morning';

/**
 * The note when the rival's day came back **identical to yours** — GitHub issue **#226**,
 * [§ D482](../../../../DECISIONS.md).
 *
 * ## This is a measured state, not a hypothetical one
 *
 * Measured on `garden-apartments` at the shipped defaults: a fresh shift opens on `collective`
 * (`dev/defaults.ts`), *the plain baseline* resolves to `collective`, and the two recordings come
 * back **byte-identical on the legs**. So on the commonest day in the product, picking the plain
 * baseline draws the grey line exactly under the terracotta one and the verdict reads *level with*
 * — true, and true of one run compared with itself.
 *
 * Without this sentence that picture is indistinguishable from a picker that does nothing, which is
 * the defect § D177 exists to catch wearing the costume of a working control. With it, the strip
 * says which of the two it is.
 *
 * ## Why it is said afterwards rather than refused in front
 *
 * The obvious fix — decline the pick when it names the dispatcher already driving — was written,
 * measured, and **thrown away**, because it does not work: `dev/state.ts#drivingProfileOf` builds
 * the primary's profile through the lever/selector/rules chain and the engine fills its defaults, so
 * the driving profile carries `engine` and `answer` fields the raw `data/` profile does not. The two
 * objects differ; the two runs do not. Any predicate over the *configs* is therefore guessing at
 * which differences are behavioural, and guessing wrong in the refusing direction would decline a
 * race that was real. Comparing the **recordings** is exact and cannot be wrong, and the only cost
 * of learning it late is a second simulation that had to run to be compared anyway.
 */
export const SAME_RUN_NOTE =
  'the rival drove the same way you did — one day, drawn twice, so the two lines are one line';

/** The strip while the rival's day is still in the worker. A state, not an error. */
export const RACE_PENDING = 'waiting for the rival’s day to finish simulating';

/**
 * A rival is picked and no rival run exists — a cancelled second run, or a pick made over a
 * recording this shell did not simulate. Says which control produces one rather than only
 * declining (`docs/16` S1: an absence indistinguishable from an oversight is not a declaration).
 */
export const RACE_NOT_RUN = 'no rival run yet — the next Run this shift races them';

/* -------------------------------------------------------------------------- *
 * The samples
 * -------------------------------------------------------------------------- */

/** §7.4: sampled every four simulated minutes, plotted against the clock. */
export const RACE_SAMPLE_INTERVAL_S = 240;

/** One reading of one recording at one instant. Both lanes read from it. */
export interface RaceSample {
  readonly atS: SimTime;
  /** People standing anywhere in the building at `atS` — the bottom lane. */
  readonly standing: number;
  /**
   * How long those people have been standing, on average, seconds — the top lane. Exactly `0`
   * when {@link RaceSample.standing} is `0`: nobody waiting is no wait, not a missing value.
   */
  readonly standingWaitS: number;
}

/**
 * The strip's samples for one recording: every {@link RACE_SAMPLE_INTERVAL_S} grid point from
 * `startedAt` up to the playhead, plus the playhead itself, clamped into the recording's span.
 *
 * The grid is anchored on `startedAt` so two recordings of the same day sample the same
 * instants, which is what makes the two lines comparable point for point. Who is standing at
 * each instant is {@link isWaitingAt}'s answer, by call — not a re-derivation — so the lane
 * agrees with the canvas, the alarm chip and `Frame.totalWaiting` by construction. A leg with
 * neither boarding nor refusal stands to the end of the record; a rider who walked away is
 * indistinguishable in the record, and `live/observations.ts` states the same limit.
 *
 * One pass per sample over the legs that had arrived. Purity over cleverness, the whole
 * directory's rule: no cursor, no memo, so a scrubbing playhead re-derives the same values in
 * any order. The caller decides how often to re-derive (the samples only change when the
 * playhead crosses a grid line, which is what `dev/main.ts` keys its redraw on).
 */
export function raceSamplesOf(recording: VizRecording, uptoS: SimTime): readonly RaceSample[] {
  const endS = clamp(uptoS, recording.startedAt, recording.endedAt);
  const times: number[] = [];
  for (let t = recording.startedAt; t <= endS; t += RACE_SAMPLE_INTERVAL_S) times.push(t);
  const last = times[times.length - 1];
  if (last === undefined || last < endS) times.push(endS);

  return times.map((t) => {
    let standing = 0;
    let waitSum = 0;
    for (const leg of recording.legs) {
      if (leg.arrivedAt > t) break; // sorted by `(arrivedAt, passengerId)` — contract order
      if (!isWaitingAt(leg, t)) continue;
      standing += 1;
      waitSum += t - leg.arrivedAt;
    }
    return {
      atS: t,
      standing,
      standingWaitS: standing === 0 ? 0 : waitSum / standing,
    };
  });
}

/* -------------------------------------------------------------------------- *
 * The verdict
 * -------------------------------------------------------------------------- */

/** Under this many percentage points the race is level — §6.5's own rule, reused not restated. */
export const LEVEL_WITHIN_POINTS = 3;

/**
 * The live verdict at the playhead, from each run's away-inside-a-minute-so-far.
 *
 * Points are percentage points of the served-under-threshold share. Either side `undefined` —
 * too few served to score that run yet — refuses in words rather than inventing a zero, because
 * a run whose first car has not landed has no share, not a share of nothing.
 */
export function raceVerdictOf(
  yoursPct: number | undefined,
  ghostPct: number | undefined,
): string {
  if (yoursPct === undefined || ghostPct === undefined) {
    return 'no score yet — too few served on one side to say';
  }
  const diff = yoursPct - ghostPct;
  if (Math.abs(diff) < LEVEL_WITHIN_POINTS) return 'level with';
  const points = Math.round(Math.abs(diff));
  return diff > 0 ? `ahead by ${String(points)} points` : `behind by ${String(points)} points`;
}

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

export interface RaceStripInput {
  readonly recording: VizRecording;
  /** The rival's recording, or `undefined` for the *nobody* pick — no rival is ever invented. */
  readonly ghost: VizRecording | undefined;
  readonly simTimeS: SimTime;
}

export interface RaceStripView {
  readonly yours: readonly RaceSample[];
  /** Absent exactly when the pick is *nobody*: one line per lane, no note, no verdict. */
  readonly ghost: readonly RaceSample[] | undefined;
  /**
   * The header's live line. With a ghost this is {@link raceVerdictOf}'s wording; with nobody it
   * is the plain figure §7.4 puts in the verdict's place.
   */
  readonly verdict: string;
  /** {@link SAME_CROWD_NOTE} with a ghost, `''` with nobody — no rival, no note. */
  readonly note: string;
  /** {@link RACE_FOOTER}, always. */
  readonly footer: string;
}

/**
 * Everything the strip says and plots at one playhead. Pure, like `frameAt`.
 *
 * Both recordings are sampled at the **same** playhead on the one shared clock; each clamps into
 * its own span (a rival whose day ran longer or shorter is read at the shared instant, held at
 * its own last state past its end — `endedAt` is an outcome, not a schedule, so the two may
 * legitimately differ on one crowd).
 */
export function raceStripViewOf(input: RaceStripInput): RaceStripView {
  const { recording, ghost, simTimeS } = input;
  const yours = raceSamplesOf(recording, simTimeS);
  if (ghost === undefined) {
    const tip = yours[yours.length - 1];
    return {
      yours,
      ghost: undefined,
      verdict: `${String(tip?.standing ?? 0)} standing now`,
      note: '',
      footer: RACE_FOOTER,
    };
  }
  return {
    yours,
    ghost: raceSamplesOf(ghost, simTimeS),
    verdict: raceVerdictOf(
      observationsAt(recording, simTimeS).servedUnderThresholdPct,
      observationsAt(ghost, simTimeS).servedUnderThresholdPct,
    ),
    note: SAME_CROWD_NOTE,
    footer: RACE_FOOTER,
  };
}

/* -------------------------------------------------------------------------- *
 * The three slots the shell fills, decided once for both shells
 * -------------------------------------------------------------------------- */

/**
 * What the *shell* knows about the rival, beside the two recordings {@link raceStripViewOf} folds.
 *
 * The view above is a function of two recordings and a playhead and cannot see any of this: whether
 * a second request was refused, whether one is still in the worker, or which option's label names
 * the grey line. Those live in whichever shell issued the request — and there are **two** of them
 * now (`dev/main.ts`'s strip and `everyday/stageScreen.ts`'s), which is the whole reason this is a
 * type rather than four arguments.
 */
export interface RaceRival {
  readonly pick: GhostPick;
  /** The rival's finished recording, or `undefined` — no rival is ever invented. */
  readonly recording: VizRecording | undefined;
  /** `dev/ghostRun.ts#GhostPlan`'s refused arm, or `undefined`. Outranks everything below. */
  readonly refusal: string | undefined;
  /** Whether the rival's day is still in the worker. */
  readonly pending: boolean;
}

/** The three cells a shell writes that are not a polyline. */
export interface RaceSlots {
  /** The header's live line — a refusal, a state, or {@link RaceStripView.verdict}. */
  readonly verdict: string;
  /** The one-line note under the lanes. Never empty: with no rival it is the pick's own note. */
  readonly note: string;
  /** The picked option's label, for the grey line's key. `''` when no rival lane is drawn. */
  readonly rivalName: string;
}

/**
 * The verdict slot, the note and the key's name — one derivation, both shells.
 *
 * ## Honesty order, and it is the reason this is not three ternaries at each call site
 *
 * A **refusal** outranks everything: it says why there is no rival, and a state ("waiting for…")
 * printed over it would describe a request that was never made. Then a picked-but-absent rival says
 * whether one is coming. Only a **drawn** rival — or the *nobody* pick, whose slot carries the
 * plain figure — speaks through the view itself. Getting that order wrong is not a cosmetic bug: it
 * is a strip claiming a race is in flight when the picker has already declined to run one.
 *
 * `dev/main.ts` composed this inline while it was the only shell with a strip. It is not any more
 * (GitHub issue **#226**, [§ D482](../../../../DECISIONS.md)), and *two sites answering one question
 * is how one of them goes stale unread* is this package's most-repeated finding.
 *
 * ## The note is never empty, which is a change from the one-shell version
 *
 * With no rival drawn the note is the **picked option's own** sentence — `nobody`'s
 * *"no second run, no rival line, no score — just your day"*. It used to be `''`, which was
 * defensible on a strip whose picker sat two inches away and is not on a card whose only other
 * words are a verdict. No new string: {@link GHOST_OPTIONS} already carries one per pick, and the
 * honesty corpus already sweeps them.
 *
 * ## Why it takes the player's recording as well as the view
 *
 * Only to tell {@link SAME_CROWD_NOTE} from {@link SAME_RUN_NOTE}, through
 * {@link servedIdentically} — a rival that served the crowd exactly as the player did draws its
 * line under theirs, and *"the gap is your change"* beside no gap is a true sentence that misleads.
 * `undefined` is accepted so a caller with no run on screen is not forced to invent one; it simply
 * cannot be the same run as anything.
 */
export function raceSlotsOf(
  view: RaceStripView,
  rival: RaceRival,
  yours: VizRecording | undefined,
): RaceSlots {
  const drawn = view.ghost !== undefined;
  const pickNote = GHOST_OPTIONS.find((option) => option.id === rival.pick)?.note ?? '';
  const verdict =
    rival.refusal ??
    (drawn || rival.pick === 'none'
      ? view.verdict
      : rival.pending
        ? RACE_PENDING
        : RACE_NOT_RUN);
  const sameRun =
    drawn &&
    yours !== undefined &&
    rival.recording !== undefined &&
    servedIdentically(yours, rival.recording);
  return {
    verdict,
    note: drawn ? (sameRun ? SAME_RUN_NOTE : view.note) : pickNote,
    rivalName: drawn
      ? (GHOST_OPTIONS.find((option) => option.id === rival.pick)?.label ?? '')
      : '',
  };
}

/**
 * Whether two recordings served one crowd in exactly the same way — {@link SAME_RUN_NOTE}'s test.
 *
 * ## What is compared, and why it is the service and not the arrivals
 *
 * The **arrivals** are equal by construction: `dev/ghostRun.ts` swaps one field of the primary's own
 * config, so both runs draw the same crowd from the same seed, and comparing them would be asking a
 * question whose answer is *yes* on every honest race. What decides the picture is what the
 * dispatchers **did** with that crowd — who boarded when, in which car, and when they got out — and
 * those are the four fields below. `isWaitingAt` reads `boardedAt` and `refusedAt`, so two
 * recordings that agree here plot the same two lines at every sample by construction.
 *
 * ## The walk bails on the first difference, which is what makes it cheap enough to draw with
 *
 * Two different dispatchers diverge within the first handful of legs on any real day, so the common
 * case costs a few comparisons. The expensive case — a full pass — is exactly the case where the
 * answer is *yes*, and one pass of numeric comparisons over a 20 000-leg recording is not a frame.
 * There is deliberately no serialisation anywhere in here: `JSON.stringify` of two recordings is the
 * obvious way to write this and would allocate megabytes on a render path.
 */
export function servedIdentically(yours: VizRecording, rival: VizRecording): boolean {
  if (yours.legs.length !== rival.legs.length) return false;
  for (const [index, leg] of yours.legs.entries()) {
    const other = rival.legs[index];
    if (other === undefined) return false;
    if (
      leg.passengerId !== other.passengerId ||
      leg.boardedAt !== other.boardedAt ||
      leg.alightedAt !== other.alightedAt ||
      leg.carId !== other.carId ||
      leg.refusedAt !== other.refusedAt
    ) {
      return false;
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- *
 * The geometry — SVG points, computed here so the DOM half copies attributes
 * -------------------------------------------------------------------------- */

/** The fixed logical box one lane's polylines are computed in. The SVG scales it to fit. */
export interface RaceLaneBox {
  readonly width: number;
  readonly height: number;
}

export interface RaceLaneGeometry {
  /** `points` for your polyline. `''` when there is nothing yet to draw. */
  readonly you: string;
  /** `points` for the ghost's polyline. `''` with no ghost. */
  readonly ghost: string;
  /** The lane's y for a horizontal marker at `markS` (the top lane's 60 s line). */
  readonly markY: number;
}

/**
 * One lane's polylines, both lines on one shared scale.
 *
 * The x-axis is the clock over the whole day, so the two lines stay aligned instant for
 * instant; the y-axis tops out at one and a half times `markValue` or the two series' own
 * maximum, whichever is larger — so the sixty-second marker sits inside the box on a quiet
 * morning and neither line is ever clipped on a loud one. A lane with one sample draws a
 * point-sized polyline, which is what a day paused at 06:00 looks like.
 */
export function raceLaneOf(
  yours: readonly RaceSample[],
  ghost: readonly RaceSample[] | undefined,
  pick: (sample: RaceSample) => number,
  box: RaceLaneBox,
  spanEndS: number,
  markValue: number,
): RaceLaneGeometry {
  const startS = yours[0]?.atS ?? 0;
  const spanS = Math.max(1, spanEndS - startS);
  let maxValue = markValue * 1.5;
  for (const sample of yours) maxValue = Math.max(maxValue, pick(sample));
  for (const sample of ghost ?? []) maxValue = Math.max(maxValue, pick(sample));
  const points = (samples: readonly RaceSample[]): string =>
    samples
      .map((sample) => {
        const x = ((sample.atS - startS) / spanS) * box.width;
        const y = box.height - (pick(sample) / maxValue) * box.height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return {
    you: points(yours),
    ghost: ghost === undefined ? '' : points(ghost),
    markY: box.height - (markValue / maxValue) * box.height,
  };
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
