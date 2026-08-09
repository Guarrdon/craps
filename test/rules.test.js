import { check, done, eq } from './harness.js'
import { newTable, resolveRoll } from '../src/lib/rules.js'
import { check as check2 } from '../src/lib/limits.js'
import { roll } from '../src/lib/rng.js'

// A table with the bets already up, so a scenario reads as a position rather
// than as a sequence of actions. The bankroll starts at zero, which makes the
// closing balance the profit and loss of the roll and nothing else.
const at = (over = {}) => ({ ...newTable(), bankroll: 0, ...over })
const bet = (pairs) => Object.fromEntries(Object.entries(pairs).map(([id, amount]) => [id, { amount }]))
const kinds = (events) => events.map((e) => e.kind).join(' ')
const ids = (events, kind) => events.filter((e) => e.kind === kind).map((e) => e.id)

// ------------------------------------------------------------- the come-out

{
  const { state, events } = resolveRoll(at({ bets: bet({ pass: 10, dontpass: 10 }) }), roll(3, 4))
  eq('a come-out seven pays the line', state.bankroll, 20)
  check('and takes the don\'t', ids(events, 'take').includes('dontpass'))
  eq('the phase stays on the come-out', state.phase, 'come-out')
  check('it is called a natural', events.some((e) => e.kind === 'natural'))
}

{
  const { state } = resolveRoll(at({ bets: bet({ dontpass: 10 }) }), roll(6, 6))
  eq('the barred twelve gives the don\'t bettor their money back', state.bankroll, 10)
  check('and the bet comes off', !state.bets.dontpass)
}

{
  const { state, events } = resolveRoll(at({ bets: bet({ pass: 10 }) }), roll(2, 2))
  eq('a come-out four sets the point', state.point, 4)
  eq('and moves the table on', state.phase, 'point')
  check('the line bet rides', state.bets.pass.amount === 10)
  check('the puck goes on', events.some((e) => e.kind === 'point' && e.number === 4))
}

// ---------------------------------------------------------------- the point

{
  const start = at({ phase: 'point', point: 6, bets: bet({ pass: 10, 'pass-odds': 50 }) })
  const { state } = resolveRoll(start, roll(4, 2))
  eq('making the six pays $10 flat and $60 odds, plus the $60 back', state.bankroll, 130)
  eq('the puck comes off', state.point, null)
  eq('and the table comes out again', state.phase, 'come-out')
  check('both bets come down', !state.bets.pass && !state.bets['pass-odds'])
}

{
  const start = at({
    phase: 'point',
    point: 6,
    bets: bet({ pass: 10, 'pass-odds': 50, 'place-8': 30, 'hard-8': 5, 'come-9': 10, 'dontcome-4': 10 }),
  })
  const { state, events } = resolveRoll(start, roll(3, 4))
  eq('a seven out takes the line, the odds, the box, the hardway and the come', state.bankroll, 20)
  check("the don't come on the four is the one thing that wins", ids(events, 'pay').join() === 'dontcome-4')
  eq('the felt is bare afterwards', Object.keys(state.bets).length, 0)
  check('the dice are handed over', events.some((e) => e.kind === 'handover'))
  eq('and the next shooter starts from nothing', state.shooter.rolls, 0)
}

// -------------------------------------------------------------- come bets

{
  const start = at({ phase: 'point', point: 8, bets: bet({ come: 10 }) })
  const { state, events } = resolveRoll(start, roll(3, 3))
  check('a come bet travels to its number', state.bets['come-6']?.amount === 10)
  check('and leaves the box', !state.bets.come)
  check('the move is reported so the dealer can be seen doing it', events.some((e) => e.kind === 'move' && e.to === 'come-6'))
}

{
  // The sequencing case. A come bet is already on the six and another is in
  // the box; the six rolls. The standing bet must be paid before the new one
  // arrives, or the new bet gets paid for a number it was not yet on.
  const start = at({ phase: 'point', point: 8, bets: bet({ 'come-6': 10, come: 25 }) })
  const { state, events } = resolveRoll(start, roll(3, 3))
  eq('the come bet already on the six is paid', state.bankroll, 20)
  eq('the one in the box travels there instead of being paid', state.bets['come-6'].amount, 25)
  check(
    'and it is paid before it is moved',
    events.findIndex((e) => e.kind === 'pay') < events.findIndex((e) => e.kind === 'move'),
    kinds(events),
  )
}

