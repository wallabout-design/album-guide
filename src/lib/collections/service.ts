// What a site can do with its collections. Routes call these and turn the
// result into a response; nothing here knows about HTTP, D1 or React.
import { clampLimit, decodeCursor, toPage } from './pagination';
import type { CollectionStore, NewHistory } from './store';
import {
  checkDefinition,
  LIMITS,
  type CollectionDefinition,
  type HistoryAction,
  type HistoryEntry,
  type PublicRecord,
  type RecordData,
  type StoredRecord,
} from './types';
import { FORM, searchText, validateRecord } from './validate';

export type Failure =
  /** No such collection or record. */
  | { code: 'not_found'; message: string }
  /** The request itself is wrong (a bad cursor, a bad direction). */
  | { code: 'bad_request'; message: string }
  /** The record doesn't pass validation; `fields` has a message per field. */
  | { code: 'invalid'; message: string; fields: Record<string, string> }
  /** The collection holds as many records as it may. */
  | { code: 'full'; message: string }
  /** Someone else changed the record first. */
  | { code: 'conflict'; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

export interface Page<T> {
  items: T[];
  /** Send back as `cursor` for the next page. Null on the last page. */
  nextCursor: string | null;
}

export interface AdminPage extends Page<StoredRecord> {
  /** Records not removed, whatever the search. */
  total: number;
  maxRecords: number;
}

export interface ListOptions {
  cursor?: string | null;
  limit?: string | number | null;
}

export interface AdminListOptions extends ListOptions {
  search?: string | null;
  show?: 'current' | 'removed';
}

export type MoveDirection = 'up' | 'down' | 'first' | 'last';

export interface CollectionsOptions {
  definitions: CollectionDefinition[];
  store: CollectionStore;
  /** The clock. Tests pass a fixed one. */
  now?: () => Date;
  /** Makes record ids. Tests pass a counter. */
  newId?: () => string;
}

export type Collections = ReturnType<typeof createCollections>;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

const ID = /^[A-Za-z0-9-]{1,64}$/;

export function createCollections(options: CollectionsOptions) {
  const { store } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID());
  const definitions = new Map<string, CollectionDefinition>();
  for (const def of options.definitions) {
    checkDefinition(def);
    if (definitions.has(def.name)) throw new Error(`Collection "${def.name}" is declared twice.`);
    definitions.set(def.name, def);
  }

  const noCollection = () => fail({ code: 'not_found', message: 'There is no list with that name.' });
  const noRecord = (def: CollectionDefinition) =>
    fail({ code: 'not_found', message: `That ${def.singular} could not be found. It may have been removed.` });
  const changed = (def: CollectionDefinition) =>
    fail({
      code: 'conflict',
      message: `Someone else changed this ${def.singular} while you were working on it. Reload the page to see their version, then make your change again.`,
    });
  const maxOf = (def: CollectionDefinition) => def.maxRecords ?? LIMITS.records.default;
  const full = (def: CollectionDefinition) =>
    fail({
      code: 'full',
      message: `${def.label} already has ${maxOf(def)} entries, which is the most it can hold. Remove one you no longer need first.`,
    });

  /** A time for a change that is always later than the record's last one. */
  function stamp(after?: string): string {
    const at = now().toISOString();
    if (!after || at > after) return at;
    return new Date(new Date(after).getTime() + 1).toISOString();
  }

  function historyOf(record: StoredRecord, action: HistoryAction): NewHistory {
    return {
      collection: record.collection,
      recordId: record.id,
      action,
      data: record.data,
      status: record.status,
      at: record.updatedAt,
      by: record.updatedBy,
    };
  }

  /**
   * Removed records are kept this long so a removal can be undone. One removed
   * before the cutoff is gone, even before its rows are purged.
   */
  const removedCutoff = () => new Date(now().getTime() - LIMITS.removedDays * 86_400_000).toISOString();
  const expired = (record: StoredRecord) => record.deletedAt !== null && record.deletedAt < removedCutoff();
  /** Deletes the rows of records removed before the cutoff. Run on every write. */
  const purge = (name: string) => store.purgeRemoved(name, removedCutoff());

  async function load(name: string, id: string): Promise<Result<{ def: CollectionDefinition; record: StoredRecord }>> {
    const def = definitions.get(name);
    if (!def) return noCollection();
    const record = ID.test(id) ? await store.get(name, id) : null;
    if (!record || expired(record)) return noRecord(def);
    return ok({ def, record });
  }

  /** Saves a changed copy of a record with a history entry, and tidies old history. */
  async function change(
    def: CollectionDefinition,
    record: StoredRecord,
    action: HistoryAction,
    by: string,
    patch: Partial<Pick<StoredRecord, 'data' | 'status' | 'deletedAt'>>,
    ifUpdatedAt?: string,
  ): Promise<Result<StoredRecord>> {
    const next: StoredRecord = { ...record, ...patch, updatedAt: stamp(record.updatedAt), updatedBy: by };
    const saved = await store.save(next, searchText(def, next.data), historyOf(next, action), ifUpdatedAt ?? record.updatedAt);
    if (!saved) return changed(def);
    await store.trimHistory(def.name, record.id, LIMITS.history);
    await purge(def.name);
    return ok(next);
  }

  return {
    /** Every declared collection, in the order given. */
    definitions: () => [...definitions.values()],

    definition: (name: string) => definitions.get(name) ?? null,

    /** The public list: published records only, with no staff details. */
    async listPublished(name: string, options: ListOptions = {}): Promise<Result<Page<PublicRecord>>> {
      const def = definitions.get(name);
      if (!def) return noCollection();
      const after = options.cursor ? decodeCursor(options.cursor) : undefined;
      if (after === null) return fail({ code: 'bad_request', message: 'That page could not be found. Start again from the first page.' });
      const limit = clampLimit(options.limit, def.pageSize ?? LIMITS.pageSize.default);
      const rows = await store.list({ collection: name, show: 'published', sort: def.sort, after, limit: limit + 1 });
      const page = toPage(rows, limit, def.sort);
      return ok({
        items: page.items.map(({ id, data, updatedAt }) => ({ id, data, updatedAt })),
        nextCursor: page.nextCursor,
      });
    },

    /** The admin's list: drafts too, or only removed records, with an optional search. */
    async listForStaff(name: string, options: AdminListOptions = {}): Promise<Result<AdminPage>> {
      const def = definitions.get(name);
      if (!def) return noCollection();
      const after = options.cursor ? decodeCursor(options.cursor) : undefined;
      if (after === null) return fail({ code: 'bad_request', message: 'That page could not be found. Start again from the first page.' });
      const limit = clampLimit(options.limit, LIMITS.pageSize.default);
      const search = (options.search ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, LIMITS.search);
      const removed = options.show === 'removed';
      const rows = await store.list({
        collection: name,
        show: removed ? 'removed' : 'current',
        removedSince: removed ? removedCutoff() : undefined,
        search: search || undefined,
        sort: def.sort,
        after,
        limit: limit + 1,
      });
      return ok({ ...toPage(rows, limit, def.sort), total: await store.count(name), maxRecords: maxOf(def) });
    },

    async get(name: string, id: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      return found.ok ? ok(found.value.record) : found;
    },

    /** Adds a record as a draft, or published when `publish` is set. */
    async create(name: string, input: unknown, by: string, publish = false): Promise<Result<StoredRecord>> {
      const def = definitions.get(name);
      if (!def) return noCollection();
      const checked = validateRecord(def, input);
      if (!checked.ok) return fail({ code: 'invalid', message: 'Please fix the marked fields.', fields: checked.errors });
      const at = stamp();
      const record: StoredRecord = {
        collection: name,
        id: newId(),
        data: checked.data,
        status: publish ? 'published' : 'draft',
        position: 0,
        createdAt: at,
        updatedAt: at,
        updatedBy: by,
        deletedAt: null,
      };
      const place = def.sort.by === 'position' ? (def.newRecords ?? 'last') : 'last';
      const added = await store.insert(record, searchText(def, record.data), place, maxOf(def), historyOf(record, 'create'));
      if (!added) return full(def);
      await purge(name);
      return ok((await store.get(name, record.id)) ?? record);
    },

    /**
     * Replaces a record's fields. `ifUpdatedAt` is the `updatedAt` the editor
     * loaded, and is required: if the record has changed since, nothing is
     * saved, so one editor never silently overwrites another.
     */
    async update(name: string, id: string, input: unknown, by: string, ifUpdatedAt: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (record.deletedAt) return noRecord(def);
      const checked = validateRecord(def, input);
      if (!checked.ok) return fail({ code: 'invalid', message: 'Please fix the marked fields.', fields: checked.errors });
      return change(def, record, 'update', by, { data: checked.data }, ifUpdatedAt);
    },

    /** Shows a record on the site, or takes it off without removing it. */
    async setPublished(name: string, id: string, published: boolean, by: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (record.deletedAt) return noRecord(def);
      const status = published ? 'published' : 'draft';
      if (record.status === status) return ok(record);
      return change(def, record, published ? 'publish' : 'unpublish', by, { status });
    },

    /** Removes a record. It leaves the site at once and can be restored for 90 days. */
    async remove(name: string, id: string, by: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (record.deletedAt) return ok(record);
      return change(def, record, 'remove', by, { deletedAt: stamp(record.updatedAt) });
    },

    /** Undoes a removal. The record comes back as it was, published or draft. */
    async restore(name: string, id: string, by: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (!record.deletedAt) return ok(record);
      if ((await store.count(name)) >= maxOf(def)) return full(def);
      return change(def, record, 'restore', by, { deletedAt: null });
    },

    /** Moves a record in a collection that staff order by hand. */
    async move(name: string, id: string, direction: MoveDirection): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (record.deletedAt) return noRecord(def);
      await purge(name);
      if (def.sort.by !== 'position') {
        return fail({ code: 'bad_request', message: `${def.label} is kept in a fixed order and can't be rearranged.` });
      }
      if (direction === 'first' || direction === 'last') {
        const range = await store.positions(name);
        if (!range) return ok(record);
        const position = direction === 'first' ? range.min - 1 : range.max + 1;
        await store.setPositions(name, [{ id, position }]);
        return ok({ ...record, position });
      }
      if (direction !== 'up' && direction !== 'down') {
        return fail({ code: 'bad_request', message: 'That is not a way to move an entry.' });
      }
      const other = await store.neighbour(record, direction);
      if (!other) return ok(record);
      // Two records can share a position if they were added at the same
      // moment; then step past the neighbour instead of swapping equal numbers.
      const position = other.position === record.position ? other.position + (direction === 'up' ? -1 : 1) : other.position;
      const changes = [{ id, position }];
      if (other.position !== record.position) changes.push({ id: other.id, position: record.position });
      await store.setPositions(name, changes);
      return ok({ ...record, position });
    },

    /** A record's past versions, newest first. */
    async history(name: string, id: string): Promise<Result<HistoryEntry[]>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      return ok(await store.history(name, id, LIMITS.history));
    },

    /** Puts a record's fields back to a past version. Its status stays as it is now. */
    async revert(name: string, id: string, historyId: number, by: string): Promise<Result<StoredRecord>> {
      const found = await load(name, id);
      if (!found.ok) return found;
      const { def, record } = found.value;
      if (record.deletedAt) return noRecord(def);
      const entry = Number.isInteger(historyId) ? await store.historyEntry(name, id, historyId) : null;
      if (!entry) return fail({ code: 'not_found', message: 'That earlier version could not be found.' });
      // The form may have changed since: drop fields that no longer exist, then check the rest.
      const known: RecordData = {};
      for (const field of def.fields) if (entry.data[field.name] !== undefined) known[field.name] = entry.data[field.name];
      const checked = validateRecord(def, known);
      if (!checked.ok) {
        return fail({
          code: 'invalid',
          message: "That earlier version doesn't fit the form as it is now, so it can't be brought back as it was.",
          fields: checked.errors,
        });
      }
      return change(def, record, 'revert', by, { data: checked.data });
    },
  };
}

export { FORM };
