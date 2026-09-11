/**
 * **The playtest personas are written in `docs/23`'s own words, and the two it does not define are
 * named** — the documentation half of GitHub issue #379.
 *
 * ## The ruling this guards
 *
 * The product owner, 2026-09-10, on #379: *"Personas for both documented audiences, written in
 * `docs/23`'s own words: the curious player and the practising engineer. Keep `five-minutes-phone`
 * and `number-averse`, and name who they are in the docs."* The harness half is a personas file in
 * `elevator-sim-test-harness`, a different repository this suite cannot read. What is checked here is
 * the half this repository owns: `docs/23-audiences-and-core-loop.md` § 1.5.
 *
 * ## Why the audiences are derived rather than listed
 *
 * *Both documented audiences* is two today because § 1 has two subsections that open a paragraph on
 * *What they arrive with*. This file reads those subsections out of § 1 rather than naming § 1.1 and
 * § 1.2, so a third audience written into § 1 turns it red until a persona is written for it.
 *
 * **"Own words" is checked as a substring, not as a similarity.** Each audience's whole *What they
 * arrive with* paragraph is read out of § 1 and must appear, whitespace and blockquote markers aside,
 * inside § 1.5. An edit to § 1.1 that § 1.5 does not follow is the stale-statement class `CLAUDE.md`
 * records, and it fails here on the commit that makes it.
 *
 * **The paragraph is read to its blank line, not to its first line break**, and a case below holds
 * that. The first draft of this file read it with a multiline `$`, which matches at every line end,
 * so it compared the first wrapped line of three and would have passed a persona that dropped the
 * other two.
 *
 * ## Why a premise needs a disposition
 *
 * Every persona carries a premise about people — ten minutes of patience, five minutes to spare, a
 * dislike of charts — and nothing in this repository has measured one. So § 1.5's table says of each
 * premise whether anything measured it, and a row that says **Measured** must cite a `path:line` that
 * exists, which is `documentRouting.test.ts`'s rule for a `checked` row applied to a persona.
 *
 * ## What this does **not** check
 *
 * - **Not the harness's file.** Whether the words the harness plays match § 1.5 is that repository's
 *   check to write.
 * - **Not that a persona is well chosen.** That is the owner's ruling, and a test cannot hold it.
 * - **Not the two harness personas the ruling does not name.** § 1.5 says in prose that they are
 *   neither kept nor dropped; a table row would need a standing this file has no word for, and
 *   inventing one would be deciding what the owner has not.
 * - **Not what the *who they are* prose says, beyond that it is there.** A measured claim written into
 *   that column is a review finding, not a regex.
 *
 * No `DECISIONS.md` entry: the ruling binds a file in another repository and nothing this repository's
 * code reads, and § 1.5 is its record here (§ D405).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const AUDIENCES_DOC = 'docs/23-audiences-and-core-loop.md';
const PERSONAS_HEADING = '### 1.5 ';

/** The ids the owner kept on #379, verbatim from the ruling. */
const KEPT_BY_THE_OWNER: readonly string[] = Object.freeze(['five-minutes-phone', 'number-averse']);

/** The two standings a persona row may carry, in the words § 1.5 writes them. */
const STANDINGS = Object.freeze(['documented audience', 'kept by the owner'] as const);
type Standing = (typeof STANDINGS)[number];

const source = (): string => readFileSync(join(ROOT, AUDIENCES_DOC), 'utf8');

/** Whitespace collapsed, so a line wrap in one copy and not the other is not a difference. */
const flat = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/**
 * The text from a heading line to the next heading at the same or a higher level.
 *
 * Throws rather than returning empty: a heading this guard cannot find would otherwise make every
 * case below pass over nothing, which is `RISKS.md` R40.
 */
