/**
 * The opt-in tiers are wired to a workflow — GitHub issue #163,
 * [§ D393](../../../../DECISIONS.md).
 *
 * ## What this exists to stop
 *
 * Nine test tiers in this repository are gated behind an environment variable, and until
 * `.github/workflows/deep-tiers.yml` existed **nothing set any of them, anywhere, ever**. Eighteen
 * tests were text that read as coverage nobody had — including the 20 000-replication collision
 * search, which is the only place a seed derivation is looked at that scale.
 *
 * That is issue #142's defect one directory over. The browser tier was gated on
 * `ELEVATOR_SIM_CHROMIUM`, no workflow named the variable, thirty-eight cases skipped in CI and on
 * every developer's machine, and **a skip is indistinguishable from a pass in the summary line**.
 * What closed #142 was not the workflow step — it was `dev/browserTier.test.ts`, which derives the
 * tier from disk and fails a CI run in which it would skip. This file is that instrument for the
 * other nine tiers, and it is written the same way and for the same reason:
 *
 * > A guard written as *"the workflow must set `ELEVATOR_SIM_DEEP`"* would be the hand-written name
 * > again. The set is derived from disk, so a tenth tier cannot arrive without arriving here.
 *
 * `measure.corpus.test.ts` is the proof that it can happen: it landed in wave F already gated on
 * `CORPUS_OUT`, already carrying a written obligation to be run *"once, after integration"*, and
 * already running nowhere.
 *
 * ## What it does not do, deliberately
 *
 * **It runs no tier and it may not be able to redden the per-PR suite for a tier's failure.** That
 * is the property that made #163 safe to take at all: these tiers are minutes to hours, and
 * `perfScaling.test.ts` documents its own wall-clock flake under concurrent load — *"a gate nobody
 * can trust is a gate everybody overrides"*. Wiring them into `ci.yml` would trade an unrun tier for
 * an untrusted gate.
 *
 * So the split is exact. A tenth gated tier landing **unwired** is a red pull request, here. A
 * gated tier **failing** is a red scheduled run, there. This file asserts wiring and never results,
 * and § 3 below asserts that the workflow keeps no `pull_request:` trigger that could blur that.
 *
 * ## The count, derived rather than remembered
 *
 * `vitest list` reports a `skipIf`-ed suite's children when the gate is open and omits them when it
 * is shut, so the delta between two collections is the tier itself:
 *
 * ```bash
 * npx vitest list > off.txt
 * ELEVATOR_SIM_DEEP=1 ELEVATOR_SIM_FUZZ=deep ELEVATOR_SIM_HONESTY=deep \
 *   CORPUS_TIER=deep CORPUS_OUT=/tmp/corpus.txt npx vitest list > on.txt
 * diff <(sort off.txt) <(sort on.txt)
 * ```
 *
 * Measured 2026-08-29 on `0cd422a`, **before** this lane's own work: eighteen tests, nine gated
 * blocks, nine files. The lane then added a tenth block — `fuzz/deep.test.ts`'s register entry for
 * the counterexample the first run of that tier found — so on this tree the same command would
 * report **nineteen tests, ten blocks, nine files**.
 *
 * **The eighteen is a measurement and the nineteen is arithmetic**, and the difference is stated
 * rather than smoothed over: the first came off a `vitest list` diff, the second is one added case
 * counted by hand. A lane whose subject is figures published without the run behind them does not
 * get to blur those. Issue #163
 * says seventeen and names two variables; both are undercounts, and the second is the one that
 * matters — `ELEVATOR_SIM_FUZZ=deep` is a **third** gate, guarding the 250-case fuzz campaign, so a
 * workflow that set only the two variables the issue names would have left that tier exactly as
 * unrun as it found it while reporting green. That is why {@link TIERS} carries each tier's gate
 * variables and § 2 checks them against the job that runs the file, rather than checking that the
 * workflow mentions two names somewhere.
 *
 * A test count also **understates** the tiers. Four of them widen the tests already there rather
 * than adding new ones: the golden set goes 4 → 6, the honesty corpus 49 → 60 cases,
 * `perfScaling`'s grids widen *and* its printed fits become assertions, and `perfSweep` turns a
 * projection into an executed sweep.
 *
 * ## Detection is over-inclusive on purpose
 *
 * {@link GATE_FORM} is matched against the **raw** source, line-initially, with no comment or string
 * stripping. `dev/browserTier.test.ts`'s stripper is *"deliberately crude and deliberately
 * over-removing"*, and over-removal is the right trade there because a false negative costs one
 * file. Here a false negative is a tier that ran nowhere and nobody was told, which is the whole
 * defect. So the error is taken in the other direction: a `skipIf` inside a docstring would force a
 * spurious {@link TIERS} entry, which is visible, rather than hide a real one, which is not.
 *
 * ## Why this audit lives in `viz` rather than beside the tiers it names
 *
 * It was written in `packages/experiments/src/validation/` and CI refused it — `boundaries.test.ts`,
 * CLAUDE.md **invariant 6**, on three `packages/viz/...` keys in {@link TIERS}. The refusal is right
 * and the fix is not to soften it. Those keys are data rather than imports, but the coupling they
 * create is real: with `viz` absent this file's declared set no longer matches the disk, so the
 * `experiments` suite would fail for want of a package it must be able to build without.
 *
 * Nor could it be dodged by composing the path out of fragments. That would be rephrasing around a
 * grep, which this repository forbids outright — the owed-decision ratchet's own docstring says so
 * in as many words.
 *
 * Deriving **both** sides would remove the offending literals and gut the check with them: the
 * declared set exists precisely so that a tier appearing on disk and nowhere in the workflow is a
 * mismatch. Two derivations agreeing is a tautology.
 *
 * So it moved to the one package that may legitimately know about all of them.
 * `boundaries.test.ts` — the very file that refused it — lives here and walks `core` and
 * `experiments` for exactly this reason: `viz` sits at the top of the dependency graph, so a
 * cross-package audit is at home here and nowhere else.
 *
 * The crude stripper was tried first and it **missed `collectiveAdoption.test.ts`** — an apostrophe
 * inside a template literal opened a bogus single-quoted string that swallowed the gate on line 398.
 * Nine files instead of ten, silently. That is recorded rather than glossed because it is the exact
 * failure mode this file exists to prevent, reproduced in the instrument built to prevent it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'deep-tiers.yml');

/**
 * A gate, as it is written in this repository: `describe.skipIf(`, `it.runIf(` and their relatives,
 * at the start of a line.
 *
 * Line-initial is what separates a gate from a mention of one. Every real gate in the tree is a
 * statement; every prose reference sits behind a `*`, a backtick or a quote — checked over all
 * forty-one files that contain the substring at all.
 */
