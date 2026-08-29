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
  /** `undefined` where the project takes vitest's own 5 000 ms — see the timeout suite below. */
  readonly testTimeout: number | undefined;
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
      testTimeout: test['testTimeout'] as number | undefined,
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

/* -------------------------------------------------------------------------- *
 * The simulating project's timeout — GitHub issue #144
 * -------------------------------------------------------------------------- */

/**
 * **A project that runs real simulations may not sit on vitest's 5 000 ms default.**
 *
 * A `DECISIONS.md` number is owed; the argument is § D331 and `vitest.config.ts`'s
 * `SIMULATING_TIMEOUT_MS` docstring.
 *
 * ## Why this clause lives in this file
 *
 * It is a different subject from the browser tier, and it is here anyway because this file already
 * imports `vitest.config.ts`'s **own project array** — the real one vitest runs, with `name`,
 * `root`, `include` and now `testTimeout` resolved. A second file asking the same config the same
 * question through a second reader is the two-answers shape this repository keeps paying for, and
 * the cost of avoiding it is one `describe` in a file whose true subject is *what
 * `vitest.config.ts` declares, and whether the declaration is honest*.
 *
 * ## Why a guard at all, when the fix is one config line
 *
 * Because a config line whose removal is invisible is exactly what issue #142 was about. Delete
 * `testTimeout` from the `viz` project and roughly ninety tests silently return to a ceiling they do
 * not fit under, and nothing goes red until somebody's machine is busy — which is the definition of
 * a flake and the reason #144 was filed in the first place. The floor below turns that deletion into
 * a failure on the commit that makes it.
 *
 * ## Where the floor comes from
 *
 * Measured, not chosen. Over a full `--project viz` run: 3 193 of 3 213 tests finish inside 2.4 s,
 * ten exceed the old 5 s default, and the slowest legitimate test is **49.4 s**. The floor is
 * 120 000 ms — about 2.4× that maximum — rather than the 300 000 the config actually sets, because
 * the two numbers answer different questions. The config's value is *how much headroom this suite
 * wants on a machine hosting several parallel worktrees*; the floor is *the point below which the
 * value has stopped being defensible at all*. Pinning the floor to the config's own number would
 * make this a tautology that fails only when somebody edits the digits, and would go red for a
 * deliberate, well-argued reduction to 200 000.
 *
 * ## What it does not claim
 *
 * That every test in the project needs it, or that the annotated sites are redundant. 113 sites in
 * `packages/viz` set `300_000` explicitly and are deliberately left alone: a site that knows it runs
 * a simulation is allowed to say so, and removing them would make them depend silently on a line in
 * another file.
 */
