/*
 * The table as a reducer.
 *
 * Every way a player can change the felt is an action here, and every one of
 * them goes through limits.check() first - so there is no path by which an
 * illegal bet gets on the layout, whether it came from a click, a keystroke,
 * a restored save or the simulator.
 *
 * Actions never throw. A refused bet comes back as a `refused` message on the
 * state, because "the six wants thirty, not twenty five" is something the
 * player should read, not something that should blow up a render.
 */

import { POINTS, betDef, isWorking, quote } from './bets.js'
import { check, maxBet, money, unitFor, vigFor } from './limits.js'
import { newTable, resolveRoll } from './rules.js'

export { newTable }

/*
 * Nothing on the felt moves while the dice are out.
 *
 * The roll is drawn before the dice leave the hand, and from that moment it is
 * on the table as `pending` - saved with everything else, so closing the tab
 * cannot take it back. Until it has been paid, every way of changing a bet is
 * refused: at a real table the dealers have their hands off the layout from the
 * moment the stick sends the dice, and a bet that could be pulled after the
 * number is called is a bet that never loses.
 */
const WHILE_THE_DICE_ARE_OUT = new Set(['roll', 'settle', 'clear'])

export function reducer(state, action) {
  if (state.pending && !WHILE_THE_DICE_ARE_OUT.has(action.type)) {
    return refuse(state, DICE_ARE_OUT)
  }
  switch (action.type) {
    case 'throw':
      // The result, drawn and committed. It is settled by the 'roll' that
      // follows once the dice have been seen to land.
      return { ...state, pending: action.roll, refused: null }
    case 'bet':
      return placeBet(state, action.id, action.amount, { keepBase: action.press })
    case 'takedown':
      return takeDown(state, action.id)
    case 'sweep':
      return sweep(state)
    case 'working':
      return setWorking(state, action.id, action.on)
    case 'odds':
      return backEverything(state).state
    case 'many':
      return placeMany(state, action.list).state
    case 'regress':
      return regress(state, action.id)
    case 'configure':
      // Changing the table's rules mid-hand is not something a house does, but
      // this is one player's table and the bets already down keep the terms
      // they were made on - only what happens next is affected.
      return { ...state, table: { ...state.table, ...action.table }, refused: null }
    case 'buyin':
      return { ...newTable({ table: state.table }), bankroll: action.amount }
    case 'roll':
      // If a throw is pending, that is the roll - whatever the caller says.
      return applyRoll(state, state.pending ?? action.roll)
    case 'settle':
      // Pay the roll that was thrown, and only that one. Once it has been
      // paid there is nothing pending, so asking again - a double-run effect,
      // a timer that fires late - is a no-op rather than the same roll twice.
      return state.pending ? applyRoll(state, state.pending) : state
    case 'clear':
      return clearRefusal(state)
    default:
      return state
  }
}

const ctxFor = (state) => ({
  table: state.table,
  phase: state.phase,
  point: state.point,
  bets: state.bets,
  marked: state.marked,
  bankroll: state.bankroll,
  pending: state.pending,
})

export const DICE_ARE_OUT = 'The dice are out. Hands off the layout until this roll is paid.'

const refuse = (state, reason) => ({ ...state, refused: { reason, at: state.shooter.rolls } })
const clearRefusal = (state) => (state.refused ? { ...state, refused: null } : state)

// ------------------------------------------------------------------- betting

/*
 * `keepBase` is what separates pressing from betting.
 *
 * Every bet remembers what it was last deliberately set to. Clicking a spot
 * sets that; pressing a winner does not, because the winnings going up are the
 * table's money doing the work rather than a decision about how much you want
 * out there. It is what lets "back to thirty" mean something three presses
 * later.
 */
export function placeBet(state, id, amount, { keepBase = false } = {}) {
  const verdict = check(id, amount, ctxFor(state))
  if (!verdict.ok) return refuse(state, verdict.reason)

  const standing = state.bets[id]
  const total = (standing?.amount ?? 0) + amount
  const bets = {
    ...state.bets,
    [id]: {
      ...standing,
      amount: total,
      base: keepBase ? (standing?.base ?? standing?.amount ?? amount) : total,
      // The commission is charged when the bet goes up, which is how most
      // houses do it - the alternative, charging on a win, is a better deal
      // for the player and rarer than the internet suggests.
      vig: (standing?.vig ?? 0) + verdict.vig,
      // The bonus row remembers the pay table it was bet at, so the price
      // cannot change under a bet that is already riding.
      ...(betDef(id).group === 'bonus' ? { paytable: state.table?.bonus ?? '30' } : {}),
    },
  }

  return {
    ...state,
    bets,
    bankroll: state.bankroll - amount - verdict.vig,
    refused: null,
  }
}

