/**
 * **The revert rehearsal's pure half, its safe-execution half, and the promise its documents may
 * not make** — GitHub issues **#355** (AC4) and **#540**.
 *
 * ## What this file is for
 *
 * `scripts/rehearse-revert.mjs` runs the part of `docs/16-static-site-deployment.md` § 11.2 that can
 * be run with no credential and no live resource: the git half, in a throwaway clone by default, and
 * — since #540 — for real under `--apply`. It is the answer to *a procedure nobody has run is a
 * draft* for the steps a checkout can reach, and it is **not** an answer for the steps it cannot —
 * the upload, the branch policy, the propagation time, the API half and the save-clearing in a
 * browser.
 *
 * Three things therefore need a guard, and they are different in kind.
 *
 * 1. **The script's decisions**, which are pure functions over text and are driven here against
 *    fixtures with no git, no clone and no network — the split `validation/deadPage.test.ts` uses
 *    for the same reason: the useful half of an operator's tool is a decision, and a decision can be
 *    tested without the thing it is about. {@link isMergeCommit}, {@link parseCommitLog},
 *    {@link planRevertSteps}, {@link classifyHistoryProblem} and {@link historyProblemMessage} are
 *    #540's structural fix, and every one of them is pure.
 * 2. **{@link safeRevertTo}'s execution against real git**, in real throwaway repositories this file
 *    builds — a merge commit, a shallow clone, and an injected mid-plan failure — because #540's two
 *    failure modes are properties of git's own behaviour and no fixture can stand in for that. This
 *    is the split `validation/documentation.test.ts` calls out generally: a decision is tested
 *    against fixtures, and the thing the decision is about is tested against the real thing.
 * 3. **The claim its documents make about it.** This is the part worth reading. A harness that runs
 *    half a procedure is one careless edit away from a document saying the procedure is rehearsed,
 *    and `CLAUDE.md`'s *stated refusal goes stale* rule has its worst polarity here: a **stale
 *    promise** tells a reader in an incident that they hold a recovery they have not checked. So
 *    § 11.5 is required to carry both halves — the harness that runs, and the sentence saying the
 *    production half has not been run — and deleting the second makes this file red.
 *
 * ## The one derivation that is not a fixture
 *
 * {@link artifactPathspecsOf} reads `.github/workflows/deploy-viz.yml`'s own `paths:` list, so the
 * tree comparison in § 11.2 step 2 cannot fall out of step with the workflow that decides what the
 * artifact is built from. It is asserted here **in both directions** against the workflow on disk —
 * every pathspec comes from a workflow path, and every workflow path outside `.github/` yields a
 * pathspec — because a derivation checked in one direction is a derivation that can silently shrink.
 *
 * No `DECISIONS.md` entry for the guard itself: this docstring is the record, per
 * [§ D405](../../../../DECISIONS.md). The rehearsal split it holds in place is
 * [§ D587](../../../../DECISIONS.md); the safe-execution fix and `--apply` are
 * [§ D615](../../../../DECISIONS.md).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  NOT_REHEARSED,
  artifactPathspecsOf,
  buildVersionOf,
  classifyHistoryProblem,
  crossesSaveSchema,
  historyProblemMessage,
  isMergeCommit,
  issuesOf,
  parseCommitLog,
  planRevertSteps,
  safeRevertTo,
  SESSION_TYPES,
  schemaBumpsOf,
  summaryOf,
  type Observation,
} from '../../../../scripts/rehearse-revert.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');
const SCRIPT = join(ROOT, 'scripts/rehearse-revert.mjs');

const WORKFLOW = '.github/workflows/deploy-viz.yml';

/** A held observation, so a case can break exactly one thing. */
const HELD: Observation = {
  id: 'tree-matches-target',
  claim: 'the reverted tree equals the target over the artifact paths',
  observed: 'the comparison prints nothing, which is what step 2 requires',
  ok: true,
};

