#!/usr/bin/env node
/**
 * The blocker check — GitHub issue #329, `RISKS.md` R45, DECISIONS.md § D485.
 *
 * ## What this exists to stop
 *
 * R45 is *a blocker that clears is not an event anything watches for, so work that could have
 * started does not.* It was realised three times in one wave: #179 closed and five issues stayed
 * labelled *blocked on a server* against a server that was complete and deployed; #280 merged hours
 * after the comment naming it as #275's blocker was written, and #275 sat blocked for a week; and a
 * triage snapshot said a sibling wave had not merged three hours before it did. Nothing produced an
 * event on the issue that named the blocker, so nothing noticed.
 *
 * ## The declared form, and why it is a fact rather than a state
 *
 * § D485 rules that a blocker is declared by a line in the issue body of the fixed form
 * `Blocked by #N` — written once and never edited. *"#275 is blocked by #280"* is a fact about what
 * #275's work depends on, and it stays true after #280 merges. What changes is a **derived**
 * property, whether the blocker is closed, and this script derives it by asking GitHub. So the
 * line's going stale is the detection mechanism rather than a failure of it, and a form that had
 * to be updated when the blocker cleared would require exactly the act nobody performs, which is
 * R45 rebuilt as its own solution. A label carries no target and a ledger column is a second
 * register; § D485 refuses both.
 *
 * ## The grammar this accepts, precisely
 *
 * A declaration is a **line** of the issue body that begins — after optional whitespace and an
 * optional Markdown list bullet — with the literal, case-sensitive text `Blocked by #` followed by
 * digits. One blocker per line; a body declares several by carrying several lines. Whatever follows
 * the number on the same line is ignored, so an author may append a reason (`Blocked by #340 —
 * needs the consent copy`) without the parser losing the declaration. Everything else is not a
 * declaration: `#N` cited anywhere else, `blocked by #N` mid-sentence, a lowercase variant, and any
 * line inside a fenced code block, which is how a body quotes the form without declaring it. The
 * grammar is narrow on purpose — a parser generous enough to read prose would report dependencies
 * nobody declared, and the vacuity floor below is what catches it being too narrow.
 *
 * ## Four constraints, each of which the obvious implementation gets wrong
 *
 * 1. **It cannot be a vitest test.** `everyday/buildNotes.test.ts` records the bound in its own
 *    words: it does not check whether an issue is still open because *that needs the network and
 *    this tier has none*. So this is a scheduled workflow (`.github/workflows/blocked-by.yml`) on
 *    the shape of `review.yml`'s gates job — a plain Node script, no dependencies, under narrow
 *    permissions — and the parsing and the decision are exported pure functions so that
 *    `validation/blockedBy.test.ts` can drive them against fixtures with no network at all.
 *
 * 2. **It does not fail the build on an unblocked issue.** An issue becoming unblocked is not a
 *    defect in the tree, and a red run over a backlog condition would be R40 wearing a different
 *    hat — a gate gating the wrong thing. It comments on the unblocked issue and writes the job
 *    summary, and exits 0 having done so.
 *
 * 3. **It fails on vacuity.** A parser that matches nothing reports *nothing is unblocked* forever
 *    and looks green permanently — the degradation `deadCode.test.ts` and `review-gates.mjs` both
 *    guard against by asserting they found something to check. § D485 sets the floor at **ten**
 *    declarations across all open issues: high enough that a broken parser is caught, low enough
 *    to reach in one backfill pass. Below it the run is red, and that red means *the parser or the
 *    backlog has changed shape*, never *an issue is unblocked*.
 *
 * 4. **It comments once.** Every comment this script posts carries a hidden marker per blocker it
 *    reports — `<!-- blocked-by: #N -->` — and an issue whose comments already carry the marker
 *    for a blocker is not told about that blocker again. The marker is per blocker rather than per
 *    issue so that an issue with two declarations, one of which closes a week after the other, is
 *    told about the second; and it is an HTML comment so that it survives a human editing the
 *    visible text. A blocker that closes, reopens and closes again is reported once, which is the
 *    right reading of *once*: the fact that it closed at all is what the issue's owner needed.
 *
 * ## What it reads, and what it may not
 *
 * Open issues only, and not pull requests: GitHub's issues endpoint returns both, and a pull
 * request's body is a change description rather than a work item, so declarations there would
 * count towards the floor without meaning what the floor measures. Blockers are looked up one at a
 * time by number, which is also how a blocker that is itself a pull request reads correctly — a
 * merged pull request is `closed` on that endpoint. A blocker that cannot be fetched (deleted,
 * transferred, a typo) is reported in the summary and treated as **not closed**: the direction
 * #329's AC3 names is that an issue whose blocker is still open must not be reported, and an
 * unknown blocker is not known to be closed.
 *
 * `main()` runs only when this file is the entry point, so importing the pure functions from a test
 * performs no network call and needs no token.
 */

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* -------------------------------------------------------------------------- *
 * The grammar
 * -------------------------------------------------------------------------- */

