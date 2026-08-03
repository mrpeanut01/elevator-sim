/**
 * The mechanised half of [`docs/15-compute-offload-contract.md`](../../docs/15-compute-offload-contract.md)
 * criterion 3: *"The two-OS matrix still compares two operating systems. A self-hosted Linux runner
 * must not silently become the only leg, and a test or workflow assertion says so."*
 *
 * ## Why the subject is a file rather than a function
 *
 * `.github/workflows/ci.yml`'s header records what § D196 and § D201 cost: 26 pins that were
 * correct on one machine and wrong on another, *"and no gate noticed, because there was no CI."*
 * The matrix is the gate that noticed. Phase A points the Linux leg at hardware the project owner
 * controls, and the failure mode that introduces is not a wrong number — it is a **missing leg**.
 * A workflow whose Linux entry has quietly become the only entry still goes green, faster than
 * before, and restores exactly the *"one environment silently canonical"* state § D201 named as the
 * defect.
 *
 * Nothing in TypeScript can see that. The workflow file can, so the workflow file is what this
 * reads. The repository already does this in two places — `packages/viz/src/dev/elementMap.test.ts`
 * reads `index.html`, `packages/experiments/src/validation/citations.test.ts` walks the markdown —
 * and this is the same move aimed at YAML.
 *
 * ## The inertness claim, and why it is evaluated rather than matched
 *
 * The Linux leg's runner label is `${{ vars.CI_LINUX_RUNNER_LABEL || 'ubuntu-latest' }}`. The claim
 * that this is **inert until the owner provisions runners** is a claim about what that expression
 * evaluates to when the repository variable is unset, so {@link evaluateRunnerLabel} evaluates it
 * — under an empty variable set and under a populated one, asserted in both directions the way
 * `documentation.test.ts` asserts its correction in both directions.
 *
 * A regex that reads the expression and pronounces it fine is an argument. Evaluating it is a run.
 * The evaluator is a **model** of GitHub's `||`, not GitHub's own; it is deliberately tiny and it
 * throws on any expression shape it does not fully understand, so a rewrite of the expression
 * cannot pass by being unrecognised.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseYaml } from './miniYaml.mjs';

export const CI_WORKFLOW_PATH = fileURLToPath(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
);

/** The repository variable that turns the offload on. Unset is the shipped state. */
export const RUNNER_LABEL_VARIABLE = 'CI_LINUX_RUNNER_LABEL';

/** What the Linux leg must resolve to when nothing is provisioned. */
export const DEFAULT_LINUX_RUNNER = 'ubuntu-latest';

/** The two platforms the matrix exists to compare. Order-insensitive; membership is not. */
export const REQUIRED_PLATFORMS = ['linux', 'macos'];

/**
 * Labels GitHub hosts itself. A job that must remain observable no matter what the owner has
 * provisioned has to name one of these literally.
 */
const GITHUB_HOSTED = new Set([
  'ubuntu-latest',
  'ubuntu-24.04',
  'ubuntu-22.04',
  'macos-latest',
  'macos-15',
  'macos-14',
  'windows-latest',
]);

