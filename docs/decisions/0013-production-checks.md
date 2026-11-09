# 0013: production checks

**Status:** accepted, 2026-11-09 (decided during the build, JJ away).

## context

The site contract asks for smoke tests that run against production on a schedule and open an issue on failure (`standards/site-contract.md`, production checks; `standards/monitoring.md`, Base tier). CI (`ci.yml`) checks the build in `wrangler dev` with the API and cover art mocked, so it can't see DNS, the custom domain, the live API or anything Cloudflare adds at the edge.

## decision

- `.github/workflows/production-checks.yml` is rr's workflow (`wallabout-design/rr`), with the same shape: `BASE_URL` switches `playwright.config.ts` to the live site, Chromium only, `e2e/production.spec.ts` only, `Sec-GPC: 1` on every request, one retry, the JSON report read into an issue labelled `production-check` (red, "Scheduled production check failed", as in rr).
- Schedule `37 */6 * * *`: four runs a day, offset from rr (`:17`) and wallabout.design (`:47`). Also `workflow_dispatch`.
- **One addition to rr's shape:** a passing run comments on the open `production-check` issue and closes it, so an open issue always means production is broken now.
- Nothing is mocked. Five page loads and one POST per run: `/` with the real API (every API response must be 200) and covers, `/nope/deep` (404 page, 404), `/robots.txt`, `/sitemap.xml`, `www.album.guide` (301 to the apex), and `POST /api/event` from the page (204).
- No telemetry or Sentry noise: the telemetry route drops events with `Sec-GPC: 1` (and the headless browser is a bot to `isbot`), and Sentry only hears of real errors, which the checks report anyway.
- Checks run in the browser, not Playwright's `request`, so the browser's DNS and TLS are what's tested, as a visitor's would be.
- **Security headers aren't asserted yet.** rr asserts HSTS exactly, not tolerantly, and `public/_headers` (`0012-security-headers.md`) isn't merged. A follow-up issue adds the assertion and reads the allowed hosts from `third-parties.json` once it is.

## alternatives

- **Re-run the CI e2e suite against production.** Its mocks are the point of it; unmocked, its screenshot and axe checks would cost hundreds of requests a run.
- **A paid synthetic monitor** (Datadog). Ruled out in `standards/monitoring.md`.
- **Leave closing issues to a person, as rr does.** An issue left open after production recovers hides the next failure in a comment.

## revisit when

- The site gains pages or routes: add them to `e2e/production.spec.ts`.
- rr or wallabout.design change their production-checks workflow: keep the three in step.
