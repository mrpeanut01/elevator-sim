#!/usr/bin/env node
/**
 * **The negated-closing-keyword check** — GitHub issue #400.
 *
 * ## The defect this exists to stop, which is a real one and not a hypothetical
 *
 * Pull request #398 shipped half of issue #366 and said so, in bold, in its own body:
 *
 * > **This PR does not close #366.**
 *
 * GitHub closed #366 two seconds after the merge. Its closing-keyword parser looks for
 * `close #366` and **has no concept of negation** — the word *not* three characters earlier is
 * invisible to it. So a sentence written specifically to prevent a close performed one, the issue
 * was marked complete with four of its five acceptance criteria unmet, and nothing anywhere
 * produced an event saying so. It was found by a human reading the issue list.
 *
 * That is the worst shape a defect can have here: **the more carefully an author disclaims, the
 * more likely they are to trip it**, because a disclaimer is where a keyword and an issue number
 * end up next to each other. Writing *Refs #366* and saying nothing would have been safe.
 *
 * ## What it checks
 *
 * Every closing keyword GitHub itself acts on, in the pull request's body and in each of its commit
 * messages, classified into two:
 *
 * - **intentional** — reported, so which issues a merge will close is visible on the pull request
 *   before anybody presses the button rather than after;
 * - **negated** — a keyword with a negation in the {@link NEGATION_WINDOW} characters before it.
 *   These **fail the check**, which is what stops the merge: this repository's loop merges only a
 *   pull request whose checks are all green, so a red gate here is a close that cannot happen.
 *
 * Nothing here closes or reopens anything. It is a gate, not an actor — {@link scripts/gh_safe.sh}
 * does not even allow `gh issue reopen`, and a check that repaired the damage after the fact would
 * be racing GitHub for the same issue.
 *
 * ## Why a workflow and not a vitest test
 *
 * `blocked-by.yml`'s argument, unchanged: a pull request's body and commit list need the network,
 * and the test tiers have none. So the parsing and the decision are exported pure functions here,
 * `fetch` is confined to a `main()` that runs only when this file is the entry point, and
 * `packages/experiments/src/validation/closingKeywords.test.ts` drives the pure half against
 * fixtures — including the sentence from #398 that started this.
 *
 * ## What it deliberately does not do
 *
 * It does not forbid closing keywords, and it does not require one. A pull request that finishes an
 * issue should say so and GitHub should close it; that is the feature working. It also does not
 * try to judge whether the work is *actually* complete — no check can — which is why the report
 * exists: the author sees the list of issues this merge will close, on the pull request, while
 * there is still time to reword.
 */

/**
 * The keywords GitHub acts on, verbatim from its own documentation.
 *
 * All three verbs in all three forms. Written out rather than built from stems, because a stem
 * pattern would also match `closing`, `fixing` and `resolving`, which GitHub does **not** act on —
 * and a check that failed on *"closing out #366"* would be a check people learn to route around.
 */
export const CLOSING_KEYWORDS = Object.freeze([
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
]);

/** `close #366`, `Fixes owner/repo#12`, `resolved GH-7` — GitHub's accepted forms. */
export const KEYWORD_REFERENCE = new RegExp(
  String.raw`\b(${CLOSING_KEYWORDS.join('|')})\b\s*:?\s*` +
    String.raw`((?:[\w.-]+\/[\w.-]+)?#(\d+)|GH-(\d+))`,
  'giu',
);

/**
 * How far back a negation counts, in characters.
 *
 * Forty is enough for *"This PR does not close #366"* and for *"this does not, and will not,
 * close #366"*, and short enough that an unrelated *not* a sentence earlier does not reach. The
 * number is a judgement rather than a measurement and is stated as one; the cost of being wrong in
 * either direction is a report line rather than a wrong close, because a false *negated* fails the
 * check with the text quoted and a false *intentional* is the behaviour that already exists.
 */
export const NEGATION_WINDOW = 40;

/**
 * What turns a closing keyword into a promise **not** to close.
 *
 * A word-boundary pattern rather than a substring list, and the difference is a real miss: the
 * first draft matched `' not '` with spaces and sailed straight past *"Nothing here resolves
 * #12"*, where the negation is the subject and carries no leading space. This file's own test
 * caught it, which is the argument for the test existing.
 *
 * `no` is here because *"this no longer closes #12"* is a sentence somebody writes when splitting a
 * pull request in two — which is exactly the situation that produced #400.
 *
 * The contraction is matched **without** a leading word boundary, and that too was a miss this
 * file's test found: in `doesn't` the `n` is preceded by another letter, so `\bn't` matches
 * nothing. Both apostrophes, because a body pasted out of a document carries the typographic one.
 */
