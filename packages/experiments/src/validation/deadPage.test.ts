/**
 * The dead-page check's decision, driven against fixtures — GitHub issue **#242**, AC5.
 *
 * ## The defect this exists for, named before the tests
 *
 * [`docs/05-roadmap.md`](../../../../docs/05-roadmap.md) records it in one sentence: a `let`
 * declared below the `boot()` sequence that assigns it threw on boot's second statement, and
 * **2 100 tests were green over a dead page**. That was closed pre-merge, twice — a text assertion
 * over `boot()`'s body, and a browser tier whose first test loads the built bundle and requires the
 * stage to have been drawn ([§ D220](../../../../DECISIONS.md), [§ D221](../../../../DECISIONS.md),
 * and `everyday/builtBundle.browser.test.ts` since § D425).
 *
 * **What was never closed is the other half: nothing looks at the page after it is deployed.**
 * `.github/workflows/deploy-viz.yml` has three jobs — `build`, `deploy` and `close-preview` — and
 * every assertion in it runs *before* the upload, against `packages/viz/dist-web` on the runner's
 * own disk. The last step after the upload echoes a URL. So a deploy that uploads nothing, uploads
 * half, or serves the bundle under a content type a browser refuses to execute produces a green run
 * and a dead site, and the first report is a player's.
 *
 * ## What this check can catch, and what it cannot — said first, because the boundary is the point
 *
 * It probes the **served** site over HTTP. So it catches:
 *
 * - the page not being served at all, or under a status or a content type a browser will not render;
 * - the page being served but carrying none of the application's own markers, which is what an
 *   upload of the wrong directory looks like;
 * - **an asset the served page references that does not resolve, or resolves as something a browser
 *   will not execute** — a module script served as `text/html` is the classic static-host
 *   misconfiguration, and it produces a blank page with a 200 on every request;
 * - **the data manifest not being served**, which is the deployed form of `docs/27-flow-maps.md`'s
 *   F0 *Unavailable* row: with `data/` absent the shell covers the failure notice and the player
 *   meets a main menu whose tiles lead to a screen claiming a boot that will never finish;
 * - the served page naming an API origin other than the one this deploy expects — the failure of
 *   issues #21, #28, #29, #30, #32 and #34, checked here against what is *served* rather than
 *   against what was built, which is `docs/16` § 11 step 4's own instruction.
 *
 * **It cannot catch a bundle that is served correctly and throws.** No HTTP probe can: the module
 * arrives with a 200 and the right type either way. That half is the browser tier's, pre-merge, on
 * the same artifact bytes — and the pair is what AC5 asks for. Claiming this probe closes the class
 * on its own would be the stale-refusal shape pointed the other way, so it is stated here and again
 * in the script's own header.
 *
 * ## Why the decision is tested here and the fetching is not
 *
 * `scripts/blocked-by.mjs`'s constraint, unchanged: this tier has no network, and the deployed
 * build is unreachable from it anyway (`everyday/builtBundle.browser.test.ts` records `curl` →
 * status `000`, GitHub issue #123). So the script keeps its decision in exported pure functions,
 * confines `fetch` to a `main()` that runs only when the script is the entry point, and this file
 * imports the pure half. Importing it performs no request.
 *
 * ## Every case below is a positive control
 *
 * Each `it` names a defect and requires the check to *report* it. A check of this shape degrades
 * silently in exactly one direction — it stops finding things and looks green forever — so the
 * happy-path case is the smallest part of this file and every other case starts from it and breaks
 * one thing.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_ASSETS,
  SHELL_MARKERS,
  assetPathsOf,
  deadPageIssues,
  declaredApiOriginOf,
  manifestBuildingsOf,
  summaryOf,
  type Fetched,
  type PageProbe,
} from '../../../../scripts/dead-page.mjs';

/**
 * A served page that carries every marker, so a test can break exactly one thing.
 *
 * Written out rather than read off `packages/viz/index.html`, and the reason is the one this file
 * is about: a fixture read from the tree passes whenever the tree and the check drift together,
 * which is the failure mode of a check that reads its own subject.
 */
const LIVE_HTML = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <meta name="elevator-sim-api" content="https://api.example.test" />',
  '    <link rel="stylesheet" crossorigin href="/assets/index-aaa.css" />',
  '    <title>Elevator Sim</title>',
  '  </head>',
  '  <body>',
  '    <div class="shell">',
  '      <header class="topbar"></header>',
  '    </div>',
  '    <script type="module" crossorigin src="/assets/index-bbb.js"></script>',
  '  </body>',
  '</html>',
].join('\n');

