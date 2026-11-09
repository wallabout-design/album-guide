// POST /api/event (worker/index.ts), called directly with a fake Analytics
// Engine binding. No browser, no network. Copied from wallabout-design/site
// (tests/telemetry-worker.spec.ts), plus the missing-salt case this site
// ships with until TELEMETRY_SALT is set.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type Env } from '../index';
import { dataPoint, parseEvent, shouldDrop, visitorHash } from '../telemetry';

const safari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://album.guide/api/event', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'sec-fetch-site': 'same-origin', 'user-agent': safari, 'cf-connecting-ip': '203.0.113.9', ...headers },
  });
}

function fakeEnv(salt: { TELEMETRY_SALT?: string } = { TELEMETRY_SALT: 'salt' }) {
  const points: ReturnType<typeof dataPoint>[] = [];
  const env: Env = { EVENTS: { writeDataPoint: (p) => void points.push(p) }, ...salt };
  return { points, env };
}

const pageview = {
  type: 'pageview',
  path: '/?x=1',
  referrer: 'https://www.google.com/search',
  utm_source: 'news',
  width: 390,
  build: 'abc1234',
};

test('a page view is written in the standard layout', async () => {
  const { points, env } = fakeEnv();
  const res = await worker.fetch(post(pageview), env);
  assert.equal(res.status, 204);
  assert.equal(points.length, 1);
  const [p] = points;
  assert.deepEqual(p.indexes, ['album-guide']);
  assert.deepEqual(p.blobs.slice(0, 7), ['pageview', 'album.guide', '/', 'www.google.com', 'news', '', '']);
  assert.deepEqual(p.blobs.slice(10, 12), ['mobile', 'Safari']);
  assert.match(p.blobs[12], /^[0-9a-f]{16}$/);
  assert.deepEqual(p.blobs.slice(13), ['abc1234', '']);
  assert.deepEqual(p.doubles, [0, 390]);
});

test('engage and vital events carry their value', async () => {
  const { points, env } = fakeEnv();
  await worker.fetch(post({ type: 'engage', path: '/', value: 4200, width: 1280 }), env);
  await worker.fetch(post({ type: 'vital', name: 'LCP', path: '/', value: 812.5, width: 1280 }), env);
  assert.deepEqual(
    points.map((p) => [p.blobs[0], p.blobs[14], p.doubles[0]]),
    [
      ['engage', '', 4200],
      ['vital', 'LCP', 812.5],
    ],
  );
});

test('without TELEMETRY_SALT, nothing is written and the answer is still 204', async () => {
  for (const salt of [{}, { TELEMETRY_SALT: '' }]) {
    const { points, env } = fakeEnv(salt);
    assert.equal((await worker.fetch(post(pageview), env)).status, 204);
    assert.equal(points.length, 0);
  }
  // No bindings at all (local `wrangler dev` without the dataset).
  assert.equal((await worker.fetch(post(pageview), {})).status, 204);
});

test('cross-site, oversized and malformed requests are refused', async () => {
  const { points, env } = fakeEnv();
  assert.equal((await worker.fetch(post(pageview, { 'sec-fetch-site': 'cross-site' }), env)).status, 403);
  assert.equal((await worker.fetch(post(pageview, { 'content-length': '5000' }), env)).status, 413);
  assert.equal((await worker.fetch(post({ type: 'click', path: '/' }), env)).status, 400);
  assert.equal((await worker.fetch(post({ type: 'vital', name: 'FID', path: '/', value: 1 }), env)).status, 400);
  assert.equal(points.length, 0);
});

test('bots and Global Privacy Control are dropped with a 204', async () => {
  const { points, env } = fakeEnv();
  const googlebot = { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' };
  assert.equal((await worker.fetch(post(pageview, googlebot), env)).status, 204);
  assert.equal((await worker.fetch(post(pageview, { 'sec-gpc': '1' }), env)).status, 204);
  assert.equal(points.length, 0);
  assert.equal(shouldDrop('', null), true);
});

test('other /api paths and methods are a JSON 404', async () => {
  const { env } = fakeEnv();
  const other = await worker.fetch(new Request('https://album.guide/api/other'), env);
  assert.equal(other.status, 404);
  assert.deepEqual(await other.json(), { error: 'not found' });
  assert.equal((await worker.fetch(new Request('https://album.guide/api/event'), env)).status, 404);
});

test('the build is kept only when it looks like a short SHA', () => {
  assert.equal(parseEvent(JSON.stringify({ ...pageview, build: 'abc1234' }))?.build, 'abc1234');
  assert.equal(parseEvent(JSON.stringify({ ...pageview, build: 'dev' }))?.build, '');
  assert.equal(parseEvent(JSON.stringify({ ...pageview, build: 42 }))?.build, '');
});

test('the visitor hash changes every day', async () => {
  const a = await visitorHash('s', new Date('2026-11-03T23:00:00Z'), '1.2.3.4', 'ua');
  const b = await visitorHash('s', new Date('2026-11-04T01:00:00Z'), '1.2.3.4', 'ua');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, b);
});
