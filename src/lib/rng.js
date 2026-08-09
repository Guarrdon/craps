/*
 * Randomness.
 *
 * Two sources, deliberately kept apart:
 *
 *   makeRng(seed)  a seeded PRNG. Deterministic, so a session can be replayed
 *                  exactly - which is what the tests and the simulator need,
 *                  and what the dice throw needs to be reproducible frame for
 *                  frame.
 *
 *   houseRng()     crypto.getRandomValues. This is what decides real dice, and
 *                  it is the only thing that does. Nothing about how the dice
 *                  tumble on screen may influence what they land on.
 *
 * Both go through the same rejection-sampled integer draw, so neither is
 * biased by the modulo that a naive `% 6` would introduce.
 */

// mulberry32. Small, fast, and good enough for everything that is not the
// dice - and for the dice it is only used to shape the throw, never its
// outcome. 32 bits of state, so a seed reproduces a session exactly.
export function makeRng(seed = 1) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return rngFrom(next, seed)
}

// The house's own source. Not seedable and not reproducible, which is the
// point.
export function houseRng() {
  const buf = new Uint32Array(1)
  const next = () => {
    crypto.getRandomValues(buf)
    return buf[0] / 4294967296
  }
  return rngFrom(next, null)
}

function rngFrom(next, seed) {
  /*
   * Uniform on [0, n). Rejection sampling rather than `Math.floor(next() * n)`
   * squared away with a modulo: 2^32 is not divisible by 6, so the naive form
   * makes two of the six faces very slightly more likely. It is a bias of
   * about one part in 700 million and nobody would ever see it - but the whole
   * claim this game makes about its dice is that they are fair, and a claim
   * with an asterisk is not worth making.
   */
  const int = (n) => {
    if (n <= 0) throw new Error(`int(${n}): need a positive bound`)
    const limit = Math.floor(4294967296 / n) * n
    for (;;) {
      const draw = Math.floor(next() * 4294967296)
      if (draw < limit) return draw % n
    }
  }

  return {
    seed,
    next,
    int,
    // A single die, 1 to 6.
    die: () => int(6) + 1,
    // A throw. Both dice are drawn independently, so all 36 ordered outcomes
    // are equally likely and the totals come out 1-2-3-4-5-6-5-4-3-2-1 on
    // their own rather than from a table.
    roll: () => {
      const a = int(6) + 1
      const b = int(6) + 1
      return { a, b, total: a + b }
    },
    pick: (list) => list[int(list.length)],
  }
}

// A throw as a plain value, so tests and the simulator can hand one in
// directly instead of steering an RNG toward it.
export const roll = (a, b) => ({ a, b, total: a + b })
