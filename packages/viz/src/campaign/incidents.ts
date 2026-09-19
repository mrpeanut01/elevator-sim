/**
 * **What happens to a campaign day, and what the dock can do about it** — GAMEPLAY § 7.5, § 8.11;
 * GitHub issues #171 and #169 item 1; § D507.
 *
 * Two halves, and they are separated on purpose.
 *
 * ## Choosing the day's event — {@link campaignEventFor}
 *
 * § 8.11: *"Incidents arrive from the building, not from performance."* A campaign day's event is
 * one of `shift/events.ts#SHIFT_EVENTS`, chosen here and nowhere else:
 *
 * 1. the contract's calendar first (`campaign/calendar.ts`) — an authored day is never overwritten
 *    by a draw, because the building told you in advance;
 * 2. otherwise a draw against § 8.3's daily failure odds, `economy.ts#failureOddsPct`, and a
 *    breakdown if it lands;
 * 3. otherwise a draw for **the building's own day** — GitHub issue **#564** — over
 *    `data/wrinkles.json`'s weekday pool at the share that document declares;
 * 4. otherwise an ordinary day.
 *
 * **Stage 3 is the whole of issue #564 and stage 2 is deliberately unmoved.** A freshly serviced
 * building rolling 0.4 % a day is § 8.3's own figure and it is right; what was wrong is that a
 * breakdown was the only thing a career day could be, so ten quiet days in a row was the *most
 * likely* outcome rather than a symptom. {@link CAMPAIGN_DAY_EVENT_SHARE_PCT} carries the
 * arithmetic over a twenty-day contract, and {@link careerDaySeedFor} is the other half of the
 * same morning — GitHub issue **#563**, the seed that had no writer.
 *
 * **The draw is on a named stream derived from the day's own seed** — CLAUDE.md invariant 2, and
 * the exact gap `career.ts`'s module note recorded for two waves: *"there is no named RNG stream
 * for a campaign day"*. There is now. It is derived with `core`'s `deriveStreamSeed` under
 * {@link CAMPAIGN_INCIDENT_STREAM} plus the contract and the day, so two campaign days on one seed
 * draw independently, and it is **not** one of the run's `StreamSet` streams: drawing from
 * `policyNoise` before the run would shift every stochastic dispatcher's sequence and quietly break
 * common random numbers on a day the player never touched.
 *
 * The week's rota (`events.ts#eventFor`) is not consulted. A campaign day used to inherit whatever
 * the *week's* calendar said for `state.week.day`, so a contract's day 3 ran a move-in because the
 * player's week happened to be on a Wednesday. § D507 makes a campaign day the campaign's.
 *
 * ## Describing it for the dock — {@link campaignIncidentOf}
 *
 * The dock wants a title, a note, the clock it happens at, and *"options as radio rows carrying
 * cost and when it takes effect"* (§ 7.5). **Every day that changes the run gets one**, and an
 * `ordinary` day — the one template that declares `changesNothing` — produces `undefined`, which
 * the dock draws as a day with nothing happening rather than as an incident with no options.
 *
 * That gate used to be a list of two ids and it stopped being right on the commit that gave a
 * career day the weekday pool (#564): a dock reading **NOTHING HAPPENING** over a morning with a
 * car tied up is the caption defect `shift/events.ts` is written about. The red tag and the booked
 * crowd keep their own authored arms; {@link buildingsDayIncident} words the rest from the event
 * itself and offers only options whose effect the run will actually reach.
 *
 * **Every option's effect is real or the option is not offered.** The design file's `outage` and
 * `event` option sets include a technician, a marshal in the lobby, a temporary handover and a
 * zoning change. Of those, what an `answer-incident` entry can carry is a service event (`core`'s
 * arm carries `serviceEvents` and nothing else — a car's mode, a bank's range or a car's rated
 * load, § D523), so the options here are the ones a service event can honestly express: bring the
 * red-tagged car back, or bring back the car tonight's works are holding. **The technician brings
 * the car back derated** (§ D524): a car cleared to run after a red tag runs at
 * {@link TECHNICIAN_RETURN_LOAD_FRACTION} of its plated load for the rest of the day, which is what
 * a load-weighing device set conservatively after a fault does, and it is the first shipped writer
 * of a derate event — the standing requirement is *name the non-test caller*, and this is it. The
 * handover and the parking are the stage's own arms one row down,
 * and the dock's footer says so rather than duplicating them as options that would append a
 * different kind of entry. A marshal in the lobby is a person the engine cannot simulate, and an
 * option that charged for one would be a control that writes nothing (§ D219).
 *
 * ## Composing the answer — {@link answerChangeOf}
 *
 * The change is `core`'s `answer-incident` arm: the option's own words for the stamp, and the
 * in-service event the option promises — with the derate beside it when the car comes back rated
 * down — at or after the answer's own second. An option whose car
 * would return after the day ends is **refused with the reason** rather than appended: `core` warns
 * and skips an event past the deadline, and a paid answer whose effect the run never reaches is the
 * same defect as a marshal.
 */

