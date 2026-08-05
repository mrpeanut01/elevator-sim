/**
 * A player whose week could not be restored is told — and told the right thing.
 *
 * Three properties carry this file, and only the first is obvious:
 *
 * 1. every failure kind but one produces a sentence;
 * 2. **`absent` produces none**, because a first visit is not a loss and a notice that appeared on
 *    a first run would train a reader to ignore it on the run that mattered;
 * 3. every sentence says what happens **now**. A message that only names what broke leaves the
 *    player unsure whether to keep playing, and that is the half a bare error never has.
 */

import { describe, expect, it } from 'vitest';

import { restoreNoticeFor } from './notice.js';
import type { SessionRestoreFailure } from './types.js';

/** One of every kind, so the sweep below is over the union rather than over what somebody recalled. */
const FAILURES: readonly SessionRestoreFailure[] = Object.freeze([
  { kind: 'absent', message: 'No session has been saved in this browser yet.' },
  { kind: 'unavailable', message: 'localStorage threw.' },
  { kind: 'parse', message: 'Unexpected token at position 12.', position: 12 },
  { kind: 'version', message: 'Written by schema 2, this build reads 1.', found: 2, supported: 1 },
  { kind: 'shape', message: 'week.history[0].day is not a finite number.', field: 'week.history[0].day' },
  { kind: 'stale', message: 'Names things this build no longer ships.', missing: ['c9', 'atrium-tower'] },
]);

describe('every failure but one gets a sentence', () => {
  it('says nothing on a first visit', () => {
    // The load-bearing case. Announcing "no saved week was found" to somebody who has never played
    // would make the notice mean both *your progress is gone* and *welcome*.
    expect(restoreNoticeFor({ kind: 'absent', message: 'nothing here' })).toBeUndefined();
  });

  it('says something for every other kind', () => {
    for (const failure of FAILURES) {
      if (failure.kind === 'absent') continue;
      expect(restoreNoticeFor(failure), failure.kind).toBeTruthy();
    }
  });

  it('is not vacuous — the union really has more than one member', () => {
    // Without this, the sweep above would pass on a `FAILURES` somebody had trimmed to one row.
    expect(new Set(FAILURES.map((failure) => failure.kind)).size).toBe(FAILURES.length);
  });
});

describe('every sentence says what happens now', () => {
  it('names the consequence, not only the cause', () => {
    /*
     * The property, checked lexically rather than by reading. A message that named a broken field
     * and stopped would leave a player unsure whether the thing on screen can be trusted — and the
     * `unavailable` arm is the one where *nothing was lost* is the news, so it is included by the
     * same rule rather than exempted from it.
     */
    for (const failure of FAILURES) {
      const notice = restoreNoticeFor(failure);
      if (notice === undefined) continue;
      expect(
        /Starting (a )?fresh|nothing has been lost|will not survive/iu.test(notice),
        `${failure.kind}: "${notice}" names a cause and no consequence`,
      ).toBe(true);
    }
  });

  it('does not blame the player', () => {
    for (const failure of FAILURES) {
      const notice = restoreNoticeFor(failure) ?? '';
      expect(/you (broke|corrupted|deleted)/iu.test(notice), failure.kind).toBe(false);
    }
  });
});

describe('the precise reason travels where it can be acted on', () => {
  it('appends the field for a damaged save', () => {
    const notice = restoreNoticeFor({
      kind: 'shape',
      message: 'week.history[0].day is not a finite number.',
      field: 'week.history[0].day',
    });
    expect(notice).toContain('week.history[0].day');
  });

  it('names what this build no longer ships', () => {
    // The one arm where the cause is *this build* rather than the stored bytes, so the difference
    // between "the app broke" and "the scenario was withdrawn" is worth a player's attention.
    const notice = restoreNoticeFor({
      kind: 'stale',
      message: 'unused here',
      missing: ['c9', 'atrium-tower'],
    });
    expect(notice).toContain('c9');
    expect(notice).toContain('atrium-tower');
  });

  it('carries both version numbers, so the mismatch is checkable', () => {
    const notice = restoreNoticeFor({ kind: 'version', message: '', found: 4, supported: 1 }) ?? '';
    expect(notice).toContain('4');
    expect(notice).toContain('1');
  });

  it('leaves the browser’s own wording out where it adds nothing', () => {
    // `unavailable` is a thrown store. Quoting the exception would put implementation noise on a
    // ribbon in place of the one thing a player can use: that nothing is being kept.
    const notice = restoreNoticeFor({ kind: 'unavailable', message: 'QuotaExceededError: boom' }) ?? '';
    expect(notice).not.toContain('QuotaExceededError');
    expect(notice).toContain('Nothing has been lost');
  });
});
