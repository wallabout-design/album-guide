#!/usr/bin/env bash
# Refresh the published catalog snapshot and deploy.
#
# The site serves a frozen export, so publishing means: re-export from SQLite
# and, if the data actually changed, land it on main. `main` is protected, so
# it lands through a pull request (docs/decisions/0006-publish-through-a-pr.md):
#
#   1. export into this checkout, as before;
#   2. commit the snapshot in a temporary worktree made from origin/main, on a
#      new branch publish/catalog-<timestamp>, so this checkout never switches
#      branch (it is usually the live main checkout the jobs run from);
#   3. push the branch, open a PR, wait for its checks, squash-merge it;
#   4. remove the worktree and branch, and fast-forward this checkout.
#
# Workers Builds deploys main to production after the merge.
#
#   bash scripts/publish.sh              # the real thing
#   bash scripts/publish.sh --dry-run    # everything up to the push, then undo
#   bash scripts/publish.sh --no-export  # publish the catalog.json on disk as is
#
# Never resets, cleans or force-pushes. If a step fails after the PR is open,
# the PR is left open and its URL logged; nothing in this checkout is lost.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

DRY_RUN=0
EXPORT=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-export) EXPORT=0 ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done

SNAPSHOT=src/data/catalog.json   # the only path a publish commits
PY=.venv/bin/python

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ "$EXPORT" = 1 ]; then
  log "publishing — db state:"
  $PY -c "
import sys; sys.path.insert(0,'scripts'); import db
c = db.connect(); print('   ', db.stats(c)); print('   ', db.crawl_progress(c))"

  # Freshly crawled albums have no listener count until a sweep ends, and the
  # export stratifies by popularity — without this they would all pile into the
  # bottom decile and crowd out the real deep cuts.
  log "backfilling popularity before export"
  $PY scripts/backfill_popularity.py 2>&1 | tail -2

  $PY scripts/export_catalog.py || { log "export failed"; exit 1; }
else
  log "--no-export: publishing the $SNAPSHOT already on disk"
fi

[ -f "$SNAPSHOT" ] || { log "$SNAPSHOT is missing"; exit 1; }

# Compare against what main actually serves, not this checkout's HEAD, which
# may be behind origin.
git fetch -q origin main || { log "git fetch failed"; exit 1; }
if git show "origin/main:$SNAPSHOT" 2>/dev/null | cmp -s - "$SNAPSHOT"; then
  log "catalog unchanged from origin/main — nothing to publish"
  exit 0
fi

read -r ALBUMS TOTAL < <(python3 -c "
import json; s = json.load(open('$SNAPSHOT'))['stats']; print(s['albums'], s['totalInDb'])")
[ -n "${TOTAL:-}" ] || { log "could not read stats from $SNAPSHOT"; exit 1; }

STAMP=$(date '+%Y%m%d-%H%M%S')
BRANCH="publish/catalog-$STAMP"
WT="$(dirname "$ROOT")/$(basename "$ROOT")-publish-$STAMP"
TITLE="Publish catalog snapshot: ${ALBUMS} of ${TOTAL} albums"

# Leave no stray worktree behind. `worktree remove` without --force refuses a
# dirty tree, so this can never throw away an uncommitted change. The local
# branch is deleted only once it is merged, or in a dry run (whose commit is a
# copy of the snapshot still on disk in this checkout).
cleanup() {
  if [ -d "$WT" ]; then
    git worktree remove "$WT" 2>/dev/null || log "left worktree $WT in place (not clean)"
  fi
}
trap cleanup EXIT

git worktree add -q --no-track -b "$BRANCH" "$WT" origin/main \
  || { log "could not create worktree $WT"; exit 1; }
cp "$SNAPSHOT" "$WT/$SNAPSHOT"
git -C "$WT" add -- "$SNAPSHOT"
git -C "$WT" commit -q -m "$TITLE" || { log "commit failed (branch $BRANCH kept)"; exit 1; }
log "committed on $BRANCH in $WT:"
git -C "$WT" show --stat --format='%h %s' HEAD | sed 's/^/    /'

if [ "$DRY_RUN" = 1 ]; then
  log "dry run, would run: git -C $WT push -u origin HEAD"
  log "dry run, would run: gh pr create --base main --head $BRANCH --title \"$TITLE\""
  log "dry run, would run: gh pr checks <pr> --watch, then gh pr merge <pr> --squash"
  log "dry run, would run: git fetch origin && git merge --ff-only origin/main (main checkout only)"
  cleanup
  git branch -q -D "$BRANCH" && log "dry run: removed $WT and $BRANCH"
  log "dry run: skipping the API deploy"
  exit 0
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) || { log "gh can't see the repo"; exit 1; }

