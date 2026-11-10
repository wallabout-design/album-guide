// The site's small extra pages: /admin (staff only) and /picks. They
// are built on their own, after the app (vite.config.ts), into the same dist/:
// a second build keeps the app's bundle one self-contained file, which
// scripts/dist-check.ts runs as a whole, and keeps these pages from ever
// sharing a chunk with the 6.8 MB catalog. docs/decisions/0016-collections.md.
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildSha } from './vite.config.ts'

export default defineConfig({
  base: '/',
  plugins: [react()],
  // dist/ already holds the app and everything in public/.
  publicDir: false,
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()),
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
        picks: fileURLToPath(new URL('./picks.html', import.meta.url)),
      },
    },
  },
})
