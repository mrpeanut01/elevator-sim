/**
 * **The dead-code audit for `tuning/`, as a test.**
 *
 * The mirror of `packages/core/src/dispatch/deadCode.test.ts`, extended to the module that turned
 * out to need it most. That file audits `core/src/dispatch/{policies,predictor}` and, being a
 * `packages/core` test, *cannot see `packages/experiments` at all* — so when the whole of Phase 7
 * shipped with no non-test caller anywhere, the mechanical guard was structurally incapable of
 * noticing (docs/08-review-findings.md § 1). This file closes that.
 *
 * It asks the cheap question the project keeps failing to ask: **"does anything call this
 * symbol?"** Not *"is it exported?"*, not *"is it tested?"*, not *"is it reachable?"* — all three
 * were true of all six dead behaviours.
 *
 * ## What counts as a caller
 *
 * Only a real `import` (or a re-`export … from`) binding — never a bare textual match. Half the
 * "callers" a grep reports for these modules are `{@link}` tags in docstrings, which is precisely
 * how a symbol reads as connected while being dead. `callers.test-helper.ts` holds the scanner.
 *
 * A symbol is **live** when any of these holds:
 *
 * - it is used inside its own defining file;
 * - a sibling file in the same module imports it;
 * - anything outside the module imports it — `runner/`, `benchmark/`, `cli/`.
 *
 * Re-export through a barrel is deliberately **not** a caller, and neither is a `*.test.ts` or a
 * `*.test-helper.ts`. "Every caller was one of its own tests" is the literal description of the
 * fifth instance, and "the barrel names it" was true of all six.
 *
 * ## What the allowlist is for, and why it cannot rot
 *
 * A symbol with no caller is not automatically a bug. `tuning/` is a **library**: it is written to
 * be driven by an experiment or a command that varies with the study, and a good deal of its
 * surface is there so that a study need not reimplement it. {@link PUBLIC_API_ONLY} names each such
 * export **with the reason it has no caller**, so the claim is recorded rather than assumed.
 *
 * The list is asserted in **both** directions. An entry whose symbol has since acquired a caller,
 * or has been deleted, fails too — otherwise the allowlist becomes the place dead code goes to be
 * forgotten, which is the failure one step removed from the one this file exists to catch.
 */

import { basename, dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PACKAGES_DIR, code, corpus, isBarrel, isTest } from './callers.test-helper.js';

/** The three modules Phase 7 landed. docs/05-roadmap.md § Phase 7 names exactly these. */
const AUDITED_MODULES = [
  'experiments/src/tuning/search',
  'experiments/src/tuning/space',
  'experiments/src/tuning/report',
] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Keyed `module/symbol` so two modules may export the same name. Every entry is a claim that the
 * symbol is **library surface for a study that does not exist in this repository** — not a claim
 * that it is unimportant, and emphatically not a place to park something that should have been
 * wired.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
  /*
   * -- The optimizer's own schema (CLAUDE.md invariant 8). Same shape of claim as `core`'s
   * `POLICY_PARAMETER_IDS`: the consumer is a meta-optimizer that tunes the tuner, which does not
   * exist. Shipping the declaration without a way to read it would make invariant 8 unenforceable
   * one level up, and `types.test.ts` derives this list from SEARCH_DEFAULTS so it cannot drift.
   */
  'search/SEARCH_PARAMETERS': 'the search’s own tunable schema; its reader is a meta-optimizer',

  /*
   * -- Plateau reporting rather than plateau detection. `runRound` needs the *count* of distinct
   * outcomes and calls `countDistinctOutcomes`; `plateauClasses` returns the groups themselves,
   * which is what a report showing *which* candidates collapsed together would print. Nothing
   * prints that today: `SearchRound` carries the count, and `tune` prints the count.
   */
  'search/plateauClasses': 'the groups behind the count the round already carries; for a report',

  /*
   * -- Space introspection. Three accessors over a collected `SearchSpace`, for a caller that
   * wants to *describe* the space rather than draw from it — a `list --parameters` command, a
   * generated doc. The shipped path draws (`sampleCandidate`) and merges (`candidateFromProfile`),
   * and needs none of them; `tune --params` validates against `space.byId` directly, which is the
   * same map `parameterOf` wraps.
   */
  'space/activeParameters': 'space introspection: which dimensions a point leaves gated on',
  'space/parameterOf': 'space introspection: one row by id; a one-line wrapper over space.byId',
  'space/defaultCandidate': 'space introspection: the declared defaults as a point',

  /*
   * -- Two draws the shipped searches do not make.
   *
   * `sampleCandidates` is the plural of `sampleCandidate`; `randomSearch` and `successiveHalving`
   * take their pool through the `CandidateSampler` port one draw at a time, because the port is
   * singular on purpose — a search must not be able to ask a space for its own batching.
   *
   * `perturbCandidate` is a *local* move, and none of the three shipped methods takes one: random
   * search draws independently, the ladder re-samples, and sep-CMA-ES moves in the real-vector
   * embedding through `fromVector`. It is the seam a future local-search or simulated-annealing
   * method would enter through, and it is the one entry here whose docstring is load-bearing on
   * its own account — it is where the measured plateau widths per section are written down.
   */
  'space/sampleCandidates': 'the plural draw; the CandidateSampler port is singular on purpose',
  'space/perturbCandidate': 'a local move; none of the three shipped methods takes one',

  /*
   * -- The named stream, for a caller that draws directly.
   *
   * CLAUDE.md invariant 2 says every draw comes from a named stream of an injected `StreamSet`,
   * and this is that stream for `tuning/space`. The shipped path gets the same stream from the
   * other side — `searchRng`'s `SEARCH_STREAM` is the string `'policyNoise'`, and
   * `round.test.ts` pins that the two agree — so a search never needs to build one. A study that
   * samples the space without running a search does.
   */
  'space/policyNoiseStream': 'the named RNG stream for a caller that draws without a search',

  /*
   * -- Deliberately weaker than what the report uses, and kept as the direct question.
   *
   * `accountSeedSets` does **not** call this: leakage is a property of the round rather than of an
   * arm, so it intersects the *union* of every arm's tuning seeds against the union of every arm's
   * holdout seeds (`seedLeaksOf`). That is strictly stronger — the pairwise form passes a
   * construction where one arm's "holdout" seeds are another arm's tuning seeds. This is the
   * pairwise question asked directly, and any caller reaching for it should read that docstring
   * first. It is on the list rather than deleted because deleting it is a change to a module this
   * task was told not to rewrite; it is the one entry here that is a live candidate for removal.
   */
  'report/sharedSeedsOf': 'the pairwise intersection; the report uses the stronger round-wide union',

  /*
   * -- The front without the statistics. `statisticalParetoFront` is what a report may use: it
   * decides dominance on paired intervals, so a difference inside the noise floor cannot exclude a
   * candidate. `paretoFrontOfPoints` decides it on point estimates, which is exactly the ranking
   * CLAUDE.md § Statistical discipline forbids in a report — it exists as the arithmetic the
   * statistical version is defined against, and as the front a caller who already holds converged
   * means can compute. `basis: 'pointwise'` on the result is what marks the difference.
   */
  'report/paretoFrontOfPoints': 'the pointwise front; a report must use the paired-interval one',

  /*
   * -- Vocabulary. The two roles as data, so a caller iterating both sets does not write the two
   * strings out. `holdoutRoundSpec` takes a `SeedSetRole` and is called once per role, by name,
   * from `runHoldoutRound` — two call sites rather than a loop, because the two roles differ in
   * which seed they use and a loop over them would have to reintroduce that distinction anyway.
   */
  'report/SEED_SET_ROLES': 'the two seed-set roles as data; the driver names both explicitly',
});

