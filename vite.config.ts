import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// The commit this build came from (7 characters), for telemetry (src/telemetry.ts)
// and the pages' <meta name="build"> (the feedback link puts it in every note).
// Workers Builds sets WORKERS_CI_COMMIT_SHA; locally, ask git. "dev" when
// neither is available, which the Worker stores as an empty build.
export function buildSha(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

// Sentry's environment (src/monitoring.ts). Workers Builds sets WORKERS_CI and
// WORKERS_CI_BRANCH: main is production, every other branch a preview. Any
// other build (local, GitHub Actions CI, the checks) gets "", which keeps
// Sentry off, so only deployed pages report errors.
function sentryEnvironment(): string {
  if (process.env.WORKERS_CI !== '1') return ''
  // The preview Worker also builds main, for its own main URL
  // (npm run build:preview; docs/decisions/0015-preview-worker.md).
  if (process.env.PREVIEW_WORKER === '1') return 'preview'
  return process.env.WORKERS_CI_BRANCH === 'main' ? 'production' : 'preview'
}

// Source maps for Sentry. Every build injects Sentry debug IDs and writes
// hidden maps; only a build with SENTRY_AUTH_TOKEN (a Workers Builds secret,
// docs/open-items.md) uploads them. scripts/remove-source-maps.mjs deletes the
// maps after the build so they're never served. docs/decisions/0011-sentry-setup.md.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

// `vite` and `vite preview` have no Worker, so answer the telemetry beacon
// with the 204 the Worker gives instead of a 404 in the console. Nothing is
// recorded locally.
function telemetryStub(): Plugin {
  const stub = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use('/api/event', (req, res, next) => {
      if (req.method !== 'POST') return next()
      res.statusCode = 204
      res.end()
    })
  }
  return { name: 'telemetry-stub', configureServer: stub, configurePreviewServer: stub }
}

// https://vite.dev/config/
export default defineConfig({
  // Root-relative: the site is served at the domain root (album.guide, and
  // *.workers.dev for previews). The 404 page is served at any depth, where
  // relative asset URLs would resolve under the missing path and break
  // (docs/decisions/0010-real-404-and-root-base.md).
  base: '/',
  plugins: [
    react(),
    telemetryStub(),
    sentryVitePlugin({
      org: 'wallabout-design-llc',
      project: 'album-guide',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: { name: buildSha(), inject: false, create: uploadSourceMaps },
      sourcemaps: { disable: uploadSourceMaps ? false : 'disable-upload' },
    }),
  ],
  define: {
    // Also fills %VITE_BUILD_SHA% in index.html and 404.html (<meta name="build">),
    // and is Sentry's release (src/monitoring.ts).
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()),
    'import.meta.env.VITE_SENTRY_ENVIRONMENT': JSON.stringify(sentryEnvironment()),
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
})
