# 0009: first-party telemetry through the Worker's /api/event

**Status:** accepted, 2026-11-09 (decided during the build, while JJ was away)

## context

- `standards/telemetry.md` (v1, in `wallabout-design/standards`) says every site sends page views, engaged time and Core Web Vitals to `POST /api/event` on its own domain, which writes them to Workers Analytics Engine. `wallabout-design/site` already does this; this site copies its code.
- The Worker `album-guide-site` (`0002-hosting.md`) already runs only for `/api/*`, so the route costs nothing on static pages.
- The visitor hash needs the `TELEMETRY_SALT` secret, which only JJ can create (`docs/open-items.md`). It isn't set yet.

## decision

- **The route.** `worker/index.ts` routes `POST /api/event` to `recordEvent`; `worker/telemetry.ts` is the site repo's pure module with `SITE_ID = "album-guide"`. The router is a list of routes, so the Sentry tunnel is one more entry.
- **No salt, no data.** Until `TELEMETRY_SALT` is set (or if it is empty), the route validates the event and answers `204` but writes nothing. A hash with an empty salt would be reversible, so it is never computed. `worker/tests/telemetry.test.ts` checks this.
- **Storage.** The binding `EVENTS` writes to the account's shared `site_events` dataset. Analytics Engine creates a dataset on its first write, so nothing was created by hand.
- **Previews write too, once the salt exists.** Previews are versions of the production Worker (`0002-hosting.md`) and share its secrets. Their events carry the preview hostname in `blob2`, and the standard's reports filter `blob2` to the production hostname, so preview traffic never reaches a report. This is not the kind of preview write `0002` warns about: nothing a visitor sees depends on it.
- **The build SHA is baked into the bundle** by `vite.config.ts` (from `WORKERS_CI_COMMIT_SHA`, or git locally), rather than read from a `<meta name="build">` as the site repo does. A Vite SPA has no build-time templating in `index.html` without a plugin; `define` is one line.
- **The browser script** (`src/telemetry.ts`) is imported first in `src/main.tsx`. Its web-vitals calls are wrapped so a browser without the Performance APIs still renders the app.
- **Local servers.** `vite` and `vite preview` answer `POST /api/event` with `204` (a plugin in `vite.config.ts`), so local runs and the e2e tests see no 404.

## alternatives

- **Withhold the salt from previews,** as the site repo does with a separate preview environment. Not possible without a preview Worker, which `0002` rejected; the hostname filter does the same job.
- **Load the script with a dynamic `import()` after render.** A second chunk for 40 lines; the `try` is enough.

## revisit when

- The standard moves to v2, or a dashboard provider is adopted: forward from `recordEvent`.
- A preview Worker is added for another reason: give it no `TELEMETRY_SALT`.
