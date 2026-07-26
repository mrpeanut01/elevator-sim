/**
 * **The dead-code audit, as a test.**
 *
 * A companion to `sim/seam.test.ts` and the other half of the same problem. The seam test asks
 * *"does this behaviour reach a run?"* and answers it behaviourally. This one asks the cheaper
 * question the project kept failing to ask at all: **"does anything call this symbol?"**
 *
 * Phase 5 shipped four behaviours that were configured, unit-tested and exported, with **zero
 * callers outside their own module**. Nothing failed. The module suites drove the functions
 * directly, the barrels re-exported them, the schemas round-tripped, and the runs completed. The
 * gap was only ever visible by counting callers, and nobody was counting.
 *
 * ## What counts as a caller
 *
 * Only a real `import` (or a re-`export … from`) binding — never a bare textual match. Half the
 * "callers" a grep reports for this module are `{@link}` tags in docstrings, which is precisely
 * how a symbol can read as connected while being dead.
 *
 * A symbol is **live** when any of these holds:
 *
 * - it is used inside its own defining file (a helper the module's own entry point calls);
 * - a sibling file in the same module imports it;
 * - anything outside the module imports it — `sim/`, `terms/`, `experiments/`, `cli/`.
 *
 * Re-export through a barrel is deliberately **not** a caller. `index.ts` naming a symbol proves
 * only that it is reachable, which is the exact property every one of the four dead behaviours
 * already had.
 *
 * ## What the allowlist is for, and why it cannot rot
 *
 * A symbol with no caller is not automatically a bug: some exports are genuinely public API, aimed
 * at a consumer that does not exist in this repository — a Phase 7 optimizer reading the parameter
 * schema, a report reading a stage-5 result. {@link PUBLIC_API_ONLY} names each one **with the
 * reason it has no caller**, so the claim is recorded rather than assumed.
 *
 * The list is asserted in both directions. An entry whose symbol has since acquired a caller, or
 * has been deleted, fails too — otherwise the allowlist would quietly become the place dead code
 * goes to be forgotten, which is the failure mode one step removed from the one this file exists
 * to catch.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** The monorepo's `packages/` directory. */
const PACKAGES_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/** The modules audited. Both are Phase 5's, and both are where the four dead behaviours lived. */
const AUDITED_MODULES = ['core/src/dispatch/policies', 'core/src/dispatch/predictor'] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Keyed `module/symbol` so two modules may export the same name. Every entry is a claim that the
 * symbol is **public API for a consumer outside this repository or outside this phase** — not a
 * claim that it is unimportant.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
  // -- Stage 5 result accessors. The monitor returns a CapacityReassignmentResult; these read it.
  // The simulation counts crossings/migrations/held itself off the same result, so it needs none
  // of them, but a report or a Phase 7 objective over stage 5 does.
  'policies/consideredCalls': 'reads a CapacityReassignmentResult; for reports, not for the run',
  'policies/hasMigrations': 'reads a CapacityReassignmentResult; for reports, not for the run',
  'policies/heldBy': 'reads a CapacityReassignmentResult; for reports, not for the run',
  'policies/peakReassignments': 'reads a CapacityReassignmentResult; for reports, not for the run',

  // -- Parking-plan accessors, same shape of claim.
  'policies/parkingFloorIds': 'reads a preposition plan; for reports, not for the run',

  /*
   * The bank-level plan. `Simulation.#park` is called **per car**, not per bank, so it resolves
   * the bank context once (`resolvePrepositionContext`) and derives each car's context from it
   * (`repositionContextFor`) — which is this function's body, unrolled across several calls so the
   * forecast is taken once. Both halves are live; the convenience wrapper over them is not, and
   * cannot be without making the run take a forecast per car.
   */
  'policies/prepositionPlan': 'the per-bank wrapper; the run calls its two halves per car instead',

  // -- Not a predictor and deliberately not called one: a forecast source over fixed weights, for
  // a caller that already knows its demand. The shipped runs all build an ArrivalModel instead.
  'policies/fixedForecast': 'a forecast source for a caller with a measured histogram, not a model',

  /*
   * A compile-time assertion with no runtime caller by construction: declaring the type forces
   * `tsc` to check that a real DispatcherProfile satisfies AuctionProfileSource, which is what
   * `sim/simulation.ts` relies on when it hands a loaded profile to `createPolicyFor`. Its
   * consumer is the type checker.
   */
  'policies/profileAsPolicySource': 'a compile-time structural assertion; tsc is its consumer',

  // -- Parameter-schema introspection (CLAUDE.md invariant 8). The consumer is Phase 7's generic
  // optimizer, which does not exist yet; shipping the schema without a way to read it would make
  // invariant 8 unenforceable.
  'policies/POLICY_PARAMETER_IDS': 'parameter-schema introspection for a Phase 7 optimizer',
  'policies/policyParameter': 'parameter-schema introspection for a Phase 7 optimizer',
  'predictor/PREDICTOR_PARAMETER_IDS': 'parameter-schema introspection for a Phase 7 optimizer',
  'predictor/predictorParameter': 'parameter-schema introspection for a Phase 7 optimizer',
  'predictor/predictorParameterValue': 'parameter-schema introspection for a Phase 7 optimizer',
  'predictor/tunablePredictorPathsOf': 'parameter-schema introspection for a Phase 7 optimizer',
});

