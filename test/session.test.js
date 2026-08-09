import { check, done, eq, near } from './harness.js'
import { newTable, placeBet, railTotal, reducer, setWorking, takeDown } from '../src/lib/table.js'
import { atRisk } from '../src/lib/rules.js'
import { makeRng, roll } from '../src/lib/rng.js'
import { BET_IDS, betDef } from '../src/lib/bets.js'
import { maxBet, vigFor } from '../src/lib/limits.js'

const start = (over = {}) => ({ ...newTable(), bankroll: 5000, ...over })

// ------------------------------------------------------------- placing bets

{
  const s = placeBet(start(), 'pass', 10)
  eq('a bet comes off the rail', s.bankroll, 4990)
  eq('and goes on the felt', s.bets.pass.amount, 10)
  eq('the player is no worse off for having made it', railTotal(s), 5000)
}

{
  const s = placeBet(start(), 'buy-4', 100)
  eq('a buy costs its vig on top', s.bankroll, 4895)
  eq('and the vig is remembered', s.bets['buy-4'].vig, 5)
  eq('the vig is gone for good - it bought the better price', railTotal(s), 4995)
}

{
  const s = placeBet(placeBet(start(), 'place-6', 12), 'place-6', 18)
  eq('bets stack rather than replace', s.bets['place-6'].amount, 30)
  eq('and each is paid for', s.bankroll, 4970)
}

{
  const s = placeBet(start(), 'place-6', 25)
  check('a refused bet says why', !!s.refused)
  eq('and costs nothing', s.bankroll, 5000)
  eq('and puts nothing on the felt', Object.keys(s.bets).length, 0)
  eq('a later good bet clears the refusal', placeBet(s, 'place-6', 30).refused, null)
}

// ---------------------------------------------------------- taking them down

{
  let s = start({ phase: 'point', point: 6 })
  s = placeBet(s, 'place-8', 30)
  s = takeDown(s, 'place-8')
  eq('a place bet comes down whenever you like', s.bankroll, 5000)
  check('and leaves the felt', !s.bets['place-8'])
}

{
  let s = placeBet(start(), 'pass', 10)
  s = { ...s, phase: 'point', point: 6 }
  s = placeBet(s, 'pass-odds', 50)
  const down = takeDown(s, 'pass')
  check('a line bet will not come down', !!down.refused)
  eq('and nothing moves', down.bankroll, s.bankroll)

  const odds = takeDown(s, 'pass-odds')
  eq('but the odds behind it will', odds.bankroll, 4990)
  check('the flat bet stays', odds.bets.pass.amount === 10)
}

{
  let s = start({ phase: 'point', point: 8 })
  s = placeBet(s, 'come', 10)
  s = reducer(s, { type: 'roll', roll: roll(3, 3) })
  s = placeBet(s, 'come-odds-6', 25)
  eq('odds go up behind a come bet that found its number', s.bets['come-odds-6'].amount, 25)

  // A come bet on a number is a contract bet, exactly like the pass line it
  // is a copy of. The odds behind it are not, and come down alone.
  const flat = takeDown(s, 'come-6')
  check('a come bet on a number will not come down either', !!flat.refused)
  const odds = takeDown(s, 'come-odds-6')
  eq('its odds will', odds.bankroll, 4990)
  check('and the come bet is left standing', odds.bets['come-6'].amount === 10)
}

{
  // The don't side may take its bet down, and when it does the odds have
  // nowhere left to be, so they come with it rather than backing nothing.
  let s = start({ phase: 'point', point: 8 })
  s = placeBet(s, 'dontcome', 10)
  s = reducer(s, { type: 'roll', roll: roll(3, 3) })
  s = placeBet(s, 'dontcome-odds-6', 24)
  const down = takeDown(s, 'dontcome-6')
  eq("taking a don't come down brings its lay with it", down.bankroll, 5000)
  check('and both are off the felt', !down.bets['dontcome-6'] && !down.bets['dontcome-odds-6'])
}

{
  let s = start({ phase: 'point', point: 6 })
  s = placeBet(s, 'buy-4', 100)
  s = takeDown(s, 'buy-4')
  eq('taking a buy down does not refund the commission', s.bankroll, 4995)
}

// ------------------------------------------------------------ working state

{
  let s = start({ phase: 'point', point: 6 })
  s = placeBet(s, 'place-8', 30)
  s = setWorking(s, 'place-8', true)
  check('a place bet can be called on', s.bets['place-8'].working === true)
  s = setWorking(s, 'place-8', false)
  check('and turned off again', s.bets['place-8'].working === false)

  const line = setWorking(placeBet(start(), 'pass', 10), 'pass', false)
  check('the line cannot be turned off', !!line.refused)
  const field = setWorking(placeBet(start(), 'field', 10), 'field', false)
  check('nor can the field', !!field.refused)
}

// ------------------------------------------------------- money is conserved
//
// The invariant that catches a double payment, a bet paid but not taken down,
// or a stake returned twice. Across any roll, what the player holds - the rail
// plus everything still on the felt - moves by exactly the winnings less the
// losses, and by nothing else.

