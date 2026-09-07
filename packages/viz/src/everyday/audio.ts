/**
 * **The speed-tiered audio direction, decided** — [§ D344](../../../../DECISIONS.md), GitHub issue
 * **#258**. Every judgement the sound makes lives here; `everyday/audioEngine.ts` is the sink that
 * turns those judgements into noise and owns nothing this file decides.
 *
 * The split is `dev/motion.ts`' rather than a new idea: a preference this project calls
 * non-negotiable should be assertable without an operating system that has it set, and a cue that
 * only exists inside a `AudioContext` is a cue no test can read. So this module is pure — no
 * `window`, no `AudioContext`, no clock it did not receive — and `docs/16` S2's *"the sink must be
 * the **shipped** decision, not a restatement of it"* is why `audioEngine.ts` consumes
 * {@link audioPlanFor}'s output rather than recomputing any of it.
 *
 * ## The crossover is computed, and it is computed from this building
 *
 * § D344's Limit A: **a cue must fit inside the event it announces.** The shortest identifiable
 * discrete cue is about {@link MIN_IDENTIFIABLE_CUE_S}, and a hall-call door cycle is
 * `openS + dwellHallCallS + closeS` simulated seconds, so a cue survives compression only while
 * `cycle / S ≥ MIN_IDENTIFIABLE_CUE_S`.
 *
 * **That is an arithmetic over the recording's own `doorConfig`, never a speed index.** The ruling
 * quotes `S ≤ 39` because a centre-opening hall-call cycle is `1.8 + 5 + 3.0 = 9.8` s and
 * `9.8 / 0.25 = 39.2`; {@link audioCrossoverOf} reproduces that number for a building whose cars
 * are centre-opening and produces a *different* one for a building whose cars are not, which is
 * the whole reason it is a function. A side-opening car (`2.5 + 5 + 4.0 = 11.5`) stays discrete to
 * 46. Hard-coding 39 would be a published number pinned to nothing, and it would be silently wrong
 * the first time a building shipped a slower door.
 *
 * **The `min` over shafts, not the mean.** A building whose cars differ crosses over when its
 * *fastest* door stops being audible, because that is the first cue that fuses. Taking an average
 * would keep playing a cue nobody can hear on the car that produced it.
 *
 * ## § D344's Limit B does not bind, and this file does not implement it
 *
 * Transients fuse below roughly 100 ms apart, so chiming *every* door at *every* floor has its own
 * budget — `cars × S ≤ 300` — which `vertical-city` fails at every speed the ladder offers. The
 * owner's second instruction dissolves it: **chimes are modelled at the lobby only**, which cuts
 * the rate from one per stop to one per round trip and puts every shipped building's budget between
 * 231 and 568, far above 39. So the constraint reduces to Limit A and there is no second bound in
 * this code. {@link AudioCrossover.lobbyFloorIds} is the clause that makes that true, and it is
 * derived from `VizFloor.isEntrance` rather than from a floor index, because a lobby is a fact the
 * building declares. `midtown-office`'s second entrance sits at index **−1**, so *the floor at
 * index 0* and *a floor a player walks in through* are already two different sets in the shipped
 * fleet, and a cue keyed on the index would have gone to the wrong one of them.
 *
 * **Every entrance, not the first one** — and that is a decision rather than a convenience.
 * `isEntrance` is not unique: `midtown-office` declares its car park an entrance too, *"so
 * arrivals reach the building there"* (`authoring/buildingSpec.ts`), and `render/canvas.ts` badges
 * all of them. A cue at one and silence at the other would tell a player that one of two doors
 * their building actually uses is not a door. The rate is what § D344's budget is about, and two
 * entrances is still one chime per round trip rather than one per stop.
 *
 * ## What the bed may know, and the two rules that bound it
 *
 * `docs/10` R6 applies to a sound as much as to a banner: the bed may not encode a figure the stage
 * is forbidden to draw. So its density is {@link LiveObservations.waitingNow} — *people standing at
 * a landing right now*, a quantity folded at the playhead — and **nothing here reads `summary.*`**.
 * Not because those figures are suppressed on this run (they may not be) but because they are
 * statements about the whole run and a bed heard at a part-way playhead would be publishing one.
 * That is `stageScreenModel.ts`' own rule, one layer over.
 *
 * And `docs/29`'s accessibility clause: **no cue conveys information the screen does not also
 * convey.** Every quantity below is already drawn — `waitingNow` is the stage's own waiting count,
 * a car at the lobby with its doors open is the cutaway's own picture — so the audio is a second
 * channel for what is on screen and never a first channel for anything. Audio is not pillar P3's
 * visible antecedent and shipping it does not discharge P3.
 *
 * ## The chime is demoted rather than deleted, and the demotion is a rate rather than a level
 *
 * § D344's fifth clause asks for *background level, occasional rather than per-event, and
 * explicitly not annoying*. A level is the sink's business; the **rate** is a judgement, so it is
 * here: {@link CHIME_MIN_GAP_REAL_S} is a floor on the *real* seconds between two chimes, so the
 * same lobby that chimes on every arrival at 1× thins to an occasional texture at 600× without a
 * second rule and without the tier having to know about it. Real seconds rather than simulated
 * ones is the whole point — a gap in simulated time would compress exactly as fast as the events
 * it is spacing and would space nothing.
 */

