/*
 * Every bet on the felt, and what it does.
 *
 * One entry per spot you can put a chip on, keyed by the id the layout uses,
 * so there is exactly one place that knows what a bet pays, when it works and
 * whether it can come down. The felt draws from the same ids; the table state
 * is keyed by them; the tests walk this catalogue rather than a list of their
 * own, which is how a bet that gets added but never wired up shows up as a
 * failure instead of a quiet omission.
 *
 * settle() is the whole of a bet's behaviour. It answers one question - given
 * this roll, in this phase, what happens - and it answers it without touching
 * table state, because a bet that needs to know about *other* bets is a bet
 * that belongs in rules.js. The only two like that are Come and Don't Come,
 * which move to a box rather than resolve, and they say so.
 */

import { BONUS_PAYTABLES } from './edges.js'

export const POINTS = [4, 5, 6, 8, 9, 10]

// --------------------------------------------------------------- payout tables

// What the house pays on a number, laid against what it truly is. The gap
// between these two is the entire house edge on the box.
export const PLACE_PAYS = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] }
export const TRUE_ODDS = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] }
// The don't side lays the same odds the other way up: risk more to win less,
// because it is the favourite once a point is out.
export const LAY_ODDS = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] }

export const HARDWAY_PAYS = { 4: [7, 1], 6: [9, 1], 8: [9, 1], 10: [7, 1] }

// The smallest bet that can be paid in whole dollars. A dealer will not take
// $5 on the six, because 7:6 on five dollars is not a number of chips, and
// this is where that rule lives.
const unitFor = ([num, den]) => den

const ratio = (amount, [num, den]) => (amount * num) / den

const isHard = ({ a, b }) => a === b
const CRAPS = new Set([2, 3, 12])

// ------------------------------------------------------------------- outcomes

// A bet that has not resolved yet returns null and stays where it is.
const RIDES = null

/*
 * win    the bet won. `pay` is profit, on top of the stake.
 * lose   the bet is taken.
 * push   nothing happens, the stake comes back. Only the don't side, barring 12.
 *
 * `down` is what separates a line bet from a box bet after a win. Pass wins and
 * comes off; place wins and stays up for the next roll. Getting this backwards
 * is the difference between a $30 six paying $35 once and paying it forever.
 */
const win = (pay, down = true) => ({ outcome: 'win', pay, down })
const lose = () => ({ outcome: 'lose', pay: 0, down: true })
const push = () => ({ outcome: 'push', pay: 0, down: true })

// --------------------------------------------------------------- the catalogue

const defs = []

const def = (spec) => {
  defs.push({
    // Defaults chosen so that the common case is silent and only the
    // exceptions are spelled out at the call site.
    group: 'prop',
    oneRoll: false,
    contract: false, // true: cannot be taken down once at risk
    worksOnComeOut: true,
    togglable: false, // player may turn it off between rolls
    unit: 1,
    vig: null,
    ...spec,
  })
  return spec.id
}

// ------- the line

def({
  id: 'pass',
  group: 'line',
  label: 'Pass Line',
  contract: true,
  unit: 1,
  settle: (r, { point }) => {
    if (point) return r.total === point ? win('flat') : r.total === 7 ? lose() : RIDES
    // Come out. Seven and eleven are a natural, craps is a loser, anything
    // else sets the point and the bet rides to it.
    if (r.total === 7 || r.total === 11) return win('flat')
    if (CRAPS.has(r.total)) return lose()
    return RIDES
  },
})

def({
  id: 'dontpass',
  group: 'line',
  label: "Don't Pass Bar",
  contract: true, // may be taken down, but the engine never volunteers it
  settle: (r, { point }) => {
    if (point) return r.total === 7 ? win('flat') : r.total === point ? lose() : RIDES
    if (r.total === 2 || r.total === 3) return win('flat')
    if (r.total === 7 || r.total === 11) return lose()
    // Barred. The twelve is what stops the don't side being a free lunch:
    // without it, laying against the come-out would have the edge.
    if (r.total === 12) return push()
    return RIDES
  },
})

def({
  id: 'come',
  group: 'line',
  label: 'Come',
  contract: true,
  settle: (r) => {
    if (r.total === 7 || r.total === 11) return win('flat')
    if (CRAPS.has(r.total)) return lose()
    return RIDES // travels to its box - rules.js does the moving
  },
})

def({
  id: 'dontcome',
  group: 'line',
  label: "Don't Come Bar",
  contract: true,
  settle: (r) => {
    if (r.total === 2 || r.total === 3) return win('flat')
    if (r.total === 7 || r.total === 11) return lose()
    if (r.total === 12) return push()
    return RIDES
  },
})

