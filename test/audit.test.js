import { check, done, near } from './harness.js'
import { ALL_ROLLS, BET_IDS, LAY_ODDS, POINTS, betDef, settle } from '../src/lib/bets.js'
import { BONUS_CHANCE, BONUS_PAYTABLES, EDGES, bonusEdge, chanceOfAll } from '../src/lib/edges.js'
import { DEFAULT_TABLE, unitFor, vigFor } from '../src/lib/limits.js'
import { newTable, placeBet, railTotal, reducer } from '../src/lib/table.js'

/*
 * The audit.
 *
 * scripts/sim.mjs measures each bet by playing it a million times, which is
 * the right instrument for the whole engine - it exercises the reducer, the
 * come bets travelling, the working state, the order of settlement. But it is
 * statistical, and a bet that is wrong by a tenth of a point can hide inside
 * its own noise for a very long time.
 *
 * This is the other half, and the stronger one. Every bet on this felt except
 * the two line bets is decided by a single throw against a fixed set of
 * outcomes, so its expectation can be computed *exactly* - by asking the
 * catalogue's own settle() what each of the thirty six throws does, and doing
 * the arithmetic. No sampling, no tolerance, no waiting.
 *
 * If a payout is a shade too generous, this fails immediately and by the exact
 * amount. It is the check that answers "did I make something wrong".
 */

const table = DEFAULT_TABLE

/*
 * A stake that makes the arithmetic honest for this spot.
 *
 * It has to divide by the increment, or the payout would be a fraction the
 * table would never pay. Commission bets take a size where the 5% lands on a
 * whole dollar, because the dollar floor is a real cost at small stakes and
 * would otherwise be measured as part of the edge.
 */
function stakeFor(id) {
  const d = betDef(id)
  if (d.vig === 'bet') return 100 // $5 commission, exactly 5%
  if (d.vig === 'win') return (100 * LAY_ODDS[d.number][1]) / LAY_ODDS[d.number][0] // wins $100
  const unit = unitFor(id, { point: 6 })
  return unit * 36 // divides by anything on this layout
}

/*
 * What one decision on this bet is worth, exactly.
 *
 * Every throw is settled against the bet by the same code that pays it, and
 * the ones that ride are simply not decisions. The commission is charged once
 * per decision, which is the arrangement the published figures assume and what
 * a player who is paying attention actually does.
 */
function edgeOf(id, bonus = '30') {
  const d = betDef(id)
  const stake = stakeFor(id)
  const vig = vigFor(id, stake, { table })
  // Every number marked, so a bonus bet is asked the question it is actually
  // being tested on: given the set is complete, what does it pay.
  const marked = new Set([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])

  let won = 0
  let lost = 0
  let ret = 0 // what the winners paid
  for (const r of ALL_ROLLS) {
    const out = settle(id, stake, r, { point: 6, marked, bonus })
    if (!out) continue
    if (out.outcome === 'win') {
      won++
      ret += out.pay
    } else if (out.outcome === 'lose') {
      lost++
    }
    // A push is a decision that costs nothing, and is counted below.
  }
  if (!won && !lost) return null

  const decisions = won + lost
  const ev = ret / decisions - (lost / decisions) * stake - vig
  return -(ev / (stake + vig)) * 100
}

// ------------------------------------------------- everything but the line

for (const id of BET_IDS) {
  const d = betDef(id)
  // The line spans a come-out and then a point, so no single throw decides it.
  if (['pass', 'dontpass', 'come', 'dontcome'].includes(id)) continue
  if (/^(come|dontcome)-\d/.test(id)) continue
  if (d.group === 'bonus') continue

  const exact = edgeOf(id)
  if (exact === null) continue
  near(`${d.label} costs exactly ${EDGES[id].toFixed(3)}%`, exact, EDGES[id], 0.0015)
}

