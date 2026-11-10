import { test, expect, type APIRequestContext } from '@playwright/test';
import { SECURITY_HEADERS } from '../worker/security-headers';

/*
 * The public list of a collection, GET /api/collections/<name>, asked from
 * outside against the built Worker and a local D1 holding the migration and
 * scripts/seed-preview.sql: 26 seeded picks, of which 23 are published, two
 * (seed-07, seed-19) are drafts and one (seed-11) was removed. No test writes
 * to `picks`, so these numbers hold whatever else runs.
 */
type List = { items: { id: string; data: Record<string, unknown>; updatedAt: string }[]; nextCursor: string | null };

const PUBLISHED = Array.from({ length: 26 }, (_, i) => `seed-${String(i + 1).padStart(2, '0')}`).filter(
  (id) => !['seed-07', 'seed-11', 'seed-19'].includes(id),
);

async function list(request: APIRequestContext, query = ''): Promise<List> {
  const response = await request.get(`/api/collections/picks${query}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as List;
}

test('the first page is 12 published picks in order, with cache and security headers', async ({ request }) => {
  const response = await request.get('/api/collections/picks');
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['content-type']).toBe('application/json');
  expect(headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
  expect(headers['etag']).toMatch(/^W\/"[0-9a-f]{24}"$/);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(headers[name.toLowerCase()], name).toBe(value);
  const body = (await response.json()) as List;
  expect(body.items.map((i) => i.id)).toEqual(PUBLISHED.slice(0, 12));
  expect(body.nextCursor).toBeTruthy();
});

test('following the cursor reaches every published pick once, and no draft or removed one', async ({ request }) => {
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: List = await list(request, cursor ? `?cursor=${cursor}` : '');
    seen.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  expect(pages).toBe(2);
  expect(seen).toEqual(PUBLISHED);
});

test('nothing about staff is in the public list', async ({ request }) => {
  const response = await request.get('/api/collections/picks?limit=50');
  const text = await response.text();
  expect(text).not.toContain('seed@example.com');
  expect(text).not.toContain('updatedBy');
  expect(Object.keys((JSON.parse(text) as List).items[0]).sort()).toEqual(['data', 'id', 'updatedAt']);
});

test('the limit is clamped: a huge one gives at most 50, a small one is honoured', async ({ request }) => {
  expect((await list(request, '?limit=9999')).items).toHaveLength(PUBLISHED.length);
  expect((await list(request, '?limit=5')).items.map((i) => i.id)).toEqual(PUBLISHED.slice(0, 5));
  expect((await list(request, '?limit=abc')).items).toHaveLength(12);
});

test('an unchanged list revalidates with a 304', async ({ request }) => {
  const first = await request.get('/api/collections/picks');
  const again = await request.get('/api/collections/picks', { headers: { 'If-None-Match': first.headers()['etag'] } });
  expect(again.status()).toBe(304);
});

test('a bad cursor, an unknown collection and a write are refused', async ({ request }) => {
  const bad = await request.get('/api/collections/picks?cursor=nonsense');
  expect(bad.status()).toBe(400);
  expect(bad.headers()['cache-control']).toBe('no-store');
  expect((await request.get('/api/collections/nope')).status()).toBe(404);
  for (const method of ['post', 'put', 'delete'] as const) {
    const response = await request[method]('/api/collections/picks', { data: { title: 'x' } });
    expect(response.status(), method).toBe(404);
  }
  expect((await list(request, '?limit=50')).items).toHaveLength(PUBLISHED.length);
});
