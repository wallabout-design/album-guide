import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// The commit this build came from (7 characters), for telemetry (src/telemetry.ts)
// and the pages' <meta name="build"> (the feedback link puts it in every note).
// Workers Builds sets WORKERS_CI_COMMIT_SHA; locally, ask git. "dev" when
// neither is available, which the Worker stores as an empty build.
function buildSha(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

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
  plugins: [react(), telemetryStub()],
  // Also fills %VITE_BUILD_SHA% in index.html and 404.html (<meta name="build">).
  define: { 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()) },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
})
