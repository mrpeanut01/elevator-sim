/**
 * The static layer's three decisions: what a path resolves to, what may be cached, and what a
 * missing build does.
 *
 * The last one is the one worth a test. A server that starts with no viewer and answers every page
 * request with a 404 is indistinguishable, from outside, from a viewer that is broken — and the
 * person reading the report is looking at the wrong repository the whole time.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  NO_CROSS_ORIGIN,
  allowOriginFrom,
  previewOriginsFrom,
  siteOriginFrom,
  trustedHopsFrom,
  viewerOriginFrom,
} from '../main.js';
import {
  API_ORIGIN_META_NAME,
  SAME_ORIGIN_API,
  assetFor,
  cacheControlFor,
  loadStaticBundle,
  declaresApiOrigin,
  isPreviewOriginOf,
  originIssues,
  previewOriginsFor,
  withApiOriginTag,
  type PreviewOrigins,
  type StaticBundle,
} from './static.js';

let scratch: string;
let bundle: StaticBundle;

const DOCUMENT = '<!doctype html>\n<html lang="en">\n  <head>\n    <title>viewer</title>\n  </head>\n</html>';

/**
 * Every document the viewer fetches by a **fixed** name, from `viz/src/dev/data.ts`.
 *
 * The list is here rather than imported because `core/` and this package must build with `viz`
 * absent (CLAUDE.md invariant 6). It is kept honest from the other end instead:
 * `viz`'s own `data.test.ts` asserts these seven are the paths it requests, so an eighth cannot be
 * added there and quietly go uncached-tested here.
 */
