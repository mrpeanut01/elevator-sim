/**
 * **How a reader reaches the KPI dashboard** — GitHub issue #250,
 * [`docs/26-telemetry-and-privacy.md`](../../../../docs/26-telemetry-and-privacy.md) § 20.
 *
 * ```
 * npm run build
 * ELEVATOR_SIM_DB=postgres://… npm run dashboard --workspace @elevator-sim/server
 * ```
 *
 * ## Why a command and not a route
 *
 * There is deliberately **no HTTP endpoint**. § 8's refusal was lifted for a dashboard's *shape*
 * (§ 12.1 ruling 2), and § 18.2 grants R-1 aggregates — it does not grant a URL, and adding one
 * would decide a question § 20.6 leaves open: *who holds access*. That holder is unnamed and
 * registered as owed in § 11, so a route serving these figures would be a dashboard whose access
 * nobody had decided, which is § 18.4's own sentence for the thing not to build.
 *
 * So this is an **analyst-initiated, offline read**, on exactly the footing § 2.1 already puts run
 * replay on: somebody with the database credentials runs it and gets text. Nothing listens,
 * nothing transmits, and the output is what pastes into the review's written note (§ 20.5).
 *
 * ## What it prints when there is nothing
 *
 * The honest empty state, and it is two different sentences rather than one. #340's own report:
 * *"an empty-state that says nobody has consented yet is a different sentence from nothing
 * happened."* `dashboardOf` carries that distinction; this file only prints it.
 *
 * ## The one thing it refuses to guess
 *
 * `ELEVATOR_SIM_DB`, on `main.ts`'s own argument: *"there is deliberately no default: one pointing
 * at localhost is how an empty database gets mistaken for a live one."* An empty database read as a
 * live one is precisely how this dashboard would publish *nothing happened* about a product nobody
 * had asked.
 *
 * **`process.stdout` rather than `console`**, unlike `main.ts` beside it. A command whose whole
 * output is one document wants a stream and not a logger: `console.log` appends a newline to a
 * string that already ends in one, and the report is meant to be redirected into the review's note
 * verbatim (§ 20.5). It also avoids the disable comment `main.ts` carries for a lint rule this tree
 * no longer configures.
 */

import { PgSql } from '../store/sql.js';
import { Store } from '../store/store.js';

import { dashboardOf } from './dashboard.js';
import { renderDashboard } from './dashboardRender.js';

/**
 * Read the store, build R-1's view, print it.
 *
 * Takes the environment and the sink rather than reaching for `process`, so the test drives the
 * same function the command does — `main.ts`'s shape, for `main.ts`'s reason.
 */
export async function dashboardMain(
  env: Readonly<Record<string, string | undefined>>,
  write: (text: string) => void,
): Promise<void> {
  const url = env['ELEVATOR_SIM_DB'];
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      'ELEVATOR_SIM_DB is not set. It is the PostgreSQL connection string the dashboard reads. ' +
        'There is deliberately no default: an empty local database read as a live one is how this ' +
        'dashboard would publish "nothing happened" about a product nobody had asked.',
    );
  }
  /*
   * One clock, read once, and handed to both. `Store.open` sweeps § 5.1's horizon against it and
   * `docs/26 K4` decides against it whether a cohort's window has closed — two answers from one
   * reading, so a run cannot sweep against one moment and draw a cohort against another.
   */
  const nowMs = Date.now();
  const store = await Store.open({ sql: new PgSql(url), now: () => nowMs });
  const events = await store.telemetryEventsForDashboard();
  write(renderDashboard(dashboardOf(events, { nowMs })));
}

// `import.meta.main` is the run-as-script check; the module is also imported by its test.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  dashboardMain(process.env, (text) => process.stdout.write(text)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
