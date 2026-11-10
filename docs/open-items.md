# open items

What's waiting on JJ, as of 2026-11-10, most urgent first. Only things an agent can't do (`docs/decisions/0014-what-waits-for-jj.md`): secrets and 1Password, spending money, the Fly app, destructive changes to production data, and actions a permission check refused. Agents decide and do everything else. Tick or remove an item when it's done.

## now

From the collections trial (2026-11-10, built while JJ was away; `docs/decisions/0015` to `0017`):

- [ ] **Sign in to the production admin once.** Open https://album.guide/admin, enter your email, type the code Cloudflare sends. Nobody has done this yet: an agent can't receive the code. Check that the list shows four sample picks, edit one, and look at https://album.guide/picks a minute later. If `/admin` says "Staff only" after the code, the Worker's settings are wrong: `npx wrangler secret list` should show `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ADMIN_EMAILS`.
- [ ] **Remove or replace the four sample picks** (Blue Lines, Loveless, Kid A, To Pimp a Butterfly). They were inserted with SQL after passing the library's checks, not typed into the form, and each note says it is a sample.
- [ ] **Confirm or change decisions 0015, 0016 and 0017.** Each has a "how to revert".
- [ ] **Optional: source maps for previews.** Preview builds no longer upload them, because the build secret sits on the production Worker's triggers only and an agent can't read it. In the Cloudflare dashboard: Workers & Pages, `album-guide-site-preview`, Settings, Build, Variables and secrets: add `SENTRY_AUTH_TOKEN` as a secret (1Password vault `client-noonan`, item `album-guide SENTRY_AUTH_TOKEN`).

To add a member of staff later, do both: add their email to the `owner` policy of the Access application "album.guide admin" (Zero Trust, Access, Applications), and set the Worker's list again with every address in it:

```sh
printf 'first@example.com,second@example.com' | npx wrangler secret put ADMIN_EMAILS
```

`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ADMIN_EMAILS` are set as Worker secrets to keep them out of this public repo. None is a credential, so they are not in 1Password.

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
