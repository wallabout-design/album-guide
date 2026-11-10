// Keyset pagination: a page ends with a cursor naming the last record on it
// (its sort key and id), and the next page starts after that record. Unlike
// page numbers, the order stays stable when records are added or removed
// between requests, and the database never counts past skipped rows.
import { LIMITS, type RecordData, type SortOrder } from './types';

export type SortKey = string | number;

/** Where a page ended: the last record's sort key and id. */
export interface Cursor {
  key: SortKey;
  id: string;
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** A cursor as the opaque text sent to clients. */
export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify([cursor.key, cursor.id]));
}

/** Reads a cursor a client sent back. Null for anything that isn't one. */
export function decodeCursor(text: string): Cursor | null {
  if (!text || text.length > 1_000 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(text));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [key, id] = parsed as unknown[];
    const keyOk = typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key));
    if (!keyOk || typeof id !== 'string' || !id || id.length > 100) return null;
    return { key: key as SortKey, id };
  } catch {
    return null;
  }
}

/**
 * The page size to use for what a client asked for: the fallback when nothing
 * usable was sent, never under 1 and never over the cap.
 */
export function clampLimit(raw: unknown, fallback: number, max: number = LIMITS.pageSize.max): number {
  const asked = typeof raw === 'string' && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  const limit = typeof asked === 'number' && Number.isInteger(asked) ? asked : fallback;
  return Math.min(Math.max(limit, 1), max);
}

/** The value a record is ordered by under a sort order. */
export function sortKeyOf(
  record: { position: number; createdAt: string; data: RecordData },
  sort: SortOrder,
): SortKey {
  if (sort.by === 'position') return record.position;
  if (sort.by === 'created') return record.createdAt;
  const value = record.data[sort.field];
  return typeof value === 'boolean' || value === undefined ? '' : value;
}

export const directionOf = (sort: SortOrder): 'asc' | 'desc' => (sort.by === 'position' ? 'asc' : sort.direction);

/**
 * Turns the rows a store returned for `limit + 1` into a page: the first
 * `limit` rows, and a cursor only if there was one more.
 */
export function toPage<T extends { id: string; position: number; createdAt: string; data: RecordData }>(
  rows: T[],
  limit: number,
  sort: SortOrder,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const more = rows.length > limit && last !== undefined;
  return { items, nextCursor: more ? encodeCursor({ key: sortKeyOf(last, sort), id: last.id }) : null };
}
