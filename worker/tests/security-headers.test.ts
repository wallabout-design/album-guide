// Keeps third-parties.json, worker/security-headers.ts and public/_headers in
// step, and checks every kind of Worker response carries the headers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import thirdParties from '../../third-parties.json' with { type: 'json' };
import worker, { type Env } from '../index';
import { contentSecurityPolicy, SECURITY_HEADERS } from '../security-headers';

/** The headers public/_headers sets under `/*`. */
function staticHeaders(): Record<string, string> {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/_headers'), 'utf8');
  const block = text.split(/\n(?=\S)/).find((b) => b.startsWith('/*\n'));
  assert.ok(block, 'public/_headers has a /* block');
  const headers: Record<string, string> = {};
  for (const line of block.split('\n').slice(1)) {
    const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (m) headers[m[1]] = m[2].trim();
  }
  return headers;
}

test('public/_headers matches the Worker headers (copy the policy from here)', () => {
  const headers = staticHeaders();
  assert.equal(
    headers['Content-Security-Policy'],
    contentSecurityPolicy(),
    `public/_headers needs:\n  Content-Security-Policy: ${contentSecurityPolicy()}`,
  );
  assert.deepEqual(headers, SECURITY_HEADERS);
});

test('every host in third-parties.json is in the policy under its directive', () => {
  const policy = new Map(
    contentSecurityPolicy()
      .split('; ')
      .map((d) => {
        const [name, ...sources] = d.split(' ');
        return [name, sources] as const;
      }),
  );
  for (const entry of thirdParties.entries) {
    for (const [directive, hosts] of Object.entries(entry.csp)) {
      for (const host of hosts) assert.ok(policy.get(directive)?.includes(host), `${entry.id}: ${directive} ${host}`);
    }
  }
});

test('the policy keeps scripts to this origin and blocks framing', () => {
  const csp = contentSecurityPolicy();
  assert.match(csp, /(^|; )script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

const env: Env = {
  ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher,
};

for (const [name, request] of [
  ['a page from ASSETS', new Request('https://album.guide/')],
  ['the www redirect', new Request('https://www.album.guide/')],
  ['an unknown /api/* path', new Request('https://album.guide/api/nope')],
  ['the telemetry beacon', new Request('https://album.guide/api/event', { method: 'POST', body: 'x' })],
] as const) {
  test(`${name} carries the security headers`, async () => {
    const res = await worker.fetch(request, env);
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(res.headers.get(header), value, `${name}: ${header}`);
    }
  });
}
