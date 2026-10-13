/**
 * **The career asks on its event days, and its report says what decided the day** — wave AO, lane
 * DS-2, [§ D1408](../../../../DECISIONS.md) and [§ D1409](../../../../DECISIONS.md), swarm DS's
 * ruling Q2. The account's half is at the foot of this module ({@link careerCloseLineOf}).
 *
 * ## What was wrong
 *
 * The post-AN re-panel's seat C played 22 career days and every one of them offered a single
 * press, the dock's *Let the day run as it is*. The Scenario day's calls (§ D1138, § D1166,
 * § D1205, § D1265, § D1336) never reached a career day: `dev/main.ts#dayCallOnStage` refused any
 * week whose contract the Scenario does not know, and the career's week names none, and the stage
 * asked for a call on the daily context alone.
 *
 * ## The rule
 *
 * A career day **with an event** (a calendar booking, a breakdown, or the building's own drawn
 * wrinkle: `campaign/incidents.ts#campaignEventFor`'s answer, whenever it changes something about
 * the day) raises the Scenario day's own calls, through the same session and the same admission
 * (`dev/dayCallSession.ts`). **An ordinary career day raises none**: § D1301 measured 361 of
 * Garden Apartments' 400 crowd-days cleared under every one of the thirteen drivers, so an ordinary
 * day's call would move the next ten minutes and never the day, and a player taught that calls
 * never matter stops reading them (swarm DS's S1 and S2). The event-day scope is owner-reversible.
 *
 * ## Graded on the career's own tests
 *
 * A career day is marked on the contract's four tests at the tower's difficulty
 * (`campaignModel.ts#campaignTestGoals`), never on the Scenario day's goals, so the session reads
 * its runs' verdicts against those ({@link CareerDayCalls.goals}): the verdict ground, the day-lost
 * stop and the close's account all speak about the mark the career files.
 *
 * ## What a call costs and pays
 *
 * Nothing. An answer adopts a run the session already made (no units leave the purse; the dock's
 * priced options stay the only priced act in a career day), and a call pays nothing in itself: the
 * day's mark pays the contract's units and the ledger's career turn as it always did
 * (`host.ts#closeDay`).
 */

import type { CampaignTower } from '../campaign/career.js';
import { DIFFICULTIES } from '../campaign/economy.js';
import type { DayDecider, DecidingCall } from '../shift/dayClose.js';
import { eventById, eventOfDrawnId } from '../shift/events.js';
import type { ShiftGoal } from '../shift/types.js';
import type { HouseReading } from '../shift/weekStake.js';

import { campaignTestGoals } from './campaignModel.js';

/** What a career day hands the call session: the goals its runs are graded on. */
export interface CareerDayCalls {
  readonly goals: readonly ShiftGoal[];
}

/**
 * **Whether a career day's event makes it a day that asks** — {@link careerDayCallsOf}'s rule. An id
 * that resolves to an event changing something about the day; `ordinary` (and an id the library no
 * longer has, which runs ordinary) is not one.
 */
export function careerDayAsks(eventId: string | undefined): boolean {
  if (eventId === undefined) return false;
  const event = eventOfDrawnId(eventId) ?? eventById(eventId);
  return event !== undefined && !event.effect.changesNothing;
}

/**
 * **The calls a career day asks, or `undefined` where it asks none** — see the module docstring.
 * `tower` is the tower whose day is running (`host.ts#campaignDayTowerId`'s), and `eventId` the
 * event that day was handed (`ViewerState.campaignEventId`).
 */
export function careerDayCallsOf(
  tower: Pick<CampaignTower, 'difficultyId'> | undefined,
  eventId: string | undefined,
): CareerDayCalls | undefined {
  if (tower === undefined || !careerDayAsks(eventId)) return undefined;
  return Object.freeze({ goals: campaignTestGoals(DIFFICULTIES[tower.difficultyId]) });
}

/* -------------------------------------------------------------------------- *
 * The career report: what decided the day — § D1409
 * -------------------------------------------------------------------------- */

/**
 * **Which run the account needs, on a career day** — `shift/weekStake.ts#driverRunNeedOf`'s
 * categories, read off the day as it stood at its close rather than off a filed record: a career
 * day's crowd is the contract's own (its event, its kit, the works' held cars), which a Scenario
 * week's record does not carry, so the account's runs are planned from the day's own state
 * ({@link careerCloseRunStatesOf}). *Pressed* is any press on the log (a call's answer, the dock's
 * answer, a stage press); the works' held cars are the day's, not the player's.
 */
export type CareerRunNeed = 'own' | 'same' | 'house' | 'run';

export function careerRunNeedOf(input: {
  readonly dispatcherId: string;
  readonly ruleRows: number;
  readonly presses: number;
  readonly house: string;
}): CareerRunNeed {
  const houseDrove = input.dispatcherId === input.house && input.ruleRows === 0;
  const pressed = input.presses > 0;
  if (houseDrove) return pressed ? 'same' : 'own';
  return pressed ? 'run' : 'house';
}

/**
 * **The two runs the account may need, as states** — the driver run (the day with the house's
 * driver picked in place of the player's, every press kept, no rules written) and the house (the
 * house's driver with nothing pressed). Both keep the day's seed, event, kit and the works' held
 * cars, so they meet the same crowd on the same building (common random numbers).
 */
export function careerCloseRunStatesOf<S extends { readonly dispatcherId: string; readonly interventions: readonly unknown[]; readonly ruleRows: readonly unknown[] }>(
  day: S,
  house: string,
): { readonly driverRun: S; readonly house: S } {
  return {
    driverRun: { ...day, dispatcherId: house, ruleRows: [] },
    house: { ...day, dispatcherId: house, interventions: [], ruleRows: [] },
  };
}

