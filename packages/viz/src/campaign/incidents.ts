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
 *    by a draw, because the hotel told you in advance;
 * 2. otherwise a draw against § 8.3's daily failure odds, `economy.ts#failureOddsPct`, and a
 *    breakdown if it lands;
 * 3. otherwise an ordinary day.
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
 * cost and when it takes effect"* (§ 7.5). Only two of the seven events are incidents in that
 * sense — the two the campaign chooses — and an ordinary day produces `undefined`, which the dock
 * draws as a day with nothing happening rather than as an incident with no options.
 *
 * **Every option's effect is real or the option is not offered.** The design file's `outage` and
 * `event` option sets include a technician, a marshal in the lobby, a temporary handover and a
 * zoning change. Of those, what an `answer-incident` entry can carry is a service-mode change
 * (`core`'s arm carries `serviceEvents` and nothing else), so the options here are the ones a
 * service-mode change can honestly express: bring the red-tagged car back, or bring back the car
 * tonight's works are holding. The handover and the parking are the stage's own arms one row down,
 * and the dock's footer says so rather than duplicating them as options that would append a
 * different kind of entry. A marshal in the lobby is a person the engine cannot simulate, and an
 * option that charged for one would be a control that writes nothing (§ D219).
 *
 * ## Composing the answer — {@link answerChangeOf}
 *
 * The change is `core`'s `answer-incident` arm: the option's own words for the stamp, and the
 * in-service event the option promises, at or after the answer's own second. An option whose car
 * would return after the day ends is **refused with the reason** rather than appended: `core` warns
 * and skips an event past the deadline, and a paid answer whose effect the run never reaches is the
 * same defect as a marshal.
 */

import { Pcg32, deriveStreamSeed } from '@elevator-sim/core';
import type { InterventionChange } from '@elevator-sim/core';

import { BREAKDOWN_AT_FRACTION, SHIFT_EVENTS, eventCarChoice } from '../shift/events.js';
import type { BankedBuilding, CarRef } from '../shift/incidents.js';
import type { ShiftEvent } from '../shift/types.js';

import { calendarEventIdFor } from './calendar.js';
import type { CampaignTower } from './career.js';
import { failureOddsPct } from './economy.js';

/** The stream name the breakdown draw derives from — see the module note. */
export const CAMPAIGN_INCIDENT_STREAM = 'campaign-incident';

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

/** What bringing a works-held car back for the day costs — the design's `zone` figure, 2 u. */
export const BRING_BACK_UNITS = 2;

/**
 * The event a campaign day runs under.
 *
 * `seed` is the run's — `ViewerState.seed`, the number on the front door — and the draw is derived
 * from it with the contract and the day mixed in, so the same seed on two days of one contract is
 * two draws and the same seed on two contracts is two draws.
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
  return draw < failureOddsPct(input.tower) ? SHIFT_EVENTS.breakdown : SHIFT_EVENTS.ordinary;
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
  readonly returns?: { readonly car: CarRef; readonly afterS: number } | undefined;
}

export interface CampaignIncident {
  readonly eventId: 'breakdown' | 'coach-party';
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
          when: `the car is back ${String(Math.round(TECHNICIAN_CALLOUT_S / 60))} minutes after you say so`,
          effect: 'Overtime, paid from this building’s purse. Until they arrive the queue is whatever the other cars can clear.',
          returns: { car, afterS: TECHNICIAN_CALLOUT_S },
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
  return undefined;
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
      serviceEvents: [
        { atS: backAtS, bankId: option.returns.car.bankId, carId: option.returns.car.carId, mode: 'in-service' },
      ],
    },
  };
}
