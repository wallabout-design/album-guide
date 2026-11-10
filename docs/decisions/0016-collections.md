# 0016: staff-managed collections on D1, with the admin as a separate entry

**Status:** provisional, 2026-11-10 (decided by the agent while JJ was away; JJ to confirm). A trial for the shared standard `standards/collections.md` in `wallabout-design/standards`.

## context

A prospect's site lists people and classes that its staff add and remove regularly. That is the "client needs a CMS" case, and the shared standard had only one answer for it: the WordPress exception track. album.guide is the playground for a smaller answer, with "staff picks" standing in for the prospect's lists.

`standards/stack.md` says a site with logins and data it writes is an application and should be React Router. This site is a Vite single-page app on a hand-written Worker.

## decision

- **Collections** (`src/lib/collections/`): a collection is declared in code (`src/collections.ts`), its records are rows in D1. One generic schema (`migrations/0001_collections.sql`: `records` and `record_history`) serves every collection, so a new collection or field needs no migration.
- **Two D1 databases**: `album-guide` on the production Worker, `album-guide-preview` on the preview Worker (0015). `npm run ship:production` applies migrations before each deploy; previews also load `scripts/seed-preview.sql`.
- **Public read**: `GET /api/collections/<name>?cursor=&limit=`, published records only, 12 a page for picks, at most 50, cached for a minute with an ETag.
- **The site is not moved to React Router.** The public page and the admin are small separate Vite entries next to `index.html`; the Worker's route table grows by a few lines. All rules sit in the framework-free library, which is the part of `stack.md` that matters here (the layering rule).
- **Database ids are in `wrangler.jsonc`**, in a public repo. An id is not a credential: it is useless without an account token. rr does the same.
- **End-to-end tests** get scratch collections (`test-*`) through a flag passed only to the local Worker (`npm run e2e:server`), so each test has its own records.

## why

- The library is plain TypeScript behind a store interface, so it is unit-tested without a Worker, and the same folder can move to a shared package for the next site.
- Moving a 670-line single-page app to React Router to add two small pages would be a rewrite with no gain for visitors.

## alternatives

- **A headless CMS (Sanity, Payload), a git-based CMS (Decap), or WordPress.** Compared in `standards/collections.md`.
- **A table per collection.** Typed columns and real indexes, but a migration for every new field, on every site. Revisit if a collection outgrows a few thousand records or needs queries the JSON column can't serve.
- **Move to React Router first.** Right for a new site with an admin; not worth it here.
- **Automatic D1 provisioning (no id in the config).** Not verified on the pinned wrangler, and migrations need to name the database either way.

## known gaps

- Every branch preview shares one preview database. A branch that adds a migration applies it there for all previews.
- The list is cached in the browser for a minute, so staff may wait that long to see a change on the public page.

## how to revert

Revert the collections PRs in reverse order. The databases can stay; nothing else reads them. To drop them: `npx wrangler d1 delete album-guide` and `album-guide-preview` (JJ: destructive).

## revisit when

- The next site with an admin is built: start it in React Router and lift `src/lib/collections/` into a package.
- A collection needs search or filters on the public side.
