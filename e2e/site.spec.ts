import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { guard, steady } from './network';
import { themes, views, widths } from './routes';

for (const view of views) {
  test.describe(`view ${view.name}`, () => {
    test('returns 200, with no console errors and no unexpected hosts', async ({ page, baseURL }) => {
      const seen = await guard(page, baseURL!);
      await steady(page);
      const response = await page.goto(view.path, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      await view.open?.(page);
      await page.waitForLoadState('networkidle');
      expect(seen.errors).toEqual([]);
      expect(seen.unexpected).toEqual([]);
      expect(seen.unmockedApi).toEqual([]);
      // The build points at the API (VITE_API_BASE), so the mock is what answered.
      if (view.name === 'home') expect(seen.api.length).toBeGreaterThan(0);
    });

    for (const theme of themes) {
      test(`passes axe in the ${theme} theme`, async ({ page, baseURL }) => {
        await guard(page, baseURL!);
        await steady(page, theme);
        await page.goto(view.path, { waitUntil: 'networkidle' });
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
