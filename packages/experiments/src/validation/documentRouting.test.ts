/**
 * **A specification's own registers must be routed** — `docs/35-problem-per-mode.md` § 10, § 11 and
 * § 12 against its § 13.
 *
 * ## The defect this exists for
 *
 * GitHub issue **#342**: `docs/35-problem-per-mode.md` landed on 2026-09-01 specifying fourteen code
 * changes, flagging nine unverified claims and routing five open questions — and **no issue in the
 * backlog cited it**. Three of its questions were unowned product decisions gating five open issues,
 * and a reader working one of those issues would not have learned that the blocking question had
 * been written down, costed and given candidates.
 *
 * `RISKS.md` **R42** is *a decision recorded and never implemented*, and is described there as
 * failing one level earlier than a dead seam because a decision has no exports to scan. This is one
 * level earlier still: **a specification recorded and never routed.** It breaks no test, produces no
 * dead export and contradicts no shipped sentence.
 *
 * ## Why the existing guards missed it, stated precisely because the difference is the design
 *
 * `citations.test.ts` asserts that every reference **points at** something real — every `§ Dnnn` and
 * every cited path resolves. That is the **outgoing** direction. Nothing checks that something real
 * **is pointed at**, and the incoming direction is not writable in general: an orphan is only
 * detectable against a definition of what should have adopted it, and no test in this repository can
 * read GitHub.
 *
 * **What is writable is the narrow form**, and it is what this file does: a document that declares
 * its own registers can be required to route them. § 10 is a numbered table of changes, § 11 a
 * numbered list of unverified claims, § 12 a table of questions. Each is a closed set the document
 * publishes about itself, so *"every member is dispositioned in § 13"* is a mechanical claim.
 *
 * ## What this does **not** check, so the guard is not read as more than it is
 *
 * - **Not that any GitHub issue exists.** A § 13.3 row reading `issue #208` is a claim about a
 *   number. If #208 closes tomorrow this file stays green and that table is stale.
 * - **Not the next `docs/3x`.** The subject is named. A general rule — *every governing document has
 *   a routing section* — needs a definition of *governing* that nothing can derive, and a guard whose
 *   predicate is a hand-maintained list is a convention wearing a test. `contentPlan.test.ts` earns
 *   its keep because its subject is a **count**; a routing table's subject is a **judgement**.
 * - **Not that an owner is a person or that a review happened.** § 13.1 names roles and forcing
 *   events because that is what is true, and a date column would be a fabrication.
 *
 * ## The guard on the guard
 *
 * Every parser asserts it found what it expected: a reformatted table, a renamed heading or a regex
 * that stops matching makes this file **red** rather than vacuous. That is `RISKS.md` **R40**, and
 * it is the clause `contentPlan.test.ts`, `phaseStatus.test.ts` and `citations.test.ts` all carry.
 *
 * One check goes further than presence. Every § 13.4 row marked `checked` must cite at least one
 * `path:line`, and **that file must exist with at least that many lines** — a citation that rots is
 * caught here, which is `citations.test.ts`'s subject applied to a claim's evidence rather than to a
 * document's links.
 *
 * See [`DECISIONS.md`](../../../../DECISIONS.md) § D493.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SPEC = 'docs/35-problem-per-mode.md';

const source = (): string => readFileSync(join(ROOT, SPEC), 'utf8');

/**
 * The text of one `## n.` or `### n.n` section, up to the next heading of the same or higher level.
 *
 * Throws rather than returning empty: a heading this file cannot find is the failure mode the
 * docstring calls vacuity, and a silent empty string would make every case below pass.
 */
