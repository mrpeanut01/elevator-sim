/**
 * The only mail this product sends, and the one sentence in it that is a **stated absence**.
 *
 * ## Why a stated absence needs a test more than a stated fact does
 *
 * Issue #254's third acceptance criterion is a disjunction: the deletion route is reachable from a
 * player-facing surface, **or** the absence is stated on the surface that offers the account. The
 * second limb is what this product meets — `DELETE /api/me` exists and no shipped screen calls it,
 * so {@link signInMessage} says so, on the surface where an account actually comes into being
 * (§ D241 creates the account when a link is *asked for*).
 *
 * `CLAUDE.md` is explicit about what happens next if nobody pins it: **a refusal is pinned by a
 * run, never by another sentence.** The repository's own worst version of this is the traffic
 * editor drawing *mean group size* as a refusal for every wave after the seam went live — a stale
 * refusal is worse than a dead seam, because a dead seam merely does nothing while a stale refusal
 * tells the reader not to touch the control. `mailer.ts` wrote that obligation out in prose and
 * left enforcement to a human, which is the defect wearing the correction's clothes. Before this
 * file existed, deleting the three lines from the mail body left the whole suite green.
 *
 * ## Both directions, because either alone is satisfiable by doing nothing
 *
 * 1. **The sentence is in the body.** Someone who deletes it has to answer for it here.
 * 2. **The sentence is still true** — no shipped viz source reaches `/api/me` with a `DELETE`. The
 *    day a lane wires the control, this file goes red and hands them the sentence they owe.
 *
 * Reading `viz` source text from a `server` test is the idiom `deadCode.test.ts` in this package
 * already uses: `corpus()` walks every package from {@link PACKAGES_DIR}. It is text, never an
 * import — a cross-package relative *import* would put a rendering package in a socket's
 * dependency graph and `tsc -b` would refuse it under `rootDir` anyway.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PACKAGES_DIR, isTest, readSource, sourceFiles } from '../deadCode.test-helper.js';
import { signInMessage } from './mailer.js';

const MAIL = signInMessage('player@example.test', 'https://elevator.example/#sign-in=abc', 15);

/** Every shipped viz source — tests excluded, because a test is not a screen. */
const VIZ_SOURCES = sourceFiles(join(PACKAGES_DIR, 'viz', 'src')).filter((path) => !isTest(path));

describe('the sign-in mail', () => {
  it('tells a reader who never asked what asking for a link actually did', () => {
    // The sentence this replaced said *"Nothing has been set up in your name that this link
    // expiring does not undo"*, which was false: `requestLink` writes the `users` row before the
    // mail goes out and the link expiring sweeps `login_tokens` only.
    expect(MAIL.body).toMatch(/asking for a link is what creates the account/u);
    expect(MAIL.body).not.toMatch(/Nothing has been set up in your name/u);
  });

  it('says what the address is for without understating it', () => {
    // Not *"used to send this mail"*: it is the login identity, it is inside the signed token, it
    // is returned by `GET /api/me`, and it keys § D242's per-address budget. All of that is signing
    // in, and none of it is one send.
    expect(MAIL.body).toMatch(/used to sign you in and for nothing else/u);
  });

  it('states that deletion is not reachable from a screen — AC3 second limb', () => {
    expect(
      MAIL.body,
      'the sign-in mail is the surface on which an account comes into existence, and issue #254 ' +
        'AC3 is met by stating the absence there. Deleting this sentence removes the only place a ' +
        'player is told the erasure path exists and cannot be pressed',
    ).toMatch(/Deleting that account is something the server can do and no screen offers yet\./u);
  });

  it('and that absence is still true, which is the half a sentence cannot promise', () => {
    /*
     * The truth condition, checked rather than asserted. A file that mentions both `/api/me` and
     * `DELETE` is what wiring the control looks like; the pair is required rather than either
     * alone, so an unrelated comment containing the word cannot fail this and train its reader to
     * edit the assertion.
     */
    const wired = VIZ_SOURCES.filter((path) => {
      const source = readSource(path);
      return source.includes('/api/me') && source.includes('DELETE');
    });
    expect(
      wired.map((path) => path.replace(PACKAGES_DIR, '')),
      'a viz source now reaches DELETE /api/me, so the sign-in mail\'s "no screen offers yet" is ' +
        'no longer true. Remove that sentence from `signInMessage` and this assertion with it — a ' +
        'stated absence has to be un-stated by whoever removes it, or it becomes the stale refusal ' +
        '`CLAUDE.md` calls the more dangerous half',
    ).toEqual([]);
  });

  it('reads the viz sources it is supposed to be reading, so a broken walk cannot pass', () => {
    // The guard. A `sourceFiles` that returned nothing would satisfy the assertion above by having
    // nothing to look at, which is exactly how a check stops checking without anybody noticing.
    expect(VIZ_SOURCES.length).toBeGreaterThan(50);
    expect(VIZ_SOURCES.some((path) => path.replace(/\\/gu, '/').endsWith('/menu/client.ts'))).toBe(true);
  });
});
