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
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * The `guards` job and the `viz` shards, § D1084.
 *
 * `guards` re-runs a hand-written list of files on a runner of its own so that their reds arrive in
 * minutes. A hand-written list is the thing this file exists to distrust, and it is accepted there
 * for one reason: every file on it also runs in its own project's leg, so a stale entry costs speed
 * and never coverage. The one failure that reason does not cover is a path that names nothing,
 * because vitest ignores a filter that matches no file whenever another filter matches, so the job
 * would stay green having quietly dropped that guard. These cases close that, and pin the two
 * properties the ruleset leans on: `suite (linux)` waits for `guards`, and a leg still reports under
 * the name `viz` while `viz` is a required check.
 */
describe('the guards job and the sharded viz leg — § D1084', () => {
  const source = (): string => readFileSync(WORKFLOW, 'utf8');

  /** The `run:` line of the guards job, which is the only command in the file naming test files. */
  const guardsCommand = (): string => {
    const text = source();
    const start = text.indexOf('\n  guards:\n');
    expect(start, 'ci.yml has no `guards` job').toBeGreaterThan(0);
    const end = text.indexOf('\n  suite:\n', start);
    const job = text.slice(start, end < 0 ? undefined : end);
    const line = job
      .split('\n')
      .find((l) => l.trimStart().startsWith('run:') && l.includes('vitest run'));
    expect(line, 'the guards job no longer runs vitest on a single `run:` line').toBeDefined();
    return line as string;
  };

  it('names only files that exist, each in a project the same command selects', () => {
    const command = guardsCommand();
    const projects = new Set([...command.matchAll(/--project (\S+)/gu)].map((m) => m[1] as string));
    const files = [...command.matchAll(/(packages\/\S+\.test\.ts)/gu)].map((m) => m[1] as string);
    expect(
      files.length,
      'the guards job names no test file, so it would run its projects whole',
    ).toBeGreaterThanOrEqual(9);
    const missing = files.filter((file) => !existsSync(join(ROOT, file)));
    expect(
      missing,
      'the guards job names files that do not exist; vitest drops a filter that matches nothing',
    ).toEqual([]);
    const unselected = files.filter((file) => {
      const pkg = /^packages\/([a-z]+)\//u.exec(file)?.[1] ?? '';
      const project = file.endsWith('.browser.test.ts') ? `${pkg}-browser` : pkg;
      return !projects.has(project);
    });
    expect(
      unselected,
      'the guards job names files in a project its `--project` flags do not select',
    ).toEqual([]);
    expect(command.includes('--passWithNoTests=false')).toBe(true);
  });

  it('is a job `suite (linux)` waits for and reads the result of', () => {
    const text = source();
    const suite = text.slice(text.indexOf('\n  suite:\n'));
    expect(suite, '`suite (linux)` no longer needs the guards job').toMatch(
      /^\s+needs: \[legs, guards\]\s*$/mu,
    );
    expect(suite, '`suite (linux)` needs the guards job and never reads its result').toContain(
      'needs.guards.result',
    );
    expect(suite).toContain('needs.legs.result');
  });

  it('keeps a leg called `viz` while the ruleset requires one, and shards the viz project once each', () => {
    const text = source();
    const matrix = text.slice(text.indexOf('include:'), text.indexOf('    steps:'));
    expect(matrix, 'no leg is named `viz`; the main-baseline ruleset requires that check').toMatch(
      /^\s+- leg: viz\s*$/mu,
    );
    const shards = [...matrix.matchAll(/--project viz --shard=(\d+)\/(\d+)/gu)].map((m) => ({
      index: Number(m[1]),
      of: Number(m[2]),
    }));
    const total = shards[0]?.of ?? 0;
    expect(total, 'the viz project is not sharded').toBeGreaterThan(1);
    expect(
      shards.every((shard) => shard.of === total),
      'the viz shards disagree on how many there are',
    ).toBe(true);
    expect(
      shards.map((shard) => shard.index).sort((a, b) => a - b),
      'a viz shard is missing or doubled, so some of its files run nowhere or twice',
    ).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(matrix, 'an unsharded viz leg runs beside the shards').not.toMatch(/--project viz\s*$/mu);
  });
});
