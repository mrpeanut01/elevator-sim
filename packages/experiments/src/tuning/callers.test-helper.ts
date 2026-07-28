/**
 * **Counting callers, mechanically.**
 *
 * The scanner behind `tuning/deadCode.test.ts` and behind `src/index.test.ts`'s liveness
 * assertions. It is `packages/core/src/dispatch/deadCode.test.ts`'s scanner, extracted so that two
 * suites asking the same question ask it the same way rather than growing two answers.
 *
 * It exists because of the one defect this repository keeps shipping: a behaviour that is
 * configurable, unit-tested in isolation and **called by nothing**. Six instances so far
 * (docs/05-roadmap.md § *Standing requirement*, docs/08-review-findings.md § 1), and every one of
 * them passed every other check — the module suites drove the functions directly, the barrels
 * re-exported them, and the runs completed.
 *
 * ## The two rules that make the count mean something
 *
 * 1. **Only a real binding counts.** An `import { x } from …` or an `export { x } from …`. Never a
 *    bare textual match: roughly half the "callers" a grep reports for `tuning/` are `{@link}` tags
 *    in docstrings, which is precisely how a dead symbol reads as connected.
 * 2. **A barrel re-export is not a caller.** `index.ts` naming a symbol proves it is *reachable*,
 *    which is the exact property all six dead behaviours already had. Nor is a `*.test.ts` or a
 *    `*.test-helper.ts`: "every caller was one of its own tests" is the literal description of the
 *    fifth instance.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo's `packages/` directory. */
export const PACKAGES_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/** Every `.ts` file under `root`, skipping `node_modules`, `dist` and dotted directories. */
export function sourceFiles(root: string): readonly string[] {
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

export const isTest = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('.test-helper.ts');

export const isBarrel = (path: string): boolean => basename(path) === 'index.ts';

/** Named bindings a file imports, or re-exports from elsewhere. Never a bare textual match. */
export function boundNames(source: string): ReadonlySet<string> {
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
 * `core/src/dispatch/deadCode.test.ts` strips comments only, and that turned out to be a hole wide
 * enough to drive the whole audit through. `randomSearch.ts` opens with
 *
 * ```ts
 * throw new SearchError(`randomSearch: candidates must be a positive integer; …`);
 * ```
 *
 * — its own name, inside a template literal, in its own file. Under a comment-only strip that is a
 * second occurrence of `randomSearch` and the symbol reads as **self-used**, so it is live no
 * matter who imports it. Measured: deleting the CLI's real `randomSearch` import left the audit
 * fully green. A guard that cannot fail is not a guard, and naming your function in its own error
 * message is good practice this file must not punish by silently exempting it.
 *
 * Template **interpolations are kept**, because `${runRound(…)}` is code. Everything between the
 * quotes is not.
 */
export function code(source: string): string {
  let out = '';
  let index = 0;

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

/** Every `src/` file in the monorepo, with its text and its bound names, read once. */
export interface Corpus {
  readonly files: readonly string[];
  text(path: string): string;
  bindings(path: string): ReadonlySet<string>;
}

export function corpus(root: string = PACKAGES_DIR): Corpus {
  const files = sourceFiles(root).filter((path) => path.includes(`${'/'}src${'/'}`));
  const sources = new Map(files.map((path) => [path, readFileSync(path, 'utf8')]));
  const bindings = new Map(files.map((path) => [path, boundNames(sources.get(path) ?? '')]));
  return {
    files,
    text: (path) => sources.get(path) ?? '',
    bindings: (path) => bindings.get(path) ?? new Set<string>(),
  };
}

/**
 * Files that bind `name` and are neither a test nor a barrel — the non-test callers, by the
 * definition above. Paths are relative to `packages/`, so a failure message names the file.
 *
 * `within` optionally excludes the symbol's own module, for the question *"does anything **outside**
 * this directory use it?"*; omit it for the plain question.
 */
export function nonTestImportersOf(
  scope: Corpus,
  name: string,
  options: { readonly exclude?: (path: string) => boolean } = {},
): readonly string[] {
  const exclude = options.exclude ?? (() => false);
  return scope.files
    .filter(
      (path) =>
        !isTest(path) && !isBarrel(path) && !exclude(path) && scope.bindings(path).has(name),
    )
    .map((path) => relative(PACKAGES_DIR, path));
}

/* -------------------------------------------------------------------------- *
 * The module audit
 * -------------------------------------------------------------------------- */

/**
 * One exported declaration, at the start of a line.
 *
 * `core`'s copy of this pattern has no `async` alternative, because nothing in
 * `dispatch/{policies,predictor}` is asynchronous. Several of the symbols the suites below exist to
 * protect are — `randomSearch`, `successiveHalving`, `sepCmaEs` and `runHoldoutRound` are all
 * `export async function` — so the pattern is **widened** here. A scanner that silently skips the
 * symbols it was written for is the same class of defect as the one it audits.
 */
const EXPORTED =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

/** One export, keyed `module/symbol` so two modules may export the same name. */
export interface AuditedSymbol {
  readonly key: string;
  readonly name: string;
  /** Relative to `packages/`, so a failure message names the file. */
  readonly file: string;
}

export interface ModuleAudit {
  readonly symbols: readonly AuditedSymbol[];
  readonly uncalled: readonly AuditedSymbol[];
}

/**
 * Every export of each module, and which of them nothing calls.
 *
 * **One copy, deliberately.** `tuning/deadCode.test.ts` and `runner/deadCode.test.ts` ask the same
 * question of different directories, and § D114 records what two copies of one audit cost: `core`'s
 * had two scanner holes this one had already fixed, and the dependency direction forbids sharing
 * with it. Nothing forbids sharing *here*, so the mechanism lives in one place and the suites carry
 * only their own allowlists and claims.
 *
 * A symbol is **live** when it is used inside its own file (two occurrences of the name in
 * comment- and string-stripped source: the export and a use), when a sibling in the same module
 * imports it, or when anything outside the module does. A barrel re-export is not a caller, and
 * neither is a `*.test.ts` or a `*.test-helper.ts`.
 *
 * **The self-use rule has a known blind spot, and it is not a bug to be fixed here.** A dead symbol
 * calling a sibling in the same file makes that sibling read as self-used — so liveness can be two
 * hops long and die at the second. Both instances found so far are in `runner/`
 * (`halfWidthStoppingRule → productionStoppingRule`, `verifyCrnAlignment → assertCrnAligned`) and
 * both are stated in that suite's allowlist rather than papered over. Widening the rule to a
 * reachability analysis would re-introduce exactly what `PUBLIC_API_ONLY` exists to prevent:
 * *reachable* was true of all nine dead behaviours. See DECISIONS.md § D116.
 *
 * @param modules paths relative to `packages/`, e.g. `experiments/src/runner`. Not recursive:
 *   each names one directory, so a submodule is audited by naming it.
 */
export function auditModules(modules: readonly string[], scope: Corpus = corpus()): ModuleAudit {
  const all = scope.files;
  const symbols: AuditedSymbol[] = [];

  for (const moduleRelative of modules) {
    const moduleDir = join(PACKAGES_DIR, moduleRelative);
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
