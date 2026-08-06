/**
 * `node dist/main.js` — the executable, and the named non-test caller of `serve.ts` and
 * `bootstrap.ts`.
 *
 * That sentence is the point of the file. This repository's most-repeated defect is a behaviour
 * that is configurable, unit-tested and called from nothing shipped — eleven times in code — and a
 * server whose only caller is its own test would be the twelfth.
 *
 * Everything it reads is an environment variable, and every one of them is listed below with what
 * happens when it is absent. `ELEVATOR_SIM_SECRET` has no default and never will (§ D214 § 5).
 */

import { fileURLToPath } from 'node:url';

import { bootstrap } from './bootstrap.js';
import { serve } from './http/serve.js';
import { loadStaticBundle, requireOrigin, type StaticBundle } from './http/static.js';
import { PgSql } from './store/sql.js';

/**
 * The `null` origin: *"no page may call this API cross-origin"*.
 *
 * A real CORS token rather than a placeholder — it is what a browser sends for an opaque origin,
 * and no page the viewer is ever served from matches it. It is the shipped default because an
 * operator who has not thought about CORS should get the answer that cannot be wrong, and because
 * the container serves the page and the API from one origin, where there is no cross-origin request
 * to permit at all (§ D243).
 */
export const NO_CROSS_ORIGIN = 'null';

/**
 * The PostgreSQL connection string, from the environment.
 *
 * **No default**, for `ELEVATOR_SIM_SECRET`'s reason rather than a weaker version of it: a default
 * pointing at a local database is how a server that was meant to be talking to the production one
 * comes up healthy, empty, and wrong. A missing connection string must read as a configuration
 * mistake with an obvious fix, which is what it is.
 */
function requireDatabaseUrl(env: Readonly<Record<string, string | undefined>>): string {
  const url = env['ELEVATOR_SIM_DB'];
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      'ELEVATOR_SIM_DB is not set. It is the PostgreSQL connection string, e.g. ' +
        'postgres://user:password@host:5432/elevator_sim?sslmode=require. There is deliberately ' +
        'no default: one pointing at localhost is how an empty database gets mistaken for a live one.',
    );
  }
  return url;
}

/**
 * Load the built viewer, or explain why there isn't one.
 *
 * The two cases are deliberately not the same. **`ELEVATOR_SIM_WEB` set** is an operator saying
 * *"serve the viewer from here"*, so a directory that is missing or is not a build is a failure and
 * the process stops — a container that came up serving JSON and no pages would otherwise read as a
 * viewer bug. **`ELEVATOR_SIM_WEB` unset** is the ordinary API-only case, so a missing default
 * build is fine, and the one thing it must not do is be silent about it: a developer who forgot
 * `npm run build:web` and a deployment that shipped without the bundle look identical from the
 * outside, and the startup line is what tells them apart.
 */
async function loadViewer(
  env: Readonly<Record<string, string | undefined>>,
): Promise<StaticBundle | undefined> {
  const configured = env['ELEVATOR_SIM_WEB'];
  if (configured !== undefined && configured.trim().length > 0) return loadStaticBundle(configured);

  const fallback = fileURLToPath(new URL('../../viz/dist-web/', import.meta.url));
  try {
    return await loadStaticBundle(fallback);
  } catch {
    // eslint-disable-next-line no-console -- the alternative is a server that quietly serves no pages.
    console.log(
      `no viewer bundle at ${fallback} — serving the API only. ` +
        'Run `npm run build:web -w @elevator-sim/viz`, or set ELEVATOR_SIM_WEB.',
    );
    return undefined;
  }
}

/**
 * Where the viewer lives — the origin sign-in links point at, and the only page CORS will permit.
 *
 * **It is the viewer's origin and not this server's**, and since § D257 those can differ. A magic
 * link resolves to a *page* (§ D241 § 4), so when the page moves to a CDN the link has to move with
 * it; the value was already a parameter, which is why nothing here is new machinery. What is new is
 * that it is now checked: a typo used to produce a deployment that comes up healthy and mails links
 * nobody can open, and the failure surfaces only in somebody else's inbox.
 *
 * The default is this process's own origin, which is right for local development and for the
 * shipped container — and wrong for every split deployment, which is why the template sets it and
 * `infra/README.md` § 3 says so.
 */
export function viewerOriginFrom(
  env: Readonly<Record<string, string | undefined>>,
  port: number,
): string {
  const configured = env['ELEVATOR_SIM_ORIGIN'];
  if (configured === undefined || configured.trim().length === 0) return `http://localhost:${String(port)}`;
  return requireOrigin(configured, 'ELEVATOR_SIM_ORIGIN');
}