export const NEGATION =
  /(?:\b(?:not|never|no|none|nothing|nor|without|cannot)\b|n['’]t\b)/iu;

/** One keyword sighting, with enough context for a human to act on it. */
/**
 * @typedef {object} Sighting
 * @property {string} where   which text it was found in — `body`, or a commit sha
 * @property {number} issue   the issue number the keyword points at
 * @property {string} keyword the keyword itself, as written
 * @property {boolean} negated whether a negation precedes it inside {@link NEGATION_WINDOW}
 * @property {string} quote   the sentence fragment around it, for the report
 */

/** Every closing-keyword sighting in one piece of text. */
export function sightingsIn(text, where) {
  if (typeof text !== 'string' || text === '') return [];
  /** @type {Sighting[]} */
  const out = [];
  for (const match of text.matchAll(KEYWORD_REFERENCE)) {
    const at = match.index ?? 0;
    const before = text.slice(Math.max(0, at - NEGATION_WINDOW), at).toLowerCase();
    const issue = Number.parseInt(match[3] ?? match[4] ?? '0', 10);
    if (!Number.isFinite(issue) || issue <= 0) continue;
    out.push({
      where,
      issue,
      keyword: match[1] ?? '',
      negated: NEGATION.test(before),
      quote: text
        .slice(Math.max(0, at - NEGATION_WINDOW), at + match[0].length + 8)
        .replace(/\s+/gu, ' ')
        .trim(),
    });
  }
  return out;
}

/**
 * The verdict over a whole pull request.
 *
 * `ok` is false only for a negated keyword. An intentional one is reported and never refused —
 * see the header for why this is not a policy against closing issues from a pull request.
 */
export function verdictOf({ body = '', commits = [] } = {}) {
  const sightings = [
    ...sightingsIn(body, 'body'),
    ...commits.flatMap((commit) =>
      sightingsIn(commit.message ?? '', `commit ${String(commit.sha ?? '').slice(0, 8)}`),
    ),
  ];
  const negated = sightings.filter((one) => one.negated);
  const intentional = sightings.filter((one) => !one.negated);
  return {
    ok: negated.length === 0,
    negated,
    intentional,
    /** Issue numbers this merge will close, deduplicated and sorted — the report's headline. */
    willClose: [...new Set(intentional.map((one) => one.issue))].sort((a, b) => a - b),
  };
}

/** The run summary, in the shape `blocked-by.mjs` writes one. */
export function summaryOf(verdict) {
  const lines = ['## Closing keywords', ''];
  if (verdict.negated.length > 0) {
    lines.push(
      '### Refused — a negated closing keyword',
      '',
      'GitHub acts on the keyword and ignores the negation, so this text **will close the issue**',
      'it says it does not. Reword it so the keyword and the number are not adjacent — for example',
      '`#366 stays open after this` — or delete the disclaimer and let `Refs #366` carry it.',
      '',
    );
    for (const one of verdict.negated) {
      lines.push(`- **#${String(one.issue)}** in ${one.where}: “…${one.quote}…”`);
    }
    lines.push('');
  }
  lines.push(
    verdict.willClose.length === 0
      ? 'This pull request closes no issue.'
      : `Merging this will close: ${verdict.willClose.map((n) => `#${String(n)}`).join(', ')}.`,
  );
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The network half — runs only as the entry point
 * -------------------------------------------------------------------------- */

async function main() {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];
  const number = process.env['PR_NUMBER'];
  if (!token || !repo || !number) {
    console.error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required.');
    process.exit(2);
  }
  const api = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'elevator-sim-closing-keywords',
      },
    });
    if (!response.ok) {
      console.error(`GET ${path} -> ${String(response.status)}`);
      process.exit(2);
    }
    return response.json();
  };

  const pr = await api(`/repos/${repo}/pulls/${number}`);
  const commits = await api(`/repos/${repo}/pulls/${number}/commits?per_page=100`);
  const verdict = verdictOf({
    body: pr.body ?? '',
    commits: commits.map((entry) => ({ sha: entry.sha, message: entry.commit?.message ?? '' })),
  });

  const summary = summaryOf(verdict);
  console.log(summary);
  const out = process.env['GITHUB_STEP_SUMMARY'];
  if (out) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(out, `${summary}\n`);
  }
  process.exit(verdict.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
