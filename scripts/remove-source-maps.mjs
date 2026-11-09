// Deletes the source maps from dist/ after every build, so they're never
// served. vite.config.ts builds hidden maps for Sentry; a build with
// SENTRY_AUTH_TOKEN uploads them during `vite build`, before this runs.
// Copied from wallabout-design/rr (scripts/remove-client-maps.mjs).
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../dist', import.meta.url).pathname;
let removed = 0;
for (const entry of readdirSync(root, { recursive: true })) {
  if (String(entry).endsWith('.map')) {
    rmSync(join(root, String(entry)));
    removed++;
  }
}
console.log(`Removed ${removed} source maps from dist.`);
