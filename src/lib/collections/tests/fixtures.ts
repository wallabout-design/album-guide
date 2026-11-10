import { createCollections } from '../service';
import type { CollectionStore } from '../store';
import type { CollectionDefinition } from '../types';

/** A collection with one field of every type. */
export const everything: CollectionDefinition = {
  name: 'things',
  label: 'Things',
  singular: 'thing',
  titleField: 'title',
  sort: { by: 'position' },
  pageSize: 3,
  maxRecords: 8,
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 20 },
    { name: 'note', label: 'Note', type: 'longtext', maxLength: 50 },
    { name: 'link', label: 'Link', type: 'url' },
    { name: 'year', label: 'Year', type: 'number', integer: true, min: 1900, max: 2100 },
    { name: 'day', label: 'Day', type: 'date' },
    { name: 'featured', label: 'Featured', type: 'boolean' },
    { name: 'kind', label: 'Kind', type: 'select', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] },
    { name: 'photo', label: 'Photo', type: 'image' },
    { name: 'ref', label: 'Reference', type: 'reference', pattern: '[a-f0-9]{8}', example: '0123abcd' },
  ],
};

/** Sorted by a required field, newest year first. */
export const byYear: CollectionDefinition = {
  name: 'by-year',
  label: 'By year',
  singular: 'entry',
  titleField: 'title',
  sort: { by: 'field', field: 'year', direction: 'desc' },
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'year', label: 'Year', type: 'number', integer: true, required: true },
  ],
};

export const STAFF = 'staff@example.com';

/** A service on the given store with a clock that moves one second per call and ids r1, r2, ... */
export function serviceOn(store: CollectionStore, definitions = [everything, byYear]) {
  let tick = 0;
  let id = 0;
  return createCollections({
    definitions,
    store,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    newId: () => `r${++id}`,
  });
}

export function must<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}
