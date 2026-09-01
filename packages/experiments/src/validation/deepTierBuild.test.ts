/**
 * A scheduled tier that runs replications runs on a **built** tree — GitHub issue #309,
 * [§ D419](../../../../DECISIONS.md).
 *
 * ## What this exists to stop
 *
 * `.github/workflows/deep-tiers.yml` fired for the first time on 2026-08-30. Its
 * `perf — the 20 000-replication sweep` job went red **in four seconds**, and the sweep it is
 * named for had not started:
 *
 * ```text
 * RunnerError: Worker failed to initialize: Cannot find module
 *   '…/node_modules/@elevator-sim/core/dist/index.js'
 *   imported from …/packages/experiments/src/runner/replication.ts
 * ```
 *
 * The job ran `npm ci` and no build. `npm ci` installs dependencies; it does not run `tsc -b`, so
 * `packages/core/dist` did not exist. Four of that file's five cases passed anyway, because they
 * are serial and vitest resolves `@elevator-sim/core` through the alias in `vitest.config.ts` to
 * core's *source*. The fifth spawns a worker pool, a worker thread is loaded by Node rather than by
 * vitest, and Node resolves the same specifier through `node_modules` to core's **built** output.
 *
 * So the tier existed, was wired, was scheduled, was named in every audit — and had never once run.
 * That is issue #163's own defect surviving the workflow written to close it: not a tier nothing
 * opts into, but a tier that opts in and cannot start.
 *
 * ## Why the property is stated per **job** and not per test file
 *
 * The obvious version of this check derives, per tier, whether that tier reaches a worker pool, and
 * requires a build step only for the ones that do. It cannot be written soundly, and the reason is
 * worth keeping:
 *
 * - `RUNNER_DEFAULTS.parallelMode` is `'auto'` and `RUNNER_DEFAULTS.minReplicationsForWorkers` is
 *   64, so a spec that says **nothing at all** about parallelism spawns workers as soon as the
 *   guaranteed work clears that threshold. A tier can need a built tree without containing a single
 *   token a grep could find.
 * - `validation/harness.ts` pins `parallel: { mode: 'serial' }` inside `runGateExperiment`, which is
 *   the only reason the census and the oracle campaign survive an unbuilt tree today. That is a
 *   default three modules away from the tier, and changing it back would silently re-open this.
 * - `validation/goldenRuns.test.ts` needs a built tree for an unrelated reason — it spawns a bare
 *   `node` against `packages/experiments/dist` — so even a perfect worker-pool derivation would
 *   miss it.
 *
 * A derivation that is wrong in the unsafe direction is worse than none: it would report green over
 * exactly the tier it failed to classify. The job-level property has no such gap, it is decidable
 * from the workflow file alone, and a tier added tomorrow inherits it.
 *
 * **The cost is measured**: `npm run build` from a fully cleaned tree is 11.2 s on a 4-core
 * container. Against tiers measured in tens of minutes to four hours that is under a percent, and
 * `ci.yml` already makes the same trade for the always-on suite in the same words — *"building
 * first makes that class of failure impossible rather than merely unlikely, and typechecking is a
 * gate worth having regardless"*.
 *
 * ## Scope, and why it stops at this package
 *
 * Only jobs that invoke `--project experiments` are covered. That is the package whose runner
 * leaves the vitest process — `runner/parallel.ts` on `node:worker_threads`, `goldenRuns.test.ts`
 * on a child `node` — and it is the package this file belongs to. The workflow's two jobs in the
 * other project reach core through vitest's aliases and spawn nothing, so a build step there would
 * be cost with no property behind it. This file does not name them, mechanically or otherwise;
 * CLAUDE.md invariant 6 is why, and `boundaries.test.ts` enforces it.
 *
 * ## What it does not do
 *
 * It runs no tier and reads no result. Like `deepTiers.test.ts` — the sibling audit that asserts
 * every gated tier is *named* by the workflow — this is a claim about wiring only. A tier that is
 * wired, built and **failing** is a red scheduled run, not a red pull request.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'deep-tiers.yml');

const workflowSource = (): string => readFileSync(WORKFLOW, 'utf8');

/** One job of the workflow: its id, and every line of its block, in file order. */
interface Job {
  readonly id: string;
  readonly lines: readonly string[];
}

/**
 * The workflow's jobs, split on the two-space keys **below `jobs:`**.
 *
 * Anchored to `jobs:` rather than matched everywhere, because `on:`'s own children (`schedule:`,
 * `workflow_dispatch:`) sit at the same indent and would otherwise be read as jobs — one of which
 * contains the literal job ids as `choice` options, so the mistake would not even look like one.
 */
