// wrangler.jsonc keeps production and previews apart: the production Worker
// gives no branch a URL, and the preview Worker (env.preview) has no routes
// and shares no stored data with production.
// See docs/decisions/0015-preview-worker.md.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { experimental_readRawConfig } from 'wrangler';

const { rawConfig } = experimental_readRawConfig({ config: 'wrangler.jsonc' });
const preview = rawConfig.env?.preview;

test('the production Worker has no workers.dev or preview URLs', () => {
  assert.equal(rawConfig.name, 'album-guide-site');
  assert.equal(rawConfig.workers_dev, false);
  assert.equal(rawConfig.preview_urls, false);
});

test('the preview Worker is a different Worker with no routes', () => {
  assert.ok(preview, 'env.preview is missing');
  assert.equal(preview.name, 'album-guide-site-preview');
  assert.deepEqual(preview.routes, []);
  assert.equal(preview.preview_urls, true);
});
