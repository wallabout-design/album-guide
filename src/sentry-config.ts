// Shared by the browser (src/monitoring.ts) and the Worker's tunnel
// (worker/sentry.ts), so both name the same project. No imports: it's safe in
// both bundles.

/** Sentry project `album-guide` in `wallabout-design-llc`. Public by design: it ships in every page. */
export const SENTRY_DSN =
  'https://1ab7e84f2fe9c32769c972620e9c79d2@o4512364766560256.ingest.us.sentry.io/4512399984951296';

/** Browser events are posted here and the Worker forwards them, so the page only talks to its own origin. */
export const SENTRY_TUNNEL_PATH = '/api/sentry';
