/**
 * `.github/workflows/ci.yml`'s environment properties, asserted rather than argued — GitHub issue
 * #414, `infra/checks/workflowMatrix.mjs`.
 *
 * ## Why this file is here and not in `infra/checks/`
 *
 * The deleted guard shipped its own `node:test` file and was run by a `matrix shape` job inside
 * `ci.yml`. Both halves of that are unavailable now: `.github/workflows/**` is a protected path, so
 * no job can be added, and a *new* vitest project would run nowhere at all — `ci.yml`'s legs name
 * their projects literally (`--project core`, `--project experiments`, …), so a project this
 * repository invented today would be a gate that does not gate, which is `RISKS.md` R40 and would
 * be a particularly embarrassing way to close an issue about a property that stopped being checked.
 *
 * So the guard keeps its home and its dependency-free shape in `infra/checks/`, and the gate lives
 * here, in the `experiments` project that `ci.yml` already runs, beside this repository's other
 * repository-level guards (`documentation.test.ts`, `citations.test.ts`, `blockedBy.test.ts`). The
 * import crosses out of the package through a `.d.mts` exactly as `blockedBy.test.ts` imports
 * `scripts/blocked-by.mjs`, for the reason that file gives: the script must stay runnable by `node`
 * with nothing installed.
 *
 * ## The shape of the evidence
 *
 * Three parts, and the second is what makes the first mean anything.
 *
 * **The reader read something.** A YAML subset parser that quietly fails to understand a file
 * hands every assertion below a workflow with no jobs in it, and they all pass. So the parse is
 * asserted against known landmarks before anything is checked, and the guard carries its own
 * anti-vacuity clauses on top.
 *
 * **The guard rejects mutations of the real file.** Sixteen of them, each applied to the shipped
 * text rather than to a hand-written fixture — a fixture drifts away from what it is a mutation of
 * — and each asserting that it actually moved the *parsed* workflow before asserting the guard
 * caught it. That second assertion is not decoration: the deleted guard's own test had four mutants
 * silently editing a header **comment** and being recorded as catches.
 *
 * **The guard stays neutral about the thing that changed.** § D462 removed the macOS leg, and
 * `ci.yml` says re-adding one is a single `include:` entry. So two further mutations must be
 * *accepted* rather than caught: a macOS leg added back, and the same leg added **together with the
 * `if:` on the architecture gate that `ci.yml` says comes back with it**. The second is the one this
 * guard nearly got wrong — a condition on that gate is a guard-that-cannot-fail while every leg is
 * Linux and is doing real work the moment it is not, so the platform count decides, and the
 * identical edit is a violation above and clean here. A guard that failed either would have frozen
 * a cost decision into a rule, which is the inverse of the defect this issue is about.
 *
 * ## What was withdrawn with Phase A and is deliberately not restored
 *
 * The deleted corpus was nine mutants, and the split is exact rather than approximate.
 *
 * **Five are still true of the file and are kept.** Three arrive verbatim — `fail-fast: true`, a
 * Node axis, and the aggregating job moved onto a runner someone else controls. The other two —
 * a Linux runner whose default is not GitHub-hosted, and a Linux runner pinned to a self-hosted
 * label — say the same thing about today's file and collapse into one rule, exercised by two
 * mutants below (a self-hosted label and an ARM one).
 *
 * **Four mutate text that has been deleted**: the macOS leg removed, the macOS leg made
 * configurable, the Linux label stripped of the `|| 'ubuntu-latest'` fallback it no longer has, and
 * `- platform: macos` rewritten to `linux` so that two legs share a platform — which is not a
 * defect any more, because five legs share one by design. Restoring any of those would assert a
 * property the file does not have.
 *
 * **The other eleven rejecting mutants are new, and eight are the x86-64 property** — the half the
 * deleted guard never actually asserted, since the `uname -m` step has always lived in `ci.yml` and
 * nothing has ever checked that it is still there.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseYaml, type YamlValue } from '../../../../infra/checks/miniYaml.mjs';
import {
  CI_WORKFLOW_PATH,
  GITHUB_HOSTED,
  GITHUB_HOSTED_X86_LINUX,
  MATRIX_JOB,
  REQUIRED_LINUX_ARCH,
  checkCiWorkflow,
  findWorkflowViolations,
  summaryOf,
} from '../../../../infra/checks/workflowMatrix.mjs';

const SOURCE = readFileSync(CI_WORKFLOW_PATH, 'utf8');
const PARSED = JSON.stringify(parseYaml(SOURCE));

const GUARD = fileURLToPath(new URL('../../../../infra/checks/workflowMatrix.mjs', import.meta.url));

/**
 * Apply one textual mutation to the shipped `ci.yml` and assert it landed.
 *
 * `replaceAll`, not `replace`, and the check is on the **parsed** result rather than on the text.
 * Both because of a defect the deleted harness had and the first version of its assertion missed:
 * `ci.yml`'s header comment quotes the very expressions the matrix uses, so a first-occurrence
 * replace edited a comment, changed the text, and handed the guard a workflow that parsed
 * identically to the original — four mutants recorded as escapes when the guard was correct. A
 * mutation that does not move the parse is not a mutation.
 */
