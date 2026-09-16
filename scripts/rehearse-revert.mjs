#!/usr/bin/env node
/**
 * Rehearse the offline half of the revert procedure, and — since GitHub issue **#540** — run it
 * for real. GitHub issue **#355**, AC4, and #540, items 1 and 2 of *"what this suggests"*.
 *
 * ## What this is for
 *
 * `docs/16-static-site-deployment.md` § 11 is the procedure for putting a previous build back on
 * the live site, and § 11.5 says in terms that **no step of it has been run** — it is derived from
 * the workflow, the provisioning script and `packages/viz/src/persist/`, and from nothing observed.
 * Three acceptance criteria (#241 AC2, #242 AC4, #243 AC4) ask for a *rehearsed* rollback, and a
 * procedure nobody has run is a draft.
 *
 * A rehearsal of the **whole** procedure needs the Static Web App, its federated identity and the
 * Container App. Nothing here holds those and nothing here may touch a live deployment. But the
 * procedure is not one operation: its steps 0 and 2 are **git on a workstation**, they decide
 * whether the bytes that reach the upload are the bytes anybody wanted, and they can be run with no
 * credential, no network and no live resource at all. That half is what this script runs, and by
 * default it runs it **in a throwaway clone** so the operator's own tree is never touched.
 *
 * So the honest claim is a split rather than a tick: the git half is **rehearsed**, by this script,
 * on whatever commits it is pointed at; the upload, the branch policy, the propagation time, the
 * API half and the save-clearing are **still unrehearsed** and {@link NOT_REHEARSED} names every one
 * of them in the summary the run prints. A harness that let its own output read as a full rehearsal
 * would be this repository's stale-promise defect with the polarity that matters most — telling a
 * reader in an incident that they hold a recovery they have not checked.
 *
 * ## What #540 found and what closes it
 *
 * Rehearsing the *documented* step 2 — `git revert --no-commit "$target"..main` followed by a bare
 * `git commit` — is what found #540's two failure modes (§ 11.3, § 11.5): a merge commit in the
 * range makes the ranged form abort **after** staging every newer commit's revert, leaving no
 * sequencer state, so the next line in the procedure commits a **partial** revert; and a shallow
 * checkout reports the target as an *unknown revision*, which reads like a typo rather than a
 * missing-history problem. Diagnosing both was step one. This file now also fixes the first
 * structurally and reports the second precisely, rather than only detecting them:
 *
 * - {@link planRevertSteps} never emits the ranged form at all. It reverts one commit at a time,
 *   newest first, `-m 1` on a merge — the alternative § 11.2 already named for a *single* merge,
 *   generalised to every merge a range holds and run automatically rather than left to an operator
 *   noticing git's error. {@link safeRevertTo} executes that plan and, on any step's failure, runs
 *   `git revert --abort`, `git reset --hard` back to the commit it started from, and `git clean
 *   -fdx` — so a failed or partial revert is never left staged and nothing ever calls `git commit`
 *   over one. This is what `--apply` below runs for real, and what the rehearsal below runs in its
 *   throwaway clone.
 * - {@link classifyHistoryProblem} distinguishes a shallow clone that never fetched the target from
 *   a target that plain does not exist, from one that exists but is not an ancestor — three
 *   different mistakes git's own *unknown revision* wording collapses into one message.
 *
 * ## What it touches, stated because the subject is a deployment
 *
 * **`git`, and nothing else.** No `az`, no `gh`, no network, no `node_modules`, no build. In
 * rehearsal (the default), every mutating command runs inside a temporary clone under the system
 * temp directory and the repository it is pointed at is only ever read. **`--apply` is the one
 * exception**: it runs the same safe, per-commit revert directly against the repository this
 * script is invoked from, because that is the whole point of step 2 — and it refuses on a dirty
 * working tree first, so it never discards uncommitted work.
 *
 * ## The things it establishes, and why each is in § 11
 *
 * 1. **The history reaches the target**, checked before anything else touches git. A shallow
 *    checkout — `actions/checkout`'s default is depth 1 — cannot revert anything, and
 *    {@link classifyHistoryProblem} names which of the three related mistakes this is.
 * 2. **The revert applies, commit by commit, with no conflict** — see above. A range holding a
 *    merge commit is reported rather than hidden, but no longer blocks the attempt: it is handled.
 * 3. **The reverted tree equals the target over the artifact paths.** This is § 11.2 step 2's own
 *    claim and the reason the operator must compare the *tree* rather than the page's build line.
 *    The pathspecs are **derived from `deploy-viz.yml`'s own `paths:` list** rather than
 *    transcribed, so a path added to the workflow cannot silently fall out of the comparison.
 * 4. **Whether the revert crosses a `SESSION_SCHEMA_VERSION` bump**, which is the one irreversible
 *    step in the procedure: a player who loads the reverted build once has their saved week
 *    cleared, and reverting forward does not bring it back. A crossing **fails** this run unless
 *    `--accept-save-loss` is passed — in rehearsal that turns the run red; under `--apply` it
 *    refuses to touch the tree at all, because § 11.3 says the crossing is a decision for a human
 *    and a harness that blessed it silently would be making it for them.
 *
 * It also prints what the page's build line will say — the revert commit, not the target — because
 * § 11.3's first failure mode is an operator reading a correct revert as a failed one.
 *
 * ## Usage
 *
 *   node scripts/rehearse-revert.mjs <target-commit> [<tip>] [--accept-save-loss] [--keep]
 *   node scripts/rehearse-revert.mjs <target-commit> --apply [--accept-save-loss]
 *
 * `<tip>` defaults to `HEAD` and is only meaningful in rehearsal — `--apply` always reverts the
 * repository's own `HEAD` forward to `<target-commit>`, for real, and commits the result; there is
 * no `<tip>` argument for it because step 2 is always "bring `main`'s tip back", never an arbitrary
 * pair. `--keep` (rehearsal only) leaves the temporary clone in place and prints its path. Exit 0
 * means every observation held, or, under `--apply`, that the revert was made and committed.
 *
 * `--repo <path>` is test-only: it points "this checkout" at an arbitrary repository instead of
 * the one containing this file, which is what lets `validation/rehearseRevert.test.ts` drive
 * `--apply` and the rehearsal against a real, disposable repository it builds rather than against
 * this repository. An operator never passes it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseYaml } from '../infra/checks/miniYaml.mjs';

/**
 * What this harness does **not** rehearse, in the order § 11.5 lists them.
 *
 * Exported and printed rather than left in prose, because the one failure this file could have is
 * its own output reading as more than it is.
 */
