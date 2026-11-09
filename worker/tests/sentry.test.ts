// POST /api/sentry (worker/sentry.ts), called through the Worker with `fetch`
// stubbed, so no envelope leaves the machine. Checks that only this project's
// DSN is forwarded, and only from the site's own pages.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker, { type Env } from '../index';
import { MAX_ENVELOPE_BYTES } from '../sentry';
import { SENTRY_DSN } from '../../src/sentry-config';

const INGEST = 'https://o4512364766560256.ingest.us.sentry.io/api/4512399984951296/envelope/';

let forwarded: { url: string; body: string }[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  forwarded = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? await new Response(init.body).text() : '';
    forwarded.push({ url: String(input), body });
    return new Response('{"id":"abc"}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function envelope(dsn: string): string {
  return [
    JSON.stringify({ event_id: '0123456789abcdef0123456789abcdef', dsn, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message: 'test' }),
  ].join('\n');
}

function post(body: string, headers: Record<string, string> = {}, path = '/api/sentry') {
  return new Request(`https://album.guide${path}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      'content-length': String(new TextEncoder().encode(body).length),
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  });
}

// No telemetry bindings; ASSETS is never reached for /api/* requests.
const env: Env = { ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher };

test("this project's envelope is forwarded to its Sentry ingest URL", async () => {
  const body = envelope(SENTRY_DSN);
  const res = await worker.fetch(post(body), env);
  assert.equal(res.status, 200);
  assert.equal(forwarded.length, 1);
  assert.ok(forwarded[0].url.startsWith(INGEST), forwarded[0].url);
  assert.equal(forwarded[0].body, body);
});

test("another project's DSN on the same host is refused", async () => {
  const other = SENTRY_DSN.replace(/\/\d+$/, '/4512364811059200');
  const res = await worker.fetch(post(envelope(other)), env);
  assert.equal(res.status, 403);
  assert.equal(forwarded.length, 0);
});

test('the same project id on another host is refused', async () => {
  const other = SENTRY_DSN.replace('o4512364766560256.ingest.us.sentry.io', 'evil.example');
  const res = await worker.fetch(post(envelope(other)), env);
  assert.equal(res.status, 403);
  assert.equal(forwarded.length, 0);
});

test('a cross-site post is refused before reading the envelope', async () => {
  const res = await worker.fetch(post(envelope(SENTRY_DSN), { 'sec-fetch-site': 'cross-site' }), env);
  assert.equal(res.status, 403);
  assert.equal(forwarded.length, 0);
});

test('an oversized envelope is refused', async () => {
  const res = await worker.fetch(
    post(envelope(SENTRY_DSN), { 'content-length': String(MAX_ENVELOPE_BYTES + 1) }),
    env,
  );
  assert.equal(res.status, 413);
  assert.equal(forwarded.length, 0);
});

test('a body that is not an envelope is refused', async () => {
  const res = await worker.fetch(post('not json\n{}'), env);
  assert.equal(res.status, 400);
  assert.equal(forwarded.length, 0);
});

test('GET /api/sentry is a 404, like any unknown route', async () => {
  const res = await worker.fetch(new Request('https://album.guide/api/sentry'), env);
  assert.equal(res.status, 404);
  assert.equal(forwarded.length, 0);
});
