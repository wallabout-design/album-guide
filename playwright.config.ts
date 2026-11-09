import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // The production build, pointed at the production API as deploys are; the
  // tests mock the API (e2e/network.ts), so nothing reaches Fly.
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    env: { VITE_API_BASE: 'https://album-guide-api.fly.dev' },
    url: `http://localhost:${port}`,
    // Never reuse: a stray server would serve a stale build and still pass.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