describe('a project whose tests do not fit the 5 s default declares a timeout they do', () => {
  /**
   * The floor, in milliseconds. See the docstring above for its provenance — it is 2.4× the slowest
   * test measured over a full run, and deliberately below the value the config sets.
   */
  const FLOOR_MS = 120_000;

  /**
   * The projects whose tests do not fit vitest's 5 000 ms default — GitHub issue #149, § D394.
   *
   * `core` and `server` joined `viz` when § D331's open question was answered. The name is kept
   * because § D331 and § D361 both cite the constant it mirrors, and because simulating is what
   * the majority of the covered tests do — but `server`'s membership is **over-determined**, and
   * that is the part worth reading. Four of its thirteen test files reference a simulation entry
   * point; the file that was actually reported failing three times at 5 000 ms under load,
   * `store/store.test.ts`, is **not one of them**. It boots a whole PostgreSQL-in-WebAssembly per
   * fixture. So the pattern this list's own survey is written in would have missed the one file
   * with a reproduction behind it, which is a second argument for the project-level default over
   * anything derived per site.
   *
   * `experiments` and `cli` are absent on purpose: neither has been reported failing at the
   * default, and adding them on the strength of a measurement taken for a different question is
   * the change § D331 refused to make.
   */
  const SIMULATING = ['viz', 'core', 'server'];

  it('gives every listed project room for its slowest test, and not the 5 s default', async () => {
    const projects = await registeredProjects();
    for (const name of SIMULATING) {
      const project = projects.find((entry) => entry.name === name);
      expect(project, `vitest.config.ts registers no project named ${name}`).toBeDefined();
      expect(
        (project as Registered).testTimeout ?? 5_000,
        `the ${name} project holds tests that do not fit vitest's 5 000 ms default under load, so ` +
          'it must not inherit it. Most of them call recordRun, runSimulation or legsOf and pass no ' +
          'timeout of their own; the one file with a reproduced timeout behind it boots a database ' +
          'and calls none of those, which is why this is a project-level default and not a survey. ' +
          'Removing `testTimeout` from this project does not fail here — it fails later, on ' +
          'somebody else’s busy machine, as a flake. See § D331 and § D394.',
      ).toBeGreaterThanOrEqual(FLOOR_MS);
    }
  });

  it('names a project that exists, so the list above cannot rot into a no-op', async () => {
    /*
     * The non-vacuity control, and it is not ceremony: `SIMULATING` is a hand-written list — the one
     * thing § D331 could **not** derive, because "does this project run simulations?" is the
     * question a static check was rejected for being unable to answer. A list that names a renamed
     * or deleted project would pass the case above by iterating nothing, which is precisely how a
     * guard becomes decoration.
     */
    const names = (await registeredProjects()).map((entry) => entry.name);
    expect(SIMULATING.length).toBeGreaterThan(0);
    for (const name of SIMULATING) expect(names, `${name} is no longer a registered project`).toContain(name);
  });
});

/**
 * Every file in the browser tier starts its own Vite dev server, and each one has to say where.
 *
 * ## The trap this guard exists for, stated as it measures rather than as it was reasoned
 *
 * `vite.config.ts` pins `{ port: 5174, strictPort: true }`. A test that passes `server: { port: 0 }`
 * inline does **not** thereby ask for an ephemeral port, and — measured by resolving that exact
 * config and reading it back — it does not lose to the pinned port either. `server.port` resolves
 * to `0` and `strictPort` resolves to `true`: **the inline port wins and `strictPort` is
 * inherited.** Vite then maps `port: 0` onto its own built-in default, `5173`, and `strictPort`
 * turns a busy `5173` into `Port 5173 is already in use` rather than a step to the next free one.
 *
 * So the failure is *refused to serve at all*, not *served somewhere we did not read*. Three files
 * in this directory carry notes describing it the other way round; those notes are wrong on the
 * mechanism and right about the fix, and they are corrected where they sit rather than here.
 *
 * ## Why a derived guard and not four more docstrings
 *
 * The tier has met this four times. Each time one file was repaired and a note was written
 * explaining it — and each note cited `boot.browser.test.ts`, which was itself never repaired,
 * because nothing read any of the notes. It survived CI for months: a CI runner has nothing else
 * on `5173`, so the defect is invisible on exactly the machine the project trusts and fires on
 * exactly the machine a developer uses.
 *
 * A guard that derives the ports from the files is the only version of this that cannot rot. It
 * asserts three things, and the third is the one a fifth encounter would trip:
 *
 * 1. every file in the tier names a port of its own,
 * 2. none of them says `port: 0`,
 * 3. no two of them name the **same** port — which is the collision `strictPort: false` merely
 *    survives rather than prevents, and which would otherwise show up as two servers quietly
 *    sharing one origin and each seeing the other's page.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405. Deriving the ports from the files rather
 * than writing a fifth note is a fact about this tier and is asserted three ways below.
 */
