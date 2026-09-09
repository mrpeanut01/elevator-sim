/**
 * `.github/workflows/ci.yml`'s environment properties, mechanised — GitHub issue #414.
 *
 * ## What was lost, and what is restored
 *
 * `infra/checks/` was deleted in `4ab5c02` along with the Phase A self-hosted runner fleet it
 * proved inert. That commit says so in terms: *"`infra/checks/` was the only mechanised guard on
 * the two-OS matrix, so that property is now a convention in a file and not an assertion in a
 * test."* A convention cannot fail; an assertion can.
 *
 * **This is not the deleted file restored.** The deleted file asserted a property `ci.yml` no
 * longer has, and restoring it verbatim would be the same defect with its polarity reversed —
 * a test asserting a claim that has outlived what it described.
 *
 * ### The two-OS matrix is obsolete, and is deliberately NOT asserted
 *
 * `DECISIONS.md` § D462, on the product owner's call, removed the macOS leg: this product deploys
 * as a Linux container to Azure, so a second leg spends runner minutes proving portability to a
 * platform nothing ships on. Every one of today's five legs is `platform: linux`. So the deleted
 * guard's `REQUIRED_PLATFORMS = ['linux', 'macos']`, its *"no 'macos' leg"* violation, and its
 * *"platform appears twice"* violation all describe a file that no longer exists, and four of its
 * nine mutants are mutations of text that has been deleted.
 *
 * **And the neutrality runs the other way too, which is the part worth reading.** `ci.yml`'s own
 * header says *"Re-adding a leg is one `include:` entry"*. A guard that asserted *exactly one
 * platform* would turn § D462 — a cost decision, explicitly reversible — into a rule that fails
 * the run for someone doing the thing the file invites. So nothing here counts platforms. What is
 * asserted is conditional: **every leg that says it is Linux must be a GitHub-hosted x86-64 Linux
 * leg**, which stays true whether the matrix has one leg or six, and whichever platforms they name.
 * `ciWorkflowMatrix.test.ts` proves that by mutation, adding a macOS leg back and requiring the
 * guard to report **nothing**.
 *
 * ### The x86-64 Linux leg is live, and is asserted in both halves
 *
 * `docs/15-compute-offload-contract.md` § 0.2 requires the Linux leg to be x86-64. § D201 found
 * § D196's 26 pins **exactly inverted** between Linux and darwin/arm64 — 26 failing and the 26 they
 * superseded passing — so a silent architecture swap reproduces that investigation from scratch.
 * Since § D462 left one platform standing, this is the only environment the pins are true of.
 *
 * That property has two halves and `ci.yml` only ever carried one of them:
 *
 *   1. **The runtime half**, which ships: a step that reads `uname -m` and fails the leg when it is
 *      not `x86_64`. It guards against GitHub changing what `ubuntu-latest` means, which is not
 *      this repository's decision to make. It has always been in `ci.yml`, and the deleted guard
 *      never asserted it — the issue's framing is loose there. **Nothing has ever checked that the
 *      step is still in the file.** An edit deleting it would go green, faster than before, and
 *      leave the architecture unpinned with no run saying so. {@link findWorkflowViolations}
 *      closes that: the gate step must exist, must gate on `x86_64` and nothing else, must exit
 *      non-zero, and — *while the matrix names one platform* — must carry no `if:`. `ci.yml` says
 *      the condition went with the second leg because *"a condition naming the platform would be a
 *      guard that cannot fail"*, and in the same breath that *"it comes back with the leg"*. So the
 *      platform count decides it: rejecting the condition unconditionally would fail the run for
 *      someone re-adding a leg and restoring the `if:` the file itself tells them to restore.
 *   2. **The static half**, which does not ship and is added here: every Linux leg's `runner:` must
 *      be a *literal* GitHub-hosted x86-64 label. `ubuntu-24.04-arm` is a label GitHub offers and
 *      the runtime half would catch it — one red run, one runner spent, after the fact. This half
 *      catches it in the suite, before any runner is spent, and it is also what keeps Phase A's
 *      hole shut without restoring any of Phase A: a `${{ vars.X || 'ubuntu-latest' }}` label is
 *      rejected for being an expression rather than by re-implementing an expression evaluator.
 *      `ci.yml` states this property about itself — *"both runner labels are literals in this
 *      file … there is no way to retarget a leg without editing this file, which is the point"* —
 *      and until now nothing held it to it.
 *
 * ### Four other properties `ci.yml` states about itself, and now cannot lose quietly
 *
 * `fail-fast: false`; an explicit `include:` with no free axis; exactly one `actions/setup-node`
 * pinned to a single literal version (§ D196 and § D201 both eliminated Node as the variable, so a
 * Node axis must not come back); and every job outside the matrix on a literal GitHub-hosted label,
 * so the check that aggregates the legs cannot itself be retargeted. All four were in the deleted
 * guard, all four are still true of the file, and all four are kept.
 *
 * ## Why the subject is a file rather than a function
 *
 * Nothing in TypeScript can see a missing matrix leg or a deleted `uname -m` step. The workflow
 * file can, so the workflow file is what this reads. The repository already does this in three
 * places — `packages/viz/src/dev/elementMap.test.ts` reads `index.html`,
 * `packages/experiments/src/validation/citations.test.ts` walks the markdown, and
 * `validation/blockedBy.test.ts` imports a `scripts/*.mjs` through a `.d.mts` — and this is the
 * same move aimed at YAML.
 *
 * ## The non-test caller, stated plainly
 *
 * **There is none, and that is correct here rather than an omission.** This module's subject is a
 * GitHub Actions configuration file; a runtime caller would mean the simulator read its own CI
 * config, which it must not. `packages/viz/src/deadCode.test.ts` argues its `PUBLIC_API_ONLY`
 * exemptions the same way — a unit whose whole purpose is to be an assertion has the assertion as
 * its caller. So the callers are two, both named:
 *
 *   * `packages/experiments/src/validation/ciWorkflowMatrix.test.ts`, which is the gate. It lives
 *     in the `experiments` project because `ci.yml`'s legs name their projects literally
 *     (`--project experiments`), so a guard in a *new* vitest project would run nowhere — a gate
 *     that does not gate, `RISKS.md` R40, on the very file that exists to prevent one.
 *   * `main()` below, for `node infra/checks/workflowMatrix.mjs` on a tree where `npm ci` is what
 *     broke. That path is **not** a second gate — `.github/workflows/**` is a protected path and
 *     no workflow invokes it — so the test drives it as a subprocess rather than letting it sit
 *     here unexercised.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseYaml } from './miniYaml.mjs';

export const CI_WORKFLOW_PATH = fileURLToPath(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
);

/** The job that carries the matrix. Renamed from `suite` when one job became five. */
export const MATRIX_JOB = 'legs';

