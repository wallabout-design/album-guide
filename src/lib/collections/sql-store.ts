// The CollectionStore on SQLite, written against the small part of
// Cloudflare D1's API it uses. D1Database fits `SqlDatabase` as it is, and the
// tests wrap Node's own SQLite in the same shape, so the SQL here is tested
// without a Worker. The schema is migrations/0001_collections.sql.
import { directionOf } from './pagination';
import type { CollectionStore, ListQuery, NewHistory } from './store';
import { isFieldName, type HistoryEntry, type RecordData, type SortOrder, type StoredRecord } from './types';

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  /** Runs the statements in one transaction. */
  batch(statements: SqlStatement[]): Promise<{ meta: { changes?: number } }[]>;
}

type RecordRow = {
  collection: string;
  id: string;
  data: string;
  status: 'draft' | 'published';
  position: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
};

type HistoryRow = {
  id: number;
  collection: string;
  record_id: string;
  action: HistoryEntry['action'];
  data: string;
  status: 'draft' | 'published';
  at: string;
  by: string;
};

const COLUMNS = 'collection, id, data, status, position, created_at, updated_at, updated_by, deleted_at';

const toRecord = (row: RecordRow): StoredRecord => ({
  collection: row.collection,
  id: row.id,
  data: JSON.parse(row.data) as RecordData,
  status: row.status,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  deletedAt: row.deleted_at,
});

const toHistory = (row: HistoryRow): HistoryEntry => ({
  id: row.id,
  collection: row.collection,
  recordId: row.record_id,
  action: row.action,
  data: JSON.parse(row.data) as RecordData,
  status: row.status,
  at: row.at,
  by: row.by,
});

/** The SQL expression a sort order sorts by. */
function sortExpression(sort: SortOrder): string {
  if (sort.by === 'position') return 'position';
  if (sort.by === 'created') return 'created_at';
  // The name goes into the SQL text, so it must be one checkDefinition allows.
  if (!isFieldName(sort.field)) throw new Error(`"${sort.field}" is not a field name`);
  return `json_extract(data, '$.${sort.field}')`;
}

const SHOW: Record<ListQuery['show'], string> = {
  published: "deleted_at IS NULL AND status = 'published'",
  current: 'deleted_at IS NULL',
  removed: 'deleted_at IS NOT NULL',
};

