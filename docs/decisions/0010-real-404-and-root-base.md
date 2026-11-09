# 0010: a real 404 page, and root-relative asset URLs

**Status:** accepted, 2026-11-09 (decided during the build, JJ away).

## context

The Worker served every unknown path with `index.html` (`not_found_handling: "single-page-application"`). The app has one page, `/`: no router, no hash routes, no query views. So a mistyped URL returned 200 with the app, which search engines index as a duplicate (a "soft 404"). And because `vite.config.ts` had `base: './'` for the old GitHub Pages subpath, `index.html` served at `/a/b` asked for `/a/assets/…` and rendered a blank page. The site contract asks for a real 404 page that returns 404 (`0005-search-basics.md`).

## decision

- `wrangler.jsonc` uses `not_found_handling: "404-page"`: any path with no file gets `dist/404.html` with HTTP 404. `/api/*` still goes to the Worker first.
- `vite.config.ts` uses `base: '/'`, and `index.html`, `404.html` and the app's images use root-relative URLs (`/assets/…`, `/svg/…`). The site is served at the domain root (album.guide, and `*.workers.dev` for previews), so a subpath build is no longer needed. `npm run dist-check` now fails on a relative path in either page, or one that isn't in the build.
- `404.html` is a second Vite entry. It has no script: it reuses the app's fonts and the start screen's look (`.loading` in `src/index.css`), with a link back to `/`, and `noindex`.
- Structured data (`index.html`) is an `Organization` named album.guide, with `https://album.guide/icons/icon-512.png` as its logo (a PNG, so it renders without the web font), and a `WebSite` it publishes. No `SearchAction`: search happens inside the app and has no URL.
- The 404 page has no feedback link. Its script would share a chunk with the app's bundle, which `dist-check` evaluates as one classic script. A reviewer on a broken link can still email `feedback@wallabout.design`.

## why

- `404-page` is Cloudflare's built-in handling: no Worker code and no extra request.
- Root-relative URLs work at any depth; relative ones only work at the root.

## alternatives

- **Keep the SPA fallback and switch only the base.** Fixes the blank page, but every unknown URL is still a 200 duplicate of `/`.
- **Answer unknown paths in the Worker** with `run_worker_first: true`. Every request would run the Worker, for no gain.

## revisit when

- The app gains real routes (per-album pages, say): serve them as their own pages or bring back the SPA fallback with the Worker returning 404 for unknown ones.
- `/404` itself answers 200 with the 404 page (Cloudflare's `html_handling`). It's linked from nowhere and `noindex`; fix it if a crawler ever reports it.
