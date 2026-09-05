/**
 * The suite's legs cover every vitest project, derived from both files rather than listed here.
 *
 * ## What this exists to stop
 *
 * `ci.yml` ran one job invoking `npm test`, which is every registered project in series. That was
 * ~49 minutes on the one run that completed on 2026-09-04, and it had a property worth naming: the
 * command could not miss a project, because it named none of them.
 *
 * Splitting it into one leg per project buys the wall clock of the longest project instead of the
 * sum of all of them, and gives that property up. A leg list is a hand-written set, and a project
 * that arrives without a leg is a project CI stops running while every check stays green. That is
 * `RISKS.md` R40's shape exactly, and it is the cost of the split rather than a hypothetical: the
 * browser tier already spent thirty-eight cases in that state, in both places they could have run.
 *
 * So the set is derived from `vitest.config.ts` on one side and from the workflow's own matrix on
 * the other, and compared **in both directions**. A seventh project cannot arrive without arriving
 * here, and a leg naming a project that no longer exists is equally red.
 *
 * ## Why both directions, and not just the one that sounds dangerous
 *
 * *Every project has a leg* is the clause that stops coverage silently shrinking. *Every leg names
 * a real project* is the clause that stops the opposite failure, and it is the one with teeth in
 * practice: `--project nosuchname` selects nothing, and every project in `vitest.config.ts` sets
 * `passWithNoTests: true`, so the leg would exit 0 having executed nothing. In the Actions tab that
 * is indistinguishable from a job whose tests passed.
 *
 * That is why § 3 asserts the flag as well. `--passWithNoTests=false` is what turns an empty
 * selection into a failure, and a typo in the matrix into a red run rather than a quiet one. The
 * flag matters more after the split than before it, because before the split there was no name to
 * mistype.
 *
 * ## What this file does not do
 *
 * It runs no project and reads no result. It asserts wiring, in the same division of labour
 * `deepTiers.test.ts` draws for the scheduled tiers: a project landing **unwired** is a red pull
 * request here, and a project **failing** is a red leg there.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');
const VITEST_CONFIG = join(ROOT, 'vitest.config.ts');

/**
 * The projects `vitest.config.ts` registers.
 *
 * Two spellings because the file has two: `project('name', …)` for the five that share a helper, and
 * a bare `name: 'viz-browser'` for the one that does not, since the browser tier carries its own
 * `globalSetup` and timeout. Matching only the helper would silently drop exactly the project whose
 * history is the reason this file exists.
 */
function registeredProjects(): ReadonlySet<string> {
  const source = readFileSync(VITEST_CONFIG, 'utf8');
  const viaHelper = [...source.matchAll(/project\('([a-z-]+)'/gu)].map((m) => m[1] as string);
  const viaName = [...source.matchAll(/name: '([a-z-]+)'/gu)].map((m) => m[1] as string);
  return new Set([...viaHelper, ...viaName]);
}

/** Every `--project <name>` the workflow's leg matrix names. */
function legProjects(): ReadonlySet<string> {
  const source = readFileSync(WORKFLOW, 'utf8');
  const matrix = source.slice(source.indexOf('include:'), source.indexOf('    steps:'));
  return new Set([...matrix.matchAll(/--project (\S+)/gu)].map((m) => m[1] as string));
}

describe('the suite legs and the vitest projects are the same set', () => {
  it('gives every registered project a leg', () => {
    const missing = [...registeredProjects()].filter((p) => !legProjects().has(p)).sort();
    expect(
      missing,
      'a vitest project that no leg of ci.yml names. It would run nowhere, and every check would ' +
        'stay green while it did — which is the whole cost of splitting one `npm test` into five ' +
        'named commands. Add a leg to the matrix, or say in the workflow why this project is ' +
        'deliberately unrun.',
    ).toEqual([]);
  });

  it('names no project that does not exist', () => {
    const unknown = [...legProjects()].filter((p) => !registeredProjects().has(p)).sort();
    expect(
      unknown,
      'a leg naming a project vitest does not register. `--project <typo>` selects nothing, and ' +
        'with `passWithNoTests: true` set per project that leg would exit 0 having run nothing.',
    ).toEqual([]);
  });

  it('refuses an empty selection rather than passing it', () => {
    // The COMMAND, never the file. Written the obvious way first — `source.includes(...)` over the
    // whole workflow — and mutation-testing caught it: the step's own comment explains why the flag
    // is load-bearing, so deleting the flag from the command left the string in the prose and this
    // clause stayed green. A guard that reads its own documentation cannot fail, which is the
    // defect this repository tracks above all others, reproduced inside the instrument built to
    // prevent it.
    const source = readFileSync(WORKFLOW, 'utf8');
    const command = source
      .split('\n')
      .filter((line) => line.trimStart().startsWith('run:') && line.includes('vitest run'))
      .join('\n');
    expect(
      command,
      'no `run:` line in ci.yml invokes `vitest run`, so this clause is checking nothing. Either ' +
        'the suite stopped invoking vitest directly or the step was reshaped; read the workflow.',
    ).not.toBe('');
    expect(
      command.includes('--passWithNoTests=false'),
      'ci.yml runs vitest by project name without `--passWithNoTests=false`. Every project in ' +
        'vitest.config.ts sets `passWithNoTests: true`, so a mistyped or removed project makes the ' +
        'leg exit 0 having executed nothing, which reads in the Actions tab exactly like a pass.',
    ).toBe(true);
  });
});
