import { useState } from 'react'
import Felt from './components/Felt.jsx'
import { betDef } from './lib/bets.js'
import './styles.css'

/*
 * Phase two: the felt and nothing else. Clicking a spot names the bet it is,
 * which is the whole of what this proves - that the picture and the click
 * targets are the same thing.
 */
export default function App() {
  const [last, setLast] = useState(null)
  // A few markers lit, so both states of the bonus tracker can be seen while
  // the felt is being drawn. The real thing comes from the table.
  const [marked] = useState(new Set([2, 5, 8, 11, 12]))

  // The counter is what lets scripts/probe.mjs tell "clicked the same spot
  // again" apart from "that click hit nothing" - without it a run of misses
  // reads as a run of passes on a stale readout.
  const onSpot = (id) => setLast((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))

  return (
    <div className="table">
      <Felt onSpot={onSpot} marked={marked} />
      {last && (
        <div className="probe" data-spot={last.id} data-n={last.n}>
          {last.id} &middot; {betDef(last.id).label ?? ''}
        </div>
      )}
    </div>
  )
}
