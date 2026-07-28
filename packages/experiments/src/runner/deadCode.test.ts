/**
 * **The dead-code audit for `runner/`.**
 *
 * The third instance of the audit `packages/core/src/dispatch/deadCode.test.ts` started and
 * `tuning/deadCode.test.ts` extended, and the reason it exists is recorded in
 * [`DECISIONS.md` § D116](../../../../DECISIONS.md): `runner/` was audited by **neither**. `core`'s
 * copy cannot see `packages/experiments` at all, and `tuning/`'s `AUDITED_MODULES` names the three
 * Phase 7 modules. So the package's oldest module — the one every study runs through — had no
 * mechanical answer to the roadmap's *name the non-test caller*.
 *
 * The scanner is not copied. It lives once, in `../tuning/callers.test-helper.js`, for the reason
 * § D114 records: `core` had two scanner holes that `tuning/`'s copy had already fixed, and only the
 * package dependency direction forced that duplication. Nothing forces it here.
 *
 * ## What this audit found when first run
 *
 * **86 exports scanned, 7 uncalled** — all seven allowlisted below, each with the reason that makes
 * it correct rather than a defect, and none of them a behaviour that should have been running. Two
 * are worth reading before adding an eighth, because they are the same defect in miniature:
 * `fixedBudgetStoppingRule` and `runReplication` both had docstrings naming a role that this
 * repository fills **another way**. A symbol asserting a shipped role it does not have is how
 * `tuning/` described its own deadness for an entire phase.
 *
 * ## The blind spot this module is where you meet
 *
 * `auditModules` counts a symbol live if its own file uses it more than once. A **dead** symbol
 * calling a sibling in the same file therefore makes that sibling read as live — liveness two hops
 * long, dead at the second. Both known instances are here:
 *
 * | scans green | because | which is called by |
 * |---|---|---|
 * | `halfWidthStoppingRule` | `validation/harness.ts` imports it (a genuinely live module) | …to build `productionStoppingRule`, whose every importer is a test |
 * | `verifyCrnAlignment` | `assertCrnAligned` calls it in `crn.ts` | …and `assertCrnAligned` has no caller at all |
 *
 * Neither is papered over: both are stated in {@link PUBLIC_API_ONLY}, and the third assertion below
 * **pins the first one in code**, so that wiring a study to a stopping rule fails this suite and
 * forces the allowlist entry — and § D116's exemption — to be re-argued rather than silently
 * outgrown. Widening the scanner into a reachability analysis is the wrong fix: *reachable* was true
 * of all nine dead behaviours.
 */

import { describe, expect, it } from 'vitest';

import { auditModules, corpus, nonTestImportersOf } from '../tuning/callers.test-helper.js';

/**
 * Not `runner/**`. `auditModules` takes directories, and `runner/` has no subdirectories today; if
 * one is added it must be named here, which is the same explicitness `tuning/`'s list buys.
 */