function section(heading: string): string {
  const text = source();
  const start = text.indexOf(`\n${heading}`);
  if (start < 0) {
    throw new Error(
      `${SPEC} has no heading "${heading}". Either it was renamed, or this guard is reading a ` +
        'document it no longer describes. Fix the pointer rather than deleting the case.',
    );
  }
  const level = heading.slice(0, heading.indexOf(' ')).length;
  const rest = text.slice(start + 1);
  const next = rest.search(new RegExp(`\\n#{1,${String(level)}} `, 'u'));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Left-hand cells of a markdown table's body rows, in order. */
function firstCells(table: string): readonly string[] {
  const cells: string[] = [];
  for (const line of table.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const parts = trimmed.split('|').slice(1, -1);
    const first = parts[0]?.trim() ?? '';
    if (first === '' || /^-+:?$/u.test(first) || /^:?-+/u.test(first)) continue;
    cells.push(first);
  }
  return cells;
}

/** Whole body rows of a markdown table, keyed by their first cell. */
function rowsByFirstCell(table: string): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();
  for (const line of table.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const parts = trimmed.split('|').slice(1, -1);
    const first = parts[0]?.trim() ?? '';
    if (first === '' || /^:?-+:?$/u.test(first)) continue;
    rows.set(first, trimmed);
  }
  return rows;
}

/** The digits in a cell like `2`, `| 12 |` or `**Q3**`. */
const keyOf = (cell: string): string => cell.replace(/[^0-9A-Za-z]/gu, '');

/* -------------------------------------------------------------------------- *
 * § 10 — the fourteen specified code changes
 * -------------------------------------------------------------------------- */

const SPECIFIED_CHANGES = 14;

