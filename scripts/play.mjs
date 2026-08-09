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

const rail = () => page.locator('.money strong').textContent()
const puck = () => page.locator('.puck text').textContent()

/*
 * How many bets are out.
 *
 * Read off the rail button rather than by counting rows, because the list now
 * opens over the table and holding it open would sit on top of the spots this
 * script is trying to click.
 */
const bets = async () =>
  Number(((await page.locator('.doings button:has-text("Bets")').textContent()) ?? '').split('\u00b7')[1] ?? 0)

// Open the list, do something with the rows, put it away again.
const withBets = async (fn) => {
  await page.locator('.doings button:has-text("Bets")').click()
  await page.locator('.bets-panel').waitFor({ timeout: 4000 })
  const out = await fn()
  await page.locator('.bets-panel header button').click()
  await page.locator('.bets-panel').waitFor({ state: 'detached', timeout: 4000 })
  return out
}

// Throw, and wait for the dice to actually stop. Nothing is settled until they
// have, so reading the felt before then reads the roll before last.
const roll = async () => {
  await page.locator('.roll').click()
  await page.locator('.roll:not([disabled])').waitFor({ timeout: 15000 })
  await page.waitForTimeout(30)
}

// Clear is disabled when there is nothing to clear, which a seven out can
// leave the table in at any moment.
const clearAll = async () => {
  const b = page.locator('.doings button:has-text("Clear")')
  if (await b.isEnabled()) await b.click()
}

const hasLine = async () => withBets(() => page.locator('.bets li:has-text("Pass Line")').count()).then((n) => n > 0)

// Get to a clean come-out: nothing marked, the puck off. Where a shooter's
// turn begins, and the only moment the bonus row will take a bet.
const comeOut = async () => {
  for (let i = 0; i < 120; i++) {
    if ((await puck()) === 'OFF' && (await page.locator('.tracker.is-marked').count()) === 0) return true
    if (!(await hasLine())) {
      await page.locator('.chip-button').nth(1).click()
      await clickSpot('pass')
    }
    await roll()
  }
  return false
}

