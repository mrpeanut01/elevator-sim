/**
 * **How fast the stage plays a whole day, and why it is not one speed** — GitHub issue **#592**,
 * [§ D991](../../../../DECISIONS.md).
 *
 * ## What was wrong
 *
 * Today's scenario opens the whole authored day — `office-day`, ten hours, § D356's *a full cycle,
 * graded whole* — and the stage played every second of it at the player's watching rung. At the
 * shipped `4×` that is **150 minutes**, of which 7.5 are a one-twentieth trickle before the morning
 * ramp and two stretches of 49 and 67 minutes sit between the peaks. The mode picker was honest
 * about it (*8 min–2 h 30 at 4×*); an honest label on that length was never going to be a design.
 *
 * ## What the ruling decided, and what this module is
 *
 * A decision agent ruled with measurement, under delegated authority, and § D991 records it: **keep
 * the whole day, and fix the length in the playback rather than the run.** The day's three peaks —
 * its **acts**, `shift/dayLength.ts#actsOf` — play at the player's rung. The hours between them are
 * crossed at {@link BETWEEN_PEAKS_SIM_PER_REAL_S}, and the stage drops back to the player's rung
 * while anyone on a landing has waited past {@link PACE_HOLD_WAIT_S}. Measured over every
 * contract's day × fifty seeds (`stagePace.sweep.test.ts`), that takes the game's own towers to
 * **40–51 minutes** at `4×`, and the longest reference tower, whose landings hold somebody past a
 * minute for most of the day, to **1 h 49**. The simulation is untouched — the recording was made whole on a worker
 * before this module is asked anything — so no goal bar, run record, board key or seed moves, and
 * a day watched this way is bit-identical to one watched at a single rung.
 *
 * This module is that rule and nothing else: a pure function of the playhead, the schedule and the
 * present frame. `everyday/stageScreen.ts` asks it once a frame and moves the transport's speed.
 *
 * ## The three things it reads, and why each is allowed
 *
 * - **The acts**, from `VizRecording.demandPhases` — the resolved template's own timetable, an input
 *   to the run. Naming the next act's start is the same fact `stageNextStretchOf` already draws
 *   (`docs/28` AD-S4: R6 forbids publishing an outcome early, not reading the timetable).
 * - **The longest current wait**, from `live/observations.ts#observationsAt` at the playhead — the
 *   present frame and nothing after it. The drain clause never looks ahead to see whether the
 *   queue is *about* to clear; it slows while it has not.
 * - **When the player last pressed a chip.** A press is theirs until the next act boundary, and
 *   then the stage paces again (§ D991 clause 2 as § D1029 amends it).
 *   {@link StagePaceInput.playerChoseSpeedAtS}.
 * - **Whether a pinned day's call stands unanswered** — `shift/pressCall.ts`, § D1029. The one
 *   reason that stops the transport rather than choosing its speed.
 *
 * ## A scored day is paced by the tutorial's rule instead — [§ D1169](../../../../DECISIONS.md)
 *
 * Wave AK's decide-al ruling (Q1 clause 1) put the tutorial's hold rule on every scored day, the
 * week's days on the daily stage, slices and whole days alike: **fast while nobody on a landing has
 * waited a minute, the player's rung while somebody has**, read off the present frame and nothing
 * else ({@link StagePaceInput.scored}). The peaks are no longer slow of themselves, because a peak
 * where nobody is waiting has nothing to watch and a slice between two waits had four minutes of
 * idle cars at `4×`. The fast rung stays {@link BETWEEN_PEAKS_SIM_PER_REAL_S}, the derived one;
 * `90×` waits for its own cue-budget derivation. Everything below is the unscored path, which a
 * replay and a watched run still take.
 *
 * ## Between a scored whole day's peaks, the quiet is skipped — [§ D1212](../../../../DECISIONS.md)
 *
 * Swarm DN's ruling (Q1 (c)) found about seventy per cent of a 27-minute Midtown day was the stage
 * crossing an empty building at `30×`. So on a scored whole day, **between two of its peaks**, while
 * nobody on a landing has waited a minute, the stage plays a short beat ({@link SKIP_BEAT_REAL_S}) and
 * then **seeks** to the earliest of three instants read off the run's own recording
 * ({@link stageSkipOf}): the first instant anybody reaches a minute ({@link firstMinuteWaitFrom}),
 * the next call the stage would stop at, and the next peak's start. It lands on that instant
 * exactly, so nothing the stage would have stopped for is passed, and it says what it skipped in one
 * line ({@link stageSkipLineOf}). A **peak** is an act, `shift/dayLength.ts#actsOf` over the
 * recording's authored phases, the same acts § D991 read: *between* is after one act has ended and
 * before the next has started, so the half hour before the first peak and the tail after the last
 * are played as § D1169 plays them. Inside a peak nothing changes. The skip moves the playhead and
 * nothing else, so the run, the goals, the census and the report are the whole day's.
 *
 * This is the one rule in this module that reads the recording after the playhead, and it reads it
 * only to choose where to land: the beat's note names no instant ahead, and the line is drawn once
 * the stage is there, naming a stretch that is then in the past. § D1212 amends § D1169 clause 1's
 * *nothing after the playhead is read* for that one purpose.
 *
 * ## Where it applies, and the one place it must not
 *
 * **Only when `shift/dayLength.ts#runHorizonOf` answers `'whole-day'`.** Everything else — a
 * contract's slice, a career day, a fix case, a watched or replayed run, and above all **the Rush**
 * — plays at one rung. The Rush's template, `endless-rush`, is also a phase list, and it reaches its
 * peak only in its last three minutes; paced by this rule its whole ramp would be crossed at the
 * between-peaks speed. `stagePace.test.ts` asserts both directions.
 *
 * ## The one place the owner may overrule, and what undoing it costs
 *
 * The ruling reads § D525 clause 4's *"the stage plays at a watching speed"* as binding wherever
 * there are people to watch — the acts, and any landing with somebody past a minute on it. An owner
 * who reads it as *every second of every run* sets {@link BETWEEN_PEAKS_SIM_PER_REAL_S} to the
 * watching rung's own multiplier: `stagePaceOf` then answers the player's rung everywhere, the note
 * says nothing the transport does not do, and nothing else has to change. `sittingShape.ts` composes
 * the tile's figure from the same constant, so it moves back to about two and a half hours on the
 * same commit.
 */

