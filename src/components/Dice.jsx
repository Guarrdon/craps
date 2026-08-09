/*
 * The dice, on the table.
 *
 * Six divs a cube, turned by the quaternion the physics produced. No WebGL and
 * no library: two dice is not enough geometry to be worth a renderer, and CSS
 * transforms give real 3D rotation with pips that stay sharp at any size.
 *
 * The felt is drawn from directly above, so a die seen the same way would show
 * one flat square and no sense of being a solid at all. Each die is therefore
 * tipped a few degrees towards the viewer - a camera angle, applied after the
 * die's own rotation, so it changes what you see and not where anything is.
 */

import { useEffect, useRef, useState } from 'react'
import { DIE_SIZE } from '../lib/dice.js'
import { FELT } from '../lib/layout.js'

// How much a die's height off the cloth lifts it up the screen. Measured from
// where it rests, so a die on the felt sits exactly where the physics put it.
const LIFT = 0.5
const TILT = 15 // degrees towards the viewer

// Pips, on a three by three grid. Every die ever made puts them here.
const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

// Which number sits on which side, matching FACE_NORMALS in dice.js. Opposite
// faces sum to seven; the CSS below has to agree with the physics or the dice
// would land on one number and show another.
const SIDES = [
  { face: 1, turn: '' }, //                       +z, towards the viewer
  { face: 6, turn: 'rotateY(180deg)' }, //        -z
  { face: 2, turn: 'rotateY(90deg)' }, //         +x
  { face: 5, turn: 'rotateY(-90deg)' }, //        -x
  { face: 3, turn: 'rotateX(-90deg)' }, //        +y, which is down the screen
  { face: 4, turn: 'rotateX(90deg)' }, //         -y
]

// A quaternion as a CSS matrix3d. Column major, which is the order CSS wants
// its sixteen numbers in.
function matrix3d([w, x, y, z]) {
  const c1 = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)]
  const c2 = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]
  const c3 = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  const n = (v) => v.toFixed(6)
  return `matrix3d(${n(c1[0])},${n(c1[1])},${n(c1[2])},0,${n(c2[0])},${n(c2[1])},${n(c2[2])},0,${n(c3[0])},${n(c3[1])},${n(c3[2])},0,0,0,0,1)`
}

const pct = (v, of) => `${(v / of) * 100}%`

/*
 * How wide a die is, as a share of the table.
 *
 * In container query units rather than a percentage, because a cube needs its
 * faces pushed half a side towards the viewer and translateZ() will not take a
 * percentage - it silently invalidates the whole transform, which drops all
 * six faces flat on top of each other and leaves a die you can barely see. cqw
 * is a real length, resolves against the felt, and still scales with it.
 */
const SIDE = `${((DIE_SIZE * 2) / FELT.w) * 100}cqw`

function Die({ p, q }) {
  const height = p[2] - DIE_SIZE
  return (
    <>
      {/* The shadow stays on the cloth and grows soft as the die climbs, which
          is most of what tells you it is in the air at all. */}
      <div
        className="thrown-shadow"
        style={{
          left: pct(p[0], FELT.w),
          top: pct(p[1], FELT.h),
          width: pct(DIE_SIZE * 2.1, FELT.w),
          opacity: Math.max(0.08, 0.5 - height / 340),
          transform: `translate(-50%, -50%) scale(${1 + height / 320})`,
        }}
      />
      <div
        className="thrown"
        style={{
          '--side': SIDE,
          left: pct(p[0], FELT.w),
          top: pct(p[1] - height * LIFT, FELT.h),
          transform: `translate(-50%, -50%) rotateX(${-TILT}deg) ${matrix3d(q)}`,
        }}
      >
        {SIDES.map(({ face, turn }) => (
          <div
            key={face}
            className="thrown-face"
            style={{ transform: `${turn} translateZ(calc(var(--side) / 2))`.trim() }}
          >
            {PIPS[face].map(([cx, cy], i) => (
              <span key={i} className="thrown-pip" style={{ left: `${12 + cx * 32}%`, top: `${12 + cy * 32}%` }} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

/*
 * Play a throw back.
 *
 * The whole trajectory is worked out before the first frame is drawn - the
 * physics runs in about four milliseconds - so playback is just walking an
 * array at sixty a second. Nothing is being computed while you watch, which is
 * why the throw never stutters.
 */
export default function Dice({ throwing, resting, onLanded }) {
  const [frame, setFrame] = useState(null)
  const done = useRef(onLanded)
  done.current = onLanded

  useEffect(() => {
    if (!throwing) return undefined
    let raf = 0
    let i = 0
    const tick = () => {
      setFrame(throwing.frames[i])
      if (i >= throwing.frames.length - 1) {
        done.current?.()
        return
      }
      i++
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [throwing])

  // Between throws the dice sit where they came to rest, the way they do on a
  // table until the stickman pushes them back.
  const showing = frame ?? resting
  if (!showing) return null

  return (
    <div className="dice">
      {showing.map((d, i) => (
        <Die key={i} p={d.p} q={d.q} />
      ))}
    </div>
  )
}
