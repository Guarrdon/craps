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

import { betDef, isWorking, quote } from './bets.js'
import { check, vigFor } from './limits.js'
import { newTable, resolveRoll } from './rules.js'

export { newTable }

export function reducer(state, action) {
  switch (action.type) {
    case 'bet':
      return placeBet(state, action.id, action.amount)
    case 'takedown':
      return takeDown(state, action.id)
    case 'working':
      return setWorking(state, action.id, action.on)
    case 'roll':
      return applyRoll(state, action.roll)
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
})

const refuse = (state, reason) => ({ ...state, refused: { reason, at: state.shooter.rolls } })
const clearRefusal = (state) => (state.refused ? { ...state, refused: null } : state)

// ------------------------------------------------------------------- betting

export function placeBet(state, id, amount) {
  const verdict = check(id, amount, ctxFor(state))
  if (!verdict.ok) return refuse(state, verdict.reason)

  const standing = state.bets[id]
  const bets = {
    ...state.bets,
    [id]: {
      ...standing,
      amount: (standing?.amount ?? 0) + amount,
      // The commission is charged when the bet goes up, which is how most
      // houses do it - the alternative, charging on a win, is a better deal
      // for the player and rarer than the internet suggests.
      vig: (standing?.vig ?? 0) + verdict.vig,
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
export function takeDown(state, id) {
  const bet = state.bets[id]
  if (!bet) return state
  const d = betDef(id)

  if (d.contract && !id.startsWith('dont')) {
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

  // The vig on a buy or lay is not refunded. It bought the better price and
  // the price was given.
  return { ...state, bets, bankroll: state.bankroll + returned, refused: null }
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
  return quote(id, bet.amount, { point: state.point, marked: state.marked })
}

export const isBetWorking = (state, id) =>
  state.bets[id] ? isWorking(id, state.bets[id], state.phase) : false

// Total the player would have if everything came down and nothing else
// happened - the rail plus what is on the felt, less nothing, because a bet
// on the felt is still the player's money until it loses.
export const railTotal = (state) =>
  state.bankroll + Object.values(state.bets).reduce((s, b) => s + b.amount, 0)

export { vigFor }
