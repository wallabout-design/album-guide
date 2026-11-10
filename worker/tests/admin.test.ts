// /admin and /admin/api/* (worker/admin.ts), called through the Worker with
// D1 stood in for by Node's SQLite. Signed in means the preview's test cookie
// on a preview host; the Access path is covered in admin-auth.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from '../../src/lib/collections/tests/sqlite';
import { TEST_COOKIE, TEST_EMAIL, testCookieValue } from '../admin-auth';
import { MAX_WRITE_BYTES, WRITE_HEADER } from '../admin';
import worker, { type Env } from '../index';

const PREVIEW = 'https://feat-x-album-guide-site-preview.jj-23b.workers.dev';
const CODE = 'the-code';
const album = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pick = (n: number, more: Record<string, unknown> = {}) => ({ album: album(n), title: `Album ${n}`, artist: 'Artist', note: 'A note.', ...more });

// Responses are read loosely here: the assertions say what shape is expected.
// oxlint-disable-next-line typescript/no-explicit-any
type Body = Record<string, any>;

async function site(extra: Partial<Env> = {}) {
  const assets: string[] = [];
  const env: Env = {
    ASSETS: { fetch: async (request: Request) => (assets.push(new URL(request.url).pathname), new Response('admin page')) } as unknown as Fetcher,
    DB: createTestDatabase(),
    ADMIN_TEST_CODE: CODE,
    ...extra,
  };
  const cookie = `${TEST_COOKIE}=${await testCookieValue(CODE)}`;
  /** A request from the admin page of a signed-in member of staff. */
  const staff = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(
      new Request(`${PREVIEW}${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Cookie: cookie,
          ...(method === 'GET' ? {} : { Origin: PREVIEW, [WRITE_HEADER]: '1', 'Content-Type': 'application/json' }),
          ...headers,
        },
      }),
      env,
    );
  const anyone = (method: string, path: string, init: RequestInit = {}) => worker.fetch(new Request(`${PREVIEW}${path}`, { method, ...init }), env);
  const add = async (n: number, publish = false) => ((await (await staff('POST', '/admin/api/collections/picks', { data: pick(n), publish })).json()) as Body).record;
  const publicTitles = async () =>
    ((await (await anyone('GET', '/api/collections/picks?limit=50')).json()) as Body).items.map((i: Body) => i.data.title);
  return { env, assets, staff, anyone, add, publicTitles, cookie };
}

const WRITES: [string, string][] = [
  ['POST', '/admin/api/collections/picks'],
  ['PUT', '/admin/api/collections/picks/ID'],
  ['POST', '/admin/api/collections/picks/ID/publish'],
  ['POST', '/admin/api/collections/picks/ID/unpublish'],
  ['POST', '/admin/api/collections/picks/ID/remove'],
  ['POST', '/admin/api/collections/picks/ID/restore'],
  ['POST', '/admin/api/collections/picks/ID/move'],
  ['POST', '/admin/api/collections/picks/ID/revert'],
];
const READS = ['/admin/api/me', '/admin/api/collections/picks', '/admin/api/collections/picks/ID', '/admin/api/collections/picks/ID/history'];

test('signed out, every admin address answers 403 with no data and never reaches the page or a write', async () => {
  const { anyone, add, assets, publicTitles } = await site();
  const made = await add(1, true);
  assets.length = 0;
  const headers = { Origin: PREVIEW, [WRITE_HEADER]: '1', 'Content-Type': 'application/json' };
  for (const path of READS) {
    const res = await anyone('GET', path.replace('ID', made.id));
    assert.equal(res.status, 403, path);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const text = await res.text();
    assert.ok(!text.includes('Album 1') && !text.includes(TEST_EMAIL), path);
  }
  for (const [method, path] of WRITES) {
    const res = await anyone(method, path.replace('ID', made.id), { headers, body: JSON.stringify({ data: pick(2), direction: 'first' }) });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  for (const path of ['/admin', '/admin/', '/admin.html', '/admin/anything', '/admin/api']) {
    const res = await anyone('GET', path);
    assert.equal(res.status, 403, path);
    assert.ok(!(await res.text()).includes('admin page'));
  }
  assert.deepEqual(assets, []);
  assert.deepEqual(await publicTitles(), ['Album 1']);
});

test('a forged or stale cookie is signed out', async () => {
  const { anyone } = await site();
  for (const cookie of [`${TEST_COOKIE}=${CODE}`, `${TEST_COOKIE}=${await testCookieValue('old-code')}`, `${TEST_COOKIE}=`]) {
    assert.equal((await anyone('GET', '/admin/api/me', { headers: { Cookie: cookie } })).status, 403);
  }
});

test('with nothing configured, as production is until its secrets are set, everyone is refused', async () => {
  const { anyone, cookie } = await site({ ADMIN_TEST_CODE: undefined });
  assert.equal((await anyone('GET', '/admin/api/me', { headers: { Cookie: cookie } })).status, 403);
  const page = await anyone('GET', '/admin', { headers: { Cookie: cookie } });
  assert.equal(page.status, 403);
  assert.ok(!(await page.text()).includes('<form'));
  const login = await anyone('POST', '/admin/test-login', { headers: { Origin: PREVIEW }, body: new URLSearchParams({ code: CODE }) });
  assert.equal(login.status, 404);
});

test('the test sign-in does nothing on album.guide even with the code set', async () => {
  const { env, cookie } = await site();
  const at = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://album.guide${path}`, init), env);
  assert.equal((await at('/admin/api/me', { headers: { Cookie: cookie } })).status, 403);
  const login = await at('/admin/test-login', { method: 'POST', headers: { Origin: 'https://album.guide' }, body: new URLSearchParams({ code: CODE }) });
  assert.equal(login.status, 404);
  assert.equal(login.headers.get('set-cookie'), null);
});

