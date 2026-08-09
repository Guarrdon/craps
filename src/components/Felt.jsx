/*
 * The layout, drawn.
 *
 * Every printed line comes out of layout.js, and so does every click target -
 * they are the same shape element, given a stroke for the eye and a handler
 * for the mouse. There is no separate table of hit boxes to drift out of step
 * with the picture, which is the failure this arrangement exists to make
 * impossible.
 *
 * The whole felt is one viewBox. Scaling is the browser's problem: a phone
 * gets the same layout as a desktop, smaller, and no bet spot can go missing
 * at a breakpoint because there are no breakpoints.
 */

import {
  ANY_CRAPS,
  BAND_EDGES,
  BAND_END,
  BONUS_BOXES,
  BOX_LABEL,
  BOX_MID,
  BOX_NUMBERS,
  CE_PAIRS,
  FELT,
  HARDWAYS,
  HOPS_ON_FELT,
  HOP_LEGEND,
  HORN_BOX,
  HORN_SPOTS,
  PROP_BODY,
  PROP_ROOF,
  SPOTS,
  TRACKERS,
  bonusPrice,
} from '../lib/layout.js'

// --------------------------------------------------------------------- dice

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

// The little printed dice that say what a bet is without spelling it out - the
// pair of sixes beside DON'T PASS BAR, the hard ways, the horn numbers.
export function Die({ x, y, size = 22, value, tone = 'white' }) {
  const half = size / 2
  return (
    <g transform={`translate(${x} ${y})`} className={`die die-${tone}`}>
      <rect x={-half} y={-half} width={size} height={size} rx={size * 0.16} />
      {PIPS[value].map(([px, py], i) => (
        <circle key={i} cx={px * size * 0.27} cy={py * size * 0.27} r={size * 0.105} className="pip" />
      ))}
    </g>
  )
}

const DicePair = ({ x, y, faces, size = 22, tone }) => (
  <>
    <Die x={x - size * 0.62} y={y} size={size} value={faces[0]} tone={tone} />
    <Die x={x + size * 0.62} y={y} size={size} value={faces[1]} tone={tone} />
  </>
)

// -------------------------------------------------------------------- shapes

