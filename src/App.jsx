import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import Felt from './components/Felt.jsx'
import Rail from './components/Rail.jsx'
import { ChipStack, Puck } from './components/Chips.jsx'
import { betDef, isWorking } from './lib/bets.js'
import { OPENING_RAIL, money } from './lib/bank.js'
import { callFor, ledgerFor } from './lib/calls.js'
import { chipAt, chipStyleAt } from './lib/layout.js'
import { check, toLegal, unitFor } from './lib/limits.js'
import { houseRng } from './lib/rng.js'
import { backEverything, newTable, reducer } from './lib/table.js'
import './styles.css'

// Set by scripts/probe.mjs with ?probe on the URL. Dev builds only - the flag
// is read once at module load and is never true in a build.
const PROBE_ONLY =
  import.meta.env.DEV && new URLSearchParams(globalThis.location?.search ?? '').has('probe')

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    newTable({ bankroll: OPENING_RAIL }),
  )
  const [denom, setDenom] = useState(5)
  const [boxMode, setBoxMode] = useState('place')
  const [say, setSay] = useState(null)
  const [ledger, setLedger] = useState(null)
  // Which spot was last pointed at, and how many times anything has been. Not
  // shown to anyone - it is what scripts/probe.mjs reads to check that every
  // printed spot on the felt answers to a click where its chips go, and the
  // counter is what tells a repeat click apart from a click that hit nothing.
  const [pointed, setPointed] = useState(null)

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
    setSay({ kind: 'bet', text: `${money(backed)} in odds, at the most this table allows.` })
  }, [state])

  const onWorking = useCallback(
    (on, only) => {
      const ids = only
        ? [only]
        : Object.keys(state.bets).filter((id) => betDef(id).togglable)
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

  const onRoll = useCallback(() => {
    // The shooter has to have a line bet. It is the one rule about who may
    // throw, and it is why the come-out is the only time the line is open.
    if (state.phase === 'come-out' && !state.bets.pass && !state.bets.dontpass) {
      setSay({ kind: 'refused', text: 'The shooter bets the line. Put something on Pass or Don’t Pass first.' })
      return
    }
    const roll = rng.current.roll()
    // Resolved here as well as in the reducer, to find out what to say about
    // it. The reducer is pure, so the two cannot disagree.
    const next = reducer(state, { type: 'roll', roll })
    dispatch({ type: 'roll', roll })
    setSay({ kind: 'call', text: callFor(roll, next.lastEvents ?? []) })
    setLedger({ roll, ...ledgerFor(next.lastEvents ?? []) })
  }, [state])

  return (
    <div className="game">
      <div className="table">
        <Felt onSpot={onSpot} point={state.point} marked={state.marked}>
          <g className="on-felt">
            <Puck point={state.point} />
            {Object.entries(state.bets).map(([id, bet]) => {
              const [x, y] = chipAt(id)
              return (
                <ChipStack
                  key={id}
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
          </g>
        </Felt>
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
        onDenom={setDenom}
        boxMode={boxMode}
        onBoxMode={setBoxMode}
        onOdds={onOdds}
        onWorking={onWorking}
        onClearAll={onClearAll}
        onTakeDown={onTakeDown}
        onRoll={onRoll}
        say={say}
      />

      {import.meta.env.DEV && pointed && (
        <div className="probe" data-spot={pointed.id} data-n={pointed.n} hidden />
      )}
    </div>
  )
}
