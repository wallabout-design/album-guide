import { test, expect } from '@playwright/test';
import { guard, steady } from './network';

/*
 * The public /picks page against the built Worker and the seeded local
 * database (scripts/seed-preview.sql): 23 published picks, two drafts ("The
 * Wall", "[Led Zeppelin IV]") and one removed ("OK Computer"). Cover art is
 * mocked (e2e/network.ts). e2e/site.spec.ts also runs its checks on this view
 * (status, headers, console, hosts, axe, widths): see e2e/routes.ts.
 */
test('the page lists published picks 12 at a time, and "Show more picks" brings the rest', async ({ page, baseURL }) => {
  const seen = await guard(page, baseURL!);
  await steady(page);
  await page.goto('/picks');
  await expect(page.getByRole('heading', { level: 1, name: 'Staff picks' })).toBeVisible();
  const picks = page.locator('.pick');
  await expect(picks).toHaveCount(12);
  await expect(picks.first().getByRole('heading', { level: 2 })).toHaveText('Malleable Monsters');
  await expect(picks.first()).toContainText('Kid Indigo, 2015');
  await expect(picks.first()).toContainText('Preview data, not a real pick. Entry 1 of the seeded list.');

  await page.getByRole('button', { name: 'Show more picks' }).click();
  await expect(picks).toHaveCount(23);
  await expect(page.getByRole('button', { name: 'Show more picks' })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('That is all 23 of them.');

  // No pick appears twice, and nothing unpublished or removed appears at all.
  const titles = await picks.getByRole('heading', { level: 2 }).allTextContents();
  expect(new Set(titles).size).toBe(23);
  for (const hidden of ['The Wall', '[Led Zeppelin IV]', 'OK Computer']) expect(titles).not.toContain(hidden);

  expect(seen.errors).toEqual([]);
  expect(seen.unexpected).toEqual([]);
});

test('a pick shows what staff entered: its kind, a link, and a larger cover when featured', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  await steady(page);
  await page.goto('/picks');
  const picks = page.locator('.pick');
  await expect(picks).toHaveCount(12);
  // seed-01 is featured; seed-02 has a kind; seed-03 has a link.
  await expect(picks.nth(0)).toHaveClass(/pick--featured/);
  await expect(picks.nth(1)).not.toHaveClass(/pick--featured/);
  await expect(picks.nth(1).locator('.pick__kind')).toHaveText('Deep cut');
  const link = picks.nth(2).getByRole('link', { name: /^Read more about / });
  await expect(link).toHaveAttribute('href', /^https:\/\/musicbrainz\.org\/release-group\//);
  // Covers come from the Cover Art Archive by the pick's MusicBrainz id.
  await expect(picks.nth(0).locator('img')).toHaveAttribute('src', 'https://coverartarchive.org/release-group/9d532998-3e5c-4e2c-a3d5-ee41ce7250ff/front-250');
});

test('with no picks the page says so instead of showing an empty list', async ({ page, baseURL }) => {
  const seen = await guard(page, baseURL!);
  await steady(page);
  await page.route('**/api/collections/picks*', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.goto('/picks');
  await expect(page.getByRole('status')).toHaveText('There are no picks yet. Come back soon.');
  await expect(page.locator('.pick')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show more picks' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Find an album of your own on album.guide' })).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('when the list cannot be loaded the page says so and "Try again" recovers', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  await steady(page);
  let down = true;
  await page.route('**/api/collections/picks*', (route) => (down ? route.fulfill({ status: 503, json: { error: 'x' } }) : route.continue()));
  await page.goto('/picks');
  await expect(page.getByRole('alert')).toContainText('The picks could not be loaded.');
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.pick')).toHaveCount(12);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failure on a later page keeps what is already shown', async ({ page, baseURL }) => {
  await guard(page, baseURL!);
  await steady(page);
  let down = false;
  await page.route('**/api/collections/picks?cursor=*', (route) => (down ? route.fulfill({ status: 503, json: { error: 'x' } }) : route.continue()));
  await page.goto('/picks');
  const picks = page.locator('.pick');
  await expect(picks).toHaveCount(12);
  down = true;
  await page.getByRole('button', { name: 'Show more picks' }).click();
  await expect(page.getByRole('alert')).toContainText('The picks could not be loaded.');
  await expect(picks).toHaveCount(12);
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(picks).toHaveCount(23);
});

test('the page is in the sitemap, and its script does not carry the catalog', async ({ page, request }) => {
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://album.guide/picks</loc>');
  // Every script the page asks for, read to the end before adding up.
  const scripts: Promise<number>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response.body().then((body) => body.length));
  });
  await page.goto('/picks');
  await expect(page.locator('.pick')).toHaveCount(12);
  const bytes = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0);
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(600_000);
});