export const NOT_REHEARSED = [
  'the environment refusing a dispatch on a ref that is not `main` (§ 11.3, row 1)',
  'the upload itself, and whether a green run put those bytes on the site (§ 11.2 step 4)',
  'the wall-clock time from push to the reverted page being served (§ 11.5 item 3)',
  'an older page against the current API (§ 11.5 item 4)',
  'the save-clearing in a real browser with a real saved week (§ 11.5 item 5)',
  'the API half, and which half goes first when both are needed (§ 11.4, § 11.5 item 6)',
];

/** The workflow whose `paths:` decide what the artifact is built from. */
const WORKFLOW = '.github/workflows/deploy-viz.yml';

/** Where the session schema version this procedure can destroy is declared. */
const SESSION_TYPES = 'packages/viz/src/persist/types.ts';

/**
 * The pathspecs the reverted tree is compared over, derived from the workflow's own `paths:`.
 *
 * Two transformations and both are stated in {@link https://git-scm.com/docs/gitglossary} terms
 * rather than guessed: `packages/**` is a workflow glob and `packages` is the git pathspec that
 * selects the same tree, while `package.json` and `tsconfig*.json` mean the same thing in both
 * languages. `.github/**` is dropped — the workflow file is a *trigger* for the run and not an
 * input to the artifact's bytes, which is why § 11.2 step 2 compares without it.
 *
 * Throws when the parse yields fewer than four, because a comparison over an empty pathspec set is
 * a comparison of nothing that passes — `store/migrations.test.ts`'s *"this scan is blind"* guard,
 * applied to the one list in this file that is read out of another file.
 */
