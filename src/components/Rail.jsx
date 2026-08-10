/*
 * The rail.
 *
 * One row: your money, your chips, the handful of things you would say to a
 * dealer rather than reach out and do, and the dice. It used to be three tall
 * columns and it was taking a quarter of the screen away from the table for
 * information the felt was already showing - the call is on the cloth, and so
 * are the chips.
 *
 * What is left is what has nowhere else to live. The standing-bet list is one
 * of those: five bets on this layout have no printed spot of their own, so
 * they can only be reached from a list - but they do not need to be on screen
 * at all times, so it opens over the table instead of sitting under it.
 *
 * Every target here is at least 44px, because this has to work under a thumb.
 */

import { betDef, isWorking } from '../lib/bets.js'
import { CHIPS, money } from '../lib/bank.js'
import { ChipButton } from './Chips.jsx'
import { atRisk } from '../lib/rules.js'
import { baseOf, canTakeDown, sweepable } from '../lib/table.js'

const GROUP_ORDER = ['line', 'odds', 'box', 'field', 'centre', 'hardway', 'hop', 'bonus']
const GROUP_NAME = {
  line: 'Line', odds: 'Odds', box: 'Box', field: 'Field',
  centre: 'Centre', hardway: 'Hard', hop: 'Hop', bonus: 'Bonus',
}