import type { Frame, VizRecording } from '../contract/types.js';
import type { LiveObservations } from '../live/types.js';

/* -------------------------------------------------------------------------- *
 * The player's switch, and the words on it
 * -------------------------------------------------------------------------- */

/**
 * Whether a run makes a noise. The whole of the player's Sound setting.
 *
 * A boolean rather than a level, because a level is a control the operating system already has and
 * a second one is two places to be quiet in. {@link SOUND_ROW_COPY} is the row that writes it.
 */
export type SoundPreference = boolean;

/**
 * **Sound is on for a fresh device.**
 *
 * The alternative — ship it off and let a player find the row — is a feature nobody meets, and it
 * would make the row the only way to discover that the build has a sound at all. A browser will
 * not let a page make a noise before the player has pressed something anyway, so the first sound
 * anyone hears follows a press of Play rather than a page load.
 */
export const DEFAULT_SOUND_ON: SoundPreference = true;

/** Whether a stored value is a sound preference — the storage guard, refused to the default. */
export function isSoundPreference(value: unknown): value is SoundPreference {
  return typeof value === 'boolean';
}

/**
 * § 15.1's *Sound* row, as words — authored here rather than on the settings screen, on
 * `everyday/units.ts#UNITS_ROW_COPY`'s ground: the note is a **claim about what the control
 * reaches**, and a note kept away from the mechanism is [§ D227](../../../../DECISIONS.md)'s stale
 * refusal waiting to happen. The one thing this control reaches is decided forty lines down.
 *
 * The note's second half is `docs/29`'s accessibility clause on the face of the control that turns
 * it off: **nothing is only ever heard.** Every quantity the sound carries — a car at a lobby with
 * its doors open, the crowd standing at the landings — is drawn on the same screen at the same
 * instant, so a player who never turns this on is missing a texture rather than a fact. Saying it
 * in the register rather than in a document is the difference between a promise and a note to the
 * team.
 */
export const SOUND_ROW_COPY = Object.freeze({
  label: 'Sound',
  note: 'the stage plays its lobby — chimes and doors while the clock is slow, a crowd once it is fast; nothing is ever only heard',
  face: Object.freeze({ on: 'on', off: 'off' }),
});

/* -------------------------------------------------------------------------- *
 * The two thresholds, and where they come from
 * -------------------------------------------------------------------------- */

/**
 * The shortest discrete cue a listener can identify, in **real** seconds — § D344's Limit A.
 *
 * A standard psychoacoustic threshold rather than a measurement of this tree, and § D344 labels it
 * as such where it states it. It is named here rather than inlined because it is the denominator of
 * the only bound this file has, and a threshold spelled twice is a threshold that moves once.
 */