describe('the artifact pathspecs are derived from the workflow (GitHub issue #355)', () => {
  it('takes every push path outside `.github/` and nothing else', () => {
    const specs = artifactPathspecsOf(read(WORKFLOW));
    expect(specs).toEqual(['packages', 'data', 'package.json', 'package-lock.json', 'tsconfig*.json']);
  });

  it('matches the workflow in both directions, so the comparison cannot silently shrink', () => {
    const workflow = read(WORKFLOW);
    const declared = /on:\n\s+push:\n(?:.*\n)*?\s+paths:\n((?:\s+- '.*'\n)+)/u.exec(workflow);
    expect(
      declared,
      `${WORKFLOW} no longer declares on.push.paths in a shape this case can read, so the ` +
        'both-directions check below asserts nothing. Fix the reader rather than deleting the case.',
    ).not.toBeNull();
    const block = (declared as RegExpExecArray)[1] ?? '';
    const fromWorkflow = [...block.matchAll(/- '(.*)'/gu)].map((m) => m[1] ?? '');
    expect(fromWorkflow.length).toBeGreaterThan(4);

    const specs = artifactPathspecsOf(workflow);
    // Every pathspec came from a workflow path.
    for (const spec of specs) {
      expect(fromWorkflow.some((path) => path === spec || path === `${spec}/**`)).toBe(true);
    }
    // Every workflow path outside `.github/` produced a pathspec.
    for (const path of fromWorkflow) {
      if (path.startsWith('.github/')) continue;
      expect(specs.some((spec) => spec === path || `${spec}/**` === path)).toBe(true);
    }
    // And the workflow file itself is deliberately not compared: it triggers the run, it is not in
    // the artifact.
    expect(specs.some((spec) => spec.startsWith('.github'))).toBe(false);
  });

  it('refuses a workflow whose paths it cannot find rather than comparing nothing', () => {
    expect(() => artifactPathspecsOf('on:\n  push:\n    branches: [main]\n')).toThrow(/blind/u);
    expect(() =>
      artifactPathspecsOf("on:\n  push:\n    paths:\n      - 'packages/**'\n      - 'data/**'\n"),
    ).toThrow(/looking at almost nothing/u);
  });
});

describe('the save-schema crossing (docs/16 § 11.3)', () => {
  it('reads a real bump out of a diff of `persist/types.ts`', () => {
    const diff = [
      `diff --git a/${SESSION_TYPES} b/${SESSION_TYPES}`,
      '@@ -288,7 +288,7 @@',
      '-export const SESSION_SCHEMA_VERSION = 8;',
      '+export const SESSION_SCHEMA_VERSION = 9;',
      ' export const SESSION_SCHEMA_VERSIONS_READ = [7, 8, 9];',
    ].join('\n');
    expect(schemaBumpsOf(diff)).toEqual([{ from: 8, to: 9 }]);
  });

  it('finds no crossing in a diff that moves something else in the same file', () => {
    const diff = [
      `diff --git a/${SESSION_TYPES} b/${SESSION_TYPES}`,
      '-/** The slot the week is written to. Bumping SESSION_SCHEMA_VERSION is the other half. */',
      '+/** The slot the week is written to, and what a stale one costs. */',
    ].join('\n');
    expect(schemaBumpsOf(diff)).toEqual([]);
  });

  it('calls a crossing only when both sides are there', () => {
    // The whole cost of a false positive here is an operator learning to pass --accept-save-loss
    // without reading the line, so the one case that must not fire is the constant arriving or
    // leaving: neither can clear anybody's slot.
    expect(crossesSaveSchema([{ from: 8, to: 9 }])).toBe(true);
    expect(crossesSaveSchema([{ from: undefined, to: 9 }])).toBe(false);
    expect(crossesSaveSchema([{ from: 8, to: undefined }])).toBe(false);
    expect(crossesSaveSchema([])).toBe(false);
    // And a revert *forward* over a range whose tip writes the older version is not a crossing
    // either — the direction is what costs the week.
    expect(crossesSaveSchema([{ from: 9, to: 8 }])).toBe(false);
  });

  it('is empty on an empty diff, which is why the script checks the file exists first', () => {
    // A path that is not in the tree produces no diff at all, which is indistinguishable here from
    // a clean range. `rehearse-revert.mjs` establishes existence with `git cat-file -e` before it
    // trusts this function's silence, and reports *blind* rather than *clean* when it cannot.
    expect(schemaBumpsOf('')).toEqual([]);
  });
});