import { Pcg32, deriveStreamSeed } from '@elevator-sim/core/browser';
import type { InterventionChange } from '@elevator-sim/core/browser';

import { BREAKDOWN_AT_FRACTION, SHIFT_EVENTS, eventById, eventCarChoice } from '../shift/events.js';
import type { BankedBuilding, CarRef } from '../shift/incidents.js';
import type { ShiftEvent } from '../shift/types.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import { poolFor } from '../wrinkles/draw.js';

import { calendarEventIdFor } from './calendar.js';
import type { CampaignTower } from './career.js';
import { failureOddsPct } from './economy.js';

/** The stream name the breakdown draw derives from — see the module note. */
export const CAMPAIGN_INCIDENT_STREAM = 'campaign-incident';

/**
 * The stream name the **building's own day** draws from — GitHub issue **#564**.
 *
 * A second label rather than a second draw off {@link CAMPAIGN_INCIDENT_STREAM}, so that changing
 * how often a building has a day of its own cannot move which days the *wear clock* red-tags a
 * car on. Two questions, two streams; sharing one would have made this issue's rebalance a silent
 * re-roll of the answer to the other.
 */
export const CAMPAIGN_DAY_STREAM = 'campaign-day';

/**
 * The stream name a career day's **crowd seed** derives from — GitHub issue **#563**.
 *
 * See {@link careerDaySeedFor}. Third label, same reason as the second: the seed a day is played
 * at, the draw that decides whether a car fails, and the draw that decides whether the building
 * has a day of its own are three independent questions about one morning.
 */
export const CAREER_DAY_SEED_STREAM = 'career-day-seed';

/**
 * The seed a career day's run is built from — GitHub issue **#563**.
 *
 * ## The defect, in one sentence
 *
 * `ViewerState.seed` is born once at boot from the UTC date (`dev/main.ts`, § D729) and the
 * Everyday product had **no writer for it at all**, so ten consecutive career days at one tower
 * were byte-identical: the same seed and the same configuration are the same question, which is
 * the engine working exactly as designed and the mode failing.
 *
 * ## Why this is written onto `ViewerState.seed` rather than `SimulationConfig.trafficSeed`
 *
 * Invariant 5 — *every persisted run record carries its seed, so any run replays exactly* — picks
 * between the two candidates and picks cleanly. `watch/record.ts` already writes `state.seed` and
 * `state.week.day` and restores both, so a **derived seed written onto `state.seed` replays with
 * no schema change**. `SimulationConfig.trafficSeed` is the more expressive seam — it re-rolls the
 * crowd while the machine's own streams stand still, which is *same machine, different Tuesday*
 * exactly — and it exists in `core` and is written by nothing in `packages/viz`. Using it would
 * need a new `WatchRecord` field and a version bump, and `record.ts` refuses a record of another
 * version outright, so every recording a player has already saved would stop loading. A career day
 * is not worth invalidating the library for; the honest cost is that a career day changes the
 * dispatcher's own noise sequence as well as the crowd, which is *a different day* rather than
 * *the same day with different people*, and that is what a career day is supposed to be.
 *
 * ## Pure in its three arguments, and a clock is not one of them
 *
 * Invariant 3's rule is about `core`, and this is `viz` — but `deviceNowMs()` must not appear on
 * this path for a stronger reason than the boundary: a seed that read a clock would make *the day
 * a player replays* a different day from *the day they played*, which is invariant 5 broken from
 * the other end. So the derivation is `(base seed, contract, day)` and nothing else, and
 * `everyday/host.ts` holds the base rather than re-reading the field this writes — a chained
 * derivation would re-roll the crowd on every retry of one day, turning the retry the product's
 * most-used verb into a re-draw.
 *
 * Derived with `core`'s own `deriveStreamSeed`, the same mapping every named stream uses, which is
 * invariant 2's discipline for a draw that is not from the run's `StreamSet`: drawing from
 * `policyNoise` before the run would shift every stochastic dispatcher's sequence and quietly
 * break common random numbers on a day the player never touched.
 */