const mutate = (find: string, replace: string): Record<string, YamlValue> =>
  mutatedText(SOURCE.includes(find) ? SOURCE.replaceAll(find, replace) : missing(find));

const missing = (find: string): never => {
  throw new Error(`the mutation target is not in ci.yml, so this mutant is the original file: ${find}`);
};

const mutatedText = (text: string): Record<string, YamlValue> => {
  const workflow = parseYaml(text);
  expect(JSON.stringify(workflow), 'the mutation changed the text but not the parsed workflow').not.toBe(
    PARSED,
  );
  return workflow;
};

/** Delete a whole `- name:`-headed step from the matrix job's step list. */
const withoutStep = (name: string): Record<string, YamlValue> => {
  const lines = SOURCE.split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  if (start < 0) missing(`      - name: ${name}`);
  let end = start + 1;
  while (end < lines.length && !(lines[end] ?? '').startsWith('      - ')) end += 1;
  return mutatedText([...lines.slice(0, start), ...lines.slice(end)].join('\n'));
};

const assertCaught = (violations: readonly string[], pattern: RegExp): void => {
  expect(violations.length, 'the guard reported no violation for a workflow that breaks the contract').
    toBeGreaterThan(0);
  expect(
    violations.some((violation) => pattern.test(violation)),
    `no violation matched ${String(pattern)}. Got:\n  ${violations.join('\n  ')}`,
  ).toBe(true);
};

/** The gate step's own name, which several mutants below take apart. */
const ARCH_STEP = 'The Linux leg is x86-64, or it is a second pin environment';

const ARCH_STEP_HEADER = `      - name: ${ARCH_STEP}\n`;
const CONDITIONAL_ARCH_STEP_HEADER = `${ARCH_STEP_HEADER}        if: \${{ matrix.platform == 'linux' }}\n`;

/** The last leg in the shipped `include:`, which the macOS mutations below insert ahead of. */
const LAST_LEG = '          - leg: browser\n            projects: --project viz-browser\n';

const macosLeg = (runner: string): string =>
  `          - leg: cli-macos\n            projects: --project cli\n            platform: macos\n            runner: ${runner}\n`;

/* -------------------------------------------------------------------------- *
 * The reader read something
 * -------------------------------------------------------------------------- */

