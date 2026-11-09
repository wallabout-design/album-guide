# open items

What's waiting on JJ, as of 2026-11-09, most urgent first. Only things an agent can't do (`docs/decisions/0014-what-waits-for-jj.md`): secrets and 1Password, spending money, the Fly app, destructive changes to production data, and actions a permission check refused. Agents decide and do everything else. Tick or remove an item when it's done.

## now

- [ ] **Merge `wallabout-design/site` PR #97** (registers album-guide in the portal): https://github.com/wallabout-design/site/pull/97. Merging applies the portal's production migration; the agent's merge was refused by a permission check as a production deploy. It's additive only (one site, four resources, one `rate_card` row), its checks are green and the preview migration is applied. Merge with `gh pr merge 97 --repo wallabout-design/site --squash`.
- [ ] **Add album-guide to the `site feedback` routine.** Until then the routine holds feedback for album.guide (`processes/feedback-routine.md` in `wallabout-design/standards`). The agent's update of the routine was refused by a permission check (Account & Standing-Rule Changes). At https://claude.ai/code/routines/trig_01TskCJAGnZsxv55GK9oqQzB:
  1. Add the repository `wallabout-design/album-guide`.
  2. Add `album.guide` to the environment's network allowlist.

  The routine reads its prompt from standards `main`, which already lists album-guide, so nothing needs pasting. The build-queue routine already covers album-guide (trigger `8254e5b7-1c80-407a-96d7-5f2f4254f785`, tested 2026-11-09).
- [ ] **`TELEMETRY_SALT` for the Worker.** Until it's set, `/api/*` telemetry answers `204` and stores nothing, and the `telemetry` flag in `sites.json` stays `false`. Run:
  ```sh
  eval $(op signin)
  op item create --vault client-noonan --category=password --title="album-guide TELEMETRY_SALT" --generate-password='letters,digits,48'
  op item get "album-guide TELEMETRY_SALT" --vault client-noonan --fields password --reveal --format json | jq -r .value | tr -d '\n' | npx wrangler secret put TELEMETRY_SALT --name album-guide-site
  ```
  Then ask a session to set `telemetry` to `true` for album-guide in `sites.json` (`wallabout-design/standards`).
- [ ] **Sentry auth token for source-map upload** (`docs/decisions/0004-error-tracking.md`). Without it, errors arrive in Sentry with minified stack traces.
  1. Create an organization token that can only upload: https://wallabout-design-llc.sentry.io/settings/auth-tokens/ → **Create New Token**, name it `album-guide source maps`. Copy it.
  2. Save it to 1Password without showing it, then clear the clipboard:
     ```sh
     eval $(op signin)   # skip if `op whoami` already works
     read -rs KEY && op item create --vault client-noonan --category="API Credential" --title="album-guide SENTRY_AUTH_TOKEN" "credential=$KEY"; unset KEY; pbcopy < /dev/null
     ```
  3. Add it to the Workers Builds build as a secret: copy it to the clipboard, paste it in the dashboard, then clear the clipboard:
     ```sh
     op item get "album-guide SENTRY_AUTH_TOKEN" --vault client-noonan --fields credential --reveal --format json | jq -r .value | tr -d '\n' | pbcopy
     ```
     Cloudflare dashboard → Workers & Pages → `album-guide-site` → Settings → Builds → **Variables and secrets** → add `SENTRY_AUTH_TOKEN`, type **Secret**, paste. Then `pbcopy < /dev/null`.
- [ ] **Sentry limits and filters for `album-guide`** (`docs/decisions/0011-sentry-setup.md`). A permission check refused the agent's attempt to set these, so they're done by hand, the same as rr's, at https://wallabout-design-llc.sentry.io/settings/projects/album-guide/:
  1. **Client Keys (DSN)** → the key → **Rate limits**: 150 events per day.
  2. **Inbound Filters**: turn on browser extensions, localhost, web crawlers and legacy browsers.
  3. **Security & Privacy**: turn on **Prevent storing of IP addresses** and the data scrubber.
- [ ] **Turn off Cloudflare Web Analytics injection on album.guide.** Cloudflare adds `static.cloudflareinsights.com/beacon.min.js` (token `907e7286…`) to every page. The CSP blocks it, so every page load logs one CSP console error, and the production checks (`docs/decisions/0013-production-checks.md`) carry a named allowance for it until it's gone. The zone's `rum` setting already reads `off` and the account lists no Web Analytics site for album.guide; an agent's attempt to create the site and disable it, as rr and wallabout.design have it, was refused by the permission check. By hand: Cloudflare dashboard → album.guide → **Analytics & Logs → Web Analytics** → disable it (or **Manage site** → automatic setup **Disable**). Then ask a session to remove `RUM_BEACON` from `e2e/production.spec.ts`.

## later

- [ ] **By 2028-09: decide whether to renew album.guide** (auto-renew is off; `DEPLOY.md`).
