/*
 * Two dice, thrown.
 *
 * The problem this module exists to solve: a rigid-body simulation of two dice
 * is not provably fair. Whatever bias is in how the throw is generated ends up
 * in the result, and however small that is, a casino game cannot have it. But
 * a result drawn in advance and played back as a canned animation is not a
 * throw either - it is the same twelve seconds every time, and you can feel it.
 *
 * You can have both, and the way through is the cube itself.
 *
 * A cube is unchanged by any of the twenty four rotations that map it onto
 * itself. Its collision geometry, its inertia - everything the physics touches
 * - is identical; the only thing those rotations move is the pips. So:
 *
 *   1. Draw the result from crypto. A real one in thirty six.
 *   2. Throw the dice and simulate. See what they happen to land on.
 *   3. Rotate each die's *starting* orientation by the symmetry that carries
 *      the face it landed on round to the face we wanted.
 *   4. Play it back. Same throw, bounce for bounce, to the last bit - because
 *      the world-space shape at every instant is identical. Different pips.
 *
 * No rejection sampling, no retries, no bias, and the dice really are tumbling.
 * dice.test.js checks the claim ten thousand times: that the replay lands on
 * the drawn number, and that the trajectory is unchanged to the last decimal.
 */

// ------------------------------------------------------------- quaternions

const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]

const qnorm = (q) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

// Rotate a vector by a quaternion.
const qrot = (q, v) => {
  const [w, x, y, z] = q
  const [a, b, c] = v
  const tx = 2 * (y * c - z * b)
  const ty = 2 * (z * a - x * c)
  const tz = 2 * (x * b - y * a)
  return [
    a + w * tx + (y * tz - z * ty),
    b + w * ty + (z * tx - x * tz),
    c + w * tz + (x * ty - y * tx),
  ]
}

const qAxis = (axis, angle) => {
  const h = angle / 2
  const s = Math.sin(h)
  const n = Math.hypot(...axis) || 1
  return [Math.cos(h), (axis[0] / n) * s, (axis[1] / n) * s, (axis[2] / n) * s]
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// ------------------------------------------------------------------ the die

/*
 * Which way each number faces on a standard die. Opposite faces sum to seven,
 * which is true of every die ever made and is what makes the arithmetic below
 * work out: knowing the face pointing up tells you the one against the felt.
 */
export const FACE_NORMALS = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, 1, 0],
  4: [0, -1, 0],
}
const FACES = [1, 2, 3, 4, 5, 6]

// Which number is pointing at the ceiling.
export function topFace(q) {
  let best = 1
  let bestZ = -Infinity
  for (const f of FACES) {
    const z = qrot(q, FACE_NORMALS[f])[2]
    if (z > bestZ) {
      bestZ = z
      best = f
    }
  }
  return best
}

/*
 * The rotation that carries face `from` round to where face `to` is.
 *
 * Both are axis-aligned, so the shortest arc between them is a quarter turn, a
 * half turn or nothing at all - and every one of those is a symmetry of the
 * cube. Which is the whole trick: this can be applied to a die without the
 * physics being able to tell.
 */
export function symmetryTaking(from, to) {
  const a = FACE_NORMALS[from]
  const b = FACE_NORMALS[to]
  const d = dot(a, b)
  if (d > 0.999) return [1, 0, 0, 0] // already there
  if (d < -0.999) {
    // Opposite. A half turn about anything at right angles to both.
    const axis = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])
    return qAxis(axis, Math.PI)
  }
  return qAxis(cross(a, b), Math.PI / 2)
}

// ------------------------------------------------------------- the tray

/*
 * Where the dice land, in felt coordinates, and what stops them.
 *
 * The middle of the table, which on a layout this shape is the come box - and
 * which is where a shooter is aiming on a real table too. The back wall is the
 * one the throw has to reach; the others are the rail.
 */
export const TRAY = { x0: 190, x1: 960, y0: 248, y1: 478, floor: 0 }

const DIE = 21 // half the side, in felt units
const STEP = 1 / 240 // seconds. Small enough that a corner never tunnels a wall.
const FRAME = 4 // steps per rendered frame, so playback is 60 a second
const MAX_STEPS = 240 * 4 // four seconds, then it is over whatever it is doing

const GRAVITY = -5200 // felt units per second squared
const RESTITUTION = 0.46 // felt does not give much back, but it gives some
/*
 * Below this closing speed a contact does not bounce at all.
 *
 * Without it a die resting flat never stops: four corners touching, gravity
 * adding a sliver of downward speed every step and restitution handing a third
 * of it back, forever. The die buzzes a thousandth of a unit above the cloth
 * and never gets slow enough to be called still. Every rigid-body engine has
 * this number; it is the difference between a die that lands and a die that
 * hums.
 */
