import { expect, type Page } from '@playwright/test';

/**
 * Waits until the app has rendered its first album. The bundle carries an 8 MB
 * catalog, so on a slow CI machine the network goes idle well before React has
 * parsed it and attached its key handlers.
 */
export async function ready(page: Page) {
  await expect(page.locator('main .plate__title')).not.toBeEmpty({ timeout: 20_000 });
}

/*
 * Every view the site has. album.guide is one page: there is no router, no
 * hash routes and no query views (src/App.tsx), so "/" is the only URL. The
 * About and search panels and the debug panel open over it from the page
 * itself, so each is checked as its own view.
 */
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

export interface View {
  name: string;
  path: string;
  /** Opens the view once the page has loaded. */
  open?: (page: Page) => Promise<void>;
}

export const views: View[] = [
  { name: 'home', path: '/' },
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