import type { VizLeg } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import { WAIT_BANDS } from '../live/bands.js';
import { clockAt } from '../live/timeline.js';
import type { DayAct } from '../shift/dayLength.js';
import type { RunHorizon } from '../shift/types.js';

import { STAGE_SPEEDS } from './stageScreenModel.js';

/**
 * **The between-peaks rung: 30 simulated seconds per real second.** One named constant, § D991.
 *
 * A derivation, not a taste — it is [§ D354](../../../../DECISIONS.md)'s *fastest rung inside
 * [§ D344](../../../../DECISIONS.md)'s `S ≤ 39` budget*, the fastest rung at which a hall-call door
 * cycle (9.8 s) is still a cue a player can identify. So the building stays readable while it is
 * crossed. The ruling measured that `90×` would have lost nothing on 65 whole days and refused it
 * anyway, because it leaves the cue budget and nothing in this tree has derived a rung above 39.
 *
 * It must be a rung on the ladder, because the chip strip shows the rung the transport is actually
 * at, and a speed with no chip would be a speed the strip could not name. `stagePace.test.ts`
 * asserts it.
 *
 * **Set it equal to the watching rung to undo the choice** — see the module docstring.
 */
export const BETWEEN_PEAKS_SIM_PER_REAL_S = 30;

/**
 * **The wait that holds the stage at the player's rung between peaks** — the third band's floor.
 *
 * `WAIT_BANDS`' *checking watch*, 60 s, read rather than restated: it is the band § D512's
 * legibility is measured in and the colour a player is taught to read as trouble. A landing that
 * holds somebody past it is something to watch, whatever the timetable says.
 */
export const PACE_HOLD_WAIT_S: number = (() => {
  const band = WAIT_BANDS[2];
  if (band === undefined) throw new Error('stagePace: WAIT_BANDS has no third band to hold on');
  return band.fromS;
})();

