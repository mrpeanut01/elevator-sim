/**
 * The database a URL names — § D1629.
 *
 * `ELEVATOR_SIM_DB` picks the engine by its scheme, so the choice between the two drivers is a
 * setting and not a code change:
 *
 *   * `postgres://…` or `postgresql://…` is Azure Database for PostgreSQL, or any PostgreSQL, through
 *     `PgSql`. This was the only form until § D1629, and it still works unchanged.
 *   * `file:/data/elevator-sim.db` is a SQLite file through `SqliteSql`, replicated to Blob Storage by
 *     Litestream in the shipped container (`infra/litestream.yml`).
 *
 * Anything else is refused by name rather than guessed at. The non-test callers are `main.ts` and
 * `telemetry/dashboardMain.ts`.
 */

import { PgSql, type Sql } from './sql.js';
import { SqliteSql } from './sqlite.js';

export function sqlFor(url: string): Sql {
  const trimmed = url.trim();
  if (/^postgres(ql)?:\/\//iu.test(trimmed)) return new PgSql(trimmed);
  if (/^file:/iu.test(trimmed)) {
    const path = trimmed.slice('file:'.length);
    if (path.length === 0) throw new Error('ELEVATOR_SIM_DB names a SQLite file with no path after `file:`.');
    return new SqliteSql(path);
  }
  throw new Error(
    'ELEVATOR_SIM_DB is neither a PostgreSQL URL (postgres://…) nor a SQLite file (file:/path/to.db). ' +
      'The scheme is what picks the engine, so an unrecognised one is refused rather than guessed at.',
  );
}