/**
 * The manifest's real shape, and the fixture that was wrong.
 *
 * The first draft of this file wrote `files: ['midtown-office.json', …]` and probed
 * `/buildings/<name>.json` for the first entry. **Both were wrong, and running the script against
 * production is what said so** — the live site answered `404 text/html` for the building path, and
 * the manifest turned out to carry whole building documents inline, so the check reported a healthy
 * site as dead. `packages/viz/vite.config.ts#readBuildings` is the emitter and says why in its own
 * words: *"the viewer never fetches one: HTTP has no directory listing"*.
 *
 * The lesson is the fixture's, not the script's. A fixture written from a reading of the code that
 * produces the thing is a fixture that agrees with a misreading, and no amount of green in this
 * file would have found it.
 */
const MANIFEST = JSON.stringify({
  files: [
    { name: 'midtown-office.json', data: { id: 'midtown-office' } },
    { name: 'vertical-city.json', data: { id: 'vertical-city' } },
  ],
});

/** The five data documents the built site serves at its root, beside the manifest. */
const DATA_PATHS = [
  '/elevator-specs.json',
  '/traffic-profiles.json',
  '/dispatcher-profiles.json',
  '/campaign.json',
  '/scenario-goals.json',
] as const;

const ok = (path: string, contentType: string, body?: string): Fetched =>
  body === undefined ? { path, status: 200, contentType } : { path, status: 200, contentType, body };

/** The probe a healthy deploy produces. Every other fixture is this with one field changed. */
const alive = (): PageProbe => ({
  origin: 'https://site.example.test',
  page: ok('/', 'text/html', LIVE_HTML),
  expectedApiOrigin: 'https://api.example.test',
  assets: [ok('/assets/index-bbb.js', 'text/javascript'), ok('/assets/index-aaa.css', 'text/css')],
  data: [
    ok('/__buildings.json', 'application/json', MANIFEST),
    ...DATA_PATHS.map((path) => ok(path, 'application/json')),
  ],
});

/** The one assertion that must stay true, or every negative case below proves nothing. */
describe('the healthy deploy', () => {
  it('reports nothing', () => {
    expect(deadPageIssues(alive())).toEqual([]);
  });

  it('says so in the summary, naming the origin it probed', () => {
    const summary = summaryOf(alive(), []);
    expect(summary).toContain('https://site.example.test');
    expect(summary.toLowerCase()).toContain('alive');
  });
});

describe('the page itself', () => {
  it('reports a status that is not 200 — the upload that did not land', () => {
    const probe: PageProbe = { ...alive(), page: { path: '/', status: 404, contentType: '' } };
    expect(deadPageIssues(probe).join(' ')).toContain('404');
  });

  it('reports a request that never completed', () => {
    const probe: PageProbe = { ...alive(), page: { path: '/', status: 0, contentType: '' } };
    expect(deadPageIssues(probe)).not.toEqual([]);
  });

  it('reports a page served as something a browser will not render', () => {
    const probe: PageProbe = {
      ...alive(),
      page: ok('/', 'application/json', LIVE_HTML),
    };
    expect(deadPageIssues(probe).join(' ')).toContain('application/json');
  });

  /*
   * The upload-the-wrong-directory case. A static host will happily serve a README or a directory
   * listing with a 200 and `text/html`, and every check above passes on it.
   */
  it('reports a 200 page that carries none of the application', () => {
    const probe: PageProbe = { ...alive(), page: ok('/', 'text/html', '<h1>Hello</h1>') };
    expect(deadPageIssues(probe)).not.toEqual([]);
  });

  it('needs every marker, not one of them', () => {
    for (const marker of SHELL_MARKERS) {
      const stripped = LIVE_HTML.replace(marker, '<!-- gone -->');
      const probe: PageProbe = { ...alive(), page: ok('/', 'text/html', stripped) };
      expect(deadPageIssues(probe), marker).not.toEqual([]);
    }
  });
});