/**
 * The declared form, anchored to the start of a line.
 *
 * `(?!\d)` after the digits is not decoration: without it `Blocked by #12` would also be read out
 * of `Blocked by #123`, because `\d+` is greedy but a regex may still match a shorter prefix when
 * asked to. The boundary makes the number the whole number.
 */
export const DECLARATION = /^\s*(?:[-*+]\s+)?Blocked by #(\d+)(?!\d)/u;

/** The floor § D485 sets on declarations across all open issues; below it the run is red. */
export const VACUITY_FLOOR = 10;

/**
 * Every blocker an issue body declares, in order of first appearance, each once.
 *
 * Fenced code blocks are skipped so that a body can *quote* the form — an issue about this very
 * check does — without declaring a dependency on whatever number the example used.
 */
export function declaredBlockersOf(body) {
  const out = [];
  let inFence = false;
  for (const line of (body ?? '').split(/\r?\n/u)) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = DECLARATION.exec(line);
    if (match === null) continue;
    const id = Number(match[1]);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * The decision
 * -------------------------------------------------------------------------- */

/**
 * Open issues whose declared blockers include at least one that has closed.
 *
 * `closedIds` is the set of blocker numbers GitHub reports as closed. A blocker absent from it is
 * either open or unknown, and both mean *not reported* — the AC3 direction. A self-reference is
 * ignored rather than reported: an open issue cannot be a closed blocker of itself, and treating
 * the line as a declaration would only inflate the floor.
 */
export function unblockedOf(openIssues, closedIds) {
  const out = [];
  for (const issue of openIssues) {
    const declared = declaredBlockersOf(issue.body).filter((id) => id !== issue.number);
    const closed = declared.filter((id) => closedIds.has(id));
    if (closed.length === 0) continue;
    out.push({
      number: issue.number,
      title: issue.title,
      closed,
      stillOpen: declared.filter((id) => !closedIds.has(id)),
    });
  }
  return out;
}

/** The idempotency marker one comment carries per blocker it reports. */
export const markerFor = (blockerId) => `<!-- blocked-by: #${String(blockerId)} -->`;

/** Whether any existing comment on the issue already reported this blocker's closing. */
export function alreadyReported(comments, blockerId) {
  const marker = markerFor(blockerId);
  return comments.some((comment) => (comment.body ?? '').includes(marker));
}

/**
 * The comment posted on an issue whose blocker has closed.
 *
 * It says what closed and what has not, because an issue with two declarations is not unblocked
 * when one clears, and a comment reading *unblocked* over a dependency that still holds would be
 * this check manufacturing the defect it exists to catch. The markers go at the end, one per
 * blocker reported, invisible in the rendered comment.
 */
export function commentBodyFor(entry, newlyClosed) {
  const list = (ids) => ids.map((id) => `#${String(id)}`).join(', ');
  const head =
    newlyClosed.length === 1
      ? `${list(newlyClosed)}, which this issue declares as a blocker, has closed.`
      : `${list(newlyClosed)}, which this issue declares as blockers, have closed.`;
  const rest =
    entry.stillOpen.length === 0
      ? 'No declared blocker remains open, so this issue is ready to start unless something undeclared holds it.'
      : `Still open: ${list(entry.stillOpen)}, so this issue is not yet unblocked — but it is closer than its body says.`;
  const why =
    'Posted by `scripts/blocked-by.mjs` on its daily run (RISKS.md R45, DECISIONS.md § D485). ' +
    'The `Blocked by #N` line is a fact and is not edited; this comment is the event it never produced on its own.';
  return [head, rest, why, ...newlyClosed.map(markerFor)].join('\n\n');
}

/**
 * The whole decision, from data already fetched.
 *
 * `commentsByIssue` maps an issue number to the comments already on it; an issue with no entry is
 * read as having none. `ok` is the vacuity verdict and nothing else — an unblocked issue never
 * makes it false, per constraint 2 above.
 */
export function reportOf(openIssues, closedIds, commentsByIssue = new Map()) {
  const declarations = openIssues.reduce(
    (sum, issue) => sum + declaredBlockersOf(issue.body).length,
    0,
  );
  const unblocked = unblockedOf(openIssues, closedIds);
  const toComment = [];
  for (const entry of unblocked) {
    const comments = commentsByIssue.get(entry.number) ?? [];
    const fresh = entry.closed.filter((id) => !alreadyReported(comments, id));
    if (fresh.length > 0) toComment.push({ ...entry, newlyClosed: fresh });
  }
  const ok = declarations >= VACUITY_FLOOR;
  return { declarations, floor: VACUITY_FLOOR, ok, unblocked, toComment };
}

/** The job summary, as Markdown for `$GITHUB_STEP_SUMMARY`. */
export function summaryOf(report, { unknownBlockers = [], dryRun = false } = {}) {
  const lines = [
    '## Blocked-by check',
    '',
    `Declarations found across open issues: **${String(report.declarations)}** (floor ${String(report.floor)}).`,
    '',
  ];
  if (!report.ok) {
    lines.push(
      `**RED — fewer than ${String(report.floor)} \`Blocked by #N\` declarations.** This is the vacuity floor from § D485: ` +
        'either the parser no longer reads the form, or the backlog has drained below it. It is not a statement about any issue.',
      '',
    );
  }
  if (report.unblocked.length === 0) {
    lines.push('No open issue declares a blocker that has closed.', '');
  } else {
    lines.push('| issue | closed blockers | still open | comment |', '|---|---|---|---|');
    for (const entry of report.unblocked) {
      const fresh = report.toComment.find((candidate) => candidate.number === entry.number);
      const verdict =
        fresh === undefined
          ? 'already reported'
          : dryRun
            ? `would post for ${fresh.newlyClosed.map((id) => `#${String(id)}`).join(', ')}`
            : `posted for ${fresh.newlyClosed.map((id) => `#${String(id)}`).join(', ')}`;
      lines.push(
        `| #${String(entry.number)} ${entry.title} | ${entry.closed.map((id) => `#${String(id)}`).join(', ')} | ` +
          `${entry.stillOpen.length === 0 ? '—' : entry.stillOpen.map((id) => `#${String(id)}`).join(', ')} | ${verdict} |`,
      );
    }
    lines.push('');
  }
  if (unknownBlockers.length > 0) {
    lines.push(
      `Declared blockers that could not be fetched and were treated as not closed: ${unknownBlockers
        .map((id) => `#${String(id)}`)
        .join(', ')}.`,
      '',
    );
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The network, confined to the entry point
 * -------------------------------------------------------------------------- */

const API = 'https://api.github.com';

async function github(token, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'elevator-sim blocked-by check',
      ...(init.headers ?? {}),
    },
  });
  return response;
}

/** Every page of a list endpoint, at 100 a page, until a short page. */
async function listAll(token, path) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await github(token, `${path}${separator}per_page=100&page=${String(page)}`);
    if (!response.ok) throw new Error(`GET ${path} page ${String(page)}: HTTP ${String(response.status)}`);
    const items = await response.json();
    out.push(...items);
    if (items.length < 100) return out;
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const dryRun = process.argv.includes('--dry-run') || process.env.BLOCKED_BY_DRY_RUN === '1';
  if (!token || !repository) {
    console.error('blocked-by: GITHUB_TOKEN (or GH_TOKEN) and GITHUB_REPOSITORY must be set.');
    process.exit(2);
  }
  const base = `/repos/${repository}`;

  // Pull requests come back from the issues endpoint too, distinguished only by this key.
  const openIssues = (await listAll(token, `${base}/issues?state=open`)).filter(
    (item) => item.pull_request === undefined,
  );
  console.log(`blocked-by: ${String(openIssues.length)} open issues`);

  const blockerIds = new Set();
  for (const issue of openIssues) {
    for (const id of declaredBlockersOf(issue.body)) blockerIds.add(id);
  }

  const closedIds = new Set();
  const unknownBlockers = [];
  for (const id of blockerIds) {
    const response = await github(token, `${base}/issues/${String(id)}`);
    if (!response.ok) {
      unknownBlockers.push(id);
      continue;
    }
    const blocker = await response.json();
    if (blocker.state === 'closed') closedIds.add(id);
  }

  const candidates = unblockedOf(openIssues, closedIds);
  const commentsByIssue = new Map();
  for (const entry of candidates) {
    commentsByIssue.set(entry.number, await listAll(token, `${base}/issues/${String(entry.number)}/comments`));
  }

  const report = reportOf(openIssues, closedIds, commentsByIssue);

  for (const entry of report.toComment) {
    const body = commentBodyFor(entry, entry.newlyClosed);
    if (dryRun) {
      console.log(`blocked-by: would comment on #${String(entry.number)}:\n${body}\n`);
      continue;
    }
    const response = await github(token, `${base}/issues/${String(entry.number)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      // A comment that cannot be posted is the permissions question § D485 leaves open, and it is
      // answered here rather than swallowed: the run goes red naming the status, so the first
      // scheduled firing tells the reader whether `issues: write` was granted.
      throw new Error(`POST comment on #${String(entry.number)}: HTTP ${String(response.status)}`);
    }
    console.log(`blocked-by: commented on #${String(entry.number)} for ${entry.newlyClosed.map((id) => `#${String(id)}`).join(', ')}`);
  }

  const summary = summaryOf(report, { unknownBlockers, dryRun });
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (!report.ok) process.exit(1);
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(`blocked-by: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
