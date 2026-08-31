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