const GATE_FORM = /^[ \t]*(?:describe|it|test)\.(?:skipIf|runIf)\s*\(/mu;

/** The vitest project a package's non-browser tests run under, keyed by package directory. */
const PROJECT_OF: Readonly<Record<string, string>> = Object.freeze({
  core: 'core',
  experiments: 'experiments',
  server: 'server',
  cli: 'cli',
  viz: 'viz',
});

interface Tier {
  /**
   * Environment variables that open this tier's gate. Every one must be set by the job that runs
   * the file — the whole of #163 is that a variable nobody sets is a tier nobody runs.
   */
  readonly gates: readonly string[];
  /** Why it is scheduled, or why it is not. */
  readonly reason: string;
  /** `false` for a gate that must NOT be turned on by a scheduled run. */
  readonly scheduled: boolean;
}

/**
 * Every non-browser test file on disk that carries a gate, with the variables that open it.
 *
 * Asserted in **both** directions by § 1: a file here that has stopped being gated is as much a
 * failure as a gated file that is not here. An allowlist that keeps an entry after its reason
 * lapses is this repository's own named defect (`runner/deadCode.test.ts`), and the second
 * assertion is what stops it.
 *
 * The **browser** tier's thirty-one files are out of scope and are excluded structurally rather than
 * by name: they are `*.browser.test.ts`, they belong to the `viz-browser` project, `ci.yml`
 * provisions their Chromium on both legs of its matrix, and `dev/browserTier.test.ts` already owns
 * exactly this question for them. Two instruments asserting one thing is how an exemption gets
 * forgotten in the gap between them.
 */
const TIERS: Readonly<Record<string, Tier>> = Object.freeze({
  'packages/experiments/src/benchmark/collectiveAdoption.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason: '§ D209 at its pre-registered replication count; the file documents a four-hour run',
    scheduled: true,
  },
  'packages/experiments/src/benchmark/matrixCensus.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason: 'the 200-replication census every declared matrix ceiling and spread derives from',
    scheduled: true,
  },
  'packages/experiments/src/fuzz/deep.test.ts': {
    gates: ['ELEVATOR_SIM_FUZZ'],
    reason:
      'six properties over the wide space at 250 cases. The gate issue #163 does not name, and ' +
      'the reason this table carries variables per tier rather than a list of two',
    scheduled: true,
  },
  'packages/experiments/src/oracle/deepCampaign.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason: "CLAUDE.md's correctness oracle at full width — every measurable bank",
    scheduled: true,
  },
  'packages/experiments/src/validation/goldenRuns.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason:
      'byte-identical replay at 6 goldens rather than 4, plus the replay from a bare node ' +
      'process. Needs a built tree, which is why its job runs `npm run build` first',
    scheduled: true,
  },
  'packages/experiments/src/validation/perfScaling.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason:
      'the wall-clock fits. The file says they run only where the machine is expected to be ' +
      'quiet, so this is the one tier expected to be noisy on a hosted runner — its own job',
    scheduled: true,
  },
  'packages/experiments/src/validation/perfSweep.test.ts': {
    gates: ['ELEVATOR_SIM_DEEP'],
    reason:
      '20 000 replications and 20 000 distinct trace digests. #163\u2019s acceptance clause — ' +
      '"the seed-collision check has run at least once on main" — is this file and no other',
    scheduled: true,
  },
  'packages/viz/src/honesty/honesty.test.ts': {
    gates: ['ELEVATOR_SIM_HONESTY'],
    reason:
      'the honesty search over the deep corpus, the only tier in which campaign/judge.ts#judgeStage ' +
      'speaks at all',
    scheduled: true,
  },
  'packages/viz/src/honesty/measure.corpus.test.ts': {
    gates: ['CORPUS_OUT', 'CORPUS_TIER', 'ELEVATOR_SIM_HONESTY'],
    reason:
      '§ D343\u2019s measurement: once, after integration, never per branch. Every word of that ' +
      'describes a scheduled run on main and nothing a pull request can do',
    scheduled: true,
  },
  /*
   * The one that must stay off, and the reason it is in this table rather than absent from it.
   *
   * `ELEVATOR_SIM_REGENERATE_GOAL_RATES=1` does not open a tier — it **closes** one. Measured with
   * `vitest list`, setting it *removes* `the published counts reproduce from the code that produced
   * them`, because the file then rewrites the pinned counts instead of checking them. A scheduled
   * run that set every gate variable it could find would silently delete a check and go green.
   *
   * So it is recorded here with `scheduled: false`, and § 2 asserts the workflow does **not** set
   * it. A regeneration flag is not a tier gate with the same shape; it is the opposite polarity, and
   * the only way to keep that straight is to write it down where the next person adding a variable
   * to the workflow will read it.
   */
  'packages/viz/src/scenario/goalRates.test.ts': {
    gates: ['ELEVATOR_SIM_REGENERATE_GOAL_RATES'],
    reason:
      'a regeneration flag, not a tier gate: setting it REMOVES a check rather than adding one, ' +
      'so a scheduled run must never set it',
    scheduled: false,
  },
});

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path, out);
    } else out.push(path);
  }
  return out;
};

