/*
 * Chips.
 *
 * Casino denominations and the colours that go with them, which are near
 * enough universal in Nevada that getting them wrong reads as wrong: white is
 * a dollar, red is five, green is twenty five, black is a hundred, purple is
 * five hundred. A player who has stood at a table knows what a stack of greens
 * is worth without reading the number on it, and that is the whole reason the
 * colours are fixed.
 */

export const CHIPS = [
  { value: 1, label: '1', name: 'white', fill: '#f1ece0', ink: '#3a2f28', edge: '#cbc3b1' },
  { value: 5, label: '5', name: 'red', fill: '#c4262c', ink: '#fff6f2', edge: '#8b171d' },
  { value: 25, label: '25', name: 'green', fill: '#1c7a45', ink: '#f2fff6', edge: '#0f5330' },
  { value: 100, label: '100', name: 'black', fill: '#1c1a1a', ink: '#f6f2ea', edge: '#000' },
  { value: 500, label: '500', name: 'purple', fill: '#5a2b83', ink: '#f7f0ff', edge: '#3a1a58' },
]

export const chipOf = (value) => CHIPS.find((c) => c.value === value) ?? CHIPS[0]

/*
 * An amount, in the fewest chips that make it.
 *
 * What a dealer hands you, and what a rail looks like. Largest first, and
 * greedy is exact here because every denomination divides the one above it -
 * 1, 5, 25, 100, 500 - so there is no amount where taking the biggest chip
 * first leads anywhere worse.
 */
export function breakInto(amount) {
  const out = []
  let left = Math.round(amount)
  for (const chip of [...CHIPS].reverse()) {
    const n = Math.floor(left / chip.value)
    if (n > 0) out.push({ chip, count: n })
    left -= n * chip.value
  }
  return out
}

export const chipCount = (amount) => breakInto(amount).reduce((n, p) => n + p.count, 0)

/*
 * The chips to draw for a bet, top of the pile last.
 *
 * A real stack of a hundred dollars in reds is twenty chips tall and nobody
 * draws that, so the pile is capped and the amount is always written beside
 * it. What the cap preserves is the *colour* of the money: the top chip is the
 * largest denomination in the bet, so a black-topped pile still reads as a big
 * bet at a glance even though it is only five chips high.
 */
export function stackFor(amount, max = 5) {
  const flat = breakInto(amount).flatMap(({ chip, count }) => Array(count).fill(chip))
  if (flat.length <= max) return flat.reverse()
  // Keep the largest, and fill the rest of the pile from the bottom of the
  // break so the stack still looks like the money it stands for.
  const kept = [flat[0], ...flat.slice(-(max - 1))]
  return kept.reverse()
}

// ------------------------------------------------------------------- money

export const money = (n) => {
  const whole = Math.round(n * 100) / 100
  return whole % 1 === 0
    ? `$${whole.toLocaleString('en-US')}`
    : `$${whole.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

// Short form for a chip stack label, where the width is a spot on the felt
// rather than a line of text. $1,250 becomes 1.25k.
export const brief = (n) => {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k % 1 === 0 ? k : k.toFixed(2).replace(/0$/, '')}k`
}

// The starting rail. A thousand dollars is thirty three bets at a $30 six,
// which is long enough to see a shooter through and short enough that the
// bankroll is a real constraint.
export const OPENING_RAIL = 1000