export function careerDaySeedFor(
  baseSeed: number | bigint,
  contractId: string,
  day: number,
): bigint {
  return deriveStreamSeed(baseSeed, `${CAREER_DAY_SEED_STREAM}:${contractId}:${String(day)}`)
    .initState;
}

/**
 * How often a contract day the calendar and the wear clock both leave alone is a day of its own —
 * **read from `data/wrinkles.json`**, never authored here (GitHub issue **#564**).
 *
 * ## Why a share at all, rather than a raised failure rate
 *
 * The obvious reading of *"nothing ever happens"* is that `economy.ts#FRESH_ODDS_PCT` is too low.
 * It is not: 0.4 % a day on a freshly serviced building is `ENGINE_CONTRACT.md` § 8.3's own figure
 * and it is *right* — a lift that has done no work does not fail, and raising it would make the
 * wear clock, the service interval and the whole shop's relief arithmetic describe a building that
 * breaks for no reason. What was missing is not a higher failure rate; it is that **a breakdown
 * was the only thing a career day could be**. `data/wrinkles.json` already holds eighteen weekday
 * templates — a move-in, contractors upstairs, caterers through the front door, an all-hands, a
 * shift change — every one of them expressed in fields the engine reads, and a career never drew
 * one of them.
 *
 * ## The price, stated as this issue's criterion asks
 *
 * At the shipped **20 %**, over a twenty-day contract. The pool holds **eighteen** weekday
 * templates of which one is `ordinary`, so the rate a player meets is `0.20 × 17/18` = 18.9 % a
 * day rather than the share itself — a distinction worth one line, because quoting the share as
 * the rate would be this docstring disagreeing with its own draw.
 *
 * - **A contract with no calendar entry**: expected **3.79** days of its own, and **98.5 %** of
 *   contracts carry at least one. `1 − (1 − 0.189)^20` = 98.5 %, and the measurement agrees —
 *   200 base seeds, 197 with something. The **1.5 %** that pass with nothing at all are what keep
 *   this an event rather than a chore: a quiet month is possible and is worth noticing.
 * - **A contract with a calendar entry**, which since #564 is every shipped one: `c1`'s measured
 *   mean is **6.22** over the same 200 seeds, and **200 of 200** carry something, because three
 *   of its twenty days are authored (`campaign/calendar.ts`).
 * - Five of the eighteen weekday templates take a car (`move-in`, `shaft-out`, `two-cars-down`,
 *   `contractors`, `lift-service`), so P(at least one car-taking day in twenty) is
 *   `1 − (1 − 0.20 × 5/18)^20` = **68 %**, on top of the wear clock's own breakdowns and whatever
 *   the contract books.
 *
 * Those two measured figures are re-derived by `incidents.test.ts` rather than pinned here as
 * prose, which is this repository's rule about a published number: a rebalance of the share moves
 * the test's own arithmetic with it instead of leaving a sentence nobody re-ran.
 *
 * The upper bound was chosen by what it would cost rather than by taste: at 50 % a player meets
 * ten events in a month and the word stops meaning anything, and at 5 % the expected count is one,
 * which is indistinguishable from the 0.4 % the issue was filed about. 20 % is the setting at
 * which *most* contract days are still the building on its own — which is the mode's premise — and
 * a player who plays a month is certain to have a story from it.
 *
 * **This is a drafted balance figure, not a measurement**, on exactly the footing
 * `data/wrinkles.json`'s own `$comment` puts its effect figures: the arithmetic above is exact and
 * says what the setting *does*, and no run says it is the right setting. § D468's 80 kJ has 400
 * runs behind it because it is a **bar a run is judged against**; this is a draw frequency, which
 * no run can be right or wrong about.
 */
