/**
 * **Finding every object literal in the tree that is a `SimulationConfig`.**
 *
 * The scanner behind `shippedRunConfig.test.ts`, and it exists for the same reason
 * `tuning/callers.test-helper.ts` does: the question *"which files produce a run config?"* has a
 * hand-written answer in this repository's documentation, and a hand-written answer is a list that
 * drifts. The UI readiness audit of 2026-08-10 wrote *"five hand-written literals in five files"*
 * in one place and *"nine independent literals in nine files"* in another. Measured here, on the
 * tree that audit was taken from, it is **23 literals in 19 files** — so both counts were wrong,
 * and neither was wrong because somebody was careless. They were wrong because counting by hand is
 * the defect, not the transcription.
 *
 * `src/index.test.ts`'s study-entry-point block is the precedent and the pattern: *iterate a
 * categorical's own domain rather than a copy of it, so a member added tomorrow is in scope today.*
 *
 * ## Why this is not the TypeScript AST
 *
 * It would be, if the AST were a stable dependency. The repository is on TypeScript 7, whose
 * parser is reachable only through `typescript/unstable/ast` — a path whose own name says it may
 * move under a patch bump. A guard whose domain silently empties when a dependency moves is the
 * failure mode this file was written to close, so the scanner is hand-rolled, and the two ways it
 * could silently under-report are asserted rather than assumed:
 *
 * 1. **Brace balance.** {@link scanFile} reports the depth its brace walk finishes at. A file whose
 *    braces do not balance to zero has been mis-lexed — an unrecognised regular expression, most
 *    likely — and the suite fails on it rather than scanning it wrong. That is the check the audit's
 *    own instrument did not have when its car-id lookup resolved 0 of 79 cars in all 8 buildings and
 *    reported everything clean.
 * 2. **Non-vacuity.** The suite pins named members of the domain, so a scanner that stops matching
 *    cannot pass by finding nothing.
 *
 * ## What counts as a `SimulationConfig` literal
 *
 * An object literal, in a non-test non-barrel `.ts` file under `packages/⁎/src`, that
 *
 * - names **no** key `SimulationConfig` does not declare, and
 * - names at least **three of its four required fields** directly, rather than through a spread.
 *
 * Both halves are load-bearing and both are derived from `core/src/sim/types.ts` rather than
 * transcribed here.
 *
 * The **foreign-key** half is what separates a config from an argument object that happens to carry
 * a building and a profile. `viz/src/campaign/stageRun.ts#demonstrationConfigFor` takes a
 * `DemonstrationInput` — `{ stage, building, dispatcherProfile, trafficProfiles, … }` — and returns
 * the `SimulationConfig`; its two call sites would otherwise read as producers that forgot the
 * field, when the field is set once in the function they call. `stage` is not a `SimulationConfig`
 * member, and that is the whole of the discrimination. It is sound rather than heuristic:
 * TypeScript's excess-property check forbids a literal assigned to `SimulationConfig` from carrying
 * a key the interface does not declare, so *a literal with a foreign key is not one*.
 *
 * The **three-of-four** half admits the producers that legitimately leave `seed` to the caller —
 * `viz/src/batch/runBatch.ts` and `experiments/src/runner/experiment.ts` both build the cell and let
 * the replication loop stamp the seed — while excluding a literal that merely spreads a finished
 * config and overrides one field. `viz/src/honesty/run.ts#comparisonConfigFor` is the worked
 * example: `{ ...recordingConfigFor(…), dispatcherProfile, runId }` inherits its `onTimeout` from
 * the spread, and demanding one of its own would be demanding a second copy of a decision.
 *
 * **The residual gap, stated rather than papered over:** a producer that spreads a base object
 * carrying `building`, `dispatcherProfile` and `trafficProfiles` while adding only a seed is
 * indistinguishable here from a derived config, and would not be scanned. No such producer exists on
 * this tree. If one is written, it inherits whatever the base sets, which is the same answer the
 * scanner would give.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo's `packages/` directory. */
