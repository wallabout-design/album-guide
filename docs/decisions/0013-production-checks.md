# 0013: production checks

**Status:** accepted, 2026-11-09 (decided during the build, JJ away).

## context

The site contract asks for smoke tests that run against production on a schedule and open an issue on failure (`standards/site-contract.md`, production checks; `standards/monitoring.md`, Base tier). CI (`ci.yml`) checks the build in `wrangler dev` with the API and cover art mocked, so it can't see DNS, the custom domain, the live API or anything Cloudflare adds at the edge.

## decision

- `.github/workflows/production-checks.yml` is rr's workflow (`wallabout-design/rr`), with the same shape: `BASE_URL` switches `playwright.config.ts` to the live site, Chromium only, `e2e/production.spec.ts` only, `Sec-GPC: 1` on every request, one retry, the JSON report read into an issue labelled `production-check` (red, "Scheduled production check failed", as in rr).
- Schedule `37 */6 * * *`: four runs a day, offset from rr (`:17`) and wallabout.design (`:47`). Also `workflow_dispatch`.
- **One addition to rr's shape:** a passing run comments on the open `production-check` issue and closes it, so an open issue always means production is broken now.
- Nothing is mocked. Five page loads, one API call and one POST per run: `/` renders an album with no console errors and no hosts outside `third-parties.json`; `/v1/random` on the API answers 200 with an album, fetched from the page (so CORS and the CSP are checked), with up to three tries over 20 seconds; `/nope/deep` gets the 404 page with 404; `/robots.txt` and `/sitemap.xml` answer 200; `www.album.guide` answers 301 to the apex; `POST /api/event` from the page answers 204. Every one of those responses carries the exact headers in `worker/security-headers.ts` (`0012-security-headers.md`), as rr asserts HSTS exactly.
- **One named allowance**, matching one known production condition and nothing wider: a 5xx from the API host in the console, because the app falls back to the bundled catalog when `/v1/recs` fails and the API's health is checked on its own. (A second allowance, for Cloudflare's Web Analytics beacon, was removed on 2026-11-09 once JJ turned the beacon off.)
- No telemetry or Sentry noise: the telemetry route drops events with `Sec-GPC: 1` (and the headless browser is a bot to `isbot`), and Sentry only hears of real errors, which the checks report anyway.
- Checks run in the browser, not Playwright's `request`, so the browser's DNS and TLS are what's tested, as a visitor's would be.

## alternatives

- **Re-run the CI e2e suite against production.** Its mocks are the point of it; unmocked, its screenshot and axe checks would cost hundreds of requests a run.
- **A paid synthetic monitor** (Datadog). Ruled out in `standards/monitoring.md`.
- **Leave closing issues to a person, as rr does.** An issue left open after production recovers hides the next failure in a comment.

## revisit when

- The site gains pages or routes: add them to `e2e/production.spec.ts`.
- rr or wallabout.design change their production-checks workflow: keep the three in step.
