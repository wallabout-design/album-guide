import { defineConfig, devices } from '@playwright/test';

const port = 4173;

// BASE_URL points the production checks at the live site (production-checks.yml):
// no local server, Chromium only, and only e2e/production.spec.ts, which uses
// the real API and cover art rather than the mocks in e2e/network.ts.
const baseURL = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  testMatch: baseURL ? 'production.spec.ts' : undefined,
  testIgnore: baseURL ? undefined : 'production.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: baseURL ?? `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    // The production checks send Global Privacy Control, which the telemetry
    // route honours by not counting the visit, so they don't show up as visitors.
    extraHTTPHeaders: baseURL ? { 'Sec-GPC': '1' } : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(baseURL ? [] : [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]),
  ],
  // The production build, pointed at the production API as deploys are, served
  // by the Worker in workerd (`wrangler dev`) as production serves it: the 404
  // page, /api/event and asset headers behave as they do on album.guide. The
  // tests mock the API (e2e/network.ts), so nothing reaches Fly.
  webServer: baseURL
    ? undefined
    : {
        command: `npm run build:production && npx wrangler dev --port ${port} --ip 127.0.0.1`,
        env: { WRANGLER_SEND_METRICS: 'false' },
        url: `http://127.0.0.1:${port}`,
        // Never reuse: a stray server would serve a stale build and still pass.
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