const VIEWER_FETCHES = [
  '/elevator-specs.json',
  '/traffic-profiles.json',
  '/dispatcher-profiles.json',
  '/__buildings.json',
  '/campaign.json',
  '/scenario-goals.json',
  '/fixit-cases.json',
  '/reference-runs.json',
] as const;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-static-'));
  await mkdir(join(scratch, 'build', 'assets'), { recursive: true });
  await writeFile(join(scratch, 'build', 'index.html'), DOCUMENT);
  for (const path of VIEWER_FETCHES) {
    await writeFile(join(scratch, 'build', path.slice(1)), '{"files":[]}');
  }
  await writeFile(join(scratch, 'build', 'assets', 'index-D0X0Ej_j.js'), 'export const x = 1;');
  // Unhashed, and inside `assets/`. The directory is a convention, not a promise, so it alone
  // must not buy a year of caching.
  await writeFile(join(scratch, 'build', 'assets', 'unhashed.js'), 'export const y = 2;');
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

  it('refuses to cache any file whose name survives a deploy', () => {
    // `index.html` keeps its name across builds, so a long cache on it pins a browser to a build
    // that no longer exists — and the hashed bundle it references is the part that got deleted.
    //
    // `VIEWER_FETCHES` rather than two hand-picked names, and that is the whole repair. The
    // superseded version of this test listed `/index.html` and `/__buildings.json` — which are
    // exactly the two that the old name-only rule happened to get right — and asserted nothing
    // about the four beside them. Two of those four were being served `immutable` for a year.
    for (const path of ['/index.html', ...VIEWER_FETCHES]) {
      const asset = assetFor(bundle, path);
      expect(asset, path).toBeDefined();
      expect(asset?.immutable, path).toBe(false);
      expect(cacheControlFor(asset!), path).toBe('no-cache');
    }
  });

  it('does not read a hash into an English word — the defect that broke the live deploy', () => {
    // `traffic-profiles.json` ends `-profiles.json`, and `profiles` is eight characters of
    // `[A-Za-z0-9_-]`, so Vite's hashed-name pattern matches it. So does
    // `dispatcher-profiles.json`. Named individually because the failure was theirs alone: the
    // deploy carrying `credentialGap` and `office-day` reached every returning player as a new
    // bundle reading a year-old payload, and the viewer refused to boot at all.
    for (const path of ['/traffic-profiles.json', '/dispatcher-profiles.json']) {
      expect(assetFor(bundle, path)?.immutable, path).toBe(false);
    }
  });

  it('grants immutability on the directory, not on the name alone', () => {
    // The two halves, each shown to be load-bearing by a case that has only the other. A hashed
    // name outside `assets/` is refused, because that is the shape every data file that has ever
    // been misread has; an unhashed name inside it is refused too, because `assets/` is a
    // convention rather than a promise. Only the conjunction is cached.
    expect(assetFor(bundle, '/traffic-profiles.json')?.immutable).toBe(false);
    expect(assetFor(bundle, '/assets/unhashed.js')?.immutable).toBe(false);
    expect(assetFor(bundle, '/assets/index-D0X0Ej_j.js')?.immutable).toBe(true);
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

/* -------------------------------------------------------------------------- *
 * The second producer, and the seam between them — § D257
 *
 * `packages/viz/apiOrigin.mjs` declares the same tag at build time, for the bundle a CDN serves.
 * Neither module can see the other: `server` may not depend on `viz`, and `viz`'s copy has to load
 * inside a bundler config this package's compilation deliberately cannot reach. So the contract is
 * checked here, by driving both — because a contract with two implementations rots at whichever one
 * nobody looks at, and this repository has the standing rule to prove it.
 *
 * The import is a computed specifier so `tsc -b` does not attempt to resolve a `.mjs` with no
 * declarations into this project — the same reason `vite.config.ts` is outside `src/**`. What it
 * costs is the type, which is restored by the shape below and asserted by the tests themselves.
 * -------------------------------------------------------------------------- */

interface ApiOriginModule {
  readonly API_ORIGIN_META_NAME: string;
  readonly API_ORIGIN_ENV: string;
  readonly API_ORIGIN_REQUIRED_ENV: string;
  originIssues(value: unknown): readonly string[];
  apiOriginMetaTag(origin: string): string;
  declaresApiOrigin(html: string): boolean;
  apiOriginFrom(env: Readonly<Record<string, string | undefined>>): string | undefined;
  hostConfigWithApiOrigin(json: string, origin: string | undefined): string;
  apiOriginPlugin(env: Readonly<Record<string, string | undefined>>): {
    readonly name: string;
    readonly transformIndexHtml: {
      handler(html: string): string | { html: string; tags: readonly unknown[] };
    };
  };
}

const VIZ = new URL('../../../viz/', import.meta.url);

const build: ApiOriginModule = (await import(
  new URL('apiOrigin.mjs', VIZ).href
)) as unknown as ApiOriginModule;

/** What the build plugin does to a document, as a plain string, whichever return shape it uses. */
function builtDocument(env: Readonly<Record<string, string | undefined>>, html: string): string {
  const result = build.apiOriginPlugin(env).transformIndexHtml.handler(html);
  if (typeof result === 'string') return result;
  // Vite's tag-descriptor form. Rendering it here rather than asserting on the descriptor is
  // deliberate: what the browser gets is a document, and the assertion should be about that.
  const tags = result.tags as readonly { tag: string; attrs: Record<string, string> }[];
  const rendered = tags
    .map((tag) => `<${tag.tag} ${Object.entries(tag.attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`)
    .join('\n');
  return result.html.replace(/<head[^>]*>/iu, (head) => `${head}\n    ${rendered}`);
}

describe('the API origin has two producers, and exactly one may fire', () => {
  it('names the same tag on both sides', () => {
    // If these drift, the server injects a tag the built page does not read, or the other way
    // round — and the symptom is identical to declaring no tag at all.
    expect(build.API_ORIGIN_META_NAME).toBe(API_ORIGIN_META_NAME);
  });

  it('emits nothing without the parameter, so the server still says "/"', () => {
    // This is the container image's build and `vite dev`'s: no parameter, no tag. The property that
    // matters is not that the plugin is quiet — it is that the document it produces is still one
    // `withApiOriginTag` will complete, so today's deployment is untouched.
    const quiet = builtDocument({}, DOCUMENT);
    expect(build.declaresApiOrigin(quiet)).toBe(false);
    expect(withApiOriginTag(quiet)).toContain(`content="${SAME_ORIGIN_API}"`);
  });

  it('emits an absolute tag with the parameter, and the server then leaves it alone', () => {
    // The static host's build. The second half is the one that stops the two producers colliding:
    // a bundle that already knows where its API is must keep that answer even if it is handed to a
    // server, because `"/"` on a CDN-served page resolves to the CDN.
    const declared = builtDocument({ [build.API_ORIGIN_ENV]: 'https://api.example' }, DOCUMENT);
    expect(declared).toContain(`name="${API_ORIGIN_META_NAME}"`);
    expect(declared).toContain('content="https://api.example"');
    expect(withApiOriginTag(declared)).toBe(declared);
    // And the tag the *server* writes is one the build recognises, so neither can double the other.
    expect(build.declaresApiOrigin(withApiOriginTag(DOCUMENT))).toBe(true);
  });

  it('puts the tag where the viewer looks for it', () => {
    // `dev/main.ts` runs `document.querySelector('meta[name="elevator-sim-api"]')`, in the head,
    // before anything could act on it. Asserted on position rather than on the plugin's options.
    const declared = builtDocument({ [build.API_ORIGIN_ENV]: 'https://api.example' }, DOCUMENT);
    expect(declared.indexOf('<meta name=')).toBeGreaterThan(declared.indexOf('<head'));
    expect(declared.indexOf('<meta name=')).toBeLessThan(declared.indexOf('</head>'));
  });

  it('produces a usable absolute request URL when the client concatenates it', () => {
    // The counterpart of the `"/"` case above. The client builds `${origin.replace(/\/$/,'')}/api/…`,
    // so an origin that is *nearly* right — a trailing slash, a path — yields a URL that is wrong
    // in a way no page load reports. `originIssues` is why one cannot get this far.
    const origin = build.apiOriginFrom({ [build.API_ORIGIN_ENV]: 'https://api.example' });
    expect(`${origin?.replace(/\/$/u, '') ?? ''}/api/challenges`).toBe('https://api.example/api/challenges');
  });
});

describe('a bundle built for a static host without the parameter', () => {
  it('fails the build rather than shipping a page whose social surfaces dead-end', () => {
    // The whole point of the second environment variable. Absence is *correct* for the container
    // and *catastrophic* for a CDN, and only the caller knows which build this is — so the caller
    // says, and when it says "static host" an unset origin stops the build.
    expect(() => build.apiOriginFrom({ [build.API_ORIGIN_REQUIRED_ENV]: 'true' })).toThrow(
      /#21, #28, #29, #30, #32 and #34/u,
    );
  });

  it('is silent about absence when nothing claims to be deploying', () => {
    expect(build.apiOriginFrom({})).toBeUndefined();
    expect(build.apiOriginFrom({ [build.API_ORIGIN_REQUIRED_ENV]: 'false' })).toBeUndefined();
  });

  it('refuses a value that is nearly an origin, at build time', () => {
    for (const bad of ['https://api.example/', 'https://api.example/v1', '/', '*', 'api.example']) {
      expect(() => build.apiOriginFrom({ [build.API_ORIGIN_ENV]: bad })).toThrow();
    }
  });
});

describe('the two origin checks agree, because they are the same rule twice', () => {
  // Driven over one table rather than compared as text: two functions that both *look* strict and
  // disagree on `https://api.example:443` would pass any check that read them.
  const CASES: readonly { value: string; ok: boolean }[] = [
    { value: 'https://api.example', ok: true },
    { value: 'http://localhost:8787', ok: true },
    { value: 'https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io', ok: true },
    { value: 'https://api.example/', ok: false },
    { value: 'https://api.example/api', ok: false },
    { value: 'https://api.example?x=1', ok: false },
    { value: 'https://api.example#f', ok: false },
    { value: 'https://user:pw@api.example', ok: false },
    { value: 'HTTPS://API.EXAMPLE', ok: false },
    { value: 'ftp://api.example', ok: false },
    { value: ' https://api.example ', ok: false },
    { value: '*', ok: false },
    { value: '/', ok: false },
    { value: '', ok: false },
  ];

  it.each(CASES)('agrees on $value', ({ value, ok }) => {
    expect(originIssues(value).length === 0).toBe(ok);
    expect(build.originIssues(value).length === 0).toBe(ok);
  });

  it('found something to check', () => {
    // A table that emptied would make every case above vacuously green.
    expect(CASES.filter((c) => c.ok).length).toBeGreaterThan(2);
    expect(CASES.filter((c) => !c.ok).length).toBeGreaterThan(6);
  });

  it('names "*" as the thing it is refusing, not merely as malformed', () => {
    expect(originIssues('*').join(' ')).toMatch(/wildcard|any page on the web/u);
    expect(build.originIssues('*').join(' ')).toMatch(/wildcard|any page on the web/u);
  });
});

describe('the hosting config moves with the tag', () => {
  // Read from disk, so an edit to the committed file that drops `connect-src 'self'` reddens this
  // rather than silently disabling the widening.
  let committed: string;
  beforeAll(async () => {
    committed = await readFile(new URL('staticwebapp.config.json', VIZ), 'utf8');
  });

  it('permits nothing extra when the page contacts nothing extra', () => {
    // An origin permitted for a page that never calls it is dead configuration, and the negative
    // half is what stops this becoming a permanently-widened CSP nobody reviews.
    expect(build.hostConfigWithApiOrigin(committed, undefined)).toBe(committed);
    expect(committed).toContain("connect-src 'self';");
  });

  it('permits exactly the origin the document was told about', () => {
    const widened = build.hostConfigWithApiOrigin(committed, 'https://api.example');
    expect(widened).toContain("connect-src 'self' https://api.example;");
    // And nothing else moved. `script-src` is the one a mistake here would be worst in.
    expect(JSON.parse(widened).globalHeaders['Content-Security-Policy']).toContain("script-src 'self'");
  });

  it('refuses to widen a config with nothing to widen', () => {
    // Silently returning the input would produce a site that loads, knows where its API is, and has
    // every request blocked by its own policy — this lane's failure mode wearing a different hat.
    expect(() => build.hostConfigWithApiOrigin('{"globalHeaders":{}}', 'https://api.example')).toThrow(
      /connect-src/u,
    );
  });
});

describe('the second producer is registered, not merely written', () => {
  /*
   * Driving the plugin proves it works; it does not prove the build runs it. This repository's
   * most-repeated defect is a behaviour that is configurable, unit-tested and called from nothing
   * shipped, and a plugin nobody registers is exactly that shape — it would pass every assertion
   * above while the deployed page carried no tag at all.
   *
   * Checked by reading `vite.config.ts` as **text**, not by importing it: importing compiles it
   * into this package, which is the one property that file's own docstring claims (it is outside
   * `src/**` so `tsc -b` never sees it). Reading a config a package cannot import is the move
   * `elementMap.test.ts` already makes against `index.html`.
   */
  let config: string;
  beforeAll(async () => {
    config = await readFile(new URL('vite.config.ts', VIZ), 'utf8');
  });

  it('registers the plugin in the build', () => {
    expect(config).toMatch(/plugins:\s*\[[^\]]*apiOriginPlugin\(process\.env\)/su);
  });

  it('widens the hosting config from the same environment', () => {
    // Both halves from `process.env`, so a build cannot declare an origin the CSP forbids.
    expect(config).toContain('hostConfigWithApiOrigin(');
    expect(config).toContain('apiOriginFrom(process.env)');
    expect(config).toContain("fileName: 'staticwebapp.config.json'");
  });

  /*
   * Everything below is against the **real shipped `index.html`**, not a fixture, and the first
   * revision of these tests is why. `index.html` gained a comment telling the next reader not to
   * write the tag by hand — and that comment contains the attribute it is warning about, so the
   * plain regex both producers used matched the *warning*, concluded the document already declared
   * an origin, and emitted nothing. The prose written to prevent a dead-ending viewer produced one,
   * and a fixture would never have contained it.
   *
   * So the literal stays in `index.html` on purpose. It is the live case: revert either comment
   * strip and these go red against the document that actually ships.
   */
  let indexHtml: string;
  beforeAll(async () => {
    indexHtml = await readFile(new URL('index.html', VIZ), 'utf8');
  });

  it('leaves index.html declaring no origin of its own', () => {
    // The third producer, which must never exist. A hostname committed here would point a local
    // development build at production (§ D243 § 1) and — because both real producers are
    // idempotent — would silently suppress both.
    expect(declaresApiOrigin(indexHtml)).toBe(false);
    expect(build.declaresApiOrigin(indexHtml)).toBe(false);
  });

  it('mentions the tag in prose, which is not the same as declaring it', () => {
    // The half that fails if the strip is removed. `querySelector` does not see comments, so
    // neither may anything deciding whether the page has been told where its API is.
    expect(indexHtml).toContain(`name="${API_ORIGIN_META_NAME}"`);
  });

  it('gets a usable same-origin tag from the server, against the document that ships', () => {
    // The end-to-end statement, on the real file: what the container serves carries an origin the
    // viewer's own selector will find, and concatenating it yields the request the API answers.
    const served = withApiOriginTag(indexHtml);
    const content = /<meta\s+name="elevator-sim-api"\s+content="([^"]*)"/u.exec(served)?.[1];
    expect(content).toBe(SAME_ORIGIN_API);
    expect(`${(content ?? '').replace(/\/$/u, '')}/api/challenges`).toBe('/api/challenges');
  });

  it('gets a usable absolute tag from the build, against the document that ships', () => {
    const built = builtDocument({ [build.API_ORIGIN_ENV]: 'https://api.example' }, indexHtml);
    const content = /<meta\s+name="elevator-sim-api"\s+content="([^"]*)"/u.exec(built)?.[1];
    expect(content).toBe('https://api.example');
    expect(`${(content ?? '').replace(/\/$/u, '')}/api/challenges`).toBe(
      'https://api.example/api/challenges',
    );
  });
});