describe('the safe revert plan (GitHub issue #540, item 1) — pure fixtures', () => {
  const linear = { sha: 'aaa', parents: ['zzz'] };
  const merge = { sha: 'bbb', parents: ['zzz', 'yyy'] };
  const root = { sha: 'zzz', parents: [] };

  it('calls a commit with more than one parent a merge, and nothing else one', () => {
    expect(isMergeCommit(linear)).toBe(false);
    expect(isMergeCommit(merge)).toBe(true);
    expect(isMergeCommit(root)).toBe(false);
  });

  it('plans one `git revert --no-commit` per commit, `-m 1` on a merge, never the ranged form', () => {
    const steps = planRevertSteps([linear, merge, root]);
    expect(steps).toEqual([
      { sha: 'aaa', isMerge: false, args: ['revert', '--no-commit', 'aaa'] },
      { sha: 'bbb', isMerge: true, args: ['revert', '--no-commit', '-m', '1', 'bbb'] },
      { sha: 'zzz', isMerge: false, args: ['revert', '--no-commit', 'zzz'] },
    ]);
    // Never once the two-dot range form this whole issue is about.
    for (const step of steps) expect(step.args.some((a) => a.includes('..'))).toBe(false);
  });

  it('parses `git log --format="%H<sep>%P"` into shas and parent lists, newest first, unchanged', () => {
    const log = ['aaazzz', 'bbbzzz yyy', 'zzz'].join('\n');
    expect(parseCommitLog(log)).toEqual([linear, merge, root]);
  });

  it('ignores blank lines and honours a custom separator', () => {
    expect(parseCommitLog('\naaa|zzz\n\n', '|')).toEqual([linear]);
  });

  it('classifies GitHub issue #540’s two shapes, and the third case they are not', () => {
    expect(
      classifyHistoryProblem({ isShallow: true, objectExistsLocally: false, isAncestorOfTip: false }),
    ).toEqual({ blocked: true, reason: 'shallow-history' });
    expect(
      classifyHistoryProblem({ isShallow: false, objectExistsLocally: false, isAncestorOfTip: false }),
    ).toEqual({ blocked: true, reason: 'unknown-revision' });
    expect(
      classifyHistoryProblem({ isShallow: false, objectExistsLocally: true, isAncestorOfTip: false }),
    ).toEqual({ blocked: true, reason: 'not-an-ancestor' });
    expect(
      classifyHistoryProblem({ isShallow: false, objectExistsLocally: true, isAncestorOfTip: true }),
    ).toEqual({ blocked: false, reason: null });
    // A shallow clone that *does* hold the target is not the shallow-history problem — the
    // boundary matters, not the flag alone.
    expect(
      classifyHistoryProblem({ isShallow: true, objectExistsLocally: true, isAncestorOfTip: true }),
    ).toEqual({ blocked: false, reason: null });
  });

  it('names which of the three a message is about, precisely rather than quoting git', () => {
    const shallow = historyProblemMessage(
      { blocked: true, reason: 'shallow-history' },
      'deadbeef',
      'HEAD',
    );
    expect(shallow).toContain('shallow');
    expect(shallow).toContain('#540');
    expect(shallow).toMatch(/fetch --unshallow|fetch-depth/u);

    const unknown = historyProblemMessage(
      { blocked: true, reason: 'unknown-revision' },
      'deadbeef',
      'HEAD',
    );
    expect(unknown).toContain('does not exist');
    expect(unknown).toContain('not shallow');

    const notAncestor = historyProblemMessage(
      { blocked: true, reason: 'not-an-ancestor' },
      'deadbeef',
      'main',
    );
    expect(notAncestor).toContain('not an ancestor');
    expect(notAncestor).toContain('main');
  });
});

describe('the build version the page will show (docs/16 § 11.3, row 1)', () => {
  it('is the first ten characters, as `vite.config.ts#buildVersion` takes them', () => {
    expect(buildVersionOf('79a69a4957c6a3ee27c6a3ee27c6a3ee27c6a3ee')).toBe('79a69a4957');
    expect(buildVersionOf('79a69a4957')).toBe('79a69a4957');
  });
});

