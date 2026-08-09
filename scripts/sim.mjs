#!/usr/bin/env node
/*
 * The table, with nobody at it.
 *
 * Drives the engine headless - no React, no felt, no dice - which is the whole
 * reason src/lib has no interface code in it. Two modes:
 *
 *   node scripts/sim.mjs                 measure every bet's house edge
 *   node scripts/sim.mjs --strategy X    play a strategy and report the damage
 *
 * The first is the audit. A payout that is a shade too generous does not fail
 * a unit test - the test asserts what the code does - but it moves the edge on
 * that bet away from the published figure, and this is where that shows up.
 * Every number here is compared against what the bet is known to be worth, and
 * anything outside simulation noise is a bug.
 */

import { BET_IDS, LAY_ODDS, betDef } from '../src/lib/bets.js'
import { DEFAULT_TABLE, maxBet, rangeFor, unitFor as unitOf } from '../src/lib/limits.js'
import { makeRng } from '../src/lib/rng.js'
import { newTable, placeBet, reducer, takeDown } from '../src/lib/table.js'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const ROLLS = Number(flag('rolls', 2_000_000))
const SEED = Number(flag('seed', 20260808))

const pct = (n) => `${(n * 100).toFixed(3)}%`
const pad = (s, n) => String(s).padEnd(n)
const lpad = (s, n) => String(s).padStart(n)

// What each bet is known to be worth to the house, per bet resolved, on this
// felt. Sourced from the standard analysis of each wager; the ones that depend
// on the layout - the field, the bonus row - are for this table's payouts and
// no other.
const EXPECTED = {
  pass: 1.414, dontpass: 1.364,
  come: 1.414, dontcome: 1.364,
  'pass-odds': 0, 'dontpass-odds': 0,
  'come-odds-4': 0, 'come-odds-5': 0, 'come-odds-6': 0,
  'come-odds-8': 0, 'come-odds-9': 0, 'come-odds-10': 0,
  'dontcome-odds-4': 0, 'dontcome-odds-5': 0, 'dontcome-odds-6': 0,
  'dontcome-odds-8': 0, 'dontcome-odds-9': 0, 'dontcome-odds-10': 0,
  'place-4': 6.667, 'place-5': 4.0, 'place-6': 1.515,
  'place-8': 1.515, 'place-9': 4.0, 'place-10': 6.667,
  'buy-4': 4.762, 'buy-5': 4.762, 'buy-6': 4.762,
  'buy-8': 4.762, 'buy-9': 4.762, 'buy-10': 4.762,
  'lay-4': 2.439, 'lay-5': 3.226, 'lay-6': 4.0,
  'lay-8': 4.0, 'lay-9': 3.226, 'lay-10': 2.439,
  field: 5.556,
  any7: 16.667, anycraps: 11.111, aces: 13.889, boxcars: 13.889,
  acedeuce: 11.111, yo: 11.111, horn: 12.5, ce: 11.111,
  'hard-4': 11.111, 'hard-6': 9.091, 'hard-8': 9.091, 'hard-10': 11.111,
  little: 18.56, big: 18.56, all: 20.59,
}

// ---------------------------------------------------------------- measuring

/*
 * Play one bet, over and over, and count what it costs.
 *
 * "Per bet resolved" is the convention every published craps figure uses, so
 * that is what is counted here: a place six that wins four times before it
 * loses is five resolved bets, not one. Pushes - the barred twelve, and
 * nothing else - are left out of the denominator, which is also the
 * convention and is why the don't side comes out at 1.364% rather than 1.402%.
 *
 * Bets that carry a commission are taken down and put back up after every
 * decision, so each resolution pays its own vig. That is the arrangement the
 * published buy and lay figures assume, and it is what a player who is paying
 * attention actually does.
 */
