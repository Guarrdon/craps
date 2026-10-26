import { check, done, eq, near } from './harness.js'
import { DEFAULT_TABLE, check as legal, maxBet, maxOdds, rangeFor, unitFor, vigEdge, vigFor } from '../src/lib/limits.js'
import { POINTS } from '../src/lib/bets.js'

const table = DEFAULT_TABLE // $25 line, 3-4-5x
const ctx = (over = {}) => ({ table, phase: 'point', point: 6, bets: {}, marked: new Set(), bankroll: 100000, ...over })
const why = (id, amount, over) => legal(id, amount, ctx(over)).reason

// ------------------------------------------------------------- increments

eq('the six wants sixes', unitFor('place-6'), 6)
eq('the eight wants sixes', unitFor('place-8'), 6)
eq('the five wants fives', unitFor('place-5'), 5)
eq('the nine wants fives', unitFor('place-9'), 5)
eq('the four wants fives', unitFor('place-4'), 5)
eq('the ten wants fives', unitFor('place-10'), 5)
eq('a horn wants fours', unitFor('horn'), 4)
eq('C&E wants twos', unitFor('ce'), 2)
eq('a hop takes a dollar', unitFor('hop-3-4'), 1)

eq('odds behind a four are any amount', unitFor('pass-odds', { point: 4 }), 1)
eq('odds behind a five must be even', unitFor('pass-odds', { point: 5 }), 2)
eq('odds behind a six come in fives', unitFor('pass-odds', { point: 6 }), 5)
eq('laying against a four must be even', unitFor('dontpass-odds', { point: 4 }), 2)
eq('laying against a five comes in threes', unitFor('dontpass-odds', { point: 5 }), 3)
eq('laying against a six comes in sixes', unitFor('dontpass-odds', { point: 6 }), 6)

check('$25 on the six is refused', !legal('place-6', 25, ctx()).ok)
// On a $25 table $24 is under the minimum, so there is only one answer and
// the refusal says one number rather than the same one twice.
check('the refusal says what to make it', /Make it \$30\./.test(why('place-6', 25)), why('place-6', 25))
check('$30 on the six is taken', legal('place-6', 30, ctx()).ok)
check('$12 on the six is under a $25 minimum', !legal('place-6', 12, ctx()).ok)
check('but fine on a $10 table', legal('place-6', 12, ctx({ table: { ...table, min: 10 } })).ok)
check('and there the refusal offers both ways', /\$24 or \$30/.test(
  legal('place-6', 25, ctx({ table: { ...table, min: 10 } })).reason))
check('$25 on the five is taken', legal('place-5', 25, ctx()).ok)
check('$4 on the horn is taken', legal('horn', 4, ctx()).ok)
check('$5 on the horn is refused', !legal('horn', 5, ctx()).ok)
check('$1 on C&E is refused - it is two bets', !legal('ce', 1, ctx()).ok)

// ---------------------------------------------------------------- the odds
//
// 3-4-5x is a scheme about the payout, not the stake: every point wins the
// same six times the flat bet. That is the whole reason it exists, and if any
// of these six numbers is wrong the dealer would be paying different amounts
// for the same bet.

for (const [point, expected] of [[4, 30], [5, 40], [6, 50], [8, 50], [9, 40], [10, 30]]) {
  eq(`3-4-5x behind a ${point} on a $10 line is $${expected}`, maxOdds('pass-odds', 10, { point, table }), expected)
}
for (const [point, lay, win] of [[4, 120, 60], [5, 90, 60], [6, 72, 60], [8, 72, 60], [9, 90, 60], [10, 120, 60]]) {
  eq(`3-4-5x laid against a ${point} on a $10 line is $${lay}`, maxOdds('dontpass-odds', 10, { point, table }), lay)
}

