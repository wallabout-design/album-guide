# 0012: security headers from third-parties.json

**Status:** accepted, 2026-11-09. Enforcing from the first deploy (no report-only phase).

## context

The site contract asks for a content security policy in the repo and `Strict-Transport-Security`, with third parties listed in `third-parties.json`, which drives both the policy and the CI allow-list. album.guide is a static SPA, and since `0003-domain.md` the Worker runs first for every request (`run_worker_first: true`) and hands pages and files to `ASSETS`. The patterns are `wallabout-design/site` (`public/_headers`) and `wallabout-design/rr` (`app/lib/csp.ts`, `third-parties.json`).

## decision

- **The list is evidence.** `third-parties.json` holds what Playwright saw on https://album.guide on 2026-11-09 (load, shuffle, arrow-key moves, catalog search, a MusicBrainz search that added an album, About, `?feedback`, `/nope`; 375 and 1280 px): the Fly catalog API; Cover Art Archive, which redirects every cover and JSON listing to `archive.org` and numbered hosts such as `ia601808.us.archive.org` and `dn710703.ca.archive.org`, hence `https://*.archive.org`; MusicBrainz and ListenBrainz for search-driven ingest (`src/engine/ingest.ts`). Spotify, Apple Music and MusicBrainz page links are outbound links, not requests.
- **One source.** `worker/security-headers.ts` builds the policy from `third-parties.json` and the Worker sets it, with the other headers, on every response: pages and files from `ASSETS`, the `www` redirect and `/api/*`. `public/_headers` carries the same values so static files stay covered if the Worker stops running first. `worker/tests/security-headers.test.ts` fails when `_headers` and the generated policy differ, and prints the line to copy. The e2e allow-list (`e2e/network.ts`) reads the same file, and `e2e/site.spec.ts` checks every route's headers, with the policy enforced under `wrangler dev`.
- **No `'unsafe-inline'` anywhere.** The only inline `<script>` is JSON-LD, a data block `script-src` doesn't govern. There are no `<style>` blocks; React `style` props go through the CSSOM, which `style-src` doesn't govern. This is stricter than site and rr, which allow inline styles.
- **HSTS** one year with `includeSubDomains`, no `preload`, as site and rr.
- Also `nosniff`, `strict-origin-when-cross-origin`, a permissions policy denying camera, microphone and geolocation, `Cross-Origin-Opener-Policy: same-origin` and `frame-ancestors 'none'`, as site and rr. Hashed `/assets/*` are cached for a year, as site.
- **No report endpoint.** rr logs violations at `/api/csp-report`; here the enforced policy plus the Playwright checks are enough for a static page with no user data. Add one if a violation is ever suspected in production.
- **Cloudflare Web Analytics is not allowed.** The zone injects `static.cloudflareinsights.com/beacon.min.js` into pages served on album.guide (not on `workers.dev` previews). The site has first-party telemetry (`0009-telemetry.md`), so the beacon should be turned off at the zone rather than allowed. JJ turned it off on 2026-11-09 (Web Analytics site added for album.guide, automatic setup disabled, as for rr and wallabout.design).

## alternatives

- **Report-only first, as rr did.** rr renders on the server with per-request inline scripts; this page has none, and the preview was checked in Chromium and WebKit before merging, so enforcing straight away is safe.
- **Listing archive.org hosts one by one.** They vary per file and change over time; the wildcard is limited to `archive.org`.
- **Generating `_headers` at build time.** Keeps one file fewer in step, but adds a build step; the test catches drift instead.

## revisit when

- A new request host appears (a new API, an image source): add it to `third-parties.json`, copy the printed line into `public/_headers`, and add a mock for it in `e2e/network.ts` if a page load reaches it.
- The Fly API moves to `album.guide/api/*`: drop its entry.
- The Cloudflare Web Analytics beacon is off at the zone: the console error on album.guide goes away; nothing to change here.