/** What {@link careerDeciderOf} reads. Every field is somebody else's measurement. */
export interface CareerCloseInput {
  /** The day's mark on the contract's tests, as filed. */
  readonly verdict: 'cleared' | 'missed';
  /** `shift/dayClose.ts#decidingCallOf` over the day's calls, graded on the contract's tests. */
  readonly lead: DecidingCall | undefined;
  readonly need: CareerRunNeed;
  /** The driver run's mark, `undefined` while it is still being run. */
  readonly driverRun: HouseReading | undefined;
  /** The house's mark, `undefined` while it is still being run. */
  readonly house: HouseReading | undefined;
  /** The house's driver by name, for the sentence. */
  readonly houseName: string;
}

function gradedOf(reading: HouseReading | undefined): 'cleared' | 'missed' | undefined {
  return reading === 'cleared' || reading === 'missed' ? reading : undefined;
}

/**
 * **What decided a career day no call decided** — [§ D1351](../../../../DECISIONS.md)'s one decision
 * (`shift/dayClose.ts#dayDeciderOf`), on a career day: the same arms in the same order, read from
 * runs graded on the contract's tests. Pure.
 */
export function careerDeciderOf(input: CareerCloseInput): DayDecider {
  const { lead, verdict: yours, need } = input;
  if (lead === undefined) return { kind: 'unsaid' };
  if (lead.decided) return { kind: 'call' };
  if (need === 'own') return { kind: 'unsaid' };
  if (need !== 'same') {
    const reading = need === 'house' ? input.house : input.driverRun;
    const run = need === 'house' ? 'house' : 'driver-run';
    if (reading === undefined || reading === 'pending') return { kind: 'pending', waiting: run };
    if (reading === 'unrecorded') return { kind: 'unrun', run };
    const swapped = gradedOf(reading);
    if (swapped === undefined) return { kind: 'unsaid' };
    if (swapped !== yours) return { kind: 'driver', pressed: need === 'run', reads: swapped };
    if (need === 'house') return { kind: 'nothing', pressed: false, houseDrove: false, reads: yours };
  }
  const known = need === 'run' ? yours : undefined;
  if (input.house === undefined || input.house === 'pending') return { kind: 'pending', waiting: 'house', known };
  if (input.house === 'unrecorded') return { kind: 'unrun', run: 'house', known };
  const alone = gradedOf(input.house);
  if (alone === undefined) return { kind: 'unsaid' };
  return alone !== yours
    ? { kind: 'presses', houseDrove: need === 'same', kept: yours, alone }
    : { kind: 'nothing', pressed: true, houseDrove: need === 'same', reads: yours };
}

/** A career run's mark in the account's words. */
export const CAREER_MARK_WORDS: Readonly<Record<'cleared' | 'missed', string>> = Object.freeze({
  cleared: 'a cleared day on the contract’s tests',
  missed: 'a missed day on the contract’s tests',
});

/**
 * **The career report's account of the day**: the call line (§ D1248's sentence, graded on the
 * contract's tests), and after it what decided the day where no call did. Every arm states the runs
 * it read on this crowd and names no driver as better anywhere else. `undefined` on a day nobody
 * graded.
 */
export function careerCloseLineOf(input: CareerCloseInput): string | undefined {
  const lead = input.lead;
  if (lead === undefined) return undefined;
  const decider = careerDeciderOf(input);
  const words = CAREER_MARK_WORDS;
  const house = input.houseName;
  const swapped = `the same day run by ${house} in place of your standing order`;
  const didNot = (reads: 'cleared' | 'missed'): string =>
    `Your standing order did not: on this crowd, ${swapped} and every press kept read ${words[reads]} too.`;
  let more: string | undefined;
  switch (decider.kind) {
    case 'call':
    case 'unsaid':
      more = undefined;
      break;
    case 'driver':
      more = `Your standing order did: on this crowd, ${swapped}${decider.pressed ? ' and every press kept' : ''} read ${words[decider.reads]}.`;
      break;
    case 'presses':
      more = decider.houseDrove
        ? `Your presses did, together: on this crowd, ${house} with nothing pressed read ${words[decider.alone]}.`
        : `${didNot(decider.kept)} Your presses did, together: ${house} with nothing pressed read ${words[decider.alone]}.`;
      break;
    case 'nothing':
      more =
        decider.pressed && !decider.houseDrove
          ? `Nothing you chose decided it either: on this crowd, ${house} read ${words[decider.reads]} too, with every press kept and with none.`
          : `Nothing you chose decided it either: on this crowd, ${house} with nothing pressed read ${words[decider.reads]} too.`;
      break;
    case 'pending':
      more =
        decider.waiting === 'driver-run'
          ? `What decided it is still being run: ${swapped} and every press kept.`
          : decider.known === undefined
            ? `What decided it waits on ${house} with nothing pressed, which is still being run.`
            : `${didNot(decider.known)} Whether your presses did waits on ${house} with nothing pressed, which is still being run.`;
      break;
    case 'unrun':
      more =
        decider.run === 'driver-run'
          ? `What decided it is not said: ${swapped} could not be run on this crowd.`
          : decider.known === undefined
            ? `What decided it is not said: ${house} could not be run on this crowd.`
            : `${didNot(decider.known)} Whether your presses did is not said: ${house} could not be run on this crowd.`;
      break;
  }
  return more === undefined ? lead.line : `${lead.line} ${more}`;
}
