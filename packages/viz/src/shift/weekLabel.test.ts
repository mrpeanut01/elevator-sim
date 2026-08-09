/**
 * The ribbon names the week it is over — three cases, and one of them could not be reached.
 *
 * The bug this file pins is not *the wrong words*; it is that two of the three branches were
 * **unreachable**. `WeekState.contractId` is a `string` and the predicate was `=== undefined`, so
 * the *Sandbox* eyebrow and the *free play* progress line had never once been printed. A test that
 * only checked the scenario case would have passed against that code, which is why every case below
 * is asserted against the **week a real caller would hand it** — `openWeek`, `openEndless`, and an
 * id no contract answers to — rather than against a hand-made object.
 */

import { describe, expect, it } from 'vitest';

import { contractById } from './contracts.js';
import {
  ENDLESS_CONTRACT_ID,
  FREE_PLAY_CONTRACT_ID,
  SANDBOX_CONTRACT_ID,
  openEndless,
  openWeek,
} from './week.js';
import { coachWeekLines, weekKeptLine } from './weekLabel.js';

const HALF_HOUR_S = 1800;

describe('a scenario week', () => {
  it('names the day and what has been banked', () => {
    const lines = coachWeekLines({ ...openWeek('c2'), day: 4, cleanRun: 1 }, HALF_HOUR_S);
    expect(lines.label).toBe('Scenario · day 4');
    expect(lines.progress).toBe('1 clean shift banked');
  });

  it('pluralises the count', () => {
    expect(coachWeekLines({ ...openWeek('c2'), cleanRun: 2 }, HALF_HOUR_S).progress).toBe(
      '2 clean shifts banked',
    );
  });

  it('is what a freshly opened week gets — the branch is the default, not the exception', () => {
    // `openWeek()` defaults to the first contract, which is why the `=== undefined` predicate looked
    // harmless: the common case took the branch it was supposed to.
    expect(coachWeekLines(openWeek(), HALF_HOUR_S).label).toBe('Scenario · day 1');
  });
});

describe('an endless week', () => {
  it('is a week, and says nothing is banked in the same line as the count', () => {
    const lines = coachWeekLines({ ...openEndless(), day: 12, cleanRun: 5 }, HALF_HOUR_S);
    expect(lines.label).toBe('Endless · day 12');
    expect(lines.progress).toContain('5 clean days');
    expect(lines.progress).toContain('nothing is banked here');
    // Never *banked*. `closeDay`'s arithmetic is contract-independent, so the count is real — and
    // naming it a banked shift would name a currency that buys nothing in this mode.
    expect(lines.progress).not.toContain('banked shift');
  });

  it('is neither of the other two, though it shares a `contractById` answer with one', () => {
    // The whole reason this is a function over the week rather than a ternary over one field:
    // endless and a reader's own building are the same value of `contractById` and different
    // situations.
    expect(contractById(ENDLESS_CONTRACT_ID)).toBeUndefined();
    const endless = coachWeekLines(openEndless(), HALF_HOUR_S);
    expect(endless.label).not.toBe('Sandbox');
    expect(endless.label).not.toContain('Scenario');
  });
});

describe('a building the reader drew', () => {
  it('gets the sandbox label and a line about the run rather than the week', () => {
    const lines = coachWeekLines(openWeek(SANDBOX_CONTRACT_ID), HALF_HOUR_S);
    expect(lines.label).toBe('Sandbox');
    expect(lines.progress).toBe('30 min of demand · nothing to bank');
  });

  it('does not call it free play, because Free Play is a mode and this is not it', () => {
    /*
     * The line said *free play* and that named the one thing a sandbox run is not. Free Play resets
     * the week — no growth, no scheduled event — which is what makes its runs reproducible on the
     * server and therefore postable. A sandbox run has a week, its growth and its events.
     */
    expect(coachWeekLines(openWeek(SANDBOX_CONTRACT_ID), HALF_HOUR_S).progress).not.toContain('free play');
  });

  it('is a state the product can actually reach, which it could not before', () => {
    // `withBuilding` used to leave a drawn building on whatever contract the week already had, and
    // that id resolved — so this branch was unreachable and the ribbon claimed a scenario.
    // `dev/state.test.ts` drives the whole path; this pins the sentinel the path produces.
    expect(contractById(SANDBOX_CONTRACT_ID)).toBeUndefined();
  });

  it('was unreachable before this module existed — the regression guard', () => {
    /*
     * Stated as its own case because the defect was invisible in every other form. The old
     * predicate compared a `string` against `undefined`; TypeScript permits that comparison, so a
     * strict build shipped a label nothing could print. If somebody reintroduces a field-identity
     * test here, this goes red rather than the ribbon quietly going wrong again.
     */
    expect(coachWeekLines(openWeek('c2'), HALF_HOUR_S).label).not.toBe('Sandbox');
    expect(coachWeekLines(openWeek('vanished'), HALF_HOUR_S).label).toBe('Sandbox');
  });
});

