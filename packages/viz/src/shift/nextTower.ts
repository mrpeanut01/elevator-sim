/**
 * **The next tower, offered at a held week's close and never locked** — swarm DO's ruling § 3,
 * lane AM-E, [§ D1259](../../../../DECISIONS.md).
 *
 * A week is **held** when its sheet's target was met: the player's clean counted days reached the
 * target `shift/weekStake.ts#weekSheetOf` derives from the census. At that close, and only then,
 * the sheet names one more tower as the next step: the first tower after this one in contract
 * order, wrapping to the first rung, whose week the census admits.
 *
 * ## Which weeks may be offered
 *
 * **Every week rule the first tower meets**, and no new one ({@link weekIsOffered}):
 *
 * 1. `shift/weekStake.ts#weekAdmitsANewcomer`, read here rather than restated: the census deals the
 *    week (`docs/33` DC-10 rows for it exist and are current), its day 1 counts, and its target is
 *    below its counted days, so the week has room for one miss. That is the one reading of *a
 *    tower whose week the census admits* the repository already carries
 *    ([§ D1178](../../../../DECISIONS.md)), and two readings of one phrase would be two rules.
 * 2. [§ D1180](../../../../DECISIONS.md)'s derived check: the target cannot be met before Thursday,
 *    the post-AJ panel's seat A complaint about a week won by Wednesday. It was written for the
 *    newcomer's tower, and a tower offered as the next step is held to the same week.
 *
 * A tower the census refuses, or has not measured, is never offered: the ruling's own condition,
 * *a tower the held-out half refuses is not offered*.
 *
 * ## What the census found, so what is offered today: Midtown Office, and only from below
 *
 * Lane AM-E's census ([§ D1258](../../../../DECISIONS.md)) measured Chancery House and Ashgate at
 * growth 0, the slope swarm DO's day-5 screen passed them at. The held-out half refused both
 * Fridays (8 and 5 of 20 crowds as dealt) and Ashgate's Thursday (9 of 20), so Chancery House
 * counts Monday to Thursday with a target of three, met on Wednesday at the earliest, and Ashgate
 * counts Monday to Wednesday with a target of two, met on Tuesday. Both pass rule 1 and fail rule
 * 2, so neither is offered. The one tower whose week meets both rules is Midtown Office, so a held
 * week on Chancery House, Harbour Point or Ashgate offers Midtown, and a held Midtown week offers
 * nothing and keeps *Start next week*. A further tower is offered on the commit a census row admits
 * a week that meets both rules; nothing here names a tower. Rule 2 is the owner-reversible clause
 * that decides it: without it, a held Midtown week would offer Ashgate.
 *
 * ## What it does not do
 *
 * It locks nothing and opens nothing. Every tower is pressable from the front door's tower list
 * before, during and after this offer, and the sentence says so. The words never say *unlock*,
 * because nothing was locked (`docs/38`, § D1129's footing), which `nextTower.test.ts` asserts on
 * every sentence this module can produce. A week that was not held gets no offer: the step after it
 * is the next week on the same tower, as before.
 */

import { CONTRACTS, contractById } from './contracts.js';
import { WEEK_WAY, type WeekWay } from './weekWay.js';
import { weekAdmitsANewcomer, weekDealOf, type WeekSheetView } from './weekStake.js';

/** What the held week's sheet offers next. */
export interface NextTowerOffer {
  readonly contractId: string;
  readonly buildingId: string;
  /** The primary press: *Play Chancery House’s week*. */
  readonly label: string;
  /** The sentence on the sheet, under the target line. */
  readonly line: string;
  /** The second press, which keeps the player on this tower: the next week here. */
  readonly stayLabel: string;
}

/** The press that stays: the next week on the tower the week was held on. */
export const NEXT_TOWER_STAY_LABEL = 'Start next week here';

/**
 * Whether a week's sheet shows it held: it had a target and the player's clean counted days met it.
 * A week with no counted day has no target, and so is never held.
 */
export function weekWasHeld(sheet: Pick<WeekSheetView, 'yours' | 'target'> | undefined): boolean {
  return sheet !== undefined && sheet.target > 0 && sheet.yours >= sheet.target;
}

/** Thursday's day number: the earliest day a week's target may be met (§ D1180). */
const EARLIEST_TARGET_DAY = 4;

/**
 * The day of the week a tower's target is met at the earliest, with every counted day before it
 * clean, or `undefined` where the census does not deal the week or it has no target.
 */
export function earliestTargetDayOf(contractId: string, census: WeekWay = WEEK_WAY): number | undefined {
  const deal = weekDealOf(contractId, census);
  if (deal === undefined || deal.target === 0) return undefined;
  return deal.days.filter((day) => day.counts)[deal.target - 1]?.day;
}

/** Whether a tower's week may be offered as the next step — the module docstring's two rules. */
export function weekIsOffered(contractId: string, census: WeekWay = WEEK_WAY): boolean {
  if (!weekAdmitsANewcomer(contractId, census)) return false;
  const earliest = earliestTargetDayOf(contractId, census);
  return earliest !== undefined && earliest >= EARLIEST_TARGET_DAY;
}

/**
 * The first contract after `contractId`, in `CONTRACTS` order, whose week may be offered, or
 * `undefined` where no other tower's is.
 *
 * `CONTRACTS` is the ladder's order, which `docs/33` DC-6 holds non-decreasing in day-1 miss rate,
 * so *next* is the next rung up. **It wraps**, past the last rung to the first: the ladder is not
 * ordered by admission, and an admitted tower below this one (Chancery House sits below Midtown
 * Office) would otherwise never be offered from the top. The tower itself is never its own next.
 */
export function nextAdmittedTowerAfter(contractId: string, census: WeekWay = WEEK_WAY): string | undefined {
  const at = CONTRACTS.findIndex((contract) => contract.id === contractId);
  if (at < 0) return undefined;
  const around = [...CONTRACTS.slice(at + 1), ...CONTRACTS.slice(0, at)];
  return around.find((contract) => weekIsOffered(contract.id, census))?.id;
}

/**
 * **The offer on a held week's sheet**, or `undefined`: the week was not held, the sheet is not
 * standing, or no admitted tower follows this one. `nameOf` names a building by id, the week
 * screen's own port.
 */
export function nextTowerOfferOf(
  contractId: string,
  sheet: Pick<WeekSheetView, 'yours' | 'target'> | undefined,
  nameOf: (buildingId: string) => string | undefined,
  census: WeekWay = WEEK_WAY,
): NextTowerOffer | undefined {
  if (!weekWasHeld(sheet)) return undefined;
  const nextId = nextAdmittedTowerAfter(contractId, census);
  const next = nextId === undefined ? undefined : contractById(nextId);
  const deal = nextId === undefined ? undefined : weekDealOf(nextId, census);
  if (next === undefined || deal === undefined) return undefined;
  const here = contractById(contractId);
  const name = nameOf(next.buildingId) ?? next.buildingId;
  const hereName = here === undefined ? 'This tower' : (nameOf(here.buildingId) ?? here.buildingId);
  return {
    contractId: next.id,
    buildingId: next.buildingId,
    label: `Play ${name}’s week`,
    line:
      `You held this week. ${name} is the next tower whose week has been measured as it is dealt: ` +
      `${String(deal.counted)} of its days count, and its target is ${String(deal.target)} clean. ` +
      `${hereName} stays open, as every tower does, under This week’s tower on the front door.`,
    stayLabel: NEXT_TOWER_STAY_LABEL,
  };
}
