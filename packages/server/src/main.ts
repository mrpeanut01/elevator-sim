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
import { loadStaticBundle, type StaticBundle } from './http/static.js';
import { PgSql } from './store/sql.js';

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
 * Read the environment, boot, listen.
 *
 * Exported and takes its environment as an argument so the wiring is testable without spawning a
 * process — the port is the only part a test cannot reach, and it is one call.
 */
export async function main(env: Readonly<Record<string, string | undefined>>): Promise<void> {
  const port = Number(env['PORT'] ?? '8787');
  const server = await bootstrap({
    dataDir: env['ELEVATOR_SIM_DATA'] ?? fileURLToPath(new URL('../../../data/', import.meta.url)),
    sql: new PgSql(requireDatabaseUrl(env)),
    env,
    publicOrigin: env['ELEVATOR_SIM_ORIGIN'] ?? `http://localhost:${String(port)}`,
  });

  const viewer = await loadViewer(env);

  serve({
    api: server.api,
    port,
    // No default of `'*'`. An operator who has not decided gets same-origin, which is the safe end
    // of the choice rather than the convenient one — and when the viewer is served from this same
    // origin, as it is in the shipped container, there is no cross-origin request to permit at all.
    allowOrigin: env['ELEVATOR_SIM_ALLOW_ORIGIN'] ?? 'null',
    static: viewer,
  });

  // eslint-disable-next-line no-console -- a server's one line of startup output.
  console.log(
    `elevator-sim ${viewer === undefined ? 'API' : 'viewer and API'} listening on ${String(port)}`,
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
