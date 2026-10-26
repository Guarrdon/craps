/*
 * Everything the game remembers, which is everything and nowhere else.
 *
 * localStorage only. There is no server, no account and no request of any
 * kind: the game plays exactly the same with the network off, and clearing
 * your browser data is the whole of deleting it.
 *
 * Every read merges what it finds over a fresh default, so a save written by
 * an older build - or one with a key that has since been dropped - loads
 * rather than throwing. A saved game that will not open is worse than one that
 * opens slightly wrong.
 */

import { DEFAULT_TABLE } from './limits.js'
import { OPENING_RAIL } from './bank.js'
import { newTable } from './rules.js'

const SAVE = 'craps.save.v1'
const STATS = 'craps.stats.v1'
const PREFS = 'craps.prefs.v1'

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private browsing, or the quota is full. The game still plays; it just
       will not remember, which is a better outcome than refusing to deal. */
  }
}

const drop = (key) => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to be done, and nothing that needs doing */
  }
}

// -------------------------------------------------------------- the table

// A Set does not survive JSON, and neither should the transient fields - what
// was refused, what the last roll paid. Those belong to a moment, not a save.
export const packTable = (state) => ({
  phase: state.phase,
  point: state.point,
  bets: state.bets,
  marked: [...state.marked],
  shooter: state.shooter,
  bankroll: state.bankroll,
  table: state.table,
  history: (state.history ?? []).slice(-40),
  // A roll that has been drawn and not yet paid. Saved the moment it is drawn,
  // so that closing the tab while the dice are in the air settles the roll on
  // the way back in rather than throwing it away.
  pending: state.pending ?? null,
})

export const unpackTable = (raw) => ({
  ...newTable(),
  ...raw,
  marked: new Set(raw?.marked ?? []),
  table: { ...DEFAULT_TABLE, ...(raw?.table ?? {}) },
  refused: null,
  lastEvents: null,
})

export const loadGame = () => {
  const raw = read(SAVE, null)
  return raw ? unpackTable(raw) : null
}

export const saveGame = (state) => write(SAVE, packTable(state))
export const clearGame = () => drop(SAVE)

// ------------------------------------------------------------------- stats

export function emptyStats() {
  return {
    rolls: 0,
    shooters: 0,
    longestHand: 0,
    pointsMade: 0,
    sevenOuts: 0,
    naturals: 0,
    craps: 0,
    won: 0, // total paid out, in profit
    lost: 0, // total taken
    wagered: 0,
    bestRoll: 0, // the most a single throw ever paid
    worstRoll: 0,
    peak: OPENING_RAIL,
    // What has actually been thrown. Not used for anything - the dice do not
    // care what came before - but it is the first thing anybody asks of a
    // craps game, and it is the honest answer to "are these dice fair".
    totals: Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, 0])),
    hardways: 0,
    started: null,
  }
}

export function loadStats() {
  const stored = read(STATS, null)
  if (!stored) return emptyStats()
  const base = emptyStats()
  return { ...base, ...stored, totals: { ...base.totals, ...(stored.totals ?? {}) } }
}

export const saveStats = (stats) => write(STATS, stats)
export const resetStats = () => {
  drop(STATS)
  return emptyStats()
}

/*
 * Fold one roll into the statistics.
 *
 * Pure, so it can be tested without a browser and so the caller decides when
 * anything is written. `events` is the list rules.js produced, which is
 * already everything that happened in the order it happened.
 */
export function recordRoll(stats, roll, events, railAfter) {
  const next = { ...stats, totals: { ...stats.totals } }
  next.rolls += 1
  next.totals[roll.total] += 1
  if (roll.a === roll.b) next.hardways += 1
  next.started ??= Date.now()

  let paid = 0
  let taken = 0
  for (const e of events) {
    if (e.kind === 'pay') paid += e.pay
    else if (e.kind === 'take') taken += e.amount
    else if (e.kind === 'made') next.pointsMade += 1
    else if (e.kind === 'natural') next.naturals += 1
    else if (e.kind === 'craps') next.craps += 1
    else if (e.kind === 'handover') {
      next.sevenOuts += 1
      next.shooters += 1
      next.longestHand = Math.max(next.longestHand, e.rolls)
    }
  }
  next.won += paid
  next.lost += taken
  next.bestRoll = Math.max(next.bestRoll, paid - taken)
  next.worstRoll = Math.min(next.worstRoll, paid - taken)
  next.peak = Math.max(next.peak, railAfter)
  return next
}

export const recordWager = (stats, amount) => ({ ...stats, wagered: stats.wagered + amount })

// ------------------------------------------------------------------ prefs

export const defaultPrefs = () => ({
  denom: 5,
  boxMode: 'place',
  // The chips stay on the line when it wins and ride the next come-out, which
  // is what happens at a table - the payout is set down beside them and you
  // pick up the payout.
  lineRides: true,
  // A standing opening: the bets that go out every come-out, and whether to
  // put them out without being asked.
  opening: null,
  autoOpen: false,
  // Sound is on. It is three short synthesised cues, not a soundtrack.
  muted: false,
})

export const loadPrefs = () => ({ ...defaultPrefs(), ...read(PREFS, {}) })
export const savePrefs = (prefs) => write(PREFS, prefs)

// ------------------------------------------------------------------ format

export const duration = (ms) => {
  if (!ms) return '—'
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}