describe('the API origin, checked against what is served', () => {
  it('reports a served page naming a different origin', () => {
    const probe: PageProbe = { ...alive(), expectedApiOrigin: 'https://other.example.test' };
    const reported = deadPageIssues(probe).join(' ');
    expect(reported).toContain('https://other.example.test');
    expect(reported).toContain('https://api.example.test');
  });

  it('reports a served page naming none when one is expected', () => {
    const html = LIVE_HTML.replace(/<meta name="elevator-sim-api"[^>]*>/u, '');
    const probe: PageProbe = { ...alive(), page: ok('/', 'text/html', html) };
    expect(deadPageIssues(probe)).not.toEqual([]);
  });

  /*
   * The unarmed arm, and it is not symmetry for its own sake: a bundle that acquired an origin
   * nobody asked for suppresses the container's own injection of `/`, which is the defect
   * `deploy-viz.yml` already asserts against the artifact. Asserting it against the served page
   * costs one comparison.
   */
  it('reports an origin on a page that should declare none', () => {
    const probe: PageProbe = { ...alive(), expectedApiOrigin: '' };
    expect(deadPageIssues(probe).join(' ')).toContain('https://api.example.test');
  });

  it('accepts an unarmed deploy whose page declares nothing', () => {
    const html = LIVE_HTML.replace(/<meta name="elevator-sim-api"[^>]*>/u, '');
    const probe: PageProbe = {
      ...alive(),
      expectedApiOrigin: '',
      page: ok('/', 'text/html', html),
    };
    expect(deadPageIssues(probe)).toEqual([]);
  });

  it('ignores the comment in the page that names the tag', () => {
    const html = LIVE_HTML.replace(
      '<title>',
      '<!-- DO NOT ADD <meta name="elevator-sim-api" content="https://wrong.example.test"> HERE. -->\n    <title>',
    );
    expect(declaredApiOriginOf(html)).toBe('https://api.example.test');
  });
});