export const PACKAGES_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Comments and string bodies replaced by spaces, **character for character**.
 *
 * `tuning/callers.test-helper.ts#code` does the same job and cannot be reused, for one reason that
 * matters: it *removes* what it strips, so an offset in its output does not name a position in the
 * source. This suite has to read `onTimeout`'s initializer back out of the original text — the
 * difference between `'report'` and `'throw'` is the entire property — so the blanking preserves
 * length and newlines, and every offset means the same thing on both sides.
 *
 * Comments go, string and template *bodies* go, and `${…}` interpolations stay because they are
 * code. Regular expressions are recognised too, and that is not fussiness: `/\{/` inside a
 * `.replace()` would otherwise open a brace that never closes and silently shift every literal
 * after it in the file. `scanFile` reports the finishing depth so a mis-lex is loud.
 */
export function blankNonCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };

  let index = 0;

  /** A `/` opens a regular expression only where an operand cannot already have ended. */
  const regexAllowed = (): boolean => {
    for (let j = index - 1; j >= 0; j -= 1) {
      const char = source[j] ?? '';
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue;
      return !/[\w$)\]'"`]/u.test(char);
    }
    return true;
  };

  const quoted = (start: number): number => {
    const quote = source[start];
    let position = start + 1;
    while (position < source.length) {
      const char = source[position];
      if (char === '\\') {
        position += 2;
        continue;
      }
      if (char === quote || char === '\n') {
        blank(start + 1, position);
        return position + 1;
      }
      position += 1;
    }
    blank(start + 1, position);
    return position;
  };

  const template = (start: number): number => {
    let position = start + 1;
    let textFrom = position;
    while (position < source.length) {
      const char = source[position];
      if (char === '\\') {
        position += 2;
        continue;
      }
      if (char === '`') {
        blank(textFrom, position);
        return position + 1;
      }
      if (char === '$' && source[position + 1] === '{') {
        blank(textFrom, position);
        let depth = 1;
        let cursor = position + 2;
        while (cursor < source.length && depth > 0) {
          const inner = source[cursor];
          if (inner === '{') depth += 1;
          else if (inner === '}') depth -= 1;
          else if (inner === '`') cursor = template(cursor) - 1;
          else if (inner === "'" || inner === '"') cursor = quoted(cursor) - 1;
          cursor += 1;
        }
        position = cursor;
        textFrom = position;
        continue;
      }
      position += 1;
    }
    blank(textFrom, position);
    return position;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      const from = index;
      while (index < source.length && source[index] !== '\n') index += 1;
      blank(from, index);
      continue;
    }
    if (char === '/' && next === '*') {
      const from = index;
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      blank(from, index);
      continue;
    }
    if (char === "'" || char === '"') {
      index = quoted(index);
      continue;
    }
    if (char === '`') {
      index = template(index);
      continue;
    }
    if (char === '/' && regexAllowed()) {
      const from = index;
      let position = index + 1;
      let inClass = false;
      let closed = false;
      while (position < source.length) {
        const inner = source[position];
        if (inner === '\\') {
          position += 2;
          continue;
        }
        if (inner === '\n') break;
        if (inner === '[') inClass = true;
        else if (inner === ']') inClass = false;
        else if (inner === '/' && !inClass) {
          closed = true;
          position += 1;
          break;
        }
        position += 1;
      }
      if (closed) {
        blank(from + 1, position - 1);
        index = position;
        continue;
      }
    }
    index += 1;
  }

  return out.join('');
}

/** `SimulationConfig`'s surface, read off the interface rather than transcribed. */
export interface ConfigShape {
  /** Every declared member name. A literal naming anything else is not a `SimulationConfig`. */
  readonly members: ReadonlySet<string>;
  /** The members with no `?`. Four, at the time of writing; the interface is the authority. */
  readonly required: readonly string[];
}

/** `core/src/sim/types.ts`'s `SimulationConfig`, parsed. */
export function configShape(): ConfigShape {
  const path = join(PACKAGES_DIR, 'core/src/sim/types.ts');
  const source = blankNonCode(readFileSync(path, 'utf8'));
  const declaration = source.indexOf('export interface SimulationConfig {');
  if (declaration < 0) {
    throw new Error(
      'core/src/sim/types.ts no longer declares `export interface SimulationConfig {`; this ' +
        'scanner has stopped being able to see the interface it derives its domain from.',
    );
  }
  const open = source.indexOf('{', declaration);
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }

  const members = new Set<string>();
  const required: string[] = [];
  let nesting = 0;
  let line = '';
  for (let i = open + 1; i < close; i += 1) {
    const char = source[i];
    if (char === '{' || char === '(' || char === '[') nesting += 1;
    else if (char === '}' || char === ')' || char === ']') nesting -= 1;
    if (char !== '\n') {
      line += char;
      continue;
    }
    const member = /^\s*readonly\s+([A-Za-z_$][\w$]*)(\??)\s*:/u.exec(line);
    if (member !== null && nesting === 0) {
      members.add(member[1] ?? '');
      if (member[2] === '') required.push(member[1] ?? '');
    }
    line = '';
  }
  return { members, required };
}

