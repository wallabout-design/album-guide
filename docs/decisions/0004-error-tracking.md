# 0004: Sentry for browser errors, tunnelled through the Worker

**Status:** accepted, 2026-11-08 (JJ). Source maps wait on an auth token (`../open-items.md`).

## context

The site contract asks app sites for error tracking with Sentry (`standards/monitoring.md`). album.guide is an app site: the whole experience is client-side React, and a broken engine or API call fails silently in a visitor's browser.

## decision

- A Sentry project `album-guide` in the `wallabout-design-llc` organization, with the browser SDK in the app.
- Events go to the Worker's `/api/*` route and on to Sentry (Sentry's `tunnel` option), so the page makes no third-party request and ad blockers don't drop events.
- The `error_tracking` flag in `sites.json` is set once errors are captured in production, before source maps are uploaded.
- Source-map upload needs a Sentry auth token in the Workers Builds build. Creating it is JJ's step.

## why

- Same tool and pattern as rr (`wallabout-design/rr`, `docs/decisions/0009-error-tracking.md`), so one routine and one place to look.
- The tunnel keeps the CSP to the site's own origin plus the Fly API.

## alternatives

- **No error tracking.** The contract makes it a requirement for app sites.
- **Workers logs only.** They see the Worker, not errors in the browser, which is where this site runs.

## revisit when

- Event volume nears the Sentry plan's limits: add sampling.
