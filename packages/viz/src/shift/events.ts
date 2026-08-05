/**
 * Today's twist — and the reason each one is a value the simulator consumes rather than a caption.
 *
 * ## The rule this module exists to keep
 *
 * `docs/05-roadmap.md` § *Standing requirement — the integration seam has an owner*: a behaviour
 * that is configurable, unit-tested in isolation and never called from a shipped path passes every
 * other check this repository runs, and has shipped as a dead seam eleven times in code and once
 * in `data/`. The rule it settled on is not *"is it reachable?"* but **"name the non-test
 * caller"**.
 *
 * An event is the shape of defect that rule was written for. The handoff's five events
 * (`design.html` :1419–1426) are a name and a note; nothing in the prototype's toy simulator reads
 * them. Ported literally they would be five sentences printed over a run that is identical every
 * day — and unlike a dead function, a dead *caption* is actively false: *"Twenty minutes where the
 * whole building wants to be in the lobby at once"* over a run whose directional split never moved
 * is a label that does not describe the picture under it, which is the failure the honesty card
 * exists to prevent.
 *
 * So each event declares an {@link EventEffect} in fields the engine reads, and
 * {@link shiftRunPatch} turns that into the two values a run is built from: a
 * `SimulationDemandOptions` fragment and a list of car ids for `RecordRunOptions.outOfServiceCarIds`.
 * `events.test.ts` runs every event against a no-event control on a real shipped building and
 * asserts the run differs **in the way the event claims** — a car genuinely idle, a directional
 * mix genuinely swung, a rate genuinely raised. That is the assertion a caption cannot pass, and it
 * is the most important test in this directory.
 *
 * ## The five, and what each one writes
 *
 * | event | effect | engine field |
 * |---|---|---|
 * | `move-in` | one car away for the first two thirds, then back | `BuildingConfig.serviceEvents` |
 * | `fire-drill` | mix swung outgoing-dominant, rate raised | `directionalSplit`, `arrivalRatePctPop5min` |
 * | `conference` | interfloor share raised | `directionalSplit` |
 * | `ordinary` | **nothing, and it says so** | none |
 * | `weekend` | rate reduced | `arrivalRatePctPop5min` |
 *
 * ## `move-in` changed mechanism, and the old reasoning is kept because it was the narrowing
 *
 * The design describes it as *"one car is effectively half a car"* and its note ends *"until
 * 11:30"*. This module used to answer that with `RecordRunOptions.outOfServiceCarIds`, which holds a
 * car for the **whole** run — and said so, because a time-boxed derate is a
 * `BuildingConfig.serviceEvents` schedule and *"the building the shift layer hands the runner is
 * `grownBuilding`'s output, which this module does not own."* That was true, and the note was
 * rewritten to *"for the whole shift"* rather than left promising a return that never came.
 *
 * `shift/incidents.ts` owns that seam now — it is `serviceEvents`' first non-test caller anywhere in
 * the repository — so the car goes out and comes back, and the note describes it. The window is a
 * **fraction of the run** and not an hour: 11:30 is outside every shipped shift length, and § D175
 * dropped the fire drill's *"14:00"* for the same reason.
 *
 * The mechanism is also the more interesting one, which is why this is not merely a duration change.
 * A car that never returns is a smaller building for a day; a car that rejoins two thirds of the way
 * through is a group that has to absorb a loss and then re-balance around the return.
 *
 * `carsOutOfService` remains, is `0` on all five events, and is **not** dead: it is the right
 * instrument for *"this car is not in the building today"*, `shiftRunPatch` still maps it, and
 * `events.test.ts` still drives it. An event that wants a whole-shift hold declares one.
 */

import type {
  DemandLevel,
  DirectionalSplit,
  ResolvedBuilding,
  SimulationDemandOptions,
  TrafficProfile,
} from '@elevator-sim/core/browser';

import { carsToDerate, type Incident } from './incidents.js';
import type { EventEffect, ShiftEvent, ShiftEventId } from './types.js';

/**
 * `traffic.arrivalRatePctPop5min`'s declared ceiling, from `core`'s own `TRAFFIC_PARAMETERS`.
 *
 * Copied rather than imported because the parameter table is a `readonly` array of tagged unions
 * and digging a range out of it at runtime would be a lookup that fails silently if the id moves.
 * Pinned here with its source named, and `events.test.ts` asserts a raised rate never exceeds it —
 * a run configured past the searchable range is a run no optimizer could have produced and no
 * reference figure describes.
 */
export const MAX_ARRIVAL_RATE_PCT_POP_5MIN = 25;