/**
 * Evaluate the subset of GitHub expression syntax this workflow is allowed to use in a runner
 * label: a literal, or `${{ <term> || <term> || … }}` where each term is `vars.NAME`, a quoted
 * string, or `github.<path>`.
 *
 * Throws on anything else. That is the whole design: an expression this cannot evaluate is an
 * expression whose default nobody has checked.
 *
 * @param {string} expression
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function evaluateRunnerLabel(expression, vars) {
  const trimmed = expression.trim();
  const wrapped = /^\$\{\{(.*)\}\}$/s.exec(trimmed);
  if (wrapped === null) {
    if (trimmed.includes('${{')) {
      throw new Error(`runner label mixes literal text with an expression, which this guard will not evaluate: ${expression}`);
    }
    return trimmed;
  }
  const body = wrapped[1].trim();
  // Every term is classified before any is evaluated, and an unclassifiable term throws. Doing it
  // in this order matters: `${{ vars.X && 'y' }}` splits into one term, and reporting that as a
  // missing fallback would name the wrong defect and imply that adding a `||` would fix it.
  const terms = body.split('||').map((raw) => {
    const term = raw.trim();
    const quoted = /^'((?:[^']|'')*)'$/.exec(term);
    if (quoted !== null) return { kind: /** @type {const} */ ('literal'), value: quoted[1].replaceAll("''", "'") };
    const variable = /^vars\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(term);
    if (variable !== null) return { kind: /** @type {const} */ ('variable'), value: variable[1] };
    throw new Error(`runner label expression contains a term this guard cannot evaluate: '${term}' in ${expression}`);
  });
  if (terms.length < 2) {
    throw new Error(
      `runner label expression has no fallback term, so its value when ${RUNNER_LABEL_VARIABLE} is unset is undefined: ${expression}`,
    );
  }
  for (const term of terms) {
    // GitHub renders an unset `vars.X` as the empty string, which is falsy, so `||` falls through
    // to the next term. That fall-through is the entire inertness mechanism.
    const value = term.kind === 'literal' ? term.value : (vars[term.value] ?? '');
    if (value !== '') return value;
  }
  return '';
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isMap = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Check a parsed `ci.yml` against the contract.
 *
 * Returns a list of violations rather than throwing, so a single run reports every problem instead
 * of the first — the same shape `scripts/review-gates.mjs` uses, and for the same reason.
 *
 * @param {Record<string, unknown>} workflow
 * @returns {string[]}
 */
