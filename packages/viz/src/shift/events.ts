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

import { carsToDerate, type BankedBuilding, type CarRef, type Incident } from './incidents.js';
import type { EventEffect, ShiftEvent, ShiftEventId } from './types.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import { composeWrinkle, drawWrinkle } from '../wrinkles/draw.js';
import type { WrinkleEffect } from '../wrinkles/types.js';

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

/**
 * The mix while a coach party unloads: the lobby fills with people going up.
 *
 * The up-peak's own shape — `data/traffic-profiles.json` authors the office morning at roughly this
 * incoming share — so the coach party is *the morning rush arriving at a hotel* rather than a mix
 * this file made up. Not `1.0` incoming, because the guests already upstairs do not stop moving.
 */
const COACH_SPLIT: DirectionalSplit = Object.freeze({
  incoming: 0.8,
  outgoing: 0.1,
  interfloor: 0.1,
});

/**
 * Where in the run the red-tagged car goes, as a fraction of its length — *"this morning"*.
 *
 * Three tenths rather than the start, so the player sees the building whole before it loses a car
 * and the loss is a thing that happens on the stage rather than a fact about the day's fabric. A
 * fraction for `EventEffect.derate`'s own reason: a shift is 15 to 120 minutes and a clock time
 * would name an hour most shifts do not contain.
 */
export const BREAKDOWN_AT_FRACTION = 0.3;

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
 * Every wrinkle in the library, keyed by id — **built from `data/wrinkles.json`**, not authored
 * here.
 *
 * This was a frozen object literal of seven events until GitHub issue **#159**, and
 * `GAMEPLAY_AND_NAVIGATION.md` § 17 is why it is not one now:
 *
 * > the wrinkle library must be data so a day is a row rather than code
 *
 * The names and notes of the original five are still the design's own (`design.html` :1419–1426),
 * verbatim except where a caption named something the run does not contain — the fire drill's
 * *"14:00"* (§ D175), the ordinary day's *"Tuesday"* and its second person. Those deviations moved
 * into the library's rows with the text; nothing was re-argued, and `events.test.ts` still holds the
 * weekday rule against every entry rather than against the one that broke it.
 *
 * **What replaced the compile error.** A `Record<ShiftEventId, ShiftEvent>` made a missing effect a
 * type error, which was the only reason the answer to *what does this do to the run* stayed one
 * somebody gave. A library loaded from data cannot make that promise to the type system, so it is
 * made to the loader instead: `wrinkles/parse.ts` refuses a document whose effect fields disagree
 * with its own `changesNothing`, and refuses one missing any id shipped code names as a literal.
 * The check is the same check; it fails at startup rather than at `tsc`, loudly and with a list.
 *
 * **Keyed by template id, not by drawn id.** A drawn wrinkle composes its template's id with the
 * axis values it chose (`shaft-out:morning`), and this table holds the *template*, with each axis
 * at its base effect. That is what `SHIFT_EVENTS[booked]` needs: a calendar books
 * `move-in`, not one particular window of it.
 *
 * **Typed by {@link ShiftEventId} although it holds every template**, which is deliberate and is
 * the division of labour between this constant and the library. Code that names an id *as a
 * literal* — a calendar booking, the campaign's two draws — indexes this table and gets a
 * `ShiftEvent` rather than a `ShiftEvent | undefined`, because `REQUIRED_TEMPLATE_IDS` refuses at
 * load time a library missing any of those seven. Code that wants *any* wrinkle does not come here
 * at all: it asks `wrinkles/draw.ts`. Typing the table by the wider key would have made every one
 * of those literal lookups optional at twenty call sites, to express a possibility the loader has
 * already ruled out.
 */
export const SHIFT_EVENTS = Object.freeze(
  Object.fromEntries(
    WRINKLE_LIBRARY.templates.map((template) => [
      template.id,
      Object.freeze({
        id: template.id,
        name: template.name,
        /* The base note with every axis rendered at its first value, so a booked template reads
         * as a sentence rather than as a sentence with a `{window}` in it. */
        note: composeWrinkle(
          template,
          template.axes.map((axis) => axis.values[0] as (typeof axis.values)[number]),
        ).note,
        effect: effectOfWrinkle(template.effect),
      } satisfies ShiftEvent),
    ]),
  ),
) as Readonly<Record<ShiftEventId, ShiftEvent>>;

/**
 * A library effect, plus the `writes` list `EventEffect` carries.
 *
 * `writes` is **derived** rather than authored — see `wrinkles/types.ts#WrinkleEffect`. A template
 * that declared its own could disagree with its own effect, and `events.test.ts` cross-checks the
 * struct against the patch, so the disagreement would be a test failure about a field a human
 * typed. Derived, it cannot happen.
 */
