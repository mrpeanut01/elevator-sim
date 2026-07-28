/// <reference types="node" />

/**
 * The browser entry point is environment-free — **walked, not read**.
 *
 * ## Why this is a graph walk and not a grep
 *
 * `src/browser.ts` is what a browser bundle gets when it imports `@elevator-sim/experiments`
 * (under the `browser` export condition) or `@elevator-sim/experiments/browser` (always). It must
 * contain no `node:` builtin anywhere in its **transitive** module graph, because a bundler
 * replaces a Node builtin with a stub that throws **at module evaluation** — so one unreachable
 * `node:worker_threads` import several modules down kills the page before it runs a line.
 *
 * The technique is `packages/core/src/browser.test.ts`'s, ported rather than reinvented
 * (DECISIONS.md § D31–§ D33). Reading the imports is not enough, and this package proves it twice
 * over: `src/index.ts`'s own docstring said the barrel reaches `node:fs` and `node:worker_threads`
 * and named two modules, and `docs/07-handoff.md` § 8 named exactly one (`runner/parallel.ts`).
 * The walk finds **three**, the third down a path nobody would guess —
 * `index.ts → benchmark/index.ts → benchmark/verdict.ts → validation/harness.ts → node:url`.
 * Every one of those documents reads as correct in isolation. Only the graph shows the count.
 *
 * ## What is asserted, and in which direction
 *
 * A guard like this has two failure modes, and one of them is silent. It can fail to notice a
 * `node:` builtin that arrived — loud, and every project writes that assertion. Or its own scope
 * can quietly shrink to nothing: a resolver that stops resolving, an extractor that stops matching
 * an import form, a walk that reaches three files instead of thirteen. That one passes. So:
 *
 * **Direction 1 — nothing bad is reachable.**
 *
 * 1. No `node:` specifier and no bare builtin name (`fs`, `path`, `worker_threads`, …) anywhere in
 *    the graph, reported as `<file> imports <specifier>` so a failure names the edge.
 * 2. The three modules that *do* reach a builtin are not in the graph, **and** the module beside
 *    each of them that should be is — so the assertion is about placement, not about deletion.
 * 3. The external packages are exactly `{@elevator-sim/core}`. An asserted equality, so pulling a
 *    new npm dependency into a browser bundle is a deliberate edit to one line.
 * 4. Every relative specifier resolves. A broken import is a failure too.
 * 5. No reachable module binds or reads `loadConfig`. Under the `browser` condition
 *    `@elevator-sim/core` resolves to `core`'s *browser* barrel, which does not export it — so a
 *    `loadConfig` call on this graph typechecks against the Node types (TypeScript does not apply
 *    the condition) and is `undefined` at run time. `tuning/space/collect.ts` imports the whole
 *    namespace, which is exactly the shape that could reach it without a named import.
 *
 * **Direction 2 — the guard's scope cannot silently degrade.**
 *
 * 6. The reachable set is asserted **by exact equality against a written list**, not by a lower
 *    bound. `core`'s guard asserts the *complement* — it reaches all but two of its modules — and
 *    that shape is unavailable here, because this barrel is a deliberate minority of a package
 *    whose centre of gravity is Node-bound: the complement is 70 files and would rot weekly. The
 *    equality is the same property from the other end and is strictly tighter: a module that
 *    joins the browser graph fails, and a module that silently drops out of it fails too.
 * 7. **The same walker, pointed at `src/index.ts`, must still find the three known builtin
 *    edges.** This is the assertion that catches a broken extractor. If `specifiersOf` stops
 *    matching an import form, or `resolveRelative` stops resolving, assertions 1–6 all go green
 *    and this one goes red. A guard nobody has seen fail is not a guard, and a guard that cannot
 *    fail is worse.
 * 8. No test file is in the graph, so the guard is about shipped code.
 *
 * **Direction 3 — the two barrels agree.**
 *
 * 9. Every runtime export of the browser barrel is a runtime export of the Node barrel, and is the
 *    *same binding*. The browser barrel is a strict subset — asserted strictly, with named Node-only
 *    exports on the other side, so "subset" cannot degenerate into "equal" or into "empty".
 * 10. `package.json` publishes both entry points and every target it names has a source file.
 * 11. `collectSearchSpace` — docs/10 § 13 q1's blocking case — is importable *and callable*
 *     through the browser barrel. An entry point that resolves but cannot do the one job it was
 *     added for is not an answer to the question.
 *
 * Type-only imports count as offenders, as in `core`: the rule is cheap to keep and the
 * alternative is a test that has to decide what `import type` erases to, which is precisely the
 * kind of subtlety that let `core`'s original defect live behind three correct-sounding docstrings.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import * as coreBrowser from '@elevator-sim/core/browser';

import * as browserBarrel from './browser.js';
import * as nodeBarrel from './index.js';
import { isBarrel } from './tuning/callers.test-helper.js';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const PKG = fileURLToPath(new URL('../', import.meta.url));

/** The browser entry point. Everything below is reachable from here or it is not in the bundle. */
const BROWSER_ENTRY = resolvePath(SRC, 'browser.ts');

