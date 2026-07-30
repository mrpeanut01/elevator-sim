/**
 * **Binding a phase's stated status to evidence that exists.**
 *
 * `docs/07-handoff.md` § 8 records the largest un-mechanised risk in this repository as its own
 * line of open debt: *"No test asserts any phase's **status**. The guards assert that the four
 * documents **agree** with each other, not that they are **true**. `documentation.test.ts` would be
 * perfectly happy with four documents that agreed and were all wrong."* This file is the
 * complement of that guard. `documentation.test.ts` asks whether the documents say the same thing;
 * this one asks whether what they say is anchored to anything.
 *
 * ## What this guard actually proves — read this before quoting it
 *
 * It proves exactly one property, and it is a weak one stated precisely rather than a strong one
 * stated loosely:
 *
 * > **Every phase the roadmap marks accepted names concrete evidence, and every artefact it names
 * > exists and is reachable in this tree.**
 *
 * It does **not** prove:
 *
 * - **that the measurements behind a verdict are correct.** A phase citing
 *   `packages/core/src/analytical/validation.test.ts` passes this guard whether that suite asserts
 *   a 1 % residual or a 100 % one. Re-deriving the numbers is `benchmark/published.test.ts`'s job
 *   for published intervals, and each phase's own gate suite's job for the rest.
 * - **that a cited test asserts the criterion it is cited for.** The citation is checked for
 *   existence, not for relevance. A phase could cite an unrelated but real test and pass.
 * - **that the acceptance criterion is the right criterion.** `CLAUDE.md` § Working agreements
 *   forbids weakening one; nothing mechanical here can tell a raise from a weakening, and § D27's
 *   raise is exactly the case that shows why — it looked like a swap and was argued to be a raise.
 * - **that a phase claiming *partial* or *deferred* is not secretly finished.** The asymmetry is
 *   deliberate: over-claiming is the failure this repository has actually shipped.
 *
 * So the residual risk after this file is *"the cited evidence exists but does not support the
 * verdict"*, which is narrower than *"nothing anchors the verdict at all"* and is stated in
 * `docs/07` § 8's own terms rather than quietly declared closed.
 *
 * ## Why it is derived rather than written down
 *
 * The phase set, each phase's status and each phase's evidence are **parsed out of
 * `docs/05-roadmap.md`**, which `CLAUDE.md` § Working agreements names as the document that carries
 * phase status. A hand-written phase list in this file would be the defect
 * `src/index.test.ts` § *study entry points* fixed by deriving its domain from the directory: a
 * tenth phase added tomorrow would be invisible to a guard that knows about nine. Add a
 * `## Phase N` section and it is in scope on the next run; mark it accepted and it must name
 * evidence that resolves.
 *
 * The same rule applies to the guard's own scope. Every derivation below is asserted **non-vacuous**
 * — a parse that found no phases, no accepted phases, no evidence or no tables would otherwise make
 * every assertion in this file pass by not looking, which is the shape of the tautological guard
 * `docs/05` § Phase 7 records surviving a review as *fixed*.
 *
 * ## The three evidence classes
 *
 * A citation is a backticked span inside the phase's own section, classified by shape:
 *
 * | class | shape | resolved against |
 * |---|---|---|
 * | **path** | ends `.ts` / `.js` / `.json` / `.md`, or a directory ending `/` | the files on disk |
 * | **study function** | `runXxx` / `measureXxx` / `auditXxx` / `formatXxx`, called or bare | a declaration under `packages/…/src`, and for a member of `STUDY_ENTRY_POINTS`, an `export` |
 * | **pinned estimate** | a key of {@link PINNED_ESTIMATES} | a non-empty pin group |
 *
 * A `.js` citation resolves through its `.ts` source, because a roadmap reproduction instruction
 * names the built artefact (`node packages/experiments/dist/…`) while the repository ships the
 * source.
 *
 * ## Watched failing, on the real documents, before it was allowed to pass
 *
 * A guard nobody has seen fail is not a guard, and this repository has twice shipped an audit that
 * under-reported and once a tautology that survived being flagged and reported fixed. Ten mutations
 * were applied to `docs/05-roadmap.md` (or to the tree it cites) and each was watched red:
 *
 * | mutation | what went red |
 * |---|---|
 * | § Phase 6c marked `**ACCEPTED**` | 4 tests — the derived Phase 6 status, 6c's own status, 6c's missing evidence, and the disagreement with `docs/07` § 1 |
 * | a `## Phase 9` added, accepted, citing nothing | 3 — the evidence classifier, the gate-citation rule, and the phase-set equality |
 * | `analytical/validation.test.ts` moved off disk | 2 — § Phase 2's citation, and the control that asserts the same citation resolving |
 * | every `## Phase` heading renamed | 11 — the non-vacuity bounds, not a silent pass |
 * | § Phase 7's first criterion flipped to `NOT MET` | 1 |
 * | § Phase 8's *Scale & performance* track set to ⚠️ | 1 |
 * | § Phase 8's property-violation count set to `1` | 1 |
 * | `runPhase7Acceptance()` renamed in the prose only | 1 |
 * | § Phase 7's second requirement de-✅'d | 2 — the requirement table and the ⬜ disposition rule |
 * | § Phase 0's `**Status:**` line deleted | 3 — the unstated-status rule and the phase-set checks |
 *
 * The two the task that commissioned this file named specifically are the first and the second.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PINNED_ESTIMATES, STUDY_ENTRY_POINTS } from '../benchmark/published.js';
import { code, corpus } from '../tuning/callers.test-helper.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

/* -------------------------------------------------------------------------- *
 * The status vocabulary
 * -------------------------------------------------------------------------- */

/**
 * The statuses a phase may carry.
 *
 * `not-accepted` is a real member rather than a synonym for `not-started`: `docs/05` § Phase 7
 * carried it for a while, between [review finding #1](../../../../docs/08-review-findings.md)
 * withdrawing the acceptance and the blockers being closed. A vocabulary that could not express it
 * would force that state to be written as prose the guard cannot read, which is how a status
 * becomes unfalsifiable.
 *
 * `unstated` is not a status a document may write. It is what the parse returns when a phase
 * section says nothing, and it fails.
 */
type PhaseStatus =
  | 'accepted'
  | 'partial'
  | 'deferred'
  | 'not-accepted'
  | 'not-started'
  | 'unstated';