describe('which origin may call this API', () => {
  // `allowOriginFrom` and `viewerOriginFrom` live in `main.ts` and are tested here because this is
  // the file about how the page and the API find each other; splitting them would put two halves of
  // one contract in two places, which is the thing the § D257 seam exists to avoid.

  // A Static Web App's default hostname, in the shape Azure assigns: an adjective-noun-hash label,
  // a region label, then the suffix. Invented rather than the live site's, because a test that
  // pinned the deployment's real hostname would be a hostname committed to this repository, which
  // is the thing § 3.5 of `docs/16-static-site-deployment.md` says no file here does.
  const BASE = 'silver-forest-0ab12cd34';
  const SUFFIX = '7.azurestaticapps.net';
  const SITE = `https://${BASE}.${SUFFIX}`;
  const PREVIEW = `https://${BASE}-7.${SUFFIX}`;

  it('permits none by default, which is the current deployment', () => {
    expect(allowOriginFrom({}, 'http://localhost:8787')).toBe(NO_CROSS_ORIGIN);
    expect(allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: '' }, 'http://localhost:8787')).toBe(NO_CROSS_ORIGIN);
    expect(allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: 'null' }, 'http://localhost:8787')).toBe(NO_CROSS_ORIGIN);
  });

  it('refuses "*" at boot rather than accepting it with a warning', () => {
    // The API answers session-bearing requests and a verification is a whole simulation. A wildcard
    // publishes both to every page on the web, and it is the value somebody reaches for at 2am when
    // CORS is in the way.
    expect(() => allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: '*' }, 'https://viz.example')).toThrow(/\*/u);
  });

  it('refuses an allowed origin that is not where the viewer is', () => {
    // Two values, one fact. Drifting apart gives a site that loads, a page that knows where the API
    // is, and a `fetch` that fails CORS — which the client reports as a server that is down.
    //
    // This case is older than § D330 and it pinned *equality*. It survives the move to membership
    // unchanged, and that is worth saying rather than quietly keeping: it asserts that a
    // disagreeing allowlist throws, and under membership one still does, so the case never
    // distinguished the two rules. The reason it throws has changed from "these two strings are
    // not equal" to "the viewer's origin is not a member", and the cases below are what pin that.
    expect(() =>
      allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: 'https://other.example' }, 'https://viz.example'),
    ).toThrow(/ELEVATOR_SIM_ORIGIN/u);
  });

  it('accepts the split deployment when both name the viewer', () => {
    expect(allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: 'https://viz.example' }, 'https://viz.example')).toBe(
      'https://viz.example',
    );
    // A one-entry allowlist derives no previews, whatever the origin is. The pattern is opted into
    // by name; it is never implied by the hostname happening to be a Static Web App.
    expect(previewOriginsFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: SITE }, SITE)).toBeUndefined();
  });

  it('admits a member of the allowlist and refuses a non-member — § D330, GitHub issue #123', () => {
    // The whole of the change. `previews` is one entry beside the production origin, and it is a
    // word rather than a hostname because § D330's second condition is that the pattern is derived
    // from the deployment's own name.
    const env = { ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews` };
    expect(allowOriginFrom(env, SITE)).toBe(SITE);

    const previews = previewOriginsFrom(env, SITE);
    expect(previews).toBeDefined();
    // A member: the hostname Azure mints for a pull request against this same site.
    expect(isPreviewOriginOf(previews as PreviewOrigins, PREVIEW)).toBe(true);
    // A non-member, and the reason the equality rule existed at all.
    expect(isPreviewOriginOf(previews as PreviewOrigins, 'https://evil.example')).toBe(false);
    // The production origin is not a preview of itself, so the two halves of the allowlist are
    // disjoint and `serve.ts` can hold them separately.
    expect(isPreviewOriginOf(previews as PreviewOrigins, SITE)).toBe(false);
  });

  it('refuses every near miss, because an allowlist is a security boundary', () => {
    const previews = previewOriginsFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews` }, SITE);
    expect(previews).toBeDefined();
    const permits = (candidate: string): boolean =>
      isPreviewOriginOf(previews as PreviewOrigins, candidate);

    // This is the case the membership rule could have shipped and the equality rule could not: a
    // string that contains a permitted origin, or is contained by one, and is a different site.
    for (const nearMiss of [
      // The permitted origin, with more host after it. A suffix or `startsWith` test admits this.
      `${PREVIEW}.evil.example`,
      // A prefix of the permitted origin. A `startsWith` test in the other direction admits this.
      PREVIEW.slice(0, PREVIEW.length - 1),
      // The base label extended rather than separated: a different Static Web App.
      `https://${BASE}5-7.${SUFFIX}`,
      // The base label with the separator but no pull request number.
      `https://${BASE}-.${SUFFIX}`,
      // An environment label that is not a number, so not one this deployment can mint.
      `https://${BASE}-staging.${SUFFIX}`,
      // Somebody else's Static Web App in the same region.
      `https://other-site-0000abcde-7.${SUFFIX}`,
      // The right host, downgraded. A preview is only ever served over managed TLS.
      `http://${BASE}-7.${SUFFIX}`,
      // The right host on another port, which is a different origin to a browser.
      `https://${BASE}-7.${SUFFIX}:8443`,
      // The right host in another region: the labels after the first are compared whole.
      `https://${BASE}-7.8.azurestaticapps.net`,
      // Not an exact origin. A trailing slash, a path and whitespace each fail before comparison.
      `https://${BASE}-7.${SUFFIX}/`,
      `https://${BASE}-7.${SUFFIX}/api`,
      ` https://${BASE}-7.${SUFFIX}`,
      // The wildcard, which no origin comparison should ever see.
      '*',
      '',
    ]) {
      expect(permits(nearMiss), `${nearMiss} must not be permitted`).toBe(false);
    }

    // And the members still are, so the refusals above are not a function that always says no.
    expect(permits(PREVIEW)).toBe(true);
    expect(permits(`https://${BASE}-1.${SUFFIX}`)).toBe(true);
  });

  it('refuses at boot an origin the deployment cannot mint, however it is written', () => {
    // § D330 kept the refusal and re-expressed it: the allowlist may hold the production origin and
    // one preview pattern bound to the same Static Web App, and nothing else.
    expect(() =>
      allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},https://evil.example` }, SITE),
    ).toThrow(/cannot mint/u);
    // Including a near miss that a substring rule would have admitted.
    expect(() =>
      allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},${PREVIEW}.evil.example` }, SITE),
    ).toThrow(/cannot mint/u);
    // And a preview origin written out by hand rather than derived, which is the stale allowlist
    // § D330's second condition exists to prevent. The message names the entry that replaces it.
    expect(() => allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},${PREVIEW}` }, SITE)).toThrow(
      /"previews"/u,
    );
    // Written beside the pattern it belongs to, it is a member and is accepted.
    expect(allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews,${PREVIEW}` }, SITE)).toBe(SITE);
  });

  it('refuses "previews" where the deployment mints none, rather than expanding it to nothing', () => {
    // An entry that quietly expanded to the empty set would permit nothing and say nothing, which
    // is the shape of issue #123 itself: previews load, and every API surface dead-ends.
    expect(() =>
      allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: 'https://viz.example,previews' }, 'https://viz.example'),
    ).toThrow(/Static Web App/u);
    expect(() =>
      allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: 'http://localhost:8787,previews' }, 'http://localhost:8787'),
    ).toThrow(/Static Web App/u);
  });

  it('refuses a blank entry rather than dropping it', () => {
    // An entry dropped for being blank is an origin somebody meant to permit and a refusal nobody
    // sees. A stray comma is a typo with a security consequence, so it stops the process.
    expect(() => allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},` }, SITE)).toThrow(/blank entry/u);
    expect(() => allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},,previews` }, SITE)).toThrow(
      /blank entry/u,
    );
    // Whitespace around an entry is list syntax and is trimmed; whitespace inside one is not.
    expect(allowOriginFrom({ ELEVATOR_SIM_ALLOW_ORIGIN: ` ${SITE} , previews ` }, SITE)).toBe(SITE);
  });

  it('derives the preview pattern from the deployment rather than from a hostname anyone typed', () => {
    const previews = previewOriginsFor(SITE);
    expect(previews).toEqual({ base: BASE, suffix: SUFFIX, of: SITE });
    // The older three-label form of a Static Web App hostname, without a region.
    expect(previewOriginsFor(`https://${BASE}.azurestaticapps.net`)).toEqual({
      base: BASE,
      suffix: 'azurestaticapps.net',
      of: `https://${BASE}.azurestaticapps.net`,
    });
    // Everything that is not one: a custom domain, a local run, a port, a lookalike suffix, and a
    // host that merely ends in the suffix. None of these mints a preview, so none derives a pattern.
    for (const notASite of [
      'https://elevator-sim.example',
      'http://localhost:8787',
      `https://${BASE}.${SUFFIX}:8443`,
      `https://${BASE}.7.azurestaticapps.net.evil.example`,
      `https://${BASE}.7.evil-azurestaticapps.net`,
      `https://${BASE}.a.b.azurestaticapps.net`,
      'https://azurestaticapps.net',
      `https://${BASE}.${SUFFIX}/`,
    ]) {
      expect(previewOriginsFor(notASite), `${notASite} mints no previews`).toBeUndefined();
    }
  });

  it('reads the viewer origin, and refuses one a sign-in link could not be built from', () => {
    expect(viewerOriginFrom({}, 8787)).toBe('http://localhost:8787');
    expect(viewerOriginFrom({ ELEVATOR_SIM_ORIGIN: 'https://viz.example' }, 8787)).toBe('https://viz.example');
    // A trailing slash used to be harmless — `signInUrlFor` strips one. It is refused anyway,
    // because the same string is compared byte-for-byte against the CORS value above, and a rule
    // that holds for one of two values that must match is not a rule.
    expect(() => viewerOriginFrom({ ELEVATOR_SIM_ORIGIN: 'https://viz.example/' }, 8787)).toThrow(
      /ELEVATOR_SIM_ORIGIN/u,
    );
  });

  it('derives where the page is rather than reading a fourth value for it', () => {
    // § D257's cost is that three values have to agree. A fourth would be that cost again, and it
    // would fail the same silent way, so `siteOriginFrom` is a function of the two above and of
    // nothing else. `allowOriginFrom` has already refused the case where they disagree, which is
    // what makes a non-`null` CORS value *mean* "the page is served at `viewerOrigin`".
    expect(siteOriginFrom('https://viz.example', 'https://viz.example')).toBe('https://viz.example');
  });

  it('refuses ELEVATOR_SIM_TRUST_PROXY rather than ignoring it', () => {
    // It used to mean "read the left-most x-forwarded-for entry", which is the entry the caller
    // writes. An environment still setting it is asking for a behaviour that no longer exists, and
    // booting while silently discarding a security setting is the worse of the two ways to answer.
    expect(() => trustedHopsFrom({ ELEVATOR_SIM_TRUST_PROXY: 'true' })).toThrow(
      /ELEVATOR_SIM_TRUSTED_HOPS/u,
    );
    // Including when it says `false`. The name is gone, not its value.
    expect(() => trustedHopsFrom({ ELEVATOR_SIM_TRUST_PROXY: 'false' })).toThrow(/no longer read/u);
  });

  it('counts hops, and refuses anything that is not a written integer', () => {
    expect(trustedHopsFrom({})).toBe(0);
    expect(trustedHopsFrom({ ELEVATOR_SIM_TRUSTED_HOPS: '' })).toBe(0);
    expect(trustedHopsFrom({ ELEVATOR_SIM_TRUSTED_HOPS: '1' })).toBe(1);
    // `Number('1e1')` is 10 and `Number(' ')` is 0. A hop count is a written digit or a mistake.
    expect(() => trustedHopsFrom({ ELEVATOR_SIM_TRUSTED_HOPS: '1e1' })).toThrow(/trusted reverse/u);
    expect(() => trustedHopsFrom({ ELEVATOR_SIM_TRUSTED_HOPS: '-1' })).toThrow(/trusted reverse/u);
    expect(() => trustedHopsFrom({ ELEVATOR_SIM_TRUSTED_HOPS: 'true' })).toThrow(/trusted reverse/u);
  });

  it('leaves a same-origin deployment serving its own page', () => {
    // The shipped container and every local run. Nothing to redirect to, and the bundle is the
    // viewer rather than a second copy of it.
    expect(siteOriginFrom('http://localhost:8787', NO_CROSS_ORIGIN)).toBeUndefined();
  });
});