function measure(id, rolls, seed) {
  const d = betDef(id)
  const rng = makeRng(seed)
  const BANK = 100_000_000
  let s = { ...newTable(), bankroll: BANK }

  let wagered = 0
  let net = 0
  let n = 0
  let sumP = 0 // per-decision profit, for the standard error
  let sumP2 = 0

  const ctx = () => ({
    table: s.table, phase: s.phase, point: s.point,
    bets: s.bets, marked: s.marked, bankroll: s.bankroll,
  })

  /*
   * A come bet lives under two names. It goes up in the box as `come` and
   * finishes on a number as `come-6`, and it is one bet the whole way - so
   * both count, and only one may be up at a time. Counting only the `come`
   * events would score the sevens and elevens and none of the numbers, which
   * is why the come box came out at minus thirty three per cent the first
   * time this was run.
   */
  const family = /^(come|dontcome)$/.test(id) ? [id, ...POINT_IDS.map((n) => `${id}-${n}`)] : [id]
  const familyUp = () => family.some((f) => s.bets[f])

  // Whatever the bet needs underneath it goes up alongside and is never
  // counted: odds need a flat bet, and a come bet's odds need the come bet to
  // have found its number first.
  const prop = () => {
    if (!d.behind) return
    if (s.bets[d.behind]) return
    if (/^(pass|dontpass)$/.test(d.behind)) { s = placeBet(s, d.behind, DEFAULT_TABLE.min); return }
    const box = d.behind.split('-')[0]
    if (!s.bets[box]) s = placeBet(s, box, DEFAULT_TABLE.min)
  }

  let vigPaid = 0
  let justDecided = false

  for (let i = 0; i < rolls; i++) {
    // A bet that carries a commission is refreshed after every decision, so
    // each resolution pays its own vig. Leaving a winning buy up would have it
    // decide several times on one commission, and the published figures - and
    // the way the bet is actually played - assume one each.
    if (d.vig && justDecided && s.bets[id]) s = takeDown(s, id)

    prop()

    if (!familyUp()) {
      const size = sizeFor(id, ctx())
      if (size > 0) {
        const before = s.bankroll
        s = placeBet(s, id, size)
        // Whatever came off the rail beyond the stake is the commission.
        if (s.bets[id]) vigPaid = before - s.bankroll - size
      }
    }

    s = reducer(s, { type: 'roll', roll: rng.roll() })
    justDecided = false

    for (const e of s.lastEvents ?? []) {
      if (!family.includes(e.id)) continue
      if (e.kind !== 'pay' && e.kind !== 'take') continue // a push is not a decision
      const stake = e.amount + vigPaid
      const profit = (e.kind === 'pay' ? e.pay : -e.amount) - vigPaid
      wagered += stake
      net += profit
      sumP += profit / stake // as a fraction of the stake, so mixed sizes compose
      sumP2 += (profit / stake) ** 2
      n++
      justDecided = true
    }
    // The commission belongs to the bet it was paid on. Once that bet has been
    // decided and taken off, the next one pays its own.
    if (justDecided && !s.bets[id]) vigPaid = 0

    if (s.bankroll < BANK / 2) s = { ...s, bankroll: s.bankroll + BANK }
  }

  const edge = wagered ? -net / wagered : 0
  // The standard error of that edge, from the spread of the decisions
  // themselves rather than a guess. A 150:1 bet needs a far wider band than
  // the pass line for the same number of decisions, and this is what says so.
  const variance = n > 1 ? sumP2 / n - (sumP / n) ** 2 : 0
  const stderr = n > 1 ? Math.sqrt(variance / n) : Infinity

  return { id, wagered, net, decisions: n, edge, stderr }
}

const POINT_IDS = [4, 5, 6, 8, 9, 10]

/*
 * How much to put on a spot so the measurement is not distorted by the rules.
 *
 * The commission is the reason this is not simply the minimum: the vig has a
 * dollar floor, so a $10 buy on the four pays 10% commission rather than 5%
 * and comes out at twice its true edge. The published figure assumes the
 * commission is exactly five per cent, so the stake is chosen to make it so.
 */
function sizeFor(id, ctx) {
  const d = betDef(id)
  if (d.group === 'odds') return maxBet(id, ctx)
  if (d.vig === 'bet') return 100 // $5 commission, exactly 5%
  if (d.vig === 'win') {
    // Lay enough that the win is $100, so the commission is $5 on the nose.
    const [num, den] = LAY_ODDS[d.number]
    return (100 * den) / num
  }
  if (d.group === 'box') return 60 // divides by both 5 and 6
  if (d.group === 'bonus') return 5
  const { min } = rangeFor(id, { table: ctx.table })
  const unit = unitOf(id, ctx)
  return Math.max(unit, Math.ceil(min / unit) * unit)
}

// ------------------------------------------------------------------ reports

