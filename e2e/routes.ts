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
      await page.locator('button.brand').click();
      await page.getByRole('dialog', { name: 'About album.guide' }).waitFor();
    },
  },
  {
    name: 'search',
    path: '/',
    open: async (page) => {
      await page.locator('button.searchtrigger').click();
      // Common enough to match three or more bundled albums, so the search
      // never falls through to MusicBrainz.
      await page.keyboard.type('love');
      await page.locator('.search__row').first().waitFor();
    },
  },
  {
    name: 'debug',
    path: '/',
    open: async (page) => {
      // The engine's debug panel opens with "d" for anyone, so it is checked too.
      await page.keyboard.press('d');
      await page.locator('.debug').first().waitFor();
    },
  },
];

export const widths = [360, 768, 1024, 1440];
export const themes = ['light', 'dark'] as const;
