// The service, run against both stores: the in-memory fake and the real SQL
// on SQLite with the migration applied. Every case must pass on both, which
// is also what keeps the fake honest.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createMemoryStore } from '../memory-store';
import { createCollections, type Page } from '../service';
import { createSqlStore } from '../sql-store';
import type { CollectionStore } from '../store';
import { LIMITS, type PublicRecord } from '../types';
import { byYear, everything, must, serviceOn, STAFF } from './fixtures';
import { createTestDatabase } from './sqlite';

const stores: Record<string, () => CollectionStore> = {
  'memory store': createMemoryStore,
  'sql store': () => createSqlStore(createTestDatabase()),
};

for (const [name, makeStore] of Object.entries(stores)) {
  describe(name, () => {
    const setup = () => serviceOn(makeStore());

    async function seeded(count: number, publish = true) {
      const service = setup();
      for (let i = 1; i <= count; i++) must(await service.create('things', { title: `Thing ${i}` }, STAFF, publish));
      return service;
    }

    const titles = (items: { data: Record<string, unknown> }[]) => items.map((r) => r.data.title);

    test('a new record is a draft, and the public list shows only published records', async () => {
      const service = setup();
      const draft = must(await service.create('things', { title: 'Draft' }, STAFF));
      assert.equal(draft.status, 'draft');
      assert.equal(draft.updatedBy, STAFF);
      must(await service.create('things', { title: 'Live' }, STAFF, true));
      assert.deepEqual(titles(must(await service.listPublished('things')).items), ['Live']);
      assert.deepEqual(titles(must(await service.listForStaff('things')).items), ['Draft', 'Live']);
    });

    test('the public list never carries who edited a record', async () => {
      const service = await seeded(1);
      const [item] = must(await service.listPublished('things')).items;
      assert.deepEqual(Object.keys(item).sort(), ['data', 'id', 'updatedAt']);
      assert.ok(!JSON.stringify(item).includes(STAFF));
    });

    test('pages follow one another with no record repeated or missed', async () => {
      const service = await seeded(8);
      const seen: unknown[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: Page<PublicRecord> = must(await service.listPublished('things', { cursor }));
        assert.ok(page.items.length <= 3);
        seen.push(...titles(page.items));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      assert.equal(pages, 3);
      assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Thing ${i}`));
    });

    test('the last page has no cursor even when it is exactly full', async () => {
      const service = await seeded(6);
      const first = must(await service.listPublished('things'));
      const second = must(await service.listPublished('things', { cursor: first.nextCursor }));
      assert.equal(second.items.length, 3);
      assert.equal(second.nextCursor, null);
    });

    test('a record added or removed between pages does not shift the next page', async () => {
      const service = await seeded(6);
      const first = must(await service.listPublished('things'));
      must(await service.remove('things', first.items[0].id, STAFF));
      const added = must(await service.create('things', { title: 'New at the top' }, STAFF, true));
      must(await service.move('things', added.id, 'first'));
      const second = must(await service.listPublished('things', { cursor: first.nextCursor }));
      assert.deepEqual(titles(second.items), ['Thing 4', 'Thing 5', 'Thing 6']);
    });

    test('the limit is capped, and a bad cursor is refused', async () => {
      const service = await seeded(8);
      assert.equal(must(await service.listPublished('things', { limit: '9999' })).items.length, 8);
      assert.equal(must(await service.listPublished('things', { limit: '2' })).items.length, 2);
      assert.equal(must(await service.listPublished('things', { limit: 'lots' })).items.length, 3);
      const bad = await service.listPublished('things', { cursor: 'garbage!' });
      assert.equal(!bad.ok && bad.error.code, 'bad_request');
    });

    test('an unknown collection or record is not found', async () => {
      const service = setup();
      for (const result of [
        await service.listPublished('nope'),
        await service.listForStaff('nope'),
        await service.create('nope', { title: 'x' }, STAFF),
        await service.get('things', 'missing'),
        await service.get('things', "x' OR 1=1 --"),
        await service.update('things', 'missing', { title: 'x' }, STAFF, '2026-01-01T00:00:00.000Z'),
        await service.remove('things', 'missing', STAFF),
      ]) {
        assert.equal(!result.ok && result.error.code, 'not_found');
      }
    });

    test('an invalid record is not saved, and the messages come back per field', async () => {
      const service = setup();
      const result = await service.create('things', { title: '', year: 5 }, STAFF);
      assert.deepEqual(!result.ok && result.error, {
        code: 'invalid',
        message: 'Please fix the marked fields.',
        fields: { title: 'Title is needed.', year: 'Year must be from 1900 to 2100.' },
      });
      assert.equal(must(await service.listForStaff('things')).total, 0);
    });

    test('the collection refuses records past its cap; removed ones do not count', async () => {
      const service = await seeded(8);
      const over = await service.create('things', { title: 'Nine' }, STAFF);
      assert.equal(!over.ok && over.error.code, 'full');
      assert.match(!over.ok ? over.error.message : '', /already has 8 entries/);
      const page = must(await service.listForStaff('things', { limit: 50 }));
      assert.equal(page.total, 8);
      assert.equal(page.maxRecords, 8);
      must(await service.remove('things', page.items[0].id, STAFF));
      must(await service.create('things', { title: 'Nine' }, STAFF));
      // Restoring the removed one would make nine.
      const back = await service.restore('things', page.items[0].id, STAFF);
      assert.equal(!back.ok && back.error.code, 'full');
    });

    test('an edit replaces the fields and records who made it', async () => {
      const service = setup();
      const made = must(await service.create('things', { title: 'Before', note: 'n' }, STAFF, true));
      const edited = must(await service.update('things', made.id, { title: 'After' }, 'other@example.com', made.updatedAt));
      assert.deepEqual(edited.data, { title: 'After', featured: false });
      assert.equal(edited.updatedBy, 'other@example.com');
      assert.equal(edited.status, 'published');
      assert.ok(edited.updatedAt > made.updatedAt);
      assert.deepEqual(must(await service.get('things', made.id)), edited);
    });

    test('an edit based on a stale copy is refused and changes nothing', async () => {
      const service = setup();
      const made = must(await service.create('things', { title: 'One' }, STAFF));
      must(await service.update('things', made.id, { title: 'Two' }, STAFF, made.updatedAt));
      const stale = await service.update('things', made.id, { title: 'Three' }, STAFF, made.updatedAt);
      assert.equal(!stale.ok && stale.error.code, 'conflict');
      assert.equal(must(await service.get('things', made.id)).data.title, 'Two');
      assert.equal(must(await service.history('things', made.id)).length, 2);
    });

    test('publish and unpublish move a record on and off the public list', async () => {
      const service = setup();
      const made = must(await service.create('things', { title: 'One' }, STAFF));
      assert.equal(must(await service.setPublished('things', made.id, true, STAFF)).status, 'published');
      assert.equal(must(await service.listPublished('things')).items.length, 1);
      assert.equal(must(await service.setPublished('things', made.id, false, STAFF)).status, 'draft');
      assert.equal(must(await service.listPublished('things')).items.length, 0);
    });

    test('a removed record leaves both lists and can be restored as it was', async () => {
      const service = setup();
      const made = must(await service.create('things', { title: 'One' }, STAFF, true));
      const removed = must(await service.remove('things', made.id, STAFF));
      assert.ok(removed.deletedAt);
      assert.equal(must(await service.listPublished('things')).items.length, 0);
      assert.equal(must(await service.listForStaff('things')).items.length, 0);
      assert.deepEqual(titles(must(await service.listForStaff('things', { show: 'removed' })).items), ['One']);
      const edit = await service.update('things', made.id, { title: 'x' }, STAFF, removed.updatedAt);
      assert.equal(!edit.ok && edit.error.code, 'not_found');
      const back = must(await service.restore('things', made.id, STAFF));
      assert.equal(back.deletedAt, null);
      assert.equal(back.status, 'published');
      assert.deepEqual(titles(must(await service.listPublished('things')).items), ['One']);
    });

    test('records removed more than 90 days ago are dropped for good, with their history', async () => {
      const store = makeStore();
      let today = new Date('2026-01-01T00:00:00Z');
      let id = 0;
      const service = createCollections({ definitions: [everything], store, now: () => today, newId: () => `r${++id}` });
      const old = must(await service.create('things', { title: 'Old' }, STAFF));
      must(await service.remove('things', old.id, STAFF));
      today = new Date('2026-03-31T00:00:00Z'); // 89 days on
      const recent = must(await service.create('things', { title: 'Recent' }, STAFF));
      must(await service.remove('things', recent.id, STAFF));
      assert.equal(must(await service.listForStaff('things', { show: 'removed' })).items.length, 2);
      today = new Date(today.getTime() + (LIMITS.removedDays - 88) * 86_400_000);
      must(await service.create('things', { title: 'Trigger' }, STAFF));
      assert.deepEqual(titles(must(await service.listForStaff('things', { show: 'removed' })).items), ['Recent']);
      assert.deepEqual(await store.history('things', old.id, 10), []);
    });

    test('move up, down, first and last reorder the list; the ends stay put', async () => {
      const service = await seeded(4);
      const order = async () => titles(must(await service.listPublished('things', { limit: 50 })).items);
      const ids = must(await service.listForStaff('things', { limit: 50 })).items.map((r) => r.id);
      must(await service.move('things', ids[2], 'up'));
      assert.deepEqual(await order(), ['Thing 1', 'Thing 3', 'Thing 2', 'Thing 4']);
      must(await service.move('things', ids[2], 'down'));
      assert.deepEqual(await order(), ['Thing 1', 'Thing 2', 'Thing 3', 'Thing 4']);
      must(await service.move('things', ids[0], 'up'));
      must(await service.move('things', ids[3], 'down'));
      assert.deepEqual(await order(), ['Thing 1', 'Thing 2', 'Thing 3', 'Thing 4']);
      must(await service.move('things', ids[3], 'first'));
      must(await service.move('things', ids[0], 'last'));
      assert.deepEqual(await order(), ['Thing 4', 'Thing 2', 'Thing 3', 'Thing 1']);
    });

    test('moving skips over removed records, and drafts keep their place', async () => {
      const service = await seeded(3);
      const ids = must(await service.listForStaff('things')).items.map((r) => r.id);
      must(await service.remove('things', ids[1], STAFF));
      must(await service.move('things', ids[2], 'up'));
      assert.deepEqual(titles(must(await service.listPublished('things')).items), ['Thing 3', 'Thing 1']);
    });

    // Fixed ids (m, z, k, a), so the order of records that share a position, by id, is known.
    function lettered(store: CollectionStore, newRecords: 'first' | 'last' = 'last') {
      let tick = 0;
      const ids = ['m', 'z', 'k', 'a'];
      return createCollections({
        definitions: [{ ...everything, newRecords }],
        store,
        now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
        newId: () => ids.shift() ?? `x${tick}`,
      });
    }

    for (const place of ['last', 'first'] as const) {
      test(`after remove, add and restore no two records share a position (new records ${place})`, async () => {
        const store = makeStore();
        const service = lettered(store, place);
        const made: string[] = [];
        for (const title of ['A', 'B', 'C']) made.push(must(await service.create('things', { title }, STAFF, true)).id);
        // C is the newest, so it sits at the end the next record will take.
        must(await service.remove('things', made[2], STAFF));
        must(await service.create('things', { title: 'D' }, STAFF, true));
        must(await service.restore('things', made[2], STAFF));
        const records = must(await service.listForStaff('things', { limit: 50 })).items;
        const positions = records.map((r) => r.position);
        assert.equal(new Set(positions).size, positions.length, `positions ${positions.join(', ')}`);
        assert.deepEqual(titles(records), place === 'last' ? ['A', 'B', 'C', 'D'] : ['D', 'C', 'B', 'A']);
      });
    }

    test('move up or down goes one place when two records share a position', async () => {
      const store = makeStore();
      const service = lettered(store);
      const ids: string[] = [];
      for (const title of ['A', 'B', 'C', 'D']) ids.push(must(await service.create('things', { title }, STAFF, true)).id);
      const [, , c, d] = ids;
      // C and D at the same position, as data from before positions were kept unique can be: A@1 B@2 D@3 C@3.
      await store.setPositions('things', [{ id: c, position: 3 }, { id: d, position: 3 }]);
      const order = async () => titles(must(await service.listPublished('things', { limit: 50 })).items);
      assert.deepEqual(await order(), ['A', 'B', 'D', 'C']);
      must(await service.move('things', c, 'up'));
      assert.deepEqual(await order(), ['A', 'B', 'C', 'D']);
      must(await service.move('things', c, 'down'));
      assert.deepEqual(await order(), ['A', 'B', 'D', 'C']);
      const positions = must(await service.listForStaff('things', { limit: 50 })).items.map((r) => r.position);
      assert.equal(new Set(positions).size, 4);
    });

    test('a collection can put new records first', async () => {
      const service = serviceOn(makeStore(), [{ ...everything, newRecords: 'first' }]);
      for (const title of ['A', 'B', 'C']) must(await service.create('things', { title }, STAFF, true));
      assert.deepEqual(titles(must(await service.listPublished('things')).items), ['C', 'B', 'A']);
    });

    test('a collection sorted by a field pages in that order and cannot be rearranged', async () => {
      const service = setup();
      const years = [1999, 2010, 1999, 2021, 1975];
      for (const [i, year] of years.entries()) must(await service.create('by-year', { title: `T${i}`, year }, STAFF, true));
      const seen: unknown[] = [];
      let cursor: string | null = null;
      do {
        const page: Page<PublicRecord> = must(await service.listPublished('by-year', { cursor, limit: 2 }));
        seen.push(...page.items.map((r) => `${r.data.year} ${r.id}`));
        cursor = page.nextCursor;
      } while (cursor);
      // Newest first; the two from 1999 in id order, descending.
      assert.deepEqual(seen, ['2021 r4', '2010 r2', '1999 r3', '1999 r1', '1975 r5']);
      const moved = await service.move('by-year', 'r1', 'up');
      assert.equal(!moved.ok && moved.error.code, 'bad_request');
    });

    test('staff search matches words in any text field, whatever the case, and treats % and _ as text', async () => {
      const service = setup();
      must(await service.create('things', { title: 'Blue Lines', note: 'Bristol, 1991' }, STAFF));
      must(await service.create('things', { title: 'Dummy', note: '100% trip hop', kind: 'b' }, STAFF));
      must(await service.create('things', { title: 'Under_score' }, STAFF));
      const find = async (search: string) => titles(must(await service.listForStaff('things', { search })).items);
      assert.deepEqual(await find('BRISTOL'), ['Blue Lines']);
      assert.deepEqual(await find('  blue   lines '), ['Blue Lines']);
      assert.deepEqual(await find('beta'), ['Dummy']);
      assert.deepEqual(await find('100%'), ['Dummy']);
      assert.deepEqual(await find('%'), ['Dummy']);
      assert.deepEqual(await find('_'), ['Under_score']);
      assert.deepEqual(await find('nothing like this'), []);
      // The public list has no search to abuse.
      assert.equal(must(await service.listForStaff('things', { search: '' })).items.length, 3);
    });

    test('a staff search of the full length, or with %, _ and accents, finds its record', async () => {
      const service = setup();
      const long = `${'a long pasted sentence about one record, '.repeat(3)}and more`.slice(0, LIMITS.search);
      const odd = '100% café_crème, déjà vu';
      must(await service.create('by-year', { title: long, year: 2001 }, STAFF));
      must(await service.create('by-year', { title: odd, year: 2002 }, STAFF));
      must(await service.create('by-year', { title: 'Something else', year: 2003 }, STAFF));
      const find = async (search: string) => titles(must(await service.listForStaff('by-year', { search })).items);
      assert.equal(long.length, LIMITS.search);
      assert.deepEqual(await find(long.toUpperCase()), [long]);
      assert.deepEqual(await find(`${long}x`), [long]);
      assert.deepEqual(await find(odd), [odd]);
      assert.deepEqual(await find('% CAFÉ_CRÈME, DÉJÀ'), [odd]);
      assert.deepEqual(await find('b'.repeat(LIMITS.search)), []);
    });

    test('history lists every change, newest first, and a past version can be brought back', async () => {
      const service = setup();
      const made = must(await service.create('things', { title: 'One' }, STAFF));
      const two = must(await service.update('things', made.id, { title: 'Two' }, STAFF, made.updatedAt));
      must(await service.setPublished('things', made.id, true, STAFF));
      const history = must(await service.history('things', made.id));
      assert.deepEqual(history.map((h) => [h.action, h.data.title, h.status]), [
        ['publish', 'Two', 'published'],
        ['update', 'Two', 'draft'],
        ['create', 'One', 'draft'],
      ]);
      assert.equal(history[1].at, two.updatedAt);
      const first = history[2];
      const back = must(await service.revert('things', made.id, first.id, STAFF));
      assert.equal(back.data.title, 'One');
      // Bringing back old words doesn't unpublish the record.
      assert.equal(back.status, 'published');
      assert.equal(must(await service.history('things', made.id))[0].action, 'revert');
      const missing = await service.revert('things', made.id, 99_999, STAFF);
      assert.equal(!missing.ok && missing.error.code, 'not_found');
    });

    test("a past version of another record can't be used", async () => {
      const service = setup();
      const a = must(await service.create('things', { title: 'A' }, STAFF));
      const b = must(await service.create('things', { title: 'B' }, STAFF));
      const [entryOfA] = must(await service.history('things', a.id));
      const result = await service.revert('things', b.id, entryOfA.id, STAFF);
      assert.equal(!result.ok && result.error.code, 'not_found');
    });

    test('only the newest 50 versions of a record are kept', async () => {
      const store = makeStore();
      const service = serviceOn(store);
      const made = must(await service.create('things', { title: 'v0' }, STAFF));
      let version = made.updatedAt;
      for (let i = 1; i <= LIMITS.history + 5; i++) version = must(await service.update('things', made.id, { title: `v${i}` }, STAFF, version)).updatedAt;
      const history = must(await service.history('things', made.id));
      assert.equal(history.length, LIMITS.history);
      assert.equal(history[0].data.title, `v${LIMITS.history + 5}`);
      // Count in the store itself: history() reads at most 50, so it can't show old rows left behind.
      assert.equal((await store.history('things', made.id, 1_000)).length, LIMITS.history);
    });

    test("a past version that no longer fits the form can't be brought back", async () => {
      const store = makeStore();
      const service = serviceOn(store);
      const made = must(await service.create('things', { title: 'A longer old title' }, STAFF));
      must(await service.update('things', made.id, { title: 'Short' }, STAFF, made.updatedAt));
      const [, first] = must(await service.history('things', made.id));
      // The form changes: titles may now be at most 10 characters.
      const rest = everything.fields.slice(1);
      const title = { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 10 } as const;
      const tighter = serviceOn(store, [{ ...everything, fields: [title, ...rest] }]);
      const result = await tighter.revert('things', made.id, first.id, STAFF);
      assert.equal(!result.ok && result.error.code, 'invalid');
      assert.ok(!result.ok && result.error.code === 'invalid' && result.error.fields.title);
      const now = must(await service.get('things', made.id));
      assert.equal(now.data.title, 'Short');
      assert.equal(must(await service.history('things', made.id))[0].action, 'update');
    });

    test('collections do not see each other’s records', async () => {
      const service = setup();
      const thing = must(await service.create('things', { title: 'Thing' }, STAFF, true));
      must(await service.create('by-year', { title: 'Entry', year: 2000 }, STAFF, true));
      assert.equal(must(await service.listPublished('things')).items.length, 1);
      assert.equal(must(await service.listPublished('by-year')).items.length, 1);
      const cross = await service.get('by-year', thing.id);
      assert.equal(!cross.ok && cross.error.code, 'not_found');
    });
  });
}

test('a service refuses to start with a bad or repeated definition', () => {
  const store = createMemoryStore();
  assert.throws(() => createCollections({ definitions: [{ ...everything, titleField: 'nope' }], store }), /titleField/);
  assert.throws(() => createCollections({ definitions: [everything, everything], store }), /declared twice/);
  assert.equal(createCollections({ definitions: [byYear], store }).definition('by-year'), byYear);
});
