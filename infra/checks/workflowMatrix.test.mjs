/**
 * Contract criterion 3, asserted rather than argued.
 *
 * Run locally with `node --test infra/checks/`; run in CI by the `matrix shape` job in
 * `.github/workflows/ci.yml`. It uses `node:test` and `node:assert` and nothing installed, so it
 * answers "is the matrix still two platforms?" even on a tree where `npm ci` is what broke.
 *
 * ## The shape of the evidence
 *
 * Two halves, and the second is the one that makes the first mean anything.
 *
 * The first half checks the real `ci.yml` and expects zero violations. On its own that is a test
 * which passes when the guard is broken, which is the failure mode `scripts/review-gates.mjs`
 * closes with its own `files.length < 100` check.
 *
 * The second half **mutates the real file** — one edit each, applied to the shipped text rather
 * than to a hand-written fixture, so a mutant cannot drift away from what it is a mutation of —
 * and requires the guard to reject every mutant. Each mutation asserts that it actually changed the
 * text before asserting that the guard caught it; a `replace` that matched nothing would otherwise
 * hand the guard the original file and be recorded as a catch.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseYaml } from './miniYaml.mjs';
import {
  CI_WORKFLOW_PATH,
  DEFAULT_LINUX_RUNNER,
  RUNNER_LABEL_VARIABLE,
  checkCiWorkflow,
  evaluateRunnerLabel,
  findMatrixViolations,
} from './workflowMatrix.mjs';

const SOURCE = readFileSync(CI_WORKFLOW_PATH, 'utf8');

const PARSED = JSON.stringify(parseYaml(SOURCE));

/**
 * Apply one textual mutation and assert it landed.
 *
 * `replaceAll`, not `replace`, and the check is on the **parsed** result rather than on the text.
 * Both because of a defect this harness had and the first version of this assertion missed: the
 * runner expression now also appears in ci.yml's header comment, so a first-occurrence replace
 * edited a comment, changed the text, and handed the guard a workflow that parsed identically to
 * the original — four mutants recorded as escapes when the guard was correct. A mutation that does
 * not move the parse is not a mutation.
 *
 * @param {string} find
 * @param {string} replace
 * @returns {Record<string, unknown>}
 */
function mutate(find, replace) {
  assert.ok(SOURCE.includes(find), `the mutation target is not in ci.yml, so this mutant is the original file: ${find}`);
  const workflow = parseYaml(SOURCE.replaceAll(find, replace));
  assert.notEqual(JSON.stringify(workflow), PARSED, 'the mutation changed the text but not the parsed workflow');
  return workflow;
}

/** @param {string[]} violations @param {RegExp} pattern */
function assertCaught(violations, pattern) {
  assert.ok(violations.length > 0, 'the guard reported no violation for a workflow that breaks the contract');
  assert.ok(
    violations.some((violation) => pattern.test(violation)),
    `no violation matched ${String(pattern)}. Got:\n  ${violations.join('\n  ')}`,
  );
}

/* -------------------------------------------------------------------------- *
 * The reader read something
 * -------------------------------------------------------------------------- */

test('the workflow parses to the structure the guard assumes', () => {
  const workflow = parseYaml(SOURCE);
  assert.equal(workflow.name, 'CI');
  assert.ok(workflow.on, 'no trigger block');
  assert.ok(workflow.concurrency, 'no concurrency block');
  const jobs = /** @type {Record<string, Record<string, unknown>>} */ (workflow.jobs);
  assert.ok(Object.keys(jobs).length >= 2, 'expected at least the suite and the matrix guard');
  assert.ok(Array.isArray(jobs.suite.steps) && jobs.suite.steps.length >= 5, 'the suite lost its steps');
});

/* -------------------------------------------------------------------------- *
 * Criterion 3, on the file as shipped
 * -------------------------------------------------------------------------- */

test('the shipped ci.yml compares two operating systems', () => {
  assert.deepEqual(checkCiWorkflow(), []);
});

/* -------------------------------------------------------------------------- *
 * Inertness, evaluated in both directions
 * -------------------------------------------------------------------------- */

test(`with ${RUNNER_LABEL_VARIABLE} unset the Linux leg is ${DEFAULT_LINUX_RUNNER}`, () => {
  const workflow = parseYaml(SOURCE);
  const jobs = /** @type {any} */ (workflow).jobs;
  const linux = jobs.suite.strategy.matrix.include.find((leg) => leg.platform === 'linux');
  assert.ok(linux, 'no linux leg');
  assert.equal(evaluateRunnerLabel(linux.runner, {}), DEFAULT_LINUX_RUNNER);
  assert.equal(evaluateRunnerLabel(linux.runner, { [RUNNER_LABEL_VARIABLE]: '' }), DEFAULT_LINUX_RUNNER);
  assert.equal(
    evaluateRunnerLabel(linux.runner, { [RUNNER_LABEL_VARIABLE]: 'elevator-sim-linux-x64' }),
    'elevator-sim-linux-x64',
  );
});

test('the evaluator refuses an expression it does not fully understand', () => {
  assert.throws(() => evaluateRunnerLabel("${{ vars.X && 'y' }}", {}), /cannot evaluate/);
  assert.throws(() => evaluateRunnerLabel('${{ vars.X }}', {}), /no fallback term/);
  assert.throws(() => evaluateRunnerLabel('prefix-${{ vars.X }}', {}), /mixes literal text/);
});

/* -------------------------------------------------------------------------- *
 * The mutants
 * -------------------------------------------------------------------------- */

test('a matrix with the macOS leg deleted is rejected', () => {
  assertCaught(findMatrixViolations(mutate('          - platform: macos\n            runner: macos-latest\n', '')), /no 'macos' leg/);
});

test('a macOS leg made configurable is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate('            runner: macos-latest', "            runner: ${{ vars.CI_MACOS_RUNNER_LABEL || 'self-hosted' }}")),
    /macOS leg runs on/,
  );
});

test('a Linux runner label with no fallback is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate(`\${{ vars.${RUNNER_LABEL_VARIABLE} || '${DEFAULT_LINUX_RUNNER}' }}`, `\${{ vars.${RUNNER_LABEL_VARIABLE} }}`)),
    /cannot be evaluated|no fallback term/,
  );
});

test('a Linux runner whose default is not GitHub-hosted is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate(`|| '${DEFAULT_LINUX_RUNNER}' }}`, "|| 'elevator-sim-linux-x64' }}")),
    /resolves to 'elevator-sim-linux-x64'/,
  );
});

test('a Linux runner pinned to the self-hosted label with no variable at all is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate(`\${{ vars.${RUNNER_LABEL_VARIABLE} || '${DEFAULT_LINUX_RUNNER}' }}`, 'elevator-sim-linux-x64')),
    /resolves to 'elevator-sim-linux-x64'/,
  );
});

test('fail-fast: true is rejected', () => {
  assertCaught(findMatrixViolations(mutate('      fail-fast: false', '      fail-fast: true')), /fail-fast/);
});

test('a Node axis is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate('        include:\n          - platform: linux', "        node: ['24', '26']\n        include:\n          - platform: linux")),
    /free axes/,
  );
});

test('two legs on one platform is rejected', () => {
  assertCaught(findMatrixViolations(mutate('          - platform: macos', '          - platform: linux')), /appears twice|no 'macos' leg/);
});

test('moving the guard job onto the fleet it guards is rejected', () => {
  assertCaught(
    findMatrixViolations(mutate('    runs-on: ubuntu-latest', "    runs-on: ${{ vars.CI_LINUX_RUNNER_LABEL || 'ubuntu-latest' }}")),
    /cannot report that the fleet is missing/,
  );
});