export const CAMPAIGN_DAY_EVENT_SHARE_PCT: number = WRINKLE_LIBRARY.campaignDay.eventSharePct;

/**
 * How long a technician takes to bring a red-tagged car back once called — 20 minutes.
 *
 * An assumption with its reasoning attached rather than a citation: the design file's own `tech`
 * option trades *"lift back Thursday instead of Monday"*, a multi-day scale a single run cannot
 * carry, so the in-run equivalent is a call-out measured against the shift. The car goes at
 * `BREAKDOWN_AT_FRACTION` of the day, so on `c1`'s hour the earliest answer lands the car back at
 * 38 minutes and a player has until 40 minutes to call; on a thirty-minute contract the window is
 * one press wide. The first draft said forty-five minutes and the test that pins the option on the
 * legs found it unreachable on every shipped length — a paid option that could never take effect,
 * which is § D219's defect priced in units — so the figure is what the shipped contracts can hold,
 * and the *too late* refusal below is reachable rather than decorative.
 */
export const TECHNICIAN_CALLOUT_S = 1200;

/** What calling the technician costs — the design file's `tech` option, *"3 u · overtime"*. */
export const TECHNICIAN_UNITS = 3;

/**
 * The share of its plated load a red-tagged car runs at once the technician clears it (§ D524).
 * Three quarters: below the 0.8 design-load factor, so the derate bites on every boarding rather
 * than only at the alarm, and above a half, so the car is still worth bringing back. Applied to
 * the plate in both units, so the resolved event's kilograms and pounds describe one setting.
 */
export const TECHNICIAN_RETURN_LOAD_FRACTION = 0.75;

/** What bringing a works-held car back for the day costs — the design's `zone` figure, 2 u. */
export const BRING_BACK_UNITS = 2;

/**
 * The event a campaign day runs under.
 *
 * `seed` is the career day's base — `everyday/host.ts` holds it, and it is the same base
 * {@link careerDaySeedFor} derives the day's crowd from, **not** the seed that derivation
 * produces. Two questions about one morning, both pure in `(base, contract, day)`: a retry of one
 * day meets the same crowd *and* the same event, which is what makes `WeekState.attempt` mean
 * *this day again* rather than *another day*.
 *
 * ## Three stages, in this order, and the order is the design
 *
 * 1. **The contract's calendar** (`campaign/calendar.ts`) — an authored day is never overwritten
 *    by a draw, because the building told you in advance.
 * 2. **The wear clock** — `economy.ts#failureOddsPct`, § 8.3's own formula, unmoved by GitHub
 *    issue #564. A fresh building rolls 0.4 %; a worn one rolls up to ten times that. This stage
 *    is *the machines failing*, and it is supposed to be rare on a tower nobody has run yet.
 * 3. **The building's own day** — {@link CAMPAIGN_DAY_EVENT_SHARE_PCT} of what is left, drawn
 *    from `data/wrinkles.json`'s **weekday** pool. This is the stage issue #564 adds, and the
 *    docstring on that constant is the whole argument for why the fix is a repertoire rather than
 *    a raised failure rate.
 *
 * ## Why the weekday pool and not the campaign one
 *
 * `wrinkles/draw.ts#poolFor(library, 'campaign')` is exactly `breakdown` and `coach-party` — the
 * two the calendar and the wear clock already reach by id — so drawing from it would be this
 * function asking the same two questions a third time. The **weekday** pool is the eighteen
 * templates a contract day is: a contract is a working month, and a career has no weekend because
 * `CampaignTower.day` counts days worked rather than dates. `ordinary` is in that pool and is left
 * in it deliberately: a draw that lands on it is a day the building had something planned and it
 * came to nothing, which costs one row of the pool and buys a rate that is not exactly the share.
 * The share's arithmetic above is stated over the pool **including** `ordinary`, so the figures
 * are what the draw actually produces rather than what excluding a row would have produced.
 */
