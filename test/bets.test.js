import { check, done, eq, near } from './harness.js'
import {
  BETS,
  BET_IDS,
  HOPS,
  POINTS,
  betDef,
  betsInGroup,
  isWorking,
  oneRollEdge,
  quote,
  settle,
} from '../src/lib/bets.js'
import { EDGES } from '../src/lib/edges.js'
import { roll } from '../src/lib/rng.js'

// ------------------------------------------------------------ the catalogue

check('every bet knows how to settle', BET_IDS.every((id) => typeof BETS[id].settle === 'function'))
check('every bet has a label', BET_IDS.every((id) => BETS[id].label))
check('asking for a bet that is not on the felt throws', (() => {
  try { betDef('big6'); return false } catch { return true }
})())

// Big 6 and Big 8 are not on this layout, and neither are place bets on the
// numbers a crapless table carries. This is the check that the felt in the
// photographs is the felt in the code.
check('there is no Big 6 or Big 8', !BETS['big-6'] && !BETS['big-8'])
check('the box is 4 5 6 8 9 10 and nothing else', POINTS.join() === '4,5,6,8,9,10')
check('no place bets on 2, 3, 11 or 12', ![2, 3, 11, 12].some((n) => BETS[`place-${n}`]))

// ------------------------------------------------------------------- hops

eq('seventeen hop circles', HOPS.length, 17)
eq('four of them are doubles', HOPS.filter(([a, b]) => a === b).length, 4)
eq('thirteen are easy', HOPS.filter(([a, b]) => a !== b).length, 13)
check(
  'the four combinations with their own spot in the centre are not hops',
  !BETS['hop-1-1'] && !BETS['hop-1-2'] && !BETS['hop-5-6'] && !BETS['hop-6-6'],
)
check(
  'the doubles on the felt are 2-2, 3-3, 4-4 and 5-5',
  HOPS.filter(([a, b]) => a === b).map(([a]) => a).join() === '2,3,4,5',
)

// ------------------------------------------------- one-roll bets, exactly
//
// These are computable to the last decimal from the catalogue itself, so they
// are asserted exactly rather than within a tolerance. A payout typo moves
// one of these numbers and nothing else in the suite would notice.

const edge = (id) => oneRollEdge(id) * 100
const EXACT = {
  field: 5.5555555556, // 2 and 12 both double, as printed
  any7: 16.6666666667,
  anycraps: 11.1111111111,
  aces: 13.8888888889,
  boxcars: 13.8888888889,
  acedeuce: 11.1111111111,
  yo: 11.1111111111,
  horn: 12.5,
  ce: 11.1111111111,
  'hop-3-3': 13.8888888889, // a double, 30:1
  'hop-3-4': 11.1111111111, // easy, 15:1
}
for (const [id, expected] of Object.entries(EXACT)) {
  near(`${betDef(id).label} keeps ${expected.toFixed(3)}% for the house`, edge(id), expected, 1e-8)
}

/*
 * And the published table agrees with the code.
 *
 * edges.js is what the rules screen shows a player and what the audit measures
 * the engine against. For the one-roll bets the true figure is computable from
 * the catalogue itself, so the two are held against each other here - a payout
 * typo moves one, a wrong claim moves the other, and either way this fails.
 */
for (const d of BET_IDS.map(betDef).filter((d) => d.oneRoll)) {
  near(`the rules screen quotes ${d.label} correctly`, EDGES[d.id], edge(d.id), 0.001)
}
check('every bet on the felt has a published cost', BET_IDS.every((id) => EDGES[id] !== undefined))

check('every double hop pays the same 13.889%', HOPS.filter(([a, b]) => a === b)
  .every(([a, b]) => Math.abs(edge(`hop-${a}-${b}`) - 13.8888888889) < 1e-8))
check('every easy hop pays the same 11.111%', HOPS.filter(([a, b]) => a !== b)
  .every(([a, b]) => Math.abs(edge(`hop-${a}-${b}`) - 11.1111111111) < 1e-8))

// No one-roll bet on this felt is a good bet, and none of them is a giveaway
// either. Anything outside this band is a payout error, in one direction or
// the other.
for (const d of BET_IDS.map(betDef).filter((d) => d.oneRoll)) {
  const e = edge(d.id)
  check(`${d.label} sits between 5% and 17%`, e >= 5 && e <= 17, `${e.toFixed(3)}%`)
}