/* -------------------------------------------------------------------------- *
 * The five effects
 * -------------------------------------------------------------------------- */

/**
 * The mix during a drill: almost everybody heading for the lobby.
 *
 * Not `0/1/0`. A drill empties the building, but the shares are normalised by `normalizeSplit`
 * anyway and a pure-outgoing trace would remove interfloor and incoming demand entirely, which is
 * a *different experiment* rather than a busier one — the closed-form oracle's pure up-peak in
 * mirror image. A tenth each keeps the building recognisable.
 */
const DRILL_SPLIT: DirectionalSplit = Object.freeze({
  incoming: 0.1,
  outgoing: 0.8,
  interfloor: 0.1,
});

/**
 * The mix during a conference: half the demand is floor-to-floor.
 *
 * The design's note is the reason this is a distinct event rather than "more traffic": *"Interfloor
 * traffic all afternoon, which no up-peak strategy is tuned for."* Raising the *level* would not
 * test that; raising the *interfloor share* does, and CLAUDE.md's tuning discipline says the same
 * thing from the other side — *"the optimum for up-peak is not the optimum for down-peak"*.
 */
const CONFERENCE_SPLIT: DirectionalSplit = Object.freeze({
  incoming: 0.25,
  outgoing: 0.25,
  interfloor: 0.5,
});

/** No effect, said out loud. See {@link EventEffect.changesNothing}. */
const NO_EFFECT: EventEffect = Object.freeze({
  changesNothing: true,
  arrivalRateMultiplier: null,
  directionalSplit: null,
  carsOutOfService: 0,
  derate: null,
  writes: Object.freeze([]),
});

/**
 * The five events, keyed by id. Names and notes are **verbatim** from `design.html` :1419–1426.
 *
 * A frozen record over every {@link ShiftEventId} rather than a lookup that may miss: a sixth
 * event added without an effect is a compile error, which is the only way the answer to *what does
 * this do to the run* stays one somebody gave.
 */
export const SHIFT_EVENTS: Readonly<Record<ShiftEventId, ShiftEvent>> = Object.freeze({
  'move-in': Object.freeze({
    id: 'move-in',
    name: 'Move-in day',
    /*
     * The design's note ends *"until 11:30"*, and this event could not say *until* anything: a
     * time-boxed derate is a `BuildingConfig.serviceEvents` schedule, `shift/` did not own the
     * building the runner receives, and `outOfServiceCarIds` holds a car for the whole run. So the
     * note was rewritten to *"for the whole shift"*, which was true and was a narrowing.
     *
     * `incidents.ts` owns that seam now, so the car genuinely returns and the note can say so. It
     * says it as a **fraction of the shift** rather than as an hour, because 11:30 is outside every
     * shipped shift length — a shift is 15 to 120 minutes from 06:00 — and a caption naming an hour
     * the run does not contain is the defect § D175 corrected on the fire drill.
     */
    note: 'A tenant is hauling boxes up — one car is tied up for the first two thirds of the shift, then rejoins.',
    effect: Object.freeze({
      changesNothing: false,
      arrivalRateMultiplier: null,
      directionalSplit: null,
      /*
       * `0` here and a derate instead, which is a change of mechanism rather than of duration.
       *
       * A car that never comes back is a smaller building for a day. A car that rejoins two thirds
       * of the way through is a group that has to absorb a loss and then re-balance around the
       * return — which is the thing a player is being asked to plan for, and the thing the design's
       * *"until"* was describing.
       */
      carsOutOfService: 0,
      derate: Object.freeze({ cars: 1, fromFraction: 0, toFraction: 2 / 3 }),
      writes: Object.freeze(['serviceEvents']),
    }),
  }),
  'fire-drill': Object.freeze({
    id: 'fire-drill',
    /*
     * The design calls it *"Fire drill, 14:00"*. There is no 14:00 in a shift that runs 06:00 to
     * 06:30 (§ D175), and a caption naming an hour the run does not contain is the thing the
     * honesty card exists to prevent. The hour is dropped; the drill is what it always was.
     */
    name: 'Fire drill',
    note: 'Twenty minutes where the whole building wants to be in the lobby at once.',
    effect: Object.freeze({
      changesNothing: false,
      arrivalRateMultiplier: 1.6,
      directionalSplit: DRILL_SPLIT,
      carsOutOfService: 0,
      derate: null,
      writes: Object.freeze(['demand.arrivalRatePctPop5min', 'demand.directionalSplit']),
    }),
  }),
  conference: Object.freeze({
    id: 'conference',
    name: 'Conference on the middle floors',
    note: 'Interfloor traffic all afternoon, which no up-peak strategy is tuned for.',
    effect: Object.freeze({
      changesNothing: false,
      arrivalRateMultiplier: null,
      directionalSplit: CONFERENCE_SPLIT,
      carsOutOfService: 0,
      derate: null,
      writes: Object.freeze(['demand.directionalSplit']),
    }),
  }),
  ordinary: Object.freeze({
    id: 'ordinary',
    name: 'An ordinary Tuesday-shaped day',
    note: 'Nothing booked. The building is the only thing in your way.',
    effect: NO_EFFECT,
  }),
  weekend: Object.freeze({
    id: 'weekend',
    name: 'Weekend goods run',
    note: 'A trickle of demand and a lot of furniture. Enjoy it while it lasts.',
    effect: Object.freeze({
      changesNothing: false,
      arrivalRateMultiplier: 0.45,
      directionalSplit: null,
      carsOutOfService: 0,
      derate: null,
      writes: Object.freeze(['demand.arrivalRatePctPop5min']),
    }),
  }),
});