/**
 * Why the transport is at the speed it is.
 *
 * - `call` — a pinned day's call has come and is unanswered; the transport **stops**, at any rung
 *   and on either horizon ([§ D1029](../../../../DECISIONS.md)). It outranks every other reason,
 *   `chosen` included, because a chip press is a choice about speed and the call is not a speed.
 * - `unmanaged` — not a whole day; the player's rung, and no note, because nothing is being paced.
 * - `chosen` — a whole day whose player has pressed a chip; their rung, **until the next act
 *   boundary** (§ D1029 amends § D991 clause 2 — see {@link StagePaceInput.playerChoseSpeedAtS}).
 * - `act` — inside a peak; the player's rung.
 * - `held` — between peaks with somebody past {@link PACE_HOLD_WAIT_S}; the player's rung.
 * - `between` — between peaks with nobody past it; {@link BETWEEN_PEAKS_SIM_PER_REAL_S} or the
 *   player's rung, whichever is faster.
 */
export type StagePaceReason =
  | 'call'
  | 'unmanaged'
  | 'chosen'
  | 'act'
  | 'held'
  | 'between'
  | ScoredPaceReason;

/**
 * **A scored day's three reasons** — [§ D1169](../../../../DECISIONS.md), the decide-al ruling's Q1
 * clause 1, which puts the tutorial's hold rule on every scored day (the week's days, slices and
 * whole days alike) in place of § D991's peaks.
 *
 * - `watching` — somebody on a landing has waited past {@link PACE_HOLD_WAIT_S} on the present
 *   frame; the player's rung.
 * - `fast` — nobody has; {@link BETWEEN_PEAKS_SIM_PER_REAL_S} or the player's rung, whichever is
 *   faster. Peaks are no exception: a peak where nobody has waited a minute is crossed fast too.
 * - `yours` — the player pressed a chip while the stage was fast; their rung until somebody next
 *   waits a minute ({@link StagePaceInput.playerChoseSpeedAtS}). A chip pressed while `watching` is
 *   the rung `watching` plays at, so it is kept for every later stretch with somebody waiting.
 */
export type ScoredPaceReason = 'watching' | 'fast' | 'yours';

export interface StagePace {
  readonly simPerRealS: number;
  readonly reason: StagePaceReason;
}

/** Everything {@link stagePaceOf} reads. Plain data — the mount has already folded the frame. */
export interface StagePaceInput {
  readonly horizon: RunHorizon;
  /** `shift/dayLength.ts#actsOf` over the recording's own schedule. */
  readonly acts: readonly DayAct[];
  readonly simTimeS: number;
  /** The player's rung — their Default speed, or the chip they pressed. */
  readonly watchingSimPerRealS: number;
  /** `LiveObservations.longestCurrentWaitS` at the playhead. `undefined` on empty landings. */
  readonly longestStandingS: number | undefined;
  /**
   * **When a chip was last pressed on this day**, or `undefined` for none.
   *
   * [§ D1029](../../../../DECISIONS.md) amends § D991 clause 2: a chip press is the player's until
   * the next act boundary — a peak opening or closing — and then the stage paces again. It used to
   * hold for the rest of the day, and the ruling's engineering lens measured what that cost: a
   * player who pressed `4×` once in the morning watched the hours between peaks at `4×`, so the
   * published day length (`sittingShape.ts`, the tile's figure) was true only of a player who never
   * touched a chip. Bounded by the next boundary, the choice still takes effect at once and the
   * figure stays true of every player.
   */
  readonly playerChoseSpeedAtS: number | undefined;
  /**
   * **The pinned day's call, while it stands unanswered** — `shift/pressCall.ts#pressCallOf`'s
   * instant, or `undefined` on every other day and once the call is answered.
   */
  readonly callAtS?: number | undefined;
  /**
   * **A scored day** — a week's day on the daily stage, whichever its horizon ([§ D1169](../../../../DECISIONS.md)).
   * The acts and the horizon are not read: the stage is fast while nobody on a landing has waited a
   * minute, and at the player's rung while somebody has. On a scored day
   * {@link playerChoseSpeedAtS} is a chip pressed **while fast**, and the stage clears it when
   * somebody next waits a minute, so it stands exactly until then.
   */
  readonly scored?: boolean | undefined;
}

