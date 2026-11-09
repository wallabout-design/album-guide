# 0002: Workers static assets and Workers Builds, with no separate preview Worker

**Status:** accepted, 2026-11-08 (JJ; the no-preview-Worker part was decided during the build). Replaces GitHub Pages, which is being retired.

## context

The site was a static build on GitHub Pages, deployed by `.github/workflows/deploy.yml`. The site contract asks for Cloudflare Workers, a preview URL per branch, headers in the repo and Worker logs. Pages can't set headers or give per-branch previews.

## decision

- One Worker, `album-guide-site`, serving the Vite build (`dist/`) as Workers static assets. Config in `wrangler.jsonc`, with `observability.enabled`. The Worker code runs only for `/api/*` (telemetry, the Sentry tunnel); everything else is static.
- **Workers Builds** builds every push with `npm run build:production`. On `main` it runs `npx wrangler deploy` (production); on every other branch, `npx wrangler versions upload`, a preview version at `https://<branch>-album-guide-site.jj-23b.workers.dev`.
- The production API address (`VITE_API_BASE=https://album-guide-api.fly.dev`) lives in the `build:production` script in `package.json`. A plain `npm run build` has no API address and runs on the bundled catalog alone.
- **No separate preview Worker.** Previews are versions of the production Worker.
- The catalog API stays on Fly as `album-guide-api` (JJ's, manual deploys; `DEPLOY.md`). It serves CORS `*`, so previews reach it unchanged.
- GitHub Pages is turned off and `deploy.yml` deleted once the Worker serves the site.

## why

- The site has no data of its own: no database, no email, no crons, no secrets a preview could misuse. A separate preview Worker protects production data (rr's `0008-preview-worker.md`), and here there is none to protect, so it would be a second config to keep in step for nothing.
- Workers Builds is the standard deploy path and needs no deploy secrets in GitHub.

## alternatives

- **Stay on GitHub Pages.** No headers, no previews, no Worker for telemetry or the Sentry tunnel. Rejected by the contract.
- **A separate preview Worker,** as rr has. Rejected: nothing to isolate.
- **Move the API to Workers.** It's a Python server over a 125 MB SQLite file; the contract keeps Fly for workloads like that.

## revisit when

- The Worker gains data, secrets that previews mustn't use, or anything that writes: add a preview Worker then.
