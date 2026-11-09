import { test, expect, type Page } from '@playwright/test';
import { API_HOST } from './network';
import { ready } from './routes';

/*
 * Read-only checks against the live site (BASE_URL; see production-checks.yml).
 * Nothing is mocked: the page talks to the real API on Fly and the real cover
 * art, so this catches what only production has (DNS, the custom domain, the
 * Worker's routes, a script Cloudflare injects at the edge). It stays light:
 * five page loads and one event per run. Every request carries Sec-GPC: 1
 * (playwright.config.ts), so the telemetry route counts none of it.
 */

// The hosts the page may use besides itself: the API, and the cover art on the
// Cover Art Archive and archive.org (as in e2e/network.ts).
const ALLOWED_HOSTS = [API_HOST, 'coverartarchive.org', 'archive.org'];
const allowed = (host: string) => ALLOWED_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));

/** Console errors, page errors, requests to hosts the site doesn't use, and the API's answers. */
function watch(page: Page, baseURL: string) {
  const errors: string[] = [];
  const external: string[] = [];
  const api: number[] = [];
  const local = new URL(baseURL).host;
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('request', (req) => {
    const url = new URL(req.url().replace(/^blob:/, ''));
    if (url.host === local || url.protocol === 'data:') return;
    if (!allowed(url.hostname)) external.push(req.url());
  });
  page.on('response', (res) => {
    if (new URL(res.url()).hostname === API_HOST) api.push(res.status());
  });
  return { errors, external, api };
}

test('/ renders an album, with the API answering and no console errors', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await ready(page);
  // The bundled catalog renders even with the API down, so check the API itself.
  await expect.poll(() => seen.api.length, { message: 'a request to the API' }).toBeGreaterThan(0);
  expect(seen.api.filter((status) => status !== 200)).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.external).toEqual([]);
});

test('an unknown path gets the 404 page with status 404', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  const response = await page.goto('/nope/deep', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The browser logs the page's own 404, and nothing else may.
  expect(seen.errors.filter((e) => !e.includes('status of 404'))).toEqual([]);
  expect(seen.external).toEqual([]);
});

for (const file of ['/robots.txt', '/sitemap.xml']) {
  test(`${file} is served`, async ({ page }) => {
    const response = await page.goto(file);
    expect(response?.status()).toBe(200);
    expect(await response?.text()).toContain('https://album.guide/');
  });
}

test('www.album.guide redirects to album.guide with a 301', async ({ page, baseURL }) => {
  const apex = new URL(baseURL!);
  test.skip(apex.hostname !== 'album.guide', 'only album.guide has a www name');
  const response = await page.goto(`https://www.album.guide/?from=check`);
  const redirect = response?.request().redirectedFrom()?.response();
  expect(await redirect).toBeTruthy();
  expect((await redirect)!.status()).toBe(301);
  expect((await redirect)!.headers().location).toBe('https://album.guide/?from=check');
  expect(response?.status()).toBe(200);
});

test('POST /api/event from the page answers 204', async ({ page }) => {
  await page.goto('/robots.txt');
  // Same origin, as the page's own beacon is; Sec-GPC: 1 means nothing is written.
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'pageview', path: '/', referrer: '', width: 1280 }),
    });
    return res.status;
  });
  expect(status).toBe(204);
});