export function artifactPathspecsOf(workflowYaml) {
  const parsed = parseYaml(workflowYaml);
  const on = parsed['on'];
  const push = on !== null && typeof on === 'object' && !Array.isArray(on) ? on['push'] : undefined;
  const paths =
    push !== null && typeof push === 'object' && !Array.isArray(push) ? push['paths'] : undefined;
  if (!Array.isArray(paths)) {
    throw new Error(
      `${WORKFLOW} no longer declares on.push.paths, so the artifact pathspecs cannot be derived ` +
        'from it. This scan is blind rather than empty — fix the derivation, do not hand-write the list.',
    );
  }
  const specs = [];
  for (const entry of paths) {
    if (typeof entry !== 'string') continue;
    if (entry.startsWith('.github/')) continue;
    specs.push(entry.endsWith('/**') ? entry.slice(0, -3) : entry);
  }
  if (specs.length < 4) {
    throw new Error(
      `only ${String(specs.length)} artifact pathspecs were derived from ${WORKFLOW}, which is ` +
        'fewer than the workflow has ever carried. A tree comparison over this set would pass by ' +
        'looking at almost nothing.',
    );
  }
  return specs;
}

/**
 * Every `SESSION_SCHEMA_VERSION` move a diff carries, oldest side first.
 *
 * The input is `git diff <target> <tip> -- packages/viz/src/persist/types.ts`. A `from` below a
 * `to` is a bump, and reverting across it is the irreversible step.
 */
export function schemaBumpsOf(diffText) {
  const pattern = /^([-+]).*SESSION_SCHEMA_VERSION\s*=\s*(\d+)/u;
  let removed;
  let added;
  for (const line of diffText.split('\n')) {
    const found = pattern.exec(line);
    if (found === null) continue;
    const value = Number(found[2]);
    if (found[1] === '-') removed = value;
    else added = value;
  }
  if (removed === undefined && added === undefined) return [];
  return [{ from: removed, to: added }];
}

/**
 * Whether reverting across these bumps costs a player their saved week.
 *
 * A crossing needs **both** sides: a target that writes one version and a tip that writes a higher
 * one. One side alone is the constant arriving or leaving, which no revert can turn into a cleared
 * slot, and treating it as one would make the harness cry wolf on the one observation an operator
 * must not learn to ignore.
 */
export function crossesSaveSchema(bumps) {
  return bumps.some(
    (bump) => bump.from !== undefined && bump.to !== undefined && bump.from < bump.to,
  );
}

/** The ten characters the built page will show, matching `vite.config.ts#buildVersion`. */
export function buildVersionOf(sha) {
  return sha.slice(0, 10);
}

/**
 * Whether a `{ sha, parents }` commit — {@link parseCommitLog}'s shape — is a merge.
 *
 * GitHub issue #540's first failure mode is a property of the *ranged* `git revert`: it refuses a
 * merge without `-m`, but only after staging every newer commit's revert, and leaves no sequencer
 * state to `--continue` or `--abort`. {@link planRevertSteps} avoids the ranged form entirely, so
 * this predicate exists to route a merge to `-m 1` rather than to detect a class of doomed range.
 */
export function isMergeCommit(commit) {
  return commit.parents.length > 1;
}

/**
 * `git log --format="%H<sep>%P" target..tip` parsed into `{ sha, parents }`, newest first — the
 * order `git log` already produces and the order {@link planRevertSteps} needs: a commit must be
 * reverted before the commits stacked underneath it, because reverting an older commit first would
 * apply that revert onto a tree state it was never taken against. `sep` defaults to the unit
 * separator, which cannot appear in a sha or in `%P`'s space-joined parent list.
 */
