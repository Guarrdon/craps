#!/usr/bin/env node
/*
 * The app icons, and the portal's cover art.
 *
 * Drawn as SVG here and rendered through the browser that is already a
 * dependency, rather than checking in binaries nobody can edit or adding an
 * image library to make four PNGs. Re-run it and they are rebuilt.
 *
 *   node scripts/icons.mjs
 *
 * The mark is two dice showing a natural seven on a burgundy ground - the
 * cloth colour off the reference photograph, so the icon and the felt are the
 * same table.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const CLOTH = '#5c0d16'
const CLOTH_DARK = '#3c070e'
const IVORY = '#fdf8ef'
const PIP = '#4a0d13'

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

const die = (x, y, size, value, tilt) => {
  const half = size / 2
  const pips = PIPS[value]
    .map(([px, py]) => `<circle cx="${px * size * 0.27}" cy="${py * size * 0.27}" r="${size * 0.098}" fill="${PIP}"/>`)
    .join('')
  return `
    <g transform="translate(${x} ${y}) rotate(${tilt})">
      <rect x="${-half}" y="${-half}" width="${size}" height="${size}" rx="${size * 0.17}"
            fill="${IVORY}" stroke="rgba(0,0,0,0.28)" stroke-width="${size * 0.02}"/>
      ${pips}
    </g>`
}

/*
 * `inset` is how far in from the edge the mark sits.
 *
 * A maskable icon can be cropped to a circle by the platform, so everything
 * that matters has to be inside the middle 80% - which means the dice shrink
 * and the cloth grows rather than the whole thing being scaled down.
 */
const mark = (size, { inset = 0.11, round = 0.22 } = {}) => {
  const dieSize = size * (0.5 - inset * 0.9)
  const c = size / 2
  const spread = dieSize * 0.42
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="cloth" cx="46%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#8d1723"/>
      <stop offset="60%" stop-color="${CLOTH}"/>
      <stop offset="100%" stop-color="${CLOTH_DARK}"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * round}" fill="url(#cloth)"/>
  ${die(c - spread, c + spread * 0.36, dieSize, 4, -14)}
  ${die(c + spread * 0.95, c - spread * 0.5, dieSize, 3, 11)}
</svg>`
}

/*
 * The cover, 4:3, for the shelf.
 *
 * The same dice on the same cloth, with a suggestion of the layout under them -
 * a cover that is only a logo tells you nothing about what the game is.
 */
/*
 * The cover, 4:3, for the shelf.
 *
 * The tile crops it, and crops from the bottom - so everything that has to
 * read sits in the top two thirds and the rest is cloth. A cover with its
 * subject cut in half is worse than one with empty space in it.
 *
 * The dice land in the come box, because that is where they land.
 */
const cover = (w = 1200, h = 900) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="cloth" cx="44%" cy="34%" r="76%">
      <stop offset="0%" stop-color="#96192b"/>
      <stop offset="56%" stop-color="${CLOTH}"/>
      <stop offset="100%" stop-color="#29050a"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#cloth)"/>

  <!-- The box, all six of it. Gold, because every one of these rides. -->
  <g fill="none" stroke="#e9c877" stroke-width="4" opacity="0.55">
    <rect x="70" y="78" width="1060" height="168" rx="8"/>
    <path d="M 246 78 v 168 M 423 78 v 168 M 600 78 v 168 M 777 78 v 168 M 953 78 v 168"/>
    <rect x="70" y="286" width="1060" height="300" rx="16"/>
  </g>
  <g fill="#e9c877" opacity="0.74" font-family="Optima, Palatino, Georgia, serif" font-weight="700" text-anchor="middle">
    <text x="158" y="196" font-size="100">4</text>
    <text x="334" y="196" font-size="100">5</text>
    <text x="511" y="196" font-size="72">Six</text>
    <text x="688" y="196" font-size="100">8</text>
    <text x="865" y="196" font-size="72">Nine</text>
    <text x="1042" y="196" font-size="100">10</text>
    <text x="470" y="474" font-size="128" letter-spacing="20">COME</text>
  </g>

  ${die(852, 470, 186, 4, -15)}
  ${die(1020, 372, 186, 3, 13)}
</svg>`

const OUT = [
  { file: 'public/icons/craps-192.png', svg: mark(192) },
  { file: 'public/icons/craps-512.png', svg: mark(512) },
  // Apple does not round the corners for you, and a transparent one looks
  // broken on a home screen - so this one is square and fills the tile.
  { file: 'public/icons/craps-apple-touch.png', svg: mark(180, { round: 0 }) },
  // Cropped to a circle by the platform, so the mark pulls well inside.
  { file: 'public/icons/craps-maskable.png', svg: mark(512, { inset: 0.2, round: 0 }) },
  { file: 'docs/craps.png', svg: cover() },
]

const browser = await chromium.launch()
try {
  for (const { file, svg } of OUT) {
    const page = await browser.newPage()
    const { width, height } = /width="(\d+)" height="(\d+)"/.exec(svg)
      ? { width: Number(RegExp.$1), height: Number(RegExp.$2) }
      : { width: 512, height: 512 }
    await page.setViewportSize({ width, height })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}</style>${svg}`,
      { waitUntil: 'load' },
    )
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true })
    writeFileSync(file, await page.screenshot({ omitBackground: true }))
    await page.close()
    console.log(`${file}  ${width}x${height}`)
  }
} finally {
  await browser.close()
}
