# 0011: how Sentry is wired in

**Status:** accepted, 2026-11-09. Builds on `0004-error-tracking.md`. A test error from the `feat/sentry` preview arrived in Sentry through `/api/sentry`.

## context

`0004` chose Sentry, project `album-guide` in `wallabout-design-llc`, with browser events sent through the Worker. rr (`wallabout-design/rr`, `docs/decisions/0009-error-tracking.md`) is the pattern. rr renders its DSN and environment from Worker vars into `<meta>` tags at request time; album.guide is a static SPA, so the page can't learn them at request time.

## decision

- **Browser only.** `src/monitoring.ts` is the only file that imports `@sentry/react`. The Worker has two small routes and Workers Logs (`observability.enabled`), so it gets no Sentry SDK.
- **The DSN** is one constant in `src/sentry-config.ts`, shared by the browser and the tunnel. It's public by design.
- **Environment is set at build time** in `vite.config.ts`: Workers Builds (`WORKERS_CI=1`) on `main` is `production` (album.guide), any other branch is `preview`. Every other build (local, GitHub Actions, the checks) gets an empty environment, and the minifier drops the whole `Sentry.init` call, so local and CI runs never send events.
- **Release** is the 7-character build SHA (`VITE_BUILD_SHA`, the same value telemetry uses).
- **Tunnel:** `POST /api/sentry` in `worker/sentry.ts` forwards an envelope only when its DSN equals this project's (host, project id and key, via `@sentry/core`'s `handleTunnelRequest`), only from same-origin pages, and only under 200 KB.
- **Cost and privacy guards,** as rr: errors only (no tracing, replay or sessions), `allowUrls` limited to the site's origin, no user, cookies, headers or query strings.
- **Source maps:** every build writes hidden maps and Sentry debug IDs; `scripts/remove-source-maps.mjs` deletes the maps so they're never served. A build with `SENTRY_AUTH_TOKEN` uploads them first. Unlike rr, the upload runs inside Workers Builds (`docs/open-items.md`), so no GitHub Actions workflow is needed.
- **Test errors:** on a preview only, `/?sentry-test=client` throws, as in rr.

## alternatives

- **DSN in `wrangler.jsonc` vars, as rr.** The browser can't read Worker vars on a static page without a new route; one shared constant is simpler.
- **Environment by hostname at runtime.** Works too, but a build-time switch also keeps the SDK out of local and CI bundles.
- **Upload source maps from GitHub Actions, as rr.** Needs deterministic builds and a second build; the Workers Builds secret is one step for JJ.

## revisit when

- The Worker grows real server logic: add `@sentry/cloudflare` there, as rr does.
- Sentry adds about 26 KB gzipped to a 2 MB bundle (mostly the catalog); revisit if page weight matters.