/** The Node entry point, walked only to prove the walker still works. See assertion 7. */
const NODE_ENTRY = resolvePath(SRC, 'index.ts');

/** Node builtins as written without the `node:` prefix. Legal in Node, fatal in a bundle. */
const BARE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

/**
 * The external packages a browser bundle of this entry point is allowed to contain.
 *
 * Asserted as an equality. `@elevator-sim/core` is the package's only dependency and resolves,
 * under the same `browser` condition, to `core`'s own guarded fs-free barrel — which is why one
 * external is acceptable here and why assertion 5 exists to keep that resolution honest.
 */
const ALLOWED_EXTERNALS = ['@elevator-sim/core'];

/**
 * Every module a browser bundle of `src/browser.ts` contains. Asserted by equality.
 *
 * Thirteen files: the barrel, the five of `tuning/space`, `reports/statistics.ts` and the
 * `reports/types.ts` it is declared against, the four pure `runner/` modules, and `oracle/types.ts`
 * — which is here only because `runner/types.ts` imports one type from it, and which is the module
 * most likely to surprise a reader. If this list changes, one of two things happened and both want
 * a human: the barrel's surface moved, or the walk stopped following an edge.
 */
const BROWSER_GRAPH = [
  'browser.ts',
  'oracle/types.ts',
  'reports/statistics.ts',
  'reports/types.ts',
  'runner/crn.ts',
  'runner/metrics.ts',
  'runner/stopping.ts',
  'runner/types.ts',
  'tuning/space/collect.ts',
  'tuning/space/encode.ts',
  'tuning/space/index.ts',
  'tuning/space/sample.ts',
  'tuning/space/types.ts',
];

/**
 * Every module reachable from `src/index.ts` that imports a Node builtin, measured.
 *
 * Three, not the one `docs/07-handoff.md` § 8 names and not the two `src/index.ts`'s own docstring
 * describes. `runner/worker.ts` and `validation/{golden,goldenChild}.ts` import builtins too and
 * are **not** on this list because they are not reachable from `src/index.ts` — the worker entry is
 * addressed as a URL rather than imported (`workerEntryUrl`).
 */
const NODE_ENTRY_BUILTINS = [
  'reports/persistence.ts imports node:fs/promises',
  'reports/persistence.ts imports node:path',
  'runner/parallel.ts imports node:os',
  'runner/parallel.ts imports node:worker_threads',
  'validation/harness.ts imports node:url',
];

/**
 * Comments removed, so a rule is about *code* rather than about prose.
 *
 * Half the value of these files is their docstrings, and several of them name `node:worker_threads`
 * and `loadConfig` while explaining why they are not imported. Naming the thing you are avoiding is
 * how the avoidance stays understood, so a docstring must not be able to fail this test.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * Every module specifier in a file: static `import`/`export … from`, bare side-effect `import`,
 * dynamic `import()` and `require()`.
 *
 * Dynamic `import()` counts. A bundler follows it into a chunk, so deferring a `node:fs` import
 * behind one moves the failure from load time to build time rather than removing it — and is
 * exactly the sort of "technically not in the static graph" fix this test exists to refuse.
 *
 * The `import`/`export` forms are anchored at a statement boundary rather than matched on a bare
 * `from`, because several modules here build messages containing the word — `crn.ts` writes
 * `"… seeds from …"` — and an unanchored pattern reads a template literal as an import.
 */