for (const n of POINTS) {
  // A come bet that found its number. Behaves exactly like a pass line with a
  // point of its own, which is all a come bet has ever been.
  def({
    id: `come-${n}`,
    group: 'line',
    label: `Come ${n}`,
    number: n,
    contract: true,
    settle: (r) => (r.total === n ? win('flat') : r.total === 7 ? lose() : RIDES),
  })

  def({
    id: `dontcome-${n}`,
    group: 'line',
    label: `Don't Come ${n}`,
    number: n,
    contract: true,
    settle: (r) => (r.total === 7 ? win('flat') : r.total === n ? lose() : RIDES),
  })

  // Odds. No house edge at all on these - they pay exactly what the number is
  // worth - which is why the table caps them relative to the flat bet rather
  // than letting you back a $5 line with $500.
  const oddsPay = TRUE_ODDS[n]
  const layPay = LAY_ODDS[n]

  def({
    id: `come-odds-${n}`,
    group: 'odds',
    label: `Odds ${n}`,
    behind: `come-${n}`,
    number: n,
    unit: unitFor(oddsPay),
    // Off on the come-out unless called on: the shooter is trying to make a
    // new point, and your come-number odds have no reason to be at risk on a
    // seven that is helping the line.
    worksOnComeOut: false,
    togglable: true,
    settle: (r) => (r.total === n ? win(ratio(r.amount, oddsPay)) : r.total === 7 ? lose() : RIDES),
  })

  def({
    id: `dontcome-odds-${n}`,
    group: 'odds',
    label: `Lay odds ${n}`,
    behind: `dontcome-${n}`,
    number: n,
    unit: unitFor(layPay),
    worksOnComeOut: false,
    togglable: true,
    settle: (r) => (r.total === 7 ? win(ratio(r.amount, layPay)) : r.total === n ? lose() : RIDES),
  })
}

/*
 * The two line odds. Unlike the come odds they have no number of their own -
 * they hang off whatever the point turned out to be - so their unit and their
 * payout are worked out from the point at the moment they are placed, and
 * rules.js settles them alongside the flat bet they are behind. Odds on the
 * line are always working on a come-out, because on a come-out there is no
 * point for them to be behind.
 */
def({
  id: 'pass-odds',
  group: 'odds',
  label: 'Odds',
  behind: 'pass',
  settle: (r, { point }) =>
    r.total === point ? win(ratio(r.amount, TRUE_ODDS[point])) : r.total === 7 ? lose() : RIDES,
})

def({
  id: 'dontpass-odds',
  group: 'odds',
  label: 'Lay odds',
  behind: 'dontpass',
  settle: (r, { point }) =>
    r.total === 7 ? win(ratio(r.amount, LAY_ODDS[point])) : r.total === point ? lose() : RIDES,
})

// ------- the box

for (const n of POINTS) {
  const placePay = PLACE_PAYS[n]
  def({
    id: `place-${n}`,
    group: 'box',
    label: `Place ${n}`,
    number: n,
    unit: unitFor(placePay),
    // The default every table runs: your place bets are not working on a come
    // out roll. You can call them on, and the dealer will put an ON button on
    // top of them so the box knows.
    worksOnComeOut: false,
    togglable: true,
    settle: (r) => (r.total === n ? win(ratio(r.amount, placePay), false) : r.total === 7 ? lose() : RIDES),
  })

  const buyPay = TRUE_ODDS[n]
  def({
    id: `buy-${n}`,
    group: 'box',
    label: `Buy ${n}`,
    number: n,
    unit: unitFor(buyPay),
    worksOnComeOut: false,
    togglable: true,
    // Pays true odds and charges 5% for the privilege. On the 4 and 10 that is
    // a better deal than placing; on the 6 and 8 it is worse, which is why
    // nobody buys the six.
    vig: 'bet',
    settle: (r) => (r.total === n ? win(ratio(r.amount, buyPay), false) : r.total === 7 ? lose() : RIDES),
  })

  const lay = LAY_ODDS[n]
  def({
    id: `lay-${n}`,
    group: 'box',
    label: `Lay ${n}`,
    number: n,
    unit: unitFor(lay),
    worksOnComeOut: true,
    togglable: true,
    // The vig is on what you stand to win, not what you put up - laying $40 to
    // win $20 on the four costs a dollar, not two.
    vig: 'win',
    settle: (r) => (r.total === 7 ? win(ratio(r.amount, lay), false) : r.total === n ? lose() : RIDES),
  })
}

// ------- the field