export function findMatrixViolations(workflow) {
  /** @type {string[]} */
  const violations = [];
  const say = (message) => violations.push(message);

  const jobs = workflow.jobs;
  if (!isMap(jobs)) return ['ci.yml has no `jobs:` mapping — the guard read nothing and is asserting nothing'];

  const suite = jobs.suite;
  if (!isMap(suite)) return ['ci.yml has no `suite` job — the guard read nothing and is asserting nothing'];

  /* ---------------------------------------------------------------- *
   * The matrix is two legs, and they are two different platforms.
   * ---------------------------------------------------------------- */

  const strategy = isMap(suite.strategy) ? suite.strategy : null;
  if (strategy === null) {
    return ['the `suite` job has no `strategy:` — there is no matrix left to compare two platforms with'];
  }

  if (strategy['fail-fast'] !== false) {
    say(
      'strategy.fail-fast is not `false`. Cancelling one leg for being slow makes "does this pin hold ' +
        'on both platforms?" unanswerable, which is the comparison the matrix exists for (contract § 2).',
    );
  }

  const matrix = isMap(strategy.matrix) ? strategy.matrix : null;
  if (matrix === null) return [...violations, 'the `suite` job has no `strategy.matrix:`'];

  const axes = Object.keys(matrix).filter((key) => key !== 'include' && key !== 'exclude');
  if (axes.length > 0) {
    say(
      `strategy.matrix declares free axes ${JSON.stringify(axes)}. The matrix is an explicit two-entry ` +
        '`include:` so that every leg is named; a free axis multiplies the legs out of the guard\'s sight. ' +
        'In particular § D201 eliminated Node as the variable and a Node axis must not come back (contract § 2).',
    );
  }

  const legs = Array.isArray(matrix.include) ? matrix.include : null;
  if (legs === null) return [...violations, 'strategy.matrix has no `include:` sequence'];
  if (legs.length !== REQUIRED_PLATFORMS.length) {
    say(`the matrix has ${String(legs.length)} leg(s); it must have exactly ${String(REQUIRED_PLATFORMS.length)}, one per platform`);
  }

  /** @type {Map<string, string>} */
  const runnerByPlatform = new Map();
  for (const [index, leg] of legs.entries()) {
    if (!isMap(leg)) {
      say(`matrix leg ${String(index)} is not a mapping`);
      continue;
    }
    const platform = leg.platform;
    const runner = leg.runner;
    if (typeof platform !== 'string' || typeof runner !== 'string') {
      say(`matrix leg ${String(index)} must declare both a string \`platform:\` and a string \`runner:\``);
      continue;
    }
    if (runnerByPlatform.has(platform)) {
      say(`platform '${platform}' appears twice in the matrix; two legs on one platform is one platform, not two`);
      continue;
    }
    runnerByPlatform.set(platform, runner);
  }

  for (const platform of REQUIRED_PLATFORMS) {
    if (!runnerByPlatform.has(platform)) {
      say(
        `the matrix has no '${platform}' leg. The two-OS matrix is deliberate — see ci.yml's header and ` +
          '§ D201 — and a single leg restores the state where one environment is silently canonical.',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * The macOS leg cannot be retargeted, and the Linux leg is inert by default.
   * ---------------------------------------------------------------- */

  const macRunner = runnerByPlatform.get('macos');
  if (typeof macRunner === 'string' && !GITHUB_HOSTED.has(macRunner)) {
    say(
      `the macOS leg runs on '${macRunner}', which is not a literal GitHub-hosted label. Azure has no ` +
        'macOS, so this leg has nowhere else to go; making it configurable is exactly how it becomes ' +
        'possible for a repository variable to leave one leg standing.',
    );
  }

  const linuxRunner = runnerByPlatform.get('linux');
  if (typeof linuxRunner === 'string') {
    let whenUnset;
    let whenSet;
    try {
      whenUnset = evaluateRunnerLabel(linuxRunner, {});
      whenSet = evaluateRunnerLabel(linuxRunner, { [RUNNER_LABEL_VARIABLE]: 'a-self-hosted-label' });
    } catch (error) {
      say(`the Linux leg's runner label cannot be evaluated: ${/** @type {Error} */ (error).message}`);
    }
    if (whenUnset !== undefined && whenUnset !== DEFAULT_LINUX_RUNNER) {
      say(
        `with ${RUNNER_LABEL_VARIABLE} unset the Linux leg resolves to '${whenUnset}', not '${DEFAULT_LINUX_RUNNER}'. ` +
          'The compute offload must be completely inert until runners exist: a repository with no ' +
          'self-hosted runner registered has to behave exactly as it did before this change, not queue ' +
          'for a runner that will never appear.',
      );
    }
    if (whenSet !== undefined && whenSet !== 'a-self-hosted-label') {
      say(
        `with ${RUNNER_LABEL_VARIABLE} set the Linux leg resolves to '${String(whenSet)}' rather than the ` +
          'variable\'s value, so the switch does not actually switch. An inert change that can never be ' +
          'turned on is not inert, it is dead.',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * Every other job stays observable no matter what the owner provisioned.
   * ---------------------------------------------------------------- */

  for (const [name, job] of Object.entries(jobs)) {
    if (name === 'suite' || !isMap(job)) continue;
    const runsOn = job['runs-on'];
    if (typeof runsOn !== 'string' || !GITHUB_HOSTED.has(runsOn)) {
      say(
        `job '${name}' has \`runs-on: ${String(runsOn)}\`, which is not a literal GitHub-hosted label. ` +
          'A guard that runs on the fleet it is guarding cannot report that the fleet is missing.',
      );
    }
  }

  const suiteRunsOn = suite['runs-on'];
  if (suiteRunsOn !== '${{ matrix.runner }}') {
    say(`the \`suite\` job's \`runs-on\` is ${JSON.stringify(suiteRunsOn)}; it must be \${{ matrix.runner }} so every leg's runner is the one the matrix names`);
  }

  /* ---------------------------------------------------------------- *
   * No Node axis, and the pin is still a single value.
   * ---------------------------------------------------------------- */

  const steps = Array.isArray(suite.steps) ? suite.steps : [];
  const setupNode = steps.filter((step) => isMap(step) && typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@'));
  if (setupNode.length !== 1) {
    say(`expected exactly one \`actions/setup-node\` step in \`suite\`; found ${String(setupNode.length)}`);
  }
  for (const step of setupNode) {
    const version = isMap(step.with) ? step.with['node-version'] : undefined;
    if (typeof version !== 'string' || version.includes('${{') || version.includes(',')) {
      say(
        `setup-node's node-version is ${JSON.stringify(version)}; it must be a single literal. § D196 and ` +
          '§ D201 both found the digests bit-identical across Node versions, so a Node axis spends runner ' +
          'minutes re-confirming the one variable already eliminated (ci.yml header).',
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * Anti-vacuity. A guard that read a file it did not understand passes everything.
   * ---------------------------------------------------------------- */

  if (steps.length < 5) {
    say(`the \`suite\` job parsed to ${String(steps.length)} step(s); the reader is broken, not the workflow`);
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
  return findMatrixViolations(parseYaml(readFileSync(path, 'utf8')));
}
