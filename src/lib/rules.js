/*
 * What happens when the dice stop.
 *
 * resolveRoll() is pure: it takes the table as it stands and a roll, and hands
 * back the table as it now stands plus an ordered list of everything that
 * happened. It touches no clock, no storage and no React, which is what lets
 * the simulator run a hundred thousand hands through it in a second and the
 * tests replay a session exactly.
 *
 * The order of the events is the order the crew works in, and it is not
 * cosmetic. A come bet moving onto the six has to happen after the six has
 * paid, or a bet that was in the come box when the number hit would get paid
 * for a number it was not yet on. The interface animates straight down this
 * list, so what you watch is what actually happened, in the order it happened.
 */

import { BETS, POINTS, betDef, isWorking, settle } from './bets.js'
import { DEFAULT_TABLE, vigFor } from './limits.js'

// The crew's order of work. Everything in a group settles before the next
// group is looked at.
const ORDER = ['centre', 'hop', 'field', 'hardway', 'bonus', 'box', 'line', 'odds']

const groupOf = (id) => betDef(id).group

export function newTable(overrides = {}) {
  return {
    phase: 'come-out',
    point: null,
    bets: {},
    // Numbers this shooter has thrown since the tracker last cleared. Drives
    // the bonus row, and the markers on the felt read straight off it.
    marked: new Set(),
    shooter: { rolls: 0, points: 0, longest: 0 },
    bankroll: 1000,
    table: { ...DEFAULT_TABLE },
    ...overrides,
  }
}

/*
 * One roll, start to finish.
 *
 * Returns { state, events, roll }. `state` is new - nothing is mutated in
 * place, so an undo is a matter of keeping the old one.
 */
export function resolveRoll(prev, roll) {
  const state = {
    ...prev,
    bets: { ...prev.bets },
    marked: new Set(prev.marked),
    shooter: { ...prev.shooter },
  }
  const events = []
  const ctx = {
    point: state.point,
    marked: state.marked,
    phase: state.phase,
    // The bonus row's rate is the table's, not the catalogue's.
    bonus: state.table?.bonus ?? '30',
  }

  const wasComeOut = state.phase === 'come-out'
  const comingOutPoint = state.point

  // The tracker is updated before anything settles, because Boom or Bust wins
  // on the roll that completes it - the number has to be marked by the time
  // the bet is asked whether it is finished.
  if (roll.total !== 7) {
    if (!state.marked.has(roll.total)) {
      state.marked.add(roll.total)
      events.push({ kind: 'mark', number: roll.total })
    }
  }

  // ---------------------------------------------------------------- settle

  // Snapshot the ids up front: come bets move during this pass and we do not
  // want to settle a bet that only exists because of this same roll.
  const standing = Object.keys(state.bets)
  const settled = new Set()

  for (const group of ORDER) {
    for (const id of standing) {
      if (groupOf(id) !== group) continue
      const bet = state.bets[id]
      if (!bet) continue

      if (!isWorking(id, bet, state.phase)) {
        events.push({ kind: 'off', id, amount: bet.amount })
        continue
      }

      // A bonus bet is paid at the rate it was made at. Changing the table's
      // pay table mid-shooter changes what the next bet gets, not this one.
      const result = settle(id, bet.amount, roll, bet.paytable ? { ...ctx, bonus: bet.paytable } : ctx)
      if (!result) continue // rides

      settled.add(id)
      applyResult(state, events, id, bet, result)
    }
  }

  // Odds are dead the moment the bet they are behind comes down. If they were
  // working they have just settled on their own; if they were off - come odds
  // on a come-out, most often - they were never at risk, and they come back
  // rather than going into the rack. This is the rule that makes a seven on
  // the come-out survivable.
  for (const id of standing) {
    const d = BETS[id]
    if (!d || d.group !== 'odds' || settled.has(id)) continue
    if (state.bets[id] && !state.bets[d.behind] && !settled.has(id)) {
      const bet = state.bets[id]
      state.bankroll += bet.amount
      delete state.bets[id]
      events.push({ kind: 'return', id, amount: bet.amount, reason: 'off when the bet came down' })
    }
  }

  // ------------------------------------------------------------ the phase

  if (wasComeOut) {
    if (roll.total === 7 || roll.total === 11) {
      events.push({ kind: 'natural', total: roll.total })
    } else if (roll.total === 2 || roll.total === 3 || roll.total === 12) {
      events.push({ kind: 'craps', total: roll.total })
    } else {
      state.phase = 'point'
      state.point = roll.total
      events.push({ kind: 'point', number: roll.total })
    }
  } else if (roll.total === comingOutPoint) {
    state.phase = 'come-out'
    state.point = null
    state.shooter.points += 1
    events.push({ kind: 'made', number: comingOutPoint })
  } else if (roll.total === 7) {
    state.phase = 'come-out'
    state.point = null
    events.push({ kind: 'sevenout' })
  }

  // A seven wipes the tracker whatever else it did - including a come-out
  // seven, which costs nobody their line bet but does end the run at the
  // bonus row.
  if (roll.total === 7 && state.marked.size) {
    state.marked = new Set()
    events.push({ kind: 'unmark' })
  }

  // ----------------------------------------------------- come bets travel

  // Last, so that a number which just paid its come bet is free to receive the
  // next one.
  for (const box of ['come', 'dontcome']) {
    const bet = state.bets[box]
    if (!bet || settled.has(box)) continue
    if (!POINTS.includes(roll.total)) continue
    const to = `${box}-${roll.total}`
    const existing = state.bets[to]
    state.bets[to] = { amount: (existing?.amount ?? 0) + bet.amount }
    delete state.bets[box]
    events.push({ kind: 'move', from: box, to, number: roll.total, amount: bet.amount })
  }

  // ------------------------------------------------------------- shooter

  state.shooter.rolls += 1
  if (roll.total === 7 && !wasComeOut) {
    // Seven out. The dice go to the next player and the count starts again.
    // The hand that just ended is worth keeping: "how long was that roll" is
    // the only number anybody at a craps table remembers.
    const longest = Math.max(state.shooter.longest, state.shooter.rolls)
    events.push({ kind: 'handover', rolls: state.shooter.rolls, points: state.shooter.points })
    state.shooter = { rolls: 0, points: 0, longest }
  }

  return { state, events, roll }
}