/** One object literal the scanner believes is a `SimulationConfig`. */
export interface RunConfigLiteral {
  /** Relative to `packages/`, so a failure message names the file. */
  readonly file: string;
  /** 1-based line of the literal's opening brace. */
  readonly line: number;
  /** `onTimeout`'s initializer text, verbatim, or `undefined` when the literal omits the field. */
  readonly onTimeout: string | undefined;
}

/** Every `.ts` file under `root`, skipping `node_modules`, `dist` and dotted directories. */
function sourceFiles(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
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

/** A file whose job is to re-export. `tuning/callers.test-helper.ts#isBarrel`'s definition. */
const isBarrel = (path: string): boolean =>
  path.replace(/\\/gu, '/').endsWith('/index.ts') ||
  path.replace(/\\/gu, '/').endsWith('/src/browser.ts');

/** What one file yielded, and whether the brace walk finished where it started. */
export interface FileScan {
  readonly literals: readonly RunConfigLiteral[];
  /** Zero when the file lexed cleanly. Anything else means the scan of this file is not evidence. */
  readonly finalDepth: number;
}

/** The literals in one file, and the brace depth the walk finished at. */
export function scanFile(path: string, shape: ConfigShape): FileScan {
  const raw = readFileSync(path, 'utf8');
  const source = blankNonCode(raw);
  const relativePath = relative(PACKAGES_DIR, path);

  const stack: number[] = [];
  const spans: (readonly [number, number])[] = [];
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '{') {
      stack.push(i);
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      const open = stack.pop();
      if (open !== undefined) spans.push([open, i]);
    }
  }

  const literals: RunConfigLiteral[] = [];
  for (const [open, close] of spans) {
    /* The literal's own level, with every nested construct blanked so a nested key cannot count. */
    let nesting = 0;
    let level = '';
    for (let i = open + 1; i < close; i += 1) {
      const char = source[i];
      if (char === '{' || char === '(' || char === '[') {
        nesting += 1;
        level += ' ';
        continue;
      }
      if (char === '}' || char === ')' || char === ']') {
        nesting -= 1;
        level += ' ';
        continue;
      }
      level += nesting === 0 ? char : ' ';
    }

    const names = new Set<string>();
    for (const part of level.split(',')) {
      const key = /^\s*([A-Za-z_$][\w$]*)\s*(:|$)/u.exec(part);
      if (key !== null) names.add(key[1] ?? '');
    }

    if ([...names].some((name) => !shape.members.has(name))) continue;
    const supplied = shape.required.filter((name) => names.has(name));
    if (supplied.length < shape.required.length - 1) continue;

    const initializer = /onTimeout\s*:\s*([^,\n}]*)/u.exec(raw.slice(open, close + 1));
    literals.push({
      file: relativePath,
      line: raw.slice(0, open).split('\n').length,
      onTimeout: initializer?.[1]?.trim(),
    });
  }

  return { literals, finalDepth: depth };
}

/** Every non-test, non-barrel source file the scan covers, outside `core/`. */
export function scannedFiles(): readonly string[] {
  const core = join(PACKAGES_DIR, 'core/src/');
  return sourceFiles(PACKAGES_DIR)
    .filter((path) => path.includes(`${'/'}src${'/'}`))
    .filter((path) => !isTest(path) && !isBarrel(path))
    .filter((path) => !path.startsWith(core))
    .sort();
}

/**
 * Every `src/` file in the monorepo, tests and barrels included.
 *
 * The superset of {@link scannedFiles}, and it exists for one job: proving that an *empty* result
 * over the scanned set is a measurement rather than a broken query. A search that finds nothing
 * looks identical whether the tree is clean or the search is wrong, and this is how the two are told
 * apart.
 */
export function allSourceFiles(): readonly string[] {
  return sourceFiles(PACKAGES_DIR)
    .filter((path) => path.includes(`${'/'}src${'/'}`))
    .sort();
}