{
  // The point of the scheme, stated directly.
  const wins = POINTS.map((point) => {
    const stake = maxOdds('pass-odds', 10, { point, table })
    const [num, den] = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] }[point]
    return (stake * num) / den
  })
  check('every point pays the same $60 at maximum odds', wins.every((w) => w === 60), wins.join())
}

{
  const tenx = { ...table, odds: 10 }
  eq('a 10x table caps the stake at ten times the line', maxOdds('pass-odds', 10, { point: 4, table: tenx }), 100)
  eq('and on the six as well', maxOdds('pass-odds', 10, { point: 6, table: tenx }), 100)
  eq('the don\'t side lays to win ten times instead', maxOdds('dontpass-odds', 10, { point: 4, table: tenx }), 200)
}

check('odds with nothing behind them are refused', !legal('pass-odds', 25, ctx()).ok)
check('the refusal names the missing bet', /Pass Line/.test(why('pass-odds', 25)), why('pass-odds', 25))
check('$50 odds behind a $10 line on the six is taken', legal('pass-odds', 50, ctx({ bets: { pass: { amount: 10 } } })).ok)
check('$55 is over the cap', !legal('pass-odds', 55, ctx({ bets: { pass: { amount: 10 } } })).ok)
check('the refusal names the cap', /\$50/.test(why('pass-odds', 55, { bets: { pass: { amount: 10 } } })))
check('odds top up to the cap and no further', !legal('pass-odds', 10, ctx({ bets: { pass: { amount: 10 }, 'pass-odds': { amount: 50 } } })).ok)

// ------------------------------------------------------------------- vig

eq('a $25 buy costs a dollar', vigFor('buy-4', 25, { table }), 1)
eq('a $100 buy costs five', vigFor('buy-4', 100, { table }), 5)
eq('a $20 buy costs a dollar', vigFor('buy-4', 20, { table }), 1)
eq('a $5 buy still costs a dollar - the floor is the point', vigFor('buy-4', 5, { table }), 1)
// The lay pays on what it wins, which is less than what it risks.
eq('laying $40 against the four costs a dollar', vigFor('lay-4', 40, { table }), 1)
eq('laying $100 against the four costs two', vigFor('lay-4', 100, { table }), 2)
eq('laying $120 against the six costs five', vigFor('lay-6', 120, { table }), 5)
eq('a place bet costs nothing', vigFor('place-6', 30, { table }), 0)

// What the commission actually costs at a given size. Exactly the published
// figure only when 5% comes out in whole dollars.
near('a $100 buy costs exactly 5 in 105', vigEdge('buy-4', 100, { table }), (5 / 105) * 100)
near('a $39 buy costs a dollar in forty', vigEdge('buy-4', 39, { table }), 2.5)
near('a $10 buy costs a dollar in eleven', vigEdge('buy-4', 10, { table }), (1 / 11) * 100)
near('laying $40 on the four costs a dollar in forty one', vigEdge('lay-4', 40, { table }), (1 / 41) * 100)

// A come bet on its number is the dealer's to move, not the player's to bet.
check('nothing goes directly on a come bet on its number', !legal('come-6', 10, ctx({ phase: 'point', point: 5, bets: { 'come-6': { amount: 10 } } })).ok)
check("or a don't come on its number", !legal('dontcome-4', 10, ctx({ phase: 'point', point: 5, bets: { 'dontcome-4': { amount: 10 } } })).ok)
eq('the pass line costs nothing', vigFor('pass', 10, { table }), 0)

check('the vig comes out of the rail too', !legal('buy-4', 100, ctx({ bankroll: 100 })).ok)
check('the refusal mentions the vig', /vig/.test(why('buy-4', 100, { bankroll: 100 })), why('buy-4', 100, { bankroll: 100 }))
check('$100 buy needs $105 on the rail, not $101', !legal('buy-4', 100, ctx({ bankroll: 101 })).ok)
check('$105 on the rail covers it', legal('buy-4', 100, ctx({ bankroll: 105 })).ok)
// Topping a buy up is priced on the new total, less what has already been
// paid - not as a fresh bet with a fresh dollar floor.
eq('going from $20 to $100 on a buy costs the difference', legal('buy-4', 80, ctx({ bets: { 'buy-4': { amount: 20 } } })).vig, 4)