function applyResult(state, events, id, bet, result) {
  const { outcome, pay, down } = result

  if (outcome === 'lose') {
    delete state.bets[id]
    events.push({ kind: 'take', id, amount: bet.amount })
    return
  }

  if (outcome === 'push') {
    state.bankroll += bet.amount
    delete state.bets[id]
    events.push({ kind: 'push', id, amount: bet.amount })
    return
  }

  /*
   * A commission buys one decision, not a bet for life.
   *
   * The vig on a buy or a lay was paid when it went up, and it paid for this
   * decision. A win that stays up is a new decision, and the dealer takes the
   * next commission out of the payout before pushing it across - "pay the
   * buy, take the vig". Without this a $100 buy on the four would pay $5 once
   * and then win at true odds for free for as long as the four kept coming,
   * which takes the edge from 4.76% down to 3.23%.
   */
  const commission = !down && betDef(id).vig ? vigFor(id, bet.amount, { table: state.table }) : 0
  const net = pay - commission
  if (commission) state.bets[id] = { ...bet, vig: commission }

  // Won. `down` decides whether the stake comes back with the winnings or
  // stays out for the next roll: a pass line bet is finished, a place bet is
  // not.
  state.bankroll += net
  if (down) {
    state.bankroll += bet.amount
    delete state.bets[id]
  }
  events.push({ kind: 'pay', id, amount: bet.amount, pay: net, down, ...(commission ? { vig: commission } : {}) })
}

// --------------------------------------------------------------- the ledger

/*
 * What a bet is worth right now, if the shooter sevened out this instant.
 * Used for the rail total and for the simulator's bankroll curve - a session
 * is not over until the bets are, and counting only the rack understates a
 * player who is $300 out on the box.
 */
export function atRisk(state) {
  return Object.values(state.bets).reduce((sum, bet) => sum + bet.amount, 0)
}

// Everything on the felt, grouped the way the layout groups it, for the
// interface and for anything that wants to describe a position in words.
export function positions(state) {
  const out = {}
  for (const [id, bet] of Object.entries(state.bets)) {
    const d = betDef(id)
    ;(out[d.group] ??= []).push({ id, ...bet, def: d, working: isWorking(id, bet, state.phase) })
  }
  return out
}
