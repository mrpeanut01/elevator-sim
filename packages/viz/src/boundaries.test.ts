/**
 * The boundaries this package promises to keep, checked mechanically.
 *
 * Every one of these is a rule that a reviewer could only otherwise enforce by reading, and
 * this repository's own history says reading is not enough: agents have reported green suites
 * that were red and fixes that were not applied. So the rules are greps, and they run in CI.
 *
 * 1. **`core` does not know this package exists** — CLAUDE.md invariant 6. Checked here as a
 *    grep over `packages/core/src` and `packages/experiments/src`. (The *strong* form —
 *    physically removing `packages/viz` and rebuilding — is a manual gate recorded in the
 *    delivery report; this is the regression that catches a reverse import being added later.)
 * 2. **Wall-clock time enters through `DisplayClock` and nowhere else.** The renderer is
 *    allowed a clock; that is what distinguishes it from `core`. But if `Date.now()` could
 *    appear anywhere, the replay criterion would be one careless edit away from being
 *    untestable, so the clock has exactly one home.
 * 3. **The DOM is confined to `src/dev/`.** Everything that produces or draws a frame runs
 *    under Node, which is why the whole package is testable without a browser.
 * 4. **No `node:` import outside the dev entry point and the test helpers.** The contract, the
 *    frame producer, playback and the renderer must all be loadable in a browser bundle.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const VIZ_SRC = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Comments removed, so a rule is about *code* rather than about prose.
 *
 * This matters more than it sounds. Half the value of these files is their docstrings, and a
 * docstring that explains why `requestAnimationFrame` lives in the dev entry point must not
 * trip the rule that keeps it there. Naming the thing you are avoiding is how the avoidance
 * stays understood.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * String *contents* removed, so a rule is about code rather than about prose — including the
 * prose a program prints.
 *
 * The same argument as {@link stripComments}, extended to the place the argument actually bites.
 * Wave 2's viewer says `the document is not a JSON object` when a load fails and draws
 * `showing 6 of 12 shafts — widen the window`, and under a raw grep for `\bdocument\b` and
 * `\bwindow\b` both of those are DOM access in a module that has none. Loosening the pattern
 * instead — matching only `document.` and `window.` — would have been the cheaper fix and a
 * worse one: it stops catching a bare `document` passed as a value, which is exactly the shape
 * of the one real finding this rule produced (a method parameter named `document`, shadowing the
 * global, in `editorHistory.ts`).
 *
 * Template literals keep their `${…}` substitutions, because those are code.
 *
 * A character scanner rather than a set of regular expressions, and that is not fastidiousness:
 * the regex version of this function was written first, and its middle-of-template pattern —
 * `/\}…`/` — anchored on *any* closing brace in the file and then ate everything up to the next
 * backtick, which silenced the whole of `dev/main.ts`. The positive control below is what caught
 * it, before the loosened rule could pass a file that really did touch the DOM.
 */
function stripStringLiterals(text: string): string {
  let out = '';
  let index = 0;
  /** Depth of `${ … }` nesting inside template literals, innermost last. */
  const templateDepths: number[] = [];
  let braceDepth = 0;

  while (index < text.length) {
    const char = text[index] ?? '';

    if (char === '\\') {
      out += '  ';
      index += 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      out += quote;
      index += 1;
      while (index < text.length && text[index] !== quote && text[index] !== '\n') {
        index += text[index] === '\\' ? 2 : 1;
      }
      out += quote;
      index += 1;
      continue;
    }

    if (char === '`') {
      out += '`';
      index += 1;
      // Consume template text, stopping at `${` (code resumes) or the closing backtick.
      while (index < text.length) {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index] === '`') {
          out += '`';
          index += 1;
          break;
        }
        if (text[index] === '$' && text[index + 1] === '{') {
          out += '${';
          index += 2;
          templateDepths.push(braceDepth);
          braceDepth += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '{') braceDepth += 1;
    if (char === '}') {
      braceDepth -= 1;
      const resume = templateDepths[templateDepths.length - 1];
      if (resume !== undefined && braceDepth === resume) {
        // Back into template text: emit the brace, then keep consuming literal characters.
        templateDepths.pop();
        out += '}';
        index += 1;
        while (index < text.length) {
          if (text[index] === '\\') {
            index += 2;
            continue;
          }
          if (text[index] === '`') {
            out += '`';
            index += 1;
            break;
          }
          if (text[index] === '$' && text[index + 1] === '{') {
            out += '${';
            index += 2;
            templateDepths.push(braceDepth);
            braceDepth += 1;
            break;
          }
          index += 1;
        }
        continue;
      }
    }

    out += char;
    index += 1;
  }
  return out;
}

interface SourceFile {
  /** Path relative to `packages/viz/src`, with forward slashes. */
  readonly id: string;
  /** Source with comments removed. */
  readonly code: string;
  /** Source with comments *and* string contents removed. */
  readonly identifiers: string;
}

