import { deflateSync, crc32 } from 'node:zlib';
import type { Page } from '@playwright/test';

/*
 * The only hosts the page may talk to besides itself. Each one is mocked here,
 * so the tests never reach the network and every run sees the same thing:
 *
 * - album-guide-api.fly.dev, the catalog API. It answers "nothing to add" to
 *   every call, which is the path the app takes when the API is down: the
 *   bundled catalog (src/data/catalog.json) carries on alone (src/data/api.ts).
 * - coverartarchive.org and archive.org, where the cover art lives. Each cover
 *   is the same plain grey square, so screenshots don't depend on the archive.
 *
 * Any other host is aborted and reported as unexpected.
 */
export const API_HOST = 'album-guide-api.fly.dev';
const IMAGE_HOSTS = ['coverartarchive.org', 'archive.org'];

const matches = (host: string, allowed: string) => host === allowed || host.endsWith(`.${allowed}`);

/** What the API sends when it has nothing to offer, per endpoint. */
const API_EMPTY: Record<string, unknown> = {
  '/v1/items': { items: [] },
  '/v1/recs': { offers: [] },
  '/v1/random': { item: null },
  '/v1/search': { items: [] },
};

/** A 64px grey square, as a PNG. */
function greyPng(size = 64, value = 0x6b): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 0, 0, 0, 0], 8); // 8-bit greyscale
  const rows = Buffer.alloc((size + 1) * size, value);
  for (let y = 0; y < size; y++) rows[y * (size + 1)] = 0; // filter byte per row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const COVER = greyPng();

/**
 * Mocks the allowed hosts and records console errors, page errors and every
 * request that would have left the local server for anywhere else.
 */
export async function guard(page: Page, baseURL: string) {
  const errors: string[] = [];
  const unexpected: string[] = [];
  const unmockedApi: string[] = [];
  const api: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  /*
   * Telemetry beacons get the 204 the Worker gives. `wrangler dev` loses
   * beacon bodies from several WebKit pages at once ("Network connection lost"
   * in its local proxy, then a 400), which production does not do. The
   * endpoint itself is covered by `npm run test:worker`, and what the page
   * sends by e2e/telemetry.spec.ts.
   */
  await page.route('**/api/event', (route) => route.fulfill({ status: 204 }));

  // Other hosts only: intercepting the site's own requests would change them
  // (WebKit drops a request's body when it is continued).
  const local = new URL(baseURL).host;
  await page.route((url) => url.host !== local, async (route) => {
    const raw = route.request().url();
    const url = new URL(raw);
    if (url.hostname === API_HOST) {
      api.push(raw);
      const body = API_EMPTY[url.pathname];
      if (body === undefined) unmockedApi.push(raw);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body ?? {}),
      });
    }
    if (IMAGE_HOSTS.some((h) => matches(url.hostname, h))) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: COVER,
      });
    }
    unexpected.push(raw);
    return route.abort('blockedbyclient');
  });

  return { errors, unexpected, unmockedApi, api };
}

/**
 * Seeds the clock so the first album is the same on every run (App.tsx picks
 * it from Date.now()), and turns motion off.
 */
export async function steady(page: Page, colorScheme: 'light' | 'dark' = 'dark') {
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z'));
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
}