/** The architecture `docs/15` § 0.2 requires of a Linux leg, and the only one the pins are true of. */
export const REQUIRED_LINUX_ARCH = 'x86_64';

/**
 * GitHub-hosted labels that are **x86-64 Linux**. `ubuntu-24.04-arm` and `ubuntu-22.04-arm` are
 * real labels and are absent on purpose: an ARM leg is a second pin environment with its own
 * measurement, not a cheaper version of this one.
 */
export const GITHUB_HOSTED_X86_LINUX = new Set(['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04']);

/**
 * Labels GitHub hosts itself, on any platform. A leg or a job that must remain observable no
 * matter what anyone has provisioned has to name one of these literally.
 *
 * The macOS entries are kept although no leg uses one today. They are what lets § D462 be reversed
 * with the one `include:` entry `ci.yml` says it takes, without this guard needing an edit.
 */
export const GITHUB_HOSTED = new Set([
  ...GITHUB_HOSTED_X86_LINUX,
  'ubuntu-24.04-arm',
  'ubuntu-22.04-arm',
  'macos-latest',
  'macos-15',
  'macos-14',
  'macos-13',
  'windows-latest',
  'windows-2025',
  'windows-2022',
]);

/**
 * Architecture names `uname -m` can print, as they appear in a shell comparison. Used to read what
 * the gate step actually gates on rather than to trust that it still says `x86_64`.
 *
 * Matched case-sensitively and on word boundaries, so `ci.yml`'s prose — *"the Linux leg to be
 * x86-64; an ARM leg is a separate decision"* — contributes nothing. A hyphen is not an underscore
 * and `ARM` is not `arm64`.
 */