def({
  id: 'field',
  group: 'field',
  label: 'Field',
  oneRoll: true,
  // This table pays double on both ends. Plenty pay triple on the twelve; this
  // one does not, and the felt is the authority.
  settle: (r) => {
    if (r.total === 2 || r.total === 12) return win(r.amount * 2)
    if ([3, 4, 9, 10, 11].includes(r.total)) return win(r.amount)
    return lose()
  },
})

// ------- the centre, one roll

const oneRoll = (id, label, pays, hits) =>
  def({
    id,
    label,
    group: 'centre',
    oneRoll: true,
    settle: (r) => (hits(r) ? win(ratio(r.amount, pays)) : lose()),
  })

oneRoll('any7', 'Seven', [4, 1], (r) => r.total === 7)
oneRoll('anycraps', 'Any Craps', [7, 1], (r) => CRAPS.has(r.total))
oneRoll('aces', 'Aces', [30, 1], (r) => r.total === 2)
oneRoll('boxcars', 'Boxcars', [30, 1], (r) => r.total === 12)
oneRoll('acedeuce', 'Ace Deuce', [15, 1], (r) => r.total === 3)
oneRoll('yo', 'Yo', [15, 1], (r) => r.total === 11)

// A horn is four bets in one chip, so it wants four dollars, and three of them
// are gone whatever happens. The winning quarter pays its own rate.
def({
  id: 'horn',
  label: 'Horn',
  group: 'centre',
  oneRoll: true,
  unit: 4,
  settle: (r) => {
    const quarter = r.amount / 4
    const rate = r.total === 2 || r.total === 12 ? 30 : r.total === 3 || r.total === 11 ? 15 : 0
    if (!rate) return lose()
    // Won: the winning quarter pays, the other three are taken. Reported as
    // profit, so this is the rate less the three quarters that went.
    return win(quarter * rate - quarter * 3)
  },
})

// C and E: half on any craps, half on the eleven. Two bets, one chip, and the
// circles are dotted all the way round the come so a dealer can reach yours.
def({
  id: 'ce',
  label: 'C & E',
  group: 'centre',
  oneRoll: true,
  unit: 2,
  settle: (r) => {
    const half = r.amount / 2
    if (CRAPS.has(r.total)) return win(half * 7 - half)
    if (r.total === 11) return win(half * 15 - half)
    return lose()
  },
})

// ------- hardways

for (const n of [4, 6, 8, 10]) {
  const pays = HARDWAY_PAYS[n]
  def({
    id: `hard-${n}`,
    label: `Hard ${n}`,
    group: 'hardway',
    number: n,
    worksOnComeOut: false,
    togglable: true,
    // Lives until the number comes the hard way, or the easy way, or a seven
    // ends it. A hard eight loses to 6-2 just as surely as to a seven, which
    // is the part that surprises people.
    settle: (r) => {
      if (r.total === n) return isHard(r) ? win(ratio(r.amount, pays), false) : lose()
      return r.total === 7 ? lose() : RIDES
    },
  })
}

// ------- hops

/*
 * The seventeen circles. Every combination except the four that already have a
 * spot of their own in the centre - 1-1, 1-2, 5-6 and 6-6 are the aces, ace
 * deuce, yo and boxcars, and a table will not take the same bet twice under
 * two names.
 *
 * A double can only be made one way out of thirty six, so it pays 30:1; an
 * easy hop can be made two ways, so it pays 15:1. Both are the same terrible
 * value, which is the joke of the hop grid.
 */
export const HOPS = []
for (let a = 1; a <= 6; a++) {
  for (let b = a; b <= 6; b++) {
    const total = a + b
    if ((a === b && (total === 2 || total === 12)) || total === 3 || total === 11) continue
    HOPS.push([a, b])
    const hard = a === b
    const pays = hard ? [30, 1] : [15, 1]
    def({
      id: `hop-${a}-${b}`,
      label: `Hop ${a}-${b}`,
      group: 'hop',
      oneRoll: true,
      hard,
      dice: [a, b],
      settle: (r) =>
        (r.a === a && r.b === b) || (r.a === b && r.b === a) ? win(ratio(r.amount, pays)) : lose(),
    })
  }
}

// ------- the bonus row

/*
 * Little Ones, Big Ones and Boom or Bust - the bet that every number on its
 * list is rolled before a seven. Multi-roll and slow: Boom or Bust needs all
 * ten and comes in about once in five hundred and twenty six shooters, which
 * is what 150 to 1 is being paid against.
 *
 * These do not settle from a roll alone - they settle from the shooter's whole
 * history - so the tracker in table.js decides them and settle() only handles
 * the seven that ends it.
 */
