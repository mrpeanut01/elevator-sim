/**
 * **The negated-closing-keyword check's grammar and decision** — GitHub issue #400.
 *
 * ## The case that produced this file
 *
 * Pull request #398 shipped half of issue #366 and said, in bold, in its own body: *"This PR does
 * not close #366."* GitHub closed #366 two seconds after the merge — its parser reads `close #366`
 * and the word *not* three characters earlier is invisible to it. The first fixture below is that
 * sentence, verbatim, because a regression here is the same issue closing early again.
 *
 * ## Why the decision is tested here and the network is not
 *
 * `blocked-by.test.ts`'s argument, unchanged: a pull request's body and commit list need the
 * network and this tier has none. So `scripts/closing-keywords.mjs` keeps its parsing and its
 * decision in exported pure functions, confines `fetch` to a `main()` that runs only when the
 * script is the entry point, and this file imports the pure half. Importing performs no request and
 * needs no token — asserted by construction rather than by a mock, since the import happens at
 * module load and a network call there would fail this tier outright.
 *
 * ## The two directions, and the second is the one that matters
 *
 * A check that refused **every** closing keyword would pass the fixture above and be useless: a
 * pull request that finishes an issue should close it, and a gate people route around protects
 * nothing. So the intentional cases below are asserted to pass, by name, beside the negated ones
 * that must fail.
 */

import { describe, expect, it } from 'vitest';

import {
  CLOSING_KEYWORDS,
  NEGATION_WINDOW,
  sightingsIn,
  summaryOf,
  verdictOf,
} from '../../../../scripts/closing-keywords.mjs';

describe('the negated-closing-keyword check — issue #400', () => {
  /** The sentence that closed #366, verbatim. */
  it('refuses the disclaimer that closed #366', () => {
    const verdict = verdictOf({
      body: 'The schedule already carries the rows. **This PR does not close #366.**',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.negated).toHaveLength(1);
    expect(verdict.negated[0]?.issue).toBe(366);
    /* And it must not also be reported as a close the author intended. */
    expect(verdict.willClose).toEqual([]);
  });

  it('refuses the other ways an author disclaims', () => {
    for (const body of [
      "This doesn't fix #12.",
      'This will not close #12.',
      'Nothing here resolves #12 — the second half is elsewhere.',
      'This never closes #12.',
      'Landing this cannot close #12 on its own.',
    ]) {
      expect(verdictOf({ body }).ok, body).toBe(false);
    }
  });

  /**
   * **The direction that keeps the gate usable.** A pull request that finishes an issue says so,
   * GitHub closes it, and that is the feature working rather than a defect to catch.
   */
  it('passes an ordinary close, and reports which issue it will close', () => {
    const verdict = verdictOf({ body: 'The shop prices from the schedule now.\n\nCloses #366.' });
    expect(verdict.ok).toBe(true);
    expect(verdict.willClose).toEqual([366]);
    expect(summaryOf(verdict)).toContain('will close: #366');
  });

  it('passes a reference that is not a closing keyword at all', () => {
    const verdict = verdictOf({ body: 'Refs #366. See also #234 and #382.' });
    expect(verdict.ok).toBe(true);
    expect(verdict.willClose).toEqual([]);
  });

  /**
   * `closing`, `fixing` and `resolving` are **not** keywords GitHub acts on, so a check that
   * refused them would be refusing safe prose — and a gate that fires on safe prose is one authors
   * learn to work around. Asserted rather than left to the regex's word boundaries.
   */
  it('ignores the verb forms GitHub does not act on', () => {
    for (const body of [
      'Closing out #12 is the next wave.',
      'Fixing #12 needs a ruling first.',
      'Resolving #12 is blocked.',
    ]) {
      const verdict = verdictOf({ body });
      expect(verdict.ok, body).toBe(true);
      expect(verdict.willClose, body).toEqual([]);
    }
  });

  it('reads commit messages as well as the body — GitHub does', () => {
    const verdict = verdictOf({
      body: 'Refs #366.',
      commits: [{ sha: 'abc12345', message: 'wip\n\nThis does not close #366.' }],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.negated[0]?.where).toContain('abc12345');
  });

  it('accepts every keyword GitHub documents, in the forms it documents', () => {
    for (const keyword of CLOSING_KEYWORDS) {
      const verdict = verdictOf({ body: `${keyword} #7` });
      expect(verdict.willClose, keyword).toEqual([7]);
    }
    /* And the cross-repository and `GH-` forms, which GitHub also acts on. */
    expect(verdictOf({ body: 'closes owner/repo#7' }).willClose).toEqual([7]);
    expect(verdictOf({ body: 'closes GH-7' }).willClose).toEqual([7]);
  });

  /**
   * The window is a judgement, and this pins both of its edges so that changing it is a visible
   * decision rather than a drift. A negation far enough away is somebody else's sentence.
   */
  it('looks back exactly as far as it says it does', () => {
    const near = `${'x'.repeat(NEGATION_WINDOW - 12)} not close #12`;
    const far = `not ${'x'.repeat(NEGATION_WINDOW + 20)} close #12`;
    expect(sightingsIn(near, 'body')[0]?.negated).toBe(true);
    expect(sightingsIn(far, 'body')[0]?.negated).toBe(false);
  });

  it('is quiet, and truthful, about a pull request that closes nothing', () => {
    const verdict = verdictOf({ body: 'A refactor with no issue.' });
    expect(verdict.ok).toBe(true);
    expect(summaryOf(verdict)).toContain('closes no issue');
  });
});
