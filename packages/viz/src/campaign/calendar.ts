/**
 * **The contract's own calendar** — GAMEPLAY § 8.11's *"authored event schedule"*, GitHub issue
 * #169 item 1, § D507.
 *
 * § 8.11: *"Incidents arrive from the building, not from performance."* Two of § 8's four kinds
 * are derivable from the record and `career.ts#needOf` derives them; the other two arrive from
 * outside it. A coach party is the one that is **authored** — the hotel has told you in advance,
 * which the design file says *"is more warning than you usually get"* — so it is a row in a table
 * keyed by contract rather than a draw, and the day it names is a day the player can read off the
 * month grid before it comes.
 *
 * ## Keyed by contract, not by building
 *
 * A contract is a building *and* a month, and the same building on a second contract is a second
 * month with its own bookings. The table is keyed the way `shift/contracts.ts` keys everything the
 * campaign knows about a scenario.
 *
 * **Every shipped contract has an entry since GitHub issue #564**, and the sentence this paragraph
 * used to carry is kept below where it still binds: the only shipped quirk that names a calendared
 * *crowd* is Crown Hotel's — *"Coaches arrive at 11 with forty people and luggage"*
 * (`career.ts#QUIRKS`) — and a coach party authored onto an apartment block or a hospital would be
 * a caption about a crowd the building's own line never promised. That is a constraint on **what**
 * each contract books, not on whether it books anything, and reading it as the latter is what left
 * nine of the ten contracts with no calendared day at all. See {@link CONTRACT_CALENDAR}.
 *
 * ## Why every fifth day, on the hotel
 *
 * The design file's Crown Hotel fixture books coaches on day 5 and a wedding party on day 12; a
 * twenty-day contract with a coach party on every fifth day keeps that cadence and gives a player
 * who cleared the first one three more chances to plan for it, which is the whole point of an
 * incident the building announces. The nine contracts added later keep the spirit rather than the
 * period — {@link CONTRACT_CALENDAR} says what their spacing is and why.
 *
 * What a calendared event **does to the run** is the business of the `shift/events.ts#SHIFT_EVENTS`
 * row it names, in fields the engine reads; this table only says *when*. `campaign/incidents.ts`
 * consults it before drawing anything, so an authored day is never overwritten by a draw.
 */

import type { ShiftEventId } from '../shift/types.js';

/** One authored day on a contract. */
export interface ContractCalendarEntry {
  /** 1-based contract day, 1…`CONTRACT_DAYS`. */
  readonly day: number;
  /**
   * The template this day books.
   *
   * **Widened from `'coach-party'` by GitHub issue #564** and still a {@link ShiftEventId} rather
   * than a bare string: a booking names a template *as a literal*, so it indexes `SHIFT_EVENTS`
   * and gets a `ShiftEvent` rather than a `ShiftEvent | undefined`. That is `shift/types.ts`'s own
   * distinction between a booking and a draw, kept — the draw in `incidents.ts` reaches the whole
   * library, and the calendar reaches the seven ids shipped code names.
   */
  readonly eventId: ShiftEventId;
}

/**
 * The authored schedule per contract id. Contracts absent here have no calendared day.
 *
 * ## Every contract has one now, and that is GitHub issue #564's first half
 *
 * This table held `c7` alone, and its own docstring above gave the reason: the only shipped quirk
 * that *names* a calendared crowd is Crown Hotel's. The reason was good and the consequence was
 * not — a career begun at Garden Apartments, which is the only contract `openingCareer` holds, met
 * **no calendared event at any point in a twenty-day contract**, so the one channel that lets a
 * player see something coming on the month grid was dark for every player who had not reached the
 * hotel.
 *
 * So each contract books from its **own** building's line rather than from the hotel's. Nothing
 * here is a caption about a crowd the building never promised: a move-in on an apartment block, a
 * lift booked out on the building whose quirk is *"one lift is always in for repair"*, and a fire
 * drill on the towers with a lobby big enough for it are the buildings' own sentences. Two
 * contracts are left with a single entry on purpose — a hospital that *"never empties"* is not a
 * building that books a crowd, and its one entry is the service call it cannot avoid.
 *
 * ## The cadence
 *
 * Nothing before day 3, because `docs/33` § 20.13's *day one must be gradeable* is the same rule
 * `wrinkles/draw.ts` offsets its index for, and a player meeting a red-tagged car before they have
 * been told what a car is learns nothing. After that the spacing is at least four days, so a
 * player who was caught out by one has time to plan for the next — which is the whole point of an
 * incident the building announces, and is why `c7`'s every-fifth-day cadence is kept exactly.
 *
 * **These are drafted, not measured**, on the same footing `data/wrinkles.json`'s own effect
 * figures are drafted: which day a building books something on is game feel, and no run can say a
 * schedule is wrong.
 */