function Shape({ shape, ...rest }) {
  if (!shape) return null
  switch (shape.type) {
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 0} {...rest} />
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...rest} />
    case 'path':
      return <path d={shape.d} {...rest} />
    case 'stroke':
      // A band, drawn as a thick stroke down its centreline so the corner it
      // turns is one arc rather than two edges that have to meet. The width
      // goes in as an inline style rather than an attribute: a presentation
      // attribute loses to any stylesheet rule, and .print sets a stroke-width
      // for the printed lines that would otherwise shrink this to a hairline.
      return <path d={shape.d} fill="none" style={{ strokeWidth: shape.width }} {...rest} />
    case 'group':
      return (
        <g {...rest}>
          {shape.shapes.map((s, i) => (
            <Shape key={i} shape={s} />
          ))}
        </g>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------- the felt

export default function Felt({
  onSpot,
  point,
  marked = new Set(),
  disabled = new Set(),
  bonus = '30',
  children,
}) {
  const hit = (id) => ({
    className: `spot spot-${id}${disabled.has(id) ? ' is-shut' : ''}`,
    onClick: onSpot ? (e) => { e.stopPropagation(); onSpot(id) } : undefined,
    tabIndex: onSpot ? 0 : undefined,
    role: onSpot ? 'button' : undefined,
    'aria-label': SPOTS[id].label ?? id,
  })

  return (
    <svg className="felt" viewBox={`0 0 ${FELT.w} ${FELT.h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {/* The felt is not flat: a table is lit from above the centre, and the
            layout sits in a pool of light that falls away to the rail. */}
        <radialGradient id="cloth" cx="52%" cy="46%" r="72%">
          <stop offset="0%" stopColor="#8d1723" />
          <stop offset="55%" stopColor="#6d1019" />
          <stop offset="100%" stopColor="#480a11" />
        </radialGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a51e2b" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a51e2b" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={FELT.w} height={FELT.h} fill="url(#cloth)" />
      <ellipse cx={560} cy={420} rx={520} ry={330} fill="url(#glow)" />
      <ellipse cx={1265} cy={430} rx={260} ry={330} fill="url(#glow)" />

      {/* ------------------------------------------------ the printed layout */}
      <g className="print">
        {/* The two line bands. Three printed lines make two bands: the outer
            edge of the pass line, the line the two share, and the inner edge of
            the don't pass. The felt shows through between them - a band on a
            layout is a lane, not a stripe of paint. */}
        {BAND_EDGES.map((d, i) => (
          <path key={i} className="band-edge" d={d} />
        ))}
        {/* Closed off where this end of the table stops. Without it the three
            lines simply run out, and a layout that runs out looks unfinished
            rather than bounded. */}
        <path className="band-edge" d={`M ${BAND_END} 722 L ${BAND_END} 848`} />
        <text className="t-line" x={470} y={825} textAnchor="middle">PASS LINE</text>
        <text className="t-line" transform="translate(53 430) rotate(-90)" textAnchor="middle">PASS LINE</text>
        <text className="t-dont" x={420} y={756} textAnchor="middle">DON&rsquo;T PASS BAR</text>
        <text className="t-dont" transform="translate(116 430) rotate(-90)" textAnchor="middle">DON&rsquo;T PASS BAR</text>
        <DicePair x={570} y={749} faces={[6, 6]} size={18} />

        {/* The click targets for those two bands: the centreline of each,
            stroked at the band's full width and painted with nothing. */}
        <Shape shape={SPOTS.pass.shape} {...hit('pass')} />
        <Shape shape={SPOTS.dontpass.shape} {...hit('dontpass')} />

        {/* The box. The strip along the top is where a don't come bet or a lay
            goes; the number itself carries the place, buy and come bets. */}
        {BOX_NUMBERS.map((n, i) => (
          <g key={n}>
            <Shape shape={SPOTS[`lay-${n}`].shape} {...hit(`lay-${n}`)} />
            <Shape shape={SPOTS[`place-${n}`].shape} {...hit(`place-${n}`)} />
            {/* Printed in the upper half of the box, so the lower half is
                free for the chips that go in it. */}
            <text
              className={BOX_LABEL[n].length > 2 ? 't-box t-box-word' : 't-box'}
              x={BOX_MID[n]}
              y={138}
              textAnchor="middle"
            >
              {BOX_LABEL[n]}
            </text>
          </g>
        ))}

        <Shape shape={SPOTS.dontcome.shape} {...hit('dontcome')} />
        <text className="t-dontcome" x={226} y={92} textAnchor="middle">DON&rsquo;T</text>
        <text className="t-dontcome" x={226} y={122} textAnchor="middle">COME</text>
        <text className="t-dontcome" x={226} y={152} textAnchor="middle">BAR</text>
        <DicePair x={226} y={188} faces={[6, 6]} size={19} />

        <Shape shape={SPOTS.come.shape} {...hit('come')} />
        <text className="t-come" x={563} y={330} textAnchor="middle">COME</text>

        {/* The field, with its two doubling ends ringed the way the felt rings
            them. This table pays double on both, which is printed rather than
            assumed - plenty of tables pay triple on the twelve. */}
        <Shape shape={SPOTS.field.shape} {...hit('field')} />
        <text className="t-field-n" x={563} y={614} textAnchor="middle">3 &middot; 4 &middot; 9 &middot; 10 &middot; 11</text>
        <text className="t-field" x={563} y={664} textAnchor="middle">FIELD</text>
        <g className="field-end">
          <circle cx={250} cy={604} r={34} />
          <text className="t-field-big" x={250} y={617} textAnchor="middle">2</text>
          <text className="t-double" x={250} y={548} textAnchor="middle">PAYS DOUBLE</text>
        </g>
        <g className="field-end">
          <circle cx={877} cy={604} r={34} />
          <text className="t-field-big" x={877} y={617} textAnchor="middle">12</text>
          <text className="t-double" x={877} y={548} textAnchor="middle">PAYS DOUBLE</text>
        </g>

        {/* C and E, dotted down the rail so there is a pair within reach of
            every position at the table. All six are the same two bets. */}
        <Shape shape={SPOTS.ce.shape} {...hit('ce')} />
        {CE_PAIRS.map(({ y, e, c }, i) => (
          <g key={i} className="t-ce">
            <text x={e} y={y + 5} textAnchor="middle">E</text>
            <text x={c} y={y + 5} textAnchor="middle">C</text>
          </g>
        ))}

        {/* ------------------------------------------------------ the bonus
            Two rows of markers, shared. Little reads the low row, Big reads
            the high row, and Boom or Bust needs every one of them lit. */}
        {TRACKERS.map((t) => (
          <g key={t.number} className={`tracker${marked.has(t.number) ? ' is-marked' : ''}`}>
            <circle cx={t.cx} cy={t.cy} r={t.r} />
            <text x={t.cx} y={t.cy + 5} textAnchor="middle">{t.number}</text>
          </g>
        ))}
        {BONUS_BOXES.map((b) => (
          <g key={b.id}>
            <Shape shape={SPOTS[b.id].shape} {...hit(b.id)} />
            <text className="t-bonus" x={b.x + b.w / 2} y={150} textAnchor="middle">{b.label}</text>
            <text className="t-bonus-note" x={b.x + b.w / 2} y={166} textAnchor="middle">{b.note}</text>
            {/* Printed from the table's own pay table, so the felt can never
                advertise a price the engine will not pay. */}
            <text className="t-bonus-pays" x={b.x + b.w / 2} y={189} textAnchor="middle">
              {bonusPrice(b.id, bonus)}
            </text>
          </g>
        ))}

        {/* -------------------------------------------------------- the hops */}
        {HOPS_ON_FELT.map((h) => (
          <g key={h.id}>
            <Shape shape={SPOTS[h.id].shape} {...hit(h.id)} />
            <text className="t-hop" x={h.cx} y={h.cy + 5} textAnchor="middle">
              {h.face[0]}-{h.face[1]}
            </text>
          </g>
        ))}
        <text className="t-hop-legend" x={HOP_LEGEND.x} y={HOP_LEGEND.y + 8} textAnchor="middle">HOP</text>

        {/* -------------------------------------------------- the prop box */}
        <path className="prop-outline" d={PROP_ROOF} />
        <rect
          className="prop-outline"
          x={PROP_BODY.x}
          y={PROP_BODY.y}
          width={PROP_BODY.w}
          height={PROP_BODY.h}
        />
        <Shape shape={SPOTS.any7.shape} {...hit('any7')} />
        <text className="t-seven" x={1265} y={360} textAnchor="middle">SEVEN</text>
        <text className="t-pays" x={1105} y={384} textAnchor="middle">4 TO 1</text>
        <text className="t-pays" x={1425} y={384} textAnchor="middle">4 TO 1</text>

        {HARDWAYS.map((h) => (
          <g key={h.n}>
            <Shape shape={SPOTS[`hard-${h.n}`].shape} {...hit(`hard-${h.n}`)} />
            <DicePair x={h.x + h.w * 0.36} y={h.y + h.h / 2 - 4} faces={[h.n / 2, h.n / 2]} size={26} tone="gold" />
            <text className="t-pays" x={h.x + h.w - 34} y={h.y + h.h - 14} textAnchor="middle">{h.pays}</text>
          </g>
        ))}

        {HORN_SPOTS.map((h) => (
          <g key={h.id}>
            <Shape shape={SPOTS[h.id].shape} {...hit(h.id)} />
            <DicePair x={h.x + h.w * 0.36} y={h.y + h.h / 2 - 4} faces={h.face} size={22} tone="red" />
            <text className="t-pays" x={h.x + h.w - 30} y={h.y + h.h - 12} textAnchor="middle">{h.pays}</text>
          </g>
        ))}
        <Shape shape={SPOTS.horn.shape} {...hit('horn')} />
        <text className="t-horn" x={HORN_BOX.x + HORN_BOX.w / 2} y={HORN_BOX.y + 60} textAnchor="middle">HORN</text>
        <text className="t-horn" x={HORN_BOX.x + HORN_BOX.w / 2} y={HORN_BOX.y + 82} textAnchor="middle">BET</text>

        <Shape shape={SPOTS.anycraps.shape} {...hit('anycraps')} />
        <text className="t-anycraps" x={1265} y={765} textAnchor="middle">ANY CRAPS</text>
        <text className="t-pays" x={1105} y={762} textAnchor="middle">7 TO 1</text>
        <text className="t-pays" x={1425} y={762} textAnchor="middle">7 TO 1</text>
      </g>

      {/* Chips, the puck and the dice are laid over the print by whatever is
          using this component. */}
      {children}
    </svg>
  )
}
