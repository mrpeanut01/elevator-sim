/**
 * **A tier that skips everywhere may not report as absence-of-failure** — GitHub issue #142, part 3.
 *
 * ## The defect, which is about the suite and not about the product
 *
 * `vitest.config.ts` registers a `viz-browser` project which, on `main` at `69bff59`, held six files
 * and thirty-eight cases — and **ran nowhere**: `.github/workflows/` named neither
 * `ELEVATOR_SIM_CHROMIUM` nor Playwright, `npm test` is a plain `vitest run`, and the variable is
 * unset by default on a developer's machine as well. Pointed at a local shell and run directly, it
 * came back `3 files failed | 8 tests failed | 30 passed`, and nobody could say for how long.
 *
 * *Six and thirty-eight* is a measurement of one commit and is written here as one. A seventh file
 * was landing on an integration branch while this was being fixed, so **nothing below counts files
 * from a literal** — every number this file reports is read off the project at run time.
 *
 * This is the standing requirement's own shape — *a behaviour that is configured, maintained, and
 * called from no shipped path* — turned on the test suite, which is the one place it hides best,
 * because **green is the expected output** and a skip and a pass render identically in the summary
 * line.
 *
 * **§ D220 asked for this in terms, and mechanised none of it.** Its § 5 clause 4 — the acceptance
 * criterion for the tier, written before a line of it existed — reads *"The browser tier runs in CI
 * and is allowed to be slow, but not to be flaky. A tier that is retried to green is a tier that
 * reports nothing."* The tier ran in no workflow. The clause was prose, the only control anybody
 * built was `dev/main.test.ts`'s registration assertion, and prose that has been ignored is not a
 * control — this repository says so in `dev/main.test.ts` itself, about a different defect, three
 * hundred lines above the assertion in question. So nothing below is a new idea. It is the missing
 * half of a decision that was already made.
 *
 * That registration assertion is worth keeping and is not this: registration catches deletion, and
 * what happened here was rot.
 *
 * ## What this file asserts, and why none of it names `viz-browser`
 *
 * A guard written as *"`ELEVATOR_SIM_CHROMIUM` must be set in CI"* would be the hand-written name
 * this repository keeps finding stale — it passes untouched while a seventh browser file, or a
 * second gated project, goes unrun. So everything below is derived, from two sources that are each
 * the authority for what they answer:
 *
 * 1. **The project list is `vitest.config.ts`'s own object**, imported rather than parsed. The
 *    specifier is built at runtime so `tsc -b` does not try to pull a file outside `rootDir` into
 *    this package's program; vitest transforms it because it is inside the workspace. What comes
 *    back is the array vitest itself runs, with `name`, `root`, `include` and `exclude` already
 *    resolved — not a regex's opinion of them.
 * 2. **The files of each project are its own globs, run against disk.** So a file that matches an
 *    `include` is in the project whether or not anybody remembered this test existed.
 *
 * A project is **the gated tier** here when *any* of its files imports `browserTier.test-helper.ts`,
 * the module that owns the gate — and then *every* one of them is required to. The split matters:
 * identifying on *every* would let a seventh file that copied the gate reclassify the project as not
 * a tier at all, and the guard would report *"nothing is gated"*, which is true and points at the
 * wrong thing. Identifying on *any* keeps the project the tier it obviously is and names the stray
 * file. Nothing here knows the string `viz-browser` except the failure messages, which quote
 * whatever they found.
 *
 * The four assertions:
 *
 * - **Non-vacuity.** Some project is the gated tier. If the tier is deleted, or its gate stops being
 *   one importable module, this guard is watching nothing and says so — which is `main.test.ts`'s
 *   registration check with the *"and it still works the way this guard assumes"* half added.
 * - **The gate has one owner.** Every file of the tier imports the helper, none of them reads
 *   `process.env` itself, every top-level suite hangs off the shared flag, and no file outside the
 *   tier imports the helper. A tier that is half gated is worse than one that is wholly gated: it
 *   reports as *ran*.
 * - **In CI, a gated tier may not be gated off.** `process.env['CI']` is set by GitHub Actions and by
 *   every other runner worth the name, and `ci.yml` provisions a Chromium on **both** legs of the
 *   matrix. So a CI run in which this tier would skip is a red run, naming the project, the files
 *   and the variable. There is deliberately **no opt-out variable**: an environment that cannot host
 *   the tier has to say so by not running `npm test`, which is not a thing anybody does quietly. An
 *   `ELEVATOR_SIM_BROWSER_TIER=optional` escape was considered and refused for the reason
 *   `dispatch/deadCode.test.ts` gives about its own allowlist — the exemption becomes the place the
 *   problem goes to be forgotten.
 * - **Off CI, the skip is published.** Not failed: a missing browser is not a defect in this
 *   repository, and § D220's *"`npm test` staying green without it is a property worth keeping"*
 *   still holds. It is *said*, once, from a project that always runs, with the count of files that
 *   will not run and the command that fixes it — rather than six identical warnings from six files
 *   that are themselves skipping.
 *
 * ## What it deliberately does not claim
 *
 * It does not claim the tier **executed**. A test cannot see another project's results, and the two
 * routes that could — a custom reporter, or a `globalSetup` teardown — both turn *"did this run?"*
 * into a question about vitest's reporting API rather than about the repository. What is checked is
 * the **precondition**, which is the thing that was actually false for eleven waves: the gate was
 * shut and nothing said so. A tier that is gated open and then fails, fails loudly on its own.
 *
 * It also says nothing about `ELEVATOR_SIM_HONESTY=deep` or the `experiments` deep tier. Those widen
 * a project that already runs; a suite of theirs that skips leaves its file reporting other cases.
 * The property here is narrower and is the one that hid: a **whole registered project** contributing
 * nothing.
 */

import { globSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  CHROMIUM_ENV,
  HAS_BROWSER,
  SKIP_REASON,
} from './browserTier.test-helper.js';
import { code, readSource, sourceFiles } from '../deadCode.test-helper.js';

/** The basename every file of a gated tier must import. Not a path: the importers are relative. */
const GATE_MODULE = 'browserTier.test-helper';

/** The repository root, from this file. */
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** One registered vitest project, reduced to the four fields this file reasons about. */
interface Registered {
  readonly name: string;
  readonly root: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/**
 * The projects vitest runs, from vitest's own config object.
 *
 * The specifier is assembled at runtime on purpose. A literal `import '../../../../vitest.config.js'`
 * would put a file outside `packages/viz/src` into this package's TypeScript program, and every
 * package here sets `rootDir: "src"` — `tsc -b` refuses it under project references. A dynamic
 * import of a computed specifier is untyped by construction, which is why the shape is validated
 * below rather than asserted by a cast.
 */
async function registeredProjects(): Promise<readonly Registered[]> {
  const url = new URL('../../../../vitest.config.ts', import.meta.url).href;
  const loaded: unknown = await import(url);
  const projects = (loaded as { default?: { test?: { projects?: unknown } } }).default?.test
    ?.projects;
  expect(
    Array.isArray(projects),
    'vitest.config.ts no longer exports `test.projects` as an array — this guard derives every ' +
      'claim it makes from that list and is now deriving them from nothing',
  ).toBe(true);
  const list = (projects as readonly unknown[]).map((entry) => {
    const test = (entry as { test?: Record<string, unknown> }).test ?? {};
    return {
      name: String(test['name'] ?? ''),
      root: String(test['root'] ?? ''),
      include: (test['include'] as readonly string[] | undefined) ?? [],
      exclude: (test['exclude'] as readonly string[] | undefined) ?? [],
    };
  });
  for (const project of list) {
    expect(
      project.name !== '' && project.root !== '' && project.include.length > 0,
      `a registered project came back without a name, a root or an include: ${JSON.stringify(project)}`,
    ).toBe(true);
  }
  return list;
}

/**
 * This file, which is the one importer of the gate that is **not** in the tier.
 *
 * Excluded from every project's file list below, and the exclusion is load-bearing rather than
 * tidy: it imports `browserTier.test-helper.ts` in order to read the gate's own value, so without
 * this the `viz` project would be classified as a tier the gate reaches, and the clause that names
 * ungated files would name all 134 of `viz`'s others.
 */
const SELF = fileURLToPath(import.meta.url);

/** The test files a project actually collects, by its own globs against disk. */
function filesOf(project: Registered): readonly string[] {
  const included = new Set(globSync([...project.include], { cwd: project.root }));
  for (const path of globSync([...project.exclude], { cwd: project.root })) included.delete(path);
  return [...included]
    .sort()
    .map((path) => join(project.root, path))
    .filter((path) => path !== SELF);
}

/** Whether a file hangs its suites off the one module that owns the gate. */
function importsTheGate(path: string): boolean {
  return new RegExp(`from '[^']*${GATE_MODULE}\\.js'`, 'u').test(readSource(path));
}

interface Tier {
  readonly project: Registered;
  readonly files: readonly string[];
  /** The ones that do not import it — empty on a healthy tier, and named when it is not. */
  readonly ungated: readonly string[];
}

/**
 * Every project the gate reaches, identified by **any** of its files importing it.
 *
 * Deliberately *any* rather than *every*, and the difference is about which failure a reader gets.
 * Under *every*, a seventh browser file that copied the gate instead of importing it would stop the
 * project being recognised as a tier at all — and the guard would report *"no registered project is
 * wholly gated"*, which is true, unhelpful, and points at the wrong thing. Under *any* the project
 * is still the tier it obviously is, and the stray file is named in {@link Tier.ungated} by the
 * clause that exists to name it.
 */
function browserTiers(projects: readonly Registered[]): readonly Tier[] {
  return projects
    .map((project) => {
      const files = filesOf(project);
      return { project, files, ungated: files.filter((path) => !importsTheGate(path)) };
    })
    .filter((tier) => tier.files.length > tier.ungated.length);
}

const shortly = (path: string): string => relative(REPO, path);

describe('a registered vitest project that runs nowhere — GitHub issue #142', () => {
  it('finds a gated tier at all, or this guard is watching nothing', async () => {
    const tiers = browserTiers(await registeredProjects());
    expect(
      tiers.map((tier) => tier.project.name),
      'no registered project has a single file behind `browserTier.test-helper.ts`. Either the ' +
        'browser tier has been deleted — `dev/main.test.ts` should have said so first — or its ' +
        'gate has moved out of that module, in which case every assertion in this file has quietly ' +
        'stopped covering anything.',
    ).not.toEqual([]);
    for (const tier of tiers) {
      expect(
        tier.files.length,
        `the ${tier.project.name} tier collects no files, so every clause below is vacuous of it`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps the gate in one module, and every suite of a gated tier behind it', async () => {
    /*
     * Four clauses. The first is the one a seventh browser file trips, and it is written to say what
     * to do rather than only that something is wrong — because that file will exist: `boot`,
     * `compareLab`, `dispatcherStrip`, `keyboard`, `menu` and `menuExit` each carried a private copy
     * of the gate before issue #142, every copy's docstring said it was *"kept identical"*, and they
     * were — by nobody.
     *
     * **Every file of the tier imports the gate.** A private copy is a file the derivation cannot
     * see, and the derivation is what makes the CI clause below total.
     *
     * **The tier reads no environment of its own.** Importing the helper and then consulting
     * `process.env` anyway would satisfy the clause above while having two gates. Read off `code()`,
     * which strips comments and string literals: the variable's name in a docstring is prose, and
     * `process.env['…']` survives the strip as `process.env[]`, because only what is between the
     * quotes goes.
     *
     * **Every top-level suite is gated.** A file that imported the helper and forgot
     * `describe.skipIf(!HAS_BROWSER)` would go red on every machine without a browser — a red that
     * is not about the product, which is the failure mode § D220 chose skipping to avoid.
     *
     * **Nothing outside a gated tier imports the helper.** A project that runs and is *partly*
     * gated is worse than one that is wholly gated, because it reports as having run.
     */
    const tiers = browserTiers(await registeredProjects());
    const tierFiles = new Set(tiers.flatMap((tier) => tier.files));

    for (const tier of tiers) {
      expect(
        tier.ungated.map(shortly),
        `these files are in the ${tier.project.name} tier and do not import ` +
          '`browserTier.test-helper.ts`. Replace whatever gate they declare with ' +
          "`import { CHROMIUM, HAS_BROWSER } from './browserTier.test-helper.js'` — the module " +
          'carries the same constants and the same reasoning. A private copy is a file this guard ' +
          'cannot see, which is how six of them came to be red for eleven waves.',
      ).toEqual([]);

      for (const path of tier.files) {
        const source = readSource(path);
        expect(
          code(source).includes('process.env'),
          `${shortly(path)} reads the environment itself. The gate is one module — see ` +
            `browserTier.test-helper.ts, which owns ${CHROMIUM_ENV}.`,
        ).toBe(false);
        const loose = [...source.matchAll(/^describe(\.\w+)?\(/gmu)]
          .map((match) => match.index)
          .filter((at) => !source.startsWith('describe.skipIf(!HAS_BROWSER)', at));
        expect(
          loose.length,
          `${shortly(path)} declares a top-level suite that is not ` +
            'describe.skipIf(!HAS_BROWSER). A suite in this tier that is not behind the shared ' +
            'flag goes red on every machine that has no browser, for a reason that is not about ' +
            'the product.',
        ).toBe(0);
      }
    }

    const strays = sourceFiles(join(REPO, 'packages'))
      .filter((path) => !tierFiles.has(path))
      .filter((path) => !path.endsWith(`${GATE_MODULE}.ts`))
      .filter((path) => !path.endsWith('browserTier.test.ts'))
      .filter(importsTheGate);
    expect(
      strays.map(shortly),
      'these files import the browser tier’s gate but are not in a project the gate reaches. A ' +
        'project that is half gated reports as having run.',
    ).toEqual([]);
  });

  it('refuses a CI run in which a gated tier would skip', async () => {
    /*
     * The clause that stops the recurrence, and § D220 § 5 clause 4 is what it finally satisfies:
     * *"The browser tier runs in CI and is allowed to be slow, but not to be flaky."* That was the
     * acceptance criterion, written before the tier existed, and it was never met — the tier ran in
     * no workflow at all. What was missing was never the intention; it was a mechanism.
     *
     * Written as a conditional failure rather than as a skipped case, so that reading the run tells
     * you which of the two states you are in. `ci.yml` installs a Chromium and exports
     * `ELEVATOR_SIM_CHROMIUM` on **both** legs of the matrix, so there is no leg on which this is
     * expected to be shut, and therefore no allowlist.
     */
    const tiers = browserTiers(await registeredProjects());
    if (process.env['CI'] === undefined || HAS_BROWSER) return;
    const named = tiers
      .map((tier) => `${tier.project.name} (${String(tier.files.length)} files)`)
      .join(', ');
    expect.fail(
      `this is CI and the browser tier would skip: ${named}. ${CHROMIUM_ENV} points at ` +
        `${CHROMIUM}, which does not exist. .github/workflows/ci.yml is supposed to install a ` +
        'Chromium and export that variable before `npm test`; if that step was removed, restore it ' +
        'rather than relaxing this check — GitHub issue #142 is what an unrun tier costs.',
    );
  });

  it('publishes the skip when there is no browser, from a project that always runs', async () => {
    /*
     * The half that is not a failure. Off CI a missing browser is ordinary, and § D220's decision
     * that `npm test` stays green without one is kept — what changes is that the skip is *said* by a
     * project that ran, with the count of files it covers, rather than inferred from one warning per
     * file emitted by files that are themselves skipping.
     *
     * The count is read off the tier rather than written down. A literal here would be stale the
     * next time a browser file lands, which is a thing that happens: this branch measured six, and
     * a lane running beside it was adding a seventh.
     */
    if (HAS_BROWSER) {
      expect(SKIP_REASON).toContain(CHROMIUM);
      return;
    }
    const tiers = browserTiers(await registeredProjects());
    const files = tiers.reduce((total, tier) => total + tier.files.length, 0);
    console.warn(
      `${SKIP_REASON} ${String(files)} file(s) in ` +
        `${tiers.map((tier) => tier.project.name).join(', ')} will not run on this machine. ` +
        'npx playwright-core install chromium, then export the path it reports.',
    );
    expect(SKIP_REASON).toContain(CHROMIUM_ENV);
    expect(SKIP_REASON).toContain(CHROMIUM);
  });
});