export function campaignEventFor(input: { readonly tower: CampaignTower; readonly seed: number | bigint }): ShiftEvent {
  const calendared = calendarEventIdFor(input.tower.id, input.tower.day);
  if (calendared !== undefined) return SHIFT_EVENTS[calendared];
  const { initState, initSeq } = deriveStreamSeed(
    input.seed,
    `${CAMPAIGN_INCIDENT_STREAM}:${input.tower.id}:${String(input.tower.day)}`,
  );
  const rng = new Pcg32(initState, initSeq);
  const draw = rng.nextFloat() * 100;
  if (draw < failureOddsPct(input.tower)) return SHIFT_EVENTS.breakdown;
  return buildingsOwnDay(input.tower, input.seed);
}

/**
 * The third stage of {@link campaignEventFor} — the building's day, or nothing.
 *
 * Its own stream (see {@link CAMPAIGN_DAY_STREAM}) and its own two draws: one against the share,
 * one to pick the row. Two draws on one stream rather than two streams, because *whether* and
 * *which* are one question asked in two halves and nothing else keys on either.
 *
 * Returns `SHIFT_EVENTS.ordinary` on the share draw failing, which is the same object the function
 * this replaced returned — so a library authored with `eventSharePct: 0` makes a career day
 * byte-identical to the one this repository shipped before issue #564, which is what makes the
 * setting a setting.
 */
function buildingsOwnDay(tower: CampaignTower, seed: number | bigint): ShiftEvent {
  const pool = poolFor(WRINKLE_LIBRARY, 'weekday');
  /* Unreachable: `library.ts#assertRotates` throws at load on an empty pool. Belt, not logic. */
  if (pool.length === 0) return SHIFT_EVENTS.ordinary;
  const { initState, initSeq } = deriveStreamSeed(
    seed,
    `${CAMPAIGN_DAY_STREAM}:${tower.id}:${String(tower.day)}`,
  );
  const rng = new Pcg32(initState, initSeq);
  if (rng.nextFloat() * 100 >= CAMPAIGN_DAY_EVENT_SHARE_PCT) return SHIFT_EVENTS.ordinary;
  const index = Math.min(pool.length - 1, Math.floor(rng.nextFloat() * pool.length));
  /* Non-null: `index` is inside the pool by construction. */
  const template = pool[index] as (typeof pool)[number];
  /*
   * The **template** at its base effect, not a `drawWrinkle` composition. `SHIFT_EVENTS` is keyed
   * by template id and `ViewerState.campaignEventId` carries that id to `dev/state.ts`, which
   * re-resolves it through `eventById` when the run is built — so a composed id (`shaft-out:morning`)
   * would resolve to nothing and the day would silently run ordinary. The axes are the *week's*
   * rota's variation; a contract day varies by which template it draws.
   */
  return eventById(template.id) ?? SHIFT_EVENTS.ordinary;
}

/** One radio row on the dock. */
export interface CampaignIncidentOption {
  readonly id: string;
  /** The button's own words, and the stamp's — `answered the incident — <label>`. */
  readonly label: string;
  /** Units it costs. `0` is free. */
  readonly units: number;
  /** § 7.5's *when it takes effect*. */
  readonly when: string;
  /** § 8.2's *honest trade*. */
  readonly effect: string;
  /** § 8.11's default — leave it to maintenance, with a stated survivable consequence. */
  readonly isDefault?: boolean;
  /**
   * The car this option puts back in service, and how long after the answer. `undefined` for an
   * option whose whole effect is that nothing changes.
   */
  readonly returns?:
    | {
        readonly car: CarRef;
        readonly afterS: number;
        /**
         * The rating the car comes back at, when it comes back derated (§ D524) — both units, from
         * the plate, so the resolved event carries the same setting the config would. `undefined`
         * for a car that returns at its plate.
         */
        readonly derate?: { readonly ratedLoadLb: number; readonly ratedLoadKg: number } | undefined;
      }
    | undefined;
}

