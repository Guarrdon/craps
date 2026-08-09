/*
 * What each bet costs, per bet resolved.
 *
 * One table, used by three things that must not disagree: the rules screen
 * shows these numbers to the player, scripts/sim.mjs measures the engine
 * against them, and bets.test.js checks the one-roll figures against what the
 * catalogue actually pays - so a payout typo moves the measurement away from
 * the table, and a wrong table fails the test.
 *
 * These are the standard analyses of each wager, for the payouts printed on
 * *this* felt. The field is 5.556% because this table pays double on both
 * ends; a table paying triple on the twelve is 2.778%, and the bonus row would
 * be several points cheaper at 34/34/175. The layout decides, not the game.
 */

export const EDGES = {
  pass: 1.414,
  dontpass: 1.364,
  come: 1.414,
  dontcome: 1.364,

  // Odds are the only bet in the house with no edge at all. They pay exactly
  // what the number is worth, which is why the table caps how much you may
  // have behind a line bet rather than letting you back a $5 line with $500.
  'pass-odds': 0,
  'dontpass-odds': 0,

  'place-4': 6.667,
  'place-5': 4.0,
  'place-6': 1.515,
  'place-8': 1.515,
  'place-9': 4.0,
  'place-10': 6.667,

  // True odds less five per cent of the stake. Better than placing the four
  // and ten, worse than placing the six and eight, which is why nobody who
  // knows what they are doing buys the six.
  'buy-4': 4.762,
  'buy-5': 4.762,
  'buy-6': 4.762,
  'buy-8': 4.762,
  'buy-9': 4.762,
  'buy-10': 4.762,

  // Five per cent of the win rather than the stake, which is why laying is the
  // cheapest way to bet against a number.
  'lay-4': 2.439,
  'lay-5': 3.226,
  'lay-6': 4.0,
  'lay-8': 4.0,
  'lay-9': 3.226,
  'lay-10': 2.439,

  field: 5.556,

  any7: 16.667,
  anycraps: 11.111,
  aces: 13.889,
  boxcars: 13.889,
  acedeuce: 11.111,
  yo: 11.111,
  horn: 12.5,
  ce: 11.111,

  'hard-4': 11.111,
  'hard-6': 9.091,
  'hard-8': 9.091,
  'hard-10': 11.111,

  // Worked out from the pay table below rather than quoted, because this is
  // the one bet on the felt whose price moves house to house.
  little: 0,
  big: 0,
  all: 0,
}

/*
 * The chance of throwing every number in a set before a seven.
 *
 * Inclusion-exclusion over the subsets. For any collection of numbers, the
 * chance that at least one of them is still missing when the seven arrives is
 * a sum over subsets of "the seven came before all of these" - and each of
 * those is just six ways against six plus the ways of the subset, because
 * every other throw is irrelevant to the question.
 *
 * Thirty two subsets for the small, a thousand and twenty four for the all.
 * Exact, and quick enough to do at module load.
 */
export function chanceOfAll(numbers) {
  const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }
  let p = 0
  for (let mask = 0; mask < 1 << numbers.length; mask++) {
    let ways = 0
    let bits = 0
    for (let i = 0; i < numbers.length; i++) {
      if (mask & (1 << i)) {
        ways += WAYS[numbers[i]]
        bits++
      }
    }
    p += (bits % 2 ? -1 : 1) * (6 / (6 + ways))
  }
  return p
}

/*
 * The pay tables a table might print for the bonus row.
 *
 * 30 to 1 is what the reference photograph prints and what most houses run.
 * 34 to 1 turns it from one of the worst bets on the felt into one of the
 * better long shots, and a few places still offer it.
 *
 * A house that prints "31 FOR 1" is printing the same bet: "for one" includes
 * your stake coming back, "to one" does not, so 31 for 1 and 30 to 1 are the
 * same money. Santa Fe Station words it the first way and the reference table
 * words it the second.
 */
export const BONUS_PAYTABLES = {
  '30': { label: '30 to 1 · 150 to 1', also: '31 for 1 · 151 for 1', pays: { little: 30, big: 30, all: 150 } },
  '34': { label: '34 to 1 · 175 to 1', also: '35 for 1 · 176 for 1', pays: { little: 34, big: 34, all: 175 } },
}

export const BONUS_CHANCE = {
  little: chanceOfAll([2, 3, 4, 5, 6]),
  big: chanceOfAll([8, 9, 10, 11, 12]),
  all: chanceOfAll([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]),
}

// What a bonus bet costs at a given pay table, as a percentage.
export const bonusEdge = (id, paytable = '30') =>
  -(BONUS_CHANCE[id] * BONUS_PAYTABLES[paytable].pays[id] - (1 - BONUS_CHANCE[id])) * 100

for (const id of ['little', 'big', 'all']) EDGES[id] = bonusEdge(id, '30')

// Come odds are the same bet as pass odds with a different number on it.
for (const n of [4, 5, 6, 8, 9, 10]) {
  EDGES[`come-odds-${n}`] = 0
  EDGES[`dontcome-odds-${n}`] = 0
  EDGES[`come-${n}`] = EDGES.come
  EDGES[`dontcome-${n}`] = EDGES.dontcome
}

// Every hop, at the two rates this felt prints.
for (let a = 1; a <= 6; a++) {
  for (let b = a; b <= 6; b++) {
    const total = a + b
    if ((a === b && (total === 2 || total === 12)) || total === 3 || total === 11) continue
    EDGES[`hop-${a}-${b}`] = a === b ? 13.889 : 11.111
  }
}

export const edgeOf = (id) => EDGES[id]

// How a bet reads on the rules screen, worst first. Odds sort to the bottom
// with everything else that costs nothing.
export const byCost = (ids) => [...ids].sort((a, b) => (EDGES[b] ?? 0) - (EDGES[a] ?? 0))

export const asPercent = (n) => (n === 0 ? 'nothing' : `${n.toFixed(n < 10 ? 3 : 2)}%`)