describe('every browser-tier file names a port of its own — the trap this tier has met four times', () => {
  /**
   * `server: { port: <n>, ... }` as the tier actually writes it, across line breaks — **and
   * `preview: { … }` beside it**, which is the tier's second server kind.
   *
   * The `preview` arm landed with GitHub issue #281's `builtBundle.browser.test.ts`, the one file
   * that serves the **built** `dist-web/` rather than source modules. It needs a port for exactly
   * the same reason and collides in exactly the same way, so it is read by the same guard rather
   * than excused from it. `startBuiltSite` takes Vite's own `preview` options as an object for this
   * reason: a port passed as a bare number would be invisible here, and a guard that cannot see a
   * file's port is a guard that file is exempt from.
   *
   * **This widens what the guard reads and weakens none of what it asserts** — every file still
   * names a literal port, still may not say `0`, and still may not share one.
   */
  const PORT = /(?:server|preview):\s*\{[^}]*?\bport:\s*(\d+)/su;

  it('gives every file in the tier a port, and never `port: 0`', async () => {
    const tiers = browserTiers(await registeredProjects());
    expect(tiers.length, 'no browser tier was found, so this guard is watching nothing').toBeGreaterThan(0);

    for (const tier of tiers) {
      for (const path of tier.files) {
        const found = PORT.exec(readSource(path));
        expect(
          found,
          `${shortly(path)} starts a Vite server without naming a port. It will land on Vite's ` +
            'default 5173 and, under the config\'s inherited `strictPort: true`, throw rather than ' +
            'move the moment anything else holds that port.',
        ).not.toBeNull();
        expect(
          Number((found as RegExpExecArray)[1]),
          `${shortly(path)} asks for \`port: 0\`. That does not mean *an ephemeral port*: Vite ` +
            'resolves it to its own default 5173, `strictPort: true` is inherited from ' +
            'vite.config.ts, and the file then fails with `Port 5173 is already in use` for a ' +
            'reason that has nothing to do with what it tests.',
        ).not.toBe(0);
      }
    }
  });

  it('gives no two files the same port', async () => {
    const tiers = browserTiers(await registeredProjects());
    const claimed = new Map<number, string>();

    for (const tier of tiers) {
      for (const path of tier.files) {
        const found = PORT.exec(readSource(path));
        if (found === null) continue;
        const port = Number(found[1]);
        const holder = claimed.get(port);
        expect(
          holder,
          `${shortly(path)} and ${holder} both name port ${port}. \`strictPort: false\` lets the ` +
            'loser move, so this does not fail loudly — it fails quietly, as two servers on one ' +
            'origin serving each other\'s pages.',
        ).toBeUndefined();
        claimed.set(port, shortly(path));
      }
    }

    expect(claimed.size, 'no ports were read, so the two cases above asserted nothing').toBeGreaterThan(0);
  });
});

/**
 * **The page-error gate has one owner, and the choke point is derived** — GitHub issue #268.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405; the argument is `browserTier.test-helper.ts`'s
 * own section docstring, which measures what the tier was blind to. The one-line version: a page could raise an unhandled
 * error on every case and the run stayed green, which is how issue #259 survived four encounters.
 *
 * ## Why this belongs here rather than in the helper
 *
 * The helper collects; it cannot make itself the *only* collector. That is the same asymmetry the
 * clauses above exist for — the gate constants were one importable module for eleven waves before
 * anything checked that every file went through it — so the enforcement lives where the derivation
 * lives, in a project that always runs, reading the tier's files off disk.
 *
 * Three clauses, and the third is the one that stops this becoming *"six copies kept identical by
 * a sentence"* a second time:
 *
 * 1. **Every file that launches a browser opens its pages through `openPage`.** Written this way
 *    round on purpose: *"at least one file uses the helper"* is non-vacuity, and this is coverage.
 *    The set is read off the project like everything else here — *26 of 26 launch a Chromium* is
 *    what it measured when this was written, and is not a number anything below counts from. A
 *    file that launched one and drove no watched page would be a file whose pages throw into
 *    nothing.
 * 2. **No file mints a page itself.** `.newPage(` on any receiver, and `.newContext(` with it —
 *    a context is the other way to reach a `Page`, and closing one door while leaving the other
 *    open is the shape of a guard that reads as total and is not.
 * 3. **No file attaches a `pageerror` listener of its own.** Three files did, and the other
 *    twenty-three had nothing; the three were folded into the shared collector by this issue. A
 *    private listener is not merely redundant — it is a second answer to *what counts as a page
 *    error in this tier*, and the two answers drift in the direction nobody notices, because both
 *    of them are green almost always.
 *
 * Clause 3 reads the **raw** source rather than `code()`, unlike its neighbours: `code()` strips
 * string literals, so `page.on('pageerror', …)` survives it as `page.on(, …)` with the evidence
 * removed. The cost is that a docstring writing that call verbatim would trip the clause, which is
 * a trade worth making in this direction — prose can be rephrased, and a missed second collector
 * cannot be noticed.
 */