describe('the reader', () => {
  it('parses ci.yml to the structure the guard assumes', () => {
    const workflow = parseYaml(SOURCE);
    expect(workflow.name).toBe('CI');
    expect(workflow.on, 'no trigger block').toBeTruthy();
    expect(workflow.concurrency, 'no concurrency block').toBeTruthy();
    const jobs = workflow.jobs as Record<string, Record<string, YamlValue>>;
    expect(Object.keys(jobs).sort()).toEqual([MATRIX_JOB, 'suite'].sort());
    const steps = jobs[MATRIX_JOB]?.steps;
    expect(Array.isArray(steps) && steps.length >= 5, 'the matrix job lost its steps').toBe(true);
  });

  it('refuses a construct it does not understand rather than returning undefined', () => {
    // The property that makes every assertion below non-vacuous. A reader that shrugged at a flow
    // mapping would report a workflow with no matrix and the guard would say the matrix is fine.
    expect(() => parseYaml('jobs: { legs: 1 }')).toThrow(/flow mappings/);
    expect(() => parseYaml('legs: *alias')).toThrow(/anchors, aliases and tags/);
  });

  it('finds the architecture gate in the shipped file, so "no gate" is a finding and not the state', () => {
    const jobs = parseYaml(SOURCE).jobs as Record<string, Record<string, YamlValue>>;
    const steps = (jobs[MATRIX_JOB]?.steps ?? []) as Record<string, YamlValue>[];
    const gate = steps.find((step) => step.name === ARCH_STEP);
    expect(gate, `ci.yml no longer has a step named ${ARCH_STEP}`).toBeTruthy();
    expect(String(gate?.run)).toMatch(/uname\s+-m/);
    expect(String(gate?.run)).toContain(REQUIRED_LINUX_ARCH);
    expect(gate?.if, 'the gate must not be conditional').toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The file as shipped
 * -------------------------------------------------------------------------- */

describe('the shipped ci.yml', () => {
  it('holds every property the guard asserts', () => {
    expect(checkCiWorkflow()).toEqual([]);
  });

  it('runs its Linux legs on GitHub-hosted x86-64 labels, and the ARM labels are excluded on purpose', () => {
    // Stated here rather than only in the guard because it is the whole subject of #414: an ARM
    // Ubuntu label is a real label GitHub offers, and it is a second pin environment.
    expect(GITHUB_HOSTED_X86_LINUX.has('ubuntu-latest')).toBe(true);
    expect(GITHUB_HOSTED_X86_LINUX.has('ubuntu-24.04-arm')).toBe(false);
    expect(GITHUB_HOSTED.has('ubuntu-24.04-arm')).toBe(true);
    expect(GITHUB_HOSTED.has('macos-latest'), '§ D462 is reversible; the label stays known').toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The x86-64 Linux leg — the property #414 exists for
 * -------------------------------------------------------------------------- */

describe('the x86-64 Linux leg', () => {
  it('rejects a workflow with the architecture gate deleted', () => {
    assertCaught(findWorkflowViolations(withoutStep(ARCH_STEP)), /fails the run when `uname -m`/);
  });

  it('rejects a gate that has stopped failing the run', () => {
    assertCaught(
      findWorkflowViolations(mutate('measurement."\n            exit 1', 'measurement."')),
      /fails the run when `uname -m`/,
    );
  });

  it('rejects a gate flipped to a different architecture', () => {
    assertCaught(
      findWorkflowViolations(mutate('!= "x86_64"', '!= "aarch64"')),
      /gates on \["aarch64"\]/,
    );
  });

  it('rejects a gate made conditional while the matrix is one platform', () => {
    assertCaught(findWorkflowViolations(mutate(ARCH_STEP_HEADER, CONDITIONAL_ARCH_STEP_HEADER)), /carries `if:/);
  });

  it('rejects a Linux leg moved to an ARM runner', () => {
    assertCaught(
      findWorkflowViolations(mutate('            runner: ubuntu-latest', '            runner: ubuntu-24.04-arm')),
      /not a GitHub-hosted x86_64 Linux label/,
    );
  });

  it('rejects a Linux leg pinned to a self-hosted label', () => {
    assertCaught(
      findWorkflowViolations(
        mutate('            runner: ubuntu-latest', '            runner: elevator-sim-linux-x64'),
      ),
      /not a GitHub-hosted x86_64 Linux label/,
    );
  });

  it('rejects a leg whose runner is an expression — Phase A’s hole, kept shut without Phase A', () => {
    assertCaught(
      findWorkflowViolations(
        mutate(
          '            runner: ubuntu-latest',
          "            runner: ${{ vars.CI_LINUX_RUNNER_LABEL || 'ubuntu-latest' }}",
        ),
      ),
      /expression rather than a literal label/,
    );
  });

  it('rejects a matrix with no Linux leg left in it', () => {
    assertCaught(
      findWorkflowViolations(mutate('            platform: linux', '            platform: penguin')),
      /no matrix leg declares `platform: linux`/,
    );
  });

  it('rejects a leg that declares no platform at all', () => {
    assertCaught(
      findWorkflowViolations(mutate('            platform: linux\n', '')),
      /must declare both a string `platform:` and a string `runner:`/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The matrix shape — the half of the deleted corpus that is still true
 * -------------------------------------------------------------------------- */

describe('the matrix shape', () => {
  it('rejects fail-fast: true', () => {
    assertCaught(findWorkflowViolations(mutate('      fail-fast: false', '      fail-fast: true')), /fail-fast/);
  });

  it('rejects a free axis, which is how a Node axis would come back', () => {
    assertCaught(
      findWorkflowViolations(
        mutate('        include:\n          - leg: core', "        node: ['24', '26']\n        include:\n          - leg: core"),
      ),
      /free axes/,
    );
  });

  it('rejects a node-version that is not a single literal', () => {
    assertCaught(
      findWorkflowViolations(mutate("          node-version: '26'", '          node-version: ${{ matrix.node }}')),
      /single literal/,
    );
  });

  it('rejects a matrix job that ignores the runner its own matrix names', () => {
    assertCaught(
      findWorkflowViolations(mutate('    runs-on: ${{ matrix.runner }}', '    runs-on: ubuntu-latest')),
      /matrix\.runner/,
    );
  });

  it('rejects moving the aggregating check onto a runner someone else controls', () => {
    assertCaught(
      findWorkflowViolations(
        mutate('    runs-on: ubuntu-latest', "    runs-on: ${{ vars.CI_LINUX_RUNNER_LABEL || 'ubuntu-latest' }}"),
      ),
      /not a literal GitHub-hosted/,
    );
  });

  it('rejects the matrix job going missing, rather than passing everything', () => {
    assertCaught(findWorkflowViolations(mutate('\n  legs:\n', '\n  matrix-legs:\n')), /has no `legs` job/);
  });
});

/* -------------------------------------------------------------------------- *
 * The neutrality that keeps § D462 reversible
 * -------------------------------------------------------------------------- */

describe('the two-OS matrix, which is obsolete and therefore not asserted', () => {
  it('reports nothing when a macOS leg is added back', () => {
    // § D462 removed the macOS leg on the product owner's call, and ci.yml's header says
    // "Re-adding a leg is one `include:` entry." A guard that required exactly one platform — or,
    // like the deleted one, exactly two — would fail the run for someone doing what the file
    // invites. The property asserted is conditional on a leg's own `platform`, and this is the
    // measurement that says so rather than the docstring claiming it.
    expect(findWorkflowViolations(mutate(LAST_LEG, macosLeg('macos-latest') + LAST_LEG))).toEqual([]);
  });

  it('reports nothing when the macOS leg comes back WITH the condition it licenses', () => {
    // The clause this guard nearly got wrong. `ci.yml` deleted the gate's `if:` when the macOS leg
    // went, "because a condition naming the platform would be a guard that cannot fail" — and said
    // in the same breath that "it comes back with the leg". A guard rejecting the condition
    // unconditionally would fail the run for someone restoring the `if:` the file itself tells them
    // to restore. So the platform count decides, and this is the direction that proves it: the same
    // edit that is a violation on a one-platform matrix, above, is clean on a two-platform one.
    const restored = parseYaml(
      SOURCE.replaceAll(LAST_LEG, macosLeg('macos-latest') + LAST_LEG).replaceAll(
        ARCH_STEP_HEADER,
        CONDITIONAL_ARCH_STEP_HEADER,
      ),
    );
    expect(findWorkflowViolations(restored)).toEqual([]);
  });

  it('still rejects a macOS leg that is not GitHub-hosted', () => {
    // The other half of the same neutrality: a second platform is welcome, and a second platform on
    // hardware nobody can inspect is a pin environment nobody has measured.
    assertCaught(
      findWorkflowViolations(mutate(LAST_LEG, macosLeg('elevator-sim-mac-mini') + LAST_LEG)),
      /not a literal GitHub-hosted label/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The standalone path, driven rather than assumed
 * -------------------------------------------------------------------------- */

describe('node infra/checks/workflowMatrix.mjs', () => {
  it('exits zero and says what it checked', () => {
    // Driven as a subprocess so the entry point has a caller and its behaviour is measured. It is
    // not a second gate — no workflow invokes it, because `.github/workflows/**` is protected —
    // but it is what answers this question on a tree where `npm ci` is what broke, so leaving it
    // here unexercised would be a seam with no caller in the file that exists to catch those.
    const out = execFileSync(process.execPath, [GUARD], { encoding: 'utf8' });
    expect(out.trim()).toBe(summaryOf([]));
    expect(out).toContain(REQUIRED_LINUX_ARCH);
  });

  it('renders each violation on its own line', () => {
    expect(summaryOf(['first', 'second'])).toBe('ci.yml: 2 violation(s).\n  - first\n  - second');
  });
});
