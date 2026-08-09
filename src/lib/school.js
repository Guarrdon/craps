/*
 * One bet, explained.
 *
 * What training mode says when you point at a spot: what the bet is, how often
 * it actually comes in, what it pays against what it is worth, when you may
 * make it and when it is at risk, what you say to put it up, and what you will
 * hear when it hits.
 *
 * The numbers are derived, not written down a second time. The chance comes
 * from settling all thirty six throws against the bet itself, the payout from
 * the same tables the felt pays out of, and the cost from edges.js. Only the
 * English is hand-written - and the English is the part that is hard to find
 * anywhere else, because it is what nobody at the table will stop to tell you.
 */

import { ALL_ROLLS, HARDWAY_PAYS, LAY_ODDS, PLACE_PAYS, TRUE_ODDS, betDef, quote, settle } from './bets.js'
import { BONUS_CHANCE, BONUS_PAYTABLES, EDGES, asPercent, bonusEdge } from './edges.js'
import { DEFAULT_TABLE, rangeFor, unitFor } from './limits.js'
import { money } from './bank.js'

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
const asRatio = (a, b) => {
  const g = gcd(a, b) || 1
  return `${a / g}:${b / g}`
}

/*
 * How often a bet wins, of the times it decides anything.
 *
 * For nearly everything on the felt this falls straight out of the catalogue:
 * settle all thirty six throws, count the ones that win and the ones that
 * lose, and ignore the ones where the bet just rides. A place six wins five
 * ways and loses six; a hard eight wins one way and loses ten. That is the
 * whole of it, and it is right because it is the same code that pays the bet.
 *
 * The line is the exception. Pass and Come span a come-out and then a point,
 * so no single throw decides them and the answer is the classic 244 in 495.
 */
const LINE_ODDS = {
  pass: [244, 495],
  come: [244, 495],
  // The barred twelve is a push, so it is left out of the count entirely -
  // which is why the don't side is a hair better than the do side and still
  // costs less.
  dontpass: [949, 1925],
  dontcome: [949, 1925],
}

