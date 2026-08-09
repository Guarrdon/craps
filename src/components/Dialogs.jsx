/*
 * The screens around the game: the rules, the statistics, the table.
 *
 * The rules screen is generated from the catalogue rather than written out.
 * Every payout, every increment and every cost comes from the same code that
 * settles the bets, so the page cannot claim something the felt will not do -
 * which is the failure mode of every rules page ever written by hand.
 */

import { useEffect, useRef } from 'react'
import {
  BONUS,
  HARDWAY_PAYS,
  LAY_ODDS,
  PLACE_PAYS,
  POINTS,
  TRUE_ODDS,
  betDef,
  betsInGroup,
} from '../lib/bets.js'
import { EDGES, asPercent } from '../lib/edges.js'
import { ODDS_OPTIONS, rangeFor, unitFor } from '../lib/limits.js'
import { money } from '../lib/bank.js'
import { duration } from '../lib/storage.js'

// ------------------------------------------------------------------ shell

export function Dialog({ title, subtitle, onClose, children, wide }) {
  const box = useRef(null)
  useEffect(() => {
    box.current?.focus()
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className={`dialog${wide ? ' is-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={box}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          <button type="button" className="shut" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ rules

const ratio = ([n, d]) => (d === 1 ? `${n}:1` : `${n}:${d}`)

// What a bet pays, said the way a table says it. Read off the same payout
// tables the settlement uses.
function paysFor(id) {
  const d = betDef(id)
  const n = d.number
  switch (d.group) {
    case 'line':
      return 'Even money'
    case 'odds':
      return id.startsWith('dont')
        ? 'True odds, the other way up — 1:2 on the 4 and 10, 2:3 on the 5 and 9, 5:6 on the 6 and 8'
        : 'True odds — 2:1 on the 4 and 10, 3:2 on the 5 and 9, 6:5 on the 6 and 8'
    case 'box':
      if (id.startsWith('place')) return ratio(PLACE_PAYS[n])
      if (id.startsWith('buy')) return `${ratio(TRUE_ODDS[n])}, less 5% of the bet`
      return `${ratio(LAY_ODDS[n])}, less 5% of the win`
    case 'field':
      return 'Even money — double on the 2 and the 12'
    case 'hardway':
      return ratio(HARDWAY_PAYS[n])
    case 'hop':
      return d.hard ? '30:1' : '15:1'
    case 'bonus':
      return ratio(BONUS[id].pays)
    default:
      return { any7: '4:1', anycraps: '7:1', aces: '30:1', boxcars: '30:1', acedeuce: '15:1', yo: '15:1' }[id]
        ?? (id === 'horn' ? 'Four bets in one — the winning quarter pays its own rate' : 'Two bets in one — 7:1 on craps, 15:1 on the eleven')
  }
}

const NOTES = {
  pass: 'Wins on 7 or 11 coming out, loses to craps. Once there is a point it wins if the point comes again before a seven. Cannot be taken down once the point is out.',
  dontpass: 'The mirror, with the twelve barred — a push, not a win. Which is the whole of the house edge on this side.',
  come: 'A pass line bet made one roll late. It travels to whatever number comes next and behaves exactly like a pass line with a point of its own.',
  dontcome: 'The mirror of the come, twelve barred.',
  'pass-odds': 'The one bet in the house with no edge at all. It pays what the number is genuinely worth, which is why the table caps it.',
  'dontpass-odds': 'Laying the odds: risk more to win less, because once a point is out the don’t side is the favourite.',
  field: 'One roll. Wins on 2, 3, 4, 9, 10, 11 and 12 — which is seven numbers out of eleven and still a bad bet, because the four it loses to are the four most likely.',
  any7: 'One roll. The most expensive bet on the table.',
  horn: 'Four bets in one chip, so it wants four dollars. Three quarters lose whatever happens.',
  ce: 'Two bets in one chip. Half on craps, half on the eleven.',
  little: 'Every one of 2, 3, 4, 5 and 6 before a seven. Goes up before the come-out and any seven ends it.',
  big: 'Every one of 8, 9, 10, 11 and 12 before a seven.',
  all: 'All ten numbers before a seven. Comes in about once in five hundred shooters.',
}

const GROUPS = [
  { key: 'line', title: 'The line', ids: ['pass', 'dontpass', 'come', 'dontcome'] },
  { key: 'odds', title: 'Odds', ids: ['pass-odds', 'dontpass-odds'] },
  { key: 'box', title: 'The box', ids: POINTS.flatMap((n) => [`place-${n}`, `buy-${n}`, `lay-${n}`]) },
  { key: 'field', title: 'The field', ids: ['field'] },
  { key: 'hardway', title: 'Hardways', ids: [4, 6, 8, 10].map((n) => `hard-${n}`) },
  { key: 'centre', title: 'The centre', ids: ['any7', 'anycraps', 'aces', 'acedeuce', 'yo', 'boxcars', 'horn', 'ce'] },
  { key: 'hop', title: 'Hops', ids: betsInGroup('hop').map((d) => d.id) },
  { key: 'bonus', title: 'The bonus row', ids: ['little', 'big', 'all'] },
]

export function RulesDialog({ table, onClose }) {
  return (
    <Dialog
      title="Every bet on this table"
      subtitle="What it pays, what it costs, and when it is working. Taken from the same code that settles it."
      onClose={onClose}
      wide
    >
      <p className="lede">
        The cost is the house edge per bet resolved — what the bet is worth to the table over time, as a
        share of what you put up. Nothing here is a recommendation. It is what the numbers are.
      </p>

      {GROUPS.map((g) => (
        <section key={g.key}>
          <h3>{g.title}</h3>
          <table className="rules">
            <thead>
              <tr>
                <th>Bet</th>
                <th>Pays</th>
                <th>Costs</th>
                <th>Wants</th>
                <th>Working</th>
              </tr>
            </thead>
            <tbody>
              {/* All seventeen hops are one of two bets, so the table shows
                  one of each rather than seventeen near-identical rows. */}
              {(g.key === 'hop'
                ? [g.ids.find((id) => betDef(id).hard), g.ids.find((id) => !betDef(id).hard)]
                : g.ids
              ).map((id) => {
                const d = betDef(id)
                const step = unitFor(id, { point: 6 })
                const { min } = rangeFor(id, { table })
                return (
                  <tr key={id}>
                    <th scope="row">
                      {g.key === 'hop' ? (d.hard ? 'Any double' : 'Any easy way') : d.label}
                    </th>
                    <td>{paysFor(id)}</td>
                    <td className={EDGES[id] === 0 ? 'is-free' : 'is-cost'}>{asPercent(EDGES[id])}</td>
                    <td>
                      {/* Odds have no increment of their own - it comes from
                          whatever the point turned out to be, so quoting one
                          number here would be quoting the six's. */}
                      {d.group === 'odds' ? (
                        <span className="dim">Whatever the point can pay</span>
                      ) : (
                        <>
                          {money(Math.max(min, step))}
                          {step > 1 ? `, in ${money(step)} steps` : ''}
                        </>
                      )}
                    </td>
                    <td>
                      {d.oneRoll
                        ? 'One roll'
                        : d.worksOnComeOut
                          ? 'Always'
                          : 'Off on the come-out'}
                      {d.contract ? ' · contract' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {g.ids.filter((id) => NOTES[id]).map((id) => (
            <p key={id} className="note">
              <strong>{betDef(id).label}.</strong> {NOTES[id]}
            </p>
          ))}
        </section>
      ))}
    </Dialog>
  )
}

// ------------------------------------------------------------------ stats

const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

export function StatsDialog({ stats, rail, onReset, onClose }) {
  const rolls = stats.rolls || 1
  const most = Math.max(1, ...Object.values(stats.totals))
  const net = stats.won - stats.lost

  return (
    <Dialog
      title="This session"
      subtitle="Kept in this browser and nowhere else."
      onClose={onClose}
    >
      <dl className="figures">
        <div><dt>Throws</dt><dd>{stats.rolls.toLocaleString()}</dd></div>
        <div><dt>Shooters</dt><dd>{stats.shooters.toLocaleString()}</dd></div>
        <div><dt>Longest hand</dt><dd>{stats.longestHand} throws</dd></div>
        <div><dt>Points made</dt><dd>{stats.pointsMade.toLocaleString()}</dd></div>
        <div><dt>Seven outs</dt><dd>{stats.sevenOuts.toLocaleString()}</dd></div>
        <div><dt>At the table</dt><dd>{duration(stats.started ? Date.now() - stats.started : 0)}</dd></div>
        <div><dt>Best throw</dt><dd className="up">{money(stats.bestRoll)}</dd></div>
        <div><dt>Worst throw</dt><dd className="down">{money(stats.worstRoll)}</dd></div>
        <div><dt>Highest the rail got</dt><dd>{money(stats.peak)}</dd></div>
        <div><dt>Where it stands</dt><dd className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : ''}{money(net)}</dd></div>
      </dl>

      <h3>What has actually come up</h3>
      <p className="note">
        Against what should, over {stats.rolls.toLocaleString()} throws. The dice do not remember any of
        this — it is here because it is the first thing anybody asks of a craps game.
      </p>
      <div className="dist">
        {Object.entries(WAYS).map(([total, ways]) => {
          const seen = stats.totals[total] ?? 0
          const expected = (rolls * ways) / 36
          return (
            <div className="dist-row" key={total}>
              <span className="dist-n">{total}</span>
              <span className="dist-bar">
                <span className="dist-fill" style={{ width: `${(seen / most) * 100}%` }} />
                <span className="dist-mark" style={{ left: `${(expected / most) * 100}%` }} />
              </span>
              <span className="dist-count">{seen.toLocaleString()}</span>
            </div>
          )
        })}
      </div>

      <div className="dialog-actions">
        <button type="button" onClick={onReset}>Clear these figures</button>
      </div>
    </Dialog>
  )
}

// --------------------------------------------------------------- the table

export function SettingsDialog({ table, onChange, onNewSession, onClose }) {
  const set = (patch) => onChange({ ...table, ...patch })

  return (
    <Dialog title="The table" subtitle="Change these and you are playing a different house." onClose={onClose}>
      <label className="field">
        <span>Minimum on the line</span>
        <select value={table.min} onChange={(e) => set({ min: Number(e.target.value) })}>
          {[5, 10, 15, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{money(n)}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Maximum</span>
        <select value={table.max} onChange={(e) => set({ max: Number(e.target.value) })}>
          {[500, 1000, 2000, 5000, 10000].map((n) => (
            <option key={n} value={n}>{money(n)}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Odds</span>
        <select
          value={String(table.odds)}
          onChange={(e) => set({ odds: e.target.value === '3-4-5' ? '3-4-5' : Number(e.target.value) })}
        >
          {ODDS_OPTIONS.map((o) => (
            <option key={o.id} value={String(o.id)}>{o.label}</option>
          ))}
        </select>
      </label>
      <p className="note">{ODDS_OPTIONS.find((o) => String(o.id) === String(table.odds))?.note}</p>

      <p className="note">
        The centre keeps its own minimum of {money(table.propMin)} whatever the line is set to, which is
        how a $100 table still takes a dollar on the yo.
      </p>

      <div className="dialog-actions">
        <button type="button" onClick={onNewSession}>Buy in again</button>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------- help

const KEYS = [
  ['R or Space', 'Throw the dice'],
  ['1 – 5', 'Pick up a chip'],
  ['O', 'Odds on everything'],
  ['W', 'Turn the box on or off'],
  ['B', 'Switch between placing and buying'],
  ['?', 'This'],
  ['Esc', 'Close'],
]

export function HelpDialog({ onClose }) {
  return (
    <Dialog title="How this works" onClose={onClose}>
      <p className="lede">
        Pick up a chip from the rail, click a spot on the felt, and throw. That is the whole of it. The
        rest is what the table does back.
      </p>

      <h3>Putting money down</h3>
      <p>
        A click puts the chip you are holding on the spot you clicked. What it turns into is what the spot
        will actually take: drop a red on the six and it becomes $12, because the six pays 7:6 and cannot
        be paid on five dollars. The table says so when it happens, the same way a dealer would.
      </p>
      <p>
        Right-click a pile to take it down, or use the × beside it in the list. Some bets will not come
        down — the pass line and a come bet on a number are contracts, and once the point is out the house
        has already given you the come-out edge in exchange.
      </p>

      <h3>Odds</h3>
      <p>
        Odds go behind a line bet and pay what the number is genuinely worth, with nothing kept back. They
        are the only bet in the building with no house edge, which is exactly why the table caps how many
        you may have. <strong>Odds on everything</strong> backs every bet you have to that cap in one go.
      </p>

      <h3>Working, and not</h3>
      <p>
        Place bets, buys, hardways and come odds are off on a come-out roll unless you say otherwise — a
        seven then is helping your line bet, and there is no reason for the rest of your money to be at
        risk on it. Turn them on if you want them working through it.
      </p>

      <h3>Keys</h3>
      <table className="keys">
        <tbody>
          {KEYS.map(([k, what]) => (
            <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{what}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>The dice</h3>
      <p>
        Every throw is drawn from your browser&rsquo;s cryptographic random source — a real one in thirty
        six — and then physically simulated until the dice come to rest showing it. What you watch land is
        what you get paid for. Nothing about how you are betting reaches the draw.
      </p>
    </Dialog>
  )
}
