#!/usr/bin/env node
/*
 * Does the built game play with nothing behind it?
 *
 * The claim this game makes is that it needs no network at all. That is easy
 * to believe and easy to break - a font, an analytics ping, a CDN import that
 * crept in - and none of those fail loudly. They fail on a plane.
 *
 * So the build is served from a folder, every request the page makes is
 * recorded, and anything that leaves the origin is a failure. Then a hand is
 * played with the network cut off entirely, which is the actual promise.
 *
 *   npm run build && node scripts/offline.mjs
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const DIST = resolve('dist')
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('no dist/ — run npm run build first')
  process.exit(1)
}

let failures = 0
const check = (name, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  const file = join(DIST, path === '/' ? 'index.html' : path)
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end('not here')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(0, ok))
const port = server.address().port

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  const away = []
  const problems = []
  page.on('request', (r) => {
    const url = r.url()
    if (!url.startsWith(`http://localhost:${port}`) && !url.startsWith('data:')) away.push(url)
  })
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))
  page.on('console', (m) => {
    // The two shared portal scripts are absolute paths to lhstart's own origin
    // and are meant to 404 when the game is served on its own.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text())
  })

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  check('the built game loads from a plain folder', (await page.locator('svg.felt').count()) === 1)
  check('and asks nothing of anywhere else', away.length === 0, away.slice(0, 3).join(' | '))

  /*
   * Now genuinely offline. Every request from here is refused, including the
   * ones to the server it was loaded from - which is a harsher test than a
   * plane, where the files are at least still on the device.
   */
  await page.route('**/*', (route) => route.abort())

  await page.locator('.chip-button').nth(2).click()
  const box = await page.locator('svg.felt').boundingBox()
  const at = (x, y) => ({
    x: box.x + (box.width - Math.min(box.width, box.height * (1500 / 860))) / 2 + x * (box.width / 1500),
    y: box.y + y * (box.height / 860),
  })
  const pass = at(760, 776)
  await page.mouse.click(pass.x, pass.y)

  let threw = 0
  for (let i = 0; i < 12; i++) {
    await page.locator('.roll').click()
    await page.locator('.roll:not([disabled])').waitFor({ timeout: 15000 })
    threw++
    if ((await page.locator('.doings button:has-text("Bets")').textContent()).endsWith('0')) {
      await page.mouse.click(pass.x, pass.y)
    }
  }
  check(`${threw} throws with every request refused`, threw === 12)
  check('the table is still there', (await page.locator('.puck text').count()) === 1)
  check('and it still knows what it paid', ((await page.locator('.call').textContent()) ?? '').length > 0)
  check('the page reported nothing', problems.length === 0, problems.slice(0, 3).join(' | '))

  // What the portal's service worker will be asked to keep.
  const manifest = JSON.parse(readFileSync(join(DIST, 'offline.json'), 'utf8'))
  check('offline.json names this game', manifest.id === 'craps', manifest.id)
  check('and carries a build hash with no dash in it', /^[0-9a-f]{12}$/.test(manifest.build), manifest.build)
  check('and lists the entry point', manifest.assets.includes('index.html'))
  check('and the manifest', manifest.assets.includes('manifest.webmanifest'))
  check('and every icon', manifest.assets.filter((a) => a.startsWith('icons/')).length === 4)
  check('and no source maps', !manifest.assets.some((a) => a.endsWith('.map')))

  const bytes = manifest.assets.reduce((n, a) => n + readFileSync(join(DIST, a)).length, 0)
  console.log(`\noffline: ${manifest.assets.length} files, ${(bytes / 1024).toFixed(0)} kB, build ${manifest.build}`)

  // The portal caches every offline game from the shelf without being asked,
  // so a game that is not small is a game that should not claim to be offline.
  check('small enough for the shelf to cache unasked', bytes < 3 * 1024 * 1024, `${(bytes / 1024).toFixed(0)} kB`)
} finally {
  await browser.close()
  server.close()
}

console.log(`\n${failures ? `${failures} failed` : 'plays with nothing behind it'}`)
if (failures) process.exit(1)
