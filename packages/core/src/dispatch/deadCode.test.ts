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
const AUDITED_MODULES = [
  'core/src/dispatch/policies', 'core/src/dispatch/predictor',
  'core/src/analytical', 'core/src/config', 'core/src/dispatch/terms', 'core/src/kernel',
  'core/src/metrics', 'core/src/model', 'core/src/model/car', 'core/src/physics/doors',
  'core/src/physics/motion', 'core/src/random', 'core/src/sim', 'core/src/traffic',
] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Keyed `module/symbol` so two modules may export the same name. Every entry is a claim that the
 * symbol is **public API for a consumer outside this repository or outside this phase** — not a
 * claim that it is unimportant.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
/* ---- Added 2026-07-31, when the audit was extended from two directories to fourteen ---- */

/*
 * **`core` is a library, and that changes what "no caller" proves.**
 *
 * `viz` is an application: an export nothing there reaches is dead, full stop. `core` is imported
 * by `experiments`, `cli` and `viz`, and its published surface is legitimately wider than any one
 * consumer uses. So the entries below are claims that a symbol is **surface** — reachable, typed,
 * and meant to be called from outside — and each is a claim a reader can check, not a shrug.
 *
 * What none of them may be is the Phase 5 defect: a *behaviour* that changes a run, wired to
 * nothing. Every entry here is an accessor, a schema declaration or a formatter — none of them
 * alters a simulation. A behavioural export with no caller belongs in DEAD_CANDIDATES below.
 */

// -- Motion introspection. `travelTime` is the term the cost query calls; these four expose the
// S-curve's interior for plotting and for the oracle's own checks. Surface, not behaviour.
'motion/profileDuration': 'S-curve introspection for plots and the closed-form oracle',
'motion/distanceTravelledAt': 'S-curve introspection for plots and the closed-form oracle',
'motion/speedAt': 'S-curve introspection for plots and the closed-form oracle',
'motion/accelerationAt': 'S-curve introspection for plots and the closed-form oracle',

// -- Distribution helpers. `summarize.ts` computes the reported percentiles through
// `percentileOfSorted`; these are the ergonomic forms a report or a notebook reaches for.
'metrics/median': 'distribution helper on the published surface',
'metrics/percentiles': 'distribution helper on the published surface',
'metrics/fractionAbove': 'distribution helper on the published surface',
'metrics/waitPercentile': 'distribution helper on the published surface',

// -- Invariant 8 schema declarations. Each package declares its tunables so a generic optimizer can
// search without elevator knowledge. `DISPATCH_PARAMETERS` is the one the tuner consumes today;
// the rest are the same contract for parameters no shipped search varies yet. They are data about
// code, and a consumer outside this repository is exactly who they are for.
'analytical/ANALYTICAL_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',
'metrics/METRICS_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',
'car/CAR_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',
'doors/DOOR_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',
'sim/SIM_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',
'traffic/TRAFFIC_PARAMETERS': 'invariant 8 schema; no shipped search varies these yet',

// -- Geometry and state accessors. Each reads a value object the run already has.
'model/directionBetween': 'accessor over two floor indices',
'car/totalMassKg': 'reads a load-sensor reading',
'car/shaftServes': 'reads a car snapshot',
'doors/maxStopSeconds': 'reads a door config',
'doors/doorAccountingAt': 'reads a door machine state',
'traffic/transferFloorsOf': 'reads a building',
'traffic/passengersPer5Min': 'converts a rate; the handling-capacity unit CIBSE reports in',
'traffic/inReportWindow': 'reads a template and an instant',

// -- Documented constants. `CLOSED_FORM_*` are the Barney/CIBSE assumptions and the comparison rule
// the oracle is judged by; `AWT_INVALID_GROUNDS` is the four-ground list § D108 fixed.
'analytical/CLOSED_FORM_ASSUMPTIONS': 'the oracle contract, quoted by docs and asserted by tests',
'analytical/CLOSED_FORM_COMPARISON_RULE': 'the oracle contract, quoted by docs and asserted by tests',
'metrics/AWT_INVALID_GROUNDS': 'the four suppression grounds; consumed as a set by guards',

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
/**
 * A file whose job is to re-export, and which therefore proves reachability rather than use.
 *
 * `index.ts` anywhere, **plus `core/src/browser.ts`** — the package's fs-free entry point, which
 * is the same barrel as `core/src/index.ts` under a different name (`index.ts` is now that file
 * plus `loadConfig`; see `core/src/browser.ts` for why they are split). It is not called
 * `index.ts` and so does not look like a barrel, but it re-exports every public symbol in the
 * package. Counting it as a caller would make all of them read as live — which is the exact
 * confusion this file exists to prevent, and it silently emptied the allowlist the first time
 * the split landed.
 */
