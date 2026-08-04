/**
 * The permissions matrix is a gate, not a description — S4.
 *
 * § D163's test for a bad criterion is that *a criterion whose every clause is already met is a
 * description, not a gate.* A permissions matrix has the same failure mode and it is easier to reach
 * by accident: a row that permits everything typechecks, reads as generous, and refuses nothing.
 *
 * So this file asserts the matrix **discriminates** — every scope is forbidden somewhere, every mode
 * forbids something or is one of the three that deliberately do not — and that the two rows carrying
 * a real argument (`free-play` and `ranked`) say what `docs/16` § 3 says they say.
 */

import { describe, expect, it } from 'vitest';

import { permits } from './permits.js';
import { CHANGE_SCOPES, PLAY_MODES, type ChangeScope, type PlayMode } from './types.js';

/** The three that permit everything, named once so the assertions below can subtract them. */
const UNRESTRICTED: readonly PlayMode[] = ['shift-week', 'incidents', 'calendar'];

describe('the matrix is total', () => {
  it('answers for every mode and every scope', () => {
    for (const mode of PLAY_MODES) {
      for (const scope of CHANGE_SCOPES) {
        expect(typeof permits(mode, scope), `${mode} × ${scope}`).toBe('boolean');
      }
    }
  });

  it('permits presentation everywhere', () => {
    // Drawing choices are the one thing no mode has a reason to take away, and a mode that forbade
    // them would be hiding a run rather than fixing its inputs.
    for (const mode of PLAY_MODES) expect(permits(mode, 'presentation'), mode).toBe(true);
  });

});

describe('the matrix discriminates', () => {
  it('forbids every non-presentation scope somewhere', () => {
    for (const scope of CHANGE_SCOPES) {
      if (scope === 'presentation') continue;
      const forbidding = PLAY_MODES.filter((mode) => !permits(mode, scope));
      expect(forbidding.length, `no mode forbids ${scope} — the scope decides nothing`).toBeGreaterThan(0);
    }
  });

  it('has every restricted mode actually restrict something', () => {
    for (const mode of PLAY_MODES) {
      if (UNRESTRICTED.includes(mode)) continue;
      const forbidden = CHANGE_SCOPES.filter((scope) => !permits(mode, scope));
      expect(forbidden.length, `${mode} permits everything and is therefore not a mode`).toBeGreaterThan(0);
    }
  });

  it('leaves the day loop and its two variants unrestricted, deliberately', () => {
    // Stated rather than left to be noticed: these three *are* the between-days axis, so a
    // restriction on them would be a restriction on the thing they exist to be.
    for (const mode of UNRESTRICTED) {
      expect(CHANGE_SCOPES.every((scope) => permits(mode, scope)), mode).toBe(true);
    }
  });
});

describe('the two rows that carry an argument', () => {
  it('free play is one run, so nothing may belong to a day boundary', () => {
    // docs/16 § 5 clause 3: a Start that left the week on day 7 ran a building two thirds fuller
    // than the one the menu described, and said nothing. This is that bug as a rule.
    expect(permits('free-play', 'between-days')).toBe(false);
    expect(permits('free-play', 'between-games')).toBe(true);
    expect(permits('free-play', 'within-day')).toBe(true);
  });

  it('a ranked run carries only what a selection carries', () => {
    expect(permits('ranked', 'within-day')).toBe(false);
    expect(permits('ranked', 'between-days')).toBe(false);
    expect(permits('ranked', 'between-games')).toBe(true);
  });
});


describe('the unions are the categories, and are small on purpose', () => {
  it('has four scopes', () => {
    // Pinned, because the value of an exhaustive switch is that a fifth is a compile error — and a
    // test that did not pin the count would let a fifth arrive with a `default` beside it.
    expect(CHANGE_SCOPES.length).toBe(4);
  });

  it('has no duplicate members', () => {
    expect(new Set<string>(CHANGE_SCOPES).size).toBe(CHANGE_SCOPES.length);
    expect(new Set<string>(PLAY_MODES).size).toBe(PLAY_MODES.length);
  });

  it('lists every mode the matrix answers for', () => {
    const answered = PLAY_MODES.filter((mode: PlayMode) =>
      CHANGE_SCOPES.some((scope: ChangeScope) => permits(mode, scope)),
    );
    expect(answered).toEqual(PLAY_MODES);
  });
});
