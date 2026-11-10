// The browser script (src/telemetry.ts) posts to the site's own /api/event;
// `vite preview` answers it 204 (vite.config.ts). Ported from
// wallabout-design/site tests/telemetry.spec.ts.
import { test, expect, type Page } from '@playwright/test';
import { guard } from './network';
import { ready } from './routes';

// Playwright can't read a beacon's body, so record what the script hands to
// sendBeacon, then read it back.
async function recordBeacons(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { beacons: { url: string; body: Blob }[] };
    w.beacons = [];
    const original = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, body) => {
      w.beacons.push({ url: String(url), body: body as Blob });
      return original(url, body);
    };
  });
  return async (): Promise<Record<string, unknown>[]> =>
    page.evaluate(async () => {
      const w = window as unknown as { beacons: { url: string; body: Blob }[] };
      return Promise.all(
        w.beacons.map(async (b): Promise<Record<string, unknown>> => ({ url: b.url, ...JSON.parse(await b.body.text()) })),
      );
    });
}

test('a page view is sent with the path, UTMs, width and build', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  const sent = await recordBeacons(page);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/?utm_source=news&utm_campaign=fall', { waitUntil: 'networkidle' });
  await expect.poll(async () => (await sent()).find((e) => e.type === 'pageview')).toBeTruthy();
  const view = (await sent()).find((e) => e.type === 'pageview')!;
  expect(view).toMatchObject({ url: '/api/event', path: '/', utm_source: 'news', utm_medium: '', utm_campaign: 'fall', width: 1024 });
  expect(view.build).toMatch(/^([0-9a-f]{7}|dev)$/);
});

test('engaged time is sent when the page is hidden', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  const sent = await recordBeacons(page);
  // Playwright's clock, so the test moves time on by itself and doesn't sleep.
  await page.clock.install();
  await page.goto('/', { waitUntil: 'networkidle' });
  await ready(page);
  await page.clock.fastForward(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await sent()).find((e) => e.type === 'engage')).toBeTruthy();
  expect((await sent()).find((e) => e.type === 'engage')!.value).toBeGreaterThan(0);
});

// The app keeps its trail and verdicts in localStorage; telemetry adds no
// cookies and no storage of its own.
test('telemetry sets no cookies and no storage of its own', async ({ page, context, baseURL }) => {
  await guard(page, baseURL!);
  await page.goto('/', { waitUntil: 'networkidle' });
  await ready(page);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((k) => !k.startsWith('segue.'))).toEqual([]);
});
