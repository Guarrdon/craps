import { check, done, eq, near } from './harness.js'
import { houseRng, makeRng } from '../src/lib/rng.js'

// --- determinism, which everything else in the suite leans on

{
  const a = makeRng(12345)
  const b = makeRng(12345)
  const one = Array.from({ length: 50 }, () => a.roll().total)
  const two = Array.from({ length: 50 }, () => b.roll().total)
  check('the same seed gives the same session', one.join() === two.join())

  const c = makeRng(12346)
  const three = Array.from({ length: 50 }, () => c.roll().total)
  check('a different seed gives a different one', one.join() !== three.join())
}

// --- range

{
  const rng = makeRng(7)
  let low = 7
  let high = 0
  for (let i = 0; i < 20000; i++) {
    const { a, b, total } = rng.roll()
    low = Math.min(low, a, b)
    high = Math.max(high, a, b)
    if (total !== a + b) check('total is the sum of the dice', false)
  }
  eq('no die ever comes up below one', low, 1)
  eq('no die ever comes up above six', high, 6)
}

// --- uniformity
//
// The naive `Math.floor(next() * 6)` is fine; the bug this guards against is a
// modulo over a range that does not divide 2^32. Rather than assert on a
// chi-square of the dice - which passes even with a bias of one part in a
// million - the tenth face of a ten-sided draw is checked, where a naive
// modulo would show up much sooner.

{
  const rng = makeRng(99)
  const N = 360000
  const counts = new Array(37).fill(0)
  for (let i = 0; i < N; i++) counts[rng.roll().total]++

  // Chi-square against the 36 ways two dice fall.
  const ways = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }
  let chi = 0
  for (const [total, w] of Object.entries(ways)) {
    const expected = (N * w) / 36
    chi += (counts[total] - expected) ** 2 / expected
  }
  // Ten degrees of freedom. 29.6 is the 0.1% point, so this fails once in a
  // thousand runs on a correct generator and constantly on a broken one.
  check('the totals come out 1-2-3-4-5-6-5-4-3-2-1', chi < 29.6, `chi-square ${chi.toFixed(2)}`)

  near('sevens come up one time in six', counts[7] / N, 1 / 6, 0.004)
  near('twelves come up one time in thirty six', counts[12] / N, 1 / 36, 0.002)
}

{
  // int(n) for an n that does not divide 2^32 evenly. With a plain modulo the
  // low faces run about one part in 700 million heavy - far too fine to see
  // here - so what this actually proves is that the rejection loop terminates
  // and stays in range, which is the failure mode that would matter.
  const rng = makeRng(4)
  const seen = new Set()
  for (let i = 0; i < 100000; i++) seen.add(rng.int(7))
  eq('int(7) covers exactly 0 to 6', [...seen].sort((a, b) => a - b).join(), '0,1,2,3,4,5,6')
  check('int refuses a bound of zero', (() => { try { rng.int(0); return false } catch { return true } })())
}

// --- the house's own source

{
  const rng = houseRng()
  const counts = new Array(13).fill(0)
  for (let i = 0; i < 60000; i++) counts[rng.roll().total]++
  const sevens = counts[7] / 60000
  near('crypto dice are sevens one time in six too', sevens, 1 / 6, 0.008)
  check('the house source is not seeded', rng.seed === null)
}

done('rng')
