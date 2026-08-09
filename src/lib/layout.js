/*
 * The felt, as coordinates.
 *
 * One end of the table plus the centre, drawn from the burgundy layout in the
 * reference photographs. Everything the player can put a chip on is a SPOT: it
 * carries the shape that gets drawn, the shape that gets clicked - the same
 * shape, which is the point - and the place a chip stack sits when the bet is
 * on.
 *
 * The ids are the ids in bets.js. A spot that names a bet the catalogue does
 * not have fails a test rather than becoming a piece of felt you cannot bet
 * on, and a bet with no spot fails the same test in the other direction.
 *
 * Coordinates are a fixed 1500 x 860 canvas. The whole thing scales as one
 * viewBox, so there is no responsive layout to keep in step - a phone gets the
 * same felt as a desktop, smaller.
 */

import { BETS } from './bets.js'
import { BONUS_PAYTABLES } from './edges.js'

export const FELT = { w: 1500, h: 860 }

// -------------------------------------------------------------- the geometry

// The player's end. The line bands wrap its left and bottom edges, so the
// interior starts inside them.
const IN = { left: 152, right: 975, top: 25, bottom: 722 }

/*
 * The two line bands.
 *
 * Each turns from the side of the table to the bottom, and on the cloth that
 * turn is one smooth curve rather than a mitred corner. Every line involved -
 * the two edges of the pass line, the two edges of the don't pass, and the
 * centreline each is stroked down - is an arc about the same point, which is
 * what keeps them parallel the whole way round. Give the vertical position of
 * a line and its radius follows, so there is one number to get right instead
 * of six.
 */
const K = { x: 153, y: 712 } // the centre every corner is struck about
export const BAND_END = 1040 // where this end stops and the centre begins
const line = (x) => {
  const r = K.x - x
  return `M ${x} 25 L ${x} ${K.y} A ${r} ${r} 0 0 0 ${K.x} ${K.y + r} L ${BAND_END} ${K.y + r}`
}

// Outer edge of the pass line, the line the two bands share, and the inner
// edge of the don't pass. The bands are the gaps between them.
export const BAND_EDGES = [line(17), line(89), line(143)]

// The centreline of each band, stroked at the band's full width. Nothing is
// painted along it - it is the click target, and the place a chip sits.
const band = (x) => line(x)

// The six boxes across the top. Column edges, so a cell is the gap between two.
export const BOX_NUMBERS = [4, 5, 6, 8, 9, 10]
const BOX_X = [305, 417, 528, 640, 752, 863, 975]
const BOX = { strip: 25, numbers: 85, foot: 225 }

const cell = (i) => ({ x: BOX_X[i], w: BOX_X[i + 1] - BOX_X[i] })
const cellMid = (i) => BOX_X[i] + (BOX_X[i + 1] - BOX_X[i]) / 2

// What each box number is called on the felt. Six and Nine are spelled out
// because 6 and 9 are the same glyph upside down, and a dealer reading the
// layout from the other side of the table needs to know which is which.
export const BOX_LABEL = { 4: '4', 5: '5', 6: 'Six', 8: '8', 9: 'Nine', 10: '10' }

// The middle of each box, for the printed number and for the puck.
export const BOX_MID = Object.fromEntries(BOX_NUMBERS.map((n, i) => [n, cellMid(i)]))

// ------------------------------------------------------------------- spots

/*
 * How big a chip is where.
 *
 * The centre of the table is a dense grid of small compartments - seventeen
 * hop circles across four hundred pixels - and a chip sized for the pass line
 * would cover its neighbours. The size is part of the spot rather than
 * something the interface decides, because it depends on the geometry here.
 */
const CHIP_R = { line: 17, odds: 17, field: 17, box: 13, bonus: 12, centre: 12, hardway: 12, hop: 11 }

/*
 * Whether a stack gets its total written beside it.
 *
 * The compartments in the centre are small - a hop circle is 38 across - and a
 * pill with "25" in it would cover the payout printed under it. Those spots go
 * without: the chip colour already says what the bet is, which is what chip
 * colours are for, and the exact number is in the rail. The line, the box and
 * the field have the room, and there the total earns its place.
 */
const LABELLED = new Set(['line', 'odds', 'field', 'box'])

