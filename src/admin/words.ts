// The words the admin uses, in one place, so staff read the same plain terms
// everywhere: "on the site" rather than "published", "draft" rather than a status code.
import type { CollectionDefinition, HistoryAction, StoredRecord } from '../lib/collections/types';

export const titleOf = (def: CollectionDefinition, record: Pick<StoredRecord, 'data'>) =>
  String(record.data[def.titleField] ?? `Untitled ${def.singular}`);

export const statusWords = (record: StoredRecord) => (record.status === 'published' ? 'On the site' : 'Draft, not on the site');

/** "10 Nov 2026, 14:03" in the reader's own locale and time zone. */
export function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const ACTION_WORDS: Record<HistoryAction, string> = {
  create: 'Added',
  update: 'Edited',
  publish: 'Shown on the site',
  unpublish: 'Taken off the site',
  remove: 'Removed',
  restore: 'Brought back',
  revert: 'Put back to an earlier version',
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const Singular = (def: CollectionDefinition) => capital(def.singular);