/*
 * ------------------------------------------------------------- and the line
 *
 * Worked out from first principles rather than quoted: the come-out outcomes,
 * plus for each point the chance of establishing it times the chance of making
 * it before a seven. Which comes to 244 in 495 for the pass line - the most
 * famous fraction in the game, and one worth deriving rather than trusting.
 */
const WAYS = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 }

{
  let win = 8 / 36 // seven or eleven, coming out
  for (const n of POINTS) win += (WAYS[n] / 36) * (WAYS[n] / (WAYS[n] + 6))
  near('the pass line wins 244 times in 495', win, 244 / 495, 1e-12)
  near('which costs 1.414%', -(win - (1 - win)) * 100, EDGES.pass, 0.0005)
  near('and the come is the same bet', -(win - (1 - win)) * 100, EDGES.come, 0.0005)
}

{
  let win = 3 / 36 // two or three, coming out
  for (const n of POINTS) win += (WAYS[n] / 36) * (6 / (WAYS[n] + 6))
  const push = 1 / 36 // the barred twelve
  const lose = 1 - win - push
  near("don't pass wins 949 times in 1980", win, 949 / 1980, 1e-12)
  near('and pushes once in thirty six', push, 1 / 36, 1e-12)

  /*
   * The barred twelve is the whole house edge on this side, and it is also
   * where the published figure comes from: 1.364% counts the push as a bet
   * made, which it is. Leaving it out of the denominator gives 1.403%, and
   * the difference between those two numbers is the difference between what a
   * player is quoted and what a simulator that skips pushes measures.
   */
  near('which costs 1.364% per bet made', (lose - win) * 100, EDGES.dontpass, 0.0005)
  near("and the don't come is the same bet", (lose - win) * 100, EDGES.dontcome, 0.0005)
  near('per bet resolved it is 1.403%', ((lose - win) / (1 - push)) * 100, 1.4026, 0.001)
}

// ------------------------------------------------------------- the bonus row

/*
 * The one bet whose price is a table setting, so it is checked at every
 * setting - and its probability is worked out by inclusion-exclusion over the
 * subsets rather than looked up, which is what makes the edge follow the rate.
 */
near('Little comes in once in 37.9 shooters', BONUS_CHANCE.little, 0.0263535, 1e-6)
near('Big is the same, being the mirror of it', BONUS_CHANCE.big, BONUS_CHANCE.little, 1e-12)
near('and Boom or Bust once in 190', BONUS_CHANCE.all, 0.0052579, 1e-6)
check('all ten is rarer than either five', BONUS_CHANCE.all < BONUS_CHANCE.little)

for (const [key, pt] of Object.entries(BONUS_PAYTABLES)) {
  for (const id of ['little', 'big', 'all']) {
    const rate = pt.pays[id]
    const exact = -(BONUS_CHANCE[id] * rate - (1 - BONUS_CHANCE[id])) * 100
    near(`${betDef(id).label} at ${rate}:1 costs ${exact.toFixed(2)}%`, bonusEdge(id, key), exact, 1e-9)
    // And the felt pays what the table says it does.
    near(
      `and a $5 ${betDef(id).label} pays $${5 * rate} at that table`,
      settle(id, 5, { a: 3, b: 3, total: 6 }, { marked: new Set([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]), bonus: key }).pay,
      5 * rate,
      1e-9,
    )
  }
}

check('paying more costs less', bonusEdge('little', '34') < bonusEdge('little', '31'))
check('and 31 sits between the other two', bonusEdge('little', '31') < bonusEdge('little', '30'))

// A sanity check on the machinery itself: a set of one number is just that
// number before a seven, which is a fraction anybody can do in their head.
near('the chance of a two before a seven is one in seven', chanceOfAll([2]), 1 / 7, 1e-12)
near('and a six before a seven is five in eleven', chanceOfAll([6]), 5 / 11, 1e-12)

// ------------------------------------------- a buy or lay left up for life