const spots = {}
const spot = (id, shape, chip, extra = {}) => {
  spots[id] = { id, shape, chip, ...extra }
}

// --- the line

spot('pass', { type: 'stroke', d: band(53), width: 72 }, [760, 812], { label: 'PASS LINE' })
spot('dontpass', { type: 'stroke', d: band(116), width: 54 }, [760, 749], { label: "DON'T PASS BAR" })
// Odds have no printed spot on any layout - they sit behind the flat bet, on
// the felt outside the line - so the position is inferred rather than drawn.
spot('pass-odds', null, [672, 812])
spot('dontpass-odds', null, [672, 749])

spot('come', { type: 'rect', x: IN.left, y: 232, w: IN.right - IN.left, h: 253, rx: 10 }, [560, 430], {
  label: 'COME',
})
spot('dontcome', { type: 'rect', x: IN.left, y: BOX.strip, w: 148, h: BOX.foot - BOX.strip, rx: 8 }, [226, 170], {
  label: "DON'T COME BAR",
})

// --- the box

/*
 * Each box, and the four bets that live in it.
 *
 * The number is printed in the upper half and the chips go in the lower, which
 * is what stops a $42 six from sitting on top of the word Six. Come bets to
 * the left, place and buy to the right - the same left-to-right convention a
 * real box uses to keep one player's come bet apart from another's place bet.
 * A buy sits above its place position, the way it sits under a BUY button.
 */
BOX_NUMBERS.forEach((n, i) => {
  const { x, w } = cell(i)
  const mid = cellMid(i)

  spot(`place-${n}`, { type: 'rect', x, y: BOX.numbers, w, h: BOX.foot - BOX.numbers }, [mid + 30, 204], {
    label: BOX_LABEL[n],
    number: n,
  })
  spot(`buy-${n}`, null, [mid + 30, 174], { number: n, labelAbove: true })
  spot(`come-${n}`, null, [mid - 30, 204], { number: n })
  spot(`come-odds-${n}`, null, [mid - 30, 174], { number: n, labelAbove: true })

  // The strip above the numbers. Don't come bets and lays sit up here, out of
  // the way of the box, which is exactly what it is for - and the puck sits
  // between them when this number is the point.
  spot(`lay-${n}`, { type: 'rect', x, y: BOX.strip, w, h: BOX.numbers - BOX.strip }, [mid - 38, 56], {
    number: n,
  })
  spot(`dontcome-${n}`, null, [mid + 38, 56], { number: n })
  spot(`dontcome-odds-${n}`, null, [mid + 38, 74], { number: n })
})

// --- the field
//
// Drawn as the reference draws it: a band with its top edge bowed up into the
// come box, and the two doubling numbers ringed at the ends.

const FIELD = { y: 492, h: 224 }
spot(
  'field',
  {
    type: 'path',
    d: `M ${IN.left} ${FIELD.y + 40}
        Q ${(IN.left + IN.right) / 2} ${FIELD.y - 34} ${IN.right} ${FIELD.y + 40}
        L ${IN.right} ${FIELD.y + FIELD.h}
        L ${IN.left} ${FIELD.y + FIELD.h} Z`,
  },
  // Low and left, clear of the numbers printed across the middle and of the
  // ringed two that pays double.
  [352, 682],
  { label: 'FIELD' },
)

// --- C and E
//
// Six pairs, dotted down the rail between the come box and the centre, so
// whichever position a player is standing in there is one within the
// stickman's reach. They are all the same two bets.
export const CE_PAIRS = Array.from({ length: 6 }, (_, i) => ({
  y: 250 + i * 78,
  e: 998,
  c: 1030,
}))
spot(
  'ce',
  { type: 'group', shapes: CE_PAIRS.flatMap(({ y, e, c }) => [
    { type: 'circle', cx: e, cy: y, r: 15 },
    { type: 'circle', cx: c, cy: y, r: 15 },
  ]) },
  [1014, 250 + 2 * 78],
  {
    label: 'C & E',
    // The chip straddles the two circles, the way a dealer sets it down before
    // splitting it - so the chip point is the one place on this spot that is
    // not on the spot. Pointing is done at the E instead.
    probe: [998, 250 + 2 * 78],
  },
)

