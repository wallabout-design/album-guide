// A CollectionStore that keeps everything in memory: the fake for unit tests
// of anything built on the service. It behaves as sql-store.ts does (the
// store tests run the same cases against both).
import { directionOf, sortKeyOf, type SortKey } from './pagination';
import type { CollectionStore, ListQuery, NewHistory } from './store';
import type { HistoryEntry, StoredRecord } from './types';

type Row = StoredRecord & { search: string };

// SQLite's order for the values a sort key can be: numbers before text, text by code unit.
function compareKeys(a: SortKey, b: SortKey): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const copy = ({ search: _search, ...record }: Row): StoredRecord => ({ ...record, data: { ...record.data } });

export function createMemoryStore(): CollectionStore {
  const rows: Row[] = [];
  const history: HistoryEntry[] = [];
  let historyId = 0;

  const current = (collection: string) => rows.filter((r) => r.collection === collection && !r.deletedAt);
  const find = (collection: string, id: string) => rows.find((r) => r.collection === collection && r.id === id);
  const addHistory = (entry: NewHistory) => history.push({ ...entry, data: { ...entry.data }, id: ++historyId });

  return {
    async list(query: ListQuery) {
      const sign = directionOf(query.sort) === 'asc' ? 1 : -1;
      const order = (a: Row, b: Row) =>
        sign * (compareKeys(sortKeyOf(a, query.sort), sortKeyOf(b, query.sort)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const after = query.after;
      return rows
        .filter((r) => r.collection === query.collection)
        .filter((r) =>
          query.show === 'removed' ? r.deletedAt !== null : r.deletedAt === null && (query.show === 'current' || r.status === 'published'),
        )
        .filter((r) => !query.removedSince || (r.deletedAt !== null && r.deletedAt >= query.removedSince))
        .filter((r) => !query.search || r.search.includes(query.search))
        .filter((r) => {
          if (!after) return true;
          const byKey = compareKeys(sortKeyOf(r, query.sort), after.key);
          return sign * (byKey || (r.id < after.id ? -1 : r.id > after.id ? 1 : 0)) > 0;
        })
        .sort(order)
        .slice(0, query.limit)
        .map(copy);
    },

    async get(collection, id) {
      const row = find(collection, id);
      return row ? copy(row) : null;
    },

    async count(collection) {
      return current(collection).length;
    },

    async insert(record, search, place, maxRecords, entry) {
      const others = current(record.collection);
      if (others.length >= maxRecords) return false;
      const positions = others.map((r) => r.position);
      const position = positions.length === 0 ? 1 : place === 'first' ? Math.min(...positions) - 1 : Math.max(...positions) + 1;
      rows.push({ ...record, data: { ...record.data }, position, search });
      addHistory(entry);
      return true;
    },

    async save(record, search, entry, ifUpdatedAt) {
      const row = find(record.collection, record.id);
      if (!row || (ifUpdatedAt !== undefined && row.updatedAt !== ifUpdatedAt)) return false;
      Object.assign(row, {
        data: { ...record.data },
        status: record.status,
        deletedAt: record.deletedAt,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy,
        search,
      });
      addHistory(entry);
      return true;
    },

    async neighbour(record, direction) {
      const sign = direction === 'down' ? 1 : -1;
      const beyond = (r: Row) => sign * (r.position - record.position || (r.id < record.id ? -1 : r.id > record.id ? 1 : 0)) > 0;
      const [nearest] = current(record.collection)
        .filter(beyond)
        .sort((a, b) => sign * (a.position - b.position || (a.id < b.id ? -1 : 1)));
      return nearest ? copy(nearest) : null;
    },

    async positions(collection) {
      const positions = current(collection).map((r) => r.position);
      return positions.length ? { min: Math.min(...positions), max: Math.max(...positions) } : null;
    },

    async setPositions(collection, changes) {
      for (const { id, position } of changes) {
        const row = find(collection, id);
        if (row) row.position = position;
      }
    },

    async history(collection, recordId, limit) {
      return history
        .filter((h) => h.collection === collection && h.recordId === recordId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((h) => ({ ...h, data: { ...h.data } }));
    },

    async historyEntry(collection, recordId, id) {
      const entry = history.find((h) => h.collection === collection && h.recordId === recordId && h.id === id);
      return entry ? { ...entry, data: { ...entry.data } } : null;
    },

    async trimHistory(collection, recordId, keep) {
      const mine = history.filter((h) => h.collection === collection && h.recordId === recordId).sort((a, b) => b.id - a.id);
      for (const old of mine.slice(keep)) history.splice(history.indexOf(old), 1);
    },

    async purgeRemoved(collection, before) {
      for (const row of rows.filter((r) => r.collection === collection && r.deletedAt !== null && r.deletedAt < before)) {
        rows.splice(rows.indexOf(row), 1);
        for (const old of history.filter((h) => h.collection === collection && h.recordId === row.id)) {
          history.splice(history.indexOf(old), 1);
        }
      }
    },
  };
}