/*
 * Take a bet down.
 *
 * Everything on the box comes down whenever you like - that is the whole
 * advantage the box has over the line, and it is worth something. The line
 * and the come do not, once they have a number: you contracted for a decision
 * and the house has already given you the come-out edge in exchange.
 *
 * The one asymmetry: a don't bet may legally come down, because once the point
 * is out the don't side is the favourite and the house would be delighted. It
 * is allowed here for the same reason it is allowed at a table - it is the
 * player's money - and the interface says what it costs.
 */
export function canTakeDown(state, id) {
  const d = betDef(id)

  /*
   * The bonus row is a contract from its first throw.
   *
   * Before the dice have moved it is only chips on the felt. After that it is
   * a bet on the rest of this shooter's hand, and letting it come down would
   * let a player keep the runs that are going well and walk away from the ones
   * that are not - which takes Boom or Bust from 20.6% to under 12%. Every
   * throw that is not a seven marks a number, so an empty tracker is exactly
   * "nothing has been thrown since it went up".
   */
  if (d.group === 'bonus') return state.marked.size === 0

  // A line bet is only a contract once it has a number to be decided against.
  // Before the come-out throw it is just chips on the felt and may be picked
  // up - the house will not stop you, though giving up the come-out advantage
  // for nothing is the worst trade on the table.
  const loose = (id === 'pass' || id === 'dontpass') && state.phase === 'come-out'

  return !(d.contract && !id.startsWith('dont') && !loose)
}

export function takeDown(state, id) {
  const bet = state.bets[id]
  if (!bet) return state
  const d = betDef(id)

  if (!canTakeDown(state, id)) {
    return refuse(state, `${d.label} is a contract bet. It stays until it is decided.`)
  }

  const bets = { ...state.bets }
  delete bets[id]

  // Odds behind a bet that is coming down have nowhere to be, so they come
  // down with it rather than being left backing nothing.
  let returned = bet.amount
  for (const [otherId, other] of Object.entries(bets)) {
    if (betDef(otherId).behind === id) {
      returned += other.amount
      delete bets[otherId]
    }
  }

  /*
   * The commission comes back with the bet.
   *
   * It is paid for one decision at a time - up front when the bet goes up,
   * and out of each win that leaves it standing - so a bet coming down has
   * always prepaid one decision that never happened. Keeping it would charge a
   * player for a roll they were not in, and make the bet cost more than the
   * 4.76% the table quotes for it.
   */
  returned += bet.vig ?? 0

  return { ...state, bets, bankroll: state.bankroll + returned, refused: null }
}

/*
 * "Take it all down."
 *
 * A tidy-up, and it is treated as one. Contract bets are stepped over rather
 * than refused - the player asked for everything that can come down, and being
 * told the pass line is staying is not news.
 *
 * The bonus row is stepped over too. Once the shooter is under way it is a
 * contract and cannot come down at all; before the first throw it can, but
 * only by the × on the bet itself, because that is a decision about that bet
 * and a tidy-up is not.
 */
export function sweep(state) {
  let next = state
  for (const id of Object.keys(state.bets)) {
    if (betDef(id).group === 'bonus') continue
    if (!canTakeDown(next, id)) continue
    next = takeDown(next, id)
  }
  return next === state ? clearRefusal(state) : { ...next, refused: null }
}

// What the sweep would actually pick up, so the interface can grey the button
// out rather than offering a click that does nothing.
export const sweepable = (state) =>
  Object.keys(state.bets).filter((id) => betDef(id).group !== 'bonus' && canTakeDown(state, id))

/*
 * "Odds on everything."
 *
 * One of the few things a player says out loud rather than reaching out and
 * doing, and the only sane way to back four come bets and a line bet without
 * sixteen separate clicks. Each is taken to the table maximum in turn, and the
 * rail is checked between them - so a player who cannot afford to back all of
 * them backs as many as the money reaches, starting with the line, which is
 * the order a dealer would work in anyway.
 */
export function backEverything(state) {
  const ids = [
    'pass-odds',
    'dontpass-odds',
    ...POINTS.flatMap((n) => [`come-odds-${n}`, `dontcome-odds-${n}`]),
  ]
  let next = state
  let backed = 0
  for (const id of ids) {
    const most = maxBet(id, ctxFor(next))
    if (most <= 0) continue
    const after = placeBet(next, id, most)
    if (after.refused) continue
    backed += most
    next = after
  }
  return { state: { ...next, refused: null }, backed }
}