export const MIN_IDENTIFIABLE_CUE_S = 0.25;

/**
 * The least **real** time between two chimes — § D344's *"occasional rather than per-event"*.
 *
 * 2.5 s is an order of magnitude above the ~100 ms at which transients fuse into texture, which is
 * the point: fusion is the failure this avoids and *annoying* is the failure it is actually for,
 * and those are different distances apart. A building at 600× whose cars reach the lobby every two
 * simulated minutes would otherwise chime five times a second.
 *
 * Real seconds, never simulated: a simulated-time gap compresses with the events it is spacing.
 */
export const CHIME_MIN_GAP_REAL_S = 2.5;

/* -------------------------------------------------------------------------- *
 * The crossover
 * -------------------------------------------------------------------------- */

/** Which of § D344's two tiers a speed is in. */
export type AudioTier = 'discrete' | 'bed';

/** What this building can carry, and where its lobby is. Computed once per recording. */
export interface AudioCrossover {
  /**
   * The highest `simPerRealS` at which a discrete cue still fits inside the door cycle it
   * announces. Derived, never authored — see this module's docstring.
   */
  readonly ceilingSimPerRealS: number;
  /** The shortest hall-call door cycle in the building, simulated seconds. The ceiling's numerator. */
  readonly shortestDoorCycleS: number;
  /** Every floor the building declares an entrance. The only floors a cue may sound at. */
  readonly lobbyFloorIds: readonly string[];
  /**
   * Everybody every car in the building could lift at once — the bed's denominator.
   *
   * A **building-relative** reference rather than a constant, so a bed on a two-car block of flats
   * and a bed on a thirty-five-car tower both mean *this lobby is full* rather than *this many
   * people*. `0` for a recording with no cars, which {@link bedLevelOf} answers with silence.
   */
  readonly liftableAtOnce: number;
}

/**
 * The crossover for one recording — § D344's Limit A, evaluated against this building's doors.
 *
 * A recording with no shafts has no door to fit a cue inside, so its ceiling is `0` and every
 * speed is in the bed tier. That is the conservative arm rather than the convenient one: the
 * alternative is a fallback cycle, and a fallback cycle is a number about a building that is not
 * the one being watched.
 */
export function audioCrossoverOf(recording: VizRecording): AudioCrossover {
  let shortestDoorCycleS = Number.POSITIVE_INFINITY;
  let liftableAtOnce = 0;
  for (const shaft of recording.shafts) {
    const cycleS = shaft.doorConfig.openS + shaft.doorConfig.dwellHallCallS + shaft.doorConfig.closeS;
    if (cycleS < shortestDoorCycleS) shortestDoorCycleS = cycleS;
    liftableAtOnce += shaft.capacityPersons;
  }
  if (!Number.isFinite(shortestDoorCycleS)) {
    return { ceilingSimPerRealS: 0, shortestDoorCycleS: 0, lobbyFloorIds: [], liftableAtOnce: 0 };
  }
  return {
    ceilingSimPerRealS: shortestDoorCycleS / MIN_IDENTIFIABLE_CUE_S,
    shortestDoorCycleS,
    lobbyFloorIds: recording.floors.filter((floor) => floor.isEntrance).map((floor) => floor.id),
    liftableAtOnce,
  };
}

/**
 * Which tier a speed is in — the one place the two are told apart.
 *
 * Inclusive at the ceiling, because the ceiling is the speed at which the cue is exactly as long
 * as the shortest identifiable one rather than the first speed at which it is too short.
 */
export function audioTierAt(crossover: AudioCrossover, simPerRealS: number): AudioTier {
  return simPerRealS <= crossover.ceilingSimPerRealS ? 'discrete' : 'bed';
}

/* -------------------------------------------------------------------------- *
 * The discrete cues
 * -------------------------------------------------------------------------- */

/**
 * What a discrete cue is about.
 *
 * `arrival` is the chime — a car has reached a lobby and started to open. `doors` is the door
 * itself closing again. Two rather than one because § D344 lists *"doors, arrival chime, the things
 * a lift actually does"*, and because they are the two ends of the cycle whose length is the
 * ceiling's numerator.
 */
