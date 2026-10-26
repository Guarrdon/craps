/*
 * What the stickman says.
 *
 * Every number on a craps table has a name, and the calls are not decoration -
 * they are how a table communicates what just happened to eight people who are
 * all looking at a different part of the felt. "Eight, the hard way" tells the
 * hardway bettors they have been paid and the easy-way bettors they have not,
 * in three words, before anybody has looked at the dice.
 *
 * Pure: a roll and the events it produced go in, a line of English comes out.
 */

import { betDef } from './bets.js'
import { money } from './bank.js'

const WORD = { 4: 'Four', 5: 'Five', 6: 'Six', 8: 'Eight', 9: 'Nine', 10: 'Ten' }

// The names a stick calls, which are not always the number. Some of these are
// regional and all of them are old; these are the ones you hear in Nevada.
function nameOf({ a, b, total }) {
  const hard = a === b
  switch (total) {
    case 2: return 'Snake eyes'
    case 3: return 'Ace deuce'
    case 11: return 'Yo eleven'
    case 12: return 'Boxcars'
    case 7: return 'Seven'
    case 4: return hard ? 'Hard four' : 'Little Joe'
    case 6: return hard ? 'Hard six' : 'Six, easy six'
    case 8: return hard ? 'Hard eight' : 'Eight, easy eight'
    case 10: return hard ? 'Hard ten' : 'Ten, easy ten'
    case 5: return 'Five, no field five'
    case 9: return 'Nine, centre field'
    default: return String(total)
  }
}

/*
 * The call for a roll.
 *
 * The phase events come first because they are what the table is waiting to
 * hear - whether the hand is over - and the name of the number second.
 */
export function callFor(roll, events) {
  const kinds = new Set(events.map((e) => e.kind))
  const name = nameOf(roll)

  if (kinds.has('sevenout')) return 'Seven out. Line away.'
  if (kinds.has('made')) {
    const n = events.find((e) => e.kind === 'made').number
    return `${WORD[n]}! ${WORD[n]} the winner. Pay the line.`
  }
  if (kinds.has('point')) {
    const n = events.find((e) => e.kind === 'point').number
    return `${WORD[n]}! ${WORD[n]} the point.`
  }
  if (kinds.has('natural')) {
    return roll.total === 7 ? 'Seven! Winner on the pass line.' : `${name}! Winner.`
  }
  if (kinds.has('craps')) return `${name}. Craps.`
  return `${name}.`
}

/*
 * What the roll did to your money, in the order the crew did it.
 *
 * Only the bets that moved, and only the ones worth mentioning - a place bet
 * that is simply still standing is not news. The returns are called out
 * separately from the wins because getting odds back off a come-out seven
 * feels like a win and is not one, and the difference is worth naming.
 */
export function ledgerFor(events) {
  const won = events.filter((e) => e.kind === 'pay')
  const lost = events.filter((e) => e.kind === 'take')
  const back = events.filter((e) => e.kind === 'push' || e.kind === 'return')

  const lines = []
  for (const e of won) {
    // A buy or lay that stays up pays its next commission out of the win, and
    // the line says so rather than paying a number that looks short.
    const vig = e.vig ? `, less ${money(e.vig)} vig` : ''
    lines.push({ tone: 'win', text: `${betDef(e.id).label} pays ${money(e.pay)}${vig}` })
  }
  for (const e of back) {
    lines.push({
      tone: 'back',
      text: `${betDef(e.id).label} comes back — ${money(e.amount)}${e.kind === 'push' ? ', barred' : ', it was off'}`,
    })
  }
  for (const e of lost) lines.push({ tone: 'lose', text: `${betDef(e.id).label} down ${money(e.amount)}` })

  const net =
    won.reduce((s, e) => s + e.pay, 0) - lost.reduce((s, e) => s + e.amount, 0)
  return { lines, net }
}

// A one-line summary for the readout, when there is no room for the ledger.
export function summaryFor(events) {
  const { net } = ledgerFor(events)
  if (!net) return null
  return net > 0 ? `Up ${money(net)} on the roll.` : `Down ${money(-net)} on the roll.`
}
