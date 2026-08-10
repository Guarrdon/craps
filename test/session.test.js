import { check, done, eq, near } from './harness.js'
import { baseOf, newTable, placeBet, pressAmount, railTotal, reducer, regress, setWorking, sweepable, takeDown } from '../src/lib/table.js'
import { atRisk } from '../src/lib/rules.js'
import { makeRng, roll } from '../src/lib/rng.js'
import { BET_IDS, betDef } from '../src/lib/bets.js'
import { maxBet, vigFor } from '../src/lib/limits.js'

/*
 * A $10 table, so the arithmetic in these checks stays legible.
 *
 * The default is $25 and limits.test.js covers that. What is being tested here
 * is the mechanics of putting money down and taking it back, and a minimum
 * that swallows the numbers only makes the assertions harder to read.
 */
const start = (over = {}) => {
  const s = newTable()
  return { ...s, table: { ...s.table, min: 10 }, bankroll: 5000, ...over }
}

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

/*
 * ------------------------------------------------------------------ the sweep
 *
 * "Take it all down" is a tidy-up, so it steps over anything it cannot pick up
 * rather than refusing, and it leaves the bonus row alone: those only go back
 * up on a clean board, so a convenience button must not be able to end them.
 */
{
  let s = start()
  s = placeBet(s, 'little', 10)
  s = placeBet(s, 'pass', 10)
  s = reducer(s, { type: 'roll', roll: { a: 3, b: 3, total: 6 } }) // point six, and a marked six
  s = placeBet(s, 'place-8', 30)
  s = placeBet(s, 'field', 10)

  const rail = s.bankroll
  const after = reducer(s, { type: 'sweep' })
  check('the sweep takes the place bet down', !after.bets['place-8'])
  check('and the field', !after.bets.field)
  check('the pass line is a contract and stays', after.bets.pass?.amount === 10)
  check('the bonus bet stays too', after.bets.little?.amount === 10)
  eq('and only what came down is back on the rail', after.bankroll, rail + 40)
  check('stepping over a contract bet is not a refusal', !after.refused)

  // Nothing left that the sweep would touch.
  eq('the sweep knows when there is nothing to sweep', sweepable(after).length, 0)
  check('and running it again changes nothing', reducer(after, { type: 'sweep' }).bets === after.bets)

  // The × on the bet itself still comes down - that is a decision, not a tidy-up.
  const gone = takeDown(after, 'little')
  check('but taking the bonus bet down by hand still works', !gone.bets.little)
  check('and it cannot go back up on a board already under way', !!placeBet(gone, 'little', 10).refused)
}

/*
 * ------------------------------------------------------- press, then regress
 *
 * A bet remembers what it was last deliberately set to. Pressing puts the
 * table's winnings up on top of that and leaves it alone, which is what lets
 * "back to thirty" still mean thirty three presses later.
 */
{
  let s = start({ phase: 'point', point: 5 })
  s = placeBet(s, 'place-6', 30)
  eq('a bet starts where you put it', baseOf(s.bets['place-6']), 30)

  // The six pays $35; press it and $30 of that goes up, $5 comes back.
  s = placeBet(s, 'place-6', pressAmount(s, 'place-6', 35), { keepBase: true })
  eq('pressing raises the bet', s.bets['place-6'].amount, 60)
  eq('but not what it started at', baseOf(s.bets['place-6']), 30)

  s = placeBet(s, 'place-6', pressAmount(s, 'place-6', 70), { keepBase: true })
  eq('and again', s.bets['place-6'].amount, 126)
  eq('still remembering thirty', baseOf(s.bets['place-6']), 30)

  const rail = s.bankroll
  s = regress(s, 'place-6')
  eq('regressing puts it back to what it started at', s.bets['place-6'].amount, 30)
  eq('and hands back the difference', s.bankroll, rail + 96)
  check('the bet never left the felt', !!s.bets['place-6'])

  const again = regress(s, 'place-6')
  check('regressing a bet already at its base is refused', !!again.refused)
  eq('and changes nothing', again.bankroll, s.bankroll)
}

{
  // Betting on it deliberately is not pressing: that sets a new base, because
  // it is a decision about how much you want out there.
  let s = start({ phase: 'point', point: 5 })
  s = placeBet(s, 'place-6', 30)
  s = placeBet(s, 'place-6', 30)
  eq('adding to a bet yourself moves what it started at', baseOf(s.bets['place-6']), 60)
  check('so there is nothing to regress', !!regress(s, 'place-6').refused)
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