export type AudioCueKind = 'arrival' | 'doors';

/** One cue, and the frame's own reason for it. */
export interface AudioCue {
  readonly kind: AudioCueKind;
  readonly carId: string;
  /** Always a member of {@link AudioCrossover.lobbyFloorIds} — asserted in `audio.test.ts`. */
  readonly floorId: string;
  /** The simulated instant the frame carrying this cue was drawn at. */
  readonly atS: number;
}

/**
 * The cues between two frames — a **transition** detector, never a state one.
 *
 * A cue fires on the frame where a car's `doorPhase` *changed*, so a car standing open at the
 * lobby for six simulated seconds produces one chime rather than one per frame. `before` absent
 * means the first frame of a playback, which fires nothing: an arrival that had already happened
 * before anybody pressed play is not an arrival anybody is watching.
 *
 * **Lobby-only, and that is the clause § D344 turns on.** A car opening on the fourteenth floor
 * produces nothing here, which is what takes the event rate from one per stop to one per round
 * trip and is also what real installations do.
 *
 * **A playhead that moved backwards fires nothing.** `live/observations.ts` says why in its own
 * docstring — *"the playhead scrubs backwards… purity is the feature"* — and a scrub is not an
 * arrival: a player dragging back over a morning would otherwise hear every door in it a second
 * time, in reverse.
 */
export function lobbyCuesBetween(
  crossover: AudioCrossover,
  before: Frame | undefined,
  now: Frame,
): readonly AudioCue[] {
  if (before === undefined || now.simTimeS < before.simTimeS) return [];
  const lobbies = new Set(crossover.lobbyFloorIds);
  const wasAt = new Map(before.cars.map((car) => [car.carId, car]));
  const cues: AudioCue[] = [];
  for (const car of now.cars) {
    if (!lobbies.has(car.floorId)) continue;
    const was = wasAt.get(car.carId);
    if (was === undefined) continue;
    /*
     * The chime is the *start* of opening rather than the end, because that is where a real one
     * sounds and because a cue that waited for `open` would announce an event already half over.
     */
    if (car.doorPhase === 'opening' && was.doorPhase !== 'opening') {
      cues.push({ kind: 'arrival', carId: car.carId, floorId: car.floorId, atS: now.simTimeS });
    }
    if (car.doorPhase === 'closing' && was.doorPhase !== 'closing') {
      cues.push({ kind: 'doors', carId: car.carId, floorId: car.floorId, atS: now.simTimeS });
    }
  }
  return cues;
}

/* -------------------------------------------------------------------------- *
 * The bed
 * -------------------------------------------------------------------------- */

/**
 * How loud the crowd is, `0`–`1`, from **{@link LiveObservations.waitingNow}** and nothing else.
 *
 * The field is named in the signature rather than reached for inside, so the answer to *"what does
 * the bed know?"* is the type. `docs/10` R6 is the reason it is this field: `waitingNow` is folded
 * at the playhead, and a `summary.*` field would be a whole-run statement heard part-way through
 * one. GitHub issue #258's third acceptance criterion is this line.
 *
 * Normalised against {@link AudioCrossover.liftableAtOnce} so *full* means the same thing in a
 * two-car building and a thirty-five-car one, and clamped rather than allowed to exceed 1: past
 * the point where every car in the building is already spoken for, a lobby does not get louder in
 * any way a listener could tell apart.
 */
export function bedLevelOf(observations: LiveObservations, crossover: AudioCrossover): number {
  if (crossover.liftableAtOnce <= 0) return 0;
  return Math.min(1, Math.max(0, observations.waitingNow / crossover.liftableAtOnce));
}

/* -------------------------------------------------------------------------- *
 * The plan — the one thing the sink consumes
 * -------------------------------------------------------------------------- */

