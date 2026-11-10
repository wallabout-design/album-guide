# 0017: /admin behind Cloudflare Access, checked again in the Worker

**Status:** provisional, 2026-11-10 (decided by the agent while JJ was away; JJ to confirm). Follows `standards/login.md` ("staff") and rr's decision 0005.

## context

Staff need to sign in to manage collections (0016). The shared standard for staff login is Cloudflare Access with an emailed one-time PIN, with the Worker checking Access's token itself.

## decision

- **Production**: a self-hosted Access application on `album.guide/admin*` in the account's Zero Trust team, one-time PIN as its only login method, and an Allow policy naming the staff emails.
- **The Worker checks too** (`worker/admin-auth.ts`): it verifies the `Cf-Access-Jwt-Assertion` token against `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, then checks the email against `ADMIN_EMAILS` (comma-separated). All three are **secrets on the production Worker**, not vars, because this repo is public and one of them is a list of email addresses. With any of them missing, everyone gets a 403.
- **One place checks everything**: `worker/admin.ts` handles `/admin`, `/admin/*` and `/admin.*`, and checks the sign-in before it serves the page, reads or writes. Signed out, the page itself is a 403 with no app in it. The API is under `/admin/api/*` so the one Access application covers page and API.
- **Writes** also need this site's own `Origin` and an `X-Admin-Request` header, which a form or script on another site can't send, a JSON body, and at most 64 KB.
- **Previews and tests** have no Access. The preview Worker declares `ADMIN_TEST_CODE` as a var; typing it at `/admin` sets an `HttpOnly`, `SameSite=Lax` cookie derived from the code, good for eight hours. The code is public on purpose: the preview's data is fake and is reset on every upload. Production declares no such var, the Worker refuses the test sign-in on `album.guide` whatever is configured, and `worker/tests/config.test.ts` and `admin.test.ts` check both.
- Every admin response is `Cache-Control: no-store`.

## why

- Access is configuration, not login code to keep secure. Checking the token again means a misconfigured Access application can't open the admin.
- The email list as a secret keeps addresses out of a public repo and lets JJ add someone without a deploy: change the Access policy and `ADMIN_EMAILS`.

## alternatives

- **Email list in code**, as rr's `OWNER_EMAIL` var. Rejected: public repo.
- **Access on the preview Worker's workers.dev address.** It gates the whole preview, which blocks reviewers using the feedback link (the audit, 2026-11-10).
- **The test code as a secret on the preview Worker.** Keeps strangers out of the preview admin, but CI and local runs need the code too, and the preview holds nothing worth protecting. Revisit if previews ever hold real data or uploads.

## known gaps

- Anyone who reads this repo can sign in to a preview's admin and change its fake data.
- When an Access session ends while the admin is open, the next save fails; the page says to reload and sign in again.

## how to revert

Delete the Access application and the three secrets (`npx wrangler secret delete ...`): the Worker then refuses everyone. Reverting the PR removes the routes.

## revisit when

- A second site uses this: move `admin-auth.ts` into the shared package with the collections library.
- Cloudflare Access supports passkeys (`standards/login.md`).
