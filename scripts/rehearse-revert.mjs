#!/usr/bin/env node
/**
 * Rehearse the offline half of the revert procedure — GitHub issue **#355**, AC4.
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
 * credential, no network and no live resource at all. That half is what this script runs, and it
 * runs it **in a throwaway clone** so the operator's own tree is never touched.
 *
 * So the honest claim is a split rather than a tick: the git half is **rehearsed**, by this script,
 * on whatever commits it is pointed at; the upload, the branch policy, the propagation time, the
 * API half and the save-clearing are **still unrehearsed** and {@link NOT_REHEARSED} names every one
 * of them in the summary the run prints. A harness that let its own output read as a full rehearsal
 * would be this repository's stale-promise defect with the polarity that matters most — telling a
 * reader in an incident that they hold a recovery they have not checked.
 *
 * ## What it touches, stated because the subject is a deployment
 *
 * **`git`, and nothing else.** No `az`, no `gh`, no network, no `node_modules`, no build. Every
 * mutating command runs inside a temporary clone under the system temp directory; the repository it
 * is pointed at is only ever read. It cannot deploy, cannot write a repository variable, and cannot
 * reach Azure even if it wanted to.
 *
 * ## The five things it establishes, and why each is in § 11
 *
 * 1. **The range holds no merge commit.** § 11.2 step 2 is `git revert --no-commit $target..main`,
 *    and the range form of `git revert` refuses a merge without `-m`. Measured (see § 11.3): it
 *    refuses **at** the merge, having already staged the reverts of every commit newer than it, and
 *    leaves no sequencer state — so an operator who does not read the error and types the next
 *    command in the procedure commits a **partial** revert. That is a green run putting a
 *    half-reverted page up, which is the worst outcome this procedure has.
 * 2. **The history reaches the target.** A shallow checkout — `actions/checkout`'s default is depth
 *    1 — cannot revert anything, and says so in a git error that looks nothing like the cause.
 * 3. **The revert applies without conflict**, which is a property of the range and not of the
 *    procedure, and is therefore worth measuring on the range actually being reverted.
 * 4. **The reverted tree equals the target over the artifact paths.** This is § 11.2 step 2's own
 *    claim and the reason the operator must compare the *tree* rather than the page's build line.
 *    The pathspecs are **derived from `deploy-viz.yml`'s own `paths:` list** rather than
 *    transcribed, so a path added to the workflow cannot silently fall out of the comparison.
 * 5. **Whether the revert crosses a `SESSION_SCHEMA_VERSION` bump**, which is the one irreversible
 *    step in the procedure: a player who loads the reverted build once has their saved week
 *    cleared, and reverting forward does not bring it back. A crossing **fails** this run unless
 *    `--accept-save-loss` is passed, because § 11.3 says that is a decision for a human and a
 *    harness that blessed it silently would be making it for them.
 *
 * It also prints what the page's build line will say — the revert commit, not the target — because
 * § 11.3's first failure mode is an operator reading a correct revert as a failed one.
 *
 * ## Usage
 *
 *   node scripts/rehearse-revert.mjs <target-commit> [<tip>] [--accept-save-loss] [--keep]
 *
 * `<tip>` defaults to `HEAD`. `--keep` leaves the temporary clone in place and prints its path, for
 * an operator who wants to look at the reverted tree. Exit 0 means every observation above held.
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
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    process.stderr.write(
      'usage: node scripts/rehearse-revert.mjs <target-commit> [<tip>] [--accept-save-loss] [--keep]\n',
    );
    return 2;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const root = git(here, ['rev-parse', '--show-toplevel']);
  /**
   * A revision this checkout cannot name is reported rather than thrown.
   *
   * The common cause is the one an operator will not guess from git's own wording: a shallow
   * checkout — `actions/checkout`'s default — holds no commit before its boundary, so
   * `HEAD~60` is *unknown* rather than *too old*.
   */
  const resolveCommit = (revision) => {
    const attempt = gitStatus(root, ['rev-parse', '--verify', `${revision}^{commit}`]);
    if (attempt.code !== 0) {
      process.stderr.write(
        `this checkout cannot name "${revision}". A shallow checkout holds no commit before its ` +
          `boundary — \`git rev-parse --is-shallow-repository\` here says ` +
          `${git(root, ['rev-parse', '--is-shallow-repository'])}, over ` +
          `${git(root, ['rev-list', '--count', 'HEAD'])} reachable commit(s). Deepen it, or name a ` +
          'commit inside the window.\n',
      );
      return '';
    }
    return git(root, ['rev-parse', revision]);
  };
  const target = resolveCommit(positional[0]);
  const tip = resolveCommit(positional[1] ?? 'HEAD');
  if (target === '' || tip === '') return 2;
  const pathspecs = artifactPathspecsOf(readFileSync(join(root, WORKFLOW), 'utf8'));

  const clone = mkdtempSync(join(tmpdir(), 'elevator-sim-revert-rehearsal-'));
  const observations = [];
  try {
    git(root, ['clone', '--quiet', '--local', root, clone]);
    git(clone, ['checkout', '--quiet', '--detach', tip]);

    const shallow = git(clone, ['rev-parse', '--is-shallow-repository']) === 'true';
    const reaches = gitStatus(clone, ['merge-base', '--is-ancestor', target, tip]).code === 0;
    observations.push({
      id: 'history-reaches-target',
      claim: 'the checkout holds enough history to revert to the target',
      observed: reaches
        ? `${buildVersionOf(target)} is an ancestor of ${buildVersionOf(tip)}${shallow ? ' (the checkout is shallow, so a deeper target would not be)' : ''}`
        : `${buildVersionOf(target)} is not an ancestor of ${buildVersionOf(tip)}${shallow ? ' — and this checkout is shallow, which is the likeliest reason' : ''}`,
      ok: reaches,
    });

    const merges = reaches
      ? git(clone, ['rev-list', '--merges', `${target}..${tip}`]).split('\n').filter((l) => l !== '')
      : [];
    observations.push({
      id: 'range-is-linear',
      claim: 'the range holds no merge commit, so the range form of `git revert` does not abort part-way',
      observed: !reaches
        ? 'not measured, because the history does not reach the target'
        : merges.length === 0
          ? `${git(clone, ['rev-list', '--count', `${target}..${tip}`])} commit(s) in the range, no merges`
          : `${String(merges.length)} merge commit(s) in the range, first ${buildVersionOf(merges[0])} — use \`git revert -m 1\` per merge; the range form stages the newer reverts and then aborts`,
      ok: reaches && merges.length === 0,
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

    let reverted = { code: 0, output: '' };
    if (reaches && merges.length === 0) {
      reverted = gitStatus(clone, ['revert', '--no-commit', `${target}..${tip}`]);
      if (reverted.code === 0) {
        gitStatus(clone, [
          '-c',
          'user.email=rehearsal@invalid',
          '-c',
          'user.name=revert rehearsal',
          'commit',
          '--quiet',
          '--allow-empty',
          '-m',
          `rehearsal: revert to ${buildVersionOf(target)}`,
        ]);
      }
    }
    observations.push({
      id: 'revert-applies',
      claim: 'the range reverts onto the tip with no conflict',
      observed:
        !reaches || merges.length > 0
          ? 'not attempted, because an earlier observation failed'
          : reverted.code === 0
            ? 'applied clean'
            : `git revert exited ${String(reverted.code)}: ${reverted.output.split('\n')[0] ?? ''}`,
      ok: reaches && merges.length === 0 && reverted.code === 0,
    });

    const treeMatches =
      reaches && merges.length === 0 && reverted.code === 0
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