/**
 * What the chime rate limiter has remembered — the only state this module carries.
 *
 * Passed in and handed back rather than held in a closure, so a caller can plan the same frame
 * twice and get the same answer, which is what lets `audio.test.ts` drive a whole recording
 * without a clock.
 */
export interface AudioDirectorState {
  /** Real seconds at the last chime the plan let through, or `undefined` before the first. */
  readonly lastChimeRealS: number | undefined;
}

/** The opening state: nothing has chimed. */
export const NO_AUDIO_YET: AudioDirectorState = Object.freeze({ lastChimeRealS: undefined });

/** Everything {@link audioPlanFor} needs, and nothing it could get for itself. */
export interface AudioPlanInput {
  readonly crossover: AudioCrossover;
  /** The transport's own speed, simulated seconds per real second. */
  readonly simPerRealS: number;
  /** The frame before this one, or `undefined` on the first frame of a playback. */
  readonly before: Frame | undefined;
  readonly now: Frame;
  readonly observations: LiveObservations;
  /** Real seconds since the page loaded — the rate limiter's clock, injected. */
  readonly realTimeS: number;
  /** The player's Sound setting. `false` silences everything and changes nothing else. */
  readonly soundOn: boolean;
  readonly state: AudioDirectorState;
}

/** What to play at one instant. The sink's whole input. */
export interface AudioPlan {
  readonly tier: AudioTier;
  /** The cues to strike now — empty in the bed tier except for a chime the limiter let through. */
  readonly cues: readonly AudioCue[];
  /** `0`–`1`. Zero in the discrete tier: at 1:1 a lobby is its own cues, not a wash. */
  readonly bedLevel: number;
  /** `true` when the player has turned Sound off. Every other field still says what it would say. */
  readonly silent: boolean;
}

/**
 * The whole audio decision for one frame — § D344's design, in one function.
 *
 * The tiers are not exclusive in the way the ruling's table can be read to suggest, and this is
 * where that is settled. **Doors belong to the discrete tier alone**, because Limit A is exactly
 * the statement that they do not fit above the ceiling. **The chime plays in both**, because
 * § D344's fifth clause demotes it rather than deleting it — and the demotion is
 * {@link CHIME_MIN_GAP_REAL_S}, which does nothing at 1× and does all the work at 600×. **The bed
 * plays in the bed tier alone**, because a continuous wash under a lobby the player can hear one
 * car at a time is the thing § 3's argument was never about.
 *
 * `soundOn: false` sets {@link AudioPlan.silent} and **leaves every other field alone**. That is
 * deliberate: a muted plan that also stopped computing would make the mute untestable against the
 * unmuted one, and `docs/16` S2 wants a sink that observably changed rather than a branch that
 * skipped. The limiter is not advanced while silent, so unmuting does not owe a chime.
 */
export function audioPlanFor(input: AudioPlanInput): {
  readonly plan: AudioPlan;
  readonly state: AudioDirectorState;
} {
  const tier = audioTierAt(input.crossover, input.simPerRealS);
  const found = lobbyCuesBetween(input.crossover, input.before, input.now);
  const bedLevel = tier === 'bed' ? bedLevelOf(input.observations, input.crossover) : 0;
  if (!input.soundOn) {
    return {
      plan: { tier, cues: [], bedLevel, silent: true },
      state: input.state,
    };
  }
  const since = input.state.lastChimeRealS;
  const chimeAllowed = since === undefined || input.realTimeS - since >= CHIME_MIN_GAP_REAL_S;
  const cues: AudioCue[] = [];
  let chimed = false;
  for (const cue of found) {
    if (cue.kind === 'doors') {
      /* Limit A: a door cue above the ceiling is shorter than anybody can hear it. */
      if (tier === 'discrete') cues.push(cue);
      continue;
    }
    /* One chime per gap, however many cars reached a lobby inside it. */
    if (!chimeAllowed || chimed) continue;
    cues.push(cue);
    chimed = true;
  }
  return {
    plan: { tier, cues, bedLevel, silent: false },
    state: chimed ? { lastChimeRealS: input.realTimeS } : input.state,
  };
}