test('the preview sign-in form sets the cookie for the right code only', async () => {
  const { anyone } = await site();
  const page = await anyone('GET', '/admin');
  assert.equal(page.status, 403);
  assert.match(await page.text(), /<form method="post" action="\/admin\/test-login">/);

  const post = (code: string, origin = PREVIEW) =>
    anyone('POST', '/admin/test-login', { headers: { Origin: origin }, body: new URLSearchParams({ code }) });
  const wrong = await post('guess');
  assert.equal(wrong.status, 303);
  assert.equal(wrong.headers.get('location'), '/admin?wrong-code');
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.match(await (await anyone('GET', '/admin?wrong-code')).text(), /That code is not right/);
  assert.equal((await post(CODE, 'https://evil.example')).status, 403);

  const right = await post(CODE);
  assert.equal(right.status, 303);
  assert.equal(right.headers.get('location'), '/admin');
  const cookie = right.headers.get('set-cookie') ?? '';
  assert.match(cookie, /^admin_test=[0-9a-f]{64}; Path=\/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
  const me = await anyone('GET', '/admin/api/me', { headers: { Cookie: cookie.split(';')[0] } });
  assert.deepEqual(await me.json(), { email: TEST_EMAIL, collections: [{ name: 'picks', label: 'Staff picks' }] });
});

test('signed in, the page is the admin file, never cached', async () => {
  const { staff, assets } = await site();
  for (const path of ['/admin', '/admin/', '/admin.html']) {
    const res = await staff('GET', path);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), 'admin page');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(assets, ['/admin', '/admin', '/admin']);
});

test('a write needs this site as its Origin and the admin header', async () => {
  const { staff, publicTitles } = await site();
  const body = { data: pick(1), publish: true };
  const bad: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { Origin: '' }, { [WRITE_HEADER]: '' }];
  for (const headers of bad) {
    const res = await staff('POST', '/admin/api/collections/picks', body, headers);
    assert.equal(res.status, 403, JSON.stringify(headers));
    assert.equal(((await res.json()) as Body).code, 'forbidden');
  }
  assert.deepEqual(await publicTitles(), []);
  assert.equal((await staff('POST', '/admin/api/collections/picks', body)).status, 201);
});

test('a write must be JSON, an object, and not too big', async () => {
  const { staff, env, cookie } = await site();
  const raw = (body: string, type = 'application/json') =>
    worker.fetch(
      new Request(`${PREVIEW}/admin/api/collections/picks`, {
        method: 'POST',
        body,
        headers: { Cookie: cookie, Origin: PREVIEW, [WRITE_HEADER]: '1', 'Content-Type': type },
      }),
      env,
    );
  assert.equal((await raw('title=x', 'application/x-www-form-urlencoded')).status, 415);
  assert.equal((await raw('{not json')).status, 400);
  assert.equal((await raw('[1,2]')).status, 400);
  assert.equal((await raw(JSON.stringify({ data: { note: 'x'.repeat(MAX_WRITE_BYTES) } }))).status, 413);
  assert.equal(((await (await staff('GET', '/admin/api/collections/picks')).json()) as Body).total, 0);
});

