import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The commit being built, for each page's <meta name="build"> (the feedback
// link puts it in every note). Workers Builds sets WORKERS_CI_COMMIT_SHA;
// locally, ask git. "dev" when neither is available.
function buildSha(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

// Fills %BUILD_SHA% in every HTML entry (index.html and 404.html).
function buildShaInHtml(): Plugin {
  const sha = buildSha()
  return {
    name: 'build-sha-in-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%BUILD_SHA%', sha),
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Root-relative: the site is served at the domain root (album.guide, and
  // *.workers.dev for previews). The 404 page is served at any depth, where
  // relative asset URLs would resolve under the missing path and break.
  base: '/',
  plugins: [react(), buildShaInHtml()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
})
