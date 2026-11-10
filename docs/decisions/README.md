# decision records

One file per decision that is expensive to reverse or likely to be questioned. Numbered in order; never renumber.

| # | decision | status |
| --- | --- | --- |
| [0001](0001-transfer-to-wallabout-design.md) | move the repo to wallabout-design now | accepted |
| [0002](0002-hosting.md) | Workers static assets and Workers Builds, with no separate preview Worker | accepted; the preview part superseded by 0015 |
| [0003](0003-domain.md) | album.guide on Cloudflare DNS as production; registration stays at Gandi | accepted |
| [0004](0004-error-tracking.md) | Sentry for browser errors, tunnelled through the Worker | accepted |
| [0005](0005-search-basics.md) | the site is public and meant to be found, so search basics apply | accepted |
| [0006](0006-publish-through-a-pr.md) | `publish.sh` lands catalog snapshots through a PR | accepted |
| [0007](0007-rr-links.md) | rr's links to album-guide are updated through a ready-to-build issue | accepted |
| [0008](0008-protect-main.md) | the "Protect main" ruleset, copied from rr | accepted |
| [0009](0009-telemetry.md) | first-party telemetry through the Worker's `/api/event` | accepted |
| [0010](0010-real-404-and-root-base.md) | a real 404 page, and root-relative asset URLs | accepted |
| [0011](0011-sentry-setup.md) | how Sentry is wired in | accepted |
| [0012](0012-security-headers.md) | a content security policy and hardening headers, built from `third-parties.json` | accepted |
| [0013](0013-production-checks.md) | scheduled checks against production | accepted |
| [0014](0014-what-waits-for-jj.md) | agents decide and merge; only secrets, money, Fly and refused actions wait for JJ | accepted |
| [0015](0015-preview-worker.md) | a separate preview Worker | accepted |

## adding one

1. Take the next free number (check open PRs too) and name the file `NNNN-short-name.md`.
2. Start with `# NNNN: the decision in a few words`, then `**Status:**` (accepted, provisional, or superseded by NNNN) with the date and how it was decided.
3. Sections: **context**, **decision**, **why**, **alternatives**, **revisit when**.
4. Add a row to the table above in the same PR.
5. To change a decision, add a new record and mark the old one superseded. Don't edit an accepted record's decision.
