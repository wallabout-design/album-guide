# 0003: album.guide on Cloudflare DNS as production; registration stays at Gandi

**Status:** accepted, 2026-11-08 (JJ).

## context

`album.guide` is registered at Gandi and used Gandi's nameservers, so it showed Gandi's parking page. The site contract asks for a custom domain on a Cloudflare zone.

## decision

- Move DNS for album.guide to a Cloudflare zone, copying every Gandi record except the parking ones, and make `https://album.guide` production: a Workers custom domain on `album-guide-site`, with `www.album.guide` redirecting to it.
- **Registration stays at Gandi.** Only the nameservers change.
- Until the zone is active and the custom domain is attached, production is `https://album-guide-site.jj-23b.workers.dev`.

## why

- The domain is the site's name; serving it from Cloudflare gives headers, the custom domain and one place for DNS.
- Moving the registration is a separate, slower change (a transfer, a renewal, a lock period) and isn't needed to serve the site.

## alternatives

- **Transfer the registration to Cloudflare Registrar too.** One registrar for everything, at cost price. Not now; see below.
- **Keep Gandi DNS and point a `CNAME` at the Worker.** Workers custom domains need a Cloudflare zone. Rejected.

## revisit when

- JJ wants one registrar for all domains, or the Gandi renewal comes up: consider transferring to Cloudflare Registrar then. Until then, the renewal is JJ's to watch (`../open-items.md`).