export interface CampaignIncident {
  /**
   * The template this day drew — `shift/events.ts#SHIFT_EVENTS`' own key.
   *
   * **Widened from `'breakdown' | 'coach-party'` by GitHub issue #564**, for the reason the third
   * stage of {@link campaignEventFor} exists: a contract day can now be any of the weekday pool's
   * eighteen templates, and a union of two would have made the dock's own record disagree with the
   * run. The narrowing is not gone, it moved — `wrinkles/parse.ts#REQUIRED_TEMPLATE_IDS` refuses at
   * load a library missing any id shipped code names as a literal, which is the same check one
   * layer down.
   */
  readonly eventId: string;
  readonly title: string;
  readonly note: string;
  /** The simulated second it becomes true of the run. `0` for a thing known before the day starts. */
  readonly atS: number;
  /** The car the incident takes, when it takes one. */
  readonly car?: CarRef | undefined;
  readonly options: readonly CampaignIncidentOption[];
}

/** What {@link campaignIncidentOf} needs. */
export interface CampaignIncidentInput {
  readonly event: ShiftEvent;
  /** The building the day runs — the grown config, so the car named is the car the run loses. */
  readonly building: BankedBuilding;
  readonly runLengthS: number;
  /** The cars today's works hold, as `campaign/works.ts#worksHeldCarRefsOf` names them. */
  readonly heldCars: readonly CarRef[];
}

/** The day's incident for the dock, or `undefined` on a day nothing is happening. */
export function campaignIncidentOf(input: CampaignIncidentInput): CampaignIncident | undefined {
  const { event } = input;
  if (event.id === 'breakdown') {
    const car = eventCarChoice(event.effect, input.building).derateCars[0];
    if (car === undefined) return undefined;
    const atS = Math.round(BREAKDOWN_AT_FRACTION * input.runLengthS);
    const derate = technicianDerateOf(input.building, car);
    return {
      eventId: 'breakdown',
      title: `Car ${car.carId} failed its safety check`,
      note: `The inspector red-tagged car ${car.carId} in bank ${car.bankId}. It stays out for the rest of the day unless somebody brings it back, and the building runs on the cars it has left.`,
      atS,
      car,
      options: [
        {
          id: 'technician',
          label: 'Call the technician out now',
          units: TECHNICIAN_UNITS,
          when:
            derate === undefined
              ? `the car is back ${String(Math.round(TECHNICIAN_CALLOUT_S / 60))} minutes after you say so`
              : `the car is back ${String(Math.round(TECHNICIAN_CALLOUT_S / 60))} minutes after you say so, cleared to run at three quarters of its plated load for the rest of the day`,
          effect: 'Overtime, paid from this building’s purse. Until they arrive the queue is whatever the other cars can clear.',
          returns: { car, afterS: TECHNICIAN_CALLOUT_S, ...(derate === undefined ? {} : { derate }) },
        },
        {
          id: 'leave',
          label: 'Leave it to maintenance',
          units: 0,
          when: 'the car is back tomorrow',
          effect: 'Nothing is spent. The building copes on the cars it has, and the day is graded on what they manage.',
          isDefault: true,
        },
      ],
    };
  }
  if (event.id === 'coach-party') {
    const held = input.heldCars[0];
    const bringBack: CampaignIncidentOption[] =
      held === undefined
        ? []
        : [
            {
              id: 'bring-back',
              label: `Put car ${held.carId} back in service for the day`,
              units: BRING_BACK_UNITS,
              when: 'from the moment you say so',
              effect: 'The car tonight’s works are holding comes back for the crowd; the works carry on tonight as booked.',
              returns: { car: held, afterS: 0 },
            },
          ];
    return {
      eventId: 'coach-party',
      title: event.name,
      note:
        held === undefined
          ? `${event.note} No car is held for works today, so the cars you have are the cars you have — the parking arms below are the other lever.`
          : event.note,
      atS: 0,
      options: [
        ...bringBack,
        {
          id: 'leave',
          label: 'Leave the standing order alone',
          units: 0,
          when: 'nothing changes',
          effect: 'The crowd meets the dispatcher you chose this morning. If it copes, you learned something cheap.',
          isDefault: true,
        },
      ],
    };
  }
  /*
   * **Every other day the building has, said rather than swallowed** — GitHub issue #564.
   *
   * Before the third stage of {@link campaignEventFor} existed, the only two events a career day
   * could draw were the two above, so returning `undefined` for everything else was returning it
   * for `ordinary` alone. It is not any more: a contract day can draw a move-in, contractors
   * upstairs, an all-hands or a shift change, and a dock that answered **NOTHING HAPPENING** over
   * a morning with a car tied up would be the caption defect `shift/events.ts` spends its module
   * note on — a label that does not describe the picture under it.
   *
   * So the gate is the event's own `changesNothing` rather than a list of two ids. What comes back
   * is worded from the event — `wrinkles/` authored those sentences and re-writing them here would
   * be a second source for what today is — and the options are only the ones that are **real**:
   */
  if (event.effect.changesNothing) return undefined;
  return buildingsDayIncident(input);
}

