# 0014: agents decide and merge; only secrets, money, Fly and refused actions wait for JJ

**Status:** accepted, 2026-11-09. Replaces the "ask JJ before merging" rule in `AGENTS.md` and narrows `docs/open-items.md`.

## context

`AGENTS.md` asked agents to wait for JJ before merging anything touching the Worker, `wrangler.jsonc`, the domain or DNS, the API contract or secrets. During the onboarding build that left a queue of approvals and choices for JJ. On 2026-11-09 JJ said: "i think you're leaving too many decisions for me, reevaluate and lower the bar".

## decision

- Agents decide, do the work, and merge their own PRs once the required checks (`check`, `e2e`) and the Workers Builds preview pass and the preview was checked at mobile and desktop widths. That includes the Worker, `wrangler.jsonc`, the domain, DNS and the API contract.
- Every decision is written in the PR body, or in a decision record when it's structural, so JJ can find and revert it.
- Only these wait for JJ (PR labelled `needs-review`, item in `docs/open-items.md`):
  - anything that needs a secret or 1Password;
  - anything that spends money;
  - a Fly deploy or any change to the Fly app `album-guide-api` (JJ's);
  - destructive changes to production data;
  - any action a permission check refused. It is never worked around.
- `docs/open-items.md` holds only those, most urgent first, each with exact steps.

## why

- JJ asked for it. The checks, previews and rollback (`npx wrangler rollback`) catch and undo most mistakes faster than a wait for approval.
- The remaining items are the ones an agent can't or shouldn't do: it has no access to secrets, shouldn't spend JJ's money, doesn't own the Fly app, and can't undo lost data.

## alternatives

- **Keep the per-area list** (Worker, DNS, API contract). Rejected: it's what JJ asked to change.

## revisit when

- A merged change causes an outage that a review would have caught: add that area back to the list.