{
  const rng = makeRng(20260808)
  let s = start({ bankroll: 250000 })
  let rolls = 0
  let broken = 0

  const spread = ['pass', 'dontpass', 'field', 'place-6', 'place-8', 'place-5', 'buy-4', 'lay-10',
    'hard-8', 'hard-6', 'yo', 'horn', 'ce', 'hop-3-4', 'hop-5-5', 'any7', 'anycraps', 'come',
    'dontcome', 'little', 'big', 'all', 'aces', 'boxcars', 'acedeuce']

  for (let i = 0; i < 30000; i++) {
    // Scatter money about the felt, taking whatever the table will accept.
    for (let k = 0; k < 4; k++) {
      const id = rng.pick(spread)
      const most = maxBet(id, { table: s.table, phase: s.phase, point: s.point, bets: s.bets, marked: s.marked, bankroll: s.bankroll })
      if (most > 0) s = placeBet(s, id, Math.min(most, rng.pick([1, 5, 10, 12, 25, 30])))
    }
    // Occasionally back a line bet, and occasionally pull something off.
    for (const odds of ['pass-odds', 'dontpass-odds']) {
      const most = maxBet(odds, { table: s.table, phase: s.phase, point: s.point, bets: s.bets, bankroll: s.bankroll })
      if (most > 0 && rng.next() < 0.5) s = placeBet(s, odds, most)
    }
    if (rng.next() < 0.1) {
      const held = Object.keys(s.bets)
      if (held.length) s = takeDown(s, rng.pick(held))
    }

    const before = s.bankroll + atRisk(s)
    const r = rng.roll()
    s = reducer(s, { type: 'roll', roll: r })
    const after = s.bankroll + atRisk(s)

    const won = (s.lastEvents ?? []).reduce(
      (sum, e) => sum + (e.kind === 'pay' ? e.pay : e.kind === 'take' ? -e.amount : 0),
      0,
    )
    if (Math.abs(after - before - won) > 1e-9) broken++
    rolls++

    if (s.bankroll < 25000) s = { ...s, bankroll: s.bankroll + 250000 }
  }

  eq(`money is conserved across ${rolls} rolls`, broken, 0)
  check('the rail never went negative', s.bankroll >= 0)
  check('every bet on the felt is a real one', Object.keys(s.bets).every((id) => BET_IDS.includes(id)))
  check('every amount is a whole number of dollars', Object.values(s.bets).every((b) => Number.isInteger(b.amount)))
}

// ----------------------------------------------------------- the felt is legal
//
// Nothing in a long session should ever leave a bet on a spot that could not
// legally hold one - odds with no flat bet behind them, most of all.

{
  const rng = makeRng(4242)
  let s = start({ bankroll: 100000 })
  let orphans = 0
  for (let i = 0; i < 20000; i++) {
    for (const id of ['pass', 'dontpass', 'come', 'dontcome', 'pass-odds', 'come-odds-6', 'place-6', 'hard-8']) {
      if (rng.next() < 0.3) {
        const most = maxBet(id, { table: s.table, phase: s.phase, point: s.point, bets: s.bets, marked: s.marked, bankroll: s.bankroll })
        if (most > 0) s = placeBet(s, id, Math.min(most, 30))
      }
    }
    s = reducer(s, { type: 'roll', roll: rng.roll() })
    for (const id of Object.keys(s.bets)) {
      const behind = betDef(id).behind
      if (behind && !s.bets[behind]) orphans++
    }
    if (s.bankroll < 10000) s = { ...s, bankroll: s.bankroll + 100000 }
  }
  eq('odds are never left backing a bet that is gone', orphans, 0)
}

// -------------------------------------------------------------- determinism

{
  const play = (seed) => {
    const rng = makeRng(seed)
    let s = start()
    const log = []
    for (let i = 0; i < 500; i++) {
      s = placeBet(s, s.phase === 'come-out' ? 'pass' : 'come', 10)
      s = reducer(s, { type: 'roll', roll: rng.roll() })
      log.push(`${s.lastRoll.a}${s.lastRoll.b}:${s.bankroll}`)
      if (s.bankroll < 100) s = { ...s, bankroll: s.bankroll + 5000 }
    }
    return log.join(' ')
  }
  check('a seed replays a session exactly', play(11) === play(11))
  check('a different seed does not', play(11) !== play(12))
}

// ---------------------------------------------------- the shooter's turn

{
  const rng = makeRng(808)
  let s = start()
  let handovers = 0
  let longestSeen = 0
  for (let i = 0; i < 20000; i++) {
    s = reducer(s, { type: 'roll', roll: rng.roll() })
    if ((s.lastEvents ?? []).some((e) => e.kind === 'handover')) handovers++
    longestSeen = Math.max(longestSeen, s.shooter.longest)
  }
  // A shooter lasts 8.53 throws on average, so twenty thousand throws is
  // somewhere near 2350 shooters. Far outside that band means the hand is
  // ending on the wrong roll.
  near('a shooter lasts about eight and a half throws', 20000 / handovers, 8.53, 0.5)
  check('the longest hand is remembered', longestSeen >= 20)
}

done('session')