function edges() {
  const rolls = Math.max(20_000, Math.floor(ROLLS / BET_IDS.filter((id) => EXPECTED[id] !== undefined).length))
  console.log(`\nHouse edge per bet resolved  -  ${rolls.toLocaleString()} throws each, seed ${SEED}`)
  console.log('A bet is flagged when it sits more than three standard errors from what it should be.\n')
  console.log(pad('bet', 20) + lpad('measured', 10) + lpad('expected', 10) + lpad('diff', 9) + lpad('3 s.e.', 9) + lpad('decisions', 11))
  console.log('-'.repeat(79))

  const flagged = []
  for (const id of BET_IDS.filter((id) => EXPECTED[id] !== undefined)) {
    const r = measure(id, rolls, SEED)
    const measured = r.edge * 100
    const diff = measured - EXPECTED[id]
    const band = 3 * r.stderr * 100
    // A bet that never got a decision is not a pass, it is a hole in the
    // harness - or a spot the table will not take a bet on at all.
    const ok = r.decisions > 30 && Math.abs(diff) <= Math.max(band, 0.02)
    if (!ok) flagged.push(id)
    console.log(
      pad(betDef(id).label, 20) +
        lpad(measured.toFixed(3) + '%', 10) +
        lpad(EXPECTED[id].toFixed(3) + '%', 10) +
        lpad((diff >= 0 ? '+' : '') + diff.toFixed(3), 9) +
        lpad(Number.isFinite(band) ? '±' + band.toFixed(3) : '-', 9) +
        lpad(r.decisions.toLocaleString(), 11) +
        (ok ? '' : '   <-- OUT'),
    )
  }
  console.log('-'.repeat(79))
  if (flagged.length) {
    console.log(`\n${flagged.length} bet(s) outside the band: ${flagged.join(', ')}`)
    console.log('Either a payout is wrong, or there are not enough decisions yet. Raise --rolls and look again.\n')
    process.exitCode = 1
  } else {
    console.log('\nEvery bet is where it should be.\n')
  }
}

// ---------------------------------------------------------------- strategies

const STRATEGIES = {
  'pass': (s, put) => { if (s.phase === 'come-out') put('pass', 10) },
  'pass-odds': (s, put) => {
    if (s.phase === 'come-out') put('pass', 10)
    else put('pass-odds', 'max')
  },
  'dontpass-odds': (s, put) => {
    if (s.phase === 'come-out') put('dontpass', 10)
    else put('dontpass-odds', 'max')
  },
  'place-68': (s, put) => {
    if (s.phase === 'come-out') put('pass', 10)
    else { put('pass-odds', 'max'); put('place-6', 30); put('place-8', 30) }
  },
  'iron-cross': (s, put) => {
    if (s.phase === 'come-out') put('pass', 10)
    else { put('field', 10); put('place-5', 25); put('place-6', 30); put('place-8', 30) }
  },
  'all-the-props': (s, put) => {
    if (s.phase === 'come-out') put('pass', 10)
    for (const id of ['yo', 'aces', 'boxcars', 'acedeuce', 'any7', 'anycraps', 'horn', 'ce']) put(id, 4)
  },
}

function strategy(name) {
  const play = STRATEGIES[name]
  if (!play) {
    console.error(`no such strategy. try: ${Object.keys(STRATEGIES).join(', ')}`)
    process.exit(1)
  }
  const rng = makeRng(SEED)
  const START = 1_000_000
  let s = { ...newTable(), bankroll: START }
  let action = 0
  let topups = 0

  for (let i = 0; i < ROLLS; i++) {
    const put = (id, amount) => {
      const ctx = { table: s.table, phase: s.phase, point: s.point, bets: s.bets, marked: s.marked, bankroll: s.bankroll }
      const size = amount === 'max' ? maxBet(id, ctx) : amount
      if (size <= 0) return
      const before = s.bankroll
      s = placeBet(s, id, size)
      if (!s.refused) action += before - s.bankroll
    }
    play(s, put)
    s = reducer(s, { type: 'roll', roll: rng.roll() })
    if (s.bankroll < START / 2) { s = { ...s, bankroll: s.bankroll + START }; topups++ }
  }

  const staked = topups * START + START
  const held = s.bankroll + Object.values(s.bets).reduce((a, b) => a + b.amount, 0)
  const lost = staked - held
  console.log(`\n${name}  -  ${ROLLS.toLocaleString()} throws, seed ${SEED}\n`)
  console.log(`  put on the felt   ${'$' + Math.round(action).toLocaleString()}`)
  console.log(`  net result        ${'$' + Math.round(-lost).toLocaleString()}`)
  console.log(`  edge on action    ${pct(lost / action)}`)
  console.log(`  per $10 of line   ${'$' + (lost / (action / 10)).toFixed(3)} lost per throw of action\n`)
}

if (has('strategy')) strategy(flag('strategy'))
else edges()
