import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // The production build, pointed at the production API as deploys are, served
  // by the Worker in workerd (`wrangler dev`) as production serves it: the 404
  // page, /api/event and asset headers behave as they do on album.guide. The
  // tests mock the API (e2e/network.ts), so nothing reaches Fly.
  webServer: {
    command: `npm run build:production && npx wrangler dev --port ${port} --ip 127.0.0.1`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    // Never reuse: a stray server would serve a stale build and still pass.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
