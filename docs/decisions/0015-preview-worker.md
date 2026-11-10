# 0015: a separate preview Worker

**Status:** accepted, 2026-11-10 (decided by the agent while JJ was away; JJ to confirm). Supersedes the "no separate preview Worker" part of [0002](0002-hosting.md).

## context

0002 kept previews as versions of the production Worker because the site held no data, and said to revisit "when the Worker gains data ... or anything that writes". It is about to: staff-managed collections stored in D1, with an admin (`0016`). A version of the production Worker uses production's bindings and secrets, so every branch preview would read and write the production database.

## decision

Two Workers, built from the same code, as rr has (rr's decision 0008):

| | production | preview |
| --- | --- | --- |
| Worker | `album-guide-site` | `album-guide-site-preview` |
| URL | album.guide | `<branch>-album-guide-site-preview.jj-23b.workers.dev` per branch, and `album-guide-site-preview.jj-23b.workers.dev` for `main` |
| `workers.dev` and preview URLs | off | on |
| secrets | `TELEMETRY_SALT` | none of production's |
| telemetry | counted | `/api/event` answers 204 and writes nothing (no salt) |

- The preview Worker is `env.preview` in `wrangler.jsonc`, with every binding declared again (env config doesn't inherit them).
- Workers Builds has one set of triggers per Worker:
  - `album-guide-site`: `main` only, `npm run build:production` then `npm run ship:production`. Its branch trigger is deleted, so no branch builds against production.
  - `album-guide-site-preview`: every branch, `npm run build:preview`, then `npm run ship:branch` (`wrangler versions upload --env preview --preview-alias <branch>`); `main` runs `npm run ship:preview`.
- The triggers were set through the Cloudflare API (`/accounts/{id}/builds/triggers`), not the dashboard.
- `worker/tests/config.test.ts` fails if the production Worker gets a preview URL back or the preview Worker gains a route.

## why

- Isolation by construction: the preview Worker has no binding to production data, so no bug or test on a branch can reach it.
- A second Worker costs nothing at this size.
- There is no Cloudflare Vite plugin here, so `--env preview` takes effect when the Worker is uploaded. rr's trap, where the env is fixed at build time, doesn't apply, and no `assert-target` script is needed.

## alternatives

- **Keep previews on the production Worker and guard every write in code.** One missed check writes to production. Rejected.
- **Worker Previews with their own bindings** (`wrangler preview`, beta). A missing override falls back to production config. Revisit when it leaves beta, as rr will.

## known gaps

- Preview URLs changed shape: `-album-guide-site-preview` where they had `-album-guide-site`. The feedback routine's network allow-list may name the old shape.
- Preview builds no longer upload source maps to Sentry: `SENTRY_AUTH_TOKEN` is a build secret on the production Worker's triggers only, and an agent can't read it to copy it. Errors from previews still arrive, with minified stack traces.
- The production Worker's `workers.dev` address is off. Nothing used it.

## how to revert

Revert this PR, then in Workers Builds restore the branch trigger on `album-guide-site` (`npx wrangler versions upload`, every branch except `main`) and delete the triggers on `album-guide-site-preview`. Only safe while the production Worker has no database.

## revisit when

- `wrangler preview` leaves beta.
- Previews need production-like data: copy it in, never bind production's database.