/* -------------------------------------------------------------------------- *
 * Scanning
 * -------------------------------------------------------------------------- */

function sourceFiles(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // a sibling package that is not checked out is absent, not a failure
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(path);
    }
  };
  visit(root);
  return out;
}

const isTest = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('.test-helper.ts');
const isBarrel = (path: string): boolean => basename(path) === 'index.ts';

/** Named bindings a file imports, or re-exports from elsewhere. Never a bare textual match. */
function boundNames(source: string): ReadonlySet<string> {
  const names = new Set<string>();
  const clause = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  for (const match of source.matchAll(clause)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      if (name !== undefined && name !== '') names.add(name);
    }
  }
  return names;
}

/** Source with block and line comments removed, so a `{@link}` cannot read as a use. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const EXPORTED =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

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
  const all = sourceFiles(PACKAGES_DIR).filter((path) => path.includes(`${'/'}src${'/'}`));
  const sources = new Map(all.map((path) => [path, readFileSync(path, 'utf8')]));
  const bindings = new Map(
    all.map((path) => [path, boundNames(sources.get(path) ?? '')] as const),
  );

  const symbols: Symbol_[] = [];
  for (const [moduleRelative, moduleDir] of AUDITED_MODULES.map(
    (m) => [m, join(PACKAGES_DIR, m)] as const,
  )) {
    const short = basename(moduleRelative);
    for (const path of all) {
      if (dirname(path) !== moduleDir || isTest(path) || isBarrel(path)) continue;
      const seen = new Set<string>();
      for (const line of (sources.get(path) ?? '').split('\n')) {
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
    const selfUses = (code(sources.get(own) ?? '').match(new RegExp(`\\b${symbol.name}\\b`, 'g')) ?? [])
      .length;
    if (selfUses > 1) return false;
    return !all.some((path) => {
      if (path === own || isTest(path) || isBarrel(path)) return false;
      return bindings.get(path)?.has(symbol.name) === true;
    });
  });

  return { symbols, uncalled };
}

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of dispatch/policies and dispatch/predictor has a caller or a stated reason', () => {
  const { symbols, uncalled } = audit();

  it('scans both modules and finds the exports it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These two names
    // are the modules' load-bearing entry points and their absence means the walk broke.
    expect(symbols.length).toBeGreaterThan(40);
    expect(symbols.map((symbol) => symbol.key)).toContain('policies/createPolicyFor');
    expect(symbols.map((symbol) => symbol.key)).toContain('predictor/createArrivalModel');
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the Phase 5 defect, four times over — or they are deliberate ' +
        'public API and belong in the allowlist with the reason why',
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
    // The distinction the whole file turns on. `prepositionPlan` is exported from three barrels
    // and imported by no production file; that is exactly the state all four Phase 5 behaviours
    // were in, and it must not read as live.
    expect(uncalled.map((symbol) => symbol.key)).toContain('policies/prepositionPlan');
    // …while the two halves the run actually calls must read as live, or the audit is inverted.
    expect(uncalled.map((symbol) => symbol.key)).not.toContain('policies/resolvePrepositionContext');
    expect(uncalled.map((symbol) => symbol.key)).not.toContain('policies/repositionContextFor');
    expect(uncalled.map((symbol) => symbol.key)).not.toContain('predictor/createArrivalModel');
    expect(uncalled.map((symbol) => symbol.key)).not.toContain('policies/CapacityReassignmentMonitor');
  });
});