/**
 * Which event today is — the design's own schedule (`design.html` :1419–1426), unchanged.
 *
 * Weekend wins outright on `dayIdx >= 5`; otherwise the slot is `day % 5`. The arithmetic is the
 * design's and is deliberately not "improved": it is what makes day 3 a move-in and day 5 a fire
 * drill, and a reader who plays the week twice gets the same week both times. Pure in `(day,
 * dayIdx)` and therefore replayable, which is the same property CLAUDE.md invariant 5 asks of a run.
 */
export function eventFor(day: number, dayIdx: number): ShiftEvent {
  if (dayIdx >= 5) return SHIFT_EVENTS.weekend;
  const slot = ((day % 5) + 5) % 5;
  if (slot === 3) return SHIFT_EVENTS['move-in'];
  if (slot === 0) return SHIFT_EVENTS['fire-drill'];
  if (slot === 4) return SHIFT_EVENTS.conference;
  return SHIFT_EVENTS.ordinary;
}

/* -------------------------------------------------------------------------- *
 * Turning an effect into something the runner consumes
 * -------------------------------------------------------------------------- */

/** The demand the shift would have run at with no event. The thing an effect is relative to. */
export interface ShiftDemandBase {
  /** Percent of population per five minutes. */
  readonly ratePctPop5min: number;
  readonly split: DirectionalSplit;
}

/**
 * The base demand for a building's own traffic profile, at the chosen point of its range.
 *
 * A multiplier needs something to multiply, and hard-coding a rate here would make `fire-drill`
 * mean a different thing on Garden Apartments (a residential trickle) than on Midtown Office (an
 * up-peak). `typical` is `core`'s own default `DemandLevel`.
 */
export function baseDemandOf(
  profile: TrafficProfile,
  level: DemandLevel = 'typical',
): ShiftDemandBase {
  return {
    ratePctPop5min: profile.arrivalRatePctPop5min[level],
    split: profile.directionalSplit,
  };
}

export interface ShiftRunPatchInput {
  readonly event: ShiftEvent;
  /** The building the shift is running — grown, if `grownBuilding` has been applied. */
  readonly building: ResolvedBuilding;
  readonly base: ShiftDemandBase;
  /**
   * Whether this run's demand template varies the directional mix within the run
   * (`lunch-two-way`, whose `meanDirectionalSplit` is declared).
   *
   * `core` **refuses** the combination: a template that varies the mix and an explicit
   * `directionalSplit` would each have to win silently, so `generateTrace` throws rather than
   * resolve it. An event that wanted to swing the mix under such a template therefore cannot, and
   * says so in {@link ShiftRunPatch.withheld} rather than producing a config that throws at run
   * time. Default `false`, which is true of both templates the viewer runs.
   */
  readonly templateVariesMix?: boolean | undefined;
}

/** What a run builder applies. Both halves are values the simulator reads. */
export interface ShiftRunPatch {
  /**
   * Fields to merge **over** the run's own demand options. Empty for `ordinary`, which is what
   * makes *"this event changes nothing"* checkable rather than claimed.
   */
  readonly demand: SimulationDemandOptions;
  /** Passed to `recordRun`'s `outOfServiceCarIds`. Sorted, so the run is reproducible. */
  readonly outOfServiceCarIds: readonly string[];
  /**
   * Cars away for **part** of the run, for `shift/incidents.ts#withIncidents` to write onto the
   * building as `serviceEvents`.
   *
   * A third value rather than a second use of {@link outOfServiceCarIds}, because the two go to
   * different places: a whole-shift hold is a `recordRun` option applied to a car before the run,
   * and a window is a schedule the kernel reads *during* it. Collapsing them would mean the run
   * builder could not tell which it had been handed.
   */
  readonly incidents: readonly Incident[];
  /**
   * Parts of the effect that could not be applied, each with the reason.
   *
   * Empty in every shipped combination. Non-empty is not a failure — it is the honest form of a
   * refusal, and the surface prints it beside the event note so the caption and the run agree.
   */
  readonly withheld: readonly string[];
}

