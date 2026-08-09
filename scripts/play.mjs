#!/usr/bin/env node
/*
 * Play a hand, in a real browser, and take a photograph of it.
 *
 * The unit tests prove the engine is right and probe.mjs proves the felt is
 * clickable. Neither of them proves you can actually play: that a chip goes
 * down, that the box knows the point is out, that odds appear behind the line,
 * that a roll pays what it should and the rail moves. This drives the game the
 * way a player would and fails on anything the page complains about.
 *
 *   node scripts/play.mjs
 *   node scripts/play.mjs --out docs/table.png
 */

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openTable } from './browser.mjs'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const OUT = resolve(flag('out', 'docs/table.png'))

let failures = 0
const check = (name, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const table = await openTable({ width: 1600, height: 1060 })
const { page, clickSpot, problems, close } = table

const rail = () => page.locator('.money-big').textContent()
const bets = () => page.locator('.bets li').count()
const puck = () => page.locator('.puck text').textContent()

// Throw, and wait for the dice to actually stop. Nothing is settled until they
// have, so reading the felt before then reads the roll before last.
const roll = async () => {
  await page.locator('.roll').click()
  await page.locator('.roll:not([disabled])').waitFor({ timeout: 15000 })
  await page.waitForTimeout(30)
}

try {
  // --- a chip goes down on the line
  await page.locator('.chip-button').nth(2).click() // $25
  check('the table opens on a come-out', (await puck()) === 'OFF')
  const opening = await rail()
  await clickSpot('pass')
  check('a chip lands on the pass line', (await bets()) === 1)
  check('and comes off the rail', (await rail()) !== opening)

  // --- roll until a point is established
  let rolls = 0
  while ((await puck()) === 'OFF' && rolls < 60) {
    // A come-out that wins or loses takes the line bet with it; put it back.
    if ((await bets()) === 0) await clickSpot('pass')
    await roll()
    rolls++
  }
  check('a point gets established', (await puck()) !== 'OFF', `after ${rolls} throws`)
  const point = await puck()

  // --- the box, and the increment rule
  await page.locator('.chip-button').nth(1).click() // $5
  await clickSpot('place-6')
  const said = await table.say()
  check('a red chip on the six becomes a bet the six can pay', /12/.test(said), said.trim())

  await page.locator('.chip-button').nth(2).click() // $25
  await clickSpot('place-8')
  await clickSpot('field')

  // --- odds on everything
  const before = await bets()
  await page.locator('button:has-text("Odds on everything")').click()
  check('odds go up behind the line', (await bets()) > before, await table.say())

  // --- a come bet, which has to travel
  await clickSpot('come')
  check('the come box takes a bet once the point is out', (await bets()) > before + 1)

  /*
   * The felt must not move while you are betting on it.
   *
   * The bet list grows with every bet, and if the rail grew with it the table
   * above would shrink and every chip already down would slide out from under
   * the cursor. It cost the probe a run of false failures before it was
   * noticed, which is how you know a player would notice it too.
   */
  const box = JSON.stringify(await page.locator('svg.felt').boundingBox())
  for (const id of ['hop-2-2', 'hop-3-3', 'yo', 'aces', 'hard-4', 'hard-6', 'anycraps', 'horn']) {
    await clickSpot(id)
  }
  await page.waitForTimeout(80)
  check(
    'the felt does not move as the bet list fills up',
    JSON.stringify(await page.locator('svg.felt').boundingBox()) === box,
  )

  // --- taking bets down, both ways
  {
    const held = await bets()
    const railBefore = await rail()
    await page.locator('.bets li:has-text("Place 8") .bet-down').click()
    check('a place bet comes down from the list', (await bets()) === held - 1)
    check('and the money comes back', (await rail()) !== railBefore)

    // Right-clicking the chips does the same, for anyone who would rather not
    // go looking in the list.
    const { x, y } = await page.locator('svg.felt').boundingBox().then(async (b) => {
      const s = Math.min(b.width / 1500, b.height / 860)
      return { x: b.x + (b.width - 1500 * s) / 2, y: b.y + (b.height - 860 * s) / 2, s }
    }).then((o) => ({ x: o.x + 352 * o.s, y: o.y + 682 * o.s }))
    await page.mouse.click(x, y, { button: 'right' })
    check('right-clicking a stack takes it down', (await bets()) === held - 2)

    const line = page.locator('.bets li:has-text("Pass Line") .bet-down')
    check('a contract bet refuses to come down', await line.isDisabled())
  }

  // --- turn the box off and on again
  await page.locator('button:has-text("Turn the box off")').click()
  check('the box can be turned off', (await page.locator('.bets li.is-off').count()) > 0)
  await page.locator('button:has-text("Keep the box working")').click()
  check('and back on', (await page.locator('.bets li.is-off').count()) === 0)

  // --- the throw itself
  {
    const beforeRoll = await rail()
    await page.locator('.roll').click()
    // Caught in the air, which is also the frame worth photographing.
    await page.waitForTimeout(260)
    check('two dice are in the air', (await page.locator('.thrown').count()) === 2)
    check('and the shooter cannot throw again mid-throw', await page.locator('.roll').isDisabled())
    check('nothing is settled until they stop', (await rail()) === beforeRoll)
    mkdirSync(dirname(OUT), { recursive: true })
    await page.screenshot({ path: OUT.replace(/\.png$/, '-throw.png') })

    await page.locator('.roll:not([disabled])').waitFor({ timeout: 15000 })
    await page.waitForTimeout(30)
    check('the stickman calls the roll', ((await table.say()) ?? '').trim().length > 0, (await table.say()).trim())
    check('the dice stay on the felt afterwards', (await page.locator('.thrown').count()) === 2)

    // Where they came to rest has to be inside the tray. A die that finished
    // under the prop box would mean the walls are in the wrong place.
    const inside = await page.evaluate(() => {
      const frame = document.querySelector('.felt-frame').getBoundingClientRect()
      return [...document.querySelectorAll('.thrown')].every((d) => {
        const b = d.getBoundingClientRect()
        const x = ((b.x + b.width / 2 - frame.x) / frame.width) * 1500
        const y = ((b.y + b.height / 2 - frame.y) / frame.height) * 860
        return x > 150 && x < 1000 && y > 200 && y < 520
      })
    })
    check('and they came to rest inside the tray', inside)
  }

  // Leave the felt in a state worth photographing: a point, chips in several
  // places, odds behind the line.
  if ((await puck()) === 'OFF') {
    await clickSpot('pass')
    let n = 0
    while ((await puck()) === 'OFF' && n++ < 60) {
      await roll()
      if ((await bets()) === 0) await clickSpot('pass')
    }
  }
  await page.locator('.chip-button').nth(2).click()
  for (const id of ['place-6', 'place-8', 'place-5', 'field', 'hard-8', 'yo', 'hop-3-3', 'little']) {
    await clickSpot(id)
  }
  await page.locator('button:has-text("Odds on everything")').click()
  await page.waitForTimeout(120)

  mkdirSync(dirname(OUT), { recursive: true })
  await page.screenshot({ path: OUT })
  console.log(`\nwrote ${OUT}`)

  check('the page reported nothing', problems.length === 0, problems.slice(0, 4).join(' | '))
} finally {
  await close()
}

console.log(`\nplay: ${failures ? `${failures} failed` : 'all good'}`)
if (failures) process.exit(1)
