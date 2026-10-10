/**
 * A cited path must exist.
 *
 * ## The instance that caused this guard
 *
 * `packages/viz/DECISIONS-T29.md` was cited by `docs/05-roadmap.md`, by `docs/07-handoff.md` § 8,
 * and by a task brief — as the home of a decision (§ T29-4) that a whole scope call rested on. **It
 * has never existed.** The material is `DECISIONS.md` § D111. Three documents pointed a reader at a
 * file that was not there, and every guard in this repository passed:
 *
 * | guard | what it checks | why it missed this |
 * |---|---|---|
 * | `documentation.test.ts` § README § Documentation | every `docs/*.md` **on disk** is linked from README | walks disk → README, never README → disk |
 * | `documentation.test.ts` § the phase set | three documents agree about phases | says nothing about paths |
 * | `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree vs disk, both directions | scoped to directories, not to citations |
 * | `validation/phaseStatus.test.ts` | an accepted phase's cited tests, directories, studies and pin groups exist | scoped to the roadmap's *status* citations |
 *
 * So the gap was specific and total: **nothing checked that a document citing a repository path
 * could be followed.** `docs/07` § 9 gives the reason it matters — *"prose is the only artefact in
 * this repository that nothing executes"* — and ten of the twenty-one findings in
 * `docs/08-review-findings.md` were documentation drift.
 *
 * ## Two forms, because the instance was the second one
 *
 * 1. **Markdown links** — `[text](../DECISIONS.md)`. Resolved against the citing file's directory.
 * 2. **Backticked document paths** — `` `packages/viz/DECISIONS-T29.md` ``. This is the form the
 *    real defect took, and a link-only guard would have missed it entirely. Resolved against the
 *    repository root *or* the citing file's directory, accepting either, because both conventions
 *    are in use here.
 *
 * Form 2 is deliberately narrowed to `.md` targets. Widening it to every backticked path with a
 * file extension was tried and is **not** what this guard should be: this repository backticks
 * illustrative and historical paths freely — a module that has since moved, a file named inside a
 * quoted error message — and a guard that cries about those trains people to ignore it, which is
 * the failure § D91 records for wall-clock gates. Source-path liveness has its own owners: the
 * three dead-code audits and `moduleTree.test.ts`.
 *
 * ## The guard on the guard
 *
 * Both halves assert they found something to check. An empty walk, a regex that stops matching, or
 * a skip list that swallows the tree would otherwise make this file pass by asserting nothing —
 * the degradation `phaseStatus.test.ts` calls out in its own parse and `moduleTree.test.ts` guards
 * by asserting `core`'s presence.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Build output, dependencies and VCS internals are not authored prose. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  // The viewer's web bundle, for `dist/`'s reason and one of its own. Build output is not authored
  // prose — but more than that, this directory exists only if somebody has run
  // `npm run build:web`, so walking it made the suite pass or fail on local state rather than on
  // the tree. It did exactly that once: `publicDir` copied `data/buildings/README.md` into the
  // bundle, and its `../../docs/…` links resolved from `data/buildings/` and not from the copy.
  // The copy is fixed at source — `vite.config.ts` now emits named files instead of the directory
  // — and this entry is the second half, so a future stray document cannot make a green suite
  // depend on whether you happened to build the viewer first.
  'dist-web',
  '.git',
  'coverage',
  '.vite',
  '.turbo',
  // **A git worktree is a different checkout, not authored content of this one.** `.worktrees/`
  // is gitignored and holds full trees of other branches; walking into them makes this guard
  // report *this* branch as broken because a document on *another* branch cites a path that
  // exists there and not here. That is exactly what happened: seventeen of the failures were
  // `.worktrees/w13-*/docs/15-compute-offload-contract.md → infra/README.md`, a contract and an
  // `infra/` directory that live on a branch this tree has never had. Every one of those
  // documents is already checked by this same test when its own branch runs it, so skipping is
  // not a coverage loss — it is the difference between auditing a tree and auditing the disk.
  '.worktrees',
  // **The same defect, at a path the entry above does not name.** Agent worktrees are created
  // under `.claude/worktrees/`, so `'.worktrees'` never matched them and the walk went straight in.
  // It failed exactly as predicted above, one directory over: this branch went red because a
  // *running* agent's half-written `DECISIONS.md` cited `§ D285` and `§ D286` before it had written
  // those headings. Nothing on this branch was wrong, and the tree it was auditing was not this one.
  //
  // Worth stating rather than just patching: a skip list keyed on literal names cannot see that
  // two directories are the same *kind* of thing. This entry is the second name for one purpose —
  // *a checkout that is not this one* — and if a third location appears, the fix is to match the
  // purpose rather than to add a third string.
  '.claude',
]);

function filesWithSuffix(suffix: string, dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      filesWithSuffix(suffix, join(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

const DOCUMENTS: readonly string[] = Object.freeze(filesWithSuffix('.md', ROOT).sort());

/**
 * Every `.ts` file this repository owns — the corpus the `§ Dnnn` case reads **beside** the markdown.
 *
 * ## Why this exists, and it is not a tidy-up
 *
 * The `§ Dnnn` case below iterated `DOCUMENTS` only, so a citation written in a docstring was
 * unchecked. That is not a small remainder: measured on this tree, the `.ts` corpus carries
 * **3 350** `§ Dnnn` citations against markdown's **3 119**, so *more than half of the references
 * this gate exists to police were outside it*.
 *
 * It was found the way this file's own header describes — by eye, during an audit, not by a test.
 * Wave G's integration merged § D393's closing sentence and § D394's heading onto one line
 * (`it.## D394 — …`), D394 stopped being a heading, and five citations to it — three in
 * `packages/server/src/store/store.test.ts`, two in `validation/operationalInvariants.test.ts` —
 * named a section the file no longer carried. Every one of the five is in a `.ts` file, so this
 * gate read none of them and stayed green over the whole wave.
 *
 * Widening it immediately reported **two** further dangling citations that had been in the tree
 * since 2026-07-28 — `packages/core/src/metrics/summarize.ts` and
 * `packages/core/src/metrics/serviceLevel.test.ts`, both naming a decision **83** this file has
 * never carried — which is the measure of how long a blind half stays blind. Both came from
 * `validation/DECISIONS-T20.md`, a per-lane record folded into this one; the fold rewrote the
 * *path* and left the *number*, which belonged to the retired file's own sequence. They are
 * retargeted at [§ T21-D1](../../../../DECISIONS.md) and § T21-D2, the entries that carry the
 * material, and this file's own numbering skips 78–84 precisely because those lanes numbered in
 * their own series.
 *
 * ## This file is **not** excluded from its own check, and that is a choice
 *
 * `validation/documentation.test.ts` excludes itself by path, because the phrase its ratchet counts
 * is also its subject and cannot be paraphrased away. The opposite holds here: this file makes
 * several real citations that a reader must be able to follow, so exempting it would blind the gate
 * where it is most read. A dangling number named in *prose* is avoidable — write the digits without
 * the section sigil, as the paragraph above does — and that is the fix rather than an exclusion.
 * The first run of the widened gate reported this file for exactly that, which is how the choice
 * came to be made.
 *
 * ## Fences are not stripped here, deliberately
 *
 * `withoutFences` exists because a fenced block in a *document* is an example rather than a claim.
 * A `.ts` file has no top-level fences: a fenced sample inside a docstring sits behind a ` * `
 * gutter, so the markdown fence pattern — anchored at up to three leading spaces — never reaches
 * it, and running it here would be a no-op that read as a policy. What a `.ts` file has instead is
 * block comments, and **a citation inside one is a real citation** — it is the form nearly every
 * one of these takes. So the source text is read as it stands.
 */