/** Every non-browser test file on disk whose source carries a line-initial gate. */
const gatedOnDisk = (): readonly string[] =>
  walk(join(ROOT, 'packages'))
    .filter((path) => path.endsWith('.test.ts') && !path.endsWith('.browser.test.ts'))
    .filter((path) => GATE_FORM.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(ROOT.length).split('\\').join('/'))
    .sort();

const workflow = (): string => readFileSync(WORKFLOW, 'utf8');

/**
 * The workflow's executable `run:` lines that invoke vitest — never its prose.
 *
 * The `run:` prefix is what separates the two, and it was added because the header **documents the
 * defect with a shell transcript**: `# $ npx vitest run --project experiments
 * src/fuzz/doesNotExist.test.ts ; echo $?`. A scan on `includes('vitest run')` alone read that line
 * as a tenth invocation and reported the workflow unguarded. A comment about a failure is not a
 * failure, and an instrument that cannot tell them apart is measuring the prose.
 */
const runLines = (): readonly string[] =>
  workflow()
    .split('\n')
    .filter((line) => /^\s*run:\s/u.test(line) && line.includes('vitest run'));

/**
 * The `(project, file)` pairs the workflow actually runs, read off its `run:` lines.
 *
 * Read off the command rather than off the job name, because the job name is prose and the command
 * is the thing that executes. A job renamed is nothing; a job whose `--project` no longer matches
 * its file runs zero tests and reports green, which is the shape of every defect in this file's
 * docstring.
 */