export function parseCommitLog(logText, sep = '') {
  return logText
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha = '', parentsField = ''] = line.split(sep);
      const trimmed = parentsField.trim();
      return { sha, parents: trimmed.length > 0 ? trimmed.split(/\s+/u) : [] };
    });
}

/**
 * The ordered `git revert` invocations that put the tree back to `target`, one commit at a time —
 * the whole structural fix for GitHub issue #540's first failure mode. § 11.2 already named `-m 1`
 * as the alternative for undoing *one* merge by hand; this generalises it to every merge a range
 * holds and runs it automatically, so `git commit` is never reached with a partial revert staged
 * under it — there is no ranged revert left to abort part-way, because none is ever issued.
 */
export function planRevertSteps(commitsNewestFirst) {
  return commitsNewestFirst.map((commit) => ({
    sha: commit.sha,
    isMerge: isMergeCommit(commit),
    args: isMergeCommit(commit)
      ? ['revert', '--no-commit', '-m', '1', commit.sha]
      : ['revert', '--no-commit', commit.sha],
  }));
}

/**
 * Distinguishes GitHub issue #540's second failure mode — a shallow checkout that simply never
 * fetched `target` — from a target that does not exist at all, and from one that exists but is not
 * an ancestor of `tip`. Git's own *"unknown revision or path not in the working tree"* wording
 * collapses the first two into one message, which reads like a typo in the sha rather than a
 * missing-history problem — the confusion § 11.3's shallow-clone row now names precisely instead of
 * quoting git's wording verbatim.
 */
export function classifyHistoryProblem({ isShallow, objectExistsLocally, isAncestorOfTip }) {
  if (!objectExistsLocally) {
    return { blocked: true, reason: isShallow ? 'shallow-history' : 'unknown-revision' };
  }
  if (!isAncestorOfTip) {
    return { blocked: true, reason: 'not-an-ancestor' };
  }
  return { blocked: false, reason: null };
}

/** The message for a {@link classifyHistoryProblem} result, precise about which of the three it is. */
export function historyProblemMessage(problem, target, tip) {
  switch (problem.reason) {
    case 'shallow-history':
      return (
        `this checkout cannot name "${target}", and the checkout is shallow. A shallow checkout ` +
        `holds no commit before its boundary, so a commit outside the window is reported as an ` +
        `unknown revision rather than as missing history (GitHub issue #540's second failure ` +
        `mode) — deepen it (\`git fetch --unshallow\` on a workstation, \`fetch-depth: 0\` on a ` +
        `runner) or name a commit inside the window.`
      );
    case 'unknown-revision':
      return `this checkout cannot name "${target}" and is not shallow — the commit does not exist here. Check the sha.`;
    case 'not-an-ancestor':
      return `"${target}" exists but is not an ancestor of "${tip}", so reverting forward to it is not well-formed on this branch. Check the target and the branch.`;
    default:
      return 'no problem';
  }
}

/**
 * Runs {@link planRevertSteps}'s plan against `cwd` for real: one `git revert --no-commit` per
 * commit in `target..tip` (newest first, `-m 1` on a merge), then a single `git commit` over the
 * whole plan. The ranged form `git revert --no-commit target..tip` is never issued — that is the
 * form § 11.3 measured aborting part-way on a merge with the newer reverts left staged, which is
 * GitHub issue #540's first failure mode. Any step's non-zero exit runs `git revert --abort`,
 * `git reset --hard` back to the commit `cwd` started on, and `git clean -fdx`, so a failed or
 * partial revert is never left staged and nothing ever calls `git commit` over one.
 *
 * The history check runs first, via {@link classifyHistoryProblem}, so a caller learns which of
 * #540's two shapes it hit — or that the target simply is not an ancestor — rather than reverting
 * against a tree that might be silently missing the commits it needs.
 *
 * `identityArgs` is prepended to the commit invocation — empty for a real `--apply`, which must
 * use the operator's own configured identity, and `['-c', 'user.email=…', '-c', 'user.name=…']`
 * for the rehearsal, which runs in a disposable clone that may hold no identity at all.
 * `revertRunner` defaults to {@link gitStatus} and exists only so
 * `validation/rehearseRevert.test.ts` can inject a failure on one specific step against a real,
 * throwaway repository, to assert the abort/reset/clean sequence deterministically — every other
 * call site, including every other test, uses the real default and mocks nothing.
 *
 * Returns `{ ok: true, revertSha, stepCount, merges }` or `{ ok: false, reason, detail }`, and
 * never throws: every call already goes through {@link gitStatus} or `revertRunner`, which turn a
 * non-zero exit into a value rather than an exception.
 */