/*
 * A whole spread at once.
 *
 * The opening bet, put back. Each is checked on its own and anything the table
 * will not take right now is simply skipped rather than stopping the rest -
 * you cannot bet the come on a come-out, and a player asking for their usual
 * spread does not want to be told so, they want the bets that are available.
 *
 * A spot that already has money on it is left alone, so repeating an opening
 * twice does not quietly double it.
 */
export function placeMany(state, list) {
  let next = state
  let placed = 0
  for (const { id, amount } of list) {
    if (next.bets[id]) continue
    const after = placeBet(next, id, amount)
    if (after.refused) continue
    next = after
    placed += amount
  }
  return { state: { ...next, refused: null }, placed }
}

/*
 * How much of a win can go back on the bet.
 *
 * "Press it" means put the winnings up, and what actually goes up is as much
 * of them as the spot can be paid on. The six pays $35 on a $30 bet; press it
 * and you are at $60 with $5 coming back, because $65 is not a number the six
 * can pay 7:6 on. That is the sentence a dealer says while doing it.
 */
export function pressAmount(state, id, win) {
  const unit = unitFor(id, { point: state.point })
  return Math.floor(win / unit) * unit
}

// What a bet started at, before anything was pressed on top of it.
export const baseOf = (bet) => bet?.base ?? bet?.amount ?? 0

/*
 * Back down to what it started at.
 *
 * Press, press, press, then regress. Three winners on the six and it is out
 * there at a hundred and eight; one word to the dealer and it is thirty again
 * with the rest in your rack. The bet never comes off the felt - it is reduced,
 * which is why it keeps its place and its working state.
 */
export function regress(state, id) {
  const bet = state.bets[id]
  if (!bet) return state
  const base = baseOf(bet)
  if (bet.amount <= base) {
    return refuse(state, `${betDef(id).label} is already at ${money(base)}.`)
  }
  // A smaller buy or lay owes a smaller commission on its next decision, and
  // the difference comes back with the chips.
  const vig = betDef(id).vig ? Math.min(bet.vig ?? 0, vigFor(id, base, { table: state.table })) : bet.vig
  const refund = (bet.vig ?? 0) - (vig ?? 0)
  return {
    ...state,
    bets: { ...state.bets, [id]: { ...bet, amount: base, ...(vig !== undefined ? { vig } : {}) } },
    bankroll: state.bankroll + (bet.amount - base) + refund,
    refused: null,
  }
}

// Turn a bet on or off for the come-out. Only the ones a dealer would put a
// button on: the box, the hardways and come odds.
export function setWorking(state, id, on) {
  const bet = state.bets[id]
  if (!bet) return state
  const d = betDef(id)
  if (!d.togglable) return refuse(state, `${d.label} is always working.`)
  return { ...state, bets: { ...state.bets, [id]: { ...bet, working: on } }, refused: null }
}

// ------------------------------------------------------------------- rolling

function applyRoll(state, roll) {
  const { state: next, events } = resolveRoll(state, roll)
  return {
    ...next,
    refused: null,
    pending: null,
    lastRoll: roll,
    lastEvents: events,
    history: [...(state.history ?? []), roll].slice(-200),
  }
}

// ------------------------------------------------------------------ readouts

/*
 * What a standing bet pays, and on what throw.
 *
 * Comes straight from quote(), which derives it by settling all thirty six
 * throws against the bet - so a tooltip can never claim a payout the felt does
 * not actually make. Returns the list because several spots pay more than one
 * rate: the field pays double on its ends, the horn pays two prices, and a
 * player deserves to see both.
 */
export function wouldPay(state, id) {
  const bet = state.bets[id]
  if (!bet) return []
  return quote(id, bet.amount, { point: state.point, marked: state.marked, bonus: bet.paytable ?? state.table?.bonus })
}

export const isBetWorking = (state, id) =>
  state.bets[id] ? isWorking(id, state.bets[id], state.phase) : false

// Total the player would have if everything came down and nothing else
// happened - the rail plus what is on the felt, less nothing, because a bet
// on the felt is still the player's money until it loses.
export const railTotal = (state) =>
  state.bankroll + Object.values(state.bets).reduce((s, b) => s + b.amount, 0)

export { vigFor }
