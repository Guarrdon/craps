/*
 * What the table will and will not take.
 *
 * This is the module that says no. Every refusal here is one a real dealer
 * makes, and the reason string is roughly what they would say while sliding
 * the chips back - because "invalid bet" teaches nobody anything, and half of
 * learning craps is finding out why the six wants thirty and not twenty five.
 *
 * Nothing here mutates. check() answers a question about a bet that has not
 * been made yet, so the interface can grey a spot out before it is clicked
 * rather than bouncing the player after.
 */

import { BETS, LAY_ODDS, PLACE_PAYS, POINTS, TRUE_ODDS, betDef } from './bets.js'

export const DEFAULT_TABLE = {
  min: 10, // the line
  max: 5000,
  propMin: 1, // the centre. A dollar has always been enough for a hop.
  propMax: 500,
  bonusMin: 1,
  bonusMax: 25,
  odds: '3-4-5',
  // Which pay table the bonus row runs. See BONUS_PAYTABLES in edges.js - it
  // is the one price on this felt that genuinely differs house to house.
  bonus: '30',
  vigRate: 0.05,
  vigMin: 1,
}

// What the odds are capped at, expressed the way the table sign expresses it.
export const ODDS_OPTIONS = [
  { id: '3-4-5', label: '3-4-5x', note: 'Every point wins the same six times your line bet.' },
  { id: 1, label: '1x', note: 'Odds equal to your line bet.' },
  { id: 2, label: '2x', note: 'Twice your line bet.' },
  { id: 3, label: '3x', note: 'Three times, on every point.' },
  { id: 5, label: '5x', note: 'Five times, on every point.' },
  { id: 10, label: '10x', note: 'Ten times. Downtown.' },
  { id: 100, label: '100x', note: 'The lowest edge in the house, if you can fund it.' },
]

const isMoney = (n) => Number.isInteger(n) && n > 0

// ------------------------------------------------------------------ increments

/*
 * The smallest step a bet can move in, so that its payout lands on whole
 * dollars.
 *
 * A place six pays 7:6, so it wants sixes: $30 pays $35, and $25 would pay
 * $29.16. The house does not deal in cents, so it refuses the bet rather than
 * rounding your win down - which is the honest way round, and the reason the
 * regulars all bet the six and eight in thirties.
 */
export function unitFor(id, { point } = {}) {
  const d = betDef(id)
  if (d.group === 'odds') {
    const n = d.number ?? point
    if (!n) return 1
    // Odds pay true odds, so the denominator of the true odds is the step.
    const table = d.id.startsWith('dontpass') || d.id.startsWith('dontcome') ? LAY_ODDS : TRUE_ODDS
    return table[n][1]
  }
  return d.unit ?? 1
}

// --------------------------------------------------------------------- odds

/*
 * The most you may put behind a flat bet.
 *
 * 3-4-5x is not three arbitrary numbers. Three times the four, four times the
 * five, five times the six - each one wins exactly six times the flat bet, so
 * the dealer pays the same amount whatever the point is and never has to think
 * about it. That is the entire reason the scheme exists, and it is why the cap
 * here is worked out from the win rather than from the stake.
 */
export function maxOdds(id, flat, { point, table = DEFAULT_TABLE } = {}) {
  const d = betDef(id)
  const n = d.number ?? point
  if (!n || !flat) return 0

  const dontSide = id.startsWith('dontpass') || id.startsWith('dontcome')
  const [num, den] = dontSide ? LAY_ODDS[n] : TRUE_ODDS[n]

  /*
   * The two schemes are capped at different ends, which is not an
   * inconsistency - it is what the table signs actually say.
   *
   * 3-4-5x caps the *win*: three times the four, four times the five, five
   * times the six all win exactly six times the flat bet, so the dealer pays
   * the same number whatever the point is. The don't side is quoted the same
   * way - lay whatever it takes to win six times your bet - and on the four
   * that means laying twelve times it.
   *
   * A plain multiple caps the *stake* on the do side, because "10x odds"
   * means ten times your bet is what you may put up. On the don't side the
   * same sign is read as ten times your bet is what you may win, since laying
   * ten times the flat on the four would only win five.
   */
  const raw =
    table.odds === '3-4-5'
      ? (flat * 6 * den) / num
      : dontSide
        ? (flat * table.odds * den) / num
        : flat * table.odds

  const unit = unitFor(id, { point })
  return Math.floor(raw / unit) * unit
}

