/*
 * Opening the table in a real browser.
 *
 * Shared by probe.mjs and play.mjs. The interesting part is clickSpot(): the
 * felt letterboxes itself inside whatever space it is given, so a coordinate
 * in layout.js has to be mapped through where the svg actually ended up before
 * the mouse can be pointed at it.
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { FELT, probeAt } from '../src/lib/layout.js'

export async function openTable({ width = 1500, height = 1000, headless = true, query = '' } = {}) {
  /*
   * Let vite pick the port and read back which one it took.
   *
   * Fixed ports were fine until two of these ran near each other and the
   * second died on "port already in use" - or worse, quietly attached to a
   * server left behind by an earlier run and measured the wrong build.
   */
  const server = spawn('npx', ['vite', '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('vite did not start')), 30000)
    server.stdout.on('data', (c) => {
      const found = /localhost:(\d+)/.exec(String(c))
      if (found) {
        clearTimeout(timer)
        ok(Number(found[1]))
      }
    })
  })

  const browser = await chromium.launch({ headless })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })

  // Anything the page complains about is a failure, not a log line. A React
  // key warning or a null dereference is exactly the sort of thing that never
  // shows up in a screenshot.
  const problems = []
  // The two shared portal scripts are absolute paths to lhstart's own origin,
  // so they are meant to 404 on a dev server - that is how a game runs on its
  // own without an exit chip pointing at a portal that is not there.
  const expected = (text) => /Failed to load resource/.test(text)
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !expected(m.text())) problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))

  await page.goto(`http://localhost:${port}/${query}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  const place = async (id) => {
    const box = await page.locator('svg.felt').boundingBox()
    const scale = Math.min(box.width / FELT.w, box.height / FELT.h)
    const [fx, fy] = probeAt(id)
    return {
      x: box.x + (box.width - FELT.w * scale) / 2 + fx * scale,
      y: box.y + (box.height - FELT.h * scale) / 2 + fy * scale,
    }
  }

  return {
    page,
    problems,
    // Click a bet spot by its layout id.
    clickSpot: async (id) => {
      const { x, y } = await place(id)
      await page.mouse.click(x, y)
    },
    // The call lives on the cloth now, not in the rail.
    say: () => page.locator('.call').textContent().catch(() => ''),
    close: async () => {
      await browser.close()
      server.kill('SIGTERM')
    },
  }
}
