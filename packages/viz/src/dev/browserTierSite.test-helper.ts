/**
 * **What the browser tier runs against**: which browser it drives, and which *artifact* it serves —
 * GitHub issues #142 and #281, [`DECISIONS.md`](../../../../DECISIONS.md) § D425.
 *
 * ## Why these two things are one module
 *
 * They look unrelated and they are not: both are facts about the tier's environment that have to be
 * readable from **outside the test runtime**. Vitest's `globalSetup` runs in the main process before
 * any suite is collected, so it cannot import `browserTier.test-helper.ts` — that module registers
 * `afterEach`/`afterAll` at module scope, and importing it from a global setup fails with vitest's
 * own *"failed to find the current suite"*. Measured, not assumed: a throwaway global setup that
 * imported it produced exactly that error.
 *
 * So the gate lives here, and `browserTier.test-helper.ts` re-exports it. **That is a move, not a
 * copy** — there is still exactly one definition of {@link HAS_BROWSER} in the repository, which is
 * the whole point of GitHub issue #142 and the reason six private copies were deleted. Every file in
 * the tier still imports it from `browserTier.test-helper.js` and none of them changed.
 *
 * ## The artifact — GitHub issue #281
 *
 * The tier used to drive a **`vite dev` server** in 32 of its 33 files while players load
 * `dist-web/`, produced by `npm run build:web` and served as static files. They are not the same
 * artifact. What differs between them was measured on this host rather than listed from Vite's
 * documentation, because most of the textbook differences turn out not to bite here:
 *
 * | difference | does it bite? |
 * |---|---|
 * | CSS delivery | **no** — `index.html` carries the whole stylesheet inline, so both artifacts serve one `<style>` of 103 542 characters with the same SHA-256 |
 * | layout and geometry | **no**, at `375×667`: every tile box, the rail, the bar and both scrollers measured identical to 0.01 px |
 * | env replacement | **no** — nothing under `packages/viz/src` reads `import.meta.env` |
 * | module resolution, transform, minification | **yes, in kind**: dev serves `/@vite/client` + `/src/everyday/boot.ts`; the bundle serves one hashed `/assets/index-*.js` |
 * | **asset surface** | **yes, and this is the large one** — see below |
 *
 * The asset surface is where a defect can live and be invisible. `vite.config.ts` sets `publicDir`
 * to the repository's `data/`, so the **dev server answers for every file in it**; on build,
 * `copyPublicDir` is `false` and only `WEB_DATA_FILES` plus `__buildings.json` are emitted.
 * Measured on the two servers side by side:
 *
 * | request | `vite dev` | `dist-web` |
 * |---|---|---|
 * | `/elevator-specs.json` | 200 `application/json` | 200 `application/json` |
 * | `/buildings/midtown-office.json` | **200 `application/json`** | **the SPA fallback, `text/html`** |
 * | the buildings README — `data/buildings/README.md` on disk, requested at /buildings/README.md because `publicDir` is `data/` | **200 `text/markdown`** | the SPA fallback |
 * | `/src/everyday/host.ts` | 200 `text/javascript` | the SPA fallback |
 *
 * So a viewer that started fetching a seventh document would work on every machine in this
 * repository and 404 in production — and `fetchJson` would report it as *"did not parse as JSON"*
 * rather than as a missing file, because the fallback answers **200** with an HTML body. That is
 * the class this module exists to put under test, and `builtBundle.browser.test.ts` mutation-proves
 * it.
 *
 * ## The shape: one build per run, one server per file
 *
 * {@link setup} is the `viz-browser` project's `globalSetup`. It builds `dist-web/` **once**, before
 * any file is collected, and provides how long that took. {@link startShippedSite} then serves that
 * one output with Vite's own `preview()` — no rebuild — so each file still gets a server and a port
 * of its own and the tier keeps the file isolation it already had.
 *
 * A build per **file** was measured and rejected: 4.5 s × 32 files is about 150 s onto a 269 s tier,
 * where one build is 4.5 s onto the same tier and buys the same artifact.
 *
 * ## And a build per file is not merely slower — it was already broken, which is why this is a
 * structural guarantee rather than an optimisation
 *
 * The helper this replaces *built* on every call, and two tier files called it. Vitest runs files in
 * parallel, `dist-web/` is one directory, and `vite.config.ts` sets `emptyOutDir: true` — so the
 * second file's write phase deleted the site the first file's `preview` server was still serving.
 * Measured on this host by running the old helper twice over: the already-serving preview answered
 * **404 on 63 of 87** requests for `/`, **62 of 87** for its own entry chunk, and a live page saw
 * **404 on 18 of 140** requests for `/fixit-cases.json` — a window of roughly 900 ms in which the
 * site did not exist.
 *
 * That is both of the CI reds of 2026-09-01, on a commit whose whole diff was one unrelated file:
 * macOS reported `net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost:5299/`, which is the first
 * row; linux reported *"the fixit screen drew no heading to measure"*, which is what
 * `everyday/fixitScreen.ts#render` draws when its data fetch fails, because the `loadFailure` branch
 * has no `h1` in it. The 404 window is measured; that the failure branch draws no heading is read
 * off the code rather than observed on a runner, and the distinction is kept because the two are
 * different kinds of evidence.
 *
 * **This tier ran rarely enough for that to go unnoticed since 2026-08-26**, which is GitHub issue
 * #163's shape one level in. One build, before any file is collected, makes the race impossible
 * rather than unlikely — and `browserTier.test.ts` fails any tier file that calls `build(` again.
 *
 * **The build is skipped when there is no browser**, because the tier is skipped then too and a
 * bundle nobody serves is 4.5 s spent on nothing. That is the one place {@link HAS_BROWSER} is read
 * outside a test.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ========================================================================== *
 * The gate — which browser, GitHub issue #142
 * ========================================================================== */