const invocations = (): readonly { project: string; file: string; line: string }[] =>
  runLines().flatMap((line) => {
    const project = /--project\s+([\w-]+)/u.exec(line)?.[1];
    const file = /\b(src\/[\w./-]+\.test\.ts)\b/u.exec(line)?.[1];
    return project !== undefined && file !== undefined ? [{ project, file, line }] : [];
  });

/**
 * Every environment variable set by any step that runs `file`, unioned.
 *
 * **The union rather than the first match, and that distinction was found by this case rather than
 * designed into it.** `measure.corpus.test.ts` is run *twice* in one job — once for the always-on
 * tier, which needs only `CORPUS_OUT`, and once for the deep tier, which needs three variables. A
 * first-match read saw the always-on step and reported the deep gates unset. § D343's rule is that
 * the pair is what makes either figure mean anything, so a tier whose gates are spread across two
 * steps of one job is the shape this has to accept.
 */
const gatesSetFor = (file: string): readonly string[] => {
  const lines = workflow().split('\n');
  const set = new Set<string>();
  for (const [at, line] of lines.entries()) {
    if (!/^\s*run:\s/u.test(line) || !line.includes('vitest run') || !line.includes(file)) continue;
    /* Walk back to this step's `env:`, stopping at the step boundary (`- name:`). */
    for (let i = at - 1; i >= 0 && !/^\s*-\s+name:/u.test(lines[i] ?? ''); i -= 1) {
      const name = /^\s{6,}([A-Z][A-Z0-9_]*)\s*:/u.exec(lines[i] ?? '')?.[1];
      if (name !== undefined) set.add(name);
    }
  }
  return [...set];
};