// ------------------------------------------------------- when a spot is open

check('the come box is shut on a come-out', !legal('come', 10, ctx({ phase: 'come-out', point: null })).ok)
check('the come box is open once the point is out', legal('come', 25, ctx()).ok)
check('the pass line is shut once the point is out', !legal('pass', 10, ctx()).ok)
check('and it points you at the come', /Come/.test(why('pass', 10)), why('pass', 10))
check("don't pass is shut once the point is out", !legal('dontpass', 10, ctx()).ok)
check('the pass line is open on a come-out', legal('pass', 25, ctx({ phase: 'come-out', point: null })).ok)

check('the field is always open', legal('field', 25, ctx({ phase: 'come-out', point: null })).ok)
check('a hop is always open', legal('hop-3-4', 1, ctx({ phase: 'come-out', point: null })).ok)
check('place bets can go up on a come-out', legal('place-6', 30, ctx({ phase: 'come-out', point: null })).ok)

// The bonus row wants a clean board, or you could stand back and buy in once
// half the numbers were already marked.
const fresh = { phase: 'come-out', point: null, marked: new Set() }
check('Boom or Bust goes up before the come-out', legal('all', 5, ctx(fresh)).ok)
check('but not once the shooter is under way', !legal('all', 5, ctx({ ...fresh, marked: new Set([6]) })).ok)
check('and not mid-point', !legal('all', 5, ctx()).ok)

// ---------------------------------------------------------------- the sizes

eq('the line minimum is $25', rangeFor('pass', { table }).min, 25)
eq('the centre takes a dollar', rangeFor('hop-3-4', { table }).min, 1)
eq('and so do the hardways - they are the stickman\'s too', rangeFor('hard-8', { table }).min, 1)
check('$1 on the hard eight is fine on a $10 table', legal('hard-8', 1, ctx()).ok)
eq('the bonus takes a dollar', rangeFor('all', { table }).min, 1)
check('$5 on the line is refused on a $25 table', !legal('pass', 5, ctx({ phase: 'come-out', point: null })).ok)
check('the refusal names the minimum', /\$25 minimum/.test(why('pass', 5, { phase: 'come-out', point: null })))
check('$1 on the yo is fine however high the line is', legal('yo', 1, ctx()).ok)
check('over the table maximum is refused', !legal('pass', 6000, ctx({ phase: 'come-out', point: null })).ok)
check('over the prop maximum is refused', !legal('yo', 600, ctx()).ok)

check('half a dollar is not a bet', !legal('yo', 0.5, ctx()).ok)
check('nothing is not a bet', !legal('yo', 0, ctx()).ok)
check('a negative bet is not a bet', !legal('yo', -10, ctx()).ok)
check('a spot that is not on the felt is refused', !legal('big-6', 10, ctx()).ok)

// --------------------------------------------------------------- max button

eq('max on the six with $100 is $96', maxBet('place-6', ctx({ bankroll: 100 })), 96)
eq('max odds behind a $10 six is $50', maxBet('pass-odds', ctx({ bets: { pass: { amount: 10 } } })), 50)
eq('max on the line is the table maximum', maxBet('pass', ctx({ phase: 'come-out', point: null })), 5000)
{
  // The buy has to leave room for its own commission, which is the sort of
  // thing an inverted formula gets wrong and a loop that asks does not.
  const most = maxBet('buy-4', ctx({ bankroll: 100 }))
  check('max on a buy leaves room for the vig', most + vigFor('buy-4', most, { table }) <= 100, `$${most}`)
  check('and it is the largest that does', legal('buy-4', most + 1, ctx({ bankroll: 100 })).ok === false)
}

done('limits')