/* -------------------------------------------------------------------------- *
 * A Free Play run — GitHub issue #125
 * -------------------------------------------------------------------------- */

describe('a free play run', () => {
  it('is named as itself rather than as the scenario whose building it borrowed', () => {
    /*
     * The defect this branch closes. `enterFreePlay` opened its week on
     * `contractForBuilding(buildingId)?.id`, so a free-play run on Midtown Office carried `c2`,
     * `contractById` resolved it, and the ribbon read **Scenario · day 1 · 0 clean shifts banked**
     * over a run that belongs to no week and banks nothing. It is the same shape as the sandbox
     * defect one describe up, arriving through a different writer.
     */
    const lines = coachWeekLines(openWeek(FREE_PLAY_CONTRACT_ID), HALF_HOUR_S);
    expect(lines.label).toBe('Free play');
    expect(lines.progress).toBe('30 min of demand · nothing to bank');
    // Not the scenario branch, and not the sandbox one either.
    expect(lines.label).not.toContain('Scenario');
    expect(lines.label).not.toBe('Sandbox');
    expect(contractById(FREE_PLAY_CONTRACT_ID)).toBeUndefined();
  });

  it('does not claim to start a week, because it has none to start', () => {
    /*
     * `weekKeptLine`'s arrival clause. *"starts a new week"* is what every other arrival says and it
     * is the wrong claim here: `advancesTheWeek` refuses to close a day into a free-play run, so the
     * week it would be starting can never reach day 2.
     */
    const line = weekKeptLine(
      { ...openWeek('c2'), day: 4, streak: 4 },
      openWeek(FREE_PLAY_CONTRACT_ID),
    );
    expect(line).toContain('Scenario 2 is kept on day 4');
    expect(line).toContain('pick that building again and it carries on from there');
    expect(line).toContain('Your free-play run is one run and banks nothing.');
    expect(line).not.toContain('starts a new week');
  });
});

/* -------------------------------------------------------------------------- *
 * The week you just put down — GitHub issue #107
 * -------------------------------------------------------------------------- */

describe('the line about the week that was parked', () => {
  it('names the day and the streak the reporter watched disappear', () => {
    const line = weekKeptLine({ ...openWeek('c1'), day: 4, streak: 4, cleanRun: 4 }, openWeek('c2'));
    expect(line).toContain('Scenario 1');
    expect(line).toContain('day 4');
    expect(line).toContain('4-day streak');
    expect(line).toContain('4 clean shifts banked');
  });

  it('says which of the two happened to the week that was picked up', () => {
    // The half that makes the line worth printing: switching still shows day 1 on the ribbon, and a
    // player has no way to tell a fresh week from the loss unless the sentence says which it is.
    expect(weekKeptLine({ ...openWeek('c1'), day: 4 }, openWeek('c2'))).toContain(
      'starts a new week',
    );
    expect(
      weekKeptLine({ ...openWeek('c1'), day: 4 }, { ...openWeek('c2'), day: 3 }),
    ).toContain('picks up on day 3');
  });

  it('says nothing at all about a week with nothing in it', () => {
    /*
     * The ordinary case, and the reason this is `undefined` rather than a sentence: a player still
     * choosing a building changes it several times on day 1, and a reassurance printed each time
     * would be noise on the one line the ribbon has for news.
     */
    expect(weekKeptLine(openWeek('c1'), openWeek('c2'))).toBeUndefined();
    expect(weekKeptLine(openWeek('c1'), openWeek('c1'))).toBeUndefined();
  });

  it('prints no count it does not have', () => {
    // A `0-day streak` is a number printed to fill a slot. The clause is absent instead.
    const line = weekKeptLine({ ...openWeek('c1'), day: 4 }, openWeek('c2'));
    expect(line).not.toContain('0-day');
    expect(line).not.toContain('0 clean');
    expect(line).toContain('day 4');
  });

  it('names an endless and a sandbox week as what they are', () => {
    // The same defect `coachWeekLines` closed, one function over: a branch nothing can print is a
    // claim nobody can check, so each name is asserted against a week a real caller produces.
    expect(weekKeptLine({ ...openEndless(), day: 12 }, openWeek('c2'))).toContain('endless week');
    expect(
      weekKeptLine({ ...openWeek(SANDBOX_CONTRACT_ID), day: 6 }, openWeek('c2')),
    ).toContain('own building');
  });
});
