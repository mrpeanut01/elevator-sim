/**
 * The deep-tier failure report points at the job that failed — GitHub issue #309,
 * [§ D420](../../../../DECISIONS.md).
 *
 * ## What this exists to stop
 *
 * `.github/workflows/deep-tiers.yml`'s `report` job opens one GitHub issue when any tier goes red.
 * Its guidance paragraph used to be a single fixed sentence:
 *
 * > These tiers run nowhere else, so a red here is the only place the finding exists. Read
 * > `perf-scaling` against its own note about wall-clock flake under load before treating it as a
 * > defect; the other eight are deterministic.
 *
 * On 2026-08-30 `perf-scaling` **passed** and `perf-sweep` failed, and the issue that sentence
 * filed still sent its reader to the passing job. That is worse than saying nothing: the note it
 * points at exists to explain a red *away*, so a reader who follows an unscoped pointer onto the
 * wrong job comes back with *known flake* about a defect. The sweep had never executed a single
 * replication, and the report said *read the other one*.
 *
 * ## Why this drives the generator instead of reading it
 *
 * A test that asserted the workflow *contains* some phrase would pass over a generator that emits
 * that phrase unconditionally, which is the defect. So the program is extracted from the workflow
 * file — never copied, or this file would be asserting things about itself — and executed over
 * three job-result sets. What is checked is what a reader would actually receive.
 *
 * The most important of the three is the one that reproduces 2026-08-30: `perf-scaling` green,
 * something else red. A generator that has regressed to a fixed sentence passes the other two.
 *
 * ## The apostrophe rule, which is a real constraint and not a style note
 *
 * The generator runs as `node -e '…'` inside a **single-quoted shell word**, so a single quote
 * anywhere in it — including in its prose — ends that word and hands the rest to bash. § D393's own
 * header records the sibling trap one file over: an apostrophe inside a template literal opened a
 * bogus string in a comment-stripper and silently swallowed a whole tier from the count. It is
 * asserted here rather than trusted.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'deep-tiers.yml');

/** The opening of the shell assignment the guidance program lives in. */
const OPENER = 'guidance="$(node -e \'';

/**
 * The guidance program, lifted out of the workflow.
 *
 * Extracted by the same delimiters bash uses, so if this cannot find the program then neither can
 * the shell, and the case below fails rather than skipping.
 */
const guidanceProgram = (): string => {
  const source = readFileSync(WORKFLOW, 'utf8');
  const opens = source.indexOf(OPENER);
  expect(opens, `the report job has no \`${OPENER}\` assignment`).toBeGreaterThanOrEqual(0);
  const from = opens + OPENER.length;
  const closes = source.indexOf("')\"", from);
  expect(closes, 'the guidance program is never closed').toBeGreaterThan(from);
  return source.slice(from, closes);
};

/** Run the extracted program against one `needs` context, exactly as the workflow does. */
const guidanceFor = (results: Readonly<Record<string, { result: string }>>): string =>
  execFileSync(process.execPath, ['-e', guidanceProgram()], {
    env: { ...process.env, RESULTS: JSON.stringify(results) },
    encoding: 'utf8',
  });

/** The tier whose own note explains a red away, and the only one it may be offered about. */
const FLAKY = 'perf-scaling';

/** 2026-08-30: the sweep red, the flaky tier green. The run that produced issue #309. */
const SWEEP_ONLY = {
  'fuzz-deep': { result: 'success' },
  'golden-runs': { result: 'success' },
  'oracle-campaign': { result: 'success' },
  'matrix-census': { result: 'success' },
  'collective-adoption': { result: 'success' },
  'perf-sweep': { result: 'failure' },
  'perf-scaling': { result: 'success' },
  'honesty-deep': { result: 'success' },
  'corpus-figures': { result: 'success' },
} as const;

describe('§ D420 — the failure report is scoped to the jobs that failed', () => {
  it('does not offer the wall-clock caveat when the flaky tier passed', () => {
    const guidance = guidanceFor(SWEEP_ONLY);
    const complaint =
      'the report offered `perf-scaling`’s flake note on a run where `perf-scaling` passed. ' +
      'That note exists to explain a red away, so pointing at the wrong job turns a defect into ' +
      'a shrug — GitHub issue #309.';

    /*
     * Two refusals rather than one, and the split is what the mutation run taught. Regressing the
     * generator to the superseded sentence — *"Read `perf-scaling` against its own note…"* — does
     * **not** trip `read THAT job`, because those are different words for the same mistake. The
     * imperative is the half that has to be refused by name, and the general one is what catches a
     * future rewording of it.
     */
    expect(guidance, complaint).not.toMatch(/Read\s+`perf-scaling`/u);
    expect(guidance, complaint).not.toMatch(/read THAT job/u);

    /* And the positive half: silence about the caveat would satisfy both refusals above. */
    expect(guidance).toMatch(/NOT\s+among the failures/u);
    expect(guidance).toMatch(/deterministic/u);
  });

  it('offers it, scoped to that job alone, when the flaky tier is the one that failed', () => {
    const guidance = guidanceFor({ 'perf-sweep': { result: 'success' }, [FLAKY]: { result: 'failure' } });
    expect(guidance).toMatch(/read THAT job, and only that one/u);
    expect(guidance).toMatch(/wall-clock flake/u);
  });

  it('counts the other failing jobs rather than asserting a remembered number', () => {
    /*
     * The superseded sentence said *"the other eight are deterministic"* — arithmetic over a
     * `needs:` list that a tenth tier would falsify in silence, and about the wrong population
     * anyway: the number a reader needs is how many of the FAILING jobs are not the flaky one.
     */
    const guidance = guidanceFor({
      'perf-sweep': { result: 'failure' },
      'matrix-census': { result: 'failure' },
      [FLAKY]: { result: 'failure' },
      'fuzz-deep': { result: 'success' },
    });
    expect(guidance).toMatch(/read THAT job, and only that one/u);
    expect(guidance).toMatch(/The other 2 failing job\(s\) are deterministic/u);
  });

  it('carries no single quote, because bash would end the program at one', () => {
    expect(
      guidanceProgram(),
      'this program is a single-quoted shell word. One apostrophe — in code or in prose — ends it ' +
        'and hands the remainder to bash.',
    ).not.toMatch(/'/u);
  });

  it('found a program to drive, so an empty extraction cannot pass this file', () => {
    /*
     * The vacuity guard. `execFileSync(node, ["-e", ""])` exits 0 and prints nothing, so an
     * extraction that silently produced an empty string would leave every `not.toMatch` above
     * trivially satisfied and every `toMatch` failing — which is at least loud. The floor is here
     * so that the quiet half cannot happen on its own.
     */
    expect(guidanceProgram().length).toBeGreaterThan(200);
    expect(guidanceProgram()).toContain('RESULTS');
  });
});