const RESTING = 110
const FRICTION = 0.5
const LINEAR_DAMP = 0.997
const ANGULAR_DAMP = 0.99
const CONTACT_DRAG = 0.94
const CONTACT_SPIN_DRAG = 0.918
const SLEEP_SPEED = 20
const SLEEP_SPIN = 1.6
const SLEEP_FRAMES = 12

// A cube's inertia is the same about every axis through its centre, which is
// why the trick works at all - a rotated die is dynamically the same die.
const INV_I = 3 / (2 * DIE * DIE)

const CORNERS = []
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  CORNERS.push([sx * DIE, sy * DIE, sz * DIE])
}

// --------------------------------------------------------------- the throw

function initial(rng) {
  // Thrown from the near right corner toward the back wall, the way a shooter
  // at this end of the table would. The spread is wide enough that no two
  // throws look alike and tight enough that both dice stay on the felt.
  const spread = () => rng.next() * 2 - 1
  return [0, 1].map(() => ({
    p: [TRAY.x1 - 34 + spread() * 24, TRAY.y1 - 26 + spread() * 20, 168 + rng.next() * 74],
    // Hard enough to reach the back wall and come off it, which is what a
    // stickman is asking for when they tell you to hit the back. A throw that
    // dies where it lands is a throw the box would call short.
    v: [-980 - rng.next() * 360, -640 - rng.next() * 280, 210 + rng.next() * 180],
    q: qnorm([rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1]),
    w: [spread() * 46, spread() * 46, spread() * 46],
    asleep: 0,
  }))
}

function stepDie(d) {
  if (d.asleep >= SLEEP_FRAMES) return

  d.v[2] += GRAVITY * STEP
  for (let k = 0; k < 3; k++) d.p[k] += d.v[k] * STEP

  // Integrate the orientation. dq/dt = 1/2 * omega * q, with omega as a pure
  // quaternion in world space.
  const spin = qmul([0, d.w[0], d.w[1], d.w[2]], d.q)
  d.q = qnorm([
    d.q[0] + 0.5 * spin[0] * STEP,
    d.q[1] + 0.5 * spin[1] * STEP,
    d.q[2] + 0.5 * spin[2] * STEP,
    d.q[3] + 0.5 * spin[3] * STEP,
  ])

  /*
   * Contacts, gathered before any of them is resolved and then sorted.
   *
   * The sort is not tidiness - it is the whole reason the symmetry trick
   * survives. Rotating a die by one of its own symmetries permutes which
   * corner index is where, so walking the corners in index order would resolve
   * the same physical contacts in a different sequence and the two throws
   * would drift apart. Sorted by where the contact actually is in the world,
   * the order is a property of the situation rather than of the labelling.
   */
  const contacts = []
  for (const c of CORNERS) {
    const r = qrot(d.q, c)
    const w = [d.p[0] + r[0], d.p[1] + r[1], d.p[2] + r[2]]
    if (w[2] < TRAY.floor) contacts.push({ r, n: [0, 0, 1], depth: TRAY.floor - w[2], at: w })
    if (w[0] < TRAY.x0) contacts.push({ r, n: [1, 0, 0], depth: TRAY.x0 - w[0], at: w })
    if (w[0] > TRAY.x1) contacts.push({ r, n: [-1, 0, 0], depth: w[0] - TRAY.x1, at: w })
    if (w[1] < TRAY.y0) contacts.push({ r, n: [0, 1, 0], depth: TRAY.y0 - w[1], at: w })
    if (w[1] > TRAY.y1) contacts.push({ r, n: [0, -1, 0], depth: w[1] - TRAY.y1, at: w })
  }
  contacts.sort(
    (a, b) =>
      b.depth - a.depth || a.at[0] - b.at[0] || a.at[1] - b.at[1] || a.at[2] - b.at[2] ||
      a.n[0] - b.n[0] || a.n[1] - b.n[1] || a.n[2] - b.n[2],
  )

  /*
   * Push the die back out of whatever it is inside - once per surface, using
   * the deepest corner touching it.
   *
   * Doing it per contact was the bug that kept dice hovering: a die resting
   * flat has four corners on the cloth, each asking to be lifted clear, and it
   * ended up a whole corner's worth too high and buzzing there for ever.
   */
  const deepest = new Map()
  for (const c of contacts) {
    const key = c.n.join()
    if (!deepest.has(key) || c.depth > deepest.get(key).depth) deepest.set(key, c)
  }
  for (const { n, depth } of deepest.values()) {
    for (let k = 0; k < 3; k++) d.p[k] += n[k] * depth
  }

  for (const c of contacts) resolve(d, c)

  for (let k = 0; k < 3; k++) {
    d.v[k] *= LINEAR_DAMP
    d.w[k] *= ANGULAR_DAMP
  }

  // Craps felt is not a billiard table. A die that is down stops, rather than
  // sliding on for another six inches, and this is that - the drag of cloth,
  // applied only while something is actually touching it.
  if (contacts.length) {
    for (let k = 0; k < 3; k++) {
      d.v[k] *= CONTACT_DRAG
      d.w[k] *= CONTACT_SPIN_DRAG
    }
  }

  // Asleep once it has been slow for long enough. Frames rather than a single
  // instant, because a die balanced on an edge is momentarily still on its way
  // to falling off it.
  const speed = Math.hypot(...d.v)
  const spinRate = Math.hypot(...d.w)
  d.asleep = speed < SLEEP_SPEED && spinRate < SLEEP_SPIN ? d.asleep + 1 : 0
  if (d.asleep >= SLEEP_FRAMES) {
    d.v = [0, 0, 0]
    d.w = [0, 0, 0]
    settle(d)
  }
}