/* -------------------------------------------------------------------------- *
 * Scanning
 * -------------------------------------------------------------------------- */

/**
 * One exported declaration, at the start of a line.
 *
 * `core`'s copy of this pattern has no `async` alternative, because nothing in
 * `dispatch/{policies,predictor}` is asynchronous. Three of the five entry points this file exists
 * to protect are — `randomSearch`, `successiveHalving`, `sepCmaEs` and `runHoldoutRound` are all
 * `export async function` — so the pattern is **widened** here rather than copied. It is worth
 * saying out loud: a scanner that silently skips the symbols the file was written for is the same
 * class of defect as the one it audits, and the first assertion below names those symbols
 * explicitly so that this cannot regress quietly.
 */
const EXPORTED =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

interface Symbol_ {
  readonly key: string;
  readonly name: string;
  readonly file: string;
}

interface Audit {
  readonly symbols: readonly Symbol_[];
  readonly uncalled: readonly Symbol_[];
}

function audit(): Audit {
  const scope = corpus();
  const all = scope.files;

  const symbols: Symbol_[] = [];
  for (const [moduleRelative, moduleDir] of AUDITED_MODULES.map(
    (m) => [m, join(PACKAGES_DIR, m)] as const,
  )) {
    const short = basename(moduleRelative);
    for (const path of all) {
      if (dirname(path) !== moduleDir || isTest(path) || isBarrel(path)) continue;
      const seen = new Set<string>();
      for (const line of scope.text(path).split('\n')) {
        const name = EXPORTED.exec(line)?.[1];
        if (name === undefined || seen.has(name)) continue;
        seen.add(name);
        symbols.push({ key: `${short}/${name}`, name, file: relative(PACKAGES_DIR, path) });
      }
    }
  }

  const uncalled = symbols.filter((symbol) => {
    const own = join(PACKAGES_DIR, symbol.file);
    // Used inside its own file? Two occurrences in comment-stripped source: the export and a use.
    const selfUses = (code(scope.text(own)).match(new RegExp(`\\b${symbol.name}\\b`, 'g')) ?? [])
      .length;
    if (selfUses > 1) return false;
    return !all.some((path) => {
      if (path === own || isTest(path) || isBarrel(path)) return false;
      return scope.bindings(path).has(symbol.name);
    });
  });

  return { symbols, uncalled };
}

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of tuning/{search,space,report} has a caller or a stated reason', () => {
  const { symbols, uncalled } = audit();

  it('scans all three modules and finds the exports it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These are the
    // modules' load-bearing entry points and their absence means the walk broke.
    expect(symbols.length).toBeGreaterThan(80);
    for (const key of [
      'search/randomSearch',
      'search/successiveHalving',
      'search/sepCmaEs',
      'search/runnerObjective',
      'space/collectSearchSpace',
      'space/candidateProfile',
      'report/runHoldoutRound',
      'report/buildTuningReport',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the defect this repository has shipped six times — or they are ' +
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
        'forgotten. Delete the entry (the symbol is live, or gone) rather than the assertion',
    ).toEqual([]);
  });

  it('counts a barrel re-export as reachability and never as a caller', () => {
    // The distinction the whole file turns on, asserted against the five entry points
    // docs/08-review-findings.md § 1 names. Every one of them is exported by two barrels
    // (`tuning/<module>/index.ts` and `tuning/index.ts`) and by the package root; before
    // `cli/src/commands/tune.ts` existed, that was the entirety of their "callers" and this
    // assertion would have failed on all five.
    for (const key of [
      'search/randomSearch',
      'search/successiveHalving',
      'search/sepCmaEs',
      'search/runnerObjective',
      'report/runHoldoutRound',
    ]) {
      expect(uncalled.map((symbol) => symbol.key)).not.toContain(key);
    }
  });
});