const isBarrel = (path: string): boolean =>
  basename(path) === 'index.ts' || path.replace(/\\/g, '/').endsWith('core/src/browser.ts');

/**
 * Does `source` *use* `name` as a value, rather than only passing it through?
 *
 * The refinement that separates a **registry** from a **barrel**, which sharing the filename
 * `index.ts` had collapsed. `dispatch/terms/index.ts` imports all twelve cost terms and puts them
 * in `COST_TERMS`, the array `policy.ts` and `parameters.ts` iterate — the single place the engine
 * learns which terms exist. Excluding it wholesale for being called `index.ts` reported the entire
 * shipped cost-term library as uncalled, which is the opposite of the truth and would have been
 * "fixed" by writing twelve false entries into the allowlist.
 *
 * The original rule is kept exactly where it earned its place: a re-export is still not a caller.
 * So both forms are stripped before looking — `export … from './x.js'` and the bare `export { x }`
 * clause that a two-statement re-export uses — along with the `import` that created the binding.
 * What is left is the file's own code, and a name surviving there is a use.
 */
const usesAsValue = (source: string, name: string): boolean => {
  const body = code(source)
    .replace(/export\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/g, ' ')
    .replace(/export\s*\{[^}]*\}\s*;?/g, ' ')
    .replace(/export\s+\*\s*(?:as\s+\w+\s*)?from\s*['"][^'"]*['"]\s*;?/g, ' ')
    .replace(/import\s+[^;]*?from\s*['"][^'"]*['"]\s*;?/g, ' ');
  return new RegExp(`\\b${name}\\b`).test(body);
};

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

/**
 * Source with comments **and string literals** removed, so that neither a `{@link}` tag nor an
 * error message can read as a use.
 *
 * This file used to strip comments only, and that was a hole wide enough to drive the whole audit
 * through. `predictor/arrivalModel.ts` throws
 *
 * ```ts
 * throw new PredictorError(`createArrivalModel: horizonSeconds must be positive; …`);
 * ```
 *
 * — its own name, inside a template literal, in its own file. Under a comment-only strip those are
 * two further occurrences of `createArrivalModel`, so `selfUses > 1` and the symbol reads as
 * **self-used**: live no matter who imports it, and *unfalsifiably* live. Measured before the fix:
 * deleting both real importers (`sim/simulation.ts` and `experiments/src/benchmark/predictorLag.ts`)
 * left this suite fully green — including the assertion below that names `createArrivalModel` as a
 * symbol that must read live. A guard that cannot fail is not a guard, and naming your function in
 * its own error message is good practice this file must not punish by silently exempting it.
 *
 * Template **interpolations are kept**, because `${runRound(…)}` is code. Everything between the
 * quotes is not. Ported from `experiments/src/tuning/callers.test-helper.ts`, which fixed both
 * holes first; `core` may not import from `experiments`, so the scanner is duplicated rather than
 * shared.
 */
function code(source: string): string {
  let out = '';
  let index = 0;

  /** From an opening quote to its match, contributing nothing. */
  const quoted = (start: number): number => {
    const quote = source[start];
    let position = start + 1;
    while (position < source.length) {
      const char = source[position];
      if (char === '\\') {
        position += 2;
        continue;
      }
      if (char === quote || char === '\n') return position + 1;
      position += 1;
    }
    return position;
  };

  /** From the opening backtick to the matching one, keeping only `${…}` bodies. */
  const template = (start: number): number => {
    let position = start + 1;
    while (position < source.length) {
      const char = source[position];
      if (char === '\\') {
        position += 2;
        continue;
      }
      if (char === '`') return position + 1;
      if (char === '$' && source[position + 1] === '{') {
        let depth = 1;
        let cursor = position + 2;
        const from = cursor;
        while (cursor < source.length && depth > 0) {
          const inner = source[cursor];
          if (inner === '{') depth += 1;
          else if (inner === '}') depth -= 1;
          else if (inner === '`') {
            cursor = template(cursor) - 1;
          } else if (inner === "'" || inner === '"') {
            cursor = quoted(cursor) - 1;
          }
          cursor += 1;
        }
        out += ` ${source.slice(from, Math.max(from, cursor - 1))} `;
        position = cursor;
        continue;
      }
      position += 1;
    }
    return position;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      index = quoted(index);
      out += ' ';
      continue;
    }
    if (char === '`') {
      index = template(index);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * One exported declaration, at the start of a line.
 *
 * The `async` alternative is **not** decoration. Without it, `export async function foo` matches
 * nothing at all, so every asynchronous export of an audited module is silently *never scanned* —
 * it can neither be reported dead nor appear in the allowlist, and the audit passes by not looking.
 * Nothing in `dispatch/{policies,predictor}` is asynchronous today, which is exactly why the hole
 * survived: it is latent, and the first `export async function` added to either module would have
 * entered the codebase unaudited. `experiments/src/tuning/deadCode.test.ts` widened its copy when
 * three of the five symbols it exists to protect turned out to be `async`; this is the same
 * widening, applied before rather than after. The pattern is asserted against a synthetic
 * declaration below, so the alternative cannot be dropped again without a test failing.
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
      if (path === own || isTest(path)) return false;
      if (bindings.get(path)?.has(symbol.name) !== true) return false;
      // A barrel counts only when it uses the symbol in its own code — see `usesAsValue`.
      return !isBarrel(path) || usesAsValue(sources.get(path) ?? '', symbol.name);
    });
  });

  return { symbols, uncalled };
}