export function safeRevertTo(cwd, target, tip, commitMessage, identityArgs = [], revertRunner = gitStatus) {
  const startSha = git(cwd, ['rev-parse', tip]);
  const isShallow = git(cwd, ['rev-parse', '--is-shallow-repository']) === 'true';
  const objectExistsLocally = gitStatus(cwd, ['cat-file', '-e', `${target}^{commit}`]).code === 0;
  const isAncestorOfTip = objectExistsLocally
    ? gitStatus(cwd, ['merge-base', '--is-ancestor', target, tip]).code === 0
    : false;
  const problem = classifyHistoryProblem({ isShallow, objectExistsLocally, isAncestorOfTip });
  if (problem.blocked) {
    return { ok: false, reason: problem.reason, detail: historyProblemMessage(problem, target, tip) };
  }

  const log = git(cwd, ['log', '--format=%H%P', `${target}..${tip}`]);
  const commits = parseCommitLog(log);
  const steps = planRevertSteps(commits);
  const merges = steps.filter((step) => step.isMerge).map((step) => step.sha);

  for (const step of steps) {
    const result = revertRunner(cwd, step.args);
    if (result.code !== 0) {
      gitStatus(cwd, ['revert', '--abort']);
      gitStatus(cwd, ['reset', '--hard', startSha]);
      gitStatus(cwd, ['clean', '-fdx']);
      return {
        ok: false,
        reason: 'revert-step-failed',
        detail:
          `reverting ${buildVersionOf(step.sha)}${step.isMerge ? ' (-m 1, a merge)' : ''} failed: ` +
          `${result.output.split('\n')[0] ?? ''} — reset to ${buildVersionOf(startSha)}, nothing committed`,
      };
    }
  }

  const unmerged = git(cwd, ['diff', '--name-only', '--diff-filter=U']);
  if (unmerged !== '') {
    gitStatus(cwd, ['reset', '--hard', startSha]);
    gitStatus(cwd, ['clean', '-fdx']);
    return {
      ok: false,
      reason: 'unmerged-paths',
      detail: `unmerged paths remained after every step reported clean: ${unmerged} — reset to ${buildVersionOf(startSha)}, nothing committed`,
    };
  }

  const message = commitMessage ?? `revert: back to ${buildVersionOf(target)}`;
  const commitResult = gitStatus(cwd, [...identityArgs, 'commit', '--quiet', '-m', message]);
  if (commitResult.code !== 0) {
    return {
      ok: false,
      reason: 'nothing-to-commit',
      detail: `git commit found nothing staged after ${String(steps.length)} clean revert(s): ${commitResult.output}`,
    };
  }
  return { ok: true, revertSha: git(cwd, ['rev-parse', 'HEAD']), stepCount: steps.length, merges };
}

/** Why a rehearsal failed, in the order the observations were taken. Empty means it held. */
export function issuesOf(observations) {
  return observations
    .filter((observation) => !observation.ok)
    .map((observation) => `${observation.id}: ${observation.claim} — observed: ${observation.observed}`);
}