export const CONTRACT_CALENDAR: Readonly<Record<string, readonly ContractCalendarEntry[]>> = Object.freeze({
  /* Garden Apartments — *"Everyone leaves within the same twenty minutes."* A block of flats has
     people moving in and out of it; the fire drill is the twenty minutes its quirk is about. */
  c1: Object.freeze([
    Object.freeze({ day: 4, eventId: 'move-in' as const }),
    Object.freeze({ day: 11, eventId: 'fire-drill' as const }),
    Object.freeze({ day: 17, eventId: 'move-in' as const }),
  ]),
  /* Midtown Office — *"Two crowds that never overlap."* A conference is the day they do. */
  c2: Object.freeze([
    Object.freeze({ day: 6, eventId: 'conference' as const }),
    Object.freeze({ day: 13, eventId: 'fire-drill' as const }),
    Object.freeze({ day: 19, eventId: 'conference' as const }),
  ]),
  /* Secure Tower — credentialed floors above 21. A drill is the one day everybody is downstairs. */
  c3: Object.freeze([
    Object.freeze({ day: 7, eventId: 'fire-drill' as const }),
    Object.freeze({ day: 16, eventId: 'move-in' as const }),
  ]),
  /* Mixed-Use High-Rise — sixty floors over a sky lobby; a tenant fit-out is a week of its own. */
  c4: Object.freeze([
    Object.freeze({ day: 5, eventId: 'move-in' as const }),
    Object.freeze({ day: 12, eventId: 'conference' as const }),
    Object.freeze({ day: 18, eventId: 'fire-drill' as const }),
  ]),
  /* Chancery House — *"One lift is always in for repair."* The contract's own sentence, booked. */
  c6: Object.freeze([
    Object.freeze({ day: 4, eventId: 'move-in' as const }),
    Object.freeze({ day: 9, eventId: 'conference' as const }),
    Object.freeze({ day: 15, eventId: 'fire-drill' as const }),
  ]),
  /* Crown Hotel — the design file's own fixture, unchanged: coaches every fifth day. */
  c7: Object.freeze([
    Object.freeze({ day: 5, eventId: 'coach-party' as const }),
    Object.freeze({ day: 10, eventId: 'coach-party' as const }),
    Object.freeze({ day: 15, eventId: 'coach-party' as const }),
    Object.freeze({ day: 20, eventId: 'coach-party' as const }),
  ]),
  /* St Jude's — *"A hospital never empties."* One entry, and it is not a crowd: a drill is what a
     hospital rehearses, and a building that never empties does not book a party. */
  c8: Object.freeze([Object.freeze({ day: 10, eventId: 'fire-drill' as const })]),
  /* Harbour Point — the tower at its limit. One booked day, late, when the month has taught them. */
  c9: Object.freeze([
    Object.freeze({ day: 8, eventId: 'move-in' as const }),
    Object.freeze({ day: 16, eventId: 'conference' as const }),
  ]),
  /* Ashgate — car-park decks and sixteen floors of offices over a ground of shops. */
  c10: Object.freeze([
    Object.freeze({ day: 6, eventId: 'move-in' as const }),
    Object.freeze({ day: 14, eventId: 'conference' as const }),
  ]),
  /* Merdeka-class — fifty-six office floors reached in one ride. An all-building drill is the test. */
  c13: Object.freeze([
    Object.freeze({ day: 7, eventId: 'conference' as const }),
    Object.freeze({ day: 15, eventId: 'fire-drill' as const }),
  ]),
});

/** The event the contract's calendar books for a day, or `undefined` for a day it leaves alone. */
export function calendarEventIdFor(contractId: string, day: number): ShiftEventId | undefined {
  return CONTRACT_CALENDAR[contractId]?.find((entry) => entry.day === day)?.eventId;
}

/** Every calendared day of a contract, ascending — the month grid's marks. */
export function calendarDaysOf(contractId: string): readonly number[] {
  return [...(CONTRACT_CALENDAR[contractId] ?? [])].map((entry) => entry.day).sort((a, b) => a - b);
}