{
  const start = at({ phase: 'point', point: 8, bets: bet({ come: 10 }) })
  const { state } = resolveRoll(start, roll(5, 6))
  eq('a come bet wins on the eleven like a fresh pass line', state.bankroll, 20)
}

{
  const start = at({ phase: 'point', point: 8, bets: bet({ come: 10 }) })
  const { state } = resolveRoll(start, roll(3, 4))
  eq('and on the seven that ends everyone else', state.bankroll, 20)
}

// ------------------------------------------------- off on the come-out

{
  // The rule that makes a come-out seven survivable. The come bet on the six
  // is always working and loses; its odds were off, so they come back rather
  // than going into the rack.
  const start = at({ phase: 'come-out', bets: bet({ 'come-6': 10, 'come-odds-6': 50, 'place-8': 30, 'hard-8': 5 }) })
  const { state, events } = resolveRoll(start, roll(3, 4))
  eq('the odds come back and the place and hardway are untouched', state.bankroll, 50)
  check('the come bet itself is gone', !state.bets['come-6'])
  check('the odds are returned, not taken', events.some((e) => e.kind === 'return' && e.id === 'come-odds-6'))
  check('the place bet is still there', state.bets['place-8'].amount === 30)
  check('so is the hardway', state.bets['hard-8'].amount === 5)
  check(
    'everything that was off is reported as off rather than silently skipped',
    ids(events, 'off').sort().join() === 'come-odds-6,hard-8,place-8',
    ids(events, 'off').join(),
  )
}

{
  // Called on, they are at risk like anything else.
  const start = at({
    phase: 'come-out',
    bets: { 'place-8': { amount: 30, working: true }, 'come-odds-6': { amount: 50, working: true }, 'come-6': { amount: 10 } },
  })
  const { state } = resolveRoll(start, roll(3, 4))
  eq('a place bet called on loses to a come-out seven', state.bankroll, 0)
  check('and so do the odds', !state.bets['come-odds-6'])
}

// ------------------------------------------------------------ the box

{
  const start = at({ phase: 'point', point: 5, bets: bet({ 'place-6': 30, 'place-8': 30 }) })
  const { state } = resolveRoll(start, roll(3, 3))
  eq('a place six pays $35', state.bankroll, 35)
  check('and stays up for the next one', state.bets['place-6'].amount === 30)
  check('the eight is untouched', state.bets['place-8'].amount === 30)
}

{
  const start = at({ phase: 'point', point: 5, bets: bet({ 'buy-4': 100, 'lay-10': 100 }) })
  const { state } = resolveRoll(start, roll(2, 2))
  eq('a bought four pays true odds', state.bankroll, 200)
  check('and the lay against the ten rides', state.bets['lay-10'].amount === 100)
}

{
  const start = at({ phase: 'point', point: 5, bets: bet({ 'lay-4': 100 }) })
  const { state } = resolveRoll(start, roll(3, 4))
  eq('a lay against the four wins half of it on the seven', state.bankroll, 50)
}

// ------------------------------------------------------------- hardways

{
  const start = at({ phase: 'point', point: 5, bets: bet({ 'hard-8': 5 }) })
  eq('the hard eight pays 9:1', resolveRoll(start, roll(4, 4)).state.bankroll, 45)
  check('and stays up', resolveRoll(start, roll(4, 4)).state.bets['hard-8'].amount === 5)
  eq('an easy eight takes it', resolveRoll(start, roll(6, 2)).state.bankroll, 0)
  check('and it is gone', !resolveRoll(start, roll(6, 2)).state.bets['hard-8'])
  check('a nine leaves it alone', resolveRoll(start, roll(4, 5)).state.bets['hard-8'].amount === 5)
}

// -------------------------------------------------------------- the bonus

{
  let state = at({ phase: 'come-out', bets: bet({ little: 5 }) })
  for (const [a, b] of [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3]]) {
    state = resolveRoll(state, roll(a, b)).state
  }
  eq('Little Ones pays 30:1 once 2 3 4 5 6 are all in', state.bankroll, 155)
  check('and the bet is finished', !state.bets.little)
}

{
  let state = at({ phase: 'come-out', bets: bet({ all: 5, big: 5 }) })
  const marks = [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6]]
  for (const [a, b] of marks) state = resolveRoll(state, roll(a, b)).state
  eq('Boom or Bust pays 150:1 and Big Ones 30:1 on the same throw', state.bankroll, 5 * 150 + 5 + 5 * 30 + 5)
}

