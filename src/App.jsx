import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Felt from './components/Felt.jsx'
import Rail from './components/Rail.jsx'
import Dice from './components/Dice.jsx'
import { ChipStack, Puck } from './components/Chips.jsx'
import { Payouts, Readout, settlingTime } from './components/Crew.jsx'
import { HelpDialog, RulesDialog, SettingsDialog, StatsDialog } from './components/Dialogs.jsx'
import { CHIPS, OPENING_RAIL, money } from './lib/bank.js'
import { betDef, isWorking } from './lib/bets.js'
import { callFor, ledgerFor } from './lib/calls.js'
import { throwDice } from './lib/dice.js'
import { chipAt, chipStyleAt } from './lib/layout.js'
import { check, toLegal, unitFor } from './lib/limits.js'
import { houseRng, makeRng } from './lib/rng.js'
import {
  clearGame,
  loadGame,
  loadPrefs,
  loadStats,
  recordRoll,
  recordWager,
  resetStats,
  saveGame,
  savePrefs,
  saveStats,
} from './lib/storage.js'
import { backEverything, newTable, reducer } from './lib/table.js'
import './styles.css'

// Set by scripts/probe.mjs with ?probe on the URL. Dev builds only - the flag
// is read once at module load and is never true in a build.
const QUERY = new URLSearchParams(globalThis.location?.search ?? '')
const PROBE_ONLY = import.meta.env.DEV && QUERY.has('probe')
// ?fresh skips the saved game, which the browser harnesses need so a run does
// not start halfway through whatever the last one left behind.
const FRESH = QUERY.has('fresh') || PROBE_ONLY

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = FRESH ? null : loadGame()
    return saved ?? newTable({ bankroll: OPENING_RAIL })
  })
  const [prefs, setPrefs] = useState(() => (FRESH ? { denom: 5, boxMode: 'place' } : loadPrefs()))
  const [stats, setStats] = useState(() => (FRESH ? loadStats() : loadStats()))
  const [say, setSay] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [open, setOpen] = useState(null) // which dialog
  const [pointed, setPointed] = useState(null)
  const [throwing, setThrowing] = useState(null)
  const [resting, setResting] = useState(null)
  const [settling, setSettling] = useState(null)

  const { denom, boxMode } = prefs
  const setPref = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), [])

  // The house's own source, made once and never seeded. Nothing about how the
  // table is played may reach it.
  const rng = useRef(null)
  if (!rng.current) rng.current = houseRng()

  const ctx = useMemo(
    () => ({
      table: state.table,
      phase: state.phase,
      point: state.point,
      bets: state.bets,
      marked: state.marked,
      bankroll: state.bankroll,
    }),
    [state],
  )

  // --- remembering
  useEffect(() => {
    if (PROBE_ONLY) return
    saveGame(state)
  }, [state])
  useEffect(() => {
    if (PROBE_ONLY) return
    savePrefs(prefs)
  }, [prefs])
  useEffect(() => {
    if (PROBE_ONLY) return
    saveStats(stats)
  }, [stats])

  // --- betting

  const put = useCallback(
    (id, want) => {
      /*
       * A click is a chip going down, and what it turns into is what the spot
       * will take. Dropping a red on the six is not a $5 bet - the six cannot
       * pay 7:6 on five dollars - so it becomes $12 and the readout says so,
       * which is what a dealer says while doing exactly this.
       */
      const { add, total, bumped } = toLegal(id, want, ctx)
      const verdict = check(id, add, ctx)
      if (!verdict.ok) {
        setSay({ kind: 'refused', text: verdict.reason })
        return false
      }
      dispatch({ type: 'bet', id, amount: add })
      setStats((s) => recordWager(s, add))
      const step = unitFor(id, ctx)
      setSay({
        kind: 'bet',
        text: bumped
          ? `Make it ${money(total)} on the ${betDef(id).label} — it pays in ${money(step)} steps.`
          : `${money(total)} on the ${betDef(id).label}.`,
      })
      return true
    },
    [ctx],
  )

  const onSpot = useCallback(
    (id) => {
      setPointed((p) => ({ id, n: (p?.n ?? 0) + 1 }))
      // In probe mode nothing is bet, only recorded. scripts/probe.mjs is
      // checking that the felt's geometry answers to a click, and a felt that
      // fills up with chips as it is being measured is measuring the chips.
      if (PROBE_ONLY) return
      // Place and buy are the same box. Which one a click makes is the mode on
      // the rail, the way it is a word to the dealer at a table.
      const target = boxMode === 'buy' && id.startsWith('place-') ? id.replace('place-', 'buy-') : id
      put(target, denom)
    },
    [boxMode, denom, put],
  )

  const onOdds = useCallback(() => {
    // The rule lives in table.js. Running it here as well is only to find out
    // what to say about it - the reducer is deterministic, so the two agree.
    const { backed } = backEverything(state)
    if (!backed) {
      setSay({ kind: 'refused', text: 'Nothing to back, or nothing left on the rail to back it with.' })
      return
    }
    dispatch({ type: 'odds' })
    setStats((s) => recordWager(s, backed))
    setSay({ kind: 'bet', text: `${money(backed)} in odds, at the most this table allows.` })
  }, [state])

  const onWorking = useCallback(
    (on, only) => {
      const ids = only ? [only] : Object.keys(state.bets).filter((id) => betDef(id).togglable)
      if (!ids.length) return
      for (const id of ids) dispatch({ type: 'working', id, on })
      setSay({
        kind: 'bet',
        text: only
          ? `${betDef(only).label} is ${on ? 'working' : 'off'}.`
          : on
            ? 'Your box is working, come-out included.'
            : 'Box off on the come-out.',
      })
    },
    [state.bets],
  )

  const onTakeDown = useCallback((id) => {
    dispatch({ type: 'takedown', id })
    setSay({ kind: 'bet', text: `${betDef(id).label} down.` })
  }, [])

  const onClearAll = useCallback(() => {
    for (const id of Object.keys(state.bets)) dispatch({ type: 'takedown', id })
    setSay({ kind: 'bet', text: 'Everything that can come down is down.' })
  }, [state.bets])

  // --- throwing

  const onRoll = useCallback(() => {
    if (throwing || settling) return
    // The shooter has to have a line bet. It is the one rule about who may
    // throw, and it is why the come-out is the only time the line is open.
    if (state.phase === 'come-out' && !state.bets.pass && !state.bets.dontpass) {
      setSay({ kind: 'refused', text: 'The shooter bets the line. Put something on Pass or Don’t Pass first.' })
      return
    }

    /*
     * The result is drawn first, from crypto, and the throw is then found for
     * it - see dice.js. The seed only shapes how the dice tumble; it has no
     * say at all in what they land on.
     */
    const roll = rng.current.roll()
    const shape = makeRng(rng.current.int(2 ** 30))
    const thrown = throwDice(shape, [roll.a, roll.b])

    setSay({ kind: 'throw', text: 'Dice are out.' })
    setLedger(null)
    setThrowing({ ...thrown, roll })
  }, [state, throwing, settling])

  /*
   * The dice have stopped.
   *
   * Nothing on the felt moves yet. The stickman calls the number, and then the
   * crew works the layout in order - which takes about a second and is the
   * whole difference between a payout and a number changing. The bets stay
   * exactly as they were while it happens, because that is what is being paid.
   */
  const onLanded = useCallback(() => {
    if (!throwing) return
    const { roll } = throwing
    // Resolved here as well as in the reducer, to find out what to say about
    // it. The reducer is pure, so the two cannot disagree.
    const next = reducer(state, { type: 'roll', roll })
    const events = next.lastEvents ?? []
    setSay({ kind: 'call', text: callFor(roll, events) })
    setResting(throwing.resting)
    setThrowing(null)
    setSettling({ roll, events, rail: next.bankroll })
  }, [state, throwing])

  // And once the crew has finished, the felt catches up: bets come down, the
  // puck moves, the markers light.
  useEffect(() => {
    if (!settling) return undefined
    const timer = setTimeout(() => {
      dispatch({ type: 'roll', roll: settling.roll })
      setStats((s) => recordRoll(s, settling.roll, settling.events, settling.rail))
      setLedger({ roll: settling.roll, ...ledgerFor(settling.events) })
      setSettling(null)
    }, settlingTime(settling.events))
    return () => clearTimeout(timer)
  }, [settling])

  // --- the table itself

  const onNewSession = useCallback(() => {
    dispatch({ type: 'buyin', amount: OPENING_RAIL })
    clearGame()
    setLedger(null)
    setResting(null)
    setSay({ kind: 'bet', text: `Bought in for ${money(OPENING_RAIL)}. New shooter coming out.` })
    setOpen(null)
  }, [])

  /*
   * Keys. Everything is reachable with the mouse; these only make it quicker,
   * which is the right way round for a game where a misclick costs money.
   */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.matches?.('input, select, textarea')) return
      if (open && e.key !== '?') return

      const k = e.key.toLowerCase()
      if (k === 'r' || e.key === ' ') { e.preventDefault(); onRoll() }
      else if (k === 'o') onOdds()
      else if (k === 'w') onWorking(!Object.keys(state.bets).some((id) => betDef(id).togglable && isWorking(id, state.bets[id], state.phase)))
      else if (k === 'b') setPref({ boxMode: boxMode === 'place' ? 'buy' : 'place' })
      else if (e.key === '?') setOpen((o) => (o === 'help' ? null : 'help'))
      else if (/^[1-5]$/.test(e.key)) setPref({ denom: CHIPS[Number(e.key) - 1].value })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRoll, onOdds, onWorking, boxMode, open, state, setPref])

  const rail = state.bankroll + Object.values(state.bets).reduce((s, b) => s + b.amount, 0)

  return (
    <div className="game">
      <header className="top">
        <h1>Craps</h1>
        <div className="top-figures">
          <span>{money(rail)}</span>
          <span className="top-dim">{state.phase === 'come-out' ? 'Coming out' : `Point ${state.point}`}</span>
        </div>
        <nav>
          <button type="button" onClick={() => setOpen('rules')}>Every bet</button>
          <button type="button" onClick={() => setOpen('stats')}>Session</button>
          <button type="button" onClick={() => setOpen('table')}>Table</button>
          <button type="button" onClick={() => setOpen('help')} aria-label="How this works">?</button>
        </nav>
      </header>

      <div className="table">
        {/* The felt and the dice share one box, so a percentage of it is the
            same place on the cloth for both and they cannot drift apart. */}
        <div className="felt-frame">
          <Felt onSpot={onSpot} point={state.point} marked={state.marked}>
            <g className="on-felt">
              <Puck point={state.point} />
              {Object.entries(state.bets).map(([id, bet]) => {
                const [x, y] = chipAt(id)
                return (
                  <ChipStack
                    // Keyed on the amount as well as the spot, so a pile that
                    // changes is set down again rather than silently becoming
                    // a different number of chips.
                    key={`${id}:${bet.amount}`}
                    id={id}
                    x={x}
                    y={y}
                    {...chipStyleAt(id)}
                    amount={bet.amount}
                    working={isWorking(id, bet, state.phase)}
                    label={betDef(id).label}
                    onClick={onSpot}
                    onRemove={onTakeDown}
                  />
                )
              })}
              {settling && <Payouts events={settling.events} />}
            </g>
          </Felt>
          <Dice throwing={throwing} resting={resting} onLanded={onLanded} />
          {/* The roll being settled, not the table's - during settlement the
              table still holds the roll before, because what is on the felt is
              what is being paid. */}
          <Readout roll={settling?.roll ?? state.lastRoll} text={say?.text} tone={say?.kind} />
        </div>
        {ledger?.lines.length > 0 && (
          <ul className="ledger">
            {ledger.lines.map((l, i) => (
              <li key={i} className={`is-${l.tone}`}>{l.text}</li>
            ))}
          </ul>
        )}
      </div>

      <Rail
        state={state}
        denom={denom}
        onDenom={(v) => setPref({ denom: v })}
        boxMode={boxMode}
        onBoxMode={(v) => setPref({ boxMode: v })}
        onOdds={onOdds}
        onWorking={onWorking}
        onClearAll={onClearAll}
        onTakeDown={onTakeDown}
        onRoll={onRoll}
        rolling={!!throwing || !!settling}
        say={say}
      />

      {open === 'rules' && <RulesDialog table={state.table} onClose={() => setOpen(null)} />}
      {open === 'stats' && (
        <StatsDialog
          stats={stats}
          rail={rail}
          onReset={() => setStats(resetStats())}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'table' && (
        <SettingsDialog
          table={state.table}
          onChange={(t) => dispatch({ type: 'configure', table: t })}
          onNewSession={onNewSession}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'help' && <HelpDialog onClose={() => setOpen(null)} />}

      {import.meta.env.DEV && pointed && (
        <div className="probe" data-spot={pointed.id} data-n={pointed.n} hidden />
      )}
    </div>
  )
}