// And the other way: a point established, with a line bet behind it.
const onPoint = async () => {
  for (let i = 0; i < 120; i++) {
    if ((await puck()) !== 'OFF') return true
    if (!(await hasLine())) {
      await page.locator('.chip-button').nth(1).click()
      await clickSpot('pass')
    }
    await roll()
  }
  return false
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
  await page.locator('.doings button:has-text("Odds")').click()
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
    await withBets(() => page.locator('.bets li:has-text("Place 8") .bet-down').click())
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

    const contract = await withBets(() =>
      page.locator('.bets li:has-text("Pass Line") .bet-down').isDisabled())
    check('a contract bet refuses to come down', contract)
  }

  // --- turn the box off and on again
  await page.locator('.doings button:has-text("Box off")').click()
  check('the box can be turned off', (await withBets(() => page.locator('.bets li.is-off').count())) > 0)
  await page.locator('.doings button:has-text("Box on")').click()
  check('and back on', (await withBets(() => page.locator('.bets li.is-off').count())) === 0)

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

    // The dice stop and the crew starts working: the call goes up, the amounts
    // float off the bets they belong to, and nothing on the felt has moved yet
    // because what is on the felt is what is being paid.
    await page.locator('.call.is-call').waitFor({ timeout: 15000 })
    check('the stickman calls the number', ((await table.say()) ?? '').trim().length > 0, (await page.locator('.call').textContent()).trim())
    check('the dice stay where they landed', (await page.locator('.thrown').count()) === 2)
    await page.waitForTimeout(200)
    check('amounts float off the bets they belong to', (await page.locator('.float').count()) > 0)
    // And off the bets, not off the corner of the table.
    const floated = await page.evaluate(() => {
      const frame = document.querySelector('.felt-frame').getBoundingClientRect()
      return [...document.querySelectorAll('.float')].every((f) => {
        const b = f.getBoundingClientRect()
        return b.width > 0 && b.x - frame.x > 40 && b.y - frame.y > 20
      })
    })
    check('and they are over the felt, not stuck in the corner', floated)
    await page.screenshot({ path: OUT.replace(/\.png$/, '-settle.png') })

    await page.locator('.roll:not([disabled])').waitFor({ timeout: 15000 })
    await page.waitForTimeout(30)

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

  // --- the screens around the game
  for (const [button, want] of [
    ['Every bet', 'Pass Line'],
    ['Session', 'Throws'],
    ['Table', 'Minimum on the line'],
    ['?', 'Putting money down'],
  ]) {
    await page.locator(`.top nav button:has-text("${button}")`).click()
    await page.locator('.dialog').waitFor({ timeout: 4000 })
    const text = await page.locator('.dialog').textContent()
    check(`the ${button} screen opens and says something`, text.includes(want), want)

    /*
     * And it fits on the screen.
     *
     * The long screens used to run off the bottom of the page with no way to
     * reach the end of them: `max-height: 100%` on a centred grid item
     * resolves against a track sized by its own contents, which is circular,
     * so it was treated as no limit at all.
     */
    const fits = await page.evaluate(() => {
      const d = document.querySelector('.dialog')
      const b = document.querySelector('.dialog-body')
      const box = d.getBoundingClientRect()
      return {
        onScreen: box.top >= -1 && box.bottom <= window.innerHeight + 1,
        scrollable: b.scrollHeight <= b.clientHeight + 1 || b.clientHeight > 0,
        reachesEnd: b.scrollHeight - b.clientHeight >= 0,
      }
    })
    check(`the ${button} screen fits on the screen`, fits.onScreen)
    check(`and its content can be scrolled to the end`, fits.scrollable && fits.reachesEnd)

    await page.keyboard.press('Escape')
    await page.locator('.dialog').waitFor({ state: 'detached', timeout: 4000 })
  }

  // The rules screen is generated from the catalogue, so it should carry every
  // bet's real cost - including the one bet in the house that costs nothing.
  await page.locator('.top nav button:has-text("Every bet")').click()
  const rules = await page.locator('.dialog').textContent()
  check('the rules screen quotes the house edge', /1\.414%/.test(rules))
  check('and says the odds cost nothing', /nothing/.test(rules))
  check('and covers the bonus row', /Boom or Bust/i.test(rules))
  await page.waitForTimeout(400) // the dialog fades in; a shot before it lands is a shot of the fade
  await page.screenshot({ path: OUT.replace(/\.png$/, '-rules.png') })
  await page.keyboard.press('Escape')

  // --- and the whole thing survives being closed
  {
    await page.locator('.chip-button').nth(2).click()
    for (const id of ['field', 'yo', 'hard-8']) await clickSpot(id)
    const before = await bets()
    const railBefore = await rail()
    check('there is something to remember', before >= 3, `${before} bets`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(120)
    check('the game is where you left it after a reload', (await bets()) === before, `${before} bets`)
    check('and so is the rail', (await rail()) === railBefore)
  }

  /*
   * --- the opening
   *
   * Most players bet the same thing every come-out. Saving it and putting it
   * back with one button is the difference between playing and clicking.
   */
  {
    // The bonus row only takes a bet on a clean come-out, which is the whole
    // point of it - so the opening has to be laid out on one.
    await comeOut()
    await clearAll()
    await page.locator('.chip-button').nth(1).click() // $5
    for (const id of ['pass', 'little', 'big']) await clickSpot(id)
    const usual = await bets()
    check('the usual opening goes out: line, Little and Big', usual === 3, `${usual} bets`)
    await page.locator('.doings button:has-text("Save")').click()
    check('and saves', /Saved/.test(await table.say()), (await table.say()).trim())

    await clearAll()
    const bare = await bets()
    await page.locator('.doings button:has-text("Usual")').click()
    check('and comes back in one click', (await bets()) === 3, `${bare} → ${await bets()}`)
    check('for the same money', /\$20/.test(await table.say()), (await table.say()).trim())
  }

  /*
   * --- pressing, and the line riding
   *
   * A winning place bet is paid alongside and stays where it is; the question
   * a table asks next is whether it goes up. And a winning line bet does not
   * come back - the payout is set beside it and the original rides.
   */
  {
    let pressed = null
    // Every box number covered, rolling until one of them pays. A seven out
    // just means putting the spread back and waiting for the next shooter.
    for (let i = 0; i < 160 && !pressed; i++) {
      if ((await puck()) === 'OFF') {
        await onPoint()
        await page.locator('.chip-button').nth(2).click() // $25
        for (const n of [4, 5, 6, 8, 9, 10]) await clickSpot(`place-${n}`)
      }
      await roll()
      if (await page.locator('.press button').first().isVisible().catch(() => false)) {
        const which = await page.locator('.press button').first().textContent()
        await page.locator('.press button').first().click()
        pressed = { which: which.trim(), said: ((await table.say()) ?? '').trim() }
      }
    }
    check('a bet that was paid and stayed up offers a press', !!pressed, pressed?.which ?? 'never came up')
    // Press puts up as much of the win as the spot can be paid on and hands
    // back the rest, which is the sentence a dealer says while doing it.
    check('and pressing says what it pressed to', /pressed to \$/i.test(pressed?.said ?? ''), pressed?.said)
  }

  /*
   * --- the line rides
   *
   * A winning pass line does not come back. The dealer sets the payout beside
   * it and the original is still there as your bet for the next come-out,
   * which is what nearly everyone at a table does with it.
   */
  {
    await clearAll()
    let made = false
    for (let i = 0; i < 200 && !made; i++) {
      if (!(await onPoint())) break
      const staked = await withBets(() =>
        page.locator('.bets li:has-text("Pass Line") .bet-amount').textContent())
      await roll()
      if (/the winner/i.test((await table.say()) ?? '')) {
        made = true
        check('the point being made leaves the line where it was', await hasLine())
        const after = await withBets(() =>
          page.locator('.bets li:has-text("Pass Line") .bet-amount').textContent())
        check('for the same money', after === staked, staked)
        check('and the table is coming out again', (await puck()) === 'OFF')
      }
    }
    check('a point was made to check it against', made)
  }

  /*
   * --- training mode
   *
   * Point at a spot and be told what it is, rather than betting on it. The
   * numbers come from the catalogue, so this is also a check that a lesson
   * cannot describe a bet the felt no longer makes.
   */
  {
    const outBefore = await bets()
    await page.locator('.top nav button.teach').click()
    await clickSpot('any7')
    await page.locator('.lesson').waitFor({ timeout: 4000 })
    const seven = await page.locator('.lesson').textContent()
    check('pointing at a spot explains it instead of betting', (await bets()) === outBefore)
    check('it names the bet', /Seven/.test(seven))
    check('and says how often it comes in', /6 ways in 36/.test(seven), '6 ways in 36')
    check('and what it is worth against what it pays', /5:1/.test(seven) && /4:1/.test(seven))
    check('and what it costs', /16\.67/.test(seven))
    check('and what the stickman says', /Down with all the props/i.test(seven))

    // And it stays on the table. Pointed at a spot near an edge it has to flip
    // to whichever side has room, or half the lesson is off the screen.
    const onTable = await page.evaluate(() => {
      const l = document.querySelector('.lesson').getBoundingClientRect()
      return l.left >= 0 && l.right <= window.innerWidth && l.top >= 0 && l.bottom <= window.innerHeight
    })
    check('and the whole of it is on the screen', onTable)
    await page.screenshot({ path: OUT.replace(/\.png$/, '-teach.png') })

    // The neighbouring bet, which pays nearly twice as much and costs less -
    // the comparison the whole mode exists to make possible.
    await page.keyboard.press('Escape')
    await clickSpot('anycraps')
    await page.locator('.lesson').waitFor({ timeout: 4000 })
    const craps = await page.locator('.lesson').textContent()
    check('the bet beside it pays more', /7:1/.test(craps))
    check('and costs less', /11\.11/.test(craps))

    await page.keyboard.press('Escape')
    await page.locator('.top nav button.teach').click()
    await clickSpot('yo')
    check('and betting works again once it is off', (await bets()) > outBefore)
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
  await page.locator('.doings button:has-text("Odds")').click()
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
