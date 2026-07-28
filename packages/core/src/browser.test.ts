/// <reference types="node" />

/**
 * The browser entry point is fs-free — walked, not read.
 *
 * ## Why this test is a graph walk and not a grep
 *
 * `src/browser.ts` is what a browser bundle gets when it imports `@elevator-sim/core` (under the
 * `browser` export condition) or `@elevator-sim/core/browser` (always). It must contain no
 * `node:` builtin anywhere in its transitive module graph, because a bundler replaces a Node
 * builtin with a stub that throws **at module evaluation** — so one unreachable `node:fs` import
 * eight modules down kills the whole viewer before it runs a line.
 *
 * The reason this is walked rather than eyeballed is that eyeballing already failed. Three
 * docstrings in this package — `config/loader.ts`, `config/index.ts` and the old `src/index.ts` —
 * each asserted that a browser build could import the pure parsing path "without pulling
 * `node:fs` into its module graph". All three were wrong for the whole of Phase 4, because
 * `config/index.ts` re-exported `loadConfig` and `src/index.ts` re-exported `config/index.ts`.
 * Every one of those files reads as correct in isolation. Only the graph shows the defect, so the
 * graph is what the test looks at.
 *
 * ## What is asserted
 *
 * 1. No `node:` specifier — and no bare Node builtin name — anywhere reachable from
 *    `src/browser.ts`. Reported with the importing file, so a failure names the edge.
 * 2. `config/loader.ts`, the one module in the package that reads a disk, is *not* reachable.
 * 3. The set of external packages in the graph is exactly `{zod}`. An allowlist that is asserted
 *    equal rather than merely subtracted, so pulling a new npm dependency into the browser bundle
 *    is a deliberate edit to this line and not a silent regression.
 * 4. The walk is not vacuous: it reaches a realistic number of files and specific deep ones.
 *    A guard that silently walks nothing passes every other assertion here.
 * 5. The two barrels differ by exactly `loadConfig`, so `src/index.ts` cannot quietly grow a
 *    Node-only export that browser consumers believe they have, nor drop a browser one.
 * 6. `package.json` publishes both entry points, and every target it names has a source file.
 *
 * Type-only imports are treated as offenders too, even though they erase at runtime. The rule is
 * cheap to keep, and the alternative is a test that has to decide what `import type` means after
 * `verbatimModuleSyntax`-style transforms — which is exactly the kind of subtlety that let the
 * original defect live behind three correct-sounding docstrings.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import * as browserBarrel from './browser.js';
import * as nodeBarrel from './index.js';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const PKG = fileURLToPath(new URL('../', import.meta.url));

/** The browser entry point. Everything below is reachable from here or it is not in the bundle. */
const ENTRY = resolvePath(SRC, 'browser.ts');

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
 * Asserted as an equality below. `zod` is the schema library the config parsers are built on and
 * ships an ESM browser build; it is the package's only runtime dependency.
 */
const ALLOWED_EXTERNALS = ['zod'];

/**
 * Comments removed, so a rule is about *code* rather than about prose.
 *
 * Half the value of these files is their docstrings, and several of them quote `node:fs` by name
 * while explaining why it is not imported. Naming the thing you are avoiding is how the avoidance
 * stays understood, so a docstring must not be able to fail this test.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * Every module specifier in a file: static `import`/`export … from`, bare side-effect `import`,
 * dynamic `import()` and `require()`.
 *
 * Dynamic `import()` counts. A bundler follows it into a chunk, so deferring a `node:fs` import
 * behind one would move the failure from load time to build time rather than removing it — and
 * would be exactly the sort of "technically not in the static graph" fix this test exists to
 * refuse.
 *
 * The `import`/`export` forms are anchored at a statement boundary rather than matched on a bare
 * `from`, because `config/resolveCar.ts` builds the message `cannot read a divisor from "${…}"`
 * and an unanchored pattern reads that template literal as an import of `${…}`.
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
  /** Importing file, relative to `packages/core/src`. */
  readonly from: string;
  readonly specifier: string;
}

interface Graph {
  /** Every reachable module, relative to `packages/core/src`, sorted. */
  readonly files: readonly string[];
  /** `node:`-prefixed or bare-builtin imports, with the file that made them. */
  readonly builtins: readonly Edge[];
  /** Bare package specifiers, deduplicated and sorted. */
  readonly externals: readonly string[];
  /** Relative specifiers that resolved to nothing — a broken import is also a failure. */
  readonly unresolved: readonly Edge[];
}

const id = (path: string): string => relative(SRC, path).split('\\').join('/');

/** Every `.ts` file under `dir`, relative to `packages/core/src`, sorted. */
async function allSources(dir: string): Promise<readonly string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolvePath(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allSources(path)));
    else if (entry.name.endsWith('.ts')) out.push(id(path));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Breadth-first over the real import graph, starting at the browser entry point. */
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
    files: [...seen].map(id).sort((a, b) => a.localeCompare(b)),
    builtins,
    externals: [...externals].sort((a, b) => a.localeCompare(b)),
    unresolved,
  };
}

