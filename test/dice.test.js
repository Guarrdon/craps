import { check, done, eq, near } from './harness.js'
import { DIE_SIZE, FACE_NORMALS, TRAY, symmetryTaking, throwDice, throwRaw, topFace } from '../src/lib/dice.js'
import { makeRng } from '../src/lib/rng.js'

// ------------------------------------------------------------ the geometry

check(
  'opposite faces sum to seven, as on every die ever made',
  [[1, 6], [2, 5], [3, 4]].every(([a, b]) =>
    FACE_NORMALS[a].every((v, i) => v === -FACE_NORMALS[b][i]),
  ),
)

{
  // The symmetry that carries one face round to another has to be a symmetry
  // of the cube, or the physics would notice. Every one of the thirty six
  // pairs comes out as a quarter turn, a half turn, or nothing.
  let bad = 0
  for (const from of [1, 2, 3, 4, 5, 6]) {
    for (const to of [1, 2, 3, 4, 5, 6]) {
      const q = symmetryTaking(from, to)
      const angle = 2 * Math.acos(Math.min(1, Math.abs(q[0])))
      const turns = angle / (Math.PI / 2)
      if (Math.abs(turns - Math.round(turns)) > 1e-9) bad++
    }
  }
  eq('every face-to-face twist is a whole number of quarter turns', bad, 0)
}

// -------------------------------------------------------- the throw settles

{
  let landed = 0
  let flat = 0
  let inside = 0
  const N = 400
  for (let i = 0; i < N; i++) {
    const { frames } = throwRaw(makeRng(1000 + i))
    const end = frames.at(-1)
    for (const d of end) {
      // Resting on a face means the up normal is straight up.
      const up = topFace(d.q)
      const n = FACE_NORMALS[up]
      const world = rotate(d.q, n)
      if (world[2] > 0.9999) flat++
      if (Math.abs(d.p[2] - DIE_SIZE) < 0.01) landed++
      if (
        d.p[0] > TRAY.x0 - DIE_SIZE && d.p[0] < TRAY.x1 + DIE_SIZE &&
        d.p[1] > TRAY.y0 - DIE_SIZE && d.p[1] < TRAY.y1 + DIE_SIZE
      ) inside++
    }
  }
  eq(`every die comes to rest on the felt over ${N} throws`, landed, N * 2)
  eq('and square on a face, not propped on a corner', flat, N * 2)
  eq('and inside the tray', inside, N * 2)
}

{
  // Most throws settle on their own. The rest are the ones that end up rocking
  // a hundredth of a unit between two corners for ever, which a solver does
  // and dice do not, and which get put down at the cap. If this ever climbs it
  // means the physics has stopped converging.
  let forced = 0
  const N = 400
  for (let i = 0; i < N; i++) {
    const { frames } = throwRaw(makeRng(1000 + i))
    // A throw that ran to the four-second cap is one that had to be put down.
    if (frames.length >= 240) forced++
  }
  check('nearly every throw settles by itself', forced / N < 0.06, `${((forced / N) * 100).toFixed(1)}% put down at the cap`)
}

{
  const { frames } = throwRaw(makeRng(7))
  check('a throw takes a believable length of time', frames.length > 25 && frames.length < 240, `${frames.length} frames`)
  check('and the dice move about while it happens', spread(frames) > 200, `${spread(frames).toFixed(0)} units travelled`)
}

// ------------------------------------------------------ the whole point
//
// The claim: the dice land on the number that was drawn, and the throw is the
// one the physics produced rather than a correction applied to it.

{
  let wrong = 0
  const N = 10000
  const rng = makeRng(2026)
  for (let i = 0; i < N; i++) {
    const want = [rng.int(6) + 1, rng.int(6) + 1]
    const { result } = throwDice(makeRng(50000 + i), want)
    if (result.a !== want[0] || result.b !== want[1]) wrong++
  }
  eq(`the dice land on what was drawn, ${N.toLocaleString()} times out of ${N.toLocaleString()}`, wrong, 0)
}

