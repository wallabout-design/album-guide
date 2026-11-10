import { test, expect } from '@playwright/test';
import { publicTitles, scratch, signIn, STAFF_EMAIL, writeHeaders } from './admin';

/*
 * The admin's HTTP side, asked from outside against the built Worker: signed
 * out it gives nothing and changes nothing; signed in (the preview's fixed
 * code) a record can be added, edited, published, removed and brought back,
 * and each step shows on the public list. Each signed-in test works in its
 * own scratch collection.
 */
// The response bodies are read loosely: the assertions say what is expected.
// oxlint-disable-next-line typescript/no-explicit-any
type Body = Record<string, any>;

test.describe('signed out', () => {
  test('the admin page is a 403 with no app and no data', async ({ request }) => {
    for (const path of ['/admin', '/admin/', '/admin.html', '/admin/anything']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
      expect(response.headers()['cache-control']).toBe('no-store');
      const html = await response.text();
      expect(html).toContain('Staff only');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('seed-01');
    }
  });

  test('every admin API address is a 403 with no records in it', async ({ request, baseURL }) => {
    const reads = ['/admin/api/me', '/admin/api/collections/picks', '/admin/api/collections/picks/seed-01', '/admin/api/collections/picks/seed-01/history'];
    for (const path of reads) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(403);
      const text = await response.text();
      expect(text).not.toContain('seed');
      expect(text).not.toContain('@');
    }
    const headers = writeHeaders(baseURL!);
    const writes: ['post' | 'put', string][] = [
      ['post', '/admin/api/collections/picks'],
      ['put', '/admin/api/collections/picks/seed-01'],
      ['post', '/admin/api/collections/picks/seed-01/remove'],
      ['post', '/admin/api/collections/picks/seed-01/unpublish'],
      ['post', '/admin/api/collections/picks/seed-07/publish'],
      ['post', '/admin/api/collections/picks/seed-11/restore'],
      ['post', '/admin/api/collections/picks/seed-02/move'],
    ];
    for (const [method, path] of writes) {
      const response = await request[method](path, { headers, data: { data: { title: 'x' }, direction: 'first' } });
      expect(response.status(), `${method} ${path}`).toBe(403);
    }
    // Nothing moved, appeared or vanished.
    const first = (await (await request.get('/api/collections/picks?limit=3')).json()) as Body;
    expect(first.items.map((i: Body) => i.id)).toEqual(['seed-01', 'seed-02', 'seed-03']);
  });

  test('a wrong preview code does not sign in', async ({ request, baseURL }) => {
    const response = await request.post('/admin/test-login', { headers: { Origin: new URL(baseURL!).origin }, form: { code: 'guess' }, maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/admin?wrong-code');
    expect(response.headers()['set-cookie']).toBeUndefined();
    expect((await request.get('/admin/api/me')).status()).toBe(403);
  });
});

test.describe('signed in', () => {
  test('add, edit, publish, remove and undo, each seen on the public list', async ({ request, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const api = `/admin/api/collections/${collection}`;
    const headers = writeHeaders(baseURL!);
    await signIn(request, baseURL!);
    expect(await (await request.get('/admin/api/me')).json()).toEqual({ email: STAFF_EMAIL, collections: [{ name: 'picks', label: 'Staff picks' }] });

    // Add: a draft, so not public yet.
    const created = await request.post(api, { headers, data: { data: { title: 'First words', year: 1991 } } });
    expect(created.status()).toBe(201);
    const { record } = (await created.json()) as Body;
    expect(record.status).toBe('draft');
    expect(record.updatedBy).toBe(STAFF_EMAIL);
    expect(await publicTitles(request, collection)).toEqual([]);

    // Edit.
    const edited = await request.put(`${api}/${record.id}`, { headers, data: { data: { title: 'Better words', year: 1991 }, updatedAt: record.updatedAt } });
    expect(edited.status()).toBe(200);

    // Publish.
    expect((await request.post(`${api}/${record.id}/publish`, { headers, data: {} })).status()).toBe(200);
    expect(await publicTitles(request, collection)).toEqual(['Better words']);

    // Remove: gone from the public list and the staff list, kept under "removed".
    expect((await request.post(`${api}/${record.id}/remove`, { headers, data: {} })).status()).toBe(200);
    expect(await publicTitles(request, collection)).toEqual([]);
    expect(((await (await request.get(api)).json()) as Body).items).toEqual([]);
    expect(((await (await request.get(`${api}?show=removed`)).json()) as Body).items).toHaveLength(1);

    // Undo.
    expect((await request.post(`${api}/${record.id}/restore`, { headers, data: {} })).status()).toBe(200);
    expect(await publicTitles(request, collection)).toEqual(['Better words']);

    // History has every step, and the first version can be brought back.
    const history = (await (await request.get(`${api}/${record.id}/history`)).json()) as Body;
    expect(history.items.map((h: Body) => h.action)).toEqual(['restore', 'remove', 'publish', 'update', 'create']);
    const reverted = await request.post(`${api}/${record.id}/revert`, { headers, data: { historyId: history.items.at(-1).id } });
    expect(reverted.status()).toBe(200);
    expect(await publicTitles(request, collection)).toEqual(['First words']);
  });

  test('a bad record is refused with a message per field, and the cap holds', async ({ request, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const api = `/admin/api/collections/${collection}`;
    const headers = writeHeaders(baseURL!);
    await signIn(request, baseURL!);

    const bad = await request.post(api, { headers, data: { data: { title: '', note: '<b>bold</b>', link: 'http://example.com', year: 12 } } });
    expect(bad.status()).toBe(422);
    expect(((await bad.json()) as Body).fields).toEqual({
      title: 'Title is needed.',
      note: "Note can't contain HTML tags (text like <b>). Please remove them.",
      link: 'Link must be a full web address, starting with https://.',
      year: 'Year must be from 1900 to 2100.',
    });

    // The scratch collection holds eight records.
    for (let n = 1; n <= 8; n++) {
      expect((await request.post(api, { headers, data: { data: { title: `Thing ${n}` }, publish: true } })).status()).toBe(201);
    }
    const ninth = await request.post(api, { headers, data: { data: { title: 'Thing 9' }, publish: true } });
    expect(ninth.status()).toBe(409);
    expect(((await ninth.json()) as Body).code).toBe('full');
    // Eight public records, three to a page: three pages, in order.
    expect(await publicTitles(request, collection)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Thing ${n}`));
  });

  test('a long search answers with its matches, not an error', async ({ request, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const api = `/admin/api/collections/${collection}`;
    await signIn(request, baseURL!);
    const title = 'A long pasted title';
    const note = 'And a note with %, _ and é in it, to run long';
    expect((await request.post(api, { headers: writeHeaders(baseURL!), data: { data: { title, note } } })).status()).toBe(201);

    // D1 refuses a LIKE pattern over 50 bytes; a search is up to 100 characters.
    const search = async (q: string) => {
      const response = await request.get(`${api}?q=${encodeURIComponent(q)}`);
      expect(response.status(), `${q.length} characters`).toBe(200);
      return ((await response.json()) as Body).items.map((i: Body) => i.data.title);
    };
    expect(await search(`${title} ${note}`.toUpperCase())).toEqual([title]);
    expect(await search('a'.repeat(100))).toEqual([]);
  });

  test('a write without the admin header or from another origin is refused', async ({ request, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const api = `/admin/api/collections/${collection}`;
    await signIn(request, baseURL!);
    const data = { data: { title: 'Forged' }, publish: true };
    const good = writeHeaders(baseURL!);
    expect((await request.post(api, { headers: { ...good, Origin: 'https://evil.example' }, data })).status()).toBe(403);
    expect((await request.post(api, { headers: { 'Content-Type': 'application/json', Origin: good.Origin }, data })).status()).toBe(403);
    expect((await request.post(api, { headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' }, data })).status()).toBe(403);
    expect(await publicTitles(request, collection)).toEqual([]);
  });
});
