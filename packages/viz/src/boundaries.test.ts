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

interface SourceFile {
  /** Path relative to `packages/viz/src`, with forward slashes. */
  readonly id: string;
  /** Source with comments removed. */
  readonly code: string;
}

async function vizSources(): Promise<readonly SourceFile[]> {
  const files = await walk(VIZ_SRC);
  return Promise.all(
    files.map(async (path) => ({
      id: relative(VIZ_SRC, path).split('\\').join('/'),
      code: stripComments(await readFile(path, 'utf8')),
    })),
  );
}

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
  it('is not touched by the contract, the frame producer, playback or the renderer', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => /\b(?:document|window|requestAnimationFrame|HTMLCanvasElement)\b/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
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

  it('does not reach into another workspace package’s source', async () => {
    // `viz` depends on `core` and on nothing else in the repository. A deep import of `cli` or
    // `experiments` would make the browser bundle drag in `node:fs`.
    const offenders = (await vizSources())
      .filter((file) => /@elevator-sim\/(?:cli|experiments)/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });
});