describe('the tier collects page errors in one place — GitHub issue #268', () => {
  /** How a tier file gets a `Page` without the helper. Both receivers, both routes. */
  const MINTS_A_PAGE = /\.(newPage|newContext)\s*\(/u;

  /** A collector of its own. Raw source — see the docstring above for why not `code()`. */
  const PRIVATE_COLLECTOR = /\.on\(\s*['"]pageerror['"]/u;

  it('opens every page through the shared collector, in every file that launches a browser', async () => {
    const tiers = browserTiers(await registeredProjects());
    expect(tiers.length, 'no browser tier was found, so this guard is watching nothing').toBeGreaterThan(0);

    let watched = 0;
    for (const tier of tiers) {
      for (const path of tier.files) {
        const source = code(readSource(path));
        if (!source.includes('chromium.launch')) continue;
        expect(
          source.includes('openPage('),
          `${shortly(path)} launches a browser and never calls openPage. Its pages raise their ` +
            'unhandled errors into nothing, which is the state the whole tier was in before ' +
            'GitHub issue #268 — two full runs carrying #259’s throw reported 0 failed. Replace ' +
            '`browser.newPage(…)` with `openPage(browser, …)` from browserTier.test-helper.js; ' +
            'there is nothing else to call, and nothing to remember to assert.',
        ).toBe(true);
        watched += 1;
      }
    }
    expect(
      watched,
      'no file in the tier launches a browser, so this case asserted nothing about any of them',
    ).toBeGreaterThan(0);
  });

  it('lets no file mint a page or a context of its own', async () => {
    const tiers = browserTiers(await registeredProjects());
    const minting: string[] = [];
    for (const tier of tiers) {
      for (const path of tier.files) {
        if (MINTS_A_PAGE.test(code(readSource(path)))) minting.push(shortly(path));
      }
    }
    expect(
      minting,
      'these files reach a page around the tier’s collector. `openPage` in ' +
        'browserTier.test-helper.js takes exactly what `newPage` takes and attaches the listener ' +
        'the gate reads; a page minted any other way throws into nothing and the run stays green.',
    ).toEqual([]);
  });

  it('lets no file keep a page-error collector of its own', async () => {
    const tiers = browserTiers(await registeredProjects());
    const collectors: string[] = [];
    for (const tier of tiers) {
      for (const path of tier.files) {
        if (PRIVATE_COLLECTOR.test(readSource(path))) collectors.push(shortly(path));
      }
    }
    expect(
      collectors,
      'these files listen on `pageerror` themselves. Three did before GitHub issue #268 — ' +
        'boot, dispatcherFamilies and dispatcherStrip — and the other twenty-three had no ' +
        'collector at all, which is the asymmetry that made the tier report green over a throwing ' +
        'page. The shared gate covers every page of every file; a private one is a second answer ' +
        'to the same question, and this repository has paid for that shape before.',
    ).toEqual([]);
  });
});