// --------------------------------------------------------- what things pay

const pays = (id, amount, r, ctx = {}) => settle(id, amount, r, ctx)?.pay

eq('a $30 place six pays $35', pays('place-6', 30, roll(3, 3)), 35)
eq('a $25 place five pays $35', pays('place-5', 25, roll(2, 3)), 35)
eq('a $25 place four pays $45', pays('place-4', 25, roll(2, 2)), 45)
eq('a $25 buy four pays $50, before the vig', pays('buy-4', 25, roll(2, 2)), 50)
eq('a $40 lay against the four wins $20', pays('lay-4', 40, roll(3, 4)), 20)
eq('a $30 lay against the six wins $25', pays('lay-6', 30, roll(3, 4)), 25)

eq('a $5 hard eight pays $45', pays('hard-8', 5, roll(4, 4)), 45)
eq('a $5 hard ten pays $35', pays('hard-10', 5, roll(5, 5)), 35)
check('a hard eight loses to an easy one', settle('hard-8', 5, roll(6, 2), {}).outcome === 'lose')
check('a hard eight loses to a seven', settle('hard-8', 5, roll(3, 4), {}).outcome === 'lose')
check('a hard eight rides on anything else', settle('hard-8', 5, roll(2, 3), {}) === null)

eq('a $10 field pays $10 on the nine', pays('field', 10, roll(4, 5)), 10)
eq('a $10 field pays $20 on the two', pays('field', 10, roll(1, 1)), 20)
eq('a $10 field pays $20 on the twelve', pays('field', 10, roll(6, 6)), 20)
check('the field loses on the seven', settle('field', 10, roll(3, 4), {}).outcome === 'lose')
check('the field loses on the five', settle('field', 10, roll(2, 3), {}).outcome === 'lose')

// A horn is four bets in one chip and three of them always lose, which is what
// makes the arithmetic worth checking rather than assuming.
eq('a $4 horn nets $27 on the twelve', pays('horn', 4, roll(6, 6)), 27)
eq('a $4 horn nets $12 on the eleven', pays('horn', 4, roll(5, 6)), 12)
eq('a $2 C&E nets $14 on the eleven', pays('ce', 2, roll(5, 6)), 14)
eq('a $2 C&E nets $6 on the three', pays('ce', 2, roll(1, 2)), 6)

eq('a $1 hop on 3-3 pays $30', pays('hop-3-3', 1, roll(3, 3)), 30)
eq('a $1 hop on 3-4 pays $15', pays('hop-3-4', 1, roll(3, 4)), 15)
check('a hop on 3-4 also wins on 4-3', settle('hop-3-4', 1, roll(4, 3), {}).outcome === 'win')

// --------------------------------------------------------------- the line

eq('$10 on the pass line pays $10 on a seven', pays('pass', 10, roll(3, 4), { point: null }), 10)
check('the pass line loses to craps on the come-out', settle('pass', 10, roll(1, 2), { point: null }).outcome === 'lose')
check('the pass line rides on a point number', settle('pass', 10, roll(4, 2), { point: null }) === null)
eq('$10 on the pass line pays $10 when the point is made', pays('pass', 10, roll(3, 3), { point: 6 }), 10)
check('the pass line loses to a seven out', settle('pass', 10, roll(3, 4), { point: 6 }).outcome === 'lose')

check("don't pass pushes on the barred twelve", settle('dontpass', 10, roll(6, 6), { point: null }).outcome === 'push')
check("don't pass wins on the two", settle('dontpass', 10, roll(1, 1), { point: null }).outcome === 'win')
check("don't pass loses to the eleven", settle('dontpass', 10, roll(5, 6), { point: null }).outcome === 'lose')
check("don't pass wins on a seven out", settle('dontpass', 10, roll(3, 4), { point: 8 }).outcome === 'win')

// The come box is the pass line one roll behind, which the payouts should
// reflect exactly.
check('the come box wins on a seven', settle('come', 10, roll(3, 4), {}).outcome === 'win')
check('the come box loses to craps', settle('come', 10, roll(1, 1), {}).outcome === 'lose')
check('the come box rides on a number', settle('come', 10, roll(4, 4), {}) === null)

