# 0001: move the repo to wallabout-design now

**Status:** accepted, 2026-11-08 (JJ). Done the same day.

## context

The repo was `jj-noonan/album-guide`, public, deployed to GitHub Pages at `jj-noonan.github.io/album-guide/`. The shared standard moves JJ's own sites into `wallabout-design` when they're onboarded (`standards/site-contract.md` §repository location), so the portal, the build queue and one org token cover them. GitHub redirects a transferred repo's URL, but not a project Pages site on `<user>.github.io`.

## decision

- Transfer the repo to `wallabout-design/album-guide` before production moves, and accept that the Pages URL stops working.
- Clone URL from now on: `https://github.com/wallabout-design/album-guide.git`. The live main checkout's `origin` was updated with `git remote set-url`.

## why

- Nobody uses the Pages URL, and the site has no real users yet, so a gap in service costs nothing.
- Moving first lets the rest of the onboarding (Workers Builds, CI, rulesets, the build queue) be set up once, in the org.

## alternatives

- **Move production to Workers on album.guide first, then transfer.** No gap at the old URL, but every org-level step waits on DNS. Not worth it with no users.

## revisit when

Not expected to change.