/**
 * The dock for every day that is not the red tag and not the coach party — GitHub issue **#564**.
 *
 * ## What it offers, and why that is often only one row
 *
 * The rule this module opens with is that **every option's effect is real or the option is not
 * offered**. Applied here it is sharper than it looks:
 *
 * - **No technician, and the branch for one was written and deleted rather than left in.** Every
 *   car-taking template in the weekday pool returns its car by itself — `move-in` at two thirds,
 *   `lift-service` at four fifths, `contractors` at nine tenths — so paying three units to bring
 *   one back would be paying for something that was already happening, which is the
 *   marshal-in-the-lobby defect wearing a price. A `derate.toFraction >= 1` branch that would have
 *   offered one is reachable from **no shipped template**, which is the standing requirement's own
 *   defect: a behaviour unit-tested in isolation and called from no shipped path. It went the way
 *   `model/bank.ts` sent two of its five deck functions, and `incidents.test.ts` asserts in both
 *   directions that no weekday template declares such a window and that `breakdown` — the only one
 *   that does — still gets its technician from the arm above. A library edit that adds one turns
 *   that test red, which is where the offer would then belong.
 * - **The held car comes back for a crowd**, exactly as the coach party's arm does, and only where
 *   tonight's works are holding one.
 * - **Otherwise the only row is to leave it**, and that is not an empty dock: the coach-party arm
 *   above already produces exactly one row on a day no works hold a car, and the day still has a
 *   heading, a note and a clock. A dock with one row says *here is what today is and there is
 *   nothing to buy*; `undefined` says *today is nothing*, and only one of those is true here.
 *
 * `atS` is the event's own window rather than `BREAKDOWN_AT_FRACTION`: a derate declares when it
 * starts, and a day whose crowd is the change is true from the moment the doors open.
 */