/**
 * Which origin may call this API from a browser.
 *
 * Three states, and the middle one is the whole of § D257's cost:
 *
 * - **Unset** — {@link NO_CROSS_ORIGIN}. The container serves the page and the API together, so
 *   nothing is cross-origin and nothing needs permitting. This is the shipped state and the current
 *   deployment's.
 * - **An exact origin** — the static host the viewer is served from, and nothing else. It must
 *   equal `ELEVATOR_SIM_ORIGIN`, checked below, because they are the same fact: the page a sign-in
 *   link opens is the page that then calls this API.
 * - **`*`** — refused, at boot, rather than accepted with a warning nobody reads. The API answers
 *   session-bearing requests and a verification is a whole simulation; a wildcard publishes both to
 *   every page on the web. `serve.ts` will still put whatever string it is handed into the header —
 *   this is the entry point that decides no operator gets to hand it that one.
 *
 * The equality check is the load-bearing half and it is cheap. Two values that must match, set from
 * one deploy parameter, drifting apart is the exact shape of the defect this lane was written to
 * avoid repeating: the site loads, the page knows where the API is, and every request fails CORS —
 * which `fetch` reports as a `TypeError`, so the client says the server is down and the reader goes
 * looking at a server that is fine.
 */
export function allowOriginFrom(
  env: Readonly<Record<string, string | undefined>>,
  viewerOrigin: string,
): string {
  const configured = env['ELEVATOR_SIM_ALLOW_ORIGIN'];
  if (configured === undefined || configured.trim().length === 0) return NO_CROSS_ORIGIN;
  if (configured.trim() === NO_CROSS_ORIGIN) return NO_CROSS_ORIGIN;

  const allowed = requireOrigin(configured, 'ELEVATOR_SIM_ALLOW_ORIGIN');
  if (allowed !== viewerOrigin) {
    throw new Error(
      `ELEVATOR_SIM_ALLOW_ORIGIN is ${JSON.stringify(allowed)} and ELEVATOR_SIM_ORIGIN is ` +
        `${JSON.stringify(viewerOrigin)}. They name the same thing — the origin the viewer is ` +
        'served from — so a deployment where they differ either mails sign-in links to a page ' +
        'that cannot call this API, or permits an origin that is not the viewer. Set both from ' +
        'one value; see docs/16-static-site-deployment.md § 3.',
    );
  }
  return allowed;
}

/**
 * Read the environment, boot, listen.
 *
 * Exported and takes its environment as an argument so the wiring is testable without spawning a
 * process — the port is the only part a test cannot reach, and it is one call.
 */
export async function main(env: Readonly<Record<string, string | undefined>>): Promise<void> {
  const port = Number(env['PORT'] ?? '8787');
  const viewerOrigin = viewerOriginFrom(env, port);
  // Read before anything is opened. Both refusals in here are configuration mistakes, and a
  // configuration mistake that surfaces after a database connection and a `data/` load is one the
  // reader meets several seconds and one stack frame away from its cause.
  const allowOrigin = allowOriginFrom(env, viewerOrigin);
  const server = await bootstrap({
    dataDir: env['ELEVATOR_SIM_DATA'] ?? fileURLToPath(new URL('../../../data/', import.meta.url)),
    sql: new PgSql(requireDatabaseUrl(env)),
    env,
    publicOrigin: viewerOrigin,
  });

  const viewer = await loadViewer(env);

  serve({
    api: server.api,
    port,
    // No default of `'*'`, and since § D257 no `'*'` at all: `allowOriginFrom` refuses it outright.
    // An operator who has not decided gets same-origin, which is the safe end of the choice rather
    // than the convenient one — and when the viewer is served from this same origin, as it is in
    // the shipped container, there is no cross-origin request to permit.
    allowOrigin,
    // Off unless an operator says there is a proxy in front, because `x-forwarded-for` is a request
    // header and believing it by default would hand every caller a free rate-limit key. § D242 and
    // `serve.ts`'s own note say what it costs either way. It is `'true'` and not "any non-empty
    // value", so `ELEVATOR_SIM_TRUST_PROXY=false` means what a reader thinks it means.
    trustProxy: env['ELEVATOR_SIM_TRUST_PROXY']?.trim().toLowerCase() === 'true',
    static: viewer,
  });

  // eslint-disable-next-line no-console -- a server's one line of startup output.
  console.log(
    `elevator-sim ${viewer === undefined ? 'API' : 'viewer and API'} listening on ${String(port)} ` +
      // Both origins, because since § D257 they can differ and the difference is invisible from
      // outside: a split deployment and a same-origin one answer identically to every request you
      // can make by hand, and disagree only in a browser. This is the line that tells them apart.
      `— viewer origin ${viewerOrigin}, cross-origin callers ` +
      `${allowOrigin === NO_CROSS_ORIGIN ? 'none' : allowOrigin}`,
  );
}

// `import.meta.main` is the run-as-script check; the module is also imported by its test.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main(process.env).catch((error: unknown) => {
    // The message and nothing else. A missing secret must read as a configuration mistake with an
    // obvious fix, not as a crash.
    // eslint-disable-next-line no-console -- the failure path of a CLI entry point.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
