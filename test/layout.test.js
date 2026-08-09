import { check, done, eq } from './harness.js'
import { BET_IDS, BONUS, HOPS, POINTS, betDef, settle } from '../src/lib/bets.js'
import { BONUS_PAYTABLES } from '../src/lib/edges.js'
import { roll } from '../src/lib/rng.js'
import {
  BONUS_BOXES,
  BOX_LABEL,
  BOX_MID,
  BOX_NUMBERS,
  FELT,
  HARDWAYS,
  HOPS_ON_FELT,
  PUCK,
  SPOTS,
  SPOT_IDS,
  APRON,
  TRACKERS,
  TRACKER_ROWS,
  bonusPrice,
  chipAt,
} from '../src/lib/layout.js'

// The numbers each bonus bet is watching, so a completed set can be handed to
// settle() without the test writing them out a second time.
const BONUS_WATCH = Object.fromEntries(Object.entries(BONUS).map(([id, b]) => [id, b.numbers]))

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
   * layout does not print either - a come bet that found its number sits in
   * that number's box, a buy is a place bet with a button on it, and a lay on
   * the don't side is heeled against the flat bet it leans on. Anything else
   * turning up in this list means a bet has quietly lost its place on the felt.
   *
   * Pass odds are not in it. A real layout prints nothing there either, but
   * they go *behind* the line rather than beside it - that is what the name
   * means - so the apron below the pass line is drawn and takes them. It is
   * one of the few bets you place yourself, so it has to be somewhere a chip
   * can go.
   */
  const expected = [
    'dontpass-odds',
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

// The markers are indicators, not bets, and they were big enough to sit on top
// of the boxes they belong to. This is the check that they clear them.
{
  const lowest = Math.max(...TRACKERS.map((t) => t.cy + t.r))
  const boxTop = Math.min(...BONUS_BOXES.map(() => SPOTS.little.shape.y))
  check('the markers clear the boxes underneath them', boxTop - lowest >= 12, `${boxTop - lowest} units of air`)
  check('and stay inside the centre column', TRACKERS.every((t) => t.cx - t.r > 1060 && t.cx + t.r < 1470))
}

/*
 * The bonus row is the one price on this felt that moves house to house, so
 * what gets printed has to follow the table rather than being fixed. This is
 * the check that the felt cannot advertise a price the engine will not pay -
 * at either pay table.
 */
for (const paytable of Object.keys(BONUS_PAYTABLES)) {
  check(
    `the felt prints the ${BONUS_PAYTABLES[paytable].label} table correctly`,
    BONUS_BOXES.every((b) => bonusPrice(b.id, paytable) === `${BONUS_PAYTABLES[paytable].pays[b.id]} to 1`),
  )
  for (const b of BONUS_BOXES) {
    const rate = BONUS_PAYTABLES[paytable].pays[b.id]
    const paid = settle(b.id, 5, roll(3, 3), { marked: new Set(BONUS_WATCH[b.id]), bonus: paytable })
    eq(`a $5 ${b.label} pays $${5 * rate} at ${paytable} to 1`, paid.pay, 5 * rate)
  }
}

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
  'the puck sits over the middle of the number it marks',
  BOX_NUMBERS.every((n) => PUCK.on[n][0] === BOX_MID[n]),
)
// And when the table is coming out it sits clear of the apron, not on top of
// the odds that go there.
check('the puck off the point is clear of the apron', PUCK.off[0] + PUCK.r < APRON.x,
  `${PUCK.off[0]} + ${PUCK.r} vs ${APRON.x}`)
check('odds behind the line are outside it, not beside it',
  chipAt('pass-odds')[1] > chipAt('pass')[1] + 30,
  `line at ${chipAt('pass')[1]}, odds at ${chipAt('pass-odds')[1]}`)
check(
  'and it does not land on the chips in that box',
  BOX_NUMBERS.every((n) =>
    [`lay-${n}`, `dontcome-${n}`].every((id) => Math.abs(chipAt(id)[0] - PUCK.on[n][0]) > PUCK.r + 10),
  ),
)

done('layout')