export function waysOf(id, { point = 6, bonus = '30' } = {}) {
  const d = betDef(id)
  if (LINE_ODDS[id]) {
    const [w, n] = LINE_ODDS[id]
    return { win: w, lose: n - w, p: w / n, rolls: false }
  }
  if (d.group === 'bonus') {
    const p = BONUS_CHANCE[id]
    return { win: null, lose: null, p, rolls: false }
  }

  const marked = new Set([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
  let win = 0
  let lose = 0
  for (const r of ALL_ROLLS) {
    const out = settle(id, 36, r, { point, marked, bonus })?.outcome
    if (out === 'win') win++
    else if (out === 'lose') lose++
  }
  return { win, lose, p: win + lose ? win / (win + lose) : 0, rolls: true }
}

/*
 * What the bet is genuinely worth, as odds against.
 *
 * Reduced where it reduces to something a person can hold in their head. The
 * line does not - 251 against 244 - and quoting it as a ratio makes it look
 * like an exotic price rather than what it is, which is the closest thing to a
 * coin toss anywhere in a casino.
 */
export function trueOdds(id, ctx) {
  const { win, lose, p } = waysOf(id, ctx)
  if (!win && !lose) return p ? `${Math.round((1 - p) / p)}:1` : null
  const ratio = asRatio(lose, win)
  const [a, b] = ratio.split(':').map(Number)
  if (a > 20 && b > 1) return `${lose} against ${win} — as near even money as a casino gets`
  return ratio
}

// ------------------------------------------------------------------ payouts

function paysOf(id, table) {
  const d = betDef(id)
  const n = d.number
  if (d.group === 'bonus') return `${BONUS_PAYTABLES[table.bonus].pays[id]}:1`
  if (d.group === 'line') return '1:1'
  if (d.group === 'odds') {
    const t = id.startsWith('dont') ? LAY_ODDS : TRUE_ODDS
    const at = d.number ?? 6
    return `${t[at][0]}:${t[at][1]} on the ${at}`
  }
  if (d.group === 'box') {
    if (id.startsWith('place')) return `${PLACE_PAYS[n][0]}:${PLACE_PAYS[n][1]}`
    if (id.startsWith('buy')) return `${TRUE_ODDS[n][0]}:${TRUE_ODDS[n][1]} less 5%`
    return `${LAY_ODDS[n][0]}:${LAY_ODDS[n][1]} less 5% of the win`
  }
  if (d.group === 'hardway') return `${HARDWAY_PAYS[n][0]}:1`
  if (d.group === 'hop') return d.hard ? '30:1' : '15:1'
  if (d.group === 'field') return '1:1, and 2:1 on the 2 and the 12'
  const one = quote(id, 36, {})
  if (!one.length) return null
  return one.map((q) => `${Math.round(q.pay / 36)}:1`).join(' or ')
}

// ------------------------------------------------------------------ English

/*
 * What each bet is, in a sentence or two.
 *
 * Grouped where the bets are genuinely the same bet with a different number on
 * it, which is most of the felt - there is nothing to say about the place
 * eight that is not also true of the place six except the number.
 */
const WHAT = {
  pass: 'The bet the whole game is built around. Coming out it wins on 7 or 11 and loses to 2, 3 or 12; anything else becomes the point, and then it wins if that number comes again before a seven.',
  dontpass: 'The other side of the line. Coming out it wins on 2 or 3, loses to 7 or 11, and pushes on the 12 — that push is the entire house edge on this side. Once there is a point it wants a seven.',
  come: 'A pass line bet made one roll late. It wins on 7 or 11, loses to craps, and otherwise travels to whatever number came up and behaves exactly like a pass line with a point of its own.',
  dontcome: 'The mirror of the come. Wins on 2 or 3, loses to 7 or 11, pushes on the 12, and otherwise travels to the number and waits for a seven.',
  'pass-odds': 'The one bet in the building with no house edge at all. It sits behind your line bet and pays exactly what the number is worth. The house caps it — that cap is the only reason it can afford to offer it.',
  'dontpass-odds': 'Odds on the don’t side: you risk more to win less, because once a point is out the seven is the favourite. Also free of house edge, and also capped.',
  place: 'A bet that this number comes before a seven, paid at a fixed price. The most common working bet on the felt after the line, and the whole reason the box numbers are printed as big as they are.',
  buy: 'A place bet at true odds, with a 5% commission for the privilege. Better than placing on the 4 and 10, worse on the 6 and 8 — which is why nobody who knows what they are doing buys the six.',
  lay: 'Betting against a number: it wants a seven before this number shows. You put up more than you can win, and the 5% is charged on the win rather than the stake, which makes it the cheapest way to bet against a number on the layout.',
  field: 'One roll. It wins on 2, 3, 4, 9, 10, 11 and 12 — seven numbers out of eleven, and still a losing bet, because the four it loses to are the four most likely. The doubles on the ends are what keep it as close as it is.',
  any7: 'One roll: a seven, any way it comes. The most expensive bet on the table, and the one the stickman will offer you most often.',
  anycraps: 'One roll: the 2, the 3 or the 12. Often bet as insurance on a come-out, since those three are the only numbers that can beat a fresh pass line bet.',
  aces: 'One roll, both dice showing one. There is exactly one way to make it out of thirty six.',
  boxcars: 'One roll, both dice showing six. Also one way in thirty six, and it pays the same as the aces.',
  acedeuce: 'One roll: a 1 and a 2. Two ways to make it.',
  yo: 'One roll: a 6 and a 5. Called “yo” rather than eleven because “eleven” and “seven” sound alike across a noisy table, and that mistake costs money.',
  horn: 'Four bets in one chip — the 2, the 3, the 11 and the 12, a quarter on each. Whatever happens, three quarters of it lose. It wants four dollars for that reason.',
  ce: 'Two bets in one chip: half on any craps, half on the eleven. The circles are dotted all the way round the come so there is a pair within the stickman’s reach of every position.',
  hardway: 'This number made as a pair, before it comes any other way and before a seven. A hard eight loses to 6-2 as surely as to a seven, which is the part that catches people out.',
  hop: 'One roll, one exact combination. A double can only be made one way so it pays 30:1; an easy way can be made two ways so it pays 15:1. Both are the same terrible value, which is the joke of the hop grid.',
  bonus: 'Every number in its group thrown before a seven — no order, no repeats needed. It goes up on a clean come-out and any seven at all ends it, including one on the come-out that pays your line bet.',
}

/*
 * What you say to put it up.
 *
 * Half of learning craps is finding out that some bets you place yourself and
 * some you have to hand over, and that there is a right phrase for each. This
 * is the part nobody at a busy table will stop to explain.
 */
const SAY = {
  pass: 'Nothing — you put it down yourself, straight on the line. The line, the come, the field and the odds are the only bets you ever touch.',
  dontpass: 'Nothing. Down yourself, in the Don’t Pass bar.',
  come: 'Nothing. Down yourself, in the come box, and the dealer moves it when it finds a number.',
  dontcome: 'Nothing. Down yourself in the Don’t Come box.',
  'pass-odds': '“Odds.” Laid behind your own line bet, just outside it, which you do yourself.',
  'dontpass-odds': '“Lay the odds.” Also yourself, heeled against your don’t pass bet.',
  place: '“Thirty on the six.” Chips to the dealer — never reach into the box yourself.',
  buy: '“Twenty-five, buy the four.” To the dealer, who puts a BUY button on it.',
  lay: '“Forty, no four.” To the dealer.',
  field: 'Nothing. Down yourself.',
  centre: 'To the stickman, not the dealer — “dollar yo”, “two-dollar horn”. Say it as you toss, because the stickman is placing it for you and needs to hear which one.',
  hardway: '“Dollar hard eight.” To the stickman. Add “two-way” if you are betting one for the crew as well.',
  hop: '“Dollar hop, three-three.” To the stickman, and say it before the dice are out or it will not be taken.',
  bonus: '“Five on the Little.” To the dealer, and only on a clean come-out.',
}

// What you will hear when it comes in.
const CALLED = {
  pass: '“Seven! Winner on the pass line.” Or on the point: “Eight! Eight the winner, pay the line.”',
  dontpass: '“Seven out. Line away.” The one call the whole table hears differently.',
  come: '“Seven! Pay the come.”',
  dontcome: '“Seven out — pay the don’t come.”',
  'pass-odds': '“Pay the line and the odds.”',
  'dontpass-odds': '“Line away, pay the lay.”',
  place: '“Six! Pay the six.” Then, to you: “Thirty-five on the six — press it?”',
  buy: '“Four! Pay the buy — eighty.”',
  lay: '“Seven out. Pay the no four.”',
  field: '“Field! Pay the field.” On the ends: “Twelve — pays double.”',
  any7: '“Seven out! Down with all the props.” The seven that pays this bet takes almost every other one on the layout.',
  anycraps: '“Craps! Any craps.”',
  aces: '“Snake eyes!” Also “aces”.',
  boxcars: '“Boxcars!” Also “midnight”.',
  acedeuce: '“Ace deuce!”',
  yo: '“Yo! Yo eleven!”',
  horn: '“Horn winner!” — followed by which one, because only one quarter of it won.',
  ce: '“C and E!”',
  hardway: '“Eight the hard way! Hard eight.” And when it goes: “Eight, easy eight — down with the hard eight.”',
  hop: '“Hop bet! Three-three.”',
  bonus: '“Marker on the six!” — every number gets called onto the tracker as it lands. Then, if it completes: “Little Ones!”',
}

// The general case for a family of bets, so the six and the eight do not each
// need their own paragraph.
const family = (id) => {
  const d = betDef(id)
  if (d.group === 'box') return id.split('-')[0] // place, buy, lay
  if (d.group === 'hardway') return 'hardway'
  if (d.group === 'hop') return 'hop'
  if (d.group === 'bonus') return 'bonus'
  if (d.group === 'odds') return id.startsWith('dont') ? 'dontpass-odds' : 'pass-odds'
  if (/^come-\d/.test(id)) return 'come'
  if (/^dontcome-\d/.test(id)) return 'dontcome'
  return id
}

const pick = (table, id) => table[id] ?? table[family(id)] ?? table[betDef(id).group] ?? null

// ------------------------------------------------------------------ the play

/*
 * When it may be made, when it is at risk, and whether it can be picked up.
 * Read off the catalogue rather than written out, so a bet whose rules change
 * cannot end up with a lesson that still describes the old ones.
 */
function playOf(id, table) {
  const d = betDef(id)
  const out = []

  if (id === 'pass' || id === 'dontpass') out.push('Made on a come-out roll only.')
  else if (id === 'come' || id === 'dontcome') out.push('Made once the point is out — never on a come-out.')
  else if (d.group === 'bonus') out.push('Made on a clean come-out, before the shooter throws.')
  else if (d.group === 'odds') out.push(`Made behind a ${betDef(d.behind).label} that already has a number.`)
  else out.push('Made at any time.')

  if (d.oneRoll) out.push('Decided on the very next throw, win or lose.')
  else if (d.worksOnComeOut) out.push('Always working, come-out included.')
  else out.push('Off on the come-out unless you call it on.')

  if (d.contract && !id.startsWith('dont')) {
    out.push(
      id === 'pass'
        ? 'A contract bet once the point is out — it can only be picked up before the come-out throw.'
        : 'A contract bet. It stays until it is decided.',
    )
  } else if (!d.oneRoll) {
    out.push('Can be taken down whenever you like.')
  }

  const step = unitFor(id, { point: 6 })
  const { min } = rangeFor(id, { table })
  out.push(
    step > 1
      ? `Wants ${money(Math.max(min, step))} and moves in ${money(step)} steps, so it can be paid in whole dollars.`
      : `Minimum ${money(min)}.`,
  )
  if (d.vig) out.push('Carries a 5% commission, charged when it goes up.')
  return out
}

// ------------------------------------------------------------------ a lesson

export function explain(id, table = DEFAULT_TABLE, ctx = {}) {
  const d = betDef(id)
  const point = ctx.point ?? 6
  const ways = waysOf(id, { point, bonus: table.bonus })
  const cost = d.group === 'bonus' ? bonusEdge(id, table.bonus) : EDGES[id]

  return {
    id,
    title: d.label ?? id,
    group: d.group,
    what: pick(WHAT, id),
    say: pick(SAY, id),
    called: pick(CALLED, id),
    play: playOf(id, table),
    pays: paysOf(id, table),
    trueOdds: trueOdds(id, { point, bonus: table.bonus }),
    cost: asPercent(cost),
    free: cost === 0,
    /*
     * How often, said in whichever way is honest for this bet. A bet decided
     * by one throw is best described in ways out of thirty six; one that
     * rides is best described as the race it actually is.
     */
    chance: ways.rolls
      ? d.oneRoll
        ? `${ways.win} ${ways.win === 1 ? 'way' : 'ways'} in 36 — ${(ways.p * 100).toFixed(1)}%`
        : `${ways.win} ${ways.win === 1 ? 'way' : 'ways'} to win against ${ways.lose} — ` +
          `${(ways.p * 100).toFixed(1)}% of the times it decides`
      : d.group === 'bonus'
        ? `about one shooter in ${Math.round(1 / ways.p)} — ${(ways.p * 100).toFixed(2)}%`
        : `${(ways.p * 100).toFixed(1)}% of the times it decides`,
    // Where the money goes. The gap between what it is worth and what it pays
    // is the whole of the house's take, and saying both makes it visible.
    gap:
      cost === 0
        ? 'Paid at exactly what it is worth. The house keeps nothing.'
        : null,
  }
}
