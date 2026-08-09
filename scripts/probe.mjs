#!/usr/bin/env node
/*
 * Point at every printed spot on the felt and check the right bet answers.
 *
 * The claim layout.js makes is that the shape being drawn and the shape being
 * clicked are the same shape. That claim is not checkable by reading the file,
 * because what actually decides a click is paint order and stacking in a live
 * browser - a label drawn over a box, a hop circle overlapping the HOP legend,
 * a band whose bounding box covers half the table. So the browser is asked.
 *
 * Each spot is clicked at the point its chips sit, which is the point that has
 * to work: if a chip can go there, a click has to land there.
 *
 *   node scripts/probe.mjs
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { FELT, SPOTS, SPOT_IDS, probeAt } from '../src/lib/layout.js'

const PORT = 5198
const WIDTH = 1500
const HEIGHT = 860

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit'],
})
const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('vite did not start')), 30000)
  server.stdout.on('data', (c) => String(c).includes('Local:') && (clearTimeout(timer), ok()))
})

let failures = 0
try {
  await ready
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // The felt letterboxes itself inside the viewport, so felt coordinates have
  // to be mapped through where the svg actually ended up.
  const box = await page.locator('svg.felt').boundingBox()
  const scale = Math.min(box.width / FELT.w, box.height / FELT.h)
  const originX = box.x + (box.width - FELT.w * scale) / 2
  const originY = box.y + (box.height - FELT.h * scale) / 2

  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector('.probe')
      return el ? { id: el.dataset.spot, n: Number(el.dataset.n) } : { id: null, n: 0 }
    })

  const drawn = SPOT_IDS.filter((id) => SPOTS[id].shape)
  let seen = 0
  for (const id of drawn) {
    const [fx, fy] = probeAt(id)
    await page.mouse.click(originX + fx * scale, originY + fy * scale)
    const got = await read()
    // A click that lands on nothing leaves the readout exactly as it was, and
    // would otherwise read as a pass for whatever was clicked before it.
    const landed = got.n > seen
    seen = got.n
    const ok = landed && got.id === id
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${ok ? '' : `  ->  ${landed ? `hit ${got.id}` : 'hit nothing'}`}`)
  }

  console.log(`\nprobe: ${drawn.length - failures}/${drawn.length} spots answer to a click at their chip`)
  await browser.close()
} finally {
  server.kill('SIGTERM')
}

if (failures) process.exit(1)
