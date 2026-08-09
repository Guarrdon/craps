import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Felt from './components/Felt.jsx'
import Rail from './components/Rail.jsx'
import Dice from './components/Dice.jsx'
import { ChipStack, Puck } from './components/Chips.jsx'
import { Payouts, Readout, settlingTime } from './components/Crew.jsx'
import { HelpDialog, RulesDialog, SettingsDialog, StatsDialog } from './components/Dialogs.jsx'
import Lesson from './components/Lesson.jsx'
import { CHIPS, OPENING_RAIL, money } from './lib/bank.js'
import { betDef, isWorking } from './lib/bets.js'
import { callFor, ledgerFor } from './lib/calls.js'
import { throwDice } from './lib/dice.js'
import { chipAt, chipStyleAt } from './lib/layout.js'
import { check, toLegal, unitFor } from './lib/limits.js'
import { houseRng, makeRng } from './lib/rng.js'
import * as sound from './lib/sound.js'
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
import { backEverything, baseOf, newTable, placeMany, pressAmount, reducer } from './lib/table.js'
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
  const [prefs, setPrefs] = useState(() =>
    FRESH ? { denom: 5, boxMode: 'place', lineRides: true } : loadPrefs(),
  )
  const [stats, setStats] = useState(() => (FRESH ? loadStats() : loadStats()))
  const [say, setSay] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [open, setOpen] = useState(null) // which dialog
  const [pointed, setPointed] = useState(null)
  const [throwing, setThrowing] = useState(null)
  const [resting, setResting] = useState(null)
  const [settling, setSettling] = useState(null)
  // Bets that just won and are still standing. They can be pressed until the
  // next throw, which is the window a table actually gives you.
  const [pressable, setPressable] = useState([])
  // Training mode, and which spot is currently being asked about.
  const [teaching, setTeaching] = useState(false)
  const [lesson, setLesson] = useState(null)
  const [showBets, setShowBets] = useState(false)

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

  useEffect(() => {
    sound.setMuted(!!prefs.muted)
  }, [prefs.muted])

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
      sound.wake()
      setPointed((p) => ({ id, n: (p?.n ?? 0) + 1 }))
      // In probe mode nothing is bet, only recorded. scripts/probe.mjs is
      // checking that the felt's geometry answers to a click, and a felt that
      // fills up with chips as it is being measured is measuring the chips.
      if (PROBE_ONLY) return
      // Training mode: a click asks what the spot is rather than betting on it.
      if (teaching) {
        setLesson(id)
        return
      }
      // Place and buy are the same box. Which one a click makes is the mode on
      // the rail, the way it is a word to the dealer at a table.
      const target = boxMode === 'buy' && id.startsWith('place-') ? id.replace('place-', 'buy-') : id
      put(target, denom)
    },
    [boxMode, denom, put, teaching],
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

  // Back to what it started at, with the presses handed back.
  const onRegress = useCallback(
    (id) => {
      const bet = state.bets[id]
      if (!bet) return
      const base = baseOf(bet)
      if (bet.amount <= base) {
        setSay({ kind: 'refused', text: `${betDef(id).label} is already at ${money(base)}.` })
        return
      }
      dispatch({ type: 'regress', id })
      setSay({
        kind: 'bet',
        text: `${betDef(id).label} back to ${money(base)} — ${money(bet.amount - base)} down.`,
      })
    },
    [state.bets],
  )

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

    sound.dice()
    setSay({ kind: 'throw', text: 'Dice are out.' })
    setLedger(null)
    setPressable([]) // the window to press closes when the dice leave the hand
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
      // Paid once the crew has finished working it, which is when the chips
      // would actually be pushed across.
      sound.payout(settling.events)

      /*
       * The line rides.
       *
       * When the point is made the dealer pays your pass line by putting an
       * equal stack *beside* it. You pick up the payout; the original is still
       * sitting there and it is your bet for the next come-out. Almost nobody
       * picks it up, so leaving it is the honest default - and it can be taken
       * down before the come-out throw like any other loose chips.
       */
      const rides = prefs.lineRides
        ? settling.events
            .filter((e) => e.kind === 'pay' && (e.id === 'pass' || e.id === 'dontpass'))
            .map((e) => ({ id: e.id, amount: e.amount }))
        : []

      // What is still up and just got paid: a place bet, a buy, a hardway. Any
      // of these can be pressed until the next throw, which is exactly the
      // window a table gives you.
      setPressable(
        settling.events
          .filter((e) => e.kind === 'pay' && !e.down)
          .map((e) => ({ id: e.id, pay: e.pay })),
      )

      if (rides.length) dispatch({ type: 'many', list: rides })
      setSettling(null)
    }, settlingTime(settling.events))
    return () => clearTimeout(timer)
  }, [settling, prefs.lineRides])

  // --- pressing

  const onPress = useCallback(
    (only) => {
      const wins = only ? pressable.filter((p) => p.id === only) : pressable
      const done = []
      for (const { id, pay } of wins) {
        const up = pressAmount(state, id, pay)
        if (up <= 0 || up > state.bankroll) continue
        // press, not bet: the bet keeps whatever it was last deliberately set
        // to, so "back to thirty" still means something three presses later.
        dispatch({ type: 'bet', id, amount: up, press: true })
        setStats((s) => recordWager(s, up))
        done.push({ id, up, back: pay - up })
      }
      if (!done.length) {
        setSay({ kind: 'refused', text: 'Nothing there to press, or not enough left on the rail.' })
        return
      }
      // Marked as pressed rather than removed: the window to take it back down
      // is the same window, and a player who presses and then thinks better of
      // it should not have to go looking in the list.
      setPressable((p) => p.map((x) => (done.some((d) => d.id === x.id) ? { ...x, pressed: true } : x)))
      const one = done.length === 1 ? done[0] : null
      setSay({
        kind: 'bet',
        text: one
          ? `${betDef(one.id).label} pressed to ${money((state.bets[one.id]?.amount ?? 0) + one.up)}${
              one.back ? ` — ${money(one.back)} back.` : '.'
            }`
          : `Pressed ${done.length} bets, ${money(done.reduce((s, d) => s + d.up, 0))} up.`,
      })
    },
    [pressable, state],
  )

  // --- the opening

  const onOpening = useCallback(() => {
    if (!prefs.opening?.length) {
      setSay({ kind: 'refused', text: 'No opening saved. Set the felt how you like it and press Save.' })
      return
    }
    const { placed } = placeMany(state, prefs.opening)
    if (!placed) {
      setSay({ kind: 'refused', text: 'Your opening is already out, or the table will not take it right now.' })
      return
    }
    dispatch({ type: 'many', list: prefs.opening })
    setStats((s) => recordWager(s, placed))
    setSay({ kind: 'bet', text: `Your usual — ${money(placed)} out.` })
  }, [prefs.opening, state])

  const onSaveOpening = useCallback(() => {
    const list = Object.entries(state.bets).map(([id, b]) => ({ id, amount: b.amount }))
    if (!list.length) {
      setSay({ kind: 'refused', text: 'Put your usual bets out first, then save them.' })
      return
    }
    setPref({ opening: list })
    setSay({ kind: 'bet', text: `Saved. ${list.length} bets, ${money(list.reduce((s, b) => s + b.amount, 0))}.` })
  }, [state.bets, setPref])

  /*
   * The opening, put out again on its own.
   *
   * Only on a clean come-out with a fresh tracker, which is the one moment it
   * makes sense: the bonus row will not take a bet at any other time, and that
   * is half of what most standing openings are.
   */
  useEffect(() => {
    if (!prefs.autoOpen || !prefs.opening?.length) return
    if (state.phase !== 'come-out' || state.marked.size || throwing || settling) return
    if (Object.keys(state.bets).length) return
    const { placed } = placeMany(state, prefs.opening)
    if (!placed) return
    dispatch({ type: 'many', list: prefs.opening })
    setStats((s) => recordWager(s, placed))
    setSay({ kind: 'bet', text: `Your usual is out — ${money(placed)}. New shooter coming out.` })
  }, [prefs.autoOpen, prefs.opening, state, throwing, settling])

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

        {/* What the two colours on the felt mean. A real layout's colours are
            its own branding and say nothing; this one's say how long a bet
            lives, which is the thing the felt otherwise hides. */}
        <ul className="legend" aria-label="What the colours mean">
          <li className="is-riding"><i /> Rides</li>
          <li className="is-oneroll"><i /> One throw</li>
        </ul>
        <nav>
          {/* Training mode. A click on the felt asks what the spot is instead
              of putting money on it, which is the difference between a rules
              page and learning the table. */}
          <button
            type="button"
            className={`teach${teaching ? ' is-on' : ''}`}
            onClick={() => {
              setTeaching((t) => !t)
              setLesson(null)
            }}
            aria-pressed={teaching}
          >
            {teaching ? 'Stop explaining' : 'Explain the felt'}
          </button>
          <button type="button" onClick={() => setOpen('rules')}>Every bet</button>
          <button type="button" onClick={() => setOpen('stats')}>Session</button>
          <button type="button" onClick={() => setOpen('table')}>Table</button>
          <button
            type="button"
            className="mute"
            onClick={() => { sound.wake(); setPref({ muted: !prefs.muted }) }}
            aria-pressed={!!prefs.muted}
            aria-label={prefs.muted ? 'Turn sound on' : 'Turn sound off'}
            title={prefs.muted ? 'Sound off' : 'Sound on'}
          >
            {prefs.muted ? '\u{1F507}' : '\u{1F509}'}
          </button>
          <button type="button" onClick={() => setOpen('help')} aria-label="How this works">?</button>
        </nav>
      </header>

      <div className="table">
        {/* Only ever seen on a phone held upright, where a table nearly twice
            as wide as it is tall has nowhere to go. */}
        <p className="turn-it">Turn your phone sideways for the whole table.</p>
        {/* The felt and the dice share one box, so a percentage of it is the
            same place on the cloth for both and they cannot drift apart. */}
        <div className={`felt-frame${teaching ? ' is-teaching-felt' : ''}`}>
          <Felt onSpot={onSpot} point={state.point} marked={state.marked} bonus={state.table.bonus}>
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
          <Readout
            roll={settling?.roll ?? state.lastRoll}
            text={teaching ? 'Point at anything on the felt.' : say?.text}
            tone={teaching ? 'teach' : say?.kind}
          />
          {lesson && (
            <Lesson
              id={lesson}
              table={state.table}
              point={state.point}
              at={chipAt(lesson)}
              onClose={() => setLesson(null)}
            />
          )}
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
        pressable={pressable}
        onPress={onPress}
        onRegress={onRegress}
        opening={prefs.opening}
        onOpening={onOpening}
        onSaveOpening={onSaveOpening}
        autoOpen={prefs.autoOpen}
        onAutoOpen={(v) => setPref({ autoOpen: v })}
        showBets={showBets}
        onShowBets={setShowBets}
        teaching={teaching}
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
          prefs={prefs}
          onPrefs={setPref}
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
