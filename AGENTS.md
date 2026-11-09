# agent guide: wallabout-design/album-guide

album.guide (https://album.guide): a public music discovery site. One album sits centre stage in a Cover Flow; two covers offer deliberately different roads onward. Read this first, then `docs/business.md` for what it is and how it runs, and `README.md` for how the catalog and the recommender work.

This site follows the shared standards in `wallabout-design/standards` (`~/dev/wallabout/standards`): `standards/site-contract.md` is the checklist, and `sites.json` records what album-guide has adopted.

Clone: `git clone https://github.com/wallabout-design/album-guide.git` (moved from `jj-noonan/album-guide` on 2026-11-08; `docs/decisions/0001-transfer-to-wallabout-design.md`).

## the main checkout is live

`~/dev/album-guide` is not an ordinary checkout. `scripts/run_jobs.sh` runs from it around the clock, and it holds the only copies of the gitignored `.env` (API credentials), `.venv` and `data/*.sqlite` (the crawl database, about 300 MB).

- Never edit, switch branches, stash, clean or reset there, and never stop the jobs. The only commands allowed in it are `git pull --ff-only` and `git remote set-url`.
- Work in your own worktree (`~/dev/AGENTS.md`, "One worktree per session"): `git -C ~/dev/album-guide worktree add --no-track -b <branch> ../album-guide-<name> origin/main`, then `npm ci`.
- The venv's script shebangs broke when the folder was renamed from `music-recs`. Use `.venv/bin/python -m pip`, never `.venv/bin/pip`.
- A worktree has no `.venv` or database. Node checks work there; Python jobs that need the database run only in the main checkout, by JJ.

## commands

Node 24, as CI uses. Run these before opening a PR. CI (`.github/workflows/ci.yml`) runs them on every PR: `check` and `e2e` are required, `screenshots` is not.

- `npx tsc -b`: type check
- `npm run lint`: oxlint
- `npm run build`: type check and build to `dist/` (bundled catalog only). `npm run build:production` adds the Fly API address, as Workers Builds does
- `npm run check`: server-render the app and assert its structure. Also `npm run click-check`, `npm run feedback-check`, `npm run dist-check` (after a build); none needs the network. `npm run api-wire-check` needs a local API, so CI skips it
- `npm run test:worker`: the Worker's unit tests (`worker/tests/`)
- `npm run lint:html`: html-validate on `dist/` (after a build)
- `npm run test:e2e`: Playwright in Chromium and WebKit on every view (home, About, search, debug: `e2e/routes.ts`) against the production build: status 200, no console errors, no hosts but the mocked Fly API and cover art (`e2e/network.ts`), axe in light and dark, no horizontal scroll at 360 to 1440px. Run `npx playwright install chromium webkit` once first. Add a view to `e2e/routes.ts` when you add one
- `npm run screenshots`: every view at each width, theme and browser into `screenshots/`; CI attaches them to the PR
- `npm run dev`: local dev at http://localhost:5173, on the bundled catalog
- `npm run walk`, `npm run eval`, `npm run reach`: judge a change to the recommender (`README.md`). CI runs `eval`, the one with assertions
- `bash scripts/publish.sh --dry-run`: check the publish flow without pushing (`docs/decisions/0006-publish-through-a-pr.md`)

## where things are

- `src/`: the React app. `src/data/` holds the bundled catalog (`catalog.json`), the corridors, the lexicon and the schema.
- `scripts/`: the Python crawler and backfills (run in the main checkout only), the TypeScript checks, `publish.sh` and `run_jobs.sh`.
- `api/`: the read-only catalog API that runs on Fly as `album-guide-api`. `DEPLOY.md` covers it.
- `public/`: brand assets; the rules are in `BRAND.md`.
- `wrangler.jsonc` and `worker/`: the Cloudflare Worker `album-guide-site` that serves the site.
- `src/monitoring.ts`: Sentry in the browser; nothing else imports it. Events go through `/api/sentry` (`worker/sentry.ts`). On a preview, `/?sentry-test=client` throws a test error (`docs/decisions/0011-sentry-setup.md`).
- `docs/business.md`: what the site is for. `docs/decisions/`: decision records; read them before changing hosting, the domain, publishing or error tracking, and add a new record to change one. `docs/open-items.md`: what's waiting on JJ.

## rules

- **Never push to `main`.** Branch, open a PR, wait for its checks, then `gh pr merge --squash`. `main` has the "Protect main" ruleset (`docs/decisions/0008-protect-main.md`). This includes catalog snapshots: `scripts/publish.sh` publishes through a PR.
- One concern per PR. Stage explicit paths, never `git add -A`.
- **The Fly API is JJ's.** `album-guide-api` lives in JJ's personal Fly org with manual deploys. Agents never run `fly deploy`, change its secrets or scale it, and never run `publish.sh` for real (its last step deploys the API).
- Never commit `.env`, secrets or anything in `data/*.sqlite`.
- The repo is public: nothing private in code, docs, issues or PRs (no costs, emails, account IDs beyond what's already public, or secrets).
- When this site adopts or drops part of the shared standard, update `sites.json` in `wallabout-design/standards` in the same piece of work.

## deploying

Workers Builds builds every push with `npm run build:production` (it sets `VITE_API_BASE` to the Fly API). `main` runs `npx wrangler deploy` to production; every other branch runs `npx wrangler versions upload` to a preview URL, `https://<branch>-album-guide-site.jj-23b.workers.dev`. Merging a PR deploys it, so these rules apply to merging.

- **Agents merge their own PRs** (JJ, 2026-11-09: "i think you're leaving too many decisions for me, reevaluate and lower the bar"). Merge once the required checks (`check`, `e2e`) and the Workers Builds preview pass and the change was checked on the branch preview at mobile and desktop widths. This covers the Worker, `wrangler.jsonc`, the domain and DNS and the API contract too. Record every decision you made in the PR body (`docs/decisions/0014-what-waits-for-jj.md`).
- **Only these wait for JJ**, labelled `needs-review` and listed in `docs/open-items.md`: anything that needs a secret or 1Password; anything that spends money; a Fly deploy or any change to the Fly app (JJ's; see rules above); destructive changes to production data; and any action a permission check refused, which is never worked around. A failing check is fixed, never merged past.
- In the report, say whether it was merged (and so deployed) or is waiting for approval.