// -------------------------------------------------------------- the centre

const C = { left: 1060, right: 1470 }
const cx = (C.left + C.right) / 2

// --- the bonus row

/*
 * One tracker, read by all three bets.
 *
 * The obvious drawing gives each bet its own row of markers, which means the
 * five small numbers appear twice and the whole block eats the top of the
 * centre. Tables do not do that: there are two rows, the low five and the high
 * five, and Little reads the top row, Big reads the bottom, and Boom or Bust
 * needs both. One marker per number, lit once, and the space that saves is
 * what lets the markers be big enough to read across a table.
 */
export const TRACKER_ROWS = [
  { key: 'low', numbers: [2, 3, 4, 5, 6], cy: 52 },
  { key: 'high', numbers: [8, 9, 10, 11, 12], cy: 104 },
]
const TRACK_X0 = 1090
const TRACK_STEP = 70

export const TRACKERS = TRACKER_ROWS.flatMap(({ numbers, cy }) =>
  numbers.map((n, i) => ({ number: n, cx: TRACK_X0 + TRACK_STEP * (i + 0.5), cy, r: 24 })),
)

// Which markers a bet is watching, so a spot can be shown as close to home as
// the tracker actually is.
export const BONUS_WATCHES = {
  little: [2, 3, 4, 5, 6],
  big: [8, 9, 10, 11, 12],
  all: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
}

// The printed price is not fixed here - the bonus row runs whichever pay
// table this table runs, and the felt has to print that one.
export const BONUS_BOXES = [
  { id: 'little', x: 1062, w: 130, label: 'LITTLE ONES', note: '(2,3,4,5,6)' },
  { id: 'all', x: 1200, w: 130, label: 'BOOM OR BUST', note: 'all ten' },
  { id: 'big', x: 1338, w: 130, label: 'BIG ONES', note: '(8,9,10,11,12)' },
]

export const bonusPrice = (id, paytable = '30') => `${BONUS_PAYTABLES[paytable].pays[id]} to 1`

for (const t of BONUS_BOXES) {
  spot(t.id, { type: 'rect', x: t.x, y: 128, w: t.w, h: 70, rx: 4 }, [t.x + t.w / 2, 182], {
    label: t.label,
    note: t.note,
    pays: t.pays,
  })
}

// --- the hop grid
//
// The order is the order on the felt, which is not sorted and is not
// arbitrary: the doubles are spread along the top row around the HOP legend,
// and the easy ways fill the row beneath.

const HOP_ROWS = [
  [[2, 2], [3, 2], [4, 2], [3, 3], null, [4, 4], [5, 3], [5, 4], [5, 5]],
  [[3, 1], [4, 1], [5, 1], [6, 1], [5, 2], [4, 3], [6, 2], [6, 3], [6, 4]],
]
const HOP_X0 = 1058
const HOP_STEP = 46
const HOP_Y0 = 240

export const HOPS_ON_FELT = []
HOP_ROWS.forEach((row, r) => {
  row.forEach((face, i) => {
    if (!face) return
    const [hi, lo] = face
    const id = `hop-${Math.min(hi, lo)}-${Math.max(hi, lo)}`
    const at = { cx: HOP_X0 + HOP_STEP * (i + 0.5), cy: HOP_Y0 + r * 58, r: 19 }
    HOPS_ON_FELT.push({ id, face, ...at })
    spot(id, { type: 'circle', ...at }, [at.cx, at.cy], { face, label: `${hi}-${lo}` })
  })
})
export const HOP_LEGEND = { x: HOP_X0 + HOP_STEP * 4.5, y: HOP_Y0 }

// --- the proposition box
//
// One outline with a peaked top, the way the reference draws it, and the bets
// sitting in its compartments. The roof is the Seven.

export const PROP_ROOF = `M ${C.left} 395 L ${C.left} 372 L 1140 332 L 1390 332 L ${C.right} 372 L ${C.right} 395 Z`
export const PROP_BODY = { x: C.left, y: 395, w: C.right - C.left, h: 380 }

spot('any7', { type: 'path', d: PROP_ROOF }, [cx, 381], { label: 'SEVEN', pays: '4 TO 1' })