test('add, edit, publish, unpublish, remove and restore, seen from the public list', async () => {
  const { staff, publicTitles } = await site();
  const created = await staff('POST', '/admin/api/collections/picks', { data: pick(1) });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const { record } = (await created.json()) as Body;
  assert.equal(record.status, 'draft');
  assert.equal(record.updatedBy, TEST_EMAIL);
  assert.deepEqual(await publicTitles(), []);

  const base = `/admin/api/collections/picks/${record.id}`;
  const edited = (await (await staff('PUT', base, { data: pick(1, { title: 'Renamed' }), updatedAt: record.updatedAt })).json()) as Body;
  assert.equal(edited.record.data.title, 'Renamed');
  assert.equal(((await (await staff('GET', base)).json()) as Body).record.data.title, 'Renamed');

  assert.equal(((await (await staff('POST', `${base}/publish`, {})).json()) as Body).record.status, 'published');
  assert.deepEqual(await publicTitles(), ['Renamed']);
  assert.equal(((await (await staff('POST', `${base}/unpublish`, {})).json()) as Body).record.status, 'draft');
  assert.deepEqual(await publicTitles(), []);
  await staff('POST', `${base}/publish`, {});

  assert.ok(((await (await staff('POST', `${base}/remove`, {})).json()) as Body).record.deletedAt);
  assert.deepEqual(await publicTitles(), []);
  assert.equal(((await (await staff('GET', '/admin/api/collections/picks')).json()) as Body).items.length, 0);
  assert.equal(((await (await staff('GET', '/admin/api/collections/picks?show=removed')).json()) as Body).items.length, 1);
  assert.equal(((await (await staff('POST', `${base}/restore`, {})).json()) as Body).record.deletedAt, null);
  assert.deepEqual(await publicTitles(), ['Renamed']);

  const history = (await (await staff('GET', `${base}/history`)).json()) as Body;
  assert.deepEqual(history.items.map((h: Body) => h.action), ['restore', 'remove', 'publish', 'unpublish', 'publish', 'update', 'create']);
  const first = history.items.at(-1);
  const reverted = (await (await staff('POST', `${base}/revert`, { historyId: first.id })).json()) as Body;
  assert.equal(reverted.record.data.title, 'Album 1');
});

test('validation errors come back per field with a 422, and nothing is saved', async () => {
  const { staff } = await site();
  const res = await staff('POST', '/admin/api/collections/picks', { data: { album: 'nope', title: '', note: '<b>hi</b>' } });
  assert.equal(res.status, 422);
  const body = (await res.json()) as Body;
  assert.equal(body.code, 'invalid');
  assert.deepEqual(Object.keys(body.fields).sort(), ['album', 'artist', 'note', 'title']);
  assert.equal(body.fields.title, 'Album title is needed.');
  assert.equal(((await (await staff('GET', '/admin/api/collections/picks')).json()) as Body).total, 0);
});

test('an edit from a stale copy is a 409 and changes nothing', async () => {
  const { staff, add } = await site();
  const made = await add(1);
  const base = `/admin/api/collections/picks/${made.id}`;
  assert.equal((await staff('PUT', base, { data: pick(1, { title: 'First' }), updatedAt: made.updatedAt })).status, 200);
  const stale = await staff('PUT', base, { data: pick(1, { title: 'Second' }), updatedAt: made.updatedAt });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as Body).code, 'conflict');
  assert.equal(((await (await staff('GET', base)).json()) as Body).record.data.title, 'First');
});

test('the staff list has the definition, a total, search and pages', async () => {
  const { staff, add } = await site();
  for (let n = 1; n <= 25; n++) await add(n);
  const first = (await (await staff('GET', '/admin/api/collections/picks')).json()) as Body;
  assert.equal(first.definition.name, 'picks');
  assert.equal(first.total, 25);
  assert.equal(first.maxRecords, 200);
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0].data.title, 'Album 25');
  const second = (await (await staff('GET', `/admin/api/collections/picks?cursor=${first.nextCursor}`)).json()) as Body;
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  const found = (await (await staff('GET', '/admin/api/collections/picks?q=album%2017')).json()) as Body;
  assert.deepEqual(found.items.map((i: Body) => i.data.title), ['Album 17']);
  assert.equal((await staff('GET', '/admin/api/collections/picks?cursor=bad')).status, 400);
});

test('move reorders the public list', async () => {
  const { staff, add, publicTitles } = await site();
  const one = await add(1, true);
  await add(2, true);
  await add(3, true);
  assert.deepEqual(await publicTitles(), ['Album 3', 'Album 2', 'Album 1']);
  assert.equal((await staff('POST', `/admin/api/collections/picks/${one.id}/move`, { direction: 'up' })).status, 200);
  assert.deepEqual(await publicTitles(), ['Album 3', 'Album 1', 'Album 2']);
  assert.equal((await staff('POST', `/admin/api/collections/picks/${one.id}/move`, { direction: 'first' })).status, 200);
  assert.deepEqual(await publicTitles(), ['Album 1', 'Album 3', 'Album 2']);
  assert.equal((await staff('POST', `/admin/api/collections/picks/${one.id}/move`, { direction: 'sideways' })).status, 400);
});

test('unknown collections, records, actions and methods are refused', async () => {
  const { staff, add } = await site();
  const made = await add(1);
  assert.equal((await staff('GET', '/admin/api/collections/nope')).status, 404);
  assert.equal((await staff('GET', '/admin/api/collections/test-abc')).status, 404);
  assert.equal((await staff('GET', '/admin/api/collections/picks/missing')).status, 404);
  assert.equal((await staff('POST', `/admin/api/collections/picks/${made.id}/explode`, {})).status, 404);
  assert.equal((await staff('DELETE', `/admin/api/collections/picks/${made.id}`)).status, 405);
  assert.equal((await staff('GET', '/admin/api/nothing')).status, 404);
  assert.equal((await staff('POST', '/admin', {})).status, 405);
});

test('without a database the admin API answers 503', async () => {
  const { staff } = await site({ DB: undefined });
  assert.equal((await staff('GET', '/admin/api/collections/picks')).status, 503);
});
