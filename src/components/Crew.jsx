/*
 * The crew.
 *
 * What a table does between the dice stopping and the next throw, which is not
 * nothing and is not instant. The stickman calls the number, and then the
 * dealers work the felt in a fixed order - the centre first, because those
 * bets are decided and gone, then the box, then the come, and the line last.
 *
 * rules.js already produces the events in that order. All this does is spread
 * them over about a second so you can see it happening, which is the whole
 * difference between a payout and a number changing.
 */

import { betDef } from '../lib/bets.js'
import { money } from '../lib/bank.js'
import { chipAt } from '../lib/layout.js'

// How long between one bet being settled and the next. Fast enough not to be
// waiting, slow enough to follow a dealer's hand across the box.
export const BEAT = 95
export const AFTER = 620 // and a moment to read the last of it

// Which events are worth watching happen. A bet that simply rides is not news.
const WATCHED = new Set(['pay', 'take', 'push', 'return'])
export const settlingEvents = (events) => events.filter((e) => WATCHED.has(e.kind) && chipAt(e.id))

// How long the whole settlement takes, so the caller knows when to commit.
export const settlingTime = (events) => settlingEvents(events).length * BEAT + AFTER

/*
 * The amounts, floating up off the bets they belong to.
 *
 * Placed at each bet's own chip position, so what you read is tied to the pile
 * it came from rather than being a list somewhere else on the screen. Staggered
 * by their order in the event list, which is the order the crew works in.
 */
export function Payouts({ events }) {
  const watched = settlingEvents(events)
  if (!watched.length) return null

  return (
    <g className="payouts">
      {watched.map((e, i) => {
        const [x, y] = chipAt(e.id)
        const text =
          e.kind === 'pay'
            ? `+${money(e.pay)}`
            : e.kind === 'take'
              ? `−${money(e.amount)}`
              : money(e.amount)
        /*
         * Two groups, not one. The outer carries the position as an SVG
         * attribute and the inner carries the animation, because a CSS
         * transform on an element *replaces* its transform attribute rather
         * than composing with it - put both on one group and every amount
         * flies up from the top left corner of the table instead of off the
         * bet it belongs to.
         */
        return (
          <g key={`${e.id}-${i}`} transform={`translate(${x} ${y})`}>
            <g className={`float is-${e.kind}`} style={{ animationDelay: `${i * BEAT}ms` }}>
              <text textAnchor="middle">{text}</text>
            </g>
          </g>
        )
      })}
    </g>
  )
}

/*
 * The call, and what the dice showed.
 *
 * Bottom right, in the one corner of this layout with nothing printed on it.
 * Together rather than apart, because they are one piece of information: a
 * player who looked away for the throw should not have to add two dice at the
 * far end of the table, which is exactly why a stickman says it out loud.
 *
 * The roll has to be the one being settled, not the one on the table state -
 * during settlement the table still holds the roll before, since what is on
 * the felt is what is being paid.
 */
export function Readout({ roll, text, tone }) {
  if (!roll && !text) return null
  const hard = roll && roll.a === roll.b && roll.total >= 4 && roll.total <= 10
  return (
    <div className="readout">
      {roll && (
        <div className="total" key={`${roll.a}-${roll.b}-${roll.total}`}>
          <span className="total-n">{roll.total}</span>
          <span className="total-how">
            {roll.a} &amp; {roll.b}
            {hard ? ' · hard' : ''}
          </span>
        </div>
      )}
      {text && (
        <div className={`call is-${tone ?? 'roll'}`} key={text} aria-live="polite">
          {text}
        </div>
      )}
    </div>
  )
}

// A short line naming what the roll did to the bets it touched, for the ledger
// in the corner. Kept out of calls.js because it is about presentation order,
// not about what the table said.
export const groupOf = (id) => betDef(id).group