async function vizSources(): Promise<readonly SourceFile[]> {
  const files = await walk(VIZ_SRC);
  return Promise.all(
    files.map(async (path) => {
      const code = stripComments(await readFile(path, 'utf8'));
      return {
        id: relative(VIZ_SRC, path).split('\\').join('/'),
        code,
        identifiers: stripStringLiterals(code),
      };
    }),
  );
}

/** The DOM globals a browser-free module must not name. */
const DOM_PATTERN = /\b(?:document|window|requestAnimationFrame|HTMLCanvasElement)\b/;

/** Files whose job is to touch the outside world. */
const isTest = (id: string): boolean => id.endsWith('.test.ts') || id.endsWith('.test-helper.ts');
const isDev = (id: string): boolean => id.startsWith('dev/');

describe('CLAUDE.md invariant 6 — core never depends on viz', () => {
  it('has no reference to viz anywhere in core or experiments sources', async () => {
    const offenders: string[] = [];
    for (const pkg of ['core', 'experiments']) {
      const dir = join(REPO_ROOT, 'packages', pkg, 'src');
      for (const path of await walk(dir)) {
        const text = stripComments(await readFile(path, 'utf8'));
        for (const [index, line] of text.split('\n').entries()) {
          /* Import specifiers and package names only, over comment-stripped source: a prose
             mention of Phase 4's web viewer in a docstring is not a dependency, and banning
             the word would be theatre. */
          if (/@elevator-sim\/viz|from\s+['"][^'"]*\bviz\b|packages\/viz/.test(line)) {
            offenders.push(`${relative(REPO_ROOT, path)}:${String(index + 1)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the wall clock has exactly one home', () => {
  it('is read only in playback/clock.ts', async () => {
    const offenders = (await vizSources())
      .filter((file) => file.id !== 'playback/clock.ts' && !isTest(file.id))
      .filter((file) => /\b(?:Date\.now|performance\.now)\s*\(/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('schedules no timers anywhere, so tests never wait', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => /\b(?:setTimeout|setInterval)\s*\(/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });
});

describe('the DOM is confined to the dev entry point', () => {
  it('is not touched by the contract, the frame producer, playback, the renderer or the editor', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => DOM_PATTERN.test(file.identifiers))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('positive control: the rule still catches the entry point that does touch the DOM', async () => {
    // Without this, stripping strings could quietly turn the rule above into a rule that passes
    // because it matches nothing. `dev/main.ts` and `dev/editor.ts` are the two files in the
    // package that genuinely use the DOM, and both must still trip the pattern after stripping.
    const sources = await vizSources();
    for (const id of ['dev/main.ts', 'dev/editor.ts']) {
      const file = sources.find((candidate) => candidate.id === id);
      expect(file, `${id} is missing`).toBeDefined();
      expect(DOM_PATTERN.test(file?.identifiers ?? ''), `${id} should trip the DOM rule`).toBe(
        true,
      );
    }
  });

  it('positive control: a bare `document` identifier is caught, not only `document.`', async () => {
    // The finding this rule actually produced was a method parameter named `document`, which is
    // never followed by a dot. A pattern that only matched member access would have missed it.
    expect(DOM_PATTERN.test(stripStringLiterals('function f(document) { return document; }'))).toBe(
      true,
    );
    expect(DOM_PATTERN.test(stripStringLiterals("const message = 'the document is empty';"))).toBe(
      false,
    );
    expect(DOM_PATTERN.test(stripStringLiterals('const t = `widen the window`;'))).toBe(false);
    // …and a substitution inside a template literal is still code.
    expect(DOM_PATTERN.test(stripStringLiterals('const t = `w ${window.innerWidth} px`;'))).toBe(
      true,
    );
  });
});

describe('the browser-facing modules import no node builtins', () => {
  it('leaves `node:` to the dev entry point and the test helpers', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => /from\s+['"]node:/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('reaches core through the browser subpath, so the types match the bundle', async () => {
    // `core`'s default entry re-exports `loadConfig`, which imports `node:fs/promises`. The
    // package's `browser` export condition already routes a bundler to the fs-free barrel, so a
    // bare specifier produces a correct *bundle* — but TypeScript's NodeNext resolution does not
    // apply that condition, so a browser file importing the bare specifier still SEES `loadConfig`
    // in its types. Calling it would typecheck and fail at runtime. The explicit subpath closes
    // that gap. Test helpers and the dev entry's data loader legitimately run under Node.
    const offenders = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => /from\s+['"]@elevator-sim\/core['"]/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('positive control: the rule catches a bare-specifier import', () => {
    const bare = "import type { SimTime } from '@elevator-sim/core';";
    const subpath = "import type { SimTime } from '@elevator-sim/core/browser';";
    expect(/from\s+['"]@elevator-sim\/core['"]/.test(bare)).toBe(true);
    expect(/from\s+['"]@elevator-sim\/core['"]/.test(subpath)).toBe(false);
  });

  it('does not reach into another workspace package’s source', async () => {
    // `viz` depends on `core` and on nothing else in the repository. A deep import of `cli` or
    // `experiments` would make the browser bundle drag in `node:fs`.
    const offenders = (await vizSources())
      .filter((file) => /@elevator-sim\/(?:cli|experiments)/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });
});