// ---------------------------------------------------------------------- vig

/*
 * Five per cent, and always in the house's favour when it does not divide.
 *
 * Buy bets pay the commission on the stake; lay bets pay it on the win, which
 * is why laying the four costs a dollar on forty rather than two. A dollar is
 * the floor either way - the house will not deal in change, and that floor is
 * most of why a small buy bet is a bad bet.
 */
export function vigFor(id, amount, { table = DEFAULT_TABLE } = {}) {
  const d = betDef(id)
  if (!d.vig) return 0
  // No bet, no commission. Without this the dollar floor below would charge a
  // phantom vig on a bet of nothing, and check() - which prices a top-up as
  // the vig on the new total less the vig already paid - would quietly
  // undercharge every increase by that dollar.
  if (amount <= 0) return 0
  const base =
    d.vig === 'win' ? (amount * LAY_ODDS[d.number][0]) / LAY_ODDS[d.number][1] : amount
  return Math.max(table.vigMin, Math.floor(base * table.vigRate))
}

// ------------------------------------------------------------------- ranges

// Which minimum and maximum a spot answers to. The centre and the bonus row
// run their own, far below the line, which is why a $10 table will take a
// dollar on the yo.
export function rangeFor(id, { table = DEFAULT_TABLE } = {}) {
  const d = betDef(id)
  if (d.group === 'bonus') return { min: table.bonusMin, max: table.bonusMax }
  // Everything the stickman handles runs on the centre minimum. The hardways
  // belong here with the props and the hops, not with the line - a dollar on
  // the hard eight is a bet every table in Nevada will take, and a $10 one is
  // not what anybody means by it.
  if (d.group === 'centre' || d.group === 'hop' || d.group === 'hardway') {
    return { min: table.propMin, max: table.propMax }
  }
  if (d.group === 'field') return { min: table.min, max: table.max }
  if (d.group === 'odds') return { min: 1, max: table.max }
  // Line and box. The box has to clear the line minimum too, but the increment
  // usually bites first: on a $10 table the six wants $12, not $10.
  return { min: table.min, max: table.max }
}

// ------------------------------------------------------------------- check

const no = (reason) => ({ ok: false, reason })
const yes = (extra = {}) => ({ ok: true, ...extra })

/*
 * May this bet be made, at this amount, right now?
 *
 * ctx carries the table state the answer depends on: the phase, the point, and
 * the bets already up - odds need to know what they are behind, and the don't
 * side needs to know it is too late.
 */
