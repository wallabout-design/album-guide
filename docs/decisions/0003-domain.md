# 0003: album.guide on Cloudflare DNS as production; registration stays at Gandi

**Status:** accepted, 2026-11-08 (JJ).

## context

`album.guide` is registered at Gandi and used Gandi's nameservers, so it showed Gandi's parking page. The site contract asks for a custom domain on a Cloudflare zone.

## decision

- Move DNS for album.guide to a Cloudflare zone, copying every Gandi record except the parking ones, and make `https://album.guide` production: a Workers custom domain on `album-guide-site`, with `www.album.guide` redirecting to it.
- **Registration stays at Gandi.** Only the nameservers change.
- Until the zone is active and the custom domain is attached, production is `https://album-guide-site.jj-23b.workers.dev`.

## how it's served (2026-11-09, decided during the build)

The zone went active at 05:00 UTC on 2026-11-09. Copied from `wallabout-design/site` (its `docs/runbooks/cloudflare.md`):

- **Apex:** `"routes": [{ "pattern": "album.guide", "custom_domain": true }]` in `wrangler.jsonc`. The first production deploy creates the DNS record and certificate; nothing else may hold the apex name.
- **`www`:** a proxied placeholder record `AAAA www 100::` and a zone Single Redirect (phase `http_request_dynamic_redirect`): `http.host eq "www.album.guide"` → 301 `concat("https://album.guide", http.request.uri.path)`, query string kept. Not a second custom domain with a host check in the Worker, as rr does: the Worker runs only for `/api/*` (`run_worker_first`), so that would mean running it for every request.
- **Zone settings:** Always Use HTTPS on, minimum TLS 1.2, as on wallabout.design.
- The Gandi mail records (MX, SPF, DKIM, SRV, `webmail`) stay DNS-only and unchanged.

## why

- The domain is the site's name; serving it from Cloudflare gives headers, the custom domain and one place for DNS.
- Moving the registration is a separate, slower change (a transfer, a renewal, a lock period) and isn't needed to serve the site.

## alternatives

- **Transfer the registration to Cloudflare Registrar too.** One registrar for everything, at cost price. Not now; see below.
- **Keep Gandi DNS and point a `CNAME` at the Worker.** Workers custom domains need a Cloudflare zone. Rejected.

## revisit when

- JJ wants one registrar for all domains, or the Gandi renewal comes up: consider transferring to Cloudflare Registrar then. Until then, the renewal is JJ's to watch (`../open-items.md`).
