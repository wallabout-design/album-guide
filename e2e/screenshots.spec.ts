import { test } from '@playwright/test';
import { guard, steady } from './network';
import { ready, themes, views, widths } from './routes';

// A visual record of every view for reviewers, not a pass/fail check, so it
// only runs with SCREENSHOTS=1 (`npm run screenshots`; CI has its own job).
// Images land in screenshots/<browser>/<view>-<theme>-<width>.png.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to take screenshots');

for (const view of views) {
  for (const theme of themes) {
    for (const width of widths) {
      test(`${view.name} ${theme} at ${width}px`, async ({ page, baseURL }, testInfo) => {
        await guard(page, baseURL!);
        await steady(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(view.path, { waitUntil: 'networkidle' });
        await (view.ready ?? ready)(page);
        await view.open?.(page);
        await page.evaluate(() =>
          Promise.all([
            document.fonts.ready,
            ...Array.from(document.images, (img) => img.decode().catch(() => {})),
          ]),
        );
        await page.screenshot({
          path: `screenshots/${testInfo.project.name}/${view.name}-${theme}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
}