/** The lines the run prints. */
export function summaryOf(observations, issues) {
  const lines = [];
  lines.push('Rehearsing docs/16 § 11.2 — the git half, in a throwaway clone. Nothing live is touched.');
  lines.push('');
  for (const observation of observations) {
    lines.push(`${observation.ok ? 'held  ' : 'FAILED'}  ${observation.id}: ${observation.observed}`);
  }
  lines.push('');
  if (issues.length === 0) {
    lines.push('The git half of the procedure holds on this range.');
  } else {
    lines.push(`The git half does NOT hold on this range: ${String(issues.length)} observation(s) failed.`);
    for (const issue of issues) lines.push(`  - ${issue}`);
  }
  lines.push('');
  lines.push('NOT rehearsed by this run, and still unrehearsed by anything:');
  for (const item of NOT_REHEARSED) lines.push(`  - ${item}`);
  return lines.join('\n');
}

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const gitStatus = (cwd, args) => {
  try {
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, output: '' };
  } catch (error) {
    const shaped = /** @type {{ status?: number; stderr?: string; stdout?: string }} */ (error);
    return {
      code: shaped.status ?? 1,
      output: `${shaped.stdout ?? ''}${shaped.stderr ?? ''}`.trim(),
    };
  }
};

function main(argv) {
  // `--repo <path>` is test-only — see `validation/rehearseRevert.test.ts` — and is stripped
  // before the flag/positional split below so it never appears as a stray positional argument.
  // An operator never passes it: with it omitted `root` is this file's own containing repository,
  // which is what makes `--apply` "this checkout" rather than an arbitrary one.
  const repoIdx = argv.indexOf('--repo');
  const repoOverride = repoIdx === -1 ? undefined : argv[repoIdx + 1];
  const rest = repoIdx === -1 ? argv : [...argv.slice(0, repoIdx), ...argv.slice(repoIdx + 2)];

  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const positional = rest.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    process.stderr.write(
      'usage: node scripts/rehearse-revert.mjs <target-commit> [<tip>] [--accept-save-loss] [--keep]\n' +
        '       node scripts/rehearse-revert.mjs <target-commit> --apply [--accept-save-loss]\n',
    );
    return 2;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const root = repoOverride === undefined ? git(here, ['rev-parse', '--show-toplevel']) : resolve(repoOverride);
  /**
   * A revision this checkout cannot name is reported rather than thrown, via
   * {@link classifyHistoryProblem} so the message names which of GitHub issue #540's shapes this
   * is rather than quoting git's *unknown revision* wording verbatim.
   */
  const resolveCommit = (cwd, revision) => {
    const attempt = gitStatus(cwd, ['rev-parse', '--verify', `${revision}^{commit}`]);
    if (attempt.code !== 0) {
      const isShallow = git(cwd, ['rev-parse', '--is-shallow-repository']) === 'true';
      const problem = classifyHistoryProblem({
        isShallow,
        objectExistsLocally: false,
        isAncestorOfTip: false,
      });
      process.stderr.write(`${historyProblemMessage(problem, revision, 'HEAD')}\n`);
      return '';
    }
    return git(cwd, ['rev-parse', revision]);
  };

  // --apply: GitHub issue #540, item 1 — run the safe revert for real, directly on this checkout,
  // which is what docs/16 § 11.2 step 2 now names instead of the raw `git revert --no-commit
  // "$target"..main` / `git commit` sequence. Nothing here is a rehearsal: it commits.
  if (flags.has('--apply')) {
    const target = resolveCommit(root, positional[0]);
    if (target === '') return 2;
    const dirty = git(root, ['status', '--porcelain']);
    if (dirty !== '') {
      process.stderr.write(
        'refusing --apply: this checkout has uncommitted changes. A safe revert never discards ' +
          'work it did not make — commit or stash first, then try again.\n',
      );
      return 2;
    }
    const pathspecs = artifactPathspecsOf(readFileSync(join(root, WORKFLOW), 'utf8'));
    const blind = gitStatus(root, ['cat-file', '-e', `HEAD:${SESSION_TYPES}`]).code !== 0;
    const schemaDiff = blind ? '' : git(root, ['diff', target, 'HEAD', '--', SESSION_TYPES]);
    const crosses = crossesSaveSchema(schemaBumpsOf(schemaDiff));
    const accepted = flags.has('--accept-save-loss');
    if (crosses && !accepted) {
      process.stderr.write(
        'refusing --apply: the target writes an older SESSION_SCHEMA_VERSION than HEAD does, so ' +
          'every affected player loses their saved week (docs/16 § 11.3). That is a decision for a ' +
          'human, not a default — pass --accept-save-loss to proceed. Nothing has been touched.\n',
      );
      return 1;
    }
    const startSha = git(root, ['rev-parse', 'HEAD']);
    const result = safeRevertTo(root, target, 'HEAD', `revert: back to ${buildVersionOf(target)}`, []);
    if (!result.ok) {
      process.stderr.write(
        `--apply failed (${result.reason}): ${result.detail}\nThe checkout is back at ` +
          `${buildVersionOf(startSha)} with nothing committed.\n`,
      );
      return 1;
    }
    const treeMatches = gitStatus(root, ['diff', '--quiet', target, 'HEAD', '--', ...pathspecs]).code === 0;
    process.stdout.write(
      `${[
        `Reverted ${buildVersionOf(startSha)} forward to ${buildVersionOf(target)}: ` +
          `${String(result.stepCount)} commit(s), ${String(result.merges.length)} merge commit(s) among them.`,
        `Committed as ${buildVersionOf(result.revertSha)}. The page's build line will read that, ` +
          `not ${buildVersionOf(target)} — § 11.3's first failure mode.`,
        treeMatches
          ? `The tree matches the target over the artifact paths (${pathspecs.join(', ')}).`
          : 'WARNING: the tree does NOT match the target over the artifact paths — inspect before pushing.',
        'Nothing has been pushed. Run `git push`, then continue with docs/16 § 11.2 step 3.',
      ].join('\n')}\n`,
    );
    return treeMatches ? 0 : 1;
  }

  // Rehearsal (the default): the same safe, per-commit revert, run inside a throwaway clone so
  // the operator's own tree is never touched. This is what a caller runs *before* --apply.
  const target = resolveCommit(root, positional[0]);
  const tip = resolveCommit(root, positional[1] ?? 'HEAD');
  if (target === '' || tip === '') return 2;
  const pathspecs = artifactPathspecsOf(readFileSync(join(root, WORKFLOW), 'utf8'));

  const clone = mkdtempSync(join(tmpdir(), 'elevator-sim-revert-rehearsal-'));
  const observations = [];
  try {
    git(root, ['clone', '--quiet', '--local', root, clone]);
    git(clone, ['checkout', '--quiet', '--detach', tip]);

    const shallow = git(clone, ['rev-parse', '--is-shallow-repository']) === 'true';
    const objectExistsLocally = gitStatus(clone, ['cat-file', '-e', `${target}^{commit}`]).code === 0;
    const isAncestorOfTip = objectExistsLocally
      ? gitStatus(clone, ['merge-base', '--is-ancestor', target, tip]).code === 0
      : false;
    const historyProblem = classifyHistoryProblem({ isShallow: shallow, objectExistsLocally, isAncestorOfTip });
    const reaches = !historyProblem.blocked;
    observations.push({
      id: 'history-reaches-target',
      claim: 'the checkout holds enough history to revert to the target',
      observed: reaches
        ? `${buildVersionOf(target)} is an ancestor of ${buildVersionOf(tip)}${shallow ? ' (the checkout is shallow, so a deeper target would not be)' : ''}`
        : historyProblemMessage(historyProblem, target, tip),
      ok: reaches,
    });

    const merges = reaches
      ? git(clone, ['rev-list', '--merges', `${target}..${tip}`]).split('\n').filter((l) => l !== '')
      : [];
    observations.push({
      id: 'merge-commits-handled',
      claim:
        'a merge commit in the range does not abort the revert — it is reverted with `-m 1`, one commit at a time, never with the range form',
      observed: !reaches
        ? 'not measured, because the history does not reach the target'
        : merges.length === 0
          ? `${git(clone, ['rev-list', '--count', `${target}..${tip}`])} commit(s) in the range, no merges`
          : `${String(merges.length)} merge commit(s) in the range, first ${buildVersionOf(merges[0])} — each reverted individually with \`-m 1\` below`,
      ok: true,
    });

    const blind = gitStatus(clone, ['cat-file', '-e', `${tip}:${SESSION_TYPES}`]).code !== 0;
    const schemaDiff = reaches ? git(clone, ['diff', target, tip, '--', SESSION_TYPES]) : '';
    const bumps = blind ? [] : schemaBumpsOf(schemaDiff);
    const crosses = crossesSaveSchema(bumps);
    const accepted = flags.has('--accept-save-loss');
    observations.push({
      id: 'save-schema',
      claim: 'the revert does not cross a SESSION_SCHEMA_VERSION bump, which clears a saved week irreversibly',
      observed: blind
        ? `${SESSION_TYPES} is not in the tree at the tip, so this check is blind rather than clean`
        : crosses
          ? `the target writes version ${String(bumps[0].from)} and the tip writes ${String(bumps[0].to)} — every affected player loses their saved week${accepted ? ', accepted with --accept-save-loss' : ''}`
          : 'no bump in the range',
      ok: !blind && (!crosses || accepted),
    });

    const result = reaches
      ? safeRevertTo(clone, target, tip, `rehearsal: revert to ${buildVersionOf(target)}`, [
          '-c',
          'user.email=rehearsal@invalid',
          '-c',
          'user.name=revert rehearsal',
        ])
      : { ok: false, reason: 'not-attempted', detail: '' };
    observations.push({
      id: 'revert-applies',
      claim: 'the revert applies commit by commit onto the tip with no conflict',
      observed: !reaches
        ? 'not attempted, because an earlier observation failed'
        : result.ok
          ? `applied clean, ${String(result.stepCount)} commit(s) reverted individually`
          : `${result.reason}: ${result.detail}`,
      ok: reaches && result.ok,
    });

    const treeMatches =
      reaches && result.ok
        ? gitStatus(clone, ['diff', '--quiet', target, 'HEAD', '--', ...pathspecs]).code === 0
        : false;
    observations.push({
      id: 'tree-matches-target',
      claim: `the reverted tree equals the target over the artifact paths (${pathspecs.join(', ')})`,
      observed: treeMatches
        ? 'the comparison prints nothing, which is what step 2 requires'
        : 'the comparison is not empty, or the revert did not run',
      ok: treeMatches,
    });

    const revertSha = treeMatches ? git(clone, ['rev-parse', 'HEAD']) : '';
    const touches =
      treeMatches &&
      git(clone, ['diff', '--name-only', `${revertSha}^`, revertSha, '--', ...pathspecs]) !== '';

    const issues = issuesOf(observations);
    const extra = [];
    if (treeMatches) {
      extra.push('');
      extra.push('');
      extra.push(
        `The page's build line after this revert would read "Build ${buildVersionOf(revertSha)}", ` +
          `not "${buildVersionOf(target)}" — § 11.3's first failure mode. The tree comparison above ` +
          'is what says the bytes are the target\'s.',
      );
      extra.push(
        touches
          ? 'The revert touches an artifact path, so a push to `main` would start a deploy run on its own.'
          : 'The revert touches no artifact path, so a push starts no run: step 3\'s dispatch is the trigger.',
      );
      extra.push(
        'Rehearsal only — nothing here was committed to this checkout. Run the same logic for real ' +
          'with `--apply` in place of a target/tip pair to commit it here.',
      );
    }
    process.stdout.write(`${summaryOf(observations, issues)}${extra.join('\n')}\n`);
    if (flags.has('--keep')) process.stdout.write(`\nThe rehearsal clone is at ${clone}\n`);
    return issues.length === 0 ? 0 : 1;
  } finally {
    if (!flags.has('--keep')) rmSync(clone, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