export function check(id, amount, ctx = {}) {
  const {
    table = DEFAULT_TABLE,
    phase = 'come-out',
    point = null,
    bets = {},
    marked = new Set(),
    bankroll = Infinity,
  } = ctx
  const d = BETS[id]
  if (!d) return no(`There is no ${id} on this layout.`)
  if (!isMoney(amount)) return no('Bets are in whole dollars.')

  // --- when the spot is open at all

  if ((id === 'pass' || id === 'dontpass') && phase !== 'come-out') {
    // A flat line bet after the point is a put bet. It is legal at some
    // houses and it is always bad - you are paying the come-out advantage
    // away and getting nothing for it. This table does what most do and
    // points you at the come instead.
    return no(`The point is ${point}. Put your money in the ${id === 'pass' ? 'Come' : "Don't Come"} box.`)
  }

  if ((id === 'come' || id === 'dontcome') && phase !== 'point') {
    return no('The come box opens once the point is out. This roll, the line is the bet.')
  }

  if (d.group === 'bonus' && !(phase === 'come-out' && marked.size === 0)) {
    // The tracker has to be empty. Otherwise you could stand back until half
    // the numbers were marked and then buy into somebody else's roll for the
    // same price as the player who was on it from the first throw.
    return no(
      marked.size
        ? 'Little, Big and Boom go up on a clean board. This shooter is already under way.'
        : 'Little, Big and Boom go up before the come-out.',
    )
  }

  if (d.group === 'odds') {
    const flatId = d.behind
    const flat = bets[flatId]
    if (!flat) return no(`Nothing to back. There is no bet on ${betDef(flatId).label}.`)
    if (flatId === 'pass' || flatId === 'dontpass') {
      if (!point) return no('Odds go behind a point. There is no point yet.')
    }
    const cap = maxOdds(id, flat.amount, { point, table })
    const already = bets[id]?.amount ?? 0
    if (already + amount > cap) {
      return no(
        cap === already
          ? `You are already at the maximum odds on that bet - ${money(cap)}.`
          : `The most you can take behind ${money(flat.amount)} is ${money(cap)}.`,
      )
    }
  }

  // --- size

  const { min, max } = rangeFor(id, { table })
  const standing = bets[id]?.amount ?? 0
  const total = standing + amount

  if (total < min) return no(`${money(min)} minimum on that bet.`)
  if (total > max) return no(`${money(max)} maximum on that bet.`)

  const unit = unitFor(id, { point })
  if (total % unit !== 0) {
    const down = Math.floor(total / unit) * unit
    const up = down + unit
    return no(
      `${betDef(id).label} pays in ${money(unit)} steps, so it cannot be paid on ${money(total)}. ` +
        `Make it ${money(down >= min ? down : up)} or ${money(up)}.`,
    )
  }

  const vig = vigFor(id, total, { table }) - vigFor(id, standing, { table })
  if (amount + vig > bankroll) {
    return no(vig ? `Not enough on the rail - that is ${money(amount)} plus ${money(vig)} vig.` : 'Not enough on the rail.')
  }

  return yes({ vig })
}

/*
 * The nearest amount this spot will actually take, at or above what was asked.
 *
 * Dropping a red chip on the six is not a $5 bet, because the six cannot pay
 * 7:6 on five dollars. What happens at a table is that the dealer says "make
 * it twelve" and you put another chip down, and this is that: the amount the
 * click turns into, plus a flag so the interface can say why it changed rather
 * than quietly taking more money than was asked for.
 */
export function toLegal(id, want, ctx = {}) {
  const { table = DEFAULT_TABLE, point = null, bets = {} } = ctx
  const unit = unitFor(id, { point })
  const { min } = rangeFor(id, { table })
  const standing = bets[id]?.amount ?? 0
  const total = Math.ceil(Math.max(standing + want, min) / unit) * unit
  return { add: total - standing, total, bumped: total !== standing + want }
}

// The house style for money, used in every refusal above and by the interface.
export const money = (n) =>
  n % 1 === 0 ? `$${n.toLocaleString('en-US')}` : `$${n.toFixed(2)}`

/*
 * The largest legal bet at a spot, for a "max" button and for greying out.
 * Walks down from the table maximum in units rather than solving for it,
 * because the constraints interact - odds cap, increment, bankroll - and one
 * loop that asks check() is always right where an inverted formula is only
 * right until the next rule.
 */
export function maxBet(id, ctx = {}) {
  const { table = DEFAULT_TABLE } = ctx
  const unit = unitFor(id, ctx)
  const { max } = rangeFor(id, { table })
  const ceiling = Math.min(max, ctx.bankroll ?? Infinity)
  for (let amount = Math.floor(ceiling / unit) * unit; amount >= unit; amount -= unit) {
    if (check(id, amount, ctx).ok) return amount
  }
  return 0
}

// Sanity: every point has a payout, a true odds and a lay odds. A number that
// slipped out of one of the three tables would otherwise fail as a NaN payout
// somewhere far away from the cause.
for (const n of POINTS) {
  if (!PLACE_PAYS[n] || !TRUE_ODDS[n] || !LAY_ODDS[n]) {
    throw new Error(`payout tables are missing the ${n}`)
  }
}
