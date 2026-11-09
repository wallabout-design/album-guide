# business context

Written 2026-11-08, when the repo moved into `wallabout-design`. The repo is public, so this file holds nothing private: no costs, contacts, credentials or account details.

## what it is

album.guide is a music discovery site. One album sits centre stage as a CD jewel case; two covers offer deliberately different roads onward, and a shuffle takes a turn the engine would never recommend. Choosing one moves the flow on, and the trail at left lets you walk back and take the branch you skipped.

The premise: streaming recommendations over-index on the densest cluster of your taste and serve the same adjacent canon. album.guide does the opposite. Its two offers diverge from each other, and a distance dial moves both further out together. `README.md` explains the catalog and the recommender.

## who it's for

- Anyone who wants to find albums they haven't heard, especially past the obvious ones. No account, no sign-in, no personal data.
- It's JJ's own project, run under the internal client **Noonan** in `wallabout-design/standards` `sites.json`. It isn't a business and has no revenue.
- It's public and meant to be found, so search basics apply (`decisions/0005-search-basics.md`).

## how it runs

- **The site** is a static Vite and React build, served by the Cloudflare Worker `album-guide-site` at https://album.guide (`decisions/0002-hosting.md`, `0003-domain.md`). It ships a bundled catalog of 12,000 albums, so it works on its own.
- **The catalog API** (`album-guide-api` on Fly) serves the whole catalog, about 100,000 albums, read-only. If it's asleep or gone, the site falls back to the bundle. It's JJ's, deployed by hand (`DEPLOY.md`).
- **The data** comes from MusicBrainz, the Cover Art Archive and ListenBrainz, crawled by the Python scripts in `scripts/` on JJ's machine. Album links go to Spotify. A fresh snapshot of the bundle reaches the site through a PR (`decisions/0006-publish-through-a-pr.md`).
- **Errors** go to Sentry through the Worker (`decisions/0004-error-tracking.md`). Visits are counted per `standards/telemetry.md`, with no cookies and no personal data.

## what matters

- It stays fast, and every path degrades to the bundled catalog when the API is slow or gone.
- Low effort to run and nearly free.
- The recommendations stay honest: changes to the engine are measured (`npm run eval`), not guessed.