export default function Rail({
  state,
  denom,
  onDenom,
  boxMode,
  onBoxMode,
  onOdds,
  onWorking,
  onClearAll,
  onTakeDown,
  onRoll,
  rolling,
  pressable = [],
  onPress,
  onRegress,
  opening,
  onOpening,
  onSaveOpening,
  autoOpen,
  onAutoOpen,
  showBets,
  onShowBets,
  teaching,
}) {
  const standing = Object.entries(state.bets)
  const canOdds = standing.some(([id]) => {
    const d = betDef(id)
    return d.group === 'line' && (d.number || state.point)
  })
  // The sweep steps over contract bets and the bonus row, so a felt holding
  // only those has nothing to sweep - see sweep() in table.js.
  const canSweep = sweepable(state).length > 0
  const working = allWorking(state)

  return (
    // Both overlays live inside the rail rather than beside it, because they
    // are positioned against it - a sibling would resolve `absolute` against
    // the viewport and end up above the top of the screen.
    <div className={`rail${teaching ? ' is-teaching' : ''}`}>
      {/* The press window, floated above the rail so it does not change its
          height when it appears. Open until the dice leave the hand. */}
      {pressable.length > 0 && !rolling && (
        <div className="press">
          <span className="press-title">Paid and still up</span>
          {pressable
            .filter((p) => !p.pressed)
            .map(({ id, pay }) => (
              <button key={id} type="button" onClick={() => onPress(id)}>
                Press {betDef(id).label} <em>+{money(pay)}</em>
              </button>
            ))}
          {pressable.filter((p) => !p.pressed).length > 1 && (
            <button type="button" className="press-all" onClick={() => onPress()}>
              Press them all
            </button>
          )}
          {/* Press, press, press, then regress. Only offered on a bet that is
              actually out above what you set it to. */}
          {pressable
            .filter(({ id }) => state.bets[id] && state.bets[id].amount > baseOf(state.bets[id]))
            .map(({ id }) => (
              <button key={`back-${id}`} type="button" className="regress" onClick={() => onRegress(id)}>
                {betDef(id).label} back to {money(baseOf(state.bets[id]))}
              </button>
            ))}
        </div>
      )}

      {showBets && (
        <div className="bets-panel" role="dialog" aria-label="What is on the felt">
          <header>
            <h2>On the felt</h2>
            <button type="button" onClick={() => onShowBets(false)} aria-label="Close">&times;</button>
          </header>
          {standing.length === 0 ? (
            <p className="empty">Nothing out. Pick a chip and put it somewhere.</p>
          ) : (
            <ul className="bets">
              {sortBets(standing).map(([id, bet]) => {
                const d = betDef(id)
                const on = isWorking(id, bet, state.phase)
                return (
                  <li key={id} className={on ? '' : 'is-off'}>
                    <span className="bet-group">{GROUP_NAME[d.group]}</span>
                    <span className="bet-name">{d.label}</span>
                    <span className="bet-amount">
                      {money(bet.amount)}
                      {bet.vig ? <em title="commission paid"> +{money(bet.vig)}</em> : null}
                      {/* What it was before anything was pressed on top. */}
                      {bet.amount > baseOf(bet) ? (
                        <em className="was" title={`Started at ${money(baseOf(bet))}`}>
                          {' '}from {money(baseOf(bet))}
                        </em>
                      ) : null}
                    </span>
                    {bet.amount > baseOf(bet) ? (
                      <button
                        type="button"
                        className="bet-back"
                        onClick={() => onRegress(id)}
                        title={`Back to ${money(baseOf(bet))}`}
                      >
                        &#8630;
                      </button>
                    ) : (
                      <span className="bet-back is-fixed">&mdash;</span>
                    )}
                    {d.togglable ? (
                      <button type="button" className="bet-working" onClick={() => onWorking(!on, id)}>
                        {on ? 'ON' : 'OFF'}
                      </button>
                    ) : (
                      <span className="bet-working is-fixed" title="Always working">&mdash;</span>
                    )}
                    <button
                      type="button"
                      className="bet-down"
                      onClick={() => onTakeDown(id)}
                      disabled={!canTakeDown(state, id)}
                      title={d.group === 'bonus' ? 'Take it down — it cannot go back up until a new shooter' : 'Take it down'}
                    >
                      &times;
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="money" title="On the rail, and on the felt">
          <strong>{money(state.bankroll)}</strong>
          <span>{money(atRisk(state))} out</span>
        </div>

        <div className="chips" role="group" aria-label="Chip denominations">
          {CHIPS.map((c) => (
            <ChipButton
              key={c.value}
              value={c.value}
              size={46}
              selected={denom === c.value}
              disabled={c.value > state.bankroll}
              onSelect={onDenom}
            />
          ))}
        </div>

        <div className="doings">
          {/* Place and buy are the same box; which one a click makes is a word
              to the dealer at a table, so it is a mode here. */}
          <div className="segmented" role="group" aria-label="How to bet the box">
            <button type="button" className={boxMode === 'place' ? 'is-on' : ''} onClick={() => onBoxMode('place')}>
              Place
            </button>
            <button type="button" className={boxMode === 'buy' ? 'is-on' : ''} onClick={() => onBoxMode('buy')}>
              Buy
            </button>
          </div>

          <button type="button" onClick={onOdds} disabled={!canOdds} title="Back every line bet to the table maximum">
            Odds
          </button>
          <button type="button" onClick={() => onWorking(!working)} title="Turn the box on or off for the come-out">
            Box {working ? 'off' : 'on'}
          </button>
          <button type="button" onClick={onOpening} disabled={!opening?.length} title="Put your saved opening back out">
            Usual{opening?.length ? ` · ${money(opening.reduce((s, b) => s + b.amount, 0))}` : ''}
          </button>
          <button type="button" onClick={onSaveOpening} title="Save what is on the felt as your opening">
            Save
          </button>
          <label className="tick" title="Put your opening out on every new come-out">
            <input type="checkbox" checked={!!autoOpen} onChange={(e) => onAutoOpen(e.target.checked)} />
            <span>Auto</span>
          </label>
          <button
            type="button"
            onClick={onClearAll}
            disabled={!canSweep}
            title="Take down everything that can come down — Little, Big and Boom stay out"
          >
            Clear
          </button>
          <button
            type="button"
            className={showBets ? 'is-on' : ''}
            onClick={() => onShowBets(!showBets)}
            title="Odds, come bets and buys have no printed spot — they live here"
          >
            Bets · {standing.length}
          </button>
        </div>

      <button type="button" className="roll" onClick={onRoll} disabled={rolling}>
        Roll
      </button>
    </div>
  )
}

const allWorking = (state) =>
  Object.entries(state.bets)
    .filter(([id]) => betDef(id).togglable)
    .every(([id, bet]) => isWorking(id, bet, state.phase))

const sortBets = (entries) =>
  [...entries].sort(([a], [b]) => {
    const da = betDef(a)
    const db = betDef(b)
    const g = GROUP_ORDER.indexOf(da.group) - GROUP_ORDER.indexOf(db.group)
    return g || (da.number ?? 0) - (db.number ?? 0) || a.localeCompare(b)
  })
