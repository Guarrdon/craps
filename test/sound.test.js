import { check, done, eq } from './harness.js'
import { cuesFor } from '../src/lib/sound.js'

/*
 * Which sounds a roll calls for.
 *
 * The synthesis itself needs a browser, but the decision does not - and the
 * decision is the part that can be wrong. A table reacts to a hardway and not
 * to a place bet, and getting that backwards would be irritating within about
 * four throws.
 */

const pay = (id, amount, p) => ({ kind: 'pay', id, amount, pay: p })
const take = (id, amount) => ({ kind: 'take', id, amount })

eq('a roll that pays nothing makes no sound', cuesFor([]).paid, 0)
eq('and neither does one that only takes', cuesFor([take('field', 25)]).paid, 0)

{
  // A place six pays 7:6 - money, but not news.
  const c = cuesFor([pay('place-6', 30, 35)])
  eq('a place bet pays', c.paid, 35)
  check('and is not a big win', !c.big)
}

{
  const c = cuesFor([pay('pass', 25, 25)])
  check('even money is not a big win either', !c.big)
}

{
  // Odds on the four pay 2:1, which is the most a table shrugs at.
  check('2:1 does not count', !cuesFor([pay('pass-odds', 30, 60)]).big)
  check('but 3:1 does', cuesFor([pay('any7', 5, 15)]).big)
}

{
  const c = cuesFor([pay('hard-8', 5, 45)])
  check('a hardway is a big win', c.big)
  eq('and its payout is counted', c.paid, 45)
}

check('a hop is a big win', cuesFor([pay('hop-3-3', 5, 150)]).big)
check('so is the bonus row', cuesFor([pay('little', 5, 150)]).big)
check('and the yo', cuesFor([pay('yo', 5, 75)]).big)

{
  // One big winner among several small ones still counts, and the total is
  // everything paid rather than just the one that made the noise.
  const c = cuesFor([pay('place-6', 30, 35), pay('hard-8', 5, 45), pay('place-8', 30, 35)])
  check('one big winner is enough', c.big)
  eq('and the total is all of it', c.paid, 115)
}

{
  // A bet of nothing cannot be divided by, and a roll where a bet was returned
  // rather than won is not a payout at all.
  check('a zero-stake pay does not divide by zero', !cuesFor([pay('field', 0, 0)]).big)
  eq('a returned bet is not a win', cuesFor([{ kind: 'return', id: 'come-odds-6', amount: 50 }]).paid, 0)
  eq('and neither is a push', cuesFor([{ kind: 'push', id: 'dontpass', amount: 25 }]).paid, 0)
}

done('sound')