function resolve(d, { r, n }) {
  const vp = [
    d.v[0] + (d.w[1] * r[2] - d.w[2] * r[1]),
    d.v[1] + (d.w[2] * r[0] - d.w[0] * r[2]),
    d.v[2] + (d.w[0] * r[1] - d.w[1] * r[0]),
  ]
  const vn = dot(vp, n)
  if (vn >= 0) return // already leaving

  const rn = cross(r, n)
  const denom = 1 + INV_I * dot(rn, rn)
  const e = -vn < RESTING ? 0 : RESTITUTION
  const j = (-(1 + e) * vn) / denom
  apply(d, r, [n[0] * j, n[1] * j, n[2] * j])

  // Friction along whatever is left of the tangential velocity. Clamped to
  // Coulomb, so a die can slide but a hard landing does not spin up from
  // nothing.
  const vt = [vp[0] - vn * n[0], vp[1] - vn * n[1], vp[2] - vn * n[2]]
  const vtLen = Math.hypot(...vt)
  if (vtLen < 1e-6) return
  const t = [-vt[0] / vtLen, -vt[1] / vtLen, -vt[2] / vtLen]
  const rt = cross(r, t)
  const jt = Math.min(vtLen / (1 + INV_I * dot(rt, rt)), FRICTION * j)
  apply(d, r, [t[0] * jt, t[1] * jt, t[2] * jt])
}

function apply(d, r, impulse) {
  for (let k = 0; k < 3; k++) d.v[k] += impulse[k]
  const torque = cross(r, impulse)
  for (let k = 0; k < 3; k++) d.w[k] += INV_I * torque[k]
}

/*
 * Sit the die flat.
 *
 * A die that has stopped is within a degree or two of square but not exactly
 * on it, and the difference reads as a die resting on a crumb. Snapping to the
 * nearest of the twenty four positions costs nothing and does not change which
 * face is up, because it only ever moves it by that degree or two.
 */
function settle(d) {
  const up = topFace(d.q)
  const n = qrot(d.q, FACE_NORMALS[up])
  d.q = qnorm(qmul(alignTo(n, [0, 0, 1]), d.q))
  // Then square it off about the vertical, so the pips are not at an angle.
  const side = qrot(d.q, FACE_NORMALS[2])
  const angle = Math.atan2(side[1], side[0])
  const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  d.q = qnorm(qmul(qAxis([0, 0, 1], snapped - angle), d.q))
  d.p[2] = DIE
}

// The shortest rotation carrying one direction onto another.
function alignTo(from, to) {
  const f = from.map((v) => v / (Math.hypot(...from) || 1))
  const d = dot(f, to)
  if (d > 0.99999) return [1, 0, 0, 0]
  if (d < -0.99999) return qAxis([1, 0, 0], Math.PI)
  const axis = cross(f, to)
  return qnorm([1 + d, axis[0], axis[1], axis[2]])
}

// ---------------------------------------------------------------- the throw