function effectOfWrinkle(effect: WrinkleEffect): EventEffect {
  const writes: string[] = [];
  if (effect.arrivalRateMultiplier !== null) writes.push('demand.arrivalRatePctPop5min');
  if (effect.directionalSplit !== null) writes.push('demand.directionalSplit');
  if (effect.derate !== null) writes.push('serviceEvents');
  if (effect.carsOutOfService > 0) writes.push('outOfServiceCarIds');
  return Object.freeze({
    changesNothing: effect.changesNothing,
    arrivalRateMultiplier: effect.arrivalRateMultiplier,
    directionalSplit: effect.directionalSplit,
    carsOutOfService: effect.carsOutOfService,
    derate: effect.derate === null ? null : Object.freeze({ ...effect.derate }),
    writes: Object.freeze(writes),
  });
}

/**
 * The wrinkle a recorded id names, or `undefined` if the library no longer holds it.
 *
 * Takes a **drawn** id as well as a template one: `shaft-out:morning` resolves to `shaft-out`, at
 * that template's base effect. That is the right answer for the two callers — a campaign day
 * rebuilding its run from a stored id, and a test asserting what a day drew — because both want
 * *which wrinkle was this*, and neither re-runs the axis choice.
 *
 * Returns `undefined` rather than throwing, and the reason is that ids are data now: a saved day
 * can name a template a later library dropped, and a caller that has to handle a missing wrinkle is
 * a caller that will not crash a returning player's history.
 */
export function eventById(id: string): ShiftEvent | undefined {
  const direct = (SHIFT_EVENTS as Readonly<Record<string, ShiftEvent | undefined>>)[id];
  if (direct !== undefined) return direct;
  const templateId = id.split(':')[0] ?? '';
  return (SHIFT_EVENTS as Readonly<Record<string, ShiftEvent | undefined>>)[templateId];
}

/**
 * The day's event — now § 17's rotation draw rather than a modulo-five rota.
 *
 * It was five `if`s over `day % 5`, which could not express any of § 17's three rotation rules and
 * reached five of the twenty-five wrinkles the library now holds. `wrinkles/draw.ts` owns the
 * choosing and states which of the three rules it can keep and which waits on a tower draw that
 * does not exist yet.
 *
 * Still pure and total in `(day, dayIdx)`, which is the property `scheduledEventFor` promises its
 * eleven callers and the one `briefView.ts` relies on when it says two players on day 3 meet the
 * same wrinkle.
 */
export function eventFor(day: number, dayIdx: number): ShiftEvent {
  const drawn = drawWrinkle(WRINKLE_LIBRARY, day, dayIdx);
  return { id: drawn.id, name: drawn.name, note: drawn.note, effect: effectOfWrinkle(drawn.effect) };
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

  /*
   * **Which cars go out is {@link eventCarChoice}'s, and the sentences about it are this
   * function's.** The refusals below are the ones that used to be pushed inline; the wording did not
   * move, only the branch that decides which one applies — see that function for why a second caller
   * needs the decision without the prose.
   */
  const { derate } = effect;
  const cars = eventCarChoice(effect, input.building);

  if (cars.holdShortfall > 0) {
    withheld.push(
      `${input.event.name}: asked for ${String(effect.carsOutOfService)} car(s) out of service and ` +
        `could hold ${String(effect.carsOutOfService - cars.holdShortfall)}. Every bank keeps at ` +
        'least one car in service — a bank with none is a set of floors nobody can reach, which is a ' +
        'different scenario rather than a busier one.',
    );
  }
  if (cars.derateRefusedForHold) {
    withheld.push(
      `${input.event.name}: this event both holds a car for the whole shift and schedules one to ` +
        'return, and the two would pick the same car. The window was not applied.',
    );
  }
  if (derate !== null && cars.derateShortfall > 0) {
    withheld.push(
      `${input.event.name}: asked to stand ${String(derate.cars)} car(s) down for part of ` +
        `the shift and could stand ${String(derate.cars - cars.derateShortfall)}. Every bank ` +
        'keeps at least one car in service — a bank with none is a set of floors nobody can reach.',
    );
  }

  const incidents: readonly Incident[] =
    derate === null
      ? []
      : cars.derateCars.map((car) => ({
          kind: 'maintenance' as const,
          car,
          fromFraction: derate.fromFraction,
          toFraction: derate.toFraction,
        }));

  return { demand, outOfServiceCarIds: cars.holdCars.map(carRuntimeId), incidents, withheld };
}

/* -------------------------------------------------------------------------- *
 * Which cars the event takes — one implementation, two callers
 * -------------------------------------------------------------------------- */

