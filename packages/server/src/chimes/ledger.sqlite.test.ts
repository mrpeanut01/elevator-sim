/**
 * `ledger.test.ts` again, on SQLite — § D1629. Every case in it runs here against `SqliteSql`, so the
 * store's SQL is checked on the engine production uses as well as on PostgreSQL. See
 * `store/testSql.test-helper.ts` for why this is a file that imports a suite.
 */

import { expect, it } from 'vitest';

import { testSql, useTestEngine } from '../store/testSql.test-helper.js';

useTestEngine('sqlite');
await import('./ledger.test.js');

it('opens SQLite, so the cases above are SQLite’s and not a second PostgreSQL run', async () => {
  const sql = testSql();
  expect(sql.dialect).toBe('sqlite');
  await sql.close();
});