/**
 * The variable that points the tier at a browser.
 *
 * Exported as a **string** rather than only read, because `browserTier.test.ts` greps the tier's own
 * sources for it: a file that names the variable without going through this module has rolled its
 * own gate, and that is the thing the guard has to be able to see.
 */
export const CHROMIUM_ENV = 'ELEVATOR_SIM_CHROMIUM';

/**
 * Where the tier looks when nothing says otherwise.
 *
 * A path from the environment that originally provisioned this tier, kept because it costs nothing
 * and documents what *provisioned* meant there. It is not a default anybody should rely on — but
 * **it is not dead either, and this sentence used to say it was.**
 *
 * It read *"on every machine this repository has been measured on since, it does not exist, and the
 * tier skips"* until 2026-08-26, when a host arrived where it **does** exist: the tier ran from this
 * constant with {@link CHROMIUM_ENV} unset, `dailyLoop.browser.test.ts` 6 passed in 18.81 s.
 * `ISSUE_WORKER_LEDGER.md` W18-5 carried the same claim and is corrected with it. Both were true
 * where they were written, which is the point — a sentence about *the environment* goes stale the
 * same way a sentence about the product does (`RISKS.md` R38), and nothing re-derives this one.
 *
 * So read it as: **a fallback that works on some hosts and not others**, which is exactly why
 * {@link HAS_BROWSER} tests the file rather than trusting the constant.
 */
const PROVISIONED_FALLBACK =
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

/** The executable the tier will launch. */
export const CHROMIUM = process.env[CHROMIUM_ENV] ?? PROVISIONED_FALLBACK;

/** Whether this machine has one. Every suite in the tier hangs off this. */
export const HAS_BROWSER = existsSync(CHROMIUM);

/**
 * What a reader is told when it does not.
 *
 * One sentence, and it names the path it looked at rather than only the variable — the two failures
 * *unset* and *set to something that has been deleted* look identical without it, and the second one
 * is what a stale shell revision produces.
 */
