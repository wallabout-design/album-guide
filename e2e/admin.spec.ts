import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CODE, publicTitles, scratch, signIn, STAFF_EMAIL, writeHeaders } from './admin';

/*
 * The admin page in a browser, against the built Worker. Signed out there is
 * no app to see. Signed in (the preview's fixed code), a member of staff adds,
 * edits, shows, hides, reorders, removes and restores a record using only what
 * is on the screen, and each step is checked on the public list as well.
 *
 * Writing tests each use their own scratch collection (e2e/admin.ts), with one
 * field of every type. Tests on the seeded picks only read. Nothing here
 * waits for a fixed time: every step waits for what the page shows next.
 */

/** Signs the browser in without the form, and opens a collection's list. */
async function open(page: Page, baseURL: string, collection: string) {
  await signIn(page.request, baseURL);
  await page.goto(`/admin#/${collection}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('signed out', () => {
  test('/admin shows a staff-only page: no app, no records, a 403', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Staff only' })).toBeVisible();
    await expect(page.locator('#admin')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.getByText('Malleable Monsters')).toHaveCount(0);
  });

  test('the preview code signs in through the form, and a wrong one does not', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Preview code').fill('not the code');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('That code is not right. Please try again.');
    await expect(page.locator('#admin')).toHaveCount(0);

    await page.getByLabel('Preview code').fill(CODE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(`Signed in as ${STAFF_EMAIL}`)).toBeVisible();
    // One collection, so the admin opens straight on it.
    await expect(page.getByRole('heading', { level: 1, name: 'Staff picks' })).toBeVisible();
  });
});

test.describe('signed in, reading the seeded picks', () => {
  test('the list shows drafts too, pages with "Show more", and never the removed pick', async ({ page, baseURL }) => {
    await open(page, baseURL!, 'picks');
    const rows = page.getByRole('list', { name: 'Staff picks' }).getByRole('listitem');
    await expect(rows).toHaveCount(20);
    await expect(page.getByText('25 of 200 places used')).toBeVisible();
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(rows).toHaveCount(25);
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Draft, not on the site' })).toHaveCount(2);
    await expect(rows.filter({ has: page.getByText('On the site', { exact: true }) })).toHaveCount(23);
  });

  test('search narrows the list, says so when nothing matches, and can be cleared', async ({ page, baseURL }) => {
    await open(page, baseURL!, 'picks');
    const rows = page.getByRole('list', { name: 'Staff picks' }).getByRole('listitem');
    await page.getByRole('searchbox').fill('abbey road');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Abbey Road');
    // Reordering makes no sense inside a search.
    await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);

    await page.getByRole('searchbox').fill('zzz no such album');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('Nothing matches “zzz no such album”.')).toBeVisible();

    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(rows).toHaveCount(20);
  });

  test('the removed pick is listed under what was removed', async ({ page, baseURL }) => {
    await open(page, baseURL!, 'picks');
    await page.getByRole('link', { name: 'See what was removed' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Removed from Staff picks' })).toBeVisible();
    const rows = page.getByRole('list', { name: 'Removed entries' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole('button', { name: /^Bring back: / })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the list and the form pass axe in the ${theme} theme`, async ({ page, baseURL }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await open(page, baseURL!, 'picks');
      await expect(page.getByRole('list', { name: 'Staff picks' })).toBeVisible();
      expect(await axe(page)).toEqual([]);

      await page.getByRole('link', { name: 'Add a pick' }).click();
      await page.getByRole('button', { name: 'Save as a draft' }).click();
      await expect(page.getByRole('alert')).toContainText('things need fixing below');
      expect(await axe(page)).toEqual([]);

      await page.goto('/admin#/picks/seed-01');
      await expect(page.getByRole('heading', { name: 'Earlier versions' })).toHaveCount(0);
      await expect(page.getByLabel('Album title')).toHaveValue('Malleable Monsters');
      expect(await axe(page)).toEqual([]);
    });
  }

  for (const width of [360, 768, 1440]) {
    test(`the list and the form have no horizontal scroll at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, baseURL!, 'picks');
      await expect(page.getByRole('list', { name: 'Staff picks' })).toBeVisible();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.goto('/admin#/picks/seed-01');
      await expect(page.getByLabel('Album title')).toHaveValue('Malleable Monsters');
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('signed in, writing to a scratch collection', () => {
  test('add, edit, show, hide, remove and undo, using only the screen', async ({ page, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    await open(page, baseURL!, collection);
    await expect(page.getByText('There is nothing here yet.')).toBeVisible();

    // Add: an empty form is refused in plain words, with the cursor in the first field to fix.
    await page.getByRole('link', { name: 'Add a thing' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Add a thing' })).toBeVisible();
    await page.getByRole('button', { name: 'Save and show on the site' }).click();
    await expect(page.getByRole('alert')).toHaveText('One thing needs fixing below.');
    await expect(page.getByText('Title is needed.')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeFocused();

    // Every kind of field, two of them wrong.
    await page.getByLabel('Title').fill('First words');
    await page.getByLabel('Note').fill('Line one\nLine two');
    await page.getByLabel('Link').fill('example.com');
    await page.getByLabel('Year').fill('12');
    await page.getByLabel('Day').fill('2026-03-14');
    await page.getByLabel('Featured').check();
    await page.getByLabel('Kind').selectOption({ label: 'Beta' });
    await page.getByLabel('Reference').fill('0123abcd');
    await page.getByRole('button', { name: 'Save and show on the site' }).click();
    await expect(page.getByRole('alert')).toHaveText('2 things need fixing below.');
    await expect(page.getByText('Link must be a full web address, starting with https://.')).toBeVisible();
    await expect(page.getByText('Year must be from 1900 to 2100.')).toBeVisible();
    expect(await publicTitles(page.request, collection)).toEqual([]);

    await page.getByLabel('Link').fill('https://example.com/a');
    await page.getByLabel('Year').fill('1991');
    await page.getByRole('button', { name: 'Save and show on the site' }).click();

    // Back on the list, told what happened, and it is public.
    const rows = page.getByRole('list', { name: 'Things' }).getByRole('listitem');
    await expect(page.getByRole('status')).toContainText('Added “First words”. It is on the site now.');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('On the site');
    await expect(rows).toContainText(`by ${STAFF_EMAIL}`);
    expect(await publicTitles(page.request, collection)).toEqual(['First words']);
    const stored = (await (await page.request.get(`/api/collections/${collection}`)).json()) as { items: { data: unknown }[] };
    expect(stored.items[0].data).toEqual({
      title: 'First words',
      note: 'Line one\nLine two',
      link: 'https://example.com/a',
      year: 1991,
      day: '2026-03-14',
      featured: true,
      kind: 'b',
      ref: '0123abcd',
    });

    // Edit.
    await page.getByRole('link', { name: 'Edit: First words' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('First words');
    await expect(page.getByLabel('Featured')).toBeChecked();
    await page.getByLabel('Title').fill('Better words');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('Saved.');
    await expect(page.getByRole('heading', { level: 1, name: 'Edit “Better words”' })).toBeVisible();
    expect(await publicTitles(page.request, collection)).toEqual(['Better words']);

    // Hide and show, from the list.
    await page.getByRole('link', { name: 'Back to Things' }).click();
    await page.getByRole('button', { name: 'Take off the site: Better words' }).click();
    await expect(rows).toContainText('Draft, not on the site');
    expect(await publicTitles(page.request, collection)).toEqual([]);
    await page.getByRole('button', { name: 'Show on the site: Better words' }).click();
    await expect(rows).toContainText('On the site');
    expect(await publicTitles(page.request, collection)).toEqual(['Better words']);

    // Remove asks first; "Keep it" keeps it.
    await page.getByRole('button', { name: 'Remove: Better words' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove “Better words”?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(1);

    // Remove, then undo.
    await page.getByRole('button', { name: 'Remove: Better words' }).click();
    await dialog.getByRole('button', { name: 'Remove thing' }).click();
    await expect(page.getByRole('status')).toContainText('Removed “Better words”.');
    await expect(rows).toHaveCount(0);
    expect(await publicTitles(page.request, collection)).toEqual([]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toContainText('Brought back “Better words”.');
    await expect(rows).toHaveCount(1);
    expect(await publicTitles(page.request, collection)).toEqual(['Better words']);

    // Remove again and bring it back from the removed list.
    await page.getByRole('button', { name: 'Remove: Better words' }).click();
    await dialog.getByRole('button', { name: 'Remove thing' }).click();
    await expect(rows).toHaveCount(0);
    await page.getByRole('link', { name: 'See what was removed' }).click();
    await page.getByRole('button', { name: 'Bring back: Better words' }).click();
    await expect(page.getByRole('status')).toContainText('Brought back “Better words”.');
    await page.getByRole('link', { name: 'Back to Things' }).click();
    await expect(rows).toHaveCount(1);
    expect(await publicTitles(page.request, collection)).toEqual(['Better words']);
  });

  test('earlier versions are listed, and one can be put back', async ({ page, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const headers = writeHeaders(baseURL!);
    await signIn(page.request, baseURL!);
    const made = await page.request.post(`/admin/api/collections/${collection}`, { headers, data: { data: { title: 'Version one' }, publish: true } });
    const { record } = (await made.json()) as { record: { id: string; updatedAt: string } };
    await page.request.put(`/admin/api/collections/${collection}/${record.id}`, { headers, data: { data: { title: 'Version two' }, updatedAt: record.updatedAt } });

    await page.goto(`/admin#/${collection}/${record.id}`);
    await expect(page.getByLabel('Title')).toHaveValue('Version two');
    const versions = page.getByRole('region', { name: 'Earlier versions' }).getByRole('listitem');
    await expect(versions).toHaveCount(2);
    await expect(versions.nth(0)).toContainText('Edited');
    await expect(versions.nth(0)).toContainText('(how it is now)');
    await expect(versions.nth(1)).toContainText('Added');

    await versions.nth(1).locator('summary').click();
    await expect(versions.nth(1).getByText('Version one')).toBeVisible();
    await versions.nth(1).getByRole('button', { name: 'Put it back to this version' }).click();
    await expect(page.getByRole('status')).toContainText('Put back to the version from');
    await expect(page.getByLabel('Title')).toHaveValue('Version one');
    await expect(versions).toHaveCount(3);
    expect(await publicTitles(page.request, collection)).toEqual(['Version one']);
  });

  test('moving a record up and down changes the order on the site', async ({ page, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const headers = writeHeaders(baseURL!);
    await signIn(page.request, baseURL!);
    for (const title of ['One', 'Two', 'Three']) {
      await page.request.post(`/admin/api/collections/${collection}`, { headers, data: { data: { title }, publish: true } });
    }
    await page.goto(`/admin#/${collection}`);
    const titles = page.getByRole('list', { name: 'Things' }).locator('.record__title');
    await expect(titles).toHaveText(['One', 'Two', 'Three']);
    await expect(page.getByRole('button', { name: 'Move up: One' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move down: Three' })).toBeDisabled();

    await page.getByRole('button', { name: 'Move up: Three' }).click();
    await expect(titles).toHaveText(['One', 'Three', 'Two']);
    await page.getByRole('button', { name: 'Move down: One' }).click();
    await expect(titles).toHaveText(['Three', 'One', 'Two']);
    expect(await publicTitles(page.request, collection)).toEqual(['Three', 'One', 'Two']);
  });

  test('a change made elsewhere while the form is open is not overwritten', async ({ page, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const headers = writeHeaders(baseURL!);
    await signIn(page.request, baseURL!);
    const made = await page.request.post(`/admin/api/collections/${collection}`, { headers, data: { data: { title: 'Original' } } });
    const { record } = (await made.json()) as { record: { id: string; updatedAt: string } };
    await page.goto(`/admin#/${collection}/${record.id}`);
    await expect(page.getByLabel('Title')).toHaveValue('Original');

    // Someone else saves first.
    await page.request.put(`/admin/api/collections/${collection}/${record.id}`, { headers, data: { data: { title: 'Theirs' }, updatedAt: record.updatedAt } });
    await page.getByLabel('Title').fill('Mine');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('Someone else changed this thing while you were working on it.');
    await page.getByRole('button', { name: 'Load their version' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Theirs');
  });

  test('a full collection says so instead of saving', async ({ page, baseURL }, testInfo) => {
    const collection = scratch(testInfo);
    const headers = writeHeaders(baseURL!);
    await signIn(page.request, baseURL!);
    for (let n = 1; n <= 8; n++) {
      await page.request.post(`/admin/api/collections/${collection}`, { headers, data: { data: { title: `Thing ${n}` } } });
    }
    await page.goto(`/admin#/${collection}/new`);
    await page.getByLabel('Title').fill('One too many');
    await page.getByRole('button', { name: 'Save as a draft' }).click();
    await expect(page.getByRole('alert')).toContainText('Things already has 8 entries, which is the most it can hold.');
  });
});
