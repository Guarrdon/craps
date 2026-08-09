#!/usr/bin/env node
/*
 * A photograph of the table.
 *
 * Hand-authored SVG geometry cannot be checked by reading it. This starts the
 * dev server, opens the page and writes a PNG, so the felt can be held up
 * against the reference photographs it was drawn from.
 *
 *   node scripts/shot.mjs                       the whole table
 *   node scripts/shot.mjs --out felt.png        somewhere else
 *   node scripts/shot.mjs --width 2400          bigger
 *   node scripts/shot.mjs --clip 1050,0,450,860 just the centre
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const OUT = resolve(flag('out', 'docs/felt.png'))
const WIDTH = Number(flag('width', 1800))
const HEIGHT = Number(flag('height', Math.round((WIDTH * 860) / 1500) + 60))
const PORT = Number(flag('port', 5199))
const CLIP = flag('clip', null)

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit'],
})

const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('vite did not start')), 30000)
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('Local:')) {
      clearTimeout(timer)
      ok()
    }
  })
})

try {
  await ready
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  // Fonts settle a frame or two after the page is otherwise done, and a shot
  // taken before they do is a shot of the fallback serif.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)

  mkdirSync(dirname(OUT), { recursive: true })
  const clip = CLIP
    ? (() => {
        const [x, y, w, h] = CLIP.split(',').map(Number)
        const scale = WIDTH / 1500
        return { x: x * scale, y: y * scale, width: w * scale, height: h * scale }
      })()
    : undefined
  await page.screenshot({ path: OUT, clip })
  await browser.close()
  console.log(`wrote ${OUT}`)
} finally {
  server.kill('SIGTERM')
}
