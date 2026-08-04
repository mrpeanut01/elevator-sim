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
import { ENDLESS_CONTRACT_ID, openEndless, openWeek } from './week.js';
import { coachWeekLines } from './weekLabel.js';

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
    const lines = coachWeekLines(openWeek('no-such-contract'), HALF_HOUR_S);
    expect(lines.label).toBe('Sandbox');
    expect(lines.progress).toBe('30 min of demand · free play');
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
