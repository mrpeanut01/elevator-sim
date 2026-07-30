/**
 * **The fifth audit's scanner** — inlined from
 * `packages/experiments/src/tuning/callers.test-helper.ts`, the way
 * `packages/core/src/dispatch/deadCode.test.ts` inlined it, and for the analogous reason.
 *
 * ## Why a copy rather than an import
 *
 * The original lives once for the three `experiments` audits, and § D114 records what two copies
 * of one audit cost — so a fourth copy needs its grounds stated. Three, each checked against the
 * mechanism that enforces it:
 *
 * 1. **The helper is not on any surface this package may import.** It is not re-exported by
 *    `experiments`' `index.ts`, and it cannot be put on `browser.ts` because it reads `node:fs` —
 *    the browser barrel is the environment-free entry point (§ D121).
 * 2. **This package may reach `experiments` only through the `./browser` subpath.**
 *    `src/boundaries.test.ts` makes the bare specifier an offence in *every* file of this package,
 *    tests not exempt — its own comment: *"a test that reached for one would be the first place
 *    the gap re-opened"*.
 * 3. **A cross-package relative import breaks the build.** Each package's `tsconfig` sets
 *    `rootDir: "src"`; a file reaching `../../experiments/src/…` is outside its own root and
 *    `tsc -b` refuses it under project references.
 *
 * `core`'s header says *"core may not import from experiments, so the scanner is duplicated
 * rather than shared"*; this file is the same sentence with the constraint spelled differently.
 * The duplication is stated here so a future consolidation knows all four sites.
 *
 * ## Divergences from the original, all three deliberate
 *
 * 1. **`PACKAGES_DIR` is two levels up, not three** — this file sits at `viz/src/`, one level
 *    shallower than `experiments/src/tuning/`.
 * 2. **A namespace import can be a caller.** `render/canvas.ts` consumes the whole palette as
 *    `import * as tokens from './tokens.js'` and reads `tokens.PAGE` — a real use `boundNames`
 *    cannot see, because no named binding exists. Under the original scanner all forty palette
 *    tokens read as dead, and the only alternatives were to allowlist forty *live* symbols as
 *    uncalled — which inverts the staleness assertion's meaning — or to widen the scanner. So
 *    `namespaceImports` resolves relative `import * as` specifiers to their module file, and a
 *    symbol is additionally live when a non-test, non-barrel file namespace-imports its module
 *    and mentions `alias.symbol` in comment- and string-stripped code. Only relative specifiers
 *    resolve: a namespace import of a *package* lands on its barrel, which proves reachability,
 *    not use, exactly as `isBarrel` already rules.
 * 3. **Unreadable input throws — it never skips (R24).** The repository's `grep` wraps
 *    `ugrep -I`, which silently skips NUL-carrying files; five source files carried raw NUL bytes
 *    until `f78dc42`, and every grep over them reported clean silence. The original reads with
 *    `readFileSync(path, 'utf8')`, which replaces undecodable sequences with U+FFFD — also
 *    silently. A scanner that skips (or silently mangles) one file reports that file's exports
 *    dead or alive *by omission*, which is exactly the negative-finding-from-a-silent-instrument
 *    shape wave 12's rule 5 forbids. So `readSource` below refuses a NUL byte and refuses
 *    invalid UTF-8, loudly, with the file named. The `readdirSync` catch in `sourceFiles` is
 *    kept, because it covers a different case the original documents — an absent sibling
 *    package is absent, not unreadable.
 *
 * Everything else is behaviour-preserving, and the behaviours that make the count mean something
 * are the original's:
 *
 * - `sourceFiles` walks `packages/`, skipping `node_modules`, `dist` and dotted entries.
 * - `isTest` excludes `*.test.ts` **and** `*.test-helper.ts`.
 * - `isBarrel` excludes any `index.ts` and any package's `src/browser.ts` — a barrel by role.
 * - `boundNames` counts only real `import`/`export … from` bindings; a `{@link}` tag is not a
 *   caller, and neither is a bare textual match.
 * - `code` strips comments **and string literals**, keeping template interpolations, so a symbol
 *   naming itself in its own error message does not read as self-used.
 * - `auditModules` is **non-recursive**: each entry names one directory.
 * - A symbol is live when used more than once in its own stripped file, or bound by any
 *   non-test, non-barrel file anywhere in the tree.
 * - The known blind spot is inherited too: liveness can be two hops long and die at the second
 *   (§ D125). The suite that uses this helper states instances rather than papering over them.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo's `packages/` directory. */
export const PACKAGES_DIR = fileURLToPath(new URL('../../', import.meta.url));

/** Refuses to decode replacement-character-silently; an invalid byte sequence throws. */
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * The file's text, or a loud failure. Never a silent skip and never a silent mangle — see the
 * header's divergence 3 (R24).
 */
