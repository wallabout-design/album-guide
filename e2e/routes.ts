import { expect, type Page } from '@playwright/test';

/**
 * Waits until the app has rendered its first album. The bundle carries an 8 MB
 * catalog, so on a slow CI machine the network goes idle well before React has
 * parsed it and attached its key handlers.
 */
export async function ready(page: Page) {
  await expect(page.locator('main .plate__title')).not.toBeEmpty({ timeout: 20_000 });
}

/**
 * Waits for finite CSS animations and transitions to finish, so axe and the
 * screenshots see a panel at full opacity rather than mid-fade.
 */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
}

/*
 * Every view the site has. album.guide is one page with no router (src/App.tsx):
 * "/" is the app, "?feedback" turns on the hidden feedback link, and any other
 * path gets the 404 page (404.html, wrangler.jsonc "404-page"), except /picks,
 * a small page of its own (the admin, which needs a sign-in, is covered by
 * e2e/admin.spec.ts). The About,
 * search and debug panels open over the app from the page itself, so each is
 * checked as its own view.
 */
export interface View {
  name: string;
  path: string;
  /** The status the path answers with; 200 unless given. */
  status?: number;
  /** Waits for the page to be ready; the app's first album unless given. */
  ready?: (page: Page) => Promise<void>;
  /** Opens the view once the page has loaded. */
  open?: (page: Page) => Promise<void>;
}

export const views: View[] = [
  { name: 'home', path: '/' },
  {
    name: 'feedback',
    path: '/?feedback',
    open: async (page) => {
      await expect(page.getByRole('link', { name: 'send feedback' })).toBeVisible();
    },
  },
  {
    name: 'not-found',
    path: '/nope/deep',
    status: 404,
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    // Staff picks, its own small page (picks.html), filled from the Worker's
    // /api/collections/picks and the seeded local database.
    name: 'picks',
    path: '/picks',
    ready: async (page) => {
      await expect(page.locator('.pick')).toHaveCount(12);
    },
  },
  {
    name: 'about',
    path: '/',
    open: async (page) => {
      // Opened from the keyboard: a click waits for the button to stop
      // moving, which WebKit on a busy machine can take longer than the timeout.
      await page.locator('button.brand').press('Enter');
      await page.getByRole('dialog', { name: 'About album.guide' }).waitFor();
      await settle(page);
    },
  },
  {
    name: 'search',
    path: '/',
    open: async (page) => {
      await page.locator('button.searchtrigger').press('Enter');
      // Common enough to match three or more bundled albums, so the search
      // never falls through to MusicBrainz.
      await page.keyboard.type('love');
      await page.locator('.search__row').first().waitFor();
      await settle(page);
    },
  },
  {
    name: 'debug',
    path: '/',
    open: async (page) => {
      // The engine's debug panel opens with "d" for anyone, so it is checked too.
      // React attaches the key handler just after the first paint, which on a
      // busy machine can be after ready() returns, so press again until it opens.
      const panel = page.locator('aside.debug');
      await expect(async () => {
        if (!(await panel.isVisible())) await page.keyboard.press('d');
        await expect(panel).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await settle(page);
    },
  },
];

export const widths = [360, 768, 1024, 1440];
export const themes = ['light', 'dark'] as const;
