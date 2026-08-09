import { check, done, eq } from './harness.js'
import { CHIPS, breakInto, brief, chipCount, chipOf, money, stackFor } from '../src/lib/bank.js'

// --------------------------------------------------------------- the chips

eq('five denominations', CHIPS.length, 5)
eq('and they are the ones a table racks', CHIPS.map((c) => c.value).join(), '1,5,25,100,500')
check(
  'each divides the one above it, which is what makes the greedy break exact',
  CHIPS.every((c, i) => i === 0 || CHIPS[i].value % CHIPS[i - 1].value === 0),
)
eq('white is a dollar', chipOf(1).name, 'white')
eq('red is five', chipOf(5).name, 'red')
eq('green is twenty five', chipOf(25).name, 'green')
eq('black is a hundred', chipOf(100).name, 'black')
eq('purple is five hundred', chipOf(500).name, 'purple')

// --------------------------------------------------------- breaking it down

const shape = (n) => breakInto(n).map(({ chip, count }) => `${count}x${chip.value}`).join(' ')

eq('$30 is a green and a red', shape(30), '1x25 1x5')
eq('$12 is a red and seven whites', shape(12), '2x5 2x1')
eq('$500 is one purple', shape(500), '1x500')
eq('$1,000 is two', shape(1000), '2x500')
eq('$0 is nothing', shape(0), '')
eq('$137 breaks down properly', shape(137), '1x100 1x25 2x5 2x1')

check(
  'a break always adds back up to what it broke',
  [1, 6, 12, 30, 42, 99, 137, 500, 1234, 9999].every(
    (n) => breakInto(n).reduce((s, { chip, count }) => s + chip.value * count, 0) === n,
  ),
)

check(
  'and it is always the fewest chips that make it',
  // Greedy is optimal here because every denomination divides the next, so
  // this is a check that nobody has slipped a $3 chip into the rack.
  [1, 6, 12, 30, 42, 99, 137, 500].every((n) => chipCount(n) === fewest(n)),
)

function fewest(target) {
  const best = new Array(target + 1).fill(Infinity)
  best[0] = 0
  for (let n = 1; n <= target; n++) {
    for (const c of CHIPS) if (c.value <= n) best[n] = Math.min(best[n], best[n - c.value] + 1)
  }
  return best[target]
}

// ------------------------------------------------------------- the pile

eq('a $30 pile is two chips', stackFor(30).length, 2)
eq('and the top one is the green', stackFor(30).at(-1).value, 25)
check('a pile is capped so a big bet is not a hundred chips tall', stackFor(5000).length <= 5)
check(
  'but the largest chip in the bet is still on top, so it reads as a big bet',
  stackFor(5000).at(-1).value === 500,
)
eq('nothing bet is nothing drawn', stackFor(0).length, 0)
check(
  'no pile is ever taller than the cap, at any amount',
  [1, 7, 12, 30, 99, 137, 500, 1234, 9999, 100000].every((n) => stackFor(n).length <= 5),
)

// ------------------------------------------------------------------ money

eq('whole dollars have no decimals', money(30), '$30')
eq('thousands get a comma', money(1250), '$1,250')
eq('and cents show when there are any', money(12.5), '$12.50')
eq('a chip label stays short', brief(30), '30')
eq('and turns thousands into k', brief(1250), '1.25k')
eq('with no trailing zero', brief(2000), '2k')

done('bank')
