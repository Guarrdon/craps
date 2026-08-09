#!/usr/bin/env node
/*
 * Does it fit?
 *
 * The table is nearly twice as wide as it is tall and has to sit on anything
 * from a phone to a desktop, with a rail under it that must stay usable under
 * a thumb. Those two pull against each other, and the failures are the kind
 * you only see by looking: the felt running off the side of a phone, a button
 * shrinking under 44px, the rail eating half the screen.
 *
 * So they are measured. Three sizes, three questions each:
 *
 *   - is any of the table off the screen
 *   - is anything you have to hit smaller than 44px
 *   - how much of the screen is the rail taking
 *
 *   node scripts/fits.mjs
 */

import { openTable } from './browser.mjs'

const SIZES = [
  { w: 390, h: 844, name: 'phone upright', rail: 0.24 },
  { w: 844, h: 390, name: 'phone sideways', rail: 0.24 },
  { w: 1024, h: 768, name: 'tablet', rail: 0.2 },
  { w: 1600, h: 1000, name: 'desktop', rail: 0.14 },
]

// The smallest thing a finger can reliably hit. Everything in the rail has to
// clear it, at every size.
const TOUCH = 44

let failures = 0
const check = (name, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

for (const size of SIZES) {
  const table = await openTable({ width: size.w, height: size.h })
  try {
    await table.page.waitForTimeout(320)
    const m = await table.page.evaluate((touch) => {
      const rail = document.querySelector('.rail').getBoundingClientRect()
      const felt = document.querySelector('.felt-frame').getBoundingClientRect()
      /*
       * What a finger actually lands on.
       *
       * A checkbox inside a label is not a 16px target - the label toggles it,
       * so the label is the target and that is what gets measured. Measuring
       * the input instead reports a failure that is not there and hides the
       * ones that are.
       */
      const targets = [...document.querySelectorAll('.rail button, .rail .chip-button, .rail input')]
        .map((el) => {
          const owner = el.tagName === 'INPUT' ? el.closest('label') ?? el : el
          return { el: owner, box: owner.getBoundingClientRect() }
        })
        .filter(({ box }) => box.width > 0)
      return {
        rail: rail.height,
        felt: { w: felt.width, h: felt.height },
        // Anything hanging off any edge of the window.
        spill: Math.max(
          0,
          Math.round(felt.right - window.innerWidth),
          Math.round(-felt.left),
          Math.round(felt.bottom - window.innerHeight),
          Math.round(-felt.top),
        ),
        pageSpill: Math.round(document.documentElement.scrollWidth - window.innerWidth),
        tooSmall: targets
          .filter(({ box }) => box.height < touch - 0.5)
          .map(({ el, box }) => `${(el.textContent || el.type).trim().slice(0, 12)}@${Math.round(box.height)}px`),
        share: rail.height / window.innerHeight,
      }
    }, TOUCH)

    const at = `${size.name} (${size.w}x${size.h})`
    check(`${at}: the whole table is on the screen`, m.spill === 0, m.spill ? `${m.spill}px over` : '')
    check(`${at}: the page does not scroll sideways`, m.pageSpill <= 0, m.pageSpill > 0 ? `${m.pageSpill}px` : '')
    check(`${at}: everything is at least ${TOUCH}px to hit`, m.tooSmall.length === 0, m.tooSmall.join(', '))
    check(
      `${at}: the rail leaves the table its room`,
      m.share <= size.rail,
      `rail ${Math.round(m.rail)}px, ${(m.share * 100).toFixed(0)}% of the screen — felt ${Math.round(m.felt.w)}x${Math.round(m.felt.h)}`,
    )
    check(`${at}: the page reported nothing`, table.problems.length === 0, table.problems.slice(0, 2).join(' | '))
  } finally {
    await table.close()
  }
}

console.log(`\nfits: ${failures ? `${failures} failed` : 'every size'}`)
if (failures) process.exit(1)
