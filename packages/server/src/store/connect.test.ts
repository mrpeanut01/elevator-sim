import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sqlFor } from './connect.js';

describe('sqlFor — § D1630', () => {
  it('opens a SQLite file for a file: URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elevator-sim-connect-'));
    try {
      const sql = sqlFor(`file:${join(dir, 'store.db')}`);
      expect(sql.dialect).toBe('sqlite');
      expect((await sql.query('SELECT 1 AS one')).rows[0]?.['one']).toBe(1);
      await sql.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds the PostgreSQL pool for a postgres:// or postgresql:// URL, without connecting', async () => {
    for (const url of ['postgres://u:p@127.0.0.1:1/db', 'postgresql://u:p@127.0.0.1:1/db']) {
      const sql = sqlFor(url);
      expect(sql.dialect).toBe('postgres');
      await sql.close();
    }
  });

  it('refuses a scheme it does not know, and a file: with no path', () => {
    expect(() => sqlFor('mysql://host/db')).toThrow(/neither a PostgreSQL URL/u);
    expect(() => sqlFor('file:')).toThrow(/no path/u);
  });
});
