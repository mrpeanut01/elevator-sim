/**
 * **The build-staleness guard's own states, driven rather than argued.**
 *
 * `fixtures.test-helper.ts#assertCoreBuilt` refuses to compare the serial and worker executors
 * against a `packages/core/dist` that is behind `packages/core/src`, because a worker resolves
 * `@elevator-sim/core` to the built output while vitest resolves it to the source. The guard is
 * right to exist. What it could not do until GitHub issue **#323** was tell the difference between
 * *the build is behind the sources* and *the sources were rewritten with the same bytes*, and the
 * remedy it named — `npx tsc -b` — cleared only the first.
 *
 * That gap survived because the guard reached the real repository directly, so exercising it meant
 * breaking the working tree. {@link coreBuildState} takes a directory instead, and every case here
 * lays out a `src`/`dist` pair with the mtimes the state needs. The table below is the measured
 * sequence from #323's report, one case per row:
 *
 * | what happened | `src` | emitted `.js` | `.tsbuildinfo` | verdict |
 * |---|---|---|---|---|
 * | `tsc -b` emitted | older | newest | newest | current |
 * | a source was edited | newest | older | older | stale |
 * | **a merge moved mtimes, then `tsc -b` ran** | middle | oldest | **newest** | **current** |
 * | `dist` holds no JavaScript | older | absent | newest | missing |
 *
 * The third row is the defect. `tsc -b` is content-incremental: it reads `.tsbuildinfo`, sees that
 * no source text changed, declines to re-emit, and rewrites that one file. The old guard watched
 * the `.js` files alone, so it stayed red through a remedy that had in fact done everything there
 * was to do.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { assertCoreBuilt, coreBuildState } from './fixtures.test-helper.js';

/** Seconds, not milliseconds: `utimesSync` reads a bare number as a Unix timestamp. */
const BUILT = 2_000_000;
const BEFORE = BUILT - 100;
const AFTER = BUILT + 100;
const RECONCILED = BUILT + 200;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

/** Lay out a `src`/`dist` pair whose files carry the mtimes each case needs. */
function treeOf(layout: {
  readonly src?: Readonly<Record<string, number>>;
  readonly dist?: Readonly<Record<string, number>>;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'core-build-state-'));
  roots.push(root);
  for (const half of ['src', 'dist'] as const) {
    for (const [rel, at] of Object.entries(layout[half] ?? {})) {
      const path = join(root, half, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, '');
      utimesSync(path, at, at);
    }
  }
  return root;
}

describe('coreBuildState', () => {
  it('calls a build current when the emitted output is newer than every source', () => {
    const root = treeOf({
      src: { 'index.ts': BEFORE },
      dist: { 'index.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(coreBuildState(root)).toBe('current');
  });

  it('calls a build stale when a source moved after the last reconciliation', () => {
    const root = treeOf({
      src: { 'index.ts': AFTER },
      dist: { 'index.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(coreBuildState(root)).toBe('stale');
  });

  /*
   * #323, in one case. A merge stamps the working tree with the checkout time without changing a
   * byte; `tsc -b` then rewrites `.tsbuildinfo` and re-emits nothing, because nothing needs
   * re-emitting. Watching only the emitted files reads that as a build that never happened.
   */
  it('accepts a reconciliation that re-emitted nothing, which is what a no-op `tsc -b` leaves', () => {
    const root = treeOf({
      src: { 'index.ts': AFTER },
      dist: { 'index.js': BUILT, '.tsbuildinfo': RECONCILED },
    });
    expect(
      coreBuildState(root),
      'a no-op `tsc -b` rewrites `.tsbuildinfo` alone, so a guard that ignores it can never be ' +
        'cleared by the command it names',
    ).toBe('current');
  });

  it('does not let a stale `.tsbuildinfo` drag the marker back behind the emitted output', () => {
    const root = treeOf({
      src: { 'index.ts': BUILT },
      dist: { 'index.js': AFTER, '.tsbuildinfo': BEFORE },
    });
    expect(coreBuildState(root)).toBe('current');
  });

  it('calls a `dist` holding no JavaScript missing, whatever its `.tsbuildinfo` claims', () => {
    const root = treeOf({ src: { 'index.ts': BEFORE }, dist: { '.tsbuildinfo': RECONCILED } });
    expect(coreBuildState(root)).toBe('missing');
  });

  it('calls an absent `dist` missing rather than current', () => {
    expect(coreBuildState(treeOf({ src: { 'index.ts': BEFORE } }))).toBe('missing');
  });

  it('does not count a test or a test helper as a source', () => {
    const root = treeOf({
      src: { 'index.ts': BEFORE, 'index.test.ts': AFTER, 'fixtures.test-helper.ts': AFTER },
      dist: { 'index.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(
      coreBuildState(root),
      'a test edited after the build changes nothing a worker thread loads',
    ).toBe('current');
  });

  it('walks nested directories on both sides', () => {
    const stale = treeOf({
      src: { 'sim/kernel/queue.ts': AFTER },
      dist: { 'sim/kernel/queue.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(coreBuildState(stale)).toBe('stale');

    const current = treeOf({
      src: { 'sim/kernel/queue.ts': BEFORE },
      dist: { 'sim/kernel/queue.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(coreBuildState(current)).toBe('current');
  });
});

describe('assertCoreBuilt', () => {
  /*
   * The fix's one silent precondition, made mechanical rather than assumed. `coreBuildState` reads
   * the reconciliation marker out of `dist/`, so a `tsBuildInfoFile` moved elsewhere would take the
   * marker with it, leave `reconciled === emitted`, and quietly restore the behaviour #323 reports —
   * with nothing red to say so. This case is what says so.
   */
  it('finds core’s reconciliation marker where the guard looks for it', () => {
    const tsconfig = fileURLToPath(new URL('../../../core/tsconfig.json', import.meta.url));
    const parsed: unknown = JSON.parse(readFileSync(tsconfig, 'utf8'));
    const options = (parsed as { compilerOptions?: { tsBuildInfoFile?: unknown } }).compilerOptions;
    expect(
      options?.tsBuildInfoFile,
      'the guard scans `dist/` for the marker, so moving it out of `dist/` silently reverts #323',
    ).toMatch(/^dist\//u);
  });

  it('passes on this repository, which the suite around it needs built anyway', () => {
    expect(() => {
      assertCoreBuilt();
    }).not.toThrow();
  });

  /*
   * The messages name `packages/core` even when the guard is pointed at a fixture, because the
   * parameter exists for these cases and the reader who meets the message is always looking at the
   * real one.
   */
  it('names a remedy that clears the state it describes', () => {
    const root = treeOf({
      src: { 'index.ts': AFTER },
      dist: { 'index.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(() => {
      assertCoreBuilt(root);
    }).toThrow(/Run `npx tsc -b` first/u);
    expect(() => {
      assertCoreBuilt(root);
    }).toThrow(/clears this even when it decides nothing needs re-emitting/u);
  });

  it('tells a missing build apart from a stale one, because the reader does different things', () => {
    const root = treeOf({ src: { 'index.ts': BEFORE } });
    expect(() => {
      assertCoreBuilt(root);
    }).toThrow(/packages\/core\/dist is missing/u);
  });

  it('says nothing when the build is current', () => {
    const root = treeOf({
      src: { 'index.ts': BEFORE },
      dist: { 'index.js': BUILT, '.tsbuildinfo': BUILT },
    });
    expect(() => {
      assertCoreBuilt(root);
    }).not.toThrow();
  });
});
