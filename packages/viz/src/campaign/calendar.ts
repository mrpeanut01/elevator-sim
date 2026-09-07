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
 * campaign knows about a scenario, and the only contract with an entry today is `c7`, because the
 * only shipped quirk that names a calendared crowd is Crown Hotel's: *"Coaches arrive at 11 with
 * forty people and luggage"* (`career.ts#QUIRKS`). Authoring a coach party onto an apartment
 * building or a hospital would be a caption about a crowd the building's own line never promised.
 *
 * ## Why every fifth day
 *
 * The design file's Crown Hotel fixture books coaches on day 5 and a wedding party on day 12; a
 * twenty-day contract with a coach party on every fifth day keeps that cadence and gives a player
 * who cleared the first one three more chances to plan for it, which is the whole point of an
 * incident the building announces.
 *
 * What a calendared event **does to the run** is `shift/events.ts#SHIFT_EVENTS['coach-party']`'s
 * business, in fields the engine reads; this table only says *when*. `campaign/incidents.ts`
 * consults it before drawing anything, so an authored day is never overwritten by a draw.
 */

import type { ShiftEventId } from '../shift/types.js';

/** One authored day on a contract. */
export interface ContractCalendarEntry {
  /** 1-based contract day, 1…`CONTRACT_DAYS`. */
  readonly day: number;
  readonly eventId: Extract<ShiftEventId, 'coach-party'>;
}

/** The authored schedule per contract id. Contracts absent here have no calendared day. */
export const CONTRACT_CALENDAR: Readonly<Record<string, readonly ContractCalendarEntry[]>> = Object.freeze({
  c7: Object.freeze([
    Object.freeze({ day: 5, eventId: 'coach-party' as const }),
    Object.freeze({ day: 10, eventId: 'coach-party' as const }),
    Object.freeze({ day: 15, eventId: 'coach-party' as const }),
    Object.freeze({ day: 20, eventId: 'coach-party' as const }),
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