/*
 * The figures above are per decision, with one commission each. This asks the
 * engine whether that is what a player actually pays when they do what nearly
 * everybody does: put the bet up and leave it there through every win until
 * a decision finally takes it.
 *
 * Exact, not sampled. The bet's whole future is a handful of table states -
 * coming out, or one of six points - and value iteration over all thirty six
 * throws from each one converges to the expectation. The commission on every
 * decision is counted as part of what was wagered on it, which is how the
 * published figures count it.
 */
function leftUp(id, stake) {
  const opening = { ...newTable(), phase: 'point', point: id.endsWith('-4') ? 5 : 4, bankroll: 1e9 }
  const placed = placeBet(opening, id, stake)
  const firstVig = opening.bankroll - placed.bankroll - stake
  // Working on the come-out too, so every throw is one it is exposed to.
  const start = { ...placed, bets: { [id]: { ...placed.bets[id], working: true } } }
  const key = (s) => `${s.phase}|${s.point}|${s.bets[id]?.vig ?? '-'}`

  const nodes = new Map()
  const queue = [start]
  nodes.set(key(start), { s: start })
  while (queue.length) {
    const s = queue.pop()
    const node = nodes.get(key(s))
    node.next = ALL_ROLLS.map((r) => {
      const n = reducer({ ...s, marked: new Set() }, { type: 'roll', roll: r })
      const e = n.lastEvents.find((x) => x.id === id && ['pay', 'take'].includes(x.kind))
      const out = {
        gain: railTotal(n) - railTotal(s),
        decided: e ? 1 : 0,
        vig: e?.vig ?? 0,
        over: !n.bets[id],
        k: key(n),
      }
      if (!out.over && !nodes.has(out.k)) {
        nodes.set(out.k, { s: n })
        queue.push(n)
      }
      return out
    })
  }

  let v = new Map([...nodes.keys()].map((k) => [k, [0, 0, 0]]))
  for (let i = 0; i < 4000; i++) {
    const w = new Map()
    for (const [k, node] of nodes) {
      const sum = [0, 0, 0]
      for (const t of node.next) {
        const after = t.over ? [0, 0, 0] : v.get(t.k)
        sum[0] += t.gain + after[0]
        sum[1] += t.decided + after[1]
        sum[2] += t.vig + after[2]
      }
      w.set(k, sum.map((x) => x / 36))
    }
    v = w
  }
  const [gain, decisions, vigs] = v.get(key(start))
  const profit = gain - firstVig
  const wagered = decisions * stake + firstVig + vigs
  return { edge: (-profit / wagered) * 100, decisions }
}

for (const id of BET_IDS.filter((x) => betDef(x).vig)) {
  const { edge, decisions } = leftUp(id, stakeFor(id))
  near(
    `${betDef(id).label} left up costs ${EDGES[id].toFixed(3)}% a decision, over ${decisions.toFixed(2)} of them`,
    edge,
    EDGES[id],
    // EDGES is published to three decimals; the engine lands on the exact
    // figure, so the only gap allowed is that rounding.
    0.0005,
  )
}

// ----------------------------------------------------- nothing is a giveaway

/*
 * The question the whole file exists to answer: is anything too generous.
 *
 * Odds are the only bet in the building that costs nothing, and nothing on
 * this felt may cost less than that. A negative number here would mean the
 * player has the edge, which on a casino layout means a payout is wrong.
 */
for (const id of BET_IDS) {
  const d = betDef(id)
  const cost = d.group === 'bonus' ? bonusEdge(id, table.bonus) : EDGES[id]
  check(`${d.label} is not a giveaway`, cost >= 0, `${cost.toFixed(3)}%`)
  check(`${d.label} is not a robbery either`, cost <= 21, `${cost.toFixed(3)}%`)
}

{
  const free = BET_IDS.filter((id) => EDGES[id] === 0)
  check('the only free bets are the odds', free.every((id) => betDef(id).group === 'odds'), free.join(' '))
  check('and every odds bet is free', BET_IDS.filter((id) => betDef(id).group === 'odds').every((id) => EDGES[id] === 0))
}

done('audit')