function sectionFrom(text: string, headingPrefix: string): string {
  const start = text.indexOf(`\n${headingPrefix}`);
  if (start < 0) {
    throw new Error(
      `${AUDIENCES_DOC} has no heading starting "${headingPrefix.trim()}". Either it was renamed, ` +
        'or the section this guard reads was never written. Fix the pointer rather than deleting ' +
        'the case.',
    );
  }
  const level = headingPrefix.indexOf(' ');
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(new RegExp(`\\n#{1,${String(level)}} `, 'u'));
  return next < 0 ? rest : rest.slice(0, next + 1);
}

interface Audience {
  /** `1.1`, `1.2`, … */
  readonly section: string;
  readonly title: string;
  /** The whole *What they arrive with* paragraph, whitespace collapsed. */
  readonly arrivesWith: string;
}

/** Every § 1 subsection with a paragraph opening on *What they arrive with*. */
function documentedAudiences(): readonly Audience[] {
  const one = sectionFrom(source(), '## 1. ');
  const found: Audience[] = [];
  for (const match of one.matchAll(/\n### (1\.\d+) ([^\n]+)\n([\s\S]*?)(?=\n### |$)/gu)) {
    const [, section = '', title = '', body = ''] = match;
    // No `m` flag, on purpose: `$` has to mean the end of the body, or the paragraph ends at its
    // first line wrap. The lookahead stops it at the blank line that closes the paragraph.
    const marker = /(?:^|\n)\*\*What they arrive with\.\*\* ([\s\S]*?)(?=\n[ \t]*\n|$)/u.exec(body);
    if (marker === null) continue;
    found.push({ section, title: title.trim(), arrivesWith: flat(marker[1] ?? '') });
  }
  return found;
}

interface PersonaRow {
  /** The first cell, backticks and emphasis removed. */
  readonly persona: string;
  readonly standing: Standing | null;
  readonly standingText: string;
  readonly who: string;
  readonly premise: string;
}

/** The rows of § 1.5's table, the one whose header opens on `Persona`. */
function personaRows(): readonly PersonaRow[] {
  const lines = sectionFrom(source(), PERSONAS_HEADING).split('\n');
  const header = lines.findIndex((line) => /^\|\s*Persona\s*\|/u.test(line.trim()));
  if (header < 0) {
    throw new Error(
      `${AUDIENCES_DOC} § 1.5 has no table whose header opens on "Persona". The table was ` +
        'reformatted or removed; teach the parser or restore the table, but do not let it match ' +
        'nothing.',
    );
  }
  const rows: PersonaRow[] = [];
  for (const line of lines.slice(header + 2)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) break;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const [persona = '', standingText = '', who = '', premise = ''] = cells;
    const plain = standingText.replace(/\*/gu, '').trim().toLowerCase();
    rows.push({
      persona: persona.replace(/[`*]/gu, '').trim(),
      standing: STANDINGS.find((standing) => plain.startsWith(standing)) ?? null,
      standingText,
      who,
      premise,
    });
  }
  return rows;
}

describe('docs/23 § 1.5 — the playtest personas (GitHub issue #379)', () => {
  it('reads the audiences out of § 1, and does not read § 1.5 as one of them', () => {
    const audiences = documentedAudiences();
    expect(
      audiences.length,
      '§ 1 yields no subsection with a paragraph opening on *What they arrive with*, so nothing ' +
        'below has an audience to compare a persona against',
    ).toBeGreaterThan(0);
    expect(
      audiences.map((audience) => audience.section),
      'the personas section was read as an audience. It must not open a paragraph on the bold ' +
        'marker § 1.1 and § 1.2 use, or a persona becomes a third audience by formatting',
    ).not.toContain('1.5');
    expect(personaRows().length, 'the persona table has no rows').toBeGreaterThan(0);
  });

  it('reads each arrival paragraph to its end, not to its first line break', () => {
    const truncated = documentedAudiences()
      .filter((audience) => !/[.!?]$/u.test(audience.arrivesWith))
      .map((audience) => `§ ${audience.section}: …${audience.arrivesWith.slice(-40)}`);
    expect(
      truncated,
      'an arrival paragraph was read as ending mid-sentence, so the verbatim case below would ' +
        'compare a fragment of it',
    ).toEqual([]);
  });

  it('quotes every documented audience’s whole arrival paragraph, verbatim, inside § 1.5', () => {
    const personas = flat(sectionFrom(source(), PERSONAS_HEADING).replace(/^[ \t]*>[ \t]?/gmu, ''));
    const unquoted = documentedAudiences()
      .filter((audience) => !personas.includes(audience.arrivesWith))
      .map((audience) => `§ ${audience.section} ${audience.title}`);
    expect(
      unquoted,
      'a documented audience whose *What they arrive with* paragraph is not in § 1.5 word for ' +
        'word. The owner ruled the personas are written in docs/23’s own words; if § 1 changed, ' +
        'the persona changes on the same commit.',
    ).toEqual([]);
  });

  it('gives each documented audience exactly one persona row', () => {
    const defined = documentedAudiences()
      .map((audience) => audience.section)
      .sort();
    const claimed = personaRows()
      .filter((row) => row.standing === 'documented audience')
      .map((row) => /§\s*(1\.\d+)/u.exec(row.standingText)?.[1] ?? `(no § 1.x in "${row.standingText}")`)
      .sort();
    expect(
      claimed,
      'the persona rows standing as a *documented audience* do not correspond one-to-one with the ' +
        'audiences § 1 defines',
    ).toEqual(defined);
  });

  it('names each persona the owner kept, as not a documented audience, and says who they are', () => {
    const rows = personaRows();
    for (const id of KEPT_BY_THE_OWNER) {
      const row = rows.find((candidate) => candidate.persona === id);
      expect(row, `§ 1.5 has no row for \`${id}\`, which the owner kept`).toBeDefined();
      expect(row?.standing, `\`${id}\` does not stand as *kept by the owner*`).toBe(
        'kept by the owner',
      );
      expect(
        row?.standingText.toLowerCase() ?? '',
        `\`${id}\` does not say it is not a documented audience. § 1 names two; a kept persona ` +
          'that reads as a third is the drift the ruling asked the documents to prevent',
      ).toContain('not a documented audience');
      expect(
        flat(row?.who ?? '').length,
        `\`${id}\` has no *who they are*, and naming who they are is the ruling`,
      ).toBeGreaterThan(40);
    }
    const unplaced = personaRows()
      .filter((row) => row.standing === null)
      .map((row) => row.persona);
    expect(unplaced, 'a persona row that stands as neither of the two standings').toEqual([]);
  });

  it('says of every premise whether anything measured it, and a measured one cites a line that exists', () => {
    const problems: string[] = [];
    for (const row of personaRows()) {
      const cell = row.premise.replace(/\*/gu, '').trim();
      if (cell.startsWith('Unmeasured.')) continue;
      if (!cell.startsWith('Measured')) {
        problems.push(`${row.persona}: the premise opens on neither "Unmeasured." nor "Measured"`);
        continue;
      }
      const cited = [...cell.matchAll(/([\w./-]+\.[a-z]+):(\d+)/gu)];
      if (cited.length === 0) problems.push(`${row.persona}: "Measured" with no path:line`);
      for (const [, path = '', line = '0'] of cited) {
        const absolute = join(ROOT, path);
        const count = existsSync(absolute) ? readFileSync(absolute, 'utf8').split('\n').length : 0;
        if (count < Number(line)) problems.push(`${row.persona}: ${path}:${line} does not exist`);
      }
    }
    expect(
      problems,
      'a persona states a premise about players without saying what measured it. Nothing in this ' +
        'repository measures a player’s patience or a phone session; a premise is written ' +
        '*Unmeasured.* unless a run can be cited.',
    ).toEqual([]);
  });
});