/*
 * The one bet on this felt whose price moves house to house, so the rate is
 * not baked in here - it comes from the table, and edges.js works out what
 * that costs. 30 to 1 is the reference photograph and what most houses run;
 * 34 to 1 turns it from one of the worst bets on the layout into one of the
 * better long shots. A table printing "31 FOR 1" is printing 30 to 1: "for
 * one" includes the stake coming back and "to one" does not.
 */
export const BONUS = {
  little: { numbers: [2, 3, 4, 5, 6] },
  big: { numbers: [8, 9, 10, 11, 12] },
  all: { numbers: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] },
}

for (const [id, { numbers }] of Object.entries(BONUS)) {
  def({
    id,
    label: { little: 'Little Ones', big: 'Big Ones', all: 'Boom or Bust' }[id],
    group: 'bonus',
    numbers,
    // Always working, come-out included - the come-out roll is where most of
    // these numbers get marked off.
    worksOnComeOut: true,
    settle: (r, { marked, bonus = '30' }) => {
      if (r.total === 7) return lose()
      // Complete once every number on the list has been marked, which the
      // table has already done for this roll by the time we are asked.
      return numbers.every((n) => marked.has(n))
        ? win(r.amount * BONUS_PAYTABLES[bonus].pays[id])
        : RIDES
    },
  })
}

// ------------------------------------------------------------------- lookup

export const BETS = Object.fromEntries(defs.map((d) => [d.id, d]))
export const BET_IDS = defs.map((d) => d.id)

export const betDef = (id) => {
  const d = BETS[id]
  if (!d) throw new Error(`no such bet: ${id}`)
  return d
}

export const betsInGroup = (group) => defs.filter((d) => d.group === group)

/*
 * Settle one bet against one roll.
 *
 * `amount` rides along on the roll rather than being a second argument because
 * every settle() above needs it and threading it through as `r.amount` keeps
 * those one-liners to one line.
 *
 * The 'flat' sentinel means "pays even money" - written out rather than
 * repeating `r.amount` in nine places, and it makes the even-money bets
 * obvious at a glance in the catalogue.
 */
export function settle(id, amount, roll, ctx = {}) {
  const d = betDef(id)
  const result = d.settle({ ...roll, amount }, ctx)
  if (!result) return null
  return { ...result, pay: result.pay === 'flat' ? amount : result.pay }
}

// Does this bet have money at risk on this roll? A place bet turned off on the
// come-out is still on the felt - it just cannot win or lose.
export function isWorking(id, bet, phase) {
  const d = betDef(id)
  if (bet.working !== undefined) return bet.working
  return phase === 'come-out' ? d.worksOnComeOut : true
}

// Every ordered throw, once. The order matters for the hops, which care which
// die is which even though the payout does not.
export const ALL_ROLLS = []
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALL_ROLLS.push({ a, b, total: a + b })

/*
 * What a bet pays, and on what.
 *
 * Rather than a second copy of the payout tables written out for the
 * interface, this asks the bet itself: try all thirty six throws, keep the
 * ones that win, and group them by what they paid. A quote and a payout can
 * therefore never disagree, because they are the same function.
 *
 * Returns [{ pay, rolls, chance }], best-paying first. `chance` is out of 36,
 * which makes it the tool the audit uses too - a one-roll bet's house edge
 * falls straight out of these numbers.
 */
export function quote(id, amount = 1, ctx = {}) {
  const wins = new Map()
  for (const r of ALL_ROLLS) {
    const result = settle(id, amount, r, ctx)
    if (result?.outcome !== 'win') continue
    const key = result.pay
    if (!wins.has(key)) wins.set(key, [])
    wins.get(key).push(r)
  }
  return [...wins.entries()]
    .map(([pay, rolls]) => ({ pay, rolls, chance: rolls.length / 36 }))
    .sort((x, y) => y.pay - x.pay)
}

/*
 * The house edge on a bet that lives and dies on one throw.
 *
 * Only meaningful for the one-roll bets - anything multi-roll depends on the
 * sequence and has to be simulated - but those are exactly the bets where a
 * payout typo is easiest to make and hardest to notice, so having the number
 * fall out of the catalogue itself is worth the twelve lines.
 */
export function oneRollEdge(id) {
  const d = betDef(id)
  if (!d.oneRoll) return null
  let ev = 0
  for (const r of ALL_ROLLS) {
    const result = settle(id, 36, r, {})
    ev += result?.outcome === 'win' ? result.pay : result?.outcome === 'push' ? 0 : -36
  }
  return -ev / (36 * 36)
}
