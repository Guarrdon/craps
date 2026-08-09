/*
 * Chips on the felt, and the puck.
 *
 * Drawn in the felt's own coordinates, so a stack sits exactly where layout.js
 * says that bet's chips go - which is how three different bets on the same
 * number box stay tellable apart, the same way they do on a real box.
 */

import { CHIPS, brief, chipOf, money, stackFor } from '../lib/bank.js'
import { PUCK } from '../lib/layout.js'

const R = 17 // a chip on the felt, where there is room for one

/*
 * One chip.
 *
 * The dashes round the rim are the whole of what makes a circle read as a
 * casino chip, and they are drawn as one stroked circle with a dash pattern
 * rather than six separate wedges - the pattern is worked out from the
 * circumference so it comes out even at any size.
 */
export function Chip({ cx, cy, r = R, value, faded }) {
  const chip = chipOf(value)
  const rim = r * 0.82
  const dash = (2 * Math.PI * rim) / 12
  return (
    <g className={`chip${faded ? ' is-faded' : ''}`}>
      <circle cx={cx} cy={cy} r={r} fill={chip.fill} stroke="rgba(0,0,0,0.45)" strokeWidth={r * 0.06} />
      <circle
        cx={cx}
        cy={cy}
        r={rim}
        fill="none"
        stroke={chip.edge}
        strokeWidth={r * 0.3}
        strokeDasharray={`${dash} ${dash}`}
      />
      <circle cx={cx} cy={cy} r={r * 0.6} fill={chip.fill} stroke={chip.edge} strokeWidth={r * 0.05} />
      <text
        x={cx}
        y={cy + r * 0.24}
        textAnchor="middle"
        fill={chip.ink}
        fontSize={r * (chip.label.length > 2 ? 0.5 : 0.68)}
        fontWeight="700"
      >
        {chip.label}
      </text>
    </g>
  )
}

/*
 * A bet, as a pile.
 *
 * The pile is capped at five chips - a $500 bet in reds would be a hundred of
 * them - and the total is written above it, because past about three chips
 * nobody is counting the stack anyway. What the cap keeps is the colour: the
 * top chip is the largest denomination in the bet, so a black-topped pile
 * still reads as a big bet across the table.
 */
export function ChipStack({
  id,
  x,
  y,
  amount,
  working = true,
  r = R,
  total = true,
  above = false,
  onClick,
  onRemove,
  label,
}) {
  if (!amount) return null
  const lift = r * 0.3
  const chips = stackFor(amount)
  const top = y - (chips.length - 1) * lift

  return (
    <g
      className={`stack${working ? '' : ' is-off'}`}
      onClick={onClick && ((e) => { e.stopPropagation(); onClick(id) })}
      onContextMenu={onRemove && ((e) => { e.preventDefault(); e.stopPropagation(); onRemove(id) })}
      role={onClick ? 'button' : undefined}
      aria-label={`${label ?? id}, ${money(amount)}${working ? '' : ', off'}`}
    >
      <ellipse cx={x} cy={y + r * 0.5} rx={r * 1.05} ry={r * 0.38} className="stack-shadow" />
      {chips.map((chip, i) => (
        <Chip key={i} cx={x} cy={y - i * lift} r={r} value={chip.value} />
      ))}
      {/* Under the pile by default, because over it is where the printed
          number lives - the word Six, the payout on a hardway. The exception
          is a stack heeled on top of another one, where under is the pile it
          is sitting on. */}
      {total && (
        <g className="stack-total" transform={`translate(${x} ${above ? top - r - 6 : y + r + 13})`}>
          <rect x={-19} y={-11} width={38} height={15} rx={7.5} />
          <text y={0} textAnchor="middle">{brief(amount)}</text>
        </g>
      )}
      {/* A bet that is on the felt but not at risk. Dealers put a small OFF
          button on top of it; so does this. */}
      {!working && (
        <g className="off-button" transform={`translate(${x + r * 0.72} ${top - r * 0.72})`}>
          <circle r={r * 0.52} />
          <text y={r * 0.17} textAnchor="middle" fontSize={r * 0.44}>OFF</text>
        </g>
      )}
    </g>
  )
}

// The ON/OFF puck. Off to the side of the layout while the table is coming
// out, and sitting on the box number once there is a point.
export function Puck({ point }) {
  const [x, y] = point ? PUCK.on[point] : PUCK.off
  return (
    <g className={`puck${point ? ' is-on' : ''}`} transform={`translate(${x} ${y})`}>
      <circle r={PUCK.r} />
      <circle r={PUCK.r * 0.78} className="puck-ring" />
      <text y={PUCK.r * 0.28} textAnchor="middle" fontSize={PUCK.r * (point ? 0.62 : 0.5)}>
        {point ? 'ON' : 'OFF'}
      </text>
    </g>
  )
}

// A chip drawn on its own, for the rail. Same chip, no felt around it.
export function ChipButton({ value, size = 54, selected, disabled, onSelect }) {
  const r = size / 2 - 2
  return (
    <button
      type="button"
      className={`chip-button${selected ? ' is-selected' : ''}`}
      disabled={disabled}
      onClick={() => onSelect(value)}
      aria-label={`${money(value)} chip`}
      aria-pressed={selected}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Chip cx={size / 2} cy={size / 2} r={r} value={value} />
      </svg>
    </button>
  )
}

export { CHIPS }
