# 0008: the "Protect main" ruleset, copied from rr, with no required checks until CI exists

**Status:** accepted, 2026-11-08 (decided during the build, while JJ was away).

## context

`main` had no protection: anyone with push access, including `publish.sh`, pushed to it directly. `~/dev/AGENTS.md` and the site contract ask for the standard ruleset, with the CI job required once there is one. album-guide had no CI when the ruleset was added.

## decision

- A ruleset named "Protect main" on the default branch, matching `wallabout-design/rr`'s: a pull request is required (0 approvals), squash is the only merge method, force pushes and deletion are blocked, and repo admins can bypass for pull requests only.
- Repo settings: squash merging only; head branches deleted after merge.
- **No required status checks yet.** The CI job becomes required as soon as the CI PR is merged and has run on `main`.

## why

- Copying rr's ruleset keeps every repo the same.
- Requiring a check that doesn't exist yet would block every merge.

## alternatives

- **Wait for CI, then add the ruleset.** Leaves `main` open to direct pushes in between. Rejected.

## revisit when

- CI lands: add its job as a required check (and Workers Builds' check, if it proves reliable).
