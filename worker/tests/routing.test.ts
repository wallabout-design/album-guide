// How worker/index.ts splits requests now that it runs first for all of them:
// www redirects, /api/* is routed, everything else goes to ASSETS unchanged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type Env } from '../index';

function envWithAssets() {
  const seen: string[] = [];
  const env: Env = {
    ASSETS: {
      fetch: async (request: Request) => {
        seen.push(request.url);
        return new Response('asset');
      },
    } as unknown as Fetcher,
  };
  return { env, seen };
}

test('www.album.guide redirects 301 to album.guide with path and query', async () => {
  const { env, seen } = envWithAssets();
  const res = await worker.fetch(new Request('https://www.album.guide/some/path?x=1&y=2'), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://album.guide/some/path?x=1&y=2');
  assert.equal(seen.length, 0);
});

test('http://www goes straight to https://album.guide', async () => {
  const { env } = envWithAssets();
  const res = await worker.fetch(new Request('http://www.album.guide/?q=a'), env);
  assert.equal(res.headers.get('location'), 'https://album.guide/?q=a');
});

test('www /api/* redirects too, rather than running the API on www', async () => {
  const { env } = envWithAssets();
  const res = await worker.fetch(new Request('https://www.album.guide/api/event', { method: 'POST', body: '{}' }), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://album.guide/api/event');
});

test('pages and files on the apex go to ASSETS', async () => {
  const { env, seen } = envWithAssets();
  for (const path of ['/', '/favicon.svg', '/no-such-page', '/apiary']) {
    const res = await worker.fetch(new Request(`https://album.guide${path}`), env);
    assert.equal(await res.text(), 'asset', path);
  }
  assert.deepEqual(seen, ['/', '/favicon.svg', '/no-such-page', '/apiary'].map((p) => `https://album.guide${p}`));
});

test('preview hosts are served, not redirected', async () => {
  const { env, seen } = envWithAssets();
  const res = await worker.fetch(new Request('https://feat-x-album-guide-site.jj-23b.workers.dev/'), env);
  assert.equal(res.status, 200);
  assert.equal(seen.length, 1);
});

test('an unknown /api/* path is a JSON 404, not an asset', async () => {
  const { env, seen } = envWithAssets();
  const res = await worker.fetch(new Request('https://album.guide/api/nope'), env);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not found' });
  assert.equal(seen.length, 0);
});