/** The act boundary after `fromS` — a peak opening or closing — or `undefined` when none remains. */
function nextActBoundaryAfter(acts: readonly DayAct[], fromS: number): number | undefined {
  let next: number | undefined;
  for (const act of acts) {
    for (const edge of [act.startS, act.endS]) {
      if (edge > fromS && (next === undefined || edge < next)) next = edge;
    }
  }
  return next;
}

/**
 * Whether the chip pressed at {@link StagePaceInput.playerChoseSpeedAtS} still stands: no act
 * boundary lies in `(pressedAt, simTimeS]`. A scrub back to before the press ends it too, because
 * the press was made further on in the day than the playhead now is.
 */
function chipStands(input: StagePaceInput): boolean {
  const at = input.playerChoseSpeedAtS;
  if (at === undefined || input.simTimeS < at) return false;
  const boundary = nextActBoundaryAfter(input.acts, at);
  return boundary === undefined || input.simTimeS < boundary;
}

/** The act the playhead is inside, or `undefined`. Half-open, `[startS, endS)`. */
export function actAt(acts: readonly DayAct[], simTimeS: number): DayAct | undefined {
  return acts.find((act) => simTimeS >= act.startS && simTimeS < act.endS);
}

/** **The speed the stage plays at this playhead.** See the module docstring for the rule. */
export function stagePaceOf(input: StagePaceInput): StagePace {
  const watching = input.watchingSimPerRealS;
  if (input.callAtS !== undefined && input.simTimeS >= input.callAtS) {
    return { simPerRealS: watching, reason: 'call' };
  }
  if (input.scored === true) {
    /* § D1169: the tutorial's rule, on the present frame only. */
    if (input.longestStandingS !== undefined && input.longestStandingS >= PACE_HOLD_WAIT_S) {
      return { simPerRealS: watching, reason: 'watching' };
    }
    if (input.playerChoseSpeedAtS !== undefined && input.simTimeS >= input.playerChoseSpeedAtS) {
      return { simPerRealS: watching, reason: 'yours' };
    }
    return { simPerRealS: Math.max(watching, BETWEEN_PEAKS_SIM_PER_REAL_S), reason: 'fast' };
  }
  if (input.horizon !== 'whole-day' || input.acts.length === 0) {
    return { simPerRealS: watching, reason: 'unmanaged' };
  }
  if (chipStands(input)) return { simPerRealS: watching, reason: 'chosen' };
  if (actAt(input.acts, input.simTimeS) !== undefined) return { simPerRealS: watching, reason: 'act' };
  if (input.longestStandingS !== undefined && input.longestStandingS >= PACE_HOLD_WAIT_S) {
    return { simPerRealS: watching, reason: 'held' };
  }
  return { simPerRealS: Math.max(watching, BETWEEN_PEAKS_SIM_PER_REAL_S), reason: 'between' };
}

/** A rung's own chip label — § D354's rule that the label **is** the multiplier. */
function rungLabelOf(simPerRealS: number): string {
  return STAGE_SPEEDS.find((speed) => speed.simPerRealS === simPerRealS)?.label ?? `${String(simPerRealS)}×`;
}

/**
 * **The one line beside the chips that says why the speed is what it is** — § D991's *every change
 * shows on the chip*.
 *
 * The chip strip already shows the rung, and the label is always the multiplier. This says the
 * reason, from the schedule and the present frame only: the next act's start is the timetable's
 * (AD-S4), and *somebody has waited over a minute* is a count of the landing at the playhead. It
 * names no outcome and previews nothing, which is why it is seeded on the honesty corpus's temporal
 * axis rather than exempted from it.
 *
 * `undefined` when the stage is not pacing anything — a slice, a rush, a fix case — because a note
 * explaining a speed nobody changed would be a sentence about nothing.
 */
