#!/usr/bin/env node
/**
 * The dead-page check — GitHub issue **#242**, AC5.
 *
 * ## What this exists to stop
 *
 * `docs/05-roadmap.md`: a `let` declared below the `boot()` sequence that assigns it threw on
 * boot's second statement, and **2 100 tests were green over a dead page**. That was closed
 * pre-merge, twice. What was never closed is the other half: **nothing looks at the page after it
 * is deployed.** `.github/workflows/deploy-viz.yml` asserts the artifact on the runner's own disk
 * and then uploads it, and the last step after the upload echoes a URL. `docs/16` § 11 step 4 says
 * the rule outright — *verify what is served, not what the run said. A green run is a report about
 * an upload.* This is that step, run by the pipeline instead of by a person in an incident.
 *
 * ## What it catches, and what it does not
 *
 * It catches a page that is not served, is served under a status or type a browser will not render,
 * is served and carries none of the application, references an asset that does not resolve or
 * resolves as something a browser will not execute, does not serve the data the application boots
 * from, or names an API origin other than the one this deploy expects.
 *
 * **It does not catch a bundle that is served correctly and throws**, and no HTTP probe can: the
 * module arrives with a 200 and the right type either way. That half is
 * `everyday/builtBundle.browser.test.ts`, pre-merge, on the same artifact bytes. The pair is what
 * AC5 asks for and neither half is the whole of it. Saying so here rather than only in the test is
 * deliberate: this file is what an operator reads in an incident, and a check that overstated its
 * own reach would send them looking in the wrong place.
 *
 * ## Four constraints, and each rules out the obvious implementation
 *
 * 1. **It cannot be a vitest test.** This repository's node tier has no network, and the deployed
 *    build is unreachable from it anyway — `everyday/builtBundle.browser.test.ts` records `curl`
 *    returning status `000` (GitHub issue #123). So this is a plain Node script the deploy workflow
 *    runs after the upload, with the decision in exported pure functions that
 *    `validation/deadPage.test.ts` drives against fixtures with no network at all.
 * 2. **It installs nothing.** It runs in the `deploy` job, which has checked out the tree and has
 *    no `node_modules`. No dependency, no build step, no compiled output — `blocked-by.mjs`'s
 *    constraint and the reason both scripts are `.mjs` with a hand-written `.d.mts` beside them.
 * 3. **It fails the run.** Unlike `blocked-by.mjs`, which reports a backlog condition and exits 0,
 *    a dead page *is* a defect in what just shipped, and a deploy that put one up must not be
 *    green. It exits 1 and names every issue.
 * 4. **It retries, briefly, and only on the page.** A static host has a propagation window after an
 *    upload, so a single request against a site that is one second from being correct would be a
 *    check that fails for a reason nobody can act on. The retry is on the page's own status only —
 *    an asset served as the wrong type is not a thing that becomes right by waiting, and retrying
 *    it would only make a real defect take longer to report.
 *
 * ## Usage
 *
 *   node scripts/dead-page.mjs <site-origin> [expected-api-origin]
 *
 * `expected-api-origin` empty or absent means *the page must declare none* — the unarmed arm, which
 * is the shape `deploy-viz.yml` already asserts against the artifact in both directions.
 */

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The markers a served page must carry to be the application rather than a placeholder.
 *
 * Three, and each is load-bearing for a different reason. `<div class="shell"` is the Engineer
 * surface's root, which `index.html` has carried since before either shell existed. The module
 * script tag is what loads the application at all. The wordmark is the one piece of visible text
 * every render of this page starts from, and it is here because the first two are structural: a
 * host that served an unrelated single-page application would satisfy both.
 *
 * **A marker is a substring rather than a parse**, because this file may not depend on a parser
 * and a regular expression over HTML is the thing that goes subtly wrong. Every one of them is a
 * literal `index.html` carries, and the test strips each in turn and requires a report — so a
 * marker that stops being true of the page fails the check rather than quietly matching nothing.
 */
export const SHELL_MARKERS = Object.freeze([
  '<div class="shell">',
  'type="module"',
  '<title>Elevator Sim</title>',
]);

/**
 * How many assets are fetched, at most.
 *
 * A ceiling rather than *all of them*, because this runs against a live site in a deploy job and a
 * check that walked an arbitrary number of URLs would be a spider with a budget nobody set. Twelve
 * is comfortably above what this bundle emits — one module, one stylesheet — and is a bound rather
 * than a guess: what it protects against is a future build splitting into hundreds of chunks and
 * turning a ten-second check into a minute of requests against a Free-SKU host.
 */
