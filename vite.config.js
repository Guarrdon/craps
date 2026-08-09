import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/*
 * Writes dist/offline.json — the list of files this game needs to run with no
 * network, plus a hash of their contents.
 *
 * The portal's service worker reads it. It cannot work the list out for itself:
 * the filenames are fingerprinted at build time, and the worker lives in
 * another repository on another bucket. The build is the only thing that knows.
 *
 * The hash is what makes a deploy land. Assets are cached under a key built
 * from it, so new bytes mean a new cache and the old one is dropped; unchanged
 * bytes mean the worker recognises the build and does nothing.
 *
 * Copied from sudoku's, which is the source of truth for the contract. If this
 * ever needs changing, it needs changing there too.
 */
function offlineManifest({ id }) {
  const MANIFEST = 'offline.json'

  return {
    name: 'offline-manifest',
    apply: 'build',
    // Last hook to run, so everything Rollup emitted and everything copied out
    // of public/ is on disk by now.
    closeBundle() {
      const dir = join(process.cwd(), 'dist')

      const walk = (from) =>
        readdirSync(from).flatMap((entry) => {
          const path = join(from, entry)
          return statSync(path).isDirectory() ? walk(path) : [path]
        })

      const assets = walk(dir)
        .map((path) => relative(dir, path).split(sep).join('/'))
        // Source maps are debugging kit, not part of the game, and they are
        // often larger than what they describe.
        .filter((name) => name !== MANIFEST && !name.endsWith('.map'))
        .sort()

      // Names as well as contents: a file that is only renamed still changes
      // what the worker has to fetch.
      const digest = createHash('sha256')
      for (const name of assets) {
        digest.update(name)
        digest.update(readFileSync(join(dir, name)))
      }

      // Hex, so it never contains the dash the worker splits cache names on.
      const build = digest.digest('hex').slice(0, 12)

      writeFileSync(
        join(dir, MANIFEST),
        JSON.stringify({ id, build, assets }, null, 2) + '\n',
      )

      const bytes = assets.reduce((sum, n) => sum + statSync(join(dir, n)).size, 0)
      this.info?.(
        `offline.json — ${assets.length} files, ${(bytes / 1024).toFixed(0)} kB, build ${build}`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineManifest({ id: 'craps' })],
  // The game is served from /games/craps/, not the root, so the build must not
  // assume where it lives. One relative build then runs anywhere: the portal, a
  // plain folder, a dev server. Getting this wrong is the usual cause of a
  // blank page, and deploy.sh refuses a build that has it wrong.
  base: './',
  server: { open: true },
  build: { target: 'es2020' },
})