describe('what the run reports', () => {
  it('turns every failing observation into an issue and a clean set into none', () => {
    expect(issuesOf([HELD, { ...HELD, id: 'revert-applies' }])).toEqual([]);
    const issues = issuesOf([
      HELD,
      { id: 'range-is-linear', claim: 'no merge commit', observed: '1 merge commit', ok: false },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('range-is-linear');
    expect(issues[0]).toContain('1 merge commit');
  });

  it('names everything it did not rehearse, on a clean run as loudly as on a failing one', () => {
    const clean = summaryOf([HELD], []);
    expect(clean).toContain('The git half of the procedure holds');
    for (const item of NOT_REHEARSED) expect(clean).toContain(item);
    expect(NOT_REHEARSED.length).toBeGreaterThan(4);
  });
});

/**
 * `safeRevertTo` against **real git**, in throwaway repositories this suite builds and removes —
 * GitHub issue #540's two failure modes are properties of git's own behaviour (a ranged revert's
 * abort-after-staging, and a shallow clone's *unknown revision*), so a fixture cannot stand in for
 * either. Every repository lives under the OS temp directory, is built fresh per test and is
 * removed in `afterEach` even on a failing assertion; nothing here touches this checkout.
 */
describe('safeRevertTo against real git (GitHub issue #540)', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop() as string, { recursive: true, force: true });
  });

  const run = (cwd: string, args: readonly string[]): string =>
    execFileSync('git', args as string[], { cwd, encoding: 'utf8' }).trim();

  const status = (cwd: string, args: readonly string[]) => {
    const result = spawnSync('git', args as string[], { cwd, encoding: 'utf8' });
    return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  };

  /** A fresh repo on `main`, with a real identity, ready for commits. */
  const freshRepo = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'rehearse-revert-test-'));
    cleanupDirs.push(dir);
    run(dir, ['init', '--quiet', '-b', 'main']);
    run(dir, ['config', 'user.email', 'test@example.invalid']);
    run(dir, ['config', 'user.name', 'Test']);
    return dir;
  };

  const commit = (dir: string, file: string, contents: string, message: string): string => {
    writeFileSync(join(dir, file), contents);
    run(dir, ['add', file]);
    run(dir, ['commit', '--quiet', '-m', message]);
    return run(dir, ['rev-parse', 'HEAD']);
  };

  it('reverts a linear range one commit at a time and lands on the target’s exact tree', () => {
    const dir = freshRepo();
    const c1 = commit(dir, 'f.txt', 'a\n', 'c1');
    commit(dir, 'f.txt', 'b\n', 'c2');
    commit(dir, 'f.txt', 'c\n', 'c3');

    const result = safeRevertTo(dir, c1, 'HEAD', 'test revert', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stepCount).toBe(2);
    expect(result.merges).toEqual([]);
    expect(status(dir, ['diff', '--quiet', c1, 'HEAD']).code).toBe(0);
    expect(status(dir, ['status', '--porcelain']).code).toBe(0);
    expect(status(dir, ['status', '--porcelain']).output).toBe('');
  });

  it(
    'reverts through a merge commit with -m 1, one commit at a time, and never issues the ranged ' +
      'form that #540 measured aborting part-way',
    () => {
      const dir = freshRepo();
      const c1 = commit(dir, 'f.txt', 'a\n', 'c1');
      run(dir, ['checkout', '--quiet', '-b', 'side']);
      commit(dir, 'g.txt', 'b\n', 'c2 (side, adds g.txt)');
      run(dir, ['checkout', '--quiet', 'main']);
      commit(dir, 'f.txt', 'a2\n', 'c3 (main)');
      run(dir, ['merge', '--quiet', '--no-ff', '-m', 'merge side', 'side']);
      const mergeSha = run(dir, ['rev-parse', 'HEAD']);
      commit(dir, 'f.txt', 'a3\n', 'c4 (main, after the merge)');

      const result = safeRevertTo(dir, c1, 'HEAD', 'test revert', []);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // c4, the merge, c3 and c2 — every commit strictly after c1, one revert each.
      expect(result.stepCount).toBe(4);
      expect(result.merges).toEqual([mergeSha]);
      // The tree is byte-identical to the target, including g.txt having been removed again —
      // this is what the merge's -m 1 revert actually has to undo, not just "no error".
      expect(status(dir, ['diff', '--quiet', c1, 'HEAD']).code).toBe(0);
      expect(status(dir, ['status', '--porcelain']).output).toBe('');
    },
  );

  it(
    'aborts, hard-resets and cleans on a step that fails, so nothing partial is ever committed — ' +
      'the structural fix for #540’s first failure mode',
    () => {
      const dir = freshRepo();
      const c1 = commit(dir, 'f.txt', 'a\n', 'c1');
      commit(dir, 'f.txt', 'b\n', 'c2');
      commit(dir, 'f.txt', 'c\n', 'c3');
      const startSha = run(dir, ['rev-parse', 'HEAD']);

      let calls = 0;
      const failSecondStep = (cwd: string, args: readonly string[]) => {
        calls += 1;
        // Let the first revert run for real — it stages a real change — then fail the second
        // without running it, so the repository is left with a real staged revert to recover
        // from. What is asserted below is that this file's own abort/reset/clean sequence, not
        // git's, is what returns it to a clean state with the real staged change discarded too.
        if (calls === 2) return { code: 42, output: 'injected failure for this test' };
        return status(cwd, args as string[]);
      };

      const result = safeRevertTo(dir, c1, 'HEAD', 'test revert', [], failSecondStep);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('revert-step-failed');
      expect(result.detail).toContain('nothing committed');
      expect(calls).toBeGreaterThanOrEqual(2);

      expect(run(dir, ['rev-parse', 'HEAD'])).toBe(startSha);
      expect(status(dir, ['status', '--porcelain']).output).toBe('');
      // The first step's real staged change (from the genuine `git revert` call) is gone too,
      // not just uncommitted — this is what `git reset --hard` is doing, not merely `--abort`.
      expect(run(dir, ['diff', '--stat', startSha, 'HEAD'])).toBe('');
    },
  );

  it('reports a shallow clone that never fetched the target, not git’s bare "unknown revision"', () => {
    const dir = freshRepo();
    const c1 = commit(dir, 'f.txt', 'a\n', 'c1');
    commit(dir, 'f.txt', 'b\n', 'c2');

    const shallowDir = mkdtempSync(join(tmpdir(), 'rehearse-revert-test-shallow-'));
    cleanupDirs.push(shallowDir);
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--no-local', dir, shallowDir], {
      encoding: 'utf8',
    });
    expect(run(shallowDir, ['rev-parse', '--is-shallow-repository'])).toBe('true');

    const result = safeRevertTo(shallowDir, c1, 'HEAD', 'test revert', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('shallow-history');
    expect(result.detail).toContain('#540');
    expect(result.detail).toMatch(/fetch --unshallow|fetch-depth/u);
  });

  it('tells a target that plain does not exist apart from one the shallow clone merely lacks', () => {
    const dir = freshRepo();
    commit(dir, 'f.txt', 'a\n', 'c1');

    const result = safeRevertTo(dir, '0'.repeat(40), 'HEAD', 'test revert', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown-revision');
  });

  it('tells a target that exists but is not an ancestor apart from a missing one', () => {
    const dir = freshRepo();
    commit(dir, 'f.txt', 'a\n', 'c1');
    run(dir, ['checkout', '--quiet', '-b', 'other']);
    const off = commit(dir, 'g.txt', 'x\n', 'unrelated');
    run(dir, ['checkout', '--quiet', 'main']);
    commit(dir, 'f.txt', 'b\n', 'c2');

    const result = safeRevertTo(dir, off, 'HEAD', 'test revert', []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-an-ancestor');
  });
});