const jobsOf = (source: string): readonly Job[] => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  expect(start, 'the workflow has no top-level `jobs:` key').toBeGreaterThanOrEqual(0);

  const jobs: Job[] = [];
  let current: { id: string; lines: string[] } | undefined;
  for (const line of lines.slice(start + 1)) {
    const id = /^ {2}([A-Za-z][\w-]*):\s*$/u.exec(line)?.[1];
    if (id !== undefined) {
      if (current !== undefined) jobs.push(current);
      current = { id, lines: [] };
    } else current?.lines.push(line);
  }
  if (current !== undefined) jobs.push(current);
  return jobs;
};

/**
 * Executable `run:` lines only — never the prose around them.
 *
 * `deepTiers.test.ts` learned this the expensive way: the workflow header documents its own
 * `--passWithNoTests` defect with a shell transcript, and a scan on `includes("vitest run")` alone
 * counted that comment as an invocation. A `#` comment cannot match `^\s*run:\s`, so the prefix is
 * the whole of the filter.
 */
const isRunLine = (line: string): boolean => /^\s*run:\s/u.test(line);

/** Index of the first line in `job` that runs a vitest command for `--project experiments`. */
const firstExperimentsTierAt = (job: Job): number =>
  job.lines.findIndex(
    (line) =>
      isRunLine(line) && line.includes('vitest run') && /--project\s+experiments\b/u.test(line),
  );

/** Index of the first line in `job` that runs the workspace build. */
const buildStepAt = (job: Job): number =>
  job.lines.findIndex((line) => isRunLine(line) && /npm run build\b/u.test(line));

/** Every job that runs at least one `--project experiments` tier. */
const experimentsJobs = (source: string): readonly Job[] =>
  jobsOf(source).filter((job) => firstExperimentsTierAt(job) >= 0);

describe('§ D419 — every scheduled `experiments` tier runs on a built tree', () => {
  it('found the jobs at all, so an empty derivation cannot pass this file', () => {
    /*
     * The vacuity guard, and it is the case that matters most here: every assertion below iterates
     * the derived set, so a `jobsOf` that returned nothing would leave this file asserting that no
     * job is unbuilt — true of no jobs, and green. `deepTiers.test.ts` records a wave in which
     * exactly that happened: a declaration was inverted expecting a red and the iterator skipped
     * the row instead.
     *
     * **Seven** is the count on the tree this landed on — `fuzz-deep`, `golden-runs`,
     * `oracle-campaign`, `matrix-census`, `collective-adoption`, `perf-sweep`, `perf-scaling`. Six
     * of them gained their build step here; `golden-runs` already had one. It is a floor rather
     * than an equality so that an eighth tier is not a red here on arrival; the ordering case below
     * is what such a tier has to satisfy.
     */
    expect(experimentsJobs(workflowSource()).length).toBeGreaterThanOrEqual(7);
  });

  it('builds before it runs the tier, in every job that runs one', () => {
    const offenders = experimentsJobs(workflowSource())
      .map((job) => ({ job, build: buildStepAt(job), tier: firstExperimentsTierAt(job) }))
      .filter((entry) => entry.build < 0 || entry.build > entry.tier)
      .map((entry) =>
        entry.build < 0
          ? `${entry.job.id}: runs an experiments tier and never runs \`npm run build\``
          : `${entry.job.id}: runs \`npm run build\` after its tier, not before`,
      );

    expect(
      offenders,
      'a worker thread and a child process both resolve @elevator-sim/* through node_modules to ' +
        'built output, while vitest resolves the same specifiers to source. `npm ci` does not ' +
        'build. A tier in one of these jobs dies at spawn with `Cannot find module ' +
        '…/core/dist/index.js` before it runs anything — GitHub issue #309.',
    ).toEqual([]);
  });

  it('reads the workflow rather than a copy of it, and the file is where it is expected', () => {
    /*
     * Liveness for the two constants this file depends on. A workflow renamed or moved would make
     * `readFileSync` throw rather than pass, but a workflow whose jobs no longer parse at two-space
     * indent would degrade quietly into the vacuous state above — so the shape is asserted here
     * instead of assumed by the cases that use it.
     */
    const source = workflowSource();
    expect(source).toMatch(/^jobs:\s*$/mu);
    expect(jobsOf(source).map((job) => job.id)).toContain('perf-sweep');
  });
});