/**
 * The cars today's event takes out of passenger service, and in which of the two ways.
 *
 * **Extracted from {@link shiftRunPatch}'s own body — the choices did not move, only the sentences
 * that describe them did** — because a second caller needs the same answer and cannot afford the
 * rest of the patch. `scope/runIdentity.ts` decides *does today reserve a goods car?* against a
 * commissioned building and has no traffic profile, no demand base and no resolved fabric; before
 * this it had no way to ask which cars were already taken, and answered as though none were.
 *
 * That is the same shape as GitHub issue #272 itself, which is why this is a shared function rather
 * than a second copy of the branch: the defect was two sites answering *which cars are taken?* and
 * only one of them being right. A third site would have been the next one.
 *
 * The refusals stay in {@link shiftRunPatch}, because they are prose addressed to a player and this
 * has no event name to put in them. What lives here is only the decision each refusal is about.
 *
 * **The order itself is still `incidents.ts#carsToDerate`'s and is stated there** — this absorbed
 * the docstring of the `carsToHold` wrapper it replaces, and the two reasons are unchanged:
 * deterministic, because a random draw outside the injected `StreamSet` breaks common random numbers
 * (invariant 2) and would make two shifts of the same day incomparable; and never the last car in a
 * bank, because a bank with none is a set of floors nobody can reach, which is a different scenario
 * rather than a busier one. A whole-shift hold is a runtime id because `recordRun` matches on
 * `${bankId}-${carId}`, and a window stays a {@link CarRef} because a `serviceEvents` entry names a
 * bank and a car separately.
 */
export interface EventCarChoice {
  /**
   * Cars held for the **whole shift**, which `shiftRunPatch` maps to the runtime ids
   * `RecordRunOptions.outOfServiceCarIds` matches on.
   *
   * {@link CarRef} rather than those ids, and that is not a style choice: `${bankId}-${carId}` is
   * the one expression in `shift/` that `honesty/derive.test.ts`'s two-adjacent-words scanner reads
   * as prose, so a **new export** containing it becomes an unclassified text producer and turns that
   * suite red. The two declarations that may hold it — `calendar.ts`'s private `carRuntimeId` and
   * `shiftRunPatch` — are already classified, and both reach it the way they always did. Keeping the
   * refs here is what lets this function be shared without moving a classification.
   */
  readonly holdCars: readonly CarRef[];
  /** How many of `carsOutOfService` could not be held, because a bank keeps a car. */
  readonly holdShortfall: number;
  /** Cars away for **part** of the run, for `incidents.ts#withIncidents`. */
  readonly derateCars: readonly CarRef[];
  /** How many of `derate.cars` could not be stood down. */
  readonly derateShortfall: number;
  /**
   * The event declared **both** a whole-shift hold and a window, so the window was dropped.
   *
   * The two pick from the same building by the same total order and would take the same car out
   * twice, producing a car that is held and also scheduled to return. No shipped event does this;
   * the flag exists so the refusal is a decision rather than an inline `if`.
   */
  readonly derateRefusedForHold: boolean;
}

export function eventCarChoice(effect: EventEffect, building: BankedBuilding): EventCarChoice {
  const none: EventCarChoice = {
    holdCars: Object.freeze([]),
    holdShortfall: 0,
    derateCars: Object.freeze([]),
    derateShortfall: 0,
    derateRefusedForHold: false,
  };
  if (effect.changesNothing) return none;

  const holds =
    effect.carsOutOfService > 0
      ? carsToDerate(building, effect.carsOutOfService)
      : { held: [] as readonly CarRef[], shortfall: 0 };
  const held = { ...none, holdCars: holds.held, holdShortfall: holds.shortfall };

  if (effect.derate === null) return held;
  if (holds.held.length > 0) return { ...held, derateRefusedForHold: true };

  const choice = carsToDerate(building, effect.derate.cars);
  return { ...held, derateCars: choice.held, derateShortfall: choice.shortfall };
}

/**
 * The id `Simulation` gives a car at run time, and the one `RecordRunOptions.outOfServiceCarIds` is
 * matched on.
 *
 * **Private, and there is a second copy in `calendar.ts` that must stay private too** — GitHub issue
 * #272 first tried to consolidate the two into one exported helper on `incidents.ts`, and that is
 * the change to *not* make. `honesty/derive.test.ts` derives its surface set from the source tree,
 * and `${bankId}-${carId}`'s hyphen reads to the two-adjacent-words scanner as a phrase, so the
 * declaration holding this expression is a **text producer**. Exporting it created an unclassified
 * one and, worse, emptied the chain `NOT_PLAYER_FACING` cites by name for
 * `shift/calendar.ts#calendarAsks` — turning a live exclusion into a ghost and that suite red in
 * three places.
 *
 * Two private copies of a five-character expression, each inside a declaration that is already
 * classified, is the cheaper arrangement. What must not be duplicated is *which cars are taken* —
 * {@link eventCarChoice} owns that, and it returns {@link CarRef}s precisely so it can be shared
 * without carrying this string.
 */
function carRuntimeId(car: CarRef): string {
  return `${car.bankId}-${car.carId}`;
}
