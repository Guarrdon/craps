import { check, done, eq } from './harness.js'
import { BET_IDS, HOPS, POINTS, betDef } from '../src/lib/bets.js'
import {
  BONUS_BOXES,
  BOX_LABEL,
  BOX_NUMBERS,
  FELT,
  HARDWAYS,
  HOPS_ON_FELT,
  PUCK,
  SPOTS,
  SPOT_IDS,
  TRACKERS,
  TRACKER_ROWS,
  chipAt,
} from '../src/lib/layout.js'

/*
 * The felt and the catalogue have to agree.
 *
 * A spot naming a bet that does not exist is a piece of layout you cannot bet
 * on. A bet with no spot is a rule with nowhere to put a chip. Both are silent
 * failures in the browser - the first does nothing when clicked, the second
 * simply never appears - so both are caught here instead.
 */

for (const id of SPOT_IDS) {
  check(`the felt's ${id} is a real bet`, BET_IDS.includes(id))
}

for (const id of BET_IDS) {
  check(`${betDef(id).label} has somewhere to put a chip`, !!chipAt(id), id)
}

eq('the felt has a spot for every bet and no more', SPOT_IDS.length, BET_IDS.length)

// --------------------------------------------------------------- the shapes

{
  const drawn = SPOT_IDS.filter((id) => SPOTS[id].shape)
  const inferred = SPOT_IDS.filter((id) => !SPOTS[id].shape)
  check('every drawn spot has a shape the browser understands', drawn.every((id) =>
    ['rect', 'circle', 'path', 'stroke', 'group'].includes(SPOTS[id].shape.type)))

  /*
   * The bets with no printed spot of their own. Every one is a bet a real
   * layout does not print either - odds go behind the flat bet, a come bet
   * that found its number sits in that number's box, a buy is a place bet with
   * a button on it. Anything else turning up in this list means a bet has
   * quietly lost its place on the felt.
   */
  const expected = [
    'pass-odds', 'dontpass-odds',
    ...POINTS.flatMap((n) => [`buy-${n}`, `come-${n}`, `come-odds-${n}`, `dontcome-${n}`, `dontcome-odds-${n}`]),
  ]
  eq('the unprinted bets are exactly the ones a table does not print',
    inferred.slice().sort().join(), expected.slice().sort().join())
}

// ------------------------------------------------------------ chip positions

for (const id of BET_IDS) {
  const [x, y] = chipAt(id)
  check(`${id}'s chip is on the felt`, x > 0 && x < FELT.w && y > 0 && y < FELT.h, `${x},${y}`)
}

{
  // Three different bets share each number box - a place, a come and a buy -
  // and a real dealer tells them apart by where in the box the chips are
  // stacked. If two of them landed on the same point they would be one pile.
  let collisions = 0
  const seen = new Map()
  for (const id of BET_IDS) {
    const key = chipAt(id).join(',')
    if (seen.has(key)) collisions++
    seen.set(key, id)
  }
  eq('no two bets stack in the same place', collisions, 0)
}

// ---------------------------------------------------------------- the box

eq('six numbers across the top', BOX_NUMBERS.length, 6)
eq('and they are the six points', BOX_NUMBERS.join(), POINTS.join())
eq('the six is spelled out', BOX_LABEL[6], 'Six')
eq('and so is the nine', BOX_LABEL[9], 'Nine')
check('the rest are digits', [4, 5, 8, 10].every((n) => BOX_LABEL[n] === String(n)))

// ---------------------------------------------------------------- the hops

eq('seventeen hop circles are drawn', HOPS_ON_FELT.length, 17)
eq('which is every hop the catalogue has', HOPS_ON_FELT.length, HOPS.length)
check(
  'each drawn circle is a hop that exists',
  HOPS_ON_FELT.every((h) => BET_IDS.includes(h.id)),
)
check(
  'and every hop is drawn exactly once',
  new Set(HOPS_ON_FELT.map((h) => h.id)).size === 17,
)
check(
  'the printed faces add up to the bet they are',
  HOPS_ON_FELT.every((h) => {
    const [a, b] = h.id.split('-').slice(1).map(Number)
    return h.face[0] + h.face[1] === a + b
  }),
)

// -------------------------------------------------------------- the bonus

eq('two rows of markers, shared by all three bets', TRACKER_ROWS.length, 2)
eq('ten markers in total, one per number', TRACKERS.length, 10)
eq('and no number is marked twice', new Set(TRACKERS.map((t) => t.number)).size, 10)
check(
  'the markers are the ten numbers that are not seven',
  TRACKERS.map((t) => t.number).sort((a, b) => a - b).join() === '2,3,4,5,6,8,9,10,11,12',
)
check('all three bonus boxes are on the felt', BONUS_BOXES.every((b) => SPOTS[b.id]))
check(
  'and each prints the price the engine will actually pay',
  BONUS_BOXES.every((b) => {
    const [num, den] = betDef(b.id).pays
    return b.pays === `${num} to ${den}`
  }),
)

// ------------------------------------------------------------- the hardways

eq('four hardways', HARDWAYS.length, 4)
check('one for each of 4, 6, 8 and 10', HARDWAYS.map((h) => h.n).sort((a, b) => a - b).join() === '4,6,8,10')
check(
  'the nines are the six and eight, the sevens are the four and ten',
  HARDWAYS.every((h) => h.pays === ([6, 8].includes(h.n) ? '9 TO 1' : '7 TO 1')),
)

// ------------------------------------------------------------------ the puck

check('the puck has somewhere to sit for every point', BOX_NUMBERS.every((n) => PUCK.on[n]))
check('and somewhere to sit when the table is coming out', PUCK.off?.length === 2)
check(
  'the puck sits on the number it marks',
  BOX_NUMBERS.every((n, i) => Math.abs(PUCK.on[n][0] - chipAt(`place-${n}`)[0]) < 1),
)

done('layout')