describe('the assets the page references', () => {
  it('finds the module script and the stylesheet', () => {
    expect(assetPathsOf(LIVE_HTML)).toEqual(['/assets/index-aaa.css', '/assets/index-bbb.js']);
  });

  it('takes no absolute or cross-origin reference', () => {
    const html = LIVE_HTML.replace(
      '</head>',
      '<script type="module" src="https://cdn.example.test/x.js"></script></head>',
    );
    expect(assetPathsOf(html)).not.toContain('https://cdn.example.test/x.js');
  });

  it('is bounded, so a bundle with hundreds of chunks is not a spider', () => {
    const many = Array.from(
      { length: MAX_ASSETS + 20 },
      (_unused, index) => `<script type="module" src="/assets/c${String(index)}.js"></script>`,
    ).join('');
    expect(assetPathsOf(LIVE_HTML.replace('</head>', `${many}</head>`)).length).toBe(MAX_ASSETS);
  });

  /*
   * The one this check exists for after the page itself. A bundle that 404s leaves a page that
   * renders `<div class="shell">` and nothing else — a 200, the right content type, every marker
   * present, and no application. Every check above passes on it.
   */
  it('reports an asset that does not resolve', () => {
    const probe: PageProbe = {
      ...alive(),
      assets: [
        { path: '/assets/index-bbb.js', status: 404, contentType: 'text/html' },
        ok('/assets/index-aaa.css', 'text/css'),
      ],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/assets/index-bbb.js');
  });

  /*
   * A static host whose fallback rewrites unknown paths to `index.html` answers a missing bundle
   * with **200 text/html**. The browser refuses to execute it — `Failed to load module script` —
   * and the page is blank. A status check alone reads this as healthy, which is why the type is
   * checked separately rather than folded into the status.
   */
  it('reports a module script served as the page', () => {
    const probe: PageProbe = {
      ...alive(),
      assets: [ok('/assets/index-bbb.js', 'text/html'), ok('/assets/index-aaa.css', 'text/css')],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/assets/index-bbb.js');
  });

  it('accepts the type names a static host actually sends for a module', () => {
    for (const type of ['text/javascript', 'application/javascript', 'application/ecmascript']) {
      const probe: PageProbe = {
        ...alive(),
        assets: [ok('/assets/index-bbb.js', type), ok('/assets/index-aaa.css', 'text/css')],
      };
      expect(deadPageIssues(probe), type).toEqual([]);
    }
  });

  it('reports a page that references no script at all', () => {
    const html = LIVE_HTML.replace(/<script[^>]*><\/script>/u, '');
    const probe: PageProbe = { ...alive(), page: ok('/', 'text/html', html), assets: [] };
    expect(deadPageIssues(probe)).not.toEqual([]);
  });
});

describe('the data the application boots from', () => {
  it('reads the manifest', () => {
    expect(manifestBuildingsOf(MANIFEST)).toEqual(['midtown-office.json', 'vertical-city.json']);
    expect(manifestBuildingsOf('not json')).toEqual([]);
    expect(manifestBuildingsOf(undefined)).toEqual([]);
  });

  /*
   * A name with nothing under it is the same failure one level down: the manifest lists a building
   * and the application still has nothing to boot from. It is the shape a half-working emitter
   * produces, and it is the exact shape the first draft of this check counted as healthy.
   */
  it('does not count an entry that names a building and carries none', () => {
    expect(
      manifestBuildingsOf(JSON.stringify({ files: [{ name: 'midtown-office.json' }] })),
    ).toEqual([]);
    expect(
      manifestBuildingsOf(JSON.stringify({ files: [{ name: '', data: { id: 'x' } }] })),
    ).toEqual([]);
    expect(manifestBuildingsOf(JSON.stringify({ files: ['midtown-office.json'] }))).toEqual([]);
  });

  /*
   * `docs/27-flow-maps.md` F0's *Unavailable* row, as a deployed site rather than as a flow: with
   * `data/` absent the Everyday shell covers the Engineer surface's own failure notice and the
   * player meets a main menu whose every tile leads to a screen saying the boot has not finished
   * yet — a sentence that is false in that state and is never retracted. Nothing in the product
   * reports it and nothing in the pipeline did either.
   */
  it('reports a manifest that is not served', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [{ path: '/__buildings.json', status: 404, contentType: 'text/html' }],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/__buildings.json');
  });

  it('reports a manifest served as the page rather than as data', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [ok('/__buildings.json', 'text/html', MANIFEST)],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/__buildings.json');
  });

  it('reports a manifest that carries no buildings', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [
        ok('/__buildings.json', 'application/json', JSON.stringify({ files: [] })),
        ...DATA_PATHS.map((path) => ok(path, 'application/json')),
      ],
    };
    expect(deadPageIssues(probe)).not.toEqual([]);
  });

  it('reports one of the other data documents the site does not serve', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [
        ok('/__buildings.json', 'application/json', MANIFEST),
        { path: '/elevator-specs.json', status: 404, contentType: 'text/html' },
        ...DATA_PATHS.slice(1).map((path) => ok(path, 'application/json')),
      ],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/elevator-specs.json');
  });

  it('reports one served as the page rather than as data', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [
        ok('/__buildings.json', 'application/json', MANIFEST),
        ok('/campaign.json', 'text/html'),
        ...DATA_PATHS.filter((path) => path !== '/campaign.json').map((path) =>
          ok(path, 'application/json'),
        ),
      ],
    };
    expect(deadPageIssues(probe).join(' ')).toContain('/campaign.json');
  });

  /*
   * The vacuity direction. A probe that simply stopped fetching one of these would otherwise report
   * nothing about it and read as healthy — which is how a check quietly stops checking.
   */
  it('reports a data document that was never probed at all', () => {
    const probe: PageProbe = {
      ...alive(),
      data: [ok('/__buildings.json', 'application/json', MANIFEST)],
    };
    const reported = deadPageIssues(probe).join(' ');
    for (const path of DATA_PATHS) expect(reported, path).toContain(path);
  });
});

describe('the summary', () => {
  it('names every issue it found, so a run log is enough to act on', () => {
    const probe: PageProbe = {
      ...alive(),
      page: { path: '/', status: 503, contentType: '' },
      assets: [{ path: '/assets/index-bbb.js', status: 404, contentType: 'text/html' }],
    };
    const issues = deadPageIssues(probe);
    expect(issues.length).toBeGreaterThan(1);
    const summary = summaryOf(probe, issues);
    for (const issue of issues) expect(summary).toContain(issue);
  });

  /*
   * The vacuity floor, in the one form it can take here. `blocked-by.mjs` counts declarations; this
   * check has no corpus to count, so what it asserts instead is that the healthy fixture above is
   * the *only* thing that returns nothing — every case in this file breaks one field of it and
   * every one of them is required to report. A check that reported nothing on all of them would
   * pass the happy-path test and nothing else.
   */
  it('does not report a healthy deploy as dead', () => {
    /*
     * The verdict rather than the word: this check's own name is `dead-page`, and it is in the
     * heading of every summary it writes. Asserting on `dead` passed the failing case and failed
     * the healthy one, which is what a check reading its own name looks like.
     */
    expect(summaryOf(alive(), []).toLowerCase()).not.toContain('not usable');
    expect(summaryOf(alive(), ['something']).toLowerCase()).toContain('not usable');
  });
});