{
  let state = at({ phase: 'come-out', bets: bet({ all: 5 }) })
  state = resolveRoll(state, roll(1, 1)).state
  state = resolveRoll(state, roll(2, 2)).state
  check('the tracker remembers', state.marked.has(2) && state.marked.has(4))
  const after = resolveRoll(state, roll(3, 4))
  eq('a seven takes the bonus', after.state.bankroll, 0)
  eq('and wipes the tracker', after.state.marked.size, 0)
  check('even a come-out seven', after.events.some((e) => e.kind === 'unmark'))
}

/*
 * The bonus row, twice in a session.
 *
 * When Little fills it pays and comes down, but the markers stay lit - Big and
 * Boom or Bust are still running on the same numbers and need them. Which also
 * means Little cannot go up again in the same hand: every number it wants is
 * already marked, so the bet would be a certainty rather than a bet.
 *
 * A seven wipes the board. After that it is a fresh shooter and a fresh set,
 * and the same player can win it again - rare, but people do.
 */
{
  const low = [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3]] // 2, 3, 4, 5, 6
  let state = at({ phase: 'come-out', bets: bet({ little: 5, all: 5 }) })
  for (const [a, b] of low) state = resolveRoll(state, roll(a, b)).state

  eq('Little pays when its five are in', state.bankroll, 155)
  check('and comes off the felt', !state.bets.little)
  check('but the markers stay lit for the others', state.marked.size === 5)
  check('so Boom or Bust is still running on them', !!state.bets.all)
  check(
    'and Little cannot go up again on a board it has already filled',
    !check2('little', 5, { phase: state.phase, point: state.point, marked: state.marked, bets: state.bets }).ok,
  )

  // Seven out. The board is wiped and the next shooter starts clean.
  const after = resolveRoll(state, roll(3, 4))
  eq('a seven takes Boom or Bust with it', after.state.bankroll, 155)
  eq('and clears every marker', after.state.marked.size, 0)
  check(
    'so Little can be bet on the next shooter',
    check2('little', 5, {
      phase: after.state.phase,
      point: after.state.point,
      marked: after.state.marked,
      bets: after.state.bets,
    }).ok,
  )

  // And won again, which is the whole question.
  let again = { ...after.state, bets: bet({ little: 5 }), bankroll: 0 }
  for (const [a, b] of low) again = resolveRoll(again, roll(a, b)).state
  eq('and won again', again.bankroll, 155)
}

{
  // A come-out seven pays the line bettor and takes the bonus bettor, which is
  // the part players find hardest to believe. Both bets are held by the same
  // player here, so the closing balance is the whole story: $20 back on the
  // line, $5 gone off the bonus row.
  const start = at({ phase: 'come-out', bets: bet({ all: 5, pass: 10 }), marked: new Set([4, 5]) })
  const { state: after } = resolveRoll(start, roll(3, 4))
  eq('the line is paid and the bonus is taken on the same come-out seven', after.bankroll, 20)
  eq('and the tracker starts again', after.marked.size, 0)
}

// ------------------------------------------------------- the order of work

{
  const start = at({
    phase: 'point',
    point: 5,
    bets: bet({ yo: 1, field: 10, 'hard-8': 5, 'place-8': 30, 'come-8': 10, pass: 10 }),
  })
  const { events } = resolveRoll(start, roll(4, 4))
  const order = events.filter((e) => e.id).map((e) => e.id)
  check(
    'the centre settles before the box, and the box before the come',
    order.indexOf('yo') < order.indexOf('field') &&
      order.indexOf('field') < order.indexOf('hard-8') &&
      order.indexOf('hard-8') < order.indexOf('place-8') &&
      order.indexOf('place-8') < order.indexOf('come-8'),
    order.join(' '),
  )
}

// ---------------------------------------------------------- nothing mutates

{
  const start = at({ phase: 'point', point: 6, bets: bet({ pass: 10, 'place-8': 30 }) })
  const before = JSON.stringify({ ...start, marked: [...start.marked] })
  resolveRoll(start, roll(3, 4))
  eq('resolving a roll leaves the old table alone', JSON.stringify({ ...start, marked: [...start.marked] }), before)
}

done('rules')