export function stagePaceNoteOf(
  pace: StagePace,
  context: {
    readonly acts: readonly DayAct[];
    readonly simTimeS: number;
    readonly dayStartS?: number | undefined;
  },
): string | undefined {
  const rung = rungLabelOf(pace.simPerRealS);
  switch (pace.reason) {
    case 'unmanaged':
      return undefined;
    case 'call':
      return 'stopped for the day’s call';
    case 'chosen': {
      const until = nextActBoundaryAfter(context.acts, context.simTimeS);
      return until === undefined
        ? `your speed, ${rung}, to the end of the day`
        : `your speed, ${rung}, until ${clockAt(until, context.dayStartS)}`;
    }
    case 'act': {
      const act = actAt(context.acts, context.simTimeS);
      return act === undefined
        ? `a peak, at your speed`
        : `a peak until ${clockAt(act.endS, context.dayStartS)}, at your speed`;
    }
    case 'held':
      return `between peaks, held at ${rung} while somebody has waited over a minute`;
    case 'between': {
      const next = context.acts.find((act) => act.startS > context.simTimeS);
      return next === undefined
        ? `after the last peak, at ${rung} to the end of the day`
        : `between peaks at ${rung}, next peak at ${clockAt(next.startS, context.dayStartS)}`;
    }
    /* § D1169: a scored day's three, each one line and each a fact of the present frame. */
    case 'fast':
      return `fast-forwarding at ${rung} while nobody on a landing has waited a minute`;
    case 'watching':
      return `at your speed, ${rung}, while somebody on a landing has waited over a minute`;
    case 'yours':
      return `your speed, ${rung}, until somebody on a landing has waited a minute`;
  }
}

/*
 * ---- § D1212: the quiet between a scored whole day's peaks is skipped. ----
 */

/**
 * **The beat before a skip, in real seconds** — [§ D1212](../../../../DECISIONS.md).
 *
 * The stage plays this long at the fast rung, with {@link STAGE_SKIP_BEAT_NOTE} up, before it seeks,
 * so a player sees the skip coming and can stop it: pause, or any speed chip (which is § D1169's
 * *your speed until somebody next waits a minute*, and the skip does not apply to it). A stretch
 * shorter than two beats is simply played, because a seek that saves less than the beat it waited
 * for saves nothing. Owner-reversible: `0` would seek at once and leave nothing to interrupt.
 */
export const SKIP_BEAT_REAL_S = 2;

/**
 * **The next peak, when the playhead is between two of the day's peaks** — after one act has ended
 * and before the next has started — or `undefined` inside a peak, before the first and after the
 * last. The acts are `shift/dayLength.ts#actsOf`'s, the authored phases that touch the day's peak.
 */
export function nextPeakFromBetween(acts: readonly DayAct[], simTimeS: number): DayAct | undefined {
  if (actAt(acts, simTimeS) !== undefined) return undefined;
  if (!acts.some((act) => act.endS <= simTimeS)) return undefined;
  let next: DayAct | undefined;
  for (const act of acts) {
    if (act.startS > simTimeS && (next === undefined || act.startS < next.startS)) next = act;
  }
  return next;
}

/**
 * **The first instant at or after `fromS` at which somebody on a landing has waited
 * {@link PACE_HOLD_WAIT_S}**, read off the legs, or `undefined` when nobody does again.
 *
 * The instant {@link stagePaceOf}'s `watching` begins on the present frame's reading: a leg is past a
 * minute from `arrivedAt + PACE_HOLD_WAIT_S` for as long as it is still waiting
 * (`frame/overlay.ts#isWaitingAt`, the predicate the frame's longest wait is folded with). A leg
 * already past a minute at `fromS` answers `fromS`. `legs` are in arrival order, as every recording
 * holds them, so the scan stops at the first leg that could not beat the best found.
 */
export function firstMinuteWaitFrom(legs: readonly VizLeg[], fromS: number): number | undefined {
  let best: number | undefined;
  for (const leg of legs) {
    const reaches = leg.arrivedAt + PACE_HOLD_WAIT_S;
    if (best !== undefined && reaches > best) break;
    const at = Math.max(reaches, fromS);
    if (isWaitingAt(leg, at) && (best === undefined || at < best)) best = at;
  }
  return best;
}

