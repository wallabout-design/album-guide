// Uploads a preview version of a branch to the preview Worker, with an alias
// named after the branch: https://<alias>-album-guide-site-preview.jj-23b.workers.dev
// Workers Builds sets WORKERS_CI_BRANCH; locally the current git branch is used.
// `--env preview` is what keeps it off the production Worker
// (docs/decisions/0015-preview-worker.md). Copied from wallabout-design/rr.
import { execFileSync } from 'node:child_process';

const WORKER = 'album-guide-site-preview';

const branch =
  process.env.WORKERS_CI_BRANCH ||
  execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();

// A DNS label holds 63 characters: the alias, a dash, and the Worker's name.
const alias = branch
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .slice(0, 63 - 1 - WORKER.length)
  .replace(/^-+|-+$/g, '');

if (!alias) throw new Error(`Can't make a preview alias from branch "${branch}"`);

execFileSync('npx', ['wrangler', 'versions', 'upload', '--env', 'preview', '--preview-alias', alias], {
  stdio: 'inherit',
});
console.log(`Preview: https://${alias}-${WORKER}.jj-23b.workers.dev`);