{
  /*
   * The twist is free.
   *
   * A twisted die and an untwisted one are the same throw: the cube's
   * world-space shape is identical at every instant, so mathematically they
   * trace the same path. Floating point costs a few decimal places - the
   * corners come out of the rotation in a different order - and a bouncing
   * cube amplifies that, so the two eventually part company. What must remain
   * true is that they start together and stay together through the flight,
   * which is what says the twist is a relabelling and not a nudge.
   */
  let apart = 0
  let checked = 0
  for (let i = 0; i < 200; i++) {
    const raw = throwRaw(makeRng(3000 + i))
    const twisted = throwDice(makeRng(3000 + i), [
      (raw.result.a % 6) + 1, // deliberately not what it landed on
      ((raw.result.b + 2) % 6) + 1,
    ])
    // The first twenty frames are the throw itself - through the air, off the
    // back wall, first bounce. If a nudge had been applied it would show here.
    for (let f = 0; f < Math.min(20, raw.frames.length, twisted.frames.length); f++) {
      for (let d = 0; d < 2; d++) {
        checked++
        const gap = Math.hypot(
          raw.frames[f][d].p[0] - twisted.frames[f][d].p[0],
          raw.frames[f][d].p[1] - twisted.frames[f][d].p[1],
          raw.frames[f][d].p[2] - twisted.frames[f][d].p[2],
        )
        if (gap > 1e-6) apart++
      }
    }
  }
  eq(`the twisted throw is the same throw through the flight (${checked} samples)`, apart, 0)
}

{
  // Two passes is the usual cost: throw, look, twist, throw. The loop going
  // round more than that means the arithmetic drifted enough to change a
  // face, which should be rare enough not to matter.
  const rng = makeRng(818)
  let passes = 0
  const N = 600
  for (let i = 0; i < N; i++) {
    passes += throwDice(makeRng(9000 + i), [rng.int(6) + 1, rng.int(6) + 1]).attempts
  }
  check('it takes about two passes to land a chosen number', passes / N < 2.2, `${(passes / N).toFixed(3)} passes`)
}

// ------------------------------------------------------------- determinism

{
  const a = throwDice(makeRng(99), [3, 4])
  const b = throwDice(makeRng(99), [3, 4])
  eq('the same seed throws the same throw', JSON.stringify(a.frames), JSON.stringify(b.frames))
  const c = throwDice(makeRng(100), [3, 4])
  check('a different seed throws a different one', JSON.stringify(a.frames) !== JSON.stringify(c.frames))
  check('but lands on the same number, because that came from elsewhere',
    c.result.a === 3 && c.result.b === 4)
}

// ----------------------------------------------------------- and it is fair
//
// The distribution comes from the draw, not from the physics, so this is not
// really testing the dice - it is testing that nothing in the pipeline between
// the draw and the felt quietly loses a number.

{
  const rng = makeRng(555)
  const counts = new Array(13).fill(0)
  const N = 12000
  for (let i = 0; i < N; i++) {
    const want = [rng.int(6) + 1, rng.int(6) + 1]
    const { result } = throwDice(makeRng(i), want)
    counts[result.a + result.b]++
  }
  const ways = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }
  let chi = 0
  for (const [total, w] of Object.entries(ways)) {
    const expected = (N * w) / 36
    chi += (counts[total] - expected) ** 2 / expected
  }
  check('what lands on the felt is what was drawn', chi < 29.6, `chi-square ${chi.toFixed(2)}`)
  near('and sevens still come up one time in six', counts[7] / N, 1 / 6, 0.012)
}

function rotate(q, v) {
  const [w, x, y, z] = q
  const [a, b, c] = v
  const tx = 2 * (y * c - z * b)
  const ty = 2 * (z * a - x * c)
  const tz = 2 * (x * b - y * a)
  return [a + w * tx + (y * tz - z * ty), b + w * ty + (z * tx - x * tz), c + w * tz + (x * ty - y * tx)]
}

function spread(frames) {
  let total = 0
  for (let i = 1; i < frames.length; i++) {
    for (let d = 0; d < 2; d++) {
      total += Math.hypot(
        frames[i][d].p[0] - frames[i - 1][d].p[0],
        frames[i][d].p[1] - frames[i - 1][d].p[1],
      )
    }
  }
  return total / 2
}

// --------------------------------------------- a throw that will not converge

/*
 * Out of attempts, the dice still land on what was drawn.
 *
 * The alternative is an error, and an error mid-throw is a roll that gets drawn
 * again - which would make the hard-to-land results rarer than one in thirty
 * six. One attempt is not enough for most results, so this forces the fallback
 * and checks it lands exactly where it was told to, on the frame shown last.
 */
{
  let forced = 0
  let wrong = 0
  for (let i = 0; i < 360; i++) {
    const want = [(i % 6) + 1, (Math.floor(i / 6) % 6) + 1]
    const t = throwDice(makeRng(9000 + i), want, { tries: 1 })
    if (t.forced) forced++
    const last = t.frames[t.frames.length - 1]
    if (t.result.a !== want[0] || t.result.b !== want[1]) wrong++
    if (topFace(last[0].q) !== want[0] || topFace(last[1].q) !== want[1]) wrong++
  }
  check('one attempt is not enough for most throws, so the fallback is exercised', forced > 200, `${forced} of 360`)
  eq('and every one of them still shows and pays what was drawn', wrong, 0)
}

done('dice')
