// Node's own SQLite, wrapped in the part of D1's API that sql-store.ts uses,
// with the real migration applied. Lets the store's SQL run in a unit test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDatabase, SqlStatement } from '../sql-store';

const MIGRATION = join(import.meta.dirname, '../../../../migrations/0001_collections.sql');

export function createTestDatabase(): SqlDatabase {
  // D1 refuses a LIKE or GLOB pattern over 50 bytes; Node's default is 50,000.
  const db = new DatabaseSync(':memory:', { limits: { likePatternLength: 50 } });
  db.exec(readFileSync(MIGRATION, 'utf8'));

  const statement = (sql: string, values: SQLInputValue[]): SqlStatement => ({
    bind: (...more) => statement(sql, more as SQLInputValue[]),
    all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  });

  return {
    prepare: (sql) => statement(sql, []),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const one of statements) results.push(await one.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
