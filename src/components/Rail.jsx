/*
 * The rail.
 *
 * Your chips, what is on the felt, and the handful of things you would say to
 * a dealer rather than reach out and do: odds on everything, take my place
 * bets down, keep them working through the come-out.
 *
 * The bet list is not decoration. Five of the bets on this layout have no
 * printed spot of their own - odds sit behind the flat bet, a come bet lives
 * in the number box it found, a buy is a place bet with a button on it - and
 * the list is the only place they can be seen and taken down.
 */

import { betDef, isWorking } from '../lib/bets.js'
import { CHIPS, money } from '../lib/bank.js'
import { ChipButton } from './Chips.jsx'
import { atRisk } from '../lib/rules.js'

const GROUP_ORDER = ['line', 'odds', 'box', 'field', 'centre', 'hardway', 'hop', 'bonus']
const GROUP_NAME = {
  line: 'Line',
  odds: 'Odds',
  box: 'Box',
  field: 'Field',
  centre: 'Centre',
  hardway: 'Hardways',
  hop: 'Hops',
  bonus: 'Bonus',
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
  say,
}) {
  const standing = Object.entries(state.bets)
  const onFelt = atRisk(state)
  const comeOut = state.phase === 'come-out'

  // Whether there is anything to back. The button is pointless on a come-out,
  // when there is no point for odds to be behind.
  const canOdds = standing.some(([id]) => {
    const d = betDef(id)
    return d.group === 'line' && (d.number || state.point)
  })

  return (
    <div className="rail">
      <div className="rail-left">
        <div className="money">
          <div className="money-row">
            <span className="money-label">Rail</span>
            <strong className="money-big">{money(state.bankroll)}</strong>
          </div>
          <div className="money-row">
            <span className="money-label">On the felt</span>
            <span>{money(onFelt)}</span>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Chip denominations">
          {CHIPS.map((c) => (
            <ChipButton
              key={c.value}
              value={c.value}
              selected={denom === c.value}
              disabled={c.value > state.bankroll}
              onSelect={onDenom}
            />
          ))}
        </div>
      </div>

      <div className="rail-mid">
        <div className={`say${say?.kind === 'refused' ? ' is-refused' : ''}`} aria-live="polite">
          {say?.text ?? (comeOut ? 'Coming out. Bet the line.' : `The point is ${state.point}.`)}
        </div>

        <div className="actions">
          {/* Place and buy are the same chips in the same box - what separates
              them is the 5% and the better price, so it is a mode rather than
              two spots. */}
          <div className="segmented" role="group" aria-label="How to bet the box">
            <button
              type="button"
              className={boxMode === 'place' ? 'is-on' : ''}
              onClick={() => onBoxMode('place')}
              aria-pressed={boxMode === 'place'}
            >
              Place
            </button>
            <button
              type="button"
              className={boxMode === 'buy' ? 'is-on' : ''}
              onClick={() => onBoxMode('buy')}
              aria-pressed={boxMode === 'buy'}
            >
              Buy <span className="hint">5% vig</span>
            </button>
          </div>

          <button type="button" onClick={onOdds} disabled={!canOdds}>
            Odds on everything
          </button>
          <button type="button" onClick={() => onWorking(!allWorking(state))}>
            {allWorking(state) ? 'Turn the box off' : 'Keep the box working'}
          </button>
          <button type="button" onClick={onClearAll} disabled={!standing.length}>
            Take it all down
          </button>
        </div>

        <button type="button" className="roll" onClick={onRoll} disabled={rolling}>
          Roll
        </button>
      </div>

      <div className="rail-right">
        <h2>On the felt</h2>
        {standing.length === 0 ? (
          <p className="empty">Nothing out. Pick a chip and put it somewhere.</p>
        ) : (
          <ul className="bets">
            {sortBets(standing).map(([id, bet]) => {
              const d = betDef(id)
              const working = isWorking(id, bet, state.phase)
              return (
                <li key={id} className={working ? '' : 'is-off'}>
                  <span className="bet-group">{GROUP_NAME[d.group]}</span>
                  <span className="bet-name">{d.label}</span>
                  <span className="bet-amount">
                    {money(bet.amount)}
                    {bet.vig ? <em title="commission paid"> +{money(bet.vig)}</em> : null}
                  </span>
                  {d.togglable ? (
                    <button
                      type="button"
                      className="bet-working"
                      onClick={() => onWorking(!working, id)}
                      title={working ? 'Turn this bet off' : 'Put this bet to work'}
                    >
                      {working ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <span className="bet-working is-fixed" title="Always working">&mdash;</span>
                  )}
                  <button
                    type="button"
                    className="bet-down"
                    onClick={() => onTakeDown(id)}
                    disabled={d.contract && !id.startsWith('dont')}
                    title={
                      d.contract && !id.startsWith('dont')
                        ? 'A contract bet. It stays until it is decided.'
                        : 'Take it down'
                    }
                  >
                    &times;
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
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