/** What {@link stageSkipApplies} reads: the pace the stage is at, on which day. */
export interface StageSkipGate {
  readonly horizon: RunHorizon;
  readonly scored: boolean;
  readonly acts: readonly DayAct[];
  readonly simTimeS: number;
  /** The reason {@link stagePaceOf} gave at this frame. */
  readonly reason: StagePaceReason;
}

/**
 * **Whether the stage is in a stretch it skips** — a scored whole day, between two peaks, and
 * § D1169's `fast`: nobody on a landing has waited a minute and no chip is standing. `yours` (a chip
 * pressed while fast), `watching`, `call` and every unscored reason answer `false`, which is how a
 * speed chip stops a skip that is coming.
 */
export function stageSkipApplies(gate: StageSkipGate): boolean {
  return (
    gate.scored &&
    gate.horizon === 'whole-day' &&
    gate.reason === 'fast' &&
    nextPeakFromBetween(gate.acts, gate.simTimeS) !== undefined
  );
}

/** Why a skip stopped where it did. */
export type StageSkipUntil = 'wait' | 'call' | 'peak';

/** One skip: the playhead moves from `fromS` to `toS`, and the line names both. */
export interface StageSkip {
  readonly fromS: number;
  readonly toS: number;
  readonly until: StageSkipUntil;
}

/** Everything {@link stageSkipOf} reads. */
export interface StageSkipInput {
  readonly acts: readonly DayAct[];
  /** The recording's legs, in arrival order. */
  readonly legs: readonly VizLeg[];
  readonly simTimeS: number;
  /** Where the beat began: the playhead at the first frame {@link stageSkipApplies} held. */
  readonly armedAtS: number;
  /** The transport's speed through the beat, the fast rung. */
  readonly simPerRealS: number;
  /** The next call the stage would stop at, raised or still being asked, or `undefined`. */
  readonly stopAtS?: number | undefined;
}

/**
 * **Where the stage seeks to, once the beat is over** — [§ D1212](../../../../DECISIONS.md) — or
 * `undefined` while the beat lasts, and where the stretch left is shorter than one more beat.
 *
 * The earliest of the first instant anybody reaches a minute, the next call and the next peak's
 * start. Call it only where {@link stageSkipApplies} holds; outside a stretch between peaks it
 * answers `undefined`.
 */
export function stageSkipOf(input: StageSkipInput): StageSkip | undefined {
  const beatSimS = SKIP_BEAT_REAL_S * input.simPerRealS;
  const now = input.simTimeS;
  if (now - input.armedAtS < beatSimS) return undefined;
  const peak = nextPeakFromBetween(input.acts, now);
  if (peak === undefined) return undefined;
  let toS = peak.startS;
  let until: StageSkipUntil = 'peak';
  const wait = firstMinuteWaitFrom(input.legs, now);
  if (wait !== undefined && wait < toS) {
    toS = wait;
    until = 'wait';
  }
  const stop = input.stopAtS;
  if (stop !== undefined && stop >= now && stop < toS) {
    toS = stop;
    until = 'call';
  }
  if (toS - now < beatSimS) return undefined;
  return Object.freeze({ fromS: now, toS, until });
}

/**
 * **The beat's note** — drawn while the stage is about to skip. It names no instant ahead: where the
 * skip lands is read off the recording, and saying it before the stage is there would publish the
 * run's future (R6). It says how to stop the skip, since that is the one thing the beat is for.
 */
export const STAGE_SKIP_BEAT_NOTE =
  'nobody on a landing has waited a minute: skipping ahead · pause or pick a speed to watch it';

/**
 * **The one line a skip leaves** — *skipped 09:40–11:50: nobody on a landing waited a minute* —
 * drawn once the stage has landed, so both times are at or before the playhead. The two clocks are
 * the run's own (`live/timeline.ts#clockAt` with the run's hour).
 */
export function stageSkipLineOf(skip: StageSkip, dayStartS?: number | undefined): string {
  return `skipped ${clockAt(skip.fromS, dayStartS)}–${clockAt(skip.toS, dayStartS)}: nobody on a landing waited a minute`;
}
