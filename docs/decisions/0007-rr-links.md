# 0007: rr's links to album-guide are updated through a ready-to-build issue

**Status:** accepted, 2026-11-08 (JJ).

## context

album-guide's public URL changes from `jj-noonan.github.io/album-guide/` to `https://album.guide`. `wallabout-design/rr` might link to it. A grep of rr on 2026-11-08 found no link.

## decision

Once `https://album.guide` serves the site, file an issue in `wallabout-design/rr` labelled `ready-to-build` (JJ's label, given 2026-11-08): replace every old form (`jj-noonan.github.io/album-guide`, `album-guide-api.fly.dev` used as a page link, `music-recs`) in rr's code, content, tests and seed data with `https://album.guide`. If none is found, close the issue with a comment rather than opening an empty PR.

## why

- Keeps the change in rr's own repo and workflow; the build queue picks it up.
- Waiting for production avoids linking to a domain that doesn't serve yet.

## alternatives

Not recorded: this record was written after the decision was made.

## revisit when

Not expected to change.