export const MAX_ASSETS = 12;

/** How many times `GET /` is attempted before the page is called dead, and how long between. */
const PAGE_ATTEMPTS = 6;
const PAGE_WAIT_MS = 5_000;

/**
 * The manifest every build emits.
 *
 * **The buildings it names are not separately served, and that was learned by running this against
 * production rather than by reading the emitter.** The first draft of this file probed
 * `/buildings/<name>.json` for the first entry and expected the manifest to be a list of names; the
 * live site answered `404 text/html` for the first and the manifest turned out to hold whole
 * building documents inline. `packages/viz/vite.config.ts` says why in its own words — *"the viewer
 * never fetches one: HTTP has no directory listing"* — so one document is assembled from
 * `data/buildings/*.json` at build time. A check that kept probing that path would have failed on a
 * perfectly healthy site forever, which is the cry-wolf direction and worse than not checking.
 */
const MANIFEST_PATH = '/__buildings.json';

/**
 * The other data documents the built site serves at its root.
 *
 * The same list `.github/workflows/deploy-viz.yml` asserts against the artifact before the upload,
 * checked here against what is **served** — which is the whole difference this file exists for. They
 * are the deployed form of `docs/27-flow-maps.md` F0's *Unavailable* row: with these absent the shell
 * covers the failure notice and the player meets a main menu whose every tile leads nowhere.
 */
const DATA_PATHS = Object.freeze([
  '/elevator-specs.json',
  '/traffic-profiles.json',
  '/dispatcher-profiles.json',
  '/campaign.json',
  '/scenario-goals.json',
]);

/**
 * The content types a browser will execute a module script under.
 *
 * A list rather than a `startsWith('text/java')`, because the failure this guards is a host sending
 * `text/html` — the fallback rewrite — and being generous about what counts as JavaScript is
 * exactly how that failure gets through.
 */
const SCRIPT_TYPES = Object.freeze([
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript',
  'module',
]);

/**
 * Where the comments are, as `[start, end)` spans — **not** a sanitiser, and the distinction is the
 * point.
 *
 * This began as `html.replace(/<!--[\s\S]*?-->/gu, '')`, and CodeQL was right to flag it: that is
 * the shape of an *incomplete multi-character sanitisation*, and a rule written for code that
 * strips markup and then emits it. **This code never emits HTML** — it fetches the page this
 * project itself deploys and reads two things out of it — so the injection the rule is about cannot
 * happen here.
 *
 * The pattern was still wrong to use, for a reason that matters more to a monitor than the rule
 * does: a fragile parse gives a **wrong answer about whether the site is alive**. A missed alarm is
 * this script's worst outcome, and *the regex mis-handled a comment* is exactly how one arrives.
 *
 * So there is no stripping. The comment spans are computed once and every match is asked whether it
 * lies inside one — which is decidable, testable, and cannot silently delete the text around a
 * malformed comment the way a replace can.
 *
 * **What it still does not do, stated rather than implied**: this scans for `<!--` and knows
 * nothing about tags, so a comment-like string inside an *attribute value* is read as an opener,
 * exactly as the replace did. `deadPage.test.ts` asserts that as a limit rather than hiding it.
 * Fixing it means tracking tag and attribute state — real HTML parsing — which is not proportionate
 * for a monitor whose input is this project's own build output.
 */
function commentSpansOf(html) {
  const spans = [];
  let at = 0;
  for (;;) {
    const open = html.indexOf('<!--', at);
    if (open < 0) return spans;
    const close = html.indexOf('-->', open + 4);
    /* An unterminated comment runs to the end of the document, which is what a browser does too. */
    if (close < 0) {
      spans.push([open, html.length]);
      return spans;
    }
    spans.push([open, close + 3]);
    at = close + 3;
  }
}

/** Whether an offset falls inside any comment span. */
function insideComment(spans, index) {
  return spans.some(([from, to]) => index >= from && index < to);
}

/**
 * The API origin the served page declares, or `''`.
 *
 * Comments are stripped first, and that is not caution: `packages/viz/index.html` carries a comment
 * saying **DO NOT ADD** this tag by hand, and matching that comment is a bug the deploy workflow
 * made here once already — by the very commit that added the comment.
 */