// ---------------------------------------------------------------- the odds

eq('$25 odds behind a six pays $30', pays('pass-odds', 25, roll(3, 3), { point: 6 }), 30)
eq('$20 odds behind a five pays $30', pays('pass-odds', 20, roll(2, 3), { point: 5 }), 30)
eq('$15 odds behind a four pays $30', pays('pass-odds', 15, roll(2, 2), { point: 4 }), 30)
eq('$30 laid against a four wins $15', pays('dontpass-odds', 30, roll(3, 4), { point: 4 }), 15)
eq('$30 laid against a five wins $20', pays('dontpass-odds', 30, roll(3, 4), { point: 5 }), 20)
eq('$30 laid against a six wins $25', pays('dontpass-odds', 30, roll(3, 4), { point: 6 }), 25)

// Odds are the only bet in the house with no edge at all. If any of these ever
// comes out non-zero, the true-odds table has been edited.
for (const n of POINTS) {
  const winsPer = quote(`come-odds-${n}`, 36, {})[0]
  const ways = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 }[n]
  const ev = (ways / (ways + 6)) * winsPer.pay - (6 / (ways + 6)) * 36
  near(`odds on the ${n} are a dead even bet`, ev, 0, 1e-9)
}

// ------------------------------------------------------------ working state

check('place bets are off on the come-out', !isWorking('place-6', {}, 'come-out'))
check('place bets work once the point is out', isWorking('place-6', {}, 'point'))
check('a place bet called on works on the come-out', isWorking('place-6', { working: true }, 'come-out'))
check('hardways are off on the come-out', !isWorking('hard-8', {}, 'come-out'))
check('come odds are off on the come-out', !isWorking('come-odds-6', {}, 'come-out'))
check('a come bet on a number always works', isWorking('come-6', {}, 'come-out'))
check('the field always works', isWorking('field', {}, 'come-out'))
check('the bonus row always works', isWorking('all', {}, 'come-out'))
check('a lay bet works on the come-out', isWorking('lay-4', {}, 'come-out'))

// --------------------------------------------------------------- the bonus

const marked = (...ns) => new Set(ns)
check('Little rides while a number is missing', settle('little', 1, roll(1, 1), { marked: marked(2, 3, 4, 5) }) === null)
eq('a $1 Little pays $30 when the last one lands', pays('little', 1, roll(3, 3), { marked: marked(2, 3, 4, 5, 6) }), 30)
eq('a $1 Big pays $30', pays('big', 1, roll(6, 6), { marked: marked(8, 9, 10, 11, 12) }), 30)
eq('a $1 Boom or Bust pays $150', pays('all', 1, roll(6, 6), { marked: marked(2, 3, 4, 5, 6, 8, 9, 10, 11, 12) }), 150)
check('the bonus row loses to any seven', settle('all', 1, roll(3, 4), { marked: marked(2, 3, 4, 5, 6, 8, 9, 10, 11) }).outcome === 'lose')

// --------------------------------------------------------- quote and payout
//
// quote() is what the interface shows on a spot. It is derived by settling all
// thirty six throws, so it cannot drift from the payout - this checks that the
// derivation is actually wired up rather than returning nothing.

for (const id of BET_IDS) {
  const d = betDef(id)
  if (d.group === 'odds' || d.group === 'bonus') continue
  const q = quote(id, 12, { point: 6, marked: new Set() })
  check(`${d.label} quotes at least one way to win`, q.length > 0)
}

{
  const q = quote('field', 10, {})
  eq('the field quotes two prices', q.length, 2)
  eq('the better of them is the double', q[0].pay, 20)
  near('and it comes in two times in thirty six', q[0].chance, 2 / 36)
}

// A bet that stays up after it wins, versus one that comes down. Getting this
// backwards would pay a place bet once and then forget it, or pay it forever.
check('a winning pass line comes down', settle('pass', 10, roll(3, 4), { point: null }).down)
check('a winning place bet stays up', !settle('place-6', 30, roll(3, 3), {}).down)
check('a winning hardway stays up', !settle('hard-8', 5, roll(4, 4), {}).down)
check('a winning field comes down', settle('field', 10, roll(1, 1), {}).down)
check('a winning hop comes down', settle('hop-3-4', 1, roll(3, 4), {}).down)

done('bets')
