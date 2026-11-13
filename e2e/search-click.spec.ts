import { test, expect } from '@playwright/test';
import { guard, steady } from './network';
import { ready } from './routes';

/*
 * Issue #17: Playwright once reported "<html> intercepts pointer events" when
 * clicking the search trigger in WebKit while Cover Flow was showing. The other
 * specs open search from the keyboard; these two use a real pointer click, in
 * both engines, so a layer covering the trigger or a result row fails here.
 */

test('the search trigger takes a real click while Cover Flow is showing', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  await steady(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await ready(page);
  await page.locator('button.searchtrigger').click();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search the catalog' })).toBeFocused();
});

test('a MusicBrainz search row takes a real click', async ({ page, baseURL }) => {
  const seen = await guard(page, baseURL!);
  await steady(page);
  // Later routes win, so these answer before the guard's catch-all.
  const mbid = '00000000-0000-4000-8000-000000000001';
  await page.route('https://musicbrainz.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        'release-groups': [
          {
            id: mbid,
            title: 'Zzqxv Record',
            score: 100,
            'first-release-date': '1999-01-01',
            'artist-credit': [{ artist: { id: '00000000-0000-4000-8000-000000000002', name: 'Zzqxv Band' } }],
            tags: [],
          },
        ],
      }),
    }),
  );
  // Adding the album asks the Cover Art Archive for its art; the click is
  // proved by that request, and a 404 ends the add without touching the catalog.
  await page.route('https://coverartarchive.org/**', (route) =>
    route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto('/', { waitUntil: 'networkidle' });
  await ready(page);
  await page.locator('button.searchtrigger').click();
  // Nothing in the bundled catalog matches, so the search goes to MusicBrainz.
  await page.getByRole('textbox', { name: 'Search the catalog' }).fill('zzqxv');
  const row = page.locator('.search__row--remote').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const art = page.waitForRequest((r) => r.url() === `https://coverartarchive.org/release-group/${mbid}`);
  await row.click();
  await art;
  expect(seen.unexpected).toEqual([]);
});