export function declaredApiOriginOf(html) {
  const spans = commentSpansOf(html);
  const pattern = /<meta[^>]*name=["']elevator-sim-api["'][^>]*content=["']([^"']*)/gu;
  for (const found of html.matchAll(pattern)) {
    if (insideComment(spans, found.index)) continue;
    return found[1] ?? '';
  }
  return '';
}

/**
 * The same-origin paths the served page references — module scripts and stylesheets.
 *
 * Same-origin only, and deliberately: a cross-origin reference would be blocked by this page's own
 * `script-src 'self'` before it loaded, so fetching one would be checking something the browser
 * never does. Sorted, so the check reports in a stable order and a test can compare a list.
 */
export function assetPathsOf(html) {
  const spans = commentSpansOf(html);
  const paths = new Set();
  const pattern = /(?:src|href)\s*=\s*["'](\/[^"'>]*)["']/gu;
  for (const match of html.matchAll(pattern)) {
    if (insideComment(spans, match.index)) continue;
    const path = match[1];
    if (path === undefined) continue;
    if (!/\.(?:js|mjs|css)(?:\?|$)/u.test(path)) continue;
    paths.add(path);
  }
  return [...paths].sort().slice(0, MAX_ASSETS);
}

/**
 * The buildings a fetched manifest actually carries, by name, or `[]`.
 *
 * An entry counts only when it has a name **and** a body. A manifest listing names with nothing
 * under them is the same failure as a manifest with no names — the application has nothing to boot
 * from either way — and it is the one an emitter that half-worked would produce.
 */
export function manifestBuildingsOf(body) {
  if (body === undefined) return [];
  try {
    const parsed = JSON.parse(body);
    const files = parsed?.files;
    if (!Array.isArray(files)) return [];
    return files
      .filter(
        (entry) =>
          typeof entry?.name === 'string' &&
          entry.name !== '' &&
          typeof entry.data === 'object' &&
          entry.data !== null,
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Whether a content type is one of a list, ignoring parameters and case. */
function typeIsOneOf(contentType, allowed) {
  const bare = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return allowed.includes(bare);
}

function describeFetched(entry) {
  const type = entry.contentType === '' ? 'no content type' : entry.contentType;
  return entry.status === 0
    ? `${entry.path} — the request did not complete`
    : `${entry.path} — HTTP ${String(entry.status)}, ${type}`;
}

/**
 * Why a served page is dead, in the order the checks run. Empty means alive.
 *
 * Ordered from the outside in — the page, then what the page names, then what the application boots
 * from — so the first line of a failing run is the outermost thing that is wrong. Every check
 * reports rather than throwing, because an operator wants the whole list in one run and not the
 * first item six times.
 */
export function deadPageIssues(probe) {
  const issues = [];
  const { page } = probe;

  if (page.status !== 200) {
    issues.push(`the page did not answer 200: ${describeFetched(page)}`);
  } else if (!typeIsOneOf(page.contentType, ['text/html', 'application/xhtml+xml'])) {
    issues.push(
      `the page is served as ${page.contentType === '' ? 'nothing' : page.contentType}, which a browser will not render as a page`,
    );
  }

  const html = page.body ?? '';
  if (page.status === 200) {
    const missing = SHELL_MARKERS.filter((marker) => !html.includes(marker));
    if (missing.length > 0) {
      issues.push(
        `the page answered 200 and is not this application: it carries none of ${missing.map((marker) => JSON.stringify(marker)).join(', ')}`,
      );
    }

    const declared = declaredApiOriginOf(html);
    if (probe.expectedApiOrigin !== '' && declared !== probe.expectedApiOrigin) {
      issues.push(
        `the served page names ${declared === '' ? 'no API' : declared} and this deploy expects ${probe.expectedApiOrigin}. A page that names the wrong API loads, draws, and dead-ends every account, leaderboard and challenge surface with no failing status code anywhere`,
      );
    }
    if (probe.expectedApiOrigin === '' && declared !== '') {
      issues.push(
        `the served page names ${declared} and this deploy is unarmed, so it should name none`,
      );
    }
  }

  const scripts = probe.assets.filter((entry) => /\.(?:js|mjs)(?:\?|$)/u.test(entry.path));
  if (page.status === 200 && scripts.length === 0) {
    issues.push('the served page references no module script, so nothing on it can run');
  }

  for (const entry of probe.assets) {
    if (entry.status !== 200) {
      issues.push(`an asset the page references is not served: ${describeFetched(entry)}`);
      continue;
    }
    const isScript = /\.(?:js|mjs)(?:\?|$)/u.test(entry.path);
    if (isScript && !typeIsOneOf(entry.contentType, SCRIPT_TYPES)) {
      issues.push(
        `a module script is served as ${entry.contentType === '' ? 'nothing' : entry.contentType}, which a browser refuses to execute: ${entry.path}`,
      );
    }
  }

  const manifest = probe.data.find((entry) => entry.path === MANIFEST_PATH);
  if (manifest === undefined) {
    issues.push(`${MANIFEST_PATH} was not probed`);
  } else if (manifest.status !== 200) {
    issues.push(`the data manifest is not served: ${describeFetched(manifest)}`);
  } else if (!typeIsOneOf(manifest.contentType, ['application/json', 'text/json'])) {
    issues.push(
      `the data manifest is served as ${manifest.contentType === '' ? 'nothing' : manifest.contentType} rather than as data: ${MANIFEST_PATH}`,
    );
  } else if (manifestBuildingsOf(manifest.body).length === 0) {
    issues.push(
      `the data manifest carries no buildings, so the application has nothing to boot from: ${MANIFEST_PATH}`,
    );
  }

  for (const entry of probe.data) {
    if (entry.path === MANIFEST_PATH) continue;
    if (entry.status !== 200) {
      issues.push(`a data document the application boots from is not served: ${describeFetched(entry)}`);
    } else if (!typeIsOneOf(entry.contentType, ['application/json', 'text/json'])) {
      issues.push(
        `a data document is served as ${entry.contentType === '' ? 'nothing' : entry.contentType} rather than as data: ${entry.path}`,
      );
    }
  }

  const missing = DATA_PATHS.filter(
    (path) => !probe.data.some((entry) => entry.path === path),
  );
  for (const path of missing) issues.push(`${path} was not probed`);

  return issues;
}

/** The lines the run prints and writes to the job summary. */
export function summaryOf(probe, issues) {
  const head = `dead-page check — ${probe.origin}`;
  if (issues.length === 0) {
    const probed = probe.assets.length + probe.data.length + 1;
    return [
      head,
      `the served page is alive: ${String(probed)} requests, every one of them as expected.`,
      'What this does not check: a bundle that is served correctly and throws. That is the browser',
      'tier, pre-merge, on the same artifact bytes.',
    ].join('\n');
  }
  return [
    `${head} — the served page is not usable.`,
    ...issues.map((issue) => `  - ${issue}`),
    '',
    'Putting a previous build back on the live site is the revert procedure in',
    'docs/16-static-site-deployment.md, and it is not the disarm command.',
  ].join('\n');
}

/* -------------------------------------------------------------------------- *
 * Everything below needs the network and is not exported.
 * -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** One request, reduced to what the check reads. A failure is a status of `0`, never a throw. */
async function probeOne(origin, path, withBody) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: 'follow' });
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const body = withBody ? await response.text() : undefined;
    return body === undefined
      ? { path, status: response.status, contentType }
      : { path, status: response.status, contentType, body };
  } catch {
    /*
     * The message is not carried. What an operator needs is *which path did not answer*, and a
     * fetch failure's text is the runtime's own vocabulary — which is the same argument
     * `serve.ts` makes about not putting an unhandled error's text in a response body.
     */
    return { path, status: 0, contentType: '' };
  }
}

async function main() {
  const origin = process.argv[2];
  const expectedApiOrigin = process.argv[3] ?? '';
  if (origin === undefined || origin === '') {
    throw new Error('usage: node scripts/dead-page.mjs <site-origin> [expected-api-origin]');
  }

  let page = await probeOne(origin, '/', true);
  for (let attempt = 1; attempt < PAGE_ATTEMPTS && page.status !== 200; attempt += 1) {
    console.log(
      `dead-page: ${describeFetched(page)} — waiting ${String(PAGE_WAIT_MS / 1000)}s and asking again (${String(attempt)}/${String(PAGE_ATTEMPTS - 1)})`,
    );
    await sleep(PAGE_WAIT_MS);
    page = await probeOne(origin, '/', true);
  }

  const assets = [];
  for (const path of assetPathsOf(page.body ?? '')) assets.push(await probeOne(origin, path, false));

  const data = [await probeOne(origin, MANIFEST_PATH, true)];
  for (const path of DATA_PATHS) data.push(await probeOne(origin, path, false));

  const probe = { origin, page, expectedApiOrigin, assets, data };
  const issues = deadPageIssues(probe);
  const summary = summaryOf(probe, issues);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
  }
  for (const issue of issues) console.log(`::error::dead-page: ${issue}`);
  if (issues.length > 0) process.exit(1);
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(`dead-page: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
