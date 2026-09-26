/**
 * **Which crowd a scored day belongs to** — wave AK, [§ D1141](../../../../DECISIONS.md), the
 * post-AJ panel's seats A and D.
 *
 * A week on a scenario is a week of **shared** days: the crowd the UTC date deals, which everybody
 * playing today meets, or the scenario's pinned crowd, which everybody playing that pinned day
 * meets. An address can hand the page any other crowd (`?seed=`), and until this module that crowd
 * ran as the week's day and banked into it. Seat D opened `?building=midtown-office&seed=777&
 * duration=3600`, played the Wednesday it opened on and read *"Wednesday is banked. Thursday
 * opens."* over a sixty-minute day on crowd 777 where the shared Wednesday was thirty minutes long;
 * seat A's Thursday brief re-seeded itself the same way from a `seed=` link.
 *
 * **The rule: a link's crowd may begin a week, and may not enter one.** A run on a crowd other
 * than the day's shared one is **practice** on a week that has already banked a day on another
 * crowd: it runs, it is reported, and the week does not move. No day is banked, no streak moves,
 * and the day stays open for its shared crowd. It is the retake's rule
 * ([§ D1138](../../../../DECISIONS.md) clause 4) with a second ground, so the sheet says it in the
 * same place and in the same shape.
 *
 * **Why a week with nothing banked still takes the link's crowd.** § D1047 deals a fresh device the
 * crowd its address names (*a `?seed=` in the address wins*, kept by § D1096 for every crowd but
 * the date's): a player sharing a run with a newcomer hands them that crowd, and the newcomer's
 * week begins on it. Nothing is reshaped there, because there is no week yet to reshape. What the
 * panel met was a link reaching into a week already under way: seat D's Monday and Tuesday were
 * banked on the date's crowd when the link banked Wednesday on crowd 777. So the week's own first
 * banked day says which crowd it began on, read off that day's record, and a later day banks on
 * that crowd or on the day's shared one. Derived from what the week already holds (§ 3.5): nothing
 * new is stored.
 *
 * Two predicates. {@link crowdIsShared} is the pair § D1095 already keyed the Scenario press's
 * length on (`everyday/host.ts#contractSliceFor`), and it moves there only in where it lives.
 * {@link crowdMakesPractice} is read by the two things that must agree about the close: the brief's
 * seed line (`everyday/today.ts`), which says it before the press, and the close itself
 * (`dev/main.ts#closeShift`).
 */

import { contractById } from './contracts.js';
import { pressDayFor } from './ladder.js';
import type { WeekState } from './types.js';

/**
 * Whether `seed` is the shared crowd of a day on `contractId`: the contract's pin, or `daySeed`, the
 * date's own crowd. `daySeed` is `undefined` where no clock is to hand, and then only the pin is
 * shared, which is the conservative reading `EverydayHostBindings.daySeed` already states.
 */
export function crowdIsShared(contractId: string, seed: bigint, daySeed: bigint | undefined): boolean {
  if (pressDayFor(contractId)?.seedText === seed.toString()) return true;
  return daySeed !== undefined && seed === daySeed;
}

/**
 * **Whether a run on `seed` in `week` is practice by its crowd** — § D1141.
 *
 * `false` for a week on no scenario (a sandbox, a rush, a replay, a career day), because those weeks
 * have rules of their own about what they keep and none of them is a shared day. `false` for the
 * day's shared crowd, and for a week that has banked nothing yet, which the crowd begins. `false`
 * for the crowd the week's first banked day ran on. `true` otherwise, including a week whose first
 * day was filed without a record, where the crowd it began on is not known and only the shared
 * crowd is safe to bank.
 */
export function crowdMakesPractice(
  week: Pick<WeekState, 'contractId' | 'history'>,
  seed: bigint,
  daySeed: bigint | undefined,
): boolean {
  if (contractById(week.contractId) === undefined) return false;
  if (crowdIsShared(week.contractId, seed, daySeed)) return false;
  const first = week.history[0];
  if (first === undefined) return false;
  return first.record?.seed !== seed.toString();
}

/**
 * **Why a run would bank nothing, decided once** — wave AL, lane AL-A, the post-AK panel's seat D
 * (H3). The brief printed *so this run is practice and banks nothing into your week* on its seed
 * line and *This day counts toward the week.* two blocks below it, because the second sentence was
 * the census's account of the day as dealt and never asked whether this run could bank it.
 *
 * `'crowd'` is {@link crowdMakesPractice}. `'retake'` is [§ D1138](../../../../DECISIONS.md) clause
 * 4: the week has already closed today, so a later close of it is practice. `undefined` is a run
 * that banks. The close (`dev/main.ts#closeShift`) and the brief (`everyday/today.ts`) both read
 * this one function, so the sentence before the press and the sheet after it cannot disagree about
 * whether the day counts.
 *
 * `'attempt'` is wave AL's third ground, [§ D1218](../../../../DECISIONS.md): an attempt at today
 * stands (`shift/attempt.ts`) and the run being closed is not it, so the week keeps the day open for
 * that attempt. Only the close can know it, because only the close holds both runs, so the caller
 * says it with `otherThanTheAttempt` and the brief, which offers *Resume* instead, never passes it.
 */
export type PracticeGround = 'crowd' | 'retake' | 'attempt';

export function practiceGroundOf(
  week: Pick<WeekState, 'contractId' | 'history' | 'closedDay' | 'day'>,
  seed: bigint,
  daySeed: bigint | undefined,
  otherThanTheAttempt = false,
): PracticeGround | undefined {
  if (crowdMakesPractice(week, seed, daySeed)) return 'crowd';
  if (week.closedDay === week.day) return 'retake';
  if (otherThanTheAttempt) return 'attempt';
  return undefined;
}

/**
 * What the brief's week block says about a run that banks nothing, in place of the census's
 * *This day counts toward the week.* No digit and no advice; each names the ground the close will
 * print on its sheet (`shift/report.ts#PRACTICE_CROWD_NOTE` and `#PRACTICE_NOTE`).
 */
export const PRACTICE_DAY_SENTENCES: Readonly<Record<PracticeGround, string>> = Object.freeze({
  crowd:
    'This run does not count toward the week: it meets a crowd other than the day’s shared one, ' +
    'so the day stays open for that crowd.',
  retake: 'This run does not count toward the week: your week keeps your first attempt at this day.',
  attempt:
    'This run does not count toward the week: your attempt at this day is still open, and it is the ' +
    'one your week banks.',
});
