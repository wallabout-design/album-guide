// Error tracking in the browser, through Sentry. Copied from wallabout-design/rr
// (app/lib/monitoring.client.ts). Events go to this site's own /api/sentry
// (the tunnel in worker/sentry.ts), so the page makes no third-party request.
// The environment is baked in by vite.config.ts: "production" for main and
// "preview" for other branches in Workers Builds, and empty everywhere else
// (local dev, CI, `npm run check`), which keeps Sentry off.
// See docs/decisions/0011-sentry-setup.md.
import * as Sentry from '@sentry/react';
import { SENTRY_DSN, SENTRY_TUNNEL_PATH } from './sentry-config';

const environment = String(import.meta.env.VITE_SENTRY_ENVIRONMENT ?? '');
const release = String(import.meta.env.VITE_BUILD_SHA ?? '') || undefined;

// Collect nothing about the visitor or the request.
const DATA_COLLECTION: Sentry.BrowserOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

export function initMonitoring(): void {
  if (!environment) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment,
    release,
    tunnel: SENTRY_TUNNEL_PATH,
    dataCollection: DATA_COLLECTION,
    // Errors only: no tracing, no session replay, no session counts.
    tracesSampleRate: 0,
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
    // Only errors from this site's own scripts, not from browser extensions.
    allowUrls: [location.origin],
    maxBreadcrumbs: 30,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      return event;
    },
  });

  // Previews only: /?sentry-test=client throws from bundled code, to check
  // that browser errors reach Sentry through the tunnel.
  if (environment === 'preview' && new URLSearchParams(location.search).get('sentry-test') === 'client') {
    setTimeout(() => throwTestError(), 0);
  }
}

function throwTestError(): never {
  throw new Error('Sentry test error (browser)');
}

/** React's root error callbacks (uncaught, caught by a boundary, recovered). */
export const reactErrorHandler = Sentry.reactErrorHandler;