describe('§ 1 — the gated tiers are derived from disk, not remembered', () => {
  it('every gated file on disk is in the table, and every entry is still gated', () => {
    expect(gatedOnDisk()).toEqual(Object.keys(TIERS).sort());
  });

  it('found the tiers at all, so an empty derivation cannot pass this file', () => {
    /*
     * The vacuity guard, and it is not decoration: every assertion in § 2 iterates the derived set,
     * so a `GATE_FORM` that matched nothing would leave this whole file asserting that no tier is
     * unwired — which is true of no tiers, and green. Wave F inverted a declaration expecting a
     * check to redden and it did not, because the iterator then skipped the row.
     */
    expect(gatedOnDisk().length).toBeGreaterThanOrEqual(10);
    expect(Object.values(TIERS).filter((tier) => tier.scheduled).length).toBeGreaterThanOrEqual(9);
  });

  it('every gate variable a tier declares is read somewhere in the tree', () => {
    /*
     * The table's own liveness. A variable renamed in the source and not here would otherwise leave
     * § 2 checking that the workflow sets a name nothing reads — a green run about nothing.
     */
    const sources = walk(join(ROOT, 'packages'))
      .filter((path) => path.endsWith('.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const orphans = [...new Set(Object.values(TIERS).flatMap((tier) => tier.gates))].filter(
      (name) => !sources.includes(name),
    );
    expect(orphans, 'these gate variables are declared here and read by nothing').toEqual([]);
  });
});

describe('§ 2 — the scheduled workflow runs every tier, with every gate it needs', () => {
  it('names every scheduled tier, in the project that tier belongs to', () => {
    const ran = new Set(invocations().map((entry) => `${entry.project} ${entry.file}`));
    const missing: string[] = [];
    for (const [path, tier] of Object.entries(TIERS)) {
      if (!tier.scheduled) continue;
      const [, pkg, ...rest] = path.split('/');
      const project = PROJECT_OF[pkg ?? ''];
      expect(project, `no vitest project is known for packages/${String(pkg)}`).toBeDefined();
      const relative = rest.join('/');
      if (!ran.has(`${String(project)} ${relative}`)) missing.push(`${String(project)} ${relative}`);
    }
    expect(
      missing,
      'these gated tiers run in no workflow. A tier nothing opts into is coverage that does not ' +
        'exist — GitHub issue #163, and #142 before it.',
    ).toEqual([]);
  });

  it('sets every gate variable each tier needs, in the step that runs it', () => {
    const unset: string[] = [];
    for (const [path, tier] of Object.entries(TIERS)) {
      if (!tier.scheduled) continue;
      const relative = path.split('/').slice(2).join('/');
      const set = gatesSetFor(relative);
      for (const gate of tier.gates) if (!set.includes(gate)) unset.push(`${relative}: ${gate}`);
    }
    expect(
      unset,
      'the workflow runs these files without setting the variable that opens their gate. That run ' +
        'reports green having executed the always-on half only, which is a skip wearing a pass.',
    ).toEqual([]);
  });

  it('refuses a filter that matches nothing, on every command', () => {
    /*
     * The defect one layer down, and it is measured rather than argued. Every project in
     * `vitest.config.ts` sets `passWithNoTests: true` — correct for a package whose phase has not
     * landed — so a workflow that selects tests *by path* goes green on a typo:
     *
     *     $ npx vitest run --project experiments src/fuzz/doesNotExist.test.ts ; echo $?
     *     0
     *
     * A job that ran nothing and a job whose tests passed are indistinguishable from the Actions
     * tab. `--passWithNoTests=false` makes the same command exit 1 and leaves a real path at 0.
     *
     * This case and the two above catch different things, which is why both exist. They compare
     * names against disk and cannot see a filter that matches nothing for some other reason; this
     * one cannot see a tier that was never named. `vitest.config.ts` itself is deliberately not
     * touched — the flag belongs to the workflow that needs it, and that file has another owner.
     */
    const naked = runLines()
      .filter((line) => !line.includes('--passWithNoTests=false'))
      .map((line) => line.trim());
    expect(
      naked,
      'these commands select tests by path with passWithNoTests left on. A mistyped path exits 0 ' +
        'having run nothing, which is this workflow’s own defect one layer down.',
    ).toEqual([]);
    /* And the guard is not vacuous: there are commands to have found. */
    expect(invocations().length).toBeGreaterThanOrEqual(9);
  });

  it('does not set a flag whose effect is to remove a check', () => {
    const forbidden = Object.entries(TIERS)
      .filter(([, tier]) => !tier.scheduled)
      .flatMap(([, tier]) => tier.gates)
      .filter((name) => new RegExp(`^\\s*${name}\\s*:`, 'mu').test(workflow()));
    expect(
      forbidden,
      'a regeneration flag rewrites the pin it is meant to check. Setting one on a schedule ' +
        'deletes a check and goes green.',
    ).toEqual([]);
  });
});

describe('§ 3 — the workflow keeps the shape that made this safe', () => {
  it('is scheduled, and dispatchable', () => {
    const source = workflow();
    expect(source, 'no schedule: the tiers are opt-in again, and nothing opts in').toMatch(
      /^\s{2}schedule:\s*$/mu,
    );
    expect(source).toMatch(/^\s+-\s+cron:\s*'[^']+'\s*$/mu);
    expect(source, 'workflow_dispatch is how a just-integrated wave asks without waiting').toMatch(
      /^\s{2}workflow_dispatch:/mu,
    );
  });

  it('never runs on a pull request, which is the non-goal made mechanical', () => {
    /*
     * The clause that keeps the split honest. `perfScaling`'s own note — *"a gate nobody can trust
     * is a gate everybody overrides"* — is about a flake, and a flake on a required check is how a
     * suite gets ignored. If a later wave wants these on pull requests, it may; it has to delete
     * this case to do it, and then the decision is on the diff instead of in a trigger list.
     */
    expect(workflow()).not.toMatch(/^\s{2}pull_request:/mu);
  });

  it('surfaces a failure somewhere a person will meet it', () => {
    /*
     * A scheduled run's red X is mailed only to whoever last touched the cron. This repository has
     * already shipped a probe that reported zero because nothing was watching; validated, the same
     * run produced 628 captured errors. So the reporting job is asserted rather than assumed.
     */
    const source = workflow();
    expect(source).toMatch(/^\s{2}report:/mu);
    expect(source).toMatch(/issues:\s*write/u);
    expect(source, 'a failure must reach an issue, not only a job log').toMatch(/gh issue create/u);
    expect(source, 'and must comment on the open one rather than open a second').toMatch(
      /gh issue comment/u,
    );
  });

  it('publishes no corpus figure, because § D343 says a person carries that number', () => {
    /*
     * The corpus job writes an artifact and edits nothing. A workflow that wrote its own measurement
     * into CLAUDE.md would be a pin maintaining itself, and RISKS.md R38's remedy is a derivation
     * with the tree named beside it — which is the half no deriver can do for anybody.
     */
    const source = workflow();
    expect(source).toMatch(/upload-artifact/u);
    expect(source, 'the corpus job must not write to the tree it measured').not.toMatch(
      /git\s+(commit|push)/u,
    );
  });
});
