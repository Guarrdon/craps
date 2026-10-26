import { check, done, eq, near } from './harness.js'
import { baseOf, canTakeDown, newTable, placeBet, pressAmount, railTotal, reducer, regress, setWorking, sweepable, takeDown } from '../src/lib/table.js'
import { atRisk } from '../src/lib/rules.js'
import { makeRng, roll } from '../src/lib/rng.js'
import { BET_IDS, betDef } from '../src/lib/bets.js'
import { check as legal, maxBet, vigFor } from '../src/lib/limits.js'
import { packTable, unpackTable } from '../src/lib/storage.js'

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
  // The commission paid for a decision, and none has happened.
  eq('taking a buy down undecided refunds the commission', s.bankroll, 5000)
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

  // Once the shooter is under way the bonus row is a contract. Letting it come
  // down would let a player keep the runs going well and drop the rest.
  const gone = takeDown(after, 'little')
  check('the bonus bet will not come down once the dice have moved', !!gone.refused && gone.bets.little?.amount === 10)
  check('and the × knows it', !canTakeDown(after, 'little'))
}

{
  // Before the first throw it is only chips on the felt.
  let s = placeBet(start(), 'little', 10)
  check('the bonus bet comes down before the first throw', canTakeDown(s, 'little'))
  s = takeDown(s, 'little')
  check('and goes back on the rail', !s.bets.little && s.bankroll === 5000)
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

/*
 * ------------------------------------------------------- the dice are out
 *
 * From the moment a roll is drawn it is on the table as pending, and nothing
 * on the felt may change until it has been paid. Otherwise a player who has
 * seen the number called can pull the bets it beats and pile onto the ones it
 * pays - which is a game the house loses every time.
 */
{
  let s = placeBet(start(), 'pass', 10)
  s = placeBet(s, 'field', 10)
  s = reducer(s, { type: 'throw', roll: roll(3, 4) })
  check('a thrown roll is on the table before it is paid', s.pending?.total === 7)

  for (const action of [
    { type: 'bet', id: 'field', amount: 10 },
    { type: 'takedown', id: 'field' },
    { type: 'sweep' },
    { type: 'working', id: 'field', on: false },
    { type: 'odds' },
    { type: 'many', list: [{ id: 'any7', amount: 5 }] },
    { type: 'regress', id: 'field' },
    { type: 'configure', table: { bonus: '34' } },
    { type: 'buyin', amount: 5000 },
  ]) {
    const after = reducer(s, action)
    check(`'${action.type}' is refused while the dice are out`, !!after.refused && after.bets === s.bets && after.bankroll === s.bankroll && after.table === s.table)
  }
  check('and the check itself says no', !legal('any7', 5, { phase: s.phase, point: s.point, bets: s.bets, pending: s.pending }).ok)

  // The roll that is paid is the one that was drawn, whatever is asked for.
  const paid = reducer(s, { type: 'roll', roll: roll(5, 6) })
  eq('the pending roll is the one that settles', paid.lastRoll.total, 7)
  check('and the field loses to it', !paid.bets.field)
  eq('the felt opens again once it is paid', paid.pending, null)
  check('bets are taken again after that', !placeBet(paid, 'pass', 10).refused)
}

{
  // Saved with the game, so closing the tab cannot take a roll back.
  let s = reducer(placeBet(start(), 'pass', 10), { type: 'throw', roll: roll(1, 1) })
  const back = unpackTable(JSON.parse(JSON.stringify(packTable(s))))
  eq('a pending roll survives a save and a reload', back.pending?.total, 2)
  const paid = reducer(back, { type: 'roll' })
  check('and is paid when the table comes back', !paid.bets.pass && paid.lastRoll.total === 2)
}

{
  // Settling pays the thrown roll once. Asking again is a no-op, not a repeat.
  let s = reducer(placeBet(start(), 'field', 10), { type: 'throw', roll: roll(1, 2) })
  const once = reducer(s, { type: 'settle' })
  const twice = reducer(once, { type: 'settle' })
  check('a second settle changes nothing', twice === once)
  eq('and the roll is in the history once', twice.history.length, 1)
}

/*
 * ---------------------------------------------- come bets on their numbers
 *
 * Only the dealer puts money there, by moving it from the come box. A flat bet
 * added directly is a put bet on the do side and, on the don't side, an
 * even-money bet that the seven beats the number - two in three on the four.
 */
{
  const s = start({ phase: 'point', point: 5, bets: { 'dontcome-4': { amount: 10 }, 'come-4': { amount: 10 } } })
  for (const id of ['dontcome-4', 'come-4', 'dontcome-6', 'come-10']) {
    const after = placeBet(s, id, 10)
    check(`nothing can be added directly to ${betDef(id).label}`, !!after.refused && after.bets[id]?.amount === s.bets[id]?.amount)
  }
  check('odds still go behind it', !placeBet(s, 'dontcome-odds-4', 20).refused)
}

/*
 * ----------------------------------------------------- one vig, one decision
 *
 * The commission is paid for each decision. Up front for the first, and out of
 * each win that leaves the bet standing for the next - and a bet that comes
 * down undecided gets back the one it prepaid.
 */
{
  let s = start({ phase: 'point', point: 5 })
  s = placeBet(s, 'buy-4', 100)
  eq('a $100 buy pays $5 to go up', s.bankroll, 4895)
  s = reducer(s, { type: 'roll', roll: roll(2, 2) })
  const pay = s.lastEvents.find((e) => e.id === 'buy-4')
  eq('a win that stays up pays $200 less the next $5', pay.pay, 195)
  eq('and says what it took', pay.vig, 5)
  eq('the rail has the win, net', s.bankroll, 5090)
  s = reducer(s, { type: 'roll', roll: roll(2, 2) })
  eq('and the next win is charged the same', s.bankroll, 5285)
  s = takeDown(s, 'buy-4')
  eq('coming down undecided returns the stake and the prepaid vig', s.bankroll, 5390)
}

{
  let s = start({ phase: 'point', point: 5 })
  s = placeBet(s, 'lay-4', 40)
  eq('laying $40 on the four costs a dollar', s.bankroll, 4959)
  s = reducer(s, { type: 'roll', roll: roll(3, 4) })
  eq('the seven wins $20, less the dollar for the next decision', s.lastEvents.find((e) => e.id === 'lay-4').pay, 19)
  s = reducer(s, { type: 'roll', roll: roll(2, 2) })
  // $5,000, less the first dollar, plus the $19, less the $40 the four takes.
  eq('and a four takes it, with nothing left owing', railTotal(s), 5000 - 1 + 19 - 40)
}

{
  // Pressed, then regressed: the commission follows the bet's size.
  let s = start({ phase: 'point', point: 5 })
  s = placeBet(s, 'buy-4', 40) // $2
  s = placeBet(s, 'buy-4', 60, { keepBase: true }) // $100 now, $3 more
  eq('pressing a buy pays the extra vig', s.bets['buy-4'].vig, 5)
  const before = s.bankroll
  s = regress(s, 'buy-4')
  eq('regressing it hands back the stake and the vig it no longer owes', s.bankroll, before + 60 + 3)
  eq('and the bet carries the vig for its own size', s.bets['buy-4'].vig, vigFor('buy-4', 40, { table: s.table }))
}

/*
 * ------------------------------------------------- the bonus keeps its price
 */
{
  let s = placeBet(start(), 'all', 5)
  s = reducer(s, { type: 'configure', table: { bonus: '34' } })
  s = { ...s, marked: new Set([2, 3, 4, 5, 6, 8, 9, 10, 11]) }
  s = reducer(s, { type: 'roll', roll: roll(6, 6) })
  eq('Boom or Bust bet at 150 to 1 is paid at 150, whatever the table says now', s.lastEvents.find((e) => e.id === 'all').pay, 750)
}

done('session')
