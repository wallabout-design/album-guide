import { test, expect, type Page, type Response } from '@playwright/test';
import thirdParties from '../third-parties.json' with { type: 'json' };
import { SECURITY_HEADERS } from '../worker/security-headers';
import { API_HOST } from './network';
import { ready } from './routes';

/*
 * Read-only checks against the live site (BASE_URL; see production-checks.yml).
 * Nothing is mocked: the page talks to the real API on Fly and the real cover
 * art, so this catches what only production has (DNS, the custom domain, the
 * Worker's routes and headers, a script Cloudflare injects at the edge). It
 * stays light: five page loads, one API call and one event per run. Every
 * request carries Sec-GPC: 1 (playwright.config.ts), so the telemetry route
 * counts none of it.
 */

// The hosts the page may use besides itself: every host in third-parties.json,
// the list the CSP is built from (worker/security-headers.ts).
type ThirdParty = { csp: Record<string, string[]> };
const ALLOWED_HOSTS = [
  ...new Set(
    (thirdParties.entries as ThirdParty[])
      .flatMap((e) => Object.values(e.csp).flat())
      .map((src) => new URL(src.replace('*.', '')).hostname),
  ),
];
const allowed = (host: string) => ALLOWED_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));

/*
 * Known production conditions, each allowed by name and nothing wider:
 *
 * - RUM_BEACON: Cloudflare injects its Web Analytics beacon into every page on
 *   album.guide, and the CSP blocks it, which logs one CSP error per load.
 *   Turning it off is JJ's step (docs/open-items.md); remove this allowance then.
 * - API 5xx: the API sometimes answers /v1/recs with a 500, and the app falls
 *   back to the bundled catalog, as it is built to. The browser logs the failed
 *   request. Whether the API is up is checked on its own, below.
 */
const RUM_BEACON = 'static.cloudflareinsights.com';
const isRumBeaconBlocked = (text: string) => text.includes('Content Security Policy') && text.includes(RUM_BEACON);
const isApi5xx = (text: string, source: string) =>
  /status of 5\d\d/.test(text) && source !== '' && new URL(source).hostname === API_HOST;

/** Console errors, page errors, and requests to hosts the site doesn't use, less the allowances above. */
function watch(page: Page, baseURL: string) {
  const errors: string[] = [];
  const external: string[] = [];
  const local = new URL(baseURL).host;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isRumBeaconBlocked(text) || isApi5xx(text, msg.location().url ?? '')) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('request', (req) => {
    const url = new URL(req.url().replace(/^blob:/, ''));
    if (url.host === local || url.protocol === 'data:' || url.hostname === RUM_BEACON) return;
    if (!allowed(url.hostname)) external.push(req.url());
  });
  return { errors, external };
}

/** Every header the Worker sets (worker/security-headers.ts), with its exact value. */
function expectSecurityHeaders(headers: Record<string, string> | undefined) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers?.[name.toLowerCase()], name).toBe(value);
  }
}

test('/ renders an album with no console errors and no other hosts', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expectSecurityHeaders(response?.headers());
  await ready(page);
  expect(seen.errors).toEqual([]);
  expect(seen.external).toEqual([]);
});

test('the API answers the page with an album', async ({ page }) => {
  await page.goto('/robots.txt');
  // From album.guide, so CORS and the CSP's connect-src are checked too.
  // /v1/random is the API's simplest read; up to three tries over about 20
  // seconds, so one slow answer from a Fly machine waking up isn't an outage.
  await expect(async () => {
    const result = await page.evaluate(async (api) => {
      const res = await fetch(`https://${api}/v1/random?seed=production-check`);
      const body = (await res.json().catch(() => null)) as { item?: { title?: string } } | null;
      return { status: res.status, title: body?.item?.title ?? '' };
    }, API_HOST);
    expect(result.status).toBe(200);
    expect(result.title).not.toBe('');
  }).toPass({ intervals: [5_000, 10_000], timeout: 30_000 });
});

test('an unknown path gets the 404 page with status 404', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  const response = await page.goto('/nope/deep', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(404);
  expectSecurityHeaders(response?.headers());
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The browser logs the page's own 404 (with no status text over HTTP/2), and nothing else may.
  expect(seen.errors.filter((e) => !/^Failed to load resource: the server responded with a status of 404 \(/.test(e))).toEqual([]);
  expect(seen.external).toEqual([]);
});

for (const file of ['/robots.txt', '/sitemap.xml']) {
  test(`${file} is served`, async ({ page }) => {
    const response = await page.goto(file);
    expect(response?.status()).toBe(200);
    expectSecurityHeaders(response?.headers());
    expect(await response?.text()).toContain('https://album.guide/');
  });
}

test('www.album.guide redirects to album.guide with a 301', async ({ page, baseURL }) => {
  test.skip(new URL(baseURL!).hostname !== 'album.guide', 'only album.guide has a www name');
  const response = await page.goto('https://www.album.guide/?from=check');
  const redirect: Response | null | undefined = await response?.request().redirectedFrom()?.response();
  expect(redirect?.status()).toBe(301);
  expect(redirect?.headers().location).toBe('https://album.guide/?from=check');
  expect(response?.url()).toBe('https://album.guide/?from=check');
  expect(response?.status()).toBe(200);
});

test('POST /api/event from the page answers 204', async ({ page }) => {
  await page.goto('/robots.txt');
  // Same origin, as the page's own beacon is; Sec-GPC: 1 means nothing is written.
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'pageview', path: '/', referrer: '', width: 1280 }),
    });
    return { status: res.status, headers: Object.fromEntries(res.headers) };
  });
  expect(result.status).toBe(204);
  expectSecurityHeaders(result.headers);
});
