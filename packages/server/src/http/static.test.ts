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

import {
  API_ORIGIN_META_NAME,
  SAME_ORIGIN_API,
  assetFor,
  cacheControlFor,
  loadStaticBundle,
  withApiOriginTag,
  type StaticBundle,
} from './static.js';

let scratch: string;
let bundle: StaticBundle;

const DOCUMENT = '<!doctype html>\n<html lang="en">\n  <head>\n    <title>viewer</title>\n  </head>\n</html>';

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-static-'));
  await mkdir(join(scratch, 'build', 'assets'), { recursive: true });
  await writeFile(join(scratch, 'build', 'index.html'), DOCUMENT);
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

/* -------------------------------------------------------------------------- *
 * Telling the page where the API is — § D243
 * -------------------------------------------------------------------------- */

describe('the API-origin tag', () => {
  it('is in the document this server serves, which is the whole defect', async () => {
    // The measured state before this change: the live app answers `GET /api/challenges` with 200
    // and real data, and the `index.html` it serves from the same origin carries no tag — so the
    // viewer's client is `undefined` and every account, leaderboard and challenge screen dead-ends
    // against a working API on its own origin.
    const html = assetFor(bundle, '/')?.body.toString('utf8') ?? '';
    expect(html).toContain(`name="${API_ORIGIN_META_NAME}"`);
    expect(html).toContain(`content="${SAME_ORIGIN_API}"`);
    // Inside the head, so it precedes anything that could read it.
    expect(html.indexOf('<meta name=')).toBeGreaterThan(html.indexOf('<head'));
    expect(html.indexOf('<meta name=')).toBeLessThan(html.indexOf('</head>'));
    // And the document is otherwise intact — this is an insertion, not a rewrite.
    expect(html).toContain('<title>viewer</title>');
  });

  it('produces a same-origin request path when the client concatenates it', () => {
    // The client builds `${origin.replace(/\/$/, '')}/api/…`. `"/"` becomes the empty string, so
    // the request is `/api/challenges`: absolute-path, same-origin, resolved by the browser against
    // whatever host actually served the page. An absolute origin would have to be kept correct
    // through custom domains and would turn a scheme or host mismatch into a CORS refusal.
    expect(`${SAME_ORIGIN_API.replace(/\/$/u, '')}/api/challenges`).toBe('/api/challenges');
  });

  it('leaves every other asset byte-identical', () => {
    // A rewrite that touched a hashed asset would change content whose *name* promises it never
    // changes, which is the one thing `immutable` may not be wrong about.
    expect(assetFor(bundle, '/assets/index-D0X0Ej_j.js')?.body.toString('utf8')).toBe('export const x = 1;');
    expect(assetFor(bundle, '/__buildings.json')?.body.toString('utf8')).toBe('{"files":[]}');
  });

  it('does not make the document cacheable', () => {
    // The injection must not move the caching rules. `index.html` keeps its name across deploys, so
    // it is `no-cache` whatever is in it — and a per-deploy rewrite makes that more important, not
    // less.
    const asset = assetFor(bundle, '/index.html');
    expect(asset?.immutable).toBe(false);
    expect(cacheControlFor(asset!)).toBe('no-cache');
  });

  it('does not add a second tag to a document that already declares one', () => {
    // A bundle carrying its own tag has been told something this server does not know. Two tags
    // would leave `querySelector` picking whichever came first, which is a coin toss between two
    // answers and worse than either.
    const declared = `<head><meta name="${API_ORIGIN_META_NAME}" content="https://api.example" /></head>`;
    expect(withApiOriginTag(declared)).toBe(declared);
  });

  it('still declares the tag in a document with no head', () => {
    // Not a viewer build — but silently dropping the tag would be this section's own defect one
    // level down, so it goes in front rather than nowhere.
    expect(withApiOriginTag('<p>no head</p>')).toContain(`name="${API_ORIGIN_META_NAME}"`);
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
