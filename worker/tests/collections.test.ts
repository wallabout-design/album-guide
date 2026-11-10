// GET /api/collections/<name> (worker/collections.ts), called through the
// Worker with D1 stood in for by Node's SQLite and the real migration. No
// browser, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollections } from '../../src/lib/collections/service';
import { createSqlStore } from '../../src/lib/collections/sql-store';
import { createTestDatabase } from '../../src/lib/collections/tests/sqlite';
import { collections } from '../../src/collections';
import { PUBLIC_CACHE } from '../collections';
import worker, { type Env } from '../index';
import { SECURITY_HEADERS } from '../security-headers';

const STAFF = 'staff@example.com';
const album = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function site(published = 0, extra: Partial<Env> = {}) {
  const DB = createTestDatabase();
  const assets: string[] = [];
  const env: Env = {
    ASSETS: { fetch: async (request: Request) => (assets.push(request.url), new Response('asset')) } as unknown as Fetcher,
    DB,
    ...extra,
  };
  let id = 0;
  const service = createCollections({
    definitions: collections,
    store: createSqlStore(DB),
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, id)),
    newId: () => `p${String(++id).padStart(3, '0')}`,
  });
  for (let i = 1; i <= published; i++) {
    const made = await service.create('picks', { album: album(i), title: `Album ${i}`, artist: 'Artist', note: 'A note.' }, STAFF, true);
    assert.ok(made.ok);
  }
  const get = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://album.guide${path}`, init), env);
  return { env, service, get, assets };
}

type List = { items: { id: string; data: Record<string, unknown>; updatedAt: string }[]; nextCursor: string | null };

test('the list returns published picks only, newest pick first, without staff details', async () => {
  const { service, get } = await site(2);
  await service.create('picks', { album: album(9), title: 'A draft', artist: 'Artist', note: 'Not yet.' }, STAFF);
  const removed = await service.create('picks', { album: album(8), title: 'Removed', artist: 'Artist', note: 'Gone.' }, STAFF, true);
  assert.ok(removed.ok);
  await service.remove('picks', removed.value.id, STAFF);

  const res = await get('/api/collections/picks');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.equal(res.headers.get('cache-control'), PUBLIC_CACHE);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(name), value, name);
  const text = await res.text();
  const body = JSON.parse(text) as List;
  assert.deepEqual(body.items.map((i) => i.data.title), ['Album 2', 'Album 1']);
  assert.equal(body.nextCursor, null);
  assert.deepEqual(Object.keys(body.items[0]).sort(), ['data', 'id', 'updatedAt']);
  assert.ok(!text.includes(STAFF));
});

test('an empty collection is an empty list, not an error', async () => {
  const { get } = await site(0);
  const res = await get('/api/collections/picks');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { items: [], nextCursor: null });
});

test('pages are 12 by default, follow the cursor, and the limit is capped at 50', async () => {
  const { get } = await site(60);
  const first = (await (await get('/api/collections/picks')).json()) as List;
  assert.equal(first.items.length, 12);
  assert.equal(first.items[0].data.title, 'Album 60');
  const second = (await (await get(`/api/collections/picks?cursor=${first.nextCursor}`)).json()) as List;
  assert.deepEqual(second.items.map((i) => i.data.title), Array.from({ length: 12 }, (_, i) => `Album ${48 - i}`));
  assert.equal(((await (await get('/api/collections/picks?limit=9999')).json()) as List).items.length, 50);
  assert.equal(((await (await get('/api/collections/picks?limit=5')).json()) as List).items.length, 5);
  assert.equal(((await (await get('/api/collections/picks?limit=-1')).json()) as List).items.length, 12);
});

test('an unchanged list revalidates with a 304; a changed one does not', async () => {
  const { service, get } = await site(1);
  const first = await get('/api/collections/picks');
  const etag = first.headers.get('etag');
  assert.match(etag ?? '', /^W\/"[0-9a-f]{24}"$/);
  const again = await get('/api/collections/picks', { headers: { 'If-None-Match': etag! } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), '');
  assert.equal(again.headers.get('cache-control'), PUBLIC_CACHE);
  await service.create('picks', { album: album(2), title: 'New', artist: 'Artist', note: 'n' }, STAFF, true);
  const changed = await get('/api/collections/picks', { headers: { 'If-None-Match': etag! } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), etag);
});

test('HEAD answers with the headers and no body', async () => {
  const { get } = await site(1);
  const res = await get('/api/collections/picks', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
  assert.ok(res.headers.get('etag'));
});

test('a bad cursor is a 400 and an unknown collection a 404, neither cached', async () => {
  const { get, assets } = await site(1);
  const bad = await get('/api/collections/picks?cursor=nonsense');
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get('cache-control'), 'no-store');
  assert.equal(((await bad.json()) as { code: string }).code, 'bad_request');
  for (const path of ['/api/collections/nope', '/api/collections/test-abc', "/api/collections/x'%20OR%201=1"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal(assets.length, 0);
});

test('the public route only reads: other methods and deeper paths are a JSON 404', async () => {
  const { get } = await site(1);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await get('/api/collections/picks', { method, body: '{}' });
    assert.equal(res.status, 404, method);
    assert.deepEqual(await res.json(), { error: 'not found' });
  }
  assert.equal((await get('/api/collections/picks/p001')).status, 404);
  assert.equal((await get('/api/collections')).status, 404);
  assert.equal(((await (await get('/api/collections/picks')).json()) as List).items.length, 1);
});

test('without a database the route answers 503 rather than throwing', async () => {
  const { get } = await site(0, { DB: undefined });
  const res = await get('/api/collections/picks');
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a database error is logged and answered with a 503', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const broken = { prepare: () => { throw new Error('boom'); }, batch: async () => [] };
  const { get } = await site(0, { DB: broken });
  const res = await get('/api/collections/picks');
  assert.equal(res.status, 503);
  assert.match(String(logged.mock.calls[0].arguments[0]), /collection list failed.*boom/);
});

test('scratch collections exist only when the e2e flag is set', async () => {
  const off = await site(0);
  assert.equal((await off.get('/api/collections/test-abc')).status, 404);
  const on = await site(0, { TEST_COLLECTIONS: '1' });
  assert.deepEqual(await (await on.get('/api/collections/test-abc')).json(), { items: [], nextCursor: null });
  assert.equal((await on.get('/api/collections/other')).status, 404);
});