const AUDITED_MODULES = ['experiments/src/runner'] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Every entry is a claim that the symbol is **library surface for a consumer that does not exist in
 * this repository** — not that it is unimportant, and emphatically not a place to park something
 * that should have been wired. The list is asserted in both directions.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
  /*
   * -- The plural of a live singular, plus a check the shipped path does not perform.
   * `replicationSeed` is live (`replicationRunner.ts` calls it per replication, twice). The plural
   * adds a cross-batch **collision check**, and since the batch path draws one seed at a time, no
   * shipped run performs it. That is defensible — the docstring's own argument is that at 64 bits a
   * collision "will not happen", so the check is belt-and-braces on a construction that is already
   * sound — but it must be said, not assumed: the loud failure it promises is not armed in a run.
   */
  'runner/replicationSeeds':
    'the plural of the live replicationSeed; its batch collision check is not armed in a run',

  /*
   * -- The throwing form of a check every caller wants un-thrown. `verifyCrnAlignment` is the
   * report, and it is what the Phase 3 gate uses — `nullComparison`, `crippledVariant` and
   * `crnVarianceReduction` all call it. `cli/commands/compare.ts` computes the same comparison
   * inline (`crnStatus`) so it can print `MISMATCH — n of m pairs share a trace digest` rather than
   * throw halfway through a report. Nobody wants the exception, which is why nobody takes it.
   * (`verifyCrnAlignment` scans live only because this dead symbol calls it — see the file header.)
   */
  'runner/assertCrnAligned':
    'the throwing form; the gate suites and the CLI both want the report instead',

  /*
   * -- The `unknown` → `ExperimentSpec` parser, for a spec that arrives as data. There is no
   * experiment-spec JSON in this repository: `data/` holds buildings, profiles and traffic, and
   * every study builds its spec in code (`compare.ts`, `objective.ts`, `harness.ts`). The consumer
   * is a spec file or a UI, and neither exists. Its validation is not thereby untested —
   * `experiment.test.ts` drives it directly, which is what a parser's suite should do.
   */
  'runner/parseExperimentSpec':
    'unknown → ExperimentSpec, for a spec file or a UI; no experiment spec is authored as data',

  /*
   * -- One replication, for a caller that wants exactly one. Its docstring names replaying a stored
   * record as the routine need — and `validation/storedRunReplay.test.ts`, the suite that satisfies
   * Phase 3's fourth acceptance criterion, **does not use it**: it composes `replicationSeed`,
   * `simulationConfigFor` and `runSimulation` itself, because it replays from a stored run rather
   * than from a live plan and so has no `ExperimentPlan` to pass. The stated use case is real and
   * this is not how the repository meets it.
   */
  'runner/runReplication':
    'one replication from a live plan; the stored-run replay gate composes the parts instead',

  /*
   * -- The determinism digest. Compared, never stored: `parallel.test.ts` uses it to prove the
   * executor cannot move a number and `replicationRunner.test.ts` to prove a rerun is identical.
   * Comparison is the whole of its purpose, so a test is its natural and only caller — distinct
   * from `validation/storedRun`'s `runRecordFingerprint`, which is persisted with a run.
   */
  'runner/fingerprintExperiment':
    'a digest whose only use is comparison; two suites compare it, nothing persists it',

  /*
   * -- The named counterpart of the runner's own `undefined` branch, not that branch's
   * implementation: `decide()` handles `rule === undefined` inline. Its docstring used to claim the
   * runner called it. Kept rather than deleted so the shipped default has a name — deleting it
   * would leave the branch anonymous — and corrected rather than kept behind a false claim.
   * DECISIONS.md § D116.
   */
  'runner/fixedBudgetStoppingRule':
    'the shipped default as a value; the runner inlines that branch and never calls it',

  /*
   * -- The runner's own tunable schema (CLAUDE.md invariant 8). The same claim as `tuning/`'s
   * `search/SEARCH_PARAMETERS`: the consumer is a generic optimizer configuring the runner, which
   * does not exist. `experiment.test.ts` derives its assertions from `RUNNER_DEFAULTS`, so the
   * declaration cannot drift from the defaults it declares. Note that this is *why*
   * `runner.acceptableRange` being inert (§ D116) is a latent rather than a realized cost: nothing
   * searches this space, so nothing is currently burning budget on a flat dimension.
   */
  'runner/RUNNER_PARAMETERS': 'the runner’s own tunable schema; its reader is a generic optimizer',
});

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of runner/ has a caller or a stated reason', () => {
  const { symbols, uncalled } = auditModules(AUDITED_MODULES);

  it('scans the module and finds the entry points it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These are the
    // module's load-bearing exports and their absence means the walk broke.
    expect(symbols.length).toBeGreaterThan(60);
    for (const key of [
      'runner/runExperiment',
      'runner/runPlan',
      'runner/planExperiment',
      'runner/replicationSeed',
      'runner/crnCohortsOf',
      'runner/simulationConfigFor',
      'runner/halfWidthStoppingRule',
      'runner/RUNNER_DEFAULTS',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the defect this repository has shipped nine times — or they are ' +
        'deliberate library surface and belong in the allowlist with the reason why',
    ).toEqual([]);
  });

  it('keeps the allowlist honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = Object.keys(PUBLIC_API_ONLY).filter((key) => !uncalledKeys.has(key));
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
      'an allowlist that keeps entries after their reason lapses is where dead code goes to be ' +
        'forgotten, which is this defect one step removed',
    ).toEqual([]);
  });

  /*
   * The two-hop case, pinned in code rather than only in the header above.
   *
   * `halfWidthStoppingRule` is live by the scanner's rule and dead by the roadmap's, and the whole
   * of § D116's exemption rests on the second half of that sentence. If a study ever injects a
   * stopping rule, this fails — which is the point: the exemption's ground is that a rule stops
   * *cells*, so a paired comparison's arms would stop at different `n`. That argument must be
   * re-made, not silently outgrown.
   */
  it('pins the exemption: the composed stopping rule still has no non-test caller', () => {
    const scope = corpus();

    expect(
      nonTestImportersOf(scope, 'halfWidthStoppingRule'),
      'halfWidthStoppingRule’s only non-test importer should be the gate harness',
    ).toEqual(['experiments/src/validation/harness.ts']);

    expect(
      nonTestImportersOf(scope, 'productionStoppingRule'),
      'a study now injects a stopping rule. DECISIONS.md § D116 exempted the port on the ground ' +
        'that a rule stops cells, so a paired comparison’s two arms stop at different n and the ' +
        'shorter arm’s own variance decides how many pairs survive. Re-argue that before ' +
        'updating this assertion',
    ).toEqual([]);
  });
});