// The hardways, arranged as the reference arranges them: the two nines to the
// left, the two sevens to the right.
const HARD = [
  { n: 6, col: 0, row: 0, pays: '9 TO 1' },
  { n: 10, col: 1, row: 0, pays: '7 TO 1' },
  { n: 8, col: 0, row: 1, pays: '9 TO 1' },
  { n: 4, col: 1, row: 1, pays: '7 TO 1' },
]
export const HARDWAYS = HARD.map((h) => ({
  ...h,
  x: 1062 + h.col * 204,
  y: 400 + h.row * 80,
  w: 202,
  h: 78,
}))
// The chips go in the upper right of each compartment, clear of the dice
// printed on the left and the price printed along the bottom.
for (const h of HARDWAYS) {
  spot(`hard-${h.n}`, { type: 'rect', x: h.x, y: h.y, w: h.w, h: h.h }, [h.x + h.w * 0.73, h.y + 26], {
    label: `HARD ${h.n}`,
    pays: h.pays,
    face: [h.n / 2, h.n / 2],
  })
}

// The four numbers that have their own spot, around the horn that combines
// them. Aces and boxcars above, ace-deuce and yo below.
const HORN_ROWS = [
  { id: 'aces', side: 'left', row: 0, face: [1, 1], pays: '30 TO 1' },
  { id: 'boxcars', side: 'right', row: 0, face: [6, 6], pays: '30 TO 1' },
  { id: 'acedeuce', side: 'left', row: 1, face: [1, 2], pays: '15 TO 1' },
  { id: 'yo', side: 'right', row: 1, face: [5, 6], pays: '15 TO 1' },
]
export const HORN_SPOTS = HORN_ROWS.map((h) => ({
  ...h,
  x: h.side === 'left' ? 1062 : 1330,
  y: 565 + h.row * 68,
  w: 138,
  h: 66,
}))
for (const h of HORN_SPOTS) {
  spot(h.id, { type: 'rect', x: h.x, y: h.y, w: h.w, h: h.h }, [h.x + h.w - 26, h.y + 20], {
    pays: h.pays,
    face: h.face,
  })
}

export const HORN_BOX = { x: 1205, y: 565, w: 120, h: 134 }
spot('horn', { type: 'rect', ...HORN_BOX, rx: 3 }, [1265, 678], { label: 'HORN BET' })

export const ANY_CRAPS = { x: 1062, y: 705, w: 406, h: 70 }
spot('anycraps', { type: 'rect', ...ANY_CRAPS }, [cx, 726], { label: 'ANY CRAPS', pays: '7 TO 1' })

// ---------------------------------------------------------------- the puck
//
// The ON/OFF button sits on the box number that is the point, and off to the
// side of the layout when the table is coming out.
export const PUCK = {
  r: 20,
  off: [232, 790],
  on: Object.fromEntries(BOX_NUMBERS.map((n, i) => [n, [cellMid(i), 56]])),
}

export const SPOTS = spots
export const SPOT_IDS = Object.keys(spots)

// Every spot that is actually drawn, in the order it should be painted.
export const DRAWN = SPOT_IDS.filter((id) => spots[id].shape)

/*
 * Where a chip goes for a given bet.
 *
 * Most spots have one. The ones that share a printed area - a place bet, a
 * come bet and a buy all sit in the same number box - are separated by where
 * in that box the dealer stacks them, which is what the differing chip points
 * above encode. It is the same convention a real box uses, and it is the only
 * way to tell three bets on the six apart at a glance.
 */
export const chipAt = (id) => spots[id]?.chip ?? null

// How a chip stack should be drawn at this spot: how big, whether its total is
// written out, and which side of the pile that total goes.
export const chipStyleAt = (id) => ({
  r: CHIP_R[BETS[id]?.group] ?? 13,
  total: LABELLED.has(BETS[id]?.group),
  // Bets stacked in the upper half of a number box - odds heeled on a come
  // bet, a buy sitting over a place - label upwards, so the total does not
  // land on the pile below it.
  above: spots[id]?.labelAbove === true,
})

// Where to point at a spot to hit it. The same place its chips go, except for
// the one spot whose chip deliberately sits between two shapes.
export const probeAt = (id) => spots[id]?.probe ?? spots[id]?.chip ?? null
