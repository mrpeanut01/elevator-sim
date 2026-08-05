/**
 * The static layer's three decisions: what a path resolves to, what may be cached, and what a
 * missing build does.
 *
 * The last one is the one worth a test. A server that starts with no viewer and answers every page
 * request with a 404 is indistinguishable, from outside, from a viewer that is broken — and the
 * person reading the report is looking at the wrong repository the whole time.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assetFor, cacheControlFor, loadStaticBundle, type StaticBundle } from './static.js';

let scratch: string;
let bundle: StaticBundle;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-static-'));
  await mkdir(join(scratch, 'build', 'assets'), { recursive: true });
  await writeFile(join(scratch, 'build', 'index.html'), '<!doctype html><title>viewer</title>');
  await writeFile(join(scratch, 'build', '__buildings.json'), '{"files":[]}');
  await writeFile(join(scratch, 'build', 'assets', 'index-D0X0Ej_j.js'), 'export const x = 1;');
  bundle = await loadStaticBundle(join(scratch, 'build'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('resolving a path', () => {
  it('serves the document at the root', () => {
    expect(assetFor(bundle, '/')?.contentType).toBe('text/html; charset=utf-8');
    expect(assetFor(bundle, '/index.html')).toBeDefined();
  });

  it('serves a nested asset by its exact path', () => {
    expect(assetFor(bundle, '/assets/index-D0X0Ej_j.js')?.contentType).toBe('text/javascript; charset=utf-8');
  });

  it('does not fall back to the document for an unknown path', () => {
    // Deliberately not a single-page-app catch-all. A rewrite would turn a mistyped asset URL into
    // a 200 carrying HTML, and the browser then reports a syntax error inside what it was told was
    // JavaScript, pointing at `<!doctype html>`. A 404 says the true thing.
    expect(assetFor(bundle, '/assets/index-WRONGHASH.js')).toBeUndefined();
    expect(assetFor(bundle, '/no/such/page')).toBeUndefined();
  });

  it('has nothing to traverse, because no path reaches a filesystem call', () => {
    // The bundle is a map keyed by exact URL path, read once at startup. `../` is not defended
    // against so much as irrelevant: there is no join of a request path onto a root anywhere.
    for (const attempt of ['/../package.json', '/..%2Fpackage.json', '/assets/../../secret']) {
      expect(assetFor(bundle, attempt)).toBeUndefined();
    }
  });
});

describe('cache-control', () => {
  it('lets a content-hashed asset be cached forever', () => {
    const asset = assetFor(bundle, '/assets/index-D0X0Ej_j.js');
    expect(asset?.immutable).toBe(true);
    expect(cacheControlFor(asset!)).toContain('immutable');
  });

  it('refuses to cache the two files whose names survive a deploy', () => {
    // `index.html` keeps its name across builds, so a long cache on it pins a browser to a build
    // that no longer exists — and the hashed bundle it references is the part that got deleted.
    for (const path of ['/index.html', '/__buildings.json']) {
      const asset = assetFor(bundle, path);
      expect(asset?.immutable).toBe(false);
      expect(cacheControlFor(asset!)).toBe('no-cache');
    }
  });
});

describe('a build that is not there', () => {
  it('refuses a directory that does not exist, naming the command that makes one', async () => {
    await expect(loadStaticBundle(join(scratch, 'never-built'))).rejects.toThrow(/build:web|ELEVATOR_SIM_WEB/u);
  });

  it('refuses a directory with no index.html, rather than serving 404s that look like a broken viewer', async () => {
    await mkdir(join(scratch, 'empty'), { recursive: true });
    await writeFile(join(scratch, 'empty', 'stray.txt'), 'not a build');
    await expect(loadStaticBundle(join(scratch, 'empty'))).rejects.toThrow(/index\.html/u);
  });
});