const SOURCES: readonly string[] = Object.freeze(filesWithSuffix('.ts', ROOT).sort());

const relativeToRoot = (absolute: string): string =>
  absolute.slice(ROOT.length).replaceAll('\\', '/');

/**
 * A fenced block is an example, not a claim.
 *
 * `docs/10` § 14 quotes, inside a fence, the exact README table row it is *asking* README to add —
 * `[Experience layer contract](docs/10-experience-layer-contract.md)`, correct relative to README
 * and wrong relative to `docs/10`. Read as a citation it is a broken link; read as what it is, it
 * is a request that has since been granted. A guard that cannot tell those apart reports the
 * document for quoting the fix.
 *
 * Replaced with blank lines rather than removed, so a reported line number still means something.
 *
 * The leading-whitespace allowance is not cosmetic: the block this exists for is indented three
 * spaces inside a numbered list, and a column-0 fence rule reports it. CommonMark permits up to
 * three.
 */
const withoutFences = (source: string): string =>
  source.replace(/^[ \t]{0,3}```[\s\S]*?^[ \t]{0,3}```/gm, (block) =>
    '\n'.repeat(block.split('\n').length - 1),
  );

/** `[text](target)` — target captured, whitespace-free, so a title suffix does not join it. */
const MARKDOWN_LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g;