export function createSqlStore(db: SqlDatabase): CollectionStore {
  const historyInsert = (entry: NewHistory, onlyIf: string, ...onlyIfValues: unknown[]) =>
    db
      .prepare(
        `INSERT INTO record_history (collection, record_id, action, data, status, at, by)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${onlyIf}`,
      )
      .bind(entry.collection, entry.recordId, entry.action, JSON.stringify(entry.data), entry.status, entry.at, entry.by, ...onlyIfValues);

  return {
    async list(query) {
      const key = sortExpression(query.sort);
      const ascending = directionOf(query.sort) === 'asc';
      const where = ['collection = ?', SHOW[query.show]];
      const values: unknown[] = [query.collection];
      if (query.removedSince) {
        where.push('deleted_at >= ?');
        values.push(query.removedSince);
      }
      if (query.search) {
        // instr, not LIKE: D1 refuses a LIKE pattern over 50 bytes, and both
        // sides are already lowercase, so plain containment is the match.
        where.push('instr(search, ?) > 0');
        values.push(query.search);
      }
      if (query.after) {
        where.push(`(${key}, id) ${ascending ? '>' : '<'} (?, ?)`);
        values.push(query.after.key, query.after.id);
      }
      const direction = ascending ? 'ASC' : 'DESC';
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM records WHERE ${where.join(' AND ')} ORDER BY ${key} ${direction}, id ${direction} LIMIT ?`)
        .bind(...values, query.limit)
        .all<RecordRow>();
      return results.map(toRecord);
    },

    async get(collection, id) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM records WHERE collection = ? AND id = ?`)
        .bind(collection, id)
        .all<RecordRow>();
      return results[0] ? toRecord(results[0]) : null;
    },

    async count(collection) {
      const { results } = await db
        .prepare('SELECT COUNT(*) AS n FROM records WHERE collection = ? AND deleted_at IS NULL')
        .bind(collection)
        .all<{ n: number }>();
      return results[0]?.n ?? 0;
    },

    async insert(record, search, place, maxRecords, entry) {
      // The position and the cap are worked out in the statement itself, so
      // two people adding at once can't both take the last free place. The
      // position is past every record, removed ones too, so a removed record
      // that is restored never shares its position with a new one.
      const position =
        place === 'first'
          ? 'COALESCE((SELECT MIN(position) FROM records WHERE collection = ?), 2) - 1'
          : 'COALESCE((SELECT MAX(position) FROM records WHERE collection = ?), 0) + 1';
      const [inserted] = await db.batch([
        db
          .prepare(
            `INSERT INTO records (collection, id, data, search, status, position, created_at, updated_at, updated_by, deleted_at)
             SELECT ?, ?, ?, ?, ?, ${position}, ?, ?, ?, NULL
             WHERE (SELECT COUNT(*) FROM records WHERE collection = ? AND deleted_at IS NULL) < ?`,
          )
          .bind(
            record.collection,
            record.id,
            JSON.stringify(record.data),
            search,
            record.status,
            record.collection,
            record.createdAt,
            record.updatedAt,
            record.updatedBy,
            record.collection,
            maxRecords,
          ),
        // Only if the record went in.
        historyInsert(entry, 'EXISTS (SELECT 1 FROM records WHERE collection = ? AND id = ?)', record.collection, record.id),
      ]);
      return (inserted?.meta.changes ?? 0) > 0;
    },

    async save(record, search, entry, ifUpdatedAt) {
      const unchanged = ifUpdatedAt === undefined ? '' : ' AND updated_at = ?';
      const values = [
        JSON.stringify(record.data),
        search,
        record.status,
        record.deletedAt,
        record.updatedAt,
        record.updatedBy,
        record.collection,
        record.id,
      ];
      const [updated] = await db.batch([
        db
          .prepare(
            `UPDATE records SET data = ?, search = ?, status = ?, deleted_at = ?, updated_at = ?, updated_by = ?
             WHERE collection = ? AND id = ?${unchanged}`,
          )
          .bind(...values, ...(ifUpdatedAt === undefined ? [] : [ifUpdatedAt])),
        // Only if the update applied: the record then carries the new time.
        historyInsert(
          entry,
          'EXISTS (SELECT 1 FROM records WHERE collection = ? AND id = ? AND updated_at = ?)',
          record.collection,
          record.id,
          record.updatedAt,
        ),
      ]);
      return (updated?.meta.changes ?? 0) > 0;
    },

    async neighbour(record, direction) {
      const [compare, order] = direction === 'down' ? ['>', 'ASC'] : ['<', 'DESC'];
      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM records
           WHERE collection = ? AND deleted_at IS NULL AND (position, id) ${compare} (?, ?)
           ORDER BY position ${order}, id ${order} LIMIT 1`,
        )
        .bind(record.collection, record.position, record.id)
        .all<RecordRow>();
      return results[0] ? toRecord(results[0]) : null;
    },

    async positions(collection) {
      const { results } = await db
        .prepare('SELECT MIN(position) AS min, MAX(position) AS max FROM records WHERE collection = ? AND deleted_at IS NULL')
        .bind(collection)
        .all<{ min: number | null; max: number | null }>();
      const row = results[0];
      return row && row.min !== null && row.max !== null ? { min: row.min, max: row.max } : null;
    },

    async setPositions(collection, changes) {
      if (changes.length === 0) return;
      await db.batch(
        changes.map(({ id, position }) =>
          db.prepare('UPDATE records SET position = ? WHERE collection = ? AND id = ?').bind(position, collection, id),
        ),
      );
    },

    async history(collection, recordId, limit) {
      const { results } = await db
        .prepare('SELECT * FROM record_history WHERE collection = ? AND record_id = ? ORDER BY id DESC LIMIT ?')
        .bind(collection, recordId, limit)
        .all<HistoryRow>();
      return results.map(toHistory);
    },

    async historyEntry(collection, recordId, historyId) {
      const { results } = await db
        .prepare('SELECT * FROM record_history WHERE collection = ? AND record_id = ? AND id = ?')
        .bind(collection, recordId, historyId)
        .all<HistoryRow>();
      return results[0] ? toHistory(results[0]) : null;
    },

    async trimHistory(collection, recordId, keep) {
      await db
        .prepare(
          `DELETE FROM record_history WHERE collection = ? AND record_id = ? AND id NOT IN
           (SELECT id FROM record_history WHERE collection = ? AND record_id = ? ORDER BY id DESC LIMIT ?)`,
        )
        .bind(collection, recordId, collection, recordId, keep)
        .run();
    },

    async purgeRemoved(collection, before) {
      await db.batch([
        db
          .prepare(
            `DELETE FROM record_history WHERE collection = ? AND record_id IN
             (SELECT id FROM records WHERE collection = ? AND deleted_at IS NOT NULL AND deleted_at < ?)`,
          )
          .bind(collection, collection, before),
        db.prepare('DELETE FROM records WHERE collection = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(collection, before),
      ]);
    },
  };
}
