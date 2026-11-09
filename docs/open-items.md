# open items

What's waiting on JJ, as of 2026-11-09, most urgent first. Only things an agent can't do (`docs/decisions/0014-what-waits-for-jj.md`): secrets and 1Password, spending money, the Fly app, destructive changes to production data, and actions a permission check refused. Agents decide and do everything else. Tick or remove an item when it's done.

## now

Nothing. Everything from the onboarding (2026-11-09) is done; see "done" below.

## later

- [ ] **By 2028-09: decide whether to renew album.guide** (auto-renew is off; `DEPLOY.md`).

## done

JJ, 2026-11-09, from the onboarding:

- [x] Merged `wallabout-design/site` #97 (album-guide in the portal).
- [x] Added album-guide to the `site feedback` routine (repository and `album.guide` on the network allowlist).
- [x] `TELEMETRY_SALT` set on `album-guide-site`, saved in the 1Password vault `client-noonan` (created for it). Events reach `site_events` under `album-guide`.
- [x] Sentry auth token for source maps: `album-guide SENTRY_AUTH_TOKEN` in `client-noonan`, set as a Workers Builds secret.
- [x] Sentry rate limit (150 a day), inbound filters and IP scrubbing for `album-guide`.
- [x] Cloudflare Web Analytics injection off on album.guide. The production checks' allowance for it is removed.
- [x] Google Search Console: `album.guide` verified by DNS TXT, `https://album.guide/sitemap.xml` submitted. Check **Pages** coverage around 2026-11-16 and 2026-12-07.

Lesson for the next site's steps: `npx wrangler whoami` exits 0 when logged out, so `whoami || login` never logs in; run `npx wrangler login` first. And `wrangler secret put` reading piped input can't open a browser to log in.
