import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SECURITY_HEADERS } from '../worker/security-headers';
import { guard, steady } from './network';
import { ready, themes, views, widths } from './routes';

for (const view of views) {
  test.describe(`view ${view.name}`, () => {
    test('returns 200, with no console errors and no unexpected hosts', async ({ page, baseURL }) => {
      const seen = await guard(page, baseURL!);
      await steady(page);
      const response = await page.goto(view.path, { waitUntil: 'networkidle' });
      const status = view.status ?? 200;
      expect(response?.status()).toBe(status);
      // The CSP and the rest are enforced here too, so a blocked host fails as a console error.
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response?.headers()[name.toLowerCase()], name).toBe(value);
      }
      await (view.ready ?? ready)(page);
      await view.open?.(page);
      await page.waitForLoadState('networkidle');
      // A 404 page logs its own status as a console error, and nothing else may.
      const expected = status === 404 ? ['Failed to load resource: the server responded with a status of 404 (Not Found)'] : [];
      expect(seen.errors.filter((e) => !expected.includes(e))).toEqual([]);
      expect(seen.unexpected).toEqual([]);
      expect(seen.unmockedApi).toEqual([]);
      // The build points at the API (VITE_API_BASE), so the mock is what answered.
      if (view.name === 'home') await expect.poll(() => seen.api.length).toBeGreaterThan(0);
    });

    for (const theme of themes) {
      test(`passes axe in the ${theme} theme`, async ({ page, baseURL }) => {
        await guard(page, baseURL!);
        await steady(page, theme);
        await page.goto(view.path, { waitUntil: 'networkidle' });
        await (view.ready ?? ready)(page);
        await view.open?.(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        // Rule, impact and the elements it failed on: the whole result is too long to read in a log.
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        expect(summary).toEqual([]);
      });
    }

    for (const width of widths) {
      test(`has no horizontal scroll at ${width}px`, async ({ page, baseURL }) => {
        await guard(page, baseURL!);
        await steady(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(view.path, { waitUntil: 'networkidle' });
        await (view.ready ?? ready)(page);
        await view.open?.(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

// The page must still work when the API is unreachable: the bundled catalog is the fallback.
test('falls back to the bundled catalog when the API is down', async ({ page, baseURL }) => {
  const seen = await guard(page, baseURL!);
  await steady(page);
  await page.route('https://album-guide-api.fly.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' }),
  );
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.plate__title')).not.toBeEmpty();
  await expect(page.locator('.case').first()).toBeVisible();
  expect(seen.errors).toEqual([]);
  expect(seen.unexpected).toEqual([]);
});

test('robots.txt and sitemap.xml are served', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://album.guide/sitemap.xml');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('<loc>https://album.guide/</loc>');
});