/** A disposition is one of four words, so a reconciliation cannot decay into prose. */
const DISPOSITION = /(issue #\d+|new issue —|out of scope —|built —)/u;

describe(`${SPEC} § 10 — every specified code change is routed`, () => {
  it('declares fourteen changes, numbered 1 to 14', () => {
    // The header cell is `#`, which carries no key. Dropped by name rather than by "keyOf is
    // empty", so a genuinely blank first cell in a body row still fails this case.
    const declared = firstCells(section('## 10.'))
      .filter((cell) => cell !== '#')
      .map(keyOf);
    expect(
      declared,
      '§ 10 no longer lists rows 1–14. Either the table moved or this parser stopped matching it; ' +
        'either way the cases below would assert nothing.',
    ).toEqual(Array.from({ length: SPECIFIED_CHANGES }, (_, i) => String(i + 1)));
  });

  it('routes each of them exactly once in § 13.3, with a disposition from the closed vocabulary', () => {
    const routed = rowsByFirstCell(section('### 13.3'));
    const missing: string[] = [];
    const looseWording: string[] = [];
    for (let n = 1; n <= SPECIFIED_CHANGES; n += 1) {
      const row = routed.get(String(n));
      if (row === undefined) {
        missing.push(String(n));
        continue;
      }
      if (!DISPOSITION.test(row)) looseWording.push(String(n));
    }
    expect(
      missing,
      'these § 10 rows have no row in § 13.3. A specification whose items map to nothing is a plan ' +
        'nobody is executing — GitHub issue #342. Add the row, or say out of scope with the ground.',
    ).toEqual([]);
    expect(
      looseWording,
      'these § 13.3 rows carry no disposition from the closed vocabulary (issue #N / new issue — / ' +
        'out of scope — / built —). The vocabulary is closed because an open one is how a ' +
        'reconciliation turns back into prose.',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * § 11 — the nine unverified claims
 * -------------------------------------------------------------------------- */

const UNVERIFIED_CLAIMS = 9;

describe(`${SPEC} § 11 — every unverified claim is checked or recorded open`, () => {
  it('still declares nine of them', () => {
    const heading = /### Unverified — (\w+), each with the check that would settle it/u.exec(
      source(),
    );
    expect(
      heading,
      '§ 11 no longer carries its "Unverified — nine" heading, so this guard cannot tell how many ' +
        'claims it should find.',
    ).not.toBeNull();
    expect((heading as RegExpExecArray)[1]).toBe('nine');

    const list = section('### Unverified —');
    const numbered = [...list.matchAll(/^\d+\. \*\*/gmu)].length;
    expect(
      numbered,
      `§ 11 lists ${String(numbered)} numbered claims and its own heading says nine.`,
    ).toBe(UNVERIFIED_CLAIMS);
  });

  it('disposes of each in § 13.4 as checked or open', () => {
    const rows = rowsByFirstCell(section('### 13.4'));
    const missing: string[] = [];
    const undecided: string[] = [];
    for (let n = 1; n <= UNVERIFIED_CLAIMS; n += 1) {
      const row = rows.get(String(n));
      if (row === undefined) {
        missing.push(String(n));
        continue;
      }
      if (!/\b(checked|open|ruled)\b/u.test(row)) undecided.push(String(n));
    }
    expect(
      missing,
      'these § 11 claims have no verdict row in § 13.4. A claim recorded as open is a good ' +
        'outcome; a claim with no row at all is the one this guard exists to catch.',
    ).toEqual([]);
    expect(
      undecided,
      'these § 13.4 rows say neither checked nor open nor ruled. § D227: a claim asserted without ' +
        'its check is worse than a claim recorded as unverified.',
    ).toEqual([]);
  });

  it('backs every `checked` verdict with a file:line that resolves on disk', () => {
    const rows = [...rowsByFirstCell(section('### 13.4')).entries()].filter(([key]) =>
      /^\d+$/u.test(key),
    );
    expect(rows.length, '§ 13.4 has no numbered rows, so this case asserts nothing').toBe(
      UNVERIFIED_CLAIMS,
    );

    const dangling: string[] = [];
    let citations = 0;
    for (const [key, row] of rows) {
      if (!/\bchecked\b/u.test(row)) continue;
      const cited = [...row.matchAll(/`(packages\/[\w./-]+\.ts):(\d+)(?:-\d+)?`/gu)];
      expect(
        cited.length,
        `§ 13.4 claim ${key} is marked checked and cites no packages/…:line. A verdict without its ` +
          'evidence is the failure this table exists to prevent.',
      ).toBeGreaterThan(0);
      for (const [, path, line] of cited) {
        citations += 1;
        const absolute = join(ROOT, path as string);
        if (!existsSync(absolute)) {
          dangling.push(`${key}: ${String(path)} does not exist`);
          continue;
        }
        const lines = readFileSync(absolute, 'utf8').split('\n').length;
        if (Number(line) > lines) {
          dangling.push(`${key}: ${String(path)} has ${String(lines)} lines, cited at ${String(line)}`);
        }
      }
    }
    expect(citations, 'no checked claim cited a file at all, so this case asserted nothing').
      toBeGreaterThan(0);
    expect(
      dangling,
      'a checked claim cites evidence that has moved. Re-read the code and re-cite it, or move the ' +
        'claim back to open — a citation nobody can follow is how a verified claim becomes a ' +
        'stated mechanism that has gone stale.',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * § 12 — the open questions
 * -------------------------------------------------------------------------- */

describe(`${SPEC} § 12 — every open question has a disposition`, () => {
  it('routes each question § 12 declares', () => {
    const declared = firstCells(section('### Open questions')).filter((cell) => /Q\d/u.test(cell));
    expect(
      declared.length,
      '§ 12 declares no questions, so this case asserts nothing. The table was renamed or ' +
        'reformatted.',
    ).toBeGreaterThan(0);

    const disposed = rowsByFirstCell(section('### 13.1'));
    const missing = declared
      .map(keyOf)
      .filter((key) => !disposed.has(`**${key}**`) && !disposed.has(key));
    expect(
      missing,
      'these § 12 questions have no disposition row in § 13.1. Every question is answered, ' +
        'explicitly deferred with a reason, or named as owed to a role with the event that forces ' +
        'it — GitHub issue #342 asks for exactly that and forbids inventing a person.',
    ).toEqual([]);
  });

  it('names a role and a forcing event for what is still owed, and no individual', () => {
    const routing = section('### 13.1');
    expect(
      /No individual is named/u.test(routing),
      '§ 13.1 no longer says that no individual is named. It is the honest form of an owner column ' +
        'in a repository with no human roster, and § D349 is why.',
    ).toBe(true);
    expect(
      /Forcing event/u.test(routing),
      '§ 13.1 no longer names a forcing event. A date this repository writes for itself is a date ' +
        'nobody agreed to; an event is checkable by the person it forces.',
    ).toBe(true);
  });
});