/**
 * The CLI end to end, over `--repo` (test-only — see `scripts/rehearse-revert.mjs`'s own usage
 * docstring) so this drives a throwaway repository rather than the checkout running the suite.
 */
describe('the CLI end to end — --apply and the rehearsal, over --repo', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop() as string, { recursive: true, force: true });
  });

  const run = (cwd: string, args: readonly string[]): string =>
    execFileSync('git', args as string[], { cwd, encoding: 'utf8' }).trim();

  const freshRepo = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'rehearse-revert-cli-test-'));
    cleanupDirs.push(dir);
    run(dir, ['init', '--quiet', '-b', 'main']);
    run(dir, ['config', 'user.email', 'test@example.invalid']);
    run(dir, ['config', 'user.name', 'Test']);
    const workflowDir = join(dir, '.github/workflows');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, 'deploy-viz.yml'),
      [
        'on:',
        '  push:',
        '    paths:',
        "      - 'packages/**'",
        "      - 'data/**'",
        "      - 'package.json'",
        "      - 'package-lock.json'",
        "      - 'tsconfig*.json'",
        "      - '.github/workflows/deploy-viz.yml'",
        '',
      ].join('\n'),
    );
    // Also present, so § 11.2's schema check is clean rather than blind on this fixture — a
    // blind reading is its own already-covered case (`schemaBumpsOf`'s empty-diff test above) and
    // is not what these CLI-level tests are about.
    mkdirSync(join(dir, SESSION_TYPES, '..'), { recursive: true });
    writeFileSync(join(dir, SESSION_TYPES), 'export const SESSION_SCHEMA_VERSION = 1;\n');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'workflow and persist-schema fixtures']);
    return dir;
  };

  const cli = (dir: string, args: readonly string[]) =>
    spawnSync('node', [SCRIPT, ...args, '--repo', dir], { encoding: 'utf8' });

  const statusOf = (dir: string): string =>
    (spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout ?? '').trim();

  const commit = (dir: string, file: string, contents: string, message: string): string => {
    writeFileSync(join(dir, file), contents);
    run(dir, ['add', file]);
    run(dir, ['commit', '--quiet', '-m', message]);
    return run(dir, ['rev-parse', 'HEAD']);
  };

  it('--apply commits a real, safe revert and leaves nothing pushed', () => {
    const dir = freshRepo();
    const base = run(dir, ['rev-parse', 'HEAD']);
    commit(dir, 'f.txt', 'a\n', 'c2');
    commit(dir, 'f.txt', 'b\n', 'c3');

    const result = cli(dir, [base, '--apply']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Reverted');
    expect(result.stdout).toContain('Committed as');
    expect(result.stdout).toContain('Nothing has been pushed');
    expect(statusOf(dir)).toBe('');
    expect(run(dir, ['diff', '--stat', base, 'HEAD'])).toBe('');
  });

  it('--apply refuses a dirty working tree rather than discarding it', () => {
    const dir = freshRepo();
    const base = run(dir, ['rev-parse', 'HEAD']);
    commit(dir, 'f.txt', 'a\n', 'c2');
    writeFileSync(join(dir, 'f.txt'), 'uncommitted\n');

    const result = cli(dir, [base, '--apply']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('uncommitted changes');
    // Nothing was touched: the file still reads the uncommitted content.
    expect(readFileSync(join(dir, 'f.txt'), 'utf8')).toBe('uncommitted\n');
  });

  it('--apply refuses a SESSION_SCHEMA_VERSION crossing without --accept-save-loss, and proceeds with it', () => {
    const dir = freshRepo();
    mkdirSync(join(dir, SESSION_TYPES, '..'), { recursive: true });
    writeFileSync(
      join(dir, SESSION_TYPES),
      'export const SESSION_SCHEMA_VERSION = 8;\n',
    );
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'v8']);
    const base = run(dir, ['rev-parse', 'HEAD']);
    writeFileSync(
      join(dir, SESSION_TYPES),
      'export const SESSION_SCHEMA_VERSION = 9;\n',
    );
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'v9']);

    const refused = cli(dir, [base, '--apply']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('saved week');
    expect(run(dir, ['status', '--porcelain'])).toBe('');
    expect(run(dir, ['rev-parse', 'HEAD'])).not.toBe(base);

    const accepted = cli(dir, [base, '--apply', '--accept-save-loss']);
    expect(accepted.status).toBe(0);
    expect(run(dir, ['diff', '--stat', base, 'HEAD'])).toBe('');
  });

  it('the rehearsal (no --apply) commits nothing to the repository it is pointed at', () => {
    const dir = freshRepo();
    const base = run(dir, ['rev-parse', 'HEAD']);
    commit(dir, 'f.txt', 'a\n', 'c2');
    const tip = run(dir, ['rev-parse', 'HEAD']);

    const result = cli(dir, [base]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('The git half of the procedure holds');
    expect(result.stdout).toContain('--apply');
    // Untouched: HEAD is still the tip, nothing was committed here.
    expect(run(dir, ['rev-parse', 'HEAD'])).toBe(tip);
  });
});

