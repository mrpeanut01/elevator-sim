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
 * ## What each wrinkle writes
 *
 * **Twenty-five rows now, and the table below is the seven the code still names.** § 17's library
 * lives in `data/wrinkles.json` since GitHub issue #159, so this is no longer the list of what a
 * day can be — it is the list `SHIFT_EVENT_IDS` types, which is the calendar's bookings and the
 * campaign's two draws. `wrinkles/` owns the rest.
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
 * `carsOutOfService` remains, is `0` on every row of the library, and is **not** dead: it is the right
 * instrument for *"this car is not in the building today"*, `shiftRunPatch` still maps it, and
 * `events.test.ts` still drives it. An event that wants a whole-shift hold declares one.
 */

import {
  resolveDemandTemplate,
  type DemandLevel,
  type DemandTemplate,
  type DirectionalSplit,
  type ResolvedBuilding,
  type SimulationDemandOptions,
  type TrafficProfile,
} from '@elevator-sim/core/browser';

import { carsToDerate, type BankedBuilding, type CarRef, type Incident } from './incidents.js';
import type { EventEffect, ShiftEvent, ShiftEventId } from './types.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import { composeWrinkle, drawWrinkle, type DrawHorizon } from '../wrinkles/draw.js';
import type { WholeDayEpisode, WrinkleEffect } from '../wrinkles/types.js';

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
 * The wrinkle effects the library is built from
 * -------------------------------------------------------------------------- */

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
    WRINKLE_LIBRARY.templates.map((template) => {
      /* The base note with every axis rendered at its first value, so a booked template reads
       * as a sentence rather than as a sentence with a `{window}` in it. */
      const composed = composeWrinkle(
        template,
        template.axes.map((axis) => axis.values[0] as (typeof axis.values)[number]),
      );
      return [
        template.id,
        Object.freeze({
          id: template.id,
          name: template.name,
          note: composed.note,
          /*
           * The base effect, as before, with the **composed** whole-day placement — § D1057. Its
           * note names `{episode}` and the axes, so it is only a sentence once composed, and the
           * first axis values are the ones the note above was composed at.
           */
          effect: { ...effectOfWrinkle(template.effect), wholeDay: composed.effect.wholeDay ?? null },
        } satisfies ShiftEvent),
      ];
    }),
  ),
) as Readonly<Record<ShiftEventId, ShiftEvent>>;

/**
 * When a campaign breakdown takes its car, as a fraction of the run.
 *
 * **Read off the library rather than restated — GitHub issue #159.** It was the literal `0.3`, and
 * `campaign/incidents.ts` computes the dock's *"back at"* caption from it while the run's actual
 * derate comes from `data/wrinkles.json`'s `breakdown.effect.derate.fromFraction`. Two sources for
 * one fact: editing the JSON moved the run and left the caption where it was, and
 * `campaign/incidents.test.ts` asserted the constant against itself so nothing could catch it.
 * Deriving it makes the disagreement unrepresentable — but only because `wrinkles/parse.ts` refuses
 * a `breakdown` without a derate. The first draft of this derivation ended `?? 0.3`, which put the
 * literal back the moment the library stopped carrying the window, and review caught it. Same move
 * `effectOfWrinkle` makes for `writes`, with the load-time check that makes it true.
 */
export const BREAKDOWN_AT_FRACTION: number = breakdownAtFraction();