function specifiersOf(code: string): readonly string[] {
  const found: string[] = [];
  const patterns = [
    /(?:^|[\n;{}])\s*import\s+(?:[^'"();]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|[\n;{}])\s*export\s+[^'"();]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

const exists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/** `./x.js` → `x.ts`, `./x/index.js` → `x/index.ts`, `./x` → `x.ts`. Emit-relative, like tsc. */
async function resolveRelative(from: string, specifier: string): Promise<string | undefined> {
  const base = resolvePath(dirname(from), specifier);
  const candidates = [
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    `${base}.ts`,
    resolvePath(base, 'index.ts'),
    base,
  ];
  for (const candidate of candidates) {
    if (candidate.endsWith('.ts') && (await exists(candidate))) return candidate;
  }
  return undefined;
}

interface Edge {
  /** Importing file, relative to `packages/experiments/src`. */
  readonly from: string;
  readonly specifier: string;
}

interface Graph {
  /** Every reachable module, relative to `packages/experiments/src`, sorted. */
  readonly files: readonly string[];
  /** `node:`-prefixed or bare-builtin imports, with the file that made them. */
  readonly builtins: readonly Edge[];
  /** Bare package specifiers, deduplicated and sorted. */
  readonly externals: readonly string[];
  /** Relative specifiers that resolved to nothing — a broken import is also a failure. */
  readonly unresolved: readonly Edge[];
}

const id = (path: string): string => relative(SRC, path).split('\\').join('/');

const byName = (a: string, b: string): number => a.localeCompare(b);

/** Every `.ts` file under `dir`, relative to `packages/experiments/src`, sorted. */
async function allSources(dir: string): Promise<readonly string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolvePath(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allSources(path)));
    else if (entry.name.endsWith('.ts')) out.push(id(path));
  }
  return out.sort(byName);
}

/** Breadth-first over the real import graph, starting at `entry`. */
async function walkFrom(entry: string): Promise<Graph> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  const builtins: Edge[] = [];
  const externals = new Set<string>();
  const unresolved: Edge[] = [];

  while (queue.length > 0) {
    const file = queue.shift() as string;
    const code = stripComments(await readFile(file, 'utf8'));
    for (const specifier of specifiersOf(code)) {
      if (specifier.startsWith('node:') || BARE_BUILTINS.has(specifier.split('/')[0] ?? '')) {
        builtins.push({ from: id(file), specifier });
        continue;
      }
      if (!specifier.startsWith('.')) {
        externals.add(specifier.startsWith('@') ? specifier : (specifier.split('/')[0] as string));
        continue;
      }
      const target = await resolveRelative(file, specifier);
      if (target === undefined) {
        unresolved.push({ from: id(file), specifier });
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return {
    files: [...seen].map(id).sort(byName),
    builtins,
    externals: [...externals].sort(byName),
    unresolved,
  };
}

const edges = (graph: Graph): readonly string[] =>
  [...new Set(graph.builtins.map((edge) => `${edge.from} imports ${edge.specifier}`))].sort(byName);

let graph!: Graph;
let nodeGraph!: Graph;

beforeAll(async () => {
  [graph, nodeGraph] = await Promise.all([walkFrom(BROWSER_ENTRY), walkFrom(NODE_ENTRY)]);
});

/* -------------------------------------------------------------------------- *
 * Direction 1 — nothing bad is reachable.
 * -------------------------------------------------------------------------- */

describe('the browser entry point reaches no Node builtin', () => {
  it('has no `node:` import anywhere in its transitive graph', () => {
    expect(
      edges(graph),
      'a bundler stubs a Node builtin with a module that throws at evaluation, so one of these ' +
        'kills the page before consumer code runs. Move the export to src/index.ts',
    ).toEqual([]);
  });

  it('does not reach any of the three modules that do import a builtin', () => {
    for (const file of ['runner/parallel.ts', 'reports/persistence.ts', 'validation/harness.ts']) {
      expect(graph.files, `${file} is reachable from the browser barrel`).not.toContain(file);
    }
    // …nor the worker entry, which no barrel imports but which is one careless edit away.
    expect(graph.files).not.toContain('runner/worker.ts');
    // …and the pure module beside each of them still is, so this is about placement, not deletion.
    expect(graph.files).toContain('runner/crn.ts');
    expect(graph.files).toContain('reports/statistics.ts');
    expect(graph.files).toContain('tuning/space/collect.ts');
  });

  it('imports exactly one external package', () => {
    expect(graph.externals).toEqual(ALLOWED_EXTERNALS);
  });

  it('resolves every relative specifier it finds', () => {
    expect(graph.unresolved.map((edge) => `${edge.from} imports ${edge.specifier}`)).toEqual([]);
  });

  /**
   * `loadConfig` is the one `@elevator-sim/core` export that is *not* on `core`'s browser barrel
   * (DECISIONS.md § D31). Under the `browser` condition, a module on this graph that reached for it
   * would compile — TypeScript does not apply the condition — and be `undefined` at run time.
   *
   * `tuning/space/collect.ts` does `import * as core from '@elevator-sim/core'` and reads
   * `*_PARAMETERS` names off the namespace, which is precisely the shape that could touch
   * `core.loadConfig` without a named import ever appearing. So the check is textual over the
   * comment-stripped source of every reachable module, and covers both forms.
   */
  it('reaches no use of loadConfig, which core’s browser barrel does not export', async () => {
    const offenders: string[] = [];
    for (const file of graph.files) {
      const code = stripComments(await readFile(resolvePath(SRC, file), 'utf8'));
      if (/\bloadConfig\b/.test(code)) offenders.push(file);
    }
    expect(
      offenders,
      'under the browser condition `@elevator-sim/core` is core/browser.js, which has no ' +
        'loadConfig. A call here typechecks and is undefined at run time',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Direction 2 — the guard's scope cannot silently degrade.
 * -------------------------------------------------------------------------- */

describe('the walk is not vacuous', () => {
  /**
   * Every assertion above passes trivially against an empty graph, which is the failure mode of a
   * guard whose resolver quietly stops working. `core`'s answer is to assert the *complement* —
   * it reaches all but two of the package's modules. That is unavailable here: this barrel is a
   * deliberate minority of a package whose bulk is Node-bound by purpose, so the complement is 70
   * files and would rot on every new module. Asserting the reachable set by equality is the same
   * property from the other end, and tighter: it fails on a module that joins the graph *and* on
   * one that silently drops out of it.
   */
  it('reaches exactly the modules the browser barrel is built from', () => {
    expect(graph.files).toEqual(BROWSER_GRAPH);
  });

  it('reaches modules several hops from the entry point', () => {
    // browser.ts → tuning/space/index.ts → collect.ts → encode.ts, and → runner/crn.ts → types.ts
    // → oracle/types.ts.
    expect(graph.files).toEqual(
      expect.arrayContaining([
        'browser.ts',
        'tuning/space/encode.ts',
        'runner/types.ts',
        'oracle/types.ts',
      ]),
    );
  });

  /**
   * **The assertion that catches a broken extractor**, and the reason the Node entry is walked at
   * all. The same `specifiersOf`, the same `resolveRelative`, the same `BARE_BUILTINS` — pointed at
   * `src/index.ts`, where the answer is known and non-empty.
   *
   * If the regex set stops matching an import form, or the resolver stops resolving `./x.js`, the
   * browser walk reaches fewer files, finds nothing, and every assertion above goes green. This one
   * goes red. It is asserted by equality rather than by "at least one", so a walk that finds only
   * the shallowest of the three fails too — `validation/harness.ts` is three modules down.
   */
  it('still finds the three known builtin edges when pointed at the Node entry', () => {
    expect(
      edges(nodeGraph),
      'the walker found a different set of Node builtins from src/index.ts than the measured ' +
        'one. Either the package changed, or this walk stopped following an edge — and in the ' +
        'second case every assertion about the browser barrel above is worthless',
    ).toEqual(NODE_ENTRY_BUILTINS);
  });

  it('reaches most of the package from the Node entry, so the walk goes somewhere', () => {
    expect(nodeGraph.files.length).toBeGreaterThan(60);
    expect(nodeGraph.files.length).toBeGreaterThan(graph.files.length * 4);
  });

  it('includes no test file, so the guard is about shipped code', () => {
    expect(graph.files.filter((file) => file.includes('.test'))).toEqual([]);
  });

  /**
   * The complement, in the one form that is cheap here: every module named in `BROWSER_GRAPH`
   * exists on disk. A list that drifted into naming a deleted file would otherwise let the equality
   * above be satisfied by a walk and a list that are both wrong in the same direction.
   */
  it('names only modules that exist', async () => {
    const all = new Set(await allSources(SRC));
    expect(BROWSER_GRAPH.filter((file) => !all.has(file))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Direction 3 — the two barrels agree, and the dead-code audit still works.
 * -------------------------------------------------------------------------- */

describe('the browser barrel is a strict subset of the Node barrel', () => {
  it('drops nothing: every browser export is also a Node export', () => {
    const missing = Object.keys(browserBarrel).filter((key) => !(key in nodeBarrel));
    expect(
      missing,
      'src/index.ts is the full surface; a name here that is not there means a Node consumer ' +
        'cannot import something a browser consumer can, which is backwards',
    ).toEqual([]);
  });

  it('re-exports the same bindings, not copies', () => {
    for (const [key, value] of Object.entries(browserBarrel)) {
      expect((nodeBarrel as Record<string, unknown>)[key], key).toBe(value);
    }
  });

  /**
   * Strictly a subset, asserted strictly. "Subset" is satisfied by an empty barrel and by an equal
   * one, and both would mean this file had stopped doing its job — the first silently, the second
   * by having dragged the Node-bound half into a browser bundle.
   */
  it('is a proper subset, and the extra names are the environment-bound ones', () => {
    const extra = new Set(Object.keys(nodeBarrel).filter((key) => !(key in browserBarrel)));
    expect(extra.size).toBeGreaterThan(100);
    for (const name of [
      'createWorkerPoolExecutor',
      'readRunSetFile',
      'writeRunSetFile',
      'runExperiment',
      'runBenchmark',
      'runHoldoutRound',
      'randomSearch',
    ]) {
      expect([...extra], `${name} must not be on the browser barrel`).toContain(name);
    }
    expect(Object.keys(browserBarrel).length).toBeGreaterThan(50);
  });

  /** The omission `src/index.ts` documents, kept for the same reason one barrel down. */
  it('exports canonicalJson from neither barrel', () => {
    expect(browserBarrel).not.toHaveProperty('canonicalJson');
    expect(nodeBarrel).not.toHaveProperty('canonicalJson');
  });

  /**
   * `browser.ts` is a barrel by role and not by name, and the dead-code scanner identified barrels
   * by filename. Left alone, this file would have counted as a real consumer of the six
   * `space/*` entries in `tuning/deadCode.test.ts`'s allowlist and reported them all as *"now has
   * a caller"* — the audit that exists to stop dead code reading as live, made to read everything
   * as live. It happened to `core` when its split landed (DECISIONS.md § D33).
   *
   * Asserted in both directions: a real module must still not be treated as a barrel, or the fix
   * would be a hole rather than a patch.
   */
  it('is recognised as a barrel by the dead-code scanner', () => {
    expect(isBarrel(resolvePath(SRC, 'browser.ts'))).toBe(true);
    expect(isBarrel(resolvePath(SRC, 'index.ts'))).toBe(true);
    expect(isBarrel(resolvePath(SRC, 'tuning/space/collect.ts'))).toBe(false);
    expect(isBarrel(resolvePath(SRC, 'runner/crn.ts'))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The resolution itself, and the blocking case.
 * -------------------------------------------------------------------------- */

describe('package.json publishes both entry points', () => {
  interface Exports {
    readonly '.': {
      browser: { default: string; types: string };
      default: string;
      types: string;
    };
    readonly './browser': { default: string; types: string };
  }

  const readExports = async (): Promise<Exports> =>
    (JSON.parse(await readFile(resolvePath(PKG, 'package.json'), 'utf8')) as { exports: Exports })
      .exports;

  it('resolves the plain specifier to the environment-free barrel under the browser condition', async () => {
    const map = await readExports();
    expect(map['.'].browser.default).toBe('./dist/browser.js');
    expect(map['.'].browser.types).toBe('./dist/browser.d.ts');
    expect(map['.'].default).toBe('./dist/index.js');
  });

  it('publishes an explicit ./browser subpath, whose types match what a bundler gives', async () => {
    const map = await readExports();
    expect(map['./browser'].default).toBe('./dist/browser.js');
    expect(map['./browser'].types).toBe('./dist/browser.d.ts');
  });

  it('names only targets that have a source file', async () => {
    const map = await readExports();
    const targets = [
      map['.'].default,
      map['.'].browser.default,
      map['./browser'].default,
      map['./browser'].types,
      map['.'].types,
    ];
    for (const target of new Set(targets)) {
      const source = resolvePath(
        SRC,
        target.replace(/^\.\/dist\//, '').replace(/\.d\.ts$|\.js$/, '.ts'),
      );
      expect(await exists(source), `${target} has no source`).toBe(true);
    }
  });
});

describe('the case docs/10 § 13 q1 is blocked on', () => {
  /**
   * *"W4 cannot start against `collectSearchSpace()` until this is answered."* Resolving is not
   * the claim — **calling** is. An entry point that imports and then throws, or returns an empty
   * space because discovery ran against a namespace missing its schemas, would satisfy every
   * assertion above and answer nothing.
   */
  it('imports collectSearchSpace through the browser barrel and calls it', () => {
    expect(typeof browserBarrel.collectSearchSpace).toBe('function');
    const space = browserBarrel.collectSearchSpace();
    expect(space.parameters.length).toBeGreaterThan(40);
    expect(space.ids).toContain('weights.waitTime');
  });

  /**
   * **M10, corrected — pinned rather than quoted.**
   *
   * docs/10 records M10's second sentence as refuted: it establishes that the schema *data* in
   * `core/browser` is complete and that discovery gives identical results against either barrel,
   * **not** that discovery runs client-side unchanged. This file answers the second half; this
   * assertion is the first half, mechanised.
   *
   * It matters because it is the reason W4 does not need a second implementation of discovery. A
   * `*_PARAMETERS` schema that lived only on `core`'s Node barrel would silently shrink the
   * browser's search space — every control still rendering, the missing dimension simply absent,
   * and a tuned winner optimal only at whatever that dimension happened to be. That is the exact
   * failure `collect.ts` is written to prevent, one package boundary out.
   *
   * `source` is the module namespace discovery reads. Handing it `core`'s browser barrel is what a
   * bundler does to `collect.ts` for free under the `browser` condition, done explicitly so the
   * claim is a test rather than a sentence.
   */
  it('discovers the same space against core’s browser barrel as against its Node barrel', () => {
    // First: the two namespaces really are different objects, or the equality below is a tautology.
    expect(coreBrowser).not.toHaveProperty('loadConfig');
    expect(browserBarrel.discoverParameterSchemas(coreBrowser).size).toBeGreaterThan(5);

    const viaNode = browserBarrel.collectSearchSpace();
    const viaBrowser = browserBarrel.collectSearchSpace({ source: coreBrowser });
    expect(viaBrowser.ids).toEqual(viaNode.ids);
    expect(
      [...browserBarrel.discoverParameterSchemas(coreBrowser).keys()],
      'a schema declared only on core’s Node barrel would shrink the browser’s search space ' +
        'silently, with every control still rendering',
    ).toEqual([...browserBarrel.discoverParameterSchemas().keys()]);
  });

  it('offers the rest of what a generated parameter form needs', () => {
    for (const name of [
      'discoverParameterSchemas',
      'activeWhenSatisfied',
      'isActive',
      'candidateProfile',
      'defaultCandidate',
      'sampleCandidate',
      'searchSpace',
    ] as const) {
      expect(typeof browserBarrel[name], name).toBe('function');
    }
  });
});