/**
 * Turn today's event into the two values a run is built from.
 *
 * Pure. Reads no clock, draws no random number, and returns a fresh object every call.
 */
export function shiftRunPatch(input: ShiftRunPatchInput): ShiftRunPatch {
  const { effect } = input.event;
  const withheld: string[] = [];

  if (effect.changesNothing) {
    return { demand: {}, outOfServiceCarIds: [], incidents: [], withheld: [] };
  }

  const demand: {
    arrivalRatePctPop5min?: number;
    directionalSplit?: DirectionalSplit;
  } = {};

  if (effect.arrivalRateMultiplier !== null) {
    demand.arrivalRatePctPop5min = Math.min(
      MAX_ARRIVAL_RATE_PCT_POP_5MIN,
      input.base.ratePctPop5min * effect.arrivalRateMultiplier,
    );
  }

  if (effect.directionalSplit !== null) {
    if (input.templateVariesMix === true) {
      withheld.push(
        `${input.event.name}: the directional mix is set by this run’s demand template, which ` +
          'varies it within the run. The engine refuses both at once rather than letting one win ' +
          'silently, so the mix is the template’s and only the demand level moved.',
      );
    } else {
      demand.directionalSplit = effect.directionalSplit;
    }
  }

  const outOfServiceCarIds =
    effect.carsOutOfService > 0
      ? carsToHold(input.building, effect.carsOutOfService, withheld, input.event.name)
      : [];

  /*
   * The derate picks its cars by the **same** total order the whole-shift hold uses, and it picks
   * them from the same building. An event declaring both would therefore take the same car out
   * twice — no shipped event does, and the refusal below says so rather than letting the two
   * quietly overlap and produce a car that is held and also scheduled to return.
   */
  const incidents: Incident[] = [];
  if (effect.derate !== null) {
    if (outOfServiceCarIds.length > 0) {
      withheld.push(
        `${input.event.name}: this event both holds a car for the whole shift and schedules one to ` +
          'return, and the two would pick the same car. The window was not applied.',
      );
    } else {
      const choice = carsToDerate(input.building, effect.derate.cars);
      if (choice.shortfall > 0) {
        withheld.push(
          `${input.event.name}: asked to stand ${String(effect.derate.cars)} car(s) down for part of ` +
            `the shift and could stand ${String(effect.derate.cars - choice.shortfall)}. Every bank ` +
            'keeps at least one car in service — a bank with none is a set of floors nobody can reach.',
        );
      }
      for (const car of choice.held) {
        incidents.push({
          kind: 'maintenance',
          car,
          fromFraction: effect.derate.fromFraction,
          toFraction: effect.derate.toFraction,
        });
      }
    }
  }

  return { demand, outOfServiceCarIds, incidents, withheld };
}

/**
 * Pick which cars stand idle — **the rule now lives in `incidents.ts`, and this maps it**.
 *
 * The order and its two reasons are unchanged and are stated there: deterministic because a random
 * draw outside the injected `StreamSet` breaks common random numbers (invariant 2) and would make
 * two shifts of the same day incomparable; and never the last car in a bank, because a bank with
 * none is a set of floors nobody can reach, which is a different scenario rather than a busier one.
 *
 * What changed is that `incidents.ts` needs the *same* choice expressed as `(bankId, carId)` for a
 * `serviceEvents` entry, while `recordRun` matches on the runtime id `${bankId}-${carId}` that
 * `Simulation` constructs. Two implementations of "which car goes out today" would let the
 * whole-shift hold and the time-boxed derate disagree about it, on the same day, in the same run.
 */
function carsToHold(
  building: ResolvedBuilding,
  wanted: number,
  withheld: string[],
  eventName: string,
): readonly string[] {
  const choice = carsToDerate(building, wanted);
  if (choice.shortfall > 0) {
    withheld.push(
      `${eventName}: asked for ${String(wanted)} car(s) out of service and could hold ` +
        `${String(wanted - choice.shortfall)}. Every bank keeps at least one car in service — a bank ` +
        'with none is a set of floors nobody can reach, which is a different scenario rather than a ' +
        'busier one.',
    );
  }
  return choice.held.map((car) => `${car.bankId}-${car.carId}`);
}
