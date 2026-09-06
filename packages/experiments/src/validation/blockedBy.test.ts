/**
 * The blocker check's grammar and decision, driven against fixtures — GitHub issue #329,
 * `RISKS.md` R45, [§ D485](../../../../DECISIONS.md).
 *
 * ## Why the decision is tested here and the network is not
 *
 * § D485's first constraint is that the check *cannot be a vitest test*: whether an issue is still
 * open needs the network and this tier has none. So `scripts/blocked-by.mjs` keeps its parsing and
 * its decision in exported pure functions, confines `fetch` to a `main()` that runs only when the
 * script is the entry point, and this file imports the pure half. Importing it performs no request
 * and needs no token — which is asserted below by construction rather than by a mock, because
 * the import happens at module load and any network call there would fail this tier outright.
 *
 * ## The direction that is asserted rather than assumed
 *
 * #329's AC3: **an issue whose blocker is still open must not be reported.** The obvious way to
 * write this check reports every issue that *declares* a blocker, which is every issue this check
 * would ever read, and it would look correct on a backlog where most blockers had in fact closed.
 * So the fixture below carries an open blocker beside a closed one and requires the open one to
 * produce nothing.
 *
 * ## The vacuity floor is tested at the boundary
 *
 * Nine declarations is red and ten is green. A test that only checked *zero is red* would pass a
 * floor of one, which § D485 raised to ten precisely because a parser can half-work — reading one
 * form of the line and missing another — and one declaration is not enough to notice.
 *
 * This file lives in `validation/` rather than beside the script because that is where this
 * repository keeps its repository-level guards; `scripts/review-gates.mjs` has no test of its own,
 * so there was no closer precedent to follow.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  VACUITY_FLOOR,
  alreadyReported,
  commentBodyFor,
  declaredBlockersOf,
  markerFor,
  reportOf,
  summaryOf,
  unblockedOf,
  type OpenIssue,
} from '../../../../scripts/blocked-by.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const issue = (number: number, body: string, title = `issue ${String(number)}`): OpenIssue => ({
  number,
  title,
  body,
});

describe('the grammar — a line of the fixed form `Blocked by #N`', () => {
  it('parses one line', () => {
    expect(declaredBlockersOf('Some context.\n\nBlocked by #280\n\nMore context.')).toEqual([280]);
  });

  it('parses several, each once, in order of appearance', () => {
    const body = ['Blocked by #340', 'Blocked by #201', '- Blocked by #340', 'Blocked by #234.'].join('\n');
    expect(declaredBlockersOf(body)).toEqual([340, 201, 234]);
  });

  it('tolerates a list bullet, leading whitespace, CRLF, and a reason after the number', () => {
    expect(declaredBlockersOf('  * Blocked by #12 — until the consent copy lands\r\nBlocked by #13\r\n')).toEqual([
      12, 13,
    ]);
  });

  it('ignores `#N` mentions that are not on a `Blocked by` line', () => {
    const body = [
      'See #101 for the discussion, and #102 is a duplicate.',
      'This is not blocked by #103 any more.',
      'Was Blocked by #104 once, but the sentence does not start the line.',
      'blocked by #105',
      'Blocked by#106',
      'Blocked by #',
      '```',
      'Blocked by #107',
      '```',
      '> a quotation is not a declaration either: Blocked by #108',
    ].join('\n');
    expect(declaredBlockersOf(body)).toEqual([]);
  });

  it('reads the whole number, not a prefix of it', () => {
    expect(declaredBlockersOf('Blocked by #1234')).toEqual([1234]);
  });

  it('reads an absent body as declaring nothing', () => {
    expect(declaredBlockersOf(null)).toEqual([]);
    expect(declaredBlockersOf(undefined)).toEqual([]);
  });
});

describe('the decision', () => {
  const open = [
    issue(275, 'Blocked by #280', 'the one whose blocker merged'),
    issue(221, 'Blocked by #179', 'the one that sat unnoticed'),
    issue(250, 'Blocked by #340\nBlocked by #201', 'two declarations, one open'),
    issue(236, 'Blocked by #340', 'blocker still open'),
    issue(300, 'No declaration at all; mentions #280 in passing.'),
    issue(301, 'Blocked by #301', 'declares itself'),
  ];
  const closed = new Set([280, 179, 201]);

  it('reports an issue whose blocker is closed', () => {
    const numbers = unblockedOf(open, closed).map((entry) => entry.number);
    expect(numbers).toContain(275);
    expect(numbers).toContain(221);
  });

  it('does NOT report an issue whose blocker is still open — #329 AC3', () => {
    const numbers = unblockedOf(open, closed).map((entry) => entry.number);
    expect(numbers).not.toContain(236);
    // Nor an issue that merely mentions a closed number, nor one that names itself.
    expect(numbers).not.toContain(300);
    expect(numbers).not.toContain(301);
  });

  it('says which blockers still hold when only some have closed', () => {
    const entry = unblockedOf(open, closed).find((candidate) => candidate.number === 250);
    expect(entry).toEqual({ number: 250, title: 'two declarations, one open', closed: [201], stillOpen: [340] });
    expect(commentBodyFor(entry as NonNullable<typeof entry>, [201])).toMatch(/Still open: #340/u);
    expect(commentBodyFor(entry as NonNullable<typeof entry>, [201])).not.toMatch(/ready to start/u);
  });

  it('treats an unknown blocker as not closed, so it is never reported on that account', () => {
    // 999 is in nobody's closed set: whether it is open or unfetchable, the answer is the same.
    expect(unblockedOf([issue(1, 'Blocked by #999')], new Set([280]))).toEqual([]);
  });
});

describe('commenting once', () => {
  const entry = { number: 275, title: 't', closed: [280], stillOpen: [] as number[] };

  it('the comment it posts carries the marker the next run looks for', () => {
    const body = commentBodyFor(entry, [280]);
    expect(body).toContain(markerFor(280));
    expect(alreadyReported([{ body }], 280)).toBe(true);
    // The marker is per blocker: the same comment says nothing about #281.
    expect(alreadyReported([{ body }], 281)).toBe(false);
  });

  it('does not re-report an issue whose comments already name that blocker', () => {
    const comments = new Map([[275, [{ body: 'human chatter' }, { body: commentBodyFor(entry, [280]) }]]]);
    const report = reportOf([issue(275, 'Blocked by #280')], new Set([280]), comments);
    expect(report.unblocked.map((candidate) => candidate.number)).toEqual([275]);
    expect(report.toComment).toEqual([]);
  });

  it('does report a second blocker that closed after the first was reported', () => {
    const two = issue(250, 'Blocked by #340\nBlocked by #201');
    const comments = new Map([[250, [{ body: commentBodyFor({ ...entry, number: 250, closed: [201] }, [201]) }]]]);
    const report = reportOf([two], new Set([340, 201]), comments);
    expect(report.toComment.map((candidate) => candidate.newlyClosed)).toEqual([[340]]);
  });

  it('a marker-free comment, however similar its prose, does not count as a report', () => {
    expect(alreadyReported([{ body: '#280 has closed.' }, { body: null }], 280)).toBe(false);
  });
});

describe('the vacuity floor — § D485 sets it at ten', () => {
  const declaring = (count: number): OpenIssue[] =>
    Array.from({ length: count }, (_, index) => issue(1000 + index, `Blocked by #${String(2000 + index)}`));

  it('is ten', () => {
    expect(VACUITY_FLOOR).toBe(10);
  });

  it('nine declarations is a failure, and the summary says it is about the parser rather than an issue', () => {
    const report = reportOf(declaring(9), new Set());
    expect(report.declarations).toBe(9);
    expect(report.ok).toBe(false);
    expect(summaryOf(report)).toMatch(/RED — fewer than 10/u);
    expect(summaryOf(report)).toMatch(/not a statement about any issue/u);
  });

  it('ten is green', () => {
    expect(reportOf(declaring(10), new Set()).ok).toBe(true);
  });

  it('an unblocked issue never makes the verdict red — the check reports, it does not gate', () => {
    const report = reportOf(declaring(10), new Set([2000, 2001, 2002]));
    expect(report.unblocked).toHaveLength(3);
    expect(report.ok).toBe(true);
  });

  it('counts every declaration, so two lines on one issue are two towards the floor', () => {
    const report = reportOf([...declaring(8), issue(5, 'Blocked by #6\nBlocked by #7')], new Set());
    expect(report.declarations).toBe(10);
    expect(report.ok).toBe(true);
  });
});

describe('the wiring — the script is scheduled, and under the permissions it needs', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'blocked-by.yml'), 'utf8');

  it('runs the script on a schedule and on demand', () => {
    expect(workflow).toMatch(/^\s+schedule:/mu);
    expect(workflow).toMatch(/^\s+workflow_dispatch:/mu);
    expect(workflow).toMatch(/node scripts\/blocked-by\.mjs/u);
  });

  it('grants issue writes and content reads, and nothing wider', () => {
    // The whole permissions block, at job level, exactly these two.
    const block = /permissions:\n((?:\s+[a-z-]+: [a-z]+\n)+)/u.exec(workflow);
    expect(block, 'no permissions block').not.toBeNull();
    const grants = (block?.[1] ?? '')
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .sort();
    expect(grants).toEqual(['contents: read', 'issues: write']);
  });

  it('is also reachable from `package.json`, as `review-gates.mjs` is', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['blocked-by']).toBe('node scripts/blocked-by.mjs');
  });
});