describe('the promise the documents may not make (CLAUDE.md’s stale-refusal rule)', () => {
  const section = (document: string, heading: string): string => {
    const start = document.indexOf(heading);
    expect(start, `the section ${heading} is gone, so this case reads nothing`).toBeGreaterThan(-1);
    const after = document.indexOf('\n## ', start);
    return document.slice(start, after === -1 ? undefined : after);
  };

  it('has docs/16 § 11.5 carry both halves — the harness that runs, and the half that has not', () => {
    const eleven5 = section(read('docs/16-static-site-deployment.md'), '### 11.5');
    expect(eleven5).toContain('scripts/rehearse-revert.mjs');
    expect(
      eleven5,
      '§ 11.5 no longer says that the production half has not been run. A rehearsal of the git ' +
        'half is not a rehearsal of the procedure, and a document that reads as though it were is ' +
        'the stale promise this whole issue is about.',
    ).toContain('has not been run against production');
  });

  it('has the runbook and the checklist point at the same split rather than restating it', () => {
    for (const document of ['docs/40-incident-runbook.md', 'docs/41-launch-checklist.md']) {
      const text = read(document);
      expect(text, `${document} does not name the rehearsal harness`).toContain(
        'scripts/rehearse-revert.mjs',
      );
      expect(text, `${document} no longer records that the production half is unrehearsed`).toMatch(
        /production half|against production/u,
      );
    }
  });
});
