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
    databasePath: env['ELEVATOR_SIM_DB'] ?? 'elevator-sim.db',
    env,
    publicOrigin: env['ELEVATOR_SIM_ORIGIN'] ?? `http://localhost:${String(port)}`,
  });

  serve({
    api: server.api,
    port,
    // No default of `'*'`. An operator who has not decided gets same-origin, which is the safe end
    // of the choice rather than the convenient one.
    allowOrigin: env['ELEVATOR_SIM_ALLOW_ORIGIN'] ?? 'null',
  });

  // eslint-disable-next-line no-console -- a server's one line of startup output.
  console.log(`elevator-sim server listening on ${String(port)}`);
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