export function readSource(path: string): string {
  const bytes = readFileSync(path);
  if (bytes.includes(0)) {
    throw new Error(
      `deadCode audit: ${path} contains a raw NUL byte. Refusing to scan it, because the last ` +
        'time NUL-carrying sources existed (fixed in f78dc42) the repository grep skipped them ' +
        'silently and every negative finding over them was worthless. Fix the file, then re-run.',
    );
  }
  try {
    return utf8.decode(bytes);
  } catch {
    throw new Error(
      `deadCode audit: ${path} is not valid UTF-8. Refusing to scan a mangled decoding of it — ` +
        'a symbol name split by a replacement character reads as absent, and absent reads as dead.',
    );
  }
}

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

/**
 * A file whose job is to re-export, and which therefore proves *reachability* rather than *use*:
 * `index.ts` anywhere, plus any package's `src/browser.ts` — a barrel by role and not by name.
 * The original's header carries the incident that makes the second clause load-bearing
 * (§ D33 § *One thing the split nearly broke, silently*).
 */
export const isBarrel = (path: string): boolean =>
  basename(path) === 'index.ts' || path.replace(/\\/g, '/').endsWith('/src/browser.ts');

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
 * error message can read as a use. Template **interpolations are kept**, because `${runRound(…)}`
 * is code. Everything between the quotes is not. (The original's header carries the measured
 * incident: under a comment-only strip, `randomSearch` naming itself in its own `SearchError`
 * message read as self-use, and deleting the CLI's real import left the audit fully green.)
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

/**
 * `import * as alias from './relative.js'` bindings — alias, mapped to the absolute path of the
 * `.ts` module it resolves to. Divergence 2: a namespace import binds every export of a module at
 * once, so it cannot appear in `boundNames`' name-keyed answer, and `render/canvas.ts` consumes
 * the entire palette this way.
 *
 * Only **relative** specifiers resolve. A namespace import of a package specifier lands on that
 * package's barrel — reachability, not use — and is deliberately not counted, for `isBarrel`'s
 * reason.
 */
export function namespaceImports(path: string, source: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const clause = /import\s+(?:type\s+)?\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(clause)) {
    const alias = match[1];
    const specifier = match[2];
    if (alias === undefined || specifier === undefined || !specifier.startsWith('.')) continue;
    out.set(alias, join(dirname(path), specifier).replace(/\.js$/, '.ts'));
  }
  return out;
}

/** Every `src/` file in the monorepo, with its text and its bound names, read once. */
export interface Corpus {
  readonly files: readonly string[];
  text(path: string): string;
  bindings(path: string): ReadonlySet<string>;
  /** Divergence 2 — see {@link namespaceImports}. */
  namespaces(path: string): ReadonlyMap<string, string>;
}

export function corpus(root: string = PACKAGES_DIR): Corpus {
  const files = sourceFiles(root).filter((path) => path.includes(`${'/'}src${'/'}`));
  const sources = new Map(files.map((path) => [path, readSource(path)]));
  const bindings = new Map(files.map((path) => [path, boundNames(sources.get(path) ?? '')]));
  const namespaces = new Map(
    files.map((path) => [path, namespaceImports(path, sources.get(path) ?? '')]),
  );
  return {
    files,
    text: (path) => sources.get(path) ?? '',
    bindings: (path) => bindings.get(path) ?? new Set<string>(),
    namespaces: (path) => namespaces.get(path) ?? new Map<string, string>(),
  };
}

/**
 * Files that bind `name` and are neither a test nor a barrel — the non-test callers, by the
 * definition above. Paths are relative to `packages/`, so a failure message names the file.
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
 * One exported declaration, at the start of a line. The widened form — with the `async`
 * alternative the original added for `export async function` — not `core`'s narrower one.
 *
 * What this pattern **cannot see**, said here because `dev/main.ts` is in scope: an export
 * *clause* (`export { applyDeepLink, randomSeed }` at the bottom of a file, no `from`) declares
 * nothing at the start of a line, so symbols exported that way are invisible to the symbol walk
 * — and to `boundNames`, which requires a `from`. The suite that uses this helper states which
 * files that limitation touches rather than letting it read as coverage.
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
 * A symbol is **live** when it is used inside its own file (two occurrences of the name in
 * comment- and string-stripped source: the export and a use), when a sibling in the same module
 * imports it, or when anything outside the module does. A barrel re-export is not a caller, and
 * neither is a `*.test.ts` or a `*.test-helper.ts`.
 *
 * **The self-use rule's known blind spot is inherited, not fixed here** — a dead symbol calling a
 * sibling in the same file makes that sibling read as self-used, so liveness can be two hops long
 * and die at the second. Widening to a reachability analysis would re-introduce exactly what the
 * allowlists exist to prevent: *reachable* was true of every dead seam. See § D125.
 *
 * @param modules paths relative to `packages/`, e.g. `viz/src/render`. Not recursive: each names
 *   one directory, so a submodule is audited by naming it.
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
      if (scope.bindings(path).has(symbol.name)) return true;
      // Divergence 2: `import * as alias` of this symbol's module, plus a real `alias.symbol`
      // member access in comment- and string-stripped code, is a caller.
      for (const [alias, module] of scope.namespaces(path)) {
        if (module !== own) continue;
        if (new RegExp(`\\b${alias}\\.${symbol.name}\\b`).test(code(scope.text(path)))) return true;
      }
      return false;
    });
  });

  return { symbols, uncalled };
}