function breakdownAtFraction(): number {
  const derate = SHIFT_EVENTS.breakdown.effect.derate;
  /*
   * Throws rather than defaulting. A `?? 0.3` here reinstated the second source of truth this
   * constant was derived to remove — silently, and exactly when the library stopped agreeing with
   * it — which review found one commit after the derivation landed. `wrinkles/parse.ts` refuses a
   * `breakdown` with no derate at load, so this is unreachable; it is the assertion that says so.
   */
  if (derate === null) {
    throw new Error(
      'data/wrinkles.json: template breakdown declares no derate, so there is no fraction to read.',
    );
  }
  return derate.fromFraction;
}

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
    wholeDay: effect.wholeDay ?? null,
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
  /*
   * `Object.hasOwn` rather than a bare index. `SHIFT_EVENTS` is built with `Object.fromEntries`, so
   * it carries `Object.prototype`: `SHIFT_EVENTS['constructor']` is the `Object` function and
   * `['toString']` is a function, neither of them `undefined`. `persist/validate.ts` accepts a
   * restored day's `eventId` on exactly this predicate, so without the guard a session could name
   * `constructor` as its wrinkle and be admitted. The `isOneOf` this replaced used
   * `Array.includes` and had no such hole; found in review.
   */
  const own = (key: string): ShiftEvent | undefined =>
    Object.hasOwn(SHIFT_EVENTS, key)
      ? (SHIFT_EVENTS as Readonly<Record<string, ShiftEvent>>)[key]
      : undefined;
  return own(id) ?? own(id.split(':')[0] ?? '');
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
export function eventFor(day: number, dayIdx: number, horizon: DrawHorizon = 'period'): ShiftEvent {
  const drawn = drawWrinkle(WRINKLE_LIBRARY, day, dayIdx, horizon);
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

/**
 * **Whether a demand template varies the directional mix within the run** — asked of `core`
 * rather than of a list, GitHub issue #593.
 *
 * ## The defect this exists to end
 *
 * `core`'s `planDemand` refuses an explicit `directionalSplit` beside a template whose resolved
 * form carries a `meanDirectionalSplit`, and it throws rather than let one of them win silently. The
 * viewer had **two** answers to *does this template vary the mix?*, and neither was that one:
 *
 * - the event path in `dev/state.ts#shiftRunConfigOf` asked `demandTemplate === 'lunch-two-way'`,
 *   a list of one; and
 * - `shift/calendar.ts`'s bias decision asked whether the record declares
 *   `directionalSplitAtStart`, which is how a **shape** template varies the mix and not how a
 *   **phase-list** one does.
 *
 * `office-day` is a phase list whose every phase declares a mix, so `core` resolves it with a
 * `meanDirectionalSplit` and both answers said *no*. It is the whole-day template thirteen of the
 * sixteen contracts run in Scenario (`shift/dayLength.ts#wholeDayFor`), so every day that drew a
 * wrinkle with a mix of its own — a fire drill, a conference, a coach party, eleven more in
 * `data/wrinkles.json` — built a config `core` refused. The refusal went to a worker, the worker's
 * failure went to the Engineer transport's error line under the Everyday cover, and the stage said
 * *simulating today's day* for as long as anybody waited. Two assessors found it on day 3.
 *
 * ## Why `resolveDemandTemplate` and not a third reading of the record
 *
 * `planDemand` branches on `resolveDemandTemplate(id, templates).meanDirectionalSplit`, so that is
 * the question asked here, through the same function, with the same arguments. A third reading
 * of the record's fields would agree today and be the next list of one the day a template gains a
 * new way to vary its mix. No overrides are passed: the viewer's only override on a shift is
 * `durationS`, which refits the geometry and never adds or removes a mix, and a window selects
 * phases with their mixes intact (`demandTemplate.ts#windowTemplate`'s own spread-or-omit).
 *
 * An id `core` cannot resolve answers `false`. Such a run fails in `core` on the id itself, with
 * that id's own sentence, and naming a mix it cannot see would put a second, wrong reason beside it.
 *
 * Callers: `dev/state.ts#shiftRunConfigOf` (the event path) and `shift/calendar.ts`'s bias decision
 * (the period path) — the two paths #593 found disagreeing, now one expression.
 */
export function demandTemplateVariesMix(
  templateId: string,
  templates: readonly DemandTemplate[],
): boolean {
  try {
    return resolveDemandTemplate(templateId, templates).meanDirectionalSplit !== undefined;
  } catch {
    return false;
  }
}

/**
 * **What a wrinkle that asks for a mix does on a day whose template keeps its own** — one sentence,
 * the brief's, the report header's and the overnight beat's ([§ D1040](../../../../DECISIONS.md)).
 *
 * The post-AH panel's A.md defect 5: the fire drill's brief said *"Twenty minutes where the whole
 * building wants to be in the lobby at once"*, and on a whole authored day the run made an all-day
 * rise in demand with the day's own mix — 165 people standing in the car park at nine. The only
 * account of that was on the *previous* day's report, in the engine's words (*"The engine refuses
 * both at once rather than letting one win silently"*). `core` refuses an explicit split beside a
 * template that varies the mix, so the mix is the template's and the level is all that moves
 * ({@link shiftRunPatch}); this says so in the player's words and is the one place that does.
 *
 * **Nothing about the run changes here** — which half wins is `core`'s rule, and making the drill
 * reach the mix on a whole day is a separate decision. What changes is that the sentence describes
 * the run the player gets. A wrinkle that moves only the mix moves **nothing** on such a day, and
 * the sentence says that too, because a caption over an ordinary day naming a conference is the
 * caption-that-does-not-describe-the-picture defect this module was written against.
 */
export function mixKeptSentenceOf(event: ShiftEvent): string {
  const factor = event.effect.arrivalRateMultiplier;
  const what = `the ${event.name.charAt(0).toLowerCase()}${event.name.slice(1)}`;
  if (factor === null || factor === 1) {
    return (
      `This tower's day keeps its own mix of trips, which changes through the day, and the mix is ` +
      `the only thing ${what} would have moved — so the run is an ordinary day.`
    );
  }
  return (
    `This tower's day keeps its own mix of trips, which changes through the day, so ${what} ` +
    `changes how many people travel and not where they go: ${factor > 1 ? 'more' : 'fewer'} of ` +
    'them, all day.'
  );
}

/**
 * **The episode a whole authored day splices in for this event**, or `undefined` where it has none
 * — [§ D1057](../../../../DECISIONS.md).
 *
 * Only an event that sets a mix has one: its placement is where that mix sits in the day. A refused
 * placement answers `undefined`, and so does an event with no placement at all (a hand-built event
 * in a test, or one the loader has not seen), which leaves § D1040's sentence standing for it.
 *
 * The one predicate for *is this wrinkle spliced on a whole day*: `dev/state.ts#shiftRunConfigOf`
 * splices on it and {@link eventAsRun} words the note on it, so the run and the sentence cannot
 * disagree about which days carry an episode.
 */
export function wholeDayEpisodeOf(event: ShiftEvent): WholeDayEpisode | undefined {
  const placed = event.effect.wholeDay;
  if (event.effect.changesNothing || event.effect.directionalSplit === null) return undefined;
  return placed?.kind === 'episode' ? placed : undefined;
}

/**
 * The event as the run will have it — [§ D1040](../../../../DECISIONS.md), amended by
 * [§ D1057](../../../../DECISIONS.md).
 *
 * - On a **whole authored day** where the event has an episode ({@link wholeDayEpisodeOf}), its note
 *   is the placement's: the clock window and what changes inside it, composed from the numbers the
 *   splice writes. The mix is real on that day, so § D1040's *withheld* sentence is not drawn.
 * - On any other run whose template keeps its own mix and the event asked for one — a part of a
 *   day, `lunch-two-way`, or a whole day for an event with no episode — the note is
 *   {@link mixKeptSentenceOf}'s, because the mix was withheld there.
 * - Everywhere else, the event itself.
 *
 * `templateVariesMix` is {@link demandTemplateVariesMix}'s answer for the run and `wholeDayRun`
 * whether the run is the whole authored day (`dev/state.ts#PlannedDay.wholeDayRun`), the same two
 * questions {@link shiftRunPatch}'s caller asks before it splices or withholds.
 */
export function eventAsRun(
  event: ShiftEvent,
  templateVariesMix: boolean,
  wholeDayRun = false,
): ShiftEvent {
  if (!templateVariesMix || event.effect.changesNothing || event.effect.directionalSplit === null) {
    return event;
  }
  const episode = wholeDayRun ? wholeDayEpisodeOf(event) : undefined;
  if (episode !== undefined) return { ...event, note: episode.note };
  return { ...event, note: mixKeptSentenceOf(event) };
}

export interface ShiftRunPatchInput {
  readonly event: ShiftEvent;
  /** The building the shift is running — grown, if `grownBuilding` has been applied. */
  readonly building: ResolvedBuilding;
  readonly base: ShiftDemandBase;
  /**
   * Whether this run's demand template varies the directional mix within the run —
   * {@link demandTemplateVariesMix}'s answer, which is `core`'s.
   *
   * `core` **refuses** the combination: a template that varies the mix and an explicit
   * `directionalSplit` would each have to win silently, so `generateTrace` throws rather than
   * resolve it. An event that wanted to swing the mix under such a template therefore cannot, and
   * says so in {@link ShiftRunPatch.withheld} rather than producing a config that throws at run
   * time. Default `false`; the one shipped caller that builds a run always passes it.
   *
   * **The default used to be described as true of every template the viewer runs, and it stopped
   * being true when `office-day` became Scenario's day** — GitHub issue #593. `lunch-two-way` and
   * `endless-rush` vary the mix too, and so does `office-day`.
   */
  readonly templateVariesMix?: boolean | undefined;
  /**
   * The cars the **tower's own schedule** takes out today — `shift/ladder.ts#rungIncidents` for the
   * week's rung, [§ D1038](../../../../DECISIONS.md). Spoken for: the day's wrinkle takes another
   * car rather than one the tower already has out over the same stretch. `undefined` is none.
   */
  readonly booked?: readonly Incident[] | undefined;
  /**
   * **The run splices this event's episode into its own day** — [§ D1057](../../../../DECISIONS.md).
   * Set by `dev/state.ts#shiftRunConfigOf` exactly when it writes {@link wholeDayEpisodeOf}'s
   * placement into the run's copy of the day. The mix then travels in the template, so no
   * `directionalSplit` is written and nothing is withheld; and the run-wide multiplier, authored for
   * a slice where the run roughly is the event, is **not** applied — the episode carries the level.
   * A placement that states a lighter whole day (`dayRateMultiplier`) writes that instead.
   */
  readonly spliced?: boolean | undefined;
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

  const episode = input.spliced === true ? wholeDayEpisodeOf(input.event) : undefined;
  const rateMultiplier =
    episode === undefined ? effect.arrivalRateMultiplier : episode.dayRateMultiplier;
  if (rateMultiplier !== null) {
    demand.arrivalRatePctPop5min = Math.min(
      MAX_ARRIVAL_RATE_PCT_POP_5MIN,
      input.base.ratePctPop5min * rateMultiplier,
    );
  }

  if (effect.directionalSplit !== null && episode === undefined) {
    if (input.templateVariesMix === true) {
      /*
       * The player's words for `core`'s refusal — § D1040. This read *"the directional mix is set by
       * this run's demand template … The engine refuses both at once rather than letting one win
       * silently"*, on the day before the one it described, and was the only place that said so.
       */
      withheld.push(`${input.event.name}: ${mixKeptSentenceOf(input.event)}`);
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
  const cars = eventCarChoice(effect, input.building, input.booked ?? []);

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
        'keeps at least one car in service — a bank with none is a set of floors nobody can reach.' +
        /*
         * § D1038: the tower's own booking is the other half of why, where it took a car the
         * wrinkle could otherwise have had — said, because the brief names that booking too.
         */
        (cars.derateSpokenFor > 0
          ? ' The tower has its own car booked out over the same stretch, and that car is not the day’s to take.'
          : ''),
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
   * How many of the cars the derate would have taken with nothing booked are ones the tower books
   * over an overlapping stretch — so the choice moved, or fell short, because of the booking.
   * [§ D1038](../../../../DECISIONS.md). `0` with nothing booked.
   */
  readonly derateSpokenFor: number;
  /**
   * The event declared **both** a whole-shift hold and a window, so the window was dropped.
   *
   * The two pick from the same building by the same total order and would take the same car out
   * twice, producing a car that is held and also scheduled to return. No shipped event does this;
   * the flag exists so the refusal is a decision rather than an inline `if`.
   */
  readonly derateRefusedForHold: boolean;
}

export function eventCarChoice(
  effect: EventEffect,
  building: BankedBuilding,
  /*
   * **The tower's own bookings are spoken for** — [§ D1038](../../../../DECISIONS.md), the week
   * swarm's ruling S1 § 1 on the post-AH panel's N5. Midtown's Tuesday `move-in:middle` (a window
   * § D1180 has since moved off the lunch peak, as `move-in:past-halfway`) picked car D by this
   * function's total order, and the rung already books car D out 10:30–13:00; the two
   * schedules collapsed into the rung's, so the run was identical to an ordinary Tuesday on all 95
   * configurations the swarm measured while the brief promised a car tied up through the middle of
   * the shift. A whole-shift hold skips every booked car; a window skips every booked car where the
   * building can spare another, and otherwise a booked car whose window overlaps its own (§ D1180).
   * What is left is chosen by the same order, and a building that cannot spare a
   * car reports the shortfall, which {@link shiftRunPatch} words. `calendarPatch` passes the same
   * list, so the goods car it reserves around the day's choice is reserved around this one.
   */
  booked: readonly Incident[] = [],
): EventCarChoice {
  const none: EventCarChoice = {
    holdCars: Object.freeze([]),
    holdShortfall: 0,
    derateCars: Object.freeze([]),
    derateShortfall: 0,
    derateSpokenFor: 0,
    derateRefusedForHold: false,
  };
  if (effect.changesNothing) return none;

  const holds =
    effect.carsOutOfService > 0
      ? carsToDerate(withoutCars(building, booked.map((entry) => entry.car)), effect.carsOutOfService)
      : { held: [] as readonly CarRef[], shortfall: 0 };
  const held = { ...none, holdCars: holds.held, holdShortfall: holds.shortfall };

  const { derate } = effect;
  if (derate === null) return held;
  if (holds.held.length > 0) return { ...held, derateRefusedForHold: true };

  const overlapping = booked
    .filter((entry) => entry.fromFraction < derate.toFraction && derate.fromFraction < entry.toFraction)
    .map((entry) => entry.car);
  /*
   * **A car the tower books is spoken for all day wherever the building can spare another** —
   * [§ D1180](../../../../DECISIONS.md), carrying out § D1038's own title (*a day's own car is never
   * also the tower's*). Its body skipped a booked car only over an overlapping stretch, and while
   * every shipped window met the rung's booking the two readings could not part. § D1180 moved
   * Midtown's Tuesday move-in to 0.55–0.8, clear of car D's 0.25–0.5, and the overlap rule then
   * gave the move-in car D: out at 10:30, back at 13:00, out again at 13:30. The run was right and
   * the words were not — `bookedOut.ts#carAbsencesOf` reads one absence a car, so the brief called
   * the rung's morning *the car it takes*. So a window first skips every booked car, and falls back
   * to the overlap rule only where that leaves it short, which keeps every shortfall exactly where
   * it was.
   */
  const apart = carsToDerate(withoutCars(building, booked.map((entry) => entry.car)), derate.cars);
  const choice = apart.shortfall === 0 ? apart : carsToDerate(withoutCars(building, overlapping), derate.cars);
  const unbooked = carsToDerate(building, derate.cars);
  return {
    ...held,
    derateCars: choice.held,
    derateShortfall: choice.shortfall,
    derateSpokenFor: unbooked.held.filter((car) =>
      overlapping.some((taken) => taken.bankId === car.bankId && taken.carId === car.carId),
    ).length,
  };
}

/** The building with these cars left out of their banks — spoken for, so no rule may pick them. */
function withoutCars(building: BankedBuilding, cars: readonly CarRef[]): BankedBuilding {
  if (cars.length === 0) return building;
  const taken = new Set(cars.map((car) => JSON.stringify([car.bankId, car.carId])));
  return {
    banks: building.banks.map((bank) => ({
      ...bank,
      cars: bank.cars.filter((car) => !taken.has(JSON.stringify([bank.id, car.id]))),
    })),
  };
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