export const SKIP_REASON =
  `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
  `Set ${CHROMIUM_ENV} to run the browser tier (DECISIONS.md § D220, GitHub issue #142).`;

/* ========================================================================== *
 * The artifact — which build, GitHub issue #281
 * ========================================================================== */

/** `packages/viz`, the Vite root. */
const VIZ_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The one configuration the deploy, the dev server and this tier all resolve. */
const VITE_CONFIG = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

/** Where `npm run build:web` puts the artifact players receive. `vite.config.ts` owns the name. */
const DIST_WEB = fileURLToPath(new URL('../../dist-web', import.meta.url));

/**
 * How long the once-per-run build took, in milliseconds, and `undefined` when it was skipped.
 *
 * Provided to the tier rather than published as a comment, so the cost gate in
 * `builtBundle.browser.test.ts` is a **case** — the day a build becomes minutes, the thing that
 * notices is a failing test rather than a reader.
 */
declare module 'vitest' {
  interface ProvidedContext {
    /** Milliseconds the `viz-browser` global setup spent in `vite build`; `-1` when it skipped. */
    shippedBuildMs: number;
  }
}

/** What vitest hands a `globalSetup`. Structurally typed, so no vitest import is needed here. */
interface ProvidingProject {
  provide(key: 'shippedBuildMs', value: number): void;
}

/**
 * Build `dist-web/` once for the whole `viz-browser` run — the project's `globalSetup`.
 *
 * Registered in `vitest.config.ts` beside the project it serves. It runs in vitest's main process
 * before any file is collected, which is why this module may not import anything that registers a
 * hook; see the header.
 *
 * `emptyOutDir` is `true` in `vite.config.ts`, so this is a clean build every run rather than an
 * incremental one — a stale `dist-web/` from a previous checkout cannot be served by accident.
 */
export async function setup(project: ProvidingProject): Promise<void> {
  if (!HAS_BROWSER) {
    console.warn(`${SKIP_REASON} dist-web/ was not built, because nothing would serve it.`);
    project.provide('shippedBuildMs', -1);
    return;
  }
  const { build } = await import('vite');
  const startedAt = process.hrtime.bigint();
  await build({ configFile: VITE_CONFIG, root: VIZ_ROOT, logLevel: 'error' });
  project.provide('shippedBuildMs', Number((process.hrtime.bigint() - startedAt) / 1_000_000n));
  if (!existsSync(`${DIST_WEB}/index.html`)) {
    throw new Error(
      `vite build reported success and ${DIST_WEB}/index.html does not exist. The browser tier ` +
        'serves that directory; without it every file in the tier would drive the SPA fallback of ' +
        'an empty site and could still pass, which is GitHub issue #281 with a new cause.',
    );
  }
}

/** A served copy of the shipped bundle, and the way to stop serving it. */
export interface ShippedSite {
  readonly origin: string;
  close(): Promise<void>;
}

/**
 * Serve `dist-web/` the way the deploy serves it, for one test file.
 *
 * ## Why `preview()` and not a static server of our own
 *
 * It is the server Vite ships for exactly this, so its SPA fallback and its MIME handling are the
 * deploy's rather than this file's guesses. It does **not** build — {@link setup} did that once —
 * so a call here costs a socket rather than four seconds.
 *
 * ## Why it takes Vite's own `preview` options rather than a port
 *
 * `browserTier.test.ts` derives every tier file's port **from its source text** and requires them to
 * be distinct. A port chosen in here, or passed as a bare number, would be invisible to that guard.
 * So the calling file writes `preview: { port: NNNN }` and the guard reads it there, exactly as it
 * reads `server: { port: NNNN }` from the files that still drive a dev server.
 *
 * **`strictPort: false` is as load-bearing here as it is on a dev server, and the numbers differ.**
 * Resolving `vite.config.ts` and reading the result back — rather than reasoning from the file —
 * reports `server.port 5174 / server.strictPort true` and `preview.port 4173 /
 * preview.strictPort true`. So `preview` **inherits** `strictPort` from `server` and does *not*
 * inherit the port: a file that named no port would land every one of the tier's servers on 4173
 * and the second to start would throw `Port 4173 is already in use`, which is
 * `boot.browser.test.ts`'s trap with a different number. That is why the guard's clause about
 * `port: 0` is kept and why its message now names both defaults.
 *
 * ## Why it refuses rather than serves nothing
 *
 * A `preview` server over a missing `dist-web/` answers every request with a 404 and every *page*
 * request with nothing at all — which would look like a product that fails to boot. The check below
 * turns that into one sentence naming the cause. It is reachable in practice: a developer who runs
 * `vitest run packages/viz/src/dev/menu.browser.test.ts` **without** `--project viz-browser` gets no
 * global setup and therefore no build.
 */
export async function startShippedSite(options: {
  readonly preview: { readonly port: number; readonly strictPort?: boolean };
}): Promise<ShippedSite> {
  if (!existsSync(`${DIST_WEB}/index.html`)) {
    throw new Error(
      `no built bundle at ${DIST_WEB}. The browser tier serves the artifact players load, and ` +
        "`vitest.config.ts`'s viz-browser project builds it once in globalSetup — so this file was " +
        'run outside that project. Use `vitest run --project viz-browser <file>`, or ' +
        '`npm run build:web` in packages/viz first. GitHub issue #281.',
    );
  }
  const { preview } = await import('vite');
  const server = await preview({
    configFile: VITE_CONFIG,
    root: VIZ_ROOT,
    // `strictPort: false` by default for the reason every server-starting file in this tier carries
    // it: files in one project run concurrently, and a busy port should move rather than fail the
    // case.
    preview: { strictPort: false, ...options.preview },
  });

  const origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/u, '');
  if (origin === '') throw new Error('the preview server did not report a URL');

  return {
    origin,
    close: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