/**
 * **Findings, not absolutions — the register the 2026-07-31 extension opened.**
 *
 * Extending this audit from two directories to fourteen surfaced 46 uncalled exports. Twelve were a
 * scanner defect and were fixed rather than allowlisted (see `usesAsValue`: `terms/index.ts` is a
 * *registry*, not a barrel, and reporting the entire shipped cost-term library as uncalled was the
 * opposite of the truth). Twenty-seven are public surface, recorded above with the reason each is
 * surface rather than behaviour.
 *
 * These seven are neither. Each is exported, each has a test, and **none has a caller in any
 * shipped path** — the exact shape CLAUDE.md's standing requirement describes, and the shape that
 * has landed eleven times here. They are listed rather than deleted because disposition is a
 * decision per symbol — wire it, or delete it with its test — and this audit's deliverable is the
 * classification. `viz`'s fifth audit worked the same way: it classified eight, and a later lane
 * closed all eight.
 *
 * The sharpest is the replay pair. CLAUDE.md invariant 5 is *"every persisted run record carries
 * its seed, so any run replays exactly"*, and `metrics/index.ts` documents the round trip in a
 * worked example — `writeFileSync(path, serializeRunRecord(record))` then
 * `new StreamSet(runSeed(parseRunRecord(...)))`. **`parseRunRecord` has a real caller and the other
 * two do not**: `experiments/reports/persistence.ts` writes through `serializeRunSet`, and the
 * singular-record writer it superseded is reachable only from its own tests. The reader half of a
 * documented round trip is wired and the writer half is not.
 *
 * Four more have no reference anywhere outside their own file — not even a test that is not their
 * own: `DEFAULT_DEPARTURE_GAP_S`, `legDurations`, `SIM_EVENT_TYPE_IDS`, `configError`.
 */
const DEAD_CANDIDATES: Readonly<Record<string, string>> = Object.freeze({
  'metrics/serializeRunRecord':
    'the writer half of the documented replay round trip; persistence.ts writes through serializeRunSet instead',
  'metrics/runSeed':
    'turns a stored seed back into the bigint StreamSet wants; named in the round-trip example, called by no shipped path',
  'metrics/DEFAULT_DEPARTURE_GAP_S': 'no reference outside its own file',
  'metrics/legDurations': 'no reference outside its own file',
  'sim/SIM_EVENT_TYPE_IDS': 'no reference outside its own file',
  'config/configError': 'no reference outside its own file',
  'car/stopFloorsOf': 'reads a car snapshot; only its own test calls it',
});

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of the fourteen audited core modules has a caller or a stated reason', () => {
  const { symbols, uncalled } = audit();

  it('scans every audited module and finds the exports it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These two names
    // are the modules' load-bearing entry points and their absence means the walk broke.
    // 14 directories, not the original 2: a walk that silently reverted to the old scope would
    // still clear 40, so the floor moves with the coverage it is guarding.
    expect(symbols.length).toBeGreaterThan(400);
    expect(symbols.map((symbol) => symbol.key)).toContain('policies/createPolicyFor');
    expect(symbols.map((symbol) => symbol.key)).toContain('predictor/createArrivalModel');
    // One load-bearing entry point from the newly-audited half, for the same reason.
    expect(symbols.map((symbol) => symbol.key)).toContain('traffic/generateTrace');
    expect(symbols.map((symbol) => symbol.key)).toContain('metrics/summarizeRun');
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter(
      (symbol) => !(symbol.key in PUBLIC_API_ONLY) && !(symbol.key in DEAD_CANDIDATES),
    );
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the Phase 5 defect, four times over — or they are deliberate ' +
        'public API and belong in the allowlist with the reason why',
    ).toEqual([]);
  });

  /*
   * The register is a finding list, so it must be *visible* rather than merely tolerated. This
   * asserts its exact size: closing one without editing this number fails, and so does adding an
   * eighth silently. The number goes down, or it goes up with a reason — it does not drift.
   */
  it('names every dead candidate, and the count is the one recorded', () => {
    const open = uncalled.filter((symbol) => symbol.key in DEAD_CANDIDATES);
    expect(open.map((symbol) => symbol.key).sort()).toEqual(Object.keys(DEAD_CANDIDATES).sort());
    expect(open.length, 'dispose a candidate and lower this number; never raise it silently').toBe(7);
  });

  it('keeps the allowlist honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = [...Object.keys(PUBLIC_API_ONLY), ...Object.keys(DEAD_CANDIDATES)].filter(
      (key) => !uncalledKeys.has(key),
    );
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

