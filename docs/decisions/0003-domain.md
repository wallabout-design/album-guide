# 0003: album.guide on Cloudflare DNS as production; registration stays at Gandi

**Status:** accepted, 2026-11-08 (JJ).

## context

`album.guide` is registered at Gandi and used Gandi's nameservers, so it showed Gandi's parking page. The site contract asks for a custom domain on a Cloudflare zone.

## decision

- Move DNS for album.guide to a Cloudflare zone, copying every Gandi record except the parking ones, and make `https://album.guide` production: a Workers custom domain on `album-guide-site`, with `www.album.guide` redirecting to it.
- **Registration stays at Gandi.** Only the nameservers change.
- Until the zone is active and the custom domain is attached, production is `https://album-guide-site.jj-23b.workers.dev`.

## how it's served (2026-11-09, decided during the build)

The zone went active at 05:00 UTC on 2026-11-09, and `https://album.guide` went live at 05:12 with the next production deploy.

- **Apex:** a Workers custom domain, `{ "pattern": "album.guide", "custom_domain": true }` in `wrangler.jsonc`. The deploy creates the DNS record and certificate.
- **`www`:** also a custom domain on the same Worker, which answers it with a 301 to `https://album.guide` plus the same path and query (`worker/index.ts`), as `wallabout-design/rr` does. A host can't be matched by `run_worker_first`'s path list, so it is `true`: the Worker runs first for every request and hands everything outside `/api/*` to the `ASSETS` binding, which still serves `404.html` for unknown paths.
- **Superseded plan:** a zone Single Redirect with a proxied `AAAA www 100::` placeholder, as on wallabout.design, which keeps the Worker off page requests. It was dropped because it lives in zone config rather than the repo, and the zone write was refused in the build session. The cost of the Worker approach is one Worker invocation per request, well inside the free plan.
- HTTPS-only and HSTS come with the security headers (`public/_headers`), not zone settings.
- The Gandi mail records (MX, SPF, DKIM, SRV, `webmail`) stay DNS-only and unchanged.

## why

- The domain is the site's name; serving it from Cloudflare gives headers, the custom domain and one place for DNS.
- Moving the registration is a separate, slower change (a transfer, a renewal, a lock period) and isn't needed to serve the site.

## alternatives

- **Transfer the registration to Cloudflare Registrar too.** One registrar for everything, at cost price. Not now; see below.
- **Keep Gandi DNS and point a `CNAME` at the Worker.** Workers custom domains need a Cloudflare zone. Rejected.

## revisit when

- JJ wants one registrar for all domains, or the Gandi renewal comes up: consider transferring to Cloudflare Registrar then. Until then, the renewal is JJ's to watch (`../open-items.md`).
