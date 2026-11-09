# 0005: the site is public and meant to be found, so search basics apply

**Status:** accepted, 2026-11-08 (JJ).

## context

The site contract's search basics row (sitemap, robots, canonical URL, description, Open Graph, a real 404, structured data) applies to every site, but a private site can take an exception, as rr does. album.guide is public.

## decision

album.guide meets the search basics in full: `sitemap.xml` and `robots.txt` at build, a canonical URL and description, Open Graph tags on `https://album.guide`, a real 404 page that returns 404, and `WebSite` structured data. No exception.

## why

- It's a public site meant to be found and shared; the social card and a stable canonical URL matter when someone posts a link.

## alternatives

- **An exception like rr's** (`noindex`, disallow-all `robots.txt`). Rejected: album.guide isn't private.

## revisit when

- The site gains per-album pages: add them to the sitemap and give each its own canonical URL and card.