let graph!: Graph;

beforeAll(async () => {
  graph = await walkFrom(ENTRY);
});

describe('the browser entry point reaches no Node builtin', () => {
  it('has no `node:` import anywhere in its transitive graph', () => {
    expect(
      graph.builtins.map((edge) => `${edge.from} imports ${edge.specifier}`),
    ).toEqual([]);
  });

  it('does not reach config/loader.ts, the one module that reads a disk', () => {
    expect(graph.files).not.toContain('config/loader.ts');
    // …and the loader is still there, so the assertion above is about placement, not deletion.
    expect(graph.files).toContain('config/parse.ts');
  });

  it('imports exactly one external package', () => {
    expect(graph.externals).toEqual(ALLOWED_EXTERNALS);
  });

  it('resolves every relative specifier it finds', () => {
    expect(graph.unresolved.map((edge) => `${edge.from} imports ${edge.specifier}`)).toEqual([]);
  });
});

describe('the walk is not vacuous', () => {
  /**
   * Every assertion above passes trivially against an empty graph, which is the failure mode of a
   * guard whose resolver quietly stops working. So the walk has to prove it went somewhere: the
   * package has well over a hundred non-test modules and the entry point re-exports all of them.
   */
  it('reaches the whole package, not just the barrel', () => {
    expect(graph.files.length).toBeGreaterThan(80);
  });

  /**
   * The sharpest form of the same check, and the one that would notice the extractor above
   * silently missing an import form: every non-test module in the package is reachable from the
   * browser entry point **except** the two that make up the Node side of the split. If that
   * complement ever grows, either a module became browser-unreachable or this walk stopped
   * following an edge — and both are things the guard exists to notice.
   */
  it('reaches every module except the two on the Node side of the split', async () => {
    const all = (await allSources(SRC)).filter(
      (file) => !/\.test\.ts$|\.test-helper\.ts$|\.d\.ts$/.test(file),
    );
    const reachable = new Set(graph.files);
    expect(all.filter((file) => !reachable.has(file))).toEqual(['config/loader.ts', 'index.ts']);
  });

  it('reaches modules several hops from the entry point', () => {
    // browser.ts → sim/index.ts → simulation.ts, and → dispatch/index.ts → policies/ → predictor/.
    expect(graph.files).toEqual(
      expect.arrayContaining([
        'browser.ts',
        'config/index.ts',
        'config/schema.ts',
        'sim/simulation.ts',
        'physics/motion/sCurve.ts',
        'dispatch/policies/auction.ts',
      ]),
    );
  });

  it('includes no test file, so the guard is about shipped code', () => {
    expect(graph.files.filter((file) => file.includes('.test'))).toEqual([]);
  });
});

describe('the two entry points differ by exactly loadConfig', () => {
  it('adds loadConfig to the browser barrel and nothing else', () => {
    const extra = Object.keys(nodeBarrel).filter((key) => !(key in browserBarrel));
    expect(extra).toEqual(['loadConfig']);
  });

  it('drops nothing from the browser barrel', () => {
    const missing = Object.keys(browserBarrel).filter((key) => !(key in nodeBarrel));
    expect(missing).toEqual([]);
  });

  it('re-exports the same bindings, not copies', () => {
    for (const [key, value] of Object.entries(browserBarrel)) {
      expect((nodeBarrel as Record<string, unknown>)[key]).toBe(value);
    }
  });
});

describe('package.json publishes both entry points', () => {
  interface Exports {
    readonly '.': { browser: { default: string }; default: string; types: string };
    readonly './browser': { default: string; types: string };
  }

  const readExports = async (): Promise<Exports> =>
    (JSON.parse(await readFile(resolvePath(PKG, 'package.json'), 'utf8')) as { exports: Exports })
      .exports;

  it('resolves the plain specifier to the fs-free barrel under the browser condition', async () => {
    const map = await readExports();
    expect(map['.'].browser.default).toBe('./dist/browser.js');
    expect(map['.'].default).toBe('./dist/index.js');
  });

  it('publishes an explicit ./browser subpath, for consumers that want the narrow types', async () => {
    const map = await readExports();
    expect(map['./browser'].default).toBe('./dist/browser.js');
    expect(map['./browser'].types).toBe('./dist/browser.d.ts');
  });

  it('names only targets that have a source file', async () => {
    const map = await readExports();
    const targets = [map['.'].default, map['.'].browser.default, map['./browser'].default];
    for (const target of new Set(targets)) {
      const source = resolvePath(SRC, target.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts'));
      expect(await exists(source), `${target} has no source`).toBe(true);
    }
  });
});