/* -------------------------------------------------------------------------- *
 * The scanner's own two holes, closed and pinned
 * -------------------------------------------------------------------------- */

/**
 * **The audit above is only as good as the two functions below it, and both were wrong.**
 *
 * Each hole was demonstrated before it was closed, by making the audit *fail to fail*:
 *
 * | hole | demonstration | unfixed | fixed |
 * |---|---|---|---|
 * | `EXPORTED` did not match `export async function` | an uncalled `export async function` added to `policies/zoning.ts` | **green** — never scanned at all | red, naming it |
 * | `code()` stripped comments but not string literals | both real importers of `createArrivalModel` deleted (`sim/simulation.ts`, `experiments/src/benchmark/predictorLag.ts`) | **green** — `PredictorError(\`createArrivalModel: …\`)` in its own file read as a self-use | red, naming it |
 *
 * The second is the worse of the two: it made *"`createArrivalModel` must read live"* — the
 * assertion three lines above — **unfalsifiable**. Any symbol that names itself in its own error
 * message was permanently live regardless of who called it, which is a guard that cannot fail.
 *
 * So the two are pinned here directly, against synthetic input rather than against whatever the
 * audited modules happen to contain today. `dispatch/{policies,predictor}` has no `export async
 * function` at all, which is exactly how that hole survived: a latent scanner gap is invisible
 * until the first symbol falls into it, and by then it has entered the codebase unaudited.
 */
describe('the scanner cannot silently stop looking', () => {
  it('matches an async exported function — the declaration form it used to skip entirely', () => {
    expect(EXPORTED.exec('export async function runThing(): Promise<void> {')?.[1]).toBe('runThing');
    // …and still every form it already matched, so widening the alternative broke nothing.
    for (const [line, name] of [
      ['export function plain(): void {', 'plain'],
      ['export const VALUE = 1;', 'VALUE'],
      ['export class Thing {', 'Thing'],
      ['export abstract class Base {', 'Base'],
      ['export interface Shape {', 'Shape'],
      ['export type Alias = number;', 'Alias'],
      ['export enum Kind {', 'Kind'],
      ['export declare const AMBIENT: number;', 'AMBIENT'],
    ] as const) {
      expect(EXPORTED.exec(line)?.[1], line).toBe(name);
    }
    // A re-export is not a declaration, and must not be scanned as one.
    expect(EXPORTED.exec("export { thing } from './thing.js';")).toBeNull();
  });

  it('removes string literals, so a symbol that names itself is not thereby self-used', () => {
    // The exact shape that made the audit unfalsifiable: the name appears twice, and the second
    // occurrence is inside the error message the function throws.
    const source = [
      'function helper(): void {',
      '  throw new Error(`helper: not implemented`);',
      '}',
    ].join('\n');
    expect((code(source).match(/\bhelper\b/g) ?? []).length).toBe(1);

    // Single and double quotes too, and a `{@link}` in a comment, which was the only case the old
    // implementation handled.
    expect((code("const a = 'helper';\n/** {@link helper} */\nconst b = \"helper\";").match(/\bhelper\b/g) ?? []).length).toBe(0);

    // …but a template **interpolation** is code and must survive, or the fix would create the
    // opposite defect: a real call written `${helper()}` reading as dead.
    expect((code('const x = `${helper()}`;').match(/\bhelper\b/g) ?? []).length).toBe(1);
  });

  it('still finds a real use, so the strip is not simply deleting the file', () => {
    // Both directions. A scanner that returned the empty string would pass every assertion above.
    const stripped = code(readFileSync(join(PACKAGES_DIR, 'core/src/dispatch/policies/registry.ts'), 'utf8'));
    expect(stripped.length).toBeGreaterThan(200);
    expect(stripped).toContain('createPolicyFor');
  });
});