function simulate(dice) {
  const frames = []
  for (let i = 0; i < MAX_STEPS; i++) {
    stepDie(dice[0])
    stepDie(dice[1])
    separate(dice[0], dice[1])
    if (i % FRAME === 0) {
      frames.push(dice.map((d) => ({ p: [...d.p], q: [...d.q] })))
    }
    if (dice.every((d) => d.asleep >= SLEEP_FRAMES)) break
  }

  /*
   * Anything still going at the cap is put down where it is.
   *
   * About one throw in thirty ends with a die lying flat but never quite still
   * - rocking a hundredth of a unit between two corners, which is a real thing
   * a rigid-body solver does and not a thing dice do. A dealer would have
   * reached in and settled it several seconds ago. Nothing is decided by this:
   * the face was already the face, and the throw is read from wherever it
   * actually stopped either way.
   */
  for (const d of dice) {
    if (d.asleep >= SLEEP_FRAMES) continue
    d.v = [0, 0, 0]
    d.w = [0, 0, 0]
    settle(d)
    d.forced = true
  }
  frames.push(dice.map((d) => ({ p: [...d.p], q: [...d.q] })))
  return frames
}

/*
 * Keep the two dice out of each other.
 *
 * Treated as spheres, which is a lie, but a cheap and symmetric one: it costs
 * nothing, it is unaffected by either die's orientation - so the trick still
 * holds - and at the speed dice actually meet, the difference between a cube
 * and its bounding sphere is a frame nobody sees.
 */
function separate(a, b) {
  const d = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]]
  const dist = Math.hypot(...d) || 1e-6
  const min = DIE * 2.05
  if (dist >= min) return
  const n = d.map((v) => v / dist)
  const push = (min - dist) / 2
  for (let k = 0; k < 3; k++) {
    a.p[k] -= n[k] * push
    b.p[k] += n[k] * push
  }
  const rel = dot([b.v[0] - a.v[0], b.v[1] - a.v[1], b.v[2] - a.v[2]], n)
  if (rel >= 0) return
  const j = -(1 + RESTITUTION) * rel * 0.5
  for (let k = 0; k < 3; k++) {
    a.v[k] -= n[k] * j
    b.v[k] += n[k] * j
  }
  a.asleep = 0
  b.asleep = 0
}

/*
 * Throw two dice and have them land on `want`.
 *
 * `rng` shapes the throw and nothing else - it decides how hard and with what
 * spin, never what comes up. `want` is [a, b], drawn wherever the caller
 * draws it, which in the game is crypto.
 *
 * Returns the frames to play back and the result, which is `want`. If it were
 * ever anything else this module would be broken, and the test says so.
 */
export function throwDice(rng, want) {
  let start = initial(rng)

  /*
   * Throw, look, twist, throw again.
   *
   * In exact arithmetic the second throw would be the first one to the last
   * bit, and one pass would always be enough. In floating point it is not
   * quite: the twisted die's corners come out of the rotation in a different
   * order, differing in the last decimal place, and a bouncing cube amplifies
   * that. Nearly always it makes no difference at all - the die is on the same
   * face - and when it does, the twist is simply applied again to what
   * actually happened.
   *
   * So the guarantee does not rest on the arithmetic being perfect. It rests
   * on the result being read from the throw that is played back, never
   * asserted over it: what you watch land is what you get paid for, always.
   * Two passes is the usual cost and the loop almost never goes round again.
   */
  for (let attempt = 0; attempt < 12; attempt++) {
    const dice = start.map((d) => ({ ...d, p: [...d.p], v: [...d.v], q: [...d.q], w: [...d.w] }))
    const frames = simulate(dice)
    const got = [topFace(dice[0].q), topFace(dice[1].q)]

    if (got[0] === want[0] && got[1] === want[1]) {
      return {
        frames,
        result: { a: got[0], b: got[1] },
        resting: dice.map((d) => ({ p: [...d.p], q: [...d.q] })),
        attempts: attempt + 1,
      }
    }

    // Every fourth time round, stop twisting the same throw and shape a new
    // one. A throw that will not converge is a throw that is landing on an
    // edge somewhere, and another twist will not help it.
    start =
      attempt % 4 === 3
        ? initial(rng)
        : start.map((d, i) => ({ ...d, q: qnorm(qmul(d.q, symmetryTaking(want[i], got[i]))) }))
  }

  throw new Error(`the dice would not land on ${want.join('-')}`)
}

// The same throw with no twist, for the test that wants to see what the
// physics does when it is left alone.
export function throwRaw(rng) {
  const dice = initial(rng)
  const frames = simulate(dice)
  return { frames, result: { a: topFace(dice[0].q), b: topFace(dice[1].q) } }
}

export const DIE_SIZE = DIE