const ARCHITECTURE_LITERAL = /\b(?:x86_64|amd64|i686|aarch64|arm64|armv7l|riscv64|ppc64le|s390x)\b/g;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isMap = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A runner label the matrix cannot retarget without editing this file. */
const isLiteral = (label) => typeof label === 'string' && !label.includes('${{');

/**
 * Check a parsed `ci.yml` against the properties above.
 *
 * Returns a list of violations rather than throwing, so a single run reports every problem instead
 * of the first — the same shape `scripts/review-gates.mjs` uses, and for the same reason.
 *
 * @param {Record<string, unknown>} workflow
 * @returns {string[]}
 */
export function findWorkflowViolations(workflow) {
  /** @type {string[]} */
  const violations = [];
  const say = (message) => violations.push(message);

  const jobs = workflow.jobs;
  if (!isMap(jobs)) {
    return ['ci.yml has no `jobs:` mapping — the guard read nothing and is asserting nothing'];
  }

  const legs = jobs[MATRIX_JOB];
  if (!isMap(legs)) {
    return [
      `ci.yml has no \`${MATRIX_JOB}\` job — the guard read nothing and is asserting nothing. ` +
        'If the matrix job was renamed, rename it here too: a guard that cannot find its subject ' +
        'passes everything.',
    ];
  }

  /* ---------------------------------------------------------------- *
   * Every leg is named in one place.
   * ---------------------------------------------------------------- */

  const strategy = isMap(legs.strategy) ? legs.strategy : null;
  if (strategy === null) {
    return [...violations, `the \`${MATRIX_JOB}\` job has no \`strategy:\` — there is no matrix left to read`];
  }

  if (strategy['fail-fast'] !== false) {
    say(
      'strategy.fail-fast is not `false`. It is kept false on a single-platform matrix on purpose ' +
        '(ci.yml): cancelling one leg for being slow makes "does this pin hold?" unanswerable the ' +
        'moment a second platform comes back, and that is the one question the matrix exists for.',
    );
  }

  const matrix = isMap(strategy.matrix) ? strategy.matrix : null;
  if (matrix === null) return [...violations, `the \`${MATRIX_JOB}\` job has no \`strategy.matrix:\``];

  const axes = Object.keys(matrix).filter((key) => key !== 'include' && key !== 'exclude');
  if (axes.length > 0) {
    say(
      `strategy.matrix declares free axes ${JSON.stringify(axes)}. The matrix is an explicit ` +
        '`include:` so that every leg is named in one place; a free axis multiplies the legs out of ' +
        "this guard's sight. In particular § D196 and § D201 both eliminated Node as the variable, " +
        'and a Node axis must not come back (ci.yml header).',
    );
  }

  const include = Array.isArray(matrix.include) ? matrix.include : null;
  if (include === null) return [...violations, 'strategy.matrix has no `include:` sequence'];
  if (include.length === 0) say('strategy.matrix.include is empty — the matrix runs nothing');

  /* ---------------------------------------------------------------- *
   * The x86-64 Linux leg, static half.
   *
   * Platforms are NOT counted. § D462 removed the macOS leg and ci.yml says re-adding one is a
   * single `include:` entry, so a guard that required exactly one platform — or exactly two —
   * would fail the run for someone doing what the file invites. What is required is that a leg
   * calling itself Linux is the environment the pins were measured on.
   * ---------------------------------------------------------------- */

  let linuxLegs = 0;
  /** Every platform the matrix names. Its *size* is read, never its membership. */
  const platforms = new Set();
  for (const [index, leg] of include.entries()) {
    if (!isMap(leg)) {
      say(`matrix leg ${String(index)} is not a mapping`);
      continue;
    }
    const platform = leg.platform;
    const runner = leg.runner;
    const named = isMap(leg) && typeof leg.leg === 'string' ? `'${leg.leg}'` : `${String(index)}`;
    if (typeof platform !== 'string' || typeof runner !== 'string') {
      say(
        `matrix leg ${named} must declare both a string \`platform:\` and a string \`runner:\`. ` +
          'The platform is what says which environment a pin was judged against; a leg that does ' +
          'not say cannot be checked.',
      );
      continue;
    }
    if (!isLiteral(runner)) {
      say(
        `matrix leg ${named} runs on '${runner}', which is an expression rather than a literal ` +
          'label. ci.yml: "there is no way to retarget a leg without editing this file, which is ' +
          'the point." A repository variable that can move a leg to unmeasured hardware is the ' +
          'withdrawn Phase A hole, and it stays shut by the label being a literal.',
      );
      continue;
    }
    platforms.add(platform);
    if (platform === 'linux') {
      linuxLegs += 1;
      if (!GITHUB_HOSTED_X86_LINUX.has(runner)) {
        say(
          `matrix leg ${named} declares \`platform: linux\` and runs on '${runner}', which is not a ` +
            `GitHub-hosted ${REQUIRED_LINUX_ARCH} Linux label. docs/15 § 0.2 requires the Linux leg ` +
            'to be x86-64; § D201 found § D196\'s 26 pins exactly inverted between Linux and ' +
            'darwin/arm64, so an ARM or self-hosted Linux leg is a second pin environment with its ' +
            'own measurement rather than a cheaper version of this one.',
        );
      }
    } else if (!GITHUB_HOSTED.has(runner)) {
      say(
        `matrix leg ${named} runs on '${runner}', which is not a literal GitHub-hosted label. A leg ` +
          'on hardware nobody can inspect is a pin environment nobody has measured.',
      );
    }
  }

  if (linuxLegs === 0) {
    say(
      'no matrix leg declares `platform: linux`. Since § D462 the Linux leg is the ONLY environment ' +
        'this repository\'s pins are true of, and a matrix without one leaves them true of nothing ' +
        'that runs.',
    );
  }

  const runsOn = legs['runs-on'];
  if (runsOn !== '${{ matrix.runner }}') {
    say(
      `the \`${MATRIX_JOB}\` job's \`runs-on\` is ${JSON.stringify(runsOn)}; it must be ` +
        '`${{ matrix.runner }}` so that every leg runs on the runner the matrix names and this ' +
        'guard is reading the labels that are actually used.',
    );
  }

  /* ---------------------------------------------------------------- *
   * The x86-64 Linux leg, runtime half: the step that fails the run.
   * ---------------------------------------------------------------- */

  const steps = Array.isArray(legs.steps) ? legs.steps : [];

  /**
   * A step is the architecture gate when it reads `uname -m` AND exits non-zero. Both clauses are
   * needed and neither is enough: the `Record the environment` step prints `uname -m` and gates
   * nothing, and plenty of steps exit non-zero without reading an architecture.
   */
  const gates = steps.filter((step) => {
    if (!isMap(step) || typeof step.run !== 'string') return false;
    return /uname\s+-m/.test(step.run) && /exit\s+[1-9]/.test(step.run);
  });

  if (gates.length === 0) {
    say(
      'no step in the matrix job fails the run when `uname -m` is not ' +
        `${REQUIRED_LINUX_ARCH}. That check is the last thing standing between the pins and a ` +
        'silent change of machine: ubuntu-latest is x86-64 today, and what it means is GitHub\'s ' +
        "decision rather than this repository's. If the step was removed, restore it rather than " +
        'relaxing this check.',
    );
  } else if (gates.length > 1) {
    say(
      `${String(gates.length)} steps read \`uname -m\` and exit non-zero. One architecture gate is ` +
        'readable; two are a question about which one is authoritative.',
    );
  }

  for (const gate of gates) {
    const named = typeof gate.name === 'string' ? `'${gate.name}'` : 'the architecture gate';
    const found = [...new Set(String(gate.run).match(ARCHITECTURE_LITERAL) ?? [])];
    if (found.length !== 1 || found[0] !== REQUIRED_LINUX_ARCH) {
      say(
        `step ${named} gates on ${found.length === 0 ? 'no architecture literal at all' : JSON.stringify(found)} ` +
          `rather than on exactly ['${REQUIRED_LINUX_ARCH}']. docs/15 § 0.2 names one architecture, ` +
          'and a gate that admits a second admits a pin set nobody has measured.',
      );
    }
    /*
     * A condition on the gate is rejected **only while the matrix is one platform**, and that
     * qualifier is the whole of the rule rather than a softening of it.
     *
     * `ci.yml` deleted this `if:` when the macOS leg went, because "a condition naming the platform
     * would be a guard that cannot fail" — and it says in the same breath that "it comes back with
     * the leg". A guard that rejected the condition unconditionally would fail the run for someone
     * re-adding a leg *and* restoring the `if:` the file tells them to restore, which is a guard
     * that lies. So the count decides: with one platform a condition can only ever be true, and
     * with two it is doing real work.
     */
    if (gate.if !== undefined && platforms.size < 2) {
      say(
        `step ${named} carries \`if: ${String(gate.if)}\` on a matrix of one platform ` +
          `(${[...platforms].join(', ') || 'none named'}). ci.yml deleted that condition with the ` +
          'second leg because "a condition naming the platform would be a guard that cannot fail", ' +
          'which is this repository\'s most-repeated defect. It comes back with the leg, not before ' +
          '— add the second leg in the same change and this stops being a violation.',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * No Node axis, and the pin is still a single value.
   * ---------------------------------------------------------------- */

  const setupNode = steps.filter(
    (step) => isMap(step) && typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@'),
  );
  if (setupNode.length !== 1) {
    say(
      `expected exactly one \`actions/setup-node\` step in \`${MATRIX_JOB}\`; found ` +
        String(setupNode.length),
    );
  }
  for (const step of setupNode) {
    const version = isMap(step.with) ? step.with['node-version'] : undefined;
    if (typeof version !== 'string' || version.includes('${{') || version.includes(',')) {
      say(
        `setup-node's node-version is ${JSON.stringify(version)}; it must be a single literal. ` +
          '§ D196 and § D201 both found the digests bit-identical across Node versions, so a Node ' +
          'axis spends runner minutes re-confirming the one variable already eliminated while ' +
          'leaving the one that has never been isolated — the platform — untested (ci.yml header).',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * Every other job stays observable.
   * ---------------------------------------------------------------- */

  for (const [name, job] of Object.entries(jobs)) {
    if (name === MATRIX_JOB || !isMap(job)) continue;
    const jobRunsOn = job['runs-on'];
    if (typeof jobRunsOn !== 'string' || !GITHUB_HOSTED.has(jobRunsOn)) {
      say(
        `job '${name}' has \`runs-on: ${String(jobRunsOn)}\`, which is not a literal GitHub-hosted ` +
          'label. The job that aggregates the legs is what a branch protection rule points at; a ' +
          'check that can be retargeted cannot report that the thing it checks is missing.',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * Anti-vacuity. A guard that read a file it did not understand passes everything.
   * ---------------------------------------------------------------- */

  if (steps.length < 5) {
    say(
      `the \`${MATRIX_JOB}\` job parsed to ${String(steps.length)} step(s); the reader is broken, ` +
        'not the workflow',
    );
  }
  if (Object.keys(jobs).length < 2) {
    say(
      `ci.yml parsed to ${String(Object.keys(jobs).length)} job(s); the matrix job and the check ` +
        'that aggregates it are both required, so the reader is broken',
    );
  }

  return violations;
}

/**
 * Read and check the repository's own `ci.yml`.
 *
 * @param {string} [path]
 * @returns {string[]}
 */
export function checkCiWorkflow(path = CI_WORKFLOW_PATH) {
  return findWorkflowViolations(parseYaml(readFileSync(path, 'utf8')));
}

/**
 * Render a run's verdict. Exported so the test can assert what the standalone path prints rather
 * than only that it exits zero.
 *
 * @param {readonly string[]} violations
 * @returns {string}
 */
export function summaryOf(violations) {
  if (violations.length === 0) {
    return `ci.yml: the ${REQUIRED_LINUX_ARCH} Linux leg and the matrix shape hold (0 violations).`;
  }
  return [
    `ci.yml: ${String(violations.length)} violation(s).`,
    ...violations.map((violation) => `  - ${violation}`),
  ].join('\n');
}

/* c8 ignore start -- the entry-point guard; the test drives this file as a subprocess instead. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkCiWorkflow();
  process.stdout.write(`${summaryOf(violations)}\n`);
  process.exit(violations.length === 0 ? 0 : 1);
}
/* c8 ignore stop */