/** Emphasis and status emoji stripped, whitespace collapsed. */
const plain = (source: string): string =>
  source
    .replaceAll('*', '')
    .replace(/[✅⚠⬜❌]️?/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ordered longest-phrase-first, because `NOT ACCEPTED` contains `ACCEPTED` and a shorter pattern
 * matching first would read a withdrawn acceptance as an acceptance — the single most dangerous
 * misparse this file could make.
 */
const STATUS_PHRASES: readonly (readonly [RegExp, PhaseStatus])[] = Object.freeze([
  [/\bNOT\s+ACCEPTED\b/iu, 'not-accepted'],
  [/\bNOT\s+(?:STARTED|DONE|BUILT)\b/iu, 'not-started'],
  [/\bDEFERRED\b/iu, 'deferred'],
  [/\bPARTIAL(?:LY)?\b/iu, 'partial'],
  [/\b(?:ACCEPTED|COMPLETE|GREEN)\b/iu, 'accepted'],
] as const);

/** The first recognised status phrase in `text`, or `undefined`. */
function statusPhraseIn(text: string): PhaseStatus | undefined {
  const flat = plain(text);
  for (const [pattern, status] of STATUS_PHRASES) if (pattern.test(flat)) return status;
  return undefined;
}

/* -------------------------------------------------------------------------- *
 * The parse
 * -------------------------------------------------------------------------- */

interface SubPhase {
  /** `6a`, `6c`. */
  readonly id: string;
  readonly heading: string;
  readonly status: PhaseStatus;
  readonly body: string;
}

interface Phase {
  readonly n: number;
  readonly title: string;
  readonly status: PhaseStatus;
  /** Where the status came from — asserted, so a derived status cannot be mistaken for a stated one. */
  readonly statusSource: 'status-line' | 'sub-phases' | 'none';
  /** The whole `## Phase N` section, sub-phases included. */
  readonly body: string;
  /** Everything before the first `### Phase Na` heading. */
  readonly preamble: string;
  /** The `**Acceptance:**` block, or `undefined` if the section states no criterion. */
  readonly acceptance: string | undefined;
  /**
   * The section from the `**Status:` line to the end, or the whole section when the status is
   * derived from sub-phases. The evidence for a *verdict* has to sit with the verdict.
   */
  readonly statusRegion: string;
  readonly subPhases: readonly SubPhase[];
}

/** Split a markdown document into `##`-level sections, each keeping its own heading line. */
function topSections(markdown: string): readonly { heading: string; body: string }[] {
  const lines = markdown.split('\n');
  const starts = lines.flatMap((line, index) => (/^## /u.test(line) ? [index] : []));
  return starts.map((start, index) => ({
    heading: lines[start] as string,
    body: lines.slice(start, starts[index + 1] ?? lines.length).join('\n'),
  }));
}

/** The `**Acceptance:**` block: from its own line to the next status line, rule or heading. */
function acceptanceBlock(body: string): string | undefined {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^\*\*Acceptance:/u.test(line));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && !/^(?:\*\*Status:|---|#{3,}|> )/u.test(lines[end] as string)) end += 1;
  return lines.slice(start, end).join('\n');
}

function parseSubPhases(body: string): readonly SubPhase[] {
  const lines = body.split('\n');
  const starts = lines.flatMap((line, index) =>
    /^### Phase (\d+[a-z])\b/u.test(line) ? [index] : [],
  );
  return starts.map((start, index) => {
    const heading = lines[start] as string;
    const id = /^### Phase (\d+[a-z])\b/u.exec(heading)?.[1] as string;
    const status = statusPhraseIn(heading.replace(/^### Phase \d+[a-z]\s*[—–-]\s*/u, ''));
    if (status === undefined) {
      throw new Error(
        `docs/05-roadmap.md § Phase ${id}: its heading states no status this guard can read. ` +
          `Recognised: ACCEPTED / COMPLETE / GREEN / PARTIAL / DEFERRED / NOT ACCEPTED / NOT DONE.`,
      );
    }
    return {
      id,
      heading,
      status,
      body: lines.slice(start, starts[index + 1] ?? lines.length).join('\n'),
    };
  });
}

/**
 * Aggregate a phase's status from its sub-phases.
 *
 * Phase 6 is the reason this exists and the reason it is not a lookup: the roadmap states no
 * top-level Phase 6 status at all, and asserting *partial* from a hand-written table would be a
 * guard that agrees with today's document by construction. Derived, `partial` is what *some
 * accepted and some not* means, and marking 6c accepted tomorrow would move Phase 6 to `accepted`
 * — where its cross-document check against `docs/07` § 1's `⚠️` immediately fails.
 */
function aggregate(subPhases: readonly SubPhase[]): PhaseStatus {
  const accepted = subPhases.filter((sub) => sub.status === 'accepted').length;
  if (accepted === subPhases.length) return 'accepted';
  if (accepted === 0) return 'not-started';
  return 'partial';
}

function parseRoadmap(markdown: string): readonly Phase[] {
  const phases: Phase[] = [];
  for (const section of topSections(markdown)) {
    const heading = /^## Phase (\d+)\s*[—–-]\s*(.*)$/u.exec(section.heading);
    if (heading === null) continue;

    const lines = section.body.split('\n');
    const statusIndex = lines.findIndex((line) => /^\*\*Status:/u.test(line));
    const subPhases = parseSubPhases(section.body);
    const firstSub = lines.findIndex((line) => /^### Phase \d+[a-z]\b/u.test(line));

    let status: PhaseStatus;
    let statusSource: Phase['statusSource'];
    let statusRegion: string;
    if (statusIndex >= 0) {
      const stated = statusPhraseIn((lines[statusIndex] as string).replace(/^\*\*Status:/u, ''));
      if (stated === undefined) {
        throw new Error(
          `docs/05-roadmap.md § Phase ${heading[1] as string}: "${(lines[statusIndex] as string).slice(0, 80)}" ` +
            'states no status this guard can read.',
        );
      }
      status = stated;
      statusSource = 'status-line';
      statusRegion = lines.slice(statusIndex).join('\n');
    } else if (subPhases.length > 0) {
      status = aggregate(subPhases);
      statusSource = 'sub-phases';
      statusRegion = section.body;
    } else {
      status = 'unstated';
      statusSource = 'none';
      statusRegion = section.body;
    }

    phases.push({
      n: Number(heading[1]),
      title: (heading[2] as string).trim(),
      status,
      statusSource,
      body: section.body,
      preamble: lines.slice(0, firstSub < 0 ? lines.length : firstSub).join('\n'),
      acceptance: acceptanceBlock(section.body),
      statusRegion,
      subPhases,
    });
  }
  return phases;
}

/* -------------------------------------------------------------------------- *
 * The evidence resolver
 * -------------------------------------------------------------------------- */

/** Every tracked file in the repository, relative to the root. */
function repositoryFiles(): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else out.push(relative(ROOT, path));
    }
  };
  visit(ROOT);
  return out;
}

const FILES = repositoryFiles();
const BY_BASENAME = new Map<string, string[]>();
for (const path of FILES) {
  const key = basename(path);
  const bucket = BY_BASENAME.get(key);
  if (bucket === undefined) BY_BASENAME.set(key, [path]);
  else bucket.push(path);
}

/**
 * The path a citation names, or `undefined`.
 *
 * The roadmap cites at three depths — `packages/core/src/sim/seam.test.ts`, `validation/
 * adversarial.test.ts` and the bare `matrix.test.ts` — because a sentence names the directory once
 * and then the file. All three are honoured: a citation with a separator must be a suffix of a real
 * path, a bare one must be some file's basename. That is weaker than an exact path (a moved file
 * still resolves by name) and it is strong enough for what this guard is for: **a citation naming a
 * file that no longer exists anywhere fails**.
 */
function resolvePath(citation: string): string | undefined {
  const candidates = citation.endsWith('.js')
    ? [citation, `${citation.slice(0, -3)}.ts`]
    : [citation];
  for (const candidate of candidates) {
    if (!candidate.includes('/')) {
      const hit = BY_BASENAME.get(candidate);
      if (hit !== undefined) return hit[0];
      continue;
    }
    const hit = FILES.find((path) => path === candidate || path.endsWith(`/${candidate}`));
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** A directory citation — `packages/experiments/src/validation/` — that exists on disk. */
function resolveDirectory(citation: string): string | undefined {
  const trimmed = citation.replace(/\/$/u, '');
  const direct = join(ROOT, trimmed);
  if (existsSync(direct) && statSync(direct).isDirectory()) return trimmed;
  const prefix = `${trimmed}/`;
  const hit = FILES.find((path) => path.includes(`/${prefix}`) || path.startsWith(prefix));
  return hit === undefined ? undefined : trimmed;
}

/** Does this citation name, or contain, at least one `*.test.ts`? The gate-citation test. */
function namesATest(citation: string): boolean {
  if (citation.endsWith('.test.ts')) return resolvePath(citation) !== undefined;
  if (!citation.endsWith('/')) return false;
  const dir = resolveDirectory(citation);
  if (dir === undefined) return false;
  return FILES.some(
    (path) => (path.startsWith(`${dir}/`) || path.includes(`/${dir}/`)) && path.endsWith('.test.ts'),
  );
}

const SOURCE = corpus();

/** Symbols declared anywhere under `packages/…/src`, from comment- and string-stripped source. */
const DECLARED = new Set<string>();
const EXPORTED = new Set<string>();
for (const file of SOURCE.files) {
  const text = code(SOURCE.text(file));
  for (const match of text.matchAll(
    /(?:^|\s)(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gu,
  )) {
    DECLARED.add(match[1] as string);
  }
  for (const match of text.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gu,
  )) {
    EXPORTED.add(match[1] as string);
  }
}

const PIN_GROUPS = new Set(Object.keys(PINNED_ESTIMATES));
const STUDIES = new Set(Object.keys(STUDY_ENTRY_POINTS));

const PATH_LIKE = /^[\w@][\w./-]*\.(?:ts|js|json|md)$/u;
const DIRECTORY_LIKE = /^[\w@][\w./-]*\/$/u;
const STUDY_LIKE = /^(?:run|measure|audit|format)[A-Z][\w$]*$/u;

interface Citations {
  readonly paths: readonly string[];
  readonly directories: readonly string[];
  readonly studies: readonly string[];
  readonly pinGroups: readonly string[];
}

/** Classify every backticked span in `body`. */
function citationsIn(body: string): Citations {
  const paths = new Set<string>();
  const directories = new Set<string>();
  const studies = new Set<string>();
  const pinGroups = new Set<string>();

  for (const span of body.matchAll(/`([^`\n]+)`/gu)) {
    const text = (span[1] as string).trim();
    if (PATH_LIKE.test(text)) paths.add(text);
    if (DIRECTORY_LIKE.test(text)) directories.add(text);
    if (PIN_GROUPS.has(text)) pinGroups.add(text);
    const name = /^([A-Za-z_$][\w$]*)\s*\(/u.exec(text)?.[1] ?? text;
    if (STUDY_LIKE.test(name)) studies.add(name);
  }

  return {
    paths: [...paths].sort(),
    directories: [...directories].sort(),
    studies: [...studies].sort(),
    pinGroups: [...pinGroups].sort(),
  };
}

/** Everything a citation can be wrong about, as a list of sentences. A green phase returns `[]`. */
function evidenceFaults(where: string, body: string): readonly string[] {
  const faults: string[] = [];
  const cited = citationsIn(body);

  for (const path of cited.paths) {
    if (resolvePath(path) === undefined) {
      faults.push(`${where} cites the file \`${path}\`, and no such file exists in this tree.`);
    }
  }
  for (const dir of cited.directories) {
    if (resolveDirectory(dir) === undefined) {
      faults.push(`${where} cites the directory \`${dir}\`, and no such directory exists.`);
    }
  }
  for (const study of cited.studies) {
    if (!DECLARED.has(study)) {
      faults.push(`${where} cites \`${study}()\`, and nothing in packages/*/src declares it.`);
    } else if (STUDIES.has(study) && !EXPORTED.has(study)) {
      faults.push(
        `${where} cites \`${study}()\`, which published.ts classifies as a study entry point ` +
          'and which its own module does not export. A study cited as the way a number was ' +
          'produced has to be callable.',
      );
    }
  }
  for (const group of cited.pinGroups) {
    const pins = (PINNED_ESTIMATES as Record<string, Record<string, unknown>>)[group];
    if (pins === undefined || Object.keys(pins).length === 0) {
      faults.push(`${where} cites the pin group \`${group}\`, which holds no pinned estimate.`);
    }
  }
  return faults;
}

/* -------------------------------------------------------------------------- *
 * Discipline tables
 * -------------------------------------------------------------------------- */

interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Every markdown table in `body`, cells trimmed, separator row dropped. */
function tablesIn(body: string): readonly Table[] {
  const cells = (line: string): readonly string[] =>
    line
      .replace(/^\||\|$/gu, '')
      .split('|')
      .map((cell) => cell.trim());

  const tables: Table[] = [];
  const lines = body.split('\n');
  let block: string[] = [];
  const flush = (): void => {
    if (block.length >= 2 && /^\|[\s:|-]+\|$/u.test(block[1] as string)) {
      tables.push({
        header: cells(block[0] as string).map((cell) => plain(cell).toLowerCase()),
        rows: block.slice(2).map(cells),
      });
    }
    block = [];
  };
  for (const line of lines) {
    if (line.trimStart().startsWith('|')) block.push(line.trim());
    else flush();
  }
  flush();
  return tables;
}

const hasColumns = (table: Table, ...names: readonly string[]): boolean =>
  names.every((name) => table.header.includes(name));

/* -------------------------------------------------------------------------- *
 * The document under guard
 * -------------------------------------------------------------------------- */

const ROADMAP = read('docs', '05-roadmap.md');
const PHASES = parseRoadmap(ROADMAP);
const ACCEPTED = PHASES.filter((phase) => phase.status === 'accepted');

/* -------------------------------------------------------------------------- *
 * 1. The parse itself
 * -------------------------------------------------------------------------- */

describe('the phase set and its statuses, derived from docs/05-roadmap.md', () => {
  it('finds a phase set worth guarding, and no phase whose status it cannot read', () => {
    /* Non-vacuity, first and loudest. A parse that found nothing would make every assertion below
       pass by not looking — the shape of the tautological guard docs/05 § Phase 7 records
       surviving a review as "fixed". Nine phases ship; the bound is deliberately below that so
       that adding one is not a failure and deleting the section is. */
    expect(PHASES.length, 'no `## Phase N` sections parsed out of docs/05-roadmap.md').toBeGreaterThanOrEqual(9);
    expect(ACCEPTED.length, 'no phase parses as accepted — the status vocabulary has drifted').toBeGreaterThanOrEqual(6);

    const unstated = PHASES.filter((phase) => phase.status === 'unstated').map((phase) => phase.n);
    expect(
      unstated,
      'these phases state no status in docs/05-roadmap.md, which CLAUDE.md § Working agreements ' +
        'names as the document that carries phase status. A phase whose own roadmap section says ' +
        'nothing cannot be checked against anything, and the other three documents call it ✅.',
    ).toEqual([]);
  });

  it('numbers the phases contiguously from 0, so a section cannot go missing unnoticed', () => {
    const numbers = PHASES.map((phase) => phase.n);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size, 'a phase number appears twice').toBe(numbers.length);
    expect(numbers[0]).toBe(0);
    expect(numbers.at(-1)).toBe(numbers.length - 1);
  });

  it('gives every phase a written acceptance criterion', () => {
    const missing = PHASES.filter((phase) => phase.acceptance === undefined).map((phase) => phase.n);
    expect(
      missing,
      'no `**Acceptance:**` block. docs/05 § Phase 8 records what happens without one: that ' +
        'phase had no section in this document at all, and its criterion had to be written down ' +
        'late and flagged as new rather than presented as having always been there.',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * 2. Evidence
 * -------------------------------------------------------------------------- */

describe('every accepted phase names evidence, and the evidence resolves', () => {
  it('cites something the guard can classify, in every phase — not only the accepted ones', () => {
    /* Non-vacuity for the evidence check itself. If `citationsIn` stopped matching, every
       per-phase assertion below would report zero faults and the file would go green while
       checking nothing. */
    const counted = PHASES.map((phase) => {
      const cited = citationsIn(phase.body);
      return cited.paths.length + cited.directories.length + cited.studies.length;
    });
    expect(Math.min(...counted), 'a phase section carries no citation this guard can classify').toBeGreaterThan(0);
    expect(counted.reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
  });

  it.each(PHASES.map((phase) => [phase.n, phase] as const))(
    'Phase %s cites nothing that has gone missing',
    (_n, phase) => {
      expect(evidenceFaults(`docs/05 § Phase ${String(phase.n)}`, phase.body).join('\n')).toBe('');
    },
  );

  it.each(ACCEPTED.map((phase) => [phase.n, phase] as const))(
    'Phase %s puts a real test beside its verdict, not only beside its criterion',
    (_n, phase) => {
      /* The *status region* rather than the whole section. A phase may discuss a dozen test files
         while arguing about history; what makes a verdict falsifiable is a gate named where the
         verdict is stated. A directory counts when it contains tests — docs/05 §§ Phase 3 and 5
         name `validation/` and `benchmark/` as their gates, which is a truthful answer. */
      const cited = citationsIn(phase.statusRegion);
      const gates = [...cited.paths, ...cited.directories].filter(namesATest);
      expect(
        gates,
        `docs/05 § Phase ${String(phase.n)} is accepted and its status region names no test suite ` +
          'that exists. CLAUDE.md § Working agreements: a phase is done when its stated ' +
          'acceptance criteria pass, not when the code exists — so the verdict has to say what ' +
          'ran.',
      ).not.toEqual([]);
    },
  );

  it.each(
    PHASES.flatMap((phase) =>
      phase.subPhases
        .filter((sub) => sub.status === 'accepted')
        .map((sub) => [sub.id, phase, sub] as const),
    ),
  )('sub-phase %s is accepted and names a test that exists', (_id, phase, sub) => {
    /* Two scopes, because one alone is wrong in a different direction each way.
       The *gate* may sit one heading up: § Phase 6b's acceptance rests explicitly on the shared
       § *Phase 6 on the building the criterion names* above it, and reading the sub-section alone
       would call that citation missing when it is right there. But allowing the parent alone lets
       a sub-phase be upgraded while citing nothing of its own and inheriting a sibling's evidence
       — watched: marking 6c ACCEPTED passed the gate rule on the preamble's citations until this
       second clause was added. So the sub-phase must also name something of its own that
       resolves. */
    const shared = citationsIn(`${phase.preamble}\n${sub.body}`);
    const gates = [...shared.paths, ...shared.directories].filter(namesATest);
    expect(gates, `docs/05 § Phase ${sub.id} is ACCEPTED and names no test suite that exists`).not.toEqual([]);

    const own = citationsIn(sub.body);
    expect(
      [
        ...own.paths.filter((path) => resolvePath(path) !== undefined),
        ...own.directories.filter((dir) => resolveDirectory(dir) !== undefined),
        ...own.studies.filter((study) => DECLARED.has(study)),
      ],
      `docs/05 § Phase ${sub.id} is ACCEPTED and its own section names no file, directory or study ` +
        'that exists. Inheriting a sibling sub-phase\'s evidence is how a sub-phase gets upgraded ' +
        'without acquiring any.',
    ).not.toEqual([]);
    expect(evidenceFaults(`docs/05 § Phase ${sub.id}`, sub.body).join('\n')).toBe('');
  });

  it('anchors a phase that says its figures are pinned to a pin group that holds figures', () => {
    const faults: string[] = [];
    for (const phase of ACCEPTED) {
      if (!/\bpins?\b|\bpinned\b/u.test(phase.body)) continue;
      const cited = citationsIn(phase.body);
      const groups = new Set(cited.pinGroups);
      for (const study of cited.studies) {
        const group = (STUDY_ENTRY_POINTS as Record<string, string>)[study];
        if (group !== undefined && group !== 'no-intervals') groups.add(group);
      }
      const held = [...groups].filter(
        (group) =>
          Object.keys((PINNED_ESTIMATES as Record<string, Record<string, unknown>>)[group] ?? {})
            .length > 0,
      );
      if (held.length === 0) {
        faults.push(
          `docs/05 § Phase ${String(phase.n)} says its figures are pinned and names no pin group ` +
            'that holds any. A published number with no study behind it is the defect ' +
            'benchmark/published.test.ts exists for, one level up.',
        );
      }
    }
    expect(faults.join('\n')).toBe('');
  });
});

/* -------------------------------------------------------------------------- *
 * 3. Discipline tables — an accepted phase may carry no undischarged clause
 * -------------------------------------------------------------------------- */

describe('an accepted phase carries no undischarged clause', () => {
  /** `| criterion | verdict |` — Phases 5 and 7. */
  const criterionTables = ACCEPTED.flatMap((phase) =>
    tablesIn(phase.body)
      .filter((table) => hasColumns(table, 'criterion', 'verdict'))
      .map((table) => [phase.n, table] as const),
  );

  /** `| bullet | state |` and `| track | state | evidence |` — Phases 4 and 8. */
  const stateTables = ACCEPTED.flatMap((phase) =>
    tablesIn(phase.body)
      .filter((table) => hasColumns(table, 'state'))
      .map((table) => [phase.n, table] as const),
  );

  /** `| requirement | evidence |` — Phase 7's three blockers. */
  const requirementTables = ACCEPTED.flatMap((phase) =>
    tablesIn(phase.body)
      .filter((table) => hasColumns(table, 'requirement', 'evidence'))
      .map((table) => [phase.n, table] as const),
  );

  it('finds the discipline tables at all — the check is not passing by finding none', () => {
    expect(criterionTables.length, 'no `| criterion | verdict |` table in any accepted phase').toBeGreaterThanOrEqual(2);
    expect(stateTables.length, 'no `| … | state | …` table in any accepted phase').toBeGreaterThanOrEqual(2);
    expect(requirementTables.length, 'no `| requirement | evidence |` table in any accepted phase').toBeGreaterThanOrEqual(1);
    expect(
      stateTables.reduce((total, [, table]) => total + table.rows.length, 0),
    ).toBeGreaterThanOrEqual(10);
  });

  it.each(criterionTables)('Phase %s reports every criterion MET', (n, table) => {
    const verdict = table.header.indexOf('verdict');
    const unmet = table.rows
      .map((row) => plain(row[verdict] ?? ''))
      .filter((cell) => !/^MET\b/u.test(cell));
    expect(
      unmet,
      `docs/05 § Phase ${String(n)} is accepted and its own criterion table does not read MET. ` +
        'CLAUDE.md § Working agreements: do not weaken an acceptance criterion to make a phase ' +
        'pass — and do not leave one unmet under a ✅ either.',
    ).toEqual([]);
  });

  it.each(stateTables)('Phase %s marks every scope bullet built', (n, table) => {
    const state = table.header.indexOf('state');
    const unbuilt = table.rows
      .map((row) => row[state] ?? '')
      .filter((cell) => !cell.includes('✅'));
    expect(
      unbuilt,
      `docs/05 § Phase ${String(n)} is accepted with a scope row that is not ✅. A phase is ` +
        'accepted against its criterion, and a criterion of the form "every track lands" is ' +
        'exactly the criterion this table answers.',
    ).toEqual([]);
  });

  it.each(requirementTables)('Phase %s discharges every stated requirement', (n, table) => {
    const undischarged = table.rows.filter((row) => !row.some((cell) => cell.includes('✅')));
    expect(
      undischarged.map((row) => row[0]),
      `docs/05 § Phase ${String(n)} is accepted with a requirement it does not mark discharged. ` +
        'Phase 7 is the case: it read "green. The machinery is complete and wired" while three ' +
        'blockers stood, and review finding #1 had to withdraw the acceptance.',
    ).toEqual([]);
  });

  it.each(ACCEPTED.map((phase) => [phase.n, phase] as const))(
    'Phase %s states a disposition for every ⬜ it carries',
    (_n, phase) => {
      /* An accepted phase *may* carry a not-built scope bullet — docs/05 § Phase 7 carries two and
         says so rather than sweeping them into the verdict. What it may not do is carry one with
         no stated disposition, which is an undischarged clause under a ✅. The paragraph is the
         unit, because that is where the disposition is written. */
      const undisposed = phase.body
        .split(/\n\s*\n/u)
        .filter(
          (paragraph) =>
            paragraph.includes('⬜') &&
            !/deferred|not dropped|not started|not done|not built|superseded/iu.test(paragraph),
        )
        .map((paragraph) => paragraph.slice(0, 120));
      expect(
        undisposed,
        `docs/05 § Phase ${String(phase.n)} is accepted and carries a ⬜ item with no stated ` +
          'disposition — neither deferred, nor dropped, nor recorded as not built.',
      ).toEqual([]);
    },
  );
});

/* -------------------------------------------------------------------------- *
 * 4. Phase 6 — partial, and partial for the reasons it states
 * -------------------------------------------------------------------------- */

describe('Phase 6 is partial, and the parse says why', () => {
  const phase6 = PHASES.find((phase) => phase.n === 6);

  it('derives partial from its sub-phases rather than being told', () => {
    expect(phase6, 'docs/05-roadmap.md has no `## Phase 6` section').toBeDefined();
    const phase = phase6 as Phase;
    expect(
      phase.statusSource,
      'Phase 6 acquired a `**Status:` line. That is allowed — but then this block is asserting a ' +
        'sentence rather than the sub-phase states it is meant to be derived from, and it should ' +
        'be rewritten before the line lands.',
    ).toBe('sub-phases');
    expect(phase.status).toBe('partial');

    const byId = Object.fromEntries(phase.subPhases.map((sub) => [sub.id, sub.status]));
    expect(
      byId,
      'Phase 6 is partial because 6a and 6b are accepted and 6c is not. Marking 6c accepted moves ' +
        'the whole phase to accepted, where the cross-document check against docs/07 § 1 fails ' +
        'until that document moves too.',
    ).toEqual({ '6a': 'accepted', '6b': 'accepted', '6c': 'not-accepted' });
  });

  /**
   * 6c is **refused**, not deferred — and this assertion is stronger than the one it replaces.
   *
   * The old form required `⬜ DEFERRED … not dropped` plus § D28's three enumerated reasons, which
   * was exactly right while 6c was an absence of evidence. It is now evidence: implemented,
   * measured against a criterion recorded **before** any of it existed (§ D139), and refused on an
   * interval that contains zero.
   *
   * **A refusal is easier to fake than a deferral**, which is why this asks for more. A deferral
   * needs only reasons; a refusal needs a gate that was fixed in advance, a measurement, and a
   * verdict that does not quietly become a win. So three things are required and the third is the
   * point: the criterion must be **cited**, so the reader can check it predates the result. That is
   * the § D27 → § D99 failure mechanised — a criterion written after a result is indistinguishable
   * from one fitted to it, and this project has done that once already, by accident, inside a
   * decision whose stated purpose was to strengthen a gate.
   */
  it('keeps 6c refused against a criterion that predates it, not merely unfinished', () => {
    const sub = (phase6 as Phase).subPhases.find((item) => item.id === '6c');
    expect(sub?.status).toBe('not-accepted');

    /* The three reasons § D28 gave still have to be answered rather than dropped: a phase that
       stops citing its own objections has not resolved them, it has forgotten them. */
    const reasons = (sub?.body ?? '').split('\n').filter((line) => /^\d+\.\s/u.test(line));
    expect(
      reasons.length,
      'docs/05 § Phase 6c no longer enumerates § D28’s three reasons. Two were dissolved by the ' +
        'shape it was built in and the third was answered in writing first; dropping them loses ' +
        'the record of why it was ever deferred.',
    ).toBeGreaterThanOrEqual(3);

    const body = sub?.body ?? '';

    /* The gate, cited by number, so its date can be checked against the code's. */
    expect(
      /§\s*D139/u.test(body),
      'docs/05 § Phase 6c states a verdict without citing the criterion it was measured against. ' +
        '§ D139 is that criterion and it is dated before the implementation deliberately.',
    ).toBe(true);

    /* A measured interval, not an adjective. */
    expect(
      /\[[−+-]?[\d.]+,\s*[+−-]?[\d.]+\]/u.test(body),
      'docs/05 § Phase 6c reports no interval. A refusal is a measurement — CLAUDE.md § ' +
        'Statistical discipline forbids declaring any comparison without one.',
    ).toBe(true);

    /* And it may not be read as a win. */
    expect(
      /\bNOT\s+ACCEPTED\b/iu.test(sub?.heading ?? ''),
      'docs/05 § Phase 6c’s heading no longer says NOT ACCEPTED. Implemented-and-refused is a ' +
        'distinct state from both deferred and accepted, and the heading is where a cold reader ' +
        'sees which one it is.',
    ).toBe(true);
  });

  /**
   * Double-deck is **simulated**, and this assertion moved in the same commit as the sentence.
   *
   * It used to require `docs/05` § Phase 6 to say *not simulated* and to name
   * `WARNING_CODES.doubleDeckNotSimulated`, checked against `core`'s source. That was right for as
   * long as it was true, and the guard's real value showed at the moment it stopped being true: it
   * went red rather than letting the roadmap quietly drop a disclaimer. **A guard that has to be
   * edited to land a change is working**, provided the replacement is not weaker.
   *
   * So this is deliberately *stronger* than what it replaces. The old form asserted an absence — a
   * capability not built, a disclaimer present. This asserts a **verdict with a direction**, and
   * that the narrower warning code which survived is real in `core`. An empty claim cannot satisfy
   * it: the roadmap must state that double-deck is simulated, must **not** claim it is simply
   * better, and must name a code the source declares.
   */
  it('records double-deck as simulated, with a verdict that does not round itself up', () => {
    const body = (phase6 as Phase).body;

    expect(
      /double-deck/iu.test(body),
      'docs/05 § Phase 6 no longer discusses double-deck operation at all.',
    ).toBe(true);

    expect(
      /\bsimulated\b/iu.test(body) && !/\bnot\*{0,2}\s+simulated/iu.test(body),
      'docs/05 § Phase 6 still records double-deck as not simulated. It is simulated — paired ' +
        'stops, per-deck design load, deck-bound legs — and the roadmap must say so or say why not.',
    ).toBe(true);

    /* The verdict is dispatcher-dependent and the roadmap may not flatten it. `nearest-car` on the
       Pareto front at six of eight cells (§ D106) is the standing lesson: a capability that helps
       one arm and hurts another has no single sign, and a table that gives it one is wrong. */
    expect(
      /WORSE/u.test(body) && /BETTER/u.test(body),
      'docs/05 § Phase 6 states a double-deck verdict without both directions. Measured WORSE ' +
        'under `eta` and BETTER under `collective` at the same operating point — there is no ' +
        'verdict of the form "double-deck is better", and a roadmap that implies one is the ' +
        'round-up this guard exists to prevent.',
    ).toBe(true);

    expect(
      body.includes('missingFloorPairs'),
      'docs/05 § Phase 6 no longer names the warning code that survived. ' +
        '`doubleDeckNotSimulated` was deleted because it became false; `missingFloorPairs` carries ' +
        'the same sentence for the one case still true.',
    ).toBe(true);

    /* And the surviving code is not merely a sentence: it is in `core`. This is the eighth dead
       seam's own lesson — that warning was raised and asserted in both directions with nothing
       branching on it (§ D23) — so the citation is checked against the source. */
    expect(
      DECLARED.has('WARNING_CODES') || EXPORTED.has('WARNING_CODES'),
      'docs/05 § Phase 6 cites WARNING_CODES.missingFloorPairs and packages/*/src declares no ' +
        'WARNING_CODES.',
    ).toBe(true);
  });

  it('does not let a partial phase quietly become accepted in the other documents', () => {
    const handoff = read('docs', '07-handoff.md');
    const row = handoff.split('\n').find((line) => /^\|\s*\*{0,2}6\s*[—–-]/u.test(line));
    expect(row, 'docs/07-handoff.md § 1 has no Phase 6 row').toBeDefined();
    expect(
      (row as string).includes('⚠️'),
      'docs/07 § 1 marks Phase 6 as something other than ⚠️ while docs/05 derives it partial from ' +
        '6a accepted, 6b accepted, 6c deferred.',
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 5. Phase 8 — both halves of a two-clause criterion
 * -------------------------------------------------------------------------- */

describe('Phase 8 is accepted against both halves of its criterion', () => {
  const phase8 = PHASES.find((phase) => phase.n === 8) as Phase;

  it('states both clauses in the criterion itself', () => {
    const criterion = plain(phase8.acceptance ?? '');
    expect(criterion, 'docs/05 § Phase 8 states no acceptance criterion').not.toBe('');
    expect(
      /every track lands/iu.test(criterion),
      'docs/05 § Phase 8 has lost the tracks-all-land half of its criterion.',
    ).toBe(true);
    expect(
      /no property violation is outstanding/iu.test(criterion),
      'docs/05 § Phase 8 has lost the no-outstanding-violation half of its criterion. That half ' +
        'is the older one — docs/07 § 7 carried it before this section existed — and it is the ' +
        'blocking one.',
    ).toBe(true);
  });

  it('covers every scope bullet with a track row, so "every track lands" is countable', () => {
    /* Derived on both sides. The scope list and the track table are two statements of the same
       set, and a ninth bullet added without a ninth row would make the tracks clause pass on a
       table that no longer describes the phase. */
    const bullets = phase8.body
      .split('\n')
      .filter((line) => /^-\s/u.test(line))
      .filter((line) => !/^-\s*\[/u.test(line));
    const table = tablesIn(phase8.body).find((candidate) => hasColumns(candidate, 'track', 'state'));
    expect(table, 'docs/05 § Phase 8 has no `| track | state | evidence |` table').toBeDefined();
    expect(bullets.length, 'no scope bullets parsed out of docs/05 § Phase 8').toBeGreaterThanOrEqual(8);
    expect(
      (table as Table).rows.length,
      'docs/05 § Phase 8 lists more scope bullets than the track table has rows. "Every track ' +
        'lands" is a claim about the scope list; a row per bullet is what makes it checkable.',
    ).toBeGreaterThanOrEqual(bullets.length);
  });

  it('reports zero property violations in every column of its own campaign table', () => {
    const table = tablesIn(phase8.body).find((candidate) =>
      candidate.rows.some((row) => /property violations/iu.test(plain(row[0] ?? ''))),
    );
    expect(table, 'docs/05 § Phase 8 no longer carries the campaign-statistics table').toBeDefined();
    const row = (table as Table).rows.find((candidate) =>
      /property violations/iu.test(plain(candidate[0] ?? '')),
    ) as readonly string[];

    const counts = row.slice(1).map((cell) => {
      const leading = /^[^\d]*(\d+)/u.exec(plain(cell));
      return leading === null ? Number.NaN : Number(leading[1]);
    });
    expect(counts.length, 'the property-violations row has no measured columns').toBeGreaterThanOrEqual(2);
    expect(
      counts,
      'docs/05 § Phase 8 is accepted while its own campaign table reports a property violation. ' +
        'The criterion says no violation is outstanding and docs/07 § 7 calls a Phase 8 failure ' +
        'blocking: a simulator producing confident numbers from broken mechanics is worse than ' +
        'one that crashes.',
    ).toEqual(counts.map(() => 0));
  });
});

/* -------------------------------------------------------------------------- *
 * 6. The roadmap against the document set — the fourth document, closed in
 * -------------------------------------------------------------------------- */

/**
 * `documentation.test.ts` asserts that `CLAUDE.md`, `README.md` and `docs/07-handoff.md` agree.
 * The roadmap — the document that actually carries the criteria — is in none of the three, so a
 * status could move in the roadmap and in nothing else, or in the three and not in the roadmap.
 * This closes the loop, and it is the one place this file overlaps that one deliberately.
 */
describe('docs/05-roadmap.md agrees with docs/07-handoff.md § 1', () => {
  const MARK: Readonly<Record<PhaseStatus, string>> = Object.freeze({
    accepted: '✅',
    partial: '⚠️',
    deferred: '⬜',
    'not-accepted': '⬜',
    'not-started': '⬜',
    unstated: '⬜',
  });

  const handoffRows = (): ReadonlyMap<number, string> => {
    const rows = new Map<number, string>();
    for (const line of read('docs', '07-handoff.md').split('\n')) {
      const match = /^\|\s*\*{0,2}(\d+)\s*[—–-]/u.exec(line);
      if (match === null) continue;
      rows.set(Number(match[1]), line);
    }
    return rows;
  };

  it('states the same status for every phase, in both directions', () => {
    const rows = handoffRows();
    expect(rows.size, 'no phase rows parsed out of docs/07 § 1').toBeGreaterThanOrEqual(9);

    expect(
      [...rows.keys()].sort((a, b) => a - b),
      'docs/07 § 1 and docs/05-roadmap.md describe different phase sets. A phase with a row and no ' +
        'roadmap section has no criterion; a section with no row is invisible to a cold reader.',
    ).toEqual(PHASES.map((phase) => phase.n).sort((a, b) => a - b));

    const disagreements = PHASES.filter(
      (phase) => !(rows.get(phase.n) as string).includes(MARK[phase.status]),
    ).map(
      (phase) =>
        `Phase ${String(phase.n)}: docs/05 derives ${phase.status} (${MARK[phase.status]} expected), ` +
        `docs/07 § 1 says "${(rows.get(phase.n) as string).slice(0, 90)}"`,
    );
    expect(disagreements.join('\n')).toBe('');
  });
});

/* -------------------------------------------------------------------------- *
 * 7. Positive controls — the guard fails when it should
 * -------------------------------------------------------------------------- */

/**
 * **A guard nobody has seen fail is not a guard.**
 *
 * Every check above runs against one document, so it has exactly one observation and cannot
 * distinguish *"the roadmap is honest"* from *"the parse stopped working"*. These run the same
 * pure functions over synthetic roadmaps whose defects are known, and are the reason the blocks
 * above can be read as assertions rather than as decoration.
 *
 * They are synthetic rather than fixtures on disk deliberately: a fixture is a second copy of the
 * roadmap's shape, and it goes stale exactly like the numbers this repository has already found
 * stale.
 */
describe('the guard fails when it should', () => {
  const SECTION = (body: string): string => `# Roadmap\n\n${body}\n`;

  it('reads a status the roadmap states, and refuses one it cannot', () => {
    const parsed = parseRoadmap(
      SECTION('## Phase 0 — Foundation\n\n**Acceptance:** something.\n\n**Status: green.** ok\n'),
    );
    expect(parsed.map((phase) => [phase.n, phase.status, phase.statusSource])).toEqual([
      [0, 'accepted', 'status-line'],
    ]);

    expect(() =>
      parseRoadmap(SECTION('## Phase 0 — Foundation\n\n**Status: pretty good actually.**\n')),
    ).toThrow(/states no status this guard can read/u);
  });

  it('never reads NOT ACCEPTED as ACCEPTED', () => {
    const parsed = parseRoadmap(SECTION('## Phase 7 — Tuning\n\n**Status: NOT ACCEPTED** — blocked.\n'));
    expect(parsed[0]?.status).toBe('not-accepted');
    expect(parsed[0]?.status).not.toBe('accepted');
  });

  it('goes red on a phase with no status at all rather than skipping it', () => {
    const parsed = parseRoadmap(SECTION('## Phase 9 — Experience layer\n\nNo verdict anywhere.\n'));
    expect(parsed[0]?.status).toBe('unstated');
    expect(parsed[0]?.statusSource).toBe('none');
  });

  it('flags a phase marked accepted whose cited test no longer exists', () => {
    const faults = evidenceFaults(
      'synthetic',
      'The gate is `packages/core/src/analytical/aValidationSuiteThatWasDeleted.test.ts`.',
    );
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatch(/no such file exists/u);

    /* The other direction, on the same shape: a real citation must not be reported. */
    expect(
      evidenceFaults('synthetic', 'The gate is `packages/core/src/analytical/validation.test.ts`.'),
    ).toEqual([]);
  });

  it('flags a cited study function nobody declares, and a pin group that holds nothing', () => {
    expect(evidenceFaults('synthetic', 'Regenerated by `runAStudyNobodyWrote()`.')[0]).toMatch(
      /nothing in packages\/\*\/src declares it/u,
    );
    expect(evidenceFaults('synthetic', 'Regenerated by `runTailStudy()`.')).toEqual([]);
    expect(evidenceFaults('synthetic', 'Held by pins in `phase7-acceptance`.')).toEqual([]);
  });

  it('flags a Phase 9 that appears accepted with no evidence beside its verdict', () => {
    const parsed = parseRoadmap(
      SECTION(
        '## Phase 9 — Experience layer\n\n**Acceptance:** the novice mode ships.\n\n' +
          '**Status: ✅ ACCEPTED (2026-08-01).** It works, we tried it.\n',
      ),
    );
    const phase = parsed[0] as Phase;
    expect(phase.status).toBe('accepted');
    const cited = citationsIn(phase.statusRegion);
    expect(
      [...cited.paths, ...cited.directories].filter(namesATest),
      'a phase whose status region names no test must not satisfy the gate-citation rule',
    ).toEqual([]);
  });

  it('flags Phase 6 marked accepted — the named case', () => {
    /* The task this file answers names two failures it must produce. This is the first, on a
       synthetic Phase 6 shaped like the real one with 6c upgraded and nothing else touched. */
    const shape = (sixC: string): readonly Phase[] =>
      parseRoadmap(
        SECTION(
          '## Phase 6 — Destination dispatch and learned control\n\n' +
            '**Acceptance:** beat the baseline on TTD.\n\n' +
            '### Phase 6a — destination disclosure. **ACCEPTED (2026-07-27).**\n\nx\n\n' +
            '### Phase 6b — destination dispatch. **ACCEPTED (2026-07-28).**\n\nx\n\n' +
            `### Phase 6c — learned control. ${sixC}\n\nx\n`,
        ),
      );

    expect(shape('⬜ **DEFERRED OUT OF THE PHASE, not dropped.**')[0]?.status).toBe('partial');
    /* Upgraded. The derivation follows the document, which is the point — and the phase then owes
       docs/07 § 1 a ✅ it does not have, plus a gate citation 6c has never had. */
    const upgraded = shape('**ACCEPTED (2026-08-01).**')[0] as Phase;
    expect(upgraded.status).toBe('accepted');
    expect(upgraded.subPhases.map((sub) => sub.status)).toEqual(['accepted', 'accepted', 'accepted']);
    const cited = citationsIn(upgraded.statusRegion);
    expect([...cited.paths, ...cited.directories].filter(namesATest)).toEqual([]);
  });

  it('flags an unmet criterion and an unbuilt track under a ✅', () => {
    const criterion = tablesIn(
      '| criterion | verdict |\n|---|---|\n| a tuned vector wins | **NOT MET** — no interval |\n',
    )[0] as Table;
    const verdict = criterion.header.indexOf('verdict');
    expect(
      criterion.rows.map((row) => plain(row[verdict] ?? '')).filter((cell) => !/^MET\b/u.test(cell)),
    ).toEqual(['NOT MET — no interval']);

    const tracks = tablesIn(
      '| track | state | evidence |\n|---|---|---|\n| Fuzzing | ✅ built | `fuzz/` |\n| Matrix | ⚠️ partial | — |\n',
    )[0] as Table;
    const state = tracks.header.indexOf('state');
    expect(tracks.rows.map((row) => row[state]).filter((cell) => !cell?.includes('✅'))).toEqual([
      '⚠️ partial',
    ]);
  });

  it('cannot pass vacuously: an empty roadmap yields an empty phase set', () => {
    /* The failure mode that would make every block above green while checking nothing. The real
       document's non-vacuity bounds are asserted in § 1; this proves the parse really does return
       nothing when there is nothing, rather than the bounds being unreachable. */
    expect(parseRoadmap('# Roadmap\n\nProse with no phase headings.\n')).toEqual([]);
    expect(parseRoadmap(SECTION('## Sequencing notes\n\nNot a phase.\n'))).toEqual([]);
    expect(citationsIn('no backticks here')).toEqual({
      paths: [],
      directories: [],
      studies: [],
      pinGroups: [],
    });
    expect(tablesIn('not a table\n')).toEqual([]);
  });
});
