# Deploying album.guide

Two things deploy, in different ways:

| | the site | the catalog API |
| --- | --- | --- |
| what | static Vite build, Worker `album-guide-site` | Python server, Fly app `album-guide-api` |
| where | https://album.guide (`www.album.guide` redirects there) | https://album-guide-api.fly.dev |
| how | Workers Builds, on every push | `fly deploy`, by hand |
| who | anyone who merges a PR | JJ only |

## The site: Cloudflare Workers

Hosting is Workers static assets (`wrangler.jsonc`;
`docs/decisions/0002-hosting.md`). Workers Builds is connected to this repo
and builds every push with `npm run build:production`, which sets
`VITE_API_BASE=https://album-guide-api.fly.dev`:

- **`main` deploys production** with `npx wrangler deploy`. Merging a PR is the deploy. `main` is
  protected, so nothing reaches it except through a PR.
- **Every other branch gets a preview** with `npx wrangler versions upload`, at
  `https://<branch>-album-guide-site.jj-23b.workers.dev` (branch lowercased,
  other characters turned into `-`). A PR shows a Workers Builds check; a
  failed build's log is in the Cloudflare dashboard, linked from the check.
- There is no separate preview Worker: the site has no data a preview could
  touch, and previews call the same read-only API.

DNS for `album.guide` is on Cloudflare; the registration stays at Gandi
(`docs/decisions/0003-domain.md`). `www.album.guide` redirects to the apex.

**Rolling back:** `npx wrangler rollback --name album-guide-site` restores the
previous version; or revert the PR and merge the revert.

**Deploying by hand** is only for when Workers Builds is broken:
`npm run deploy` (`build:production`, then `wrangler deploy`), from a worktree on an up-to-date
`main`.

GitHub Pages (`jj-noonan.github.io/album-guide/`) was retired on 2026-11-09,
once the Worker served album.guide. Don't add a `public/CNAME` or a Pages
workflow back.

## The API: Fly.io (JJ only)

The Fly app lives in JJ's personal Fly organization and is deployed by hand.
Agents don't deploy it, change its secrets or scale it.

The API is a read-only catalog server. The database is baked into the image,
so there is no volume, no database service, and no state that can drift from
what is in git — "update the data" and "deploy" are the same action, and a
machine that dies is replaced from the image with nothing lost. It serves CORS
`*`, so production and every preview can call it.

Everything below is run from the repo root of the main checkout, which holds
the crawl database.

### One-time setup (done)

**1. Install flyctl**

    brew install flyctl

**2. Sign in** (opens a browser; creating an account is free and needs a card
for verification even on the free-ish tier)

    fly auth signup     # or: fly auth login

**3. Build the database the API serves**

    .venv/bin/python api/make-api-db.py

Produces `data/catalog-api.sqlite`, ~126 MB. It is gitignored and rebuilt from
`data/catalog.sqlite` whenever you want to publish fresher data.

The engine's constants (`data/lexicon.json`, `data/engine-constants.json`) are
committed, so they need rebuilding only after editing the lexicon or crawling
enough to shift the catalog's statistics:

    npm run engine-constants
    npm run engine-parity     # both engines must still agree: 75/75

**4. Create the app** — this only registers the name, it does not deploy

    fly launch --no-deploy --copy-config --name album-guide-api --region iad

If that name is taken, pick another and change `app` at the top of `fly.toml`
to match. `--copy-config` makes it use the `fly.toml` already in the repo
rather than generating one and overwriting the settings.

### Deploy

    fly deploy

The first one takes a few minutes: it uploads ~125 MB of database to Fly's
builder. Later deploys reuse that layer unless the database changed.

**Check it:**

    fly status
    curl https://album-guide-api.fly.dev/v1/health

Expect `{"ok": true, "albums": 100931}`. Then a real query:

    curl "https://album-guide-api.fly.dev/v1/search?q=joni%20mitchell&limit=3"

Joni Mitchell is a good test precisely because she has zero albums in the
bundled catalog the site ships today. If she comes back, the API is serving
something the site cannot.

### After significant catalog growth

`data/engine-constants.json` holds the axis spreads and tag informativeness,
computed over the whole database. They drift as the catalog grows, and nothing
regenerates them automatically — deliberately, because regenerating them
changes every distance and overlap in the engine, which is a scoring change and
wants measuring rather than shipping quietly:

    npm run engine-constants     # recompute from the current database
    npm run engine-parity        # both engines must still agree: 75/75
    .venv/bin/python api/eval-full.py --starts 24   # held-out must not drop

Do this after adding tens of thousands of albums, not after every crawl. A few
thousand new records move the statistics by very little, and the eval cannot
resolve a change smaller than about four points anyway.

### Updating the data after a crawl

    npm run publish

`scripts/publish.sh` lands the new bundled snapshot through a PR, then
rebuilds the API database and runs `fly deploy`, so both halves serve the same
catalog (`docs/decisions/0006-publish-through-a-pr.md`). To redeploy only the
API:

    .venv/bin/python api/make-api-db.py
    fly deploy The old image is kept, so `fly releases` and
`fly deploy --image <previous>` will roll back if a bad export ships.

### What it costs

`fly.toml` sets `auto_stop_machines`, `min_machines_running = 0` and a 256 MB
shared-CPU machine, so the app sleeps when idle and wakes on the next request.
For personal traffic that is a few dollars a month or less; the cost is roughly
a second of latency on the first request after a quiet spell.

Raise `min_machines_running` to 1 to remove that delay, and expect a few
dollars a month more.

256 MB is comfortable despite the 125 MB database: SQLite memory-maps the file
and reads pages on demand rather than loading it.

### Useful commands

    fly logs                 # live logs
    fly status               # machines, health, current release
    fly releases             # deploy history
    fly scale count 1        # keep one machine always warm
    fly scale memory 512     # if it ever gets OOM-killed
    fly apps destroy <name>  # remove everything

### Things that will bite

**The app is unreachable but deploy succeeded.** The server must bind
`0.0.0.0`, not `127.0.0.1`; bound to localhost a machine passes its own health
check and refuses everything from outside. The Dockerfile sets `HOST=0.0.0.0`
for this reason — don't remove it.

**Deploy uploads far more than it should.** `.dockerignore` allows only
`api/server.py` and `data/catalog-api.sqlite`. Without it, the 143 MB crawl
database and `node_modules` go up on every deploy.

**The machine starts and dies immediately.** Run `npm run image-check`, which
copies exactly the paths the Dockerfile names into an empty directory and
starts the server from them. This has caught the failure twice; both times the
ordinary checks passed, because locally the whole repo is on disk.

**Why it dies.** The image copies exactly the
files the server opens: `api/server.py`, `api/engine.py`, `data/lexicon.json`,
`data/engine-constants.json` and the database. Adding a runtime dependency
without adding a COPY line builds cleanly and fails on first import — a deploy
that reports success and a machine that never answers. To check before
deploying, run `npm run image-check` (above).

**Health checks fail after a data update.** `/v1/health` counts rows, so it
fails if `catalog-api.sqlite` is missing or truncated — which is the point.
Rebuild it and deploy again.

**A deploy while the crawler is running.** `make-api-db.py` copies through
SQLite's backup API rather than the filesystem, so this is safe. Do not replace
that with `cp`: a byte copy of a live WAL database can land torn in a way that
only surfaces under a later query.