/** A backticked path with at least one separator, ending in `.md`. */
const BACKTICKED_DOCUMENT = /`([^`\n]*\/[^`\n]*\.md)`/g;

/**
 * Anything the filesystem cannot be asked about.
 *
 * The glob clause earns its place: `docs/*.md` appears in five documents as the *name of a set* —
 * "every `docs/*.md` on disk" — and is not a citation of anything. Asking `existsSync` about it
 * would report five documents for describing a rule correctly.
 */
const isExternal = (target: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) ||
  target.startsWith('#') ||
  target.startsWith('//') ||
  target.includes('*');

/** `../DECISIONS.md#d27` and `../DECISIONS.md` are the same file. */
const withoutFragment = (target: string): string => target.split('#')[0] ?? '';

interface Citation {
  readonly document: string;
  readonly target: string;
}

function citationsOf(pattern: RegExp, filter: (target: string) => boolean): readonly Citation[] {
  const found: Citation[] = [];
  for (const file of DOCUMENTS) {
    const source = withoutFences(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(pattern)) {
      const target = withoutFragment(match[1] ?? '');
      if (target === '' || isExternal(target) || !filter(target)) continue;
      found.push({ document: relativeToRoot(file), target });
    }
  }
  return found;
}

const describeMiss = (citation: Citation): string => `${citation.document} → ${citation.target}`;

describe('a cited repository path can be followed', () => {
  it('walks the authored markdown rather than a hand-written list', () => {
    // The guard on the guard. A hand-written file list is how a document added later becomes
    // invisible to its own guard — the failure `index.test.ts`'s study entry points was rewritten
    // to avoid, where five hand-written names hid a sixth that was dead.
    expect(DOCUMENTS.length, 'the markdown walk found nothing — the walk is broken').toBeGreaterThan(
      10,
    );
    const names = DOCUMENTS.map(relativeToRoot);
    expect(names).toContain('README.md');
    expect(names).toContain('CLAUDE.md');
    expect(names).toContain('DECISIONS.md');
    expect(names.some((name) => name.startsWith('docs/'))).toBe(true);
    expect(names.some((name) => name.startsWith('packages/'))).toBe(true);
  });

  it('resolves every relative markdown link to a file on disk', () => {
    const links = citationsOf(MARKDOWN_LINK, () => true);

    expect(links.length, 'no markdown links found — the regex stopped matching').toBeGreaterThan(
      100,
    );

    const dangling = links.filter(
      (citation) => !existsSync(resolve(ROOT, dirname(citation.document), citation.target)),
    );

    expect(
      dangling.map(describeMiss),
      'a markdown link pointing at a path that is not on disk. Prose is the only artefact in this ' +
        'repository that nothing executes, which is why this is a test and not a convention.',
    ).toEqual([]);
  });

  it('resolves every backticked document path — the form the real defect took', () => {
    const cited = citationsOf(BACKTICKED_DOCUMENT, () => true);

    expect(
      cited.length,
      'no backticked document paths found — the regex stopped matching, and this is the half that ' +
        'catches the instance this guard exists for',
    ).toBeGreaterThan(5);

    const dangling = cited.filter((citation) => {
      const fromRoot = resolve(ROOT, citation.target);
      const fromDocument = resolve(ROOT, dirname(citation.document), citation.target);
      return !existsSync(fromRoot) && !existsSync(fromDocument);
    });

    expect(
      dangling.map(describeMiss),
      'a backticked document path that is not on disk, resolved against both the repository root ' +
        'and the citing document. The retired T29 lane record was cited by three documents and has ' +
        'never existed; the decision it names is DECISIONS.md § D111. (Named without its path on ' +
        'purpose: boundaries.test.ts forbids any reference to the renderer package from core or ' +
        'experiments sources, and it caught this message when it carried one.)',
    ).toEqual([]);
  });

  /**
   * A `§ Dnnn` reference names a heading in `DECISIONS.md`, and the heading has to be there.
   *
   * Added in the same pass as the two above, and for a reason worth recording: while correcting
   * `CLAUDE.md` for wave 6 the orchestrator cited **§ D144** for a verdict whose entry had not been
   * numbered yet. Nothing would have caught it. The path guard above resolves
   * `[…](DECISIONS.md)` — which exists — and stops there; the `§ Dnnn` that tells a reader *which
   * decision* is unchecked, and it is the half carrying the meaning.
   *
   * That is the same failure the two above exist for, one level finer: a citation that looks
   * followable and is not.
   *
   * **It reads `.ts` as well as markdown, and that half was missing until 2026-08-29.** See
   * {@link SOURCES} for the measurement and for what widening it found on its first run. The short
   * version: most `§ Dnnn` citations in this repository are in docstrings, and none of them were
   * checked — including all five citations to the § D394 heading a merge had eaten.
   *
   * **Retired lane records are deliberately out of scope.** `§ T16-D7`, `§ T22-D1`, `§ T30-D3` and
   * their siblings are section numbers from per-lane documents that were consolidated into
   * `DECISIONS.md` and deleted; the numbers are preserved because they are how those decisions were
   * argued at the time, and they were never headings here. See this file's `DECISIONS.md` header
   * note. Only `§ D<digits>` is checked.
   */
  it('resolves every § Dnnn reference to a heading in DECISIONS.md', () => {
    const log = readFileSync(resolve(ROOT, 'DECISIONS.md'), 'utf8');
    const headings = new Set(
      [...log.matchAll(/^##\s+D(\d+)\b/gm)].map((match) => Number(match[1])),
    );

    expect(headings.size, 'no ## Dnnn headings found — the heading regex stopped matching')
      .toBeGreaterThan(100);

    /* `§ D110–§ D125` and `§ D116](../DECISIONS.md)` both occur; capture the number only, and
       require a non-digit boundary so `§ D11` cannot match inside `§ D110`. */
    const missing: string[] = [];
    let citations = 0;
    for (const file of [...DOCUMENTS, ...SOURCES]) {
      // Markdown only: see SOURCES for why a `.ts` file is read as it stands.
      const raw = readFileSync(file, 'utf8');
      const source = file.endsWith('.md') ? withoutFences(raw) : raw;
      for (const match of source.matchAll(/§\s*D(\d+)(?!\d)/g)) {
        citations += 1;
        const number = Number(match[1]);
        if (!headings.has(number)) missing.push(`${relativeToRoot(file)} → § D${number}`);
      }
    }

    // The guard on the guard, in both halves. A skip list that swallowed `packages/` or a walk
    // that stopped at `.md` would otherwise make this case pass by reading half the tree — which
    // is exactly the state it was in until the `.ts` corpus was added to it.
    expect(SOURCES.length, 'the .ts walk found nothing — the walk is broken').toBeGreaterThan(500);
    expect(
      citations,
      'no § Dnnn citation was read at all, so this case asserts nothing',
    ).toBeGreaterThan(1000);

    expect(
      [...new Set(missing)].sort(),
      'a § Dnnn reference naming a decision that DECISIONS.md does not carry. The link to the file ' +
        'resolves; the section is the half that carries the meaning, and it was unchecked until a ' +
        'citation to an unassigned § D144 was written by hand and caught by eye. Docstrings are ' +
        'read too, and they are where most of these live.',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * A number cited as an issue is an issue: GitHub issue #589, § D1268
 * -------------------------------------------------------------------------- */

/**
 * Every pull request GitHub has numbered in this repository, read from
 * `GET /repos/mrpeanut01/elevator-sim/pulls?state=all` on 2026-10-10: **180 of them, through #616**.
 *
 * GitHub numbers issues and pull requests from one sequence, so a number is one kind or the other
 * for good, and a citation that calls a pull request an issue still resolves (GitHub redirects
 * `issues/N` to `pull/N`), lands on a relevant page, and names the wrong kind of thing. Wave AG wrote
 * that thirty-one times about the pull request that shipped it, #587: its lanes were briefed from an
 * assessor's findings rather than from filed issues and wrote down a number nobody had filed. Reading
 * the whole list rather than the handful the issue named found two older ones, #334 in § D462's date
 * line and #556 in a `fixitScreen.ts` docstring.
 *
 * **Complete up to #616 and no further.** A pull request opened later is not here until someone adds
 * it, so this catches every instance up to that number and is a floor above it. Written as ranges
 * because the numbers are, and expanded once.
 */
const PULL_REQUEST_RANGES: readonly (number | readonly [number, number])[] = [
  [1, 12], 89, 95, [120, 122], 128, [131, 133], [138, 139], 141, 148, [150, 155], [183, 185], 253,
  271, 276, 280, [284, 285], 302, 304, [307, 308], 311, 314, 319, 322, 326, 330, 334, 339, 343, 345,
  347, [357, 363], 378, [383, 399], [401, 403], [446, 455], [457, 466], [468, 474], [479, 480],
  [482, 498], [502, 517], [519, 521], [524, 525], 527, [529, 530], 532, 538, [541, 542], [545, 547],
  [550, 552], 556, 560, 574, 585, 587, 604, [606, 616],
];

const PULL_REQUESTS: ReadonlySet<number> = new Set(
  PULL_REQUEST_RANGES.flatMap((entry) =>
    typeof entry === 'number'
      ? [entry]
      : Array.from({ length: entry[1] - entry[0] + 1 }, (_unused, at) => entry[0] + at),
  ),
);

/**
 * Decision entries whose date line cites a pull request as an issue and keeps doing so, keyed by
 * decision number, with the numbers each one miscites.
 *
 * A decision entry is not rewritten after the fact, so each of these carries a dated correction in a
 * blockquote under its heading instead (`> **Corrected 2026-10-10 …**`, naming the `pull/N` link),
 * and the case below requires that line rather than trusting this map. It is held in both
 * directions: a row whose entry no longer miscites the number is stale and fails, and so does a row
 * whose entry lost its correction.
 */
const CORRECTED_UNDER_THE_HEADING: ReadonlyMap<number, readonly number[]> = new Map([
  [462, [334]],
  [912, [587]],
  [914, [587]],
  [963, [587]],
]);

/** Every authored text file a citation can live in: prose, code, data notes, workflows and scripts. */
const AUTHORED_TEXT: readonly string[] = Object.freeze(
  ['.md', '.ts', '.mts', '.mjs', '.json', '.yml', '.yaml', '.sh', '.bicep']
    .flatMap((suffix) => filesWithSuffix(suffix, ROOT))
    // Generated, and carries no prose.
    .filter((file) => !file.endsWith('package-lock.json'))
    .sort(),
);

/**
 * The words that call a number an issue. `issues?`, so a list (*issues #584 and #587*) is read
 * whole, and the two words may be split by a wrapped line's gutter, a blockquote marker or bold.
 */
const ISSUE_WORDS = /GitHub[\s>*/]+issues?\b/giu;

/**
 * What may stand between those words and the numbers they cite, and between one number and the
 * next: whitespace, a docstring gutter or a line comment, a blockquote marker, bold, a markdown
 * link's brackets and target, and a list's comma or conjunction. Anything else ends the list, so
 * *issue #334's* reads one number, and so does *issue #412, `DECISIONS.md` § D621*.
 *
 * Anchored and able to match nothing, so it never fails and never backtracks.
 */
const CITED_LIST = /^(?:\s|\*{1,2}|\/\/|>|\[|\]|\([^()\s]*\)|,|&|\band\b|\bor\b|#\d+)*/u;

/** A link to an issue page, which is the form a citation keeps when the prose around it is reworded. */
const ISSUE_URL = /github\.com\/mrpeanut01\/elevator-sim\/issues\/(\d+)/gu;

interface IssueCitation {
  readonly offset: number;
  readonly number: number;
}

function issueCitationsIn(text: string): readonly IssueCitation[] {
  const found: IssueCitation[] = [];
  for (const words of text.matchAll(ISSUE_WORDS)) {
    const from = (words.index ?? 0) + words[0].length;
    const list = CITED_LIST.exec(text.slice(from, from + 600))?.[0] ?? '';
    for (const cited of list.matchAll(/#(\d+)/gu)) {
      found.push({ offset: from + (cited.index ?? 0), number: Number(cited[1]) });
    }
  }
  for (const url of text.matchAll(ISSUE_URL)) {
    found.push({ offset: url.index ?? 0, number: Number(url[1]) });
  }
  return found;
}

const lineAt = (text: string, offset: number): number => text.slice(0, offset).split('\n').length;

/** The `## Dnnn` entry an offset in `DECISIONS.md` falls inside, with that entry's text. */
function entryAt(
  log: string,
  offset: number,
): { readonly id: number; readonly text: string } | undefined {
  const headings = [...log.matchAll(/^##\s+D(\d+)\b/gmu)];
  const at = headings.filter((heading) => (heading.index ?? 0) <= offset).length - 1;
  if (at < 0) return undefined;
  const start = headings[at]?.index ?? 0;
  const end = headings[at + 1]?.index ?? log.length;
  return { id: Number(headings[at]?.[1]), text: log.slice(start, end) };
}

/** The dated blockquote corrections an entry carries, each read whole across its wrapped lines. */
const correctionsIn = (entry: string): readonly string[] =>
  [...entry.matchAll(/^> \*\*Corrected \d{4}-\d{2}-\d{2}\b[^\n]*(?:\n>[^\n]*)*/gmu)].map(
    (match) => match[0],
  );

describe('a number cited as a GitHub issue is an issue, not a pull request', () => {
  it('reads every authored text file, and finds citations there to police', () => {
    const names = AUTHORED_TEXT.map(relativeToRoot);
    for (const expected of [
      'DECISIONS.md',
      'data/contract-ladder.json',
      '.github/workflows/deep-tiers.yml',
      'packages/experiments/src/validation/citations.test.ts',
    ]) {
      expect(names, `the walk missed ${expected}, so it is not reading the tree`).toContain(expected);
    }
    const cited = AUTHORED_TEXT.reduce(
      (sum, file) => sum + issueCitationsIn(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(
      cited,
      'almost no issue citations were read, so the case below asserts nothing',
    ).toBeGreaterThan(1000);
    expect(PULL_REQUESTS.size, 'the registry expanded to the wrong size').toBe(180);
    expect([587, 606, 616].every((number) => PULL_REQUESTS.has(number))).toBe(true);
    expect(PULL_REQUESTS.has(589), '#589 is the issue that asked for this guard').toBe(false);
  });

  it('reads each form a citation takes in this tree, and stops where the list stops', () => {
    // Built at run time, so this file's own text carries none of the forms it tests.
    const words = ['GitHub', 'issue'].join(' ');
    const url = ['https://github.com/mrpeanut01/elevator-sim', 'issues', '587'].join('/');
    const numbersIn = (text: string): readonly number[] =>
      issueCitationsIn(text).map((citation) => citation.number);
    expect(numbersIn(`${words} #587, § D914.`)).toEqual([587]);
    expect(numbersIn(`${words} **#587**, [§ D912](x).`)).toEqual([587]);
    expect(numbersIn(`${words}\n * **#587**, [§ D914](x).`)).toEqual([587]);
    expect(numbersIn(`GitHub\n> issue [#587](u), wrapped in a blockquote`)).toEqual([587]);
    expect(numbersIn(`${words}s [#584](u) and [#587](u) · Rules on`)).toEqual([584, 587]);
    expect(numbersIn(`(${url})`)).toEqual([587]);
    expect(numbersIn(`${words} #334's macOS red, and #587 later`)).toEqual([334]);
    expect(numbersIn(`${words} #412, \`DECISIONS.md\` #587`)).toEqual([412]);
    expect(numbersIn('PR #587 and pull/587')).toEqual([]);
  });

  it('cites no pull request as an issue, outside the decision entries corrected under their headings', () => {
    const miscited: string[] = [];
    const corrected = new Map<number, Set<number>>();
    for (const file of AUTHORED_TEXT) {
      const raw = readFileSync(file, 'utf8');
      const text = file.endsWith('.md') ? withoutFences(raw) : raw;
      const name = relativeToRoot(file);
      for (const citation of issueCitationsIn(text)) {
        if (!PULL_REQUESTS.has(citation.number)) continue;
        if (name === 'DECISIONS.md') {
          const entry = entryAt(text, citation.offset);
          const kept = entry === undefined ? undefined : CORRECTED_UNDER_THE_HEADING.get(entry.id);
          if (entry !== undefined && kept?.includes(citation.number) === true) {
            corrected.set(entry.id, (corrected.get(entry.id) ?? new Set()).add(citation.number));
            continue;
          }
        }
        miscited.push(`${name}:${String(lineAt(text, citation.offset))} → #${String(citation.number)}`);
      }
    }

    expect(
      [...new Set(miscited)],
      'a pull request cited as a GitHub issue. Cite it as a pull request ("PR #N", or a pull/N ' +
        'link), or cite the issue that asked for the work. A decision entry is not rewritten: give it ' +
        'a dated correction under its heading and a row in CORRECTED_UNDER_THE_HEADING.',
    ).toEqual([]);

    const log = withoutFences(readFileSync(resolve(ROOT, 'DECISIONS.md'), 'utf8'));
    for (const [id, numbers] of CORRECTED_UNDER_THE_HEADING) {
      const heading = [...log.matchAll(/^##\s+D(\d+)\b/gmu)].find(
        (match) => Number(match[1]) === id,
      );
      const entry = heading === undefined ? undefined : entryAt(log, heading.index ?? 0);
      const lines = entry === undefined ? [] : correctionsIn(entry.text);
      for (const number of numbers) {
        expect(
          corrected.get(id)?.has(number),
          `§ D${String(id)} no longer cites #${String(number)} as an issue, so its row here is stale`,
        ).toBe(true);
        expect(
          lines.some((line) => line.includes(`/pull/${String(number)})`)),
          `§ D${String(id)} keeps its citation of #${String(number)} and carries no dated ` +
            'correction naming the pull request, which is the condition of keeping it',
        ).toBe(true);
      }
    }
  });
});
