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

import { openTable } from './browser.mjs'
import { SPOTS, SPOT_IDS } from '../src/lib/layout.js'

// ?probe records what was clicked and bets nothing. What is being measured
// here is the felt, and a felt that fills with chips as it is measured is
// measuring the chips.
const table = await openTable({ width: 1500, height: 980, query: '?probe' })
const { page, clickSpot, close } = table

let failures = 0
try {
  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector('.probe')
      return el ? { id: el.dataset.spot, n: Number(el.dataset.n) } : { id: null, n: 0 }
    })

  const drawn = SPOT_IDS.filter((id) => SPOTS[id].shape)
  let seen = 0
  for (const id of drawn) {
    await clickSpot(id)
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
} finally {
  await close()
}

if (failures) process.exit(1)
