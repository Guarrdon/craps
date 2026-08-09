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

  // At 30/30/150. Small and Tall come in about once in thirty eight shooters,
  // All about once in five hundred and twenty six.
  little: 18.56,
  big: 18.56,
  all: 20.59,
}

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