function buildingsDayIncident(input: CampaignIncidentInput): CampaignIncident {
  const { event } = input;
  const derate = event.effect.derate;
  const car = derate === null ? undefined : eventCarChoice(event.effect, input.building).derateCars[0];
  const atS = derate === null ? 0 : Math.round(derate.fromFraction * input.runLengthS);
  const backAtS = derate === null ? undefined : Math.round(derate.toFraction * input.runLengthS);

  const options: CampaignIncidentOption[] = [];
  const held = input.heldCars[0];
  const crowded = event.effect.arrivalRateMultiplier !== null && event.effect.arrivalRateMultiplier > 1;
  if (crowded && held !== undefined) {
    options.push({
      id: 'bring-back',
      label: `Put car ${held.carId} back in service for the day`,
      units: BRING_BACK_UNITS,
      when: 'from the moment you say so',
      effect: 'The car tonight’s works are holding comes back for the crowd; the works carry on tonight as booked.',
      returns: { car: held, afterS: 0 },
    });
  }
  options.push({
    id: 'leave',
    label: 'Let the day run as it is',
    units: 0,
    when: 'nothing changes',
    effect:
      'Nothing is spent. The building meets this on the standing order you gave it this morning, and the day is graded on what it manages.',
    isDefault: true,
  });

  return {
    eventId: event.id,
    title: event.name,
    note:
      car === undefined || backAtS === undefined
        ? event.note
        : `${event.note} Car ${car.carId} in bank ${car.bankId} is the one it takes, back at ${String(Math.round(backAtS / 60))} minutes.`,
    atS,
    ...(car === undefined ? {} : { car }),
    options,
  };
}

/**
 * The rating the technician clears a red-tagged car to run at, from the car's plate — or
 * `undefined` when the building in hand carries no plate for it (a grown config leaving
 * `ratedLoadLb` to its class default; every `ResolvedBuilding` carries both figures, so the shipped
 * path always derates). Rounded to the pound and the kilogram, the units the plate is stated in.
 */
function technicianDerateOf(
  building: BankedBuilding,
  car: CarRef,
): { readonly ratedLoadLb: number; readonly ratedLoadKg: number } | undefined {
  const plate = building.banks
    .find((bank) => bank.id === car.bankId)
    ?.cars.find((candidate) => candidate.id === car.carId);
  if (plate?.ratedLoadLb === undefined || plate.ratedLoadKg === undefined) return undefined;
  return {
    ratedLoadLb: Math.round(plate.ratedLoadLb * TECHNICIAN_RETURN_LOAD_FRACTION),
    ratedLoadKg: Math.round(plate.ratedLoadKg * TECHNICIAN_RETURN_LOAD_FRACTION),
  };
}

/** Why an answer cannot be given now, or the change it appends. */
export type AnswerComposition =
  | { readonly kind: 'change'; readonly change: InterventionChange }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * The `answer-incident` entry an option appends at `answerAtS`, or the reason it cannot.
 *
 * Refused before the incident is true of the run — a breakdown answered before the car has gone
 * would be an answer to nothing — and refused when the promised return falls at or past the end of
 * the day, because `core` skips an event past its deadline and the purse would have paid for a car
 * that never came back.
 */
export function answerChangeOf(
  incident: CampaignIncident,
  option: CampaignIncidentOption,
  answerAtS: number,
  runLengthS: number,
): AnswerComposition {
  if (answerAtS < incident.atS) {
    return { kind: 'refused', reason: 'nothing has happened yet — the answer waits for the incident' };
  }
  if (option.returns === undefined) {
    return { kind: 'change', change: { kind: 'answer-incident', option: option.label, serviceEvents: [] } };
  }
  const backAtS = answerAtS + option.returns.afterS;
  if (backAtS >= runLengthS) {
    return {
      kind: 'refused',
      reason: `the day ends before the car would be back — ${String(Math.round((runLengthS - answerAtS) / 60))} minutes left, and it needs ${String(Math.round(option.returns.afterS / 60))}`,
    };
  }
  return {
    kind: 'change',
    change: {
      kind: 'answer-incident',
      option: option.label,
      // In service first, then derated, at one instant: the kernel fires the two in this order, so
      // the car re-enters the group and is rated down before the bank's next decision reads it.
      serviceEvents: [
        { atS: backAtS, bankId: option.returns.car.bankId, carId: option.returns.car.carId, mode: 'in-service' },
        ...(option.returns.derate === undefined
          ? []
          : [
              {
                atS: backAtS,
                bankId: option.returns.car.bankId,
                carId: option.returns.car.carId,
                ratedLoadLb: option.returns.derate.ratedLoadLb,
                ratedLoadKg: option.returns.derate.ratedLoadKg,
              },
            ]),
      ],
    },
  };
}
