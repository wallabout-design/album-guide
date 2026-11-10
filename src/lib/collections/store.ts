// The data access the collections service needs, as an interface. The site
// uses the SQL one (sql-store.ts, on D1); unit tests use the in-memory one
// (memory-store.ts). The service never sees SQL.
import type { Cursor } from './pagination';
import type { HistoryEntry, SortOrder, StoredRecord } from './types';

export type NewHistory = Omit<HistoryEntry, 'id'>;

export interface ListQuery {
  collection: string;
  /** `published`: what the public sees. `current`: everything not removed. `removed`: only removed. */
  show: 'published' | 'current' | 'removed';
  /** With `removed`: only records removed at or after this time. */
  removedSince?: string;
  /** Lowercase words; a record matches when its search text contains them. */
  search?: string;
  sort: SortOrder;
  /** Start after this record. */
  after?: Cursor;
  limit: number;
}

export interface CollectionStore {
  /** Records in sort order, ties broken by id. */
  list(query: ListQuery): Promise<StoredRecord[]>;
  /** One record, removed or not. */
  get(collection: string, id: string): Promise<StoredRecord | null>;
  /** How many records are not removed. */
  count(collection: string): Promise<number>;
  /**
   * Adds a record at the start or end of the order, with its first history
   * entry. `record.position` is ignored: the new one is below or above every
   * record's, removed ones included, so it is never shared. False, and nothing written, when the
   * collection already holds `maxRecords`.
   */
  insert(record: StoredRecord, search: string, place: 'first' | 'last', maxRecords: number, history: NewHistory): Promise<boolean>;
  /**
   * Saves a record's data, status, removal and "updated" fields, with a
   * history entry. With `ifUpdatedAt`, only if the record hasn't changed since
   * then. False, and nothing written, when it has changed or doesn't exist.
   */
  save(record: StoredRecord, search: string, history: NewHistory, ifUpdatedAt?: string): Promise<boolean>;
  /** The record just before (`up`) or after (`down`) this one among those not removed, by position. */
  neighbour(record: StoredRecord, direction: 'up' | 'down'): Promise<StoredRecord | null>;
  /** The lowest and highest position among records not removed. Null when there are none. */
  positions(collection: string): Promise<{ min: number; max: number } | null>;
  /** Sets positions, all or none. */
  setPositions(collection: string, changes: { id: string; position: number }[]): Promise<void>;
  /** A record's history, newest first. */
  history(collection: string, recordId: string, limit: number): Promise<HistoryEntry[]>;
  historyEntry(collection: string, recordId: string, historyId: number): Promise<HistoryEntry | null>;
  /** Drops all but the newest `keep` history entries of a record. */
  trimHistory(collection: string, recordId: string, keep: number): Promise<void>;
  /** Deletes for good the records removed before `before`, and their history. */
  purgeRemoved(collection: string, before: string): Promise<void>;
}