git -C "$WT" push -q -u origin HEAD || { log "push failed (branch $BRANCH kept locally)"; exit 1; }

BODY="## Problem

The bundled catalog (\`$SNAPSHOT\`) is behind the crawl database.

## Solution

- Re-exported \`$SNAPSHOT\` from \`data/catalog.sqlite\`: ${ALBUMS} of ${TOTAL} albums.
- Opened and merged by \`scripts/publish.sh\`; no other path changes.

## Validation

- \`scripts/export_catalog.py\` finished without errors.
- \`publish.sh\` merges this only once every check on it has passed.
- Deploy risk: low (data snapshot only)."

PR=$(gh pr create -R "$REPO" --base main --head "$BRANCH" --title "$TITLE" --body "$BODY") \
  || { log "gh pr create failed; branch $BRANCH is pushed"; exit 1; }
log "opened $PR"

# Give CI and Workers Builds a moment to register their checks, then wait for
# all of them. No checks at all (no CI yet) is not a failure.
sleep 30
CHECKS=$(gh pr checks "$PR" -R "$REPO" --watch --interval 20 2>&1); CODE=$?
if [ "$CODE" -ne 0 ] && ! grep -q "no checks reported" <<<"$CHECKS"; then
  log "checks did not pass; leaving $PR open for review"
  echo "$CHECKS" | tail -20
  exit 1
fi

gh pr merge "$PR" -R "$REPO" --squash || { log "merge failed; $PR is open"; exit 1; }
log "merged $PR; Workers Builds deploys main to production"

cleanup
git branch -q -D "$BRANCH" || true

# Bring this checkout up to date without touching anything else in it. The
# export left $SNAPSHOT modified here; when it matches what was just merged,
# staging it lets the fast-forward through (the content is already on main,
# so nothing is lost). Anything else that blocks a fast-forward is left alone.
if [ "$(git branch --show-current)" = "main" ]; then
  git fetch -q origin main
  if git show "origin/main:$SNAPSHOT" | cmp -s - "$SNAPSHOT"; then
    git add -- "$SNAPSHOT"
  fi
  git merge -q --ff-only origin/main \
    || log "this checkout can't fast-forward to origin/main; left as it is — run git pull --ff-only by hand"
else
  log "this checkout is on $(git branch --show-current), not main; not updating it"
fi

# The API serves its own copy of the database, so publishing the bundle alone
# leaves browsing on stale data while the offline floor is fresh — the opposite
# of what anyone would expect. Both move together or the two disagree about
# what the catalog contains. The Fly app is JJ's: agents never run this part.
if [ "${SKIP_API:-0}" = "1" ]; then
  log "SKIP_API=1 — leaving the API on its current snapshot"
  exit 0
fi
if ! command -v fly >/dev/null 2>&1; then
  log "flyctl not installed — the API still serves its previous snapshot."
  log "  install it, then: .venv/bin/python api/make-api-db.py && fly deploy"
  exit 0
fi

# Cheap, and it has caught a broken image twice. Better here than after a
# deploy has reported success and the URL has stopped answering.
log "checking for shadowed definitions"
$PY api/dupe-check.py || { log "duplicate definitions — not deploying"; exit 1; }

log "checking the image has everything the server imports"
bash api/image-check.sh || { log "image check failed — not deploying the API"; exit 1; }

log "rebuilding the API database"
$PY api/make-api-db.py || { log "api db build failed"; exit 1; }
log "deploying the API"
fly deploy || { log "fly deploy failed — the site is live on the new bundle,"; log "  but the API is still on its previous snapshot"; exit 1; }
log "API updated; both halves now serve the same catalog"
